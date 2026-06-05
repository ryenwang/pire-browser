# Transfers And Policies

Use this for downloads, uploads, external navigation, destructive actions, action policies, domain policies, and confirmations.

## Inputs

- The requested transfer, navigation, or action.
- The current snapshot and selected target control when applicable.
- Any policy or confirmation output from the CLI.

## Process

1. Inspect before acting on upload controls, links, destructive actions, or unfamiliar pages.
2. If output returns `confirm <id>`, ask the user before running it.
3. For uploads, verify the target control from a fresh snapshot.
4. For downloads, verify the completed file path and expected file type or size when relevant.
5. Reinspect after transfer-related actions because dialogs and page state often change refs.

## Audit

- Confirmation ids are short lived. Do not invent or reuse old ids.
- Respect navigation and action policy warnings.
- If a command is blocked by policy, stop and explain the blocked action.
- Do not bypass policies with a different tool unless the user explicitly authorizes a different approach.

## Outputs

- Plain-language confirmation request when needed.
- Verified upload/download evidence.
- A blocked-policy report that names the blocked action and policy phase.
