# Observability Dashboard

Source: https://agent-browser.dev/dashboard

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [ ] Monitor agent-browser sessions in real time with a local web dashboard showing a live browser viewport and command activity feed.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Usage

- [ ] `agent-browser dashboard start`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [F] `agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: High
  - Complexity: Low
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Custom stream port

- [ ] Support documented usage: `AGENT_BROWSER_STREAM_PORT=9223 agent-browser open example.com`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] `agent-browser stream enable --port 9223`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
- [ ] `agent-browser stream status`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.
- [ ] `agent-browser stream disable`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Enable streaming, connect a WebSocket test client, perform page mutations, and assert frame metadata, cadence, and cleanup on disable.

## Dashboard features

- [ ] The dashboard is a single-page web app with three areas:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## WebSocket protocol

- [ ] The dashboard connects to the same WebSocket endpoint used by Streaming, with additional message types for observability:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Command events

- [ ] Sent when a command begins executing:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Result events

- [ ] Sent when a command finishes:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Console events

- [ ] Sent when the browser logs to the console:
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Medium
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [N] The args array contains the raw CDP Runtime.consoleAPICalled arguments for programmatic access. Object arguments include preview data (e.g. {userId: "abc", count: 42} instead of "Object").
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: Low
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
- [ ] These are in addition to the existing frame, status, and error message types documented on the Streaming page.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## Architecture

- [ ] Support documented usage: `pnpm build:dashboard`
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## AI Chat

- [ ] The dashboard includes an optional AI chat panel powered by the Vercel AI Gateway. When enabled, a Chat tab appears in the right pane alongside Activity, Console, Network, Storage, and Extensions.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.

## How it works

- [ ] The Rust server proxies chat requests from the dashboard to the Vercel AI Gateway and streams responses back using the Vercel AI SDK's UI Message Stream protocol. The dashboard frontend uses useChat from @ai-sdk/react with DefaultChatTransport.
  - Extension Compatibility: True
  - Priority: Medium
  - Complexity: High
  - Testing: Start the dashboard against a live smoke session and run Playwright/browser checks for session list, screenshots, logs, and controls.
