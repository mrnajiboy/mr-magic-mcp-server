import { runFind } from '../core/find-service.js';
import { formatRecord } from '../core/formatting.js';
import { exportLyrics, deriveFormatSet } from '../core/export.js';
import { slugify } from '../utils/slugify.js';
import { createStorageCache } from '../utils/storage-cache.js';

// ---------------------------------------------------------------------------
// In-memory catalog cache – populated by buildCatalogPayload so that
// push_catalog_to_airtable can retrieve lyrics server-side without requiring
// the LLM to relay the full lyric text through tool call arguments.
// ---------------------------------------------------------------------------
const MAX_CATALOG_CACHE_ENTRIES = 20;

class CatalogCache {
  constructor() {
    /** @type {Map<string, { plainLyrics: string, romanizedPlainLyrics: string|null, preferRomanized: boolean, cachedAt: number }>} */
    this._map = new Map();
    /** @type {string[]} insertion-order keys for LRU eviction */
    this._keys = [];
  }

  /**
   * Store a lyrics entry keyed by the track's artist+title slug.
   * @param {string} key
   * @param {{ plainLyrics: string, romanizedPlainLyrics: string|null, preferRomanized: boolean }} entry
   */
  set(key, entry) {
    if (this._map.has(key)) {
      // Refresh position
      this._keys = this._keys.filter((k) => k !== key);
    }
    this._map.set(key, { ...entry, cachedAt: Date.now() });
    this._keys.push(key);
    // Evict oldest when over capacity
    while (this._keys.length > MAX_CATALOG_CACHE_ENTRIES) {
      const oldest = this._keys.shift();
      this._map.delete(oldest);
    }
  }

  /** @param {string} key */
  get(key) {
    return this._map.get(key) ?? null;
  }

  /** List the most-recently-cached entry (useful when the LLM omits the key). */
  latest() {
    if (this._keys.length === 0) return null;
    const key = this._keys[this._keys.length - 1];
    return { key, ...this._map.get(key) };
  }

  /** Return all cached keys for diagnostics. */
  keys() {
    return [...this._keys];
  }
}

export const catalogCache = new CatalogCache();

/**
 * Derive a stable cache key from a resolved best track result or a raw title/artist pair.
 * @param {{ artist?: string, title?: string }} track
 * @returns {string}
 */
export function catalogCacheKey(track) {
  const artist = (track?.artist || '').toString().trim().toLowerCase();
  const title = (track?.title || '').toString().trim().toLowerCase();
  return `${slugify(artist)}-${slugify(title)}` || 'unknown';
}

export function buildActionContext(options = {}) {
  const defaultFormats = ['plain', 'srt'];
  const requestedFormats = options.formats ?? options.format ?? [];
  const baseExportDir = options.exportDir || process.env.MR_MAGIC_EXPORT_DIR;
  return {
    includeRomanization: !options.noRomanize,
    includeSynced: options.includeSynced ?? true,
    shouldExport: Boolean(options.export),
    outputDir: options.output || baseExportDir,
    formats: deriveFormatSet(
      Array.isArray(requestedFormats) && requestedFormats.length > 0
        ? requestedFormats
        : defaultFormats
    )
  };
}

export async function executeFind(track, options = {}) {
  return runFind(track, options);
}

export async function buildCatalogPayload(track, actionOptions = {}) {
  const result = await executeFind(track, actionOptions);
  return buildCatalogResponse(result, track, actionOptions);
}

export async function exportBestResult(result, context) {
  if (!context.shouldExport || !result?.best) return null;
  return exportLyrics(result.best, {
    formats: context.formats,
    output: context.outputDir,
    includeRomanization: context.includeRomanization
  });
}

export async function buildPayloadFromResult(result, context) {
  const payload = { ...result };
  if (result?.best) {
    payload.formatted = formatRecord(result.best, {
      includeRomanization: context.includeRomanization,
      includeSynced: context.includeSynced
    });
    if (context.shouldExport) {
      payload.exports = await exportBestResult(result, context);
    }
  }
  return payload;
}

const getLyricPayloadStorage = createStorageCache();
const DEFAULT_INLINE_PAYLOAD_MAX_CHARS = Number(
  process.env.MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS || 1500
);

