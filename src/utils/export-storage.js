import crypto from 'node:crypto';

export class ExportStorageResult {
  constructor({ filePath = null, content = null, skipped = false, url = null, expiresAt = null }) {
    this.filePath = filePath;
    this.content = content;
    this.skipped = skipped;
    this.url = url;
    this.expiresAt = expiresAt;
  }
}

export function buildId(prefix = 'export') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function createExportStorage(config = {}) {
  const backend = (process.env.MR_MAGIC_EXPORT_BACKEND || 'local').toLowerCase();
  if (backend === 'redis') {
    const { default: RedisStorage } = await import('./export-storage/redis-storage.js');
    return new RedisStorage(config.redis);
  }
  if (backend === 'inline') {
    const { default: InlineStorage } = await import('./export-storage/inline-storage.js');
    return new InlineStorage();
  }
  const { default: LocalStorage } = await import('./export-storage/local-storage.js');
  return new LocalStorage(config.local?.baseDir);
}