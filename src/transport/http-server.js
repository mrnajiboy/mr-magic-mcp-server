import '../utils/config.js';
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
  const host = options.remote
    ? '0.0.0.0'
    : options.host || process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
  const port = Number(options.port) || Number(process.env.PORT) || 3333;

  // When binding to 0.0.0.0, build an allowed-host set for DNS rebinding protection.
  // Render sets RENDER_EXTERNAL_HOSTNAME automatically; add custom domains via
  // MR_MAGIC_ALLOWED_HOSTS (comma-separated).
  const allowedHosts =
    host === '0.0.0.0'
      ? new Set([
          'localhost',
          '127.0.0.1',
          ...(process.env.RENDER_EXTERNAL_HOSTNAME ? [process.env.RENDER_EXTERNAL_HOSTNAME] : []),
          ...(process.env.MR_MAGIC_ALLOWED_HOSTS
            ? process.env.MR_MAGIC_ALLOWED_HOSTS.split(',')
                .map((h) => h.trim())
                .filter(Boolean)
            : [])
        ])
      : null;

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      // DNS rebinding protection: validate Host header when binding to all interfaces.
      if (allowedHosts) {
        const reqHostname = (req.headers.host || '').split(':')[0].toLowerCase();
        if (!reqHostname || !allowedHosts.has(reqHostname)) {
          logger.warn('DNS rebinding protection: rejected request with disallowed Host', {
            host: req.headers.host,
            url: req.url,
            method: req.method
          });
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Forbidden: Host header not allowed' }));
          return;
        }
      }

      if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'ok',
            providers: await getProviderStatus()
          })
        );
        return;
      }

      if (req.method === 'GET' && req.url.startsWith('/downloads/')) {
        const segments = req.url.split('/');
        const [, , idSegment, ...rest] = segments;

        // Support two URL formats:
        //   flat:     /downloads/export-xxx.srt         → id=export-xxx, extension=srt
        //   compound: /downloads/export-xxx/romanized.srt → id=export-xxx, extension=romanized.srt
        let downloadId, extension;
        if (rest.length === 0 && idSegment && idSegment.includes('.')) {
          // Flat format – extension is appended to the id with a dot.
          const dotIdx = idSegment.lastIndexOf('.');
          downloadId = idSegment.slice(0, dotIdx);
          extension = idSegment.slice(dotIdx + 1);
        } else {
          // Compound / path-segment format.
          downloadId = idSegment;
          // Strip trailing human-readable filename (e.g. "artist-song.srt") when present.
          const hasFilename = rest.length > 1 && rest[rest.length - 1].includes('.');
          const extensionParts = hasFilename ? rest.slice(0, -1) : rest;
          extension = extensionParts.join('/') || '';
        }
        if (!downloadId || !extension) {
          logger.warn('Invalid download path', {
            context: 'http-download',
            url: req.url,
            segments
          });
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid download path' }));
          return;
        }
        try {
          const redis = getSharedRedisClient({ context: 'http-download' });
          const key = `mr-magic:${downloadId}:${extension}`;
          const content = await redis.get(key);
          if (!content) {
            logger.warn('Export download missing', {
              context: 'http-download',
              key,
              downloadId,
              extension
            });
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Export expired or missing' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(content);
          logger.info('Export download served', {
            context: 'http-download',
            key,
            downloadId,
            extension,
            bytes: Buffer.byteLength(content)
          });
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
        const responseBody = await handleAction(
          action,
          track,
          normalizePayloadOptions(actionOptions)
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responseBody));
      } catch (error) {
        const statusCode = error.statusCode || 500;
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
        logger.error('HTTP action handler failed', { error, action, track });
      }
    });

    server.listen(port, host, async () => {
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
      logger.info('Provider readiness snapshot', { providers: await getProviderStatus() });
      resolve(server);
    });
  });
}
