---
name: core
description: Core pire-browser workflow for safe Firefox automation.
---

# Core pire-browser Skill

Use `pire-browser` when the user asks you to inspect or control Firefox. Do not inspect installed source code to discover commands; use `pire-browser --help`, `pire-browser <command> --help`, and `pire-browser skills get core`.

## Quick Start

```bash
pire-browser open https://example.com
pire-browser snapshot -i
pire-browser fill '@e2' "hello@example.com"
pire-browser press Enter
pire-browser wait '@e4'
pire-browser click '@e4'
pire-browser snapshot -i
```

Always inspect before page actions. Use refs only from the latest snapshot or find output. Quote refs in PowerShell, for example `click '@e4'`.
If a click reports that the target is covered by another element, dismiss or
interact with the reported covering element, then run `snapshot -i` before
retrying the original ref.

## Core Loop

1. Open or select the page.
2. Inspect with `pire-browser snapshot -i`.
3. Act with refs or semantic find commands.
4. Wait only when page state needs time to settle.
5. Reinspect and report success only after verification confirms the requested state.

## Common Recipes

Search a site:

```bash
pire-browser open https://duckduckgo.com
pire-browser snapshot -i --compact
pire-browser fill '<search-ref>' "Pire-Browser"
pire-browser click '<search-button-ref>'
pire-browser snapshot -i --compact
```

Use semantic find when labels are clear:

```bash
pire-browser find label "Email" fill "hello@example.com"
pire-browser find role button --name "Submit" click
pire-browser find text "Save" --exact
```

Use `--exact` when nearby text would otherwise create substring matches.

Use focused keyboard commands when the page behavior depends on key events:

```bash
pire-browser click '<input-ref>'
pire-browser keyboard type "hello@example.com"
pire-browser press Enter
pire-browser keydown Shift
pire-browser keyup Shift
pire-browser get value '<input-ref>'
```

`keyboard type`, `keyboard inserttext`, `keydown`, and `keyup` act at the
current page focus. Click or focus the intended control first. Use `type
<target> <text>` or `fill <target> <text>` when you have a selector/ref and do
not need focused keyboard edges. Use `focus <target>` before focused keyboard
commands when you know the target, `hover <target>` for menus/tooltips that
respond to mouseover, `select <target> <value>` for HTML selects, and
`check <target>` / `uncheck <target>` for checkboxes. Use `dblclick <target>`
when the UI requires a double-click. Use `tap <target>` only as a best-effort
alias for `click <target>`; it is not native touch input or mobile browser
emulation. Use `swipe <direction> [pixels]` only as a best-effort mobile helper
that maps touch direction to page scroll (`swipe up` scrolls down); use
`scroll` for direct scroll direction and `scrollintoview <target>` when you
already know the element you need.

```bash
pire-browser snapshot -i
pire-browser hover '<menu-ref>'
pire-browser focus '<input-ref>'
pire-browser select '<country-ref>' US
pire-browser check '<terms-ref>'
pire-browser scrollintoview '<submit-ref>'
pire-browser dblclick '<item-ref>'
pire-browser snapshot -i
```

Use chat only when the user specifically wants natural-language browser control
from the CLI:

```bash
AI_GATEWAY_API_KEY=... pire-browser chat "open example.com and summarize it"
pire-browser -q chat "summarize this page"
pire-browser -v chat "fill the search box with cats and press Enter"
```

`chat` mirrors agent-browser's AI Gateway-backed command loop. It asks the model
for JSON command plans, runs those commands through normal `pire-browser` CLI
paths, and feeds observations back until a final answer or the bounded step
limit. Prefer direct commands or MCP typed tools when you already know the next
browser action; chat adds model latency and requires `AI_GATEWAY_API_KEY`.
The dashboard AI Chat panel uses the same loop, forwards the currently previewed
session when one exists, and returns the final answer after the loop finishes;
streamed dashboard chat updates are not available yet.

Read documents, docs pages, and article text before falling back to snapshots:

```bash
pire-browser read https://example.com/article
pire-browser read https://example.com/article --filter overview
pire-browser read https://example.com/article --outline
pire-browser read https://docs.example.com --llms index --filter auth
pire-browser read https://docs.example.com --llms full --filter auth
pire-browser read --llms index --filter auth
pire-browser read --require-md
pire-browser read
```

Use `read <url>` for no-browser markdown/plain/html text fetches. Omit the URL
to read rendered text from the active Firefox tab, including client-side state
and authenticated content. When `--llms`, `--require-md`, `--raw`, or
`--timeout` is used without a URL, `pire-browser` first reads the active tab URL
and then performs the same guarded URL fetch. Use `snapshot -i` when you need
interaction refs.

