param(
  [int]$Port = 8776,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "target\debug\pire-browser.exe"
$RunId = "uploads-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Profile = "uploads-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalActionPolicy = $env:AGENT_BROWSER_ACTION_POLICY
$OriginalConfirmActions = $env:AGENT_BROWSER_CONFIRM_ACTIONS
$SmokeRoot = Join-Path $Repo "target\upload-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$SiteDir = Join-Path $SmokeRoot "site"
$FilesDir = Join-Path $SmokeRoot "files"
$ServerScript = Join-Path $SmokeRoot "upload_server.py"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$PageUrl = "http://127.0.0.1:$Port/upload.html"
$DenyUploadPolicy = Join-Path $SmokeRoot "deny-upload.json"
$AllowNavigateOnlyPolicy = Join-Path $SmokeRoot "allow-navigate-only.json"
$PireTimeoutMs = 120000

$serverProcess = $null
$script:smokeSucceeded = $false
$script:pireStep = 0
$beforeFirefox = @(Get-Process firefox -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

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

function Assert-NoPayloadLeak {
  param([string]$Output)
  foreach ($needle in @("one upload smoke", "two upload smoke", "bytesBase64", "b25lIHVwbG9hZCBzbW9rZQ")) {
    if ($Output -match [regex]::Escape($needle)) { throw "Upload command output leaked payload sentinel: $needle" }
  }
}

function FileHashLower {
  param([string]$Path)
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
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
  New-Item -ItemType Directory -Force -Path $SmokeRoot,$TempLocalAppData,$SiteDir,$FilesDir | Out-Null

  $onePath = Join-Path $FilesDir "one-upload.txt"
  $twoPath = Join-Path $FilesDir "two-upload.json"
  $labelPath = Join-Path $FilesDir "label-upload.txt"
  $denyPath = Join-Path $FilesDir "denied-upload.txt"
  $mutablePath = Join-Path $FilesDir "mutable-upload.txt"
  $oversizedPath = Join-Path $FilesDir "oversized.bin"
  Set-Content -LiteralPath $onePath -Value "one upload smoke`n" -NoNewline
  Set-Content -LiteralPath $twoPath -Value "{`"two`":true,`"note`":`"two upload smoke`"}`n" -NoNewline
  Set-Content -LiteralPath $labelPath -Value "label upload smoke`n" -NoNewline
  Set-Content -LiteralPath $denyPath -Value "denied upload smoke`n" -NoNewline
  Set-Content -LiteralPath $mutablePath -Value "mutable upload smoke`n" -NoNewline
  [IO.File]::WriteAllBytes($oversizedPath, [byte[]]::new(524289))

  $oneHash = FileHashLower $onePath
  $twoHash = FileHashLower $twoPath
  $labelHash = FileHashLower $labelPath

  Set-Content -LiteralPath (Join-Path $SiteDir "upload.html") -Value @'
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>pire-browser upload fixture</title>
</head>
<body>
  <input id="single" type="file">
  <input id="multi" type="file" multiple>
  <label id="label-target" for="single">Upload via label</label>
  <button id="not-file">Not a file input</button>
  <pre id="summary">empty</pre>
  <script>
    async function hashFile(file) {
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    async function update(event) {
      const files = Array.from(event.target.files || []);
      const parts = [];
      for (const file of files) {
        parts.push(`${file.name}:${file.size}:${await hashFile(file)}`);
      }
      document.querySelector("#summary").textContent = parts.join("|") || "empty";
    }
    document.querySelector("#single").addEventListener("change", update);
    document.querySelector("#multi").addEventListener("change", update);
  </script>
</body>
</html>
'@
  Set-Content -LiteralPath $DenyUploadPolicy -Value '{ "default": "allow", "deny": ["upload"] }'
  Set-Content -LiteralPath $AllowNavigateOnlyPolicy -Value '{ "default": "deny", "allow": ["navigate"] }'
  @"
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(r"$SiteDir")

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return str(ROOT / path.split("?", 1)[0].lstrip("/"))

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

  $null = Invoke-Pire "Open upload fixture" @("--session-name", $Profile, "open", $PageUrl, "--json") '"success"\s*:\s*true'
  $null = Invoke-Pire "Verify fixture input" @("--session-name", $Profile, "wait", "--selector", "#single", "--timeout", "30000", "--json") '"success"\s*:\s*true'

  $single = Invoke-Pire "Single upload" @("--session-name", $Profile, "upload", "#single", $onePath, "--json") '"fileCount"\s*:\s*1'
  Assert-NoPayloadLeak $single
  $null = Invoke-Pire "Assert single upload hash" @("--session-name", $Profile, "wait", "--text", $oneHash, "--timeout", "30000", "--json") '"success"\s*:\s*true'

  $multi = Invoke-Pire "Multiple upload" @("--session-name", $Profile, "upload", "#multi", $onePath, $twoPath, "--json") '"fileCount"\s*:\s*2'
  Assert-NoPayloadLeak $multi
  $null = Invoke-Pire "Assert multi upload hash one" @("--session-name", $Profile, "wait", "--text", $oneHash, "--timeout", "30000", "--json") '"success"\s*:\s*true'
  $null = Invoke-Pire "Assert multi upload hash two" @("--session-name", $Profile, "wait", "--text", $twoHash, "--timeout", "30000", "--json") '"success"\s*:\s*true'

  $label = Invoke-Pire "Label target upload" @("--session-name", $Profile, "upload", "#label-target", $labelPath, "--json") '"target"\s*:'
  Assert-NoPayloadLeak $label
  $null = Invoke-Pire "Assert label upload hash" @("--session-name", $Profile, "wait", "--text", $labelHash, "--timeout", "30000", "--json") '"success"\s*:\s*true'

  $null = Invoke-PireFailure "Non-multiple input rejects multiple files" @("--session-name", $Profile, "upload", "#single", $onePath, $twoPath, "--json") "multiple files"
  $null = Invoke-PireFailure "Non-file target fails" @("--session-name", $Profile, "upload", "#not-file", $onePath, "--json") "input\[type=file\]"
  $null = Invoke-PireFailure "Missing local file fails" @("--session-name", $Profile, "upload", "#single", (Join-Path $FilesDir "missing.txt"), "--json") "upload file not found"
  $null = Invoke-PireFailure "Oversized local file fails" @("--session-name", $Profile, "upload", "#single", $oversizedPath, "--json") "too large"

  $null = Invoke-PireFailure "Action policy denies upload before file read" @("--session-name", $Profile, "--action-policy", $DenyUploadPolicy, "upload", "#single", (Join-Path $FilesDir "missing-denied.txt"), "--json") "ActionPolicyError"
  $null = Invoke-PireFailure "Default deny action policy blocks upload" @("--session-name", $Profile, "--action-policy", $AllowNavigateOnlyPolicy, "upload", "#single", $onePath, "--json") "ActionPolicyError"
  $null = Invoke-PireFailure "Domain policy denies active page" @("--session-name", $Profile, "--allowed-domains", "localhost", "upload", "#single", $onePath, "--json") "DomainPolicyError"

  $env:AGENT_BROWSER_CONFIRM_ACTIONS = "upload"
  $confirmText = Invoke-PireFailure "Confirmation required for upload" @("--session-name", $Profile, "upload", "#single", $onePath, "--json") "ConfirmationRequired"
  Assert-NoPayloadLeak $confirmText
  $pending = $confirmText | ConvertFrom-Json
  $confirmed = Invoke-Pire "Confirm upload" @("confirm", $pending.error.data.confirmationId, "--json") '"success"\s*:\s*true'
  Assert-NoPayloadLeak $confirmed

  $pendingDenyText = Invoke-PireFailure "Upload confirmation can be denied" @("--session-name", $Profile, "upload", "#single", $denyPath, "--json") "ConfirmationRequired"
  $pendingDeny = $pendingDenyText | ConvertFrom-Json
  $null = Invoke-Pire "Deny upload" @("deny", $pendingDeny.error.data.confirmationId, "--json") '"denied"\s*:\s*true'

  $pendingMutableText = Invoke-PireFailure "Upload confirmation records file identity" @("--session-name", $Profile, "upload", "#single", $mutablePath, "--json") "ConfirmationRequired"
  $pendingMutable = $pendingMutableText | ConvertFrom-Json
  Set-Content -LiteralPath $mutablePath -Value "mutable upload smoke changed`n" -NoNewline
  $null = Invoke-PireFailure "Confirmed upload rejects changed file" @("confirm", $pendingMutable.error.data.confirmationId, "--json") "changed since confirmation"
  Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue

  $null = Invoke-PireFailure "Network remains unavailable" @("network", "requests", "--json") "NotAvailableError"

  $script:smokeSucceeded = $true
  Write-Output "Upload smoke test passed for profile $Profile."
} catch {
  Write-Host "Upload smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
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
