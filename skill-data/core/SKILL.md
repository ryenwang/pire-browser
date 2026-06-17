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
pire-browser wait '@e4'
pire-browser click '@e4'
pire-browser snapshot -i
```

Always inspect before page actions. Use refs only from the latest snapshot or find output. Quote refs in PowerShell, for example `click '@e4'`.

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

Batch short command sequences to reduce process churn:

```bash
pire-browser batch "open https://example.com" "snapshot -i" "screenshot result.png"
pire-browser batch --bail "open https://example.com" "click '@e1'" "screenshot result.png"
echo '[["open","https://example.com"],["snapshot","-i"],["click","@e1"]]' | pire-browser batch --json
```

Use `--bail` when later commands depend on earlier commands succeeding. With no inline commands, `batch` reads a JSON array from stdin; entries can be command strings or arrays of args.

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
pire-browser wait --load networkidle
```

Use `wait --load networkidle` after opening dynamic apps when fetch/XHR work must
settle before `snapshot -i`, `find`, or `screenshot`. Reinspect after the wait.

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
pire-browser console --clear
pire-browser errors --clear
```

Use `console` and `errors` after navigation, login, or failed actions when the
page looks stuck or broken. They report Firefox WebExtension-captured page-world
console messages and page errors from reachable frames. They do not expose raw
Chrome CDP console payloads, and they only capture records observed after the
pire-browser content script loads.

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
current recent request log directly. HAR output is metadata-only: bodies,
cookies, and raw request/response headers are not captured.

Set a responsive viewport before QA screenshots:

```bash
pire-browser set viewport 1280 720
pire-browser snapshot -i --compact
pire-browser screenshot desktop.png
pire-browser set viewport 390 844 3
pire-browser snapshot -i --compact
pire-browser screenshot mobile.png
```

`set viewport` is a Firefox best-effort path. It resizes the browser window to approximate the requested content viewport and returns measured `page.innerWidth`/`page.innerHeight`; verify those measurements before relying on pixel-perfect screenshots. Device, geo, offline, and credentials are not available on the Firefox backend yet.

```sh
pire-browser --color-scheme dark open https://example.com
pire-browser set media light
```

Use `--color-scheme dark|light|auto` before `open`, or `set media dark|light|auto` in a live session, when a page uses `prefers-color-scheme`.

Highlight the visual target before a QA screenshot:

```bash
pire-browser highlight '#submit'
pire-browser screenshot submit-highlight.png
pire-browser screenshot --full full-page.png
pire-browser screenshot --annotate numbered-elements.png
pire-browser screenshot --screenshot-dir screenshots
```

Use `highlight <target>` with the same refs, selectors, text, and semantic targets you would use for `click` or `fill`. Use `screenshot --full` when the report needs the whole page, and `screenshot --annotate` when numbered element evidence is more useful than a single target overlay. `screenshot` with no path writes a generated file under the local `pire-browser/screenshots` data directory and prints the resolved path. `--screenshot-dir <dir>` generates a timestamped filename inside that directory when no filename is provided. Relative screenshot paths resolve from the command's current working directory. These are visual QA helpers; styling is Firefox-specific, so do not rely on pixel-identical annotation behavior across browsers.

Authenticate a page or API route with request headers:

```bash
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser open https://api.example.com/dashboard
```

`open --headers` applies headers to the opened URL's origin for the current managed Firefox session. `set headers` applies headers to the active page's origin; use `set headers '{}'` to clear that origin. Header values are not echoed in command output. Reinspect after navigation and do not assume headers apply to other hosts or ports.

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
pire-browser auth save app --url https://example.com/login --username user --password pass --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
pire-browser auth login app
pire-browser snapshot -i --compact
```

This is a best-effort Firefox profile-local auth path, not a full encrypted auth vault. Do not report login success until a fresh snapshot, URL, or page state confirms it.

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

Use this for local HTML artifacts and fixtures. PDF local-file capture is not available in the current Firefox backend.

Capture screenshots:

```bash
pire-browser screenshot page.png
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
pire-browser mcp --tools all
```

The MCP core profile exposes open, snapshot, click, fill, type, press, wait,
screenshot, status, tabs, close, eval, and skill guidance. It invokes the same
installed CLI binary, so setup, policies, sessions, profiles, and Firefox
runtime behavior stay shared with normal `pire-browser` commands. `--tools all`
is accepted as an alias for all currently available MCP tools.

## Snapshot Options

```bash
pire-browser snapshot -i
pire-browser snapshot -i -c
pire-browser snapshot -d 3
pire-browser snapshot -i -c -d 5
pire-browser snapshot -i -u
pire-browser snapshot -s "#main"
```

Use `-c`/`--compact` on noisy pages. Use `-d <n>`/`--depth <n>` to limit depth on complex pages. Use `-u`/`--urls` when choosing among links. Use `-s <selector>` to scope inspection to one area. If a ref is stale or a page changes, run `snapshot -i` again.

## Iframes

If a snapshot shows an iframe ref, select it before working inside that frame:

```bash
pire-browser frame @e2
pire-browser snapshot -i
pire-browser fill @e3 "value"
pire-browser click @e4
pire-browser frame main
```

After `frame @e2`, snapshots and selector-based actions are scoped to that iframe. Use `frame main` before returning to controls outside the iframe. Re-run `snapshot -i` after each frame switch and use the fresh refs from the new context.

## Setup And Diagnostics

- `pire-browser install` registers the platform native messaging host.
- `pire-browser setup` is the lower-level setup command.
- `pire-browser status` reports install and session state without fixing anything.
- `pire-browser doctor` gives read-only diagnostics.
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
pire-browser snapshot --help
pire-browser mcp --tools core
pire-browser mcp --tools all
pire-browser skills list
pire-browser skills cat core
pire-browser skills get core
pire-browser skills get --all
```

Use `--json` when another tool or script needs structured output.

For local skill development, `PIRE_BROWSER_SKILLS_DIR` can point to a directory of `<name>/SKILL.md` files.
