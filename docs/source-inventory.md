# Source Inventory

Last reviewed: 2026-06-25

This inventory records which public source sets are authoritative for `pire-browser`, which artifacts are generated or runtime-only, and where public ambiguity lives. It is intentionally not a file-by-file listing.

## Authoritative Source Sets

| Source set | Role | Notes |
| --- | --- | --- |
| `cli/Cargo.toml`, `cli/Cargo.lock` | Rust workspace | Workspace root for the CLI, core library, and Native Messaging host. Run Rust commands from `cli/`, for example `cd cli && cargo test -q`. |
| `cli/pire-browser-core/` | Core Rust implementation | CLI parsing, launch/session lifecycle, managed Firefox profile import, IPC, setup/status, encrypted auth vault, state, policy guardrails, Firefox integration, and shared protocol behavior. |
| `cli/pire-browser-cli/` | User-facing executable | CLI entrypoint, command/error presentation over the core crate, and the stdio MCP server. |
| `cli/pire-browser-host/` | Native Messaging host | Firefox extension bridge to the Rust core and per-user CLI IPC. |
| `extension/src/` | Firefox WebExtension source | Browser-side command handling, DOM inspection/actions, dialogs, refs, frames, and screenshot capture. |
| `pi/extensions/` | Pi extension adapters | Pi-facing runtime wrapper/helpers for `pire-browser`; tests are repository-only. |
| `agent/` | Installed agent guidance | Public routing context for installed packages; directs agents to compact workflow/reference files. |
| `pire-browser.schema.json` | Config schema | Authoritative packaged JSON Schema for `pire-browser` config defaults and credential-provider plugin entries; referenced from README and skill examples. |
| `agent-browser.schema.json` | Legacy config schema alias | Tracked filename alias for existing configs that reference the earlier schema path; mirrors the supported config keys including `plugins`. |
| `skills/pire-browser/SKILL.md` | Installed skill discovery stub | Small skill entry point that points agents to the version-matched runtime skill command. |
| `skill-data/core/SKILL.md`, `skill-data/dogfood/SKILL.md` | Runtime skill content | Full core and specialized QA skills served by `pire-browser skills cat/get/path <name>` through Rust `include_str!` and by the JS launcher fallback; `PIRE_BROWSER_SKILLS_DIR` / `AGENT_BROWSER_SKILLS_DIR` can override the runtime skill root for local skill development. Keep version matched to CLI behavior. |
| `bin/pire-browser.js`, `scripts/platform.mjs`, `scripts/pi-install-migration.mjs`, `scripts/pi-postinstall.mjs` | Public npm launcher/install helpers | Root package launcher, platform resolver, Pi duplicate-source reconciliation helper, and postinstall setup. |
| `platform-packages/` | Native package metadata | Version-matched scoped optional npm package manifests for each supported OS/architecture. |
| `docs/src/`, `docs/public/`, `scripts/build-pages-site.mjs` | Public docs site source and generator | Product-facing route registry, one-module-per-route docs content under `docs/src/pages/`, shared block helpers in `docs/src/blocks.mjs`, feature-status labels, search index generation, and static assets for the generated Pages site. |
| `docs/src/feature-status.mjs` | Public docs reality map | Curated site-facing feature status derived from README, skill content, CLI/help surface, and extension behavior. |
| `docs/compatibility-summary.md` | Public compatibility summary | Coarse product-facing status table. Do not use it for detailed planning or implementation priority. |
| `tests` fixture tree | Test fixtures | Local HTML/session fixtures and shared policy contract fixtures. |
| `scripts/` | Maintainer automation | Install, package, smoke, state/session/policy/download/upload lifecycle, trusted npm publishing helpers, release validation, and repository-only tests for packaged install helpers. |
| `.github/workflows/` | Public CI/release automation | Pages deployment, platform package builds, trusted npm publish, and packed-release smoke checks. |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`, `.gitattributes` | Public entry points | Product scope, usage, release notes, package scripts, license terms, npm package shape, and repository line-ending/binary policy. |

## Generated Or Runtime Artifacts

| Artifact set | Classification | Notes |
| --- | --- | --- |
| `cli/target/` | Generated Rust build output | Local cargo artifacts for the Rust workspace. Rebuild instead of reviewing as source. |
| `target/` | Generated/runtime output | Smoke artifacts, staged package artifacts, runtime diagnostics, and release-validation logs. |
| `site/` | Generated public Pages output | Ignored local output created by `scripts/build-pages-site.mjs` and uploaded by `.github/workflows/pages.yml`. |
| `node_modules/`, `extension/node_modules/` | Generated dependency installs | Recreate from lockfiles. |
| `extension/dist/` | Generated extension output | Built from `extension/src/`; keep in sync only when packaging or tests require checked-in dist output. |
| `extension/pire-browser.xpi` | Generated extension package | Created by `scripts/package-extension-xpi.mjs`; direct-XPI validation is opt-in. |
| `bin/<platform>-<arch>/` | Generated platform binaries | Local/CI build output copied from `cli/target/...` by platform packaging scripts; ignored and regenerated. |
| Public root npm package contents | Curated distribution surface | `package.json#files` should include the JS launcher, Pi extension runtime, extension assets, `agent/`, `skills/`, `skill-data/`, root `pire-browser.schema.json`, legacy `agent-browser.schema.json`, required postinstall scripts, `LICENSE`, and `README.md`; it should exclude `docs/`, repository test fixtures, `site/`, `cli/`, and native binary directories. |
| Public platform npm package contents | Curated native distribution surface | Each optional package should include only its native binary pair, README, LICENSE, and package metadata. |
| `.pire-state/`, OS app-data `pire-browser/` directories | Local runtime state | Sessions, profiles, profile-import metadata, encrypted auth vault/key files, cookies, confirmations, downloads, uploads, policies, bounded redacted activity logs, dashboard state/log files, and update cache are not portable source. |
| Root logs, screenshots, profiler bundles, recording bundles, and CSV captures | Runtime/background artifacts | Manual-session outputs, `profiler stop` JSON bundles, `record stop` screenshot-sequence evidence directories, and local diagnostics are not authoritative implementation source. |

## Conflicts Or Ambiguities

- `extension/dist/` can diverge from `extension/src/`; prefer `extension/src/` for implementation review and rebuild dist intentionally.
- Launch defaults to `web-ext` even when `extension/pire-browser.xpi` exists; direct Firefox/XPI launch is opt-in through `PIRE_BROWSER_EXTENSION_MODE=xpi`.
- Runtime session artifacts under `target/`, `.pire-state/`, and OS app-data directories may be useful evidence for a session but are not product source.
- Installed package guidance under `agent/` is authoritative for public installs; repository docs under `docs/` are product-facing development context.
- The public Pages site under `site/` is generated from `docs/src/` and `docs/public/`; regenerate instead of editing generated pages by hand.

## Missing Context

- npm trusted publishing generates npm provenance from `.github/workflows/npm-publish.yml` after each package trusts the workflow in npm.
- GitHub Pages still needs the repository setting `Settings > Pages > Build and deployment > Source: GitHub Actions` before `.github/workflows/pages.yml` can deploy the site.
