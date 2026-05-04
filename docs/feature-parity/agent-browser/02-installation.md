# Installation

Source: https://agent-browser.dev/installation

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Global installation (recommended)

- [ ] Support documented usage: `npm install -g agent-browser`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]-able. Need an npm wrapper package that ships a `postinstall` script downloading the right pire-browser binary from GitHub Releases, like `esbuild`/`turbo` do. Wrapper bin script delegates to the binary. Add `npm/pire-browser/` package with `optionalDependencies` per platform, target `npm install -g pire-browser` working on win/mac/linux once those platforms are supported by the core.
- [N] `agent-browser install` - Download Chrome from Chrome for Testing (first time)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
  - Claude feedback: Agree the literal "download Chrome" is [N] (we use Firefox), but reframe as `pire-browser install` that (1) detects/downloads Firefox if missing using Mozilla's release CDN, (2) registers the native messaging manifest, (3) installs the unpacked extension. We already have steps 2-3 split across `setup` and `launch`. Step 1 just needs Mozilla download URL fetching (`https://download.mozilla.org/?product=firefox-latest-ssl&os=...`). Achievable.

## Quick start (no install)

- [N] Support documented usage: `npx agent-browser install # Download Chrome (first time only)`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
  - Claude feedback: Same as above — reframe as `npx pire-browser install` that downloads Firefox + registers the host. With an npm wrapper this becomes free. Recommend [P]-once-wrapper-exists.
- [ ] Support documented usage: `npx agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P] once npm wrapper exists. Today: `pire-browser open example.com` works only after `launch`. With auto-launch on missing session + npm wrapper, `npx pire-browser open example.com` would be a single-command UX.

## Project installation (local dependency)

- [ ] Support documented usage: `npm install agent-browser`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Same as `-g` install above — needs npm wrapper. Project-local install is essentially free once the global wrapper works (just drop the `-g`).
- [N] Support documented usage: `npx agent-browser install # Download Chrome (first time)`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
  - Claude feedback: Same comment as the earlier install bullets — reframe as Firefox bootstrap. Achievable as [P].

## Homebrew (macOS)

- [ ] Support documented usage: `brew install agent-browser`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Blocked on macOS port — see 01-introduction comments. Once macOS is supported, a `brew tap` + formula pointing at GitHub Release tarball is straightforward (<200 LOC of Ruby in the formula). The formula's `post_install` should run `pire-browser setup` to register the native host manifest at `~/Library/Application Support/Mozilla/NativeMessagingHosts/dev.pi.pire_browser.json`.
- [N] `agent-browser install` - Download Chrome (first time)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve a fixture download endpoint, trigger it from the CLI, then assert the downloaded file path, size, and content hash.
  - Claude feedback: Same as earlier — reframe as Firefox install. With Homebrew, Firefox is available as a cask (`brew install --cask firefox`); our `install` could just delegate to it on macOS. Achievable as [P].

## From source

- [ ] Support documented usage: `cd agent-browser`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Trivially "works" — this is just `cd`. Equivalent in pire-browser is `cd browser-automation`. Mark this as Documentation rather than a feature. [F] if we add a "From source" doc section.
- [ ] Support documented usage: `pnpm install`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]. We don't use pnpm at the workspace root — root has `npm` package.json with vitest dev dep, and `extension/` has its own `npm install`. Switching to pnpm workspaces would unify this and we'd get pnpm install for free, but it's a refactor. Easier path: document `npm install` (root) + `npm --prefix extension install` (already in install_status.rs check). [F] if we accept the npm equivalent.
- [ ] Support documented usage: `pnpm build`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Same — suggest [F] via `npm run build:extension` (already exists in package.json scripts). Add a top-level `build` script that does both `cargo build` + extension build for full parity.
- [ ] Support documented usage: `pnpm build:native`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]. Equivalent today is `cargo build --workspace --release`. Add `npm run build:native` to package.json that shells out to cargo. Trivial.
- [ ] Support documented usage: `pnpm link --global`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]. The Rust binary doesn't go through pnpm linking; equivalent is `cargo install --path crates/pire-browser-cli` which puts `pire-browser` on PATH. Document that as the link step.

## Linux dependencies

- [ ] `agent-browser install --with-deps`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [N] for now. agent-browser's `--with-deps` installs Chromium's Linux .deb dependencies (libnss, libatk, etc.). Firefox-on-Linux has its own dependency story but the package is monolithic. Most users get Firefox via apt/dnf which handles deps. If we genuinely need this, add a Linux-only `install --with-deps` that runs `apt-get install firefox` or invokes Mozilla's tarball. Low priority until Linux port lands.

## Updating

- [ ] `agent-browser upgrade`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]-able. Implement `pire-browser upgrade` that (1) checks GitHub Releases for newer version (compare with cargo Cargo.toml version), (2) downloads platform binary, (3) replaces the in-place binary (Windows requires the trick of renaming current exe and writing new one — see `self_update` crate). Also re-run setup to ensure manifest path is current. ~1 day of work using `self_update` crate.

