@echo off
rem Double-click to try Automatic upload on this PC only: a local upload service, the website
rem and RuneLite with the plugin, all from this folder. Closing RuneLite stops everything.
title OSRS TaskMaster - Automatic upload test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-AutoUploadTest.ps1" %*
if errorlevel 1 if not errorlevel 2 (
  echo.
  echo Something went wrong before the launcher could start. Take a screenshot of this window
  echo and send it to whoever shared OSRS TaskMaster with you.
  pause
)