async function buildCatalogResponse(findResult, requestedTrack = {}, options = {}) {
  const best = findResult?.best;
  if (!best) {
    return { error: 'No match found' };
  }

  const catalogOptions = {
    preferRomanized: options.preferRomanized ?? true,
    includeSynced: options.includeSynced ?? false,
    includeRomanizedSynced: options.includeRomanizedSynced ?? false,
    lyricsPayloadMode: normalizeLyricsPayloadMode(options.lyricsPayloadMode),
    omitInlineLyrics: options.omitInlineLyrics ?? false,
    lyricsPayloadOutput: options.lyricsPayloadOutput,
    airtableSafePayload: options.airtableSafePayload ?? false
  };

  const formatted = formatRecord(best, {
    includeRomanization: true,
    includeSynced: catalogOptions.includeSynced
  });

  const trackSummary = {
    title: best.title || requestedTrack.title || '',
    artist: best.artist || requestedTrack.artist || '',
    album: best.album || requestedTrack.album || null
  };

  const plainLyrics = formatted.plainLyrics || best.plainLyrics || '';
  const romanizedPlainLyrics = formatted.romanizedPlain || null;
  const lyrics =
    catalogOptions.preferRomanized && romanizedPlainLyrics ? romanizedPlainLyrics : plainLyrics;

  // Populate the in-memory catalog cache so push_catalog_to_airtable can
  // retrieve lyrics server-side without the LLM relaying the full text.
  let lyricsCacheKey = null;
  if (plainLyrics) {
    lyricsCacheKey = catalogCacheKey(trackSummary);
    catalogCache.set(lyricsCacheKey, {
      plainLyrics,
      romanizedPlainLyrics,
      preferRomanized: catalogOptions.preferRomanized
    });
  }

  const shouldForceCompactPayload =
    catalogOptions.omitInlineLyrics &&
    (catalogOptions.airtableSafePayload || lyrics.length > DEFAULT_INLINE_PAYLOAD_MAX_CHARS);

  const shouldIncludeInlineLyrics = !catalogOptions.omitInlineLyrics;

  const response = {
    track: trackSummary,
    provider: best.provider,
    providerId: best.providerId ?? null,
    sourceUrl: best.sourceUrl ?? null,
    songVideoTitle: formatSongVideoTitle(trackSummary.artist, trackSummary.title),
    syncedAvailable: Boolean(best.syncedLyrics),
    // Returned so the LLM can pass it straight back to push_catalog_to_airtable
    // without ever touching the lyric text itself.
    lyricsCacheKey: lyricsCacheKey
  };

  if (shouldIncludeInlineLyrics) {
    response.lyrics = lyrics;
    response.plainLyrics = plainLyrics;
    response.romanizedPlainLyrics = romanizedPlainLyrics;
  }

  if (!shouldIncludeInlineLyrics) {
    response.lyricsPreview = buildLyricsPreview(lyrics);
  }

  if (shouldIncludePayloadBundle(catalogOptions.lyricsPayloadMode) && plainLyrics) {
    response.lyricsPayload = await buildLyricsPayloadBundle({
      lyrics,
      trackSummary,
      preferRomanized: catalogOptions.preferRomanized && Boolean(romanizedPlainLyrics),
      outputDir: catalogOptions.lyricsPayloadOutput,
      transport: catalogOptions.lyricsPayloadMode === 'reference' ? 'reference' : 'inline',
      includeAirtableSafe: catalogOptions.airtableSafePayload,
      forceCompactPayload: shouldForceCompactPayload
    });
  }

  if (catalogOptions.includeSynced && formatted.syncedLyrics) {
    response.syncedLyrics = formatted.syncedLyrics;
    if (catalogOptions.includeRomanizedSynced && formatted.romanizedSrt) {
      response.romanizedSrtLyrics = formatted.romanizedSrt;
    }
    if (catalogOptions.includeRomanizedSynced && formatted.romanizedLrc) {
      response.romanizedLrcLyrics = formatted.romanizedLrc;
    }
  }

  return response;
}

function normalizeLyricsPayloadMode(mode) {
  const allowed = new Set(['inline', 'payload', 'reference']);
  if (typeof mode !== 'string') {
    return 'inline';
  }
  const normalized = mode.toLowerCase();
  return allowed.has(normalized) ? normalized : 'inline';
}

