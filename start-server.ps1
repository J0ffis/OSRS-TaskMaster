# Starts the OSRS TaskMaster site + sync API at http://localhost:8787
$jdk = Join-Path $env:LOCALAPPDATA "Programs\jdk17\bin\java.exe"
if (-not (Test-Path $jdk)) { $jdk = "java" }
$server = Join-Path $PSScriptRoot "server"
& $jdk "-Droot=$server" (Join-Path $server "Server.java")
