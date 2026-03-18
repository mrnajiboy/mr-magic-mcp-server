import fs from 'node:fs/promises';
import path from 'node:path';

import { getEnvValue, getProjectRoot } from '../config.js';
import { createLogger } from '../logger.js';
import { describeKvBackend, isKvConfigured, kvGet, kvSet } from '../kv-store.js';

const logger = createLogger('musixmatch-token-manager');

// Token source terminology used throughout this module:
//   • Direct token   — MUSIXMATCH_DIRECT_TOKEN env var.  A static bearer token set
//                      directly in the environment.  Recommended for production and
//                      remote deployments where the filesystem cannot be relied upon
//                      for persistence.  Highest priority after in-memory cache.
//   • KV token       — stored in a remote KV store (Upstash Redis or Cloudflare KV).
//                      Ideal for ephemeral/serverless deployments and npx installs
//                      where there is no local filesystem at all.
//   • Cache token    — loaded from the on-disk cache file written by the fetch script.
//                      Only reliable when a persistent, writable filesystem is available
//                      (i.e. local development). Ephemeral hosts (Render free tier, etc.)
//                      may not have a writable FS, so the cache token is unavailable there.

// KV key and TTL — configurable via env vars.
const KV_KEY = process.env.MUSIXMATCH_TOKEN_KV_KEY || 'mr-magic:musixmatch-token';
const KV_TTL_SECONDS = parseInt(process.env.MUSIXMATCH_TOKEN_KV_TTL_SECONDS || '2592000', 10); // 30 days
const TOKEN_CACHE_PATH =
  process.env.MUSIXMATCH_TOKEN_CACHE ||
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
        'Token was NOT persisted to disk. Set MUSIXMATCH_DIRECT_TOKEN as an environment variable ' +
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

// ─── KV store helpers ─────────────────────────────────────────────────────────

async function readKvToken() {
  if (!isKvConfigured()) return null;
  try {
    const raw = await kvGet(KV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.token) {
      cachedToken = parsed.token;
      cachedDesktopCookie = parsed.desktopCookie || null;
      lastLoadedFrom = `kv:${describeKvBackend()}`;
      return cachedToken;
    }
  } catch {
    // KV read error — not fatal; fall through to disk cache
  }
  return null;
}

async function writeKvToken(token, desktopCookie) {
  if (!isKvConfigured() || !token) return;
  try {
    const payload = JSON.stringify({ token, ...(desktopCookie ? { desktopCookie } : {}) });
    await kvSet(KV_KEY, payload, KV_TTL_SECONDS);
  } catch (error) {
    logger.warn('Failed to persist Musixmatch token to KV store', {
      backend: describeKvBackend(),
      error: error?.message
    });
  }
}

/**
 * Resolve the Musixmatch token using the following priority order:
 *   1. In-memory runtime cache (already resolved this session)
 *   2. MUSIXMATCH_DIRECT_TOKEN env var — direct/static bearer token (highest env priority)
 *   3. KV store                        — Upstash Redis or Cloudflare KV (ephemeral/npx)
 *   4. On-disk cache file              — local dev / persistent server only
 */
export async function getMusixmatchToken() {
  if (cachedToken) {
    return cachedToken;
  }

  // 2. Direct token from env var — survives restarts on ephemeral hosts without any external service
  const directToken = getEnvValue('MUSIXMATCH_DIRECT_TOKEN');
  if (directToken) {
    cachedToken = directToken;
    lastLoadedFrom = 'env:MUSIXMATCH_DIRECT_TOKEN';
    cachedDesktopCookie = null;
    return cachedToken;
  }

  // 3. KV store — ideal for ephemeral deployments and npx installs with no local filesystem
  const kvToken = await readKvToken();
  if (kvToken) return kvToken;

  // 4. On-disk cache — local dev / persistent hosts with a writable filesystem
  return readCachedToken();
}

export async function setMusixmatchToken(token, { desktopCookie } = {}) {
  if (!token) return;
  cachedToken = token;
  lastLoadedFrom = 'runtime';
  cachedDesktopCookie = desktopCookie || null;
  // Write to both storage backends in parallel; failures are logged, not thrown.
  await Promise.allSettled([
    writeCachedToken(token, desktopCookie),
    writeKvToken(token, desktopCookie)
  ]);
  logger.info('Musixmatch token updated', {
    source: 'runtime',
    desktopCookiePresent: Boolean(desktopCookie),
    kvConfigured: isKvConfigured(),
    kvBackend: describeKvBackend()
  });
}

export function invalidateMusixmatchToken() {
  cachedToken = null;
}

export function describeMusixmatchTokenSource() {
  return lastLoadedFrom;
}

export async function getMusixmatchTokenDiagnostics() {
  const directEnvToken = getEnvValue('MUSIXMATCH_DIRECT_TOKEN');

  const diagnostics = {
    cachePath: TOKEN_CACHE_PATH,
    cacheDir: getCacheDir(),
    cacheAttempted: false,
    cacheFound: false,
    cacheBytes: 0,
    cacheTokenPresent: false,
    cacheError: null,
    directEnvPresent: Boolean(directEnvToken),
    kvConfigured: isKvConfigured(),
    kvBackend: describeKvBackend(),
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
  } else if (directEnvToken) {
    diagnostics.resolvedSource = 'env:MUSIXMATCH_DIRECT_TOKEN';
  } else if (diagnostics.cacheTokenPresent) {
    diagnostics.resolvedSource = 'cache';
  } else {
    diagnostics.resolvedSource = 'none';
  }

  diagnostics.tokenPresent = diagnostics.resolvedSource !== 'none';
  return diagnostics;
}
