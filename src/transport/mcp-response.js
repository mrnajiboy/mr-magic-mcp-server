const MAX_SUMMARY_LENGTH = 400;
const MAX_PREVIEW_LENGTH = 220;

function normalizeStructuredContent(result) {
  if (Array.isArray(result)) {
    return { items: result };
  }

  if (result && typeof result === 'object') {
    return result;
  }

  if (typeof result === 'string') {
    return { value: result };
  }

  if (result == null) {
    return { value: null };
  }

  return { value: result };
}

function extractPreviewText(result) {
  if (!result || typeof result !== 'object') return null;

  const candidates = [
    result.lyricsPreview,
    result.lyrics,
    result.romanizedPlainLyrics,
    result.plainLyrics,
    result.formatted?.romanizedPlain,
    result.formatted?.plainLyrics,
    result.formatted?.syncedLyrics,
    result.lyricsPayload?.preview,
    result.lyricsPayload?.content
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return truncateInline(candidate, MAX_PREVIEW_LENGTH);
    }
  }

  if (Array.isArray(result.items) && result.items.length > 0) {
    const first = result.items[0];
    if (first && typeof first === 'object') {
      const title = first.result?.title || first.title;
      const artist = first.result?.artist || first.artist;
      const provider = first.provider || first.result?.provider;
      const synced = first.result?.synced ?? first.synced;
      const parts = [];
      if (provider) parts.push(`provider=${provider}`);
      if (title) parts.push(`title=${title}`);
      if (artist) parts.push(`artist=${artist}`);
      if (typeof synced === 'boolean') parts.push(`synced=${synced}`);
      if (parts.length > 0) {
        return truncate(parts.join(' '));
      }
    }
  }

  return null;
}

function buildResultSummary(result) {
  if (Array.isArray(result)) {
    const count = result.length;
    if (count === 0) {
      return 'Result items=0';
    }
    const wrappedPreview = extractPreviewText({ items: result });
    return truncate(`Result items=${count}${wrappedPreview ? ` preview=${wrappedPreview}` : ''}`);
  }

  if (result && typeof result === 'object') {
    if (typeof result.error === 'string' && result.error.length > 0) {
      return truncate(`Error: ${result.error}`);
    }

    const tags = [];
    const provider = result.provider || result.best?.provider;
    const title = result.best?.title || result.track?.title;
    if (provider) tags.push(`provider=${provider}`);
    if (title) tags.push(`title=${title}`);

    const keys = Object.keys(result || {});
    const keySummary = keys.length > 0 ? keys.slice(0, 6).join(', ') : 'none';
    tags.push(`keys=[${keySummary}${keys.length > 6 ? ', …' : ''}]`);

    const preview = extractPreviewText(result);
    if (preview) tags.push(`preview=${preview}`);

    const message = tags.join(' ');
    if (message) {
      return truncate(`Result ${message}`);
    }
  }

  if (typeof result === 'string') {
    return truncate(result);
  }

  try {
    return truncate(JSON.stringify(result));
  } catch (error) {
    return 'Result ready (see structuredContent)';
  }
}

function truncate(value) {
  if (typeof value !== 'string') {
    return 'Result ready (see structuredContent)';
  }
  if (value.length <= MAX_SUMMARY_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_SUMMARY_LENGTH)}…`;
}

function truncateInline(value, maxLength) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}…`;
}

export function buildMcpResponse(result) {
  return {
    structuredContent: normalizeStructuredContent(result),
    content: [
      {
        type: 'text',
        text: buildResultSummary(result)
      },
      {
        type: 'text',
        text: JSON.stringify(normalizeStructuredContent(result), null, 2)
      }
    ]
  };
}
