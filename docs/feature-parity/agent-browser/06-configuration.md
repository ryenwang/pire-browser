# Configuration

Source: https://agent-browser.dev/configuration

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Create an agent-browser.json file to set persistent defaults instead of repeating flags on every command.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.

## Config File Locations

- [ ] `agent-browser --config ./ci-config.json open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Support documented usage: `AGENT_BROWSER_CONFIG=./ci-config.json agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.

## Example Config

- [ ] A JSON Schema is available for IDE autocomplete and validation. Add a $schema key to your config file to enable it:
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.

## All Options

- [ ] Every CLI flag can be set in the config file using its camelCase equivalent:
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Overriding Boolean Options

- [ ] `agent-browser --headed false open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] `agent-browser --headed open example.com` - same as --headed true
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] `agent-browser --headed true open example.com` - explicit
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Extensions Merging

- [ ] Extensions from user-level and project-level configs are concatenated, not replaced. For example, if ~/.agent-browser/config.json specifies ["/ext1"] and ./agent-browser.json specifies ["/ext2"], the result is ["/ext1", "/ext2"].
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] The AGENT_BROWSER_EXTENSIONS environment variable and CLI --extension flags follow the standard priority rules (env replaces config, CLI appends).
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Environment Variables

- [ ] These environment variables configure additional daemon and runtime behavior:
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Error Handling

- [ ] Auto-discovered config files (~/.agent-browser/config.json, ./agent-browser.json) that are missing are silently ignored.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] --config <path> with a missing or malformed file exits with an error.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] Malformed JSON in auto-discovered files prints a warning to stderr and continues without that file.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] Unknown keys are silently ignored for forward compatibility.
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
