import {
  buildLrc,
  buildSrt,
  formatPlainStanzas,
  romanizePlainLyrics,
  romanizeSyncedLyrics,
  romanizeSrtLyrics,
  containsHangul
} from '../utils/lyrics-format.js';
import { createExportStorage } from '../utils/export-storage.js';

function sanitizeFilename(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const storageCache = new Map();

async function getStorage(outputDir) {
  const key = `${process.env.MR_MAGIC_EXPORT_BACKEND || 'local'}:${outputDir || 'default'}`;
  if (!storageCache.has(key)) {
    const storage = await createExportStorage({
      local: { baseDir: outputDir },
      redis: {
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        ttl: process.env.MR_MAGIC_EXPORT_TTL_SECONDS
      }
    });
    storageCache.set(key, storage);
  }
  return storageCache.get(key);
}

async function storeExport(outputDir, baseName, extension, contents) {
  if (!contents) return null;
  const safe = sanitizeFilename(baseName || 'lyrics');
  const storage = await getStorage(outputDir);
  return storage.store({ content: contents, extension, baseName: safe });
}

export async function exportLyrics(record, options) {
  const exports = {};
  if (!record.plainLyrics) {
    return exports;
  }
  const baseName = `${record.artist || 'unknown'}-${record.title || 'song'}`;
  if (options.formats.includes('plain')) {
    exports.plain = await storeExport(
      options.output,
      baseName,
      'txt',
      formatPlainStanzas(record.plainLyrics)
    );
  }
  if (options.formats.includes('lrc')) {
    exports.lrc = await storeExport(options.output, baseName, 'lrc', buildLrc(record.syncedLyrics));
  }
  if (options.formats.includes('srt')) {
    exports.srt = await storeExport(options.output, baseName, 'srt', buildSrt(record.syncedLyrics));
  }
  if (options.includeRomanization !== false) {
    const hasHangulPlain = containsHangul(record.plainLyrics);
    const hasHangulSynced = record.syncedLyrics && containsHangul(record.syncedLyrics);

    if (hasHangulPlain && options.formats.includes('plain')) {
      exports.romanizedPlain = await storeExport(
        options.output,
        baseName,
        'romanized.txt',
        romanizePlainLyrics(record.plainLyrics, { formatted: true })
      );
    }

    if (hasHangulSynced && options.formats.includes('lrc')) {
      exports.romanizedLrc = await storeExport(
        options.output,
        baseName,
        'romanized.lrc',
        romanizeSyncedLyrics(record.syncedLyrics)
      );
    }

    if (hasHangulSynced && options.formats.includes('srt')) {
      exports.romanizedSrt = await storeExport(
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
