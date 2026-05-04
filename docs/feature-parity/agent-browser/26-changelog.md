# Changelog

Source: https://agent-browser.dev/changelog

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## v0.25.5 - Bug Fixes

- [N] Fixed --auto-connect CDP discovery preferring HTTP endpoint discovery over the DevToolsActivePort websocket path, which could fail on some setups. The CLI now reads the websocket path from DevToolsActivePort first and only falls back to HTTP discovery (#1218)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Fixed recording context viewport not inheriting the active viewport dimensions, causing recordings to use default resolution instead of the configured viewport (#1208)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a fixture that reports viewport, device hints, geolocation, media queries, locale, and timezone; assert values before and after settings commands.
- [ ] Fixed get box and get styles printing no data in text mode (#1231, #1233)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Fixed active page changing when closing or removing earlier tabs. The previously focused page is now preserved correctly (#1220)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.25.4 - New Features

- [ ] skills command - Added agent-browser skills command for discovering and installing agent skills, with built-in evaluation support for testing skills against live browser sessions (#1225, #1227)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## v0.25.4 - Bug Fixes

- [ ] Fixed custom viewport dimensions not being used in streaming frame metadata and image resolution (#1033)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a fixture that reports viewport, device hints, geolocation, media queries, locale, and timezone; assert values before and after settings commands.
- [ ] Fixed --ignore-https-errors not being re-applied to recording contexts, causing TLS errors during screen recordings (#1178)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed duplicate option numbering in the auth skill documentation (#1161)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.25.2 - Bug Fixes

- [ ] Fixed Chrome being killed after ~10s idle on Linux caused by PR_SET_PDEATHSIG tracking the blocking thread that spawned Chrome rather than the daemon process. When Tokio reaped the idle thread, the kernel sent SIGKILL to Chrome even though the daemon was still alive (#1157, #1173)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## v0.25.1 - Improvements

- [ ] Embedded dashboard - The observability dashboard is now bundled directly into the CLI binary using rust-embed, eliminating the need for dashboard install. The dashboard is available immediately after installing agent-browser (#1169)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## v0.25.0 - New Features

- [ ] AI chat command - Added chat command for AI-powered browser automation. Supports single-shot mode (chat "open google.com") and an interactive REPL. The AI agent can execute any agent-browser command via tool calls. Requires AI_GATEWAY_API_KEY. Configure the model with --model or AI_GATEWAY_MODEL (#1160, #1163)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Dashboard AI chat - The observability dashboard now includes a built-in AI chat interface for conversational browser control alongside live session views (#1160, #1163)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] snapshot --urls - New -u/--urls flag to include href URLs for link elements in snapshot output, giving agents direct access to link targets without additional queries (#1160)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Batch argument mode - The batch command now accepts commands as inline arguments in addition to reading from stdin, simplifying single-invocation multi-command workflows (#1160)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.25.0 - Bug Fixes

- [P] Fixed getByRole matching wrong elements (e.g. <link> stylesheet elements instead of <a> anchors) by rewriting the implementation to use the CDP accessibility tree with ref-based element resolution instead of CSS selectors (#1145)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Fixed upload command not supporting accessibility tree refs (@eN) for file upload element selection (#1156)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Fixed AGENT_BROWSER_DEFAULT_TIMEOUT not being applied to wait commands. The environment variable now propagates to all wait variants (wait, wait --url, wait --text, wait --load, wait --fn, wait --download) (#1153)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
- [ ] Fixed dashboard download error handling with improved retry logic for more reliable dashboard installation (#1154)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## v0.24.1 - New Features

- [N] Chrome profile login state reuse - --profile <name> now resolves Chrome profile names (e.g. Default, Profile 1) and copies the profile to a temp directory to reuse login state, cookies, and extensions without modifying the original. Added profiles command to list available Chrome profiles with --json support (#1131)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## v0.24.1 - Bug Fixes

- [N] Fixed --ignore-https-errors not passing --ignore-certificate-errors as a Chrome launch flag, causing TLS errors like ERR_SSL_PROTOCOL_ERROR to be rejected at the network layer before CDP could intervene (#1132)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [N] Fixed orphaned Chrome processes on daemon exit by spawning Chrome in its own process group and killing the entire group on shutdown. On Linux, PR_SET_PDEATHSIG ensures Chrome is killed even if the daemon is OOM-killed (#1137)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] Fixed CDP attach hang on Chrome 144+ when connecting to real browser sessions. Targets paused waiting for the debugger after attach are now resumed with Runtime.runIfWaitingForDebugger (#1133)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Fixed stale daemon after upgrade silently reusing the old daemon process with broken CDP behavior. The daemon now writes a .version sidecar file and auto-restarts on version mismatch (#1134)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Fixed stale daemon/socket recovery where close --all failed to clean up zombie daemons and stale files. Unreachable daemons are now force-killed and orphaned socket/pid files are removed (#1136)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [P] Fixed idle timeout not being respected because the sleep future was recreated on every select loop iteration, preventing the deadline from being reached (#1110)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed browser not relaunching when launch options change (e.g. adding extensions to config.json) between consecutive launch commands (#996)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Fixed auto_launch() not honouring AGENT_BROWSER_PROVIDER for cloud providers, causing non-launch commands to fall back to local Chrome instead of connecting via the provider API (#1126)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed HAR capture missing API requests under heavy traffic by increasing the CDP broadcast buffer from 256 to 4096 events, reducing the drain interval from 500ms to 100ms, and enabling network tracking in cross-origin iframes (#1135)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.

## v0.23.4 - Bug Fixes

- [ ] Fixed daemon hang on Linux caused by a waitpid(-1) race condition in the SIGCHLD handler that stole exit statuses from Rust's Child handles, leaving the daemon in a broken state. Replaced the global signal handler with targeted crash detection via the existing drain interval (#1098)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.

## v0.23.3 - Bug Fixes

- [ ] Fixed drag and drop not working because mouseMoved events during the drag omitted the buttons bitmask, causing the browser to see event.buttons === 0 and never fire dragstart/dragover/drop (#1087)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a drag-and-drop fixture with dragstart/dragover/drop counters and payload capture; assert the target receives a drop event.

## v0.23.2 - New Features

- [N] Dashboard session creation - Sessions can now be created directly from the dashboard UI. A new session dialog provides a unified selector grid for local engines (Chrome, Lightpanda) and cloud providers (Browserbase, Browserless, Browser Use, Kernel) with async creation, loading state, and error display (#1092)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [ ] Dashboard provider icons - The session sidebar now shows the provider or engine icon for each session, making it easy to identify which backend a session is using (#1092)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## v0.23.2 - Bug Fixes

- [ ] Fixed Browser Use provider using an intermediate API call instead of connecting directly via WSS, which caused connection failures (#1092)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [N] Fixed Browserbase provider not sending an explicit JSON body and Content-Type header, causing session creation to fail (#1092)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [ ] Fixed provider navigation hanging because wait_for_lifecycle waited for page load events that remote providers may not emit. Navigation with --provider now automatically sets waitUntil=none (#1092)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [N] Fixed remote CDP connections timing out by increasing the CDP connect timeout from 10s to 25s for cloud providers (#1092)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed zombie daemon processes not being cleaned up when a provider connection fails during session creation from the dashboard (#1092)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## v0.23.1 - New Features

- [N] Puppeteer browser cache fallback - Chrome discovery now searches ~/.cache/puppeteer/chrome/ (or PUPPETEER_CACHE_DIR) for Chrome binaries, so users with an existing Puppeteer installation can use agent-browser without a separate install step (#1088)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Console output improvements - console.log of objects now shows the actual object preview (e.g. {userId: "abc", count: 42}) instead of "Object". JSON output includes a raw args array for programmatic access (#1040)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.

## v0.23.1 - Bug Fixes

- [ ] Fixed same-document navigation (e.g. SPA hash routing) hanging forever because wait_for_lifecycle waited for a Page.loadEventFired that never fires on same-document navigations (#1059)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Fixed save_state only capturing cookies and localStorage for the current origin, silently dropping cross-domain data (e.g. SSO/CAS auth cookies). Now uses Network.getAllCookies and collects localStorage from all visited origins (#1064)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [N] Fixed externally opened tabs not appearing in tab list when using --cdp mode. Tabs opened by the user or another CDP client are now detected and tracked (#1042)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Fixed dashboard server not picking up installed files without a restart. dashboard install now takes effect immediately on a running server (#1066)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] Fixed Windows Chrome extraction failing because zip path normalization used forward slashes while the extraction code expected backslashes (#1088)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.23.0 - New Features

- [ ] Runtime stream management - Added stream enable, stream disable, and stream status commands to control WebSocket streaming at runtime. Streaming is now always enabled by default; AGENT_BROWSER_STREAM_PORT overrides the port instead of toggling the feature (#951)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
- [ ] Close all sessions - Added close --all flag to close every active browser session at once
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## v0.23.0 - Bug Fixes

- [N] Fixed Lightpanda engine compatibility (#1050)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [ ] Fixed Windows daemon TCP bind failing when Hyper-V reserves the port by falling back to an OS-assigned port and writing it to a .port file (#1041)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed Windows dashboard relay using Unix socket instead of TCP (#1038)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [F] Fixed radio/checkbox elements being dropped from compact snapshot tree because the ref= check required a leading [ that those elements lack (#1008)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a fixture with select, checkbox, and radio controls; assert value/checked state and change events after command execution.

## v0.22.3 - Bug Fixes

- [N] Re-apply download behavior on recording context - Fixed an issue where downloads were silently dropped in recording contexts because Browser.setDownloadBehavior set at launch only applied to the default context. The download behavior is now re-applied when a new recording context is created (#1019)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
- [N] Reap zombie Chrome process and fast-detect crash for auto-restart - Added a non-blocking process-exit check before attempting CDP connection checks. This prevents a 3-second CDP timeout when Chrome has already crashed or exited, enabling faster detection and auto-restart of the browser (#1023)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Route keyboard type through text input - Fixed keyboard type subaction to correctly route through the text input handler, and added support for an insertText subaction using Input.insertText (#1014)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] Handle --clear flag in console command - Fixed the console command to accept and process a clear parameter, allowing console event history to be cleared (#1015)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.22.2 - New Features

- [P] Dialog status command - Added dialog status command to check whether a JavaScript dialog is currently open (#999)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a fixture that opens alert/confirm/prompt/beforeunload dialogs; assert captured dialog metadata and configured accept/dismiss behavior.
- [P] Dialog warning field - Command responses now include a warning field when a JavaScript dialog is pending, indicating the dialog type and message (#999)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a fixture that opens alert/confirm/prompt/beforeunload dialogs; assert captured dialog metadata and configured accept/dismiss behavior.

## v0.22.2 - Improvements

- [ ] Standard proxy environment variables - The proxy setting now automatically falls back to standard environment variables (HTTP_PROXY, HTTPS_PROXY, ALL_PROXY, and their lowercase variants), with NO_PROXY/no_proxy respected for bypass rules (#1000)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Font packages for --with-deps - Installing with --with-deps now includes CJK and emoji font packages on Linux (Debian, RPM, and yum-based distros) to prevent missing glyphs when rendering international content (#1002)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.22.2 - Bug Fixes

- [ ] Fixed state show always failing with "Missing 'path' parameter" due to a mismatched JSON field name (#994)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Fixed console command returning only Done due to a JSON field name mismatch in the response (#986)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [N] Fixed browser-domain CDP events being dropped during downloads due to a sessionId mismatch (#998)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
- [N] Fixed proxy authentication by handling credentials via the CDP Fetch.authRequired event rather than passing them inline (#1000)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## v0.22.1 - Bug Fixes

- [ ] Fixed modifier key chords (e.g. Control+a, Shift+Enter, Control+Shift+a) not being handled correctly when using press. Modifier keys are now parsed and forwarded as CDP modifier bitmasks rather than treated as part of the key name (#980)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Fixed query parameters being dropped from --cdp HTTP URLs (e.g. http://host:9222?mode=Hello). Query strings are now preserved and forwarded to the remote CDP endpoint (#982)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.

## v0.22.0 - New Features

- [P] Cross-origin iframe support - Added support for snapshots and interactions within cross-origin iframes via Target.setAutoAttach (#949)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
- [ ] Network request detail and filtering - Added network request <requestId> command to view full request/response detail, and new filtering options for network requests including --type (e.g. xhr,fetch), --method (e.g. POST), and --status (e.g. 2xx, 400-499) (#935)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.

## v0.22.0 - Improvements

- [P] Snapshot usability - Reduced AI cognitive load by filtering semantic noise from snapshot output; cursor-interactive elements are now included by default, making the -C flag unnecessary (#968)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Upgrade command - Improved robustness of installation method detection in the upgrade command (#960)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Target tracking - Enhanced target tracking and page information handling for more reliable browser session management (#969)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## v0.22.0 - Bug Fixes

- [ ] Fixed viewport dimensions being reported incorrectly in streaming status messages and screencast (#952)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
- [ ] Fixed find command flags such as --exact and --name leaking into fill values when used with fill actions (#955)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed state commands incorrectly starting the daemon when no session_name is provided (#677, #964)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Fixed auto-connect triggering when the daemon is already running, preventing duplicate connections (#971)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Fixed Enter key press not working by adding a text field to keyDown events (#972)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed download command to properly handle absolute paths and correctly click target elements (#970)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.

## v0.22.0 - Breaking Changes

- [P] The -C / --cursor flag for snapshot is deprecated; cursor-interactive elements are now included by default and the flag has no additional effect (#968)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.21.3 - Bug Fixes

- [N] WebSocket keepalive for remote browsers - Added WebSocket Ping frames and TCP SO_KEEPALIVE to prevent CDP connections from being silently dropped by intermediate proxies during idle periods (#936)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
- [ ] XPath selector support - Fixed element resolution to correctly handle the xpath= selector prefix (#908)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## v0.21.2 - Bug Fixes

- [P] Deduplicate text content in snapshots - Fixed an issue where duplicate text content appeared in page snapshots (#909)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Native mouse drag state - Fixed incorrect raw native mouse drag state not being properly tracked across down, move, and up events (#872)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Chrome headless launch failures - Fixed browser launch failures caused by the --enable-unsafe-swiftshader flag in Chrome headless mode (#915)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Origin-scoped --headers persistence - Restored correct persistence of origin-scoped headers set via --headers across navigation commands (#894)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] Relative URLs in WebSocket domain filter - Fixed handling of relative URLs in the WebSocket domain filter script (#624)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.21.1 - New Features

- [ ] HAR 1.2 network capture - Added commands to capture and export network traffic in HAR 1.2 format, including accurate request/response timing, headers, body sizes, and resource types sourced from Chrome DevTools Protocol events (#864)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Built-in upgrade command - Added agent-browser upgrade to self-update the CLI; automatically detects your installation method (npm, Homebrew, or Cargo) and runs the appropriate update command (#898)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.21.0 - New Features

- [F] iframe support -- CLI interactions and snapshots now traverse into iframe content, enabling automation of cross-frame pages.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
- [ ] --idle-timeout flag -- Automatically shut down the daemon after a period of inactivity. Accepts human-friendly formats such as 10s, 3m, 1h, or raw milliseconds. Also available as AGENT_BROWSER_IDLE_TIMEOUT_MS.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Cursor-interactive elements in snapshots -- Cursor-interactive elements are now embedded directly into the snapshot tree for richer context.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Brave Browser auto-connect -- Auto-discovery of Brave Browser for CDP connections on macOS, Linux, and Windows.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] linux-musl (Alpine) builds -- Pre-built binaries for linux-musl targeting both x64 and arm64, enabling native support for Alpine Linux and other musl-based distributions.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] WebSocket fallback for CDP discovery -- When HTTP-based CDP endpoint discovery fails, the CLI now falls back to a WebSocket connection automatically.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.

## v0.21.0 - Improvements

- [ ] --full/-f refactored to command-level flag -- Moved from a global flag to a per-command flag for clearer scoping.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [N] Enhanced Chrome launch -- Added --user-data-dir support and configurable launch timeout for more reliable browser startup. Chrome now retries launching up to 3 times on transient startup failures.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Consecutive --auto-connect commands -- Multiple consecutive auto-connect commands no longer require a full browser relaunch; external connections are correctly identified and reused.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Batched CDP calls -- snapshot -C and screenshot --annotate now batch CDP calls instead of issuing sequential round-trips per element, preventing timeouts on high-latency WSS connections.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## v0.21.0 - Bug Fixes

- [N] Fixed remote CDP (WSS) snapshot and screenshot hangs by removing WebSocket message/frame size limits
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
- [ ] Fixed Material Design check/uncheck falling back to JS .click() for overlay-based controls
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed punctuation characters being dropped in the type command
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] Fixed WebSocket streaming by keeping the StreamServer instance alive
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
- [N] Filtered internal Chrome targets (chrome://, devtools://) from auto-connect discovery
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed snapshot --selector scoping to the matched element's subtree
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Fixed network idle detection returning prematurely for cached pages
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [N] Fixed daemon panic on broken stderr pipe during Chrome launch
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed broadcast channel lag being treated as stream closure
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed daemon liveness detection for PID namespace isolation (e.g. unshare)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] Fixed Ubuntu dependency install accidentally removing system packages
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.20.0 - Improvements

- [ ] Benchmarks -- Added benchmark suite for comparing native vs Node.js daemon performance across cold start, warm start, memory, and install size.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Chromium installer hardened -- Fixed zip path traversal vulnerability in Chrome for Testing installer.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.

## v0.20.0 - Bug Fixes

- [ ] Fixed --headed false flag not being respected in CLI
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed "not found" error pattern in to_ai_friendly_error incorrectly catching non-element errors
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed storage local key lookup parsing and text output
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a fixture that sets cookies, localStorage, sessionStorage, and IndexedDB; assert CLI export/import/clear behavior through JSON output.
- [N] Fixed Lightpanda engine launch with release binaries
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] Hardened Lightpanda startup timeouts
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## v0.19.0 - New Features

- [N] Browserless.io provider -- Added browserless.io as a browser provider, supported in both Node.js and native daemon paths. Connect to remote Browserless instances using the --provider browserless flag or AGENT_BROWSER_PROVIDER=browserless environment variable.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [ ] clipboard command -- Read from and write to the browser clipboard. Supports read, write, copy (simulates Ctrl+C), and paste (simulates Ctrl+V) operations.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use native-host clipboard helpers plus a paste-target fixture; assert read/write/copy/paste round trips without leaking stale clipboard data.
- [ ] Screenshot output configuration -- New global flags for persistent screenshot settings: --screenshot-dir, --screenshot-quality, and --screenshot-format. Also available as environment variables AGENT_BROWSER_SCREENSHOT_DIR, AGENT_BROWSER_SCREENSHOT_QUALITY, and AGENT_BROWSER_SCREENSHOT_FORMAT.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## v0.19.0 - Bug Fixes

- [ ] Fixed wait --text not working in native daemon path
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed BrowserManager.navigate() and package entry point
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
- [ ] Fixed extensions not being loaded from config.json
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Fixed scroll on page load
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed HTML retrieval by using browser.getLocator() for selector operations
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## v0.18.0 - New Features

- [N] inspect command -- Opens Chrome DevTools for the active page by launching a local proxy server that forwards the DevTools frontend to the browser's CDP WebSocket. Agent commands continue to work while DevTools is open.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [N] get cdp-url subcommand -- Retrieve the Chrome DevTools Protocol WebSocket URL for the active page, useful for connecting external debugging tools.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Screenshot annotate -- The --annotate flag overlays numbered labels on interactive elements in screenshots.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## v0.18.0 - Improvements

- [ ] KERNEL_API_KEY now optional -- External credential injection no longer requires KERNEL_API_KEY to be set, making it easier to use Kernel with pre-configured environments.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [N] Browserbase simplified -- Removed the BROWSERBASE_PROJECT_ID requirement, reducing setup friction for Browserbase users.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.

## v0.18.0 - Bug Fixes

- [N] Fixed Browserbase API using incorrect endpoint to release sessions
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [N] Fixed CDP connect paths using hardcoded 10s timeout instead of the configurable default timeout
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] Fixed lone Unicode surrogates causing errors by sanitizing with toWellFormed()
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Fixed CDP connection failure on IPv6-first systems
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Fixed recordings not inheriting the current viewport settings
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a fixture that reports viewport, device hints, geolocation, media queries, locale, and timezone; assert values before and after settings commands.

## v0.17.1 - Improvements

- [ ] Viewport scale factor -- Added support for device scale factor (retina display) in the viewport command via an optional scale parameter.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use a fixture that reports viewport, device hints, geolocation, media queries, locale, and timezone; assert values before and after settings commands.
- [ ] Webview target support -- Added webview target type support for better Electron application compatibility. The pages list now includes target type information.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.17.0 - New Features

- [N] Lightpanda browser engine support -- Added --engine <name> flag to select the browser engine (chrome by default, or lightpanda), implying --native mode. Configurable via AGENT_BROWSER_ENGINE environment variable.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [P] Dialog dismiss command -- Added support for dismiss subcommand in dialog command parsing.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a fixture that opens alert/confirm/prompt/beforeunload dialogs; assert captured dialog metadata and configured accept/dismiss behavior.

## v0.17.0 - Improvements

- [P] Daemon startup error reporting -- Daemon startup errors are now surfaced directly instead of showing an opaque timeout message.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] CDP port discovery -- Replaced hand-rolled HTTP client with reqwest for more reliable CDP port discovery.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Chrome extensions -- Extensions now load correctly by forcing headed mode when extensions are present.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [ ] Google Translate bar suppression -- Suppressed the Google Translate bar in native headless mode to avoid interference.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Auth cookie persistence -- Auth cookies are now persisted on browser close in native mode.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## v0.17.0 - Bug Fixes

- [ ] Fixed native auth login failing due to incompatible encryption format.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## v0.15.0 - New Features

- [ ] Authentication vault -- Store credentials locally (always AES-256-GCM encrypted) and reference them by name. The LLM never sees passwords. Commands: auth save, auth login, auth list, auth show, auth delete. Passwords can be piped via stdin (--password-stdin) to avoid shell history exposure.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Content boundary markers -- --content-boundaries wraps page-sourced output in structural delimiters with a per-process CSPRNG nonce, so LLMs can distinguish trusted tool output from untrusted page content. In --json mode, a _boundary object is injected with nonce and origin fields.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Domain allowlist -- --allowed-domains restricts navigation, sub-resource requests, WebSocket connections, and EventSource streams to trusted domains. Supports exact match and wildcard prefix patterns (e.g., *.example.com).
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Action policy -- --action-policy gates actions using a static JSON policy file with allow/deny lists across 13 action categories. Auth vault operations bypass policy enforcement.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Action confirmation -- --confirm-actions requires explicit approval for sensitive action categories. New confirm and deny commands for orchestrator use. --confirm-interactive enables human-in-the-loop terminal prompts (auto-denies if stdin is not a TTY). Pending confirmations auto-deny after 60 seconds.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Output length limits -- --max-output truncates large page outputs to prevent LLM context flooding.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] --download-path option -- Set a default download directory via flag, AGENT_BROWSER_DOWNLOAD_PATH env var, or downloadPath config key. Without it, downloads go to a temporary directory deleted when the browser closes.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
- [ ] --selector flag for scroll -- Scroll within a specific container element instead of the page: agent-browser scroll down 500 --selector "div.scroll-container"
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## v0.14.0 - New Features

- [ ] keyboard command -- Type with real keystrokes, insert text, and press shortcuts at the currently focused element without needing a selector (keyboard type, keyboard inserttext).
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] --color-scheme flag -- Persistent dark/light mode preference across browser sessions via flag or AGENT_BROWSER_COLOR_SCHEME env var.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## v0.14.0 - Bug Fixes

- [ ] Fixed IPC EAGAIN errors (os error 35/11) with backpressure-aware socket writes, command serialization, and lowered default Playwright timeout to 25s (configurable via AGENT_BROWSER_DEFAULT_TIMEOUT).
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Fixed remote debugging (CDP) reconnection.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed state load failing when no browser is running.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed --annotate flag warning appearing when not explicitly passed via CLI.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.13.0 - New Features

- [ ] Diff commands -- Compare snapshots, screenshots, and URLs between page states. Run visual pixel diffs against baseline images, compare accessibility tree snapshots with customizable depth and selectors, and diff two URLs side-by-side with optional screenshot comparison.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.

## v0.12.0 - New Features

- [ ] Annotated screenshots -- --annotate flag overlays numbered labels on interactive elements and prints a legend mapping each label to its element ref. Enables multimodal AI models to reason about visual layout while using the same @eN refs for subsequent interactions. Also settable via AGENT_BROWSER_ANNOTATE env var.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## v0.11.0 - New Features

- [ ] Configuration file support -- Automatic loading from user (~/.agent-browser/config.json) and project (./agent-browser.json) directories with priority-based merging.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [N] Profiler commands -- Chrome DevTools profiling with profiler start and profiler stop.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] Browser extension loading -- --extension flag to load browser extensions.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Storage state management -- state save and state load commands for auth state persistence.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use a fixture that sets cookies, localStorage, sessionStorage, and IndexedDB; assert CLI export/import/clear behavior through JSON output.
- [ ] iOS device emulation -- --device flag for device emulation.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use a fixture that reports viewport, device hints, geolocation, media queries, locale, and timezone; assert values before and after settings commands.
- [P] Enhanced click -- --new-tab option for click commands.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Enhanced find -- Additional actions and filtering options.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] CDP WebSocket URLs -- --cdp now accepts WebSocket URLs in addition to ports.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.

## v0.10.0 - New Features

- [P] Session persistence - Automatic save/restore of cookies and localStorage across browser restarts using --session-name flag
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Encrypted state - Optional AES-256-GCM encryption for saved session state data
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] State management commands - New commands for listing, showing, renaming, clearing, and cleaning up session state files
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [P] New tab on click - Added --new-tab option for click commands to open links in new tabs
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.9.4 - Bug Fixes

- [F] Fixed all Clippy lint warnings in the Rust CLI
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.9.3 - Improvements

- [P] Added support for custom executable path in CLI browser launch options
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Documentation site UI improvements including a new chat component with sheet-based interface
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.9.2 - Improvements

- [ ] Migrated documentation site to MDX for improved content authoring
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Added AI-powered docs chat feature
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Updated README with Homebrew installation instructions for macOS users
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.9.1 - New Features

- [ ] --allow-file-access flag - Enable opening and interacting with local file:// URLs (PDFs, HTML files) by passing Chromium flags that allow JavaScript access to local files
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run deterministic JavaScript against a fixture and assert returned JSON, thrown-error handling, and page-side side effects.
- [P] -C/--cursor flag for snapshots - Include cursor-interactive elements like divs with onclick handlers or cursor:pointer styles
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a pointer-event fixture that records mouse/pointer/wheel events and coordinates; assert the expected event log.

## v0.9.0 - New Features

- [N] iOS Simulator support - Mobile Safari testing via Appium with real device and simulator support
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.

## v0.8.10 - Improvements

- [ ] Added --stdin flag for eval command to read JavaScript from stdin, enabling heredoc usage for multiline scripts
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run deterministic JavaScript against a fixture and assert returned JSON, thrown-error handling, and page-side side effects.
- [ ] Fixed binary permission issues on macOS/Linux when postinstall scripts don't run
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.9 - Improvements

- [ ] Added --stdin flag for eval command to read JavaScript from stdin
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run deterministic JavaScript against a fixture and assert returned JSON, thrown-error handling, and page-side side effects.

## v0.8.8 - Improvements

- [ ] Added base64 encoding support for the eval command with -b/--base64 flag to avoid shell escaping issues
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Updated documentation with AI agent setup instructions
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Exercise with Rust unit tests for setup parsing/paths and the Windows smoke script registering the native host, then assert install-status --json fields.

## v0.8.7 - Bug Fixes

- [P] Fixed browser launch options not being passed correctly when using persistent profiles
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Added pre-flight checks for socket path length limits and directory write permissions
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Improved error handling to properly exit with failure status when browser launch fails
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.6 - Bug Fixes

- [P] Improved daemon connection reliability with automatic retry logic for transient errors
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] CLI now cleans up stale socket and PID files before starting a new daemon
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.5 - Bug Fixes

- [ ] Fixed version synchronization to automatically update Cargo.lock alongside Cargo.toml during releases
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Made the CLI binary executable in the npm package
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.4 - Bug Fixes

- [ ] Fixed "Daemon not found" error when running through AI agents by resolving symlinks in the executable path
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.3 - Improvements

- [ ] Replaced shell-based CLI wrappers with a cross-platform Node.js wrapper to enable npx support on Windows
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Added postinstall logic to patch npm bin entry on global installs for zero-overhead native binary invocation
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Added CI tests to verify global installation across all platforms
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.2 - Bug Fixes

- [ ] Fixed the Windows CMD wrapper to use the native binary directly instead of routing through Node.js
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Added retry logic to CI install command for transient browser installation failures
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.1 - Improvements

- [ ] Improved release workflow to validate binary file sizes and ensure binaries are executable after npm install
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Updated documentation site with a new mobile navigation system
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.8.0 - New Features

- [N] Kernel cloud browser provider - Connect to Kernel (kernel.sh) for remote browser infrastructure with stealth mode and persistent profiles
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Ignore HTTPS certificate errors - New flag for working with self-signed certificates and development environments
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Enhanced cookie management - Extended cookies set command with additional flags for setting cookies before page load
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## v0.8.0 - Bug Fixes

- [P] Fixed tab list command not recognizing new pages opened via clicks or target="_blank" links
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed check command hanging indefinitely
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fixed set device not applying deviceScaleFactor - HiDPI screenshots now work correctly
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
- [P] Fixed state load and profile persistence not working in v0.7.6
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Screenshots now save to temp directory when no path is provided
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## v0.7.1 - Bug Fixes

- [ ] Fix native binary distribution - Native binaries for all platforms (Linux x64/arm64, macOS x64/arm64, Windows x64) are now included in the npm package. Previously, the release workflow published to npm before building binaries, causing "No binary found" errors on installation.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.7.0 - New Features

- [N] Cloud browser providers - Connect to Browserbase or Browser Use for remote browser infrastructure
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [F] Persistent browser profiles - Store cookies, localStorage, and login sessions across browser restarts
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [N] Remote CDP WebSocket URLs - Connect to remote browser services via WebSocket
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
- [ ] download command - Trigger downloads and wait for completion
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
- [P] Browser launch configuration - Fine-grained control over browser startup
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Enhanced skills - Hierarchical structure with references and templates for Claude Code
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## v0.7.0 - Bug Fixes

- [ ] Screenshot command now supports refs and has improved error messages
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
- [ ] WebSocket URLs work in connect command
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [P] Fixed socket file location (uses ~/.agent-browser instead of TMPDIR)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [F] Windows binary path fix (.exe extension)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] State load and path-based actions now show correct output messages
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.6.0 - New Features

- [ ] Video recording - Record browser sessions to WebM using Playwright's native recording
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [N] connect command - Connect to a browser via CDP and persist the connection for subsequent commands
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] --proxy flag - Configure browser proxy with optional authentication
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] get styles command - Extract computed styles from elements
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Claude marketplace plugin - Added .claude-plugin/marketplace.json for Claude Code integration
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Enhanced network output - network requests now shows method, URL, and resource type
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] --version flag - Display CLI version
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.

## v0.6.0 - Bug Fixes

- [ ] Fix Windows daemon startup and port calculation
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Support libasound2t64 on newer Ubuntu versions (24.04+)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [N] Prevent CDP timeout on empty URL tabs
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Output screenshot as base64 when no path provided
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
- [ ] Resolve refs in get value command
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [P] Support URL parameter in tab new command
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Allow about:, data:, and file: URL schemes
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Detect stale unix socket by attempting connection
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Respect AGENT_BROWSER_HEADED environment variable
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Handle SIGPIPE to prevent panic when piping to head/tail
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Convert the release note into a focused regression test using the smallest fixture that reproduces the behavior, then add it to smoke or unit coverage.
- [ ] Fix null path validation in screenshot command
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
