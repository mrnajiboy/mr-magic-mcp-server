import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { runFind, runSearch, runProviderSearch } from '../core/find-service.js';
import {
  buildActionContext,
  buildPayloadFromResult,
  buildCatalogPayload,
  exportBestResult,
  formatRecord,
  catalogCache
} from '../services/lyrics-service.js';
import { pushCatalogToAirtable } from '../services/airtable-writer.js';
import { getProviderStatus } from '../index.js';

const trackSchema = {
  type: 'object',
  description: 'Metadata about the song to search for.',
  properties: {
    title: { type: 'string', description: 'Song title as it appears on the release.' },
    artist: { type: 'string', description: 'Primary artist or performer name.' },
    album: { type: 'string', description: 'Album or release name (optional).' },
    duration: {
      type: 'string',
      description: 'Track length as seconds or MM:SS string (optional).'
    }
  },
  additionalProperties: false
};

const exportOptionsSchema = {
  type: 'object',
  description: 'Controls which lyric formats get written to disk.',
  properties: {
    formats: {
      type: 'array',
      description: 'One or more export formats to create (plain, lrc, srt).',
      items: { type: 'string', enum: ['plain', 'lrc', 'srt'] }
    },
    output: { type: 'string', description: 'Directory path or filename prefix for exports.' },
    noRomanize: {
      type: 'boolean',
      description: 'When true, skip romanized lyrics even if available.'
    }
  },
  additionalProperties: false
};

const catalogOptionsSchema = {
  type: 'object',
  description: 'Catalog response preferences.',
  properties: {
    preferRomanized: {
      type: 'boolean',
      description: 'When true, prefer romanized plain lyrics for lyrics field.'
    },
    includeSynced: {
      type: 'boolean',
      description: 'Optionally include synced lyrics in the response.'
    },
    includeRomanizedSynced: {
      type: 'boolean',
      description: 'Include romanized synced lyrics (SRT/LRC) when available.'
    },
    omitInlineLyrics: {
      type: 'boolean',
      description:
        'When true, omit the raw lyrics fields (lyrics/plainLyrics/romanizedPlainLyrics).'
    },
    lyricsPayloadMode: {
      type: 'string',
      enum: ['inline', 'payload', 'reference'],
      description:
        "Controls how lyric text is handed off: 'inline' (default) keeps current behavior, 'payload' returns a structured payload bundle (and may auto-promote to reference for Airtable-safe compact mode), and 'reference' stores the payload via the configured export backend."
    },
    lyricsPayloadOutput: {
      type: 'string',
      description:
        'Optional output directory override used when lyricsPayloadMode is reference and the storage backend writes to disk.'
    },
    airtableSafePayload: {
      type: 'boolean',
      description:
        'When true, include an Airtable-safe escaped lyric string alongside the structured payload. With omitInlineLyrics + payload mode, this also prefers compact/reference-style payloads for long text safety.'
    }
  },
  additionalProperties: false
};

const formatOptionsSchema = {
  type: 'object',
  description: 'Options that tweak the formatted response.',
  properties: {
    includeSynced: {
      type: 'boolean',
      description: 'Include synced/timestamped lyrics when available (default true).'
    },
    noRomanize: {
      type: 'boolean',
      description: 'Set to true to omit romanized text from the formatted output.'
    }
  },
  additionalProperties: false
};

const selectCriteriaSchema = {
  type: 'object',
  description: 'Filters used to pick a single result from a matches array.',
  properties: {
    provider: { type: 'string', description: 'Limit selection to this provider slug.' },
    requireSynced: {
      type: 'boolean',
      description: 'When true, only consider matches that contain synced lyrics.'
    },
    index: {
      type: 'number',
      description: 'Zero-based index inside the filtered list (default 0).'
    }
  },
  additionalProperties: false
};

