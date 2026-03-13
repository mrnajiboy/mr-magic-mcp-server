#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import axios from 'axios';
import '../src/utils/config.js';

const TOKEN_ENDPOINT = 'https://api.genius.com/oauth/token';

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
    console.log('Token (copy into GENIUS_ACCESS_TOKEN or cache file as needed):');
    console.log(accessToken);

    const cachePath = process.env.GENIUS_TOKEN_CACHE || path.resolve('.cache', 'genius-token.json');
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(
      cachePath,
      JSON.stringify({
        access_token: accessToken,
        expires_at: Date.now() + (expiresIn || 3600) * 1000
      })
    );
    console.log(`Token cached to ${cachePath}`);
  } catch (error) {
    console.error('Failed to refresh Genius token:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
