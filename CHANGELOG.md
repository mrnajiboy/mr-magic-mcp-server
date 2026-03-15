## Changelog

### 0.1.21 - 2026-03-15

#### 📝 README — Slight formatting fix

### 0.1.20 - 2026-03-15

#### 📝 README — MCP Client Configuration overhaul

- Reorganized the **MCP Client Configuration** section into two clearly labelled
  groups with a summary table at the top:
  - **Local clients (stdio)** — covers `npx`, global install, Cline, and the
    shell-wrapper pattern for clients without `cwd` support.
  - **Remote clients (Streamable HTTP)** — new section covering TypingMind,
    legacy SSE clients, and a generic URL-based config snippet.
- **TypingMind subsection** documents the step-by-step connection flow (MCP
  Connector extension → Plugins → MCP Servers → endpoint URL) and explains that
  credentials are configured server-side with no `env` block needed in the client.
- **TypingMind "Update required" callout** — documents the
  *"Update required. Please restart your MCP Connector to upgrade to the latest
  version that support Remote MCP servers with authentication."* message as a
  **TypingMind MCP Connector extension** version prompt (not a Mr. Magic error),
  and gives the fix: restart or update the extension from the Chrome / Edge Web
  Store.
- **Legacy SSE clients** subsection added with `/sse` + `/messages` endpoint
  reference for clients that use the pre-Streamable HTTP SSE protocol.
- Removed the outdated TypingMind reference from the "clients without `cwd`
  support" shell-wrapper example — TypingMind now uses remote HTTP, not stdio.
- Added horizontal rules between the two connection-mode groups for readability.

#### 🔖 Version

- Bumped to `0.1.20` in `package.json`.

---

### 0.1.19 - 2026-03-15

#### 📝 README — Socket security badge