const normalizedLyricRecordSchema = {
  type: 'object',
  description: 'Normalized lyric record as returned by a provider search.',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    providerId: { type: 'string', description: 'Provider-specific identifier if available.' },
    title: { type: 'string', description: 'Track title from the provider result.' },
    artist: { type: 'string', description: 'Artist name from the provider result.' },
    album: { type: 'string', description: 'Album name if provided.' },
    duration: {
      type: 'string',
      description: 'Duration (seconds) if reported.'
    },
    plainLyrics: { type: 'string', description: 'Plain lyric text if hydrated.' },
    syncedLyrics: { type: 'string', description: 'Synced lyric text if hydrated.' },
    sourceUrl: { type: 'string', description: 'Canonical URL to view the lyrics.' },
    confidence: {
      type: 'number',
      description: 'Confidence score for the match (0-1 scale when available).'
    },
    synced: { type: 'boolean', description: 'True if synced lyrics exist for this result.' },
    plainOnly: {
      type: 'boolean',
      description: 'True when only plain lyrics are available (no timestamps).'
    },
    timestampCount: {
      type: ['number', 'null'],
      description: 'Number of timestamped lines detected in synced lyrics.'
    },
    status: { type: ['string', 'null'], description: 'Provider-specific status for the record.' },
    rawRecord: {
      type: ['object', 'null'],
      description: 'Unmodified provider payload for debugging/reference.'
    }
  },
  additionalProperties: false
};

const matchSchema = {
  type: 'object',
  description: 'A single search result entry (provider + normalized lyric record).',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    result: normalizedLyricRecordSchema
  },
  additionalProperties: false
};

