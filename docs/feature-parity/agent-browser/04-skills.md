# Skills

Source: https://agent-browser.dev/skills

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] agent-browser ships with skills that teach AI coding agents how to use it for specific workflows. Install a skill and your agent in Cursor, Claude Code, or Codex can automate browser tasks without manual guidance.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add CLI tests that list and fetch bundled skill content, then snapshot the returned metadata and version matching.
  - Claude feedback: Suggest [P] currently — we don't ship skills. Concrete first step: write `skills/pire-browser/SKILL.md` covering open/snapshot/find/click/fill/press/screenshot/tabs and embed in the binary via `include_str!` so `pire-browser skill cat <name>` serves it. Cursor/Claude Code/Codex have well-documented skill formats — the structure mirrors Anthropic skills (frontmatter + Markdown). Should be a one-day spike.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## CLI Command

- [ ] Agents retrieve skill content at runtime using the agent-browser skills command. This always serves content matching the installed CLI version, so instructions never go stale.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add CLI tests that list and fetch bundled skill content, then snapshot the returned metadata and version matching.
  - Claude feedback: Add `pire-browser skills list` and `pire-browser skills cat <name>` subcommands. Bundle skill markdown via `include_str!` from `skills/<name>/SKILL.md` at build time so version is locked to the binary. ~50 LOC. [P] once a skills set exists.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [P] All commands support --json for structured output.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
  - Claude feedback: Existing CLI parser already accepts `--json` globally and `format_cli_result` honors it. The skill subcommand would inherit this for free. [F] post-impl.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
  - GPT-5.5 review: Partially covered. Remote browser commands and `install-status --json` have structured output, but local commands like `status`, `launch`, and `setup` do not all expose JSON yet.
- [ ] Set the AGENT_BROWSER_SKILLS_DIR environment variable to override the skills directory path.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Add CLI tests that list and fetch bundled skill content, then snapshot the returned metadata and version matching.
  - Claude feedback: Add `PIRE_BROWSER_SKILLS_DIR` env var; if set, prefer reading from filesystem over `include_str!` baked content. Useful for skill development. ~10 LOC.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## How It Works

- [ ] This design solves the version drift problem: the installed SKILL.md rarely changes, while the CLI always serves content matching its own version.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add CLI tests that list and fetch bundled skill content, then snapshot the returned metadata and version matching.
  - Claude feedback: Documentation behavior. `include_str!` makes this automatic — content is baked into the binary at build time. Stub SKILL.md installed in user's project just calls `pire-browser skills cat core`.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Available Skills

- [ ] core -- Core browser automation: navigation, snapshots, forms, screenshots, data extraction, sessions, authentication, diffing, and the full command reference. Start here for most browser tasks.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Claude feedback: Suggest [P] until written. Should ship a `core` skill describing pire-browser's actual surface (open/snapshot/find/click/fill/press/scroll/wait/screenshot/tabs/close), the ref-then-act pattern, and the launch-before-remote workflow. Authentication and diffing should be marked "not yet supported" in the skill so agents don't try to use them.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] dogfood -- Systematic exploratory testing. Navigates an app like a real user, finds bugs and UX issues, and produces a structured report with screenshots and repro videos.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Claude feedback: Suggest [P]. Skill content is doable but depends on having `wait`/`get text`/full-page screenshot working first. Defer until core surface is solid. The "repro videos" piece would need GIF/WebM recording, which our screenshot pipeline could grow into using `captureVisibleTab` at intervals.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [N] electron -- Automate any Electron app (VS Code, Slack, Discord, Figma, etc.) by connecting to its built-in Chrome DevTools Protocol port.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Claude feedback: Agree [N]. Electron uses CDP exclusively; our Firefox-extension architecture can't connect. To get Electron support we'd need a separate CDP backend (which agent-browser ships). Don't pursue.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [ ] slack -- Browser-based Slack automation. Check unreads, navigate channels, search conversations, send messages, and extract data.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Claude feedback: Suggest [P] until written. Slack via Firefox/web is just snapshot+find+click — a skill would document the Slack-specific selectors and patterns. Doable once core skill exists. Note: requires `wait` for Slack's lazy-loaded message list.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [N] vercel-sandbox -- Run agent-browser + headless Chrome inside ephemeral Vercel Sandbox microVMs.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Claude feedback: Agree [N]. Vercel Sandbox is a Linux microVM where headless Chrome runs — our Firefox + Native Messaging stack doesn't fit (no GUI, no native host registration model). Don't pursue.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] agentcore -- Run agent-browser on AWS Bedrock AgentCore cloud browsers.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
  - Claude feedback: Agree [N]. AgentCore is a managed Chrome-CDP cloud service. Document as out-of-scope for the WebExtension architecture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Source

- [ ] All skill files are in the skills/ and skill-data/ directories of the repository. The skills/ directory holds the discovery stub that npx skills add installs; the skill-data/ directory holds the runtime skill content served by the CLI.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add CLI tests that list and fetch bundled skill content, then snapshot the returned metadata and version matching.
  - Claude feedback: Source layout decision. Recommend `skills/<name>/SKILL.md` (stub for npm/npx) and `skill-data/<name>/SKILL.md` (full content baked into binary via `include_str!`). Mirrors agent-browser's split. Add to `pire-browser-cli` build.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
