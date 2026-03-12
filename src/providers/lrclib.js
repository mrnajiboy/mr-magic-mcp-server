import axios from 'axios';

import { normalizeLyricRecord } from '../provider-result-schema.js';

function normalizeLrclibRecord(record) {
  return normalizeLyricRecord({ provider: 'lrclib', raw: record, ...record });
}

const BASE_URL = 'https://lrclib.net/api';
const MOZILLA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

function buildParams(track) {
  const { title, artist, album, duration } = track;
  return {
    track_name: title,
    artist_name: artist,
    album_name: album,
    duration: typeof duration === 'number' ? duration : duration ? Math.round(duration) : undefined
  };
}

async function querySearch(track) {
  const { title, artist } = track;
  const query = `${(artist || '').trim()} ${(title || '').trim()}`.trim();
  const response = await axios.get(`${BASE_URL}/search`, {
    params: { q: query },
    headers: {
      'User-Agent': MOZILLA_USER_AGENT,
      'Accept': 'application/json',
      'lrclib-client': 'MrMagicLyricsMCP',
      'x-user-agent': MOZILLA_USER_AGENT
    }
  });

  return (response.data ?? []).map((record) => normalizeLrclibRecord(record));
}

export async function fetchFromLrclib(track) {
  try {
    const results = await querySearch(track);
    if (results.length === 0) {
      return null;
    }
    const exactMatch = results.find((record) => {
      const sameTitle = record.trackName?.toLowerCase() === track.title?.toLowerCase();
      const sameArtist = record.artistName?.toLowerCase() === track.artist?.toLowerCase();
      return sameTitle && sameArtist;
    });
    return exactMatch ?? results[0];
  } catch (error) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function searchLrclib(track) {
  return querySearch(track);
}