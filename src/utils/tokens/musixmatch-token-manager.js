import fs from 'node:fs/promises';
import path from 'node:path';

import { getEnvValue, getProjectRoot } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('musixmatch-token-manager');

// Token source terminology used throughout this module:
//   • Cache token   — loaded from the on-disk cache file written by the fetch script.
//                     Only reliable when a persistent, writable filesystem is available
//                     (i.e. local development). Ephemeral hosts (Render free tier, etc.)
//                     may not have a writable FS, so the cache token is unavailable there.
//   • Fallback token — the token value supplied directly via MUSIXMATCH_FALLBACK_TOKEN or
//                     MUSIXMATCH_ALT_USER_TOKEN environment variables.  This is the recommended
//                     approach for production and remote deployments where the filesystem
//                     cannot be relied upon for persistence.
const TOKEN_CACHE_PATH =
  process.env.MUSIXMATCH_ALT_USER_TOKEN_CACHE ||
  path.join(getProjectRoot(), '.cache', 'musixmatch-token.json');

let cachedToken = null;
let lastLoadedFrom = 'unknown';
let cachedDesktopCookie = null;

function getCacheDir() {
  return path.dirname(TOKEN_CACHE_PATH);
}

// Returns true only when the directory exists or was successfully created.
// On read-only / restricted filesystems this will return false silently.
async function ensureCacheDir() {
  try {
    await fs.mkdir(path.dirname(TOKEN_CACHE_PATH), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

async function readCachedToken() {
  try {
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.token) {
      cachedToken = parsed.token;
      cachedDesktopCookie = parsed.desktopCookie || null;
      lastLoadedFrom = 'cache';
      return cachedToken;
    }
  } catch {
    // Cache file absent or unreadable — not an error in remote environments.
  }
  return null;
}

async function writeCachedToken(token, desktopCookie) {
  if (!token) return;
  const dirOk = await ensureCacheDir();
  if (!dirOk) {
    logger.warn(
      'Musixmatch token cache directory unavailable (read-only or restricted filesystem). ' +
        'Token was NOT persisted to disk. Set MUSIXMATCH_FALLBACK_TOKEN as an environment variable ' +
        'to ensure the token survives restarts in remote/ephemeral deployments.',
      { cachePath: TOKEN_CACHE_PATH }
    );
    return;
  }
  try {
    const payload = { token };
    if (desktopCookie) payload.desktopCookie = desktopCookie;
    await fs.writeFile(TOKEN_CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to persist Musixmatch token cache', { error: error?.message });
  }
}

/**
 * Resolve the Musixmatch token using the following priority order:
 *   1. In-memory runtime cache (already resolved this session)
 *   2. MUSIXMATCH_FALLBACK_TOKEN env var  — fallback token, first-priority env source
 *   3. MUSIXMATCH_ALT_USER_TOKEN env var       — fallback token, second-priority env source
 *   4. On-disk cache file             — cache token, local dev only
 */
export async function getMusixmatchToken() {
  if (cachedToken) {
    return cachedToken;
  }

  // Prioritize env vars — these survive restarts on ephemeral hosts
  const userToken = getEnvValue('MUSIXMATCH_FALLBACK_TOKEN');
  if (userToken) {
    cachedToken = userToken;
    lastLoadedFrom = 'env:MUSIXMATCH_FALLBACK_TOKEN';
    cachedDesktopCookie = null;
    return cachedToken;
  }

  const envToken = getEnvValue('MUSIXMATCH_ALT_USER_TOKEN');
  if (envToken) {
    cachedToken = envToken;
    lastLoadedFrom = 'env:MUSIXMATCH_ALT_USER_TOKEN';
    cachedDesktopCookie = null;
    return cachedToken;
  }

  // Fall back to disk cache for local development
  return readCachedToken();
}

export async function setMusixmatchToken(token, { desktopCookie } = {}) {
  if (!token) return;
  cachedToken = token;
  lastLoadedFrom = 'runtime';
  cachedDesktopCookie = desktopCookie || null;
  await writeCachedToken(token, desktopCookie);
  logger.info('Musixmatch token updated', {
    source: 'runtime',
    desktopCookiePresent: Boolean(desktopCookie)
  });
}

export function invalidateMusixmatchToken() {
  cachedToken = null;
}

export function describeMusixmatchTokenSource() {
  return lastLoadedFrom;
}

export async function getMusixmatchTokenDiagnostics() {
  const userEnvToken = getEnvValue('MUSIXMATCH_FALLBACK_TOKEN');
  const envToken = getEnvValue('MUSIXMATCH_ALT_USER_TOKEN');

  const diagnostics = {
    cachePath: TOKEN_CACHE_PATH,
    cacheDir: getCacheDir(),
    cacheAttempted: false,
    cacheFound: false,
    cacheBytes: 0,
    cacheTokenPresent: false,
    cacheError: null,
    userEnvPresent: Boolean(userEnvToken),
    envPresent: Boolean(envToken),
    runtimeTokenCached: Boolean(cachedToken),
    lastLoadedFrom,
    resolvedSource: 'none'
  };

  try {
    diagnostics.cacheAttempted = true;
    const raw = await fs.readFile(TOKEN_CACHE_PATH);
    diagnostics.cacheFound = true;
    diagnostics.cacheBytes = raw.length;
    const parsed = JSON.parse(raw.toString('utf8'));
    diagnostics.cacheTokenPresent = Boolean(parsed?.token);
  } catch (error) {
    diagnostics.cacheError = error?.code === 'ENOENT' ? null : (error?.message ?? null);
  }

  if (cachedToken) {
    diagnostics.resolvedSource = lastLoadedFrom;
  } else if (userEnvToken) {
    diagnostics.resolvedSource = 'env:MUSIXMATCH_FALLBACK_TOKEN';
  } else if (envToken) {
    diagnostics.resolvedSource = 'env:MUSIXMATCH_ALT_USER_TOKEN';
  } else if (diagnostics.cacheTokenPresent) {
    diagnostics.resolvedSource = 'cache';
  } else {
    diagnostics.resolvedSource = 'none';
  }

  diagnostics.tokenPresent = diagnostics.resolvedSource !== 'none';
  return diagnostics;
}
