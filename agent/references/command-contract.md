# Command Contract

`pire-browser` commands are the source of truth for browser state. Prefer `--json` when another program will consume the result.

## JSON Envelope

Successful JSON output follows:

```json
{"success":true,"data":{}}
```

Skill commands use:

```json
{"success":true,"data":{"skills":[]}}
```

```json
{"success":true,"data":{"skill":{"name":"core","description":"","content":""}}}
```

## Local Commands

- `pire-browser help`
- `pire-browser --version`
- `pire-browser version --json`
- `pire-browser status`
- `pire-browser doctor`
- `pire-browser setup`
- `pire-browser install --with-deps`
- `pire-browser upgrade`
- `pire-browser update check`
- `pire-browser update apply`
- `pire-browser update configure --mode off|notify|patch`
- `pire-browser pi conflicts`
- `pire-browser pi repair`
- `pire-browser stream enable`
- `pire-browser stream status`
- `pire-browser stream disable`
- `pire-browser skills list`
- `pire-browser skills get core`
- `pire-browser skills cat core`
- `pire-browser profiles import <firefox-profile-dir> --name <managed-name>`

## Pi Repair Exit Codes

- `pire-browser pi conflicts` exits `0` when inspection completes, even if conflicts are found.
- `pire-browser pi repair` exits `0` for successful repair, no-op, dry-run, missing npm source, and advisory-scope conflicts.
- Nonzero exits are reserved for invalid arguments, explicit settings read/parse errors, settings write failures, or required quarantine failures.
- Automation must inspect `data.remainingConflicts`, each target `reason`, and `nextActions` to decide whether the install is fully resolved.
- If the optional native platform package is missing, launcher-served `install`, `setup`, `doctor --json`, and `install-status --json` exit nonzero with `error.code = "native_binary_unavailable"` and include repair guidance or `data.nextActions` with the concrete `--include=optional` reinstall command.

## Browser Commands

Browser commands may auto-launch a managed Firefox session when safe. Read the returned output before deciding the next step.

