# pire-browser

`pire-browser` is a Windows-first MVP for controlling a user-owned Firefox browser from Pi through a Firefox WebExtension and Native Messaging host.

It intentionally does **not** use BiDi or CDP. Firefox owns the extension/native-host lifecycle, and the CLI talks to the native host through a current-user Windows named pipe.

## MVP Commands

```bash
pire-browser status
pire-browser status --json
pire-browser doctor
pire-browser help click
pire-browser setup --windows
pire-browser launch
pire-browser launch --url https://discord.com/login
pire-browser open https://example.com --label docs
pire-browser snapshot -i
pire-browser find label "Email" fill "hello@example.com"
pire-browser find role button --name "Submit" click
pire-browser click '@e1'
pire-browser fill '@e2' "hello"
pire-browser clipboard read
pire-browser clipboard write "hello"
pire-browser clipboard copy
pire-browser clipboard paste
pire-browser --session-name work open https://example.com
pire-browser --session-name work snapshot -i
pire-browser session list
pire-browser session attach <session-id>
pire-browser session cleanup
pire-browser press Enter
pire-browser wait --selector "#done"
pire-browser screenshot out.png
pire-browser tabs list
pire-browser tabs select t1
pire-browser tabs close t1
```

## Install on Windows 11 x64

Assumptions:

- Pi is already installed.
- Firefox is already installed.
- Your Windows PC can access the private `ryenwang/pire-browser` GitHub repository.

Install the private Pi package with one command:

```powershell
pi install git:git@github.com:ryenwang/pire-browser@v0.1.5
```

The package installs the `pire-browser` Pi tool and runs the Windows setup step automatically. That setup registers the Firefox Native Messaging host for the current Windows user. Browser commands such as `open https://example.com` auto-launch the managed `Default` Firefox profile if no live extension session is running. Use `--session-name <name>` before a browser command to reuse or launch a separate managed Firefox profile for that workflow.

If Firefox is installed somewhere unusual:

```powershell
$env:PIRE_BROWSER_FIREFOX_PATH = "D:\Apps\Mozilla Firefox\firefox.exe"
pi install git:git@github.com:ryenwang/pire-browser@v0.1.5
```

Start Pi:

```powershell
pi
```

Inside Pi, ask it to use the `pire-browser` tool:

```text
Use pire-browser to open https://example.com and snapshot the page.
```

For a local model, configure Pi for your local or OpenAI-compatible provider, then select that model with Pi's `/model` command or CLI flags. The `pire-browser` tool is model-agnostic; it shells out to the packaged local `pire-browser.exe`.

### Manual Zip Install

The GitHub release also includes a Windows x64 package with:

- `pire-browser.exe`
- `pire-browser-host.exe`
- the prebuilt Firefox extension files
- `install-windows.ps1`

From PowerShell on the target PC:

```powershell
gh auth login
New-Item -ItemType Directory -Force "$env:TEMP\pire-browser-install" | Out-Null
gh release download v0.1.5 --repo ryenwang/pire-browser --pattern pire-browser-windows-x64.zip --dir "$env:TEMP\pire-browser-install"
Expand-Archive -Force "$env:TEMP\pire-browser-install\pire-browser-windows-x64.zip" "$env:TEMP\pire-browser-install\pire-browser-windows-x64"
Set-Location "$env:TEMP\pire-browser-install\pire-browser-windows-x64"
.\install-windows.ps1
```

The installer copies the app to:

```text
%LOCALAPPDATA%\Programs\pire-browser
```

It also registers the Firefox Native Messaging host for the current Windows user and adds the install directory to the current user's `Path`. Open a new PowerShell window after install:

```powershell
pire-browser status
pire-browser doctor
pire-browser launch
pire-browser open https://example.com
pire-browser snapshot -i
```

If Firefox is installed somewhere unusual:

```powershell
.\install-windows.ps1 -FirefoxPath "D:\Apps\Mozilla Firefox\firefox.exe"
```

## Development

```bash
cargo build
npm --prefix extension install
npm --prefix extension run build
cargo run -p pire-browser-cli -- setup --windows
npx --prefix extension web-ext run --source-dir extension --firefox "C:\Program Files\Mozilla Firefox\firefox.exe"
```

### Persistent Profiles

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

For reusable named workflows, put `--session-name <name>` before the command. The name maps one-to-one to a managed Firefox profile directory, reuses an existing live session when one exists, and launches that profile when a browser command needs it:

```powershell
.\target\debug\pire-browser.exe --session-name work open https://example.com
.\target\debug\pire-browser.exe --session-name work snapshot -i
.\target\debug\pire-browser.exe --session-name "my session" get url
```

