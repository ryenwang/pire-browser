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
`pire-browser install --with-deps` is the agent-browser-style first-run helper: it uses an installed Firefox when available, can install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing, and gives non-Snap/non-Flatpak guidance on Linux.

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

If you previously installed from GitHub, from a local checkout, or through an old Windows ZIP shim, the npm installer reconciles known duplicate `pire-browser` sources after Pi records the npm install. If Pi reports a duplicate `pire-browser` tool immediately after installation, wait a moment and rerun `pi`. If the conflict remains, remove the older source shown in Pi's error, then reinstall the npm package:

```bash
pi remove git:github.com/ryenwang/pire-browser
# or: pi remove /absolute/path/to/your/local/pire-browser-checkout
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
`pire-browser install --with-deps` does not run Linux package managers because distro defaults can install Snap/Flatpak Firefox. Install an unrestricted Mozilla package/tarball or distro non-Snap Firefox, then rerun `pire-browser install --firefox-path <path>` if discovery needs help.

### Updating

Check and apply updates:

```bash
pire-browser upgrade
pire-browser update check --json
pire-browser update apply
pire-browser update configure --mode off|notify|patch
```

`upgrade` is the agent-browser-style foreground update path: it checks npm, then
updates global npm or Pi-managed installs to the latest package when no managed
Firefox session is active. Local project installs print the exact `npm install`
command to run in that project. Background auto-update and lower-level
`update apply` stay patch-only. Update JSON uses `success: true` when the update
command completed and reports the outcome in `data.status` (`current`,
`notify`, `deferred`, `offline`, `applied`, or `failed`); invalid arguments use
`success: false`.

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
pire-browser snapshot -i -C                 # Include cursor-pointer controls
pire-browser click '@e2'                    # Click by ref from snapshot
pire-browser fill '@e3' "test@example.com"  # Fill by ref
pire-browser press Enter                    # Press a key at current focus
pire-browser get text '@e1'                 # Get text by ref
pire-browser screenshot page.png
pire-browser close
```

PowerShell treats `@` specially, so quote refs such as `'@e1'`.

