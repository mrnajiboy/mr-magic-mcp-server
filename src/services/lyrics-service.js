import { runFind, runSearch } from '../core/find-service.js';
import { formatRecord } from '../core/formatting.js';
import { exportLyrics, deriveFormatSet } from '../core/export.js';

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

function buildCatalogResponse(findResult, requestedTrack = {}, options = {}) {
  const best = findResult?.best;
  if (!best) {
    return { error: 'No match found' };
  }

  const catalogOptions = {
    preferRomanized: options.preferRomanized ?? true,
    includeSynced: options.includeSynced ?? false,
    includeRomanizedSynced: options.includeRomanizedSynced ?? false
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

  const response = {
    track: trackSummary,
    provider: best.provider,
    providerId: best.providerId ?? null,
    sourceUrl: best.sourceUrl ?? null,
    songVideoTitle: formatSongVideoTitle(trackSummary.artist, trackSummary.title),
    lyrics,
    plainLyrics,
    romanizedPlainLyrics,
    syncedAvailable: Boolean(best.syncedLyrics)
  };

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