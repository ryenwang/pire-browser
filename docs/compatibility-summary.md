# Compatibility Summary

This is a public, product-facing status summary for `pire-browser@0.2.2`. Detailed private development records are not published in this repository.

| Area | Status | Notes |
| --- | --- | --- |
| Install and setup | Supported | Global, project, and source installs are documented for the Firefox-backed package. |
| MCP agent integration | Supported | `pire-browser mcp --tools core` exposes the main browser workflow as stdio MCP tools. |
| Core navigation and refs | Supported | Open, snapshot, refs, click, fill, get, wait, and tab workflows are available. |
| Selectors and snapshots | Supported | CSS, text-style selectors, semantic locators, interactive snapshots, and compact output are available. |
| Sessions, profiles, and state | Partial | Named sessions, managed profiles, and state files are available with Firefox-specific behavior. |
| Screenshots, files, and clipboard | Partial | Screenshots, downloads, small uploads, and clipboard helpers are available; PDF and native file picker control are not. |
| Network and configuration | Partial | Domain allowlists, headers, network diagnostics, route mocks, and config defaults are available with documented limits. |
| Security guardrails | Partial | Domain, action, confirmation, content-boundary, and output-size guardrails are available; encrypted vault features are not. |
| Debugging and observability | Partial | Console, errors, highlight, doctor, status, and session inspection are available; dashboard, trace, video, and profiler are not. |
| Cloud providers and alternate engines | Not supported | CDP, cloud browser providers, Chrome engine mode, Lightpanda, and iOS simulator support are not in the current package. |
