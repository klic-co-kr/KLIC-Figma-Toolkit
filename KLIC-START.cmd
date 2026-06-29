@echo off
setlocal

set "ROOT=%~dp0"
set "TOOLKIT=%ROOT%klic-figma-toolkit"

:menu
cls
echo KLIC Figma Toolkit
echo.
echo 1. Run local preflight
echo 2. Capture Figma smoke evidence from clipboard and run completion audit
echo 3. Run completion audit with evidence file
echo 4. Watch an evidence file path and audit when it appears
echo 5. Watch clipboard for Figma smoke evidence and audit
echo 6. Open runtime checklist
echo 7. Install Node.js LTS with winget
echo 8. Open Folder Maker GUI
echo 9. Start Folder Maker bridge for Figma button
echo A. Install Folder Maker protocol fallback
echo 0. Exit
echo.
set /p "CHOICE=Select: "

if "%CHOICE%"=="1" goto local_preflight
if "%CHOICE%"=="2" goto capture_evidence
if "%CHOICE%"=="3" goto audit_file
if "%CHOICE%"=="4" goto watch_file
if "%CHOICE%"=="5" goto watch_clipboard
if "%CHOICE%"=="6" goto checklist
if "%CHOICE%"=="7" goto install_node
if "%CHOICE%"=="8" goto folder_maker
if "%CHOICE%"=="9" goto folder_bridge
if /i "%CHOICE%"=="A" goto install_folder_protocol
if "%CHOICE%"=="0" exit /b 0
goto menu

:local_preflight
call "%TOOLKIT%\run-local-verification.cmd"
pause
goto menu

:capture_evidence
call "%TOOLKIT%\capture-runtime-evidence.cmd"
pause
goto menu

:audit_file
echo.
set /p "EVIDENCE=Evidence JSON path: "
if "%EVIDENCE%"=="" goto menu
call "%TOOLKIT%\run-completion-audit.cmd" --runtime-evidence "%EVIDENCE%"
pause
goto menu

:watch_file
echo.
set /p "WATCH_PATH=Evidence JSON path to watch: "
if "%WATCH_PATH%"=="" goto menu
call "%TOOLKIT%\watch-runtime-evidence.cmd" "%WATCH_PATH%"
pause
goto menu

:watch_clipboard
call "%TOOLKIT%\watch-runtime-clipboard.cmd"
pause
goto menu

:checklist
start "" "%TOOLKIT%\RUNTIME_CHECKLIST.md"
goto menu

:install_node
echo.
echo Installing Node.js LTS with winget...
winget install OpenJS.NodeJS.LTS
echo.
echo After installation, close this terminal and open KLIC-START.cmd again.
pause
goto menu

:folder_maker
call "%ROOT%folder-maker\folder-maker-gui.cmd"
pause
goto menu

:folder_bridge
call "%ROOT%folder-maker\folder-maker-bridge.cmd"
pause
goto menu

:install_folder_protocol
call "%ROOT%folder-maker\install-protocol.cmd"
pause
goto menu
