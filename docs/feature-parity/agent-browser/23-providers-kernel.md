# Kernel

Source: https://agent-browser.dev/providers/kernel

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Kernel provides cloud browser infrastructure for AI agents with features like stealth mode and persistent profiles.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Setup

- [N] `agent-browser -p kernel open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=kernel`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] `agent-browser open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Configuration

- [N] When enabled, agent-browser connects to a Kernel cloud session instead of launching a local browser. All commands work identically.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Get your API key from the Kernel Dashboard.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
