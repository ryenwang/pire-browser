# Changelog

## 0.3.0-beta.1

- Makes ordinary and named Firefox sessions ephemeral, with marker-validated cleanup and temporary default downloads.
- Adds namespaced compact restore for all cookies plus origin-keyed `localStorage`, including idle/close autosave, validation guards, expiry, and optional AES-256-GCM encryption.
- Splits profile behavior into temporary snapshots for named Firefox sources and intentionally durable explicit profile paths, while preserving 0.2.x profiles with usage, cache-clean, and confirmed delete tools.
- Extends packed release smoke across Windows, macOS, and Linux to verify cleanup, restore, source immutability, durable paths, download retention, orphan recovery, and a 100-session storage stress pass.

## 0.2.35

- Makes `skills get core` a compact first-use workflow and moves the extended command catalog behind `skills get core --full`.
- Reduces the default MCP core profile to 31 tools with smaller shared schemas while preserving advanced tools and aliases in focused profiles or `all`.
- Adds deterministic context-budget and release-version gates plus optional live agent workflow evaluations.

## 0.2.34

- Adds one canonical QA evidence loop across README, docs, installed agent context, and bundled skills.
- Aligns the README and Pages site with agent-browser.dev, including the logo, compatibility tagline, and a first-class Plugins reference.

## 0.2.33

- Adds a logged-in app QA starter recipe that combines discovered Firefox profile import, stable worktree-scoped sessions, restore diagnostics, snapshots, and screenshot evidence.
- Tightens top-level CLI help so `profiles` advertises managed plus importable Firefox profiles and shows the `profiles import Default --name Work` path instead of the old directory-only shorthand.
- Updates README, docs, installed agent context, and bundled skills so agents use the new profile discovery workflow without asking for obscure Firefox profile paths.

## 0.2.32

- Adds local Mozilla Firefox profile discovery to `pire-browser profiles`, including JSON `importableFirefoxProfiles`, so agents can find importable logged-in Firefox profiles without asking for obscure profile paths.
- Lets `profiles import` accept a discovered Firefox profile name or the `Default` alias for the discovered default profile, while preserving the safer copy-into-managed-profile model.
- Updates README, docs, installed agent guidance, MCP tool descriptions, and tests for the logged-in QA profile reuse workflow.

## 0.2.31

- Improves agent-browser parity discoverability for already-supported mouse button/wheel commands, dialog accept/dismiss commands, bare `skills`, and `snapshot --depth`.
- Updates README, docs, installed agent guidance, CLI help, and tests so agents can find these workflows without source inspection.

## 0.2.30

- Documents bare `pire-browser snapshot` as the agent-browser-compatible default across CLI help, README, docs, installed agent context, Pi prompt guidance, and the bundled core skill.
- Keeps `snapshot -i` available and documented as the explicit legacy ref-list format so existing workflows remain compatible.

## 0.2.29

- Compresses the public README and docs-site first-use path to match agent-browser's installation-first shape: global install, `pire-browser install`, then `open` and `snapshot -i`.
- Updates bundled core skill guidance so agents treat setup as a one-time direct-CLI step and start normal browser work at open/snapshot instead of rerunning diagnostics.

## 0.2.28

- Adds agent-browser-style help/discovery for supported browser history commands: `pire-browser back`, `pire-browser forward`, and `pire-browser reload`.
- Updates the bundled core skill with a short navigation-history recipe so agents re-snapshot after history navigation or reloads.

## 0.2.27

- Makes default `web-ext` launches prefer the package-local runtime dependency installed with `pire-browser`, falling back to `npx --yes web-ext` only for source/dev environments without npm dependencies.
- Adds packed-smoke and artifact-verifier coverage so release candidates fail before publishing if the root package is missing the default `web-ext` dependency.

## 0.2.26

- Bounds managed-profile process discovery during Firefox launch recovery so a stalled Windows WMI/PowerShell or Unix `ps` scan cannot freeze later named-session commands before they reach the browser bridge.
- Adds focused Rust coverage for the timeout helper that captures successful command output and kills slow process scans.

## 0.2.25

- Adds `open/goto/navigate --device <name>` so the first page request can receive the selected mobile User-Agent before navigation.
- Upgrades `device` / `set device` from viewport-only behavior to a Firefox best-effort device environment: viewport resize, request User-Agent override, and page-level navigator/touch shims with documented native mobile limits.
- Exposes the typed MCP `device` field on open-like tools and updates README, docs, installed agent context, and bundled skill recipes to reduce mobile-emulation ambiguity.

## 0.2.24

- Documents the agent-browser-style no-global-install trial path with `npx -y pire-browser@latest open <url>` followed by `snapshot -i`.
- Adds a packed npx smoke script that runs the root and platform tarballs together through `npm exec --package`, proving the no-global path resolves version-matched native packages and launcher-served skill guidance without repo fallbacks.

## 0.2.23

- Adds Firefox window lifecycle commands for popup-style workflows: `pire-browser window list`, `pire-browser window switch <wN>`, and `pire-browser window close [wN]`, plus matching MCP tools in the `tabs` profile.
- Clarifies the agent-browser-style tab workflow across help, README, docs, and the bundled core skill: bare `pire-browser tab` lists tracked tabs, `pire-browser tab <id-or-label>` switches directly, and `pire-browser tab close` closes the active tab.

## 0.2.22

- Makes bare `pire-browser session [--json]` an agent-browser-compatible alias for current/default session diagnostics, while keeping `pire-browser session list` and plural `pire-browser sessions` for live-session inventory.

## 0.2.21

