# Mr. Magic MCP Server

Mr. Magic bridges LRCLIB, Genius, Musixmatch, and Melon so MCP clients, Standard
HTTP automations or CLI afficionados can all request lyrics from a single toolchain.

## Prerequisites

- Node.js 18.17 or newer
- npm 9+
- macOS/Linux/WSL (Playwright + MCP transports work cross-platform)
- Provider credentials (see below)

## Installation

### Quick start — no clone required

The easiest way to use Mr. Magic in an MCP client is via `npx`. No clone or
local install needed — the package is fetched from npm on first run and cached
locally:

```bash
npx -y mr-magic-mcp-server
```

Or install globally so the binaries are always on `PATH`:

```bash
npm install -g mr-magic-mcp-server
```

When installed globally, start any server directly:

```bash
mcp-server          # MCP stdio server (recommended for local MCP clients)
mcp-http-server     # Streamable HTTP MCP server
http-server         # JSON HTTP automation server
mrmagic-cli --help  # CLI
```

### Local repo (development / contribution)

1. Clone or download the repository:

   ```bash
   git clone https://github.com/mrnajiboy/mr-magic-mcp-server.git
   cd mr-magic-mcp-server
   ```

   > Alternatively, download a ZIP from GitHub, extract it, and `cd` into the
   > extracted directory.

2. Install dependencies:

   ```bash
   npm install
   ```

   > `npm install` in this repo installs dependencies, but does **not** add
   > `mrmagic-cli` to your shell `PATH`.
   >
   > For local repo usage, run the CLI via `npm run cli -- ...` (or
   > `node src/bin/cli.js ...`). If you want direct commands like
   > `mrmagic-cli --help`, run `npm link` (dev symlink) or install globally.

3. Configure `.env` (see Environment variables below) or export env vars in
   your shell before running any commands.

4. Run the desired entrypoint:
   - MCP Stdio server: `npm run server:mcp`
   - MCP Streamable HTTP server: `npm run server:mcp:http`
   - Standard JSON HTTP server: `npm run server:http`
   - CLI: `npm run cli -- --help`

## Environment variables

Copy `.env.example` to `.env` (or export values in your shell) and fill in the
credentials plus any storage configuration:

```env
PORT= # Override all server ports, or leave blank to default to 3444 for MCP, 3333 the JSON HTTP automation server.
LOG_LEVEL= # Optional. error|warn|info|debug. Defaults to info.
MR_MAGIC_ROOT= # Optional. Force the project root used for resolving .env/.cache paths.
MR_MAGIC_ENV_PATH= # Optional. Custom path to an env file when the default isn't desired.
GENIUS_CLIENT_ID= # Get from https://genius.com/api-clients, required for Genius client-credentials auth.
GENIUS_CLIENT_SECRET= # Get from https://genius.com/api-clients, required for Genius client-credentials auth.
GENIUS_ACCESS_TOKEN= # Get from https://genius.com/api-clients, required for Genius lyrics support when client credentials are not supplied.
MUSIXMATCH_USER_TOKEN= # Fallback token (1st priority). Set as env var for production/ephemeral hosts where the filesystem is not persistent.
MUSIXMATCH_TOKEN= # Fallback token (2nd priority). Alternative env var; same token value, second-choice source.
MUSIXMATCH_AUTO_FETCH=0 # Optional. When 1, provider will attempt to re-run the fetch script automatically (headless) if no token is available.
MUSIXMATCH_TOKEN_CACHE=.cache/musixmatch-token.json
MELON_COOKIE= # Optional. Pin a session cookie for consistent Melon results; anonymous access generally works without it.
MR_MAGIC_EXPORT_BACKEND= # local|inline|redis
MR_MAGIC_EXPORT_DIR=/absolute/path/to/exports # Required if MR_MAGIC_EXPORT_BACKEND=local
MR_MAGIC_EXPORT_TTL_SECONDS=3600 # Optional, default 3600 (1 hour). Only applies to local and redis backends, ignored for inline.
MR_MAGIC_DOWNLOAD_BASE_URL=https://yourserver.com|http://localhost:GIVEN_PORT # Used for generating download links for exported files. See README for details.
MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS=1500 # Optional, default 1500. build_catalog_payload auto-promotes payload transport to reference when omitInlineLyrics is true and lyrics exceed this threshold.
MR_MAGIC_QUIET_STDIO=0 # Optional, default 0. If set to 1, suppresses all non-error logs to stdout. Recommended when running under MCP clients that read stdio (forces LOG_LEVEL=error).
MR_MAGIC_HTTP_TIMEOUT_MS=10000 # Optional, default 10000. Global outbound HTTP timeout (ms) to prevent hanging provider/storage requests.
MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=0 # Optional, default 0. Set to 1/true to emit chunk-by-chunk MCP tool argument previews for truncation debugging.
MR_MAGIC_TOOL_ARG_CHUNK_SIZE=400 # Optional, default 400. Chunk size used when MR_MAGIC_LOG_TOOL_ARGS_CHUNKS is enabled.
MR_MAGIC_MCP_HTTP_DIAGNOSTICS=0 # Optional, default 0. Set to 1 to log enriched Streamable HTTP MCP request diagnostics at transport ingress.
MR_MAGIC_SDK_REPRO_HTTP_DEBUG=0 # Optional, default 0. Set to 1 for verbose HTTP request/response previews in the SDK repro harness script.
UPSTASH_REDIS_REST_URL= # Get from https://console.upstash.com/redis/rest, required if MR_MAGIC_EXPORT_BACKEND=redis
UPSTASH_REDIS_REST_TOKEN= # Get from https://console.upstash.com/redis/rest, required if MR_MAGIC_EXPORT_BACKEND=redis
AIRTABLE_PERSONAL_ACCESS_TOKEN= # Required for push_catalog_to_airtable tool. Get from https://airtable.com/create/tokens
```

