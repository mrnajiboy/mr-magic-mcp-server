import axios from 'axios';

import { normalizeLyricRecord } from '../provider-result-schema.js';
import { assertEnv } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import {
  getMusixmatchToken,
  invalidateMusixmatchToken,
  describeMusixmatchTokenSource
} from '../utils/tokens/musixmatch-token-manager.js';

const BASE_URL = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get';
const MOZILLA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const DEFAULT_HEADERS = {
  authority: 'apic-desktop.musixmatch.com',
  'User-Agent': MOZILLA_USER_AGENT
};

const logger = createLogger('provider:musixmatch');

function buildParams(track, token) {
  const durationSeconds = track.duration ? Math.round(track.duration / 1000) : '';
  return new URLSearchParams({
    format: 'json',
    namespace: 'lyrics_richsynched',
    subtitle_format: 'mxm',
    app_id: 'web-desktop-app-v1.0',
    q_album: track.album || '',
    q_artist: track.artist || '',
    q_artists: track.artist || '',
    q_track: track.title || '',
    track_spotify_id: track.uri || '',
    q_duration: durationSeconds,
    f_subtitle_length: durationSeconds ? Math.floor(durationSeconds) : '',
    usertoken: token || ''
  });
}

function normalizeBody(body) {
  const matcher = body['matcher.track.get']?.message?.body;
  if (!matcher) {
    return null;
  }

  const meta = matcher.track || {};
  const lyricsBody = body['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body || '';
  const subtitlesRoot = body['track.subtitles.get']?.message?.body;
  const subtitleEntry = subtitlesRoot?.subtitle_list?.find((entry) => {
    if (!entry) return false;
    if (entry.subtitle_body) return true;
    if (entry.subtitle?.subtitle_body) return true;
    return Boolean(entry.subtitle_id || entry.subtitle?.subtitle_id);
  }) ?? null;
  let syncedLines = [];
  const resolveBody = () => {
    if (!subtitleEntry) return null;
    if (subtitleEntry.subtitle_body) return subtitleEntry.subtitle_body;
    if (subtitleEntry.subtitle?.subtitle_body) return subtitleEntry.subtitle.subtitle_body;
    const subtitleId = subtitleEntry.subtitle_id || subtitleEntry.subtitle?.subtitle_id;
    if (!subtitleId) return null;
    const rawSubtitle = subtitlesRoot?.subtitle?.find((entry) => entry.subtitle_id === subtitleId);
    return rawSubtitle?.subtitle_body ?? null;
  };

  const subtitleBody = resolveBody();
  if (subtitleBody) {
    try {
      syncedLines = JSON.parse(subtitleBody);
    } catch (error) {
      logger.warn('Failed to parse Musixmatch subtitle_body', { error });
      syncedLines = [];
    }
  }

  const syncedLyrics = syncedLines
    .map((item) => {
      const time = item?.time || {};
      return `[${time.minutes.toString().padStart(2, '0')}:${time.seconds.toString().padStart(2, '0')}.${(time.hundredths || 0)
        .toString()
        .padStart(2, '0')}] ${item.text}`.trim();
    })
    .join('\n');

  const plainLyrics = lyricsBody.split('\n').filter(Boolean).join('\n');
  const sourceUrl = meta.share_url || '';

  return normalizeLyricRecord({
    provider: 'musixmatch',
    id: meta.track_id,
    trackName: meta.track_name,
    artistName: meta.artist_name,
    albumName: meta.album_name,
    duration: meta.track_length || null,
    plainLyrics: plainLyrics || null,
    syncedLyrics: syncedLyrics || null,
    sourceUrl,
    confidence: 1,
    synced: Boolean(syncedLyrics),
    status: 'ok',
    raw: body
  });
}

async function macroRequest(track) {
  await ensureMusixmatchToken();
  let token = await getMusixmatchToken();
  const attempt = async (tok) => {
    const params = buildParams(track, tok);
    const response = await axios.get(`${BASE_URL}?${params.toString()}`, {
      headers: DEFAULT_HEADERS
    });
    return response.data?.message?.body?.macro_calls || response.data?.message?.body || {};
  };

  try {
    return await attempt(token);
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.warn('Musixmatch token rejected, invalidating', { status: error.response.status });
      invalidateMusixmatchToken();
      token = await getMusixmatchToken();
      if (token) {
        try {
          return await attempt(token);
        } catch (retryError) {
          logger.error('Musixmatch retry failed', { error: retryError });
        }
      }
    }
    throw error;
  }
}

async function ensureMusixmatchToken() {
  const token = await getMusixmatchToken();
  if (!token) {
    assertEnv(['MUSIXMATCH_TOKEN']);
  }
}

export async function fetchFromMusixmatch(track) {
  try {
    const body = await macroRequest(track);
    const record = normalizeBody(body);
    return record;
  } catch (error) {
    logger.error('Musixmatch request failed', { error });
    return null;
  }
}

export async function searchMusixmatch(track) {
  const record = await fetchFromMusixmatch(track);
  return record ? [record] : [];
}

export async function checkMusixmatchTokenReady() {
  const source = describeMusixmatchTokenSource();
  if (source === 'env' || source === 'cache' || source === 'runtime') {
    const token = await getMusixmatchToken();
    return Boolean(token);
  }
  const token = await getMusixmatchToken();
  return Boolean(token);
}