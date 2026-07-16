# Sessions, State, And Files

Use this for live-session isolation, compact restore, Firefox profile sources,
state files, downloads, uploads, and legacy profile recovery.

## Choose The Persistence Level

1. One-off work: use `pire-browser open`. The profile and default downloads are
   temporary.
2. Isolated live work: add `--session <name>`. A name does not make the profile
   durable.
3. Cookie/localStorage continuity: add `--restore [key]`. The key defaults to
   the session name.
4. Existing Firefox login bootstrap: add `--profile <name>` for one immutable
   temporary snapshot of a discovered or preserved source.
5. Full browser durability: use a dedicated `--profile <path>`. This is the only
   mode that intentionally preserves IndexedDB, service workers, passwords,
   history, cache, and other Firefox profile data.

## Project QA Recipe

```bash
SESSION="$(pire-browser session id --scope worktree --prefix <app>)"
pire-browser --session "$SESSION" --restore open <url>
pire-browser --session "$SESSION" --restore snapshot -i
pire-browser --session "$SESSION" close
```

For the first run with existing Firefox cookies, inspect `pire-browser profiles`,
ask the user to close Firefox if the source is locked, then run:

```bash
pire-browser --profile Default --session "$SESSION" --restore open <url>
```

Later runs can omit `--profile Default` and use compact restore. If the app
requires IndexedDB or service workers, choose a dedicated persistent path with
the user instead.

## Inspection And Recovery

- `pire-browser session --json`: selected/default live and restore target.
- `pire-browser session list --json`: live sessions in the namespace.
- `pire-browser profiles`: discovered sources and preserved 0.2.x profiles.
- `pire-browser profiles usage --all`: legacy storage totals.
- `pire-browser profiles clean <name> --dry-run`: cache-only preview.
- `pire-browser profiles delete <name> --yes`: explicit stopped legacy deletion.
- `pire-browser doctor --json`: marked orphan count/bytes.
- `pire-browser doctor --fix`: unthrottled safe orphan and expired-state cleanup.

Never delete profile directories directly when a public command covers the
operation. Cleanup must not touch discovered sources, explicit profile paths,
or preserved legacy profiles unless the user runs the confirmed delete command.

## State Contract

- Current state schema v2 contains all profile cookies plus origin-keyed
  `localStorage`. Legacy v1 active-origin files remain readable.
- Automatic restore lives under
  `restore-sessions/<namespace>/<key>.json` in the OS data directory.
- `state list` includes project and automatic restore states. Use
  `project:<name>` or `restore:<namespace>/<key>` for management operations;
  reject ambiguous bare names.
- `--restore-save auto` protects a good state after failed import or validation.
  `always` and `never` are explicit alternatives.
- Automatic restore saves every 30 seconds while commands are idle and on
  explicit close. `PIRE_BROWSER_AUTOSAVE_INTERVAL_MS=0` means close-only.
- Automatic restore expires after 30 days unless the user changes
  `PIRE_BROWSER_STATE_EXPIRE_DAYS`; `0` disables expiry.
- `AGENT_BROWSER_*` aliases are accepted for namespace, autosave, expiry,
  encryption, state, profile, session, and download values. Configure restore
  validation with the documented flags or config keys.

## Secret And File Safety

- State files are plaintext by default. AES-256-GCM is enabled by a 64-character
  hex `PIRE_BROWSER_ENCRYPTION_KEY` or `AGENT_BROWSER_ENCRYPTION_KEY`.
- Do not print cookie/localStorage values or encryption keys.
- Default downloads disappear with the temporary session. Use
  `--download-path <dir>` when the user expects durable files.
- Verify downloads on disk and uploads with fresh page state.
- Do not assume repository-relative paths from an installed package.

## Outputs

- The selected namespace, live session, restore key, and profile kind.
- Metadata-only state and legacy-profile summaries.
- Verified durable file paths and transfer outcomes.
