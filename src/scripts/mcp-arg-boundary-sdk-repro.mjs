#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.MR_MAGIC_MCP_ENDPOINT || 'http://127.0.0.1:3444/mcp';
const debugHttp = process.env.MR_MAGIC_SDK_REPRO_HTTP_DEBUG === '1';

async function loggingFetch(input, init) {
  const response = await fetch(input, init);

  if (debugHttp) {
    const method = init?.method || 'GET';
    const url = typeof input === 'string' ? input : input?.url;
    const responseClone = response.clone();
    let responseText = '';
    try {
      responseText = await responseClone.text();
    } catch {
      responseText = '<failed to read response body>';
    }

    console.log('\n--- HTTP Debug ---');
    console.log('request:', JSON.stringify({ method, url }, null, 2));
    console.log(
      'response:',
      JSON.stringify(
        {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type'),
          mcpSessionId: response.headers.get('mcp-session-id')
        },
        null,
        2
      )
    );
    console.log('responseBodyPreview:', responseText.slice(0, 1200));
  }

  return response;
}

function summarizeSuccess(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const textBlocks = content
    .filter((block) => block?.type === 'text' && typeof block?.text === 'string')
    .map((block) => block.text);
  const firstText = textBlocks[0] || null;

  return {
    transportError: false,
    toolReportedError: Boolean(result?.isError),
    hasStructuredContent: Boolean(result?.structuredContent),
    contentBlocks: content.length,
    firstTextPreview: firstText ? firstText.slice(0, 200) : null
  };
}

function summarizeFailure(error) {
  const isStreamableHttpError = error instanceof StreamableHTTPError;
  return {
    transportError: true,
    type: error?.name || 'Error',
    message: error?.message || String(error),
    httpCode: isStreamableHttpError ? error.code : null
  };
}

function printCase(name, payload, response) {
  console.log(`\n=== ${name} ===`);
  console.log('request.arguments.type:', Array.isArray(payload) ? 'array' : typeof payload);
  if (typeof payload === 'string') {
    console.log('request.arguments.length:', payload.length);
  }

  if (response.ok) {
    console.log('summary:', JSON.stringify(summarizeSuccess(response.result), null, 2));
    console.log('rawResult:', JSON.stringify(response.result, null, 2));
    return;
  }

  console.log('summary:', JSON.stringify(summarizeFailure(response.error), null, 2));
  console.log(
    'rawError:',
    JSON.stringify(response.error, Object.getOwnPropertyNames(response.error || {}), 2)
  );
}

async function runCase(client, id, title, toolName, args) {
  try {
    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    return { ok: true, id, title, result };
  } catch (error) {
    return { ok: false, id, title, error };
  }
}

async function run() {
  console.log('MCP endpoint:', endpoint);

  const client = new Client(
    { name: 'mcp-arg-boundary-sdk-repro', version: '0.1.0' },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    fetch: loggingFetch
  });
  transport.onerror = (error) => {
    console.error('[transport.onerror]', error);
  };

  await client.connect(transport);
  console.log('connect: ok');

  const tools = await client.listTools();
  console.log(
    'listTools:',
    JSON.stringify(
      {
        toolCount: Array.isArray(tools?.tools) ? tools.tools.length : 0,
        toolNames: Array.isArray(tools?.tools) ? tools.tools.map((tool) => tool.name) : []
      },
      null,
      2
    )
  );

  const caseAArgs = {
    track: { title: "I'LL SHOW YOU", artist: 'K/DA' },
    options: { omitInlineLyrics: true, lyricsPayloadMode: 'payload', airtableSafePayload: true }
  };
  const caseA = await runCase(
    client,
    1,
    'Case A - valid object args (recommended)',
    'build_catalog_payload',
    caseAArgs
  );
  printCase(caseA.title, caseAArgs, caseA);

  const caseBArgs = '{"track":{"title":"I\'LL SHOW YOU","artist":"K/DA"}';
  const caseB = await runCase(
    client,
    2,
    'Case B - malformed/truncated string args',
    'build_catalog_payload',
    caseBArgs
  );
  printCase(caseB.title, caseBArgs, caseB);

  const longLyrics = Array.from(
    { length: 120 },
    (_, i) => `Line ${String(i + 1).padStart(3, '0')}: I'll show you ✨`
  ).join('\n');
  const caseCObject = {
    match: {
      provider: 'debug',
      result: {
        provider: 'debug',
        title: "I'LL SHOW YOU",
        artist: 'K/DA',
        plainLyrics: longLyrics
      }
    }
  };

  const caseCStringArgs = JSON.stringify(caseCObject);
  const caseC = await runCase(
    client,
    3,
    'Case C - large multiline payload via string args',
    'select_match',
    caseCStringArgs
  );
  printCase(caseC.title, caseCStringArgs, caseC);

  const caseD = await runCase(
    client,
    4,
    'Case D - large multiline payload via object args (safest)',
    'select_match',
    caseCObject
  );
  printCase(caseD.title, caseCObject, caseD);

  try {
    await transport.terminateSession();
  } catch {
    // Session termination is optional and may be unsupported in sessionless mode.
  }

  await client.close();
}

run().catch((error) => {
  console.error('SDK repro script failed:', error);
  process.exit(1);
});
