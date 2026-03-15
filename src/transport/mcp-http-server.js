#!/usr/bin/env node
import '../utils/config.js';
import { randomUUID } from 'node:crypto';

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

import { createLogger } from '../utils/logger.js';
import { getSharedRedisClient } from '../utils/export-storage/shared-redis-client.js';

import { mcpToolDefinitions, handleMcpTool } from './mcp-tools.js';
import { buildMcpResponse } from './mcp-response.js';
import { logTokenStatus } from './token-startup-log.js';
import { normalizeToolArgs } from './tool-args.js';
import { getProviderStatus } from '../index.js';

function getBodyShape(body) {
  if (body == null) return 'nullish';
  if (Array.isArray(body)) return 'array';
  return typeof body;
}

function getBodyLength(body) {
  if (typeof body === 'string') return body.length;
  if (Buffer.isBuffer(body)) return body.byteLength;
  if (body && typeof body === 'object') {
    try {
      return JSON.stringify(body).length;
    } catch {
      return null;
    }
  }
  return null;
}

function safeBodyPreview(body, maxLength = 1200) {
  try {
    if (typeof body === 'string') return body.slice(0, maxLength);
    if (body && typeof body === 'object') return JSON.stringify(body).slice(0, maxLength);
    return null;
  } catch {
    return '<unserializable body>';
  }
}

function normalizeIncomingRpcBody(body) {
  const normalizeMessage = (message) => {
    if (!message || typeof message !== 'object') return message;
    if (message.method === 'notifications/initialized' && message.params == null) {
      return { ...message, params: {} };
    }
    return message;
  };

  if (Array.isArray(body)) {
    return body.map(normalizeMessage);
  }

  return normalizeMessage(body);
}

/**
 * Create and wire up a fresh MCP Server instance with all tool handlers.
 * Called once per client session (both Streamable HTTP and SSE).
 */
function createMcpServer() {
  const server = new Server(
    { name: 'mcp-http-server', version: '0.1.4' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const logger = createLogger('mcp-http-server');
    const { name, arguments: rawArgs } = request.params;
    const args = normalizeToolArgs(rawArgs, name, logger);
    const result = await handleMcpTool(name, args);
    return buildMcpResponse(result);
  });

  return server;
}

