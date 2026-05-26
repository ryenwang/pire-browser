# 01 - Extract Events

Purpose: turn raw session evidence into a concise chronological event list before judging whether `pire-browser` handled the work well.

## Inputs

- User request and any follow-up constraints.
- Codex session logs or local transcript excerpts.
- Optional `pire-browser` runtime artifacts from `%LOCALAPPDATA%\pire-browser`, `target/`, screenshots, or command output.
- Relevant repo docs, especially `docs/CONTEXT.md` and the high-level milestones.

## Process

1. Record the review date, timezone, reviewer, and evidence sources.
2. Identify the session goal in one or two sentences.
3. Extract the browser-automation events in order.
4. Keep commands, page transitions, failures, retries, and user interventions that affected the outcome.
5. Redact secrets and collapse repetitive retries when they share the same cause.

## Output

Create or prepare a review section with:

| Time/order | Event | Evidence | Outcome |
| --- | --- | --- | --- |
| 1 | Short event description | Log, command, screenshot, or user note | Succeeded, failed, retried, or required fallback |

The output should be factual. Classification happens in the next stage.
