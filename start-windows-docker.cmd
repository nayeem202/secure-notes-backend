@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else (
        echo Node.js 20.19 or later is required to run this launcher.
        pause
        exit /b 1
    )
)
node scripts\setup-local.js
if errorlevel 1 goto failed
node scripts\start-docker-windows.js
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Docker startup did not complete. Read the error above and share its text.
pause
exit /b 1
