# Safety And Errors

Use this when output includes warnings, errors, policy blocks, or confirmations.

## Confirmations

- Ask the user before running any returned `confirm <id>`.
- Include the action being confirmed.
- Do not reuse old confirmation ids.

## Errors

- `unsupported_command`: the CLI did not recognize the command in this context.
- `invalid_args`: command shape or flags are wrong.
- Native host or registry failures: run setup or allow lazy setup through an auto-launchable browser command.
- Stale refs: run `snapshot -i` again and retry with a fresh ref.

## Reporting

Do not hide warnings. Summarize the concrete next step and the command that produced the evidence.
