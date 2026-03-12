import fs from 'node:fs';
import path from 'node:path';

import {
  buildLrc,
  buildSrt,
  formatPlainStanzas,
  romanizePlainLyrics,
  romanizeSyncedLyrics,
  romanizeSrtLyrics,
  containsHangul
} from '../utils/lyrics-format.js';

function sanitizeFilename(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function ensureOutputDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function writeExport(outputDir, baseName, extension, contents) {
  if (!contents) return null;
  const safe = sanitizeFilename(baseName || 'lyrics');
  const filePath = path.resolve(ensureOutputDir(outputDir), `${safe}.${extension}`);
  fs.writeFileSync(filePath, contents, 'utf8');
  return filePath;
}

export async function exportLyrics(record, options) {
  const exports = {};
  if (!record.plainLyrics) {
    return exports;
  }
  const baseName = `${record.artist || 'unknown'}-${record.title || 'song'}`;
  if (options.formats.includes('plain')) {
    exports.plain = writeExport(options.output, baseName, 'txt', formatPlainStanzas(record.plainLyrics));
  }
  if (options.formats.includes('lrc')) {
    exports.lrc = writeExport(options.output, baseName, 'lrc', buildLrc(record.syncedLyrics));
  }
  if (options.formats.includes('srt')) {
    exports.srt = writeExport(options.output, baseName, 'srt', buildSrt(record.syncedLyrics));
  }
  if (options.includeRomanization !== false) {
    const hasHangulPlain = containsHangul(record.plainLyrics);
    const hasHangulSynced = record.syncedLyrics && containsHangul(record.syncedLyrics);

    if (hasHangulPlain && options.formats.includes('plain')) {
      exports.romanizedPlain = writeExport(
        options.output,
        baseName,
        'romanized.txt',
        romanizePlainLyrics(record.plainLyrics, { formatted: true })
      );
    }

    if (hasHangulSynced && options.formats.includes('lrc')) {
      exports.romanizedLrc = writeExport(
        options.output,
        baseName,
        'romanized.lrc',
        romanizeSyncedLyrics(record.syncedLyrics)
      );
    }

    if (hasHangulSynced && options.formats.includes('srt')) {
      exports.romanizedSrt = writeExport(
        options.output,
        baseName,
        'romanized.srt',
        romanizeSrtLyrics(record.syncedLyrics)
      );
    }
  }
  return exports;
}

export function deriveFormatSet(requestedFormats, defaultFormats = ['plain', 'srt']) {
  const base = ['plain', 'lrc', 'srt'];
  if (requestedFormats && requestedFormats.length > 0) {
    const normalized = requestedFormats.map((format) => format?.toLowerCase()).filter(Boolean);
    return Array.from(new Set(normalized.filter((format) => base.includes(format))));
  }
  return [...defaultFormats];
}
