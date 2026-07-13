# Act And Verify

Use this after a page action or when deciding whether a browser task is complete.

## Inputs

- The command you are about to run or just ran.
- The latest known session/profile target.
- The user's requested end state.

## Process

1. Run the action command.
2. Read the command result.
3. Verify the changed state with `snapshot`, command output, a relevant file/status command, or a page-specific wait.
4. Report success only after fresh evidence confirms the requested state.

## Audit

- Treat action output as provisional when it says the page may still be changing.
- If navigation or reload occurs, discard old refs.
- If an action returns a warning, include it in your reasoning.
- If a click fails because the target is covered, handle the reported covering element and re-run `snapshot` before retrying the original ref.
- If an action fails, inspect before retrying.

## Repro Evidence

When the user asks for QA, a bug report, or a reproducible finding:

1. Keep one stable named session for the issue.
2. Start `trace`; add `record` and `network har start` when visual timing or API
   evidence matters.
3. Reproduce with fresh refs, semantic actions, and targeted waits.
4. Capture a final screenshot, URL, compact snapshot, and any targeted state
   check that proves the result.
5. Stop HAR, recording, and trace in reverse order even when the repro fails.
6. Report exact steps, expected/actual results, repro confidence, and artifact
   paths. Do not paste secrets into the report.

## Outputs

- A concise success report tied to verified evidence.
- Or a blocked/error report that names the failed command and the next useful inspection step.
