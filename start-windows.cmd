@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else (
        echo Install Node.js 20.19 or later, then run this file again.
        pause
        exit /b 1
    )
)
node scripts\setup-local.js
if errorlevel 1 goto failed
call npm.cmd install --include=dev --no-audit --no-fund
if errorlevel 1 goto failed
node scripts\start-local.js
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Local startup failed. Read the error above and share the error text.
pause
exit /b 1
