# Security

Source: https://agent-browser.dev/security

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] agent-browser includes security features to protect against credential exposure, prompt injection via untrusted page content, and unauthorized browser actions.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] All security features are opt-in. By default, agent-browser imposes no restrictions on navigation, actions, or output. Enable these features as needed for your deployment -- existing workflows are unaffected until you explicitly activate a feature.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `PIRE_BROWSER_REQUIRE_INSPECTED_STATE=1` is implemented as a `pire-browser`-specific cooperative state-load guardrail. It makes normal `state load` require a fresh `state inspect --record` receipt, supports an audited `--no-require-inspected` override, and is not a sandbox or auth vault.
  - GPT-5.5 implementation note: `--allowed-domains` and `AGENT_BROWSER_ALLOWED_DOMAINS` are implemented as `pire-browser` cooperative wrong-site guardrails. They check URL-bearing commands, active-page actions, named/default launches, and state-load origins, but they do not provide upstream-equivalent subresource, redirect, WebSocket, EventSource, or TOCTOU-safe enforcement.

## Threat Model

- [ ] Credential exposure -- Passwords stored in the auth vault are never included in LLM context. The CLI handles vault operations locally; credentials do not pass through the daemon's IPC channel.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Secret-safe auth handoff diagnostics are implemented through `status`/`doctor` profile advisories and diagnostic redaction, but the auth vault remains unimplemented.
- [ ] Prompt injection via page content -- Malicious pages can embed text that looks like tool output or system instructions. Content boundary markers (--content-boundaries) let the orchestrator distinguish trusted tool output from untrusted page content.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [P] Unauthorized destructive actions -- Action policy (--action-policy) and confirmation gating (--confirm-actions) prevent the agent from performing dangerous operations (eval, downloads, uploads) without explicit approval.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Cooperative action policy and confirmation records are implemented for executable categories, including best-effort Firefox downloads, with `ConfirmationRequired` as an approval-pending outcome. This is not a sandbox or audit log, and uploads remain unavailable.
- [ ] Context flooding -- Large page outputs can overwhelm an LLM's context window. Output truncation (--max-output) caps the size of page-sourced content.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Known limitations

- [ ] Confirmation timeout. Pending confirmations auto-deny after 60 seconds. Orchestrators must respond within that window.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Non-TTY auto-deny. When --confirm-interactive is set but stdin is not a terminal (e.g., piped input), actions are automatically denied to prevent accidental approval in non-interactive contexts.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Authentication Vault

- [ ] `agent-browser auth save github --url https://github.com/login --username user --password pass`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Use the persistent Firefox profile auth handoff for now; storing credentials in a local auth vault is still out of scope.
- [ ] `agent-browser auth login github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser auth list`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser auth show github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser auth delete github`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser auth save myapp \`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Content Boundary Markers

- [ ] Support documented usage: `[snapshot / text / html / eval output here]`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --content-boundaries snapshot`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `export AGENT_BROWSER_CONTENT_BOUNDARIES=1`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Domain Allowlist

- [ ] `agent-browser --allowed-domains "example.com,*.example.com,github.com" open https://example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `pire-browser --allowed-domains` is implemented for exact and wildcard host patterns, scheme-less navigation normalization, launch/open/navigation checks, active-page checks, and `state load` origin checks. It is intentionally best-effort and does not claim upstream-equivalent request/redirect containment.
- [ ] Support documented usage: `export AGENT_BROWSER_ALLOWED_DOMAINS="example.com,*.example.com"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `AGENT_BROWSER_ALLOWED_DOMAINS` is implemented with the same comma-separated pattern syntax as the flag. Explicit CLI flags win over the env setting, and `--no-allowed-domains` emits a `DOMAIN_POLICY_OVERRIDDEN` warning when bypassing an active env allowlist.

## Action Policy

- [ ] `agent-browser --action-policy ./policy.json open https://example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `pire-browser --action-policy <path>` is implemented as a cooperative action-category guardrail for upstream-shaped policy files with `default`, `allow`, and `deny`. It enforces CLI-local categories and extension-side `batch` / chained `find` classification, but does not implement confirmation queues, audit logs, or a sandbox boundary.
- [ ] Support documented usage: `export AGENT_BROWSER_ACTION_POLICY=./policy.json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `AGENT_BROWSER_ACTION_POLICY` is implemented as the env-backed policy-file source. An explicit `--action-policy` flag wins over the env var, and malformed policies are diagnostic-only for `status`/`doctor` but fail strict command execution.

## Action Confirmation

- [P] `agent-browser --confirm-actions eval,download eval "document.title"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: `--confirm-actions` and `AGENT_BROWSER_CONFIRM_ACTIONS` create short-lived pending confirmations for matching action categories; hard action-policy deny still wins before confirmation.
- [P] `agent-browser confirm c_8f3a1234`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Approves a fresh pending record, re-checks captured policy context, bypasses only the confirmation gate, and executes the stored command.
- [P] `agent-browser deny c_8f3a1234`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Denies a fresh pending record by consuming it without execution.
- [P] `agent-browser --confirm-actions eval,download --confirm-interactive eval "document.title"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Interactive mode prompts only on a TTY. Non-TTY runs auto-deny instead of creating an approval record or silently approving.

## Output Length Limits

- [ ] `agent-browser --max-output 50000 get text body`
  - Oracle Coverage: covered (get-text-value-attr-url)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `export AGENT_BROWSER_MAX_OUTPUT=50000`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Recommended Configuration

- [ ] For production AI agent deployments:
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
