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
