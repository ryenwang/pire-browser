# pire-browser Agent Context

Use this folder when you are operating an installed `pire-browser` package. It is a routing layer: read the smallest workflow contract that matches the task, then use the CLI output as the source of truth.

## Start Here

- Setup or broken install: `agent/workflows/setup-and-diagnose/CONTEXT.md`
- Before any click, type, or page action: `agent/workflows/inspect-before-act/CONTEXT.md`
- After an action: `agent/workflows/act-and-verify/CONTEXT.md`
- Sessions, state, files, and schema behavior: `agent/workflows/sessions-state-files/CONTEXT.md`
- Downloads, uploads, policies, and confirmations: `agent/workflows/transfers-and-policies/CONTEXT.md`
- Command and output contract: `agent/references/command-contract.md`
- Snapshot refs and stale refs: `agent/references/ref-lifecycle.md`
- Errors, confirmations, and recovery: `agent/references/safety-and-errors.md`

## Core Rules

- Use Firefox automation through `pire-browser`; do not substitute a different browser unless the user asks.
- Inspect with `pire-browser snapshot -i` before acting on a page.
- Treat snapshot refs as short lived. Use fresh refs after navigation, DOM changes, dialogs, downloads, uploads, or errors.
- Do not claim success until `pire-browser` output confirms it.
- If output returns `confirm <id>`, ask the user before running it.
- Prefer `pire-browser skills cat core` when an agent skill needs complete operational guidance.

## Installed Package Boundaries

The installed package intentionally omits maintainer docs, fixtures, tests, and private development material. Do not infer package behavior from missing repository-only material. Use `agent/source-inventory.md` to identify what is authoritative in an installed copy.
