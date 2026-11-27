# Try Automatic upload on this PC: a local upload service, this branch's website and RuneLite with
# this branch's plugin. Nothing is sent anywhere else; uploads go into a local database in
# sync\.wrangler (ignored by Git). No Cloudflare account is needed.
# Run it by double-clicking "Test Auto-Upload.bat" in the project folder.
#
# What it does, in order:
#   1. Finds Node.js (or offers to download a private copy, like Java: no admin rights, nothing
#      installed system-wide) and, the first time, installs the upload service's tools (about 50 MB).
#   2. Prepares the local database (safe to repeat; existing test data is kept).
#   3. Starts the upload service on http://127.0.0.1:8789 and the website on http://127.0.0.1:8790,
#      each in its own window.
#   4. Starts RuneLite with the plugin (same steps as Start TaskMaster.bat: Java, Jagex login),
#      set for this run only to upload to the local service and open the local website. Your saved
#      RuneLite settings aren't changed, so Start TaskMaster.bat works as before.
#   5. When RuneLite closes, stops the service and the website.
#
#   -Reset      start with an empty local database (deletes the test uploads)
#   -NoRuneLite only start the service and website (e.g. RuneLite is already running)
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads other characters in scripts without a BOM.

param(
  [switch]$Reset,
  [switch]$NoRuneLite
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Sync = Join-Path $Root "sync"
$State = Join-Path $Sync ".wrangler\state"
$ServicePort = 8789
$WebPort = 8790
$ServiceUrl = "http://127.0.0.1:$ServicePort"
$WebUrl = "http://127.0.0.1:$WebPort/"

function Write-Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Yellow }
function Write-Ok($text) { Write-Host "   $text" -ForegroundColor Green }
function Write-Info($text) { Write-Host "   $text" }
function Stop-Launcher($text) {
  Write-Host ""
  Write-Host "   $text" -ForegroundColor Red
  Write-Host ""
  Read-Host "Press Enter to close"
  # 2, not 1: the .bat files pause on 1, which means PowerShell itself failed (this already paused).
  exit 2
}
function Read-YesNo($question) {
  $a = Read-Host "   $question [Y/n]"
  return ($a -eq "" -or $a -match "^(y|yes)$")
}
function Test-Port($port) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $port); $c.Close(); return $true } catch { return $false }
}

Write-Host ""
Write-Host "  OSRS TaskMaster: Automatic upload test (on this PC only)" -ForegroundColor Cyan
Write-Host "  --------------------------------------------------------" -ForegroundColor Cyan

# ---- 1. Node.js and the service's tools ------------------------------------------------------

Write-Step "Checking for Node.js"
# The upload service's tools (wrangler 4) need Node.js 20 or newer.
function Test-Node($exe) {
  if (-not $exe -or -not (Test-Path $exe)) { return $false }
  $v = (& $exe --version 2>$null) -join ""
  return ($v -match '^v(\d+)\.' -and [int]$Matches[1] -ge 20)
}
$NodeDir = Join-Path $env:LOCALAPPDATA "Programs\node"
$node = $null
foreach ($candidate in @((Join-Path $NodeDir "node.exe"), (Get-Command node -ErrorAction SilentlyContinue).Source)) {
  if (Test-Node $candidate) { $node = $candidate; break }
}
if (-not $node) {
  Write-Info "The local upload service needs Node.js, which isn't set up yet."
  Write-Info "It can download a private copy (the current LTS release, about 35 MB) into:"
  Write-Info "  $NodeDir"
  Write-Info "Nothing is installed system-wide and no admin rights are needed."
  if (-not (Read-YesNo "Download Node.js now?")) { Stop-Launcher "Automatic upload testing needs Node.js. Start this again when you're ready." }
  $zip = Join-Path $env:TEMP "osrs-taskmaster-node.zip"
  $unpack = Join-Path $env:TEMP "osrs-taskmaster-node"
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = "SilentlyContinue" # the progress bar makes downloads much slower
    $release = (Invoke-RestMethod -UseBasicParsing -Uri "https://nodejs.org/dist/index.json") |
      Where-Object { $_.lts -and $_.files -contains "win-x64-zip" } | Select-Object -First 1
    if (-not $release) { throw "couldn't find the current Node.js LTS release" }
    $ver = $release.version
    Write-Info "Downloading Node.js $ver..."
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" -OutFile $zip
    Write-Info "Unpacking..."
    if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $unpack -Force
    $inner = Get-ChildItem $unpack -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Force (Split-Path -Parent $NodeDir) | Out-Null
    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    Move-Item $inner.FullName $NodeDir
  } catch {
    Stop-Launcher "Couldn't download Node.js: $($_.Exception.Message)"
  } finally {
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $unpack -Recurse -Force -ErrorAction SilentlyContinue
  }
  $node = Join-Path $NodeDir "node.exe"
  if (-not (Test-Node $node)) { Stop-Launcher "Node.js was downloaded but doesn't run. Delete $NodeDir and try again." }
}
$npm = Join-Path (Split-Path $node) "npm.cmd"
$env:PATH = "$(Split-Path $node);$env:PATH"
Write-Ok "Using Node.js from $node"

