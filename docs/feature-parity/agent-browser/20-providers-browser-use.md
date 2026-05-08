# Browser Use

Source: https://agent-browser.dev/providers/browser-use

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Browser Use provides cloud browser infrastructure for AI agents. Use it when running agent-browser in environments where a local browser isn't available (serverless, CI/CD, etc.).
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Setup

- [N] `agent-browser -p browseruse open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=browseruse`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser open https://example.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
