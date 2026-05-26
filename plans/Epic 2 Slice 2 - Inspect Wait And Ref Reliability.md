# Epic 2 Slice 2: Inspect, Wait, And Ref Reliability

## Summary
Build the next Epic 2 slice around the browser loop after launch: reliable inspection, deterministic waits, stable ref failures, and basic frame-safe action routing. This should harden existing commands before widening selector parity.

This revision keeps the slice honest about Firefox WebExtension limits: `wait --fn` remains DOM/content-script scoped unless a later main-world bridge is built, and default `snapshot` must not imitate an `agent-browser` accessibility tree unless it actually matches that contract.

## Key Changes
- Harden wait behavior for documented DOM-safe wait modes:
  - Cover `wait <ms>`, `wait --text`, `wait --url`, and `wait <selector> --state hidden` as Epic 2 exact candidates.
  - Normalize wait timeouts to exit `124`, `error.code = "timeout"`, and the standard JSON error envelope when `--json` is used.
  - Implement wait cleanup with one settle path that always clears timers and disconnects `MutationObserver`s on success, timeout, or error.
  - Keep `wait --load networkidle` out of scope and owned by Epic 5.

- Treat `wait --fn` as best-effort in this slice:
  - Do not claim exact parity for `cmd-wait-fn`.
  - Keep execution scoped to the content-script isolated world and DOM-visible state.
  - Add a structured Firefox/WebExtension warning for JSON output explaining that page globals/framework state are not visible.
  - Defer main-world execution via script injection or another bridge to a later explicit design decision.

- Improve snapshot and ref reliability:
  - Ensure both `snapshot` and `snapshot -i` populate refs.
  - Make default `snapshot` useful but clearly flat/ref-oriented; do not mimic a structured accessibility tree unless parity is exact enough to claim.
  - Preserve fresh-ref semantics: refs are valid until the next snapshot/find or until their element/frame disappears.
  - Normalize dead frame routing errors from `browser.tabs.sendMessage(..., { frameId })` to `ref_stale` / exit `44`, not generic runtime failure.
  - Do not add advanced ref recovery in this slice.

- Add dynamic oracle coverage:
  - Add a local fixture page with delayed text, a spinner that becomes hidden, a URL/hash transition, removable elements, a DOM-scoped JS condition, and a same-origin iframe.
  - Verify wait success paths, wait timeout paths, removed-element stale refs, navigated/removed-frame stale refs, and same-origin iframe snapshot/ref action.
  - Represent inaccessible frames as stable opaque records if encountered; do not implement persistent `frame` command semantics.

- Update compatibility metadata only for proven behavior:
  - Review and cover `cmd-wait-ms`, `cmd-wait-text`, `cmd-wait-url`, and `cmd-wait-selector-state-hidden`.
  - Downgrade or keep `cmd-wait-fn` as `best_effort` with a clear isolated-world rationale, not `exact`.
  - Correct wait-related `ownerEpic` drift to Epic 2 where appropriate.
  - Remove newly covered ids from the legacy baseline if present, and link only obvious duplicate doc rows.

## Public Interfaces
- No new command surface.
- Existing commands become more reliable: `snapshot`, `snapshot -i`, `wait`, `click @ref`, `fill @ref`, and JSON failure envelopes.
- `wait --fn` remains available but explicitly best-effort for DOM/content-script predicates.
- `--headless`, named sessions, network-idle, downloads, screenshots, main-world JS execution, and broad selector expansion stay out of scope.

## Test Plan
- Oracle:
  - Add deterministic cases for `wait <ms>`, `wait --text`, `wait --url`, and `wait --state hidden`.
  - Add best-effort `wait --fn` cases for DOM-visible predicates plus JSON warning coverage.
  - Add JSON timeout cases for selector/text/URL waits.
  - Add stale-ref cases for removed elements and removed/navigated frames.
  - Add same-origin iframe snapshot/ref action coverage.
  - Add a default `snapshot` case proving refs and useful flat output without claiming full tree parity.

- Unit/regression:
  - Add extension tests for wait observer/timer cleanup.
  - Add tests mapping missing/dead frame `sendMessage` routing failures to `ref_stale`.
  - Add source/behavior checks that default snapshot output is intentionally flat unless a future exact tree contract is implemented.
  - Keep Rust tests focused on exit-code mapping and CLI parsing; add Rust tests only if mapping behavior changes.

- Acceptance:
  - `npm run build:extension`
  - `npm test`
  - `cargo test`
  - `npm run oracle:test`
  - `npm run oracle:compare`
  - `npm run oracle:ci`

## Assumptions
- Reliability depth is still the best next slice; selector breadth remains Epic 3.
- Same-origin iframe support belongs in Epic 2 because it affects the core inspect/act loop.
- Main-world JS execution is not required for this slice and should not be smuggled in while implementing `wait --fn`.
- Compatibility claims should stay conservative: exact only when fixture-proven, best-effort when Firefox/WebExtension semantics differ.
