# AgentCore

Source: https://agent-browser.dev/providers/agentcore

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] AWS Bedrock AgentCore provides cloud browser sessions with SigV4 authentication. Use it when running agent-browser in AWS environments or when you need managed cloud browsers backed by AWS infrastructure.
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Setup

- [N] `agent-browser -p agentcore open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=agentcore`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] `agent-browser open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] AWS CLI (aws configure export-credentials) which supports SSO, profiles, IAM roles, etc.
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Browser Profiles

- [N] Use AGENTCORE_PROFILE_ID to persist browser state (cookies, localStorage) across sessions:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] When a profile is set, AgentCore stores and restores browser state automatically between sessions.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Live View

- [N] When a session starts, AgentCore prints a Live View URL to stderr:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] Open this URL in your browser to watch the agent session in real time from the AWS Console.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.

## Credential Resolution

- [N] Environment variables (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, optionally AWS_SESSION_TOKEN)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
- [N] AWS CLI (aws configure export-credentials --format env), which supports SSO, IAM roles, credential files, and profiles
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add CLI/config unit tests that the Firefox backend reports a clear unsupported provider path, plus provider-contract tests when a separate backend is introduced.