Clicks fail early when another element covers the target's click point, such as
a consent banner or modal. Dismiss or interact with the reported covering
element, then run `snapshot -i` before retrying the original ref.

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
pire-browser read [url]              # Agent-friendly text; URL reads do not launch Firefox
pire-browser click <sel>             # Click element
pire-browser tap <sel>               # Best-effort tap alias for click
pire-browser dblclick <sel>          # Double-click element
pire-browser fill <sel> <text>       # Clear and fill
pire-browser type <sel> <text>       # Type into element
pire-browser press <key>             # Press key, such as Enter or Tab
pire-browser keyboard type <text>    # Type with current-focus key events
pire-browser keyboard inserttext <text> # Insert text at current focus without key events
pire-browser keydown <key>           # Hold key down at current focus
pire-browser keyup <key>             # Release key at current focus
pire-browser hover <sel>             # Hover element
pire-browser focus <sel>             # Focus element
pire-browser select <sel> <val>      # Select dropdown option
pire-browser check <sel>             # Check checkbox
pire-browser uncheck <sel>           # Uncheck checkbox
pire-browser scroll <dir> [px]       # Scroll page or container
pire-browser scrollintoview <sel>    # Scroll element into view
pire-browser swipe up [px]           # Best-effort mobile swipe as page scroll
pire-browser drag <src> <dst>        # Drag and drop with page-level events
pire-browser upload <sel> <files>    # Upload files to inputs or dropzones
pire-browser screenshot [path]       # Screenshot
pire-browser screenshot --annotate   # Annotated screenshot with numbered element labels
pire-browser screenshot --screenshot-dir ./shots
pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80
pire-browser pdf page.pdf            # Image-backed page PDF
pire-browser snapshot -i             # Accessibility tree with refs
pire-browser eval <js>               # Run JavaScript with policy checks
pire-browser dashboard start         # Local status/session/preview/activity dashboard
pire-browser dashboard start --background
pire-browser dashboard status
pire-browser dashboard stop
pire-browser stream enable           # Start dashboard-backed live preview stream
pire-browser stream status           # Inspect stream preview status/capabilities
pire-browser stream disable          # Stop dashboard-backed stream preview
pire-browser activity list --json    # Recent redacted command activity
pire-browser chat "open example.com and summarize it"
pire-browser close                   # Close targeted managed Firefox session
pire-browser close --all             # Close all managed Firefox sessions
```

`keyboard type`, `keyboard inserttext`, `keydown`, and `keyup` act at the
current page focus. Click or focus the intended control first, then verify with
`get value`, `snapshot -i`, or another targeted check.
`tap` uses the same Firefox WebExtension page-level click path as `click`; it is
not native touch input or mobile browser chrome emulation. `swipe` maps touch
direction to page scroll (`swipe up` scrolls down); use `scroll` when you want
direct scroll direction.

PDF capture is available as an image-backed visual evidence file. Natural-language chat is available through `pire-browser chat` and the dashboard AI Chat panel when `AI_GATEWAY_API_KEY` is set; both run the same bounded command-plan loop through the normal CLI command paths. CDP connect and full WebSocket viewport streaming are not implemented in the current Firefox backend. `stream enable/status/disable` provides an agent-browser-style control surface for the dashboard-backed live read-only preview, which polls visible-viewport screenshots.

### Read Agent-Friendly Text

```bash
pire-browser read
pire-browser read https://example.com/article
pire-browser read https://example.com/article --filter overview
pire-browser read https://example.com/article --outline
pire-browser read https://docs.example.com --llms index --filter auth
pire-browser read https://docs.example.com --llms full --filter auth
pire-browser read --llms index --filter auth
pire-browser read --require-md
pire-browser read example.com/article --require-md
pire-browser read https://example.com/article --json
```

`read <url>` fetches markdown, plain text, or HTML directly from the CLI without launching Firefox. It extracts readable text from HTML, supports `--filter`, `--outline`, nearest-ancestor `llms.txt` / `llms-full.txt`, `--require-md`, `--raw`, and `--timeout <ms>`, and still honors domain/output guardrails.

Omit the URL to read rendered text from the active Firefox tab, including client-side state and authenticated content. When `--llms`, `--require-md`, `--raw`, or `--timeout` is used without a URL, `pire-browser` first reads the active tab URL and then performs the same guarded no-browser URL fetch for that HTTP resource. Use `read` for documents and articles; use `snapshot -i` when you need interaction refs.

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
pire-browser wait --fn "window.appReady === true" # Wait for JS condition
pire-browser wait --download [path]  # Wait for download
pire-browser wait "#spinner" --state hidden
```

`wait --fn <expression>` polls a page-world JavaScript expression until it is
truthy. Use short, side-effect-free predicates such as
`document.querySelector("#ready")` or `window.appReady === true`, then re-run
`snapshot -i` before acting on refs.
Use `--download-path <dir>` or `PIRE_BROWSER_DOWNLOAD_PATH` before launching
when browser-initiated downloads should land in a known folder.

### Batch Execution

Execute multiple commands in a single invocation.

```bash
pire-browser batch "open https://example.com" "snapshot -i" "screenshot result.png"
pire-browser batch --bail "open https://example.com" "click '@e1'" "screenshot result.png"
echo '[["open","https://example.com"],["snapshot","-i"],["click","@e1"]]' | pire-browser batch --json
```

Use commands separately when an agent needs to parse intermediate output first, such as snapshot refs before clicking.
When using MCP, add the `debug` profile and call `pire_browser_batch` with a typed `commands` array for short command sequences; prefer individual typed tools when intermediate output determines the next action.
Example MCP arguments: `{"commands":[["open","https://example.com"],["snapshot","-i"]],"bail":true}`.

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
pire-browser tap <sel>               # Best-effort tap alias for click
pire-browser swipe up [px]           # Best-effort swipe as page scroll
```

Mouse, tap, swipe, and drag commands dispatch page-level Firefox WebExtension events. They do not control the native OS cursor or native touch input.

### Browser Settings

```bash
pire-browser set viewport <w> <h> [scale]  # Resize browser window toward target viewport
pire-browser device "iPhone 14"      # Best-effort mobile viewport preset
pire-browser set device "iPhone 14"  # Compatibility spelling
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

