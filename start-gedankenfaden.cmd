@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   Starting Gedankenfaden (Local Preview)
echo ===================================================

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is required but was not found on PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist "dist" (
  echo Building production assets...
  call npm.cmd run build
)

echo Launching desktop application preview...
call npm.cmd run preview -- --open --port 5173
exit /b %errorlevel%
