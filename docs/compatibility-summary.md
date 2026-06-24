# Compatibility Summary

This is a public, product-facing status summary for `pire-browser@0.2.2`. Detailed private development records are not published in this repository.

| Area | Status | Notes |
| --- | --- | --- |
| Install and setup | Supported | Global, project, and source installs are documented for the Firefox-backed package. |
| MCP agent integration | Supported | `pire-browser mcp --tools core` exposes a compact inspect-before-act stdio MCP workflow. Agent-browser-style profiles `network`, `state`, `debug`, `tabs`, `mobile`, `react`, and `all` can be selected or comma-combined to expose broader typed tools on demand. |
| Core navigation and refs | Supported | Open, snapshot, refs, click, fill, get, wait, and tab workflows are available. |
| Selectors and snapshots | Supported | CSS, text-style selectors, semantic locators, interactive snapshots, compact output, snapshot text diffing, URL snapshot diffing, and screenshot pixel diffing are available. |
| Sessions, profiles, and state | Partial | Named sessions, managed profiles, and state files are available with Firefox-specific behavior. |
| Screenshots, files, and clipboard | Partial | Screenshots, image-backed PDF evidence, downloads, small uploads, and clipboard helpers are available; selectable-text PDF export and native file picker control are not. |
| Network and configuration | Partial | Domain allowlists, Firefox proxy settings, headers, session-memory HTTP Basic credentials, best-effort offline request blocking, best-effort viewport/device/geolocation settings, network diagnostics, metadata-only HAR start/stop/export, route mocks, and config defaults are available with documented limits. |
| Security guardrails | Partial | Domain, action, confirmation, content-boundary, and output-size guardrails are available; encrypted vault features are not. |
| Debugging and observability | Partial | Console, errors, best-effort JavaScript dialog handling, highlight, best-effort Web Vitals, doctor, status, session inspection, recent redacted command activity, and the local status/session/activity dashboard are available; live viewport streaming, trace, video, React DevTools introspection, and profiler are not. |
| Cloud providers and alternate engines | Not supported | CDP, cloud browser providers, Chrome engine mode, Lightpanda, and iOS simulator support are not in the current package. |
