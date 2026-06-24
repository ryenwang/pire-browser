# pire-browser

Firefox automation CLI for AI agents. Fast native Rust CLI, Firefox WebExtension backend, and Pi package support.

`pire-browser` intentionally does not use BiDi or CDP. Firefox loads a WebExtension, the WebExtension talks to a Native Messaging host, and the CLI talks to that host through current-user IPC: Windows named pipes on Windows and Unix domain sockets on macOS/Linux.

## Installation

### Global Installation (recommended)

Installs the native launcher and matching platform binary package:

```bash
npm install -g pire-browser
pire-browser install
```

`install` registers the Firefox Native Messaging host for the current OS user. npm install also runs best-effort setup, but it is safe to run again.

### Project Installation (local dependency)

For projects that want to pin the version in `package.json`:

```bash
npm install pire-browser
npx pire-browser install
```

Then use via `package.json` scripts or by invoking `npx pire-browser`.

### Pi Package

Install the public Pi package:

```bash
pi install npm:pire-browser
```

If you previously installed from GitHub, the npm installer migrates the known legacy `git:github.com/ryenwang/pire-browser` entry out of Pi settings so Pi does not load two `pire-browser` tools. If you still see a conflict, run:

```bash
pi remove git:github.com/ryenwang/pire-browser
pi install npm:pire-browser
```

Then ask Pi to use the tool:

```text
Use pire-browser to open https://example.com and snapshot the page.
```

### From Source

Requires Node.js, npm, Rust, and Firefox.

```bash
git clone https://github.com/ryenwang/pire-browser
cd pire-browser
npm install
npm --prefix extension install
npm run build:extension
cd cli
cargo build
cargo run -p pire-browser-cli -- install
cd ..
```

Build a platform package binary pair:

```bash
node scripts/build-platform.mjs win32-x64
```

Use the tuple for your platform: `win32-x64`, `win32-ia32`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, or `linux-arm64`.

### Linux Notes

On Linux, distro Firefox builds work best. Snap and Flatpak Firefox are detected, but sandboxed Native Messaging may require the WebExtensions portal or a non-sandboxed Mozilla Firefox build.

### Updating

Check and apply updates:

```bash
pire-browser update check --json
pire-browser update apply
pire-browser update configure --mode off|notify|patch
```

Patch auto-update is allowed only for global npm installs or confirmed Pi-managed installs, and only when no managed Firefox session is active. Local project installs and minor/major updates notify only.

### Requirements

- **Firefox** - Required for all browser sessions.
- **Pi 0.75.4 or newer** - Required only when installing as a Pi package.
- **Node.js and npm** - Required for npm installation and source builds.
- **Rust** - Required only when building from source.
- **Supported beta targets** - Windows x64, Windows x86, Windows ARM64, macOS x64, macOS ARM64, Linux glibc x64, and Linux glibc ARM64.

Alpine/musl Linux is not part of the beta.

## Quick Start

```bash
pire-browser open https://example.com
pire-browser snapshot -i                    # Get accessibility tree with refs
pire-browser click '@e2'                    # Click by ref from snapshot
pire-browser fill '@e3' "test@example.com"  # Fill by ref
pire-browser get text '@e1'                 # Get text by ref
pire-browser screenshot page.png
pire-browser close
```

PowerShell treats `@` specially, so quote refs such as `'@e1'`.

### Traditional Selectors (also supported)

```bash
pire-browser click "#submit"
pire-browser fill "#email" "test@example.com"
pire-browser find role button --name "Submit" click
```

Use `--json` when another tool or agent needs structured output.

## Commands

### Core Commands

