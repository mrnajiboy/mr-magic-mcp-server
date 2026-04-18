import axios from 'axios';

import { normalizeLyricRecord } from '../provider-result-schema.js';
import { createLogger } from '../utils/logger.js';
import {
  getMusixmatchToken,
  getMusixmatchDesktopCookie,
  invalidateMusixmatchToken
} from '../utils/tokens/musixmatch-token-manager.js';

const BASE_URL = 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get';
const HTTP_TIMEOUT_MS = Number(process.env.MR_MAGIC_HTTP_TIMEOUT_MS || 10000);
const MOZILLA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const DEFAULT_HEADERS = {
  authority: 'apic-desktop.musixmatch.com',
  'User-Agent': MOZILLA_USER_AGENT
};
const MXM_COOKIE_FALLBACK = 'x-mxm-token-guid=';

const logger = createLogger('provider:musixmatch');

function formatSubtitleTimestamp(item) {
  if (!item || typeof item !== 'object') return null;

  const text =
    typeof item.text === 'string'
      ? item.text
      : typeof item.subtitle_body === 'string'
        ? item.subtitle_body
        : '';

  const candidates = [
    item.time,
    item.timestamp,
    item.ts,
    item.line_time,
    item.lineTime,
    item.time_total,
    item.timeTotal
  ].filter((value) => value !== null && value !== undefined);

  const numericCandidate = candidates.find((value) => typeof value === 'number');
  if (typeof numericCandidate === 'number' && Number.isFinite(numericCandidate)) {
    const totalCentiseconds = Math.max(0, Math.round(numericCandidate * 100));
    const minutes = Math.floor(totalCentiseconds / 6000);
    const seconds = Math.floor((totalCentiseconds % 6000) / 100);
    const hundredths = totalCentiseconds % 100;
    return `[${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}] ${text}`.trim();
  }

  const timeObject = candidates.find((value) => value && typeof value === 'object');
  if (timeObject) {
    const minutes = Number(timeObject.minutes ?? timeObject.min ?? 0);
    const seconds = Number(timeObject.seconds ?? timeObject.sec ?? 0);
    const hundredths = Number(
      timeObject.hundredths ?? timeObject.hundredth ?? timeObject.cs ?? timeObject.milliseconds ?? 0
    );
    if ([minutes, seconds, hundredths].every(Number.isFinite)) {
      const normalizedHundredths =
        hundredths > 99 ? Math.floor(hundredths / 10) : Math.max(0, hundredths);
      return `[${minutes.toString().padStart(2, '0')}:${seconds
        .toString()
        .padStart(2, '0')}.${normalizedHundredths.toString().padStart(2, '0')}] ${text}`.trim();
    }
  }

  return null;
}

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

function summarizeMacroStatus(body = {}) {
  return {
    matcher: body['matcher.track.get']?.message?.header ?? null,
    lyrics: body['track.lyrics.get']?.message?.header ?? null,
    subtitles: body['track.subtitles.get']?.message?.header ?? null
  };
}

function buildBlockedRecord(track = {}, body = {}, reason = 'captcha') {
  return normalizeLyricRecord({
    provider: 'musixmatch',
    id: null,
    trackName: track.title || null,
    artistName: track.artist || null,
    albumName: track.album || null,
    duration: track.duration ? Math.round(track.duration / 1000) : null,
    plainLyrics: null,
    syncedLyrics: null,
    sourceUrl: null,
    confidence: 0,
    synced: false,
    status: reason === 'captcha' ? 'captcha_blocked' : 'blocked',
    raw: body
  });
}

function classifyUnauthorizedPayload(payload) {
  const hint = payload?.message?.header?.hint;
  if (hint === 'renew') {
    return 'MUSIXMATCH_TOKEN_RENEW';
  }
  return 'MUSIXMATCH_CAPTCHA';
}

