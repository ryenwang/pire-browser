# Diffing

Source: https://agent-browser.dev/diffing

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Compare page states to detect changes -- structurally via accessibility tree snapshots, visually via pixel comparison, or across two different URLs.
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Snapshot diff

- [ ] `agent-browser diff snapshot`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff snapshot --baseline before.txt`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff snapshot --selector "#main" --compact`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Output

- [ ] The diff uses + for added lines and - for removed lines, similar to unified diff format. A summary line shows the count of additions, removals, and unchanged lines.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Screenshot diff

- [ ] `agent-browser diff screenshot --baseline before.png`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff screenshot --baseline before.png --output diff.png`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff screenshot --baseline before.png --threshold 0.2 --selector "#hero"`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Output

- [ ] Reports the diff image path, number of different pixels, and mismatch percentage. The diff image shows unchanged pixels dimmed with changed pixels in red.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] If the baseline and current images have different dimensions, the command reports a dimension mismatch instead of attempting pixel comparison.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## URL diff

- [ ] `agent-browser diff url https://staging.example.com https://prod.example.com`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff url https://v1.example.com https://v2.example.com --screenshot`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser diff url https://v1.example.com https://v2.example.com --screenshot --full`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Verifying agent actions

- [F] `agent-browser snapshot -i` - Take interactive-only snapshot (baseline)
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [F] `agent-browser fill @e3 "test@example.com"`
  - Oracle Coverage: covered (fill-ref)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.
- [ ] `agent-browser diff snapshot` - Compare current snapshot to the baseline
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Medium
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Monitoring for changes

- [ ] `agent-browser open https://example.com && agent-browser snapshot > baseline.txt`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser open https://example.com && agent-browser diff snapshot --baseline baseline.txt`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Visual regression testing

- [ ] `agent-browser open https://staging.example.com && agent-browser screenshot baseline.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser open https://staging.example.com && agent-browser diff screenshot --baseline baseline.png`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Comparing environments

- [ ] `agent-browser diff url https://staging.example.com https://prod.example.com --screenshot`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Capture before/after fixture snapshots and screenshots, then assert textual and visual diff artifacts against known changes.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
