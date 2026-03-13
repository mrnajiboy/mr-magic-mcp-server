#!/usr/bin/env node
import { startMcpHttpServer } from '../transport/mcp-http-server.js';

startMcpHttpServer().catch((error) => {
  console.error('Failed to start MCP HTTP server', error);
  process.exit(1);
});
