@echo off
rem Double-click to try Automatic upload on this PC only: a local upload service, this branch's
rem website and RuneLite with this branch's plugin. Closing RuneLite stops everything.
title OSRS TaskMaster - Automatic upload test
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-AutoUploadTest.ps1" %*
