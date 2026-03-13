## Mr. Magic MCP Server

Mr. Magic bridges LRCLIB, Genius, Musixmatch, and Melon so command-line users, HTTP automations, and MCP clients can all request lyrics from a single toolchain. This README covers local setup, deployment options, MCP transport details, and the automated tests that protect the surface area.

### Prerequisites

- Node.js 18.17 or newer
- npm 9+
- macOS/Linux/WSL (Playwright + MCP transports work cross-platform)
- Provider credentials (see below)

Install dependencies:

```bash
npm install
```

### Environment variables

Copy `.env.example` to `.env` (or export values in your shell) and fill in the credentials plus any storage configuration:

```env
GENIUS_ACCESS_TOKEN=your_genius_api_token
MUSIXMATCH_TOKEN=your_musixmatch_token
MELON_COOKIE=your_melon_session_cookie (optional)

# Export + storage controls
MR_MAGIC_EXPORT_BACKEND=local            # local | inline | redis
MR_MAGIC_EXPORT_DIR=/absolute/path       # used by local backend
MR_MAGIC_EXPORT_TTL_SECONDS=3600         # redis expiry if enabled
MR_MAGIC_DOWNLOAD_BASE_URL=https://example.com/magic
UPSTASH_REDIS_REST_URL=https://...       # required when using redis exports
UPSTASH_REDIS_REST_TOKEN=...             # required when using redis exports
MR_MAGIC_TMP_DIR=/tmp/mr-magic           # overrides os.tmpdir for temp artifacts
MR_MAGIC_QUIET_STDIO=0                   # set to 1 to silence stdio logs
```

- Genius and Musixmatch tokens remain **required** when those providers are used.
- Melon works without a cookie, but you can supply one for consistency.
- `MR_MAGIC_EXPORT_BACKEND`
  - `local` (default) writes files to `MR_MAGIC_EXPORT_DIR` or `exports/`.
  - `inline` skips writes and just returns the formatted strings in tool responses.
  - `redis` pushes each format to Upstash Redis and returns signed download URLs (requires the Upstash env vars above plus a `MR_MAGIC_DOWNLOAD_BASE_URL` so clients know where to fetch).
- `MR_MAGIC_QUIET_STDIO=1` keeps stdio transports silent by downgrading log noise.
- In remote deployments (Render/Fly/Netlify/etc.), inject the same variable names in the platform dashboard—no `.env` file required.

### Getting the Musixmatch token
1. Visit `https://auth.musixmatch.com/`
2. Sign in with a Musixmatch account and allow the app. When redirected, the helper script below will capture the cookies.
3. Run `npm run fetch:musixmatch-token` to open a browser, complete the login, and copy the printed `web-desktop-app-v1.0` value into `MUSIXMATCH_TOKEN` (this is the actual token used by the API). The decoded `musixmatchUserToken` JSON is logged for reference but not required.

### Optional Melon cookie
Fetching Melon search/lyric endpoints still works with the MCP’s built-in cookie collection. If `MELON_COOKIE` is blank, the app will quietly request whatever session cookies the site provides, so you rarely need to copy a manual string. If you prefer to pin a cookie for repeatable results, set `MELON_COOKIE` to the complete cookie header you already trust.

### CLI overview

Mr. Magic ships with a single CLI binary (`mr-magic-mcp-server`). The most common commands are:

- `mr-magic-mcp-server search --artist "BLACKPINK" --title "Kill This Love"` – list candidates across all providers.
- `mr-magic-mcp-server find --artist "Nayeon" --title "POP!"` – download the best lyric (prefers synced LRC when possible).
- `mr-magic-mcp-server select --provider lrclib --index 1 --file ./search-results.json` – pick a result from a previous search dump.
- `mr-magic-mcp-server server --port 4000` – run the JSON automation API locally.

Each command supports `--help` for detailed flags.

### Linting & formatting

- `npm run lint` / `npm run lint:fix`
- `npm run format` / `npm run format:check`

ESLint enforces import order + Node best practices, while Prettier keeps formatting consistent.

## Local testing

### Commands

- `npm start` – run the CLI (`src/tools/cli.js`)
- `npm run server:http` – start the JSON HTTP automation endpoint (remote/local automation)
- `node ./src/bin/mcp-server.js` – start the MCP stdio server for clients such as Cline/Claude
- `npm run server:mcp:http` – start the Streamable HTTP MCP server for remote MCP clients

Set the tokens via `.env` or `export` before running the commands.
`dotenv` is only a local convenience—production environments should provide tokens via real env vars.

### MCP client configuration (local repo vs published npm)

