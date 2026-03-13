import fs from 'node:fs/promises';
import path from 'node:path';

import { getEnvValue, getProjectRoot } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('musixmatch-token-manager');
const TOKEN_CACHE_PATH =
  process.env.MUSIXMATCH_TOKEN_CACHE ||
  path.join(getProjectRoot(), '.cache', 'musixmatch-token.json');

let cachedToken = null;
let lastLoadedFrom = 'unknown';
let cachedDesktopCookie = null;

function getCacheDir() {
  return path.dirname(TOKEN_CACHE_PATH);
}

async function ensureCacheDir() {
  const dir = getCacheDir();
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

async function readCachedToken() {
  try {
    await ensureCacheDir();
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.token) {
      cachedToken = parsed.token;
      cachedDesktopCookie = parsed.desktopCookie || null;
      lastLoadedFrom = 'cache';
      return cachedToken;
    }
  } catch (error) {
    // ignore missing cache
  }
  return null;
}

async function writeCachedToken(token, desktopCookie) {
  if (!token) return;
  try {
    await ensureCacheDir();
    const payload = { token };
    if (desktopCookie) {
      payload.desktopCookie = desktopCookie;
    }
    await fs.writeFile(TOKEN_CACHE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    logger.warn('Failed to persist Musixmatch token cache', { error });
  }
}

export async function getMusixmatchToken() {
  if (cachedToken) {
    return cachedToken;
  }
  const envToken = getEnvValue('MUSIXMATCH_TOKEN');
  if (envToken) {
    cachedToken = envToken;
    lastLoadedFrom = 'env';
    cachedDesktopCookie = null;
    return cachedToken;
  }
  return readCachedToken();
}

export function getCachedDesktopCookie() {
  return cachedDesktopCookie;
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

export function resetMusixmatchTokenCache() {
  cachedToken = null;
  cachedDesktopCookie = null;
  lastLoadedFrom = 'unknown';
}

export async function getMusixmatchTokenDiagnostics() {
  const envToken = getEnvValue('MUSIXMATCH_TOKEN');
  const diagnostics = {
    cachePath: TOKEN_CACHE_PATH,
    cacheDir: getCacheDir(),
    cacheAttempted: false,
    cacheFound: false,
    cacheBytes: 0,
    cacheTokenPresent: false,
    cacheError: null,
    envPresent: Boolean(envToken),
    runtimeTokenCached: Boolean(cachedToken),
    lastLoadedFrom,
    resolvedSource: 'none'
  };

  try {
    await ensureCacheDir();
    diagnostics.cacheAttempted = true;
    const raw = await fs.readFile(TOKEN_CACHE_PATH);
    diagnostics.cacheFound = true;
    diagnostics.cacheBytes = raw.length;
    const parsed = JSON.parse(raw.toString('utf8'));
    diagnostics.cacheTokenPresent = Boolean(parsed?.token);
  } catch (error) {
    diagnostics.cacheError = error?.code === 'ENOENT' ? null : error?.message;
  }

  if (cachedToken) {
    diagnostics.resolvedSource = lastLoadedFrom;
  } else if (envToken) {
    diagnostics.resolvedSource = 'env';
  } else if (diagnostics.cacheTokenPresent) {
    diagnostics.resolvedSource = 'cache';
  } else {
    diagnostics.resolvedSource = 'none';
  }

  diagnostics.tokenPresent = diagnostics.resolvedSource !== 'none';
  return diagnostics;
}
