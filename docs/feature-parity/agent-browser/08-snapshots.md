# Snapshots

Source: https://agent-browser.dev/snapshots

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [P] The snapshot command returns a compact accessibility tree with refs for element interaction.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## Options

- [P] `agent-browser snapshot` - Full accessibility tree
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser snapshot -i` - Interactive elements only (recommended)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] `agent-browser snapshot -c` - Compact (remove empty elements)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] `agent-browser snapshot -d 3` - Limit depth to 3 levels
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] `agent-browser snapshot -s "#main"` - Scope to CSS selector
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] `agent-browser snapshot -i -c -d 5` - Combine options
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## Output format

- [F] `agent-browser snapshot -i`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.

## Using refs

- [F] `agent-browser click @e2` - Click the Submit button
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [F] `agent-browser fill @e3 "a@b.com"` - Fill the email input
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
- [ ] `agent-browser get text @e1` - Get heading text
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.

## Ref lifecycle

- [F] `agent-browser click @e4` - Navigates to new page
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [F] `agent-browser snapshot -i` - Get fresh refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [F] `agent-browser click @e1` - Use new refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.

## Annotated screenshots

- [ ] `agent-browser screenshot --annotate ./page.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.
- [F] `agent-browser click @e2`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.

## Iframes

- [F] `agent-browser fill @e3 "4111111111111111"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use a form fixture that logs input/change/keyboard/focus events; assert field value and event order after the command.
- [F] `agent-browser click @e4`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Add a fixture element that records click events in the DOM; run the command through the smoke harness and assert the recorded marker.
- [ ] `agent-browser frame @e2`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.
- [ ] `agent-browser snapshot -i` - Only elements inside that iframe
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] `agent-browser frame main` - Return to main frame
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Serve same-origin and cross-origin iframe fixtures; assert snapshot inclusion, frame targeting, and graceful opaque-frame errors.

## Best practices

- [F] Use -i to reduce output to actionable elements
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [F] Re-snapshot after page changes to get updated refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
- [ ] Scope with -s for specific page sections
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] Use -d to limit depth on complex pages
  - Extension Compatibility: True
  - Priority: Low
  - Complexity: Medium
  - Testing: Add an automated fixture or unit test that exercises the documented behavior through the CLI and asserts text plus --json output.
- [ ] Use screenshot --annotate when visual context is needed alongside refs
  - Extension Compatibility: True
  - Priority: High
  - Complexity: High
  - Testing: Capture a deterministic fixture page, verify the output file exists, decode image dimensions, and compare key pixels or an approved snapshot.

## JSON output

- [F] `agent-browser snapshot --json`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Use an accessibility fixture with labels, roles, test ids, duplicate matches, shadow DOM, and iframes; assert refs and locator actions are stable.
