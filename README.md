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
pire-browser --allowed-domains "example.com,*.example.com" open https://example.com
pire-browser --action-policy ./policy.json snapshot -i
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

### Domain Allowlist Guardrails

Use `--allowed-domains` or `AGENT_BROWSER_ALLOWED_DOMAINS` when an operator wants a cooperative wrong-site guardrail:

```powershell
.\target\debug\pire-browser.exe --allowed-domains "app.example.com,*.example.com" open https://app.example.com/dashboard
$env:AGENT_BROWSER_ALLOWED_DOMAINS = "app.example.com,*.example.com"
.\target\debug\pire-browser.exe snapshot -i
.\target\debug\pire-browser.exe --no-allowed-domains open https://example.net
```

The allowlist accepts host patterns such as `example.com`, `*.example.com`, `localhost`, and `127.0.0.1`. Scheme-less navigation inputs like `example.com` are checked as `https://example.com`. `--no-allowed-domains` is an explicit one-command override and emits a `DOMAIN_POLICY_OVERRIDDEN` warning when it bypasses an active env allowlist.

This is a cooperative guardrail, not a browser sandbox. It checks navigation targets before dispatch where possible and asks the extension to reject active-page commands on disallowed `http`/`https` hosts. Active-page commands with an allowlist require an active `http`/`https` target; `about:blank` and `about:newtab` fail until an allowed URL is opened. It does not block redirects, subresources, WebSockets, EventSource, or races where a page navigates between the check and action. Domain patterns are shown in diagnostics; secret-shaped values are still redacted.

### Action Policy Guardrails

Use `--action-policy` or `AGENT_BROWSER_ACTION_POLICY` when an operator wants a cooperative action-category guardrail:

```powershell
@'
{ "default": "allow", "deny": ["eval"] }
'@ | Set-Content .\policy-deny-eval.json
.\target\debug\pire-browser.exe --action-policy .\policy-deny-eval.json eval "document.title"

@'
{ "default": "deny", "allow": ["navigate", "snapshot", "get"] }
'@ | Set-Content .\policy-review.json
$env:AGENT_BROWSER_ACTION_POLICY = ".\policy-review.json"
.\target\debug\pire-browser.exe open https://example.com
.\target\debug\pire-browser.exe snapshot -i
```

Policy files use the upstream v1 shape: optional `default`, `allow`, and `deny`. The categories are `navigate`, `click`, `fill`, `eval`, `snapshot`, `scroll`, `wait`, `get`, `interact`, `state`, `network`, `download`, and `upload`. `deny` wins over `allow`, and missing `default` means `allow`. Unknown keys fail closed so misspelled policy fields cannot silently weaken the guardrail. File-level `confirm` is not supported; confirmation uses the separate `--confirm-actions` surface.

`status --json` and `doctor --json` include an `actionPolicy` diagnostic. Existing unavailable commands still return `NotAvailableError` before action policy checks. `batch` stops immediately on an `ActionPolicyError`, and chained `find ... click/fill/...` commands are classified by the chained action.

### Action Confirmation

Use `--confirm-actions` or `AGENT_BROWSER_CONFIRM_ACTIONS` when sensitive action categories should require an explicit second step:

```powershell
.\target\debug\pire-browser.exe --confirm-actions eval eval "document.title" --json
.\target\debug\pire-browser.exe confirm c_8f3a1234
.\target\debug\pire-browser.exe deny c_8f3a1234

$env:AGENT_BROWSER_CONFIRM_ACTIONS = "eval,download"
.\target\debug\pire-browser.exe eval "document.title" --json
```

When confirmation is required, the command returns `ConfirmationRequired` with a short-lived id, `confirm <id>`, and `deny <id>`. Pending confirmations expire after about 60 seconds. `confirm <id>` re-checks the captured domain and action policy context, bypasses only the already-approved confirmation gate, and then runs the stored command. `deny <id>` consumes the record without running it.

Confirmation records live under `%LOCALAPPDATA%\pire-browser\confirmations`. They are plaintext, user-scoped, short-lived runtime metadata and may contain the original command arguments, so do not treat them as portable artifacts or audit logs. This is a cooperative operator guardrail, not a sandbox: local code that can run the CLI can choose different env vars or policy flags. `--confirm-interactive` prompts only on a TTY; non-TTY runs auto-deny rather than approving silently.

### Downloads

Use `download <target> <path>` when a page element triggers a file download, or `wait --download [path]` when the click already happened:

```powershell
.\target\debug\pire-browser.exe snapshot -i
.\target\debug\pire-browser.exe download '@e4' .\downloads\report.txt
.\target\debug\pire-browser.exe click '@e4'
.\target\debug\pire-browser.exe wait --download .\downloads\report.txt --timeout 60000
```

Firefox downloads are staged under `%LOCALAPPDATA%\pire-browser\downloads\` for managed profiles, then the CLI moves the completed staged file to the requested destination. Destinations must not already exist; missing parent directories are created. The JSON result includes final path, staged path, byte count, download id, state, and a display URL with query strings/fragments stripped.

This is best-effort Firefox download automation. Unknown MIME/helper-app dialogs may still stall or render in-page, PDF downloads may be forced to save in managed profiles, and multiple simultaneous downloads are matched by the newest eligible staged completion. Domain allowlists gate the active page only; they do not claim containment of redirects or final download URLs. Action policy and confirmation use the `download` category.

### Uploads

Use `upload <target> <files...>` for small local files when the page exposes an `input[type=file]` or associated label:

```powershell
.\target\debug\pire-browser.exe upload '#file' .\fixtures\example.txt
.\target\debug\pire-browser.exe upload '#multi-file' .\one.txt .\two.json --json
```

V1 reads the local files in the CLI, sends basename metadata plus base64 bytes to the Firefox extension, and assigns in-page `File` objects to the target input. Total raw file bytes are capped at 512 KiB. Successful output reports file count, basenames, sizes, total bytes, and target summary; it does not echo file contents.

This is best-effort Firefox upload automation, not native OS file-picker control. Directory upload, drag/drop upload, remote URL upload, large-file chunking, and arbitrary file picker dialogs are out of scope. Multiple files require a file input with the `multiple` attribute. Action policy and confirmation use the `upload` category; confirmation records store file identity metadata and reread files on approval.

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

Run the domain allowlist smoke to verify allowed navigation, denied navigation, batch/tab-new denial, active-page denial, state-origin denial, and audited override behavior:

```powershell
npm run smoke:domain-policy
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
