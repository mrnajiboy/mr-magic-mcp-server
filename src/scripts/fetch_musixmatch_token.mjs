#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium, firefox, webkit } from 'playwright';
import '../utils/config.js';
import { describeKvBackend, isKvConfigured, kvSet } from '../utils/kv-store.js';

const AUTH_URL = 'https://auth.musixmatch.com/';

async function saveToken(token, desktopCookie) {
  // Uses the same env var as the server runtime so both read/write the same path.
  const cachePath =
    process.env.MUSIXMATCH_TOKEN_CACHE || path.resolve('.cache', 'musixmatch-token.json');
  await mkdir(path.dirname(cachePath), { recursive: true });
  const payload = { token };
  if (desktopCookie) {
    payload.desktopCookie = desktopCookie;
  }
  await writeFile(cachePath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nToken written to cache: ${cachePath}`);
  console.log('(Local and persistent servers read this file on startup.)');
}

async function saveToKv(token, desktopCookie) {
  if (!isKvConfigured()) return;
  const kvKey = process.env.MUSIXMATCH_TOKEN_KV_KEY || 'mr-magic:musixmatch-token';
  const kvTtl = parseInt(process.env.MUSIXMATCH_TOKEN_KV_TTL_SECONDS || '2592000', 10);
  const payload = JSON.stringify({ token, ...(desktopCookie ? { desktopCookie } : {}) });
  try {
    await kvSet(kvKey, payload, kvTtl);
    console.log(`Token written to KV store (${describeKvBackend()}) under key: ${kvKey}`);
  } catch (error) {
    console.error(`Failed to write token to KV store: ${error.message}`);
  }
}

function printDeploymentBlock(tokenValue) {
  const tokenString =
    typeof tokenValue === 'string'
      ? tokenValue
      : (tokenValue?.message?.body?.usertoken ?? JSON.stringify(tokenValue));
  const kvBackend = isKvConfigured() ? describeKvBackend() : null;

  console.log('\n' + '─'.repeat(68));
  console.log('Token captured successfully!\n');

  console.log('LOCAL & PERSISTENT SERVERS (cache token)');
  console.log('  Token written to .cache/musixmatch-token.json (or MUSIXMATCH_TOKEN_CACHE).');
  console.log('  Any server with a writable, persistent filesystem (local dev, VPS,');
  console.log('  dedicated host) reads it automatically on startup.');
  console.log('  Re-run this script only when your token expires.\n');

  if (kvBackend) {
    console.log(`EPHEMERAL / NPX INSTALLS — KV STORE (${kvBackend})`);
    console.log(`  Token written to KV key "mr-magic:musixmatch-token".`);
    console.log('  The server reads it on startup automatically — no extra config needed.');
    console.log('  Re-run this script when your token expires to refresh the KV entry.\n');
  } else {
    console.log('EPHEMERAL / NPX INSTALLS — KV STORE (not configured)');
    console.log('  Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (Upstash Redis)');
    console.log('  or CF_API_TOKEN + CF_ACCOUNT_ID + CF_KV_NAMESPACE_ID (Cloudflare KV)');
    console.log('  and re-run this script to have the token stored in KV automatically.\n');
  }

  console.log('EPHEMERAL / SERVERLESS — MANUAL ENV VAR OVERRIDE');
  console.log('  Copy the token below and set it in your platform dashboard.');
  console.log('  The server reads MUSIXMATCH_DIRECT_TOKEN on startup (highest priority env var):\n');
  console.log(`  MUSIXMATCH_DIRECT_TOKEN=${tokenString}\n`);

  console.log('─'.repeat(68) + '\n');
}

function isHeadlessEnabled() {
  const value = (process.env.HEADLESS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

async function main() {
  const headless = isHeadlessEnabled();

  // Persistent browser session — stores cookies/logins between script runs so you don't
  // have to sign in again until your session actually expires.
  // Override with PLAYWRIGHT_SESSION_DIR env var if you need a different location.
  const sessionDir =
    process.env.PLAYWRIGHT_SESSION_DIR || path.resolve('.cache', 'playwright-session');
  await mkdir(sessionDir, { recursive: true });

  console.log(`Launching Playwright (headless=${headless}) to acquire Musixmatch token...`);
  console.log(`Browser session directory: ${sessionDir}\n`);

  // Try real installed browsers in priority order so Google OAuth doesn't block the
  // automated bundled Chromium.  Override with BROWSER=<name> to skip straight to one.
  //   Chromium channels : chrome, brave, msedge, comet
  //   Other engines     : firefox, safari (webkit)
  //   Last resort       : bundled Chromium (may be blocked by Google OAuth)
  //
  // launchPersistentContext() is used instead of launch() + newContext() so the browser
  // session (cookies, logins) is saved to sessionDir and reused on subsequent runs.
  const CHROMIUM_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const chromiumArgs = ['--disable-blink-features=AutomationControlled'];
  const baseOpts = { headless, slowMo: headless ? 0 : 150, viewport: { width: 1280, height: 900 } };
  const chromiumOpts = { ...baseOpts, args: chromiumArgs, userAgent: CHROMIUM_UA };

  // Each launcher returns a BrowserContext (launchPersistentContext skips browser.newContext()).
  const candidates = [
    ['chrome',          () => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts, channel: 'chrome' })],
    ['brave (channel)', () => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts, channel: 'brave' })],
    ['brave (path)',    () => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts, executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })],
    ['msedge',          () => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts, channel: 'msedge' })],
    ['comet',           () => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts, executablePath: '/Applications/Comet.app/Contents/MacOS/Comet' })],
    ['firefox',         () => firefox.launchPersistentContext(sessionDir, { ...baseOpts })],
    ['safari (webkit)', () => webkit.launchPersistentContext(sessionDir, { ...baseOpts })],
    ['bundled chromium',() => chromium.launchPersistentContext(sessionDir, { ...chromiumOpts })],
  ];

  // If BROWSER is set, move that candidate to the front.
  const browserEnv = (process.env.BROWSER || '').trim().toLowerCase();
  const orderedCandidates = browserEnv
    ? [
        ...candidates.filter(([label]) => label.startsWith(browserEnv)),
        ...candidates.filter(([label]) => !label.startsWith(browserEnv)),
      ]
    : candidates;

  let context;
  let chosenLabel;
  for (const [label, launcher] of orderedCandidates) {
    try {
      context = await launcher();
      chosenLabel = label;
      break;
    } catch (err) {
      console.warn(`  ${label} not available (${err.message?.split('\n')[0]}), trying next...`);
    }
  }

  if (!context) {
    console.error('No usable browser found. Install Chrome, Brave, Edge, Firefox, or Safari.');
    process.exit(1);
  }
  console.log(`Using browser: ${chosenLabel}`);

  // Remove the webdriver flag that Google uses to detect automated browsers.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Suppress benign COOP warning emitted by the auth page itself.
      if (text.includes('Cross-Origin-Opener-Policy')) return;
      console.error(`[browser console error] ${text}`);
    }
  });
  page.on('pageerror', (err) => console.error(`[browser page error] ${err.message}`));

  console.log(`Navigating to ${AUTH_URL} — sign in in the browser window that appears.`);
  // 'commit' fires as soon as the server response starts (before content loads), which avoids
  // ERR_ABORTED on browsers like Comet that intercept or redirect during initial navigation.
  await page.goto(AUTH_URL, { waitUntil: 'commit' });
  console.log('Waiting to be redirected to https://account.musixmatch.com/ ...');
  await page.waitForURL('https://account.musixmatch.com/**', { timeout: 0 });

  const cookies = await context.cookies('https://account.musixmatch.com');
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
  console.log('\nMusixmatch token payload:');
  console.log(JSON.stringify(parsed, null, 2));

  const decodedDesktopCookie = desktopCookie ? decodeURIComponent(desktopCookie.value) : null;

  // Write to all configured storage backends in parallel.
  await Promise.allSettled([
    saveToken(parsed, decodedDesktopCookie),
    saveToKv(parsed, decodedDesktopCookie),
  ]);

  // Extract the raw token string for the deployment hint.
  // The parsed payload is the full musixmatchUserToken JSON object; the server
  // stores and reads the entire parsed object as the `token` field.
  printDeploymentBlock(parsed);

  await context.close();
}

main().catch((error) => {
  console.error('Failed to fetch Musixmatch token:', error);
  process.exit(1);
});
