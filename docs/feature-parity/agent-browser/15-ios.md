# iOS Simulator

Source: https://agent-browser.dev/ios

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Control real Mobile Safari in the iOS Simulator for authentic mobile web testing. Uses Appium with XCUITest for native automation.
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Requirements

- [N] macOS with Xcode installed
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] iOS Simulator runtimes (download via Xcode)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Appium with XCUITest driver
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Setup

- [N] Support documented usage: `npm install -g appium`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## List available devices

- [N] `agent-browser device list`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Basic usage

- [N] `agent-browser -p ios --device "iPhone 16 Pro" open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios snapshot -i`
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios tap @e1`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios fill @e2 "text"`
  - Oracle Coverage: covered (fill-ref)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios screenshot mobile.png`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios close`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Mobile-specific commands

- [N] `agent-browser -p ios swipe up`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios swipe down`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios swipe left`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios swipe right`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios swipe up 500`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Environment variables

- [N] Support documented usage: `export AGENT_BROWSER_PROVIDER=ios`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `export AGENT_BROWSER_IOS_DEVICE="iPhone 16 Pro"`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser open https://example.com`
  - Oracle Coverage: covered (open-fixture)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser snapshot -i`
  - Oracle Coverage: covered (snapshot-interactive)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser tap @e1`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Supported devices

- [N] All iPhone models (iPhone 15, 16, 17, SE, etc.)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] All iPad models (iPad Pro, iPad Air, iPad mini, etc.)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Multiple iOS versions (17.x, 18.x, etc.)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Real device support

- [N] Appium can control Safari on real iOS devices connected via USB. This requires additional one-time setup.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## 2. Sign WebDriverAgent (one-time)

- [N] Support documented usage: `cd ~/.appium/node_modules/appium-xcuitest-driver/node_modules/appium-webdriveragent`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Select the WebDriverAgentRunner target
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Go to Signing & Capabilities
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Select your Team (requires Apple Developer account, free tier works)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Let Xcode manage signing automatically
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## 3. Use with agent-browser

- [N] `agent-browser -p ios --device "<DEVICE_UDID>" open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] `agent-browser -p ios --device "John's iPhone" open https://example.com`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Real device notes

- [N] First run installs WebDriverAgent to the device (may require Trust prompt on device)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Device must be unlocked and connected via USB
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Slightly slower initial connection than simulator
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Tests against real Safari performance and behavior
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] On first install, go to Settings -> General -> VPN & Device Management to trust the developer certificate
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Performance notes

- [N] First launch: Takes 30-60 seconds to boot the simulator and start Appium
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Subsequent commands: Fast (simulator stays running)
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Close command: Shuts down simulator and Appium server
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## No simulators available

- [N] Open Xcode and download iOS Simulator runtimes from Settings -> Platforms.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Simulator won't boot

- [N] Try booting the simulator manually from Xcode or the Simulator app to ensure it works, then retry with agent-browser.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add a platform-gated test that skips on Firefox backend and asserts a clear unsupported_provider response; validate later with an Appium simulator smoke test.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
