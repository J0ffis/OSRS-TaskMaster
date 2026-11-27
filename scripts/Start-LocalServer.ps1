# Starts the optional OSRS TaskMaster local server: the website plus the sync API at http://localhost:8787.
# The RuneLite plugin can send profiles to it automatically (see README.md, "Running the local server").
#
#   .\scripts\Start-LocalServer.ps1              # http://localhost:8787
#   .\scripts\Start-LocalServer.ps1 -Port 8788   # another port, e.g. if 8787 is in use
#                                                # (then change the plugin's server address to match)
param(
  [int]$Port = 8787
)
$Root = Split-Path -Parent $PSScriptRoot
$jdk = Join-Path $env:LOCALAPPDATA "Programs\jdk17\bin\java.exe"
if (-not (Test-Path $jdk)) { $jdk = "java" }
$server = Join-Path $Root "server"
& $jdk "-Droot=$server" "-Dport=$Port" (Join-Path $server "Server.java")
