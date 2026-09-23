# Builds the app and packages the release exe into a versioned zip.
# Windows PowerShell 5.1 compatible.
#
# Default build: "Mom's Video Downloader", MomsVideoDownloader.exe.
# To build a copy under another name:
#   powershell -ExecutionPolicy Bypass -File scripts/release.ps1 -Name "Grandma's Video Downloader"
# The name shows in the title bar, taskbar and file properties. The exe and its AppData folder
# are named after it with only English letters and digits kept (GrandmasVideoDownloader); pass
# -ExeName to choose that part yourself, for example when the name is in Hebrew.

param(
    [string]$Name = "",
    [string]$ExeName = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$confPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $conf.version

$buildArgs = @("tauri", "build")
$overridePath = $null
if ($Name) {
    # tauri-winres writes ' as \' into the exe's version info and rc.exe keeps the backslash
    # ("Mom\'s"), so use the typographic apostrophe, as tauri.conf.json does.
    $Name = $Name -replace "'", [string][char]0x2019
    if (-not $ExeName) { $ExeName = $Name }
    $ExeName = $ExeName -replace '[^A-Za-z0-9]', ''
    if (-not $ExeName) {
        Write-Host "The name '$Name' has no English letters or digits for the exe file name. Add -ExeName, for example -ExeName GrandmasVideoDownloader" -ForegroundColor Red
        exit 1
    }
    # Its own identifier too, so two differently named builds on one PC do not share the
    # single-instance lock or WebView data.
    $override = @{
        productName    = $Name
        mainBinaryName = $ExeName
        identifier     = "com.videodownloader." + $ExeName.ToLower()
    }
    $overridePath = Join-Path $env:TEMP "video-downloader-name.json"
    [System.IO.File]::WriteAllText($overridePath, ($override | ConvertTo-Json), (New-Object System.Text.UTF8Encoding $false))
    $buildArgs += @("--config", $overridePath)
    Write-Host "Building as '$Name' ($ExeName.exe)"
} else {
    $ExeName = $conf.mainBinaryName
}

Write-Host "Running pnpm $($buildArgs -join ' ')..."
pnpm @buildArgs
$buildExit = $LASTEXITCODE
if ($overridePath) { Remove-Item $overridePath -Force -ErrorAction SilentlyContinue }
if ($buildExit -ne 0) {
    Write-Host "Build failed with exit code $buildExit" -ForegroundColor Red
    exit $buildExit
}

$exePath = Join-Path $repoRoot "src-tauri\target\release\$ExeName.exe"
if (-not (Test-Path $exePath)) {
    Write-Host "Build output not found at $exePath" -ForegroundColor Red
    exit 1
}

$releaseDir = Join-Path $repoRoot "release"
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir | Out-Null
}

$zipPath = Join-Path $releaseDir "$ExeName-v$version.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path $exePath -DestinationPath $zipPath -Force

$zipSizeMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 2)

Write-Host ""
Write-Host "Release zip: $zipPath"
Write-Host "Size: $zipSizeMB MB"
