# Setup And Diagnose

Use this when install, launch, native messaging, optional native package resolution, or Firefox discovery is failing.
For a fresh install with no reported failure, prefer the short happy path first: `pi install npm:pire-browser` for Pi or `npm install -g pire-browser && pire-browser install` for direct CLI use.

## Inputs

- The failing command and its stdout/stderr.
- `pire-browser status` or `pire-browser doctor` output when available.
- OS, architecture, Firefox path, and install method if the user provides them.

## Process

1. Run read-only diagnostics first: `pire-browser status` or `pire-browser doctor`.
   - Prefer `pire-browser doctor --json` when available; follow `data.nextActions` before guessing a repair.
2. If native messaging registration is missing or mismatched, run `pire-browser doctor --fix` or the lower-level `pire-browser setup`.
   - In MCP, use debug-profile `pire_browser_install` for explicit native-host setup or repair.
   - If following an agent-browser-style recipe, `pire-browser install --with-deps` and `doctor --fix --with-deps` may install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing. Linux remains guided/manual to avoid Snap/Flatpak Native Messaging failures.
   - If Firefox discovery fails, follow the platform repair command printed by the error. `--firefox-path` may point to the Firefox executable, a directory containing it, or `/Applications/Firefox.app` on macOS.
3. If postinstall was skipped by `--ignore-scripts`, run setup or retry the browser command that needs auto-launch.
4. If Pi reports a duplicate `pire-browser` tool from `npm:pire-browser` and an older GitHub, local-checkout, or legacy shim source, use `pire-browser pi conflicts` and then `pire-browser pi repair`. If `pire-browser` is not on PATH because Pi cannot start, tell the user to run `npx -y pire-browser@latest pi repair` from a normal terminal. Use `--include-local` only when the user wants the npm package to replace a verified local checkout.
5. If optional native packages were skipped, reinstall with optional dependencies enabled.
6. For launch reproduction, use `--headless`, `PIRE_BROWSER_HEADLESS=1`, or `AGENT_BROWSER_HEADLESS=1` for CI-style headless mode; use `--args`, `PIRE_BROWSER_ARGS`, or `AGENT_BROWSER_ARGS` for raw Firefox launch args; and use `--user-agent`, `PIRE_BROWSER_USER_AGENT`, or `AGENT_BROWSER_USER_AGENT` for a Firefox User-Agent override. These apply when a command launches a new managed Firefox session; existing live sessions keep their current launch context.
7. Verify setup with `pire-browser status`, `pire-browser doctor`, or a fresh browser command.

## Audit

- `status` and plain `doctor` must remain observational; `doctor --fix` is the explicit repair path.
- Browser commands that need auto-launch may run lazy setup when registration is stale.
- Use `pire-browser upgrade` for a foreground latest-package update; in MCP, use debug-profile `pire_browser_upgrade` only when the user wants package update. Use `update check/apply` only when you need the lower-level status or JSON path.
- On Windows, close managed Firefox sessions before replacing binaries during an update.
- Do not claim setup is fixed until a verification command succeeds.

## Outputs

- The failing check name.
- The next command to run.
- A verified setup result or a concise remaining blocker.
