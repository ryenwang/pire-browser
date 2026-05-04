param(
    [string]$PackageName = "pire-browser-windows-x64"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $repoRoot "dist"
$packageRoot = Join-Path $distDir $PackageName
$zipPath = Join-Path $distDir "$PackageName.zip"

function Remove-WithinDist {
    param([string]$Path)

    $resolvedDist = [System.IO.Path]::GetFullPath($distDir)
    $resolvedPath = [System.IO.Path]::GetFullPath($Path)
    if (-not $resolvedPath.StartsWith($resolvedDist, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside dist: $resolvedPath"
    }
    if (Test-Path -LiteralPath $resolvedPath) {
        Remove-Item -LiteralPath $resolvedPath -Recurse -Force
    }
}

Push-Location $repoRoot
try {
    npm --prefix extension install
    npm --prefix extension run build
    cargo build --release

    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    Remove-WithinDist -Path $packageRoot
    Remove-WithinDist -Path $zipPath

    New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
    Copy-Item -LiteralPath "target\release\pire-browser.exe" -Destination $packageRoot
    Copy-Item -LiteralPath "target\release\pire-browser-host.exe" -Destination $packageRoot
    Copy-Item -LiteralPath "README.md" -Destination $packageRoot
    Copy-Item -LiteralPath "package.json" -Destination $packageRoot
    Copy-Item -LiteralPath "scripts\install-windows.ps1" -Destination (Join-Path $packageRoot "install-windows.ps1")
    Copy-Item -LiteralPath "scripts\install-pi-windows.ps1" -Destination (Join-Path $packageRoot "install-pi-windows.ps1")
    Copy-Item -LiteralPath "pi" -Destination (Join-Path $packageRoot "pi") -Recurse

    $extensionDest = Join-Path $packageRoot "extension"
    New-Item -ItemType Directory -Force -Path (Join-Path $extensionDest "dist") | Out-Null
    Copy-Item -LiteralPath "extension\manifest.json" -Destination $extensionDest
    Copy-Item -Path "extension\dist\*" -Destination (Join-Path $extensionDest "dist") -Recurse

    @"
pire-browser Windows x64 package

Install from PowerShell:

  .\install-windows.ps1

Requirements:

  - Windows 11 x64
  - Firefox
  - Node.js LTS, for npx/web-ext during browser launch

After install, open a new PowerShell window and run:

  pire-browser status
  pire-browser launch

Install Pi integration after installing pire-browser:

  .\install-pi-windows.ps1
"@ | Set-Content -LiteralPath (Join-Path $packageRoot "PACKAGE-README.txt") -Encoding UTF8

    Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -Force
    Write-Host "Wrote $zipPath"
}
finally {
    Pop-Location
}
