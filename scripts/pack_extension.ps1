# Builds dist\hoard.zip for Chrome Web Store upload.
# Strips the "key" field from manifest.json (not allowed on the Web Store).

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ExtDir = Join-Path $Root "chrome-extension"
$DistDir = Join-Path $Root "dist"
$ZipPath = Join-Path $DistDir "hoard.zip"

$Include = @(
    "background.js",
    "content.js",
    "hoard-common.js",
    "sd.js",
    "artstation.js",
    "icon48.png"
)

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

$Stage = Join-Path $env:TEMP "hoard-pack"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Path $Stage | Out-Null

foreach ($file in $Include) {
    $src = Join-Path $ExtDir $file
    if (-not (Test-Path $src)) {
        Write-Error "Missing required file: $src"
    }
    Copy-Item $src -Destination $Stage
}

# Manifest without "key" (Web Store assigns its own signing key / extension ID)
$manifestPath = Join-Path $ExtDir "manifest.json"
$manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.PSObject.Properties.Name -contains "key") {
    $manifest.PSObject.Properties.Remove("key")
    Write-Host "Removed 'key' from manifest for Web Store package."
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $Stage "manifest.json") -Encoding UTF8

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -Force
Remove-Item $Stage -Recurse -Force

Write-Host "Created: $ZipPath"
Write-Host "Upload this ZIP in the Chrome Web Store Developer Dashboard."
Write-Host "After approval, copy the store extension ID into hoard_native_host.json and run install_native_host.ps1"
