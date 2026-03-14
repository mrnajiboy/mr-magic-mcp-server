#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright-chromium';
import '../src/utils/config.js';

const AUTH_URL = 'https://auth.musixmatch.com/';

async function saveToken(token, desktopCookie) {
  const cachePath =
    process.env.MUSIXMATCH_ALT_USER_TOKEN_CACHE || path.resolve('.cache', 'musixmatch-token.json');
  await mkdir(path.dirname(cachePath), { recursive: true });
  const payload = { token };
  if (desktopCookie) {
    payload.desktopCookie = desktopCookie;
  }
  await writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Token cached to ${cachePath}`);
}

async function main() {
  console.log('Launching Playwright to acquire Musixmatch token...');
  const browser = await chromium.launch({ headless: process.env.HEADLESS !== 'false' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('Navigate to Musixmatch login and sign in.');
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });
  console.log('Waiting to be redirected to https://www.musixmatch.com/discover ...');
  await page.waitForURL('**/discover', { timeout: 0 });

  const cookies = await context.cookies('https://www.musixmatch.com');
  const userCookie = cookies.find((cookie) => cookie.name === 'musixmatchUserToken');
  const desktopCookie = cookies.find((cookie) => cookie.name === 'web-desktop-app-v1.0');
  if (!userCookie) {
    console.error('musixmatchUserToken cookie not found; ensure you completed login.');
    process.exit(1);
  }
  const decoded = decodeURIComponent(userCookie.value);
  let parsed;
  try {
    parsed = JSON.parse(decoded);
  } catch (error) {
    console.error('Unable to parse musixmatchUserToken JSON payload. Raw value:');
    console.error(decoded);
    process.exit(1);
  }
  console.log('Musixmatch token acquired:');
  console.log(JSON.stringify(parsed, null, 2));

  await saveToken(parsed, desktopCookie ? decodeURIComponent(desktopCookie.value) : null);

  await browser.close();
}

main().catch((error) => {
  console.error('Failed to fetch Musixmatch token:', error);
  process.exit(1);
});
