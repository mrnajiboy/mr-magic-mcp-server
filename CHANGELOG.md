## Changelog

### 0.1.1 - 2026-03-12

- Added a Streamable HTTP MCP server (`npm run server:mcp:http` / `mr-magic-mcp-server-mcp-http`) for remote MCP clients while keeping stdio for local usage.
- Centralized MCP tool definitions/handlers (`src/transport/mcp-tools.js`) and expanded integration tests (`tests/mcp-tools.test.js`).
- Documented MCP transports and testing strategy in the README.
- Expanded `.gitignore` to cover logs, npm packs, and render artifacts.