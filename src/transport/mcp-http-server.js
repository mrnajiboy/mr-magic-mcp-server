#!/usr/bin/env node
import 'dotenv/config';
import { randomUUID } from 'node:crypto';

import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { createLogger } from '../utils/logger.js';

import { mcpToolDefinitions, handleMcpTool } from './mcp-tools.js';
import { logTokenStatus } from './token-startup-log.js';

export async function startMcpHttpServer(options = {}) {
  const logger = createLogger('mcp-http-server');
  const host = options.remote ? '0.0.0.0' : options.host || '127.0.0.1';
  const port = Number(options.port) || 3444;

const server = new Server(
  { name: 'mr-magic-mcp-server-mcp-http', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const result = await handleMcpTool(name, args);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  });

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: options.sessionless ? undefined : () => randomUUID()
  });

  transport.onerror = (error) => {
    logger.error('MCP HTTP transport error', { error });
  };

  await server.connect(transport);
  await logTokenStatus({ context: 'http-mcp' });

  const app = createMcpExpressApp({ host });
  app.all('/mcp', async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error('HTTP MCP request failed', { error });
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(port, host, () => {
      const endpoint = `http://${host}:${port}/mcp`;
      logger.info('MCP HTTP server listening', { host, port, endpoint, sessionless: !transport.sessionId });
      process.stderr.write(`Mr. Magic MCP HTTP server running: endpoint=${endpoint}, sessionless=${!transport.sessionId}\n`);
      resolve(httpServer);
    });
  });
}

if (process.argv[1]?.endsWith('mcp-http-server.js')) {
  startMcpHttpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}