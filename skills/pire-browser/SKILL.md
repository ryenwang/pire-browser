---
name: pire-browser
description: Use the installed pire-browser CLI to control Firefox safely with version-matched guidance.
---

# pire-browser

Load the compact, version-matched workflow before browser work:

```bash
pire-browser skills get core
```

Load the extended command reference only when the task needs it:

```bash
pire-browser skills get core --full
```

For MCP hosts, start with the compact typed profile:

```bash
pire-browser mcp --tools core
```

Use the installed skill content instead of copying repository maintainer docs into the prompt. The core skill is version matched to the installed CLI; focused MCP profiles can be added after `pire_browser_tools_profiles` shows a missing capability.

For systematic exploratory QA, bug hunts, and app review workflows, run:

```bash
pire-browser skills get dogfood
```
