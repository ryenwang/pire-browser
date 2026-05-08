# First <1hr Implementation: Core Command Shape Polish

## Summary
Implement the smallest high-impact parity slice: make `pire-browser` match the common `agent-browser` command shape for opening and simple waiting. This should close several high-priority low-complexity `P` items without touching harder areas like CSS selectors, `close`, network-idle, or stable refs.

## Key Changes
- Add browser-command aliases:
  - `pire-browser goto <url>` and `pire-browser navigate <url>` behave exactly like `pire-browser open <url>`, including `--new`, `--label`, and auto-launch when no Firefox session is live.
  - Update CLI auto-launch detection so `goto`/`navigate` launch Firefox with the target URL just like `open`.
- Make no-arg open useful:
  - `pire-browser open` launches the default managed Firefox profile if needed.
  - If a session already exists, it no-ops and returns text like `Browser open in t1 <title-or-url>`.
  - It must not navigate away from the current tab.
- Fix plain wait:
  - `pire-browser wait 2000` waits about 2000ms and returns `Waited 2000ms`.
  - Plain `pire-browser wait` defaults to 1000ms.
  - `wait --selector ...` and `wait --load` keep their current behavior; true `networkidle` remains out of scope.

## Implementation Notes
- In the extension command dispatcher, route `goto` and `navigate` to `openCommand`.
- In `openCommand`, allow no URL and return current/active tab status after reconciliation.
- In the Rust CLI auto-launch helpers, include `goto` and `navigate` in launchable commands and URL extraction.
- In `waitCommand`, parse the first positional numeric argument for plain waits; use `--timeout` only as fallback for plain wait and still as timeout for selector/load waits.
- Update checklist docs only for the items this actually completes:
  - `agent-browser open`
  - `agent-browser open <url>` aliases
  - `agent-browser wait <ms>`
  - Do not mark `wait --load networkidle`, CSS selector click/fill, or close as complete.

## Test Plan
- Add Rust unit coverage for:
  - `can_auto_launch_for_remote_args(["goto", url])`
  - `can_auto_launch_for_remote_args(["navigate", url])`
  - URL extraction for `goto` and `navigate`.
- Add extension regression coverage following the existing lightweight source-test style for:
  - `goto`/`navigate` dispatcher aliases.
  - no-URL `open` path.
  - positional millisecond parsing for `wait`.
- Run:
  - `cargo test --workspace --target x86_64-pc-windows-msvc`
  - `npm --prefix extension test`
  - `git diff --check`

## Assumptions
- No package version bump or GitHub release in this sub-hour slice.
- No attempt to implement true network-idle, robust close/launcher teardown, CSS selectors, or stable cross-snapshot refs.
- Existing uncommitted checklist-doc edits are preserved and only the directly affected checklist items are adjusted.
