#!/usr/bin/env node

// Reduce structured-log noise and env-missing warnings for interactive CLI usage.
// These must be set before any module that reads them is evaluated, so we use
// a dynamic import below instead of a static one.
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
if (!process.env.MR_MAGIC_QUIET_STDIO) process.env.MR_MAGIC_QUIET_STDIO = '1';

await import('../tools/cli.js');
