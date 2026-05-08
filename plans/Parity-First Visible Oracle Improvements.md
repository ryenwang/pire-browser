# Parity-First Visible Oracle Improvements

## Status
Superseded by the schema v2 oracle runner in `scripts/oracle/compare.mjs` and `fixtures/oracle/cases.json`.

The implemented shape keeps one deterministic source of truth instead of adding a parallel visible tape system:

- `npm run oracle:compare` runs the canonical paired CLI oracle against local fixtures.
- `npm run oracle:visible:compare` and `npm run oracle:visible` run a headed subset of visible-safe local fixture cases.
- `npm run oracle:visible:pi` keeps the model-backed Bing side-by-side demo as optional smoke only.
- `npm run oracle:report` reports the newest coverage-complete deterministic run by default.
- `npm run oracle:ci` runs the local Epic 0 gate.

Future visible-oracle work should extend the v2 cases and runner rather than introducing another case format.
