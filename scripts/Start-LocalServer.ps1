# Starts the optional OSRS TaskMaster local server: the website plus the sync API at http://localhost:8787.
# The RuneLite plugin can send profiles to it automatically (see README.md, "Running the local server").
#
#   .\scripts\Start-LocalServer.ps1
$Root = Split-Path -Parent $PSScriptRoot
$jdk = Join-Path $env:LOCALAPPDATA "Programs\jdk17\bin\java.exe"
if (-not (Test-Path $jdk)) { $jdk = "java" }
$server = Join-Path $Root "server"
& $jdk "-Droot=$server" (Join-Path $server "Server.java")
