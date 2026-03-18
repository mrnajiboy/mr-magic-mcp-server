#!/usr/bin/env node
import assert from 'node:assert/strict';

import { selectMatch } from '../index.js';
import { buildChooserEntries, autoPick } from '../core/find-service.js';
import {
  normalizeLyricRecord,
  detectSyncedState,
  lyricContentScore,
  countLyricLines
} from '../provider-result-schema.js';
import {
  buildPayloadFromResult,
  buildActionContext,
  catalogCacheKey,
  catalogCache
} from '../services/lyrics-service.js';
import { mcpToolDefinitions, handleMcpTool } from '../transport/mcp-tools.js';

const divider = () => console.log('\n---');

function mockRecord({
  provider,
  synced = false,
  confidence = 0.5,
  title = 'Song',
  artist = 'Artist',
  plainLyrics = synced ? null : 'plain',
  syncedLyrics = synced ? '[00:00.00] synced line\n[00:01.00] next' : null
}) {
  return {
    provider,
    result: {
      provider,
      synced,
      confidence,
      title,
      artist,
      plainLyrics,
      syncedLyrics
    }
  };
}

function testAutoPickPrefersSynced() {
  const matches = [
    mockRecord({ provider: 'plain', synced: false }),
    mockRecord({ provider: 'synced', synced: true })
  ];
  const chooser = buildChooserEntries(matches);
  const picked = autoPick(chooser, true);
  assert.equal(picked.provider, 'synced');
  divider();
  console.log('autoPick prefers synced: ok');
}

function testAutoPickFallbackWhenNoSynced() {
  const matches = [
    mockRecord({ provider: 'plainA', synced: false }),
    mockRecord({ provider: 'plainB', synced: false })
  ];
  const chooser = buildChooserEntries(matches);
  const picked = autoPick(chooser, true);
  assert.equal(picked.provider, 'plainA');
  divider();
  console.log('autoPick fallback first result: ok');
}

function testSelectMatchRespectsProviderAndSynced() {
  const matches = [
    { provider: 'lrclib', result: { synced: true } },
    { provider: 'genius', result: { synced: false } }
  ];
  const syncedOnly = selectMatch(matches, { requireSynced: true });
  assert.equal(syncedOnly.provider, 'lrclib');
  const filtered = selectMatch(matches, { providerName: 'genius' });
  assert.equal(filtered.provider, 'genius');
  divider();
  console.log('selectMatch provider/synced filtering: ok');
}

function testNormalizationDetectsSyncedState() {
  const raw = {
    provider: 'test',
    id: '1',
    trackName: 'Song',
    artistName: 'Artist',
    syncedLyrics: '[00:00.00] hi\n[00:02.00] bye',
    plainLyrics: 'hi\nbye',
    confidence: 0.5
  };
  const normalized = normalizeLyricRecord(raw);
  assert.equal(normalized.synced, true);
  assert.equal(normalized.plainOnly, false);
  const { hasSynced, timestampCount } = detectSyncedState('[00:00.00] hi');
  assert.equal(hasSynced, false);
  assert.equal(timestampCount, 1);
  divider();
  console.log('normalize/detect synced state: ok');
}

function testLyricContentScoreEmpty() {
  const empty = { plainLyrics: null, syncedLyrics: null };
  assert.equal(lyricContentScore(empty), 0, 'empty record should score 0');
  assert.equal(lyricContentScore(null), 0, 'null record should score 0');
  const blankString = { plainLyrics: '   ', syncedLyrics: '' };
  assert.equal(lyricContentScore(blankString), 0, 'whitespace-only record should score 0');
  divider();
  console.log('lyricContentScore empty records → 0: ok');
}

function testLyricContentScoreWithContent() {
  const plain = { plainLyrics: 'line one\nline two\nline three', syncedLyrics: null };
  const score = lyricContentScore(plain);
  assert.ok(score > 0, 'record with plain lyrics should score > 0');
  assert.ok(score >= 0.5, 'base score should be at least 0.5');
  divider();
  console.log('lyricContentScore with content > 0: ok');
}

