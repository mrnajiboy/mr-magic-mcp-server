#!/usr/bin/env node
import { startHttpServer } from '../transport/http-server.js';

startHttpServer().catch((error) => {
  console.error('Failed to start HTTP server', error);
  process.exit(1);
});