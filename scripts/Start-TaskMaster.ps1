# OSRS TaskMaster launcher: starts RuneLite with the OSRS TaskMaster plugin and opens the website.
# Run it by double-clicking "Start TaskMaster.bat" in the project folder.
#
# What it does, in order:
#   1. Finds Java 17 (or offers to download a private copy; no admin rights, nothing installed system-wide).
#   2. Checks the one-time Jagex account step (RuneLite needs it to log in from a test build).
#   3. Opens the OSRS TaskMaster website in your browser.
#   4. Starts RuneLite with the plugin. Close RuneLite to stop.
# Keep this file ASCII-only: Windows PowerShell 5.1 misreads other characters in scripts without a BOM.

param(
	[switch]$NoBrowser,
	# Started by Start-AutoUploadTest.ps1: profiles upload, so skip the copy-and-paste hint.
	[switch]$AutoUploadTest
)

$ErrorActionPreference = "Stop"
$Website = "https://j0ffis.github.io/OSRS-TaskMaster/"
$Root = Split-Path -Parent $PSScriptRoot
$PluginDir = Join-Path $Root "plugin"
$JdkDir = Join-Path $env:LOCALAPPDATA "Programs\jdk17"
$RuneLiteDir = Join-Path $env:USERPROFILE ".runelite"
$Credentials = Join-Path $RuneLiteDir "credentials.properties"

function Write-Step($text) { Write-Host ""; Write-Host "== $text" -ForegroundColor Yellow }
function Write-Ok($text) { Write-Host "   $text" -ForegroundColor Green }
function Write-Info($text) { Write-Host "   $text" }
function Read-YesNo($question) {
	$a = Read-Host "   $question [Y/n]"
	return ($a -eq "" -or $a -match "^(y|yes)$")
}
function Stop-Launcher($text) {
	Write-Host ""
	Write-Host "   $text" -ForegroundColor Red
	Write-Host ""
	Read-Host "Press Enter to close"
	exit 1
}

Write-Host ""
Write-Host "  OSRS TaskMaster" -ForegroundColor Cyan
Write-Host "  ---------------" -ForegroundColor Cyan

# ---- 1. Java ---------------------------------------------------------------------------------

Write-Step "Checking for Java 17"

function Test-Jdk($dir) {
	if (-not $dir) { return $false }
	if (-not (Test-Path (Join-Path $dir "bin\javac.exe"))) { return $false }
	# Through cmd, so Java printing its version to stderr isn't treated as an error.
	$v = cmd /c "`"$(Join-Path $dir 'bin\java.exe')`" -version 2>&1" | Out-String
	return ($v -match 'version "(1[1-9]|2\d)')
}

$javaHome = $null
foreach ($candidate in @($JdkDir, $env:JAVA_HOME)) {
	if (Test-Jdk $candidate) { $javaHome = $candidate; break }
}

if (-not $javaHome) {
	Write-Info "Java 17 isn't set up for OSRS TaskMaster yet."
	Write-Info "It can download a private copy of Java (Eclipse Temurin 17, about 190 MB) into:"
	Write-Info "  $JdkDir"
	Write-Info "Nothing is installed system-wide and no admin rights are needed."
	if (-not (Read-YesNo "Download Java now?")) { Stop-Launcher "OSRS TaskMaster needs Java 17 to run. Start this again when you're ready." }

	$zip = Join-Path $env:TEMP "osrs-taskmaster-jdk17.zip"
	$unpack = Join-Path $env:TEMP "osrs-taskmaster-jdk17"
	try {
		[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
		$ProgressPreference = "SilentlyContinue" # the progress bar makes downloads much slower
		Write-Info "Downloading... (this can take a few minutes)"
		Invoke-WebRequest -UseBasicParsing -Uri "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse" -OutFile $zip
		Write-Info "Unpacking..."
		if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
		Expand-Archive -Path $zip -DestinationPath $unpack -Force
		$inner = Get-ChildItem $unpack -Directory | Select-Object -First 1
		New-Item -ItemType Directory -Force (Split-Path -Parent $JdkDir) | Out-Null
		if (Test-Path $JdkDir) { Remove-Item $JdkDir -Recurse -Force }
		Move-Item $inner.FullName $JdkDir
	} catch {
		Stop-Launcher "Couldn't download Java: $($_.Exception.Message)"
	} finally {
		Remove-Item $zip -Force -ErrorAction SilentlyContinue
		Remove-Item $unpack -Recurse -Force -ErrorAction SilentlyContinue
	}
	if (-not (Test-Jdk $JdkDir)) { Stop-Launcher "Java was downloaded but doesn't run. Delete $JdkDir and try again." }
	$javaHome = $JdkDir
}
Write-Ok "Using Java from $javaHome"
$env:JAVA_HOME = $javaHome

# ---- 2. Jagex account login --------------------------------------------------------------------

Write-Step "Checking your RuneLite login"

if (Test-Path $Credentials) {
	Write-Ok "Jagex account login found."
} else {
	Write-Info "Test builds of RuneLite can't open the Jagex Launcher, so a Jagex account needs a"
	Write-Info "one-time step first. (Old-style accounts that log in with an email and password"
	Write-Info "can skip it.)"
	Write-Host ""
	Write-Info "  1. Open the Windows Start menu and search for:  RuneLite (configure)"
	Write-Info "  2. In 'Client arguments', type:  --insecure-write-credentials"
	Write-Info "     then click Save."
	Write-Info "  3. Open the Jagex Launcher and play RuneLite as normal, then close it once you're in."
	Write-Info "     (This saves your login for OSRS TaskMaster.)"
	Write-Info "  4. Open RuneLite (configure) again, clear 'Client arguments', and click Save."
	Write-Host ""
	Write-Info "Your login is saved in $Credentials"
	Write-Info "Keep it private, and remove it any time with 'Forget TaskMaster login.bat'."
	Write-Host ""
	$a = Read-Host "   Press Enter once you've done this, or type S to skip (email/password account)"
	if ($a -notmatch "^s") {
		if (-not (Test-Path $Credentials)) {
			Write-Host "   Still no login file found. RuneLite will start, but a Jagex account won't be able to log in." -ForegroundColor DarkYellow
		} else {
			Write-Ok "Jagex account login found."
		}
	}
}

# ---- 3. Website ------------------------------------------------------------------------------------

if (-not $NoBrowser) {
	Write-Step "Opening the website"
	Write-Info $Website
	Start-Process $Website
}

# ---- 4. RuneLite -----------------------------------------------------------------------------------

Write-Step "Starting RuneLite with OSRS TaskMaster"
Write-Info "The first start downloads RuneLite and can take a few minutes. Later starts are quicker."
if ($AutoUploadTest) {
	Write-Info "When you're in game: open the OSRS TaskMaster panel, click Upload now, then Open website."
} else {
	Write-Info "When you're in game: open the OSRS TaskMaster panel on the right-hand sidebar,"
	Write-Info "click 'Copy my profile', then paste it on the website (Ctrl+V)."
}
Write-Info "Close RuneLite when you're done; this window closes with it."
Write-Host ""

Push-Location $PluginDir
try {
	& .\gradlew.bat run --console=plain -q
	$code = $LASTEXITCODE
} finally {
	Pop-Location
}
if ($code -ne 0) { Stop-Launcher "RuneLite stopped with an error (code $code). Scroll up for details." }
