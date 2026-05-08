# Next.js + Vercel

Source: https://agent-browser.dev/next

Use this checklist to track `pire-browser` feature parity with the documented `agent-browser` behavior.

## Overview

- [N] Run agent-browser from a Next.js app on Vercel using Vercel Sandbox. A Linux microVM spins up on demand, runs agent-browser + Chrome, and shuts down. No binary size limits, no Chromium bundling complexity.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Setup

- [N] Support documented usage: `pnpm add @vercel/sandbox`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Server action

- [N] Support documented usage: `import { Sandbox } from "@vercel/sandbox";`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const snapshotId = process.env.AGENT_BROWSER_SNAPSHOT_ID;`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const CHROMIUM_SYSTEM_DEPS = [`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const credentials = getSandboxCredentials();`
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const sandbox = snapshotId`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const ssResult = await sandbox.runCommand("agent-browser", [`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const ssPath = JSON.parse(await ssResult.stdout())?.data?.path;`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const b64Result = await sandbox.runCommand("base64", ["-w", "0", ssPath]);`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const screenshot = (await b64Result.stdout()).trim();`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const result = await sandbox.runCommand("agent-browser", [`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const snapshot = await result.stdout();`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Sandbox snapshots

- [N] Support documented usage: `AGENT_BROWSER_SNAPSHOT_ID=snap_xxxxxxxxxxxx`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Authentication

- [N] On Vercel deployments, the Sandbox SDK authenticates automatically via OIDC. For local development, provide explicit credentials:
  - Extension Compatibility: False
  - Priority: Medium
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] When all three are set, they are passed to Sandbox.create(). When absent, the SDK falls back to VERCEL_OIDC_TOKEN (automatic on Vercel).
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Scheduled workflows (cron)

- [N] Support documented usage: `const result = await withBrowser(async (sandbox) => {`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `const snap = await sandbox.runCommand("agent-browser", [`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
- [N] Support documented usage: `{ "path": "/api/cron/monitor", "schedule": "0 9 * * *" }`
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.

## Demo app

- [N] A working demo with streaming progress UI, rate limiting, and a deploy-to-Vercel button is at examples/environments/.
  - Extension Compatibility: False
  - Priority: Low
  - Complexity: High
  - Testing: Add an environment/backend test that documents Vercel Sandbox as unsupported by the Firefox extension backend; validate only if a Linux sandbox backend is added.
  - Gemini feedback: Agree that this is Not Compatible. Extension Compatibility is False due to architecture differences (e.g. CDP vs WebExtension). Skip this feature.
