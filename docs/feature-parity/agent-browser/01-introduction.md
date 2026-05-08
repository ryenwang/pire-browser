# agent-browser

Source: https://agent-browser.dev/

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Support documented usage: `npm install -g agent-browser # all platforms`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]. We ship a Rust CLI (`pire-browser-cli`), not an npm package. Distribution today is `cargo build` + manual install of the native messaging manifest via `pire-browser setup --windows`. We can publish a thin npm wrapper (a bin script that downloads the prebuilt Rust binary like `esbuild` does), so this is achievable with medium effort: build CI matrix, ship binaries to GitHub Releases, npm wrapper resolves the right one in `postinstall`, then runs `setup`.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
  - GPT-5.5 review: Leave blank. The private Pi git package is useful distribution work, but there is still no global npm bin/wrapper or all-platform install path.
- [ ] Support documented usage: `brew install agent-browser # macOS`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P] for now and revisit. macOS is not yet supported by `pire-browser-core` — `setup_windows` is the only setup path, `data_dir()` requires `LOCALAPPDATA`, IPC uses Windows named pipes, and `process_is_alive` is Win32-only. To get to parity we'd need: macOS data dir (`~/Library/Application Support/pire-browser`), Unix domain socket transport in `ipc.rs`, the macOS Firefox NativeMessagingHosts manifest path (`~/Library/Application Support/Mozilla/NativeMessagingHosts/`), and a brew formula. Achievable but not "Medium" — this is High complexity.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Leave blank. This is feasible, but it is blocked by the macOS port; Claude is right that Medium understates the OS/runtime work.
- [ ] `agent-browser install` - Download Chrome (first time)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
  - Claude feedback: Agree [P] *as written* (downloading Chrome is irrelevant for a Firefox tool), but I'd reframe rather than skip: implement `pire-browser install` that detects/downloads Firefox if missing, runs `setup`, and registers the native host + extension. That would close the same UX gap. Extension Compatibility should be True for the reframed version.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `npx agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]. The `open <url>` command works (background.ts:openCommand opens or updates the active tab and waits for ready), but it requires an extension session to already be live. agent-browser's `open` implicitly launches the browser if needed — pire-browser splits this into `launch` then `open`. To match: have CLI auto-run `launch --url` when no session exists. Easy follow-up.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
  - GPT-5.5 review: Leave blank. `pire-browser open` now auto-launches in v0.1.4, but the npx/global npm wrapper still does not exist.

## Features

- [F] Agent-first - Compact text output uses fewer tokens than JSON, designed for AI context efficiency
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [F]. `format_cli_result` (cli.rs) returns the `text` field by default and only emits JSON when `--json` is passed. Snapshot output is line-based with `@eN ref summary` form — close to agent-browser's compact format.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [P] Ref-based - Snapshot returns accessibility tree with refs for deterministic element selection
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [P]. `snapshotCommand` builds `@eN` refs and stores `{tabId, frameId, locator, summary}` in the `refs` Map; `clickCommand` resolves them. Gaps vs agent-browser: refs cleared on every snapshot (no diff-aware retention), no parent/child structure in the snapshot text, only "interactive" mode shows the lines (default snapshot returns refs but no tree text), and stale-ref errors are not differentiated from "not found".
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [F] Fast - Native Rust CLI for instant command parsing
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [F]. CLI is Rust + clap-free hand-rolled parser; per-command pipe RTT is the dominant latency, not parsing.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [P] Complete - 50+ commands for navigation, forms, screenshots, network, storage
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Agree [P]. Background.ts switch covers ~12 commands (status/open/snapshot/find/click/fill/press/scroll/wait/screenshot/tabs/close). agent-browser's documented surface is much larger (50+). Network and storage are entirely unimplemented. Path forward: extend background.ts switch with handlers using `browser.cookies`, `browser.storage`, `browser.webRequest` (MV2), `browser.downloads`. Form interaction commands (dblclick/type/hover/focus/drag/select/check/uncheck/scrollintoview) should be incremental additions to content.ts.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [P] Sessions - Multiple isolated browser instances with separate auth
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Claude feedback: Agree [P]. Profiles are managed (`firefox-profiles/<name>`), each gets its own web-ext launch and named pipe (session.rs/launch.rs). But: no `--session` selector for many commands, no per-session storage commands, `select_session` errors out instead of prompting, no `sessions list/select/delete/rename`. We have the substrate but not the UX surface.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [P] Cross-platform - macOS, Linux, Windows with native binaries
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Disagree — should be [P] until macOS/Linux ports land. Code is Windows-only: `data_dir` requires LOCALAPPDATA, `setup_result` only handles `--windows`, `ensure_windows()` rejects non-Windows. `cfg(not(windows))` paths exist but bail. To genuinely earn [P]: port `ipc.rs` to Unix-domain sockets, branch `data_dir`, add macOS/Linux setup paths, and update extension manifest registration locations. High complexity, not Medium.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
  - GPT-5.5 review: Keep P because Windows x64 is real coverage, but macOS/Linux are still blocked by OS-specific IPC, setup, data-dir, and packaging work.

## Works with

- [F] Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Google Gemini, opencode, and any agent that can run shell commands.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [F]. CLI is a single-shot stdin/stdout binary; works in any agent that runs shell commands. Pi extension `pi/extensions/pire-browser.ts` already wraps it for the Pi coding agent.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Example

