@echo off
chcp 65001 >nul
title Life Manager - Create desktop shortcut
cd /d "%~dp0"

REM Pure ASCII on purpose: cmd parses .bat under code page 936, and UTF-8 Chinese
REM inside a .bat breaks its parser (". was unexpected at this time."). All the real
REM work + all Chinese output lives in the .ps1, which is UTF-8 with BOM.

echo.
echo   Create "Life Manager" desktop shortcut
echo   ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-desktop-shortcut.ps1"
set RC=%errorlevel%

echo.
if not "%RC%"=="0" echo   Failed (exit %RC%). See the message above.
pause
exit /b %RC%
