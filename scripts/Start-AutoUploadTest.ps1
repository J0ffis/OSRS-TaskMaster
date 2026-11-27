# Try Automatic upload on this PC: a local upload service, this branch's website and RuneLite with
# this branch's plugin. Nothing is sent anywhere else; uploads go into a local database in
# sync\.wrangler (ignored by Git). No Cloudflare account is needed.
# Run it by double-clicking "Test Auto-Upload.bat" in the project folder.
#
# What it does, in order:
#   1. Finds Node.js and, the first time, installs the upload service's tools (npm, about 50 MB).
#   2. Prepares the local database (safe to repeat; existing test data is kept).
#   3. Starts the upload service on http://127.0.0.1:8789 and the website on http://127.0.0.1:8790,
#      each in its own window.
#   4. Starts RuneLite with the plugin (same steps as Start TaskMaster.bat: Java, Jagex login).
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
	exit 1
}
function Test-Port($port) {
	try { $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $port); $c.Close(); return $true } catch { return $false }
}

Write-Host ""
Write-Host "  OSRS TaskMaster: Automatic upload test (on this PC only)" -ForegroundColor Cyan
Write-Host "  --------------------------------------------------------" -ForegroundColor Cyan

# ---- 1. Node.js and the service's tools ------------------------------------------------------

Write-Step "Checking for Node.js"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
	$portable = Join-Path $env:LOCALAPPDATA "Programs\node\node.exe"
	if (Test-Path $portable) { $node = $portable }
}
if (-not $node) { Stop-Launcher "Node.js is needed for the local upload service. Install it from https://nodejs.org/ and start this again." }
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
	if (Test-Port $p) { Stop-Launcher "Port $p is already in use. Close the other test windows (or whatever uses it) and start this again." }
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

# ---- 4. What to set in RuneLite --------------------------------------------------------------------

Write-Step "In RuneLite, once you're logged in"
Write-Info "Open Configuration (the wrench), search for OSRS TaskMaster, and set:"
Write-Host "     Website            $WebUrl" -ForegroundColor White
Write-Host "     Upload server      $ServiceUrl" -ForegroundColor White
Write-Host "     Automatic upload   on" -ForegroundColor White
Write-Info "Then open the OSRS TaskMaster panel and click Upload now, then Open website."
Write-Info "Visiting the website fills 'Your next grinds' in the panel (click Sync; Refresh shows more)."
Write-Host ""
Write-Info "Worth trying: Copy share link (open it in another browser: view only), goals, Not for me,"
Write-Info "Reset my links (your old link stops working), Delete my uploaded data."
Write-Host ""
Write-Info "When you're done testing, set Website and Upload server back (right-click > Reset)"
Write-Info "or switch Automatic upload off: these settings are shared with Start TaskMaster.bat."

# ---- 5. RuneLite --------------------------------------------------------------------------------------

if ($NoRuneLite) {
	Write-Host ""
	try { Read-Host "Press Enter to stop the upload service and the website" | Out-Null }
	finally { Stop-TestServers }
	exit 0
}

try {
	& (Join-Path $PSScriptRoot "Start-TaskMaster.ps1") -NoBrowser -AutoUploadTest
} finally {
	Write-Step "RuneLite closed: stopping the upload service and the website"
	Stop-TestServers
	Write-Ok "Stopped. Your test uploads stay in $State (start with -Reset to clear them)."
}
