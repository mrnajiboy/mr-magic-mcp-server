# Mr. Magic MCP Server

[![npm version](https://img.shields.io/npm/v/mr-magic-mcp-server.svg)](https://www.npmjs.com/package/mr-magic-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/mr-magic-mcp-server.svg)](https://www.npmjs.com/package/mr-magic-mcp-server)
[![Socket Badge](https://socket.dev/api/badge/npm/package/mr-magic-mcp-server)](https://socket.dev/npm/package/mr-magic-mcp-server)

Mr. Magic bridges LRCLIB, Genius, Musixmatch, and Melon so MCP clients, JSON HTTP
automations, and CLI aficionados can all request lyrics from a single toolchain.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Provider Credentials](#provider-credentials)
- [Export and Download Configuration](#export-and-download-configuration)
- [Local Deployment](#local-deployment)
- [Remote Deployment](#remote-deployment)
- [HTTP Endpoints](#http-endpoints)
- [MCP Tools](#mcp-tools)
- [Airtable Integration](#airtable-integration)
- [MCP Client Configuration](#mcp-client-configuration)
- [CLI](#cli)
- [Manual Testing](#manual-testing)
- [Provider Notes](#provider-notes)
- [Changelog](#changelog)
- [License](#license)

## Prerequisites

- Node.js 18.17 or newer
- npm 9+
- macOS / Linux / WSL
- Provider credentials (see [Provider Credentials](#provider-credentials))

## Installation

Mr. Magic publishes four named binaries through npm:

| Binary            | Transport                              | Default port |
| ----------------- | -------------------------------------- | ------------ |
| `mcp-server`      | MCP stdio                              | n/a (stdio)  |
| `mcp-http-server` | MCP Streamable HTTP & SSE + legacy SSE | `3444`       |
| `http-server`     | JSON HTTP automation                   | `3333`       |
| `mrmagic-cli`     | CLI                                    | n/a          |

Choose the option that matches how you'll use Mr. Magic.

---

### Option 1 — Local clone (recommended for persistent use)

Cloning the repo is the **simplest setup for local MCP clients** (Cline, Claude Desktop, etc.)
and for anyone who wants to use all features without extra ceremony.
Credentials live in a local `.env` file — no need to inject every variable through an MCP client
config. Token fetch scripts, the Playwright workflow, and local export storage all work out of the box.

1. Clone and install:

   ```bash
   git clone https://github.com/mrnajiboy/mr-magic-mcp-server.git
   cd mr-magic-mcp-server
   npm install
   ```

2. Create a `.env` file (copy `.env.example` as a starting point) and fill in your credentials.
   See [Environment Variables](#environment-variables) for the full list.

3. Run the desired entrypoint:

   | What you want                      | Command                           |
   | ---------------------------------- | --------------------------------- |
   | MCP stdio (local MCP clients)      | `node src/bin/mcp-server.js`      |
   | MCP Streamable HTTP & SSE (remote) | `node src/bin/mcp-http-server.js` |
   | JSON HTTP automation               | `node src/bin/http-server.js`     |
   | CLI                                | `node src/bin/cli.js --help`      |

   Or use the npm scripts:

   ```bash
   npm run server:mcp        # MCP stdio
   npm run server:mcp:http   # MCP Streamable HTTP & SSE — 127.0.0.1:3444
   npm run server:http       # JSON HTTP — 127.0.0.1:3333
   npm run cli -- --help     # CLI
   ```

   > ⚠️ **Stdio MCP clients:** Do not use `npm run server:mcp` in your MCP client config.
   > Use `node src/bin/mcp-server.js` directly. The npm script preamble is written to stdout
   > before Node starts and causes `"Unexpected token '>'"` JSON-RPC errors on every connection.

See [MCP Client Configuration → Local repo](#local-repo--cline) for the client config snippets.

---

### Option 2 — npx (no clone, ephemeral or CI use)

`npx` is useful for quick one-off runs or CI contexts, but has an important limitation:
**the spawned process cannot read a local `.env` file** — every credential must be passed
as an environment variable in the shell or in your MCP client's `env` block.

This package publishes **multiple binaries**, so you must always specify which one you want
using `--package` and then the binary name. `npx -y mr-magic-mcp-server` is **not valid**
for this package — it would error because no binary named `mr-magic-mcp-server` exists.

#### MCP stdio server (for MCP client config)

```bash
# Shell (test only — real credentials come from MCP client env block)
MR_MAGIC_QUIET_STDIO=1 \
GENIUS_CLIENT_ID=your_id \
GENIUS_CLIENT_SECRET=your_secret \
MUSIXMATCH_DIRECT_TOKEN='...' \
  npx -y --package mr-magic-mcp-server mcp-server
```

For MCP clients (Cline, Claude Desktop, etc.), put credentials in the `env` block of your
config — see [MCP Client Configuration → npx](#npx-no-clone-required).

#### MCP Streamable HTTP & SSE server (for remote / browser-based MCP clients)

```bash
# Streamable HTTP & SSE — listens on port 3444, endpoint: /mcp
GENIUS_CLIENT_ID=your_id \
GENIUS_CLIENT_SECRET=your_secret \
MUSIXMATCH_DIRECT_TOKEN='...' \
  npx -y --package mr-magic-mcp-server mcp-http-server
```

Connect your client to `http://localhost:3444/mcp` (or your public URL + `/mcp`).

The same server exposes the **legacy SSE** endpoints for older clients:

- `GET  /sse` — opens the event stream
- `POST /messages?sessionId=...` — sends JSON-RPC messages

Both protocols run on the same port simultaneously — no extra config needed.

#### JSON HTTP automation server

```bash
# JSON HTTP — listens on port 3333, endpoint: POST /
GENIUS_CLIENT_ID=your_id \
GENIUS_CLIENT_SECRET=your_secret \
MUSIXMATCH_DIRECT_TOKEN='...' \
  npx -y --package mr-magic-mcp-server http-server
```

#### CLI

```bash
# Run a one-off CLI command
GENIUS_CLIENT_ID=your_id \
  npx -y --package mr-magic-mcp-server mrmagic-cli find --artist "Coldplay" --title "Yellow"
```

#### npx reference — all entrypoints

| What you want                    | Command                                                   |
| -------------------------------- | --------------------------------------------------------- |
| MCP stdio                        | `npx -y --package mr-magic-mcp-server mcp-server`         |
| MCP Streamable HTTP & SSE (+SSE) | `npx -y --package mr-magic-mcp-server mcp-http-server`    |
| JSON HTTP automation             | `npx -y --package mr-magic-mcp-server http-server`        |
| CLI                              | `npx -y --package mr-magic-mcp-server mrmagic-cli --help` |

---

### Option 3 — Global install (binaries always on PATH)

```bash
npm install -g mr-magic-mcp-server

mcp-server           # MCP stdio server
mcp-http-server      # Streamable HTTP & SSE MCP server (+ legacy SSE on same port)
http-server          # JSON HTTP automation server
mrmagic-cli --help   # CLI
```

When the binary is launched by an MCP client, it does **not** automatically read a `.env` file
unless you point to one via `MR_MAGIC_ENV_PATH`. Either pass credentials through the client
`env` block or set them as system/user environment variables.

---

### Musixmatch token for npx / ephemeral / headless installs

When running via `npx`, on Render free tier, or on any server without a browser or
persistent filesystem, the Musixmatch token cannot be captured via Playwright there.
The workflow is:

1. **Capture the token locally** (one-time on any machine with a browser):

   ```bash
   git clone https://github.com/mrnajiboy/mr-magic-mcp-server.git
   cd mr-magic-mcp-server && npm install
   npm run fetch:musixmatch-token
   ```

   After signing in, the script prints the full token JSON payload.
   Copy the entire printed JSON object (the `MUSIXMATCH_DIRECT_TOKEN=...` line).

2. **Push to KV** so the server can read it on every cold start.
   Set up Upstash Redis (free tier at [console.upstash.com](https://console.upstash.com/redis))
   and run the push script with KV credentials. No browser needed:

   ```bash
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token \
   MUSIXMATCH_DIRECT_TOKEN='<paste token JSON here>' \
     npm run push:musixmatch-token
   ```

3. **Start the server** with the same Upstash credentials — it reads the token from
   KV on every cold start (no `MUSIXMATCH_DIRECT_TOKEN` needed when KV is configured):

   ```bash
   GENIUS_DIRECT_TOKEN=... \
   UPSTASH_REDIS_REST_URL=https://xxx.upstash.io \
   UPSTASH_REDIS_REST_TOKEN=your_upstash_token \
     npx -y --package mr-magic-mcp-server mcp-http-server
   ```

4. Re-run steps 1–2 only when the Musixmatch token expires (typically ~30 days).

#### Musixmatch on Render (headless, no SSH)

On Render free tier you cannot SSH in or open a browser. The recommended pattern is:

1. Run `npm run fetch:musixmatch-token` locally, copy the token JSON from the output.

2. In the Render Dashboard → **Environment** tab, set:
   - `MUSIXMATCH_DIRECT_TOKEN` = `<your token JSON>` _(used as both push source and runtime override)_
   - `UPSTASH_REDIS_REST_URL` = your Upstash endpoint
   - `UPSTASH_REDIS_REST_TOKEN` = your Upstash token

3. Set the Render **Start Command** to:

   ```
   npm run push:musixmatch-token && npm run server:mcp:http
   ```

   On every (re)start, the token is pushed to Upstash then the server reads it
   from KV. If `MUSIXMATCH_DIRECT_TOKEN` is unset the push step is a silent no-op.

4. When the token expires: update `MUSIXMATCH_DIRECT_TOKEN` from a fresh local
   `fetch:musixmatch-token` run, trigger a redeploy on Render. Done.

> **Genius on ephemeral hosts:** Genius does not need this flow.
> Set `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` instead — the server calls the
> Genius OAuth `client_credentials` endpoint at runtime, auto-refreshes the token
> in memory, and never needs a browser, a KV store, or a captured session token.

## Environment Variables

Copy `.env.example` to `.env` (or inject via your platform dashboard). Variables are
grouped below by purpose.

### Genius credentials

| Variable               | Description                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GENIUS_CLIENT_ID`     | OAuth client ID for auto-refresh (recommended). Get from [genius.com/api-clients](https://genius.com/api-clients). |
| `GENIUS_CLIENT_SECRET` | OAuth client secret for auto-refresh (recommended).                                                                |
| `GENIUS_DIRECT_TOKEN`  | Static direct bearer token. Used when client credentials are unavailable.                                          |

Token resolution order (first match wins):

1. In-memory runtime cache
2. Auto-refresh via `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` ← **recommended**
3. `GENIUS_DIRECT_TOKEN` env var (static, no auto-refresh)
4. KV store — Upstash Redis or Cloudflare KV (written automatically by auto-refresh)
5. On-disk `.cache/genius-token.json` (local dev only)

### Musixmatch credentials

| Variable                          | Description                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `MUSIXMATCH_DIRECT_TOKEN`         | Static bearer token. Recommended for production / ephemeral hosts. Also used as push source by `push:musixmatch-token`. |
| `MUSIXMATCH_TOKEN_KV_KEY`         | KV key name for the token store. Default: `mr-magic:musixmatch-token`.                                                  |
| `MUSIXMATCH_TOKEN_KV_TTL_SECONDS` | Token TTL in the KV store (seconds). Default: `2592000` (30 days).                                                      |
| `MUSIXMATCH_TOKEN_CACHE`          | Path to the on-disk cache file. Default: `.cache/musixmatch-token.json`.                                                |
| `MUSIXMATCH_AUTO_FETCH`           | Set to `1` to attempt headless token re-fetch when no token is found.                                                   |

Token resolution order (first match wins):

1. **Env var** — `MUSIXMATCH_DIRECT_TOKEN`
2. **KV store** — Upstash Redis (priority 1) or Cloudflare KV (priority 2)
3. **On-disk cache** — `.cache/musixmatch-token.json` (local dev / persistent servers)

### Export and storage

| Variable                            | Default    | Description                                                                                                                    |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MR_MAGIC_EXPORT_BACKEND`           | `local`    | Storage backend: `local` \| `inline` \| `redis`.                                                                               |
| `MR_MAGIC_EXPORT_DIR`               | `exports/` | Absolute path for local exports. Required when backend is `local`.                                                             |
| `MR_MAGIC_EXPORT_TTL_SECONDS`       | `3600`     | TTL for `local` and `redis` backends (ignored for `inline`).                                                                   |
| `MR_MAGIC_DOWNLOAD_BASE_URL`        | _(none)_   | Public base URL for download links, e.g. `https://lyrics.example.com`.                                                         |
| `MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS` | `1500`     | Character threshold at which `build_catalog_payload` auto-promotes to `reference` transport when `omitInlineLyrics` is `true`. |
| `UPSTASH_REDIS_REST_URL`            | —          | Upstash Redis KV backend URL. Also used by the export backend when `MR_MAGIC_EXPORT_BACKEND=redis` — set once, used for both.  |
| `UPSTASH_REDIS_REST_TOKEN`          | —          | Upstash Redis KV bearer token. Takes precedence over Cloudflare KV when both are set.                                          |
| `CF_API_TOKEN`                      | —          | Cloudflare API token with `KV:Edit` permission (Cloudflare KV backend).                                                        |
| `CF_ACCOUNT_ID`                     | —          | Cloudflare account ID (Cloudflare KV backend).                                                                                 |
| `CF_KV_NAMESPACE_ID`                | —          | Cloudflare KV namespace ID (Cloudflare KV backend).                                                                            |

### Server and runtime

| Variable                   | Default          | Description                                                                                                                                                                                                            |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3444` / `3333`  | Override server port. On Render this is set automatically (default `10000`).                                                                                                                                           |
| `LOG_LEVEL`                | `info`           | Verbosity: `error` \| `warn` \| `info` \| `debug`.                                                                                                                                                                     |
| `MR_MAGIC_QUIET_STDIO`     | `0`              | Set to `1` to suppress non-error stdout logs (forces `LOG_LEVEL=error`). Recommended under stdio MCP clients.                                                                                                          |
| `MR_MAGIC_HTTP_TIMEOUT_MS` | `10000`          | Global outbound HTTP timeout in milliseconds.                                                                                                                                                                          |
| `MR_MAGIC_ROOT`            | _(project root)_ | Override the project root used for `.env` and `.cache` path resolution.                                                                                                                                                |
| `MR_MAGIC_ENV_PATH`        | _(auto)_         | Point to a specific `.env` file instead of `<project root>/.env`.                                                                                                                                                      |
| `MR_MAGIC_ALLOWED_HOSTS`   | _(empty)_        | Comma-separated extra hostnames allowed for DNS rebinding protection when binding to `0.0.0.0`. `RENDER_EXTERNAL_HOSTNAME` is included automatically on Render. Only needed for custom domains.                        |
| `MR_MAGIC_SESSIONLESS`     | `0`              | Set to `1` to force **sessionless mode** on the MCP Streamable HTTP & SSE server — each request is handled by a fresh, temporary server/transport with no in-memory session state. Auto-enabled on Render (see below). |

### Airtable

| Variable                         | Description                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AIRTABLE_PERSONAL_ACCESS_TOKEN` | Required for `push_catalog_to_airtable`. Generate at [airtable.com/create/tokens](https://airtable.com/create/tokens) with `data.records:write` scope. |

### Melon

| Variable       | Description                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `MELON_COOKIE` | Optional. Pin a session cookie for consistent results. Anonymous access generally works without it. |

### Diagnostics and debugging

| Variable                        | Default | Description                                                                                  |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `MR_MAGIC_MCP_HTTP_DIAGNOSTICS` | `0`     | Set to `1` to log enriched request metadata at the Streamable HTTP & SSE transport boundary. |
| `MR_MAGIC_LOG_TOOL_ARGS_CHUNKS` | `0`     | Set to `1` to emit chunk-by-chunk MCP tool argument previews for truncation debugging.       |
| `MR_MAGIC_TOOL_ARG_CHUNK_SIZE`  | `400`   | Chunk size (chars) used when chunk logging is enabled.                                       |
| `MR_MAGIC_SDK_REPRO_HTTP_DEBUG` | `0`     | Set to `1` for verbose HTTP traces in the SDK repro harness script.                          |

## Provider Credentials

### Genius

Genius credentials are resolved in this order — the first available source wins:

1. **Auto-refresh** (`GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET`) — the server calls
   the Genius OAuth `client_credentials` endpoint at runtime and keeps the token
   refreshed in memory. **Recommended for all deployments**, including Render and
   ephemeral hosts. No disk, no scripts, no manual token copying.

2. **Direct token** (`GENIUS_DIRECT_TOKEN`) — a static bearer token. Works
   everywhere but does not auto-refresh. Update by redeploying with a new value.

3. **Cache token** (`.cache/genius-token.json`) — written by `npm run fetch:genius-token`.
   Only suitable for local dev with a persistent filesystem.

### Musixmatch

Musixmatch uses a captured browser session token. There is no OAuth callback.

**For production / ephemeral hosts (Render, containers):**

Set `MUSIXMATCH_DIRECT_TOKEN` directly in your environment. This is the highest-priority
env var option and the only reliable one when the filesystem may be wiped between restarts.

**For local development:**

Run the fetch script once — it opens a Playwright-controlled Chromium window, signs
you in, and writes the token to `.cache/musixmatch-token.json`:

```bash
npm run fetch:musixmatch-token
```

The workflow:

1. Run the script on any machine that can open a browser.
2. Sign in with Musixmatch (Google sign-in works) when prompted.
3. After the redirect to `https://www.musixmatch.com/discover`, the script prints
   the captured token and writes the cache file.
4. **For remote deployments:** copy the `token` value from the printed JSON and set
   it as `MUSIXMATCH_DIRECT_TOKEN` in your platform environment. Do **not** rely on
   the cache file surviving restarts on ephemeral hosts.

> **Developer accounts:** Get API access from [developer.musixmatch.com](https://developer.musixmatch.com)
> and set the resulting token as `MUSIXMATCH_DIRECT_TOKEN`.
>
> **Public accounts:** Visit [auth.musixmatch.com](https://auth.musixmatch.com), sign in,
> and capture the token using the script above.
>
> ⚠️ **WARNING:** Calling the API from an unauthorized account may result in a ban.

### Melon

Fetching Melon endpoints works anonymously. If `MELON_COOKIE` is blank, the server
requests session cookies automatically. Set `MELON_COOKIE` to a complete cookie header
string only when you need pinned, reproducible sessions.

## Export and Download Configuration

The `MR_MAGIC_EXPORT_BACKEND` variable controls where formatted lyrics are stored:

- **`local`** (default) — writes files to `MR_MAGIC_EXPORT_DIR` (or `exports/` when
  unset). Make sure the target directory is writable. The `export_lyrics` tool also
  returns the raw `content` field so clients can inline results when file writes fail.

- **`inline`** — skips disk writes entirely. Each export is returned in the tool
  response with `content` populated and `skipped: true` to signal that persistence
  was intentionally bypassed.

- **`redis`** — stores exports in Upstash. Requires `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`, and `MR_MAGIC_DOWNLOAD_BASE_URL`.

For Redis exports, `MR_MAGIC_DOWNLOAD_BASE_URL` must be the publicly reachable base URL
of the server that will serve the download links (not the Upstash URL),
e.g. `https://lyrics.example.com`. Download links are built as
`{base_url}/downloads/{id}/{ext}`.

Both HTTP servers serve `/downloads/:id/:ext` routes:

- **`server:mcp:http`** (port `3444`) — the Streamable HTTP & SSE MCP server includes its
  own `/downloads` route. If you are already running this server, no additional HTTP
  server is needed for Redis exports on Render or any remote deployment.
- **`server:http`** (port `3333`) — the JSON HTTP automation server also exposes the
  same route and remains the right choice if you are running `server:mcp` (stdio) only
  or want a standalone HTTP service for download links.

For local testing against the MCP HTTP server:

```bash
MR_MAGIC_DOWNLOAD_BASE_URL=http://127.0.0.1:3444
```

Or against the JSON HTTP server:

```bash
MR_MAGIC_DOWNLOAD_BASE_URL=http://127.0.0.1:3333
```

## Local Deployment

Run whichever entrypoint you need via npm scripts:

```bash
npm run server:http        # JSON HTTP automation — 127.0.0.1:3333 by default
npm run server:mcp         # MCP stdio transport   — ideal for local MCP clients
npm run server:mcp:http    # Streamable HTTP & SSE MCP   — 127.0.0.1:3444 by default
npm run cli -- --help      # CLI entrypoint
```

Set provider tokens via `.env` before running. `dotenv` dependency is for local convenience only —
production environments should inject vars directly.

## Remote Deployment

Install dependencies and start the desired transport:

```bash
npm ci
npm run server:mcp:http    # or server:http / server:mcp
```

Use a process manager (systemd, PM2, Docker `CMD`, etc.) to keep servers running.

### Deploying on Render

Both HTTP servers (`server:mcp:http` and `server:http`) are ready for Render with
no extra network configuration. Render automatically sets:

| Variable                   | Value                                                  |
| -------------------------- | ------------------------------------------------------ |
| `RENDER`                   | `"true"`                                               |
| `PORT`                     | `10000` (default; overridable in the Render Dashboard) |
| `RENDER_EXTERNAL_HOSTNAME` | Your service hostname, e.g. `myapp.onrender.com`       |

When `RENDER=true` is detected, the server binds to `0.0.0.0` automatically and reads
the platform-assigned `PORT`. No manual `HOST` or `PORT` configuration is needed.

The `RENDER_EXTERNAL_HOSTNAME` is automatically added to the DNS rebinding `allowedHosts`
list so the MCP SDK does not emit host-validation warnings.

Recommended Render service settings:

- **Start Command:** `npm run server:mcp:http`
- **Environment:** set provider credentials (`GENIUS_CLIENT_ID`, `GENIUS_CLIENT_SECRET`,
  `MUSIXMATCH_DIRECT_TOKEN`, etc.) in the Render Dashboard → Environment tab
- **Health Check Path:** `/health` (returns `{ "status": "ok", "providers": [...] }`)

> For custom domains, add them to `MR_MAGIC_ALLOWED_HOSTS` (comma-separated) in
> your Render environment so the DNS rebinding protection accepts requests with
> those `Host` headers.

#### Sessionless mode on Render (automatic)

When `RENDER=true` is detected, the MCP Streamable HTTP & SSE server automatically operates
in **sessionless mode**. This is essential for multi-instance deployments where Render
routes requests across several processes:

- An `initialize` request served by **Instance A** would store the session in A's
  in-memory `Map`. A follow-up `tools/list` call routed to **Instance B** cannot
  find that session and returns `{"error": "Session not found. …"}`.
- In sessionless mode, every request — `initialize`, `tools/list`, `tools/call`, etc.
  — is handled by a fresh, short-lived `Server + StreamableHTTPServerTransport` pair.
  No `Mcp-Session-Id` header is issued and no session state is stored. Each request
  is fully self-contained and works correctly regardless of which instance handles it.

You do **not** need to set `MR_MAGIC_SESSIONLESS=1` manually on Render — it is
auto-enabled via the platform-injected `RENDER` env var. Set `MR_MAGIC_SESSIONLESS=1`
explicitly on other multi-instance platforms (ECS, Fly.io, Railway, etc.) where
a similar load-balanced, stateless deployment is used.

### Transport selection

| Transport                 | Command                   | Use case                            |
| ------------------------- | ------------------------- | ----------------------------------- |
| MCP stdio                 | `npm run server:mcp`      | Local MCP clients that speak stdio  |
| MCP Streamable HTTP & SSE | `npm run server:mcp:http` | Remote MCP clients                  |
| JSON HTTP automation      | `npm run server:http`     | Container / remote automations      |
| CLI                       | `npm run cli`             | Ad-hoc / SSH / CI one-shot commands |

## HTTP Endpoints

Both HTTP servers expose a set of plain HTTP routes in addition to their primary
transports. These are accessible without any MCP or JSON-RPC framing.

| Endpoint              | Method            | Server                 | Description                                                                                                                                                   |
| --------------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`             | `GET`             | Both                   | Liveness / readiness probe. Returns `{ "status": "ok", "providers": [...] }`.                                                                                 |
| `/downloads/:id/:ext` | `GET`             | Both                   | Serve a Redis-backed export by ID and file extension (e.g. `plain`, `lrc`, `srt`). Returns `200 text/plain` on hit, `404` when the key is expired or missing. |
| `/mcp`                | `POST/GET/DELETE` | `server:mcp:http` only | MCP **Streamable HTTP & SSE** transport endpoint (JSON-RPC 2.0). Each `initialize` request creates an independent session — reconnects work correctly.        |
| `/sse`                | `GET`             | `server:mcp:http` only | MCP **legacy SSE** transport. Opens a server-sent event stream. For MCP clients that use the pre-Streamable HTTP & SSE protocol.                              |
| `/messages`           | `POST`            | `server:mcp:http` only | Companion to `/sse`. Routes JSON-RPC messages to the correct SSE session via `?sessionId=` query param.                                                       |
| `/`                   | `POST`            | `server:http` only     | JSON HTTP automation endpoint (action-based API).                                                                                                             |

### `/health`

Both servers respond to `GET /health` with a JSON object indicating overall status
and per-provider readiness. Use this as your Render (or container / load-balancer)
health check path.

**Response shape:**

```json
{
  "status": "ok",
  "providers": [
    { "name": "lrclib", "status": "ok" },
    { "name": "genius", "status": "ok" },
    { "name": "musixmatch", "status": "missing_token" },
    { "name": "melon", "status": "ok" }
  ]
}
```

**MCP HTTP server** (default port `3444`):

```bash
curl -sS http://127.0.0.1:3444/health | jq
```

**JSON HTTP server** (default port `3333`):

```bash
curl -sS http://127.0.0.1:3333/health | jq
```

Provider `status` values:

| Value           | Meaning                                                        |
| --------------- | -------------------------------------------------------------- |
| `ok`            | Provider is configured and reachable.                          |
| `missing_token` | Required credential env var is not set.                        |
| `error`         | Provider returned an unexpected error during the status probe. |

### `/downloads/:id/:ext`

Serves a Redis-backed export file by its download ID and format extension. Both
servers expose this route so the same `MR_MAGIC_DOWNLOAD_BASE_URL` works regardless
of which server you are running.

**Parameters:**

- `:id` — the opaque download ID returned in the `url` field of an export response
- `:ext` — the file format: `plain`, `lrc`, `srt`, or `romanized`

**Example** (MCP HTTP server):

```bash
curl -sS http://127.0.0.1:3444/downloads/coldplay-yellow-1741234567890/plain
```

**Example** (JSON HTTP server):

```bash
curl -sS http://127.0.0.1:3333/downloads/coldplay-yellow-1741234567890/plain
```

Responses:

- `200 text/plain` — export content served directly
- `404` — key expired or never written (`MR_MAGIC_EXPORT_TTL_SECONDS` controls TTL,
  default `3600` seconds)
- `400` — malformed path (missing ID or extension)
- `500` — Redis lookup error

> Requires `MR_MAGIC_EXPORT_BACKEND=redis` and valid `UPSTASH_*` credentials.
> For local and inline backends, exports are returned directly in the tool response
> and this route is not used.

## MCP Tools

Both the stdio and Streamable HTTP & SSE transports expose the same tool registry:

| Tool                       | Purpose                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `find_lyrics`              | Fetch best lyrics (prefers synced) plus metadata and payload.                                                                       |
| `find_synced_lyrics`       | Like `find_lyrics` but rejects plain-only results.                                                                                  |
| `search_lyrics`            | List candidate matches across all providers without downloading lyrics.                                                             |
| `search_provider`          | Query a single named provider.                                                                                                      |
| `get_provider_status`      | Report readiness and notes for each provider.                                                                                       |
| `format_lyrics`            | Format lyrics in memory (optional romanization) for display.                                                                        |
| `export_lyrics`            | Write plain / LRC / SRT / romanized files to the export backend.                                                                    |
| `select_match`             | Pick a prior result by provider, index, or synced flag.                                                                             |
| `build_catalog_payload`    | Return a compact record (title / link / lyrics) for Airtable-style inserts.                                                         |
| `push_catalog_to_airtable` | Write catalog records to Airtable server-side — lyrics never pass through LLM arguments. Requires `AIRTABLE_PERSONAL_ACCESS_TOKEN`. |
| `runtime_status`           | Snapshot provider readiness plus relevant env vars.                                                                                 |

## Airtable Integration

Mr. Magic routes lyrics entirely server-side so long lyric text never passes through
LLM tool-call arguments. This eliminates the JSON truncation and malformed-request
errors that occur when multiline Korean / CJK lyrics are interpolated into payloads.

### How it works

1. **Call `build_catalog_payload`** for each song. The response contains a
   `lyricsCacheKey` (e.g. `kda-ill-show-you`) that identifies the resolved lyrics
   in the server's in-memory LRU cache (20 entries, shared across the MCP session).

2. **Create Airtable records** (Song title, Spotify link, etc.) using your Airtable
   MCP's bulk create tools (up to 10 records per call). Capture the `recordId`
   returned for each created record.

3. **Call `push_catalog_to_airtable`** with `recordId`, `lyricsFieldId`, and
   `lyricsCacheKey`. The server looks up the cached lyrics and calls the Airtable
   REST API directly. Lyric text **never leaves the server process** as an MCP argument.

### `push_catalog_to_airtable` call shape

```json
{
  "baseId": "appeBUkVEp3N4RT0C",
  "tableId": "tbl0y5XHFXpjUJXHu",
  "recordId": "rec1234567890abcd",
  "fields": {},
  "lyricsFieldId": "fldHV1qmPYmsvglff",
  "lyricsCacheKey": "kda-ill-show-you",
  "preferRomanized": true
}
```

Set `"splitLyricsUpdate": true` when the combined create + lyrics payload is too large —
this forces a two-step create → PATCH so the full payload is never sent in one request.

### Bundled prompt template

`prompts/airtable-song-importer.md` (shipped in the source package) is a ready-to-use
system prompt for MCP assistants that bulk-import songs into Airtable. It covers:

- Phased execution: resolve → bulk create → write lyrics → SRT export
- Bulk record creation up to 10 records per Airtable MCP call
- Spotify link resolution via the Spotify MCP
- Romanized lyric priority for K-pop / CJK content
- `splitLyricsUpdate` fallback for oversized payloads

Copy the file contents into your MCP client's system prompt to deploy immediately.

### Safe lyric payload handoff

To avoid embedding raw lyric text in tool-call arguments, request a structured payload:

```json
{
  "track": { "artist": "K/DA", "title": "I'll Show You" },
  "options": {
    "omitInlineLyrics": true,
    "lyricsPayloadMode": "payload"
  }
}
```

Option reference:

- `omitInlineLyrics: true` — removes `lyrics`, `plainLyrics`, and `romanizedPlainLyrics`
  from the response, keeping it compact.
- `lyricsPayloadMode: "payload"` — adds a `lyricsPayload` object with the full text
  inline (`transport: "inline"`). May auto-promote to `"reference"` for long lyrics when
  `omitInlineLyrics` is also `true`.
- `lyricsPayloadMode: "reference"` — stores lyrics via the export backend and returns
  a `lyricsPayload.reference` object with `filePath` or `url` instead of raw text.
- `airtableSafePayload: true` — adds `lyricsPayload.airtableEscapedContent` (quotes /
  backslashes / newlines pre-escaped) and prefers compact / reference-style handoff.

**Important:** `tools/call.params.arguments` must be a plain JSON object. Do not
pre-serialize arguments into a string — `build_catalog_payload` and `select_match`
reject stringified payloads.

### Calling patterns

Preferred (MCP SDK):

```js
await client.callTool({
  name: 'build_catalog_payload',
  arguments: {
    track: { artist: 'K/DA', title: "I'll Show You" },
    options: { omitInlineLyrics: true, lyricsPayloadMode: 'payload', airtableSafePayload: true }
  }
});
```

Also valid (raw `fetch`, object-based):

```js
await fetch('http://127.0.0.1:3444/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'build_catalog_payload',
      arguments: {
        track: { artist: 'K/DA', title: "I'll Show You" },
        options: { omitInlineLyrics: true, lyricsPayloadMode: 'payload', airtableSafePayload: true }
      }
    }
  })
});
```

**Avoid:** manual JSON string templates that interpolate multiline lyrics.

### Debugging truncated arguments

Enable chunk logging to diagnose malformed / truncated MCP tool arguments:

```bash
MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=1
MR_MAGIC_TOOL_ARG_CHUNK_SIZE=400
LOG_LEVEL=debug
```

Recommended presets:

| Scenario               | `LOG_LEVEL` | `MR_MAGIC_LOG_TOOL_ARGS_CHUNKS` |
| ---------------------- | ----------- | ------------------------------- |
| Normal operation       | `info`      | `0`                             |
| General verbose        | `debug`     | `0`                             |
| Truncation diagnostics | `debug`     | `1`                             |

## MCP Client Configuration

Mr. Magic supports two connection modes depending on where the MCP client runs:

| Mode                               | Transport                            | When to use                                                                       |
| ---------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| **Local (stdio)**                  | `mcp-server` binary via stdin/stdout | Cline, Claude Desktop, and any client that runs locally on the same machine       |
| **Remote (Streamable HTTP & SSE)** | `POST https://your-server.com/mcp`   | TypingMind, browser-based clients, and any client connecting to a deployed server |

### Configuration modes at a glance

The right way to supply environment variables depends on how the server is launched:

| Config mode                                                            | How it starts                                                 | How to pass env vars                                              | `.env` file read? |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- |
| **Local source**                                                       | `node src/bin/mcp-server.js` or `npm run server:mcp`          | `.env` in project root, or shell exports                          | ✅ yes            |
| **Local npx**                                                          | `npx --package mr-magic-mcp-server mcp-server` via MCP client | `env` block in MCP client config (see below)                      | ❌ no             |
| **Persistent server** (VPS, global install, Docker with persistent FS) | `mcp-server` binary or `npm run server:mcp:http`              | `.env` file **or** platform environment variables                 | ✅ if present     |
| **Ephemeral server** (Render free tier, containers, serverless)        | `npx` or process started fresh each time                      | Platform environment variables (Render Dashboard, Docker `--env`) | ❌ no             |

> **`npx` and MCP clients:** When a local MCP client (Cline, Claude Desktop, etc.) starts the
> server via `npx`, the spawned process has **no access to your `.env` file** — your
> project root and shell environment are not inherited. Every required variable must be
> provided in the `env` block of your MCP client config. See the npx snippet below.

### Required variables by deployment type

#### Ephemeral / npx / stateless hosts (no persistent filesystem)

These variables should be passed explicitly — the server cannot fall back to `.env` or on-disk caches:

| Variable                                              | Purpose                                              | Required when                                            |
| ----------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET`           | Genius auto-refresh (recommended)                    | Using Genius                                             |
| `GENIUS_DIRECT_TOKEN`                                 | Static Genius token (alternative)                    | Using Genius without OAuth credentials                   |
| `MUSIXMATCH_DIRECT_TOKEN`                             | Musixmatch token (highest priority)                  | Using Musixmatch                                         |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | KV store for Musixmatch token + Redis export backend | Musixmatch via KV **or** `MR_MAGIC_EXPORT_BACKEND=redis` |
| `MR_MAGIC_EXPORT_BACKEND`                             | Storage backend for exports (`inline` or `redis`)    | Exporting lyrics; use `inline` if no Redis               |
| `MR_MAGIC_DOWNLOAD_BASE_URL`                          | Base URL for download links                          | `MR_MAGIC_EXPORT_BACKEND=redis` only                     |
| `AIRTABLE_PERSONAL_ACCESS_TOKEN`                      | Airtable push tool                                   | Using `push_catalog_to_airtable`                         |
| `MR_MAGIC_QUIET_STDIO`                                | Suppress non-error stdout (set to `1`)               | stdio MCP clients — avoids JSON-RPC parse errors         |

> 💡 **Musixmatch on ephemeral hosts:** The on-disk token cache (`.cache/musixmatch-token.json`)
> is **not** available when running via `npx` or on ephemeral servers. Use `MUSIXMATCH_DIRECT_TOKEN`
> directly, or configure Upstash Redis (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) and
> run `push:musixmatch-token` once to store the token in KV. See
> [Musixmatch token for npx / ephemeral / headless installs](#musixmatch-token-for-npx--ephemeral--headless-installs).

#### Local source / persistent servers (writable filesystem present)

In addition to the provider credentials above, local and persistent deployments can also use:

| Variable                              | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `MR_MAGIC_EXPORT_BACKEND=local`       | Write export files to disk (default; not usable on ephemeral hosts)            |
| `MR_MAGIC_EXPORT_DIR`                 | Directory to write local exports into                                          |
| `MR_MAGIC_ROOT` / `MR_MAGIC_ENV_PATH` | Override project root / `.env` path resolution                                 |
| `MUSIXMATCH_AUTO_FETCH`               | Auto re-run the Playwright fetch script when no token found (requires browser) |

On-disk token caches (`.cache/genius-token.json`, `.cache/musixmatch-token.json`) are also
read automatically when a persistent filesystem is available and the above env vars are not set.

---

### Local clients (stdio)

> ⚠️ **Stdio MCP clients:** Always invoke the server binary directly — never via
> `npm run server:mcp`. The npm script preamble (`> mr-magic-mcp-server@x.x.x …`) is
> written to stdout before Node starts, and stdio MCP clients try to parse every stdout
> line as JSON-RPC, causing "Unexpected token '>'" errors on every connection.

#### npx (no clone required)

Works with any local MCP client that supports `command` / `args`. Because this package
publishes multiple binaries, you must use `--package` to name the package and then
explicitly name the `mcp-server` binary. This is the correct form — do not use
`npx -y mr-magic-mcp-server` (no binary by that name exists).

> ⚠️ **`npx` does not read your local `.env` file.** The process is spawned by the MCP
> client and has no access to your project directory or shell environment. All credentials
> and configuration must be provided in the `env` block below. For a simpler setup,
> prefer [Local repo — Cline](#local-repo--cline) which reads `.env` automatically.

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "npx",
      "args": ["-y", "--package", "mr-magic-mcp-server", "mcp-server"],
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1",

        "GENIUS_CLIENT_ID": "...",
        "GENIUS_CLIENT_SECRET": "...",

        "MUSIXMATCH_DIRECT_TOKEN": "...",

        "UPSTASH_REDIS_REST_URL": "https://xxx.upstash.io",
        "UPSTASH_REDIS_REST_TOKEN": "...",

        "AIRTABLE_PERSONAL_ACCESS_TOKEN": "..."
      }
    }
  }
}
```

Variable notes:

- `MR_MAGIC_QUIET_STDIO=1` — **always set this for stdio clients**. Suppresses non-error
  stdout so the MCP client doesn't see log lines as JSON-RPC noise.
- `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` — recommended for auto-refresh. Use
  `GENIUS_DIRECT_TOKEN` instead for a static token (no auto-refresh).
- `MUSIXMATCH_DIRECT_TOKEN` — required if using Musixmatch. Must be the full token
  JSON payload (from `npm run fetch:musixmatch-token`). Omit only if you've already
  pushed the token to a KV store via `push:musixmatch-token` (then supply `UPSTASH_*`
  and the KV lookup handles it at runtime).
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — optional but recommended:
  enables KV-backed Musixmatch token storage (so you can refresh the token without
  updating the client config) and unlocks the `redis` export backend.
- `AIRTABLE_PERSONAL_ACCESS_TOKEN` — only required if using `push_catalog_to_airtable`.

Minimal config (Genius + Musixmatch, no Airtable, no Redis):

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "npx",
      "args": ["-y", "--package", "mr-magic-mcp-server", "mcp-server"],
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1",
        "GENIUS_CLIENT_ID": "...",
        "GENIUS_CLIENT_SECRET": "...",
        "MUSIXMATCH_DIRECT_TOKEN": "..."
      }
    }
  }
}
```

#### Global install

After `npm install -g mr-magic-mcp-server`, the `mcp-server` binary is on `PATH`.
When launched by an MCP client, the global binary **can** read a `.env` file if
`MR_MAGIC_ENV_PATH` points to one — otherwise pass credentials via the `env` block
just like the `npx` config above, or set them as system/user-level environment
variables so they're available to all spawned processes.

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "mcp-server",
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1",
        "GENIUS_CLIENT_ID": "...",
        "GENIUS_CLIENT_SECRET": "...",
        "MUSIXMATCH_DIRECT_TOKEN": "..."
      }
    }
  }
}
```

Or, if you keep a `.env` file somewhere on disk:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "mcp-server",
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1",
        "MR_MAGIC_ENV_PATH": "/Users/you/.config/mr-magic/.env"
      }
    }
  }
}
```

#### Local repo — Cline

Cline supports `cwd`, so you can invoke `node` directly. The server reads `.env`
from the project root automatically — no `env` block needed for credentials you've
already set there (though you may still want `MR_MAGIC_QUIET_STDIO`):

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["src/bin/mcp-server.js"],
      "cwd": "/Users/you/Documents/Code/MCP/mr-magic-mcp-server",
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1"
      }
    }
  }
}
```

#### Local repo — clients without `cwd` support

For local clients that don't support a working-directory option, use a shell wrapper.
The `cd` sets the project root so `.env` is found automatically:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "/bin/sh",
      "args": ["-c", "cd /Users/you/Code/mr-magic-mcp-server && node src/bin/mcp-server.js"],
      "env": {
        "MR_MAGIC_QUIET_STDIO": "1"
      }
    }
  }
}
```

---

### Remote clients (Streamable HTTP & SSE)

When Mr. Magic is deployed on a remote host (Render, VPS, etc.), connect via the
Streamable HTTP & SSE MCP endpoint (`/mcp`). Credentials are configured server-side via
environment variables — no `env` block is needed in the client config.

#### Generic remote client (URL-based config)

Any client that accepts a plain MCP endpoint URL:

```
https://your-server.com/mcp
```

#### Legacy SSE clients

Some older MCP clients use the pre-Streamable HTTP & SSE SSE protocol instead of `POST /mcp`.
For those, use the legacy SSE endpoint:

```
GET  https://your-server.com/sse        ← opens the event stream
POST https://your-server.com/messages   ← sends JSON-RPC messages
```

The server supports both protocols simultaneously — no restart or reconfiguration needed.

#### TypingMind

TypingMind connects to remote MCP servers through its **MCP Connector** browser
extension (Chrome / Edge). Once your server is deployed:

1. Open TypingMind → **Plugins** → **MCP Servers** → **Add MCP Server**.
2. Set the endpoint URL to your deployed server's `/mcp` path, e.g.:
   ```
   https://your-server.com/mcp
   ```
3. Leave authentication blank (credentials are set server-side via environment
   variables on the deployed instance).
4. Save and enable the server.

> **"Update required. Please restart your MCP Connector…"**
>
> This message is displayed by the **TypingMind MCP Connector extension** itself —
> it is **not** a Mr. Magic error. It means the installed version of the extension
> predates remote MCP server support. Fix: restart the MCP Connector extension (click
> the extension icon → restart, or disable and re-enable it in your browser's
> Extensions settings). If the message persists, update the extension from the Chrome /
> Edge Web Store. No changes to Mr. Magic or your server configuration are required.

## CLI

A single CLI entrypoint (`mrmagic-cli`) is published with the package. Inside the
local repo use `npm run cli -- <subcommand>` unless you have run `npm link` or
installed globally.

### Commands

| Command                       | Purpose                                                 | Notable flags                                                                                              |
| ----------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `mrmagic-cli search`          | List candidates across providers without downloading.   | `--artist`, `--title`, `--provider`, `--duration`, `--show-all`, `--pick`                                  |
| `mrmagic-cli find`            | Resolve best lyric (prefers synced) and print / export. | `--providers`, `--synced-only`, `--export`, `--format`, `--output`, `--no-romanize`, `--choose`, `--index` |
| `mrmagic-cli select`          | Pick first match from a prioritized provider list.      | `--providers`, `--artist`, `--title`, `--require-synced`                                                   |
| `mrmagic-cli server`          | Start the JSON automation API.                          | `--host`, `--port`, `--remote`                                                                             |
| `mrmagic-cli server:mcp`      | Start the MCP stdio server.                             | —                                                                                                          |
| `mrmagic-cli server:mcp:http` | Start the Streamable HTTP & SSE MCP server.             | `--host`, `--port`, `--remote`, `--sessionless`                                                            |
| `mrmagic-cli search-provider` | Query a single provider only.                           | `--provider`, `--artist`, `--title`                                                                        |
| `mrmagic-cli status`          | Print provider readiness.                               | —                                                                                                          |

### Examples

```bash
# Search all providers
npm run cli -- search --artist "BLACKPINK" --title "Kill This Love"

# Find best lyric (prefers synced LRC)
npm run cli -- find --artist "Nayeon" --title "POP!"

# Pick first synced match from a prioritized provider list
npm run cli -- select --providers lrclib,genius --artist "Nayeon" --title "POP!" --require-synced

# Start JSON automation API on a custom port
mrmagic-cli server --port 4000
```

### npm argument forwarding

Both of these forms work:

```bash
npm run cli search --artist "K/DA" --title "I'll Show You"
npm run cli -- search --artist "K/DA" --title "I'll Show You"
```

For direct binary usage: `mrmagic-cli search --artist "K/DA" --title "I'll Show You"`.

## Manual Testing

Automated checks:

```bash
npm run test                             # full bundled test runner
node src/tests/mcp-tools.test.js         # raw MCP integration harness
npm run repro:mcp:arg-boundary           # JSON-RPC argument boundary repro
npm run repro:mcp:arg-boundary:sdk       # SDK client transport repro
npm run lint
npm run format:check
```

### JSON HTTP server (`server:http`)

Start the server:

```bash
npm run server:http
```

Default base URL: `http://127.0.0.1:3333`

Accepted requests:

- `GET /health`
- `POST /` with body `{ "action": "find|findSynced|search", "track": {...}, "options": {...} }`

#### Health check

```bash
curl -sS http://127.0.0.1:3333/health | jq
```

#### Basic lyric lookup (`action=find`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"find","track":{"artist":"Coldplay","title":"Yellow"},"options":{}}' | jq
```

#### Synced-only lookup (`action=findSynced`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"findSynced","track":{"artist":"Coldplay","title":"Yellow"},"options":{}}' | jq
```

#### Search candidates (`action=search`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"search","track":{"artist":"Coldplay","title":"Yellow"}}' | jq
```

#### Export flow

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"find","track":{"artist":"Coldplay","title":"Yellow"},"options":{"export":true,"formats":["plain"]}}' | jq
```

Look for `exports.plain` in the response:

- **redis backend:** `url` field present, `skipped: false`
- **local backend:** `filePath` field present
- **inline backend:** `content` field present, `skipped: true`

To fetch a Redis export download:

```bash
EXPORT_URL=$(curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"find","track":{"artist":"Coldplay","title":"Yellow"},"options":{"export":true,"formats":["plain"]}}' \
  | jq -r '.exports.plain.url')

curl -sS "$EXPORT_URL" | head -n 10
```

### MCP Streamable HTTP & SSE server (`server:mcp:http`)

Start the server:

```bash
npm run server:mcp:http
```

Default endpoint: `http://127.0.0.1:3444/mcp`

All requests are JSON-RPC 2.0. Required headers:

```
Content-Type: application/json
Accept: application/json, text/event-stream
```

> Tip: use `--sessionless` for easier stateless manual testing:
> `npm run cli -- server:mcp:http --sessionless`

#### Health check

```bash
curl -sS http://127.0.0.1:3444/health | jq
```

#### List tools

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

#### `find_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"find_lyrics","arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}}}' | jq
```

#### `find_synced_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"find_synced_lyrics","arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}}}' | jq
```

#### `build_catalog_payload` — inline lyrics

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":4,"method":"tools/call",
    "params":{"name":"build_catalog_payload","arguments":{"track":{"artist":"K/DA","title":"I'\''LL SHOW YOU"},"options":{"preferRomanized":false}}}
  }' | jq
```

#### `build_catalog_payload` — Airtable-safe mode

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":5,"method":"tools/call",
    "params":{"name":"build_catalog_payload","arguments":{"track":{"artist":"K/DA","title":"I'\''LL SHOW YOU"},"options":{"omitInlineLyrics":true,"lyricsPayloadMode":"payload","airtableSafePayload":true}}}
  }' | jq
```

#### `search_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"search_lyrics","arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}}}' | jq
```

#### `search_provider`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"search_provider","arguments":{"provider":"lrclib","track":{"artist":"Coldplay","title":"Yellow"}}}}' | jq
```

#### `format_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":8,"method":"tools/call","params":{"name":"format_lyrics","arguments":{"track":{"artist":"aespa","title":"Supernova"},"options":{"includeSynced":true}}}}' | jq
```

#### `export_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":9,"method":"tools/call","params":{"name":"export_lyrics","arguments":{"track":{"artist":"Coldplay","title":"Yellow"},"options":{"formats":["plain","lrc","srt"]}}}}' | jq
```

#### `get_provider_status`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"get_provider_status","arguments":{}}}' | jq
```

#### `runtime_status`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"runtime_status","arguments":{}}}' | jq
```

#### `push_catalog_to_airtable`

First call `build_catalog_payload` to populate the lyric cache and capture `lyricsCacheKey`,
then pass it here — no lyric text goes through tool-call arguments:

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":12,"method":"tools/call",
    "params":{"name":"push_catalog_to_airtable","arguments":{
      "baseId":"appeBUkVEp3N4RT0C",
      "tableId":"tbl0y5XHFXpjUJXHu",
      "recordId":"rec1234567890abcd",
      "fields":{},
      "lyricsFieldId":"fldHV1qmPYmsvglff",
      "lyricsCacheKey":"kda-ill-show-you",
      "preferRomanized":true
    }}
  }' | jq
```

> Replace `baseId`, `tableId`, `recordId`, `lyricsFieldId`, and `lyricsCacheKey` with
> real values. Requires `AIRTABLE_PERSONAL_ACCESS_TOKEN`.

#### `select_match`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0","id":13,"method":"tools/call",
    "params":{"name":"select_match","arguments":{
      "matches":[{"provider":"lrclib","result":{"title":"Yellow","artist":"Coldplay","synced":true,"plainOnly":false}}],
      "criteria":{"requireSynced":true,"index":0}
    }}
  }' | jq
```

> **MCP tool response shape:**
>
> - `result.structuredContent` — machine-friendly object (all fields, full values)
> - `result.content[0].text` — complete pretty-printed JSON (identical to `structuredContent`)
>
> Both channels carry the same complete payload. Programmatic consumers should prefer
> `structuredContent`; LLM agents reading `content[0].text` get the full JSON string.

### Running both servers side-by-side

You may want both servers running at the same time — for example, to serve JSON HTTP
automations (`server:http`) alongside MCP tool calls (`server:mcp:http`), or to expose
both a REST API and an MCP endpoint under one deployment.

```bash
# Terminal 1
npm run server:http       # JSON HTTP automation — port 3333

# Terminal 2
npm run server:mcp:http   # Streamable HTTP & SSE MCP  — port 3444
```

> **Note:** Running both is **not** required for Redis exports. The MCP HTTP server
> (`server:mcp:http`) includes its own `/downloads/:id/:ext` route, so a single
> `server:mcp:http` instance is self-sufficient for Redis-backed download links.
> Only run `server:http` alongside it if you also need the JSON HTTP automation API.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for a full history of changes.

## License

[MIT](LICENSE)

I am not and cannot be held liable for any infringement or ban from services
that could occur as a result of using this software. Your usage is solely
your responsibility. Godspeed.

© 2026 Kenyatta Naji Johnson-Adams
