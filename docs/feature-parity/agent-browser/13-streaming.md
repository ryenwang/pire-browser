# Streaming

Source: https://agent-browser.dev/streaming

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Stream the browser viewport via WebSocket for live preview or "pair browsing" where a human can watch and interact alongside an AI agent.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Streaming

- [ ] Support documented usage: `AGENT_BROWSER_STREAM_PORT=9223 agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream status` - Show streaming state and bound port
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream enable --port 9223` - Re-enable on a specific port
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream disable` - Stop streaming for the session
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Runtime status response

- [ ] agent-browser stream status --json returns data like:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] connected reports whether the daemon currently has a browser attached. screencasting reports whether frames are actively being produced for the stream server.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Relationship to screencast commands

- [ ] stream enable creates the WebSocket server and keeps it available for the session. WebSocket clients then trigger live frame delivery automatically.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [N] The lower-level screencast_start and screencast_stop commands still control explicit CDP screencasts directly. Use them when you want a screencast without the WebSocket runtime server.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Mark N. CDP screencast commands are backend-specific; Firefox-compatible streaming should use extension screenshots/video capture instead.

## WebSocket protocol

- [ ] Connect to ws://localhost:9223 to receive frames and send input.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Frame messages

- [ ] The server sends frame messages with base64-encoded images:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Status messages

- [ ] Connection and screencast status:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Input injection

- [ ] Send input events to control the browser remotely.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Touch events

- [ ] Support documented usage: `{ "x": 100, "y": 200, "id": 0 },`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `{ "x": 200, "y": 200, "id": 1 }`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Programmatic API

- [ ] Support documented usage: `import { BrowserManager } from 'agent-browser';`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `const browser = new BrowserManager();`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.launch({ headless: true });`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.navigate('https://example.com');`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.startScreencast((frame) => {`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.injectMouseEvent({`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.injectKeyboardEvent({`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.injectTouchEvent({`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Support documented usage: `await browser.stopScreencast();`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Use cases

- [ ] Pair browsing - Human watches and assists AI agent in real-time
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Remote preview - View browser output in a separate UI
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Recording - Capture frames for video generation
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Mobile testing - Inject touch events for mobile emulation
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] Accessibility testing - Manual interaction during automated tests
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
