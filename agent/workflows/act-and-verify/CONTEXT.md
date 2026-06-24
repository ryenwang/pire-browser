# Act And Verify

Use this after a page action or when deciding whether a browser task is complete.

## Inputs

- The command you are about to run or just ran.
- The latest known session/profile target.
- The user's requested end state.

## Process

1. Run the action command.
2. Read the command result.
3. Verify the changed state with `snapshot -i`, command output, a relevant file/status command, or a page-specific wait.
4. Report success only after fresh evidence confirms the requested state.

## Audit

- Treat action output as provisional when it says the page may still be changing.
- If navigation or reload occurs, discard old refs.
- If an action returns a warning, include it in your reasoning.
- If a click fails because the target is covered, handle the reported covering element and re-run `snapshot -i` before retrying the original ref.
- If an action fails, inspect before retrying.

## Outputs

- A concise success report tied to verified evidence.
- Or a blocked/error report that names the failed command and the next useful inspection step.