Read and check state without dumping a whole snapshot when you already know the
target:

```bash
pire-browser get title
pire-browser get url
pire-browser get text '@e1'
pire-browser get attr '@e2' href
pire-browser get count "button"
pire-browser is visible '@e3'
pire-browser is enabled '#submit'
```

Use `get` and `is` after a fresh snapshot or semantic find when you need a
specific value for verification. Re-run `snapshot -i` first if the page changed
or the ref may be stale.

When using MCP, prefer the agent-browser-style typed verification tools instead
of the generic compatibility tools: `pire_browser_get_text`,
`pire_browser_get_html`, `pire_browser_get_value`, `pire_browser_get_attr`,
`pire_browser_get_count`, `pire_browser_get_box`, `pire_browser_get_styles`,
`pire_browser_get_url`, `pire_browser_get_title`, `pire_browser_is_visible`,
`pire_browser_is_enabled`, and `pire_browser_is_checked`.

Batch short command sequences to reduce process churn:

```bash
pire-browser batch "open https://example.com" "snapshot -i" "screenshot result.png"
pire-browser batch --bail "open https://example.com" "click '@e1'" "screenshot result.png"
echo '[["open","https://example.com"],["snapshot","-i"],["click","@e1"]]' | pire-browser batch --json
```

Use `--bail` when later commands depend on earlier commands succeeding. With no inline commands, `batch` reads a JSON array from stdin; entries can be command strings or arrays of args.
When using MCP, add the `debug` profile and call `pire_browser_batch` with a typed
`commands` array for short sequences. Prefer individual typed tools when an
agent needs to inspect intermediate output before choosing the next action.

Reduce prompt-injection and context-flooding ambiguity:

```bash
pire-browser --content-boundaries snapshot -i
pire-browser --max-output 50000 get text body
PIRE_BROWSER_CONTENT_BOUNDARIES=1 pire-browser snapshot -i --json
PIRE_BROWSER_MAX_OUTPUT=50000 pire-browser get html body --json
```

Use `--content-boundaries` when page text may contain instructions or tool-like text. Use `--max-output <n>` before broad `get text/html` or noisy snapshots. These guards label or cap emitted browser command text; they do not replace inspecting fresh refs or verifying page state.

Wait for page state:

```bash
pire-browser wait --selector "#done" --timeout 10000
pire-browser wait '@e7'
pire-browser wait --text "Saved"
pire-browser wait --url "**/dashboard"
pire-browser wait --fn "window.appReady === true"
pire-browser wait --load networkidle
```

Use `wait --load networkidle` after opening dynamic apps when fetch/XHR work must
settle before `snapshot -i`, `find`, or `screenshot`. Use `wait --fn` for a
short, side-effect-free page-world JavaScript predicate when the app exposes a
clear readiness signal. Reinspect after the wait.

When using MCP, prefer the agent-browser-style typed wait tools instead of the
generic compatibility tool: `pire_browser_wait_ms`, `pire_browser_wait_for_selector`,
`pire_browser_wait_for_text`, `pire_browser_wait_for_url`,
`pire_browser_wait_for_load`, and `pire_browser_wait_for_function`. Use
`waitTimeoutMs` on typed condition waits when the default timeout is too short.

Navigate inside an SPA without a full page load:

```bash
pire-browser pushstate /dashboard
pire-browser wait --url "**/dashboard"
pire-browser snapshot -i --compact
```

Use `pushstate <url-or-path>` only after a page is open. It performs same-origin
client-side navigation in the active page, preferring `window.next.router.push`
when present and falling back to `history.pushState`. Reinspect before acting on
refs from the new route.

Inspect app diagnostics before guessing at failures:

```bash
pire-browser console
pire-browser errors
pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser console --clear
pire-browser errors --clear
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

Use `console`, `errors`, `vitals`, `trace`, `profiler`, and `record` after
navigation, login, or failed actions when the page looks stuck or broken.
`trace start` / `trace stop` writes a Firefox QA evidence bundle with console,
page-error, network/HAR metadata, vitals, compact snapshot, and screenshot
evidence; it is not a Chrome DevTools performance trace or CPU profile.
`profiler start` / `profiler stop` writes Chrome Trace Event-shaped JSON from
Firefox Performance Timeline entries for navigation, resource, paint, mark,
measure, and long-entry timing evidence; it is not Chrome DevTools CPU sampling
or a full renderer timeline. `record start` / `record stop` writes bounded
visible-viewport PNG frames plus `recording.json` as a screenshot-sequence QA
evidence bundle; it is not native WebM video, live viewport streaming, or Chrome
DevTools screencast output. `vitals` reports best-effort TTFB, FCP, LCP, CLS,
INP, DOMContentLoaded, load, readyState, and hydration-warning signals from
Firefox Performance APIs. Unavailable Chrome-specific metrics are reported as
unavailable. Console and error commands report Firefox WebExtension-captured
page-world messages and page errors from reachable frames. They do not expose raw
Chrome CDP console payloads, and they only capture records observed after the
pire-browser content script loads.

Inspect React component structure when debugging a React app:

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
```