`device` applies a best-effort viewport preset for common devices; `set device` remains a compatibility spelling. Firefox does not enforce mobile User-Agent, touch input, browser chrome, or exact deviceScaleFactor for this path, so verify the measured `page.innerWidth`/`page.innerHeight` before relying on responsive screenshots. `set geo` installs a page-level `navigator.geolocation` shim for managed Firefox pages, but it does not change Firefox's native permission prompt, OS location services, IP-based location, or browser chrome state. `set credentials` applies memory-only HTTP Basic auth for the active origin and does not echo the password. `set offline` cancels future network requests for managed tabs, but it does not fully emulate Chromium/CDP offline mode: `navigator.onLine`, service worker cache behavior, DNS, and socket state are not controlled. `--proxy` applies Firefox proxy settings through the managed extension for browser bridge commands; prefer `--proxy ... open <url>` over `launch --url` when the first navigation must use the proxy. TLS-ignore launch flags are not implemented in the current Firefox backend.

### Cookies & Storage

```bash
pire-browser cookies
pire-browser cookies set <name> <val>
pire-browser cookies set --curl ./cookies.curl --domain localhost
pire-browser cookies clear

pire-browser storage local
pire-browser storage local <key>
pire-browser storage local set <k> <v>
pire-browser storage local clear

pire-browser storage session
```

`cookies set --curl` imports cookies from a Copy-as-cURL dump, JSON cookie
array, object with a `cookies` array, or bare `Cookie:` header. Use `--domain`
when staging cookies before navigating from an empty tab. Cookie values may
contain session secrets; import commands report counts instead of echoing values.

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

The network surface is Firefox-backed: cooperative domain allowlists, extension-applied proxy settings, origin-scoped request headers, active-tab network-idle waiting, recent request diagnostics, agent-browser-style `network har start` / `network har stop`, direct HAR export, and best-effort active-tab route interception. `network request <requestId>` and HAR export include redacted request/response headers, redacted/truncated outgoing request bodies, and bounded redacted text-like response previews when Firefox exposes them; cookie values, binary bodies, and raw secrets are not captured.

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
pire-browser frame payment-frame
pire-browser frame https://checkout.example/frame
pire-browser frame main
```

Iframe nodes are surfaced in snapshots when Firefox can inspect them from the current page context. Refs assigned inside iframes carry frame context, so agents can usually click/fill those refs directly without switching first. Use `frame <ref|selector|name|url>` only when you want scoped snapshots or selector-based actions inside one iframe, then `frame main` before returning to outer-page selectors.

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
pire-browser trace start
pire-browser trace status
pire-browser trace stop trace.json
pire-browser profiler start
pire-browser profiler status
pire-browser profiler stop profile.json
pire-browser record start
pire-browser record status
pire-browser record stop recording-dir
```

`trace start` / `trace stop` records a Firefox QA evidence bundle with
WebExtension-observable console, page-error, network/HAR metadata, vitals,
compact snapshot, and screenshot evidence. It is not a Chrome DevTools
performance trace or CPU profile. `profiler start` / `profiler stop` writes
Chrome Trace Event-shaped JSON from Firefox Performance Timeline entries so
agents can inspect navigation, resource, paint, mark, measure, and long-entry
timing evidence. It is not Chrome DevTools CPU sampling. `record start` /
`record stop` records a bounded screenshot-sequence evidence bundle for the
active tab and writes frame PNGs plus `recording.json`. It is not native WebM
video, live viewport streaming, or Chrome DevTools screencast output. Chrome
DevTools inspect proxy and CPU sampling profiler are not implemented in the
current Firefox backend.

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

`vitals` is available for best-effort page performance checks. `react tree`, `react inspect`, `react renders`, and `react suspense` mirror agent-browser's React command shape using best-effort Firefox Fiber introspection and a lightweight hook installed by `open --enable react-devtools`.

