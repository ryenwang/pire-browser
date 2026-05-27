# 02 - Classify Functionality

Purpose: decide which parts of a session were handled by current `pire-browser` functionality and which parts required fallback behavior.

## Inputs

- Event list from `01-extract-events.md`.
- Boundary definitions in `docs/CONTEXT.md`.
- Current command documentation in `README.md` and feature-parity docs.

## Process

1. Assign exactly one primary classification to each event:
   - `existing functionality`
   - `outside existing functionality`
   - `user/manual intervention`
   - `external-system issue`
2. Add a secondary note when useful, such as `selector friction`, `auth flow`, `clipboard gap`, `visual QA`, or `deployment API fallback`.
3. For events classified as outside existing functionality, record the fallback used and the operator impact.
4. Do not upgrade or downgrade compatibility claims from anecdotal evidence alone.

## Output

Produce a session summary with these sections:

- Summary.
- Handled by existing functionality.
- Outside existing functionality.
- User/manual intervention.
- External-system issues.

For each outside-functionality item, include:

| Gap | Evidence | Fallback used | Impact |
| --- | --- | --- | --- |
| Short name | Event pointer | Tool, command, or manual step | Why it mattered |