function testLyricContentScoreRichness() {
  const short = { plainLyrics: 'line one', syncedLyrics: null };
  const longLines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  const long = { plainLyrics: longLines, syncedLyrics: null };
  assert.ok(
    lyricContentScore(long) > lyricContentScore(short),
    'longer lyrics should score higher'
  );
  divider();
  console.log('lyricContentScore richness (longer > shorter): ok');
}

function testCountLyricLines() {
  assert.equal(countLyricLines(null), 0, 'null input → 0');
  assert.equal(countLyricLines(''), 0, 'empty string → 0');
  assert.equal(countLyricLines('line one\nline two\nline three'), 3, 'three lines');
  // LRC timestamps should be stripped before counting
  assert.equal(
    countLyricLines('[00:01.00] first line\n[00:02.00] second line'),
    2,
    'LRC lines strip timestamps'
  );
  divider();
  console.log('countLyricLines: ok');
}

function testAutoPickPrefersContentOverEmpty() {
  // melon-like entry: found in search but lyrics not yet fetched (empty)
  const emptyMelon = {
    provider: 'melon',
    result: {
      provider: 'melon',
      synced: false,
      confidence: 0.5,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: null,
      syncedLyrics: null
    }
  };
  // genius-like entry: has actual plain lyrics
  const geniusWithLyrics = {
    provider: 'genius',
    result: {
      provider: 'genius',
      synced: false,
      confidence: 0.3,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: 'I, I was always a mean kid\nCouldnt hold my tongue',
      syncedLyrics: null
    }
  };

  // Melon comes first in the list (simulating provider priority order) but is empty
  const chooser = buildChooserEntries([emptyMelon, geniusWithLyrics]);
  const picked = autoPick(chooser, true);
  assert.equal(
    picked.provider,
    'genius',
    'content beats empty records even when empty provider is listed first'
  );
  divider();
  console.log('autoPick: content beats empty (Melon-like empty loses to Genius with lyrics): ok');
}

function testAutoPickRicherContentWins() {
  const shortLyrics = {
    provider: 'providerA',
    result: {
      provider: 'providerA',
      synced: false,
      confidence: 0.9,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: 'one line',
      syncedLyrics: null
    }
  };
  const richLyrics = {
    provider: 'providerB',
    result: {
      provider: 'providerB',
      synced: false,
      confidence: 0.1,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n'),
      syncedLyrics: null
    }
  };

  // providerA has higher confidence but fewer lines; providerB has more content
  const chooser = buildChooserEntries([shortLyrics, richLyrics]);
  const picked = autoPick(chooser, false);
  assert.equal(
    picked.provider,
    'providerB',
    'richer lyric content wins even when confidence score is lower'
  );
  divider();
  console.log('autoPick: richer content wins over higher-confidence sparse result: ok');
}

function testAutoPickSyncedWithContentBeatsSyncedEmpty() {
  const syncedEmpty = {
    provider: 'syncedEmpty',
    result: {
      provider: 'syncedEmpty',
      synced: true,
      confidence: 0.8,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: null,
      syncedLyrics: null // synced flag set but no actual lyrics string
    }
  };
  const syncedWithContent = {
    provider: 'syncedFull',
    result: {
      provider: 'syncedFull',
      synced: true,
      confidence: 0.5,
      title: 'Song',
      artist: 'Artist',
      plainLyrics: null,
      syncedLyrics: '[00:00.00] real line\n[00:02.00] another line\n[00:04.00] more'
    }
  };

  const chooser = buildChooserEntries([syncedEmpty, syncedWithContent]);
  const picked = autoPick(chooser, true);
  assert.equal(
    picked.provider,
    'syncedFull',
    'synced result with actual lyrics beats synced result with no lyrics'
  );
  divider();
  console.log('autoPick: synced+content beats synced+empty even with lower confidence: ok');
}

