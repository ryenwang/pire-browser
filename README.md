# pire-browser

`pire-browser` is a Windows-first MVP for controlling a user-owned Firefox browser from Pi through a Firefox WebExtension and Native Messaging host.

It intentionally does **not** use BiDi or CDP. Firefox owns the extension/native-host lifecycle, and the CLI talks to the native host through a current-user Windows named pipe.

## MVP Commands

```bash
pire-browser status
pire-browser setup --windows
pire-browser launch
pire-browser launch --url https://discord.com/login
pire-browser open https://example.com --label docs
pire-browser snapshot -i
pire-browser find label "Email" fill "hello@example.com"
pire-browser find role button --name "Submit" click
pire-browser click @e1
pire-browser fill @e2 "hello"
pire-browser press Enter
pire-browser wait --selector "#done"
pire-browser screenshot out.png
pire-browser tabs list
pire-browser tabs select t1
pire-browser tabs close t1
```

## Development

```bash
cargo build
npm --prefix extension install
npm --prefix extension run build
cargo run -p pire-browser-cli -- setup --windows
npx --prefix extension web-ext run --source-dir extension --firefox "C:\Program Files\Mozilla Firefox\firefox.exe"
```

### Persistent Default Profile

Use `launch` for day-to-day automation when you want Firefox to remember site logins:

```powershell
.\target\debug\pire-browser.exe launch
.\target\debug\pire-browser.exe launch --url https://discord.com/login
```

`launch` starts Firefox through `web-ext` with one persistent profile named `Default`:

```text
%LOCALAPPDATA%\pire-browser\firefox-profiles\Default
```

Firefox stores cookies, sessions, and saved passwords inside that profile, so the same `Default` profile can stay logged into Discord, Gofile, and other sites. `pire-browser` only stores launcher metadata under `%LOCALAPPDATA%\pire-browser\profiles\Default`; it does not store or expose website credentials. Deleting the `Default` profile folder clears those saved browser sessions.

On launch, `pire-browser` also seeds the `Default` profile's `user.js` to skip Firefox's Terms/Privacy first-run popup and the legacy first-run page. It also attempts the equivalent current-user policy under `HKCU\Software\Policies\Mozilla\Firefox` when Windows allows it.

### Smoke Test

Run the repeatable Windows smoke test from PowerShell:

```powershell
.\scripts\smoke.ps1
```

It builds the Rust binaries and extension, registers the Native Messaging host, starts a local fixture server, launches Firefox through `web-ext`, waits for a live session, then verifies `open`, `snapshot`, semantic `find`/`fill`, semantic `find`/`click`, `wait`, `screenshot`, and `tabs list`.

Leave the browser and fixture server running for inspection:

```powershell
.\scripts\smoke.ps1 -KeepAlive
```

Use a custom Firefox path or fixture port:

```powershell
.\scripts\smoke.ps1 -Port 8765 -FirefoxPath "C:\Program Files\Mozilla Firefox\firefox.exe"
```

Check setup health without launching a browser:

```powershell
.\target\debug\pire-browser.exe install-status
.\target\debug\pire-browser.exe install-status --json
```

The setup command registers the Native Messaging host under:

```text
HKCU\Software\Mozilla\NativeMessagingHosts\dev.pi.pire_browser
```

The extension ID is:

```text
pire-browser@pi.local
```

### RBXLX Download Runner

Use the RBXLX runner for Step C of the Discord/Gofile workflow:

```powershell
.\scripts\download-rbxlx-from-csv.ps1
```

Useful test modes:

```powershell
.\scripts\download-rbxlx-from-csv.ps1 -Limit 1 -StopOnError
.\scripts\download-rbxlx-from-csv.ps1 -Limit 5
```

The runner starts with the oldest CSV row whose `status` is not `downloaded`, opens the Gofile link through `pire-browser`, reads the displayed `.rbxlx` filename from the page, clicks the visible Download button, waits for the browser download to finish, moves the file into the RBXLX folder, and updates `status`, `success_datetime`, and `file_location`.

For rows where the requested `game_id` differs from the displayed downloaded filename, the displayed filename is treated as the source of truth. If that exact file already exists in the target folder, the runner marks the row `downloaded` without downloading again.

Duplicate `game_id` rows are handled by the newest row. When a duplicate needs processing, the runner downloads the newest link and compares content against the existing version. If the new file is identical, it deletes the new copy and keeps the existing file. If the new file differs, it moves the older version to:

```text
C:\Users\wangr\bloxpi\examples\Games\RBXLX Files\Past Versions
```

The older file is renamed with its creation timestamp before the `.rbxlx` extension, and prior duplicate CSV rows are removed after the newest row is verified. To force reconciliation of duplicate groups whose newest rows are already marked `downloaded`, run:

```powershell
.\scripts\download-rbxlx-from-csv.ps1 -IncludeDownloadedDuplicates
```

## Security Model

The Native Messaging host exposes a Windows named pipe using a DACL restricted to the current Windows user plus required system/admin principals. Session discovery files live under `%LOCALAPPDATA%\pire-browser\sessions`.

This protects against cross-user and remote access. It does not defend against malicious code already running as the same Windows user.

## Current Limits

- DOM-level automation only; no trusted OS input.
- File uploads, payment/auth flows, and browser-restricted pages can return `requires_user_activation`.
- Cross-origin frames are best-effort; inaccessible frames are opaque.
- Screenshots are visible-viewport only.
