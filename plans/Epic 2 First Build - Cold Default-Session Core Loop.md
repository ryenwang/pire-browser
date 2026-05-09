# Epic 2 First Build: Cold Default-Session Core Loop

## Summary

Build the first Epic 2 slice as an end-to-end default-session reliability lane, not a broad command expansion.

The goal is to prove that `pire-browser` can start from no live Firefox session, auto-launch managed Firefox when eligible, connect the extension, dispatch commands, and repeatedly run the basic agent loop: `open`, `snapshot -i`, act by ref/selector, wait, inspect again, and close.

This stabilizes the substrate that later selector, frame, session, and data-plane work will stand on.

## Key Changes

- Harden default-session auto-launch:
  - Keep auto-launch limited to eligible browser-control commands with no explicit `--session`.
  - Ensure `open/goto/navigate <url>` pass the URL into managed Firefox startup when no session exists.
  - Reuse an existing managed default-profile session when available.
  - Preserve explicit-session no-autolaunch behavior.
  - Return stable errors when Firefox/web-ext starts but the extension never connects.

- Add a dedicated oracle lane for the cold core loop:
  - Add a case that begins from a unique per-run `LOCALAPPDATA` under the oracle run directory.
  - Avoid deleting active Firefox/web-ext profile directories; cleanup is command-level and stale artifact cleanup can use retry/backoff later if needed.
  - Run `open {{fixtureUrl}}`, `snapshot -i`, capture refs, `fill`, `click`, `wait --selector`, `get text/value/url/title`, and a second `snapshot -i`.
  - Assert exit codes, strict JSON envelopes for at least one success and one error path, DOM state changes, URL/title state, and stable cleanup.
  - Keep this lane headed/default only; do not add headless launch support in this slice.

- Normalize and classify core-loop failures:
  - Map extension disconnect, launch timeout, ref stale, ambiguous locator, disabled target, selector timeout, and invalid args to the existing exit-code taxonomy.
  - Ensure JSON error envelopes are emitted for `--json` failures.
  - Keep `networkidle` out of scope and reject or defer it according to the Epic 1 contract.

- Tighten lite observability for the loop:
  - Ensure CLI/host/extension logs carry request id, response id, command root, session id/profile id where available, start/end timing, duration, and error code.
  - Flush log lines per command so close/disconnect does not lose the final command metadata.
  - Keep heavy screenshots/traces/HAR/dashboard out of scope.

- Add minimal page-target groundwork:
  - Do not implement full Epic 4 sessions yet.
  - Rename or wrap internal background-script targeting concepts so command code can talk about a stable "page" abstraction while still storing Firefox tab/window ids internally.
  - Page records must carry both `tabId` and `windowId`; activation must focus the window and activate the tab.
  - Preserve current `tab/tabs` public behavior.

## Public Interfaces And Contracts

- No new public command surface in this first slice.
- Existing default-session commands should become more reliable:
  - `open`, `goto`, `navigate`
  - `snapshot -i`
  - `click`, `fill`
  - `wait --selector`, `wait --text`, `wait --url`, fixed waits
  - `get text/value/url/title`
  - `close`
- `--session` remains explicit-session only and must not auto-launch.
- Per-command `--headless`, `--headed`, and `--color-scheme` remain ignored-with-warning parser compatibility flags, not launch-mode switches.
- `wait --load networkidle` remains Epic 5, not an Epic 2 success criterion.

## Test Plan

- Rust tests:
  - Auto-launch eligibility for supported roots.
  - Explicit `--session` never auto-launches.
  - Launch URL extraction for `open/goto/navigate`.
  - Stable launch timeout/disconnected error classification.
  - Ignored global flags still produce JSON warnings.

- Extension/Vitest tests:
  - `all_frames: true` remains present.
  - Request/response debug log helpers include ids.
  - Page-target helper preserves tab/window routing metadata.
  - Disabled/ambiguous/missing targets return stable error objects.

- Oracle tests:
- New cold default-session core-loop case passes from a unique per-run oracle `LOCALAPPDATA`.
  - Existing negative cases still pass: bad selector, stale ref, ambiguous selector, disabled target, short timeout.
  - Strict `jsonEnvelopeShape` is used for one success envelope and one error envelope in the core-loop lane.
  - `oracle:compare` and `oracle:ci` pass with the new case.

- Acceptance gates:
  - `npm run oracle:test`
  - `cargo test`
  - `npm test`
  - `npm run oracle:compare`
  - `npm run oracle:ci`

## Assumptions

- First Epic 2 work optimizes for the vertical core loop over expanding selector breadth.
- Default headed managed Firefox is the only launch mode claimed in this slice.
- Existing basic command implementations are kept and hardened rather than replaced wholesale.
- Frame stitching beyond current accessible-frame iteration is prepared but not completed unless needed for the cold-loop fixture.
- Named-session lifecycle, robust `networkidle`, downloads/uploads, screenshots/traces, and advanced selector parity remain later epics or later Epic 2 slices.
