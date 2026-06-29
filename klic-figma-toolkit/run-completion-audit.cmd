@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js LTS is required to run the KLIC completion audit.
  echo.
  echo Install option 1:
  echo   winget install OpenJS.NodeJS.LTS
  echo.
  echo Install option 2:
  echo   Download Node.js LTS from https://nodejs.org/
  echo.
  echo After installation, close this terminal and open it again, then rerun:
  echo   "%~f0" %*
  exit /b 1
)

node "%~dp0run-completion-audit.mjs" %*
