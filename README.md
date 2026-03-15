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

### Quick start — npx (no clone required)

The easiest way to use Mr. Magic in an MCP client is via `npx`. No clone or local
install needed — the package is fetched from npm on first run and cached locally:

```bash
npx -y mr-magic-mcp-server
```

Or install globally so the binaries are always on `PATH`:

```bash
npm install -g mr-magic-mcp-server
```

When installed globally, start any server directly:

```bash
mcp-server           # MCP stdio server (recommended for local MCP clients)
mcp-http-server      # Streamable HTTP MCP server
http-server          # JSON HTTP automation server
mrmagic-cli --help   # CLI
```

### Local repo (development / contribution)

1. Clone or download the repository:

   ```bash
   git clone https://github.com/mrnajiboy/mr-magic-mcp-server.git
   cd mr-magic-mcp-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

   > `npm install` does **not** add `mrmagic-cli` to your shell `PATH`.
   > For local repo usage, run the CLI via `npm run cli -- ...` or `node src/bin/cli.js ...`.
   > Run `npm link` (dev symlink) or install globally to get `mrmagic-cli` on `PATH`.

3. Configure `.env` (see [Environment Variables](#environment-variables)) or export
   env vars in your shell before running any commands.

4. Run the desired entrypoint:
   - MCP stdio server: `npm run server:mcp`
   - MCP Streamable HTTP server: `npm run server:mcp:http`
   - JSON HTTP automation server: `npm run server:http`
   - CLI: `npm run cli -- --help`

## Environment Variables

Copy `.env.example` to `.env` (or inject via your platform dashboard). Variables are
grouped below by purpose.

### Server and runtime

| Variable                   | Default          | Description                                                                                                                                                                                     |
| -------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                     | `3444` / `3333`  | Override server port. On Render this is set automatically (default `10000`).                                                                                                                    |
| `LOG_LEVEL`                | `info`           | Verbosity: `error` \| `warn` \| `info` \| `debug`.                                                                                                                                              |
| `MR_MAGIC_QUIET_STDIO`     | `0`              | Set to `1` to suppress non-error stdout logs (forces `LOG_LEVEL=error`). Recommended under stdio MCP clients.                                                                                   |
| `MR_MAGIC_HTTP_TIMEOUT_MS` | `10000`          | Global outbound HTTP timeout in milliseconds.                                                                                                                                                   |
| `MR_MAGIC_ROOT`            | _(project root)_ | Override the project root used for `.env` and `.cache` path resolution.                                                                                                                         |
| `MR_MAGIC_ENV_PATH`        | _(auto)_         | Point to a specific `.env` file instead of `<project root>/.env`.                                                                                                                               |
| `MR_MAGIC_ALLOWED_HOSTS`   | _(empty)_        | Comma-separated extra hostnames allowed for DNS rebinding protection when binding to `0.0.0.0`. `RENDER_EXTERNAL_HOSTNAME` is included automatically on Render. Only needed for custom domains. |
| `MR_MAGIC_SESSIONLESS`     | `0`              | Set to `1` to force **sessionless mode** on the MCP Streamable HTTP server — each request is handled by a fresh, temporary server/transport with no in-memory session state. Auto-enabled on Render (see below). |

### Genius credentials

| Variable               | Description                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GENIUS_CLIENT_ID`     | OAuth client ID for auto-refresh (recommended). Get from [genius.com/api-clients](https://genius.com/api-clients). |
| `GENIUS_CLIENT_SECRET` | OAuth client secret for auto-refresh (recommended).                                                                |
| `GENIUS_ACCESS_TOKEN`  | Static fallback bearer token. Used when client credentials are unavailable.                                        |

Token resolution order (first match wins):

1. In-memory runtime cache
2. Auto-refresh via `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` ← **recommended**
3. `GENIUS_ACCESS_TOKEN` env var (static, no auto-refresh)
4. On-disk `.cache/genius-token.json` (local dev only)

### Musixmatch credentials

| Variable                        | Description                                                              |
| ------------------------------- | ------------------------------------------------------------------------ |
| `MUSIXMATCH_FALLBACK_TOKEN`     | Token env var (1st priority). Use for production / ephemeral hosts.      |
| `MUSIXMATCH_ALT_FALLBACK_TOKEN` | Token env var (2nd priority). Alternative name for the same token.       |
| `MUSIXMATCH_TOKEN_CACHE`        | Path to the on-disk cache file. Default: `.cache/musixmatch-token.json`. |
| `MUSIXMATCH_AUTO_FETCH`         | Set to `1` to attempt headless token re-fetch when no token is found.    |

### Export and storage

| Variable                            | Default    | Description                                                                                                                    |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `MR_MAGIC_EXPORT_BACKEND`           | `local`    | Storage backend: `local` \| `inline` \| `redis`.                                                                               |
| `MR_MAGIC_EXPORT_DIR`               | `exports/` | Absolute path for local exports. Required when backend is `local`.                                                             |
| `MR_MAGIC_EXPORT_TTL_SECONDS`       | `3600`     | TTL for `local` and `redis` backends (ignored for `inline`).                                                                   |
| `MR_MAGIC_DOWNLOAD_BASE_URL`        | _(none)_   | Public base URL for download links, e.g. `https://lyrics.example.com`.                                                         |
| `MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS` | `1500`     | Character threshold at which `build_catalog_payload` auto-promotes to `reference` transport when `omitInlineLyrics` is `true`. |
| `UPSTASH_REDIS_REST_URL`            | _(none)_   | Required when `MR_MAGIC_EXPORT_BACKEND=redis`.                                                                                 |
| `UPSTASH_REDIS_REST_TOKEN`          | _(none)_   | Required when `MR_MAGIC_EXPORT_BACKEND=redis`.                                                                                 |

### Airtable

| Variable                         | Description                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AIRTABLE_PERSONAL_ACCESS_TOKEN` | Required for `push_catalog_to_airtable`. Generate at [airtable.com/create/tokens](https://airtable.com/create/tokens) with `data.records:write` scope. |

### Melon

| Variable       | Description                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `MELON_COOKIE` | Optional. Pin a session cookie for consistent results. Anonymous access generally works without it. |

### Diagnostics and debugging

| Variable                        | Default | Description                                                                            |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------- |
| `MR_MAGIC_MCP_HTTP_DIAGNOSTICS` | `0`     | Set to `1` to log enriched request metadata at the Streamable HTTP transport boundary. |
| `MR_MAGIC_LOG_TOOL_ARGS_CHUNKS` | `0`     | Set to `1` to emit chunk-by-chunk MCP tool argument previews for truncation debugging. |
| `MR_MAGIC_TOOL_ARG_CHUNK_SIZE`  | `400`   | Chunk size (chars) used when chunk logging is enabled.                                 |
| `MR_MAGIC_SDK_REPRO_HTTP_DEBUG` | `0`     | Set to `1` for verbose HTTP traces in the SDK repro harness script.                    |

## Provider Credentials

### Genius

Genius credentials are resolved in this order — the first available source wins:

1. **Auto-refresh** (`GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET`) — the server calls
   the Genius OAuth `client_credentials` endpoint at runtime and keeps the token
   refreshed in memory. **Recommended for all deployments**, including Render and
   ephemeral hosts. No disk, no scripts, no manual token copying.

2. **Fallback token** (`GENIUS_ACCESS_TOKEN`) — a static bearer token. Works
   everywhere but does not auto-refresh. Update by redeploying with a new value.

3. **Cache token** (`.cache/genius-token.json`) — written by `npm run fetch:genius-token`.
   Only suitable for local dev with a persistent filesystem.

### Musixmatch

Musixmatch uses a captured browser session token. There is no OAuth callback.

**For production / ephemeral hosts (Render, containers):**

Set `MUSIXMATCH_FALLBACK_TOKEN` (first priority) or `MUSIXMATCH_ALT_FALLBACK_TOKEN`
(second priority) directly in your environment. These are the only reliable options
when the filesystem may be wiped between restarts.

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
   it as `MUSIXMATCH_FALLBACK_TOKEN` in your platform environment. Do **not** rely on
   the cache file surviving restarts on ephemeral hosts.

> **Developer accounts:** Get API access from [developer.musixmatch.com](https://developer.musixmatch.com)
> and set the resulting token as `MUSIXMATCH_FALLBACK_TOKEN`.
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

- **`server:mcp:http`** (port `3444`) — the Streamable HTTP MCP server includes its
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
npm run server:mcp:http    # Streamable HTTP MCP   — 127.0.0.1:3444 by default
npm run cli -- --help      # CLI entrypoint
```

Set provider tokens via `.env` before running. `dotenv` is for local convenience only —
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
  `MUSIXMATCH_FALLBACK_TOKEN`, etc.) in the Render Dashboard → Environment tab
