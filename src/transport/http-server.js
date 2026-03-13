import 'dotenv/config';
import http from 'node:http';

import { buildActionContext, buildPayloadFromResult } from '../services/lyrics-service.js';
import { findLyrics, findSyncedLyrics, searchSources, getProviderStatus } from '../index.js';
import { getSharedRedisClient } from '../utils/export-storage/shared-redis-client.js';
import { createLogger } from '../utils/logger.js';

export function normalizePayloadOptions(options = {}) {
  return {
    ...options,
    formats: options.formats ?? options.format
  };
}

async function handleAction(action, track, actionOptions) {
  if (action === 'find') {
    const result = await findLyrics(track || {}, actionOptions);
    const context = buildActionContext(actionOptions);
    return buildPayloadFromResult(result, context);
  }
  if (action === 'findSynced') {
    const result = await findSyncedLyrics(track || {}, actionOptions);
    const context = buildActionContext(actionOptions);
    return buildPayloadFromResult(result, context);
  }
  if (action === 'search') {
    return searchSources(track || {});
  }
  throw Object.assign(new Error('Unknown action'), { statusCode: 400 });
}

export function startHttpServer(options = {}) {
  const logger = createLogger('http-server');
  const host = options.remote ? '0.0.0.0' : options.host || '127.0.0.1';
  const port = Number(options.port) || 3333;

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            providers: getProviderStatus()
          })
        );
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/downloads/')) {
        const [, , downloadId, extension] = req.url.split('/');
        if (!downloadId || !extension) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid download path' }));
          return;
        }
        try {
          const redis = getSharedRedisClient();
          const key = `mr-magic:${downloadId}:${extension}`;
          const content = await redis.get(key);
          if (!content) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Export expired or missing' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(content);
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to fetch export' }));
          logger.error('Download lookup failed', { error, url: req.url });
        }
        return;
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Only POST supported' }));
        logger.warn('Rejected non-POST request', { method: req.method, url: req.url });
        return;
      }
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      let payload = {};
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        logger.warn('Invalid JSON payload', { error });
        return;
      }

      const { action, track, options: actionOptions = {} } = payload;
      try {
        const responseBody = await handleAction(action, track, normalizePayloadOptions(actionOptions));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseBody));
      } catch (error) {
        const statusCode = error.statusCode || 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
        logger.error('HTTP action handler failed', { error, action, track });
      }
    });

    server.listen(port, host, () => {
      const readyMessage = {
        jsonrpc: '2.0',
        method: 'ready',
        params: {
          transport: 'http',
          host,
          port,
          url: `http://${host}:${port}`
        }
      };
      process.stdout.write(`${JSON.stringify(readyMessage)}\n`);
      logger.info('Lyrics HTTP server listening', { host, port });
      logger.info('Provider readiness snapshot', { providers: getProviderStatus() });
      resolve(server);
    });
  });
}