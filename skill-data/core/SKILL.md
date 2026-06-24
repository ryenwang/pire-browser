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
not need focused keyboard edges. Use `dblclick <target>` when the UI requires a
double-click:

```bash
pire-browser snapshot -i
pire-browser dblclick '<item-ref>'
pire-browser snapshot -i
```

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
```

Use `console`, `errors`, and `vitals` after navigation, login, or failed actions
when the page looks stuck or broken. `vitals` reports best-effort TTFB, FCP,
LCP, CLS, INP, DOMContentLoaded, load, readyState, and hydration-warning signals
from Firefox Performance APIs. Unavailable Chrome-specific metrics are reported
as unavailable. Console and error commands report Firefox WebExtension-captured
page-world messages and page errors from reachable frames. They do not expose raw
Chrome CDP console payloads, and they only capture records observed after the
pire-browser content script loads.

Start the local dashboard when a human or agent needs a quick view of setup,
live sessions, managed profiles, and recent command activity:

```bash
pire-browser dashboard start
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json
```

The dashboard is a foreground localhost server; stop it with `Ctrl+C`. It shows
install health, live sessions, managed profiles, a bounded redacted command
activity feed, and capability notes. For scripts, use:

```bash
pire-browser activity list --json
```

Activity shows what commands ran; it does not prove page success. It does not
provide live viewport WebSocket streaming or video recording yet, so keep using
`snapshot -i`, `screenshot`, `status`, and `doctor` as the primary
machine-readable evidence path.

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
current recent request log directly. HAR output is metadata-only: redacted
request/response headers may be included, but bodies, cookies, and raw header
secrets are not captured.

Set a responsive viewport before QA screenshots:

```bash
pire-browser set viewport 1280 720
pire-browser snapshot -i --compact
pire-browser screenshot desktop.png
pire-browser set device "iPhone 14"
pire-browser set geo 37.7749 -122.4194
pire-browser snapshot -i --compact
pire-browser screenshot mobile.png
```

`set viewport`, `set device`, and `set geo` are Firefox best-effort paths. Viewport and device settings resize the browser window to approximate the requested content viewport and return measured `page.innerWidth`/`page.innerHeight`; verify those measurements before relying on pixel-perfect screenshots. `set device` reports a preset User-Agent/touch/scale profile but does not enforce mobile User-Agent, touch input, browser chrome, or exact deviceScaleFactor. `set geo` installs a page-level `navigator.geolocation` shim for managed Firefox pages; it does not change Firefox's native permission prompt, OS location services, IP-based location, or browser chrome state.

When using MCP, prefer the typed setting tools (`pire_browser_set_viewport`,
`pire_browser_set_device`, `pire_browser_set_geo`, `pire_browser_set_headers`,
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
pire-browser drag '<source-ref>' '<target-ref>'
```

Mouse and drag commands are Firefox WebExtension paths. They dispatch page events, not native OS cursor movement or browser-chrome drag state, so verify with page state afterwards.

Save and reuse a simple login form profile:

```bash
echo "pass" | pire-browser auth save app --url https://example.com/login --username user --password-stdin --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
pire-browser auth login app
pire-browser snapshot -i --compact
```

Prefer `--password-stdin` over `--password` when saving credentials so the password is not placed in shell history. When using MCP, only call `pire_browser_auth_save` with user-approved credentials; use `pire_browser_auth_login`, then verify with a fresh snapshot, URL, or page state before reporting success. This is a best-effort Firefox profile-local auth path, not a full encrypted auth vault or credential-provider plugin flow.

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

Config files use camelCase keys. Useful defaults include `json`, `profile`, `sessionName`, `allowedDomains`, `confirmActions`, `confirmInteractive`, `allowFileAccess`, `headed`, `headless`, `colorScheme`, `maxOutput`, and `contentBoundaries`. CLI flags override config defaults. Unknown keys are ignored.

List and target managed profiles or live sessions:

