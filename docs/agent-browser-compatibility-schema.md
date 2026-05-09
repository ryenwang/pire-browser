# agent-browser Compatibility Schema

The compatibility matrix is the contract for the pinned `agent-browser@0.26.0` docs. It is a scoreboard, not a build queue.

## Item Fields

- `status`: one of `exact`, `best_effort`, or `not_available`.
- `disposition`: explains why the status exists, using `temporary_gap`, `permanent_firefox_gap`, `backend_specific`, `intentionally_different`, or `not_started`.
- `contractReviewed`: `true` only after a human has checked the row rationale and contract text. Generated inventory rows default to `false`.
- `coverage.state`: one of `covered`, `uncovered`, `not_comparable`, or `smoke_only`.
- `canonicalItemId`: optional `doc-*` row link to a covered `cmd-*` row for duplicate documentation examples.
- `runtime.unsupportedRoots`: command roots that should return the stable unsupported-feature envelope locally.
- `ownerEpic`: exactly one of `Epic 1` through `Epic 8`.
- `globalFlagPolicy`: root-level map for documented global flags. Each flag is `honored`, `ignored_with_warning`, `deferred`, or `rejected`; ignored flags must use warning code `IGNORED_GLOBAL_FLAG`.

## Coverage And Baseline Rules

New or upgraded `exact` and `best_effort` claims need deterministic fixture coverage unless they are already listed in `docs/agent-browser-compatibility-baseline.json`.

The baseline file is manually maintained legacy debt. It may shrink as fixtures land, but normal oracle gates reject new ids.

Doc rows with `canonicalItemId` may inherit coverage from the canonical command row only when the command root matches the canonical command or one of its aliases.

Epic 2 readiness has extra guardrails. Covered or promoted core-loop work should have representative positive fixtures, negative-path fixtures for bad selector/stale ref/ambiguous selector/disabled target/short timeout, and strict JSON envelope assertions where `--json` is part of the claim.

`jsonEnvelopeShape` is the strict structural JSON assertion for new Epic 2 coverage. It validates success/error envelope nesting, required keys, warnings array shape, selected data paths, and stable error codes after documented normalization. It does not normalize success/failure, exit codes, error codes, required fields, or warning codes.

Default headed managed Firefox is the first Epic 2 launcher lane. Any future headless managed-launcher lane must have separate oracle coverage for auto-launch, viewport-sensitive assertions, focus-sensitive actions, and screenshot behavior. Per-command `--headless` remains governed by `globalFlagPolicy` and is not a live-session mode switch.

Network-idle waits are Epic 5 because they require network instrumentation. Upload automation is Epic 8/backend-specific for the Firefox WebExtension path unless a future OS or browser-driver backend is approved.

## Comparison Ref And Ratchets

Diff-aware guards compare against `ORACLE_COMPATIBILITY_BASE_REF` when set, then `origin/${GITHUB_BASE_REF}` when that ref exists, then `HEAD`. If the compared matrix file is missing or predates schema v3, diff-only ratchets log the initial-introduction condition and skip.

Status rank is `not_available < best_effort < exact`. Improvements require `contractReviewed: true` and direct or canonical `coverage.state = "covered"`. Downgrades require `contractReviewed: true` plus a changed `rationale` or `disposition`. A row newly flipped to `contractReviewed: true` must not keep generated boilerplate rationale or contract text.

The separate baseline guard uses the same comparison-ref behavior. Added baseline ids fail; removals, reordering, and metadata edits are allowed.

## Source Docs

The denominator comes from allowlisted mirrored docs `01-*.md` through `25-*.md`. `26-changelog.md` is intentionally excluded as historical context and must not generate matrix rows. Any future `NN-*.md` file under `docs/feature-parity/agent-browser` must be either added to the allowlist or explicitly excluded in the contract module.

`docs/agent-browser-docs-manifest.json` fingerprints the allowlisted docs with SHA-256 after normalizing line endings to LF. The manifest excludes `26-changelog.md`; if mirrored docs change, regenerate the compatibility artifacts and review the manifest diff with the matrix/source metadata changes.

## Reports

`node scripts/oracle/report.mjs --json` emits one JSON object with run metadata, failures, coverage policy buckets, canonical coverage, review queue data, canonical-link candidates, and unsupported-root provenance. `npm run --silent oracle:report:json` is the machine-safe npm entrypoint; `npm run oracle:report -- --json` still works but includes npm's script banner unless run with `--silent`.

`npm run oracle:report -- --review-queue` prints the full review queue and a report-only “Possible canonical links” section. Candidates are limited to `doc-*` rows with parsed command roots that safely match reviewed, covered `cmd-*` items by primary command or alias. Multi-command shell examples and generic “support documented usage” prose are excluded.

## Generated Artifacts

`docs/agent-browser-unsupported-roots.json` is generated from explicit matrix runtime metadata. It keeps a Rust-compatible `unsupportedRoots` array and includes provenance for review.

`docs/agent-browser-docs-manifest.json` is generated from the pinned docs mirror. Run `node scripts/oracle/generate-compatibility-artifacts.mjs` to update both generated artifacts, and rely on `npm run oracle:test` to fail when either artifact is stale.

## Upgrading A Row

To improve an item to `exact` or `best_effort`, add or adjust a deterministic oracle fixture first, reference the compatibility id in fixture metadata, and set the row's `coverage.state` and `coverage.cases` only after the fixture passes. Set `contractReviewed: true`, replace generated rationale and contract text with reviewed wording, and remove the id from `docs/agent-browser-compatibility-baseline.json` when fixture coverage replaces legacy debt.

When refreshing mirrored docs, update the docs mirror, run `node scripts/oracle/generate-compatibility-artifacts.mjs`, review manifest hash changes, rerun inventory validation, and update matrix/source metadata in the same change when needed.

Run `npm run oracle:test`, `npm run oracle:compare`, and `npm run oracle:report` before landing the change. Use `npm run --silent oracle:report:json` when another tool needs parseable report output.
