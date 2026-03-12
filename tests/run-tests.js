#!/usr/bin/env node
import assert from 'node:assert/strict';

import { selectMatch } from '../src/index.js';
import { buildChooserEntries, autoPick } from '../src/core/find-service.js';
import { normalizeLyricRecord, detectSyncedState } from '../src/provider-result-schema.js';
import { mcpToolDefinitions, handleMcpTool } from '../src/transport/mcp-tools.js';

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
  const matches = [mockRecord({ provider: 'plain', synced: false }), mockRecord({ provider: 'synced', synced: true })];
  const chooser = buildChooserEntries(matches);
  const picked = autoPick(chooser, true);
  assert.equal(picked.provider, 'synced');
  divider();
  console.log('autoPick prefers synced: ok');
}

function testAutoPickFallbackWhenNoSynced() {
  const matches = [mockRecord({ provider: 'plainA', synced: false }), mockRecord({ provider: 'plainB', synced: false })];
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

async function run() {
  testAutoPickPrefersSynced();
  testAutoPickFallbackWhenNoSynced();
  testSelectMatchRespectsProviderAndSynced();
  testNormalizationDetectsSyncedState();
  const toolNames = mcpToolDefinitions.map((tool) => tool.name);
  console.log('MCP tooling available:', toolNames.join(', '));
  console.log('All sanity checks passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});