```bash
pire-browser open                    # Launch managed Firefox if needed
pire-browser open <url>              # Launch + navigate to URL (aliases: goto, navigate)
pire-browser click <sel>             # Click element
pire-browser fill <sel> <text>       # Clear and fill
pire-browser type <sel> <text>       # Type into element
pire-browser press <key>             # Press key, such as Enter or Tab
pire-browser hover <sel>             # Hover element
pire-browser focus <sel>             # Focus element
pire-browser select <sel> <val>      # Select dropdown option
pire-browser check <sel>             # Check checkbox
pire-browser uncheck <sel>           # Uncheck checkbox
pire-browser scroll <dir> [px]       # Scroll page or container
pire-browser scrollintoview <sel>    # Scroll element into view
pire-browser drag <src> <dst>        # Drag and drop with page-level events
pire-browser upload <sel> <files>    # Upload files
pire-browser screenshot [path]       # Screenshot
pire-browser screenshot --annotate   # Annotated screenshot with numbered element labels
pire-browser screenshot --screenshot-dir ./shots
pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80
pire-browser pdf page.pdf            # Image-backed page PDF
pire-browser snapshot -i             # Accessibility tree with refs
pire-browser eval <js>               # Run JavaScript with policy checks
pire-browser close                   # Close targeted managed Firefox session
pire-browser close --all             # Close all managed Firefox sessions
```

PDF capture is available as an image-backed visual evidence file. CDP connect, runtime viewport streaming, and natural-language chat are not implemented in the current Firefox backend.

### Get Info

```bash
pire-browser get text <sel>          # Get text content
pire-browser get html <sel>          # Get innerHTML
pire-browser get value <sel>         # Get input value
pire-browser get attr <sel> <attr>   # Get attribute
pire-browser get title               # Get page title
pire-browser get url                 # Get current URL
pire-browser get count <sel>         # Count matching elements
pire-browser get box <sel>           # Get bounding box
pire-browser get styles <sel>        # Get computed styles
```

### Check State

```bash
pire-browser is visible <sel>        # Check if visible
pire-browser is enabled <sel>        # Check if enabled
pire-browser is checked <sel>        # Check if checked
```

### Find Elements (Semantic Locators)

```bash
pire-browser find role <role> [action] [value]
pire-browser find role <role> --name <name> [action] [value]
pire-browser find text <text> [action]
pire-browser find label <label> [action] [value]
pire-browser find placeholder <ph> [action] [value]
pire-browser find alt <text> [action]
pire-browser find title <text> [action]
pire-browser find testid <id> [action]
pire-browser find first <sel> [action] [value]
pire-browser find last <sel> [action] [value]
pire-browser find nth <n> <sel> [action] [value]
```

**Actions:** `click`, `fill`, `type`, `hover`, `focus`, `check`, `uncheck`, `text`

**Options:** `--name <name>` filters role by accessible name. `--exact` requires exact text match.

**Examples:**

```bash
pire-browser find role button --name "Submit" click
pire-browser find text "Sign In" click
pire-browser find label "Email" fill "test@test.com"
pire-browser find first ".item" click
pire-browser find nth 2 "a" text
```

### Wait

```bash
pire-browser wait <selector>         # Wait for element
pire-browser wait <ms>               # Wait for time in milliseconds
pire-browser wait --text "Welcome"   # Wait for text to appear
pire-browser wait --url "**/dash"    # Wait for URL pattern
pire-browser wait --load networkidle # Wait for load state
pire-browser wait --download [path]  # Wait for download
pire-browser wait "#spinner" --state hidden
```

### Batch Execution

Execute multiple commands in a single invocation.

```bash
pire-browser batch "open https://example.com" "snapshot -i" "screenshot result.png"
pire-browser batch --bail "open https://example.com" "click '@e1'" "screenshot result.png"
echo '[["open","https://example.com"],["snapshot","-i"],["click","@e1"]]' | pire-browser batch --json
```

Use commands separately when an agent needs to parse intermediate output first, such as snapshot refs before clicking.

### Clipboard

```bash
pire-browser clipboard read
pire-browser clipboard write "Hello, World!"
pire-browser clipboard copy
pire-browser clipboard paste
```

`copy` and `paste` use the active page selection or focused editable element and can return best-effort warnings because native Ctrl+C/Ctrl+V handlers are not run.

### Mouse Control

