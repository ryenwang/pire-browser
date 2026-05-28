# Strict State Load Policy Slice

## Summary
Add an opt-in, cooperative safety policy that makes inspected-state receipts the default for `state load` when operators set `PIRE_BROWSER_REQUIRE_INSPECTED_STATE`. This is a guardrail against accidental or unreviewed plaintext state loads, not a sandbox against hostile code that can alter environment variables or pass override flags.

## Key Changes
- Add shared state policy parsing.
  - New env var: `PIRE_BROWSER_REQUIRE_INSPECTED_STATE`.
  - Enabled values: `1`, `true`, `yes`, `on`; disabled values: unset, `0`, `false`, `no`, `off`, case-insensitive.
  - Invalid env values fail only implicit policy decisions; explicit `--require-inspected` or `--no-require-inspected` still wins.
  - Error text for implicit invalid env must include the received value and accepted values.
  - Expose diagnostics as `statePolicy`: `{ requireInspectedStateLoads, source, envVar, valid, message, receiptTtlMs }`, where `source` is `"default"`, `"env"`, or `"flag"`; `receiptTtlMs` is informational.

- Implement state-load precedence exactly:

| Env value | Flags | Effective behavior |
| --- | --- | --- |
| unset/disabled | none | normal load, no receipt required |
| unset/disabled | `--require-inspected` | receipt required |
| unset/disabled | `--no-require-inspected` | normal load, no warning |
| enabled | none | receipt required |
| enabled | `--require-inspected` | receipt required |
| enabled | `--no-require-inspected` | normal load plus `STATE_POLICY_OVERRIDDEN` warning |
| invalid | none | fail locally with `InvalidArgumentError` before reading/loading state |
| invalid | `--require-inspected` | receipt required; invalid env ignored because explicit flag wins |
| invalid | `--no-require-inspected` | normal load; invalid env ignored because explicit flag wins |
| any | both explicit flags | fail locally with `invalid_args` |

- Wire CLI behavior.
  - Add parser support for `state load --no-require-inspected <path>` with flag ordering matching current `--require-inspected`.
  - Keep receipt validation before browser launch/dispatch for both explicit and env-driven strict loads.
  - Ensure policy/env failures happen before state file contents are parsed or emitted.
  - Add policy warnings to both plain and JSON success/error envelopes where applicable.

- Surface diagnostics and docs.
  - Add `statePolicy` to `status --json` and `doctor --json`; add a short text line to both text outputs.
  - Treat these as additive `pire-browser`/doctor diagnostics and implementation notes, not compatibility-status upgrades.
  - README/help/Pi guidance should show team mode: set env var, run `state inspect --record`, then normal `state load` is guarded.
  - Update feature-parity/security notes and docs manifest only through the existing generator if docs change.

## Test Plan
- Rust tests:
  - Policy parser covers all accepted values, invalid values, source values, and diagnostic object shape.
  - Parser accepts `--no-require-inspected`, rejects both flags together, and preserves existing `--json` ordering.
  - Full precedence table has a test per row.
  - Policy-driven receipt validation happens before browser launch/dispatch.
  - Invalid env without explicit flags fails before state parsing and does not leak state values.
  - Enabled-policy override emits `STATE_POLICY_OVERRIDDEN`.

- Smoke and docs:
  - Extend `npm run smoke:state` with strict env mode: plain load fails before record, inspect record succeeds, plain load succeeds, override succeeds with warning, invalid env fails without sentinel leakage.
  - Keep normal unset-env load behavior unchanged.
  - Verify `status --json` / `doctor --json` include `statePolicy`.

- Verification:
  - `cargo test`
  - `npm run test`
  - `npm --prefix extension run test`
  - `npm run oracle:test`
  - `npm run smoke:state`
  - `npm run oracle:compare`
  - `cargo fmt --check`
  - `git diff --check`

## Assumptions
- This builds after the state URL hygiene and inspect-gated load slice is reviewed or rebased cleanly.
- Env-backed policy is enough for this slice; file-backed/org policy is future work.
- Strict mode remains opt-in and cooperative; encryption, auth vault, portable receipts, and strict-by-default behavior stay out of scope.
