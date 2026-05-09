# Epic 1: Compatibility Contract

## Summary
Make the pinned `agent-browser@0.26.0` docs the enforced compatibility contract for `pire-browser`, without turning Epic 1 into feature implementation.

Epic 1 is contract-only. Runtime work is limited to documented command parsing and stable unsupported-feature responses. Existing uncovered `exact` / `best_effort` claims remain explicit legacy debt, while new or upgraded claims require fixture coverage.

Use the mirrored checklist as the denominator and scoreboard, not the build queue. Each item maps to a substrate epic so later work can upgrade clusters when the underlying layer exists.

## Implemented Contract Shape
- `docs/agent-browser-compatibility.json` uses `schemaVersion: 3` with migrated compatibility claims plus mirrored checklist inventory rows.
- Top-level statuses remain `exact`, `best_effort`, and `not_available`.
- `disposition` separates temporary gaps, permanent Firefox gaps, backend-specific work, intentional differences, and not-started work.
- Source identity is pinned to `agent-browser@0.26.0` and source commit `7ada3384e2afb5f3c43d9106389da86d8f807dca`.
- Stable ids are slug-style records with source path, heading text, anchor, and checklist text stored separately.
- Aliases live on the relevant compatibility record with per-alias parser coverage metadata.

## Contract Semantics
- `exact` means parity after documented normalization, not byte-equal stdout.
- Normalized fields include refs, generated ids, timestamps, durations, absolute paths, screenshot filenames, cosmetic whitespace, JSON field order, and known browser-specific process text.
- Error codes, exit codes, success/failure status, required JSON fields, warning codes, and semantic user-visible output are never normalized away.
- Success JSON is `{ "success": true, "data": ..., "warnings": [...] }`.
- Error JSON is `{ "success": false, "error": { "code", "message", "data" }, "warnings": [...] }`.
- Best-effort warnings use `{ "code", "feature", "message" }` with `BEST_EFFORT_FIREFOX_GAP`.
- Unsupported features use `NotAvailableError`, `error.data.compatibility = "not_available"`, and exit code `78`.

## Ratchet Rules
- Status may improve only with a passing deterministic fixture that covers the compatibility item.
- A failing fixture fails CI; there is no silent downgrade.
- Downgrades must update status, disposition, rationale, and stale coverage metadata in the same change.
- Existing uncovered claims are allowed only while listed in `coveragePolicy.existingClaimBaseline`.
- New or upgraded `exact` / `best_effort` claims without passing fixture coverage fail the oracle policy.

## Acceptance Gate
- `npm run oracle:test` validates schema, source pins, inventory coverage, aliases, fixture references, and coverage policy.
- `npm run oracle:compare` validates deterministic fixture parity.
- `npm run oracle:report` lists covered, uncovered legacy, not-comparable, smoke-only, stale, and invalid claims.
- `npm run oracle:ci` is the full Epic 1 gate.