```bash
pire-browser open --enable react-devtools https://app.example.com
pire-browser react tree
pire-browser react tree --selector "#root" --depth 3
pire-browser react inspect r1
pire-browser react inspect '@e1'
pire-browser react renders start
# interact with the page
pire-browser react renders stop
pire-browser react suspense
pire-browser react suspense --only-dynamic
pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json
pire-browser snapshot -i
```

`open --enable react-devtools` installs a lightweight React hook before page JavaScript runs. Re-run `react tree` after route changes or large DOM updates before using an `rN` id. Use `react renders start` before the interaction you care about, then `react renders stop` for the profile. `react suspense --only-dynamic` reports currently fallback/dehydrated boundaries visible through DOM-attached Fiber data.

`vitals` reports TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState,
and hydration warnings when Firefox exposes the underlying Performance API
entries. Missing browser signals are reported as unavailable.

### Init scripts

```bash
pire-browser open --init-script <path> <url>
AGENT_BROWSER_INIT_SCRIPTS=./before-load.js pire-browser open <url>
pire-browser addinitscript <js>
pire-browser removeinitscript <identifier>
```

`open --init-script` applies to one navigation. `PIRE_BROWSER_INIT_SCRIPTS` and the agent-browser-compatible `AGENT_BROWSER_INIT_SCRIPTS` are OS path-lists that add document-start scripts to `open/goto/navigate <url>` when no explicit `--init-script` is present. `addinitscript` registers a document-start script for future navigations in the current managed Firefox session and returns an identifier for `removeinitscript`.

### Setup

```bash
pire-browser install
pire-browser install --with-deps
pire-browser install --firefox-path /path/to/firefox
pire-browser setup
pire-browser setup --with-deps
pire-browser setup --firefox-path /path/to/firefox
pire-browser status
pire-browser status --json
pire-browser doctor
pire-browser doctor --fix
pire-browser doctor --fix --with-deps
pire-browser doctor --fix --firefox-path /path/to/firefox
pire-browser doctor --offline --quick
pire-browser doctor --json
```

`status` and plain `doctor` are observational. `doctor --json` and `install-status --json` include `nextActions` with concrete repair commands when setup needs attention. Use `doctor --fix` only when you explicitly want the agent-browser-style repair path: it reruns native host setup and then verifies status before reporting success. `install --with-deps`, `setup --with-deps`, and `doctor --fix --with-deps` accept agent-browser-style dependency setup recipes; on Windows/macOS they can try the supported Firefox installer when Firefox is missing, while Linux reports non-Snap/non-Flatpak Firefox guidance. Browser commands that need auto-launch can run lazy setup when native host registration is missing or mismatched.

### Skills

```bash
pire-browser skills list
pire-browser skills list --json
pire-browser skills get core
pire-browser skills get core --json
pire-browser skills get --all --json
pire-browser skills cat core
pire-browser skills path core
```

Installed agents should use the bundled skill command for version-matched guidance instead of relying on stale copied instructions. `skills get` is an agent-browser-style alias for `skills cat`; `skills get --all` returns all bundled skill content, and `skills path [name]` prints the installed skill directory. Skill commands are served by the JS launcher when possible, so agents can still load setup and repair guidance if the native binary is missing or stale. For local skill development, set `PIRE_BROWSER_SKILLS_DIR` or the agent-browser-compatible `AGENT_BROWSER_SKILLS_DIR` to a directory of `<name>/SKILL.md` files. The package also ships compact routing context under `agent/`.

### MCP Server

```bash
pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools all
```

The stdio MCP server exposes typed tools through agent-browser-style profiles.
`core` is the default inspect-before-act workflow: open, snapshot, semantic
find, click, tap-as-click, swipe-as-scroll, double-click, hover, focus, select,
check/uncheck, scroll/scroll-into-view, fill, type, press, keyboard/mouse
basics, typed get/check verification tools, typed waits, back/forward/reload,
SPA pushstate navigation, init scripts, screenshots/PDFs/diffs, eval, status,
confirmation follow-up, basic tabs, profile discovery, close, and skill
guidance. Generic `pire_browser_get`, `pire_browser_is`, and `pire_browser_wait`
remain available for compatibility, but new agents should prefer the typed
tools. Agent-browser-style aliases such as `pire_browser_tap`,
`pire_browser_swipe`, `pire_browser_dblclick`, `pire_browser_keydown`,
`pire_browser_keyup`, `pire_browser_tab_list`, `pire_browser_tab_switch`,
`pire_browser_tab_close`, `pire_browser_scroll_into_view`, and
`pire_browser_frame_switch` are also available; older `double_click`,
`key_down`, `key_up`, `tabs_*`, and `frame_select` names remain compatible.

