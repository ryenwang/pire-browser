# Sessions

Source: https://agent-browser.dev/sessions

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] `agent-browser --session agent1 open site-a.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session agent2 open site-b.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Support documented usage: `AGENT_BROWSER_SESSION=agent1 agent-browser click "#btn"`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser session list`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser session`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## Session isolation

- [F] Browser instance
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [F] Cookies and storage
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] Navigation history
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [F] Authentication state
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Chrome profile reuse

- [N] `agent-browser profiles`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [P] `agent-browser --profile Default open https://gmail.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [P] `agent-browser --profile "Work" open https://app.example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Support documented usage: `AGENT_BROWSER_PROFILE=Default agent-browser open https://gmail.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## Persistent profiles

- [ ] `agent-browser --profile ~/.myapp-profile open myapp.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --profile ~/.myapp-profile open myapp.com/dashboard`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] Support documented usage: `AGENT_BROWSER_PROFILE=~/.myapp-profile agent-browser open myapp.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] Cookies and localStorage
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] IndexedDB data
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] Service workers
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] Browser cache
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [F] Login sessions
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## Import auth from your browser

- [ ] `agent-browser --auto-connect state save ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
- [ ] `agent-browser --state ./my-auth.json open https://app.example.com/dashboard`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] `agent-browser state load ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] `agent-browser open https://app.example.com/dashboard`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] `agent-browser --session-name myapp state load ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## Session persistence

- [ ] `agent-browser --session-name twitter open twitter.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session-name twitter click "#login"`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Support documented usage: `export AGENT_BROWSER_SESSION_NAME=twitter`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [F] `agent-browser open twitter.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.

## Session name rules

- [ ] `agent-browser --session-name my-project open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session-name test_session_v2 open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session-name "../bad" open example.com` - path traversal
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session-name "my session" open example.com` - spaces
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser --session-name "foo/bar" open example.com` - slashes
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## State encryption

- [ ] Support documented usage: `export AGENT_BROWSER_ENCRYPTION_KEY=<your-64-char-hex-key>`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
- [ ] `agent-browser --session-name secure-session open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state list`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## State auto-expiration

- [ ] Support documented usage: `export AGENT_BROWSER_STATE_EXPIRE_DAYS=7`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] `agent-browser state clean --older-than 7`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## State management commands

- [ ] `agent-browser state show my-session-default.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state rename old-name new-name`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state clear my-session`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state clear --all`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state save ./backup.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] `agent-browser state load ./backup.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.

## Authenticated sessions

- [ ] `agent-browser open api.example.com --headers '{"Authorization": "Bearer <token>"}'`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [F] `agent-browser snapshot -i --json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser click @e2`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [F] `agent-browser open other-site.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
- [ ] Skipping login flows - Authenticate via headers
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
- [ ] Switching users - Different auth tokens per session
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
- [ ] API testing - Access protected endpoints
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] Security - Headers scoped to origin, not leaked
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.

## Multiple origins

- [ ] `agent-browser open api.example.com --headers '{"Authorization": "Bearer token1"}'`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
- [ ] `agent-browser open api.acme.com --headers '{"Authorization": "Bearer token2"}'`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.

## Global headers

- [ ] `agent-browser set headers '{"X-Custom-Header": "value"}'`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