- Use `pire-browser open` with no URL to launch or reuse a managed Firefox session before staging state, cookies, routes, or init scripts; then use `navigate <url>` for the first destination.
- Use `pire-browser setcontent <html>` only for small active-page fixtures or repros. It replaces the active page document HTML, is gated as `eval`, and should be followed by `snapshot -i` before interaction. It is Firefox WebExtension document replacement, not CDP `Page.setDocumentContent`.
- Use `pire-browser vitals [url]` for best-effort page performance diagnostics: TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState, and captured hydration warnings.
- If `vitals` reports unavailable metrics, treat that as a Firefox/WebExtension API limitation instead of inventing estimates.
- Use `pire-browser trace start`, `trace status`, and `trace stop [output.json]` for a Firefox QA evidence bundle with console, page-error, network/HAR metadata, vitals, compact snapshot, and screenshot evidence. Do not describe it as a Chrome DevTools performance trace or CPU profile.
- Use `pire-browser profiler start`, `profiler status`, and `profiler stop [output.json]` for Chrome Trace Event-shaped timing evidence from Firefox Performance Timeline entries. Do not describe it as Chrome DevTools CPU sampling or a full renderer timeline.
- Use `pire-browser record start [output-dir] [url]`, `record status`, `record restart [output-dir] [url]`, and `record stop [output-dir]` for bounded visible-viewport PNG frames plus `recording.json`. This is screenshot-sequence QA evidence, not native WebM video or Chrome DevTools screencast output.
- Use `pire-browser stream enable`, `stream status`, and `stream disable` for the dashboard-backed WebSocket screenshot stream lifecycle. It reports `transport: "dashboard-websocket-screenshot"`, `webSocketStreaming: true`, `remoteInput: true`, and `webSocketUrl` when enabled. Describe it as screenshot-frame WebSocket streaming, not native WebM video or Chrome DevTools screencast output.
- Use `pire-browser open --enable react-devtools <url>`, `pire-browser react tree`, `pire-browser react inspect <fiberId|target>`, `pire-browser react renders start/stop`, and `pire-browser react suspense --only-dynamic` for agent-browser-style React inspection. This is best-effort Firefox Fiber introspection and lightweight render recording; rerun `react tree` after route or DOM changes before reusing an `rN` id.
- Use `pire-browser snapshot -i -C` when custom clickable `div`s, menu rows, cards, or cursor-pointer controls are missing from the default accessibility-oriented snapshot.
- Use `pire-browser get title`, `get url`, `get text <target>`, `get attr <target> <attr>`, and `is visible|enabled|checked <target>` for targeted verification when you already know the page or element to inspect.
- Use `pire-browser eval -b <base64-utf8-js>` or pipe JavaScript to `pire-browser eval --stdin` when shell quoting would make an inline eval brittle. Prefer targeted `get`, `is`, `find`, and `snapshot -i` before custom JavaScript when they can answer the question.
- Use `pire-browser hover <target>`, `focus <target>`, `select <target> <value>`, `check <target>`, `uncheck <target>`, `scroll <direction> [pixels]`, and `scrollintoview <target>` as first-class interaction commands before falling back to JavaScript eval. `scrollinto <target>` is the short alias for `scrollintoview`.
- Use `pire-browser click <link-target> --new-tab` or `pire-browser click <link-target> --new` only when a link with an `href` should open in a new tab.
- Use `pire-browser tap <target>` only as a best-effort alias for `click <target>`. It is not native touch input or mobile browser emulation.
- Use `pire-browser swipe <direction> [pixels]` only as a best-effort mobile helper. It maps touch direction to page scroll (`swipe up` scrolls down), not native touch input.
- Use `pire-browser dblclick <target>` when the UI requires a double-click. Verify with a fresh snapshot or targeted `get`/`is` command afterward.
- Use `pire-browser keyboard type <text>`, `keyboard inserttext <text>`, `keydown <key>`, and `keyup <key>` only at the current page focus. Click or focus the intended control first; use `type <target> <text>` or `fill <target> <text>` when you have a selector/ref.
- Use `pire-browser wait --fn <expression>` for short, side-effect-free page-world readiness predicates such as `window.appReady === true`; re-run `snapshot -i` before acting on refs after the wait.
- Use `pire-browser device "iPhone 14"` or `pire-browser set viewport <w> <h>` before responsive QA screenshots. `set device <name>` remains a compatibility spelling. Device presets are viewport-only best effort on Firefox.
- Screenshots hide native scrollbars by default for stable visual evidence. Use `pire-browser screenshot --hide-scrollbars false <path>` only when scrollbar visibility is part of the UI state being reported.
- Use `pire-browser set geo <lat> <lng>` for best-effort geolocation QA. It shims `navigator.geolocation` in managed pages but does not change Firefox's native permission prompt, OS location services, or IP-based location.
- Use `pire-browser set credentials <username> <password>` for HTTP Basic auth on the active origin. It is session-memory only and does not echo the password.
- Use `pire-browser auth save/login/list/show/delete` for selector-driven username/password form login profiles. Auth profiles live in a local AES-256-GCM encrypted auth vault; `list` and `show` never print passwords, and `login` decrypts locally before sending a one-shot profile payload to Firefox. Prefer `auth save --password-stdin` for shell use. For external vaults, add missing plugins with `pire-browser plugin add <package-or-repo>` or `plugin add <package-or-repo> --no-manifest --capability <name>...`, then use CLI `pire-browser plugin list` / `plugin show <name>` or MCP `pire_browser_plugin_list` / `pire_browser_plugin_show` to inspect configured agent-browser protocol plugins. Use `pire-browser auth login <name> --credential-provider <provider> --item <item-ref> --url <url>` or MCP `pire_browser_auth_login` with a configured `credential.read` plugin. Configured `launch.mutate` plugins run before local Firefox launches and can append `launch.args`, set `launch.userAgent`, or provide pre-navigation `launch.initScripts`; returned `launch.extensions` are reported as unsupported by the current Firefox backend. For command/custom plugins, use `pire-browser plugin run <name> <capability> --payload <json>` after confirming the plugin declares `command.run` and the requested capability. `browser.provider` is discoverable but not executed by this Firefox backend. Verify with a fresh snapshot, URL, or page state before reporting success.
- Use `pire-browser profiles import <firefox-profile-dir> --name <managed-name>` when the user already has Firefox login state that should become a managed pire-browser profile. This copies the source profile, never mutates it, and future source changes do not sync. If the command reports `profile_in_use`, ask the user to close Firefox before retrying.
- Use `pire-browser cookies set --curl <file-or-cookie-data> --domain <domain>` to import user-approved cookies from Copy-as-cURL, JSON, or a bare Cookie header before navigation. Treat payloads as secrets and verify after navigating.
- Use `pire-browser state save/load/list/show/inspect` for active-origin cookies and Web Storage. State files are plaintext by default; when `PIRE_BROWSER_ENCRYPTION_KEY` or `AGENT_BROWSER_ENCRYPTION_KEY` is set to a 64-character hex AES-256 key, saves write AES-256-GCM encrypted files and loads require the same key. Never print the key or cookie/storage values.
- Use `pire-browser set offline on|off` for best-effort offline/reconnect QA. It cancels future managed-tab requests, but does not control `navigator.onLine`, service worker cache behavior, DNS, or socket state.
- Use `pire-browser --proxy <url> open <url>` for Firefox-managed proxy QA. `--proxy-bypass <list>` maps to Firefox passthrough hosts; proxy credentials may come from the URL or `PIRE_BROWSER_PROXY_USERNAME` / `PIRE_BROWSER_PROXY_PASSWORD`. Do not claim TLS-ignore or OS-wide proxy behavior.
- Use `pire-browser --args "<firefox-args>" open <url>` for comma- or newline-separated Firefox launch arguments and `pire-browser --user-agent "<value>" open <url>` for a Firefox User-Agent override. These apply only when a command launches a new managed Firefox session; close/relaunch before relying on them for an existing profile. If the User-Agent matters, verify with `pire-browser eval "navigator.userAgent"` or app-visible behavior.
- Use `pire-browser dialog status`, `dialog accept [text]`, and `dialog dismiss` when command output includes `PAGE_DIALOG` warnings. Dialog control is page-shimmed best effort; re-run `snapshot -i` after handling a dialog. Use global `--no-auto-dialog` or `AGENT_BROWSER_NO_AUTO_DIALOG=1` only for agent-browser-style debugging with the shim disabled; native Firefox page dialogs may block until handled manually.
- Use `pire-browser pdf <path>` for portable visual evidence. The PDF is image-backed; do not claim selectable text or print-CSS fidelity.