```bash
pire-browser profiles --json
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

State files are plaintext and contain active-origin cookies and Web Storage. `state show` is metadata-only and does not print cookie or storage values. Bare state names resolve inside `.pire-state`; explicit paths remain supported for save/load/show/rename.
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
inspect-before-act workflow: open, snapshot, semantic find, interact, get/check,
wait, back/forward/reload, SPA pushstate, init scripts, screenshot/PDF/diff
evidence, eval, status, confirmation follow-up, basic tabs, profile discovery,
close, and skill guidance. Add comma-separated profiles only when needed:
`network` for request diagnostics/routes/HAR, `state` for cookies/storage/auth
and state files, `debug` for lower-level launch, typed batch, doctor/activity
diagnostics, console/errors/dialog/highlight/vitals, `tabs` for
tab/frame/window controls, and `mobile` for viewport/device/geo/media/mouse
helpers. `react` is accepted for compatibility but currently has no React
DevTools introspection tools. Use `all` only when the host can tolerate the full
tool surface. The `pire_browser_tools_profiles` MCP tool returns this profile
list in-band.

For MCP guardrails and launch context, prefer typed common fields over
`extraArgs`: `statePath`, `allowFileAccess`, `allowedDomains`,
`noAllowedDomains`, `actionPolicy`, `confirmActions`, `confirmInteractive`,
`contentBoundaries`, `maxOutput`, `proxy`, `proxyBypass`, and
`executablePath`. Use typed `pire_browser_open.headers` and
`pire_browser_open.initScriptPaths` when a navigation needs one-shot request
headers or pre-navigation init scripts. Prefer `pire_browser_open` for normal
launch/navigation; add the `debug` profile and use `pire_browser_launch` only
for lower-level launch diagnostics. Use debug-profile `pire_browser_batch` only
for short command sequences where later steps do not depend on parsing
intermediate output.

## Snapshot Options

```bash
pire-browser snapshot -i
pire-browser snapshot -i -c
pire-browser snapshot -d 3
pire-browser snapshot -i -c -d 5
pire-browser snapshot -i -u
pire-browser snapshot -s "#main"
pire-browser snapshot --selector "#main"
```

Use `-c`/`--compact` on noisy pages. Use `-d <n>`/`--depth <n>` to limit depth on complex pages. Use `-u`/`--urls` when choosing among links. Use `-s <selector>` or `--selector <selector>` to scope inspection to one area. If a ref is stale or a page changes, run `snapshot -i` again.

## Iframes

If a snapshot shows an iframe ref, select it before working inside that frame:

```bash
pire-browser frame @e2
pire-browser snapshot -i
pire-browser fill @e3 "value"
pire-browser click @e4
pire-browser frame main
```

After `frame @e2`, snapshots and selector-based actions are scoped to that iframe. Use `frame main` before returning to controls outside the iframe. When using MCP, prefer `pire_browser_frame_select` to enter an iframe and `pire_browser_frame_main` before returning to outer-page controls. Re-run `snapshot -i` after each frame switch and use the fresh refs from the new context.

## Setup And Diagnostics

- `pire-browser install` registers the platform native messaging host.
- `pire-browser setup` is the lower-level setup command.
- `pire-browser upgrade` checks for the latest package and applies a safe update when the install method allows it.
- `pire-browser status` reports install and session state without fixing anything.
- `pire-browser doctor` gives read-only diagnostics.
- `pire-browser doctor --fix` explicitly reruns native host setup and verifies status; use it when the user wants repair, not for observation.
- Browser commands that need auto-launch may run lazy setup when native host registration is missing or mismatched.
- If `open` reports a recoverable page-readiness warning, continue with `pire-browser snapshot -i`.
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
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools all
pire-browser skills list
pire-browser skills cat core
pire-browser skills get core
pire-browser skills get --all
```

Use `--json` when another tool or script needs structured output.

For local skill development, `PIRE_BROWSER_SKILLS_DIR` can point to a directory of `<name>/SKILL.md` files.
