# State URL Hygiene And Inspect-Gated Load Slice

## Summary
Close raw saved-URL leak paths in the plaintext active-origin state workflow, then add an opt-in receipt gate for operators who want to require a recent metadata inspection before loading state.

## Key Changes
- Strip query strings and fragments for state success output, saved `source.url`, state auto-launch URLs, inspect display URLs, and extension wrong-origin guidance.
- Add `state inspect --record <path>` to write a 24-hour local receipt under `%LOCALAPPDATA%\pire-browser\state-receipts`.
- Add `state load --require-inspected <path>` to require a matching fresh receipt for canonical path, hash, byte size, schema, kind, and origin before applying state.
- Keep `state inspect <path>` read-only, keep normal `state load <path>` compatible, and keep upstream `state show` unavailable.

## Test Plan
- Rust parser and receipt tests for flag ordering, missing receipts, stale receipts, changed files, canonical paths, two distinct files, and tool-version warnings.
- Smoke test coverage for save/inspect/load/guarded-load outputs with no sentinel leakage.
- Existing verification remains: `cargo test`, `npm run test`, `npm --prefix extension run test`, `npm run oracle:test`, `npm run smoke:state`, `npm run oracle:compare`, `cargo fmt --check`, and `git diff --check`.

## Assumptions
- State files remain schemaVersion 1 plaintext sensitive artifacts.
- Receipt gating is opt-in and local-only; encryption, auth vault, state list/show/rename/clear/clean, portable receipts, and strict-by-default config stay out of scope.
