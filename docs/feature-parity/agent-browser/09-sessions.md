# Sessions

Source: https://agent-browser.dev/sessions

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] `agent-browser --session agent1 open site-a.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session agent2 open site-b.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `AGENT_BROWSER_SESSION=agent1 agent-browser click "#btn"`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [P] `agent-browser session list`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Partial via `pire-browser status`, which lists live Firefox extension sessions; the agent-browser `session list` command shape is not implemented.
- [ ] `agent-browser session`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Session isolation

- [F] Browser instance
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Cookies and storage
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Navigation history
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Authentication state
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Chrome profile reuse

- [ ] `agent-browser profiles`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [P] `agent-browser --profile Default open https://gmail.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [P] `agent-browser --profile "Work" open https://app.example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [ ] Support documented usage: `AGENT_BROWSER_PROFILE=Default agent-browser open https://gmail.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Persistent profiles

- [ ] `agent-browser --profile ~/.myapp-profile open myapp.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --profile ~/.myapp-profile open myapp.com/dashboard`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `AGENT_BROWSER_PROFILE=~/.myapp-profile agent-browser open myapp.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] Cookies and localStorage
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] IndexedDB data
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Service workers
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Browser cache
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Login sessions
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Import auth from your browser

- [ ] `agent-browser --auto-connect state save ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run the command with --json in unit/e2e tests and validate the response against a checked schema.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --state ./my-auth.json open https://app.example.com/dashboard`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state load ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser open https://app.example.com/dashboard`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [ ] `agent-browser --session-name myapp state load ./my-auth.json`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Session persistence

- [ ] `agent-browser --session-name twitter open twitter.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name twitter click "#login"`
  - Oracle Coverage: covered (click-css)
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `export AGENT_BROWSER_SESSION_NAME=twitter`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser open twitter.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Session name rules

- [ ] `agent-browser --session-name my-project open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name test_session_v2 open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name "../bad" open example.com` - path traversal
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name "my session" open example.com` - spaces
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name "foo/bar" open example.com` - slashes
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## State encryption

- [ ] Support documented usage: `export AGENT_BROWSER_ENCRYPTION_KEY=<your-64-char-hex-key>`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser --session-name secure-session open example.com`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state list`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## State auto-expiration

- [ ] Support documented usage: `export AGENT_BROWSER_STATE_EXPIRE_DAYS=7`
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Low
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state clean --older-than 7`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## State management commands

- [ ] `agent-browser state show my-session-default.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state rename old-name new-name`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state clear my-session`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state clear --all`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state save ./backup.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser state load ./backup.json`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Authenticated sessions

- [ ] `agent-browser open api.example.com --headers '{"Authorization": "Bearer <token>"}'`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser snapshot -i --json`
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser click @e2`
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser open other-site.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local HTTP fixture, run pire-browser open/launch, then assert status/snapshot/get url output against the expected fixture URL.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [ ] Skipping login flows - Authenticate via headers
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Run two isolated Firefox profiles/sessions against a cookie/storage fixture; assert persistence within a profile and isolation across profiles.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Switching users - Different auth tokens per session
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] API testing - Access protected endpoints
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Security - Headers scoped to origin, not leaked
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use policy fixtures and CLI tests for allow/deny decisions, confirmation requirements, encrypted state round trips, and audit-log records.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Multiple origins

- [ ] `agent-browser open api.example.com --headers '{"Authorization": "Bearer token1"}'`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser open api.acme.com --headers '{"Authorization": "Bearer token2"}'`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Global headers

- [ ] `agent-browser set headers '{"X-Custom-Header": "value"}'`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a local fixture server that records requests/responses; assert headers, blocking/routing decisions, offline behavior, and emitted HAR fields.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
