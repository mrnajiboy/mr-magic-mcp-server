## Changelog

### 0.1.1 - 2026-03-12

- Added a Streamable HTTP MCP server (`npm run server:mcp:http` / `mr-magic-mcp-server-mcp-http`) for remote MCP clients while keeping stdio for local usage.
- Centralized MCP tool definitions/handlers (`src/transport/mcp-tools.js`) and expanded integration tests (`tests/mcp-tools.test.js`).
- Documented MCP transports and testing strategy in the README.
- Expanded `.gitignore` to cover logs, npm packs, and render artifacts.
- Introduced pluggable export storage (`MR_MAGIC_EXPORT_BACKEND`), including local directories, inline responses, and Upstash Redis with `/downloads/:id/:ext` endpoints.
- Added `.env.example` placeholders plus README docs for new env vars (`MR_MAGIC_EXPORT_*`, `MR_MAGIC_DOWNLOAD_BASE_URL`, `UPSTASH_*`, `MR_MAGIC_TMP_DIR`, `MR_MAGIC_QUIET_STDIO`).
- Replaced `node-fetch` with Node’s built-in `fetch` (via `undici`) to remove the deprecated `node-domexception` dependency.
