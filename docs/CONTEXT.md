# Project Context Contract

This file defines the public working contract for agent-led `pire-browser` development. It does not change runtime behavior.

## Public Development Boundaries

- Keep this repository focused on product source, public user documentation, release automation, package metadata, and public test fixtures.
- Keep public docs product-facing: describe what `pire-browser` does, which commands are available, and what current backend limits users should expect.
- Do not add private planning notes, detailed roadmap tracking, or implementation priority notes to this public repo.
- Use `docs/compatibility-summary.md` only as a coarse public status table.

## Redaction Rules

- Never include raw access tokens, refresh tokens, session cookies, OAuth secrets, passwords, one-time login codes, or full authorization URLs with sensitive query parameters.
- Prefer describing sensitive values by role, such as `OAuth callback code`, `session cookie`, or `Google OAuth client secret`, rather than by value.
- Redact sensitive URL query values such as `code`, `access_token`, `refresh_token`, `id_token`, `token`, `client_secret`, `password`, and `api_key`.
- Redact authorization and cookie evidence by type only, for example `Authorization: Bearer [REDACTED]` or `Cookie: [REDACTED]`.
- If command output contains secrets, summarize the outcome and record where the secret was stored only when that storage location is safe to mention.
- Screenshots used as public evidence should avoid showing account identifiers, secret fields, or private user data.
- When unsure, redact first and preserve enough surrounding context to explain the workflow impact.

## Canonical Public Sources

- `README.md` is the primary public usage and development entry point.
- `docs/architecture.md` describes the public architecture and runtime constraints.
- `docs/compatibility-summary.md` gives a coarse public status summary.
- `docs/source-inventory.md` records which public source sets and generated artifacts are authoritative.
- `docs/src/` and `docs/public/` are the source for the generated public Pages site under ignored `site/`.
- `agent/`, `skills/`, and `skill-data/` are authoritative for installed-agent guidance shipped in the public package.
- `cli/` is the Rust workspace for the CLI, core library, and Native Messaging host. Run Rust checks from there, for example `cd cli && cargo test -q`.