Until the package is published to npm, most MCP clients need to launch the stdio server via a shell so they can `cd` into the repo before running `npm run server:mcp`. For example, TypingMind expects a single command and doesn’t set `cwd`, so configure it like this:

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "/bin/sh",
      "args": [
        "-c",
        "cd /Users/you/Code/mr-magic-mcp-server && npm run server:mcp"
      ]
    }
  }
}
```

If/when the project is published and installed globally (e.g., `npm install -g mr-magic-mcp-server`), MCP clients can invoke the installed binary directly (`mr-magic-mcp-server-mcp`) without the `cd`/shell workaround because the executable will already be on `PATH`.

Note: `npm run server:mcp` now keeps stdout clean (all logging goes to stderr), so stdio-based clients see only the JSON responses regardless of which launch style you use.

### Export + download configuration

- **Local files:** The default `local` backend writes into `exports/` (repo root). Override with `MR_MAGIC_EXPORT_DIR=/absolute/path` when the working directory isn’t writable. The `export_lyrics` tool also includes the raw `content` field so clients can still inline results if file writes fail.
- **Redis downloads:** Set `MR_MAGIC_EXPORT_BACKEND=redis` plus `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `MR_MAGIC_DOWNLOAD_BASE_URL`. Each export is cached in Upstash for `MR_MAGIC_EXPORT_TTL_SECONDS` seconds and exposed via `GET /downloads/:id/:ext` on the HTTP automation server. MCP clients can take the returned URLs and download the files from the same HTTP server.
- **Inline:** `MR_MAGIC_EXPORT_BACKEND=inline` is handy for sandboxes that prohibit writes; tools simply echo the strings in the response.
- **Temporary files:** `MR_MAGIC_TMP_DIR` controls where internal debug artifacts land (defaults to `os.tmpdir()`), so remote runners that disallow root writes can set `/tmp/mr-magic` or similar.

## Remote deployment

Ensure the deployment environment injects the same environment variables, then choose the transport you need:

- **CLI** for ad-hoc/manual usage.
- **HTTP server** for container/remote automation (`npm run server:http`).
- **MCP server (stdio)** for local Model Context Protocol clients (`node ./src/bin/mcp-server.js`).
- **MCP server (HTTP)** for remote MCP clients that speak the Streamable HTTP transport (`npm run server:mcp:http`).

When running the Streamable HTTP transport in remote environments, restrict ingress (e.g., `0.0.0.0:3444` behind auth) and provide allowed host/origin headers via the MCP SDK options if needed.

### MCP tool surface

Both transports expose the same tool registry:

| Tool name         | Purpose |
| ----------------- | ------- |
| `find_lyrics`     | Fetch best lyrics (prefers synced) and return metadata + payload. |
| `find_synced_lyrics` | Same as above but rejects plain-only results. |
| `search_lyrics`   | Return candidate matches from every provider without hydration. |
| `search_provider` | Limit search to a single provider. Requires `provider`. |
| `get_provider_status` | Returns readiness + notes per provider. |
| `export_lyrics`   | Download + write plain/LRC/SRT/romanized files to disk. |
| `format_lyrics`   | Format lyrics in-memory (with optional romanization) for quick display. |
| `select_match`    | Choose from a previous result array by provider/index/synced flag. |
| `runtime_status`  | Snapshot of provider readiness plus which env vars are present. |

Add new tools by editing `src/transport/mcp-tools.js`, then extend `tests/mcp-tools.test.js` so integration coverage stays current.

## Testing strategy

| Command | What it covers |
| ------- | --------------- |
| `npm run test` | Core chooser behavior (`autoPick`, `selectMatch`, normalization) plus a tool registry dump. |
| `node tests/mcp-tools.test.js` | Calls each MCP tool directly to check arguments, payload shapes, and error messages. |
| `npm run lint` | ESLint (flat config) ensures consistent import order + syntax. |
| `npm run format:check` | Confirms Prettier formatting. |
| `npm pack --dry-run` | Useful before publishing—ensures files + README/CHANGELOG are packaged correctly. |

Run the HTTP/stdio transports locally to confirm the MCP endpoints respond (use direct `node` so stdio stays clean):

```bash
node ./src/bin/mcp-server.js &
npm run server:mcp:http &
curl -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:3444/mcp
```

## Provider notes

- **LRCLIB**: Public API with synced lyric coverage; no auth required.
- **Genius**: Requires `GENIUS_ACCESS_TOKEN`. Provides metadata-rich plain lyrics.
- **Musixmatch**: Requires `MUSIXMATCH_TOKEN`. `scripts/fetch_musixmatch_token.mjs` helps recover tokens.
- **Melon**: Works anonymously but benefits from `MELON_COOKIE` for reliability if needed.

Providers are queried concurrently, and results are normalized into a shared schema exposed via the CLI, HTTP API, and MCP tools.

## Changelog

See `CHANGELOG.md` for a summary of recent updates, including MCP transport changes and test improvements.