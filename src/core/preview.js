import { formatPlainStanzas } from '../utils/lyrics-format.js';

const PREVIEW_MAX_LENGTH = 140;

function truncatePreview(text) {
  if (!text) return '';
  if (text.length <= PREVIEW_MAX_LENGTH) {
    return text;
  }
  return `${text.slice(0, PREVIEW_MAX_LENGTH - 1)}…`;
}

export function extractPlainPreview(record) {
  if (!record?.plainLyrics) return '';
  const lines = record.plainLyrics.split('\n').map((entry) => entry && entry.trim());
  const primary = lines.find(
    (entry) =>
      entry &&
      !entry.toLowerCase().includes('lyrics”') &&
      !entry.toLowerCase().startsWith('read more') &&
      !entry.toLowerCase().startsWith('[verse') &&
      !entry.toLowerCase().startsWith('[hook') &&
      !entry.toLowerCase().startsWith('[chorus')
  );
  const fallback = lines.find((entry) => entry);
  return truncatePreview(primary || fallback || '');
}

export function extractSyncedPreview(record) {
  if (!record?.syncedLyrics || !record?.synced) return '';

  const lines = record.syncedLyrics
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter(
      (entry) => !entry.startsWith('[ar:') && !entry.startsWith('[ti:') && !entry.startsWith('[by:')
    );

  const preview = [];
  for (const rawLine of lines) {
    const timestampMatches = rawLine.match(/(\[[0-9.:]+\])/g);
    if (!timestampMatches) continue;

    const text = rawLine.replace(/(\[[0-9.:]+\])/g, '').trim();
    const timestamps = timestampMatches.slice(0, 2);
    timestamps.forEach((timestamp) => {
      if (preview.length < 2) {
        preview.push(text ? `${timestamp} ${text}` : timestamp);
      }
    });
    if (preview.length >= 2) break;
  }

  return truncatePreview(preview.join(' | '));
}

export function formatPlainLyricsForOutput(plainLyrics) {
  if (!plainLyrics) return '';
  return formatPlainStanzas(plainLyrics);
}