Most browser-command tools accept common typed fields for session/profile
targeting, state files, file access, domain allowlists, confirmation/action
policies, content boundaries, output limits, proxy settings, and Firefox
executable overrides; use those fields instead of `extraArgs` for guardrails.
`pire_browser_open` also accepts typed one-shot `headers` and `initScriptPaths`
for pre-navigation setup. Prefer `pire_browser_open` for normal
launch/navigation; the `debug` profile exposes `pire_browser_launch` as a
narrower lower-level launch tool, `pire_browser_install` for explicit
native-host setup or repair, `pire_browser_upgrade` for user-requested package upgrades,
`pire_browser_stream_enable/status/disable` for dashboard-backed live preview
control, and `pire_browser_batch` for short command sequences. Pass `withDeps: true` to
`pire_browser_install` only when following an agent-browser-style dependency
recipe; it may install Firefox through winget/Chocolatey on Windows or Homebrew
on macOS if Firefox is missing, and reports non-Snap/non-Flatpak guidance on
Linux.

Add comma-separated profiles only when needed: `network`, `state`, `debug`,
`tabs`, `mobile`, or `react`. Use `state` for typed clipboard tools and
`pire_browser_profiles_import` when the user wants existing Firefox login state
copied into a managed profile. Use `debug` for lower-level launch,
install/repair, upgrade, batch, doctor/activity diagnostics,
console/errors/dialogs/highlight/trace/profiler/record/stream/vitals, and
session/profile inspection. Use `react` for best-effort typed React Fiber
inspection (`pire_browser_react_tree`, `pire_browser_react_inspect`,
`pire_browser_react_renders_start`, `pire_browser_react_renders_stop`,
`pire_browser_react_suspense`) and vitals. Use `--tools all` for every currently
implemented MCP tool. The `pire_browser_tools_profiles` tool describes the
available profiles in-band.

The MCP tools call the same installed CLI binary, so setup, policies, sessions, profiles, and Firefox runtime behavior stay shared with normal `pire-browser` commands.
The server defaults to MCP protocol `2025-11-25` and accepts older supported client protocol versions during initialization. Tool discovery is paginated for large profiles. Tool annotations mark local maintenance/context tools such as install, upgrade, status, sessions, profiles, and skills as non-open-world so MCP hosts can present clearer approval prompts.

## Authentication

### Quick summary

- Use `--headers` for header-authenticated origins.
- Use managed Firefox profiles for normal browser login state.
- Use `auth save --password-stdin` when saving a selector-driven auth helper to avoid shell history.
- Use `auth login --credential-provider <name>` when credentials live in an external vault plugin.
- Use `state save` and `state load` for active-origin cookies and Web Storage.
- Auth profiles are stored in a local AES-256-GCM encrypted auth vault.
- Set `PIRE_BROWSER_ENCRYPTION_KEY` or `AGENT_BROWSER_ENCRYPTION_KEY` to a 64-character hex key when saved state files should be encrypted.
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

For simple username/password forms, save a best-effort encrypted auth-vault
profile and reuse it later:

```bash
echo "secret" | pire-browser auth save app --url https://example.com/login --username user --password-stdin --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
pire-browser auth login app
pire-browser snapshot -i
```

`--password-stdin` is the recommended save path because it avoids putting the
password in shell history. Auth profiles are stored in an AES-256-GCM encrypted
local vault under the OS app-data directory. The vault key comes from
`PIRE_BROWSER_AUTH_ENCRYPTION_KEY`, `PIRE_BROWSER_ENCRYPTION_KEY`, the
agent-browser-compatible `AGENT_BROWSER_ENCRYPTION_KEY`, or an auto-generated
local key file. `auth list` and `auth show` do not print passwords; `auth login`
decrypts locally and sends a one-shot profile payload to the Firefox extension.

