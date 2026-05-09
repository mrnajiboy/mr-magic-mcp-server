#!/usr/bin/env node

// Reduce structured-log noise and env-missing warnings for interactive CLI usage.
// These must be set before any module that reads them is evaluated, so we use
// a dynamic import below instead of a static one.
if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
if (!process.env.MR_MAGIC_QUIET_STDIO) process.env.MR_MAGIC_QUIET_STDIO = '1';

const envPathFlagIndex = process.argv.findIndex(
  (arg) => arg === '--env-path' || arg === '--env-file'
);
if (envPathFlagIndex >= 0 && process.argv[envPathFlagIndex + 1]) {
  process.env.MR_MAGIC_ENV_PATH = process.argv[envPathFlagIndex + 1];
  process.argv.splice(envPathFlagIndex, 2);
}

await import('../tools/cli.js');
