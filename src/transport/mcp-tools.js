import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { runFind, runSearch, runProviderSearch } from '../core/find-service.js';
import {
  buildActionContext,
  buildPayloadFromResult,
  exportBestResult,
  formatRecord
} from '../services/lyrics-service.js';
import { getProviderStatus } from '../index.js';

const trackSchema = {
  type: 'object',
  description: 'Metadata about the song to search for.',
  properties: {
    title: { type: 'string', description: 'Song title as it appears on the release.' },
    artist: { type: 'string', description: 'Primary artist or performer name.' },
    album: { type: 'string', description: 'Album or release name (optional).' },
    duration: {
      type: ['number', 'string', 'null'],
      description: 'Track length in seconds or MM:SS format (optional).'
    }
  },
  required: ['title', 'artist']
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
  }
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
  }
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
  }
};

const matchSchema = {
  type: 'object',
  description: 'A single search result entry (provider + normalized lyric record).',
  properties: {
    provider: { type: 'string', description: 'Provider slug for the result.' },
    result: {
      type: 'object',
      description: 'Normalized lyric record as returned by the provider.',
      properties: {
        id: { type: ['string', 'number', 'null'], description: 'Provider-specific identifier.' },
        title: { type: 'string', description: 'Track title from the provider result.' },
        artist: { type: 'string', description: 'Artist name from the provider result.' },
        album: { type: ['string', 'null'], description: 'Album name if provided.' },
        duration: {
          type: ['number', 'null'],
          description: 'Duration (seconds) if reported.'
        },
        synced: { type: 'boolean', description: 'True if synced lyrics exist for this result.' },
        plainLyrics: { type: ['string', 'null'], description: 'Plain lyric text if hydrated.' },
        syncedLyrics: { type: ['string', 'null'], description: 'Synced lyric text if hydrated.' }
      }
    }
  }
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
        options: { type: 'object', description: 'Optional provider hints or overrides.' }
      },
      required: ['track']
    }
  },
  {
    name: 'find_synced_lyrics',
    description: 'Find lyrics but reject any candidates that lack timestamps.',
    inputSchema: {
      type: 'object',
      description: 'Provide a track description (and optional hints) to look up synced lyrics only.',
      properties: {
        track: trackSchema,
        options: { type: 'object', description: 'Optional provider hints or overrides.' }
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
    inputSchema: { type: 'object', properties: {} }
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
    description: 'Pick a single match from a previous search result based on provider/index filters.',
    inputSchema: {
      type: 'object',
      description: 'Select a single result either by passing matches + criteria or by supplying match directly.',
      properties: {
        matches: {
          type: 'array',
          description: 'Results returned from search_lyrics or search_provider.',
          items: matchSchema
        },
        match: matchSchema,
        criteria: selectCriteriaSchema
      },
      anyOf: [
        {
          required: ['matches']
        },
        {
          required: ['match']
        }
      ]
    }
  },
  {
    name: 'runtime_status',
    description: 'Summarize provider readiness plus which credential env vars are present.',
    inputSchema: { type: 'object', properties: {} }
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
      includeRomanization: options?.noRomanize ? false : true,
      includeSynced: options?.includeSynced ?? true
    });
    return { formatted, best };
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
    return {
      providers: getProviderStatus(),
      env: Object.keys(process.env).filter((key) =>
        ['GENIUS_ACCESS_TOKEN', 'MUSIXMATCH_TOKEN', 'MELON_COOKIE'].includes(key)
      )
    };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
}