- **Health Check Path:** `/health` (returns `{ "status": "ok", "providers": [...] }`)

> For custom domains, add them to `MR_MAGIC_ALLOWED_HOSTS` (comma-separated) in
> your Render environment so the DNS rebinding protection accepts requests with
> those `Host` headers.

#### Sessionless mode on Render (automatic)

When `RENDER=true` is detected, the MCP Streamable HTTP server automatically operates
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

| Transport            | Command                   | Use case                            |
| -------------------- | ------------------------- | ----------------------------------- |
| MCP stdio            | `npm run server:mcp`      | Local MCP clients that speak stdio  |
| MCP Streamable HTTP  | `npm run server:mcp:http` | Remote MCP clients                  |
| JSON HTTP automation | `npm run server:http`     | Container / remote automations      |
| CLI                  | `npm run cli`             | Ad-hoc / SSH / CI one-shot commands |

## HTTP Endpoints

Both HTTP servers expose a set of plain HTTP routes in addition to their primary
transports. These are accessible without any MCP or JSON-RPC framing.

| Endpoint              | Method            | Server                 | Description                                                                                                                                                   |
| --------------------- | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`             | `GET`             | Both                   | Liveness / readiness probe. Returns `{ "status": "ok", "providers": [...] }`.                                                                                 |
| `/downloads/:id/:ext` | `GET`             | Both                   | Serve a Redis-backed export by ID and file extension (e.g. `plain`, `lrc`, `srt`). Returns `200 text/plain` on hit, `404` when the key is expired or missing. |
| `/mcp`                | `POST/GET/DELETE` | `server:mcp:http` only | MCP **Streamable HTTP** transport endpoint (JSON-RPC 2.0). Each `initialize` request creates an independent session — reconnects work correctly.              |
| `/sse`                | `GET`             | `server:mcp:http` only | MCP **legacy SSE** transport. Opens a server-sent event stream. For MCP clients that use the pre-Streamable HTTP protocol.                                    |
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

Both the stdio and Streamable HTTP transports expose the same tool registry:

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

`prompts/airtable-song-importer.md` (shipped in the npm package) is a ready-to-use
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

| Mode | Transport | When to use |
| ---- | --------- | ----------- |
| **Local (stdio)** | `mcp-server` binary via stdin/stdout | Cline, Claude Desktop, and any client that runs locally on the same machine |
| **Remote (Streamable HTTP)** | `POST https://your-server.com/mcp` | TypingMind, browser-based clients, and any client connecting to a deployed server |

