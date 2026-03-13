import axios from 'axios';
import * as cheerio from 'cheerio';

import { normalizeLyricRecord } from '../provider-result-schema.js';
import { assertEnv, getEnvValue } from '../utils/config.js';
import { createLogger } from '../utils/logger.js';
import {
  getGeniusToken,
  invalidateGeniusToken,
  hasValidGeniusAuth
} from '../utils/tokens/genius-token-manager.js';

const BASE_API = 'https://api.genius.com';
const MOZILLA_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

const logger = createLogger('provider:genius');

async function ensureGeniusAuth() {
  const hasClientCredentials = Boolean(getEnvValue('GENIUS_CLIENT_ID') && getEnvValue('GENIUS_CLIENT_SECRET'));
  if (hasClientCredentials) {
    await getGeniusToken();
    return;
  }
  assertEnv(['GENIUS_ACCESS_TOKEN']);
}

function normalizeHit(hit, query) {
  const record = hit?.result;
  if (!record) return null;

  return normalizeLyricRecord({
    provider: 'genius',
    id: record.id,
    trackName: record.title,
    artistName: record.primary_artist?.name,
    albumName: null,
    duration: null,
    plainLyrics: null,
    syncedLyrics: null,
    sourceUrl: record.url,
    confidence: hit.score ?? 0,
    synced: false,
    status: 'ok',
    raw: record
  });
}

async function searchCatalog(query) {
  await ensureGeniusAuth();
  let token = await getGeniusToken();
  const attempt = async (bearer) => {
    const response = await axios.get(`${BASE_API}/search`, {
      params: { q: query },
      headers: {
        Authorization: `Bearer ${bearer}`,
        'User-Agent': MOZILLA_USER_AGENT
      }
    });
    return response.data;
  };

  try {
    const data = await attempt(token);
    return (data?.response?.hits ?? []).map((hit) => normalizeHit(hit, query)).filter(Boolean);
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      logger.warn('Genius token rejected, refreshing', { status: error.response.status });
      invalidateGeniusToken();
      token = await getGeniusToken({ forceRefresh: true });
      if (token) {
        try {
          const data = await attempt(token);
          return (data?.response?.hits ?? []).map((hit) => normalizeHit(hit, query)).filter(Boolean);
        } catch (retryError) {
          logger.error('Genius search retry failed', { error: retryError, query });
        }
      }
    }
    logger.error('Genius search request failed', { error, query });
    return [];
  }
}

export async function searchGenius(track) {
  const query = `${track.artist || ''} ${track.title || ''}`.trim();
  if (!query) {
    return [];
  }
  return searchCatalog(query);
}

export async function fetchFromGenius(track) {
  const candidates = await searchGenius(track);
  if (!candidates.length) {
    return null;
  }

  const primary = candidates[0];
  if (!primary?.sourceUrl) {
    return primary;
  }

  try {
    const scraped = await fetchLyricsForGeniusSong(primary.sourceUrl);
    if (scraped) {
      primary.plainLyrics = scraped;
    }
  } catch (error) {
    logger.warn('Genius lyric scrape failed', { error, url: primary?.sourceUrl });
  }

  return primary;
}

function normalizeNodeText($node) {
  const lines = [];
  const traverse = (node) => {
    if (!node) return;
    if (node.type === 'text') {
      const value = node.data?.replace(/\s+/g, ' ').trim();
      if (value) {
        lines.push(value);
      }
      return;
    }
    if (node.type === 'tag') {
      if (['br', 'p'].includes(node.name)) {
        lines.push('\n');
      }
      if (['a', 'span', 'strong', 'em', 'b', 'i', 'u'].includes(node.name)) {
        node.children?.forEach((child) => traverse(child));
        return;
      }
      node.children?.forEach((child) => traverse(child));
      if (node.name === 'p') {
        lines.push('\n');
      }
    }
  };

  traverse($node[0]);

  return lines
    .join(' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractFromNodes(nodes, $) {
  const blocks = [];
  nodes.forEach((element) => {
    const cleaned = $(element)
      .clone()
      .find('script,noscript,img,style,aside,.song_media_dropdown,.header_with_cover_art-primary_info')
      .remove()
      .end();

    const text = normalizeNodeText(cleaned);
    const stripped = stripSummaryText(text);

    if (stripped) {
      blocks.push(stripped);
    }
  });
  return blocks;
}

function stripSummaryText(text) {
  if (!text) return '';

  let cleaned = text
    .replace(/^\s*[\d,.]+\s+Contributors?/i, '')
    .replace(/^Produced by.+$/im, '')
    .replace(/^Written by.+$/im, '')
    .trim();

  let summaryDetected = false;
  if (/Lyrics/i.test(cleaned.slice(0, 80))) {
    cleaned = cleaned.replace(/^.{0,120}?Lyrics[:\s-]*/i, '').trim();
    summaryDetected = true;
  }

  const readMoreIndex = cleaned.toLowerCase().indexOf('read more');
  if (readMoreIndex !== -1) {
    cleaned = cleaned.slice(readMoreIndex + 'read more'.length).trim();
    summaryDetected = true;
  }

  if (summaryDetected) {
    const sectionMatch = cleaned.match(/\[[^\]]+\]/);
    if (sectionMatch && sectionMatch.index > 0) {
      cleaned = cleaned.slice(sectionMatch.index).trim();
    }
  }

  cleaned = cleaned.replace(/^“/, '').replace(/^"/, '').trim();

  return cleaned;
}

export async function fetchLyricsForGeniusSong(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': MOZILLA_USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://genius.com/',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin'
    }
  });

  const $ = cheerio.load(response.data);
  let blocks = extractFromNodes($('div[data-lyrics-container="true"]').toArray(), $);

  if (!blocks.length) {
    blocks = extractFromNodes($('div[class^="Lyrics__Container"]').toArray(), $);
  }

  if (!blocks.length) {
    const fallback = $('.lyrics').text().trim();
    if (fallback) {
      blocks.push(fallback);
    }
  }

  return blocks.join('\n\n');
}

export async function checkGeniusTokenReady() {
  return hasValidGeniusAuth();
}