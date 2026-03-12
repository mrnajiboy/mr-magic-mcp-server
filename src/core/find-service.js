import { findLyrics, findSyncedLyrics, searchProvider, searchSources } from '../index.js';

export function normalizeTrack(track = {}) {
  if (!track || typeof track !== 'object') {
    return { title: '', artist: '', album: null, duration: null };
  }
  return {
    title: track.title?.trim() || '',
    artist: track.artist?.trim() || '',
    album: track.album?.trim() || null,
    duration:
      typeof track.duration === 'number'
        ? track.duration
        : Number.isFinite(Number(track.duration))
          ? Number(track.duration)
          : null
  };
}

export async function runFind(track, options = {}) {
  const providerNames = options.providerNames || [];
  const finder = options.syncedOnly ? findSyncedLyrics : findLyrics;
  const normalizedTrack = normalizeTrack(track);
  const result = await finder(normalizedTrack, {
    providerNames,
    syncedOnly: options.syncedOnly
  });
  return result;
}

export async function runSearch(track) {
  return searchSources(normalizeTrack(track));
}

export async function runProviderSearch(providerName, track) {
  return searchProvider(providerName, normalizeTrack(track));
}

export function buildChooserEntries(matches) {
  return matches.map((entry, idx) => ({
    index: idx + 1,
    provider: entry.provider,
    result: entry.result
  }));
}

export function pickIndex(entries, index) {
  if (!entries.length) return null;
  if (!index) return entries[0].result;
  const parsedIndex = Number(index);
  if (!Number.isInteger(parsedIndex) || parsedIndex < 1 || parsedIndex > entries.length) {
    throw new Error(`Invalid index. Provide an integer between 1 and ${entries.length}.`);
  }
  return entries[parsedIndex - 1].result;
}

export function autoPick(entries, preferSynced = true) {
  if (!entries.length) return null;
  if (preferSynced) {
    const synced = entries.find((entry) => entry.result?.synced);
    if (synced) {
      return synced.result;
    }
  }
  return entries[0].result;
}
