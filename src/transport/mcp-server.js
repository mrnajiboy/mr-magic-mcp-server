#!/usr/bin/env node
import 'dotenv/config';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createLogger } from '../utils/logger.js';

import { mcpToolDefinitions, handleMcpTool } from './mcp-tools.js';

const server = new Server(
  { name: 'mr-magic-mcp-server-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: mcpToolDefinitions }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const result = await handleMcpTool(name, args);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});

async function start() {
  const logger = createLogger('mcp-server');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Lyrics MCP server listening on stdio');
}

start().catch((error) => {
  const logger = createLogger('mcp-server');
  logger.error('MCP server crashed', { error });
  process.exit(1);
});