- **GENIUS_ACCESS_TOKEN** is required for Genius lyrics support. The
  CLI/servers will reject Genius requests if it is unset (unless
  `GENIUS_CLIENT_ID`/`GENIUS_CLIENT_SECRET` are set for auto-refresh).
- **GENIUS_CLIENT_ID**/**GENIUS_CLIENT_SECRET** can be supplied as an
  alternative Genius auth path when you want runtime token refresh instead of a
  static access token.
- **Musixmatch token sources** — the server resolves the Musixmatch token using
  two named sources, tried in order:
  - **Fallback token** (`MUSIXMATCH_USER_TOKEN`, then `MUSIXMATCH_TOKEN`) — the
    token value is set directly as an environment variable. This is the
    recommended approach for production and ephemeral hosts (e.g. Render free
    tier, containers) where the filesystem cannot be relied upon between
    restarts. Set `MUSIXMATCH_USER_TOKEN` first; `MUSIXMATCH_TOKEN` is the
    legacy/alternative env var for the same value.
  - **Cache token** (on-disk `.cache/musixmatch-token.json`) — written by the
    `fetch:musixmatch-token` script after a browser sign-in. Used for local
    development when a persistent writable filesystem is available. Not suitable
    for ephemeral hosts.
- **MUSIXMATCH_TOKEN_CACHE** controls where the on-disk cache token file is
  read/written (default `<project root>/.cache/musixmatch-token.json`).
- **MELON_COOKIE** is optional—anonymous access generally works, but pinning a
  cookie can improve consistency.
- **MR_MAGIC_EXPORT_BACKEND** controls where formatted lyrics land:
  - `local` (default) writes to `MR_MAGIC_EXPORT_DIR` (or `exports/` when
    omitted).
  - `inline` skips disk writes and returns the formatted strings directly in
    the response body.
  - `redis` stores each export in Upstash; you must also set the `UPSTASH_*`
    vars plus `MR_MAGIC_DOWNLOAD_BASE_URL` so clients know which HTTP server
    serves `/downloads/:id/:ext`.
- **MR_MAGIC_EXPORT_DIR** can be any absolute path (e.g., `/tmp/mr-magic`).
  Quote it only when the path contains spaces or special characters
  (`MR_MAGIC_EXPORT_DIR="/Users/you/My Exports"`).
- **PORT** overrides both HTTP entrypoints when your platform injects one
  (Render, Fly, etc.). If unset, the MCP HTTP transport binds to `3444` and
  the JSON HTTP automation server binds to `3333`. CLI flags such as
  `mrmagic-cli server --port 4000` always take precedence.
- **MR_MAGIC_DOWNLOAD_BASE_URL** should match the public URL that exposes the
  `/downloads` routes. Include `:port` only when the HTTP server isn’t using
  the default for its protocol.
- **LOG_LEVEL** (error|warn|info|debug, default `info`) controls global logging verbosity.
  Set `LOG_LEVEL=debug` when you need verbose diagnostics.
- **MR_MAGIC_QUIET_STDIO** set to `1` silences stdio transports (helpful when a
  host MCP client expects clean JSON over stdout). When enabled, it forces
  `LOG_LEVEL=error` so stdout stays quiet.
- **MR_MAGIC_HTTP_TIMEOUT_MS** (default `10000`) applies a global timeout to
  outbound provider/export-storage network calls so slow upstream endpoints
  fail fast instead of hanging MCP tool calls.
- **MR_MAGIC_LOG_TOOL_ARGS_CHUNKS** (default `0`) enables diagnostic chunk
  logging for incoming MCP `arguments` payloads. Set to `1`/`true` when
  debugging malformed/truncated tool calls from external clients.
- **MR_MAGIC_TOOL_ARG_CHUNK_SIZE** (default `400`) controls the size of each
  chunk preview emitted when chunk logging is enabled.
- **MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS** (default `1500`) controls when
  `build_catalog_payload` auto-promotes payload transport to `reference`
  in compact Airtable-safe flows to reduce large inline lyric blobs.
- **MR_MAGIC_MCP_HTTP_DIAGNOSTICS** (default `0`) enables detailed request
  metadata logging at the Streamable HTTP transport boundary (method, content
  type, body shape/length, session header, and safe body preview).
- **MR_MAGIC_SDK_REPRO_HTTP_DEBUG** (default `0`) enables HTTP-level debugging
  output in `scripts/mcp-arg-boundary-sdk-repro.mjs` when validating argument
  boundary behavior from the SDK client path.
- **MR_MAGIC_ROOT** overrides the project root used for loading `.env` and `.cache`.
  Useful when an MCP host launches the server from another directory.
- **MR_MAGIC_ENV_PATH** lets you point to a specific `.env` file instead of the
  default `<project root>/.env`.
- **AIRTABLE_PERSONAL_ACCESS_TOKEN** is required only when using the
  `push_catalog_to_airtable` tool. Generate a personal access token at
  https://airtable.com/create/tokens and grant it the `data.records:write` scope
  for the bases you want to write to.
- For hosted deployments, inject the variables via your platform dashboard so
  no `.env` file is required at runtime.

### Getting the Musixmatch token

All Musixmatch support in this project uses a captured browser session token.
There is no OAuth callback — the fetch script captures and persists the token
in one of two ways depending on your deployment:

- **Cache token** (local dev): the fetch script writes the token to
  `.cache/musixmatch-token.json`. The server loads it on startup whenever a
  persistent, writable filesystem is available.
- **Fallback token** (production/ephemeral): copy the captured token value and
  set it as `MUSIXMATCH_USER_TOKEN` (recommended) or `MUSIXMATCH_TOKEN` in your
  platform's environment. This is the only reliable option on ephemeral hosts
  (Render free tier, containers without a mounted volume) where the filesystem
  is wiped between restarts.

#### Workflow

1. From any machine that can open a browser, run:

   ```bash
   npm run fetch:musixmatch-token
   ```

   - Locally this pops up a Playwright-controlled Chromium window.
   - Remotely you can run the same command wherever you have GUI access (SSH + X11,
     VNC, RDP, etc.).

2. Sign in with Musixmatch (Google sign-in works) when prompted.

3. After the redirect to `https://www.musixmatch.com/discover`, the script logs
   the captured token and writes the cache token file (default
   `<project>/.cache/musixmatch-token.json`). The file contains both the token
   value and the `web-desktop-app-v1.0` desktop cookie so the server can replay
   the session.

4. **For remote/ephemeral deployments:** copy the `token` value from the
   printed JSON and set it as `MUSIXMATCH_USER_TOKEN` in your platform
   environment (the fallback token). Do **not** rely on the cache file
   surviving a restart on ephemeral hosts.
   If `MUSIXMATCH_AUTO_FETCH=1`, the provider can attempt to re-run the fetch
   script headlessly when no token is found, but the initial sign-in still
   requires a browser.

#### Developer Accounts

1. Get API access from `https://developer.musixmatch.com`
2. Run the script above and set the resulting token as `MUSIXMATCH_USER_TOKEN`
   (fallback token) in your environment, or keep the on-disk cache token in sync
   for local development.

#### Public Account (WARNING: MAY RESULT IN BAN)

1. Visit `https://auth.musixmatch.com/`
2. Sign in with a Musixmatch account and allow the app. When redirected, the
   helper script above will capture the session and write the cache token.
3. Copy the `token` value and set it as `MUSIXMATCH_USER_TOKEN` for any remote
   environment that needs it.

**WARNING: CALLING THE API FROM AN UNAUTHORIZED ACCOUNT MAY RESULT IN A BAN.**

### Optional Melon cookie

Fetching Melon search/lyric endpoints still works with the MCP’s built-in cookie
collection. If `MELON_COOKIE` is blank, the app will quietly request whatever
session cookies the site provides, so you rarely need to copy a manual string.
If you prefer to pin a cookie for repeatable results, set `MELON_COOKIE` to the
complete cookie header you already trust.

### Export + download configuration

- **Local files:** The default `local` backend writes into `exports/` (repo
  root). Override with `MR_MAGIC_EXPORT_DIR=/absolute/path` when the working
  directory isn’t writable. The `export_lyrics` tool also includes the raw
  `content` field so clients can still inline results if file writes fail.
- **Redis downloads:** Set `MR_MAGIC_EXPORT_BACKEND=redis` plus
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and
  `MR_MAGIC_DOWNLOAD_BASE_URL`. Each export is cached in Upstash for
  `MR_MAGIC_EXPORT_TTL_SECONDS` seconds, but the download link should point at
  _your own_ HTTP server’s `/downloads/:id/:ext` route (not the Upstash REST
  URL). In other words, `MR_MAGIC_DOWNLOAD_BASE_URL` must be the publicly
  reachable base URL for the HTTP automation server (e.g.,
  `https://lyrics.example.com`), and request paths are appended to it
  (`https://lyrics.example.com/downloads/...`). MCP clients can take the
  returned URLs and download the files from the same HTTP server or proxy where
  `/downloads` is routed.
- Even if you’re only using the stdio MCP server locally, you still need the
  HTTP automation server running to serve those `/downloads/:id/:ext` routes
  whenever `redis` storage is enabled.
- For local testing, set `MR_MAGIC_DOWNLOAD_BASE_URL=http://127.0.0.1:3333` (or
  `http://localhost:3333`) so the generated links look like
  `http://127.0.0.1:3333/downloads/<id>/<ext>`. In remote deployments, point it
  at your public host (e.g., `https://lyrics.example.com`). Only include a
  `:port` suffix when the HTTP server listens on a nonstandard port (e.g.,
  `https://lyrics.example.com:8443`). If you override the local port via `PORT`
  or CLI flags, update the base URL accordingly.
- **Inline:** `MR_MAGIC_EXPORT_BACKEND=inline` is handy for sandboxes that
  prohibit writes. Instead of touching the file system or Redis, each export is
  returned inline in the tool/server response with `content` populated and
  `skipped: true` to signal that persistence was intentionally bypassed (not
  that the export failed).

## Local deployment

Run whichever entrypoint you need via npm scripts so the repo’s `NODE_PATH`
settings and dotenv loading are consistent:

- `npm run server:http` — JSON HTTP automation endpoint (`127.0.0.1:3333` by
  default; honors `PORT`/CLI overrides).
- `npm run server:mcp` — MCP stdio transport (ideal for local MCP clients that
  speak stdio).
- `npm run server:mcp:http` — Streamable HTTP MCP transport
  (`127.0.0.1:3444` unless overridden).
- `npm run cli` — interactive CLI entrypoint (`src/tools/cli.js`); combine with
  `server`, `search`, `find`, or `select` subcommands.

Set provider tokens/env vars via `.env` before running any command.
`dotenv` is only for local convenience—production runners should inject env vars
directly.

## Remote deployment

Ensure the deployment environment injects the same environment variables, then
choose the transport you need. Typical remote workflows look like:

```bash
npm ci
npm run server:http       # or server:mcp / server:mcp:http
```

Use a process manager (systemd, PM2, Docker CMD, etc.) to keep long-lived
servers running.

- **MCP server (Stdio)** for local Model Context Protocol clients (use the
  bundled CLI: `npm run server:mcp` or call `node ./src/bin/mcp-server.js`).
- **MCP server (Streamable HTTP)** for remote MCP clients that speak the Streamable HTTP
  transport (`npm run server:mcp:http`). When running the Streamable HTTP transport
  in remote environments, restrict ingress (e.g., `0.0.0.0:3444` behind auth)
  and provide allowed host/origin headers via the MCP SDK options if needed.
- **Standard JSON HTTP server** for container/remote automation (`npm run server:http`).
- **CLI** for ad-hoc/manual usage (one-off SSH sessions, CI jobs, or ephemeral
  workers). Invoke with `npm run cli <subcommand>` or `npx mrmagic-cli <subcommand>`;
  it isn’t designed to run as a long-lived daemon because it exits
  after each command completes.

  In a local clone, prefer `npm run cli <subcommand>`. Use `mrmagic-cli ...`
  only after `npm link` or a global install places the binary on `PATH`.

## MCP tools

Both STDIO and Streamable HTTP transports expose the same tool registry:

| Tool name                  | Purpose                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `find_lyrics`              | Fetch best lyrics (prefers synced) plus metadata and payload.                                                                                                      |
| `build_catalog_payload`    | Return a compact record (title/link/lyrics) for Airtable-style inserts (supports structured lyric payloads).                                                       |
| `find_synced_lyrics`       | Like `find_lyrics` but rejects plain-only results.                                                                                                                 |
| `search_lyrics`            | List candidate matches across providers without hydration.                                                                                                         |
| `search_provider`          | Query a single provider (requires the `provider` flag).                                                                                                            |
| `get_provider_status`      | Report readiness and notes for each provider.                                                                                                                      |
| `export_lyrics`            | Download + write plain/LRC/SRT/romanized files to disk.                                                                                                            |
| `format_lyrics`            | Format lyrics in memory (optional romanization) for display.                                                                                                       |
| `select_match`             | Pick a prior result by provider/index/synced flag.                                                                                                                 |
| `runtime_status`           | Snapshot provider readiness plus present env vars.                                                                                                                 |
| `push_catalog_to_airtable` | Write catalog records directly to Airtable with server-side lyric resolution — lyrics never pass through LLM arguments. Requires `AIRTABLE_PERSONAL_ACCESS_TOKEN`. |

### Airtable integration (server-side lyrics)

Mr. Magic ships a dedicated Airtable workflow that routes lyrics entirely
server-side so long lyric text never passes through LLM tool-call arguments.
This eliminates the JSON truncation and malformed-request errors that occur
when multiline Korean / CJK lyrics are interpolated into automation payloads.

#### How it works

1. **Call `build_catalog_payload`** for each song. The response contains a
   `lyricsCacheKey` — a short slug like `kda-ill-show-you` that identifies the
   resolved lyrics in the server's in-memory LRU cache (20 entries, shared
   across the MCP session).

2. **Write non-lyric fields** (Song title, Spotify link, etc.) using your
   Airtable MCP's bulk create/update tools. The Airtable MCP can send up to 10
   records per call; use that fully. Capture the `recordId` returned for each
   created record.

3. **Call `push_catalog_to_airtable`** with the `recordId`, `lyricsFieldId`,
   and `lyricsCacheKey`. The server looks up the cached lyrics and calls the
   Airtable REST API directly. The lyric text **never leaves the server process**
   as an MCP argument.

#### push_catalog_to_airtable — call shape

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

Pass `"splitLyricsUpdate": true` if the combined create + lyrics payload is too
large — this forces a two-step create → PATCH so the Airtable API never sees
the full payload in one request.

#### Bundled prompt template

`prompts/airtable-song-importer.md` (shipped in the npm package under
`prompts/`) is a ready-to-use system prompt for MCP assistants that import
songs into Airtable in bulk. It covers:

- Phased execution: resolve all data → bulk create (Song + Spotify link) →
  write lyrics → SRT export
- Bulk record creation up to 10 records per Airtable MCP call
- Spotify link resolution via the Spotify MCP
- Romanized lyric priority for K-pop / CJK content
- `splitLyricsUpdate` fallback for oversized payloads
- SRT export delivery requirements

Copy the contents of `prompts/airtable-song-importer.md` into your MCP
client's system prompt to deploy this workflow immediately.

#### Safe lyric payload handoff (Airtable-friendly)

The `build_catalog_payload` tool now exposes extra options that solve the
"inline JSON lyric" problem reported in workflows that pipe lyrics straight
into Airtable tool calls. Large multiline text that contains quotes, emoji, or
Unicode can corrupt downstream JSON when it is interpolated directly into a
payload string. To avoid this, request a structured lyric payload instead of
embedding the raw text:

```jsonc
{
  "track": { "artist": "K/DA", "title": "I'll Show You" },
  "options": {
    "omitInlineLyrics": true,
    "lyricsPayloadMode": "payload" // or "reference"
  }
}
```

Important transport rule for MCP callers:

- `tools/call.params.arguments` must be a JSON object/record.
- Do **not** pre-serialize arguments into one giant JSON string for multiline
  lyrics.
- `build_catalog_payload` and `select_match` now enforce object arguments and
  reject stringified payloads to prevent truncation-prone request patterns.

- `omitInlineLyrics: true` removes the `lyrics`, `plainLyrics`, and
  `romanizedPlainLyrics` fields so the response stays compact and safe to log.
- `lyricsPayloadMode: "payload"` adds `lyricsPayload` metadata and typically
  includes full text in a structured object (transport = `inline`). In compact
  Airtable-safe flows (`omitInlineLyrics: true`) the server may auto-promote
  transport to `reference` for long lyric payloads.
- `lyricsPayloadMode: "reference"` stores the lyrics via the export storage
  backend (local/inline/redis) and returns a `lyricsPayload.reference` object
  containing the file path or download URL instead of the raw text.
- `airtableSafePayload: true` additionally exposes `lyricsPayload.airtableEscapedContent`
  which is pre-escaped for JSON bodies (quotes/backslashes/newlines rendered as
  literal `\"`, `\\`, `\n`) and prefers compact/reference-style payload handoff
  when paired with `omitInlineLyrics: true`.
- Optional `lyricsPayloadOutput` lets you override the output directory when
  using the default local backend.

Downstream automations (Airtable, Zapier, Make, etc.) should map either
`lyricsPayload.content` (inline mode) or fetch from
`lyricsPayload.reference.url/filePath` (reference mode) and place that string
into Airtable using the platform’s native variable substitution. This avoids
hand-written JSON concatenation and eliminates the malformed request errors
seen with long lyric fields.

#### SDK vs fetch calling guidance for Airtable-safe payloads

- **Preferred:** MCP SDK client calls (`client.callTool`) with `arguments` as a
  native object.
- **Also valid:** raw `fetch`/HTTP requests, as long as you build one outer
  request object and call `JSON.stringify()` once at send time.
- **Avoid:** manual JSON string templates that interpolate multiline lyrics.

SDK example (recommended):

```js
await client.callTool({
  name: 'build_catalog_payload',
  arguments: {
    track: { artist: 'K/DA', title: "I'll Show You" },
    options: {
      omitInlineLyrics: true,
      lyricsPayloadMode: 'payload',
      airtableSafePayload: true
    }
  }
});
```

Fetch example (safe when still object-based):

```js
const body = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'build_catalog_payload',
    arguments: {
      track: { artist: 'K/DA', title: "I'll Show You" },
      options: {
        omitInlineLyrics: true,
        lyricsPayloadMode: 'payload',
        airtableSafePayload: true
      }
    }
  }
};

await fetch('http://127.0.0.1:3444/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream'
  },
  body: JSON.stringify(body)
});
```

#### Debugging malformed MCP tool arguments (truncation checks)

When an MCP client sends malformed JSON in `arguments` (for example, a lyric
string that was truncated mid-quote), the server now validates and normalizes
incoming arguments at the transport boundary before tool execution:

- Object args are passed through directly (preferred path).
- For compatibility tools, string args are parsed once; parse failures return a
  consistent `Invalid JSON format for params: ...` error.
- For Airtable-heavy tools (`build_catalog_payload`, `select_match`), string
  args are rejected so callers keep `params.arguments` as object/record.
- Logs include argument length plus head/tail previews to pinpoint where data
  was cut off.

For deeper diagnostics, enable chunk logging:

```bash
MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=1
MR_MAGIC_TOOL_ARG_CHUNK_SIZE=400
LOG_LEVEL=debug
```

This emits chunk-by-chunk previews so you can identify whether truncation
occurred before or at MCP transport ingress.

Recommended debugging presets:

- **Normal operation (default):**

  ```env
  LOG_LEVEL=info
  MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=0
  ```

- **General verbose debugging (without chunk spam):**

  ```env
  LOG_LEVEL=debug
  MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=0
  ```

- **Truncation-focused diagnostics (large payload issues):**

  ```env
  LOG_LEVEL=debug
  MR_MAGIC_LOG_TOOL_ARGS_CHUNKS=1
  MR_MAGIC_TOOL_ARG_CHUNK_SIZE=400
  ```

Use the truncation-focused preset only while investigating malformed JSON,
then switch chunk logging back off to keep logs compact.

### MCP client configuration

> ⚠️ **Important for stdio MCP clients:** Always invoke the server via the
> binary directly rather than `npm run server:mcp`. When `npm` runs a script it
> echoes a preamble like `> mr-magic-mcp-server@x.x.x server:mcp` to stdout
> before the Node process starts. Cline and other stdio MCP clients try to parse
> every stdout line as JSON-RPC, so those `>` lines cause "Unexpected token '>'"
> parse errors on every connection attempt. Direct invocation produces no such
> preamble.

#### npx (recommended — no clone needed)

Works with any MCP client that supports `command`/`args`. The package is fetched
from npm on first run and cached locally:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "npx",
      "args": ["-y", "mr-magic-mcp-server"]
    }
  }
}
```

Add env vars inline if your client supports the `env` field:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "npx",
      "args": ["-y", "mr-magic-mcp-server"],
      "env": {
        "GENIUS_ACCESS_TOKEN": "...",
        "MUSIXMATCH_USER_TOKEN": "...",
        "AIRTABLE_PERSONAL_ACCESS_TOKEN": "..."
      }
    }
  }
}
```

#### Global install

After `npm install -g mr-magic-mcp-server`, invoke the `mcp-server` binary
directly (it's on `PATH`):

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "mcp-server"
    }
  }
}
```

#### Local repo — Cline config

Cline supports `cwd`, so you can call `node` directly — **do not use `npm run`
here**, as npm's script echo will corrupt the stdio stream:

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

#### Local repo — Standard config (no cwd support)

For clients like TypingMind that don't support a `cwd` field, use a shell
wrapper with the absolute path:

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

### Manual Testing

This section documents **manual, copy/paste HTTP tests** for both transports:

- JSON automation API (`npm run server:http`, default `http://127.0.0.1:3333`)
- MCP Streamable HTTP API (`npm run server:mcp:http`, default `http://127.0.0.1:3444/mcp`)

If you want automated checks too, keep these handy:

- `npm run test` – full bundled test runner (`tests/run-tests.js`)
- `node tests/mcp-tools.test.js` – raw MCP integration harness
- `npm run repro:mcp:arg-boundary` – direct JSON-RPC repro harness for
  object-vs-string argument boundary checks.
- `npm run repro:mcp:arg-boundary:sdk` – SDK client transport repro harness
  (supports `MR_MAGIC_SDK_REPRO_HTTP_DEBUG=1` for verbose HTTP traces).
- `npm run lint` – ESLint
- `npm run format:check` – Prettier check mode

#### 1) Manual JSON HTTP testing (`server:http`)

Start the server in one terminal:

```bash
npm run server:http
```

The JSON API accepts:

- `GET /health`
- `POST /` with body shape:

```json
{
  "action": "find | findSynced | search",
  "track": { "artist": "...", "title": "...", "album": "..." },
  "options": { "...": "..." }
}
```

##### A. Health check

```bash
curl -sS http://127.0.0.1:3333/health | jq
```

##### B. Basic lyric lookup (`action=find`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{
    "action":"find",
    "track":{"artist":"Coldplay","title":"Yellow"},
    "options":{}
  }' | jq
```

##### C. Synced-only lookup (`action=findSynced`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{
    "action":"findSynced",
    "track":{"artist":"Coldplay","title":"Yellow"},
    "options":{}
  }' | jq
```

##### D. Search-only candidates (`action=search`)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{
    "action":"search",
    "track":{"artist":"Coldplay","title":"Yellow"}
  }' | jq
```

##### E. Export flow test (what we used for Redis/manual verification)

```bash
curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{
    "action":"find",
    "track":{"artist":"Coldplay","title":"Yellow"},
    "options":{"export":true,"formats":["plain"]}
  }' | jq
```

Look for `exports.plain` in the response:

- **redis backend:** `url` should be `/downloads/<id>/txt`, `skipped: false`
- **local backend:** `filePath` should be present
- **inline backend:** `content` should be present and `skipped: true`

##### F. Verify the exported download URL

If using Redis + HTTP downloads, fetch the URL returned from `exports.*.url`:

```bash
curl -sS 'http://127.0.0.1:3333/downloads/<export-id>/txt' | head -n 10
```

If you prefer one-liner extraction with `jq`:

```bash
EXPORT_URL=$(curl -sS -X POST http://127.0.0.1:3333 \
  -H 'Content-Type: application/json' \
  -d '{"action":"find","track":{"artist":"Coldplay","title":"Yellow"},"options":{"export":true,"formats":["plain"]}}' \
  | jq -r '.exports.plain.url')

curl -sS "$EXPORT_URL" | head -n 10
```

> Note: for Redis exports, ensure `MR_MAGIC_EXPORT_BACKEND=redis`, Upstash creds are set,
> and `MR_MAGIC_DOWNLOAD_BASE_URL` matches the HTTP server base URL.

#### 2) Manual MCP Streamable HTTP testing (`server:mcp:http`)

Start MCP HTTP server in one terminal:

```bash
npm run server:mcp:http
```

Default endpoint:

- `http://127.0.0.1:3444/mcp`

All manual calls are JSON-RPC 2.0 requests.

##### A. List tools (`tools/list`)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

##### B. Call `find_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"find_lyrics",
      "arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}
    }
  }' | jq
```

##### C. Call `find_synced_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"find_synced_lyrics",
      "arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}
    }
  }' | jq
```

##### D. Call `build_catalog_payload` (default — inline lyrics)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":4,
    "method":"tools/call",
    "params":{
      "name":"build_catalog_payload",
      "arguments":{
        "track":{"artist":"K/DA","title":"I'\''LL SHOW YOU"},
        "options":{"preferRomanized":false}
      }
    }
  }' | jq
```

##### E. Call `build_catalog_payload` (compact Airtable-safe mode)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":5,
    "method":"tools/call",
    "params":{
      "name":"build_catalog_payload",
      "arguments":{
        "track":{"artist":"K/DA","title":"I'\''LL SHOW YOU"},
        "options":{
          "omitInlineLyrics":true,
          "lyricsPayloadMode":"payload",
          "airtableSafePayload":true
        }
      }
    }
  }' | jq
```

##### F. Call `search_lyrics` (all providers, no hydration)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":6,
    "method":"tools/call",
    "params":{
      "name":"search_lyrics",
      "arguments":{"track":{"artist":"Coldplay","title":"Yellow"}}
    }
  }' | jq
```

##### G. Call `search_provider` (single provider)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":7,
    "method":"tools/call",
    "params":{
      "name":"search_provider",
      "arguments":{
        "provider":"lrclib",
        "track":{"artist":"Coldplay","title":"Yellow"}
      }
    }
  }' | jq
```

##### H. Call `format_lyrics` (in-memory with romanization)

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":8,
    "method":"tools/call",
    "params":{
      "name":"format_lyrics",
      "arguments":{
        "track":{"artist":"aespa","title":"Supernova"},
        "options":{"includeSynced":true}
      }
    }
  }' | jq
```

##### I. Call `export_lyrics`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":9,
    "method":"tools/call",
    "params":{
      "name":"export_lyrics",
      "arguments":{
        "track":{"artist":"Coldplay","title":"Yellow"},
        "options":{"formats":["plain","lrc","srt"]}
      }
    }
  }' | jq
```

##### J. Call `get_provider_status`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":10,
    "method":"tools/call",
    "params":{"name":"get_provider_status","arguments":{}}
  }' | jq
```

##### K. Call `runtime_status`

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":11,
    "method":"tools/call",
    "params":{"name":"runtime_status","arguments":{}}
  }' | jq
```

##### K2. Call `push_catalog_to_airtable` (server-side Airtable lyrics write)

First call `build_catalog_payload` (section D or E above) to populate the
lyric cache and capture the returned `lyricsCacheKey`. Then use that key here
to write lyrics to Airtable entirely server-side — no lyric text passes through
your tool-call arguments.

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":12,
    "method":"tools/call",
    "params":{
      "name":"push_catalog_to_airtable",
      "arguments":{
        "baseId":"appeBUkVEp3N4RT0C",
        "tableId":"tbl0y5XHFXpjUJXHu",
        "recordId":"rec1234567890abcd",
        "fields":{},
        "lyricsFieldId":"fldHV1qmPYmsvglff",
        "lyricsCacheKey":"kda-ill-show-you",
        "preferRomanized":true
      }
    }
  }' | jq
```

> Replace `baseId`, `tableId`, `recordId`, `lyricsFieldId`, and `lyricsCacheKey`
> with real values from your Airtable base and the `build_catalog_payload`
> response. Requires `AIRTABLE_PERSONAL_ACCESS_TOKEN` to be set in `.env`.

##### L. Call `select_match` (pick from a prior search result)

First run `search_lyrics` (section F above) and capture the matches, then
pick the first synced result:

```bash
curl -sS -X POST http://127.0.0.1:3444/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc":"2.0",
    "id":12,
    "method":"tools/call",
    "params":{
      "name":"select_match",
      "arguments":{
        "matches": [
          {
            "provider":"lrclib",
            "result":{
              "title":"Yellow","artist":"Coldplay",
              "synced":true,"plainOnly":false
            }
          }
        ],
        "criteria":{"requireSynced":true,"index":0}
      }
    }
  }' | jq
```

> **MCP tool response shape:**
>
> - `result.structuredContent` — machine-friendly object (all fields present, full values)
> - `result.content[0].text` — complete pretty-printed JSON (identical to `structuredContent`)
>
> Both channels carry the same complete payload. There is no truncated preview
> block. Programmatic consumers should prefer `structuredContent`; LLM agents
> reading `content[0].text` get the full JSON string.

> Tip: if your manual client has trouble with MCP sessions, start with
> `npm run cli -- server:mcp:http --sessionless` for easier stateless testing.

#### 3) Running both servers side-by-side

For export scenarios with Redis-backed downloads, run both servers in separate terminals:

```bash
# Terminal 1
npm run server:http

# Terminal 2
npm run server:mcp:http
```

Stop servers with `Ctrl+C` when done.

## CLI overview

A single CLI entrypoint (`mrmagic-cli`) is published with the package.
Inside this repository, use `npm run cli -- --help` unless you've run
`npm link` (or installed globally) so `mrmagic-cli` is available on `PATH`.
Running `mrmagic-cli --help` (or `npm run cli -- --help` inside the repo),
prints a top-level summary, while subcommand-specific help—e.g.,
`mrmagic-cli search --help`—lists all flags
with descriptions, defaults, and examples.

### Command summary

| Command                       | Purpose                                                             | Notable flags                                                                                                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mrmagic-cli search`          | List candidate matches across providers without downloading lyrics. | `--artist`/`--title` (required track metadata), `--provider` (limit providers), `--duration` (match duration in ms), `--show-all` (print table), `--pick` (auto-select provider result).                                                    |
| `mrmagic-cli find`            | Resolve the best lyric (prefers synced) and print/export it.        | `--providers` (CSV priority list), `--synced-only` (reject plain results), `--export` (write files), `--format` (repeatable; e.g., lrc,srt), `--output` (custom export dir), `--no-romanize`, `--choose`/`--index` (select specific match). |
| `mrmagic-cli select`          | Pick the first match from a prioritized provider list.              | `--providers` (CSV order), `--artist`, `--title`, `--require-synced` (only accept synced lyrics).                                                                                                                                           |
| `mrmagic-cli server`          | Run the JSON automation API (same as `npm run server:http`).        | `--host` (interface to bind; default 127.0.0.1), `--port` (listening port; overrides env/`PORT`), `--remote` (shorthand for `--host 0.0.0.0`).                                                                                              |
| `mrmagic-cli server:mcp`      | Start the MCP stdio server (stdio transport).                       | _(none)_                                                                                                                                                                                                                                    |
| `mrmagic-cli server:mcp:http` | Start the Streamable HTTP MCP server.                               | `--host`, `--port`, `--remote`, `--sessionless` (disable per-session connection IDs; useful for stateless/manual debugging).                                                                                                                |
| `mrmagic-cli search-provider` | Query a single provider only.                                       | `--provider` (required provider name), `--artist`, `--title`.                                                                                                                                                                               |
| `mrmagic-cli status`          | Print provider readiness information.                               | _(none)_                                                                                                                                                                                                                                    |

### Command Examples

- Local repo usage: `npm run cli -- search --artist "BLACKPINK" --title "Kill This Love"`
  – list candidates across all providers.
- Local repo usage: `npm run cli -- find --artist "Nayeon" --title "POP!"`
  – download the best lyric (prefers synced LRC when possible).
- Local repo usage: `npm run cli -- select --providers lrclib,genius --artist "Nayeon" --title "POP!" --require-synced`
  – pick the first synced match from the prioritized provider list.
- Linked/global usage: `mrmagic-cli server --port 4000`
  – run the JSON automation API locally once `mrmagic-cli` is on `PATH`.

### CLI troubleshooting (npm argument forwarding)

The `cli` npm script supports both invocation styles:

- ✅ `npm run cli search --artist "K/DA" --title "I'll Show You"`
- ✅ `npm run cli -- search --artist "K/DA" --title "I'll Show You"`

The first form is preferred for readability, but both are supported.

For direct binary usage, use `mrmagic-cli search --artist ... --title ...`.

## Provider notes

- **LRCLIB**: Public API with synced lyric coverage; no auth required.
- **Genius**: Requires `GENIUS_ACCESS_TOKEN`. Provides metadata-rich plain
  lyrics.
- **Musixmatch**: Requires a token — either a **fallback token** set via
  `MUSIXMATCH_USER_TOKEN` (recommended for production) or `MUSIXMATCH_TOKEN`
  env vars, or a **cache token** written to disk by
  `scripts/fetch_musixmatch_token.mjs` (local dev). See "Getting the Musixmatch
  token" above for the full workflow.
- **Melon**: Works anonymously but benefits from `MELON_COOKIE` for reliability
  if needed.

Providers are queried concurrently, and results are normalized into a shared
schema exposed via the CLI, HTTP API, and MCP tools.

## Changelog

See `CHANGELOG.md` for a summary of recent updates, including MCP transport
changes and test improvements.

## LICENSE

[MIT LICENSE](/LICENSE)

I am not and cannot be held liable for any infrigement or ban from services
that could occur as a result of using this software. Your usage is solely
your responsibility. Godspeed.

© 2026 Kenyatta Naji Johnson-Adams
