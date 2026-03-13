# Mr. Magic MCP Server

Mr. Magic bridges LRCLIB, Genius, Musixmatch, and Melon so MCP clients, Standard
HTTP automations or CLI afficionados can all request lyrics from a single toolchain.

## Prerequisites

- Node.js 18.17 or newer
- npm 9+
- macOS/Linux/WSL (Playwright + MCP transports work cross-platform)
- Provider credentials (see below)

## Installation

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
GENIUS_ACCESS_TOKEN=your_genius_api_token
MUSIXMATCH_TOKEN=your_musixmatch_token
MELON_COOKIE=your_melon_session_cookie (optional)

# Export + storage controls
PORT=                    # Override all server ports, or leave blank to default to 3444 for MCP, 3333 the JSON HTTP automation server. 
GENIUS_ACCESS_TOKEN=     # Get from https://genius.com/api-clients, required for Genius lyrics support.
MUSIXMATCH_TOKEN=        # Get from https://developer.musixmatch.com or see README for fetching from Public API.
MELON_COOKIE=            # Optional
MR_MAGIC_EXPORT_BACKEND= # local|inline|redis
MR_MAGIC_EXPORT_DIR=/absolute/path/to/exports # Required if MR_MAGIC_EXPORT_BACKEND=local
MR_MAGIC_EXPORT_TTL_SECONDS=3600 # Optional, default 3600 (1 hour). Only applies to local and redis backends, ignored for inline.                 
MR_MAGIC_DOWNLOAD_BASE_URL=https://yourserver.com|http://localhost:GIVEN_PORT   # Used for generating download links for exported files. See README for details.
UPSTASH_REDIS_REST_URL=  # Get from https://console.upstash.com/redis/rest, required if MR_MAGIC_EXPORT_BACKEND=redis
UPSTASH_REDIS_REST_TOKEN=  # Get from https://console.upstash.com/redis/rest, required if MR_MAGIC_EXPORT_BACKEND=redis
MR_MAGIC_TMP_DIR=/tmp/ # Optional, default /tmp/. Used for temporary file storage during export generation. Only applies to local and redis, ignored for inline.                    
MR_MAGIC_QUIET_STDIO=0  # Optional, default 0. If set to 1, suppresses all non-error logs to stdout. Useful when running in environments where you only want to capture errors, or when using the export functionality and don't want logs mixed in with export data.
```

- **GENIUS_ACCESS_TOKEN** and **MUSIXMATCH_TOKEN** are required for their
  respective providers. The CLI/servers will reject requests that need them if
  they are unset.
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
  `mr-magic-mcp-server server --port 4000` always take precedence.
- **MR_MAGIC_DOWNLOAD_BASE_URL** should match the public URL that exposes the
  `/downloads` routes. Include `:port` only when the HTTP server isn’t using
  the default for its protocol.
- **MR_MAGIC_QUIET_STDIO** set to `1` silences stdio transports (helpful when a
  host MCP client expects clean JSON over stdout).
- For hosted deployments, inject the variables via your platform dashboard so
  no `.env` file is required at runtime.

### Getting the Musixmatch token

#### Developer Accounts

1. Get API access from `https://developer.musixmatch.com`
2. Run `npm run fetch:musixmatch-token` to open a browser, complete the login,
   and copy the printed `web-desktop-app-v1.0` value into `MUSIXMATCH_TOKEN`.
   The decoded `musixmatchUserToken` JSON is logged for reference
   but not required.

#### Public Account (WARNING: MAY RESULT IN BAN)

1. Visit `https://auth.musixmatch.com/`
2. Sign in with a Musixmatch account and allow the app. When redirected, the
   helper script below will capture the cookies.
3. Run `npm run fetch:musixmatch-token` to open a browser, complete the login,
   and copy the printed `web-desktop-app-v1.0` value into `MUSIXMATCH_TOKEN`.
   The decoded `musixmatchUserToken` JSON is logged for reference
   but not required.
  
**WARNING: CALLING THE  API FROM AN UNAUTHORIZED ACCOUNT MAY RESULT IN A BAN.**

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
- **Temporary files:** `MR_MAGIC_TMP_DIR` controls where internal debug
    artifacts land (defaults to `os.tmpdir()`), so remote runners that disallow
    root writes can set `/tmp/mr-magic` or similar.

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
  workers). Invoke with `npm run cli -- <subcommand>` or `npx mr-magic-mcp-cli
<subcommand>`; it isn’t designed to run as a long-lived daemon because it exits
  after each command completes.

## MCP tools

Both STDIO and Streamable HTTP transports expose the same tool registry:

| Tool name             | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `find_lyrics`         | Fetch best lyrics (prefers synced) plus metadata and payload. |
| `find_synced_lyrics`  | Like `find_lyrics` but rejects plain-only results.            |
| `search_lyrics`       | List candidate matches across providers without hydration.    |
| `search_provider`     | Query a single provider (requires the `provider` flag).       |
| `get_provider_status` | Report readiness and notes for each provider.                 |
| `export_lyrics`       | Download + write plain/LRC/SRT/romanized files to disk.       |
| `format_lyrics`       | Format lyrics in memory (optional romanization) for display.  |
| `select_match`        | Pick a prior result by provider/index/synced flag.            |
| `runtime_status`      | Snapshot provider readiness plus present env vars.            |

### MCP client configuration (local repo vs published npm)

