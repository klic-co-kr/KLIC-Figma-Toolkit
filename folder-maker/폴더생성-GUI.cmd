@echo off
setlocal

set "SCRIPT=%~dp0Folder-Maker-GUI.ps1"

where powershell >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required to run Folder Maker GUI.
  echo PowerShell is included with supported Windows versions.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
