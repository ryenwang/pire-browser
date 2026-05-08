# CDP Mode

Source: https://agent-browser.dev/cdp-mode

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] `agent-browser connect 9222`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser tab`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser close`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --cdp 9222 snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Remote WebSocket URLs

- [N] `agent-browser --cdp "wss://browser-service.com/cdp?token=..." snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --cdp "ws://localhost:9222/devtools/browser/abc123" open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] A port number (e.g., 9222) for local connections via http://localhost:{port}
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] A full WebSocket URL (e.g., wss://... or ws://...) for remote browser services
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Auto-Connect

- [N] `agent-browser --auto-connect open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --auto-connect snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `AGENT_BROWSER_AUTO_CONNECT=1 agent-browser snapshot`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Reading Chrome's DevToolsActivePort file from the default user data directory
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Falling back to probing common debugging ports (9222, 9229)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] If HTTP-based discovery (/json/version, /json/list) fails, falling back to a direct WebSocket connection
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Chrome 144+ has remote debugging enabled via chrome://inspect/#remote-debugging (which uses a dynamic port)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] You want a zero-configuration connection to your existing browser
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] You don't want to track which port Chrome is using
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Color scheme

- [N] `agent-browser --cdp 9222 --color-scheme dark open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser --cdp 9222 snapshot` - stays in dark mode
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `AGENT_BROWSER_COLOR_SCHEME=dark agent-browser --cdp 9222 open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Use cases

- [N] Electron apps
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Chrome/Chromium with remote debugging
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] WebView2 applications
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Remote browser services (via WebSocket URL)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Any browser exposing a CDP endpoint
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Cloud providers

- [N] `agent-browser -p browserbase open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
