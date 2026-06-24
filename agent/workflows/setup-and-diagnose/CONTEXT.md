# Setup And Diagnose

Use this when install, launch, native messaging, optional native package resolution, or Firefox discovery is failing.

## Inputs

- The failing command and its stdout/stderr.
- `pire-browser status` or `pire-browser doctor` output when available.
- OS, architecture, Firefox path, and install method if the user provides them.

## Process

1. Run read-only diagnostics first: `pire-browser status` or `pire-browser doctor`.
2. If native messaging registration is missing or mismatched, run `pire-browser doctor --fix` or the lower-level `pire-browser setup`.
   - In MCP, use debug-profile `pire_browser_install` for explicit native-host setup or repair.
3. If postinstall was skipped by `--ignore-scripts`, run setup or retry the browser command that needs auto-launch.
4. If optional native packages were skipped, reinstall with optional dependencies enabled.
5. Verify setup with `pire-browser status`, `pire-browser doctor`, or a fresh browser command.

## Audit

- `status` and plain `doctor` must remain observational; `doctor --fix` is the explicit repair path.
- Browser commands that need auto-launch may run lazy setup when registration is stale.
- Use `pire-browser upgrade` for a foreground package update; in MCP, use debug-profile `pire_browser_upgrade` only when the user wants package update. Use `update check/apply` only when you need the lower-level status or JSON path.
- On Windows, close managed Firefox sessions before replacing binaries during an update.
- Do not claim setup is fixed until a verification command succeeds.

## Outputs

- The failing check name.
- The next command to run.
- A verified setup result or a concise remaining blocker.