export const mcpToolDefinitions = [
  {
    name: 'find_lyrics',
    description: 'Find the best lyric match across providers (prefers synced when available).',
    inputSchema: {
      type: 'object',
      description: 'Provide a track description (and optional hints) to look up lyrics.',
      properties: {
        track: trackSchema,
        options: {
          type: 'object',
          description: 'Optional provider hints or overrides.',
          additionalProperties: false
        }
      },
      required: ['track']
    }
  },
  {
    name: 'build_catalog_payload',
    description:
      'Return a compact payload suitable for Airtable inserts/exports. For large lyrics, send object args and use omitInlineLyrics + lyricsPayloadMode to avoid JSON truncation in downstream automations. Airtable-safe compact mode can auto-promote payload transport to reference.',
    inputSchema: {
      type: 'object',
      description: 'Provide a track plus optional catalog preferences.',
      properties: {
        track: trackSchema,
        options: catalogOptionsSchema
      },
      required: ['track']
    }
  },
  {
    name: 'find_synced_lyrics',
    description: 'Find lyrics but reject any candidates that lack timestamps.',
    inputSchema: {
      type: 'object',
      description:
        'Provide a track description (and optional hints) to look up synced lyrics only.',
      properties: {
        track: trackSchema,
        options: {
          type: 'object',
          description: 'Optional provider hints or overrides.',
          additionalProperties: false
        }
      },
      required: ['track']
    }
  },
  {
    name: 'search_lyrics',
    description: 'List candidate matches from every provider without downloading the lyrics yet.',
    inputSchema: {
      type: 'object',
      description: 'Provide the basic track metadata to retrieve unhydrated matches.',
      properties: {
        track: trackSchema
      },
      required: ['track']
    }
  },
  {
    name: 'search_provider',
    description: 'Search a single provider (e.g., LRCLIB, Genius, Melon) for potential matches.',
    inputSchema: {
      type: 'object',
      description: 'Provide a track plus a provider slug to limit the search scope.',
      properties: {
        provider: {
          type: 'string',
          description: 'Provider slug such as lrclib, genius, musixmatch, or melon.'
        },
        track: trackSchema
      },
      required: ['provider', 'track']
    }
  },
  {
    name: 'get_provider_status',
    description: 'Report whether each provider is currently configured and reachable.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'export_lyrics',
    description: 'Find lyrics and save plain/LRC/SRT plus romanized variants to disk.',
    inputSchema: {
      type: 'object',
      description: 'Provide the track and export options to write files to disk.',
      properties: {
        track: trackSchema,
        options: exportOptionsSchema
      },
      required: ['track']
    }
  },
  {
    name: 'format_lyrics',
    description: 'Find lyrics and return formatted text (with optional romanization) in-memory.',
    inputSchema: {
      type: 'object',
      description: 'Provide the track and formatting options for in-memory rendering.',
      properties: {
        track: trackSchema,
        options: formatOptionsSchema
      },
      required: ['track']
    }
  },
  {
    name: 'select_match',
    description:
      'Pick a single match from a previous search result based on provider/index filters. Send params.arguments as an object (not a JSON string) for multiline payload safety.',
    inputSchema: {
      type: 'object',
      description:
        'Select a single result either by passing matches + criteria or by supplying match directly.',
      properties: {
        matches: {
          type: 'array',
          description: 'Results returned from search_lyrics or search_provider.',
          items: matchSchema
        },
        match: matchSchema,
        criteria: selectCriteriaSchema
      }
    }
  },
  {
    name: 'runtime_status',
    description: 'Summarize provider readiness plus which credential env vars are present.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'push_catalog_to_airtable',
    description:
      'Write a catalog record directly to Airtable without relaying lyrics through the LLM. ' +
      'Lyrics are fetched server-side from the in-memory cache populated by build_catalog_payload. ' +
      'Pass the lyricsCacheKey returned by build_catalog_payload so the server can resolve the correct lyrics. ' +
      'If lyricsCacheKey is omitted the most-recently-cached entry is used. ' +
      'Uses AIRTABLE_PERSONAL_ACCESS_TOKEN from the environment.',
    inputSchema: {
      type: 'object',
      description:
        'Airtable coordinates plus field values. Lyrics are resolved server-side; never include lyric text here.',
      properties: {
        baseId: {
          type: 'string',
          description:
            'Airtable base ID (starts with "app"). From search_bases or list_tables_for_base.'
        },
        tableId: {
          type: 'string',
          description: 'Airtable table ID (starts with "tbl"). From list_tables_for_base.'
        },
        recordId: {
          type: 'string',
          description:
            'Existing record ID to update (starts with "rec"). Omit to create a new record.'
        },
        fields: {
          type: 'object',
          description:
            'Field IDs mapped to their string values. Include all non-lyrics fields here (e.g. Song (Video), Listen Link). Do NOT include the Lyrics field — it is handled server-side.',
          additionalProperties: { type: 'string' }
        },
        lyricsFieldId: {
          type: 'string',
          description:
            'The Airtable field ID where lyrics should be written (starts with "fld"). The lyrics text is resolved server-side.'
        },
        lyricsCacheKey: {
          type: 'string',
          description:
            'The lyricsCacheKey value returned by build_catalog_payload. Used to look up the correct cached lyrics. Falls back to the most-recently-cached entry if omitted.'
        },
        preferRomanized: {
          type: 'boolean',
          description:
            'When true (default), use romanized plain lyrics if available; otherwise use plain Korean/original lyrics.'
        },
        splitLyricsUpdate: {
          type: 'boolean',
          description:
            'When true, write non-lyrics fields first then update lyrics in a separate call. Useful if the combined payload is too large.'
        }
      },
      required: ['baseId', 'tableId']
    }
  }
];

