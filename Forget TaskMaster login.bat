@echo off
rem Deletes the Jagex login that the one-time --insecure-write-credentials step saved for RuneLite.
title OSRS TaskMaster - forget login
set "CRED=%USERPROFILE%\.runelite\credentials.properties"
if not exist "%CRED%" (
  echo No saved login found. Nothing to remove.
) else (
  del "%CRED%"
  if exist "%CRED%" (
    echo Couldn't delete %CRED%. Close RuneLite and try again.
  ) else (
    echo Your saved Jagex login has been removed.
    echo To use OSRS TaskMaster again later, repeat the one-time login step in Start TaskMaster.bat.
  )
)
echo.
pause