```bash
pire-browser mouse move <x> <y>      # Dispatch page mousemove at viewport coords
pire-browser mouse down [button]     # Press button
pire-browser mouse up [button]       # Release button
pire-browser mouse wheel <dy> [dx]   # Scroll wheel
```

Mouse and drag commands dispatch page-level Firefox WebExtension events. They do not control the native OS cursor.

### Browser Settings

```bash
pire-browser set viewport <w> <h> [scale]  # Resize browser window toward target viewport
pire-browser set device "iPhone 14"  # Best-effort mobile viewport preset
pire-browser set geo 37.7749 -122.4194  # Best-effort page geolocation
pire-browser set headers <json>      # Extra HTTP headers for the active origin
pire-browser set credentials <user> <pass>  # HTTP Basic auth for the active origin
pire-browser set media [dark|light|auto]  # Emulate page color scheme
pire-browser set offline on|off      # Best-effort request blocking for managed tabs
pire-browser --color-scheme dark open https://example.com
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy http://proxy.example:8080 --proxy-bypass "localhost,*.internal" open https://example.com
pire-browser --executable-path /path/to/firefox open https://example.com
```

`set device` applies a best-effort viewport preset for common devices. Firefox does not enforce mobile User-Agent, touch input, browser chrome, or exact deviceScaleFactor for this path, so verify the measured `page.innerWidth`/`page.innerHeight` before relying on responsive screenshots. `set geo` installs a page-level `navigator.geolocation` shim for managed Firefox pages, but it does not change Firefox's native permission prompt, OS location services, IP-based location, or browser chrome state. `set credentials` applies memory-only HTTP Basic auth for the active origin and does not echo the password. `set offline` cancels future network requests for managed tabs, but it does not fully emulate Chromium/CDP offline mode: `navigator.onLine`, service worker cache behavior, DNS, and socket state are not controlled. `--proxy` applies Firefox proxy settings through the managed extension for browser bridge commands; prefer `--proxy ... open <url>` over `launch --url` when the first navigation must use the proxy. TLS-ignore launch flags are not implemented in the current Firefox backend.

### Cookies & Storage

```bash
pire-browser cookies
pire-browser cookies set <name> <val>
pire-browser cookies clear

pire-browser storage local
pire-browser storage local <key>
pire-browser storage local set <k> <v>
pire-browser storage local clear

pire-browser storage session
```

### Network

```bash
pire-browser --allowed-domains "example.com,*.example.com" open https://example.com
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy socks5://proxy.example:1080 --proxy-bypass "localhost,*.internal" open https://example.com
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser set offline on
pire-browser set offline off
pire-browser wait --load networkidle
pire-browser network requests
pire-browser network requests --filter /api/
pire-browser network requests --type xhr,fetch
pire-browser network requests --method POST
pire-browser network requests --status 2xx
pire-browser network request <requestId>
pire-browser network har start
pire-browser network har stop network.har
pire-browser network har
pire-browser network har network.har --filter /api/
pire-browser network route "**/api/config**" --body '{"ready":true}'
pire-browser network route "*" --abort --resource-type script
pire-browser network unroute "*"
pire-browser network requests --clear
```

The network surface is Firefox-backed: cooperative domain allowlists, extension-applied proxy settings, origin-scoped request headers, active-tab network-idle waiting, recent request diagnostics, agent-browser-style `network har start` / `network har stop`, direct metadata-only HAR export, and best-effort active-tab route interception. HAR export is built from WebExtension request metadata; response bodies, cookies, and raw request/response headers are not captured.

### Tabs & Windows

```bash
pire-browser tab list
pire-browser tab new [url]
pire-browser tab new --label docs [url]
pire-browser tab <tN-or-label>
pire-browser tab close [tN-or-label]
pire-browser tab label <tN> <label>
pire-browser window new
```

Tab ids are stable strings such as `t1`, `t2`, and `t3`. Labels are user-assigned and can be used anywhere a tab id is accepted.

### Frames

```bash
pire-browser frame <sel>
pire-browser frame '@e3'
pire-browser frame main
```

Iframe nodes are surfaced in snapshots when Firefox can inspect them from the current page context. Refs assigned inside iframes carry frame context for direct interactions.

