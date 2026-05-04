param(
    [string]$InstallDir = "$env:LOCALAPPDATA\Programs\pire-browser",
    [string]$FirefoxPath,
    [switch]$NoPath,
    [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-SourceRoot {
    $root = Split-Path -Parent $PSCommandPath
    if (Test-Path -LiteralPath (Join-Path $root "pire-browser.exe")) {
        return (Resolve-Path -LiteralPath $root).Path
    }

    $parent = Split-Path -Parent $root
    if (Test-Path -LiteralPath (Join-Path $parent "pire-browser.exe")) {
        return (Resolve-Path -LiteralPath $parent).Path
    }

    throw "Could not find pire-browser.exe next to the installer. Run this script from an extracted pire-browser Windows package."
}

function Add-UserPath {
    param([string]$PathToAdd)

    $current = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if ($current) {
        $parts = $current.Split(";") | Where-Object { $_ -ne "" }
    }

    $alreadyPresent = $parts | Where-Object {
        $_.TrimEnd("\") -ieq $PathToAdd.TrimEnd("\")
    }

    if (-not $alreadyPresent) {
        $updated = ($parts + $PathToAdd) -join ";"
        [Environment]::SetEnvironmentVariable("Path", $updated, "User")
    }

    $processParts = @()
    if ($env:Path) {
        $processParts = $env:Path.Split(";") | Where-Object { $_ -ne "" }
    }
    $processPresent = $processParts | Where-Object {
        $_.TrimEnd("\") -ieq $PathToAdd.TrimEnd("\")
    }
    if (-not $processPresent) {
        $env:Path = ($processParts + $PathToAdd) -join ";"
    }
}

$sourceRoot = Resolve-SourceRoot
$installDir = [Environment]::ExpandEnvironmentVariables($InstallDir)

New-Item -ItemType Directory -Force -Path $installDir | Out-Null

$items = @(
    "pire-browser.exe",
    "pire-browser-host.exe",
    "extension"
)

foreach ($item in $items) {
    $source = Join-Path $sourceRoot $item
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Package is missing required item: $item"
    }

    $destination = Join-Path $installDir $item
    if (Test-Path -LiteralPath $destination) {
        Remove-Item -LiteralPath $destination -Recurse -Force
    }
    Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
}

Get-ChildItem -LiteralPath $installDir -Recurse -File | Unblock-File -ErrorAction SilentlyContinue

if (-not $NoPath) {
    Add-UserPath -PathToAdd $installDir
}

$node = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Warning "npx.cmd was not found. Install Node.js LTS before using 'pire-browser launch'."
}

if (-not $SkipSetup) {
    $setupArgs = @("setup", "--windows")
    if ($FirefoxPath) {
        $setupArgs += @("--firefox-path", $FirefoxPath)
    }
    & (Join-Path $installDir "pire-browser.exe") @setupArgs
}

Write-Host ""
Write-Host "pire-browser installed to $installDir"
if ($NoPath) {
    Write-Host "Run it with: $installDir\pire-browser.exe status"
} else {
    Write-Host "Open a new PowerShell window, then run: pire-browser status"
}
