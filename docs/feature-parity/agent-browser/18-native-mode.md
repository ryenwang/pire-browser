# Native Mode

Source: https://agent-browser.dev/native-mode

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] agent-browser is now 100% native Rust by default. The Node.js/Playwright daemon has been removed.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative backend-capability test that documents the Firefox extension limitation and asserts a clear unsupported response.
- [ ] This page is no longer relevant. See the main documentation for current architecture and usage.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
