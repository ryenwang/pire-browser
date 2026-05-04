# Profiler

Source: https://agent-browser.dev/profiler

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Capture Chrome DevTools performance profiles during browser automation. Use profiles to diagnose slow page loads, expensive JavaScript, layout thrashing, and other performance bottlenecks in agentic workflows.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Basic usage

- [N] `agent-browser profiler start`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] `agent-browser navigate https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] `agent-browser click "#button"`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] `agent-browser profiler stop ./trace.json`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Trace categories

- [N] `agent-browser profiler start --categories "devtools.timeline,v8.execute,blink.user_timing"`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Output format

- [N] The output is a JSON file in Chrome Trace Event format:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] The metadata.clock-domain field reflects the host platform (Linux or macOS). On Windows it is omitted.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Viewing profiles

- [N] Chrome DevTools -- Performance panel > Load profile
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Perfetto -- https://ui.perfetto.dev/ (drag and drop the JSON file)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Trace Viewer -- chrome://tracing in any Chromium browser
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Use cases

- [N] Page load analysis -- Profile navigation to identify slow resources, long tasks, or layout shifts
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Interaction profiling -- Measure the cost of clicks, form fills, and other user interactions
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] CI regression checks -- Capture profiles per build and compare trace data over time
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Agent workflow optimization -- Find which steps in an agentic flow are most expensive
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.

## Limitations

- [N] Only works with Chromium-based browsers (Chrome, Edge). Not supported on Firefox or WebKit.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Trace data accumulates in memory while profiling is active (capped at 5 million events). Stop profiling promptly after the area of interest.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] Data collection on stop has a 30-second timeout. If the browser is unresponsive, the stop command may fail.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
- [N] When no output path is provided, the profile is saved to an auto-generated path under the agent-browser temp directory.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative Firefox-backend test for unsupported profiling/tracing; cover any future profiler backend with a deterministic slow-page trace fixture.
