import { ExportStorageResult, buildId } from '../export-storage.js';

import { getSharedRedisClient } from './shared-redis-client.js';

export default class RedisStorage {
  constructor(config = {}) {
    this.url = config?.url || process.env.UPSTASH_REDIS_REST_URL;
    this.token = config?.token || process.env.UPSTASH_REDIS_REST_TOKEN;
    this.ttl = Number(config?.ttl ?? process.env.MR_MAGIC_EXPORT_TTL_SECONDS ?? 3600);
    this.downloadBaseUrl = config?.downloadBaseUrl || process.env.MR_MAGIC_DOWNLOAD_BASE_URL || '';
    if (!this.url || !this.token) {
      throw new Error('Redis export storage requires UPSTASH_REDIS_REST_URL and _TOKEN');
    }
  }

  async store({ content, extension, baseName }) {
    const id = buildId('export');
    const key = `mr-magic:${id}:${extension}`;
    const value = typeof content === 'string' ? content : JSON.stringify(content);

    try {
      await getSharedRedisClient({
        url: this.url,
        token: this.token,
        context: 'export-storage'
      }).set(key, value, this.ttl);
    } catch (error) {
      return new ExportStorageResult({ content, skipped: true });
    }

    const expiresAt = new Date(Date.now() + this.ttl * 1000).toISOString();
    const base = this.downloadBaseUrl?.replace(/[\/]+$/, '') || '';
    const bareExt = extension.includes('.') ? extension.split('.').pop() : extension;
    const url = `${base}/downloads/${id}/${extension}/${baseName}.${bareExt}`;
    return new ExportStorageResult({ url, expiresAt, skipped: false });
  }
}