Profile names are preserved exactly and may contain letters, numbers, internal spaces, `_`, `-`, and `.`. Empty names, path traversal, slashes, and `:` are rejected before launch.

### Active-Origin State Files

Use `state save` and `state load` when you need to hand off cookies and Web Storage for the active page origin:

```powershell
.\target\debug\pire-browser.exe --session-name work open https://app.example.com/dashboard
.\target\debug\pire-browser.exe --session-name work state save .\.pire-state\app.example.com-review.json
.\target\debug\pire-browser.exe state inspect .\.pire-state\app.example.com-review.json
.\target\debug\pire-browser.exe state inspect --record .\.pire-state\app.example.com-review.json
.\target\debug\pire-browser.exe --session-name review state load --require-inspected .\.pire-state\app.example.com-review.json
$env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = "1"
.\target\debug\pire-browser.exe --session-name review state load .\.pire-state\app.example.com-review.json
```

State files are plaintext and contain cookie, `localStorage`, and `sessionStorage` values. Do not commit or share them. The project gitignores `.pire-state/`; `state save` still accepts explicit paths, but warns when writing outside that directory. `state inspect` is metadata-only and read-only by default. `state inspect --record` writes a 24-hour local receipt under `%LOCALAPPDATA%\pire-browser\state-receipts`, and `state load --require-inspected` requires the file to match that receipt before loading. Teams can set `PIRE_BROWSER_REQUIRE_INSPECTED_STATE=1` so normal `state load` requires a fresh receipt; `--no-require-inspected` is an explicit one-command override and emits a `STATE_POLICY_OVERRIDDEN` warning. This is a cooperative guardrail against accidental or unreviewed loads, not a sandbox against code that can change environment variables or pass override flags. Display URLs strip query strings and fragments, for example `https://app.example.com/callback?code=secret#token` is shown and saved as `https://app.example.com/callback`. This is active-origin state only; it does not export passwords, IndexedDB, cache, service workers, full profiles, auth vault entries, or cross-origin SSO state. `state save` requires a live targeted page. `state load` reloads the page after applying state, and `--session <id>` remains strict and never launches.

### Secret-Safe Auth Handoff

For login-required sites, use the persistent Firefox profile rather than passing credentials through tool commands:

```powershell
.\target\debug\pire-browser.exe launch --url <login-url>
# Sign in manually in the Firefox window.
.\target\debug\pire-browser.exe status --json
```

`status --json` and `doctor --json` include an `authHandoff` advisory for the `Default` profile. It reports whether the profile folder exists and confirms that login state is `not_inspected`; `pire-browser` does not read cookies, saved passwords, session tokens, or one-time codes for this diagnostic.

### Session Targeting

Use `session list` when more than one Firefox extension session may be live:

```powershell
.\target\debug\pire-browser.exe session list
.\target\debug\pire-browser.exe session list --json
```

Use `session attach <id>` to print the exact prefix for follow-up commands:

```powershell
.\target\debug\pire-browser.exe session attach <session-id>
.\target\debug\pire-browser.exe --session <session-id> snapshot -i
```

`--session <id>` is strict: it targets only an existing live session id and never starts Firefox. `--session-name <name>` is lifecycle-aware for browser commands: it reuses or launches the named managed profile, while `--session-name <name> close` only targets an existing live named session. `session list` and `status --json` include `profileName` when a live session can be matched to launcher metadata.

If an explicit session id is wrong or stale, the CLI reports live candidates and points back to `session list`. `session cleanup` removes stale session files only; it does not close live Firefox sessions or delete browser profiles.

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

Run the named-profile lifecycle smoke to verify storage isolation between two managed profiles:

```powershell
npm run smoke:named-sessions
```

Run the state handoff smoke to verify active-origin save/load across named profiles:

```powershell
npm run smoke:state
```

Create the Windows release package locally:

```powershell
.\scripts\package-windows.ps1
```

The zip is written to:

```text
dist\pire-browser-windows-x64.zip
```

Check setup health without launching a browser:

```powershell
.\target\debug\pire-browser.exe doctor
.\target\debug\pire-browser.exe doctor --json
.\target\debug\pire-browser.exe status --json
.\target\debug\pire-browser.exe session list --json
```

Use `pire-browser help` for command discovery, `pire-browser help clipboard` for clipboard read/write/copy/paste details, `pire-browser help state` for active-origin state files, or `pire-browser help session` for targeting commands. In PowerShell, quote refs from `snapshot -i` or `find` output, for example `pire-browser click '@e4'`, so `@` is not parsed as shell syntax.

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
