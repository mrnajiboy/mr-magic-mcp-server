import dotenv from 'dotenv';

dotenv.config();

const env = {
  GENIUS_ACCESS_TOKEN: process.env.GENIUS_ACCESS_TOKEN ?? null,
  MUSIXMATCH_TOKEN: process.env.MUSIXMATCH_TOKEN ?? null,
  MELON_COOKIE: process.env.MELON_COOKIE ?? null
};

export const GENIUS_TOKEN = env.GENIUS_ACCESS_TOKEN;
export const MUSIXMATCH_TOKEN = env.MUSIXMATCH_TOKEN;
export const MELON_COOKIE = env.MELON_COOKIE;

const DEFAULT_REQUIRED = ['GENIUS_ACCESS_TOKEN'];

export function getMissingEnvVars(requiredVars = DEFAULT_REQUIRED) {
  return requiredVars.filter((name) => !env[name]);
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
    console.warn(`[env] Missing recommended variables: ${missing.join(', ')}`);
  }
}

export function getEnvSnapshot() {
  return { ...env };
}