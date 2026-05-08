# Finish Milestone 0: Reference Oracle Completion

## Summary
Milestone 0 is complete when the `agent-browser` oracle is trustworthy, documented, and enforceable as the baseline for future parity work. It does **not** require all 47 current `exact` compatibility claims to have full parity coverage yet; it requires those gaps to be explicit, reported, and impossible to accidentally worsen.

Current state: `oracle:compare` passes local fixture cases, and 18 of 47 `exact` items are covered by deterministic cases. Checklist reconciliation, policy enforcement, visible validation, the broader core command coverage set, and report workflow hardening are implemented.

## Key Changes
- Reconcile the human checklist with oracle coverage.
  - Add an “Oracle Coverage” line to feature-parity checklist entries that are covered by `fixtures/oracle/cases.json`.
  - Use one of: `covered`, `uncovered`, `not-comparable`, or `smoke-only`.
  - Keep `[F]`, `[P]`, and `[ ]` as implementation status only; do not let `[F]` imply deterministic parity coverage.
  - Update `docs/agent-browser-compatibility.json` so every listed item has an explicit `tapeCovered` state or documented reason.

- Add a coverage policy check to the oracle.
  - Extend `oracle:report` or add `oracle:coverage` to compare `docs/agent-browser-compatibility.json` against `fixtures/oracle/cases.json`.
  - Report three lists: covered exact items, uncovered existing exact items, and invalid new exact claims.
  - Gate only **new or upgraded** exact/best-effort claims on oracle coverage; existing exact claims may remain uncovered but must be listed.
  - Fail CI/report if an item is marked covered in docs but has no passing case.

- Expand minimum Milestone 0 case coverage.
  - Add deterministic v2 cases for the highest-value already-implemented exact commands not yet covered:
    - `type <selector> <text>`
    - `press` / `key`
    - `keyboard type`
    - `keyboard inserttext`
    - `find label ... fill`
    - `find role ... click`
    - `get text`, `get value`, `get attr`, `get url`
    - `is enabled`, `is checked`
    - `tabs new/select/close`
  - Add at least three negative/error parity cases:
    - stale ref
    - ambiguous selector
    - unsupported command with stable not-available metadata
  - Prefer local fixtures with observable DOM/event assertions over `exitOnly`.

- Complete validation layers.
  - Keep `oracle:compare` as the deterministic compatibility gate.
  - Keep `oracle:wrapper` as the no-model Pi extension wrapper gate; add direct `pire-browser` extension `execute()` coverage if it is currently only testing the lower-level runner.
  - Run and verify `oracle:visible:compare` once on Windows against visible-safe local fixtures; Bing remains smoke-only and must not block local-fixture acceptance.
  - Keep `oracle:pi` optional and model-backed; it should skip cleanly without API/model config.

- Document the Milestone 0 operating rules.
  - Add a short “Oracle Workflow” doc explaining:
    - how to install the pinned oracle
    - how to run compare, wrapper, report, visible compare, and Pi smoke
    - how to add a new parity case
    - how `tapeCovered` maps to checklist status
    - how to refresh the pinned `agent-browser` baseline
  - Include the definition of done for Milestone 0 so later epics do not reinterpret it as “all parity features complete.”

## Test Plan
- Run and require passing:
  - `npm run oracle:ci`
  - or the equivalent individual commands:
  - `npm run oracle:test`
  - `npm run oracle:wrapper`
  - `npm run oracle:doctor`
  - `npm run oracle:compare`
  - `npm run oracle:report`
- Run `npm run oracle:visible:compare` manually on Windows and confirm Chrome and Firefox visibly execute the same visible-safe local fixture cases.
- Verify coverage reporting shows:
  - no doc item marked `tapeCovered: true` without a passing case
  - all existing uncovered exact claims listed but not failing the gate
  - any newly added exact/best-effort claim without coverage fails the policy check
- Verify the human checklist has clear oracle coverage annotations for the Milestone 0 covered set.

## Assumptions
- Milestone 0 is infrastructure completion, not full feature parity completion.
- Existing `exact` claims are phased into coverage rather than demoted immediately.
- Local fixtures are the acceptance gate; Bing and Pi are smoke layers only.
- `agent-browser@0.26.0` remains the pinned oracle until a deliberate baseline refresh.
