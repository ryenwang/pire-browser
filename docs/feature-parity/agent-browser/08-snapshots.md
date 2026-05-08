# Snapshots

Source: https://agent-browser.dev/snapshots

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [P] The snapshot command returns a compact accessibility tree with refs for element interaction.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.

## Options

- [P] `agent-browser snapshot` - Full accessibility tree
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature is partially implemented in /pire-browser or is a viable addition. The priority and complexity align with the remaining effort. Testing should focus on the gaps identified.
- [F] `agent-browser snapshot -i` - Interactive elements only (recommended)
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [ ] `agent-browser snapshot -c` - Compact (remove empty elements)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser snapshot -d 3` - Limit depth to 3 levels
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser snapshot -s "#main"` - Scope to CSS selector
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser snapshot -i -c -d 5` - Combine options
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Output format

- [F] `agent-browser snapshot -i`
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Using refs

- [F] `agent-browser click @e2` - Click the Submit button
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser fill @e3 "a@b.com"` - Fill the email input
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

## Ref lifecycle

- [F] `agent-browser click @e4` - Navigates to new page
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser snapshot -i` - Get fresh refs
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser click @e1` - Use new refs
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Annotated screenshots

- [P] `agent-browser screenshot --annotate ./page.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Accepted but best-effort only: current implementation captures the visible viewport and warns that annotation overlay is not implemented.
- [F] `agent-browser click @e2`
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Iframes

- [F] `agent-browser fill @e3 "4111111111111111"`
  - Oracle Coverage: covered (fill-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser click @e4`
  - Oracle Coverage: covered (click-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [P] `agent-browser frame @e2`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Snapshot/find can inspect frames and ref actions carry frame ids, but persistent `frame` context switching is only a best-effort acknowledgement.
- [P] `agent-browser snapshot -i` - Only elements inside that iframe
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [P] `agent-browser frame main` - Return to main frame
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Best practices

- [F] Use -i to reduce output to actionable elements
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] Re-snapshot after page changes to get updated refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [ ] Scope with -s for specific page sections
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Use -d to limit depth on complex pages
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [P] Use screenshot --annotate when visual context is needed alongside refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## JSON output

- [F] `agent-browser snapshot --json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
