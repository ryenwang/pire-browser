# Security

Source: https://agent-browser.dev/security

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] agent-browser includes security features to protect against credential exposure, prompt injection via untrusted page content, and unauthorized browser actions.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] All security features are opt-in. By default, agent-browser imposes no restrictions on navigation, actions, or output. Enable these features as needed for your deployment -- existing workflows are unaffected until you explicitly activate a feature.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Threat Model

- [ ] Credential exposure -- Passwords stored in the auth vault are never included in LLM context. The CLI handles vault operations locally; credentials do not pass through the daemon's IPC channel.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Prompt injection via page content -- Malicious pages can embed text that looks like tool output or system instructions. Content boundary markers (--content-boundaries) let the orchestrator distinguish trusted tool output from untrusted page content.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Unauthorized destructive actions -- Action policy (--action-policy) and confirmation gating (--confirm-actions) prevent the agent from performing dangerous operations (eval, downloads, uploads) without explicit approval.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Context flooding -- Large page outputs can overwhelm an LLM's context window. Output truncation (--max-output) caps the size of page-sourced content.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Known limitations

- [ ] Confirmation timeout. Pending confirmations auto-deny after 60 seconds. Orchestrators must respond within that window.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Non-TTY auto-deny. When --confirm-interactive is set but stdin is not a terminal (e.g., piped input), actions are automatically denied to prevent accidental approval in non-interactive contexts.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Authentication Vault

- [ ] `agent-browser auth save github --url https://github.com/login --username user --password pass`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser auth login github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser auth list`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser auth show github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser auth delete github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser auth save myapp \`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Content Boundary Markers

- [ ] Support documented usage: `[snapshot / text / html / eval output here]`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser --content-boundaries snapshot`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Support documented usage: `export AGENT_BROWSER_CONTENT_BOUNDARIES=1`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Domain Allowlist

- [ ] `agent-browser --allowed-domains "example.com,*.example.com,github.com" open https://example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Support documented usage: `export AGENT_BROWSER_ALLOWED_DOMAINS="example.com,*.example.com"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Action Policy

- [ ] `agent-browser --action-policy ./policy.json open https://example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Support documented usage: `export AGENT_BROWSER_ACTION_POLICY=./policy.json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Action Confirmation

- [ ] `agent-browser --confirm-actions eval,download eval "document.title"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser confirm c_8f3a1234`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser deny c_8f3a1234`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser --confirm-actions eval,download --confirm-interactive eval "document.title"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Output Length Limits

- [ ] `agent-browser --max-output 50000 get text body`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] Support documented usage: `export AGENT_BROWSER_MAX_OUTPUT=50000`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Recommended Configuration

- [ ] For production AI agent deployments:
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
