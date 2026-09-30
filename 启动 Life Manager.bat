@echo off
chcp 65001 >nul
title Life Manager
cd /d "%~dp0"

echo.
echo   Life Manager
echo   ============================================
echo.

REM 1. already running? just open the browser
netstat -ano | findstr ":4173" | findstr "LISTENING" >nul 2>&1
if %errorlevel%==0 (
    echo   [OK] Server is already running. Opening browser...
    start "" "http://localhost:4173/"
    ping -n 3 127.0.0.1 >nul
    exit /b 0
)

REM 2. no build yet? build once
if not exist "dist\index.html" (
    echo   [1/2] First run - building...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo   [X] Build failed. See the errors above.
        pause
        exit /b 1
    )
    echo.
)

REM 3. start the server; --open launches the browser itself
echo   [2/2] Serving http://localhost:4173/
echo.
echo   --------------------------------------------
echo    Close this window to stop the server.
echo   --------------------------------------------
echo.

call npx vite preview --port 4173 --strictPort --open

echo.
echo   Server stopped.
pause
