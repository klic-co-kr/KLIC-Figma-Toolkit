@echo off
setlocal

where powershell >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required to run Folder Maker bridge.
  echo PowerShell is included with supported Windows versions.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Folder-Maker-Bridge.ps1" %*
