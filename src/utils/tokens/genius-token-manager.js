import fs from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';

import { getEnvValue, getProjectRoot } from '../config.js';
import { createLogger } from '../logger.js';

const GENIUS_TOKEN_ENDPOINT = 'https://api.genius.com/oauth/token';
const logger = createLogger('genius-token-manager');

// Token source terminology used throughout this module:
//   • Auto-refresh   — GENIUS_CLIENT_ID + GENIUS_CLIENT_SECRET env vars.
//                      The server calls the Genius OAuth client_credentials endpoint
//                      at runtime and keeps the token refreshed in memory automatically.
//                      This is the recommended approach for all deployments: no disk,
//                      no scripts, and no manual token copying needed.
//   • Fallback token — GENIUS_ACCESS_TOKEN env var.  A static bearer token set directly
//                      in the environment.  Does not auto-refresh; redeploy when expired.
//                      Use this only when client_credentials are unavailable.
//   • Cache token    — on-disk .cache/genius-token.json written by the fetch script.
//                      Only reliable when a persistent, writable filesystem is available
//                      (i.e. local development). Ephemeral hosts (Render free tier, etc.)
//                      should use the auto-refresh or fallback token paths instead.

// Token cache path — must match the path used by scripts/fetch_genius_token.mjs.
const TOKEN_CACHE_PATH =
  process.env.GENIUS_TOKEN_CACHE || path.join(getProjectRoot(), '.cache', 'genius-token.json');

let cachedToken = null;
let cachedExpiry = 0;
let lastAuthMode = 'unknown';

function getFallbackToken() {
  return getEnvValue('GENIUS_ACCESS_TOKEN');
}

function tokenExpired() {
  if (!cachedToken) return true;
  const now = Date.now();
  return now >= cachedExpiry - 60_000; // refresh one minute early
}

async function readCachedToken() {
  try {
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const { access_token: accessToken, expires_at: expiresAt } = parsed ?? {};
    if (!accessToken) return null;
    // Skip if the cache token has already expired (with a 1-minute buffer).
    if (expiresAt && Date.now() >= expiresAt - 60_000) return null;
    return { accessToken, expiresAt };
  } catch {
    // Cache file absent or unreadable — not an error in remote environments.
    return null;
  }
}

async function fetchClientCredentialsToken() {
  const clientId = getEnvValue('GENIUS_CLIENT_ID');
  const clientSecret = getEnvValue('GENIUS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return null;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });
  try {
    const response = await axios.post(GENIUS_TOKEN_ENDPOINT, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    });
    const { access_token: accessToken, expires_in: expiresIn } = response.data ?? {};
    if (!accessToken) {
      throw new Error('Genius token response missing access_token');
    }
    const ttl = Number(expiresIn) || 3600;
    cachedToken = accessToken;
    cachedExpiry = Date.now() + ttl * 1000;
    lastAuthMode = 'client_credentials';
    logger.info('Genius token refreshed', { ttlSeconds: ttl });
    return cachedToken;
  } catch (error) {
    logger.error('Failed to refresh Genius token', {
      error: error.response?.data || error.message
    });
    return null;
  }
}

/**
 * Resolve the Genius token using the following priority order:
 *   1. In-memory runtime cache (already resolved this session)
 *   2. Auto-refresh via GENIUS_CLIENT_ID + GENIUS_CLIENT_SECRET (client_credentials)
 *   3. GENIUS_ACCESS_TOKEN env var — fallback token
 *   4. On-disk .cache/genius-token.json — cache token, local dev only
 */
export async function getGeniusToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && !tokenExpired()) {
    return cachedToken;
  }

  // 2. Auto-refresh via client_credentials (ideal for all deployments)
  const token = await fetchClientCredentialsToken();
  if (token) {
    return token;
  }

  // 3. Fallback token from env var (static, no auto-refresh)
  const fallback = getFallbackToken();
  if (fallback && fallback !== cachedToken) {
    logger.warn('Using Genius fallback token from GENIUS_ACCESS_TOKEN env var');
    cachedToken = fallback;
    cachedExpiry = Date.now() + 86_400_000; // 1 day placeholder
    lastAuthMode = 'env_access_token';
    return cachedToken;
  }

  // 4. Cache token from disk (local dev convenience only)
  const cached = await readCachedToken();
  if (cached) {
    logger.info('Using Genius cache token from disk', { cachePath: TOKEN_CACHE_PATH });
    cachedToken = cached.accessToken;
    cachedExpiry = cached.expiresAt ?? Date.now() + 86_400_000;
    lastAuthMode = 'cache';
    return cachedToken;
  }

  return cachedToken;
}

export function invalidateGeniusToken() {
  cachedToken = null;
  cachedExpiry = 0;
  lastAuthMode = 'unknown';
}

export function hasValidGeniusAuth() {
  const hasClient = Boolean(getEnvValue('GENIUS_CLIENT_ID') && getEnvValue('GENIUS_CLIENT_SECRET'));
  if (hasClient) return true;
  return Boolean(getFallbackToken());
}

export function describeGeniusAuthMode() {
  if (lastAuthMode !== 'unknown') {
    return lastAuthMode;
  }
  if (cachedToken && cachedExpiry > Date.now()) {
    return 'cached_runtime_token';
  }
  const hasClient = Boolean(getEnvValue('GENIUS_CLIENT_ID') && getEnvValue('GENIUS_CLIENT_SECRET'));
  if (hasClient) {
    return 'client_credentials';
  }
  if (getFallbackToken()) {
    return 'env_access_token';
  }
  return 'none';
}

export async function getGeniusDiagnostics() {
  const clientId = getEnvValue('GENIUS_CLIENT_ID');
  const clientSecret = getEnvValue('GENIUS_CLIENT_SECRET');
  const fallback = getFallbackToken();
  const ttlMs = Math.max(cachedExpiry - Date.now(), 0);

  const diagnostics = {
    clientCredentialsPresent: Boolean(clientId && clientSecret),
    fallbackTokenPresent: Boolean(fallback),
    runtimeTokenCached: Boolean(cachedToken),
    runtimeTokenExpiresInMs: cachedToken ? ttlMs : 0,
    lastAuthMode: describeGeniusAuthMode(),
    cachePath: TOKEN_CACHE_PATH,
    cacheTokenPresent: false,
    cacheTokenExpired: false,
    cacheError: null
  };

  try {
    const raw = await fs.readFile(TOKEN_CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    diagnostics.cacheTokenPresent = Boolean(parsed?.access_token);
    if (parsed?.expires_at) {
      diagnostics.cacheTokenExpired = Date.now() >= parsed.expires_at - 60_000;
    }
  } catch (error) {
    diagnostics.cacheError = error?.code === 'ENOENT' ? null : (error?.message ?? null);
  }

  return diagnostics;
}
