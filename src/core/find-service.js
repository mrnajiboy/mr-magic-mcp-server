import { findLyrics, findSyncedLyrics, searchProvider, searchSources } from '../index.js';
import { lyricContentScore } from '../provider-result-schema.js';

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

/**
 * Rank a chooser entry for auto-picking.
 *
 * Priority (highest first):
 *  1. Has actual lyric content (score > 0) beats empty/unhydrated entries.
 *  2. Synced beats plain when both have real content.
 *  3. Richer content (more lyric lines) wins when both are non-empty.
 *  4. Original list order is preserved as the final tie-breaker (lower index wins).
 */
function entryRankScore(entry, index) {
  const result = entry?.result;
  const content = lyricContentScore(result) * 10; // 0 or 5..10
  const syncedBonus = result?.synced ? 0.5 : 0;
  // Use a small negative index term so earlier list positions win ties
  const positionPenalty = index * 0.0001;
  return content + syncedBonus - positionPenalty;
}

export function autoPick(entries, preferSynced = true) {
  if (!entries.length) return null;

  // Sort a shallow copy by rank, descending
  const ranked = entries
    .map((entry, idx) => ({ entry, rank: entryRankScore(entry, idx) }))
    .sort((a, b) => b.rank - a.rank);

  if (preferSynced) {
    // Prefer synced among results that actually have content
    const syncedWithContent = ranked.find(
      ({ entry }) => entry.result?.synced && lyricContentScore(entry.result) > 0
    );
    if (syncedWithContent) {
      return syncedWithContent.entry.result;
    }
    // Fall back to synced without content check (legacy behaviour preserved)
    const anySynced = ranked.find(({ entry }) => entry.result?.synced);
    if (anySynced) {
      return anySynced.entry.result;
    }
  }

  return ranked[0].entry.result;
}