### Dialogs

```bash
pire-browser dialog status
pire-browser dialog accept [text]
pire-browser dialog dismiss
```

Dialog support is Firefox WebExtension mediated. `alert`, `confirm`, and
`prompt` are shimmed in the page context so they do not hard-block the agent
loop. `dialog accept [text]` configures the next shimmed confirm or prompt to
accept, using `text` as the prompt return value; `dialog dismiss` configures
the next shimmed confirm or prompt to cancel. When a dialog is observed during
another command, output includes a `PAGE_DIALOG` warning. Re-run `snapshot -i`
after handling a dialog before acting on refs.

### Diff

```bash
pire-browser snapshot -i
pire-browser click '@e4'
pire-browser diff snapshot

pire-browser snapshot -i > before.txt
pire-browser click '@e4'
pire-browser diff snapshot --baseline before.txt

pire-browser diff snapshot --selector "#main" --compact

pire-browser snapshot -i > before.txt
pire-browser click '@e4'
pire-browser snapshot -i > after.txt
git diff --no-index before.txt after.txt

pire-browser screenshot before.png
# perform action
pire-browser diff screenshot --baseline before.png
pire-browser diff screenshot --baseline before.png -o diff.png
pire-browser diff screenshot --baseline before.png -t 0.2

pire-browser screenshot after.png
pire-browser diff screenshot --baseline before.png after.png

pire-browser diff url https://v1.example https://v2.example
pire-browser diff url https://v1.example https://v2.example --screenshot
pire-browser diff url https://v1.example https://v2.example --wait-until networkidle
pire-browser diff url https://v1.example https://v2.example --selector "#main" --compact
```

`diff snapshot` compares a fresh active-page snapshot to the previous snapshot
captured in the active tab, or to a local baseline text file. `diff screenshot`
compares a baseline image to the current active-page screenshot, or to an
explicit current image path. `diff url` opens two URLs in sequence, compares
their interactive snapshots, and adds screenshot pixel comparison when
`--screenshot` is passed.

### Debug

```bash
pire-browser console
pire-browser console --json
pire-browser console --clear
pire-browser errors
pire-browser errors --clear
pire-browser highlight <sel>
```

Trace capture, Chrome DevTools inspect proxy, CPU profiler, and video recording are not implemented in the current Firefox backend.

### Navigation

```bash
pire-browser back
pire-browser forward
pire-browser reload
pire-browser pushstate <url>
```

`pushstate <url-or-path>` performs same-origin SPA client-side navigation in the active page, preferring `window.next.router.push` when available and falling back to `history.pushState`.

### Pre-navigation Setup

Some flows need state or init scripts before first navigation. Launch a managed session, stage state, then navigate:

```bash
pire-browser launch
pire-browser --session-name review open about:blank
pire-browser --session-name review state load ./.pire-state/app.json
pire-browser --session-name review open https://app.example.com/dashboard
```

### React / Web Vitals

`vitals` is available for best-effort page performance checks. Framework-aware React tree, Suspense, and render profiling commands are not implemented in the Firefox backend yet.

```bash
pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json
pire-browser snapshot -i
```

`vitals` reports TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState,
and hydration warnings when Firefox exposes the underlying Performance API
entries. Missing browser signals are reported as unavailable.

### Init scripts

```bash
pire-browser open --init-script <path> <url>
pire-browser addinitscript <js>
pire-browser removeinitscript <identifier>
```

`open --init-script` applies to one navigation. `addinitscript` registers a document-start script for future navigations in the current managed Firefox session and returns an identifier for `removeinitscript`.

### Setup

```bash
pire-browser install
pire-browser install --firefox-path /path/to/firefox
pire-browser setup
pire-browser setup --firefox-path /path/to/firefox
pire-browser status
pire-browser status --json
pire-browser doctor
pire-browser doctor --offline --quick
pire-browser doctor --json
```

`status` and `doctor` are observational. Browser commands that need auto-launch can run lazy setup when native host registration is missing or mismatched.

