#!/usr/bin/env node
import 'dotenv/config';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createLogger } from '../utils/logger.js';

import { mcpToolDefinitions, handleMcpTool } from './mcp-tools.js';
import { logTokenStatus } from './token-startup-log.js';

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

function applyQuietLogLevelOverride() {
  if (process.env.MR_MAGIC_QUIET_STDIO !== '1') {
    return null;
  }
  const previousLevel = process.env.LOG_LEVEL;
  process.env.DEBUG = '0';
  process.env.LOG_LEVEL = 'error';
  return previousLevel || null;
}

async function start() {
  const previousLogLevel = applyQuietLogLevelOverride();
  const logger = createLogger('mcp-server');
  await logTokenStatus({ context: 'stdio-mcp' });
  if (process.env.MR_MAGIC_QUIET_STDIO === '1') {
    logger.info('MR_MAGIC_QUIET_STDIO enabled; forcing stderr-only logging at error level', {
      previousLogLevel: previousLogLevel || 'info'
    });
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const readyDetails = {
    name: 'mr-magic-mcp-server-mcp',
    transport: 'stdio'
  };
  logger.info('Lyrics MCP server listening on stdio', readyDetails);
  process.stderr.write(`Mr. Magic MCP server running: transport=stdio, name=${readyDetails.name}\n`);
}

start().catch((error) => {
  const logger = createLogger('mcp-server');
  logger.error('MCP server crashed', { error });
  process.exit(1);
});