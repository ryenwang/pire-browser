# Inspect Before Act

Use this before clicking, typing, selecting, waiting on page content, or making any page-affecting decision.

## Inputs

- The user's target description.
- The active session/profile selection.
- Any visible labels, roles, selectors, or expected page state.

## Process

1. Run `pire-browser snapshot`.
2. Choose the target from the latest snapshot.
3. Act using the fresh ref from that snapshot.
4. Reinspect after navigation, modal changes, new tabs, reloads, significant DOM changes, downloads, uploads, or failed actions.

## Audit

- Do not reuse refs from old messages or old snapshots.
- If the user gives a visible label, match it against the current snapshot before acting.
- If the target is not present, navigate, wait, or ask for clarification instead of guessing.

## Outputs

- The selected fresh ref or selector.
- The action command to run next.
- A short explanation when the requested target is not currently actionable.
