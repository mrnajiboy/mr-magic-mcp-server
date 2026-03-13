export class RedisClient {
  constructor({ url, token } = {}) {
    this.url = url || process.env.UPSTASH_REDIS_REST_URL;
    this.token = token || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!this.url || !this.token) {
      throw new Error('Redis client requires UPSTASH_REDIS_REST_URL and _TOKEN');
    }
    this.fingerprint = this.url.replace(/https?:\/\//, '').split('/')[0];
    this.timeoutMs = Number(process.env.MR_MAGIC_HTTP_TIMEOUT_MS || 10000);
  }

  async set(key, value, ttlSeconds) {
    const response = await this.request(
      `${this.url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?EX=${ttlSeconds}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}` }
      }
    );
    if (!response.ok) {
      throw new Error(`Redis set failed (${response.status})`);
    }
  }

  async get(key) {
    const response = await this.request(`${this.url}/get/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return data.result ?? null;
  }

  async request(url, init) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Redis request timeout after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}

let sharedClient = null;

export function getSharedRedisClient(config = {}) {
  if (!sharedClient) {
    sharedClient = new RedisClient(config);
    const where = config?.context || 'unknown';
    console.error(
      JSON.stringify({
        level: 'info',
        message: 'Redis client initialized',
        context: where,
        redisHost: sharedClient.fingerprint
      })
    );
  }
  return sharedClient;
}
