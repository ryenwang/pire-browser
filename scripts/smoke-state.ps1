param(
  [int]$Port = 8767,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "cli\target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "tests\fixtures"
$RunId = "state-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Alpha = "state-alpha-$RunId"
$Beta = "state-beta-$RunId"
$Gamma = "state-gamma-$RunId"
$Wrong = "state-wrong-$RunId"
$PolicyNoLaunch = "state-policy-no-launch-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalRequireInspectedState = $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE
$SmokeRoot = Join-Path $Repo "target\state-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$WrongPort = $Port + 1
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$WrongServerOut = Join-Path $SmokeRoot "fixture-server-wrong-origin.out.log"
$WrongServerErr = Join-Path $SmokeRoot "fixture-server-wrong-origin.err.log"
$StateFile = Join-Path $SmokeRoot "alpha-state.json"
$OverrideStateFile = Join-Path $SmokeRoot "override-state.json"
$BadStateFile = Join-Path $SmokeRoot "bad-state.json"
$SecretValue = "smoke-secret-state-value"
$BetaValue = "smoke-beta-state-value"

$serverProcess = $null
$wrongServerProcess = $null
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

function Invoke-Pire {
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch = "")
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $result = Invoke-PireCapturedProcess $Label $Arguments $outPath $errPath
  $exitCode = $result.ExitCode
  $stdout = $result.Stdout
  $stderr = $result.Stderr
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($exitCode -ne 0) { throw "$Label failed with exit code $exitCode. Output: $stdout $stderr" }
  $text = "$stdout`n$stderr"
  if ($MustMatch -and $text -notmatch $MustMatch) {
    throw "$Label output did not match /$MustMatch/. Output: $text"
  }
  return $text
}

function Join-ProcessArguments {
  param([string[]]$Arguments)
  return ($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
  }) -join " "
}

function Invoke-PireCapturedProcess {
  param([string]$Label, [string[]]$Arguments, [string]$OutPath, [string]$ErrPath)
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $Pire
  $processInfo.WorkingDirectory = $Repo
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true
  $processInfo.Arguments = Join-ProcessArguments $Arguments
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $processInfo
  [void]$process.Start()
  $stdout = $process.StandardOutput.ReadToEnd()
  $stderr = $process.StandardError.ReadToEnd()
  if (-not $process.WaitForExit($PireTimeoutMs)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$Label timed out after $($PireTimeoutMs / 1000) seconds"
  }
  Set-Content -LiteralPath $OutPath -Value $stdout -NoNewline
  Set-Content -LiteralPath $ErrPath -Value $stderr -NoNewline
  return @{
    ExitCode = $process.ExitCode
    Stdout = $stdout
    Stderr = $stderr
  }
}

function Invoke-PireNoCapture {
  param([string]$Label, [string[]]$Arguments)
  Write-Host "==> $Label"
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $Pire
  $processInfo.WorkingDirectory = $Repo
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.Arguments = Join-ProcessArguments $Arguments
  $process = [System.Diagnostics.Process]::Start($processInfo)
  if (-not $process.WaitForExit($PireTimeoutMs)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "$Label timed out after $($PireTimeoutMs / 1000) seconds"
  }
  $process.Refresh()
  if ($process.ExitCode -ne 0) { throw "$Label failed with exit code $($process.ExitCode)" }
}

function Invoke-PireFailure {
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch, [string]$MustNotMatch = "")
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $result = Invoke-PireCapturedProcess $Label $Arguments $outPath $errPath
  $exitCode = $result.ExitCode
  $stdout = $result.Stdout
  $stderr = $result.Stderr
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($exitCode -eq 0) { throw "$Label unexpectedly succeeded" }
  $text = "$stdout`n$stderr"
  if ($text -notmatch $MustMatch) {
    throw "$Label output did not match /$MustMatch/. Output: $text"
  }
  if ($MustNotMatch -and $text -match $MustNotMatch) {
    throw "$Label output unexpectedly matched /$MustNotMatch/. Output: $text"
  }
  return $text
}

