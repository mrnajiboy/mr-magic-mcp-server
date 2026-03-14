import { createExportStorage } from './export-storage.js';

/**
 * Build a cached storage accessor.
 * Call once at module scope to get a `getStorage(outputDir)` function that
 * lazily creates an export-storage instance and reuses it for the same dir.
 *
 * @param {string} [cachePrefix=''] - Optional string prepended to the cache key.
 * @returns {(outputDir?: string) => Promise<import('./export-storage.js').ExportStorage>}
 */
export function createStorageCache(cachePrefix = '') {
  const cache = new Map();

  return async function getStorage(outputDir) {
    const key = `${cachePrefix}${outputDir || '__default__'}`;
    if (!cache.has(key)) {
      const storage = await createExportStorage({
        local: { baseDir: outputDir },
        redis: {
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
          ttl: process.env.MR_MAGIC_EXPORT_TTL_SECONDS
        }
      });
      cache.set(key, storage);
    }
    return cache.get(key);
  };
}