For external vaults, configure an agent-browser-compatible credential provider
plugin. The plugin is a local executable that reads one JSON request from stdin
and writes one JSON response to stdout:

```json
{
  "plugins": [
    {
      "name": "vault",
      "command": "agent-browser-plugin-vault",
      "args": [],
      "capabilities": ["credential.read"]
    }
  ]
}
```

Then resolve credentials for one login without saving them in the local auth
vault:

```bash
pire-browser auth login app --credential-provider vault --item "My App" --url https://example.com/login
pire-browser snapshot -i
```

`AGENT_BROWSER_PLUGINS` and `PIRE_BROWSER_PLUGINS` can replace config discovery
with the same JSON array. Credential plugins receive `credential.resolve` and
return `credential` with `username`, `password`, `url`, and optional
`usernameSelector`, `passwordSelector`, and `submitSelector`. Plugin stderr and
plugin error text are suppressed in this core login path to reduce accidental
secret exposure. Use `--confirm-actions plugin:vault:credential.read` when a
user approval gate should run before the provider is invoked. Do not claim login
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

`--session <uuid>` targets a strict live session id from `session list`. `--session <name>`, `PIRE_BROWSER_SESSION=<name>`, `AGENT_BROWSER_SESSION=<name>`, `--session-name <name>`, `PIRE_BROWSER_SESSION_NAME=<name>`, and `AGENT_BROWSER_SESSION_NAME=<name>` are named-profile aliases that may reuse or launch managed Firefox.

## Firefox Profile Reuse

```bash
pire-browser profiles --json
pire-browser profiles import "C:\Users\me\AppData\Roaming\Mozilla\Firefox\Profiles\abc.default-release" --name Work
pire-browser profiles import ~/Library/Application\ Support/Firefox/Profiles/abc.default-release --name Work
pire-browser --profile Default open https://example.com
pire-browser --profile Work open https://example.com
pire-browser --profile ~/.myapp-profile open https://example.com
```

`--profile <name-or-path>` reuses or launches a managed Firefox profile. Path-like values are mapped to stable managed Firefox profile names under the `pire-browser` data directory. They are not raw browser profile directories.
Use `profiles import` when you already have a Firefox profile with login state you want to reuse. It copies the source into a managed profile and never mutates the original; close Firefox before importing so lock files and partially-written data are not copied. Future changes in the original Firefox profile do not sync automatically. Use `--overwrite` only after closing the managed `pire-browser` profile you want to replace.

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
AGENT_BROWSER_STATE=./.pire-state/app-work.json pire-browser open https://app.example.com/dashboard
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json
```

State files contain active-origin cookies, `localStorage`, and `sessionStorage`. By default they are plaintext for compatibility. Set `PIRE_BROWSER_ENCRYPTION_KEY`, or the agent-browser-compatible `AGENT_BROWSER_ENCRYPTION_KEY`, to a 64-character hex AES-256 key before `state save` to write encrypted AES-256-GCM files and before `state load` to decrypt them. `state list`, `state show`, and non-recording `state inspect` remain metadata-only and do not print cookie or storage values. State files do not include saved passwords, full browser profiles, service workers, IndexedDB, or cross-origin SSO state. Use managed profiles or `profiles import` when IndexedDB, service workers, cross-origin SSO state, or full Firefox login continuity matters.
`PIRE_BROWSER_STATE` and the agent-browser-compatible `AGENT_BROWSER_STATE` preload active-origin state before browser-control commands when no explicit `--state` is present.

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
pire-browser snapshot -i --cursor-interactive
pire-browser snapshot -i --urls
pire-browser snapshot -i -d 5
pire-browser snapshot -s "#main"
pire-browser snapshot --selector "#main"
pire-browser snapshot --json
```