- Added a [Socket](https://socket.dev) supply-chain security badge to the top of
  `README.md` alongside the existing npm version and downloads badges.
  The badge links to the package's Socket analysis page
  (`https://socket.dev/npm/package/mr-magic-mcp-server`).

#### 🔖 Version

- Bumped to `0.1.19` in `package.json`.

---

### 0.1.18 - 2026-03-15

#### 📝 README — npm version and downloads badges

- Added live shields.io badges to the top of `README.md`:
  - `npm version` — links to the npm package page and displays the latest published version.
  - `npm downloads` — displays monthly download count.

#### 🔖 Version

- Bumped to `0.1.18` in `package.json`.

---

### 0.1.17 - 2026-03-15

#### 🐛 Fix "Server already initialized" on MCP HTTP reconnect

- **`src/transport/mcp-http-server.js`** — The server previously created a
  single `Server` + `StreamableHTTPServerTransport` pair at startup and reused
  it for every client. When TypingMind (or any MCP client) disconnected and sent
  a fresh `initialize` request, the SDK's transport rejected it with
  `Invalid Request: Server already initialized` (HTTP 400, error code -32600)
  because `_initialized` and `sessionId` were already set from the previous
  connection.

  **Fix — per-session transport management:**
  - Moved `Server` construction into a `createMcpServer()` factory so a fresh
    server is created for each session.
  - Added a `streamableSessions` `Map` (`sessionId → { server, transport }`)
    to track active Streamable HTTP sessions.
  - `POST /mcp` now detects `initialize` requests (no `mcp-session-id` header)
    and spins up a new `Server` + `StreamableHTTPServerTransport` per session,
    storing it in the map after `server.connect(transport)`.
  - Subsequent requests are routed to the correct transport by `mcp-session-id`
    header lookup; unknown session IDs return a `404`.
  - `DELETE /mcp` tears down the session's server and removes it from the map.
  - `transport.onclose` cleans up abandoned sessions automatically.
  - Sessionless mode (`--sessionless` / `options.sessionless`) still works:
    creates a temporary server+transport per request.

#### ✨ Legacy SSE transport fallback (`/sse` + `/messages`)

- **`src/transport/mcp-http-server.js`** — Added legacy MCP SSE endpoints for
  backward compatibility with clients that use the pre-Streamable HTTP protocol:
  - `GET /sse` — opens an SSE stream; creates a fresh `Server` + `SSEServerTransport`
    per connection, tracked in an `sseSessions` `Map`.
  - `POST /messages` — routes JSON-RPC messages to the correct SSE session via
    the `?sessionId=` query param advertised by the transport; falls back to the
    most-recently-opened session for simple single-client deployments.
  - SSE sessions clean up via `transport.onclose`.
  - Startup log now prints both `endpoint` (Streamable HTTP) and `sseEndpoint` (SSE).

#### 🔖 Version

- Bumped to `0.1.17` in `package.json`.

---

### 0.1.16 - 2026-03-15

#### 🐛 Fix `/downloads` route — unnamed wildcard rejected by path-to-regexp

- **`src/transport/mcp-http-server.js`** — Changed route from
  `/downloads/:downloadId/*` to `/downloads/:downloadId/:extension`.
  Newer versions of `path-to-regexp` (used by the Express router on Render's
  Node runtime) reject unnamed `*` wildcards and throw
  `Missing parameter name at index N`, crashing the server at startup.
  The extension segment (`plain`, `lrc`, `srt`, `romanized`) is always a single
  path segment with no slashes, so a named param is the correct and more
  explicit form.

#### 🔖 Version

- Bumped to `0.1.16` in `package.json`.

---

### 0.1.15 - 2026-03-15

#### 🔖 Version

- Bumped to `0.1.15` — `0.1.14` npm publish auto-completed via OTP before the
  HTTP Endpoints README docs were committed. All changes are documented under
  `0.1.14` below.

---

### 0.1.14 - 2026-03-15

#### 📝 README — HTTP Endpoints section

- Added a dedicated **HTTP Endpoints** section documenting all plain HTTP routes
  exposed by both servers (`/health`, `/downloads/:id/:ext`, `/mcp`, `/`), including
  response shapes, parameter references, and per-server `curl` examples.
- `/health` response shape documented: `{ status, providers: [{ name, status }] }`;
  provider `status` values (`ok`, `missing_token`, `error`) listed in a reference table.
- `/downloads/:id/:ext` parameters, example requests, and response codes (`200`, `400`,
  `404`, `500`) documented with notes on TTL and backend requirements.
- Section added to Table of Contents between Remote Deployment and MCP Tools.

#### 🔖 Version

- Bumped to `0.1.14` — previous `0.1.13` npm publish completed before
  `/downloads` route and README updates were added.
  All functional changes are documented under `0.1.13` below.

---

### 0.1.13 - 2026-03-15

#### ✨ `/downloads` route on MCP HTTP server

- **`src/transport/mcp-http-server.js`** — Added `GET /downloads/:downloadId/*` route.
  The MCP HTTP server (`server:mcp:http`) now serves Redis-backed export download links
  directly, making it self-sufficient for Redis export workflows without needing the
  JSON HTTP automation server (`server:http`) running alongside it.
  `MR_MAGIC_DOWNLOAD_BASE_URL` can now point to the MCP HTTP server's base URL
  (e.g. `http://127.0.0.1:3444` locally, or your Render service URL) instead of
  requiring a separate `server:http` instance.

#### 🐛 Render deployment — host/port + DNS rebinding protection (both HTTP transports)

- **`src/transport/mcp-http-server.js`** — Auto-detects `RENDER=true` and binds
  to `0.0.0.0`; reads `process.env.PORT` (Render default: `10000`); fixed self-execution
  guard that caused double startup; passes `allowedHosts` to `createMcpExpressApp`
  using `localhost`, `127.0.0.1`, `RENDER_EXTERNAL_HOSTNAME`, and `MR_MAGIC_ALLOWED_HOSTS`.
- **`src/transport/http-server.js`** — Same Render-aware host/port resolution;
  added equivalent Host header validation middleware when binding to `0.0.0.0`
  (rejects with `403 Forbidden` when the `Host` header doesn't match the allowed set).
- Both servers respect `options.remote` (CLI `--remote` flag) and `process.env.HOST`.

#### 📝 README + docs

- Full README refactor: table of contents, env vars reorganized into per-group tables,
  dedicated Provider Credentials section, Render deployment documents all auto-set vars,
  transport selection table, streamlined manual testing (inline curl, correct health-check URLs),
  CLI condensed to a table, typo fixes, markdown lint compliance.
- `MR_MAGIC_ALLOWED_HOSTS` documented in README and `.env.example`.
- Export and Download Configuration section updated: both HTTP servers now document
  their `/downloads` route coverage; "Running both servers side-by-side" section
  clarified — running both is not required for Redis exports.

#### 🔖 Version

- Bumped to `0.1.13` in `package.json`.

---

### 0.1.11 - 2026-03-15

#### 🐛 Both HTTP servers — Render host/port + DNS rebinding protection

- **`src/transport/mcp-http-server.js`** — Added `allowedHosts` to
  `createMcpExpressApp` when binding to `0.0.0.0`, eliminating the "Server is
  binding to 0.0.0.0 without DNS rebinding protection" console warning. The
  allowed list is built automatically from `localhost`, `127.0.0.1`, and
  `RENDER_EXTERNAL_HOSTNAME` (auto-set by Render). Set `MR_MAGIC_ALLOWED_HOSTS`
  (comma-separated) to add custom domains.
- **`src/transport/http-server.js`** — Added equivalent Host header validation
  middleware to the plain Node `http.createServer` server. When binding to
  `0.0.0.0`, incoming requests whose `Host` header doesn't match the allowed-host
  set are rejected with `403 Forbidden`. Uses the same allowed-host list
  (`localhost`, `127.0.0.1`, `RENDER_EXTERNAL_HOSTNAME`, `MR_MAGIC_ALLOWED_HOSTS`)
  as the MCP HTTP server for consistent behaviour across both transports.

#### 📝 README

- Full README refactor: reorganized into logical sections with a table of contents,
  environment variables split into per-group tables (server, Genius, Musixmatch,
  export/storage, Airtable, Melon, diagnostics), provider credentials extracted into
  a dedicated section, Render deployment updated to document all three auto-set vars
  (`RENDER`, `PORT`, `RENDER_EXTERNAL_HOSTNAME`), transport selection table added,
  manual testing section streamlined (inline `curl` examples, fixed wrong health-check
  URL in MCP section, corrected "endpoins" typo), CLI section condensed to a table,
  fixed typos ("aficionados", "infringement"), bare URLs converted to proper markdown
  links, all code blocks language-tagged, headings and lists surrounded by blank lines.

#### 📦 Environment Variables

- **`.env.example`** and **`README.md`** — Added `MR_MAGIC_ALLOWED_HOSTS`
  documentation.

#### 🔖 Version

- Bumped to `0.1.11` in `package.json`.

---

### 0.1.10 - 2026-03-15

#### 🐛 Render deployment — host/port binding + duplicate startup

Both HTTP server transports now handle Render (and other platforms) correctly:

- **`src/transport/mcp-http-server.js`** and **`src/transport/http-server.js`** —
  Both servers previously hardcoded the host to `127.0.0.1` and ignored
  `process.env.PORT`. Host resolution now follows this priority:
  1. `options.remote` flag → `0.0.0.0` (explicit CLI `--remote`)
  2. `options.host` → explicit caller-supplied host
  3. `process.env.HOST` → platform-injected host override
  4. `process.env.RENDER === 'true'` → auto-detects Render and binds to `0.0.0.0`
  5. Fallback → `127.0.0.1` (local dev default)

  Port resolution now reads `process.env.PORT` (Render default: `10000`) before
  falling back to the hardcoded default (`3444` for MCP HTTP, `3333` for JSON HTTP).
  No manual `HOST` or `PORT` env vars are needed on Render — both are set by the
  platform automatically.

- **Duplicate startup fix** (`mcp-http-server.js`) — The self-execution guard used
  `process.argv[1]?.endsWith('mcp-http-server.js')`, which matched both
  `src/bin/mcp-http-server.js` (the actual entry point) and
  `src/transport/mcp-http-server.js`, causing `startMcpHttpServer()` to fire
  twice on every `npm run server:mcp:http` invocation (double logs, two
  "listening" messages). Tightened to `endsWith('transport/mcp-http-server.js')`.
- **DNS rebinding protection** (`mcp-http-server.js`) — `createMcpExpressApp` emitted
  a DNS rebinding warning when binding to `0.0.0.0` without an `allowedHosts` list.
  The server now builds this list automatically: `localhost`, `127.0.0.1`, and
  `RENDER_EXTERNAL_HOSTNAME` (auto-set by Render to the `.onrender.com` hostname).
  For custom domains, set `MR_MAGIC_ALLOWED_HOSTS` to a comma-separated list of
  additional hostnames to include.

#### 📝 README

- Added Render deployment guidance to the "Remote deployment" section.
- Clarified `PORT` env var note: Render sets it automatically (default `10000`);
  no manual override is needed.

#### 🔖 Version

- Bumped to `0.1.10` in `package.json`.

---

### 0.1.9 - 2026-03-15

#### 📝 README

- Updated `README.md` with latest docs.

#### 🔖 Version

- Bumped to `0.1.9` in `package.json`.

---

### 0.1.8 - 2026-03-15

#### ✨ `/health` endpoint on MCP HTTP server

- **`src/transport/mcp-http-server.js`** — Added `GET /health` route to the
  Streamable HTTP MCP server (port 3444). Returns `{ status: 'ok', providers: [...] }`
  via `getProviderStatus()`, matching the shape already provided by the plain HTTP
  server (`src/transport/http-server.js`). All remote-deployment server flavours now
  expose a health check endpoint.

#### 🔖 Version

- Bumped to `0.1.8` in `package.json`.

---

### 0.1.7 - 2026-03-15

#### ✨ Genius token — cache token support + consistent naming

- **`src/utils/tokens/genius-token-manager.js`** — now reads
  `.cache/genius-token.json` as a final fallback (cache token) when neither
  `client_credentials` auto-refresh nor `GENIUS_ACCESS_TOKEN` (fallback token)
  resolves a token. Adds `readCachedToken()` with expiry validation (skips
  expired cache files). `getGeniusDiagnostics()` is now `async` and includes
  `cacheTokenPresent`, `cacheTokenExpired`, and `cachePath`. Module-level
  comment block uses the same cache token / fallback token / auto-refresh
  terminology introduced in 0.1.6. `GENIUS_TOKEN_CACHE` env var controls the
  cache path (must match `scripts/fetch_genius_token.mjs`).

  Token resolution priority for Genius is now:
  1. In-memory runtime cache
  2. Auto-refresh via `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET` ← recommended
  3. `GENIUS_ACCESS_TOKEN` env var — fallback token (static, no auto-refresh)
  4. On-disk `.cache/genius-token.json` — cache token (local dev only)

- **`src/transport/token-startup-log.js`** — `logGeniusStatus()` now awaits
  `getGeniusDiagnostics()` and logs `cacheTokenPresent` + `cacheTokenExpired`.
  Musixmatch missing-token warning updated to use the new terminology.

#### 🐛 Fixes

- **`scripts/fetch_MUSIXMATCH_ALT_FALLBACK_TOKEN.mjs`** — fixed env var name from stale
  `MUSIXMATCH_ALT_USER_TOKEN_CACHE` to `MUSIXMATCH_TOKEN_CACHE` so the fetch
  script and the token manager read/write the same cache file path.

#### 🖨️ Fetch script deployment output

Both fetch scripts now print a deployment-ready block after capturing the
token, with three sections:

- **Recommended (Genius only):** `GENIUS_CLIENT_ID` + `GENIUS_CLIENT_SECRET`
  auto-refresh path (no fetch script needed at all).
- **Local development:** confirms the cache token file path where the script
  wrote the token.
- **Render / ephemeral deployments:** copy-pasteable env var assignment (e.g.
  `MUSIXMATCH_FALLBACK_TOKEN=<value>`) with an explanation of why the env var path
  is necessary on hosts without persistent storage.

#### 📦 Environment Variables

- **`.env.example`** — Genius section fully rewritten to document all three
  token sources (auto-refresh, fallback token, cache token). `GENIUS_CLIENT_ID`
  and `GENIUS_CLIENT_SECRET` are now listed before `GENIUS_ACCESS_TOKEN` to
  reflect the recommended priority. `GENIUS_TOKEN_CACHE` added to the
  Advanced/Debug section alongside `MUSIXMATCH_TOKEN_CACHE`.

- **`README.md`** — Genius env var bullets updated with three-source breakdown.
  Genius provider note updated to mention auto-refresh as the primary option.
  All remaining stale `MUSIXMATCH_ALT_USER_TOKEN` / `MUSIXMATCH_ALT_USER_TOKEN_CACHE`
  references replaced with `MUSIXMATCH_ALT_FALLBACK_TOKEN` / `MUSIXMATCH_TOKEN_CACHE`.

#### 🔖 Version

- Bumped to `0.1.7` across `package.json`.

---

### 0.1.6 - 2026-03-15

#### 🏷️ Naming Convention — Musixmatch Token Sources

Introduced clear, source-based names for the two ways the Musixmatch token can
be supplied. Both hold the same token value; the label describes where it comes
from:

- **Fallback token** (`MUSIXMATCH_FALLBACK_TOKEN` or `MUSIXMATCH_ALT_USER_TOKEN` env vars) —
  the token is set directly as an environment variable. This is the only
  reliable option on ephemeral/production hosts (Render free tier, containers
  without a persistent volume) where the filesystem is wiped between restarts.
  `MUSIXMATCH_FALLBACK_TOKEN` is checked first (1st priority);
  `MUSIXMATCH_ALT_USER_TOKEN` is the legacy/alternative env var (2nd priority).
- **Cache token** (on-disk `.cache/musixmatch-token.json`) — written by the
  `fetch:musixmatch-token` script after a browser sign-in. Loaded on startup
  when a persistent, writable filesystem is available. Not suitable for
  ephemeral hosts.

This terminology is now applied consistently across:

- `src/utils/tokens/musixmatch-token-manager.js` — module-level comment block
  and `getMusixmatchToken()` JSDoc
- `src/providers/musixmatch.js` — token-missing error message now names both
  sources and explains the distinction
- `.env.example` — Musixmatch section restructured around the two source types
- `README.md` — env var bullet, "Getting the Musixmatch token" section, MCP
  client config example, and provider notes all updated to use the new labels

#### 🐛 Fixes

- **`src/providers/musixmatch.js`** — replaced `assertEnv(['MUSIXMATCH_ALT_USER_TOKEN'])`
  with a descriptive `throw` that names both env vars and the cache token path,
  so the error message is actionable regardless of which source the operator
  intended to use. Also removed the now-unused `assertEnv` import.

#### 📦 Environment Variables

- **`.env.example`** — `MUSIXMATCH_FALLBACK_TOKEN` is now listed first (matching
  the 1st-priority resolution order) with a clear "Fallback token" label.
  `MUSIXMATCH_ALT_USER_TOKEN` is listed second with a "Fallback token (2nd priority)"
  label. The section header explains both source types rather than mixing env
  vars and cache in a single generic note.

---

### 0.1.5 - 2026-03-15

#### ✨ New Features

- **`push_catalog_to_airtable` MCP tool** — Writes Airtable catalog records with server-side
  lyric resolution so lyrics never pass through LLM tool-call arguments. The tool reads from
  an in-memory catalog cache populated by `build_catalog_payload`, looks up the correct entry
  via the returned `lyricsCacheKey`, and calls the Airtable REST API directly. Supports:
  - single-call create (all fields at once) or PATCH update of existing records
  - `splitLyricsUpdate: true` for a two-step create → PATCH flow when combined payloads are too large
  - `preferRomanized` flag for automatic romanized vs. original lyrics selection
- **Catalog cache in `lyrics-service.js`** — `build_catalog_payload` now stores each resolved
  lyric record in a bounded LRU cache (20 entries). The `lyricsCacheKey` returned in the
  response identifies the cached entry so downstream tools like `push_catalog_to_airtable` can
  look it up server-side without re-fetching.
- **`src/services/airtable-writer.js`** — New REST client for the Airtable API:
  `createAirtableRecord`, `updateAirtableRecord`, and the high-level `pushCatalogToAirtable`
  orchestrator that handles create/update/split flows with logging and timeout support.
- **Bundled system-prompt template** (`prompts/airtable-song-importer.md`) — A ready-to-use
  MCP assistant prompt for batch song importing into Airtable. Covers tool responsibility
  breakdown, bulk-write phasing (Phase 1–4), Spotify link resolution, romanized lyric priority,
  SRT export requirements, and error-recovery via `splitLyricsUpdate`. Shipped in the npm
  package under the `prompts/` directory.
- **`npx` / global-install usage** — README and MCP client configs updated to document
  `npx -y mr-magic-mcp-server` as the zero-clone entry point alongside the local-repo workflow.

#### 📦 Environment Variables

- **`.env.example`** — Added `AIRTABLE_PERSONAL_ACCESS_TOKEN` (required for
  `push_catalog_to_airtable`; get from <https://airtable.com/create/tokens>).

#### 🔖 Version

- Bumped to `0.1.5` across `package.json`.

---

### 0.1.4 - 2026-03-15

#### 🐛 Bugs Fixed

- **`mcp-response.js`** — `buildMcpResponse()` previously emitted two `content` blocks for
  responses that didn't look like lyric payloads (e.g. `build_catalog_payload` with
  `omitInlineLyrics: true`): a truncated 220-char preview first, then the full JSON.
  LLMs reading the response encountered the truncated text _first_, producing unterminated
  strings in downstream Airtable payloads. Fixed: always exactly **one** `content` block —
  the complete pretty-printed JSON. Preview/summary logic is now CLI-only.
- **Cline MCP server refresh error** — Using `npm run server:mcp` as the Cline command
  caused `> mr-magic-mcp-server@x.x.x server:mcp` npm echo lines to pollute stdout,
  which Cline tried to JSON-parse, producing "Unexpected token '>'..." errors on every
  refresh. Fixed: Cline config now invokes `node src/bin/mcp-server.js` directly.

#### 🗑️ Dead Code / Stale Config Removed

- **`src/transport/mcp-response.js`** — Removed `buildResultSummary`, `extractPreviewText`,
  `looksLikeLyricPayload`, `truncate`, `truncateInline`, and all the preview-injection
  branch from `buildMcpResponse`. None of those are needed for programmatic MCP consumers.
- **`.env.example`** — Removed `MR_MAGIC_TMP_DIR` (never referenced in source code).

#### 📦 Environment Variables

- **`.env.example`** — Added `MUSIXMATCH_FALLBACK_TOKEN` (surfaced by `runtime_status` credential
  scan in `mcp-tools.js`) and `MR_MAGIC_INLINE_PAYLOAD_MAX_CHARS` (referenced in
  `lyrics-service.js`). Both were in the README and code but missing from the example file.

#### 🔖 Version

- Bumped to `0.1.4` across `package.json`, `mcp-server.js`, `mcp-http-server.js`.

---

### 0.1.3 - 2026-03-14

- Restored CLI invocation compatibility for npm argument-forwarding edge cases:
  - `npm run cli search -a "..." -t "..."` now recovers correctly when npm strips short flags.
  - `npm run cli -- <subcommand> ...` and direct Node usage continue to work.
- Renamed published package binaries to shorter names:
  - `mr-magic-mcp-cli` → `mrmagic-cli`
  - `mr-magic-mcp-server` → `http-server`
  - `mr-magic-mcp-server-mcp` → `mcp-server`
  - `mr-magic-mcp-server-mcp-http` → `mcp-http-server`
- Updated runtime server identity labels to match renamed binaries (`mrmagic-cli`, `mcp-server`, `mcp-http-server`).
- Updated README command docs/examples to reflect:
  - new binary names,
  - correct npm top-level help form (`npm run cli -- --help`),
  - current npm invocation compatibility guidance.

### 0.1.2 - 2026-03-14

- Hardened MCP argument-boundary handling for Airtable-heavy flows:
  - `build_catalog_payload` and `select_match` now reject stringified
    `params.arguments` and require object/record payloads.
  - Added clearer warning logs when other tools receive string arguments,
    nudging callers toward object-based payloads.
- Clarified Streamable HTTP startup diagnostics to report configured
  `sessionless` mode directly instead of inferring from pre-init session state.
- Expanded README guidance for Airtable-safe payload transport:
  - explicit SDK vs `fetch` calling patterns,
  - anti-pattern warning against manual JSON string templating,
  - updated truncation-debug section to document object-only enforcement on key tools.
- Refined MCP tool descriptions for `build_catalog_payload` and `select_match`
  to emphasize multiline payload safety and object argument usage.

### 0.1.1 - 2026-03-12

- Added a Streamable HTTP MCP server (`npm run server:mcp:http` / `mr-magic-mcp-server-mcp-http`) for remote MCP clients while keeping stdio for local usage.
- Centralized MCP tool definitions/handlers (`src/transport/mcp-tools.js`) and expanded integration tests (`tests/mcp-tools.test.js`).
- Documented MCP transports and testing strategy in the README.
- Expanded `.gitignore` to cover logs, npm packs, and render artifacts.
- Introduced pluggable export storage (`MR_MAGIC_EXPORT_BACKEND`), including local directories, inline responses, and Upstash Redis with `/downloads/:id/:ext` endpoints.
- Added `.env.example` placeholders plus README docs for new env vars (`MR_MAGIC_EXPORT_*`, `MR_MAGIC_DOWNLOAD_BASE_URL`, `UPSTASH_*`, `MR_MAGIC_TMP_DIR`, `MR_MAGIC_QUIET_STDIO`).
- Replaced `node-fetch` with Node’s built-in `fetch` (via `undici`) to remove the deprecated `node-domexception` dependency.