### Skills

```bash
pire-browser skills list
pire-browser skills list --json
pire-browser skills cat core
pire-browser skills cat core --json
pire-browser skills get core
pire-browser skills get --all --json
```

Installed agents should use the bundled skill command for version-matched guidance instead of relying on stale copied instructions. `skills get` is an agent-browser-style alias for `skills cat`; `skills get --all` returns all bundled skill content. The package also ships compact routing context under `agent/`.

### MCP Server

```bash
pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools all
```

The stdio MCP server exposes the core browser workflow as typed tools: open, snapshot, semantic find, click, double-click, fill, type, press, keyboard typing, hover/focus/select/check/scroll/drag/mouse, get page/element info, check element state, wait, screenshot, PDF, console/errors/dialog/highlight/vitals, cookies/storage, network requests/routes/HAR, plaintext state save/load/list/show/inspect/rename/clear/clean, session/profile inspection, download, wait-download, upload, clipboard, status, tab list/new/select/label/close, window new, close, eval, and skill guidance. `--tools all` is accepted as an alias for all currently available MCP tools. The MCP tools call the same installed CLI binary, so setup, policies, sessions, profiles, and Firefox runtime behavior stay shared with normal `pire-browser` commands.

## Authentication

### Quick summary

- Use `--headers` for header-authenticated origins.
- Use managed Firefox profiles for normal browser login state.
- Use `auth save --password-stdin` when saving a selector-driven auth helper to avoid shell history.
- Use `state save` and `state load` for active-origin cookies and Web Storage.
- Do not commit `.pire-state/` files.

### Manual browser login

The simplest login flow is to use a persistent managed Firefox profile:

```bash
pire-browser --profile github open https://github.com/login
# Sign in manually in Firefox.
pire-browser --profile github snapshot -i
```

Firefox stores cookies, sessions, and saved passwords inside its managed profile. `pire-browser` stores launcher metadata, session files, confirmations, receipts, and download staging under the OS app-data directory, but it does not inspect cookies, saved passwords, session tokens, or one-time codes for diagnostics.

### Header authentication

Use `--headers` to set HTTP headers for a specific origin, or `set credentials`
for HTTP Basic auth on the active origin:

```bash
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer <token>"}'
pire-browser snapshot -i --json
pire-browser set credentials user pass
pire-browser open https://basic-auth.example.com/protected
pire-browser open https://other.example.com
```

Headers and Basic credentials are scoped to the active/opened URL's origin and
secret values are not echoed in command output. `set credentials` stores values
only in the current managed Firefox extension session; it is not an encrypted
auth vault.

### Selector-driven auth helper

For simple username/password forms, save a best-effort profile-local auth helper
and reuse it later:

```bash
echo "secret" | pire-browser auth save app --url https://example.com/login --username user --password-stdin --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
pire-browser auth login app
pire-browser snapshot -i
```

`--password-stdin` is the recommended save path because it avoids putting the
password in shell history. Auth profiles are stored in the managed Firefox
extension's local storage and are not a full encrypted vault. Do not claim login
success until a fresh snapshot, URL, or page state confirms it.

### Proxy authentication

Use `--proxy` before a browser command when a managed session should route
traffic through a proxy:

```bash
pire-browser --proxy http://proxy.example:8080 open https://httpbin.org/ip
pire-browser --proxy http://user:pass@proxy.example:8080 open https://example.com
PIRE_BROWSER_PROXY=http://proxy.example:8080 pire-browser open https://example.com
```

Proxy credentials can be supplied in the proxy URL or with
`PIRE_BROWSER_PROXY_USERNAME` / `PIRE_BROWSER_PROXY_PASSWORD`
(`AGENT_BROWSER_PROXY_USERNAME` / `AGENT_BROWSER_PROXY_PASSWORD` are accepted
aliases). `NO_PROXY`, `PIRE_BROWSER_PROXY_BYPASS`, and
`AGENT_BROWSER_PROXY_BYPASS` map to Firefox proxy passthrough hosts. Proxy
credentials stay in extension memory and are not echoed in command output.

