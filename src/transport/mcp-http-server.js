#!/usr/bin/env node
import '../utils/config.js';
import { randomUUID } from 'node:crypto';

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

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

export async function startMcpHttpServer(options = {}) {
  const logger = createLogger('mcp-http-server');
  const httpDiagnostics = process.env.MR_MAGIC_MCP_HTTP_DIAGNOSTICS === '1';
  const configuredSessionless = Boolean(options.sessionless);
  const host = options.remote
    ? '0.0.0.0'
    : (options.host || process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1'));
  const port = Number(options.port) || Number(process.env.PORT) || 3444;

  const server = new Server(
    { name: 'mcp-http-server', version: '0.1.4' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = normalizeToolArgs(rawArgs, name, logger);
    const result = await handleMcpTool(name, args);
    return buildMcpResponse(result);
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: configuredSessionless ? undefined : () => randomUUID()
  });

  transport.onerror = (error) => {
    logger.error('MCP HTTP transport error', { error });
  };

  await server.connect(transport);
  await logTokenStatus({ context: 'http-mcp' });

  // When binding to 0.0.0.0 the SDK requires an explicit allowedHosts list for
  // DNS rebinding protection. Build it from well-known safe hosts plus any
  // platform-injected hostname (Render sets RENDER_EXTERNAL_HOSTNAME automatically).
  const allowedHosts =
    host === '0.0.0.0'
      ? [
          'localhost',
          '127.0.0.1',
          ...(process.env.RENDER_EXTERNAL_HOSTNAME
            ? [process.env.RENDER_EXTERNAL_HOSTNAME]
            : []),
          ...(process.env.MR_MAGIC_ALLOWED_HOSTS
            ? process.env.MR_MAGIC_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
            : [])
        ]
      : undefined;

  const app = createMcpExpressApp({ host, ...(allowedHosts ? { allowedHosts } : {}) });

  app.get('/health', async (_req, res) => {
    res.json({ status: 'ok', providers: await getProviderStatus() });
  });

  app.get('/downloads/:downloadId/*', async (req, res) => {
    const { downloadId } = req.params;
    const extension = req.params[0] || '';
    if (!downloadId || !extension) {
      res.status(400).json({ error: 'Invalid download path' });
      return;
    }
    try {
      const redis = getSharedRedisClient({ context: 'mcp-http-download' });
      const key = `mr-magic:${downloadId}:${extension}`;
      const content = await redis.get(key);
      if (!content) {
        logger.warn('Export download missing', { context: 'mcp-http-download', key, downloadId, extension });
        res.status(404).json({ error: 'Export expired or missing' });
        return;
      }
      res.status(200).type('text/plain').send(content);
      logger.info('Export download served', { context: 'mcp-http-download', key, downloadId, extension, bytes: Buffer.byteLength(content) });
    } catch (error) {
      logger.error('Download lookup failed', { error, url: req.originalUrl });
      res.status(500).json({ error: 'Failed to fetch export' });
    }
  });

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
      await transport.handleRequest(req, res, normalizedBody);
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
      logger.info('MCP HTTP server listening', {
        host,
        port,
        endpoint,
        sessionless: configuredSessionless
      });
      process.stderr.write(
        `Mr. Magic MCP Streamable HTTP server running: endpoint=${endpoint}, sessionless=${configuredSessionless}\n`
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
