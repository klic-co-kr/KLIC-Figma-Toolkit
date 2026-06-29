@echo off
setlocal

set "PROTOCOL=klic-folder-maker"

if /I "%~1"=="--dry-run" (
  echo reg delete HKCU\Software\Classes\%PROTOCOL% /f
  exit /b 0
)

reg delete HKCU\Software\Classes\%PROTOCOL% /f >nul 2>nul
if errorlevel 1 (
  echo KLIC Folder Maker protocol was not registered.
  exit /b 0
)

echo KLIC Folder Maker protocol removed.
