import assert from 'node:assert/strict';

import { mcpToolDefinitions, handleMcpTool } from '../src/transport/mcp-tools.js';

const sampleTrack = {
  title: 'Kill This Love',
  artist: 'BLACKPINK'
};

async function testToolRegistry() {
  const toolNames = mcpToolDefinitions.map((tool) => tool.name);
  const expected = [
    'find_lyrics',
    'build_catalog_payload',
    'find_synced_lyrics',
    'search_lyrics',
    'search_provider',
    'get_provider_status',
    'export_lyrics',
    'format_lyrics',
    'select_match',
    'runtime_status'
  ];
  expected.forEach((tool) => {
    assert.ok(toolNames.includes(tool), `expected tool ${tool}`);
  });
}

async function testFindLyricsTool() {
  const payload = await handleMcpTool('find_lyrics', { track: sampleTrack });
  assert.ok(payload?.best, 'find_lyrics should return best match');
}

async function testFindLyricsAllowsPartialTrack() {
  const payload = await handleMcpTool('find_lyrics', { track: { title: sampleTrack.title } });
  assert.ok(payload?.matches?.length > 0, 'find_lyrics should tolerate partial track metadata');
  const firstResult = payload.matches[0]?.result;
  assert.ok(
    firstResult && Object.prototype.hasOwnProperty.call(firstResult, 'providerId'),
    'normalized match results should expose providerId'
  );
}

async function testFindSyncedLyricsTool() {
  const payload = await handleMcpTool('find_synced_lyrics', { track: sampleTrack });
  assert.ok(payload);
}

async function testSearchProviderRequiresProvider() {
  await assert.rejects(() => handleMcpTool('search_provider', { track: sampleTrack }), /provider is required/);
}

async function testSearchProviderReturnsArray() {
  const results = await handleMcpTool('search_provider', { provider: 'lrclib', track: sampleTrack });
  assert.ok(Array.isArray(results));
}

async function testFormatLyricsShape() {
  const response = await handleMcpTool('format_lyrics', { track: sampleTrack, options: { includeSynced: false } });
  assert.ok(response?.formatted || response?.error, 'format_lyrics should format or report error');
}

async function testBuildCatalogPayload() {
  const response = await handleMcpTool('build_catalog_payload', {
    track: sampleTrack,
    options: { preferRomanized: false }
  });
  assert.ok(response?.songVideoTitle, 'catalog payload should include songVideoTitle');
  assert.ok(response?.lyrics, 'catalog payload should include lyrics');
  assert.ok(response?.provider, 'catalog payload should include provider info');
}

async function testBuildCatalogPayloadWithLyricsPayload() {
  const response = await handleMcpTool('build_catalog_payload', {
    track: sampleTrack,
    options: {
      preferRomanized: false,
      omitInlineLyrics: true,
      lyricsPayloadMode: 'payload'
    }
  });

  assert.ok(!response?.lyrics, 'inline lyrics should be omitted');
  assert.ok(response?.lyricsPayload, 'lyricsPayload bundle should exist');
  assert.equal(response.lyricsPayload.transport, 'inline');
  assert.equal(response.lyricsPayload.contentType, 'text/plain');
  assert.ok(response.lyricsPayload.preview?.length > 0, 'preview should be populated');
}

async function testBuildCatalogPayloadWithAirtableSafePayload() {
  const response = await handleMcpTool('build_catalog_payload', {
    track: sampleTrack,
    options: {
      preferRomanized: false,
      omitInlineLyrics: true,
      lyricsPayloadMode: 'payload',
      airtableSafePayload: true
    }
  });

  assert.ok(response?.lyricsPayload?.airtableEscapedContent, 'Airtable escaped content should exist');
  assert.ok(!response.lyrics, 'inline lyrics should stay omitted');
  assert.ok(response.lyricsPayload.airtableEscapedContent.includes('\\n'), 'escaped content should include literal \\n');
}

async function testSelectMatchErrors() {
  const response = await handleMcpTool('select_match', { matches: [] });
  assert.equal(response.error, 'No matches provided');
}

async function testRuntimeStatusIncludesEnvOverview() {
  const response = await handleMcpTool('runtime_status');
  assert.ok(Array.isArray(response?.providers));
  assert.ok(Array.isArray(response?.env));
}

async function run() {
  await testToolRegistry();
  await testFindLyricsTool();
  await testFindLyricsAllowsPartialTrack();
  await testFindSyncedLyricsTool();
  await testSearchProviderRequiresProvider();
  await testSearchProviderReturnsArray();
  await testFormatLyricsShape();
  await testBuildCatalogPayload();
  await testBuildCatalogPayloadWithLyricsPayload();
  await testBuildCatalogPayloadWithAirtableSafePayload();
  await testSelectMatchErrors();
  await testRuntimeStatusIncludesEnvOverview();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});