---

### Local clients (stdio)

> ⚠️ **Stdio MCP clients:** Always invoke the server binary directly — never via
> `npm run server:mcp`. The npm script preamble (`> mr-magic-mcp-server@x.x.x …`) is
> written to stdout before Node starts, and stdio MCP clients try to parse every stdout
> line as JSON-RPC, causing "Unexpected token '>'" errors on every connection.

#### npx (recommended — no clone required)

Works with any local MCP client that supports `command` / `args`:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "npx",
      "args": ["-y", "mr-magic-mcp-server"],
      "env": {
        "GENIUS_ACCESS_TOKEN": "...",
        "MUSIXMATCH_FALLBACK_TOKEN": "...",
        "AIRTABLE_PERSONAL_ACCESS_TOKEN": "..."
      }
    }
  }
}
```

#### Global install

After `npm install -g mr-magic-mcp-server`, the `mcp-server` binary is on `PATH`:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "mcp-server"
    }
  }
}
```

#### Local repo — Cline

Cline supports `cwd`, so you can invoke `node` directly:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["src/bin/mcp-server.js"],
      "cwd": "/Users/you/Documents/Code/MCP/mr-magic-mcp-server"
    }
  }
}
```

#### Local repo — clients without `cwd` support

For local clients that don't support a working-directory option, use a shell wrapper:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "/bin/sh",
      "args": ["-c", "cd /Users/you/Code/mr-magic-mcp-server && node src/bin/mcp-server.js"]
    }
  }
}
```

