# Sessions, State, And Files

Use this for named sessions, profile reuse, persisted state, downloads, uploads, and schema issues.

## Inputs

- The intended session/profile continuity requirement.
- Any user-provided state, download, or upload path.
- The command output that reports live sessions, profile paths, state metadata, or file transfer locations.

## Process

1. Use default sessions for one-off work; use named sessions or profiles when continuity matters.
2. Inspect live sessions with `pire-browser session list --json` and managed profiles with `pire-browser profiles --json`.
3. Use `pire-browser --profile <name-or-path> ...` for reusable managed Firefox profiles.
4. Use `pire-browser --session <name> ...` for reusable named sessions, and `--session <uuid>` only for strict live-id targeting.
5. Use `state list --json`, `state show <name-or-path> --json`, `state save`, `state rename`, `state clear`, and `state clean` for `.pire-state` maintenance.
6. Verify downloaded files on disk and verify uploads through fresh page state.

## Audit

- `PIRE_BROWSER_PROFILE` and `PIRE_BROWSER_SESSION` supply defaults only when no explicit flag is present.
- Path-like profile values map to managed Firefox profile names under the `pire-browser` data directory.
- Current state schema is v1; unsupported future versions should fail clearly.
- Do not print or summarize cookie, localStorage, or sessionStorage values.
- Do not assume repository-relative paths when running from an installed package.

## Outputs

- The selected session/profile/state target.
- Metadata-only state summaries.
- Verified file paths and transfer outcomes.
