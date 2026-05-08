param(
  [string]$Case = "open-fixture,snapshot-interactive,fill-ref,click-ref,wait-selector",
  [switch]$NoInstall
)

$ErrorActionPreference = "Stop"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$VisibleRoot = Join-Path $Repo "target\agent-browser-oracle\visible-compare"
$ChromeProfile = Join-Path $VisibleRoot "agent-browser-chrome-profile"
$SocketDir = Join-Path $VisibleRoot "agent-browser-sockets"

New-Item -ItemType Directory -Force $VisibleRoot, $ChromeProfile, $SocketDir | Out-Null
Set-Location $Repo

if (-not $NoInstall) {
  npm run oracle:install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$env:ORACLE_CASE_FILTER = $Case
$env:ORACLE_VISIBLE_ONLY = "1"
$env:ORACLE_VISIBLE_RUN = "1"
$env:AGENT_BROWSER_HEADED = "1"
$env:AGENT_BROWSER_PROFILE = $ChromeProfile
$env:AGENT_BROWSER_SOCKET_DIR = $SocketDir

Write-Host "Running visible deterministic comparison case(s): $Case"
npm run oracle:compare
exit $LASTEXITCODE
