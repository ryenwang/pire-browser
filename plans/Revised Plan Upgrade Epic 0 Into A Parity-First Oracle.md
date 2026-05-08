# Revised Plan: Upgrade Epic 0 Into A Parity-First Oracle

## Summary
Upgrade the existing Epic 0 oracle in place instead of creating a parallel tape system. `scripts/oracle/compare.mjs` and `fixtures/oracle/cases.json` become the single deterministic source of truth for `agent-browser` vs `pire-browser` compatibility. Visible demos and Pi smoke runs will reuse the same cases, so command parity, wrapper behavior, and model ergonomics are layered but not conflated.

## Key Changes
- Evolve `fixtures/oracle/cases.json` to schema version `2`.
  - A case becomes an ordered multi-step command script with `steps`, optional `finalAssertions`, `bail`, `visibleSafe`, and `compatibilityItems`.
  - Default behavior: continue after a failed step on one side, record divergence, and run cleanup; use `bail: true` only for steps where continuing would corrupt the case.
  - Add `tapeCovered`/coverage metadata for compatibility items so existing `exact` claims are not demoted immediately.

- Upgrade `oracle:compare` as the canonical runner.
  - Extend `compare.mjs` to run v2 multi-step cases against pinned `agent-browser` and local `pire-browser`.
  - Keep v1 case support temporarily by internally converting legacy `setup + command` into v2 steps.
  - Write per-step artifacts: command, args, stdout, stderr, normalized output, exit code, finish reason, timeout/output-idle status, duration, captured refs, URL/title probes, and cleanup result.
  - Treat `agent-browser` output-idle resolution as an explicit oracle-adapter finish reason, not a hidden parity success.

- Replace fragile ref extraction with declared semantic captures.
  - Remove hardcoded `extractRefs()` keyword matching as the primary path.
  - Each capture declares a semantic name, source step, and match rule, for example `searchBox`, `emailInput`, or `submitButton`.
  - Supported capture sources: snapshot lines, `find` output, stdout regex, and known fixture selectors.
  - Each tool captures its own ref independently; normalized comparisons never require ref numbers to match across browsers.

- Add stronger assertions for success and error parity.
  - Supported assertions: `exitCodeEquals`, `stdoutContains`, `stdoutNormalizedEquals`, `stderrNormalizedContains`, `jsonShape`, `errorNameEquals`, `errorCodeEquals`, `notAvailableError`, `urlContains`, `titleContains`, `domValue`, `domText`, and `eventLogContains`.
  - Prefer observable page-state assertions over `exitOnly` for action commands.
  - Add explicit negative cases for stale refs, ambiguous selectors, unsupported commands, and timeout/error output shape.

- Split validation into three layers.
  - Deterministic CLI oracle: `npm run oracle:compare`; this is the compatibility gate.
  - No-model Pi wrapper harness: new `npm run oracle:wrapper`; directly invokes the Pi extension `execute()` functions with scripted tool calls to verify argument routing, stdout/stderr handling, exit codes, details metadata, timeout, and abort behavior.
  - Model-backed Pi smoke: keep `npm run oracle:pi` for prompt/tool UX and green-block behavior only; add per-run temp profiles/session dirs, max tool-call cap, and hard timeout.

- Rework visible demos around the same cases.
  - Rename the current model-backed visible demo to `oracle:visible:pi`.
  - Add `oracle:visible:compare`, which runs a `visibleSafe` case with the deterministic runner while showing Chrome and Firefox side by side.
  - Keep Bing only as a visible smoke case; local fixtures are the acceptance gate because Bing can vary by cookie banners, region, A/B tests, redirects, or captchas.

- Consolidate shared utilities.
  - Move command splitting/quoting, normalization, process finish handling, and artifact writing into shared oracle modules.
  - Use the same command splitter from CLI oracle, visible runner, Pi smoke, and `agent-browser-oracle`.
  - Record version metadata for every run: pinned `agent-browser` package/version, docs commit, `pire-browser` version/commit if available, OS, browser paths, and profile dirs.

- Add reporting and baseline refresh workflow.
  - Add `npm run oracle:report` to read the latest coverage-complete deterministic run by default, optionally inspect a specific run, and list failed cases, new regressions, output diffs, uncovered `exact` items, and artifact paths.
  - Add `npm run oracle:ci` as the local Epic 0 gate for the deterministic oracle, wrapper tests, doctor check, compare run, and enforcing report.
  - Add `npm run oracle:refresh-baseline` as the documented wrapper around intentional `AGENT_BROWSER_ORACLE_REFRESH=1` usage when updating from `agent-browser@0.26.0` to a new oracle version.
  - Baseline refresh must run `oracle:install`, `oracle:compare`, and update baseline metadata in one reviewed change.

## Test Plan
- Unit-test schema v2 loading, v1-to-v2 compatibility conversion, duplicate IDs, semantic captures, command interpolation, shared command splitting, output normalization, assertion evaluation, and failure continuation vs `bail`.
- Unit-test error parity assertions for stale refs, ambiguous selectors, unsupported commands, and mismatched exit codes.
- Integration-test `oracle:compare` against local fixtures for core navigation, snapshot refs, selectors, form input, keyboard, wait/get/is, tab listing, and negative unsupported command behavior.
- Add wrapper-harness tests for both Pi extensions: success result, stderr propagation, nonzero exit, timeout, abort, output-idle finish, and child stream cleanup.
- Run `oracle:visible:compare` with local fixture cases as the actual pass/fail headed gate; keep Bing only in the separate model-backed visible smoke demo.
- Acceptance gate: new or upgraded `exact` compatibility claims require passing v2 coverage; existing `exact` claims remain allowed but must show `tapeCovered: false` until migrated.

## Assumptions
- `agent-browser@0.26.0` remains the pinned oracle until a deliberate baseline refresh.
- CLI parity is the source of truth; Pi validates wrappers and model-facing ergonomics.
- Existing compatibility claims are phased into coverage instead of demoted immediately.
- `pire-browser` should match `agent-browser` command spelling, output shape, errors, exit codes, and observable behavior wherever Firefox/WebExtension can provide a useful equivalent.
