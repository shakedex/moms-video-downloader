# Builds the app and packages the release exe into a versioned zip.
# Windows PowerShell 5.1 compatible.

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "Running pnpm tauri build..."
pnpm tauri build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
}

$confPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$version = $conf.version

$exePath = Join-Path $repoRoot "src-tauri\target\release\LipszycVideoDownloader.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "Build output not found at $exePath" -ForegroundColor Red
    exit 1
}

$releaseDir = Join-Path $repoRoot "release"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

$zipPath = Join-Path $releaseDir "LipszycVideoDownloader-v$version.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $exePath -DestinationPath $zipPath -Force

$zipSizeMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 2)

Write-Host ""
Write-Host "Release zip: $zipPath"
Write-Host "Size: $zipSizeMB MB"
