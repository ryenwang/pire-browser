param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\pire-browser",
    [string]$PiAgentDir = "$env:USERPROFILE\.pi\agent",
    [switch]$SkipEnv,
    [switch]$SkipPiInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Require-Command {
    param(
        [string]$Name,
        [string]$InstallHint
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

function ConvertTo-JsString {
    param([string]$Value)
    return ($Value | ConvertTo-Json -Compress)
}

$installDir = [Environment]::ExpandEnvironmentVariables($InstallDir)
$pireExe = Join-Path $installDir "pire-browser.exe"
$extensionPath = Join-Path $installDir "pi\extensions\pire-browser.ts"
$packageJson = Join-Path $installDir "package.json"

if (-not (Test-Path -LiteralPath $pireExe)) {
    throw "pire-browser.exe was not found at $pireExe. Run install-windows.ps1 first."
}
if (-not (Test-Path -LiteralPath $extensionPath)) {
    throw "Pi extension was not found at $extensionPath. Install from a package that includes the pi folder."
}
if (-not (Test-Path -LiteralPath $packageJson)) {
    throw "package.json was not found at $packageJson. Install from a package that includes package.json."
}

Require-Command -Name "npm.cmd" -InstallHint "Install Node.js LTS first."

if (-not $SkipPiInstall) {
    npm install -g @mariozechner/pi-coding-agent
}

Push-Location $installDir
try {
    npm install --omit=dev
}
finally {
    Pop-Location
}

if (-not $SkipEnv) {
    [Environment]::SetEnvironmentVariable("PIRE_BROWSER_EXE", $pireExe, "User")
    $env:PIRE_BROWSER_EXE = $pireExe
}

$extensionsDir = Join-Path $PiAgentDir "extensions"
New-Item -ItemType Directory -Force -Path $extensionsDir | Out-Null

$extensionLiteral = ConvertTo-JsString $extensionPath
$shim = @"
import { pathToFileURL } from "node:url";

export default async function(pi) {
  const mod = await import(pathToFileURL($extensionLiteral).href);
  return mod.default(pi);
}
"@

$shimPath = Join-Path $extensionsDir "pire-browser.ts"
Set-Content -LiteralPath $shimPath -Value $shim -Encoding UTF8

Write-Host ""
Write-Host "Pi integration installed."
Write-Host "Extension shim: $shimPath"
if ($SkipEnv) {
    Write-Host "PIRE_BROWSER_EXE not changed because -SkipEnv was passed."
} else {
    Write-Host "PIRE_BROWSER_EXE: $pireExe"
}
Write-Host ""
Write-Host "Open a new PowerShell window, then run: pi"
Write-Host "Inside Pi, ask it to use the pire-browser tool, for example:"
Write-Host "  Use pire-browser to launch Firefox, open https://example.com, and snapshot the page."
