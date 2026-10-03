@echo off
REM Life Manager sync server launcher.
REM Keep this file ASCII-only: cmd.exe parses a .bat using the console codepage
REM (936/GBK on Chinese Windows), so non-ASCII text here can corrupt parsing.
REM All Chinese output comes from Node, which writes UTF-8 and is unaffected.
REM Run by double-click; keep the window open (closing it stops the server).

setlocal
cd /d "%~dp0..\.."

REM Node logs are UTF-8; switch the console so they render instead of showing mojibake.
REM Node 22.6+ is required: the server runs .ts directly via type stripping.
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] node not found, or older than 22.6. Install Node.js 22.6+ then run again.
  pause
  exit /b 1
)

echo Starting Life Manager sync server...
echo Logs appear in this window. Press Ctrl+C or close the window to stop.
echo.

node "src\server\main.ts"

REM Reached only after the server exits (stopped or crashed). Keep the window
REM so the last log lines stay visible.
echo.
echo Sync server stopped (exit code %errorlevel%).
pause
endlocal