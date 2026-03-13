import { runFind, runSearch } from '../core/find-service.js';
import { formatRecord } from '../core/formatting.js';
import { exportLyrics, deriveFormatSet } from '../core/export.js';
import { createExportStorage } from '../utils/export-storage.js';

export function buildActionContext(options = {}) {
  const defaultFormats = ['plain', 'srt'];
  const requestedFormats = options.formats ?? options.format ?? [];
  const baseExportDir = options.exportDir || process.env.MR_MAGIC_EXPORT_DIR;
  return {
    includeRomanization: options.noRomanize ? false : true,
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

export async function executeSearch(track) {
  return runSearch(track);
}

export async function buildFindResponse(track, actionOptions = {}) {
  const result = await executeFind(track, actionOptions);
  const context = buildActionContext(actionOptions);
  return buildPayloadFromResult(result, context);
}

export async function buildSearchResponse(track) {
  return executeSearch(track);
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

const lyricPayloadStorageCache = new Map();

async function getLyricPayloadStorage(outputDir) {
  const key = outputDir || '__default__';
  if (!lyricPayloadStorageCache.has(key)) {
    const storage = await createExportStorage({
      local: { baseDir: outputDir },
      redis: {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        ttl: process.env.MR_MAGIC_EXPORT_TTL_SECONDS
      }
    });
    lyricPayloadStorageCache.set(key, storage);
  }
  return lyricPayloadStorageCache.get(key);
}

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

  const shouldIncludeInlineLyrics = !catalogOptions.omitInlineLyrics;

  const response = {
    track: trackSummary,
    provider: best.provider,
    providerId: best.providerId ?? null,
    sourceUrl: best.sourceUrl ?? null,
    songVideoTitle: formatSongVideoTitle(trackSummary.artist, trackSummary.title),
    syncedAvailable: Boolean(best.syncedLyrics)
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
      includeAirtableSafe: catalogOptions.airtableSafePayload
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

function slugify(value) {
  return (
    value
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'value'
  );
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
  includeAirtableSafe
}) {
  if (!lyrics) return null;
  const payload = {
    transport,
    encoding: 'utf-8',
    contentType: 'text/plain',
    preferredVariant: preferRomanized ? 'romanizedPlainLyrics' : 'plainLyrics',
    length: lyrics.length,
    lineCount: countLines(lyrics)
  };

  if (transport === 'inline') {
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
    return value;
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