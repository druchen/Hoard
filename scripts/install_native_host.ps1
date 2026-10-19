# Registers the Hoard native messaging host for Chrome.
# Usage:
#   .\install_native_host.ps1
#   .\install_native_host.ps1 -ExtensionId "abcdefghijklmnopqrstuvwxyzabcdef"

param(
    [string]$ExtensionId = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$HostJsonPath = Join-Path $ScriptDir "hoard_native_host.json"
$BatPath = Join-Path $ScriptDir "hoard_native.bat"

if (-not (Test-Path $BatPath)) {
    Write-Error "Missing hoard_native.bat at $BatPath"
}

# Ensure bat uses correct project root
$BatContent = @"
@echo off
cd /d "$ProjectRoot"
python -m hoard.native_bridge
"@
Set-Content -Path $BatPath -Value $BatContent -Encoding ASCII

function Get-DevExtensionIdFromManifest {
    $manifestPath = Join-Path $ProjectRoot "chrome-extension\manifest.json"
    if (-not (Test-Path $manifestPath)) {
        return $null
    }
    $manifest = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $manifest.key) {
        return $null
    }
    $py = @"
import base64, hashlib, sys
pub = base64.b64decode(sys.argv[1])
digest = hashlib.sha256(pub).digest()
print(''.join(chr(97 + (digest[i] >> 4)) + chr(97 + (digest[i] & 0x0F)) for i in range(16)))
"@
    return (& python -c $py $manifest.key).Trim()
}

$HostConfig = Get-Content $HostJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$HostConfig.path = $BatPath

$origins = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($origin in @($HostConfig.allowed_origins)) {
    if ($origin -and $origin -notmatch "REPLACE") {
        [void]$origins.Add($origin)
    }
}
if ($ExtensionId) {
    [void]$origins.Add("chrome-extension://$ExtensionId/")
    Write-Host "Added store extension ID: $ExtensionId"
}

$devId = Get-DevExtensionIdFromManifest
if ($devId) {
    [void]$origins.Add("chrome-extension://$devId/")
    Write-Host "Added unpacked dev extension ID: $devId"
}

if ($origins.Count -eq 0) {
    Write-Host "No extension IDs configured."
    Write-Host "Run: python ..\scripts\generate_extension_key.py"
    Write-Host "Or: .\install_native_host.ps1 -ExtensionId YOUR_STORE_EXTENSION_ID"
} else {
    $HostConfig.allowed_origins = @($origins)
    Write-Host "allowed_origins:"
    foreach ($origin in $HostConfig.allowed_origins) {
        Write-Host "  $origin"
    }
}

$HostConfig | ConvertTo-Json -Depth 4 | Set-Content $HostJsonPath -Encoding UTF8

$RegPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.hoard.bridge"
New-Item -Path $RegPath -Force | Out-Null
Set-ItemProperty -Path $RegPath -Name "(default)" -Value $HostJsonPath

Write-Host "Native host registered:"
Write-Host "  Registry: $RegPath"
Write-Host "  Manifest: $HostJsonPath"
Write-Host "  Launcher: $BatPath"