Until the package is published to npm, most MCP clients need to launch the stdio
server via a shell so they can `cd` into the repo before running `npm run
server:mcp`. For example, TypingMind expects a single command and doesn’t set
`cwd`, so configure it like this:

#### Standard Config

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "command": "/bin/sh",
      "args": ["-c", "cd /Users/you/Code/mr-magic-mcp-server && npm run server:mcp"]
    }
  }
}
```

#### Cline Config

```json
{
  "mcpServers": {
    "Mr. Magic": {
      "disabled": true,
      "timeout": 60,
      "type": "stdio",
      "command": "npm",
      "args": [
        "run",
        "server:mcp"
      ],
      "cwd": "/Users/naji/Documents/Code/MCP/mr-magic-mcp-server"
    }
  }
}
```

If/when the project is published and installed globally (e.g., `npm install -g
mr-magic-mcp-server`), MCP clients can invoke the installed binaries directly
(`mr-magic-mcp-cli`, `mr-magic-mcp-server`, etc.) without the `cd`/shell
workaround because the executables will already be on `PATH`.
executable will already be on `PATH`.

Note: `npm run server:mcp` keeps stdout clean (all logging goes to stderr), so
stdio-based clients see only the JSON responses regardless of which launch style
you use.

### Manual Testing

- `npm run test` – invokes the repo’s bundled test runner (`tests/run-tests.js`).
  Use this when you want the full chooser/CLI regression suite plus MCP surface
  sanity checks in one command.
- `node tests/mcp-tools.test.js` – runs the raw MCP integration harness directly
  with Node. There isn’t a dedicated npm script for this file, so call it with
  `node` (or add your own script alias) when you only need to validate the MCP
  tool registry.
- `npm run lint` – runs ESLint (flat config) to enforce import order and other
  Node best practices.
- `npm run format:check` – runs Prettier in check mode so CI fails on drift.
  Use the HTTP/MCP transports locally to confirm JSONRPC traffic end to end. The
  snippet below launches both transports with npm scripts (so the repo’s env and
  Node options are respected) and then calls the HTTP transport with `curl`:

```bash
npm run server:mcp &
npm run server:mcp:http
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  http://127.0.0.1:3444/mcp

> Stop the backgrounded servers (`fg` + `Ctrl+C` or `kill`) once you’re done.

```

## CLI overview

A single CLI entrypoint (`mr-magic-mcp-cli`) is published with the package.
Running `mr-magic-mcp-cli --help` (or `npm run cli -- --help` inside the repo),
prints a top-level summary, while subcommand-specific help—e.g.,
`mr-magic-mcp-cli search --help`—lists all flags
with descriptions, defaults, and examples.

### Command summary

| Command                            | Purpose                                                             | Notable flags                                                                                                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mr-magic-mcp-cli search`          | List candidate matches across providers without downloading lyrics. | `--artist`/`--title` (required track metadata), `--provider` (limit providers), `--duration` (match duration in ms), `--show-all` (print table), `--pick` (auto-select provider result).                                                    |
| `mr-magic-mcp-cli find`            | Resolve the best lyric (prefers synced) and print/export it.        | `--providers` (CSV priority list), `--synced-only` (reject plain results), `--export` (write files), `--format` (repeatable; e.g., lrc,srt), `--output` (custom export dir), `--no-romanize`, `--choose`/`--index` (select specific match). |
| `mr-magic-mcp-cli select`          | Pick the first match from a prioritized provider list.              | `--providers` (CSV order), `--artist`, `--title`, `--require-synced` (only accept synced lyrics).                                                                                                                                           |
| `mr-magic-mcp-cli server`          | Run the JSON automation API (same as `npm run server:http`).        | `--host` (interface to bind; default 127.0.0.1), `--port` (listening port; overrides env/`PORT`), `--remote` (shorthand for `--host 0.0.0.0`), `--sessionless` (skip request-scoped session IDs).                                           |
| `mr-magic-mcp-cli server:mcp`      | Start the MCP stdio server (stdio transport).                       | Same server flags as above; `--sessionless` is useful when the MCP host already handles session IDs.                                                                                                                                        |
| `mr-magic-mcp-cli server:mcp:http` | Start the Streamable HTTP MCP server.                               | Same server flags as above; typically pair `--remote` with an explicit `--port` for remote deployments.                                                                                                                                     |
| `mr-magic-mcp-cli search-provider` | Query a single provider only.                                       | `--provider` (required provider name), `--artist`, `--title`.                                                                                                                                                                               |
| `mr-magic-mcp-cli status`          | Print provider readiness information.                               | _(none)_                                                                                                                                                                                                                                    |

### Command Examples

- `mr-magic-mcp-cli search --artist "BLACKPINK" --title "Kill This Love"`
  – list candidates across all providers.
- `mr-magic-mcp-cli find --artist "Nayeon" --title "POP!"` – download the
  best lyric (prefers synced LRC when possible).
- `mr-magic-mcp-cli select --provider lrclib --index 1 --file
./search-results.json` – pick a result from a previous search dump.
- `mr-magic-mcp-cli server --port 4000` – run the JSON automation API
  locally.
- `npm run cli -- server --port 3333` – launch the same CLI via npm (handy when
  working inside the repo without a global install).

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

## LICENSE

[MIT LICENSE](/LICENSE)

I am not and cannot be held liable for any infrigement or ban from services
that could occur as a result of using this software. Your usage is solely
your responsibility. Godspeed.

© 2026 Kenyatta Naji Johnson-Adams
