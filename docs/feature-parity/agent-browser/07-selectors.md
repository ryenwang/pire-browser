# Selectors

Source: https://agent-browser.dev/selectors

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Refs (recommended)

- [P] `agent-browser snapshot`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser click @e2` - Click the button
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [F] `agent-browser fill @e3 "test@example.com"` - Fill the textbox
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
- [ ] `agent-browser get text @e1` - Get heading text
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] `agent-browser hover @e4` - Hover the link
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Use a pointer-event fixture that records mouse/pointer/wheel events and coordinates; assert the expected event log.

## Why refs?

- [F] Deterministic - Ref points to exact element from snapshot
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [P] Fast - No DOM re-query needed
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [F] AI-friendly - LLMs can reliably parse and use refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## CSS selectors

- [ ] `agent-browser click "#id"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [ ] `agent-browser click ".class"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [ ] `agent-browser click "div > button"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [ ] `agent-browser click "[data-testid='submit']"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.

## Text & XPath

- [ ] `agent-browser click "text=Submit"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [ ] `agent-browser click "xpath=//button[@type='submit']"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.

## Semantic locators

- [F] `agent-browser find role button click --name "Submit"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser find label "Email" fill "test@test.com"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser find placeholder "Search..." fill "query"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser find testid "submit-btn" click`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