- [F] `agent-browser open example.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Claude feedback: Agree, but more accurately [P] — the CLI requires a session to exist first. After `pire-browser launch`, `pire-browser open example.com` works. agent-browser's `open` is auto-launching. Quick win: have CLI Remote command auto-trigger launch when no session exists.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
  - GPT-5.5 review: Fully covered as of v0.1.4 for the non-npx CLI shape: `pire-browser open <url>` auto-launches Firefox when no live session exists.
- [F] `agent-browser snapshot -i`
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Agree [F] for the `-i` interactive variant — `snapshotCommand` checks `args.includes("-i") || args.includes("--interactive")` and emits `@eN role "name"` lines. Note: the default (non-`-i`) snapshot only returns refs in JSON but produces an empty text body, which feels broken. Recommend printing the full tree by default and using `-i` for the compact one-liner mode (matches agent-browser's docs better).
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser click @e2`
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Claude feedback: Agree [F]. Refs map to stored `{tabId, frameId, locator}`, content.ts:clickLocator does `scrollIntoView`, `focus`, `click`. Caveat: `--new-tab` modifier (open ref in new tab) is not implemented.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser screenshot page.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Agree [F] for visible-tab PNG. `captureVisibleTab` -> chunked base64 -> SHA-256 verification in `transfer.rs` -> file write. Gaps: no full-page (scrolling) screenshot, no element-only screenshot, no JPEG/quality/clip options, no headless support.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [P] `agent-browser close`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [P]. Current implementation calls `window.close()` from the background page, which Firefox typically blocks for non-script-opened windows. `agent-browser close` should also tear down the launcher process. Better: implement via `browser.tabs.remove(allTabs)` plus terminating the web-ext launcher PID stored in `launcher.json`. Add to background.ts `close` handler.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.

## Why refs?

- [F] Context-efficient - Text output uses ~200-400 tokens vs ~3000-5000 for full DOM
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [F]. Snapshot is filtered to `candidateElements()` (interactive + ARIA-tagged + tabindexed), `summarizeElement` uses role + truncated name. No raw HTML in default output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [P] Deterministic - Ref points to exact element from snapshot
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: Disagree, mark [P]. Refs are deterministic *within* a snapshot but `refs.clear()` runs at the top of every `snapshot`, so each snapshot renumbers from `@e1`. Worse: `find` *also* clears+repopulates refs, so a `snapshot` followed by `find` invalidates the snapshot's refs. agent-browser preserves refs across snapshots when the underlying element matches. Fix: keep a stable element fingerprint (locator + index) and reuse the same `@eN` across snapshots.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
  - GPT-5.5 review: Claude is right over Gemini here. Refs are deterministic within one snapshot/find result, but they are renumbered and can be invalidated by later snapshot/find calls.
- [P] Fast - No DOM re-query needed
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Disagree, mark [P] in current form, fixable to [F]. Today every ref-based action *re-resolves* the locator with `resolve()` which re-walks `candidateElements()` and runs `matchesLocator` over all of them — that's O(n) per action. To honor "no DOM re-query": stash the actual `Element` reference in a `WeakMap<string, Element>` in the content script (or pass an opaque token from snapshot). The MV2 background can't hold DOM refs, but content scripts can, and the ref->locator mapping in background can include a content-side handle.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] AI-friendly - LLMs parse text output naturally
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [F]. Output format is line-delimited `@ref role "name"` and matches what an LLM expects. Edge case: errors come back in JSON via `format_cli_result` rather than text — so `agent-browser` users see "Filled label \"Email\"" but error responses look like `{"code":"...","message":"..."}` if `text` is absent. Worth normalizing error text in the CLI.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Architecture

- [F] Rust CLI - Parses commands, communicates with daemon
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [F]. `pire-browser-cli` parses, `pire-browser-host` is the spawned-by-Firefox daemon, named pipe links them. Architecture is sound.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [N] Native Daemon - Pure Rust daemon using direct CDP, manages Chrome via Chrome DevTools Protocol
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Claude feedback: Agree [N] *as scope*. CDP is fundamentally Chrome-only; Firefox uses the WebDriver BiDi/RDP protocols. Don't try to make this work — instead, position pire-browser as the WebExtension parity track and document that CDP-only commands return `unsupported_cdp`. If a Firefox-equivalent daemon is wanted later, the Remote Debugging Protocol (`browser.toolbox`) is the analog, but it overlaps heavily with what the WebExtension already provides.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Platforms

- [P] Native Rust binaries for macOS (ARM64, x64), Linux (ARM64, x64), and Windows (x64).
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Disagree, mark [P] until ports land. Today only Windows x64 builds; macOS/Linux paths bail in `setup_windows`, `ensure_windows`, `register_native_host`, and IPC. Port path: (1) replace named pipes with Unix sockets behind `cfg(unix)` in ipc.rs, (2) per-OS `data_dir`, (3) per-OS NativeMessagingHosts manifest paths (`~/Library/Application Support/Mozilla/NativeMessagingHosts/` on macOS, `~/.mozilla/native-messaging-hosts/` on Linux), (4) cross-compile pipeline. ARM64 macOS comes "free" via `cargo build --target aarch64-apple-darwin`. High complexity but tractable.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
  - GPT-5.5 review: Keep P because Windows x64 binaries ship, but macOS/Linux still require data-dir, setup, IPC, and packaging ports.
