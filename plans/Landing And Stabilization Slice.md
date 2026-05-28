# Landing And Stabilization Slice

## Summary
Prepare the current stacked `pire-browser` worktree for review and landing as one integration PR from `codex/profile-state-save-load`. This pass does not add product behavior; it makes the already-implemented session/state/auth/clipboard stack reviewable, generated-artifact clean, and security-framed.

Land as one PR only if the underlying slice commits are preserved or the PR body maps the change by slice. Do not squash into one opaque commit unless the reviewer explicitly asks for that after review.

## Landing Audit

Every changed file should be accounted for before PR creation:

| File group | Expected reason |
| --- | --- |
| `.gitignore`, `.gitattributes` | Git hygiene for `.pire-state/` and line-ending/binary policy. |
| Rust CLI/core/host | State save/load/inspect, URL hygiene, receipts, strict state policy diagnostics, and secret-safe host logging. |
| Rust clippy sweep | Behavior-preserving landing fixes in CLI/core files such as command suggestion auto-deref, Firefox discovery iterator use, Windows IPC attributes, `npx` command returns, and session text formatting. |
| Extension source/dist/tests | Active-origin state export/import helpers and rebuilt checked-in extension dist. |
| `fixtures/state.html`, `scripts/smoke-state.ps1`, `package.json` | State smoke fixture, strict-policy smoke coverage, and `npm run smoke:state`. |
| `scripts/smoke-named-sessions.ps1` | Landing-gate reliability fix: use an isolated per-run `CARGO_TARGET_DIR`, mirroring `smoke-state.ps1`, so the smoke does not collide with a live `target/debug/pire-browser-host.exe`. |
| README and Pi wrapper | Operator examples for named profiles, state handoff, receipt gates, and policy overrides. |
| Feature-parity/source-inventory/generated docs | Implementation notes, source classification, docs manifest regeneration; no hand-edited compatibility status upgrade. |
| Plan/backlog notes | Reviewable record for state safety, URL hygiene/receipts, strict policy, and operational-gap progress. |

Before staging, confirm there are no tracked or staged runtime artifacts from `.pire-state/`, `%LOCALAPPDATA%\pire-browser\state-receipts`, `target/state-smoke/`, `target/named-session-smoke/`, or `target/agent-browser-oracle/runs/`.

Line-ending policy was introduced during this landing pass through `.gitattributes`. Verify that any renormalization would touch only already-modified files with identical logical diffs; do not accept broad unrelated LF/CRLF churn into the PR.

## Generated Artifact Gate

Regenerate artifacts, then require a clean generated diff:

1. Run `npm --prefix extension run build`.
2. Run `node scripts/oracle/generate-compatibility-artifacts.mjs`.
3. Verify `git diff -- extension/dist docs/agent-browser-docs-manifest.json docs/agent-browser-unsupported-roots.json` contains only intentional changes already explained by source/docs edits.
4. Rerun both generation commands and require that the same generated paths do not change again.
5. Do not hand-edit `docs/agent-browser-compatibility.json`; compatibility status upgrades remain gated by Epic 1 fixture coverage.

## PR Narrative Draft

Use this structure for the PR body:

```markdown
## Security posture
State files are plaintext secrets containing cookies and Web Storage. `.pire-state/` is gitignored by convention, not enforcement. `state inspect --record`, `state load --require-inspected`, and `PIRE_BROWSER_REQUIRE_INSPECTED_STATE=1` are cooperative operator guardrails, not a security boundary; anyone who can run the CLI can choose the explicit override.

Diagnostics redact secret-shaped values in CLI errors, Pi diagnostics, oracle artifacts, and recovery probes. Successful state files intentionally contain the requested browser state, and successful `clipboard read`/state-file contents are not redacted payloads.

## Slice map
- Profile state save/load: active-origin cookies, localStorage, and sessionStorage.
- State inspect guardrails: metadata-only inspect, `.pire-state/` warning, malformed/oversized file hardening.
- URL hygiene and receipts: stripped display URLs, local 24-hour inspect receipts, `--require-inspected`.
- Strict state policy: env-backed default receipt requirement plus audited `--no-require-inspected`.
- Landing hygiene: `.gitattributes`, generated-artifact checks, docs/source inventory, behavior-preserving clippy fixes, and named-session smoke target isolation.

## Compatibility posture
This PR adds `pire-browser` behavior and implementation notes but does not upgrade compatibility status unless covered by the existing Epic 1 oracle process. Generated compatibility JSON is not hand-edited.

## Verification
Include command results, the final successful `oracle:compare` run artifact path, and any allowed retry details.

## Reviewability notes
- Clippy sweep: behavior-preserving cleanup only; no product behavior is intended.
- Named-session smoke isolation: uses an isolated per-run `CARGO_TARGET_DIR` because the landing gate exposed `target/debug/pire-browser-host.exe` lock contention from live Firefox native-host processes.
- Line endings: `.gitattributes` adds LF/binary policy; renormalization was checked for no unrelated repo-wide churn.
- Oracle flakes: if the one allowed retry is used, include the failed and successful artifact paths plus the exact first failure text.
```

Known oracle flake policy: one retry is allowed only for external/infrastructure failures already observed, such as `Socket directory '<PATH>' is not writable: Access is denied. (os error 5)` from `agent-browser`, or the previously observed transient page-load timeout. Capture the exact failure text and failed run artifact path in the PR. A second failure, or any `pire-browser`-side failure, blocks landing.

## Test Plan

Run the final gate:

- `cargo test`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `npm run test`
- `npm --prefix extension run test`
- `npm run oracle:test`
- `npm run smoke:named-sessions`
- `npm run smoke:state`
- `npm run oracle:compare`
- `cargo fmt --check`
- `git diff --check`
- `git status --short --untracked-files=all`

If `target/debug/pire-browser-host.exe` is locked during Rust build or clippy, stop only workspace `pire-browser-host.exe` processes whose command line points at `C:\Users\wangr\browser-automation\target\debug\pire-browser-host.exe`, then rerun the blocked command.

## Assumptions
- This is stabilization only; domain/action policy guardrails wait until after this stack lands.
- Preserve unrelated user/worktree changes unless the landing audit proves they are generated stale output or accidental runtime artifacts.
- `receiptTtlMs` remains in `statePolicy` as informational receipt-subsystem metadata.
