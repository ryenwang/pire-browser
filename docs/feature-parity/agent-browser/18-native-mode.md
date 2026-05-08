# Native Mode

Source: https://agent-browser.dev/native-mode

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [P] agent-browser is now 100% native Rust by default. The Node.js/Playwright daemon has been removed.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Launch from the packaged binary without a Playwright daemon, then add a regression once `npx web-ext` is replaced by direct Firefox/extension launch.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
  - GPT-5.5 review: Partially covered. The CLI and native host are Rust and there is no Playwright daemon, but launch still depends on Node/npm via `npx web-ext`; replacing that launcher would close the gap.
- [ ] This page is no longer relevant. See the main documentation for current architecture and usage.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
