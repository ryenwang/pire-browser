param(
  [int]$Port = 8769,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "cli\target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "tests\fixtures"
$RunId = "domain-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Profile = "domain-policy-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$OriginalAllowedDomains = $env:PIRE_BROWSER_ALLOWED_DOMAINS
$SmokeRoot = Join-Path $Repo "target\domain-policy-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"
$StateFile = Join-Path $SmokeRoot "localhost-state.json"
$AllowedUrl = "http://127.0.0.1:$Port/state.html"
$DeniedUrl = "http://localhost:$Port/state.html"
$SecretValue = "domain-policy-secret"

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
  $env:LOCALAPPDATA = $TempLocalAppData
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget
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

  $status = Invoke-Pire "Status JSON includes domain policy" @("status", "--json") '"domainPolicy"'
  if ($status -notmatch '"enabled"\s*:\s*false') { throw "default domain policy should be disabled" }

  $null = Invoke-Pire "Allowed navigation succeeds" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "open", "$AllowedUrl`?value=$SecretValue", "--json") '"success"\s*:\s*true'
  $null = Invoke-Pire "Allowed active-page snapshot succeeds" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "snapshot", "--json") '"success"\s*:\s*true'
  $null = Invoke-PireFailure "Denied navigation fails before dispatch" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "open", $DeniedUrl, "--json") "DomainPolicyError"
  $null = Invoke-PireFailure "Denied tabs new fails before dispatch" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "tabs", "new", $DeniedUrl, "--json") "DomainPolicyError"
  $null = Invoke-PireFailure "Denied batch navigation fails before dispatch" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "batch", "open $DeniedUrl", "--json") "DomainPolicyError"
  $null = Invoke-Pire "Batch denial leaves allowed page active" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "get", "url", "--json") "127\.0\.0\.1"

  $null = Invoke-Pire "Open denied host without policy" @("--session-name", $Profile, "open", "$DeniedUrl`?value=$SecretValue", "--json") '"success"\s*:\s*true'
  $null = Invoke-PireFailure "Active-page command on denied host fails" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "snapshot", "--json") "DomainPolicyError"
  $null = Invoke-Pire "Save denied host state without policy" @("--session-name", $Profile, "state", "save", $StateFile, "--json") '"success"\s*:\s*true'
  $null = Invoke-PireFailure "State load for denied origin fails locally" @("--session-name", $Profile, "--allowed-domains", "127.0.0.1", "state", "load", $StateFile, "--json") "DomainPolicyError"

  $env:PIRE_BROWSER_ALLOWED_DOMAINS = "127.0.0.1"
  $override = Invoke-Pire "Override domain policy is audited" @("--session-name", $Profile, "--no-allowed-domains", "open", $DeniedUrl, "--json") "DOMAIN_POLICY_OVERRIDDEN"
  if ($override -notmatch '"success"\s*:\s*true') { throw "override should succeed" }

  $script:smokeSucceeded = $true
  Write-Output "Domain policy smoke test passed for profile $Profile."
} catch {
  Write-Host "Domain policy smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
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
  if ($OriginalAllowedDomains) {
    $env:PIRE_BROWSER_ALLOWED_DOMAINS = $OriginalAllowedDomains
  } else {
    Remove-Item Env:PIRE_BROWSER_ALLOWED_DOMAINS -ErrorAction SilentlyContinue
  }
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
