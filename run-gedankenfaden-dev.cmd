@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo   Gedankenfaden - Product Dev Preview
echo   always runs the current source in this working copy
echo ============================================================

where node >nul 2>nul
if errorlevel 1 (
  echo Error: Node.js is required but was not found on PATH.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo Error: the Rust toolchain, cargo, is required but was not found on PATH.
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

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_BRANCH=%%B"
for /f "delims=" %%H in ('git rev-parse --short HEAD 2^>nul') do set "HEAD_SHA=%%H"
echo Branch: %CURRENT_BRANCH%   HEAD: %HEAD_SHA%
echo.
echo Launching Tauri dev preview from the live source.
echo The UI hot-reloads; Rust changes trigger an automatic rebuild.
echo Close this window to stop the preview.
echo.

call npm.cmd run tauri dev

set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo Gedankenfaden dev preview exited with code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
