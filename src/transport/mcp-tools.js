import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { runFind, runSearch, runProviderSearch } from '../core/find-service.js';
import { extractPlainPreview, extractSyncedPreview } from '../core/preview.js';
import {
  buildProviderReferenceFingerprint,
  lyricContentScore
} from '../provider-result-schema.js';
import {
  buildActionContext,
  buildPayloadFromResult,
  buildCatalogPayload,
  buildCatalogPayloadFromResult,
  formatRecord,
  catalogCache,
  catalogCacheKey
} from '../services/lyrics-service.js';
import { pushCatalogToAirtable } from '../services/airtable-writer.js';
import { getProviderStatus, resolveProviderReference } from '../index.js';

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

const providerReferenceSchema = {
  type: 'object',
  description: 'Compact provider reference returned by MCP search tools for exact recall.',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    providerId: {
      type: ['string', 'null'],
      description: 'Provider-specific identifier if available.'
    },
    ids: {
      type: 'object',
      description: 'Optional provider-specific identifiers such as Melon songId.',
      additionalProperties: { type: 'string' }
    },
    title: { type: ['string', 'null'], description: 'Track title for provider recall.' },
    artist: { type: ['string', 'null'], description: 'Artist name for provider recall.' },
    album: { type: ['string', 'null'], description: 'Album name for provider recall.' },
    duration: {
      type: ['number', 'string', 'null'],
      description: 'Track duration hint used when replaying provider lookups.'
    },
    sourceUrl: {
      type: ['string', 'null'],
      description: 'Canonical source URL for exact-result recall when available.'
    },
    fingerprint: {
      type: ['string', 'null'],
      description: 'Stable fingerprint for recalling preview-only matches without provider IDs.'
    }
  },
  additionalProperties: false
};

const compactSearchResultSchema = {
  type: 'object',
  description: 'Compact MCP search result preview. Search tools never return full lyrics.',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    providerId: {
      type: ['string', 'null'],
      description: 'Provider-specific identifier if available.'
    },
    title: { type: ['string', 'null'], description: 'Track title from the provider result.' },
    artist: { type: ['string', 'null'], description: 'Artist name from the provider result.' },
    album: { type: ['string', 'null'], description: 'Album name if provided.' },
    duration: {
      type: ['number', 'null'],
      description: 'Duration (seconds) if reported.'
    },
    sourceUrl: { type: ['string', 'null'], description: 'Canonical URL to view the lyrics.' },
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
    hasLyrics: {
      type: 'boolean',
      description: 'True when the provider already returned lyric text.'
    },
    plainPreview: {
      type: ['string', 'null'],
      description: 'Short preview of plain lyrics when available.'
    },
    syncedPreview: {
      type: ['string', 'null'],
      description: 'Short preview of synced lyrics when available.'
    },
    reference: providerReferenceSchema
  },
  additionalProperties: false
};

const matchSchema = {
  type: 'object',
  description: 'A single search result entry (provider + normalized lyric record).',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    result: compactSearchResultSchema
  },
  additionalProperties: false
};

const searchGroupSchema = {
  type: 'object',
  description: 'Provider bucket returned by search_lyrics with preview-only results.',
  properties: {
    provider: { type: 'string', description: 'Provider slug for this bucket.' },
    results: {
      type: 'array',
      description: 'Compact preview-only matches for the provider.',
      items: compactSearchResultSchema
    }
  },
  additionalProperties: false
};

function compactStringMap(input = {}) {
  const entries = Object.entries(input).filter(
    ([, value]) => value !== null && value !== undefined && value !== ''
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries.map(([key, value]) => [key, value.toString()]));
}

function buildProviderReference(record = {}) {
  const reference = {
    provider: record.provider,
    providerId: record.providerId ?? null,
    title: record.title ?? null,
    artist: record.artist ?? null,
    album: record.album ?? null,
    duration: record.duration ?? null,
    sourceUrl: record.sourceUrl ?? null
  };
  const ids = compactStringMap(record.ids || {});
  if (ids) {
    reference.ids = ids;
  }
  reference.fingerprint = buildProviderReferenceFingerprint(record);
  return reference;
}

function buildCompactSearchResult(record = {}) {
  return {
    provider: record.provider,
    providerId: record.providerId ?? null,
    title: record.title ?? null,
    artist: record.artist ?? null,
    album: record.album ?? null,
    duration: record.duration ?? null,
    sourceUrl: record.sourceUrl ?? null,
    confidence: record.confidence ?? 0,
    synced: Boolean(record.synced),
    plainOnly: Boolean(record.plainOnly),
    timestampCount: record.timestampCount ?? 0,
    status: record.status ?? null,
    hasLyrics: Boolean(record.plainLyrics || record.syncedLyrics),
    plainPreview: extractPlainPreview(record) || null,
    syncedPreview: extractSyncedPreview(record) || null,
    reference: buildProviderReference(record)
  };
}

