#!/usr/bin/env node
if (!process.env.MR_MAGIC_QUIET_STDIO) {
  process.env.MR_MAGIC_QUIET_STDIO = '1';
}
const { startMcpServer } = await import('../transport/mcp-server.js');
await startMcpServer();