- Adds `pire-browser session info [--json]` as a read-only session/profile/restore diagnostic, including selected target status and suggested next actions for agent-browser-style restore workflows.
- Updates README, docs site, installed agent context, and bundled core skill to use `session info --json` when agents need to inspect restore state before acting.

## 0.2.20

- Preserves stdin for Windows npm-launched native commands that require it, including MCP stdio, `chat`, `eval --stdin`, `auth save --password-stdin`, `cookies set --curl -`, and stdin-driven `batch`.
- Makes source checkout dogfooding prefer freshly built Rust binaries before stale optional sidecars or transitional checked-in binaries.

## 0.2.19

- Improves MCP profile-mismatch errors so agents get the exact `--tools` profile combinations that expose a missing tool instead of a generic fallback hint.
- Aligns the in-band `pire_browser_tools_profiles` descriptions with the documented MCP profile surface for network waits, install/upgrade diagnostics, streams, tabs/windows, and state tools.

## 0.2.18

- Replaces remaining first-run status/auth/session guidance that pointed agents at lower-level `launch` with the public `open` workflow.
- Clarifies `launch --help` as a lower-level diagnostic path and keeps `open` as the normal launch/navigation command.

## 0.2.17

- Makes `doctor --json` and `install-status --json` recommend `pire-browser install` when Firefox Native Messaging registration is missing or mismatched, aligning machine-readable repair guidance with the documented first-run setup path.
- Clarifies installed-agent, README, and docs guidance so agents use `doctor --fix` only when they explicitly want the diagnose-then-repair wrapper.

## 0.2.16

- Makes `doctor --json` and `install-status --json` exit nonzero when setup health reports `data.ok: false`, so agents do not mistake a parseable diagnostic envelope for a healthy install.
- Clarifies installed-agent command guidance to inspect `data.ok` and `data.nextActions` during first-run repair.

## 0.2.15

- Improves first-run Firefox bridge diagnostics when `web-ext` exits before `pire-browser` connects or the extension session times out.
- Adds stable `Log:` and `nextActions` guidance to launch/connect failures so agents can run `doctor --json`, refresh setup, close managed Firefox/web-ext processes, and inspect the right log instead of guessing.

## 0.2.14

- Adds an isolated `smoke:pi-install` maintainer check that runs `pi install npm:pire-browser@<version>` against a temporary `PI_CODING_AGENT_DIR`, verifies package registration, and checks installed skill/version output without touching live Pi settings.
- Adds the Pi install smoke as a post-publish gate before GitHub release creation, and clarifies that npm `allow-scripts` warnings during Pi install are non-fatal unless the first browser command reports setup trouble.

## 0.2.13

- Shortens the first-use path across README, docs, launcher/native install help, setup success output, installed agent context, and the bundled core skill: install, run `pire-browser install`, then `open` and `snapshot -i`.
- Keeps repair and migration guidance available but frames `install --with-deps`, `doctor`, and Pi repair as fallback paths after setup or the first browser command reports a problem.

## 0.2.12

- Aligns native `pire-browser mcp --help` with the launcher-served MCP help so healthy installs and missing-native installs both show the same client config and profile-selection guidance.

## 0.2.11

- Adds copy-ready MCP client configuration examples to the README, docs site, launcher-served `mcp --help`, installed agent context, and bundled core skill.
- Clarifies profile selection for MCP-first agents: start with `core`, add the smallest needed profile, and reserve `all` for hosts that can tolerate the full tool surface.

## 0.2.10

- Makes the first-use MCP path explicit across the README, docs quick start, MCP page, installed agent context, and bundled core skill: start `pire-browser mcp --tools core`, then open, snapshot, act, wait, and verify with typed tools.

## 0.2.9

- Keeps `pire-browser mcp --help` useful from the JavaScript launcher when the optional native platform package is missing, so MCP-first agents can still discover `mcp --tools core` and profile guidance before repair.

## 0.2.8

- Marks Pi core runtime imports as optional peers so direct npm installs stay lean and avoid pulling Pi's dependency tree into normal CLI installs.
- Clarifies that skipped or blocked npm lifecycle scripts should be followed by an explicit `pire-browser install`.

## 0.2.7

- Keeps top-level help and setup/diagnostic command help available from the JavaScript launcher when the optional native platform package is missing.
- Points missing-native help output to version-matched skills and the concrete `--include=optional` reinstall command.

## 0.2.6

- Extends missing native package repair guidance to the first-run `install` and lower-level `setup` commands, including JSON output for agents.

## 0.2.5

- Keeps `doctor --json` and `install-status --json` useful when the optional native platform package is missing by serving a launcher-level diagnostic with concrete `--include=optional` reinstall guidance.
- Updates postinstall and installed-agent setup guidance to prefer the agent-browser-style `install` command over lower-level `setup` wording.

## 0.2.4

- Adds launcher-served `--version`, `-V`, and `version --json` output so agents can verify installed package resolution even when native setup needs repair.
- Aligns npm package, platform package, and Rust native version metadata for clearer public release diagnostics.
- Adds publish metadata checks so platform packages keep npm provenance-compatible repository metadata.

## 0.2.3

- Added deterministic Pi duplicate-install recovery with `pire-browser pi conflicts` and `pire-browser pi repair`.
- Kept old GitHub/local/ZIP-era install cleanup conservative, report-backed, and available through `npx -y pire-browser@latest pi repair` when Pi cannot start.

## 0.2.2

- Published public npm baseline for `pire-browser`.
- Ships local Firefox automation, Pi extension adapters, installed-agent guidance, public docs, and version-matched optional native packages.
