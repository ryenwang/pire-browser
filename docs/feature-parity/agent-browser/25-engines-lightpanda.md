# Lightpanda

Source: https://agent-browser.dev/engines/lightpanda

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Lightpanda is a headless browser engine built from scratch in Zig for machines. It starts instantly, uses 10x less memory than Chrome, and executes 10x faster.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] agent-browser manages Lightpanda the same way it manages Chrome -- spawning the process, connecting via CDP, and shutting it down. All downstream commands (snapshot, click, fill, screenshot, etc.) work through the same CDP protocol path.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Installation

- [N] Install the Lightpanda binary before using it with agent-browser:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Move the binary somewhere in your PATH (e.g. /usr/local/bin/lightpanda or ~/.local/bin/lightpanda).
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] See the Lightpanda installation docs for more options.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Usage

- [N] `agent-browser --engine lightpanda open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --engine lightpanda snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --engine lightpanda screenshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `export AGENT_BROWSER_ENGINE=lightpanda`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser open example.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Custom Binary Path

- [N] `agent-browser --engine lightpanda --executable-path /path/to/lightpanda open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Differences from Chrome

- [N] Lightpanda is a purpose-built headless engine. Some Chrome-specific features are not available:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] agent-browser returns a clear error if you combine --engine lightpanda with unsupported flags.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## When to Use Lightpanda

- [N] Fast web scraping and data extraction
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] AI agent workflows where speed and low memory matter
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] CI/CD environments with constrained resources
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] High-volume parallel automation
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