Refs are short lived. Re-run `snapshot -i` after navigation, reloads, DOM changes, dialogs, downloads, uploads, or failed actions.
Use `-C`/`--cursor-interactive` when a page uses clickable `div`s, custom controls, or cursor-pointer elements that are missing from the default accessibility-oriented snapshot.

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
--model <name>                  # Chat model override; accepted elsewhere as legacy input
--debug                         # Debug output
```

`--confirm-actions` accepts normal action categories such as `eval` and
`download`, plus plugin capability categories such as
`plugin:vault:credential.read`.

## AI Chat

`chat` mirrors agent-browser's natural-language entry point. It asks AI Gateway
for JSON command plans, executes those commands through the normal
`pire-browser` CLI path, feeds command output back to the model, and stops when
the model returns a final answer or the step limit is reached.

```bash
set AI_GATEWAY_API_KEY=...              # Windows cmd
$env:AI_GATEWAY_API_KEY="..."           # PowerShell
export AI_GATEWAY_API_KEY=...           # macOS/Linux

pire-browser chat "open example.com and summarize the page"
pire-browser -q chat "summarize this page"
pire-browser -v chat "fill the search box with cats and press Enter"
pire-browser --model anthropic/claude-sonnet-4.6 chat "take a screenshot"
pire-browser chat --max-steps 8
pire-browser chat
```

Bare `chat` starts a small terminal REPL; type `quit` to exit. Piped stdin is
treated as one instruction. `AI_GATEWAY_MODEL` overrides the default
`anthropic/claude-sonnet-4.6`, and `AI_GATEWAY_URL` overrides the default
`https://ai-gateway.vercel.sh`. Chat child commands inherit important global
policy/session flags such as `--allowed-domains`, `--confirm-actions`,
`--action-policy`, `--profile`, and `--session-name`. The chat loop refuses to
run `confirm`, `deny`, `chat`, `mcp`, `dashboard`, or `stream` automatically.

## Observability Dashboard

Start a localhost dashboard when you want a quick view of install
health, live sessions, managed profiles, a live read-only viewport preview,
optional AI Gateway chat, recent redacted command activity, and current
capability notes:

```bash
pire-browser dashboard start
pire-browser dashboard start --background
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json
pire-browser dashboard status --json
pire-browser dashboard stop
pire-browser stream enable
pire-browser stream status --json
pire-browser stream disable
```

Open the printed `http://127.0.0.1:<port>` URL in a browser. Without
`--background`, the server runs in the foreground; press `Ctrl+C` in that
terminal to stop it. With `--background`, use `pire-browser dashboard status`
and `pire-browser dashboard stop` to manage the recorded dashboard process.

The activity feed is bounded and redacts known secret-bearing arguments such as
passwords, headers, proxy credentials, cookie values, storage values, and HTTP
Basic credentials. You can also inspect it from the CLI:

```bash
pire-browser activity list
pire-browser activity list --limit 50 --json
```

The dashboard polls visible-viewport screenshots for the selected live session
to provide a live read-only preview. `stream enable/status/disable` is the
agent-browser-style lifecycle surface for that same dashboard-backed preview,
and `stream status --json` reports the transport as `dashboard-http-polling`
with `webSocketStreaming: false`. It does not provide full WebSocket frame
streaming, remote input events, or native WebM video. Use snapshots,
screenshots, screenshot-sequence recording, and diagnostics commands for visual
evidence, page-state verification, and scriptable observability:

```bash
pire-browser record start
pire-browser record stop recording-dir
pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser doctor --json
```

When `AI_GATEWAY_API_KEY` is available before the dashboard starts, the AI Chat
panel is enabled. It sends the typed instruction to the same bounded
AI Gateway-backed command loop as `pire-browser chat`, forwards the currently
previewed session when one exists, and returns the final answer after the loop
finishes. Dashboard chat does not stream intermediate model tokens yet.

## Configuration

`pire-browser` loads JSON defaults before command parsing.

```bash
# from a project that has ./pire-browser.json
pire-browser open https://example.com
pire-browser --config ./ci-config.json open https://example.com
PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com
```

Defaults are loaded from `~/.pire-browser/config.json`, `./pire-browser.json`, `PIRE_BROWSER_CONFIG`, and explicit `--config`, in that order. CLI flags override config defaults. Agent-browser-compatible aliases `~/.agent-browser/config.json`, `./agent-browser.json`, and `AGENT_BROWSER_CONFIG` are also accepted for existing installs.

