import {
  formatPlainStanzas,
  romanizePlainLyrics,
  romanizeSyncedLyrics,
  romanizeSrtLyrics,
  containsHangul
} from '../utils/lyrics-format.js';

export function formatRecord(record, options = {}) {
  const includeRomanization = options.includeRomanization !== false;
  const includeSynced = options.includeSynced !== false;
  const plain = formatPlainStanzas(record.plainLyrics);

  const response = {
    provider: record.provider,
    title: record.title,
    artist: record.artist,
    album: record.album,
    sourceUrl: record.sourceUrl,
    synced: record.synced,
    confidence: record.confidence,
    plainLyrics: plain
  };

  if (includeRomanization && containsHangul(record.plainLyrics)) {
    response.romanizedPlain = romanizePlainLyrics(record.plainLyrics, { formatted: true });
  }

  if (includeRomanization && record.syncedLyrics && containsHangul(record.syncedLyrics)) {
    response.romanizedLrc = romanizeSyncedLyrics(record.syncedLyrics);
    response.romanizedSrt = romanizeSrtLyrics(record.syncedLyrics);
  }

  if (includeSynced && record.syncedLyrics) {
    response.syncedLyrics = record.syncedLyrics;
  }

  return response;
}
