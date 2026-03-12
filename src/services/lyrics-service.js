import { runFind, runSearch } from '../core/find-service.js';
import { formatRecord } from '../core/formatting.js';
import { exportLyrics, deriveFormatSet } from '../core/export.js';

export function buildActionContext(options = {}) {
  const defaultFormats = ['plain', 'srt'];
  const requestedFormats = options.formats ?? options.format ?? [];
  return {
    includeRomanization: options.noRomanize ? false : true,
    includeSynced: options.includeSynced ?? true,
    shouldExport: Boolean(options.export),
    outputDir: options.output || 'exports',
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

export { formatRecord };