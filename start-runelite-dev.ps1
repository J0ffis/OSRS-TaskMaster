# Launches RuneLite in developer mode with the OSRS TaskMaster plugin side-loaded.
$env:JAVA_HOME = Join-Path $env:LOCALAPPDATA "Programs\jdk17"
Push-Location (Join-Path $PSScriptRoot "plugin")
try { & .\gradlew.bat run } finally { Pop-Location }
