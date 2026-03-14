#!/usr/bin/env node

const endpoint = process.env.MR_MAGIC_MCP_ENDPOINT || 'http://127.0.0.1:3444/mcp';
let sessionId = null;

async function postJsonRpc(body) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream'
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  const responseSessionId = response.headers.get('mcp-session-id');
  if (responseSessionId) {
    sessionId = responseSessionId;
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    body: parsed
  };
}

async function initializeMcp() {
  const initializeResponse = await postJsonRpc({
    jsonrpc: '2.0',
    id: 0,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-arg-boundary-repro',
        version: '0.1.0'
      }
    }
  });

  await postJsonRpc({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {}
  });

  return initializeResponse;
}

async function callMcp(id, name, args) {
  const body = {
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: {
      name,
      arguments: args
    }
  };

  return postJsonRpc(body);
}

function summarize(result) {
  const json = result.body || {};
  const isRpcError = Boolean(json?.error);
  const errorMessage = json?.error?.message || null;
  return {
    httpStatus: result.status,
    ok: result.ok,
    rpcError: isRpcError,
    errorMessage
  };
}

function printCase(name, payload, result) {
  console.log(`\n=== ${name} ===`);
  console.log('request.arguments.type:', Array.isArray(payload) ? 'array' : typeof payload);
  if (typeof payload === 'string') {
    console.log('request.arguments.length:', payload.length);
  }
  console.log('result:', JSON.stringify(summarize(result), null, 2));
  console.log('rawBody:', JSON.stringify(result.body, null, 2));
}

async function run() {
  console.log('MCP endpoint:', endpoint);
  const init = await initializeMcp();
  console.log('initialize:', JSON.stringify(summarize(init), null, 2));

  const caseAArgs = {
    track: { title: "I'LL SHOW YOU", artist: 'K/DA' },
    options: { omitInlineLyrics: true, lyricsPayloadMode: 'payload', airtableSafePayload: true }
  };
  const caseA = await callMcp(1, 'build_catalog_payload', caseAArgs);
  printCase('Case A - valid object args (recommended)', caseAArgs, caseA);

  const caseBArgs = '{"track":{"title":"I\'LL SHOW YOU","artist":"K/DA"}';
  const caseB = await callMcp(2, 'build_catalog_payload', caseBArgs);
  printCase('Case B - malformed/truncated string args', caseBArgs, caseB);

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
  const caseC = await callMcp(3, 'select_match', caseCStringArgs);
  printCase('Case C - large multiline payload via string args', caseCStringArgs, caseC);

  const caseD = await callMcp(4, 'select_match', caseCObject);
  printCase('Case D - large multiline payload via object args (safest)', caseCObject, caseD);
}

run().catch((error) => {
  console.error('Repro script failed:', error);
  process.exit(1);
});