`react tree`, `react inspect`, `react renders`, and `react suspense` mirror
agent-browser's command shape through best-effort Firefox Fiber data attached to
DOM nodes plus a lightweight hook installed by `open --enable react-devtools`.
Re-run `react tree` after navigation, route changes, or large DOM updates before
using an `rN` id. Start render recording before the interaction of interest, then
stop it for the profile. Use `react suspense --only-dynamic` to focus on
currently fallback/dehydrated boundaries visible through DOM-attached Fiber data.
Use snapshots, targeted get/is checks, console/errors, and vitals for supporting
evidence.

Start the local dashboard when a human or agent needs a quick view of setup,
live sessions, managed profiles, a live read-only viewport preview, optional
AI Gateway chat, and recent command activity:

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

The dashboard is a localhost server. Without `--background`, stop it with
`Ctrl+C`; with `--background`, manage it with `dashboard status` and
`dashboard stop`. It shows install health, live sessions, managed profiles, a
bounded redacted command activity feed, a live read-only preview for the
selected session, optional non-streaming dashboard chat, and capability notes.
The preview polls visible-viewport screenshots from the Firefox extension. For
scripts, use:

```bash
pire-browser stream status --json
pire-browser activity list --json
```

Activity shows what commands ran; it does not prove page success. The dashboard
preview is read-only. `stream enable/status/disable` is the
agent-browser-style lifecycle surface for that same dashboard-backed preview
service and reports `transport: "dashboard-http-polling"` with
`webSocketStreaming: false`; it is not full WebSocket frame streaming, remote
input, or native WebM video. Keep using `snapshot -i`, `screenshot`, `record
start` / `record stop`, `status`, and `doctor` as the primary
machine-readable evidence path. `record` is screenshot-sequence evidence, not
native WebM video.

Handle page JavaScript dialogs when warnings mention `PAGE_DIALOG`:

```bash
pire-browser dialog status
pire-browser dialog accept "prompt text"
pire-browser dialog dismiss
pire-browser snapshot -i
```

`dialog accept [text]` configures the next shimmed confirm or prompt to accept,
using `text` as the prompt return value. `dialog dismiss` configures the next
shimmed confirm or prompt to cancel. Firefox dialog support is page-shimmed
best effort, not native browser chrome control. Reinspect after handling a
dialog before using old refs.

Inspect network activity during QA:

