param(
  [switch]$DryRun,
  [switch]$NoInstall,
  [switch]$NoLayout,
  [switch]$PrintMode,
  [switch]$Cleanup,
  [string]$Provider = "",
  [string]$Model = "",
  [string]$PireExecutable = "",
  [string]$AgentBrowserExecutable = "",
  [int]$LayoutSeconds = 60
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$OracleRoot = Join-Path $Repo "target\agent-browser-oracle"
$VisibleRoot = Join-Path $OracleRoot "visible"
$VisibleSocketDir = Join-Path $VisibleRoot "agent-browser-sockets"
$VisibleProfileDir = Join-Path $VisibleRoot "agent-browser-chrome-profile"
$VisiblePiSessionDir = Join-Path $VisibleRoot "pi-sessions"
$VisibleLogDir = Join-Path $VisibleRoot "logs"
$PireExtension = Join-Path $Repo "pi\extensions\pire-browser.ts"
$AgentExtension = Join-Path $Repo "pi\extensions\agent-browser-oracle.ts"
$PireTitle = "Pi pire-browser visible demo"
$AgentTitle = "Pi agent-browser visible demo"

function Write-Step {
  param([string]$Message)
  Write-Host "==> $Message"
}

function Fail {
  param([string]$Message)
  throw $Message
}

function Find-FirstExisting {
  param([string[]]$Paths)
  foreach ($path in $Paths) {
    if ($path -and (Test-Path -LiteralPath $path)) {
      return (Resolve-Path -LiteralPath $path).Path
    }
  }
  return $null
}

function Resolve-Pi {
  $command = Get-Command pi -ErrorAction SilentlyContinue
  if (-not $command) { Fail "pi was not found on PATH." }
  return $command.Source
}

function Resolve-WindowsTerminal {
  $command = Get-Command wt.exe -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  return $command.Source
}

function Resolve-Chrome {
  return Find-FirstExisting @(
    (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"),
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
  )
}

function Resolve-Firefox {
  return Find-FirstExisting @(
    $env:PIRE_BROWSER_FIREFOX_PATH,
    "C:\Program Files\Mozilla Firefox\firefox.exe",
    "C:\Program Files (x86)\Mozilla Firefox\firefox.exe"
  )
}

function Resolve-Pire {
  if ($PireExecutable) {
    if (-not (Test-Path -LiteralPath $PireExecutable)) { Fail "PIRE executable not found: $PireExecutable" }
    return (Resolve-Path -LiteralPath $PireExecutable).Path
  }
  if ($env:PIRE_BROWSER_EXE -and (Test-Path -LiteralPath $env:PIRE_BROWSER_EXE)) {
    return (Resolve-Path -LiteralPath $env:PIRE_BROWSER_EXE).Path
  }
  return Find-FirstExisting @(
    (Join-Path $Repo "target\debug\pire-browser.exe"),
    (Join-Path $Repo "target\release\pire-browser.exe"),
    (Join-Path $Repo "bin\win32-x64\pire-browser.exe")
  )
}

function Resolve-AgentBrowser {
  if ($AgentBrowserExecutable) {
    if (-not (Test-Path -LiteralPath $AgentBrowserExecutable)) { Fail "agent-browser executable not found: $AgentBrowserExecutable" }
    return (Resolve-Path -LiteralPath $AgentBrowserExecutable).Path
  }
  if ($env:AGENT_BROWSER_ORACLE_EXE -and (Test-Path -LiteralPath $env:AGENT_BROWSER_ORACLE_EXE)) {
    return (Resolve-Path -LiteralPath $env:AGENT_BROWSER_ORACLE_EXE).Path
  }
  return Find-FirstExisting @(
    (Join-Path $Repo "target\agent-browser-oracle\npm\node_modules\agent-browser\bin\agent-browser-win32-x64.exe"),
    (Join-Path $Repo "target\agent-browser-oracle\npm\node_modules\agent-browser\bin\agent-browser-win32-arm64.exe"),
    (Join-Path $Repo "target\agent-browser-oracle\npm\node_modules\.bin\agent-browser.cmd")
  )
}

function Stop-VisibleDemoProcesses {
  Write-Step "Cleaning up visible agent-browser oracle processes"
  Get-CimInstance Win32_Process |
    Where-Object {
      ($_.Name -like "agent-browser*" -and $_.CommandLine -like "*target*agent-browser-oracle*") -or
      ($_.Name -eq "chrome.exe" -and $_.CommandLine -like "*agent-browser-chrome-profile*")
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Escape-SingleQuotedPowerShell {
  param([string]$Value)
  return $Value.Replace("'", "''")
}

function New-EncodedPowerShell {
  param([string]$Script)
  return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Script))
}

function Build-PiCommandScript {
  param(
    [string]$Title,
    [string]$Tool,
    [string]$Extension,
    [string]$Prompt,
    [string]$PiExecutable,
    [string]$LogPath,
    [hashtable]$Environment
  )

  $lines = @(
    "`$ErrorActionPreference = 'Stop'",
    "[Console]::Title = '$(Escape-SingleQuotedPowerShell $Title)'",
    "`$Host.UI.RawUI.WindowTitle = '$(Escape-SingleQuotedPowerShell $Title)'",
    "Set-Location '$(Escape-SingleQuotedPowerShell $Repo)'",
    "`$logPath = '$(Escape-SingleQuotedPowerShell $LogPath)'",
    "New-Item -ItemType Directory -Force (Split-Path -Parent `$logPath) | Out-Null",
    "Start-Transcript -Path `$logPath -Force | Out-Null",
    "Write-Host 'Running Pi from: $(Escape-SingleQuotedPowerShell $PiExecutable)'"
  )

  foreach ($entry in $Environment.GetEnumerator()) {
    $lines += "`$env:$($entry.Key) = '$(Escape-SingleQuotedPowerShell ([string]$entry.Value))'"
  }

  $piArgs = @()
  if ($Provider) { $piArgs += @("--provider", $Provider) }
  if ($Model) { $piArgs += @("--model", $Model) }
  if ($PrintMode) { $piArgs += "--print" }
  $piArgs += @(
    "--no-builtin-tools",
    "--no-extensions",
    "--extension",
    $Extension,
    "--tools",
    $Tool,
    $Prompt
  )

  $quotedArgs = $piArgs | ForEach-Object { "'$(Escape-SingleQuotedPowerShell ([string]$_))'" }
  $lines += "`$piArgs = @($($quotedArgs -join ', '))"
  $lines += "& '$(Escape-SingleQuotedPowerShell $PiExecutable)' @piArgs"
  $lines += "Write-Host ''"
  $lines += "Write-Host 'Demo terminal is staying open for inspection. Close this window when done.' -ForegroundColor Yellow"
  $lines += "Stop-Transcript | Out-Null"
  return ($lines -join "`r`n")
}

function Start-DemoTerminal {
  param(
    [string]$Title,
    [string]$Script
  )
  $encoded = New-EncodedPowerShell $Script
  $powerShellArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-EncodedCommand", $encoded)
  if ($DryRun) {
    Write-Host ""
    Write-Host "----- $Title -----"
    Write-Host $Script
    return $null
  }
  $windowsTerminal = Resolve-WindowsTerminal
  if ($windowsTerminal) {
    $wtArgs = @("-w", "new", "new-tab", "--title", $Title, "powershell.exe") + $powerShellArgs
    return Start-Process -FilePath $windowsTerminal -ArgumentList $wtArgs -WorkingDirectory $Repo -WindowStyle Normal -PassThru
  }
  return Start-Process -FilePath "powershell.exe" -ArgumentList $powerShellArgs -WorkingDirectory $Repo -WindowStyle Normal -PassThru
}

function Ensure-User32 {
  if ("WindowTools.NativeMethods" -as [type]) { return }
  Add-Type @"
using System;
using System.Runtime.InteropServices;
namespace WindowTools {
  public static class NativeMethods {
    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
  }
}
"@
}

function Move-ProcessWindow {
  param(
    [System.Diagnostics.Process]$Process,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )
  if (-not $Process -or $Process.MainWindowHandle -eq 0) { return $false }
  [WindowTools.NativeMethods]::MoveWindow($Process.MainWindowHandle, $X, $Y, $Width, $Height, $true) | Out-Null
  return $true
}

function Find-WindowByTitle {
  param([string]$Title)
  return Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$Title*" } |
    Select-Object -First 1
}

function Find-BrowserWindow {
  param([string]$Name)
  return Get-Process -Name $Name -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Sort-Object StartTime -Descending |
    Select-Object -First 1
}

function Invoke-BestEffortLayout {
  if ($NoLayout -or $DryRun) { return }
  Write-Step "Arranging visible demo windows best-effort"
  Add-Type -AssemblyName System.Windows.Forms
  Ensure-User32
  $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $leftWidth = [int]($area.Width * 0.43)
  $rightWidth = [int]($area.Width - $leftWidth)
  $halfHeight = [int]($area.Height / 2)
  $deadline = (Get-Date).AddSeconds($LayoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $pireTerminal = Find-WindowByTitle $PireTitle
    $agentTerminal = Find-WindowByTitle $AgentTitle
    $firefox = Find-BrowserWindow "firefox"
    $chrome = Find-BrowserWindow "chrome"

    $moved = 0
    if (Move-ProcessWindow $pireTerminal $area.Left $area.Top $leftWidth $halfHeight) { $moved++ }
    if (Move-ProcessWindow $firefox ($area.Left + $leftWidth) $area.Top $rightWidth $halfHeight) { $moved++ }
    if (Move-ProcessWindow $agentTerminal $area.Left ($area.Top + $halfHeight) $leftWidth $halfHeight) { $moved++ }
    if (Move-ProcessWindow $chrome ($area.Left + $leftWidth) ($area.Top + $halfHeight) $rightWidth $halfHeight) { $moved++ }

    if ($moved -ge 4) {
      Write-Host "Arranged all four demo windows."
      return
    }
    Start-Sleep -Seconds 2
  }

  Write-Host "Automatic layout did not find all four windows. Arrange manually as:" -ForegroundColor Yellow
  Write-Host "  Top-left:    $PireTitle"
  Write-Host "  Top-right:   Firefox"
  Write-Host "  Bottom-left: $AgentTitle"
  Write-Host "  Bottom-right: Chrome"
}

if ($Cleanup) {
  Stop-VisibleDemoProcesses
  return
}

if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
  Fail "The visible side-by-side demo is Windows-only."
}

if (-not (Test-Path -LiteralPath $PireExtension)) { Fail "Missing pire-browser Pi extension: $PireExtension" }
if (-not (Test-Path -LiteralPath $AgentExtension)) { Fail "Missing agent-browser oracle Pi extension: $AgentExtension" }

New-Item -ItemType Directory -Force $VisibleRoot, $VisibleSocketDir, $VisibleProfileDir, $VisiblePiSessionDir, $VisibleLogDir | Out-Null

$pi = Resolve-Pi
$chrome = Resolve-Chrome
$firefox = Resolve-Firefox
$pire = Resolve-Pire

if (-not $chrome) { Fail "Chrome was not found. Install Chrome or adjust Resolve-Chrome in this script." }
if (-not $firefox) { Fail "Firefox was not found. Set PIRE_BROWSER_FIREFOX_PATH or install Firefox." }
if (-not $pire) { Fail "pire-browser.exe was not found. Build it or set -PireExecutable / PIRE_BROWSER_EXE." }

if (-not $NoInstall) {
  Write-Step "Verifying pinned agent-browser oracle install"
  if (-not $DryRun) {
    & npm run oracle:install
    if ($LASTEXITCODE -ne 0) { Fail "npm run oracle:install failed." }
  }
}

$agent = Resolve-AgentBrowser
if (-not $agent) { Fail "agent-browser oracle executable was not found. Run npm run oracle:install." }

Write-Step "Resolved demo tools"
Write-Host "pi:                    $pi"
Write-Host "Chrome:                $chrome"
Write-Host "Firefox:               $firefox"
Write-Host "pire-browser:          $pire"
Write-Host "agent-browser oracle:  $agent"

$pirePrompt = @"
Use pire-browser only. Do not use any other tool.

In the visible Firefox browser:
1. Use pire-browser to open https://www.bing.com.
2. Use pire-browser snapshot -i to inspect the page.
3. Find the search textbox, enter exactly: harry potter
4. Submit the search.
5. Stop when the browser visibly shows Bing search results for harry potter. Do not close the browser.

If a cookie, privacy, or consent popup blocks the search box, dismiss it using pire-browser and continue.
Report briefly whether the search results are visible.
"@

$agentPrompt = @"
Use agent-browser-oracle only. Do not use any other tool.

In the visible headed Chrome browser:
1. Use agent-browser-oracle to open https://www.bing.com.
2. Use agent-browser-oracle snapshot -i to inspect the page.
3. Find the search textbox, enter exactly: harry potter
4. Submit the search.
5. Stop when the browser visibly shows Bing search results for harry potter. Do not close the browser.

If a cookie, privacy, or consent popup blocks the search box, dismiss it using agent-browser-oracle and continue.
Report briefly whether the search results are visible.
"@

$pireScript = Build-PiCommandScript `
  -Title $PireTitle `
  -Tool "pire-browser" `
  -Extension $PireExtension `
  -Prompt $pirePrompt `
  -PiExecutable $pi `
  -LogPath (Join-Path $VisibleLogDir "pire-terminal.log") `
  -Environment @{
    PIRE_BROWSER_EXE = $pire
    PIRE_BROWSER_FIREFOX_PATH = $firefox
    PI_CODING_AGENT_SESSION_DIR = (Join-Path $VisiblePiSessionDir "pire")
  }

$agentScript = Build-PiCommandScript `
  -Title $AgentTitle `
  -Tool "agent-browser-oracle" `
  -Extension $AgentExtension `
  -Prompt $agentPrompt `
  -PiExecutable $pi `
  -LogPath (Join-Path $VisibleLogDir "agent-terminal.log") `
  -Environment @{
    AGENT_BROWSER_ORACLE_EXE = $agent
    AGENT_BROWSER_HEADED = "1"
    AGENT_BROWSER_SESSION = "visible-agent-browser"
    AGENT_BROWSER_SOCKET_DIR = $VisibleSocketDir
    AGENT_BROWSER_PROFILE = $VisibleProfileDir
    AGENT_BROWSER_ORACLE_OUTPUT_IDLE_MS = "1000"
    PI_CODING_AGENT_SESSION_DIR = (Join-Path $VisiblePiSessionDir "agent")
  }

Write-Step "Launching visible Pi demo terminals"
$pireProcess = Start-DemoTerminal -Title $PireTitle -Script $pireScript
$agentProcess = Start-DemoTerminal -Title $AgentTitle -Script $agentScript

if ($DryRun) {
  Write-Host ""
  Write-Host "Dry run complete. No windows were launched."
  return
}

Write-Host "Started terminal processes:"
Write-Host "  $PireTitle PID:  $($pireProcess.Id)"
Write-Host "  $AgentTitle PID: $($agentProcess.Id)"

Invoke-BestEffortLayout

Write-Host ""
Write-Host "Visible side-by-side demo launched." -ForegroundColor Green
Write-Host "Use this cleanup command later to close oracle Chrome/agent-browser processes:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle/visible-bing-side-by-side.ps1 -Cleanup"