function Assert-NoForbiddenStateOutput {
  param([string]$Label, [string]$Text)
  foreach ($forbidden in @($SecretValue, $BetaValue, "pireStateCookie", "pireStateLocal", "pireStateSession", "?value=", "#fragment")) {
    if ($Text -match [regex]::Escape($forbidden)) {
      throw "$Label output leaked forbidden state detail: $forbidden"
    }
  }
}

function Stop-SmokeProcesses {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
  if ($wrongServerProcess -and -not $wrongServerProcess.HasExited) {
    Stop-Process -Id $wrongServerProcess.Id -Force -ErrorAction SilentlyContinue
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

function Stop-DebugHostProcesses {
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
  $env:LOCALAPPDATA = $TempLocalAppData
  $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = $null

  Stop-DebugHostProcesses
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget
  $null = Invoke-Step "Build Rust binaries" { cargo build --manifest-path cli\Cargo.toml -j 1 }
  $null = Invoke-Step "Build Firefox extension" { npm --prefix extension run build }
  $null = Invoke-Step "Register Native Messaging host in isolated LOCALAPPDATA" {
    & $Pire setup --windows --firefox-path $FirefoxPath
  }
  $statusPolicyOutput = Invoke-Pire "Status JSON includes state policy" @("status", "--json") '"statePolicy"'
  Assert-NoForbiddenStateOutput "Status JSON includes state policy" $statusPolicyOutput
  $doctorPolicyOutput = Invoke-Pire "Doctor JSON includes state policy" @("doctor", "--json") '"statePolicy"'
  Assert-NoForbiddenStateOutput "Doctor JSON includes state policy" $doctorPolicyOutput

  Write-Host "==> Start fixture server on http://127.0.0.1:$Port"
  $serverProcess = Start-Process -FilePath python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $FixtureDir) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerOut `
    -RedirectStandardError $ServerErr `
    -PassThru
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/state.html"
  if ($response.StatusCode -ne 200) { throw "Fixture server returned $($response.StatusCode)" }

  Write-Host "==> Start wrong-origin fixture server on http://127.0.0.1:$WrongPort"
  $wrongServerProcess = Start-Process -FilePath python `
    -ArgumentList @("-m", "http.server", "$WrongPort", "--bind", "127.0.0.1", "--directory", $FixtureDir) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $WrongServerOut `
    -RedirectStandardError $WrongServerErr `
    -PassThru
  Start-Sleep -Seconds 1
  $wrongResponse = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$WrongPort/state.html"
  if ($wrongResponse.StatusCode -ne 200) { throw "Wrong-origin fixture server returned $($wrongResponse.StatusCode)" }

  $baseUrl = "http://127.0.0.1:$Port/state.html"
  Invoke-PireNoCapture "Seed alpha state" @("--session-name", $Alpha, "open", "$baseUrl`?value=$SecretValue")
  $null = Invoke-Pire "Read alpha local state" @("--session-name", $Alpha, "get", "text", "#local") "^$([regex]::Escape($SecretValue))\s*$"
  $saveOutput = Invoke-Pire "Save alpha state" @("--session-name", $Alpha, "state", "save", $StateFile, "--json") '"cookies"\s*:\s*1'
  Assert-NoForbiddenStateOutput "Save alpha state" $saveOutput
  if (-not (Test-Path $StateFile)) { throw "State file was not written: $StateFile" }
  $savedState = Get-Content -LiteralPath $StateFile -Raw | ConvertFrom-Json
  if ($savedState.source.url -match "\?" -or $savedState.source.url -match "#") {
    throw "Saved state source.url was not stripped: $($savedState.source.url)"
  }
  $inspectOutput = Invoke-Pire "Inspect alpha state safely" @("state", "inspect", $StateFile, "--json") '"localStorageKeys"\s*:\s*1'
  Assert-NoForbiddenStateOutput "Inspect alpha state safely" $inspectOutput
  $guardedMissingOutput = Invoke-PireFailure "Guarded load without receipt fails" @("--session-name", $Beta, "state", "load", "--require-inspected", $StateFile, "--json") "state inspect --record"
  Assert-NoForbiddenStateOutput "Guarded load without receipt fails" $guardedMissingOutput
  $recordOutput = Invoke-Pire "Record alpha state inspection" @("state", "inspect", "--record", $StateFile, "--json") '"recorded"\s*:\s*true'
  Assert-NoForbiddenStateOutput "Record alpha state inspection" $recordOutput

  Invoke-PireNoCapture "Open beta empty state" @("--session-name", $Beta, "open", $baseUrl)
  $null = Invoke-Pire "Beta starts empty" @("--session-name", $Beta, "get", "text", "#local") "^EMPTY\s*$"
  $guardedLoadOutput = Invoke-Pire "Load alpha state into live beta with receipt" @("--session-name", $Beta, "state", "load", "--require-inspected", $StateFile, "--json") '"reloaded"\s*:\s*true'
  Assert-NoForbiddenStateOutput "Load alpha state into live beta with receipt" $guardedLoadOutput
  $null = Invoke-Pire "Beta local restored" @("--session-name", $Beta, "get", "text", "#local") "^$([regex]::Escape($SecretValue))\s*$"
  $null = Invoke-Pire "Beta session restored" @("--session-name", $Beta, "get", "text", "#session") "^$([regex]::Escape($SecretValue))\s*$"
  $null = Invoke-Pire "Beta cookie restored" @("--session-name", $Beta, "get", "text", "#cookie") "^$([regex]::Escape($SecretValue))\s*$"
  [System.IO.File]::AppendAllText($StateFile, "`n")
  $changedGuardOutput = Invoke-PireFailure "Guarded load rejects changed state file" @("--session-name", $Beta, "state", "load", "--require-inspected", $StateFile, "--json") "state inspect --record"
  Assert-NoForbiddenStateOutput "Guarded load rejects changed state file" $changedGuardOutput
  $normalLoadOutput = Invoke-Pire "Normal load still accepts changed state file" @("--session-name", $Beta, "state", "load", $StateFile, "--json") '"reloaded"\s*:\s*true'
  Assert-NoForbiddenStateOutput "Normal load still accepts changed state file" $normalLoadOutput

  Invoke-PireNoCapture "Clear alpha visible URL before policy checks" @("--session-name", $Alpha, "open", $baseUrl)
  $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = "1"
  $policyMissingOutput = Invoke-PireFailure "Env policy requires receipt before load" @("--session-name", $Beta, "state", "load", $StateFile, "--json") "state inspect --record"
  Assert-NoForbiddenStateOutput "Env policy requires receipt before load" $policyMissingOutput
  $policyNoLaunchOutput = Invoke-PireFailure "Env policy checks receipt before named launch" @("--session-name", $PolicyNoLaunch, "state", "load", $StateFile, "--json") "state inspect --record"
  Assert-NoForbiddenStateOutput "Env policy checks receipt before named launch" $policyNoLaunchOutput
  $sessionListAfterPolicyFailure = Invoke-Pire "Session list after policy failure" @("session", "list", "--json") '"liveSessions"'
  if ($sessionListAfterPolicyFailure -match [regex]::Escape($PolicyNoLaunch)) {
    throw "Policy receipt failure launched unexpected profile $PolicyNoLaunch"
  }
  Assert-NoForbiddenStateOutput "Session list after policy failure" $sessionListAfterPolicyFailure
  $policyRecordOutput = Invoke-Pire "Record changed state for env policy" @("state", "inspect", "--record", $StateFile, "--json") '"recorded"\s*:\s*true'
  Assert-NoForbiddenStateOutput "Record changed state for env policy" $policyRecordOutput
  $policyLoadOutput = Invoke-Pire "Env policy load succeeds after record" @("--session-name", $Beta, "state", "load", $StateFile, "--json") '"reloaded"\s*:\s*true'
  Assert-NoForbiddenStateOutput "Env policy load succeeds after record" $policyLoadOutput
  Copy-Item -LiteralPath $StateFile -Destination $OverrideStateFile -Force
  [System.IO.File]::AppendAllText($OverrideStateFile, "`n")
  $policyOverrideOutput = Invoke-Pire "Env policy override is audited" @("--session-name", $Beta, "state", "load", "--no-require-inspected", $OverrideStateFile, "--json") "STATE_POLICY_OVERRIDDEN"
  Assert-NoForbiddenStateOutput "Env policy override is audited" $policyOverrideOutput
  $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = "tru"
  $invalidPolicyOutput = Invoke-PireFailure "Invalid state policy env fails before load" @("--session-name", $Beta, "state", "load", $StateFile, "--json") "PIRE_BROWSER_REQUIRE_INSPECTED_STATE"
  Assert-NoForbiddenStateOutput "Invalid state policy env fails before load" $invalidPolicyOutput
  $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = $null

  Invoke-PireNoCapture "Mutate beta state" @("--session-name", $Beta, "open", "$baseUrl`?value=$BetaValue")
  $null = Invoke-Pire "Beta mutates independently" @("--session-name", $Beta, "get", "text", "#local") "^$([regex]::Escape($BetaValue))\s*$"
  Invoke-PireNoCapture "Clear beta visible URL" @("--session-name", $Beta, "open", $baseUrl)
  Invoke-PireNoCapture "Return to alpha" @("--session-name", $Alpha, "open", $baseUrl)
  Invoke-PireNoCapture "Wait for alpha fixture after return" @("--session-name", $Alpha, "wait", "--selector", "#local", "--timeout", "5000")
  $null = Invoke-Pire "Alpha remains isolated" @("--session-name", $Alpha, "get", "text", "#local") "^$([regex]::Escape($SecretValue))\s*$"

  Invoke-PireNoCapture "Load state into non-live gamma profile" @("--session-name", $Gamma, "state", "load", $StateFile, "--json")
  $null = Invoke-Pire "Gamma restored after launch" @("--session-name", $Gamma, "get", "text", "#local") "^$([regex]::Escape($SecretValue))\s*$"

  Invoke-PireNoCapture "Open wrong origin session" @("--session-name", $Wrong, "open", "http://127.0.0.1:$WrongPort/state.html")
  $wrongOriginOutput = Invoke-PireFailure "Wrong origin load fails" @("--session-name", $Wrong, "state", "load", $StateFile, "--json") "origin mismatch"
  Assert-NoForbiddenStateOutput "Wrong origin load fails" $wrongOriginOutput
  $null = Invoke-PireFailure "Strict missing session does not launch" @("--session", "missing-$RunId", "state", "load", $StateFile, "--json") "session_not_found"
  $null = Invoke-PireFailure "Unsupported state subcommand remains unavailable" @("state", "list", "--json") "NotAvailableError"

  Set-Content -LiteralPath $BadStateFile -Value '{"schemaVersion":2,"tool":"pire-browser","kind":"active-origin-state","secret":"raw-state-secret"}'
  $null = Invoke-PireFailure "Invalid state file redacts diagnostics" @("state", "load", $BadStateFile, "--json") "invalid_args" "raw-state-secret"

  $script:smokeSucceeded = $true
  Write-Output "State save/load smoke test passed for profiles $Alpha, $Beta, and $Gamma."
} catch {
  Write-Host "State smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
  if (Test-Path $ServerErr) {
    Write-Host ""
    Write-Host "Recent fixture server error log:"
    Get-Content $ServerErr -Tail 40 | ForEach-Object { Write-Host $_ }
  }
  exit 1
} finally {
  try {
    if (Test-Path $Pire) {
      & $Pire --session-name $Alpha close *> $null
      & $Pire --session-name $Beta close *> $null
      & $Pire --session-name $Gamma close *> $null
      & $Pire --session-name $Wrong close *> $null
      & $Pire --session-name $PolicyNoLaunch close *> $null
    }
  } catch {
  }
  Stop-SmokeProcesses
  Restore-Setup
  $env:LOCALAPPDATA = $OriginalLocalAppData
  $env:CARGO_TARGET_DIR = $OriginalCargoTargetDir
  $env:PIRE_BROWSER_REQUIRE_INSPECTED_STATE = $OriginalRequireInspectedState
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
