import fs from 'node:fs/promises';
import path from 'node:path';

import { getEnvValue } from '../config.js';
import { createLogger } from '../logger.js';

const logger = createLogger('musixmatch-token-manager');
const TOKEN_CACHE_PATH = process.env.MUSIXMATCH_TOKEN_CACHE || path.resolve('.cache', 'musixmatch-token.json');

let cachedToken = null;
let lastLoadedFrom = 'env';

async function ensureCacheDir() {
  const dir = path.dirname(TOKEN_CACHE_PATH);
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

async function readCachedToken() {
  try {
    await ensureCacheDir();
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.token) {
      cachedToken = parsed.token;
      lastLoadedFrom = 'cache';
      return cachedToken;
    }
  } catch (error) {
    // ignore missing cache
  }
  return null;
}

async function writeCachedToken(token) {
  if (!token) return;
  try {
    await ensureCacheDir();
    await fs.writeFile(TOKEN_CACHE_PATH, JSON.stringify({ token }), 'utf8');
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
    return cachedToken;
  }
  return readCachedToken();
}

export async function setMusixmatchToken(token) {
  if (!token) return;
  cachedToken = token;
  lastLoadedFrom = 'runtime';
  await writeCachedToken(token);
  logger.info('Musixmatch token updated', { source: 'runtime' });
}

export function invalidateMusixmatchToken() {
  cachedToken = null;
}

export function describeMusixmatchTokenSource() {
  return lastLoadedFrom;
}