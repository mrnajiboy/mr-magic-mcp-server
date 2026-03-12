#!/usr/bin/env node
import 'dotenv/config';
import process from 'node:process';

import { Command } from 'commander';

import { getProviderStatus } from '../index.js';
import { extractPlainPreview, extractSyncedPreview } from '../core/preview.js';
import {
  runFind,
  runSearch,
  runProviderSearch,
  buildChooserEntries,
  pickIndex,
  autoPick
} from '../core/find-service.js';
import { buildActionContext, buildPayloadFromResult } from '../services/lyrics-service.js';
import { fetchFromMelon } from '../providers/melon.js';
import { fetchFromGenius } from '../providers/genius.js';

async function hydrateSearchResult(provider, result, cache) {
  if (result.plainLyrics || result.syncedLyrics) {
    return result;
  }
  const cacheKey = `${provider}:${result.providerId || result.sourceUrl || result.title}:${result.artist}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }
  let hydratedResult = result;
  try {
    if (provider === 'melon') {
      const hydrated = await fetchFromMelon({
        title: result.title,
        artist: result.artist
      });
      if (hydrated?.plainLyrics) {
        hydratedResult = { ...result, plainLyrics: hydrated.plainLyrics };
      }
    } else if (provider === 'genius') {
      const hydrated = await fetchFromGenius({
        title: result.title,
        artist: result.artist
      });
      if (hydrated?.plainLyrics) {
        hydratedResult = { ...result, plainLyrics: hydrated.plainLyrics };
      }
    }
  } catch (error) {
    // best-effort hydration; swallow errors to keep search fast
  }
  cache.set(cacheKey, hydratedResult);
  return hydratedResult;
}

function resultHasLyrics(record) {
  if (!record) return false;
  return Boolean(record.plainLyrics && record.plainLyrics.trim());
}

function buildTrackFromOptions(options) {
  const duration = options.duration ? Number(options.duration) : undefined;
  return {
    title: options.title,
    artist: options.artist,
    album: options.album,
    duration: Number.isFinite(duration) ? duration : undefined
  };
}

const program = new Command();
program
  .name('mr-magic-mcp-server')
  .description('Lyrics MCP server CLI powered by LRCLIB, Genius, Musixmatch, and Melon')
  .version('1.0.0');

function normalizeFormatOptions(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

async function buildServerPayload(result, actionOptions) {
  const context = buildActionContext({
    ...actionOptions,
    formats: normalizeFormatOptions(actionOptions?.formats ?? actionOptions?.format)
  });
  return buildPayloadFromResult(result, context);
}

program
  .command('server')
  .description('Start a JSON API server for local automation')
  .option('--host <host>', 'Host to bind', '127.0.0.1')
  .option('--port <port>', 'Port to listen on', '3333')
  .option('--remote', 'Allow remote (0.0.0.0) binding for container/server deployments', false)
  .action(async (options) => {
    const { startHttpServer } = await import('../transport/http-server.js');
    await startHttpServer(options);
  });

program
  .command('status')
  .description('Show provider readiness')
  .action(() => {
    console.table(getProviderStatus());
  });

const DEFAULT_FORMATS = ['plain', 'srt'];

const COLORS = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  bright: '\u001b[1m',
  cyan: '\u001b[36m',
  magenta: '\u001b[35m',
  yellow: '\u001b[33m',
  green: '\u001b[32m',
  red: '\u001b[31m'
};

function colorize(text, color) {
  if (!color) return String(text ?? '');
  return `${color}${text}${COLORS.reset}`;
}

const COLUMN_LAYOUT = {
  index: { width: 4 },
  provider: { width: 12 },
  synced: { width: 7 },
  artist: { min: 14, max: 18 },
  title: { min: 14, max: 18 },
  plainPreview: { min: 18, max: 22 },
  syncedPreview: { min: 16, max: 22 }
};

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

function stripAnsi(value) {
  return value.replace(ANSI_REGEX, '');
}

function visibleWidth(value) {
  if (!value) return 0;
  const stripped = stripAnsi(String(value));
  return [...stripped].reduce((sum, char) => {
    const code = char.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      return sum + 2;
    }
    return sum + 1;
  }, 0);
}

function truncate(value, width) {
  if (width <= 0) return '';
  const str = String(value ?? '');
  if (visibleWidth(str) <= width) return str;
  if (width === 1) return '…';
  let acc = '';
  let remaining = width - 1;
  for (const char of str) {
    const charWidth = visibleWidth(char);
    if (charWidth > remaining) break;
    acc += char;
    remaining -= charWidth;
  }
  return `${acc}…`;
}

function padAnsi(value, width) {
  const visible = visibleWidth(value);
  if (visible >= width) {
    return value;
  }
  return value + ' '.repeat(width - visible);
}

function computeColumnWidths(columns) {
  const totalColumns = process.stdout.columns || 120;
  const separatorWidth = (columns.length - 1) * 5;
  let fixedTotal = 0;
  const flexible = [];

  columns.forEach((col) => {
    const layout = COLUMN_LAYOUT[col.key] || { width: 12 };
    if (layout.width) {
      fixedTotal += layout.width;
    } else {
      flexible.push({ key: col.key, ...layout });
    }
  });

  let remaining = totalColumns - separatorWidth - fixedTotal;
  const minSum = flexible.reduce((sum, col) => sum + col.min, 0);
  const maxSum = flexible.reduce((sum, col) => sum + col.max, 0);

  if (remaining < minSum) remaining = minSum;
  if (remaining > maxSum) remaining = maxSum;

  let leftover = remaining - minSum;
  const widths = {};

  columns.forEach((col) => {
    const layout = COLUMN_LAYOUT[col.key] || { width: 12 };
    if (layout.width) {
      widths[col.key] = layout.width;
    }
  });

  flexible.forEach((col) => {
    const grow = Math.min(col.max - col.min, Math.max(0, leftover));
    widths[col.key] = col.min + grow;
    leftover -= grow;
  });

  return widths;
}

function renderTable(rows, columns) {
  if (!rows || rows.length === 0) {
    console.log('(no data)');
    return;
  }

  const columnWidths = computeColumnWidths(columns);

  const header = columns
    .map((col) => {
      const width = columnWidths[col.key] || 12;
      const label = truncate(col.header, width);
      return padAnsi(colorize(label, COLORS.bright), width);
    })
    .join('  |  ');

  console.log(header);

  const separator = columns
    .map((col) => {
      const width = columnWidths[col.key] || 12;
      const dashLength = Math.max(3, Math.floor(width * 0.6));
      const padding = Math.max(0, width - dashLength);
      const leftPad = ' '.repeat(Math.floor(padding / 2));
      const rightPad = ' '.repeat(Math.ceil(padding / 2));
      return `${leftPad}${'─'.repeat(dashLength)}${rightPad}`;
    })
    .join('  |  ');
  console.log(colorize(separator, COLORS.dim));

  rows.forEach((row) => {
    const values = columns.map((col) => {
      const width = columnWidths[col.key] || 12;
      const cell = row[col.key];
      const plainValue = cell == null ? '' : String(cell);
      const truncated = truncate(plainValue, width);
      if (col.formatter) {
        const colored = col.formatter(truncated, row, cell);
        return padAnsi(colored, width);
      }
      return padAnsi(truncated, width);
    });
    console.log(values.join('  |  '));
  });
}

program
  .command('search')
  .description('Search across providers for matches')
  .requiredOption('--artist <name>', 'Artist name')
  .requiredOption('--title <name>', 'Song title')
  .option('--album <name>', 'Album name')
  .option('--duration <ms>', 'Track duration in milliseconds')
  .option('--provider <name>', 'Restrict to a specific provider')
  .option('--show-all', 'Print all matches, even when picking automatically', false)
  .option('--pick <provider>', 'Auto-pick a provider and show details')
  .option('--export', 'Write lyrics to disk using the selected formats', false)
  .option('--format <format>', 'Export format (plain|lrc|srt). repeatable', (value, acc) => {
    acc.push(value);
    return acc;
  }, [])
  .option('--output <dir>', 'Directory to write exports (requires --export)', 'exports')
  .option('--no-romanize', 'Disable romanized lyrics', false)
  .action(async (options) => {
    const track = buildTrackFromOptions(options);
    const queries = await runSearch(track);
    const filtered = options.provider
      ? queries.filter((entry) => entry.provider === options.provider)
      : queries;

    const providersNeedingHydration = new Set(['melon', 'genius']);
    const HYDRATION_REQUEST_CAP = 25;

    const hydrationCache = new Map();
    const enriched = await Promise.all(
      filtered.map(async (entry) => {
        if (!providersNeedingHydration.has(entry.provider)) {
          return entry;
        }
        const hydratedResults = [];
        let hydrationRequests = 0;
        for (const result of entry.results) {
          if (!resultHasLyrics(result) && hydrationRequests < HYDRATION_REQUEST_CAP) {
            hydrationRequests += 1;
            hydratedResults.push(await hydrateSearchResult(entry.provider, result, hydrationCache));
          } else {
            hydratedResults.push(result);
          }
        }
        return { ...entry, results: hydratedResults };
      })
    );

    let globalIndex = 1;
    const table = enriched.flatMap((entry) =>
      entry.results.map((result) => ({
        index: globalIndex++,
        provider: entry.provider,
        synced: result.synced,
        syncedRaw: result.synced,
        title: result.title,
        artist: result.artist,
        plainPreview: extractPlainPreview(result),
        syncedPreview: extractSyncedPreview(result),
        rawResult: result
      }))
    );

    if (table.length === 0) {
      console.log('No matches found');
      return;
    }
    renderTable(table, [
      { key: 'index', header: '#', formatter: (value) => colorize(value, COLORS.cyan) },
      { key: 'provider', header: 'Provider', formatter: (value) => colorize(value, COLORS.magenta) },
      {
        key: 'synced',
        header: 'Synced',
        formatter: (value, row) =>
          colorize(String(Boolean(row.syncedRaw)), row.syncedRaw ? COLORS.green : COLORS.yellow)
      },
      { key: 'artist', header: 'Artist', formatter: (value) => colorize(value, COLORS.cyan) },
      { key: 'title', header: 'Title', formatter: (value) => colorize(value, COLORS.cyan) },
      { key: 'plainPreview', header: 'Plain Preview', formatter: (value) => colorize(value, COLORS.green) },
      { key: 'syncedPreview', header: 'Synced Preview', formatter: (value) => colorize(value, COLORS.yellow) }
    ]);

    if (!options.pick) {
      return;
    }

    const pickProvider = options.pick;
    const match = enriched
      .flatMap((entry) => entry.results.map((result) => ({ provider: entry.provider, result })))
      .find((entry) => entry.provider === pickProvider);

    if (!match) {
      console.error('No match for provider', pickProvider);
      process.exitCode = 1;
      return;
    }

    let resolvedRecord = match.result;
    if (!resultHasLyrics(resolvedRecord)) {
      const fetched = await runFind(track, { providerNames: [pickProvider] });
      if (fetched.best) {
        resolvedRecord = fetched.best;
      }
    }

    if (!resultHasLyrics(resolvedRecord)) {
      console.error('Unable to retrieve lyrics for provider', pickProvider);
      process.exitCode = 1;
      return;
    }

    const includeRomanization = options.noRomanize ? false : true;
    const shouldExport = Boolean(options.export);
    const formatSet = shouldExport ? deriveFormatSet(options.format) : [];
    const formatted = formatRecord(resolvedRecord, {
      includeRomanization,
      includeSynced: true
    });

    console.log(JSON.stringify(formatted, null, 2));

    if (shouldExport) {
      const exports = await exportLyrics(resolvedRecord, {
        formats: formatSet,
        output: options.output,
        includeRomanization
      });
      console.log('Exports:', exports);
    }
  });

program
  .command('find')
  .description('Find lyrics, preferring synced results')
  .requiredOption('--artist <name>', 'Artist name')
  .requiredOption('--title <name>', 'Song title')
  .option('--album <name>', 'Album name')
  .option('--duration <ms>', 'Track duration in milliseconds')
  .option('--providers <list>', 'Comma-separated provider list')
  .option('--synced-only', 'Require synced lyrics', false)
  .option('--choose', 'List available matches before downloading', false)
  .option('--index <number>', 'Pick a match (1-based index) from the chooser list')
  .option('--export', 'Write lyrics to disk using the selected formats', false)
  .option('--format <format>', 'Export format (plain|lrc|srt). repeatable', (value, acc) => {
    acc.push(value);
    return acc;
  }, [])
  .option('--output <dir>', 'Directory for exports (requires --export)', 'exports')
  .option('--no-romanize', 'Disable romanized lyrics', false)
  .action(async (options) => {
    const track = buildTrackFromOptions(options);
    const providerNames = options.providers
      ? options.providers.split(',').map((value) => value.trim())
      : [];
    const includeRomanization = options.noRomanize ? false : true;
    const shouldExport = Boolean(options.export);
    const formatSet = shouldExport ? deriveFormatSet(options.format) : [];
    const lrclibOnly = providerNames.length === 1 && providerNames[0].toLowerCase() === 'lrclib';

    let resolvedRecord = null;
    let totalResults = 0;
    let chooserEntries = [];

    const renderChooserTable = () => {
      const rows = chooserEntries.map((entry) => ({
        index: String(entry.index),
        provider: entry.provider,
        synced: Boolean(entry.result?.synced),
        syncedLabel: entry.result?.synced ? 'synced' : 'plain',
        artist: entry.result?.artist || 'unknown',
        title: entry.result?.title || 'song',
        plainPreview: extractPlainPreview(entry.result) || '(none)',
        syncedPreview: entry.result?.synced ? extractSyncedPreview(entry.result) : ''
      }));
      renderTable(rows, [
        { key: 'index', header: '#', formatter: (value) => colorize(value, COLORS.cyan) },
        { key: 'provider', header: 'Provider', formatter: (value) => colorize(value, COLORS.magenta) },
        {
          key: 'syncedLabel',
          header: 'Synced',
          formatter: (value, row) =>
            colorize(value, row.synced ? COLORS.green : COLORS.yellow)
        },
        { key: 'artist', header: 'Artist', formatter: (value) => colorize(value, COLORS.cyan) },
        { key: 'title', header: 'Title', formatter: (value) => colorize(value, COLORS.cyan) },
        { key: 'plainPreview', header: 'Plain Preview', formatter: (value) => colorize(value, COLORS.green) },
        { key: 'syncedPreview', header: 'Synced Preview', formatter: (value) => colorize(value, COLORS.yellow) }
      ]);
    };

    if (lrclibOnly) {
      const lrclibResults = await runProviderSearch('lrclib', track);
      chooserEntries = buildChooserEntries(
        lrclibResults.map((result) => ({ provider: 'lrclib', result }))
      );
      totalResults = chooserEntries.length;
      if (totalResults === 0) {
        console.log('No LRCLIB matches found');
        return;
      }

      if (options.choose) {
        renderChooserTable();
        if (!options.index) {
          console.log('Use --index <number> to download a specific LRCLIB result.');
          return;
        }
      }

      try {
        resolvedRecord = options.index ? pickIndex(chooserEntries, options.index) : autoPick(chooserEntries, true);
      } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
        return;
      }
    } else {
      const result = await runFind(track, {
        providerNames,
        syncedOnly: options.syncedOnly
      });
      chooserEntries = buildChooserEntries(Array.isArray(result.matches) ? result.matches : []);
      totalResults = chooserEntries.length;

      if ((options.choose || options.index) && totalResults === 0) {
        console.log('No matches found');
        return;
      }

      if (options.choose && totalResults > 0) {
        renderChooserTable();
        if (!options.index) {
          console.log('Use --index <number> to download a specific result.');
          return;
        }
      }

      if (options.index) {
        try {
          resolvedRecord = pickIndex(chooserEntries, options.index);
        } catch (error) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
      } else {
        resolvedRecord = result.best ?? null;
      }
    }

    console.log('Matches found:', totalResults);

    if (!resolvedRecord) {
      console.log('No best match available');
      return;
    }

    console.log(
      `Picked Lyrics: ${resolvedRecord.provider || 'unknown'} | ${resolvedRecord.synced ? 'synced' : 'plain'} | ${resolvedRecord.artist || 'unknown'} - ${resolvedRecord.title || 'song'}`
    );

    const formatted = formatRecord(resolvedRecord, {
      includeRomanization,
      includeSynced: true
    });
    console.log(JSON.stringify(formatted, null, 2));

    if (shouldExport) {
      const exports = await exportLyrics(resolvedRecord, {
        formats: formatSet,
        output: options.output,
        includeRomanization
      });
      console.log('Exports:', exports);
    }
  });

program
  .command('search-provider')
  .description('Search a specific provider only')
  .requiredOption('--provider <name>', 'Provider name')
  .requiredOption('--artist <name>', 'Artist name')
  .requiredOption('--title <name>', 'Song title')
  .action(async (options) => {
    const track = buildTrackFromOptions(options);
    const results = await runProviderSearch(options.provider, track);
    console.table(
      results.map((record) => ({
        providerId: record.providerId,
        title: record.title,
        artist: record.artist,
        synced: record.synced
      }))
    );
  });

program
  .command('select')
  .description('Select the first match from a provider list (useful for scripting)')
  .requiredOption('--providers <list>', 'Comma-separated provider names in priority order')
  .requiredOption('--artist <name>', 'Artist name')
  .requiredOption('--title <name>', 'Song title')
  .option('--require-synced', 'Only return synced lyrics', false)
  .action(async (options) => {
    const track = buildTrackFromOptions(options);
    const providerNames = options.providers.split(',').map((value) => value.trim());
    const result = await runFind(track, { providerNames });
    const match = result.matches.find((entry) =>
      providerNames.includes(entry.provider) && (!options.requireSynced || entry.result.synced)
    );
    if (!match) {
      console.log('No match satisfying selection criteria');
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(match.result, null, 2));
  });

program.parseAsync(process.argv);