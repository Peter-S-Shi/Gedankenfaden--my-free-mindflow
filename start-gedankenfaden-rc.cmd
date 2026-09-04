@echo off
setlocal
cd /d "%~dp0"

set "EXE_PATH=%~dp0src-tauri\target\release\gedankenfaden.exe"

echo ===================================================
echo   Gedankenfaden Native Release Candidate Launcher
echo ===================================================

if not exist "%EXE_PATH%" (
  echo Error: Windows Native Release binary was not found at:
  echo   %EXE_PATH%
  echo.
  echo Please compile the release candidate or download the
  echo gedankenfaden-windows-rc distribution package before running.
  echo.
  pause
  exit /b 1
)

echo Starting Windows Native Release Candidate:
echo   %EXE_PATH%
echo.

start "" "%EXE_PATH%" %*
exit /b 0
