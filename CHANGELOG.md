## Changelog

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