function shouldIncludePayloadBundle(mode) {
  return mode === 'payload' || mode === 'reference';
}

function buildLyricsPreview(value, length = 160) {
  if (!value) return null;
  const snippet = value.replace(/\s+/g, ' ').trim();
  if (snippet.length <= length) {
    return snippet;
  }
  return `${snippet.slice(0, length)}…`;
}

function buildLyricsBaseName(trackSummary = {}) {
  const artist = (trackSummary.artist || 'unknown').toString().toLowerCase();
  const title = (trackSummary.title || 'song').toString().toLowerCase();
  return `${slugify(artist)}-${slugify(title)}` || 'lyrics';
}

function countLines(value) {
  if (!value) return 0;
  return value.split(/\r?\n/).length;
}

async function buildLyricsPayloadBundle({
  lyrics,
  trackSummary,
  preferRomanized,
  outputDir,
  transport,
  includeAirtableSafe,
  forceCompactPayload
}) {
  if (!lyrics) return null;
  const shouldPromoteToReference = transport === 'inline' && forceCompactPayload;
  const effectiveTransport = shouldPromoteToReference ? 'reference' : transport;
  const payload = {
    transport: effectiveTransport,
    encoding: 'utf-8',
    contentType: 'text/plain',
    preferredVariant: preferRomanized ? 'romanizedPlainLyrics' : 'plainLyrics',
    length: lyrics.length,
    lineCount: countLines(lyrics)
  };

  if (shouldPromoteToReference) {
    payload.transportRequested = transport;
    payload.compact = true;
  }

  if (effectiveTransport === 'inline') {
    payload.content = lyrics;
    payload.preview = buildLyricsPreview(lyrics);
    if (includeAirtableSafe) {
      payload.airtableEscapedContent = buildAirtableEscapedContent(lyrics);
    }
    return payload;
  }

  try {
    const storage = await getLyricPayloadStorage(outputDir);
    const baseName = buildLyricsBaseName(trackSummary);
    const stored = await storage.store({ content: lyrics, extension: 'txt', baseName });

    if (!stored?.filePath && !stored?.url) {
      payload.transport = 'inline';
      payload.content = lyrics;
      payload.preview = buildLyricsPreview(lyrics);
      payload.reference = {
        filePath: null,
        url: null,
        expiresAt: null,
        skipped: stored?.skipped ?? true
      };
      payload.referenceError =
        'Reference storage backend did not provide a file path or URL; reverted to inline payload.';
      if (includeAirtableSafe) {
        payload.airtableEscapedContent = buildAirtableEscapedContent(lyrics);
      }
      return payload;
    }

    payload.reference = {
      filePath: stored.filePath ?? null,
      url: stored.url ?? null,
      expiresAt: stored.expiresAt ?? null,
      skipped: stored.skipped ?? false
    };
    if (includeAirtableSafe) {
      payload.airtableEscapedContent = buildAirtableEscapedContent(lyrics);
    }
    return payload;
  } catch (error) {
    payload.transport = 'inline';
    payload.content = lyrics;
    payload.preview = buildLyricsPreview(lyrics);
    payload.referenceError = error.message;
    if (includeAirtableSafe) {
      payload.airtableEscapedContent = buildAirtableEscapedContent(lyrics);
    }
    return payload;
  }
}

function buildAirtableEscapedContent(value) {
  if (!value) return '';
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized.slice(1, -1) : value;
  } catch (error) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\f/g, '\\f')
      .replace(/\b/g, '\\b')
      .replace(/\"/g, '\\\"');
  }
}

function formatSongVideoTitle(artistValue, titleValue) {
  const artist = normalizeArtistValue(artistValue) || 'Unknown Artist';
  const title = (titleValue || '').toString().trim() || 'Unknown Title';
  return `${artist} - ${title} (Lyrics)`;
}

function normalizeArtistValue(artistValue) {
  if (Array.isArray(artistValue)) {
    return artistValue
      .map((entry) => (entry || '').toString().trim())
      .filter(Boolean)
      .join(', ');
  }
  if (typeof artistValue === 'string') {
    return artistValue.trim();
  }
  return '';
}

export { formatRecord };