$wrangler = Join-Path $Sync "node_modules\wrangler\bin\wrangler.js"
if (-not (Test-Path $wrangler)) {
  Write-Info "First run: installing the upload service's tools (Cloudflare's wrangler, from npm)."
  Push-Location $Sync
  # Errors only: npm's notices here (a deprecated sub-dependency of wrangler, install-script
  # approvals) aren't actionable. esbuild and workerd's setup scripts are approved, pinned to
  # their exact versions, in sync\package.json ("allowScripts").
  try { & $npm ci --no-audit --no-fund --loglevel=error } finally { Pop-Location }
  if (-not (Test-Path $wrangler)) { Stop-Launcher "Installing the upload service's tools failed. Scroll up for details." }
}
Write-Ok "Upload service tools are ready."

# ---- 2. Local database ----------------------------------------------------------------------------

Write-Step "Preparing the local database"
if ($Reset -and (Test-Path $State)) {
  Remove-Item -Recurse -Force $State
  Write-Info "Cleared the previous test uploads."
}
Push-Location $Sync
try {
  & $node $wrangler d1 execute taskmaster --local --persist-to $State --file=schema.sql | Out-Null
} finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { Stop-Launcher "Couldn't prepare the local database." }
Write-Ok "Local database: $State"

# ---- 3. Service and website ------------------------------------------------------------------------

Write-Step "Starting the upload service and the website"
foreach ($p in @($ServicePort, $WebPort)) {
  if (Test-Port $p) { Stop-Launcher "Port $p is already in use. Close the other test windows (the minimized 'node' windows on the taskbar, or whatever uses it) and start this again." }
}
# Minimized, so they aren't closed by accident: closing either window stops it, and links to
# 127.0.0.1 then stop working until the next start.
$service = Start-Process -PassThru -WindowStyle Minimized -WorkingDirectory $Sync -FilePath $node `
  -ArgumentList @("`"$wrangler`"", "dev", "--port", $ServicePort, "--local", "--persist-to", "`"$State`"")
$website = Start-Process -PassThru -WindowStyle Minimized -WorkingDirectory $Root -FilePath $node `
  -ArgumentList @("`"$(Join-Path $PSScriptRoot 'serve-website.mjs')`"", $WebPort)

$up = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  if ((Test-Port $ServicePort) -and (Test-Port $WebPort)) { $up = $true; break }
}
if (-not $up) {
  foreach ($proc in @($service, $website)) { if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force } }
  Stop-Launcher "The upload service or the website didn't start. Check their windows for errors."
}
Write-Ok "Upload service: $ServiceUrl"
Write-Ok "Website:        $WebUrl"
Write-Info "Both run in minimized windows on the taskbar: leave them open while you test."
Write-Info "Links only work on this PC (127.0.0.1). To check a share link as a visitor, open it in"
Write-Info "a private window, or use 'See it as others do' on your own page."

function Stop-TestServers {
  foreach ($proc in @($service, $website)) {
    if ($proc -and -not $proc.HasExited) { & taskkill /PID $proc.Id /T /F | Out-Null }
  }
}

# ---- 4. What to do in RuneLite --------------------------------------------------------------------

Write-Step "In RuneLite, once you're logged in"
Write-Info "Nothing to set up: for this run the plugin uploads to the local service with Automatic"
Write-Info "upload on. (Your saved RuneLite settings aren't changed.)"
Write-Info "Open the OSRS TaskMaster panel on the sidebar and click Open website. Your progress then"
Write-Info "uploads by itself as you play; 'Your next grinds' fills in once the website has been opened"
Write-Info "(click Sync in the panel to update it; Refresh shows more)."
Write-Host ""
Write-Info "Worth trying: Copy share link (open it in another browser: view only), goals, Not for me,"
Write-Info "Make it a goal from the panel, Reset my links (your old link stops working), and"
Write-Info "Delete my uploaded data."

# ---- 5. RuneLite --------------------------------------------------------------------------------------

if ($NoRuneLite) {
  Write-Host ""
  try { Read-Host "Press Enter to stop the upload service and the website" | Out-Null }
  finally { Stop-TestServers }
  exit 0
}

try {
  # Only for this run of RuneLite: upload to the local service and open the local website.
  & (Join-Path $PSScriptRoot "Start-TaskMaster.ps1") -NoBrowser -AutoUploadTest `
    -GradleArgs @("-PuploadServer=$ServiceUrl", "-Pwebsite=$WebUrl")
} finally {
  Write-Step "RuneLite closed: stopping the upload service and the website"
  Stop-TestServers
  Write-Ok "Stopped. Your test uploads stay in $State (start with -Reset to clear them)."
}
