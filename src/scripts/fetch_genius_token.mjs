#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';
import '../utils/config.js';
import { describeKvBackend, isKvConfigured, kvSet } from '../utils/kv-store.js';

const TOKEN_ENDPOINT = 'https://api.genius.com/oauth/token';

function printDeploymentBlock(accessToken) {
  console.log('\n' + '─'.repeat(68));
  console.log('Token captured successfully!\n');
  console.log('RECOMMENDED: AUTO-REFRESH (no script needed on redeploy)');
  console.log('  Set GENIUS_CLIENT_ID and GENIUS_CLIENT_SECRET in your platform');
  console.log('  dashboard. The server calls the Genius OAuth endpoint at runtime');
  console.log('  and auto-refreshes the token in memory — no filesystem, no scripts.\n');
  console.log('LOCAL DEVELOPMENT (cache token)');
  console.log('  Token written to the cache file above.');
  console.log('  The server reads it on startup when a writable filesystem is available.\n');
  console.log('RENDER / EPHEMERAL DEPLOYMENTS (direct token)');
  console.log('  If you cannot use client_credentials, set the token as an env var');
  console.log('  in your platform dashboard. It acts as a static direct token:\n');
  console.log(`  GENIUS_DIRECT_TOKEN=${accessToken}\n`);
  console.log("  Note: static tokens don't auto-refresh. Redeploy with a new token");
  console.log('  if/when it expires. The client_credentials path avoids this entirely.');
  console.log('─'.repeat(68) + '\n');
}

async function main() {
  const clientId = process.env.GENIUS_CLIENT_ID;
  const clientSecret = process.env.GENIUS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error('GENIUS_CLIENT_ID and GENIUS_CLIENT_SECRET must be set in the environment.');
    process.exit(1);
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    });
    const response = await axios.post(TOKEN_ENDPOINT, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      }
    });
    const { access_token: accessToken, expires_in: expiresIn } = response.data ?? {};
    if (!accessToken) {
      console.error('Response did not include access_token:', response.data);
      process.exit(1);
    }
    console.log('Genius access token refreshed successfully.');
    console.log(`Expires in: ${expiresIn || 'unknown'} seconds`);

    // Uses the same env var as the server runtime so both read/write the same path.
    const cachePath = process.env.GENIUS_TOKEN_CACHE || path.resolve('.cache', 'genius-token.json');
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify({
        access_token: accessToken,
        expires_at: Date.now() + (expiresIn || 3600) * 1000
      })
    );
    console.log(`\nCache token written to: ${cachePath}`);
    console.log('(The server reads this file on startup when a writable filesystem is available.)');

    // Write to KV store if configured (ephemeral hosts, npx installs).
    if (isKvConfigured()) {
      const kvKey = process.env.GENIUS_TOKEN_KV_KEY || 'mr-magic:genius-token';
      const kvTtl = parseInt(process.env.GENIUS_TOKEN_KV_TTL_SECONDS || '3600', 10);
      const kvPayload = JSON.stringify({
        access_token: accessToken,
        expires_at: Date.now() + (expiresIn || 3600) * 1000
      });
      try {
        await kvSet(kvKey, kvPayload, kvTtl);
        console.log(`Token written to KV store (${describeKvBackend()}) under key: ${kvKey}`);
      } catch (err) {
        console.warn(`Failed to write token to KV store: ${err.message}`);
      }
    }

    printDeploymentBlock(accessToken);
  } catch (error) {
    console.error('Failed to refresh Genius token:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