```bash
pire-browser network requests
pire-browser network requests --filter /api/
pire-browser network requests --type xhr,fetch --status 2xx
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

Use `network requests` after navigation or failed app actions to see recent
active-tab requests. Filters support URL substring/glob, resource type, method,
and status. Use `network route` before triggering a fetch/load when you need a
best-effort active-tab mock or block, then `network unroute` before returning to
normal behavior. Firefox route mocking uses WebExtension interception, so treat
it as QA/debug control rather than full CDP response capture. Use `network har start`
before a flow and `network har stop <path>` afterward when you need a
portable request timeline artifact. `network har <path>` also exports the
current recent request log directly. Network detail and HAR output may include
redacted request/response headers, redacted/truncated outgoing request bodies,
and bounded redacted text-like response previews when Firefox exposes them. Use
these previews to debug API submissions, form posts, and response payloads, but
do not treat them as full CDP network capture: cookies, binary bodies, streaming
payloads, and raw header/body secrets are not captured.

Set a responsive viewport before QA screenshots:

```bash
pire-browser set viewport 1280 720
pire-browser snapshot -i --compact
pire-browser screenshot desktop.png
pire-browser device "iPhone 14"
pire-browser set device "iPhone 14"
pire-browser set geo 37.7749 -122.4194
pire-browser snapshot -i --compact
pire-browser swipe up 500
pire-browser screenshot mobile.png
```

`set viewport`, `device`, `set geo`, `tap`, and `swipe` are Firefox best-effort paths. Viewport and device settings resize the browser window to approximate the requested content viewport and return measured `page.innerWidth`/`page.innerHeight`; verify those measurements before relying on pixel-perfect screenshots. `device <name>` is the agent-browser-style spelling; `set device <name>` remains compatible. Device presets report a User-Agent/touch/scale profile but do not enforce mobile User-Agent, touch input, browser chrome, or exact deviceScaleFactor. `swipe` maps touch direction to page scroll and is not native touch input. `set geo` installs a page-level `navigator.geolocation` shim for managed Firefox pages; it does not change Firefox's native permission prompt, OS location services, IP-based location, or browser chrome state.

When using MCP, prefer the typed setting tools (`pire_browser_set_viewport`,
`pire_browser_device`, `pire_browser_set_device`, `pire_browser_set_geo`, `pire_browser_set_headers`,
`pire_browser_set_credentials`, `pire_browser_set_media`, and
`pire_browser_set_offline`) instead of raw command strings.

```sh
pire-browser --color-scheme dark open https://example.com
pire-browser set media light
```

Use `--color-scheme dark|light|auto` before `open`, or `set media dark|light|auto` in a live session, when a page uses `prefers-color-scheme`.

Test offline and reconnect flows with request blocking:

```bash
pire-browser set offline on
pire-browser open https://example.com
pire-browser snapshot -i
pire-browser set offline off
pire-browser wait --load networkidle
```

`set offline on|off` is best-effort Firefox request blocking for managed tabs. It cancels future network requests, but it does not fully emulate Chromium/CDP offline mode: `navigator.onLine`, service worker cache behavior, DNS, and socket state are not controlled.

Route a managed session through a proxy:

```bash
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy socks5://proxy.example:1080 --proxy-bypass "localhost,*.internal" open https://example.com
PIRE_BROWSER_PROXY=http://proxy.example:8080 pire-browser open https://httpbin.org/ip
```

Use `--proxy` before `open` or another browser bridge command when proxy routing matters. Proxy credentials can be supplied in the URL or with `PIRE_BROWSER_PROXY_USERNAME` / `PIRE_BROWSER_PROXY_PASSWORD`; agent-browser aliases such as `AGENT_BROWSER_PROXY` and `AGENT_BROWSER_PROXY_BYPASS` also work. Credentials are not echoed. This is a Firefox `browser.proxy.settings` path, not a TLS-ignore or OS-wide proxy setting.

Highlight the visual target before a QA screenshot:

```bash
pire-browser highlight '#submit'
pire-browser screenshot submit-highlight.png
pire-browser screenshot --full full-page.png
pire-browser screenshot --annotate numbered-elements.png
pire-browser pdf page.pdf
pire-browser screenshot --screenshot-dir screenshots
```

Use `highlight <target>` with the same refs, selectors, text, and semantic targets you would use for `click` or `fill`. Use `screenshot --full` when the report needs the whole page, `screenshot --annotate` when numbered element evidence is more useful than a single target overlay, and `pdf <path>` when the report needs a portable visual evidence file. `pdf` embeds a screenshot into a one-page image-backed PDF; text is not selectable and print CSS is not applied. `screenshot` with no path writes a generated file under the local `pire-browser/screenshots` data directory and prints the resolved path. `--screenshot-dir <dir>` generates a timestamped filename inside that directory when no filename is provided. Relative screenshot paths resolve from the command's current working directory. These are visual QA helpers; styling is Firefox-specific, so do not rely on pixel-identical annotation behavior across browsers.

Set a default download directory when download location matters:

```bash
pire-browser --download-path ./downloads open https://example.com
pire-browser snapshot -i
pire-browser download '<download-link-ref>' ./downloads/report.csv
pire-browser wait --download --timeout 60000
```

Use `--download-path <dir>`, `PIRE_BROWSER_DOWNLOAD_PATH`, or
`AGENT_BROWSER_DOWNLOAD_PATH` before launching a managed session when
browser-initiated downloads should land in a known folder. Relative download
paths resolve from the command's current working directory. Use an explicit
`download <target> <path>` or `wait --download <path>` output path when the
final filename must be exact. With no explicit output path, `wait --download`
reports the completed Firefox file path; verify file type or size when relevant.

Upload local files through file input controls or page dropzones:

```bash
pire-browser snapshot -i
pire-browser upload '<file-input-ref-or-selector>' ./fixture.png
pire-browser upload '<dropzone-ref-or-selector>' ./one.png ./two.json
pire-browser snapshot -i
```

Use a fresh snapshot to verify the target is an `input[type=file]`, an
associated label, a container with a nested file input, or the visible dropzone
that the web app listens to. Uploads are chunked through the native host and
capped at 8 MiB total raw bytes per command. Dropzone upload dispatches page
`dragenter`/`dragover`/`drop` events with `DataTransfer` files. Native OS
file-picker control, directory upload, and browser-chrome drag state are not
implemented, so verify success through fresh page state after the upload.

Compare page structure before and after an action:

```bash
pire-browser snapshot -i
pire-browser click '@e4'
pire-browser diff snapshot
pire-browser diff snapshot --baseline before.txt
pire-browser diff snapshot --selector "#main" --compact
pire-browser diff screenshot --baseline before.png
pire-browser diff screenshot --baseline before.png -o diff.png
pire-browser diff screenshot --baseline before.png -t 0.2
pire-browser diff url https://v1.example https://v2.example
pire-browser diff url https://v1.example https://v2.example --screenshot
pire-browser diff url https://v1.example https://v2.example --wait-until networkidle
pire-browser diff url https://v1.example https://v2.example --selector "#main" --compact
```

Use `diff snapshot` after a baseline snapshot and an action to see structural
changes without leaving the CLI. `--baseline <path>` compares against a saved
snapshot text file. Use `diff screenshot --baseline <path>` after capturing a
visual baseline to compare the current active-page screenshot. Add `-o <path>`
for a red diff image and `-t <0..1>` when small rendering differences should be
ignored. Use `diff url <url1> <url2>` for before/after page comparisons without
manually opening each page; add `--screenshot` when the report needs pixel
evidence in addition to snapshot differences. When using MCP, prefer
`pire_browser_diff_snapshot`, `pire_browser_diff_screenshot`, or
`pire_browser_diff_url` for these QA comparisons.

Authenticate a page or API route with request headers:

```bash
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser open https://api.example.com/dashboard
```

`open --headers` applies headers to the opened URL's origin for the current managed Firefox session. `set headers` applies headers to the active page's origin; use `set headers '{}'` to clear that origin. `set credentials <username> <password>` applies memory-only HTTP Basic auth to the active page's origin. Header values and passwords are not echoed in command output. Reinspect after navigation and do not assume auth applies to other hosts or ports.

Inspect or adjust active-origin cookies and Web Storage:

```bash
pire-browser cookies
pire-browser cookies set preview enabled
pire-browser cookies set --curl ./cookies.curl --domain localhost
pire-browser storage local
pire-browser storage local featureFlag
pire-browser storage local set featureFlag on
pire-browser storage session clear
```

Cookies and Web Storage values may contain session secrets. Prefer targeted key
reads and do not paste raw values back to the user unless they explicitly asked
for state debugging output. Use `cookies set --curl <file-or-cookie-data>
--domain <domain>` when staging cookies before navigation; it accepts a
Copy-as-cURL dump, JSON cookie array, object with a `cookies` array, or bare
`Cookie:` header and reports counts instead of echoing values.

Use page-level mouse events when a custom widget needs coordinates:

```bash
pire-browser mouse move 80 80
pire-browser mouse down
pire-browser mouse up
pire-browser mouse wheel 400
pire-browser tap '<target-ref>'
pire-browser swipe up 500
pire-browser scroll down 500 --selector "#panel"
pire-browser scrollintoview '<target-ref>'
pire-browser drag '<source-ref>' '<target-ref>'
```

Mouse, hover, tap, swipe, scroll, scrollintoview, and drag commands are Firefox
WebExtension paths. They dispatch page events, not native OS cursor movement,
native touch input, or browser-chrome drag state. `hover` cannot force native
`:hover` state on every page, so verify with page state afterwards.

Save and reuse a simple login form profile:

```bash
echo "pass" | pire-browser auth save app --url https://example.com/login --username user --password-stdin --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
pire-browser auth login app
pire-browser snapshot -i --compact
```

Prefer `--password-stdin` over `--password` when saving credentials so the password is not placed in shell history. Saved auth profiles live in the local AES-256-GCM encrypted auth vault. The vault key comes from `PIRE_BROWSER_AUTH_ENCRYPTION_KEY`, `PIRE_BROWSER_ENCRYPTION_KEY`, `AGENT_BROWSER_ENCRYPTION_KEY`, or an auto-generated local key file. `auth list` and `auth show` do not print passwords; `auth login` decrypts locally and sends a one-shot profile payload to Firefox.

Use a configured credential-provider plugin when the user keeps credentials in an external vault:

```bash
pire-browser auth login app --credential-provider vault --item "My App" --url https://example.com/login
pire-browser snapshot -i --compact
```

Credential providers use the agent-browser plugin protocol with capability `credential.read`; configure them in `pire-browser.json` / `agent-browser.json` under `plugins`, or set `AGENT_BROWSER_PLUGINS` / `PIRE_BROWSER_PLUGINS` to the same JSON array. Do not put vault tokens or passwords in plugin args. Use `--confirm-actions plugin:vault:credential.read` when provider access should require approval before the plugin runs. When using MCP, only call `pire_browser_auth_save` with user-approved credentials; use `pire_browser_auth_login` with `credentialProvider` and `item` for configured vault providers. Always verify login with a fresh snapshot, URL, or page state before reporting success.

Open tabs and windows:

```bash
pire-browser tab new https://example.com
pire-browser tabs list
pire-browser window new
pire-browser open https://example.com
```

`open --new` and `open --new-tab` create a new tab, not a new window. For the user phrase "open a new window", run `pire-browser window new`, then `pire-browser open <url>`.

Register a script for the next navigation:

```bash
pire-browser open --init-script ./before-load.js https://example.com
pire-browser addinitscript "window.__flag = true"
pire-browser removeinitscript init1
```

Use this only when the page needs before-load setup. `open --init-script` applies only to that navigation. `addinitscript` registers for future navigations in the current managed Firefox session and returns an id to pass to `removeinitscript`. These are Firefox WebExtension paths, so verify with a fresh snapshot or page state check after navigation.

Open a local HTML file:

```bash
pire-browser --allow-file-access open file:///path/to/page.html
```

Use this for local HTML artifacts and fixtures. For portable visual evidence, run `pire-browser pdf page.pdf` after opening the local page.

Capture screenshots:

```bash
pire-browser screenshot page.png
pire-browser pdf page.pdf
```

Use a config file for repeated defaults:

```bash
# from a project that has ./pire-browser.json
pire-browser open https://example.com
pire-browser --config ./ci-config.json open https://example.com
PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com
```

Config files use camelCase keys. Useful defaults include `json`, `profile`, `sessionName`, `allowedDomains`, `confirmActions`, `confirmInteractive`, `allowFileAccess`, `headed`, `headless`, `colorScheme`, `downloadPath`, `maxOutput`, and `contentBoundaries`. CLI flags override config defaults. Unknown keys are ignored.

List and target managed profiles or live sessions:

```bash
pire-browser profiles --json
pire-browser profiles import /path/to/firefox-profile --name Work
pire-browser profiles import /path/to/firefox-profile --name Work --overwrite
pire-browser --profile Work open https://example.com
PIRE_BROWSER_PROFILE=Work pire-browser snapshot -i
pire-browser session list --json
pire-browser session attach <session-id>
pire-browser --session <session-id> snapshot -i
pire-browser --session agent1 open https://example.com
pire-browser --session-name work open https://example.com
PIRE_BROWSER_SESSION=agent1 pire-browser snapshot -i
pire-browser close
pire-browser close --all
```

Use `profiles import <firefox-profile-dir> --name <managed-name>` when a user already has Firefox login state to reuse. It copies the source Firefox profile into managed pire-browser state, never mutates the original, and future source changes do not sync. Ask the user to close Firefox before import if lock files are present. Use `--overwrite` only after closing the managed profile being replaced.

Use `--profile <name-or-path>` for reusable managed Firefox profiles. `PIRE_BROWSER_PROFILE=<name-or-path>` supplies the same default when no explicit profile/session flag is present. Path-like profile values are mapped to stable managed Firefox names, not raw browser profile directories. Use `--session <uuid>` only when targeting a strict live id from `session list`. `--session <name>`, `--session-name <name>`, `PIRE_BROWSER_SESSION=<name>`, and `PIRE_BROWSER_SESSION_NAME=<name>` remain available as named-profile aliases.

Use `pire-browser close` for normal end-of-loop teardown of the targeted managed Firefox session. Use `pire-browser close --all` when you need to close every live managed `pire-browser` Firefox session.

Save and reuse active-origin state:

```bash
pire-browser --session work state save ./.pire-state/app-review.json
pire-browser --auto-connect state save ./.pire-state/app-review.json
pire-browser --state ./.pire-state/app-review.json open https://example.com/dashboard
pire-browser state list --json
pire-browser state show app-review --json
pire-browser state rename app-review app-ready
pire-browser --session work state load ./.pire-state/app-ready.json
pire-browser state clear app-ready
```

State files contain active-origin cookies and Web Storage. They are plaintext by default for compatibility. Set `PIRE_BROWSER_ENCRYPTION_KEY` or the agent-browser-compatible `AGENT_BROWSER_ENCRYPTION_KEY` to a 64-character hex AES-256 key when saved state should be AES-256-GCM encrypted; keep that key out of logs and shell history. `state list`, `state show`, and `state inspect` are metadata-only and do not print cookie or storage values. Bare state names resolve inside `.pire-state`; explicit paths remain supported for save/load/show/rename. Use managed profiles or `profiles import` when IndexedDB, service workers, cross-origin SSO state, or full Firefox profile continuity matters.
`--auto-connect state save <path>` saves from the selected live managed Firefox session. `--state <path> <command>` preloads the saved active-origin state before the requested browser command; follow it with `snapshot -i` if the page is noisy or still loading.

Use the packaged schema for autocomplete when creating project configs:

```json
{
  "$schema": "./node_modules/pire-browser/pire-browser.schema.json",
  "json": true
}
```

Use MCP when the agent host prefers typed tools:

```bash
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools all
```

Use the smallest MCP profile that fits the task. `core` is the default
inspect-before-act workflow: open, snapshot, semantic find, interact, typed get/check,
typed waits, back/forward/reload, SPA pushstate, init scripts, screenshot/PDF/diff
evidence, eval, status, confirmation follow-up, basic tabs, profile discovery,
close, and skill guidance. Add comma-separated profiles only when needed:
`network` for request diagnostics/routes/HAR, `state` for cookies/storage/auth
and state files including typed clipboard tools, `debug` for lower-level launch, explicit install/repair,
user-requested package upgrade, typed batch, doctor/activity diagnostics, console/errors/dialog/highlight/trace/profiler/record/stream/vitals,
`tabs` for tab/frame/window controls, and `mobile` for viewport/device/geo/media/mouse
helpers including click-equivalent `pire_browser_tap` and touch-direction page-scroll `pire_browser_swipe`. `react` exposes best-effort typed React Fiber tools
(`pire_browser_react_tree`, `pire_browser_react_inspect`, `pire_browser_react_renders_start`, `pire_browser_react_renders_stop`, `pire_browser_react_suspense`) plus vitals. Use `all`
only when the host can tolerate the full tool surface. The
`pire_browser_tools_profiles` MCP tool returns this profile list in-band.
The MCP server defaults to protocol `2025-11-25` and accepts older supported
client protocol versions during initialization. Tool discovery is paginated for
large profiles. Tool annotations mark local maintenance/context tools such as
install, upgrade, status, sessions, profiles, and skills as non-open-world so
hosts can show clearer approval prompts.

For MCP guardrails and launch context, prefer typed common fields over
`extraArgs`: `statePath`, `allowFileAccess`, `allowedDomains`,
`noAllowedDomains`, `actionPolicy`, `confirmActions`, `confirmInteractive`,
`contentBoundaries`, `maxOutput`, `proxy`, `proxyBypass`, and
`executablePath`, `downloadPath`. Use typed `pire_browser_open.headers` and
`pire_browser_open.initScriptPaths` when a navigation needs one-shot request
headers or pre-navigation init scripts. Prefer `pire_browser_open` for normal
launch/navigation; use `pire_browser_tap` only when an agent-browser-style tap
recipe means click-equivalent page interaction, and `pire_browser_swipe` only
when a mobile-style recipe means touch-direction page scroll. Add the `debug` profile and use `pire_browser_launch` only
for lower-level launch diagnostics. Use debug-profile
`pire_browser_stream_enable`, `pire_browser_stream_status`, and
`pire_browser_stream_disable` when the user wants a dashboard-backed live
preview service; it is HTTP polling, not full WebSocket frame streaming. Use
debug-profile `pire_browser_install`
only when the user wants explicit native-host setup or repair, and
`pire_browser_upgrade` only when the user wants package update. Use
debug-profile `pire_browser_batch` only for short command sequences where later
steps do not depend on parsing intermediate output.

## Snapshot Options

```bash
pire-browser snapshot -i
pire-browser snapshot -i -c
pire-browser snapshot -i -C
pire-browser snapshot -d 3
pire-browser snapshot -i -c -C -d 5
pire-browser snapshot -i -u
pire-browser snapshot -s "#main"
pire-browser snapshot --selector "#main"
```

Use `-c`/`--compact` on noisy pages. Use `-C`/`--cursor-interactive` when custom clickable `div`s, cards, menu rows, or cursor-pointer controls are missing from the default snapshot. Use `-d <n>`/`--depth <n>` to limit depth on complex pages. Use `-u`/`--urls` when choosing among links. Use `-s <selector>` or `--selector <selector>` to scope inspection to one area. If a ref is stale or a page changes, run `snapshot -i` again.

## Iframes

Snapshots inspect iframe content when Firefox can reach it. Refs inside iframes
carry frame context, so direct actions usually work without switching first:

```bash
pire-browser snapshot -i
pire-browser fill @e3 "value"   # @e3 may be inside an iframe
pire-browser click @e4
```

Use `frame <ref|selector|name|url>` only when you want scoped snapshots or selector-based actions inside one iframe:

```bash
pire-browser frame @e2
pire-browser snapshot -i
pire-browser fill '#card-number' "4111111111111111"
pire-browser frame main
```

After `frame @e2`, snapshots and selector-based actions are scoped to that iframe. `frame payment-frame` and `frame https://checkout.example/frame` are also supported when a frame name/id/title/label or URL is clearer than a ref. Use `frame main` before returning to outer-page selectors. When using MCP, prefer the agent-browser-style `pire_browser_frame_switch`; `pire_browser_frame_select` remains available for compatibility. Re-run `snapshot -i` after each frame switch and use the fresh refs from the new context.

