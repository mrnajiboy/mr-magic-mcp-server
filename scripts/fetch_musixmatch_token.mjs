#!/usr/bin/env node
import { chromium } from 'playwright-chromium';

const AUTH_URL =
  'https://auth.musixmatch.com/';

async function main() {
  console.log('Launching browser to acquire Musixmatch token.');
  console.log('Sign in and authorize the app once the page loads.');
  console.log('After successful login you will land on https://www.musixmatch.com/discover.');
  console.log('When that happens, this script will capture the userToken cookie.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();

  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/discover', { timeout: 0 });

  const cookies = await context.cookies('https://www.musixmatch.com');
  const userCookie = cookies.find((cookie) => cookie.name === 'musixmatchUserToken');
  const desktopCookie = cookies.find((cookie) => cookie.name === 'web-desktop-app-v1.0');
  if (!userCookie) {
    console.error('musixmatchUserToken cookie not found.');
  } else {
    const decoded = decodeURIComponent(userCookie.value);
    try {
      const parsed = JSON.parse(decoded);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (error) {
      console.log('musixmatchUserToken (raw):', decoded);
    }
  }
  if (desktopCookie) {
    console.log(`web-desktop-app-v1.0=${decodeURIComponent(desktopCookie.value)}`);
  } else {
    console.log('web-desktop-app-v1.0 cookie not found.');
  }

  await browser.close();
}

main().catch((error) => {
  console.error('Failed to fetch Musixmatch token:', error);
  process.exit(1);
});