export async function startMcpHttpServer(options = {}) {
  const logger = createLogger('mcp-http-server');
  const httpDiagnostics = process.env.MR_MAGIC_MCP_HTTP_DIAGNOSTICS === '1';
  // Sessionless mode: skip persistent in-memory session tracking so every
  // request is handled independently.  This is required on platforms like
  // Render.com that run multiple instances (a session created on instance A is
  // invisible to instance B).  Auto-enable when the RENDER env var is present,
  // or when MR_MAGIC_SESSIONLESS=1 is set explicitly.
  const configuredSessionless =
    Boolean(options.sessionless) ||
    Boolean(process.env.MR_MAGIC_SESSIONLESS) ||
    Boolean(process.env.RENDER);
  const host = options.remote
    ? '0.0.0.0'
    : options.host || process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  const port = Number(options.port) || Number(process.env.PORT) || 3444;

  // ── Per-session transport maps ──────────────────────────────────────────────
  // Streamable HTTP: keyed by MCP session ID assigned by the transport
  const streamableSessions = new Map(); // sessionId → { server, transport }
  // Legacy SSE: keyed by a UUID assigned when the SSE connection is opened
  const sseSessions = new Map(); // connectionId → { server, transport }

  await logTokenStatus({ context: 'http-mcp' });

  // When binding to 0.0.0.0 the SDK requires an explicit allowedHosts list for
  // DNS rebinding protection. Build it from well-known safe hosts plus any
  // platform-injected hostname (Render sets RENDER_EXTERNAL_HOSTNAME automatically).
  const allowedHosts =
    host === '0.0.0.0'
      ? [
          'localhost',
          '127.0.0.1',
          ...(process.env.RENDER_EXTERNAL_HOSTNAME ? [process.env.RENDER_EXTERNAL_HOSTNAME] : []),
          ...(process.env.MR_MAGIC_ALLOWED_HOSTS
            ? process.env.MR_MAGIC_ALLOWED_HOSTS.split(',')
                .map((h) => h.trim())
                .filter(Boolean)
            : [])
        ]
      : undefined;

  const app = createMcpExpressApp({ host, ...(allowedHosts ? { allowedHosts } : {}) });

  // ── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', async (_req, res) => {
    res.json({ status: 'ok', providers: await getProviderStatus() });
  });

  // ── Export download endpoint ──────────────────────────────────────────────────
  app.get('/downloads/:downloadId/:extension', async (req, res) => {
    const { downloadId, extension } = req.params;
    if (!downloadId || !extension) {
      res.status(400).json({ error: 'Invalid download path' });
      return;
    }
    try {
      const redis = getSharedRedisClient({ context: 'mcp-http-download' });
      const key = `mr-magic:${downloadId}:${extension}`;
      const content = await redis.get(key);
      if (!content) {
        logger.warn('Export download missing', {
          context: 'mcp-http-download',
          key,
          downloadId,
          extension
        });
        res.status(404).json({ error: 'Export expired or missing' });
        return;
      }
      res.status(200).type('text/plain').send(content);
      logger.info('Export download served', {
        context: 'mcp-http-download',
        key,
        downloadId,
        extension,
        bytes: Buffer.byteLength(content)
      });
    } catch (error) {
      logger.error('Download lookup failed', { error, url: req.originalUrl });
      res.status(500).json({ error: 'Failed to fetch export' });
    }
  });

  // ── Streamable HTTP transport (/mcp) ──────────────────────────────────────────
  // Each initialize request spawns a fresh Server + StreamableHTTPServerTransport.
  // Subsequent requests are routed to the correct session by mcp-session-id header.
  app.all('/mcp', async (req, res) => {
    const normalizedBody = normalizeIncomingRpcBody(req.body);
    const requestId = randomUUID();
    const requestMeta = {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      contentType: req.headers['content-type'] || null,
      accept: req.headers.accept || null,
      mcpSessionId: req.headers['mcp-session-id'] || null,
      bodyShape: getBodyShape(normalizedBody),
      bodyLength: getBodyLength(normalizedBody)
    };

    if (httpDiagnostics) {
      logger.debug('HTTP MCP request received', {
        ...requestMeta,
        bodyPreview: safeBodyPreview(normalizedBody)
      });
    }

    try {
      // Handle DELETE — session teardown
      if (req.method === 'DELETE') {
        const sessionId = req.headers['mcp-session-id'];
        if (sessionId && streamableSessions.has(sessionId)) {
          const { server, transport } = streamableSessions.get(sessionId);
          streamableSessions.delete(sessionId);
          try {
            await transport.handleRequest(req, res, normalizedBody);
          } finally {
            await server.close().catch(() => {});
          }
          logger.info('Streamable HTTP session deleted', { sessionId });
        } else {
          res.status(404).json({ error: 'Session not found' });
        }
        return;
      }

      // Detect initialize requests (new session) vs requests for an existing session
      const isInitializeRequest =
        !Array.isArray(normalizedBody) && normalizedBody?.method === 'initialize';

      const incomingSessionId = req.headers['mcp-session-id'];

      if (isInitializeRequest) {
        // Create a fresh server + transport for this new session
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: configuredSessionless ? undefined : () => randomUUID()
        });

        transport.onerror = (error) => {
          logger.error('MCP HTTP transport error', { context: 'mcp-http-server', error });
        };

        // Store the session once the transport has assigned its session ID.
        // The SDK sets sessionId synchronously during the connect() call so it's
        // available to us after connect() resolves (before handleRequest is called).
        await server.connect(transport);

        // Register in sessions map after connect so sessionId is populated.
        // sessionId is undefined in sessionless mode.
        if (transport.sessionId) {
          streamableSessions.set(transport.sessionId, { server, transport });
          logger.info('Streamable HTTP session created', { sessionId: transport.sessionId });

          // Clean up when the transport closes on its own
          transport.onclose = () => {
            streamableSessions.delete(transport.sessionId);
            server.close().catch(() => {});
            logger.info('Streamable HTTP session closed', { sessionId: transport.sessionId });
          };
        }

        await transport.handleRequest(req, res, normalizedBody);
        return;
      }

      // Existing session — route by session ID header
      if (incomingSessionId && streamableSessions.has(incomingSessionId)) {
        const { transport } = streamableSessions.get(incomingSessionId);
        await transport.handleRequest(req, res, normalizedBody);
        return;
      }

      // Sessionless mode (no session ID tracking) — forward directly
      if (configuredSessionless) {
        // In true sessionless mode we don't have a persistent transport,
        // so create a temporary one for each request.
        const server = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined
        });
        transport.onerror = (error) => {
          logger.error('MCP HTTP transport error (sessionless)', { error });
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, normalizedBody);
        await server.close().catch(() => {});
        return;
      }

      // Unknown session ID
      res
        .status(404)
        .json({ error: 'Session not found. Send an initialize request to start a new session.' });
    } catch (error) {
      logger.error('HTTP MCP request failed', {
        error,
        ...requestMeta,
        headersSent: res.headersSent,
        writableEnded: res.writableEnded
      });

      if (res.headersSent || res.writableEnded) {
        return;
      }

      res.status(500).json({
        error: 'Internal Server Error',
        requestId,
        message: error instanceof Error ? error.message : String(error),
        context: {
          method: req.method,
          url: req.originalUrl || req.url,
          bodyShape: getBodyShape(normalizedBody),
          bodyLength: getBodyLength(normalizedBody)
        }
      });
    }
  });

  // ── Legacy SSE transport (/sse + /messages) ───────────────────────────────────
  // Provides backward compatibility with clients that use the pre-Streamable HTTP
  // SSE-based MCP protocol (GET /sse establishes the stream, POST /messages sends
  // JSON-RPC messages). Each SSE connection gets its own Server + SSEServerTransport.

  app.get('/sse', async (req, res) => {
    const connectionId = randomUUID();
    logger.info('SSE connection opened', { connectionId });

    try {
      const server = createMcpServer();
      const transport = new SSEServerTransport('/messages', res);

      sseSessions.set(connectionId, { server, transport });

      transport.onerror = (error) => {
        logger.error('SSE transport error', { connectionId, error });
      };

      transport.onclose = () => {
        sseSessions.delete(connectionId);
        server.close().catch(() => {});
        logger.info('SSE session closed', { connectionId });
      };

      // Expose the connectionId in a response header so the client can include
      // it as a query param on POST /messages (see below).
      res.setHeader('X-Mcp-Connection-Id', connectionId);

      await server.connect(transport);
      await transport.start();
    } catch (error) {
      sseSessions.delete(connectionId);
      logger.error('SSE session setup failed', { connectionId, error });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish SSE session' });
      }
    }
  });

  app.post('/messages', async (req, res) => {
    // The SDK's SSEServerTransport embeds the session endpoint; clients that use
    // the standard MCP SSE protocol POST directly here with a ?sessionId= query
    // param that the transport itself adds to the endpoint URL it advertises.
    // We route by that param, falling back to the most-recently-opened session
    // for simple single-client deployments.
    const sessionId = req.query.sessionId;
    let entry;

    if (sessionId) {
      // The SDK uses the transport's sessionId (set by SSEServerTransport) as
      // the query param, not our internal connectionId.
      for (const [, e] of sseSessions) {
        if (e.transport.sessionId === sessionId) {
          entry = e;
          break;
        }
      }
    }

    // Fallback: use the most recently added session (single-client scenario)
    if (!entry && sseSessions.size > 0) {
      entry = [...sseSessions.values()].at(-1);
    }

    if (!entry) {
      res.status(404).json({ error: 'No active SSE session found' });
      return;
    }

    try {
      await entry.transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      logger.error('SSE message handling failed', { error });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to handle SSE message' });
      }
    }
  });

  // ── Global error middleware ────────────────────────────────────────────────────
  app.use((error, req, res, _next) => {
    const requestId = randomUUID();
    const requestMeta = {
      requestId,
      method: req?.method || null,
      url: req?.originalUrl || req?.url || null,
      contentType: req?.headers?.['content-type'] || null,
      accept: req?.headers?.accept || null,
      mcpSessionId: req?.headers?.['mcp-session-id'] || null,
      bodyShape: getBodyShape(req?.body),
      bodyLength: getBodyLength(req?.body)
    };

    logger.error('Unhandled MCP HTTP middleware error', {
      error,
      ...requestMeta,
      headersSent: res?.headersSent,
      writableEnded: res?.writableEnded
    });

    if (!res || res.headersSent || res.writableEnded) {
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      requestId,
      message: error instanceof Error ? error.message : String(error),
      context: {
        method: requestMeta.method,
        url: requestMeta.url,
        bodyShape: requestMeta.bodyShape,
        bodyLength: requestMeta.bodyLength
      }
    });
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(port, host, () => {
      const endpoint = `http://${host}:${port}/mcp`;
      const sseEndpoint = `http://${host}:${port}/sse`;
      logger.info('MCP HTTP server listening', {
        host,
        port,
        endpoint,
        sseEndpoint,
        sessionless: configuredSessionless
      });
      process.stderr.write(
        `Mr. Magic MCP Streamable HTTP server running: endpoint=${endpoint}, sseEndpoint=${sseEndpoint}, sessionless=${configuredSessionless}\n`
      );
      resolve(httpServer);
    });
  });
}

if (process.argv[1]?.endsWith('transport/mcp-http-server.js')) {
  startMcpHttpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
