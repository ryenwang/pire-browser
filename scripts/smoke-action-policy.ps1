param(
  [int]$Port = 8770,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "cli\target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "tests\fixtures"
$RunId = "action-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Profile = "action-policy-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalActionPolicy = $env:PIRE_BROWSER_ACTION_POLICY
$OriginalAllowedDomains = $env:PIRE_BROWSER_ALLOWED_DOMAINS
$SmokeRoot = Join-Path $Repo "target\action-policy-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$AllowedUrl = "http://127.0.0.1:$Port/form.html"
$DeniedHostUrl = "http://localhost:$Port/form.html"
$DenyEvalPolicy = Join-Path $SmokeRoot "deny-eval.json"
$ReviewPolicy = Join-Path $SmokeRoot "review.json"
$NavigateOnlyPolicy = Join-Path $SmokeRoot "navigate-only.json"
$AllowAllPolicy = Join-Path $SmokeRoot "allow-all.json"
$DenyNavigatePolicy = Join-Path $SmokeRoot "deny-navigate.json"

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
  param([string]$Label, [string[]]$Arguments, [string]$MustMatch)
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
  $text = "$stdout`n$stderr"
  if ($text -notmatch $MustMatch) { throw "$Label output did not match /$MustMatch/. Output: $text" }
  return $text
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
  Set-Content -LiteralPath $ReviewPolicy -Value '{ "default": "deny", "allow": ["navigate", "snapshot", "get"] }'
  Set-Content -LiteralPath $NavigateOnlyPolicy -Value '{ "default": "deny", "allow": ["navigate"] }'
  Set-Content -LiteralPath $AllowAllPolicy -Value '{ "default": "allow" }'
  Set-Content -LiteralPath $DenyNavigatePolicy -Value '{ "default": "allow", "deny": ["navigate"] }'

  $env:LOCALAPPDATA = $TempLocalAppData
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget
  Remove-Item Env:PIRE_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue
  Remove-Item Env:PIRE_BROWSER_ALLOWED_DOMAINS -ErrorAction SilentlyContinue

  $null = Invoke-Step "Build Rust binaries" { cargo build --manifest-path cli\Cargo.toml -j 1 }
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

  $status = Invoke-Pire "Status JSON includes action policy" @("status", "--json") '"actionPolicy"'
  if ($status -notmatch '"enabled"\s*:\s*false') { throw "default action policy should be disabled" }

  $policyPhasePattern = '"phase"\s*:\s*"policy"'
  $null = Invoke-PireFailure "Denied eval fails before launch" @("--session-name", "$Profile-deny", "--action-policy", $DenyEvalPolicy, "eval", "document.title", "--json") "ActionPolicyError[\s\S]*$policyPhasePattern"
  $sessionsAfterDeniedEval = Invoke-Pire "Denied eval did not launch profile" @("session", "list", "--json") '"success"\s*:\s*true'
  if ($sessionsAfterDeniedEval -match "$Profile-deny") { throw "denied eval should not auto-launch a named profile" }

  $null = Invoke-Pire "Default-deny allows navigation" @("--session-name", $Profile, "--action-policy", $ReviewPolicy, "open", $AllowedUrl, "--json") '"success"\s*:\s*true'
  $null = Invoke-Pire "Default-deny allows snapshot" @("--session-name", $Profile, "--action-policy", $ReviewPolicy, "snapshot", "--json") '"success"\s*:\s*true'
  $null = Invoke-PireFailure "Default-deny blocks click" @("--session-name", $Profile, "--action-policy", $ReviewPolicy, "click", "#submit", "--json") "ActionPolicyError[\s\S]*$policyPhasePattern"

  $env:PIRE_BROWSER_ACTION_POLICY = $DenyEvalPolicy
  $null = Invoke-PireFailure "Env action policy denies eval" @("--session-name", $Profile, "eval", "document.title", "--json") "ActionPolicyError[\s\S]*$policyPhasePattern"
  $env:PIRE_BROWSER_ACTION_POLICY = $NavigateOnlyPolicy
  $null = Invoke-Pire "Explicit flag wins over env policy" @("--session-name", $Profile, "--action-policy", $AllowAllPolicy, "snapshot", "--json") '"success"\s*:\s*true'
  Remove-Item Env:PIRE_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue

  $null = Invoke-PireFailure "Batch stops on denied subcommand" @("--session-name", $Profile, "--action-policy", $DenyEvalPolicy, "batch", "get url", "eval document.title", "open http://localhost:$Port/form.html", "--json") "ActionPolicyError[\s\S]*$policyPhasePattern"
  $batchUrl = Invoke-Pire "Batch denial leaves original page active" @("--session-name", $Profile, "get", "url", "--json") "127\.0\.0\.1"
  if ($batchUrl -match "localhost") { throw "batch should not navigate after denied subcommand" }

  $null = Invoke-PireFailure "Domain denial wins over action denial" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "--action-policy", $DenyNavigatePolicy, "open", $DeniedHostUrl, "--json") "DomainPolicyError[\s\S]*$policyPhasePattern"
  $null = Invoke-PireFailure "Unsupported command keeps unsupported_command" @("--action-policy", $ReviewPolicy, "stats", "--json") "unsupported_command"

  $script:smokeSucceeded = $true
  Write-Output "Action policy smoke test passed for profile $Profile."
} catch {
  Write-Host "Action policy smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
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
    $env:PIRE_BROWSER_ACTION_POLICY = $OriginalActionPolicy
  } else {
    Remove-Item Env:PIRE_BROWSER_ACTION_POLICY -ErrorAction SilentlyContinue
  }
  if ($OriginalAllowedDomains) {
    $env:PIRE_BROWSER_ALLOWED_DOMAINS = $OriginalAllowedDomains
  } else {
    Remove-Item Env:PIRE_BROWSER_ALLOWED_DOMAINS -ErrorAction SilentlyContinue
  }
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
