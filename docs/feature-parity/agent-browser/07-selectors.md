# Selectors

Source: https://agent-browser.dev/selectors

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Refs (recommended)

- [P] `agent-browser snapshot`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [F] `agent-browser click @e2` - Click the button
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser fill @e3 "test@example.com"` - Fill the textbox
  - Oracle Coverage: covered (fill-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser get text @e1` - Get heading text
  - Oracle Coverage: covered (get-text-value-attr-url)
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Covered by the current `get` command for refs and selectors.
- [P] `agent-browser hover @e4` - Hover the link
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a pointer-event fixture that records mouse/pointer/wheel events and coordinates; assert the expected event log.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Synthetic hover events are implemented, but Firefox WebExtensions cannot force native CSS `:hover` state.

## Why refs?

- [P] Deterministic - Ref points to exact element from snapshot
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
  - GPT-5.5 review: Refs are stable enough for immediate ref-then-act flows, but not stable across later snapshot/find calls; keep this P rather than F.
- [P] Fast - No DOM re-query needed
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [F] AI-friendly - LLMs can reliably parse and use refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## CSS selectors

- [F] `agent-browser click "#id"`
  - Oracle Coverage: covered (click-css)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 implementation note: Raw CSS selectors, `text=...`, and `xpath=...` now resolve through the shared locator pipeline used by click/fill/type/get/is.
- [F] `agent-browser click ".class"`
  - Oracle Coverage: covered (click-css)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser click "div > button"`
  - Oracle Coverage: covered (click-css)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser click "[data-testid='submit']"`
  - Oracle Coverage: covered (click-css)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Text & XPath

- [F] `agent-browser click "text=Submit"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser click "xpath=//button[@type='submit']"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Semantic locators

- [F] `agent-browser find role button click --name "Submit"`
  - Oracle Coverage: covered (find-role-click)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser find label "Email" fill "test@test.com"`
  - Oracle Coverage: covered (find-label-fill)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser find placeholder "Search..." fill "query"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser find testid "submit-btn" click`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
