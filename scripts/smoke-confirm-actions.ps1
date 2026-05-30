param(
  [int]$Port = 8771,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "fixtures"
$RunId = "confirm-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Profile = "confirm-actions-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalConfirmActions = $env:AGENT_BROWSER_CONFIRM_ACTIONS
$OriginalConfirmInteractive = $env:AGENT_BROWSER_CONFIRM_INTERACTIVE
$OriginalActionPolicy = $env:AGENT_BROWSER_ACTION_POLICY
$SmokeRoot = Join-Path $Repo "target\confirm-actions-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$AllowedUrl = "http://127.0.0.1:$Port/form.html"
$DenyEvalPolicy = Join-Path $SmokeRoot "deny-eval.json"

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
  return ($Arguments | ForEach-Object {
    '"' + ($_ -replace '"', '\"') + '"'
  }) -join " "
}

function Invoke-PireCapturedProcess {
  param([string]$Label, [string[]]$Arguments, [string]$OutPath, [string]$ErrPath)
  $command = '"' + $Pire + '" ' + (Join-ProcessArguments $Arguments) + ' > "' + $OutPath + '" 2> "' + $ErrPath + '"'
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $env:ComSpec
  $processInfo.WorkingDirectory = $Repo
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardInput = $true
  $processInfo.Arguments = '/d /s /c "' + $command + '"'
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $processInfo
  [void]$process.Start()
  $process.StandardInput.Close()
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
  $stdout = $result.Stdout
  $stderr = $result.Stderr
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($result.ExitCode -ne 0) { throw "$Label failed with exit code $($result.ExitCode). Output: $stdout $stderr" }
  $text = "$stdout`n$stderr"
  if ($MustMatch -and $text -notmatch $MustMatch) { throw "$Label output did not match /$MustMatch/. Output: $text" }
  return $text
}

function Invoke-PireFailure {
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch, [int]$ExpectedExitCode = -1)
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $result = Invoke-PireCapturedProcess $Label $Arguments $outPath $errPath
  $stdout = $result.Stdout
  $stderr = $result.Stderr
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($result.ExitCode -eq 0) { throw "$Label unexpectedly succeeded" }
  if ($ExpectedExitCode -ge 0 -and $result.ExitCode -ne $ExpectedExitCode) {
    throw "$Label exit code $($result.ExitCode) did not match expected $ExpectedExitCode"
  }
  $text = "$stdout`n$stderr"
  if ($text -notmatch $MustMatch) { throw "$Label output did not match /$MustMatch/. Output: $text" }
  return $text
}

