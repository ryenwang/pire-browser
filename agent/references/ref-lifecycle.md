# Ref Lifecycle

Snapshot refs identify elements from one browser snapshot. They are not stable ids.

## Fresh Ref Required

Use a fresh ref after:

- Navigation or reload.
- Opening or closing a tab, window, dialog, or modal.
- Typing into search fields that change results.
- Download or upload interactions.
- Any failed action.
- Any command that says the page may have changed.

## Safe Use

- Run `pire-browser snapshot -i`.
- Select the ref from the newest output.
- Act once.
- Verify with command output or another snapshot.

If the ref is missing or stale, inspect again.
