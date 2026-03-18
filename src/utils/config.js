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

const DEFAULT_REQUIRED = ['GENIUS_DIRECT_TOKEN'];
const warnedMissingEnvCache = new Set();

function getMissingEnvVars(requiredVars = DEFAULT_REQUIRED) {
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

export const MELON_COOKIE = () => getEnvValue('MELON_COOKIE');