function projectSearchGroups(groups = []) {
  return groups.map((group) => ({
    provider: group.provider,
    results: Array.isArray(group.results)
      ? group.results.map((record) => buildCompactSearchResult(record))
      : []
  }));
}

function normalizeMatchInput(match) {
  if (!match || typeof match !== 'object') {
    return null;
  }

  if (match.result && typeof match.result === 'object') {
    return {
      provider: match.provider || match.result.provider || match.result.reference?.provider || null,
      result: match.result
    };
  }

  if (match.reference || match.providerId || match.title || match.artist) {
    return {
      provider: match.provider || match.reference?.provider || null,
      result: match
    };
  }

  return null;
}

function flattenSelectableMatches(args = {}) {
  const groupedItems = Array.isArray(args.items) ? args.items : [];
  const groupedMatches = groupedItems.flatMap((item) =>
    (item.results || []).map((result) => ({ provider: item.provider || result.provider, result }))
  );
  const directMatches = Array.isArray(args.matches)
    ? args.matches.map((entry) => normalizeMatchInput(entry)).filter(Boolean)
    : [];
  return [...groupedMatches, ...directMatches];
}

function mergeTrackWithResult(track = {}, result = {}) {
  return {
    title: track.title || result.title || '',
    artist: track.artist || result.artist || '',
    album: track.album || result.album || null,
    duration: track.duration ?? result.duration ?? null
  };
}

function resolveLookupInputs(args = {}) {
  const normalizedMatch = normalizeMatchInput(args.match);
  const result = normalizedMatch?.result || {};
  const reference = args.reference || result.reference || null;
  const track = mergeTrackWithResult(args.track || {}, result);
  return { track, reference };
}

function assertLookupInputs(track, reference) {
  if (reference) {
    return;
  }

  if (track?.title || track?.artist) {
    return;
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    'Provide track metadata or a provider reference from search_lyrics/search_provider'
  );
}

async function resolveFindResult(args, options = {}, { syncedOnly = false } = {}) {
  const { track, reference } = resolveLookupInputs(args);
  assertLookupInputs(track, reference);

  if (reference) {
    const resolved = await resolveProviderReference(reference, track);
    return buildResolvedReferenceResult(resolved, { syncedOnly });
  }

  return runFind(track, { ...options, syncedOnly });
}

export function buildResolvedReferenceResult(resolved, { syncedOnly = false } = {}) {
  if (!resolved || lyricContentScore(resolved) <= 0) {
    return { matches: [], best: null };
  }

  if (syncedOnly && !resolved.synced) {
    return { matches: [], best: null };
  }

  return {
    matches: [{ provider: resolved.provider, result: resolved }],
    best: resolved
  };
}

