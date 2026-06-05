param(
  [switch]$KeepAlive,
  [int]$Port = 8765,
  [string]$FirefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Pire = Join-Path $Repo "cli\target\debug\pire-browser.exe"
$FixtureDir = Join-Path $Repo "tests\fixtures"
$Screenshot = Join-Path $Repo "out.png"
$SessionDir = Join-Path $env:LOCALAPPDATA "pire-browser\sessions"
$WebExtLog = Join-Path $Repo "web-ext.combined.log"
$WebExtLauncherOut = Join-Path $Repo "web-ext-launcher.out.log"
$WebExtLauncherErr = Join-Path $Repo "web-ext-launcher.err.log"
$ServerOut = Join-Path $Repo "fixture-server.out.log"
$ServerErr = Join-Path $Repo "fixture-server.err.log"

$serverProcess = $null
$webExtProcess = $null
$script:smokeSucceeded = $false
$script:sessionId = $null
$script:baselineSessions = @()
$beforeFirefox = @(Get-Process firefox -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)

function Get-SessionFiles {
  if (-not (Test-Path $SessionDir)) { return @() }
  return @(Get-ChildItem -Path $SessionDir -Filter "*.json" -ErrorAction SilentlyContinue)
}

function Get-SessionIds {
  return @(Get-SessionFiles | Select-Object -ExpandProperty BaseName)
}

function Show-RecentLogs {
  Write-Host ""
  Write-Host "Recent web-ext log:"
  if (Test-Path $WebExtLog) { Get-Content $WebExtLog -Tail 80 | ForEach-Object { Write-Host $_ } }
  Write-Host ""
  Write-Host "Recent fixture server error log:"
  if (Test-Path $ServerErr) { Get-Content $ServerErr -Tail 40 | ForEach-Object { Write-Host $_ } }
}

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
  $fullArguments = $Arguments
  if ($script:sessionId) {
    $fullArguments = @("--session", $script:sessionId) + $Arguments
  }
  $output = Invoke-Step $Label { & $Pire @fullArguments }
  $text = ($output | Out-String)
  if ($MustMatch -and $text -notmatch $MustMatch) {
    throw "$Label output did not match /$MustMatch/. Output: $text"
  }
  return $text
}

function Wait-ForSession {
  $deadline = (Get-Date).AddSeconds(60)
  while ((Get-Date) -lt $deadline) {
    $newSessions = Get-SessionFiles |
      Where-Object { $script:baselineSessions -notcontains $_.BaseName } |
      Sort-Object LastWriteTime -Descending

    foreach ($sessionFile in $newSessions) {
      $global:LASTEXITCODE = 0
      $status = & $Pire --session $sessionFile.BaseName status 2>&1
      if ($global:LASTEXITCODE -eq 0) {
        $script:sessionId = $sessionFile.BaseName
        Write-Host "Connected to smoke session $script:sessionId"
        $status | ForEach-Object { Write-Host $_ }
        return
      }
    }
    Start-Sleep -Seconds 1
  }
  throw "Timed out waiting for a live pire-browser session"
}

function Remove-SmokeSessionFiles {
  Get-SessionFiles |
    Where-Object { $script:baselineSessions -notcontains $_.BaseName } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

function Stop-SmokeProcesses {
  if ($KeepAlive -and $script:smokeSucceeded) {
    Write-Output "KeepAlive set after successful smoke test; leaving Firefox/web-ext/server running."
    return
  }

  if ($webExtProcess -and -not $webExtProcess.HasExited) {
    Stop-Process -Id $webExtProcess.Id -Force -ErrorAction SilentlyContinue
  }
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
      $_.CommandLine -like "*$Repo*cli*target*debug*pire-browser-host.exe*"
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Remove-SmokeSessionFiles
}

try {
  if (-not (Test-Path $FirefoxPath)) {
    throw "Firefox not found at $FirefoxPath; pass -FirefoxPath"
  }

  Remove-Item -LiteralPath $WebExtLog,$WebExtLauncherOut,$WebExtLauncherErr,$ServerOut,$ServerErr,$Screenshot -ErrorAction SilentlyContinue
  $script:baselineSessions = Get-SessionIds

  $null = Invoke-Step "Build Rust binaries" { cargo build --manifest-path cli\Cargo.toml -j 1 }
  $null = Invoke-Step "Build Firefox extension" { npm --prefix extension run build }
  $null = Invoke-Step "Register Native Messaging host" { & $Pire setup --windows --firefox-path $FirefoxPath }

  Write-Host "==> Start fixture server on http://127.0.0.1:$Port"
  $serverProcess = Start-Process -FilePath python `
    -ArgumentList @("-m", "http.server", "$Port", "--bind", "127.0.0.1", "--directory", $FixtureDir) `
    -WorkingDirectory $Repo `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerOut `
    -RedirectStandardError $ServerErr `
    -PassThru
  Start-Sleep -Seconds 2
  $response = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/form.html"
  if ($response.StatusCode -ne 200) { throw "Fixture server returned $($response.StatusCode)" }

  Write-Host "==> Launch Firefox with web-ext"
  $webExtScript = @"
`$ErrorActionPreference = "Continue"
Set-Location '$Repo'
& 'C:\Program Files\nodejs\npx.cmd' --yes web-ext run --verbose --source-dir '$Repo\extension' --firefox '$FirefoxPath' --no-input *> '$WebExtLog'
"@
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($webExtScript))
  $webExtProcess = Start-Process -FilePath powershell.exe `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $WebExtLauncherOut `
    -RedirectStandardError $WebExtLauncherErr `
    -PassThru

  Write-Host "==> Wait for live extension session"
  Wait-ForSession

  $url = "http://127.0.0.1:$Port/form.html"
  $null = Invoke-Pire "Open fixture" @("open", $url) "Opened"
  $snapshot = Invoke-Pire "Snapshot fixture" @("snapshot", "-i") "@e1"
  if ($snapshot -match 'label "Email"') {
    throw "Snapshot exposed raw label as actionable element"
  }
  $null = Invoke-Pire "Fill email by label" @("find", "label", "Email", "fill", "hello@example.com") "Filled textbox"
  $null = Invoke-Pire "Click submit by role" @("find", "role", "button", "--name", "Submit", "click") "Clicked button"
  $null = Invoke-Pire "Wait for submitted marker" @("wait", "--selector", "#done:not([hidden])") "Selector found"
  $null = Invoke-Pire "Capture screenshot" @("screenshot", $Screenshot) "Screenshot written"
  $null = Invoke-Pire "List tabs" @("tabs", "list") "t1"

  if (-not (Test-Path $Screenshot)) {
    throw "Expected screenshot was not created: $Screenshot"
  }
  $script:smokeSucceeded = $true
  Write-Output "Smoke test passed. Screenshot: $Screenshot"
} catch {
  Write-Host "Smoke test failed: $($_.Exception.Message)" -ForegroundColor Red
  Show-RecentLogs
  exit 1
} finally {
  Stop-SmokeProcesses
}
