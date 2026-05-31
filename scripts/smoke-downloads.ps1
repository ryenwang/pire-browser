param(
  [int]$Port = 8775,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "target\debug\pire-browser.exe"
$RunId = "downloads-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Profile = "downloads-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalActionPolicy = $env:AGENT_BROWSER_ACTION_POLICY
$OriginalConfirmActions = $env:AGENT_BROWSER_CONFIRM_ACTIONS
$SmokeRoot = Join-Path $Repo "target\download-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$SiteDir = Join-Path $SmokeRoot "site"
$ServerScript = Join-Path $SmokeRoot "download_server.py"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$PageUrl = "http://127.0.0.1:$Port/download.html"
$DownloadBytes = "pire-browser download smoke`n"
$DenyDownloadPolicy = Join-Path $SmokeRoot "deny-download.json"
$DownloadsDir = Join-Path $SmokeRoot "final"

$serverProcess = $null
$script:smokeSucceeded = $false
$script:pireStep = 0
$beforeFirefox = @(Get-Process firefox -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
$PireTimeoutMs = 120000

function Invoke-Step {
  param([string]$Label, [scriptblock]$Block)
  Write-Host "==> $Label"
  $global:LASTEXITCODE = 0
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Block 2>&1
    $exitCode = $global:LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldPreference
  }
  if ($output) { $output | ForEach-Object { Write-Host $_ } }
  if ($exitCode -ne 0) { throw "$Label failed with exit code $exitCode" }
  return $output
}

function Join-ProcessArguments {
  param([string[]]$Arguments)
  return ($Arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }) -join " "
}

function Invoke-PireCapturedProcess {
  param([string]$Label, [string[]]$Arguments, [string]$OutPath, [string]$ErrPath)
  $command = '"' + $Pire + '" ' + (Join-ProcessArguments $Arguments) + ' > "' + $OutPath + '" 2> "' + $ErrPath + '"'
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $env:ComSpec
  $processInfo.WorkingDirectory = $Repo
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.Arguments = '/d /s /c "' + $command + '"'
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $processInfo
  [void]$process.Start()
  if (-not $process.WaitForExit($PireTimeoutMs)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$Label timed out after $($PireTimeoutMs / 1000) seconds"
  }
  $stdout = if (Test-Path $OutPath) { Get-Content -LiteralPath $OutPath -Raw } else { "" }
  $stderr = if (Test-Path $ErrPath) { Get-Content -LiteralPath $ErrPath -Raw } else { "" }
  return @{ ExitCode = $process.ExitCode; Stdout = $stdout; Stderr = $stderr }
}

function Invoke-Pire {
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch = "")
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $result = Invoke-PireCapturedProcess $Label $Arguments $outPath $errPath
  if ($result.Stdout) { Write-Host $result.Stdout.TrimEnd() }
  if ($result.Stderr) { Write-Host $result.Stderr.TrimEnd() }
  if ($result.ExitCode -ne 0) { throw "$Label failed with exit code $($result.ExitCode). Output: $($result.Stdout) $($result.Stderr)" }
  $text = "$($result.Stdout)`n$($result.Stderr)"
  if ($MustMatch -and $text -notmatch $MustMatch) { throw "$Label output did not match /$MustMatch/. Output: $text" }
  return $text
}

function Invoke-PireFailure {
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch)
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $result = Invoke-PireCapturedProcess $Label $Arguments $outPath $errPath
  if ($result.Stdout) { Write-Host $result.Stdout.TrimEnd() }
  if ($result.Stderr) { Write-Host $result.Stderr.TrimEnd() }
  if ($result.ExitCode -eq 0) { throw "$Label unexpectedly succeeded" }
  $text = "$($result.Stdout)`n$($result.Stderr)"
  if ($text -notmatch $MustMatch) { throw "$Label output did not match /$MustMatch/. Output: $text" }
  return $text
}

