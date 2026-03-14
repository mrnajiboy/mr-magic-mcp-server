## Changelog

### 0.1.6 - 2026-03-15

#### 🏷️ Naming Convention — Musixmatch Token Sources

Introduced clear, source-based names for the two ways the Musixmatch token can
be supplied. Both hold the same token value; the label describes where it comes
from:

- **Fallback token** (`MUSIXMATCH_USER_TOKEN` or `MUSIXMATCH_ALT_USER_TOKEN` env vars) —
  the token is set directly as an environment variable. This is the only
  reliable option on ephemeral/production hosts (Render free tier, containers
  without a persistent volume) where the filesystem is wiped between restarts.
  `MUSIXMATCH_USER_TOKEN` is checked first (1st priority);
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

- **`.env.example`** — `MUSIXMATCH_USER_TOKEN` is now listed first (matching
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

- **`.env.example`** — Added `MUSIXMATCH_USER_TOKEN` (surfaced by `runtime_status` credential
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
