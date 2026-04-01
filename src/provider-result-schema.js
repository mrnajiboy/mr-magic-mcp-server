import { createHash } from 'node:crypto';

export function detectSyncedState(syncedLyrics) {
  if (!syncedLyrics) return { hasSynced: false, timestampCount: 0 };
  const lines = syncedLyrics
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return { hasSynced: false, timestampCount: 0 };
  }
  const timestampRegex = /\[(\d{1,2}:)?\d{1,2}:[0-9]{2}(?:\.|:)\d{1,3}\]/;
  const timestampCount = lines.reduce(
    (count, line) => (timestampRegex.test(line) ? count + 1 : count),
    0
  );
  return { hasSynced: timestampCount > 1, timestampCount };
}

/**
 * Count non-empty lines in a lyric string, after stripping LRC timestamps.
 * Used for ranking results by lyric richness.
 */
export function countLyricLines(text) {
  if (!text || typeof text !== 'string') return 0;
  return text
    .split('\n')
    .map((line) => line.replace(/^\[\d{1,2}:\d{2}[.:]\d{1,3}\]/, '').trim())
    .filter(Boolean).length;
}

/**
 * Returns a numeric "content score" for a lyric record:
 *   - 0   → no lyric text at all (empty / unhydrated)
 *   - 0.5 → has some lyric text (plain or synced)
 *   - 0…1 continuous bonus added for richness (normalized line count, capped at 1)
 *
 * The function only inspects the actual lyric strings so that placeholder
 * records that happen to have `plainLyrics: ""` still score 0.
 */
export function lyricContentScore(record) {
  if (!record) return 0;

  const plainText = typeof record.plainLyrics === 'string' ? record.plainLyrics.trim() : '';
  const syncedText = typeof record.syncedLyrics === 'string' ? record.syncedLyrics.trim() : '';

  const hasAny = Boolean(plainText || syncedText);
  if (!hasAny) return 0;

  // Base score for having any content
  let score = 0.5;

  // Richness bonus: cap at 200 lines → bonus up to 0.5
  const lines = Math.max(countLyricLines(plainText), countLyricLines(syncedText));
  const richnessBonus = Math.min(lines / 200, 0.5);
  score += richnessBonus;

  return score;
}

function compactIds(entries) {
  const ids = Object.fromEntries(
    entries
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => [key, value.toString()])
  );
  return Object.keys(ids).length > 0 ? ids : null;
}

export function extractProviderIds(provider, raw = null, providerId = null) {
  switch (provider) {
    case 'melon':
      return compactIds([['songId', raw?.songId ?? providerId]]);
    case 'genius':
      return compactIds([
        ['songId', raw?.id ?? providerId],
        ['apiPath', raw?.api_path],
        ['iq', raw?.iq ?? raw?.stats?.iq]
      ]);
    case 'musixmatch':
      return compactIds([
        [
          'trackId',
          raw?.['matcher.track.get']?.message?.body?.track?.track_id ?? raw?.track_id ?? providerId
        ],
        ['commontrackId', raw?.['matcher.track.get']?.message?.body?.track?.commontrack_id]
      ]);
    case 'lrclib':
      return compactIds([['trackId', raw?.id ?? providerId]]);
    default:
      return compactIds([['id', providerId]]);
  }
}

export function normalizeLyricRecord({
  provider,
  id,
  trackName,
  artistName,
  albumName,
  duration,
  plainLyrics = null,
  syncedLyrics = null,
  sourceUrl = null,
  confidence = 0.0,
  synced = false,
  status = 'ok',
  raw
}) {
  const { hasSynced, timestampCount } = detectSyncedState(syncedLyrics);
  const hasPlainOnly = Boolean(plainLyrics && plainLyrics.trim());

  return {
    provider,
    providerId: id?.toString() ?? null,
    ids: extractProviderIds(provider, raw, id),
    title: trackName || null,
    artist: artistName || null,
    album: albumName || null,
    duration: typeof duration === 'number' ? duration : Number(duration) || null,
    plainLyrics,
    syncedLyrics,
    sourceUrl,
    confidence,
    synced: hasSynced,
    plainOnly: hasPlainOnly && !hasSynced,
    timestampCount,
    status,
    rawRecord: raw ?? null
  };
}

export function recomputeSyncFlags(record) {
  if (!record) return record;
  const { hasSynced, timestampCount } = detectSyncedState(record.syncedLyrics);
  const hasPlainOnly = Boolean(record.plainLyrics && record.plainLyrics.trim());
  record.synced = hasSynced;
  record.plainOnly = hasPlainOnly && !hasSynced;
  record.timestampCount = timestampCount;
  return record;
}

function normalizeFingerprintValue(value) {
  if (value === null || value === undefined) return '';
  return value.toString().trim().replace(/\s+/g, ' ');
}

function compactFingerprintIds(ids = {}) {
  return Object.entries(ids)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${normalizeFingerprintValue(value)}`)
    .join('|');
}

function buildFingerprintSnippet(record = {}) {
  const lyricText = [
    record.plainLyrics,
    record.syncedLyrics,
    record.plainPreview,
    record.syncedPreview
  ]
    .map((value) => normalizeFingerprintValue(value))
    .find(Boolean);
  return lyricText ? lyricText.slice(0, 100) : '';
}

export function buildProviderReferenceFingerprint(record = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const provider = normalizeFingerprintValue(record.provider);
  const providerId = normalizeFingerprintValue(record.providerId);
  const ids = compactFingerprintIds(record.ids || {});
  const sourceUrl = normalizeFingerprintValue(record.sourceUrl);
  const title = normalizeFingerprintValue(record.title);
  const artist = normalizeFingerprintValue(record.artist);
  const album = normalizeFingerprintValue(record.album);
  const duration = normalizeFingerprintValue(record.duration);
  const snippet = !providerId && !ids && !sourceUrl ? buildFingerprintSnippet(record) : '';

  const source = [provider, providerId, ids, sourceUrl, title, artist, album, duration, snippet]
    .filter(Boolean)
    .join('||');

  if (!source) {
    return null;
  }

  return createHash('sha256').update(source).digest('hex');
}
