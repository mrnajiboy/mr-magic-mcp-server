import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const resolvedRoot = process.env.MR_MAGIC_ROOT || projectRoot;
const resolvedEnvPath = process.env.MR_MAGIC_ENV_PATH || path.join(resolvedRoot, '.env');

dotenv.config({ path: resolvedEnvPath });

export function getProjectRoot() {
  return resolvedRoot;
}

export function getEnvPath() {
  return resolvedEnvPath;
}

export function getEnvValue(name) {
  return process.env[name] ?? null;
}

const DEFAULT_REQUIRED = ['GENIUS_ACCESS_TOKEN'];
const warnedMissingEnvCache = new Set();

export function getMissingEnvVars(requiredVars = DEFAULT_REQUIRED) {
  return requiredVars.filter((name) => !getEnvValue(name));
}

export function assertEnv(requiredVars = DEFAULT_REQUIRED) {
  const missing = getMissingEnvVars(requiredVars);
  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(', ')}`);
    error.missingEnv = missing;
    throw error;
  }
}

export function warnMissingEnv(requiredVars = DEFAULT_REQUIRED) {
  if (process.env.MR_MAGIC_QUIET_STDIO === '1') {
    return;
  }
  const missing = getMissingEnvVars(requiredVars);
  if (missing.length > 0) {
    const cacheKey = missing.slice().sort().join(',');
    if (warnedMissingEnvCache.has(cacheKey)) {
      return;
    }
    warnedMissingEnvCache.add(cacheKey);
    console.warn(`[env] Missing recommended variables: ${missing.join(', ')}`);
  }
}

export function getEnvSnapshot() {
  return {
    GENIUS_ACCESS_TOKEN: getEnvValue('GENIUS_ACCESS_TOKEN'),
    GENIUS_CLIENT_ID: getEnvValue('GENIUS_CLIENT_ID'),
    GENIUS_CLIENT_SECRET: getEnvValue('GENIUS_CLIENT_SECRET'),
    MUSIXMATCH_TOKEN: getEnvValue('MUSIXMATCH_TOKEN'),
    MELON_COOKIE: getEnvValue('MELON_COOKIE')
  };
}

export const MELON_COOKIE = () => getEnvValue('MELON_COOKIE');