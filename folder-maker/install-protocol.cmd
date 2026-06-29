@echo off
setlocal

set "PROTOCOL=klic-folder-maker"
set "APP=%~dp0folder-maker-gui.cmd"
set "COMMAND=\"%APP%\" \"%%1\""

if /I "%~1"=="--dry-run" (
  echo reg add HKCU\Software\Classes\%PROTOCOL% /ve /d "URL:KLIC Folder Maker" /f
  echo reg add HKCU\Software\Classes\%PROTOCOL% /v "URL Protocol" /d "" /f
  echo reg add HKCU\Software\Classes\%PROTOCOL%\shell\open\command /ve /d "%COMMAND%" /f
  exit /b 0
)

if not exist "%APP%" (
  echo Folder Maker GUI wrapper was not found:
  echo %APP%
  exit /b 1
)

reg add HKCU\Software\Classes\%PROTOCOL% /ve /d "URL:KLIC Folder Maker" /f >nul
if errorlevel 1 exit /b 1
reg add HKCU\Software\Classes\%PROTOCOL% /v "URL Protocol" /d "" /f >nul
if errorlevel 1 exit /b 1
reg add HKCU\Software\Classes\%PROTOCOL%\shell\open\command /ve /d "%COMMAND%" /f >nul
if errorlevel 1 exit /b 1

echo KLIC Folder Maker protocol installed.
echo Figma plugin URL: %PROTOCOL%://open
echo Handler: %APP%