## Doctor

- [P] `agent-browser doctor` - Full diagnosis
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [P]. We have `pire-browser install-status` which is essentially `doctor` (checks Firefox path, native host binary, manifest, registry, extension source/build, default profile, launcher PID, startup policies, live sessions). Gaps vs agent-browser doctor: no network reachability test, no permission check, no Chrome version reporting (N/A for us — Firefox version reporting would be the equivalent). Rename to `doctor` or alias for parity. Should be [F] after that rename + Firefox version check.
- [P] `agent-browser doctor --offline --quick` - Local-only, fastest (~<1s)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Claude feedback: Agree [P]. `install-status` is already offline+quick (just file/registry stat). Add `--offline` and `--quick` flags as no-ops for compatibility, mark [F].
- [P] `agent-browser doctor --fix` - Also run destructive repairs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [P]. Today install-status reports issues but doesn't fix them. Add `--fix` that re-runs `setup_windows`, `npm --prefix extension run build`, deletes stale session files, and reinstalls the manifest. Each remediation should be opt-in (confirm before destructive ops or use `--yes`).
- [P] `agent-browser doctor --json` - Structured output
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
  - Claude feedback: Agree [F]. `install-status --json` already exists and emits the full `InstallStatusReport` via `install_status_json`. Mark [F] outright; just rename `install-status` → `doctor` for parity.

## Custom browser

- [P] `agent-browser --executable-path /path/to/chromium open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [P]. We support this for `launch` via `--firefox-path` (LaunchOptions.firefox_path). Aliasing `--executable-path` -> `--firefox-path` would be free. Note: must be a Firefox binary; Chromium won't load our extension.
- [ ] Support documented usage: `AGENT_BROWSER_EXECUTABLE_PATH=/path/to/chromium agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [P]-able. Add `PIRE_BROWSER_FIREFOX_PATH` env var to LaunchOptions resolution in `discover_firefox`. Trivial. We already check `PIRE_BROWSER_EXE` in the Pi extension wrapper.
- [N] Serverless - Use @sparticuz/chromium (~50MB vs ~684MB)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [N]. @sparticuz/chromium is a Chrome-specific Lambda layer with custom binary stripping; no equivalent shipped for Firefox. Closest analog: a stripped Firefox build for serverless, but that requires custom toolchain. Lambda functions also can't talk to local Firefox via Native Messaging — the architecture is fundamentally different. Don't pursue.
- [N] System browser - Use existing Chrome installation
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Disagree — this is actually [F] when reframed for Firefox. `discover_firefox` walks the registry + common paths and finds the system Firefox. That's the default behavior unless the user passes `--firefox-path`. Mark [F] for "use system Firefox" parity.
- [ ] Custom builds - Use modified browser builds
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: [F] via `--firefox-path`. Pointing at a Firefox Nightly/dev build is supported as long as it's >=115 (manifest's `strict_min_version`). Document that.

## Serverless example

- [N] Use @sparticuz/chromium or similar to obtain a Chromium executable path, then pass it via --executable-path or AGENT_BROWSER_EXECUTABLE_PATH.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Agree [N] for Lambda-style serverless — the architecture (extension + native host stdio + named pipe + CLI) requires a long-lived process and OS-level pipes that AWS Lambda's container can't readily provide. Document explicitly as out-of-scope.

## AI agent setup

- [ ] agent-browser works with any AI agent out of the box. For richer context:
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: [F]. The CLI is shell-callable; any agent that runs commands can use it. We have a Pi-coding-agent integration in `pi/extensions/pire-browser.ts`. Could write a generic README section showing how to wire it up to Claude Code, Cursor, etc.

## AI coding assistants (recommended)

- [ ] Install the skill for your AI coding assistant:
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Suggest [N] currently. We don't ship a Skill yet. Easy fix: write `skills/pire-browser/SKILL.md` describing the command surface (open/snapshot/find/click/fill/etc.), publish it under the existing skills convention, and add `pire-browser skill install` to the CLI to drop it into the active skills directory. The Skill format is well-documented in this repo's existing `skills-plugin` directory.
- [ ] This works with Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Goose, OpenCode, and Windsurf. The skill is fetched from the repository and stays up to date automatically.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Same as above — depends on having a SKILL.md to fetch. Recommend [N] until skill exists, then [F] is straightforward (publish the skill on GitHub, fetch via raw.githubusercontent URL).
- [ ] Do not copy SKILL.md from node_modules -- it will become stale as new features are added. Always use npx skills add or reference the repository version.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Claude feedback: This is a documentation/policy item, not a feature. [F] simply by writing this guidance into our README/SKILL.md docs.

## AGENTS.md / CLAUDE.md

- [ ] Add to your instructions file:
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Claude feedback: Documentation. [F] once we publish a snippet of `pire-browser` invocation patterns suitable for AGENTS.md / CLAUDE.md. Should include: how to find a session, the prefer-`-i` snapshot flow, the ref-then-act pattern.
