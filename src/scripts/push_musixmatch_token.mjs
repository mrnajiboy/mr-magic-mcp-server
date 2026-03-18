#!/usr/bin/env node
/**
 * push_musixmatch_token.mjs
 *
 * Seed the Musixmatch token to all configured storage backends (Upstash Redis,
 * Cloudflare KV, and/or on-disk cache) WITHOUT opening a browser.
 *
 * Use this when you already have a token value — e.g. captured once locally via
 * `npm run fetch:musixmatch-token` — and need to push it to a headless server,
 * ephemeral deployment (Render), or CI/CD pipeline where a browser is unavailable.
 *
 * Usage (env var — recommended for Render / build/start commands):
 *   MUSIXMATCH_DIRECT_TOKEN='{"message":...}' npm run push:musixmatch-token
 *
 * Usage (CLI flag):
 *   npm run push:musixmatch-token -- --token '{"message":...}'
 *
 * The token value must be the full musixmatchUserToken JSON payload (the same
 * object that `fetch:musixmatch-token` captures and prints after sign-in).
 * A raw string token is also accepted.
 *
 * Exit codes:
 *   0 — token pushed successfully (or no token provided, no-op)
 *   1 — token was provided but a push failure occurred (KV write error, etc.)
 *
 * Render example (build command or start command):
 *   MUSIXMATCH_DIRECT_TOKEN='...' npm run push:musixmatch-token && npm run server:mcp:http
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import '../utils/config.js';
import { describeKvBackend, isKvConfigured, kvSet } from '../utils/kv-store.js';

// ─── Argument parsing ─────────────────────────────────────────────────────────

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    token: { type: 'string', short: 't' },
    help: { type: 'boolean', short: 'h' }
  },
  strict: false
});

if (values.help) {
  console.log(`
push_musixmatch_token — seed Musixmatch token to all configured backends

Usage:
  MUSIXMATCH_DIRECT_TOKEN='<json_or_string>' npm run push:musixmatch-token
  npm run push:musixmatch-token -- --token '<json_or_string>'

The token value is the full musixmatchUserToken JSON payload captured by
fetch:musixmatch-token, or a raw string token.

Backends written (if configured):
  • Upstash Redis  — UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
  • Cloudflare KV  — CF_API_TOKEN + CF_ACCOUNT_ID + CF_KV_NAMESPACE_ID
  • On-disk cache  — .cache/musixmatch-token.json (or MUSIXMATCH_TOKEN_CACHE)

If MUSIXMATCH_DIRECT_TOKEN is not set and --token is not supplied, the
script exits 0 with no output (safe to chain in build/start commands).
`);
  process.exit(0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rawToken = values.token || process.env.MUSIXMATCH_DIRECT_TOKEN;

  // If no token is provided, exit silently so this can be safely chained in
  // build/start commands when the token hasn't been set yet.
  if (!rawToken) {
    return;
  }

  // Parse as JSON if possible; otherwise treat as a raw string token.
  let parsedToken;
  try {
    parsedToken = JSON.parse(rawToken);
  } catch {
    parsedToken = rawToken;
  }

  console.log('Pushing Musixmatch token to configured backends...');
  let anyFailed = false;

  // ─── On-disk cache ───────────────────────────────────────────────────────
  const cachePath =
    process.env.MUSIXMATCH_TOKEN_CACHE || path.resolve('.cache', 'musixmatch-token.json');
  try {
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ token: parsedToken }, null, 2), 'utf8');
    console.log(`  ✓ Disk cache: ${cachePath}`);
  } catch (err) {
    console.warn(`  ✗ Disk cache write failed (${err.message}) — continuing.`);
    // Not fatal; remote hosts may not have a writable FS.
  }

  // ─── KV store ─────────────────────────────────────────────────────────────
  if (isKvConfigured()) {
    const kvKey = process.env.MUSIXMATCH_TOKEN_KV_KEY || 'mr-magic:musixmatch-token';
    const kvTtl = parseInt(process.env.MUSIXMATCH_TOKEN_KV_TTL_SECONDS || '2592000', 10);
    const payload = JSON.stringify({ token: parsedToken });
    try {
      await kvSet(kvKey, payload, kvTtl);
      console.log(`  ✓ KV store (${describeKvBackend()}): key="${kvKey}", ttl=${kvTtl}s`);
    } catch (err) {
      console.error(`  ✗ KV store write failed: ${err.message}`);
      anyFailed = true;
    }
  } else {
    console.log(
      '  — KV store: not configured (set UPSTASH_REDIS_REST_URL/TOKEN or CF_* vars to enable)'
    );
  }

  if (anyFailed) {
    console.error('\n✗ One or more backends failed — see errors above.');
    process.exit(1);
  }

  console.log('\n✓ Token pushed. The server will read it from the available backend on startup.');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