## Sessions

```bash
pire-browser session list
pire-browser session list --json
pire-browser session attach <session-id>
pire-browser session cleanup
pire-browser --session <uuid> snapshot -i
pire-browser --session work open https://example.com
pire-browser --session-name work open https://example.com
pire-browser --session-name work close
```

`--session <uuid>` targets a strict live session id from `session list`. `--session <name>`, `PIRE_BROWSER_SESSION=<name>`, `--session-name <name>`, and `PIRE_BROWSER_SESSION_NAME=<name>` are named-profile aliases that may reuse or launch managed Firefox.

## Firefox Profile Reuse

```bash
pire-browser profiles --json
pire-browser --profile Default open https://example.com
pire-browser --profile Work open https://example.com
pire-browser --profile ~/.myapp-profile open https://example.com
```

`--profile <name-or-path>` reuses or launches a managed Firefox profile. Path-like values are mapped to stable managed Firefox profile names under the `pire-browser` data directory. They are not raw browser profile directories.

## Persistent Profiles

Default managed profile locations:

```text
Windows: %LOCALAPPDATA%\pire-browser\firefox-profiles\Default
macOS:   ~/Library/Application Support/pire-browser/firefox-profiles/Default
Linux:   $XDG_DATA_HOME/pire-browser/firefox-profiles/Default
         or ~/.local/share/pire-browser/firefox-profiles/Default
```

Deleting a managed profile folder clears that saved browser state.

## Session Persistence

```bash
pire-browser --session-name work open https://app.example.com/dashboard
pire-browser --session-name work state save ./.pire-state/app-work.json
pire-browser --auto-connect state save ./.pire-state/app-work.json
pire-browser --state ./.pire-state/app-work.json open https://app.example.com/dashboard
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json
```

State files are plaintext and contain active-origin cookies, `localStorage`, and `sessionStorage`. They do not include saved passwords, full browser profiles, service workers, IndexedDB, or cross-origin SSO state.

## Security

`pire-browser` installs local native binaries, registers a Firefox Native Messaging host for the current OS user, and exposes a Pi extension. Pi extensions run with the current user's local permissions.

The Native Messaging host exposes only current-user IPC. On Windows, named pipes use a DACL restricted to the current Windows user plus required system/admin principals. On macOS/Linux, Unix domain sockets live in a short current-user runtime directory.

This protects against cross-user and remote access. It does not defend against malicious code already running as the same OS user.

Use guardrails for risky workflows:

```bash
pire-browser --content-boundaries snapshot -i
pire-browser --max-output 50000 get text body
pire-browser --allowed-domains "app.example.com,*.example.com" open https://app.example.com
pire-browser --action-policy ./policy.json eval "document.title"
pire-browser --confirm-actions eval,download eval "document.title"
```

## Snapshot Options

```bash
pire-browser snapshot -i
pire-browser snapshot -i --compact
pire-browser snapshot -i --urls
pire-browser snapshot -i -d 5
pire-browser snapshot -s "#main"
pire-browser snapshot --json
```

Refs are short lived. Re-run `snapshot -i` after navigation, reloads, DOM changes, dialogs, downloads, uploads, or failed actions.

## Annotated Screenshots

```bash
pire-browser screenshot page.png
pire-browser screenshot --full full-page.png
pire-browser screenshot --annotate annotated.png
pire-browser screenshot --screenshot-dir ./shots
pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80 page.jpg
pire-browser pdf page.pdf
pire-browser pdf viewport.pdf --viewport
```

`--full` scrolls and stitches the page into one full-document image. `--annotate` temporarily draws numbered overlays for actionable elements before capture and clears them afterwards.
`pdf <path>` captures a full-page screenshot and embeds it into a one-page PDF. Use it for visual evidence; text is not selectable and print CSS is not applied.

## Options