For editor autocomplete:

```json
{
  "$schema": "./node_modules/pire-browser/pire-browser.schema.json",
  "json": true,
  "profile": "Work",
  "state": "./.pire-state/work.json",
  "allowedDomains": ["app.example.com", "*.example.com"],
  "downloadPath": "./downloads",
  "plugins": [
    {
      "name": "vault",
      "command": "agent-browser-plugin-vault",
      "capabilities": ["credential.read"]
    }
  ]
}
```

## Default Timeout

Download commands default to 60000ms:

```bash
pire-browser --download-path ./downloads open https://example.com
pire-browser download '@e4' ./downloads/report.txt --timeout 60000
pire-browser wait --download ./downloads/report.txt --timeout 60000
pire-browser wait --download --timeout 60000
```

Use `--download-path <dir>`, `PIRE_BROWSER_DOWNLOAD_PATH`, or `AGENT_BROWSER_DOWNLOAD_PATH` to set the Firefox download directory for newly launched managed sessions. Relative download paths resolve from the command's current working directory. With no explicit output path, `wait --download` reports the completed Firefox file path.

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
pire-browser snapshot --selector "#main"
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

`--firefox-path` and `PIRE_BROWSER_FIREFOX_PATH` may point to the Firefox
executable, a directory containing it, or `/Applications/Firefox.app` on macOS.
If Firefox discovery fails during `install`, the error includes the platform's
recommended repair command.

## Local Files

Open and interact with supported local HTML files using `file://` URLs:

```bash
pire-browser --allow-file-access open file:///path/to/page.html
pire-browser screenshot output.png
pire-browser pdf output.pdf
pire-browser upload '#file' ./fixture.png
```

For repeatable agent tests, an HTTP fixture server is usually more reliable than file URLs. Uploads are chunked through the native host and capped at 8 MiB total raw bytes per command. They assign files to `input[type=file]` controls, associated labels, nested file inputs, or page dropzones. Dropzone support dispatches page `dragenter`/`dragover`/`drop` events with `DataTransfer` files; native OS file-picker control, directory upload, and browser-chrome drag state are not implemented. PDF output is image-backed visual evidence, not a selectable-text print export.

## CDP Mode

Chrome DevTools Protocol mode is not available. `pire-browser` commands are mediated by Firefox WebExtension APIs and Native Messaging.

```bash
# Not available in pire-browser today:
# pire-browser connect 9222
# pire-browser --cdp 9222 snapshot
```

## Streaming And Recording

`stream enable` starts the dashboard-backed live read-only preview service in
the background. It gives agents and humans an agent-browser-style lifecycle
surface for observability while honestly reporting the current Firefox transport:
dashboard HTTP polling, not full WebSocket frame streaming.

```bash
pire-browser stream enable
pire-browser stream status --json
pire-browser stream disable
pire-browser screenshot page.png
pire-browser record start
pire-browser record stop recording-dir
pire-browser status --json
pire-browser session list --json
```

Use the `stream` commands when you want a stable local dashboard URL and
machine-readable capability fields such as `webSocketStreaming: false`,
`transport: "dashboard-http-polling"`, and
`liveViewportKind: "polling-screenshot-preview"`.

`record start` captures bounded visible-viewport PNG frames from the active
Firefox tab. `record stop [output-dir]` writes the frames plus `recording.json`.
This is useful QA evidence, not native WebM video or WebSocket viewport streaming.

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
Use pire-browser to test the login flow. Run pire-browser --help or pire-browser <command> --help to see available commands.
```

### AI Coding Assistants (recommended)

Install the skill so the agent can load version-matched runtime guidance:

```bash
npx skills add ryenwang/pire-browser
```

The installed npm package also serves the bundled core skill:

```bash
pire-browser skills get core
pire-browser skills path core
```

Launcher-served commands such as `skills`, `update`, and `upgrade` support
`--help` before native binary resolution, so agents can still get install/update
guidance when an optional native package is missing or stale.

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
