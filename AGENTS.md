# Contributor Agent Guide

This repository uses `npm` at the root. Do not introduce `pnpm` or a workspace layout unless a future change explicitly adopts it.

## Where To Start

- Product development context lives in `docs/CONTEXT.md`.
- Installed-package behavior and agent-facing runtime guidance live in `agent/CONTEXT.md`.
- Source ownership and generated-artifact policy live in `docs/source-inventory.md`.
- Rust work lives under `cli/`; run Rust checks from there, for example `cd cli && cargo test -q`.
- Public docs site source lives under `docs/src/` and `docs/public/`; generated `site/` output is ignored.

## Update Matrix

When changing user-facing behavior, update every affected surface:

- `README.md`
- CLI help/output and tests
- `skill-data/core/SKILL.md`
- `agent/` workflow/context guidance
- docs site source under `docs/src/`
- package/build/release tests and smoke scripts

When changing installed-package contents, also update `package.json#files`, `agent/source-inventory.md`, and package verification scripts.

## Public Boundary

Keep this public repo focused on product source, public user docs, release automation, package metadata, and public tests. Do not add parity internals, roadmap tracking, private planning, reviewer notes, owner/priority metadata, oracle tooling, or implementation-planning rationale here.

Public compatibility material must stay coarse and user-facing. `docs/compatibility-summary.md` may summarize feature areas, but detailed parity tracking belongs outside this repo.