function normalizeBody(body) {
  const matcher = body['matcher.track.get']?.message?.body;
  if (!matcher) {
    logger.warn('Musixmatch matcher body missing', { macroStatus: summarizeMacroStatus(body) });
    return null;
  }

  const meta = matcher.track || {};
  if (!meta.track_id) {
    logger.warn('Musixmatch matcher returned no track', {
      macroStatus: summarizeMacroStatus(body),
      matcherBodyType: Array.isArray(matcher) ? 'array' : typeof matcher,
      matcherPreview: Array.isArray(matcher) ? matcher.slice(0, 2) : matcher
    });
    return null;
  }
  const lyricsBody = body['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body || '';
  const subtitlesRoot = body['track.subtitles.get']?.message?.body;
  const subtitleEntry =
    subtitlesRoot?.subtitle_list?.find((entry) => {
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

  const syncedLyricLines = [];
  let skippedSubtitleItems = 0;
  for (const item of Array.isArray(syncedLines) ? syncedLines : []) {
    const formattedLine = formatSubtitleTimestamp(item);
    if (formattedLine) {
      syncedLyricLines.push(formattedLine);
    } else {
      skippedSubtitleItems += 1;
    }
  }

  if (skippedSubtitleItems > 0) {
    logger.warn('Musixmatch subtitle items skipped due to unrecognized shape', {
      skippedSubtitleItems,
      sample: Array.isArray(syncedLines) ? syncedLines.slice(0, 2) : syncedLines,
      trackId: meta.track_id,
      trackName: meta.track_name,
      artistName: meta.artist_name
    });
  }

  const syncedLyrics = syncedLyricLines.join('\n');

  const plainLyrics = lyricsBody.split('\n').filter(Boolean).join('\n');
  if (!plainLyrics && !syncedLyrics) {
    logger.warn('Musixmatch matched track but returned no lyric content', {
      trackId: meta.track_id,
      trackName: meta.track_name,
      artistName: meta.artist_name,
      macroStatus: summarizeMacroStatus(body)
    });
  }
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
  let desktopCookie = await getMusixmatchDesktopCookie();
  const topLevel401 = (payload) => payload?.message?.header?.status_code === 401;
  const attempt = async (tok, cookie) => {
    const params = buildParams(track, tok);
    const requestHeaders = {
      ...DEFAULT_HEADERS,
      Cookie: cookie || MXM_COOKIE_FALLBACK
    };
    const response = await axios.get(`${BASE_URL}?${params.toString()}`, {
      timeout: HTTP_TIMEOUT_MS,
      headers: requestHeaders,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(value) => value]
    });
    const contentType = response.headers?.['content-type'] || null;
    const bodyPreview =
      typeof response.data === 'string' ? response.data.slice(0, 240) : (response.data ?? null);

    logger.debug('Musixmatch raw response received', {
      httpStatus: response.status,
      contentType,
      dataType: typeof response.data,
      bodyPreview,
      trackTitle: track?.title || null,
      trackArtist: track?.artist || null,
      desktopCookiePresent: Boolean(cookie),
      usingFallbackCookie: !cookie
    });

    if (typeof response.data !== 'string') {
      logger.warn('Musixmatch returned non-text raw payload', {
        httpStatus: response.status,
        contentType,
        dataType: typeof response.data
      });
    }

    if (typeof response.data === 'string') {
      const trimmed = response.data.trim();
      const looksLikeHtml =
        contentType?.includes('text/html') ||
        /^<!doctype html/i.test(trimmed) ||
        /^<html[\s>]/i.test(trimmed);
      if (looksLikeHtml) {
        const error = new Error('Musixmatch returned HTML instead of JSON');
        error.code = 'MUSIXMATCH_HTML_RESPONSE';
        error.response = {
          status: response.status,
          data: response.data,
          headers: response.headers
        };
        throw error;
      }
    }

    let payload;
    try {
      payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } catch (parseError) {
      logger.error('Failed to parse Musixmatch response as JSON', {
        httpStatus: response.status,
        contentType,
        bodyPreview,
        error: parseError
      });
      const error = new Error('Musixmatch returned invalid JSON');
      error.code = 'MUSIXMATCH_INVALID_JSON';
      error.response = {
        status: response.status,
        data: response.data,
        headers: response.headers
      };
      throw error;
    }

    if (response.status === 401 || response.status === 403) {
      const error = new Error(`Musixmatch HTTP ${response.status}`);
      error.code =
        response.status === 401 ? classifyUnauthorizedPayload(payload) : 'MUSIXMATCH_BLOCKED';
      error.response = {
        status: response.status,
        data: payload,
        headers: response.headers
      };
      throw error;
    }

    if (topLevel401(payload)) {
      const error = new Error('Musixmatch unauthorized response');
      error.code = classifyUnauthorizedPayload(payload);
      error.response = {
        status: 401,
        data: payload,
        headers: response.headers
      };
      throw error;
    }
    return payload?.message?.body?.macro_calls || payload?.message?.body || {};
  };

  try {
    return await attempt(token, desktopCookie);
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.warn('Musixmatch token rejected, invalidating', {
        status: error.response.status,
        desktopCookiePresent: Boolean(desktopCookie),
        errorCode: error.code
      });
      invalidateMusixmatchToken();
      token = await getMusixmatchToken();
      desktopCookie = await getMusixmatchDesktopCookie();
      if (token) {
        try {
          return await attempt(token, desktopCookie);
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
    // Neither a direct token (MUSIXMATCH_DIRECT_TOKEN env var) nor a KV token nor a
    // cache token (on-disk .cache/musixmatch-token.json) could be found.
    throw new Error(
      'Musixmatch token not found. ' +
        'Set MUSIXMATCH_DIRECT_TOKEN as an environment variable (recommended for production/ephemeral hosts), ' +
        'or run `npm run fetch:musixmatch-token` to populate the on-disk cache token.'
    );
  }
}

export async function fetchFromMusixmatch(track) {
  try {
    const body = await macroRequest(track);
    const record = normalizeBody(body);
    return record;
  } catch (error) {
    if (error.code === 'MUSIXMATCH_CAPTCHA' || error.code === 'MUSIXMATCH_HTML_RESPONSE') {
      logger.warn('Musixmatch blocked by captcha challenge', {
        trackTitle: track?.title || null,
        trackArtist: track?.artist || null,
        httpStatus: error.response?.status ?? null,
        contentType: error.response?.headers?.['content-type'] ?? null
      });
      return buildBlockedRecord(track, error.response?.data, 'captcha');
    }
    if (
      error.code === 'MUSIXMATCH_BLOCKED' ||
      error.code === 'MUSIXMATCH_INVALID_JSON' ||
      error.code === 'MUSIXMATCH_TOKEN_RENEW'
    ) {
      logger.warn('Musixmatch returned blocked or invalid response', {
        trackTitle: track?.title || null,
        trackArtist: track?.artist || null,
        httpStatus: error.response?.status ?? null,
        contentType: error.response?.headers?.['content-type'] ?? null,
        errorCode: error.code
      });
      return buildBlockedRecord(track, error.response?.data, 'blocked');
    }
    logger.error('Musixmatch request failed', { error });
    return null;
  }
}

export async function searchMusixmatch(track) {
  const record = await fetchFromMusixmatch(track);
  return record ? [record] : [];
}

export async function checkMusixmatchTokenReady() {
  const token = await getMusixmatchToken();
  const desktopCookie = await getMusixmatchDesktopCookie();
  logger.debug('Musixmatch credential readiness checked', {
    tokenPresent: Boolean(token),
    desktopCookiePresent: Boolean(desktopCookie)
  });
  return Boolean(token);
}