---

### Remote clients (Streamable HTTP)

When Mr. Magic is deployed on a remote host (Render, VPS, etc.), connect via the
Streamable HTTP MCP endpoint (`/mcp`). Credentials are configured server-side via
environment variables — no `env` block is needed in the client config.

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

#### Legacy SSE clients

Some older MCP clients use the pre-Streamable HTTP SSE protocol instead of `POST /mcp`.
For those, use the legacy SSE endpoint:

```
GET  https://your-server.com/sse        ← opens the event stream
POST https://your-server.com/messages   ← sends JSON-RPC messages
```

The server supports both protocols simultaneously — no restart or reconfiguration needed.

#### Generic remote client (URL-based config)

Any client that accepts a plain MCP endpoint URL:

```
https://your-server.com/mcp
```

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
| `mrmagic-cli server:mcp:http` | Start the Streamable HTTP MCP server.                   | `--host`, `--port`, `--remote`, `--sessionless`                                                            |
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
npm run test                  # full bundled test runner
node tests/mcp-tools.test.js  # raw MCP integration harness
npm run repro:mcp:arg-boundary       # JSON-RPC argument boundary repro
npm run repro:mcp:arg-boundary:sdk   # SDK client transport repro
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

### MCP Streamable HTTP server (`server:mcp:http`)

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
npm run server:mcp:http   # Streamable HTTP MCP  — port 3444
```

> **Note:** Running both is **not** required for Redis exports. The MCP HTTP server
> (`server:mcp:http`) includes its own `/downloads/:id/:ext` route, so a single
> `server:mcp:http` instance is self-sufficient for Redis-backed download links.
> Only run `server:http` alongside it if you also need the JSON HTTP automation API.

## Provider Notes

- **LRCLIB** — Public API with synced lyric coverage. No auth required.
- **Genius** — Requires `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` (auto-refresh,
  recommended) or `GENIUS_ACCESS_TOKEN` (static fallback token).
- **Musixmatch** — Requires a token. Use `MUSIXMATCH_FALLBACK_TOKEN` for production /
  ephemeral hosts; use the on-disk cache token (`npm run fetch:musixmatch-token`) for
  local dev. See [Musixmatch](#musixmatch) for the full workflow.
- **Melon** — Works anonymously. Set `MELON_COOKIE` for pinned / reproducible sessions.

Providers are queried concurrently and results are normalized into a shared schema
exposed via the CLI, HTTP API, and MCP tools.

## Changelog

See [`CHANGELOG.md`](CHANGELOG.md) for a full history of changes.

## License

[MIT](LICENSE)

I am not and cannot be held liable for any infringement or ban from services
that could occur as a result of using this software. Your usage is solely
your responsibility. Godspeed.

© 2026 Kenyatta Naji Johnson-Adams
