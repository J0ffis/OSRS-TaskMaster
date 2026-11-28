# The go-live switch for Automatic upload: sets UPLOAD_LIVE in the plugin
# (plugin/src/main/java/com/osrstaskmaster/TaskMasterConfig.java) and LIVE in web/config.js
# together. tests/upload-switch.test.mjs fails if they ever differ.
#
#   .\scripts\Set-UploadLive.ps1          go live (checks the live service answers first)
#   .\scripts\Set-UploadLive.ps1 -Off     back to "not live yet"
#   .\scripts\Set-UploadLive.ps1 -Status  show the switch, change nothing
#   -Force                                go live even if the service doesn't answer
#
# Live: the plugin's Automatic upload settings are open with their normal wording, the panel
# suggests switching it on, and the live website mentions it. Not live: the settings are closed
# and marked "not live yet", and only Test Auto-Upload.bat uploads (to a service on the tester's
# PC). Copy and paste works the same either way.
#
# Afterwards: npm test, read the docs it lists, commit, and push main (the website republishes;
# the plugin changes reach players with the next Plugin Hub update).
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads other characters in scripts without a BOM.

param(
  [switch]$Off,
  [switch]$Status,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$JavaFile = Join-Path $Root "plugin\src\main\java\com\osrstaskmaster\TaskMasterConfig.java"
$JsFile = Join-Path $Root "web\config.js"
$JavaRx = '(?m)^(\s*boolean UPLOAD_LIVE = )(true|false);'
$JsRx = '(?m)^(export const LIVE = )(true|false);'
$Utf8 = New-Object Text.UTF8Encoding($false)

$java = [IO.File]::ReadAllText($JavaFile, $Utf8)
$js = [IO.File]::ReadAllText($JsFile, $Utf8)
$jm = [regex]::Match($java, $JavaRx)
$sm = [regex]::Match($js, $JsRx)
if (-not $jm.Success) { throw "Couldn't find 'boolean UPLOAD_LIVE = ...;' in $JavaFile" }
if (-not $sm.Success) { throw "Couldn't find 'export const LIVE = ...;' in $JsFile" }

Write-Host "Plugin  UPLOAD_LIVE = $($jm.Groups[2].Value)   ($JavaFile)"
Write-Host "Website LIVE        = $($sm.Groups[2].Value)   ($JsFile)"
if ($Status) {
  if ($jm.Groups[2].Value -ne $sm.Groups[2].Value) { Write-Host "They differ: run this script to set both." -ForegroundColor Red }
  exit 0
}

$want = if ($Off) { "false" } else { "true" }

if (-not $Off -and -not $Force) {
  # Any HTTP answer (even "not found") means the service is up; no answer means it isn't deployed.
  $server = [regex]::Match($java, 'DEFAULT_UPLOAD_SERVER = "([^"]+)"').Groups[1].Value
  Write-Host ""
  Write-Host "Checking the live upload service at $server ..."
  $up = $false
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "$server/v1/public/osrs-taskmaster-check" -TimeoutSec 15 | Out-Null
    $up = $true
  } catch [Net.WebException] {
    if ($_.Exception.Response) { $up = $true } else { $why = $_.Exception.Message }
  }
  if (-not $up) {
    Write-Host "No answer ($why). Deploy the service first (sync/README.md), or use -Force." -ForegroundColor Red
    exit 1
  }
  Write-Host "It answers." -ForegroundColor Green
}

$java = [regex]::Replace($java, $JavaRx, "`${1}$want;")
$js = [regex]::Replace($js, $JsRx, "`${1}$want;")
[IO.File]::WriteAllText($JavaFile, $java, $Utf8)
[IO.File]::WriteAllText($JsFile, $js, $Utf8)
Write-Host ""
Write-Host "Set both to $want." -ForegroundColor Green

# The docs describe the current state in words; list what to reread.
$docs = @("README.md", "TESTER-GUIDE.md", "plugin\README.md", "sync\README.md", "docs\plugin-hub.md")
$hits = foreach ($d in $docs) {
  Select-String -Path (Join-Path $Root $d) -Pattern "not live|isn't live|isn't running for everyone|just yet" |
    ForEach-Object { "  {0}:{1}: {2}" -f $d, $_.LineNumber, $_.Line.Trim() }
}
Write-Host ""
if ($want -eq "true") {
  Write-Host "Update the docs that still say Automatic upload isn't live (npm test lists any left):"
} else {
  Write-Host "Docs that mention the switch (check they say it isn't live):"
}
$hits | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "Then: npm test, plugin\gradlew.bat -p plugin test, commit, push main."
