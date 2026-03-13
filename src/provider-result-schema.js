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
