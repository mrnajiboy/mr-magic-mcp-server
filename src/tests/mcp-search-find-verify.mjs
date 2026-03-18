#!/usr/bin/env node
import '../utils/config.js';
import { handleMcpTool } from '../transport/mcp-tools.js';

const track = { artist: 'Dylan Cotrone', title: 'Cigarette' };

// ── find_lyrics ──────────────────────────────────────────────────────────────
console.log('=== find_lyrics ===');
const findResult = await handleMcpTool('find_lyrics', { track });
const matchSummary = (findResult.matches ?? []).map((m) => ({
  provider: m.provider,
  synced: Boolean(m.result?.synced),
  hasPlain: Boolean(m.result?.plainLyrics?.trim()),
  hasSynced: Boolean(m.result?.syncedLyrics?.trim()),
  plainLines: (m.result?.plainLyrics || '').split('\n').filter(Boolean).length
}));
console.log(`matches (${matchSummary.length}):`);
matchSummary.forEach((m) => console.log(' ', JSON.stringify(m)));
console.log('best provider:', findResult.best?.provider ?? 'none');
console.log('best hasPlain:', Boolean(findResult.best?.plainLyrics?.trim()));
console.log('best hasSynced:', Boolean(findResult.best?.syncedLyrics?.trim()));

const emptyMatches = matchSummary.filter((m) => !m.hasPlain && !m.hasSynced);
if (emptyMatches.length > 0) {
  console.error('FAIL: find_lyrics returned empty-content matches:', emptyMatches);
  process.exitCode = 1;
} else {
  console.log('PASS: all matches have lyric content');
}

// ── search_lyrics ─────────────────────────────────────────────────────────────
console.log('');
console.log('=== search_lyrics (raw catalog stubs — no hydration by design) ===');
const searchResult = await handleMcpTool('search_lyrics', { track });
for (const entry of searchResult) {
  const withContent = entry.results.filter(
    (r) => (r.plainLyrics || '').trim() || (r.syncedLyrics || '').trim()
  ).length;
  console.log(
    `  ${entry.provider}: ${entry.results.length} results, ${withContent} already have lyric text`
  );
}
console.log('NOTE: search_lyrics returns raw stubs intentionally — hydration is not applied here.');
