# Mr. Magic MCP Server

Mr. Magic bridges LRCLIB, Genius, Musixmatch, and Melon so command-line users,
HTTP automations, and MCP clients can all request lyrics from a single
toolchain. This README covers local setup, deployment options, MCP transport
details, and the automated tests that protect the surface area.

## Prerequisites

- Node.js 18.17 or newer
- npm 9+
- macOS/Linux/WSL (Playwright + MCP transports work cross-platform)
- Provider credentials (see below)

Install dependencies:

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` (or export values in your shell) and fill in the
credentials plus any storage configuration:

```env
GENIUS_ACCESS_TOKEN=your_genius_api_token
MUSIXMATCH_TOKEN=your_musixmatch_token
MELON_COOKIE=your_melon_session_cookie (optional)

# Export + storage controls
PORT=3333                               # override whichever HTTP server you launch
MR_MAGIC_EXPORT_BACKEND=local # local | inline | redis
MR_MAGIC_EXPORT_DIR=/absolute/path         # used by local backend
MR_MAGIC_EXPORT_TTL_SECONDS=900           # redis expiry if enabled
MR_MAGIC_DOWNLOAD_BASE_URL=https://example.com/magic
UPSTASH_REDIS_REST_URL=https://...         # required when using redis exports
UPSTASH_REDIS_REST_TOKEN=...               # required when using redis exports
MR_MAGIC_TMP_DIR=/tmp/mr-magic             # overrides os.tmpdir for temp artifacts
MR_MAGIC_QUIET_STDIO=0                     # set to 1 to silence stdio logs
```

- Genius and Musixmatch tokens remain **required** when those providers are
  used.
- Melon works without a cookie, but you can supply one for consistency.
- `MR_MAGIC_EXPORT_BACKEND`
  - `local` (default) writes files to `MR_MAGIC_EXPORT_DIR` or `exports/`.
  - `inline` skips writes and just returns the formatted strings in tool
    responses.
  - `redis` pushes each format to Upstash Redis and returns signed download URLs
    (requires the Upstash env vars above plus a `MR_MAGIC_DOWNLOAD_BASE_URL` so
    clients know where to fetch).
- `MR_MAGIC_EXPORT_DIR` can be written plainly (e.g., `/tmp/mr-magic-exports`).
  Only quote it if the path contains spaces or characters that would confuse
  shell/env parsing (`MR_MAGIC_EXPORT_DIR="/Users/you/My Exports"`).
- `PORT` is honored by both HTTP entrypoints when your platform injects one
  (e.g., Render/Fly). If unset, the JSON automation server defaults to `3333`
  and the MCP HTTP transport defaults to `3444`. CLI flags such as
  `mr-magic-mcp-server server --port 4000` still take precedence.
- `MR_MAGIC_QUIET_STDIO=1` keeps stdio transports silent by downgrading log
  noise.
- In remote deployments (Render/Fly/Netlify/etc.), inject the same variable
  names in the platform dashboard—no `.env` file required.

### Getting the Musixmatch token

1. Visit `https://auth.musixmatch.com/`
2. Sign in with a Musixmatch account and allow the app. When redirected, the
   helper script below will capture the cookies.
3. Run `npm run fetch:musixmatch-token` to open a browser, complete the login,
   and copy the printed `web-desktop-app-v1.0` value into `MUSIXMATCH_TOKEN`
   (this is the actual token used by the API). The decoded `musixmatchUserToken`
   JSON is logged for reference but not required.

### Optional Melon cookie

Fetching Melon search/lyric endpoints still works with the MCP’s built-in cookie
collection. If `MELON_COOKIE` is blank, the app will quietly request whatever
session cookies the site provides, so you rarely need to copy a manual string.
If you prefer to pin a cookie for repeatable results, set `MELON_COOKIE` to the
complete cookie header you already trust.

### CLI overview

Mr. Magic ships with a single CLI binary (`mr-magic-mcp-server`). The most
common commands are:

- `mr-magic-mcp-server search --artist "BLACKPINK" --title "Kill This Love"` –
  list candidates across all providers.
- `mr-magic-mcp-server find --artist "Nayeon" --title "POP!"` – download the
  best lyric (prefers synced LRC when possible).
- `mr-magic-mcp-server select --provider lrclib --index 1 --file
  ./search-results.json` – pick a result from a previous search dump.
- `mr-magic-mcp-server server --port 4000` – run the JSON automation API
  locally.
- `npm start` (alias for `mr-magic-mcp-server`) – launch the CLI interactively;
  combine with `server`, `search`, or `find` subcommands as needed.

Each command supports `--help` for detailed flags.

### Linting & formatting

- `npm run lint` / `npm run lint:fix`
- `npm run format` / `npm run format:check`

ESLint enforces import order + Node best practices, while Prettier keeps
formatting consistent.

## Local testing

### Commands

- `npm start` – run the CLI (`src/tools/cli.js`)
- `npm run server:http` – start the JSON HTTP automation endpoint (remote/local
  automation)
- `node ./src/bin/mcp-server.js` – start the MCP stdio server for clients such
  as Cline/Claude
- `npm run server:mcp:http` – start the Streamable HTTP MCP server for remote
  MCP clients

Set the tokens via `.env` or `export` before running the commands. `dotenv` is
only a local convenience—production environments should provide tokens via real
env vars.

