param(
    [string]$PackageName = "pire-browser-windows-x64"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $repoRoot "dist"
$packageRoot = Join-Path $distDir $PackageName
$zipPath = Join-Path $distDir "$PackageName.zip"
$targetTriple = "x86_64-pc-windows-msvc"
$targetReleaseDir = Join-Path $repoRoot "cli\target\$targetTriple\release"

function Assert-PeMachineX64 {
    param([string]$Path)

    $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Path))
    if ($bytes.Length -lt 0x40 -or $bytes[0] -ne 0x4d -or $bytes[1] -ne 0x5a) {
        throw "$Path is not a PE executable"
    }
    $peOffset = [BitConverter]::ToInt32($bytes, 0x3c)
    if ($peOffset + 6 -gt $bytes.Length) {
        throw "$Path has an invalid PE header"
    }
    if ($bytes[$peOffset] -ne 0x50 -or $bytes[$peOffset + 1] -ne 0x45) {
        throw "$Path has an invalid PE signature"
    }
    $machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
    if ($machine -ne 0x8664) {
        throw "$Path is not x86_64/AMD64. PE machine type: 0x$($machine.ToString('x4'))"
    }
}

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
    rustup target add $targetTriple
    cargo build --manifest-path cli\Cargo.toml --release --target $targetTriple

    New-Item -ItemType Directory -Force -Path $distDir | Out-Null
    Remove-WithinDist -Path $packageRoot
    Remove-WithinDist -Path $zipPath

    New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
    $cliExe = Join-Path $targetReleaseDir "pire-browser.exe"
    $hostExe = Join-Path $targetReleaseDir "pire-browser-host.exe"
    Assert-PeMachineX64 -Path $cliExe
    Assert-PeMachineX64 -Path $hostExe
    Copy-Item -LiteralPath $cliExe -Destination $packageRoot
    Copy-Item -LiteralPath $hostExe -Destination $packageRoot
    Copy-Item -LiteralPath "README.md" -Destination $packageRoot
    Copy-Item -LiteralPath "LICENSE" -Destination $packageRoot
    Copy-Item -LiteralPath "package.json" -Destination $packageRoot
    Copy-Item -LiteralPath "pire-browser.schema.json" -Destination $packageRoot
    Copy-Item -LiteralPath "agent-browser.schema.json" -Destination $packageRoot
    Copy-Item -LiteralPath "scripts\install-windows.ps1" -Destination (Join-Path $packageRoot "install-windows.ps1")
    Copy-Item -LiteralPath "scripts\install-pi-windows.ps1" -Destination (Join-Path $packageRoot "install-pi-windows.ps1")
    New-Item -ItemType Directory -Force -Path (Join-Path $packageRoot "scripts") | Out-Null
    Copy-Item -LiteralPath "scripts\pi-install-migration.mjs" -Destination (Join-Path $packageRoot "scripts\pi-install-migration.mjs")
    Copy-Item -LiteralPath "scripts\pi-postinstall.mjs" -Destination (Join-Path $packageRoot "scripts\pi-postinstall.mjs")

    $piExtensionsDest = Join-Path $packageRoot "pi\extensions"
    New-Item -ItemType Directory -Force -Path $piExtensionsDest | Out-Null
    foreach ($file in @("pire-browser.ts", "pire-browser-runner.ts", "redaction.ts")) {
        Copy-Item -LiteralPath (Join-Path "pi\extensions" $file) -Destination (Join-Path $piExtensionsDest $file)
    }

    foreach ($dir in @("agent", "skills", "skill-data")) {
        Copy-Item -LiteralPath $dir -Destination (Join-Path $packageRoot $dir) -Recurse
    }

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
  pire-browser skills cat core

Install Pi integration after installing pire-browser:

  .\install-pi-windows.ps1

Before updating/replacing package binaries, close managed Firefox sessions so
Windows can release old executable file handles.
"@ | Set-Content -LiteralPath (Join-Path $packageRoot "PACKAGE-README.txt") -Encoding UTF8

    Compress-Archive -Path (Join-Path $packageRoot "*") -DestinationPath $zipPath -Force
    Write-Host "Wrote $zipPath"
}
finally {
    Pop-Location
}
