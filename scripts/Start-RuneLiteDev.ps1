# Launches RuneLite in developer mode with the OSRS TaskMaster plugin side-loaded (runs `gradlew run`).
# For development. Testers use "Start TaskMaster.bat" instead, which also sets up Java and the login.
#
#   .\scripts\Start-RuneLiteDev.ps1
$Root = Split-Path -Parent $PSScriptRoot
$env:JAVA_HOME = Join-Path $env:LOCALAPPDATA "Programs\jdk17"
Push-Location (Join-Path $Root "plugin")
try { & .\gradlew.bat run } finally { Pop-Location }
