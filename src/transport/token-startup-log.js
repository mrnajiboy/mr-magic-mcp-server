import fs from 'node:fs';

import { createLogger } from '../utils/logger.js';
import {
  describeMusixmatchTokenSource,
  getMusixmatchToken,
  getMusixmatchTokenDiagnostics
} from '../utils/tokens/musixmatch-token-manager.js';
import {
  describeGeniusAuthMode,
  getGeniusDiagnostics,
  getGeniusToken,
  hasValidGeniusAuth
} from '../utils/tokens/genius-token-manager.js';
import { getEnvPath, getEnvValue } from '../utils/config.js';

const logger = createLogger('token-startup-log');

export async function logTokenStatus({ context }) {
  logger.info('Startup environment diagnostics', {
    context,
    cwd: process.cwd(),
    envPath: getEnvPath(),
    envPathExists: fs.existsSync(getEnvPath())
  });
  await logGeniusStatus(context);
  await logMusixmatchStatus(context);
  logMelonStatus(context);
}

async function logGeniusStatus(context) {
  const diagnostics = getGeniusDiagnostics();
  const ready = hasValidGeniusAuth();
  const mode = describeGeniusAuthMode();

  logger.info('Genius credentials: checking availability', {
    context,
    provider: 'genius',
    clientCredentialsPresent: diagnostics.clientCredentialsPresent,
    fallbackTokenPresent: diagnostics.fallbackTokenPresent
  });

  if (diagnostics.runtimeTokenCached) {
    logger.info('Genius runtime token cached', {
      context,
      provider: 'genius',
      expiresInMs: diagnostics.runtimeTokenExpiresInMs
    });
  }

  if (ready) {
    logger.info('Genius credentials ready', {
      context,
      provider: 'genius',
      mode
    });
    if (mode === 'client_credentials') {
      logger.info('Testing Genius client credentials token fetch', {
        context,
        provider: 'genius'
      });
      await getGeniusToken().catch((error) => {
        logger.warn('Genius token fetch failed during startup', {
          context,
          provider: 'genius',
          error
        });
      });
    }
  } else {
    logger.warn('Genius credentials missing', {
      context,
      provider: 'genius',
      details: 'set GENIUS_CLIENT_ID/SECRET or GENIUS_ACCESS_TOKEN'
    });
  }
}

async function logMusixmatchStatus(context) {
  logger.info('Musixmatch: attempting to resolve token', { context, provider: 'musixmatch' });
  const diagnostics = await getMusixmatchTokenDiagnostics();

  logger.info('Musixmatch token sources', {
    context,
    provider: 'musixmatch',
    cachePath: diagnostics.cachePath,
    userEnvPresent: diagnostics.userEnvPresent,
    envPresent: diagnostics.envPresent,
    runtimeTokenCached: diagnostics.runtimeTokenCached,
    lastLoadedFrom: diagnostics.lastLoadedFrom
  });

  if (diagnostics.cacheAttempted) {
    logger.info('Musixmatch token cache inspected', {
      context,
      provider: 'musixmatch',
      cacheFound: diagnostics.cacheFound,
      cacheBytes: diagnostics.cacheBytes,
      cacheTokenPresent: diagnostics.cacheTokenPresent,
      cacheError: diagnostics.cacheError
    });
  }

  const musixmatchToken = await getMusixmatchToken();
  const musixmatchSource = describeMusixmatchTokenSource();

  if (musixmatchToken) {
    logger.info('Musixmatch token ready', {
      context,
      provider: 'musixmatch',
      source: musixmatchSource
    });
  } else {
    logger.warn('Musixmatch token missing', {
      context,
      provider: 'musixmatch',
      details: 'run scripts/fetch_musixmatch_token.mjs to capture cookies'
    });
  }
}

function logMelonStatus(context) {
  logger.info('Checking Melon cookie', { context, provider: 'melon' });
  const melonCookie = getEnvValue('MELON_COOKIE');
  if (melonCookie) {
    logger.info('Melon cookie present', { context, provider: 'melon' });
  } else {
    logger.warn('Melon cookie missing', {
      context,
      provider: 'melon',
      details: 'set MELON_COOKIE for consistent Melon requests'
    });
  }
}
