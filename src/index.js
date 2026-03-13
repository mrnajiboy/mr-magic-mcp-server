import { fetchFromLrclib, searchLrclib } from './providers/lrclib.js';
import { fetchFromGenius, searchGenius, checkGeniusTokenReady } from './providers/genius.js';
import {
  fetchFromMusixmatch,
  searchMusixmatch,
  checkMusixmatchTokenReady
} from './providers/musixmatch.js';
import { fetchFromMelon, searchMelon } from './providers/melon.js';
import { getEnvValue } from './utils/config.js';

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

function rankRecord(record) {
  const confidenceScore = record?.confidence ?? 0;
  const syncedBonus = record?.synced ? 0.5 : 0;
  return confidenceScore + syncedBonus;
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
          implemented: provider.fetch && provider.search,
          note: ready ? 'Ready' : 'Missing client credentials or legacy access token'
        };
      }
      if (provider.name === 'musixmatch') {
        const ready = await checkMusixmatchTokenReady();
        return {
          name: provider.name,
          implemented: provider.fetch && provider.search,
          note: ready ? 'Ready' : 'Requires token discovery/login'
        };
      }
      if (provider.name === 'melon') {
        return {
          name: provider.name,
          implemented: provider.fetch && provider.search,
          note: melonReady ? 'Ready' : 'Requires MELON_COOKIE'
        };
      }
      return {
        name: provider.name,
        implemented: provider.fetch && provider.search,
        note: 'Ready'
      };
    })
  );
  return statuses;
}
