@echo off
setlocal

set "SCRIPT=%~dp0Create-Folders.ps1"

where powershell >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required to run folder-maker.
  echo PowerShell is included with supported Windows versions.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" %*
