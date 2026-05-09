#!/usr/bin/env node

// Reduce structured-log noise and env-missing warnings for interactive CLI usage.
// These must be set before any module that reads them is evaluated, so we use
// a dynamic import below instead of a static one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.LOG_LEVEL) process.env.LOG_LEVEL = 'warn';
if (!process.env.MR_MAGIC_QUIET_STDIO) process.env.MR_MAGIC_QUIET_STDIO = '1';

const configPath = process.env.MR_MAGIC_CLI_CONFIG_PATH
  ? path.resolve(process.env.MR_MAGIC_CLI_CONFIG_PATH)
  : path.join(os.homedir(), '.config', 'mrmagic-cli', 'config.json');
const configDir = path.dirname(configPath);

function readPersistedEnvPath() {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof parsed.envPath === 'string' && parsed.envPath.trim() ? parsed.envPath : null;
  } catch {
    return null;
  }
}

function persistEnvPath(envPath) {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, `${JSON.stringify({ envPath }, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
}

const envPathFlagIndex = process.argv.findIndex(
  (arg) => arg === '--env-path' || arg === '--env-file'
);
if (envPathFlagIndex >= 0 && process.argv[envPathFlagIndex + 1]) {
  process.env.MR_MAGIC_ENV_PATH = process.argv[envPathFlagIndex + 1];
  process.argv.splice(envPathFlagIndex, 2);
  if (process.argv.includes('--save-env-path')) {
    persistEnvPath(process.env.MR_MAGIC_ENV_PATH);
  }
} else if (!process.env.MR_MAGIC_ENV_PATH) {
  const persistedEnvPath = readPersistedEnvPath();
  if (persistedEnvPath) {
    process.env.MR_MAGIC_ENV_PATH = persistedEnvPath;
  }
}

const saveEnvPathFlagIndex = process.argv.indexOf('--save-env-path');
if (saveEnvPathFlagIndex >= 0) {
  process.argv.splice(saveEnvPathFlagIndex, 1);
}

await import('../tools/cli.js');