function Assert-DownloadedFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { throw "Expected downloaded file at $Path" }
  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -ne $DownloadBytes) { throw "Unexpected downloaded content at $Path" }
}

function Stop-SmokeProcesses {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  $afterFirefox = @(Get-Process firefox -ErrorAction SilentlyContinue)
  foreach ($process in $afterFirefox) {
    if ($beforeFirefox -notcontains $process.Id) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
  }
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -eq "pire-browser-host.exe" -and
      $_.CommandLine -like "*$SmokeCargoTarget*debug*pire-browser-host.exe*"
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Restore-Setup {
  if (-not $OriginalLocalAppData) { return }
  $env:LOCALAPPDATA = $OriginalLocalAppData
  if (Test-Path $RepoPire) {
    try {
      & $RepoPire setup --windows --firefox-path $FirefoxPath *> $null
    } catch {
      Write-Warning "Failed to restore Native Messaging setup under original LOCALAPPDATA: $($_.Exception.Message)"
    }
  }
}

try {
  if (-not (Test-Path $FirefoxPath)) { throw "Firefox not found at $FirefoxPath; pass -FirefoxPath" }
  New-Item -ItemType Directory -Force -Path $SmokeRoot,$TempLocalAppData,$SiteDir,$DownloadsDir | Out-Null
  Set-Content -LiteralPath (Join-Path $SiteDir "download.html") -Value @'
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>pire-browser download fixture</title>
</head>
<body>
  <a id="download-link" href="/download?code=download-secret#frag">Download smoke file</a>
</body>
</html>
'@
  Set-Content -LiteralPath $DenyDownloadPolicy -Value '{ "default": "allow", "deny": ["download"] }'
  @"
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(r"$SiteDir")
BODY = b"pire-browser download smoke\n"

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return str(ROOT / path.split("?", 1)[0].lstrip("/"))
    def do_GET(self):
        if self.path.split("?", 1)[0] == "/download":
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="smoke-download.txt"')
            self.send_header("Content-Length", str(len(BODY)))
            self.end_headers()
            self.wfile.write(BODY)
            return
        return super().do_GET()

ThreadingHTTPServer(("127.0.0.1", $Port), Handler).serve_forever()
"@ | Set-Content -LiteralPath $ServerScript

  $env:LOCALAPPDATA = $TempLocalAppData
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget
  Remove-Item Env:AGENT_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue
  Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue

  $null = Invoke-Step "Build Rust binaries" { cargo build -j 1 }
  $null = Invoke-Step "Build Firefox extension" { npm --prefix extension run build }
  $null = Invoke-Step "Register Native Messaging host in isolated LOCALAPPDATA" {
    & $Pire setup --windows --firefox-path $FirefoxPath
  }

  Write-Host "==> Start fixture server on $PageUrl"
  $serverProcess = Start-Process -FilePath python `
    -ArgumentList @($ServerScript) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerOut `
    -RedirectStandardError $ServerErr `
    -PassThru
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -UseBasicParsing $PageUrl
  if ($response.StatusCode -ne 200) { throw "Fixture server returned $($response.StatusCode)" }

  $null = Invoke-Pire "Open download fixture" @("--session-name", $Profile, "open", $PageUrl, "--json") '"success"\s*:\s*true'
  $null = Invoke-Pire "Verify fixture link" @("--session-name", $Profile, "wait", "--selector", "#download-link", "--timeout", "30000", "--json") '"success"\s*:\s*true'

  $directPath = Join-Path $DownloadsDir "direct.txt"
  $direct = Invoke-Pire "Direct download" @("--session-name", $Profile, "download", "#download-link", $directPath, "--json") '"success"\s*:\s*true'
  if ($direct -match "download-secret") { throw "Download output leaked query sentinel" }
  Assert-DownloadedFile $directPath

  $waitPath = Join-Path $DownloadsDir "wait.txt"
  $null = Invoke-Pire "Click download link" @("--session-name", $Profile, "click", "#download-link", "--json") '"success"\s*:\s*true'
  $wait = Invoke-Pire "Wait for download" @("--session-name", $Profile, "wait", "--download", $waitPath, "--timeout", "60000", "--json") '"success"\s*:\s*true'
  if ($wait -match "download-secret") { throw "Wait download output leaked query sentinel" }
  Assert-DownloadedFile $waitPath

  $existingPath = Join-Path $DownloadsDir "existing.txt"
  Set-Content -LiteralPath $existingPath -Value "existing"
  $null = Invoke-PireFailure "Existing destination fails" @("--session-name", $Profile, "download", "#download-link", $existingPath, "--json") "already exists"

  $denyPath = Join-Path $DownloadsDir "deny.txt"
  $null = Invoke-PireFailure "Action policy denies download before launch" @("--session-name", "$Profile-deny", "--action-policy", $DenyDownloadPolicy, "download", "#download-link", $denyPath, "--json") "ActionPolicyError"
  if (Test-Path $denyPath) { throw "Denied download should not create destination" }

  $env:AGENT_BROWSER_CONFIRM_ACTIONS = "download"
  $confirmPath = Join-Path $DownloadsDir "confirmed.txt"
  $pendingText = Invoke-PireFailure "Confirmation required for download" @("--session-name", $Profile, "download", "#download-link", $confirmPath, "--json") "ConfirmationRequired"
  $pending = $pendingText | ConvertFrom-Json
  $null = Invoke-Pire "Confirm download" @("confirm", $pending.error.data.confirmationId, "--json") '"success"\s*:\s*true'
  Assert-DownloadedFile $confirmPath

  $denyConfirmPath = Join-Path $DownloadsDir "denied-confirm.txt"
  $pendingDenyText = Invoke-PireFailure "Confirmation can be denied" @("--session-name", $Profile, "download", "#download-link", $denyConfirmPath, "--json") "ConfirmationRequired"
  $pendingDeny = $pendingDenyText | ConvertFrom-Json
  $null = Invoke-Pire "Deny download" @("deny", $pendingDeny.error.data.confirmationId, "--json") '"denied"\s*:\s*true'
  if (Test-Path $denyConfirmPath) { throw "Denied confirmation should not create destination" }
  Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue

  $timeoutProfile = "$Profile-timeout"
  $timeoutPath = Join-Path $DownloadsDir "timeout.txt"
  $null = Invoke-Pire "Open timeout fixture" @("--session-name", $timeoutProfile, "open", $PageUrl, "--json") '"success"\s*:\s*true'
  $null = Invoke-PireFailure "Wait download timeout" @("--session-name", $timeoutProfile, "wait", "--download", $timeoutPath, "--timeout", "500", "--json") "TimeoutError"
  $null = Invoke-PireFailure "Upload remains unavailable" @("upload", "#file", "anything.txt", "--json") "NotAvailableError"

  $script:smokeSucceeded = $true
  Write-Output "Download smoke test passed for profile $Profile."
} catch {
  Write-Host "Download smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
  if (Test-Path $ServerErr) {
    Write-Host ""
    Write-Host "Recent fixture server error log:"
    Get-Content $ServerErr -Tail 40 | ForEach-Object { Write-Host $_ }
  }
  exit 1
} finally {
  try {
    if (Test-Path $Pire) { & $Pire --session-name $Profile close *> $null }
  } catch {
  }
  Stop-SmokeProcesses
  Restore-Setup
  $env:LOCALAPPDATA = $OriginalLocalAppData
  if ($OriginalCargoTargetDir) {
    $env:CARGO_TARGET_DIR = $OriginalCargoTargetDir
  } else {
    Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
  }
  if ($OriginalActionPolicy) {
    $env:AGENT_BROWSER_ACTION_POLICY = $OriginalActionPolicy
  } else {
    Remove-Item Env:AGENT_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue
  }
  if ($OriginalConfirmActions) {
    $env:AGENT_BROWSER_CONFIRM_ACTIONS = $OriginalConfirmActions
  } else {
    Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue
  }
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