export const mcpToolDefinitions = [
  {
    name: 'find_lyrics',
    description:
      'Find the best lyric match across providers (prefers synced when available), or resolve an exact provider reference returned by the MCP search tools. ' +
      'Returns lyricsCacheKey when lyrics are resolved — pass this to push_catalog_to_airtable ' +
      'without calling build_catalog_payload first.',
    inputSchema: {
      type: 'object',
      description:
        'Provide track metadata, or pass a compact provider reference / selected search result from search_lyrics or search_provider.',
      properties: {
        track: trackSchema,
        reference: providerReferenceSchema,
        match: matchSchema,
        options: {
          type: 'object',
          description: 'Optional provider hints or overrides.',
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'build_catalog_payload',
    description:
      'Return a compact payload suitable for Airtable inserts/exports. Accepts track metadata or an exact provider reference from the MCP search tools. For large lyrics, send object args and use omitInlineLyrics + lyricsPayloadMode to avoid JSON truncation in downstream automations. Airtable-safe compact mode can auto-promote payload transport to reference.',
    inputSchema: {
      type: 'object',
      description:
        'Provide a track, or pass a compact provider reference / selected search result plus optional catalog preferences.',
      properties: {
        track: trackSchema,
        reference: providerReferenceSchema,
        match: matchSchema,
        options: catalogOptionsSchema
      },
      additionalProperties: false
    }
  },
  {
    name: 'find_synced_lyrics',
    description:
      'Find lyrics but reject any candidates that lack timestamps. ' +
      'Returns lyricsCacheKey when synced lyrics are resolved.',
    inputSchema: {
      type: 'object',
      description:
        'Provide track metadata, or pass a compact provider reference / selected search result to look up synced lyrics only.',
      properties: {
        track: trackSchema,
        reference: providerReferenceSchema,
        match: matchSchema,
        options: {
          type: 'object',
          description: 'Optional provider hints or overrides.',
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'search_lyrics',
    description:
      'List preview-only candidate matches from every provider. MCP search results never include full lyrics or raw provider payloads.',
    inputSchema: {
      type: 'object',
      description:
        'Provide the basic track metadata to retrieve preview-only matches and reusable provider references.',
      properties: {
        track: trackSchema
      },
      required: ['track']
    }
  },
  {
    name: 'search_provider',
    description:
      'Search a single provider (e.g., LRCLIB, Genius, Melon) for preview-only potential matches. MCP search results never include full lyrics or raw provider payloads.',
    inputSchema: {
      type: 'object',
      description:
        'Provide a track plus a provider slug to limit the search scope and return reusable provider references.',
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
    description:
      'Find lyrics and save plain/LRC/SRT plus romanized variants to disk, or resolve an exact provider reference from MCP search tools. ' +
      'Also returns lyricsCacheKey so push_catalog_to_airtable can be called immediately.',
    inputSchema: {
      type: 'object',
      description:
        'Provide the track, or pass a compact provider reference / selected search result and export options to write files to disk.',
      properties: {
        track: trackSchema,
        reference: providerReferenceSchema,
        match: matchSchema,
        options: exportOptionsSchema
      },
      additionalProperties: false
    }
  },
  {
    name: 'format_lyrics',
    description:
      'Find lyrics and return formatted text (with optional romanization) in-memory. ' +
      'Also returns lyricsCacheKey so push_catalog_to_airtable can be called immediately.',
    inputSchema: {
      type: 'object',
      description: 'Provide the track and formatting options for in-memory rendering.',
      properties: {
        track: trackSchema,
        reference: providerReferenceSchema,
        match: matchSchema,
        options: formatOptionsSchema
      },
      additionalProperties: false
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
        items: {
          type: 'array',
          description: 'Grouped results returned from search_lyrics.',
          items: searchGroupSchema
        },
        matches: {
          type: 'array',
          description:
            'Results returned from search_provider, or flattened match entries from previous search output.',
          items: {
            anyOf: [matchSchema, compactSearchResultSchema]
          }
        },
        match: {
          anyOf: [matchSchema, compactSearchResultSchema]
        },
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
  const options = args.options || {};

  if (name === 'find_lyrics') {
    const result = await resolveFindResult(args, options);
    return buildPayloadFromResult(result, buildActionContext(options));
  }

  if (name === 'find_synced_lyrics') {
    const result = await resolveFindResult(args, options, { syncedOnly: true });
    return buildPayloadFromResult(result, buildActionContext(options));
  }

  if (name === 'search_lyrics') {
    const { track } = resolveLookupInputs(args);
    assertLookupInputs(track, null);
    return projectSearchGroups(await runSearch(track));
  }

  if (name === 'search_provider') {
    if (!args.provider) {
      throw new McpError(ErrorCode.InvalidParams, 'provider is required');
    }
    const { track } = resolveLookupInputs(args);
    assertLookupInputs(track, null);
    return (await runProviderSearch(args.provider, track)).map((record) =>
      buildCompactSearchResult(record)
    );
  }

  if (name === 'get_provider_status') {
    return getProviderStatus();
  }

  if (name === 'export_lyrics') {
    const result = await resolveFindResult(args, options);
    const context = buildActionContext({ ...options, export: true });
    const payload = await buildPayloadFromResult(result, context);
    // buildPayloadFromResult already calls exportBestResult internally when
    // context.shouldExport is true — avoid exporting twice by reusing payload.exports.
    return { result: payload, exports: payload.exports ?? null };
  }

  if (name === 'format_lyrics') {
    const result = await resolveFindResult(args, options);
    const best = result?.best;
    if (!best) {
      return { error: 'No match found' };
    }
    const formatted = formatRecord(best, {
      includeRomanization: !options?.noRomanize,
      includeSynced: options?.includeSynced ?? true
    });
    // Populate the catalog cache so push_catalog_to_airtable can be used
    // immediately without a separate build_catalog_payload call.
    let lyricsCacheKey = null;
    const plainLyrics = formatted.plainLyrics || best.plainLyrics || '';
    if (plainLyrics) {
      lyricsCacheKey = catalogCacheKey({ artist: best.artist, title: best.title });
      catalogCache.set(lyricsCacheKey, {
        plainLyrics,
        romanizedPlainLyrics: formatted.romanizedPlain || null,
        preferRomanized: !options?.noRomanize
      });
    }
    return { formatted, best, lyricsCacheKey };
  }

  if (name === 'build_catalog_payload') {
    const { track, reference } = resolveLookupInputs(args);
    assertLookupInputs(track, reference);

    if (!reference) {
      return buildCatalogPayload(track, options);
    }

    const resolved = await resolveProviderReference(reference, track);
    const { best } = buildResolvedReferenceResult(resolved);
    return buildCatalogPayloadFromResult(best, track, options);
  }

  if (name === 'select_match') {
    if (args.match) {
      return normalizeMatchInput(args.match) ?? args.match;
    }
    const matches = flattenSelectableMatches(args);
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
