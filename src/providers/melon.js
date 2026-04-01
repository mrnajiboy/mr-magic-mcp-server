import axios from 'axios';
import * as cheerio from 'cheerio';

import { normalizeLyricRecord, recomputeSyncFlags } from '../provider-result-schema.js';
import { MELON_COOKIE, warnMissingEnv } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';

const SEARCH_URL = 'https://www.melon.com/search/song/index.htm';
const LYRIC_URL = 'https://www.melon.com/song/lyricInfo.json';
const HTTP_TIMEOUT_MS = Number(process.env.MR_MAGIC_HTTP_TIMEOUT_MS || 10000);
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
let cachedMelonCookie = null;
const logger = createLogger('provider:melon');

async function ensureMelonCookie() {
  const manualCookie = typeof MELON_COOKIE === 'function' ? MELON_COOKIE() : MELON_COOKIE;
  if (manualCookie) {
    cachedMelonCookie = manualCookie;
    return manualCookie;
  }
  if (cachedMelonCookie) return cachedMelonCookie;
  const response = await axios.get('https://www.melon.com', {
    timeout: HTTP_TIMEOUT_MS,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html'
    }
  });
  const setCookies = response.headers['set-cookie'] || [];
  const cookie = setCookies.map((entry) => entry.split(';')[0]).join('; ');
  cachedMelonCookie = cookie;
  return cookie;
}

async function buildSearchHeaders() {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    Referer: 'https://www.melon.com/search/song/index.htm',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  };
  if (!cachedMelonCookie) {
    warnMissingEnv(['MELON_COOKIE']);
  }
  const cookie = await ensureMelonCookie();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

async function fetchSearchPage(track) {
  const headers = await buildSearchHeaders();
  const response = await axios.get(SEARCH_URL, {
    timeout: HTTP_TIMEOUT_MS,
    headers,
    params: {
      q: `${(track.artist || '').trim()} ${(track.title || '').trim()}`.trim(),
      section: '',
      mwkLogType: 'T',
      searchGnbYn: 'Y',
      kkoSpl: 'N',
      kkoDpType: '',
      searchType: 1,
      searchGubun: 1
    }
  });
  return response.data;
}

async function buildLyricHeaders(songId) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Referer: `https://www.melon.com/song/detail.htm?songId=${songId}`
  };
  const cookie = await ensureMelonCookie();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function extractSongId(value) {
  if (!value) return null;
  const goSongMatch = value.match(/goSongDetail\([^0-9]*?(\d+)\)/);
  if (goSongMatch) return goSongMatch[1];
  const searchLogMatch = value.match(/searchLog\('[^']+','[^']+','[^']+','[^']+','(\d+)'\)/);
  if (searchLogMatch) return searchLogMatch[1];
  const playMatch = value.match(/playSong\([^0-9]*?(\d+)\)/);
  if (playMatch) return playMatch[1];
  return null;
}

function parseSearchPage(html) {
  const $ = cheerio.load(html);
  const seenIds = new Set();
  return $('#frm_defaultList > div > table > tbody > tr')
    .map((_, row) => {
      const $row = $(row);
      const cells = $row.find('td');
      const titleAnchor = cells.eq(2).find('a.fc_gray').first();
      const artistAnchor = cells.eq(3).find('#artistName > a').first();
      const albumAnchor = cells.eq(4).find('a').first();
      const titleHref = titleAnchor.attr('href') || titleAnchor.attr('onclick') || '';
      const artistHref = artistAnchor.attr('href') || artistAnchor.attr('onclick') || '';
      let songId = extractSongId(titleHref) || extractSongId(artistHref);
      if (!songId) songId = extractSongId($row.html() || '');
      if (!songId || seenIds.has(songId)) {
        return null;
      }
      const title = titleAnchor.text().trim().replace(/\s+/g, ' ');
      const artist = artistAnchor.text().trim().replace(/\s+/g, ' ');
      const album = albumAnchor.text().trim().replace(/\s+/g, ' ');
      seenIds.add(songId);
      if (!title && !artist) return null;
      return { songId, title, artist, album };
    })
    .get()
    .filter(Boolean);
}

async function fetchLyricInfo(songId) {
  const searchParams = new URLSearchParams({ songId });
  const headers = await buildLyricHeaders(songId);
  try {
    const response = await axios.get(`${LYRIC_URL}?${searchParams.toString()}`, {
      timeout: HTTP_TIMEOUT_MS,
      headers
    });
    return response.data;
  } catch (error) {
    logger.error('Melon lyricInfo fetch failed', { error, songId });
    throw error;
  }
}

function toLyricStrings(lyricInfo) {
  if (!lyricInfo) return { plain: null, synced: null };
  if (typeof lyricInfo.lyric === 'string' && lyricInfo.lyric.trim()) {
    const plain = lyricInfo.lyric
      .replace(/<BR\s*\/?>/gi, '\n')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    return { plain: plain || null, synced: null };
  }
  if (!lyricInfo.lyricList) return { plain: null, synced: null };
  const list = lyricInfo.lyricList;
  const plain = list
    .map((item) => item.lyric || '')
    .filter(Boolean)
    .join('\n');
  return { plain: plain || null, synced: null };
}

export async function fetchMelonBySongId(songId, track = {}) {
  const normalizedSongId = songId?.toString().trim();
  if (!normalizedSongId) {
    return null;
  }

  const record = normalizeLyricRecord({
    provider: 'melon',
    id: normalizedSongId,
    trackName: track.title || null,
    artistName: track.artist || null,
    albumName: track.album || null,
    duration: null,
    plainLyrics: null,
    syncedLyrics: null,
    sourceUrl: `https://www.melon.com/song/detail.htm?songId=${normalizedSongId}`,
    confidence: 0.5,
    synced: false,
    status: 'ok',
    raw: {
      songId: normalizedSongId,
      title: track.title || null,
      artist: track.artist || null,
      album: track.album || null
    }
  });

  try {
    const lyricInfo = await fetchLyricInfo(normalizedSongId);
    const { plain, synced } = toLyricStrings(lyricInfo);
    record.plainLyrics = plain;
    record.syncedLyrics = synced;
    recomputeSyncFlags(record);
  } catch (error) {
    logger.error('Melon lyricInfo request failed', { error, songId: normalizedSongId });
  }

  return record;
}

export async function searchMelon(track) {
  const pageHtml = await fetchSearchPage(track);
  return parseSearchPage(pageHtml).map((record) =>
    normalizeLyricRecord({
      provider: 'melon',
      id: record.songId,
      trackName: record.title,
      artistName: record.artist,
      albumName: record.album,
      duration: null,
      plainLyrics: null,
      syncedLyrics: null,
      sourceUrl: `https://www.melon.com/song/detail.htm?songId=${record.songId}`,
      confidence: 0.5,
      synced: false,
      status: 'ok',
      raw: record
    })
  );
}

export async function fetchFromMelon(track) {
  const requestedSongId = track?.songId || track?.providerId || track?.ids?.songId;
  if (requestedSongId) {
    return fetchMelonBySongId(requestedSongId, track);
  }

  const candidates = await searchMelon(track);
  const primary = candidates[0];
  if (!primary) return null;
  return fetchMelonBySongId(primary.providerId, primary);
}
