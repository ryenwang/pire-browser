# Command Contract

`pire-browser` commands are the source of truth for browser state. Prefer `--json` when another program will consume the result.

## JSON Envelope

Successful JSON output follows:

```json
{"success":true,"data":{}}
```

Skill commands use:

```json
{"success":true,"data":{"skills":[]}}
```

```json
{"success":true,"data":{"skill":{"name":"core","description":"","content":""}}}
```

## Local Commands

- `pire-browser help`
- `pire-browser status`
- `pire-browser doctor`
- `pire-browser setup`
- `pire-browser update check`
- `pire-browser update configure --mode off|notify|patch`
- `pire-browser skills list`
- `pire-browser skills cat core`

## Browser Commands

Browser commands may auto-launch a managed Firefox session when safe. Read the returned output before deciding the next step.

- Use `pire-browser vitals [url]` for best-effort page performance diagnostics: TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState, and captured hydration warnings.
- If `vitals` reports unavailable metrics, treat that as a Firefox/WebExtension API limitation instead of inventing estimates.
- Use `pire-browser set device "iPhone 14"` or `pire-browser set viewport <w> <h>` before responsive QA screenshots. Device presets are viewport-only best effort on Firefox.
- Use `pire-browser pdf <path>` for portable visual evidence. The PDF is image-backed; do not claim selectable text or print-CSS fidelity.