function testEmptyRecordNeverBecomesBest() {
  // Simulate the tryProviders bestWithContent guard directly.
  // When all candidates are metadata-only (no lyric text), bestWithContent must stay null.
  const emptyRecords = [
    { plainLyrics: null, syncedLyrics: null, synced: false, confidence: 0.5 }, // Melon stub
    { plainLyrics: '', syncedLyrics: null, synced: false, confidence: 0.3 } // empty string
  ];
  let bestWithContent = null;
  for (const candidate of emptyRecords) {
    if (lyricContentScore(candidate) > 0) {
      bestWithContent = candidate;
    }
  }
  assert.ok(
    bestWithContent === null,
    'metadata-only records must not be promoted as best — bestWithContent should remain null'
  );

  // Contrast: a record with actual text IS selected
  const withLyrics = { plainLyrics: 'line one\nline two', syncedLyrics: null, confidence: 0.1 };
  let bestWithContentFromMixed = null;
  for (const candidate of [...emptyRecords, withLyrics]) {
    if (lyricContentScore(candidate) > 0) {
      bestWithContentFromMixed = candidate;
    }
  }
  assert.ok(
    bestWithContentFromMixed === withLyrics,
    'when a content-bearing record is present, it should be promoted over empty ones'
  );

  divider();
  console.log('empty records never become best — content guard works: ok');
}

async function testBuildPayloadFromResultReturnsCacheKey() {
  // build a minimal find result with plain lyrics — no network call needed
  const best = {
    provider: 'genius',
    title: 'Cigarette',
    artist: 'Dylan Cotrone',
    plainLyrics: 'I was always a mean kid\nCould not hold my tongue',
    syncedLyrics: null,
    synced: false
  };
  const result = { matches: [{ provider: 'genius', result: best }], best };
  const context = buildActionContext({});
  const payload = await buildPayloadFromResult(result, context);

  assert.ok(
    payload.lyricsCacheKey,
    'buildPayloadFromResult should include lyricsCacheKey when best has plain lyrics'
  );
  assert.equal(typeof payload.lyricsCacheKey, 'string', 'lyricsCacheKey should be a string');

  // Verify the cache was actually populated
  const cached = catalogCache.get(payload.lyricsCacheKey);
  assert.ok(cached, 'catalog cache should have an entry for the returned key');
  assert.ok(cached.plainLyrics, 'cached entry should include plain lyrics');

  // Verify key stability — same artist/title always yields the same key
  const expectedKey = catalogCacheKey({ artist: 'Dylan Cotrone', title: 'Cigarette' });
  assert.equal(
    payload.lyricsCacheKey,
    expectedKey,
    'lyricsCacheKey should match catalogCacheKey for the track'
  );

  divider();
  console.log('buildPayloadFromResult returns lyricsCacheKey and populates cache: ok');
}

async function testBuildPayloadFromResultNoCacheKeyWhenNoLyrics() {
  const best = {
    provider: 'melon',
    title: 'Cigarette',
    artist: 'Dylan Cotrone',
    plainLyrics: null,
    syncedLyrics: null,
    synced: false
  };
  const result = { matches: [], best };
  const context = buildActionContext({});
  const payload = await buildPayloadFromResult(result, context);

  assert.ok(
    !payload.lyricsCacheKey,
    'buildPayloadFromResult should NOT include lyricsCacheKey when best has no lyrics'
  );

  divider();
  console.log('buildPayloadFromResult omits lyricsCacheKey when best has no lyrics: ok');
}

async function run() {
  testAutoPickPrefersSynced();
  testAutoPickFallbackWhenNoSynced();
  testSelectMatchRespectsProviderAndSynced();
  testNormalizationDetectsSyncedState();
  testLyricContentScoreEmpty();
  testLyricContentScoreWithContent();
  testLyricContentScoreRichness();
  testCountLyricLines();
  testAutoPickPrefersContentOverEmpty();
  testAutoPickRicherContentWins();
  testAutoPickSyncedWithContentBeatsSyncedEmpty();
  testEmptyRecordNeverBecomesBest();
  await testBuildPayloadFromResultReturnsCacheKey();
  await testBuildPayloadFromResultNoCacheKeyWhenNoLyrics();
  const toolNames = mcpToolDefinitions.map((tool) => tool.name);
  console.log('MCP tooling available:', toolNames.join(', '));
  console.log('All sanity checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
