param(
  [int]$Port = 8766,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RepoPire = Join-Path $Repo "cli\target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "tests\fixtures"
$RunId = "ns-$PID-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
$Alpha = "alpha-$RunId"
$Beta = "beta-$RunId"
$OriginalLocalAppData = $env:LOCALAPPDATA
$OriginalCargoTargetDir = $env:CARGO_TARGET_DIR
$SmokeRoot = Join-Path $Repo "target\named-session-smoke\$RunId"
$SmokeCargoTarget = Join-Path $SmokeRoot "cargo-target"
$Pire = Join-Path $SmokeCargoTarget "debug\pire-browser.exe"
$TempLocalAppData = Join-Path $SmokeRoot "local-app-data"
$ServerOut = Join-Path $SmokeRoot "fixture-server.out.log"
$ServerErr = Join-Path $SmokeRoot "fixture-server.err.log"

$serverProcess = $null
$script:smokeSucceeded = $false
$script:pireStep = 0
$beforeFirefox = @(Get-Process firefox -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

function Invoke-Step {
  param(
    [string]$Label,
    [scriptblock]$Block
  )
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
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode"
  }
  return $output
}

function Invoke-Pire {
  param(
    [string]$Label,
    [string[]]$Arguments,
    [string]$MustMatch = ""
  )
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $process = Start-Process -FilePath $Pire `
    -ArgumentList $Arguments `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -Wait `
    -PassThru
  $exitCode = $process.ExitCode
  $stdout = if (Test-Path $outPath) { Get-Content $outPath -Raw } else { "" }
  $stderr = if (Test-Path $errPath) { Get-Content $errPath -Raw } else { "" }
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode. Output: $stdout $stderr"
  }
  $text = "$stdout`n$stderr"
  if ($MustMatch -and $text -notmatch $MustMatch) {
    throw "$Label output did not match /$MustMatch/. Output: $text"
  }
  return $text
}

function Join-ProcessArguments {
  param([string[]]$Arguments)
  return ($Arguments | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }) -join " "
}

function Invoke-PireNoCapture {
  param(
    [string]$Label,
    [string[]]$Arguments
  )
  Write-Host "==> $Label"
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $Pire
  $processInfo.WorkingDirectory = $Repo
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.Arguments = Join-ProcessArguments $Arguments
  $process = [System.Diagnostics.Process]::Start($processInfo)
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "$Label failed with exit code $($process.ExitCode)"
  }
}

function Invoke-PireFailure {
  param(
    [string]$Label,
    [string[]]$Arguments,
    [string]$MustMatch
  )
  Write-Host "==> $Label"
  $script:pireStep += 1
  $safeLabel = ($Label -replace "[^A-Za-z0-9_-]+", "-").Trim("-")
  $outPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.out.txt" -f $script:pireStep, $safeLabel)
  $errPath = Join-Path $SmokeRoot ("pire-{0:00}-{1}.err.txt" -f $script:pireStep, $safeLabel)
  $process = Start-Process -FilePath $Pire `
    -ArgumentList $Arguments `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError $errPath `
    -Wait `
    -PassThru
  $exitCode = $process.ExitCode
  $stdout = if (Test-Path $outPath) { Get-Content $outPath -Raw } else { "" }
  $stderr = if (Test-Path $errPath) { Get-Content $errPath -Raw } else { "" }
  if ($stdout) { Write-Host $stdout.TrimEnd() }
  if ($stderr) { Write-Host $stderr.TrimEnd() }
  if ($exitCode -eq 0) {
    throw "$Label unexpectedly succeeded"
  }
  $text = "$stdout`n$stderr"
  if ($text -notmatch $MustMatch) {
    throw "$Label output did not match /$MustMatch/. Output: $text"
  }
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
      (
        $_.CommandLine -like "*$Repo*cli*target*debug*pire-browser-host.exe*" -or
        $_.CommandLine -like "*$SmokeCargoTarget*debug*pire-browser-host.exe*"
      )
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
  if (-not (Test-Path $FirefoxPath)) {
    throw "Firefox not found at $FirefoxPath; pass -FirefoxPath"
  }

  New-Item -ItemType Directory -Force -Path $SmokeRoot,$TempLocalAppData | Out-Null
  $env:LOCALAPPDATA = $TempLocalAppData
  $env:CARGO_TARGET_DIR = $SmokeCargoTarget

  $null = Invoke-Step "Build Rust binaries" { cargo build --manifest-path cli\Cargo.toml -j 1 }
  $null = Invoke-Step "Build Firefox extension" { npm --prefix extension run build }
  $null = Invoke-Step "Register Native Messaging host in isolated LOCALAPPDATA" {
    & $Pire setup --windows --firefox-path $FirefoxPath
  }

  Write-Host "==> Start fixture server on http://127.0.0.1:$Port"
  $serverProcess = Start-Process -FilePath python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $FixtureDir) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerOut `
    -RedirectStandardError $ServerErr `
    -PassThru
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/named-session-storage.html"
  if ($response.StatusCode -ne 200) { throw "Fixture server returned $($response.StatusCode)" }

  $baseUrl = "http://127.0.0.1:$Port/named-session-storage.html"
  Invoke-PireNoCapture "Set alpha storage" @("--session-name", $Alpha, "open", "$baseUrl`?value=alpha")
  $null = Invoke-Pire "Read alpha storage" @("--session-name", $Alpha, "get", "text", "#stored") "^alpha\s*$"
  Invoke-PireNoCapture "Open beta without value" @("--session-name", $Beta, "open", $baseUrl)
  $null = Invoke-Pire "Beta starts empty" @("--session-name", $Beta, "get", "text", "#stored") "^EMPTY\s*$"
  Invoke-PireNoCapture "Set beta storage" @("--session-name", $Beta, "open", "$baseUrl`?value=beta")
  $null = Invoke-Pire "Read beta storage" @("--session-name", $Beta, "get", "text", "#stored") "^beta\s*$"
  Invoke-PireNoCapture "Return to alpha profile" @("--session-name", $Alpha, "open", $baseUrl)
  $null = Invoke-Pire "Alpha storage persists" @("--session-name", $Alpha, "get", "text", "#stored") "^alpha\s*$"

  $sessionJson = Invoke-Pire "List named sessions" @("session", "list", "--json")
  $status = $sessionJson | ConvertFrom-Json
  $profileNames = @($status.data.liveSessions | ForEach-Object { $_.profileName })
  if ($profileNames -notcontains $Alpha -or $profileNames -notcontains $Beta) {
    throw "session list --json did not include both profileName values: $($profileNames -join ', ')"
  }

  Invoke-PireFailure "Strict --session missing does not launch" @("--session", "missing-$RunId", "snapshot", "--json") "session_not_found"
  Invoke-PireFailure "Invalid named profile is rejected before launch" @("--session-name", "../bad", "open", $baseUrl, "--json") "invalid_args"

  $script:smokeSucceeded = $true
  Write-Output "Named session smoke test passed for profiles $Alpha and $Beta."
} catch {
  Write-Host "Named session smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
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
    }
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
  if ($script:smokeSucceeded) {
    Remove-Item -LiteralPath $SmokeRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