### MCP client configuration (local repo vs published npm)

Until the package is published to npm, most MCP clients need to launch the stdio
server via a shell so they can `cd` into the repo before running `npm run
server:mcp`. For example, TypingMind expects a single command and doesn’t set
`cwd`, so configure it like this:

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

If/when the project is published and installed globally (e.g., `npm install -g
mr-magic-mcp-server`), MCP clients can invoke the installed binary directly
(`mr-magic-mcp-server-mcp`) without the `cd`/shell workaround because the
executable will already be on `PATH`.

Note: `npm run server:mcp` keeps stdout clean (all logging goes to stderr), so
stdio-based clients see only the JSON responses regardless of which launch style
you use.

### Export + download configuration

- **Local files:** The default `local` backend writes into `exports/` (repo
  root). Override with `MR_MAGIC_EXPORT_DIR=/absolute/path` when the working
  directory isn’t writable. The `export_lyrics` tool also includes the raw
  `content` field so clients can still inline results if file writes fail.
- **Redis downloads:** Set `MR_MAGIC_EXPORT_BACKEND=redis` plus
  `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and
  `MR_MAGIC_DOWNLOAD_BASE_URL`. Each export is cached in Upstash for
  `MR_MAGIC_EXPORT_TTL_SECONDS` seconds, but the download link should point at
  *your own* HTTP server’s `/downloads/:id/:ext` route (not the Upstash REST
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
  `http://127.0.0.1:3333/downloads/<id>/<ext>`. If you override the server port
  via `PORT` or `--port`, update the base URL accordingly.
- **Inline:** `MR_MAGIC_EXPORT_BACKEND=inline` is handy for sandboxes that
  prohibit writes. Instead of touching the file system or Redis, each export is
  returned inline in the tool/server response with `content` populated and
  `skipped: true` to signal that persistence was intentionally bypassed (not
  that the export failed).
- **Temporary files:** `MR_MAGIC_TMP_DIR` controls where internal debug
  artifacts land (defaults to `os.tmpdir()`), so remote runners that disallow
  root writes can set `/tmp/mr-magic` or similar.

## Remote deployment

Ensure the deployment environment injects the same environment variables, then
choose the transport you need:

- **CLI** for ad-hoc/manual usage (one-off SSH sessions, CI jobs, or
  ephemeral workers). Invoke with `npm start -- <subcommand>` or
  `npx mr-magic-mcp-server <subcommand>`; it isn’t designed to run as a
  long-lived daemon because it exits after each command completes.
- **HTTP server** for container/remote automation (`npm run server:http`).
- **MCP server (stdio)** for local Model Context Protocol clients (`node
  ./src/bin/mcp-server.js`).
- **MCP server (HTTP)** for remote MCP clients that speak the Streamable HTTP
  transport (`npm run server:mcp:http`).

When running the Streamable HTTP transport in remote environments, restrict
ingress (e.g., `0.0.0.0:3444` behind auth) and provide allowed host/origin
headers via the MCP SDK options if needed.

### MCP tool surface

Both transports expose the same tool registry:

|Tool name|Purpose|
|---------|-------|
|`find_lyrics`|Fetch best lyrics (prefers synced) plus metadata and payload.|
|`find_synced_lyrics`|Like `find_lyrics` but rejects plain-only results.|
|`search_lyrics`|List candidate matches across providers without hydration.|
|`search_provider`|Query a single provider (requires the `provider` flag).|
|`get_provider_status`|Report readiness and notes for each provider.|
|`export_lyrics`|Download + write plain/LRC/SRT/romanized files to disk.|
|`format_lyrics`|Format lyrics in memory (optional romanization) for display.|
|`select_match`|Pick a prior result by provider/index/synced flag.|
|`runtime_status`|Snapshot provider readiness plus present env vars.|

Add new tools by editing `src/transport/mcp-tools.js`, then extend
`tests/mcp-tools.test.js` so integration coverage stays current.

## Testing strategy

- `npm run test` – exercises chooser behavior (`autoPick`, `selectMatch`) and
  dumps the tool registry.
- `node tests/mcp-tools.test.js` – directly invokes each MCP tool to confirm
  arguments, payload shapes, and error handling.
- `npm run lint` – runs ESLint (flat config) to enforce import order and Node
  best practices.
- `npm run format:check` – runs Prettier to keep formatting consistent.
- `npm pack --dry-run` – verifies the packaged file list plus README/CHANGELOG
  contents before publishing.

Run the HTTP/stdio transports locally to confirm the MCP endpoints respond (use
direct `node` so stdio stays clean):

```bash
node ./src/bin/mcp-server.js &
npm run server:mcp:http &
curl \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:3444/mcp
```

## Provider notes

- **LRCLIB**: Public API with synced lyric coverage; no auth required.
- **Genius**: Requires `GENIUS_ACCESS_TOKEN`. Provides metadata-rich plain
  lyrics.
- **Musixmatch**: Requires `MUSIXMATCH_TOKEN`.
  `scripts/fetch_musixmatch_token.mjs` helps recover tokens.
- **Melon**: Works anonymously but benefits from `MELON_COOKIE` for reliability
  if needed.

Providers are queried concurrently, and results are normalized into a shared
schema exposed via the CLI, HTTP API, and MCP tools.

## Changelog

See `CHANGELOG.md` for a summary of recent updates, including MCP transport
changes and test improvements.
