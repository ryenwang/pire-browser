# Source Inventory

Last reviewed: 2026-05-30

This inventory records which source sets are authoritative for `pire-browser`, which artifacts are generated or runtime-only, and where historical context or ambiguity lives. It is intentionally not a file-by-file listing.

## Authoritative Source Sets

| Source set | Role | Notes |
| --- | --- | --- |
| `crates/pire-browser-core/` | Core Rust implementation | CLI parsing, launch/session lifecycle, IPC, install/status, state, domain, and action policy guardrails, Firefox integration, and shared protocol behavior. |
| `crates/pire-browser-cli/` | User-facing executable | Thin CLI entrypoint and command/error presentation over the core crate. |
| `crates/pire-browser-host/` | Native Messaging host | Firefox extension bridge to the Rust core and Windows named-pipe session handling. |
| `extension/src/` | Firefox WebExtension source | Browser-side command handling, DOM inspection/actions, dialogs, refs, frame handling, and screenshot capture. |
| `pi/extensions/` | Pi extension adapters | Pi-facing wrappers for `pire-browser` and the `agent-browser` oracle adapter. |
| `scripts/` | Maintainer automation | Install, package, smoke, state/named-session/domain-policy lifecycle, RBXLX download, and oracle comparison workflows. |
| `fixtures/` | Test fixtures | Local HTML state/session fixtures, oracle fixture data, and shared policy contract fixtures such as domain URL verdicts, action-policy command maps, and action-policy verdicts. |
| `docs/` | Project documentation | Architecture, compatibility matrix, unsupported-root metadata, oracle workflow, and feature-parity notes. |
| `docs/CONTEXT.md` | Agent work contract | Functional-boundary labels, session-review requirements, redaction rules, and canonical source pointers. |
| `docs/workflows/` | Process workflows | Human-reviewable staged workflows for session review, roadmap mapping, and follow-up artifact decisions. |
| `plans/` | Planning record | Current and historical implementation plans, implementation-ready parity mapping contracts, compatibility epic slices, and roadmap-visible operational backlog notes. |
| `plans/Operational Gap Backlog - 2026-05-26.md` | Session-derived backlog | First operational gap note created from the May 26, 2026 session review. |
| `mvp.md`, `README.md`, `package.json`, `Cargo.toml`, `.gitattributes` | Entry points | Product scope, usage, package scripts, Rust workspace shape, and repository line-ending/binary policy. |

## Generated Or Runtime Artifacts

| Artifact set | Classification | Notes |
| --- | --- | --- |
| `target/` | Generated/runtime | Rust build output, oracle runs, visible-session artifacts, local app data mirrors, and logs. Do not treat as source of truth unless reviewing a specific run artifact. |
| `node_modules/`, `extension/node_modules/` | Generated dependency installs | Recreate from lockfiles. |
| `extension/dist/` | Generated extension output | Built from `extension/src/`; keep in sync only when packaging or tests require checked-in dist output. |
| `bin/win32-x64/` | Packaged binaries | Prebuilt distributable binaries; source remains in `crates/` and `extension/src/`. |
| `.pire-state/` | Local sensitive runtime state | Gitignored plaintext cookies/Web Storage state files created by operator workflows; inspect metadata only and do not commit contents. |
| `%LOCALAPPDATA%\pire-browser\state-receipts\` | Local runtime metadata | Per-user 24-hour receipts written by `state inspect --record` for opt-in `state load --require-inspected` checks; not portable source. |
| Root `discord-*`, `gofile-*`, `rbxlx-*`, `web-ext*.log`, screenshots, and CSV captures | Runtime/background artifacts | Historical scraping/download evidence and manual-session outputs, not authoritative implementation source. |

## Historical And Background Material

| Source set | Role | Notes |
| --- | --- | --- |
| `agent-browser-snapshot/`, `agent-browser.dev/`, `agent-browser.dev-pages/` | Mirrored upstream/background docs | Use as captured reference material only; the generated compatibility docs and manifest in `docs/` are the project-facing contract. |
| `docs/feature-parity/agent-browser/` | Compatibility denominator | Mirrored and annotated `agent-browser` documentation rows used to plan and track parity. |
| `docs/agent-browser-compatibility*.json` | Compatibility metadata | Generated/curated matrix and baseline data; update through oracle/compatibility scripts rather than ad hoc edits. |

## Conflicts Or Ambiguities

- `extension/dist/` can diverge from `extension/src/`; prefer `extension/src/` for implementation review and rebuild dist intentionally.
- Checked-in binaries under `bin/win32-x64/` may not match local `target/` builds; use source plus build metadata when diagnosing behavior.
- Runtime session artifacts under `target/` and `%LOCALAPPDATA%\pire-browser` may describe useful evidence for a session but are not product source.
- Some root-level Discord/Gofile/RBXLX artifacts document prior manual automation work and should not be confused with current automated test fixtures.

## Missing Context

- No single release provenance file currently ties `bin/win32-x64/` binaries to a source commit/build command.
- The boundary between checked-in generated compatibility JSON and hand-reviewed compatibility decisions is documented across oracle scripts and plans rather than in one short contributor guide.
