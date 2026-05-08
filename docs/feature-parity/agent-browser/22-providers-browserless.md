# Browserless

Source: https://agent-browser.dev/providers/browserless

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Browserless provides cloud browser infrastructure with a Sessions API. Use it when running agent-browser in environments where a local browser isn't available.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Setup

- [N] `agent-browser -p browserless open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=browserless`
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

## Configuration

- [N] When enabled, agent-browser connects to a Browserless cloud session instead of launching a local browser. All commands work identically.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Get your API token from the Browserless Dashboard.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
