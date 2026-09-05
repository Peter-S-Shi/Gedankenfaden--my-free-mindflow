@echo off
setlocal
cd /d "%~dp0"

set "EXE_PATH=%~dp0src-tauri\target\release\gedankenfaden.exe"

echo ===================================================
echo   Gedankenfaden Windows Native Release Launcher
echo ===================================================

if not exist "%EXE_PATH%" (
  echo Error: Windows Native Release binary was not found at:
  echo   %EXE_PATH%
  echo.
  echo Please compile the release binary or download the
  echo gedankenfaden-windows-v1.0.0 distribution package before running.
  echo.
  pause
  exit /b 1
)

echo Starting Windows Native Release:
echo   %EXE_PATH%
echo.

start "" "%EXE_PATH%" %*
exit /b 0
