import axios from 'axios';

import { normalizeLyricRecord, lyricContentScore } from '../provider-result-schema.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('provider:lrclib');

function normalizeLrclibRecord(record) {
  return normalizeLyricRecord({ provider: 'lrclib', raw: record, ...record });
}

const BASE_URL = 'https://lrclib.net/api';
const HTTP_TIMEOUT_MS = Number(process.env.MR_MAGIC_HTTP_TIMEOUT_MS || 10000);
const MOZILLA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

async function querySearch(track) {
  const { title, artist } = track;
  const query = `${(artist || '').trim()} ${(title || '').trim()}`.trim();
  try {
    const response = await axios.get(`${BASE_URL}/search`, {
      params: { q: query },
      timeout: HTTP_TIMEOUT_MS,
      headers: {
        'User-Agent': MOZILLA_USER_AGENT,
        Accept: 'application/json',
        'lrclib-client': 'MrMagicLyricsMCP',
        'x-user-agent': MOZILLA_USER_AGENT
      }
    });
    logger.debug('LRCLIB search successful', { query, count: response.data?.length ?? 0 });
    return (response.data ?? []).map((record) => normalizeLrclibRecord(record));
  } catch (error) {
    if (error.response?.status === 404) {
      logger.debug('LRCLIB search returned 404', { query });
      return [];
    }
    logger.error('LRCLIB search request failed', { error, query });
    throw error;
  }
}

/**
 * Pick the best candidate from a list: prefer synced over plain, then prefer
 * richer lyric content. This ensures fetchFromLrclib always returns a synced
 * result when one is available rather than the first incidentally-ordered one.
 */
function chooseBestCandidate(candidates) {
  if (!candidates.length) return null;
  return candidates.slice().sort((a, b) => {
    // Synced results come first
    const syncedDiff = (b.synced ? 1 : 0) - (a.synced ? 1 : 0);
    if (syncedDiff !== 0) return syncedDiff;
    // Among equally-synced results, prefer richer content
    return lyricContentScore(b) - lyricContentScore(a);
  })[0];
}

export async function fetchFromLrclib(track) {
  try {
    const results = await querySearch(track);
    if (results.length === 0) {
      logger.debug('LRCLIB: no results found', { track });
      return null;
    }
    const exactMatches = results.filter((record) => {
      const sameTitle = record.title?.toLowerCase() === track.title?.toLowerCase();
      const sameArtist = record.artist?.toLowerCase() === track.artist?.toLowerCase();
      return sameTitle && sameArtist;
    });
    // Prefer exact matches; if none, fall back to all results.
    // Within each group, prefer synced then richer content.
    const result = chooseBestCandidate(exactMatches) ?? chooseBestCandidate(results);
    logger.debug('LRCLIB: match selected', {
      exact: exactMatches.length > 0,
      synced: result?.synced,
      title: result?.title,
      artist: result?.artist
    });
    return result;
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    logger.error('LRCLIB fetchFromLrclib failed', { error, track });
    return null;
  }
}

export async function searchLrclib(track) {
  return querySearch(track);
}