function Confirmation-IdFromOutput {
  param([string]$Text)
  if ($Text -match '"confirmationId"\s*:\s*"(c_[0-9a-fA-F]{8})"') { return $Matches[1] }
  if ($Text -match 'confirmationId:\s*(c_[0-9a-fA-F]{8})') { return $Matches[1] }
  throw "Could not find confirmation id in output: $Text"
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

  New-Item -ItemType Directory -Force -Path $SmokeRoot,$TempLocalAppData | Out-Null
  Set-Content -LiteralPath $DenyEvalPolicy -Value '{ "default": "allow", "deny": ["eval"] }'

  $env:LOCALAPPDATA = $TempLocalAppData
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget
  Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:AGENT_BROWSER_CONFIRM_INTERACTIVE -ErrorAction SilentlyContinue
  Remove-Item Env:AGENT_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue

  $null = Invoke-Step "Build Rust binaries" { cargo build -j 1 }
  $null = Invoke-Step "Build Firefox extension" { npm --prefix extension run build }
  $null = Invoke-Step "Register Native Messaging host in isolated LOCALAPPDATA" {
    & $Pire setup --windows --firefox-path $FirefoxPath
  }

  Write-Host "==> Start fixture server on $AllowedUrl"
  $serverProcess = Start-Process -FilePath python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $FixtureDir) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerOut `
    -RedirectStandardError $ServerErr `
    -PassThru
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -UseBasicParsing $AllowedUrl
  if ($response.StatusCode -ne 200) { throw "Fixture server returned $($response.StatusCode)" }

  $status = Invoke-Pire "Status JSON includes confirmation policy" @("status", "--json") '"confirmationPolicy"'
  if ($status -notmatch '"enabled"\s*:\s*false') { throw "default confirmation policy should be disabled" }

  $null = Invoke-Pire "Open fixture" @("--session-name", $Profile, "open", $AllowedUrl, "--json") '"success"\s*:\s*true'

  $required = Invoke-PireFailure "Eval requires confirmation" @("--session-name", $Profile, "--confirm-actions", "eval", "eval", "document.title", "--json") "ConfirmationRequired" 75
  $confirmationId = Confirmation-IdFromOutput $required
  $null = Invoke-Pire "Confirm executes pending eval" @("confirm", $confirmationId, "--json") '"success"\s*:\s*true'

  $denyRequired = Invoke-PireFailure "Click requires confirmation before side effect" @("--session-name", $Profile, "--confirm-actions", "click", "click", "#submit", "--json") "ConfirmationRequired" 75
  $denyId = Confirmation-IdFromOutput $denyRequired
  $null = Invoke-Pire "Deny consumes pending click" @("deny", $denyId, "--json") '"denied"\s*:\s*true'
  $null = Invoke-PireFailure "Denied confirmation cannot be reused" @("confirm", $denyId, "--json") "confirmation_not_found"

  $null = Invoke-PireFailure "Interactive non-TTY auto-denies" @("--session-name", $Profile, "--confirm-actions", "eval", "--confirm-interactive", "eval", "document.title", "--json") "ConfirmationDenied" 2

  $null = Invoke-PireFailure "Action policy denial beats confirmation" @("--session-name", $Profile, "--action-policy", $DenyEvalPolicy, "--confirm-actions", "eval", "eval", "document.title", "--json") "ActionPolicyError" 2

  $batchRequired = Invoke-PireFailure "Batch requires approval before subcommands" @("--session-name", $Profile, "--confirm-actions", "eval", "batch", "get url", "eval document.title", "--json") "ConfirmationRequired" 75
  $batchId = Confirmation-IdFromOutput $batchRequired
  $null = Invoke-Pire "Approved batch replays fully" @("confirm", $batchId, "--json") '"success"\s*:\s*true'

  $env:AGENT_BROWSER_CONFIRM_ACTIONS = "eval"
  $envRequired = Invoke-PireFailure "Env confirmation policy works" @("--session-name", $Profile, "eval", "document.title", "--json") "ConfirmationRequired" 75
  $envId = Confirmation-IdFromOutput $envRequired
  $null = Invoke-Pire "Deny env confirmation" @("deny", $envId, "--json") '"denied"\s*:\s*true'
  Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue

  $script:smokeSucceeded = $true
  Write-Output "Confirm-actions smoke test passed for profile $Profile."
} catch {
  Write-Host "Confirm-actions smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
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
  if ($OriginalConfirmActions) {
    $env:AGENT_BROWSER_CONFIRM_ACTIONS = $OriginalConfirmActions
  } else {
    Remove-Item Env:AGENT_BROWSER_CONFIRM_ACTIONS -ErrorAction SilentlyContinue
  }
  if ($OriginalConfirmInteractive) {
    $env:AGENT_BROWSER_CONFIRM_INTERACTIVE = $OriginalConfirmInteractive
  } else {
    Remove-Item Env:AGENT_BROWSER_CONFIRM_INTERACTIVE -ErrorAction SilentlyContinue
  }
  if ($OriginalActionPolicy) {
    $env:AGENT_BROWSER_ACTION_POLICY = $OriginalActionPolicy
  } else {
    Remove-Item Env:AGENT_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue
  }
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
