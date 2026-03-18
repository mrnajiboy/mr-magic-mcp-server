import { fetchFromLrclib, searchLrclib } from './providers/lrclib.js';
import { fetchFromGenius, searchGenius, checkGeniusTokenReady } from './providers/genius.js';
import {
  fetchFromMusixmatch,
  searchMusixmatch,
  checkMusixmatchTokenReady
} from './providers/musixmatch.js';
import { fetchFromMelon, searchMelon } from './providers/melon.js';
import { getEnvValue } from './utils/config.js';
import { lyricContentScore } from './provider-result-schema.js';

const providers = [
  { name: 'lrclib', fetch: fetchFromLrclib, search: searchLrclib },
  { name: 'musixmatch', fetch: fetchFromMusixmatch, search: searchMusixmatch },
  { name: 'melon', fetch: fetchFromMelon, search: searchMelon },
  { name: 'genius', fetch: fetchFromGenius, search: searchGenius }
];
const providerIndex = providers.reduce(
  (acc, provider) => acc.set(provider.name, provider),
  new Map()
);

/**
 * Score a candidate result for ranking.
 *
 * Priority order (highest wins):
 *  1. Results with actual lyric content beat empty / unhydrated ones.
 *     lyricContentScore returns 0 for empties, 0.5-1.0 for results that have text,
 *     with a continuous richness bonus proportional to the line count.
 *  2. Among results that both have lyric text, synced content beats plain.
 *  3. Provider confidence score is a secondary tie-breaker.
 *
 * Multiplying lyricContentScore by 10 ensures it always dominates the confidence
 * score (which lives in the 0-1 range) and the synced bonus (0.5).
 */
function rankRecord(record) {
  const contentScore = lyricContentScore(record) * 10; // 0 or 5..10
  const syncedBonus = record?.synced ? 0.5 : 0;
  const confidenceScore = record?.confidence ?? 0;
  return contentScore + syncedBonus + confidenceScore;
}

async function tryProviders(track, { syncedOnly = false, providerNames = [] } = {}) {
  const matches = [];
  let bestSynced = null;
  let bestOverall = null;
  const chosenProviders =
    providerNames.length > 0
      ? providers.filter((provider) => providerNames.includes(provider.name))
      : providers;

  for (const provider of chosenProviders) {
    const candidate = await provider.fetch(track);
    if (!candidate) continue;

    const scored = { provider: provider.name, result: candidate, score: rankRecord(candidate) };
    matches.push(scored);

    if (!bestOverall || scored.score > bestOverall.score) {
      bestOverall = scored;
    }
    if (candidate.synced && (!bestSynced || scored.score > bestSynced.score)) {
      bestSynced = scored;
    }
  }

  const best = syncedOnly ? (bestSynced ?? null) : (bestSynced ?? bestOverall ?? null);
  return {
    matches,
    best
  };
}

export async function findLyrics(track, options = {}) {
  const { matches, best } = await tryProviders(track, options);
  return {
    matches: matches.map(({ provider, result }) => ({ provider, result })),
    best: best?.result ?? null
  };
}

export async function findSyncedLyrics(track, options = {}) {
  const { matches, best } = await tryProviders(track, { ...options, syncedOnly: true });
  return {
    matches: matches.map(({ provider, result }) => ({ provider, result })),
    best: best?.result ?? null
  };
}

export async function searchSources(track) {
  const queries = await Promise.all(
    providers.map(async (provider) => ({
      provider: provider.name,
      results: await provider.search(track)
    }))
  );
  return queries;
}

export async function searchProvider(providerName, track) {
  const provider = providerIndex.get(providerName);
  if (!provider) {
    return [];
  }
  return provider.search(track);
}

export function selectMatch(matches, { providerName, requireSynced = false } = {}) {
  const filtered = providerName
    ? matches.filter((match) => match.provider === providerName)
    : matches;
  if (requireSynced) {
    return filtered.find((match) => match.result?.synced) ?? filtered[0] ?? null;
  }
  return filtered[0] ?? null;
}

export async function getProviderStatus() {
  const melonReady = Boolean(getEnvValue('MELON_COOKIE'));
  const statuses = await Promise.all(
    providers.map(async (provider) => {
      if (provider.name === 'genius') {
        const ready = await checkGeniusTokenReady();
        return {
          name: provider.name,
          implemented: Boolean(provider.fetch && provider.search),
          note: ready ? 'Ready' : 'Missing client credentials or legacy access token'
        };
      }
      if (provider.name === 'musixmatch') {
        const ready = await checkMusixmatchTokenReady();
        return {
          name: provider.name,
          implemented: Boolean(provider.fetch && provider.search),
          note: ready ? 'Ready' : 'Requires token discovery/login'
        };
      }
      if (provider.name === 'melon') {
        return {
          name: provider.name,
          implemented: Boolean(provider.fetch && provider.search),
          note: melonReady ? 'Ready' : 'Requires MELON_COOKIE'
        };
      }
      return {
        name: provider.name,
        implemented: Boolean(provider.fetch && provider.search),
        note: 'Ready'
      };
    })
  );
  return statuses;
}
