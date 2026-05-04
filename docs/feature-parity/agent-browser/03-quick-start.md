# Quick Start

Source: https://agent-browser.dev/quick-start

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Core workflow

- [F] `agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Claude feedback: Mark [P] until auto-launch on missing session is added (see 01-introduction notes). Otherwise this works after `pire-browser launch`.
- [F] `agent-browser snapshot -i`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [F]. `-i` flag is honored; output format matches.
- [F] `agent-browser click @e2`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Claude feedback: Agree [F] for clicking visible refs. Note: `--new-tab` modifier not implemented.

## Common commands

- [F] `agent-browser snapshot -i` - Get interactive elements with refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Duplicate of earlier item — agree [F].
- [F] `agent-browser click @e2` - Click by ref
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Claude feedback: Duplicate — agree [F].
- [F] `agent-browser fill @e3 "test@example.com"` - Fill input by ref
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
  - Claude feedback: Agree [F]. content.ts:fillLocator handles input/textarea/select/contenteditable. Uses `setNativeValue` with the prototype's value setter so React/Vue controlled components see the change. Caveat: chains `input` + `change` events but skips intermediate keystroke events (`keydown`/`keyup`), which some React handlers (e.g., debounced search) may rely on. agent-browser's `type` does keystroke events; we only have `fill` which sets value directly. Add a separate `type` command that loops `pressKey` for true keystroke fidelity.
- [ ] `agent-browser get text @e1` - Get text content
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [N] currently — not implemented. Easy add: extend background.ts switch with `get`, content.ts handler that resolves the locator and returns `{text, value, html, attribute}` based on a sub-target. ~50 LOC. Reasonable [P] target after impl: text/value/attr easy, full innerHTML may be huge (truncate or reject above limit).
- [ ] `agent-browser screenshot` - Save to temp directory
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Suggest [P]. Today screenshot REQUIRES a path (background.ts: "screenshot requires <path>"). Make it optional: when omitted, write to `data_dir/screenshots/<timestamp>.png` and print the path. ~10 LOC change.
- [F] `agent-browser screenshot page.png` - Save to specific path
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Agree [F] for visible-tab capture. Full-page (scrolling) and element-only screenshots are not supported.
- [P] `agent-browser close`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [P]. Today calls `window.close()` from background which Firefox blocks. Should also kill the launcher PID. See 01-introduction notes.

## Traditional selectors

- [ ] `agent-browser click "#submit"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Claude feedback: Suggest [N] currently. Today only `@ref` is accepted; CSS selector syntax is rejected with "target must be a ref". Reasonably [P] to add: detect `#`/`.`/`[`/`element-name` prefix and route through a new `css` locator type. Content.ts already uses `document.querySelector` for `wait_selector`. Add `{kind: "css", selector}` to Locator union (~30 LOC).
- [ ] `agent-browser fill "#email" "test@example.com"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
  - Claude feedback: Same as above — depends on adding a CSS locator kind. Once that's in, `fill` accepts it for free since fillLocator just wants an Element.
- [F] `agent-browser find role button click --name "Submit"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [F]. `parseFind` accepts `role <role> --name <name> click`, then `actOnFind` routes to clickLocator. Tested in `find` -> `actOnFind` flow.

## Headed mode

- [ ] `agent-browser open example.com --headed`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Claude feedback: Suggest [F]. We're effectively *always* headed — web-ext launches Firefox visibly. Document `--headed` as a no-op alias for compatibility; reject `--headless` with a clear "headless not supported with the WebExtension architecture" error. (To get headless we'd need Firefox `--headless` flag plus an adjusted manifest, but the extension still loads — should test, may [P] this.)

## Wait for content

- [ ] `agent-browser wait @e1` - Wait for element
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use fixtures with delayed DOM insertion, delayed text, URL changes, load events, hidden states, and downloads; assert timeout and success cases.
  - Claude feedback: Suggest [N] currently. `wait` today supports only `--selector <css>`, `--load`, or a default 1s sleep. Add ref-target support: take `@eN`, look up its locator, and resolve in a MutationObserver loop until match. ~30 LOC in content.ts (parallel to `waitForSelector`).
- [P] `agent-browser wait --load networkidle` - Wait for network idle
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use fixtures with delayed DOM insertion, delayed text, URL changes, load events, hidden states, and downloads; assert timeout and success cases.
  - Claude feedback: Disagree, mark [N] currently. Today `--load` only waits for `tab.status === "complete"` (page load event), not network idle. WebExtensions can listen to `browser.webRequest.onBeforeRequest`/`onCompleted` to track in-flight requests in the background — implement a `--load networkidle` mode that returns when no requests have started in N ms. Mid-complexity (~100 LOC, plus webRequest permission already in manifest).
- [ ] `agent-browser wait --url "**/dashboard"` - Wait for URL pattern
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Claude feedback: Suggest [N] currently. Add a wait mode that listens to `browser.tabs.onUpdated` for the target tab and matches a glob/regex against `changeInfo.url`. ~30 LOC in background.ts. Use `micromatch`-style globbing or simple regex-from-glob.
- [P] `agent-browser wait 2000` - Wait milliseconds
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use fixtures with delayed DOM insertion, delayed text, URL changes, load events, hidden states, and downloads; assert timeout and success cases.
  - Claude feedback: Mark [P]. Today `wait` with no args sleeps `min(timeout, 1000)`. To match agent-browser: `wait <ms>` with a positional integer. Tweak parser in `waitCommand` to accept `Number(args[0])` when not a flag. Trivial.

## Command chaining

- [ ] `agent-browser open example.com && agent-browser wait --load networkidle && agent-browser snapshot -i`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Claude feedback: This is a shell chaining pattern, not a feature — works as soon as each individual command works. Blocked on `--load networkidle` being implemented. After that: [F].
- [ ] `agent-browser fill @e1 "user@example.com" && agent-browser fill @e2 "pass" && agent-browser click @e3`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
  - Claude feedback: Should be [F] today — each command works independently. Caveat: between calls the snapshot must still be fresh (refs persist across CLI calls in the extension's in-memory map until the next `snapshot`/`find` clears them). Validate with a fixture test.
- [ ] `agent-browser open example.com && agent-browser wait --load networkidle && agent-browser screenshot page.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Same — blocked on `--load networkidle`. Each individual piece works; chaining is shell-level.

## JSON output

- [F] `agent-browser snapshot --json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [F]. `--json` is parsed in `parse_cli_args` and `format_cli_result` returns pretty JSON. Snapshot's full FrameSnapshot[] payload is included.
- [ ] `agent-browser get text @e1 --json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
  - Claude feedback: Blocked on `get` command. Once implemented, `--json` flag is already wired up across all commands.