## Setup And Diagnostics

- `pire-browser install` registers the platform native messaging host.
- `pire-browser install --with-deps` is the agent-browser-style first-run helper: it uses installed Firefox when available, can install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing, and gives non-Snap/non-Flatpak guidance on Linux.
- `pire-browser setup` is the lower-level setup command.
- `--firefox-path` and `PIRE_BROWSER_FIREFOX_PATH` may point to the Firefox executable, a directory containing it, or `/Applications/Firefox.app` on macOS. If discovery fails, follow the platform repair command in the error output.
- `pire-browser upgrade` checks npm and updates global npm or Pi-managed installs to the latest package when no managed Firefox session is active. Local project installs print the exact project-local `npm install` command. Background auto-update and lower-level `update apply` stay patch-only.
- `pire-browser status` reports live session and policy state without fixing anything.
- `pire-browser doctor` and `pire-browser install-status` give read-only install diagnostics.
- `pire-browser doctor --json` and `pire-browser install-status --json` include `nextActions`; follow those concrete repair commands before guessing.
- `pire-browser doctor --fix` explicitly reruns native host setup and verifies status; use it when the user wants repair, not for observation. `doctor --fix --with-deps` includes the same dependency behavior as install.
- In MCP, use debug-profile `pire_browser_install` for explicit native-host setup or repair. Pass `withDeps: true` only when following an agent-browser-style install recipe or the user asks about dependencies; on Windows/macOS it may install Firefox when missing, while Linux stays guided/manual. Use `pire_browser_upgrade` for user-requested package update; keep `pire_browser_status` and plain `pire_browser_doctor` observational.
- Browser commands that need auto-launch may run lazy setup when native host registration is missing or mismatched.
- If `open` reports a recoverable page-readiness warning, continue with `pire-browser snapshot -i`.
- If Pi reports a duplicate `pire-browser` tool from `npm:pire-browser` and an older GitHub, local-checkout, or legacy shim install immediately after `pi install npm:pire-browser`, wait a moment and rerun `pi`; if it remains, remove the older source shown in Pi's error and then run `pi install npm:pire-browser`.
- If an installed command reports a missing optional native package, reinstall with optional dependencies enabled.

## Safety Rules

- Use Firefox automation through `pire-browser`; do not silently switch browsers.
- Reinspect after navigation, reloads, DOM changes, dialogs, downloads, uploads, or failed actions.
- Treat refs as short lived. Never reuse refs from older snapshots.
- If output returns `confirm <id>`, ask the user before running it.
- Stop and report policy blocks instead of bypassing them.
- Do not claim success until command output, a fresh snapshot, or a file/status check confirms it.

## Reference

```bash
pire-browser --help
pire-browser open --help
pire-browser read --help
pire-browser snapshot --help
pire-browser upgrade --help
pire-browser update --help
pire-browser skills --help
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools all
pire-browser skills list
pire-browser skills cat core
pire-browser skills get core
pire-browser skills get --all
pire-browser skills path core
```

Use `--json` when another tool or script needs structured output.

For local skill development, `PIRE_BROWSER_SKILLS_DIR` or the agent-browser-compatible `AGENT_BROWSER_SKILLS_DIR` can point to a directory of `<name>/SKILL.md` files.
