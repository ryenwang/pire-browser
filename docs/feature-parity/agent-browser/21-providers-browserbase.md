# Browserbase

Source: https://agent-browser.dev/providers/browserbase

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Browserbase provides remote browser infrastructure to make deployment of agentic browsing agents easy. Use it when running agent-browser in environments where a local browser isn't feasible.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Setup

- [N] `agent-browser -p browserbase open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=browserbase`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] `agent-browser open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
