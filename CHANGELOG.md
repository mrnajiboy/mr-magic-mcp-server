## Changelog

### 0.1.4 - 2026-03-15

#### 🐛 Bugs Fixed
- **`mcp-response.js`** — `buildMcpResponse()` previously emitted two `content` blocks for
  responses that didn't look like lyric payloads (e.g. `build_catalog_payload` with
  `omitInlineLyrics: true`): a truncated 220-char preview first, then the full JSON.
  LLMs reading the response encountered the truncated text *first*, producing unterminated
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
