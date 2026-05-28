# State Inspect And Save Guardrails Slice

## Summary
Add a safety-focused follow-up after the Profile State Save/Load slice. Provide explicit metadata-only `state inspect`, warn when saving plaintext state outside `.pire-state/`, and keep upstream-compatible `state show` unavailable because upstream returns parsed state content.

## Key Changes
- Add local `pire-browser state inspect <path>` and `--json`.
  - Requires no Firefox session and never contacts the extension.
  - Hard-fails on missing files, files over 50 MiB, non-UTF-8, malformed JSON, unsupported schemaVersion, or non-`pire-browser` active-origin state shape.
  - Plain and JSON output include path, schemaVersion, kind, createdAt, origin, query/fragment-stripped display URL, optional profile/session labels, bytes, and counts only.
  - Never print cookie names/values, storage keys/values, raw URL query values, or raw URL fragments.
- Keep `state show`, `state list`, `rename`, `clear`, `clean`, encryption, expiration, auth vault, and profile export/import returning `NotAvailableError`.
- Add `.pire-state/` to `.gitignore` and warn when `state save` writes outside that directory.

## Test Plan
- Rust parser/help tests for `state inspect`, `state inspect --json`, missing path, and `state show` remaining unavailable.
- Rust inspect tests with distinct sentinels for cookie name/value, storage key/value, URL query, and fragment.
- Rust error tests for missing file, oversized file, non-UTF-8, malformed JSON, schema drift, wrong tool/kind, missing source, and URL/origin mismatch.
- Update `npm run smoke:state` to inspect after save and assert pinned count keys plus no sentinel leakage.

## Assumptions
- Plain `state inspect` remains advisory/read-only; enforced flows are handled by the follow-up State URL Hygiene And Inspect-Gated Load slice through explicit `state inspect --record` and `state load --require-inspected`.
- Showing the origin hostname is allowed; query strings, fragments, cookie/storage names, and all state values are not.
