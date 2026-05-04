# Chrome

Source: https://agent-browser.dev/engines/chrome

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Chrome (and Chromium) is the default browser engine. agent-browser discovers, launches, and manages the Chrome process automatically via the Chrome DevTools Protocol (CDP).
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a negative integration test that the Firefox backend returns an explicit unsupported_cdp error; cover any future CDP backend with a real DevTools fixture.

## Binary Discovery

- [N] When no --executable-path is provided, agent-browser searches for Chrome in this order:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] /Applications/Google Chrome.app, /Applications/Google Chrome Canary.app, /Applications/Chromium.app, /Applications/Brave Browser.app, Puppeteer cache (~/.cache/puppeteer/chrome/ or PUPPETEER_CACHE_DIR), Chrome for Testing cache
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] google-chrome, google-chrome-stable, chromium-browser, chromium in PATH, Puppeteer cache (~/.cache/puppeteer/chrome/ or PUPPETEER_CACHE_DIR), Chrome for Testing cache
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] %LOCALAPPDATA%\Google\Chrome\Application\chrome.exe, C:\Program Files\Google\Chrome\Application\chrome.exe, C:\Program Files (x86)...\chrome.exe
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] If Chrome is not found, run agent-browser install to download Chrome from Chrome for Testing.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## Usage

- [N] `agent-browser open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] `agent-browser --engine chrome open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## Custom Binary

- [N] `agent-browser --executable-path /path/to/chromium open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
- [N] Support documented usage: `export AGENT_BROWSER_EXECUTABLE_PATH=/path/to/chromium`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## Chrome-Specific Features

- [N] These features are available only with Chrome:
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.

## Containers and CI

- [N] `agent-browser --args "--no-sandbox" open example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add backend-selection tests that this is unavailable for Firefox extension sessions; validate only under the matching engine backend.
