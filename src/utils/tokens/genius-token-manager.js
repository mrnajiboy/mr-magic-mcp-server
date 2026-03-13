import axios from 'axios';

import { getEnvValue } from '../config.js';
import { createLogger } from '../logger.js';

const GENIUS_TOKEN_ENDPOINT = 'https://api.genius.com/oauth/token';
const logger = createLogger('genius-token-manager');

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

export async function getGeniusToken({ forceRefresh = false } = {}) {
  if (!forceRefresh && !tokenExpired()) {
    return cachedToken;
  }
  const token = await fetchClientCredentialsToken();
  if (token) {
    return token;
  }
  const fallback = getFallbackToken();
  if (fallback && fallback !== cachedToken) {
    logger.warn('Using fallback Genius access token from environment');
    cachedToken = fallback;
    cachedExpiry = Date.now() + 86_400_000; // 1 day placeholder
    lastAuthMode = 'env_access_token';
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

export function getGeniusDiagnostics() {
  const clientId = getEnvValue('GENIUS_CLIENT_ID');
  const clientSecret = getEnvValue('GENIUS_CLIENT_SECRET');
  const fallback = getFallbackToken();
  const ttlMs = Math.max(cachedExpiry - Date.now(), 0);

  return {
    clientCredentialsPresent: Boolean(clientId && clientSecret),
    fallbackTokenPresent: Boolean(fallback),
    runtimeTokenCached: Boolean(cachedToken),
    runtimeTokenExpiresInMs: cachedToken ? ttlMs : 0,
    lastAuthMode: describeGeniusAuthMode()
  };
}
