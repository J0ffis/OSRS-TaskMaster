@echo off
rem Double-click to start RuneLite with the OSRS TaskMaster plugin and open the website.
title OSRS TaskMaster
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-TaskMaster.ps1" %*