```bash
--config <path>                 # Use a custom config file
--session <uuid>                # Target an existing live session id
--session <name>                # Reuse or launch a named managed Firefox profile
--session-name <name>           # Explicit named Firefox profile spelling
--profile <name-or-path>        # Managed Firefox profile alias
--state <path>                  # Load active-origin state before a browser command
--auto-connect                  # Select a live managed session when saving state
--headers <json>                # HTTP headers scoped to URL's origin
--proxy <url>                   # Firefox proxy URL for browser bridge commands
--proxy-bypass <list>           # Firefox proxy passthrough hosts
--executable-path <path>        # Custom Firefox executable
--allow-file-access             # Allow supported local file workflows
--json                          # JSON output
--headed                        # Legacy launch flag
--headless                      # Legacy launch flag
--color-scheme <scheme>         # dark, light, or auto
--screenshot-dir <path>         # Default screenshot output directory
--screenshot-quality <n>        # JPEG quality 0-100
--screenshot-format <fmt>       # png or jpeg
--content-boundaries            # Wrap page output in boundary markers
--max-output <chars>            # Truncate page output to N characters
--allowed-domains <list>        # Comma-separated allowed domain patterns
--action-policy <path>          # Path to action policy JSON file
--confirm-actions <list>        # Action categories requiring confirmation
--confirm-interactive           # Interactive confirmation prompts
--engine <name>                 # Accepted legacy input
-p, --provider <name>           # Accepted legacy input
--model <name>                  # Accepted legacy input
--debug                         # Debug output
```

## Observability Dashboard

Dashboard commands are not implemented yet. Use status and diagnostics commands:

```bash
pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser doctor --json
```

## Configuration

`pire-browser` loads JSON defaults before command parsing.

```bash
# from a project that has ./pire-browser.json
pire-browser open https://example.com
pire-browser --config ./ci-config.json open https://example.com
PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com
```

Defaults are loaded from `~/.pire-browser/config.json`, `./pire-browser.json`, `PIRE_BROWSER_CONFIG`, and explicit `--config`, in that order. CLI flags override config defaults. Legacy config aliases are also accepted.

For editor autocomplete:

```json
{
  "$schema": "./node_modules/pire-browser/pire-browser.schema.json",
  "json": true,
  "profile": "Work",
  "allowedDomains": ["app.example.com", "*.example.com"]
}
```

## Default Timeout

Download commands default to 60000ms:

```bash
pire-browser download '@e4' ./downloads/report.txt --timeout 60000
pire-browser wait --download ./downloads/report.txt --timeout 60000
```

Other waits use the current Firefox-backed command behavior for the requested wait type.

## Selectors

### Refs (Recommended for AI)

```bash
pire-browser snapshot -i
# @e1 [heading] "Example Domain"
# @e2 [button] "Submit"
# @e3 [textbox] "Email"

pire-browser click '@e2'
pire-browser fill '@e3' "test@example.com"
```

### CSS Selectors

```bash
pire-browser click "#submit"
pire-browser fill "input[name=email]" "test@example.com"
pire-browser snapshot -s "#main"
```

### Text & XPath

```bash
pire-browser click "text=Continue"
pire-browser get text "xpath=//main//h1"
```

### Semantic Locators

```bash
pire-browser find role button --name "Submit" click
pire-browser find label "Email" fill "test@example.com"
pire-browser find text "Continue" click
```

## Agent Mode

Use text output for human-readable agent context and `--json` for scripts.

### Optimal AI Workflow

```bash
# 1. Navigate and get snapshot
pire-browser open https://example.com
pire-browser snapshot -i

# 2. Identify target refs from snapshot output

# 3. Execute actions using refs
pire-browser click '@e2'

# 4. Get new snapshot if page changed
pire-browser snapshot -i
```

### Command Chaining

```bash
pire-browser open https://example.com && pire-browser wait --selector "#main" && pire-browser snapshot -i
pire-browser fill '@e1' "user@example.com" && pire-browser fill '@e2' "pass" && pire-browser click '@e3'
pire-browser open https://example.com && pire-browser screenshot page.png
```

Use `&&` when you do not need to parse intermediate output. Run commands separately when you need refs or command results before deciding the next action.

## Headed Mode

