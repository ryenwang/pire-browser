# Observability Dashboard

Source: https://agent-browser.dev/dashboard

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Monitor agent-browser sessions in real time with a local web dashboard showing a live browser viewport and command activity feed.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Usage

- [ ] `agent-browser dashboard start`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [F] `agent-browser open example.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Confirmed this feature is fully implemented in /pire-browser or is highly compatible. The specified testing strategy is appropriate and should ensure stability.

## Custom stream port

- [ ] Support documented usage: `AGENT_BROWSER_STREAM_PORT=9223 agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream enable --port 9223`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream status`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [ ] `agent-browser stream disable`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Dashboard features

- [ ] The dashboard is a single-page web app with three areas:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## WebSocket protocol

- [ ] The dashboard connects to the same WebSocket endpoint used by Streaming, with additional message types for observability:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Command events

- [ ] Sent when a command begins executing:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Result events

- [ ] Sent when a command finishes:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Console events

- [ ] Sent when the browser logs to the console:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
- [N] The args array contains the raw CDP Runtime.consoleAPICalled arguments for programmatic access. Object arguments include preview data (e.g. {userId: "abc", count: 42} instead of "Object").
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
  - GPT-5.5 review: Mark N for raw CDP payload parity. A Firefox console log view is compatible, but exposing CDP Runtime.consoleAPICalled args is not.
- [ ] These are in addition to the existing frame, status, and error message types documented on the Streaming page.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## Architecture

- [ ] Support documented usage: `pnpm build:dashboard`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## AI Chat

- [ ] The dashboard includes an optional AI chat panel powered by the Vercel AI Gateway. When enabled, a Chat tab appears in the right pane alongside Activity, Console, Network, Storage, and Extensions.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.

## How it works

- [ ] The Rust server proxies chat requests from the dashboard to the Vercel AI Gateway and streams responses back using the Vercel AI SDK's UI Message Stream protocol. The dashboard frontend uses useChat from @ai-sdk/react with DefaultChatTransport.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
  - Gemini feedback: Feature not yet implemented in /pire-browser but Extension Compatibility is True. Priority and Complexity are reasonable. Testing strategy is well-defined and should be followed upon implementation.
