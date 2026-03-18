/**
 * Zero-dependency KV store abstraction.
 *
 * Auto-detects the backend from environment variables.  Both backends call
 * their respective REST APIs using the built-in `fetch()` — no extra packages
 * required.
 *
 * Supported backends (in priority order — first configured wins):
 *
 *   1. Upstash Redis (recommended for ephemeral/serverless deployments)
 *        UPSTASH_REDIS_REST_URL   — e.g. https://xxxxx.upstash.io
 *        UPSTASH_REDIS_REST_TOKEN — Upstash REST bearer token
 *        → Also used by the export backend; set once, used everywhere.
 *        → Takes precedence over Cloudflare KV if both are configured.
 *
 *   2. Cloudflare KV
 *        CF_API_TOKEN       — Cloudflare API token with KV:Edit permission
 *        CF_ACCOUNT_ID      — Cloudflare account ID
 *        CF_KV_NAMESPACE_ID — KV namespace ID
 *
 * If neither backend is configured, all operations are silent no-ops.
 * If both are configured, Upstash Redis is used and Cloudflare KV is ignored.
 */

// ─── Backend detection ────────────────────────────────────────────────────────

function getUpstashConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function getCfConfig() {
  const apiToken = process.env.CF_API_TOKEN;
  const accountId = process.env.CF_ACCOUNT_ID;
  const namespaceId = process.env.CF_KV_NAMESPACE_ID;
  if (!apiToken || !accountId || !namespaceId) return null;
  return { apiToken, accountId, namespaceId };
}

export function isKvConfigured() {
  return Boolean(getUpstashConfig() || getCfConfig());
}

/** Returns a human-readable label for the active KV backend. */
export function describeKvBackend() {
  if (getUpstashConfig()) return 'upstash-redis';
  if (getCfConfig()) return 'cloudflare-kv';
  return 'none';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get a value from the KV store.
 * Returns the stored string, or `null` if the key is missing, not configured,
 * or an error occured.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
export async function kvGet(key) {
  const upstash = getUpstashConfig();
  if (upstash) return upstashGet(upstash, key);

  const cf = getCfConfig();
  if (cf) return cfGet(cf, key);

  return null;
}

/**
 * Store a string value in the KV store. No-op if no backend is configured.
 * @param {string} key
 * @param {string} value
 * @param {number} [ttlSeconds] — optional TTL; defaults to no expiry if omitted
 * @returns {Promise<void>}
 */
export async function kvSet(key, value, ttlSeconds) {
  const upstash = getUpstashConfig();
  if (upstash) return upstashSet(upstash, key, value, ttlSeconds);

  const cf = getCfConfig();
  if (cf) return cfSet(cf, key, value, ttlSeconds);
}

// ─── Upstash Redis backend ────────────────────────────────────────────────────
// Uses the Upstash Redis REST API (POST / with a Redis command array).

async function upstashCmd({ url, token }, command) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstash Redis ${command[0]} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function upstashGet(cfg, key) {
  try {
    const json = await upstashCmd(cfg, ['GET', key]);
    return json?.result ?? null;
  } catch {
    return null;
  }
}

async function upstashSet(cfg, key, value, ttlSeconds) {
  const cmd = ttlSeconds
    ? ['SET', key, value, 'EX', String(Math.round(ttlSeconds))]
    : ['SET', key, value];
  await upstashCmd(cfg, cmd);
}

// ─── Cloudflare KV backend ────────────────────────────────────────────────────
// Uses the Cloudflare Workers KV REST API.

function cfValuesUrl({ accountId, namespaceId }, key) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
}

async function cfGet(cfg, key) {
  try {
    const res = await fetch(cfValuesUrl(cfg, key), {
      headers: { Authorization: `Bearer ${cfg.apiToken}` }
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.text();
  } catch {
    return null;
  }
}

async function cfSet(cfg, key, value, ttlSeconds) {
  const url =
    cfValuesUrl(cfg, key) + (ttlSeconds ? `?expiration_ttl=${Math.round(ttlSeconds)}` : '');
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': 'text/plain'
    },
    body: value
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloudflare KV PUT failed (${res.status}): ${text}`);
  }
}