`pire-browser` controls a managed Firefox window. The current public default is a visible managed Firefox session launched through `web-ext`; `--headed` and `--headless` are accepted as legacy launch inputs.

```bash
pire-browser --headed open https://example.com
```

## Custom Browser Executable

Use a custom Firefox executable instead of auto-discovery:

```bash
pire-browser --executable-path /path/to/firefox open https://example.com
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser launch
pire-browser setup --firefox-path /path/to/firefox
```

## Local Files

Open and interact with supported local HTML files using `file://` URLs:

```bash
pire-browser --allow-file-access open file:///path/to/page.html
pire-browser screenshot output.png
pire-browser pdf output.pdf
```

For repeatable agent tests, an HTTP fixture server is usually more reliable than file URLs. PDF output is image-backed visual evidence, not a selectable-text print export.

## CDP Mode

Chrome DevTools Protocol mode is not available. `pire-browser` commands are mediated by Firefox WebExtension APIs and Native Messaging.

```bash
# Not available in pire-browser today:
# pire-browser connect 9222
# pire-browser --cdp 9222 snapshot
```

## Streaming (Browser Preview)

Runtime WebSocket viewport streaming is not available. Use screenshots and status output for observable workflows:

```bash
pire-browser screenshot page.png
pire-browser status --json
pire-browser session list --json
```

## Architecture

`pire-browser` uses a client-host architecture:

1. **Rust CLI** - Parses commands, formats results, and manages setup.
2. **Native Messaging host** - Connects the CLI to Firefox through current-user IPC.
3. **Firefox WebExtension** - Inspects the page, performs DOM actions, captures screenshots, and reports session state.

Managed Firefox sessions start on demand and can be reused by session id, session name, or profile name.

## Platforms

| Platform | Binary |
| --- | --- |
| macOS ARM64 | Native Rust |
| macOS x64 | Native Rust |
| Linux ARM64 | Native Rust |
| Linux x64 | Native Rust |
| Windows ARM64 | Native Rust |
| Windows x64 | Native Rust |
| Windows x86 | Native Rust |

## Usage with AI Agents

### Just ask the agent

```text
Use pire-browser to test the login flow. Run pire-browser --help to see available commands.
```

### AI Coding Assistants (recommended)

Install the skill so the agent can load version-matched runtime guidance:

```bash
npx skills add ryenwang/pire-browser
```

The installed npm package also serves the bundled core skill:

```bash
pire-browser skills get core
```

Agent hosts that support MCP can use the typed stdio server:

```bash
pire-browser mcp --tools core
```

### AGENTS.md / CLAUDE.md

For more consistent results, add:

```markdown
## Browser Automation

Use `pire-browser` for Firefox automation. Run `pire-browser --help` for commands.

Core workflow:

1. `pire-browser open <url>` - Navigate to page
2. `pire-browser snapshot -i` - Get interactive elements with refs (`@e1`, `@e2`)
3. `pire-browser click '@e1'` / `fill '@e2' "text"` - Interact using refs
4. Re-snapshot after page changes
```

## Integrations

### iOS Simulator

iOS Simulator and Appium control are not available in the current public package.

### Browserless

Browserless provider sessions are not available in the current public package. `pire-browser` currently launches local Firefox sessions.

### Browserbase

Browserbase provider sessions are not available in the current public package. `pire-browser` currently launches local Firefox sessions.

### Browser Use

Browser Use provider sessions are not available in the current public package. `pire-browser` currently launches local Firefox sessions.

### Kernel

Kernel provider sessions are not available in the current public package. `pire-browser` currently launches local Firefox sessions.

### AgentCore

AgentCore provider sessions are not available in the current public package. `pire-browser` currently launches local Firefox sessions.

## Development

```bash
npm --prefix extension install
npm --prefix extension run build
cd cli
cargo build
cargo run -p pire-browser-cli -- setup
cd ..
```

Common checks:

```bash
cd cli && cargo test -q
npm test
node scripts/build-pages-site.mjs
npm pack --dry-run --json
```

## License

MIT