export async function handleMcpTool(name, args = {}) {
  const track = args.track || {};
  const options = args.options || {};

  if (name === 'find_lyrics') {
    const result = await runFind(track, options);
    return buildPayloadFromResult(result, buildActionContext(options));
  }

  if (name === 'find_synced_lyrics') {
    const result = await runFind(track, { ...options, syncedOnly: true });
    return buildPayloadFromResult(result, buildActionContext(options));
  }

  if (name === 'search_lyrics') {
    return runSearch(track);
  }

  if (name === 'search_provider') {
    if (!args.provider) {
      throw new McpError(ErrorCode.InvalidParams, 'provider is required');
    }
    return runProviderSearch(args.provider, track);
  }

  if (name === 'get_provider_status') {
    return getProviderStatus();
  }

  if (name === 'export_lyrics') {
    const result = await runFind(track, options);
    const context = buildActionContext({ ...options, export: true });
    const payload = await buildPayloadFromResult(result, context);
    const exports = await exportBestResult(result, context);
    return { result: payload, exports };
  }

  if (name === 'format_lyrics') {
    const result = await runFind(track, options);
    const best = result?.best;
    if (!best) {
      return { error: 'No match found' };
    }
    const formatted = formatRecord(best, {
      includeRomanization: !options?.noRomanize,
      includeSynced: options?.includeSynced ?? true
    });
    return { formatted, best };
  }

  if (name === 'build_catalog_payload') {
    return buildCatalogPayload(track, options);
  }

  if (name === 'select_match') {
    if (args.match) {
      return args.match;
    }
    const matches = Array.isArray(args.matches) ? args.matches : [];
    if (matches.length === 0) {
      return { error: 'No matches provided' };
    }
    const { provider, requireSynced, index } = args.criteria || {};
    let filtered = matches;
    if (provider) {
      filtered = filtered.filter((entry) => entry.provider === provider);
    }
    if (requireSynced) {
      filtered = filtered.filter((entry) => entry.result?.synced);
    }
    const selected = typeof index === 'number' ? filtered[index] : filtered[0];
    return selected || { error: 'No matching entry found' };
  }

  if (name === 'runtime_status') {
    const CREDENTIAL_KEYS = [
      'GENIUS_DIRECT_TOKEN',
      'GENIUS_CLIENT_ID',
      'GENIUS_CLIENT_SECRET',
      'MUSIXMATCH_DIRECT_TOKEN',
      'MELON_COOKIE'
    ];
    return {
      providers: await getProviderStatus(),
      env: Object.keys(process.env).filter((key) => CREDENTIAL_KEYS.includes(key))
    };
  }

  if (name === 'push_catalog_to_airtable') {
    const {
      baseId,
      tableId,
      recordId,
      fields: fieldValues = {},
      lyricsFieldId,
      lyricsCacheKey: providedCacheKey,
      preferRomanized = true,
      splitLyricsUpdate = false
    } = args;

    if (!baseId) throw new McpError(ErrorCode.InvalidParams, 'baseId is required');
    if (!tableId) throw new McpError(ErrorCode.InvalidParams, 'tableId is required');

    // Resolve lyrics from the in-memory cache.
    // The LLM passes back the lyricsCacheKey it received from build_catalog_payload —
    // a short slug like "kda-feat-twice-bekuh-boom-annika-wells-league-of-legends-ill-show-you".
    // The full lyric text never travels through LLM tool-call arguments.
    let lyricsText = null;
    if (lyricsFieldId) {
      let cached = null;
      if (providedCacheKey) {
        cached = catalogCache.get(providedCacheKey);
      }
      if (!cached) {
        // Fall back to the most-recently-resolved lyrics entry
        cached = catalogCache.latest();
      }

      if (cached) {
        const useRomanized = preferRomanized && Boolean(cached.romanizedPlainLyrics);
        lyricsText = useRomanized ? cached.romanizedPlainLyrics : cached.plainLyrics;
      }
    }

    const result = await pushCatalogToAirtable({
      baseId,
      tableId,
      recordId,
      fieldValues,
      lyricsFieldId: lyricsFieldId || null,
      lyricsText,
      splitLyricsUpdate
    });

    return {
      success: true,
      recordId: result.record?.id ?? recordId ?? null,
      steps: result.steps,
      lyricsWritten: Boolean(lyricsText && lyricsFieldId),
      lyricsSource: lyricsText
        ? providedCacheKey
          ? `cache:${providedCacheKey}`
          : 'cache:latest'
        : null,
      record: result.record,
      lyricsRecord: result.lyricsRecord ?? null
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}
