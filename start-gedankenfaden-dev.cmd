@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "TARGET_BRANCH=v2.0.0-upgrade"

echo ===================================================
echo   Gedankenfaden Live Development Launcher
echo ===================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERROR: git was not found in PATH.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo ERROR: npm was not found in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: This launcher must be run from the Gedankenfaden repository.
  pause
  exit /b 1
)

for /f "delims=" %%B in ('git rev-parse --abbrev-ref HEAD') do set "CURRENT_BRANCH=%%B"
if /I not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
  echo ERROR: Current branch is "%CURRENT_BRANCH%".
  echo Expected "%TARGET_BRANCH%".
  echo Refusing to switch branches automatically so local work is not disturbed.
  pause
  exit /b 1
)

echo [1/4] Fetching the latest %TARGET_BRANCH% from origin...
git fetch origin "%TARGET_BRANCH%"
if errorlevel 1 (
  echo ERROR: git fetch failed.
  pause
  exit /b 1
)

echo [2/4] Fast-forwarding the local branch to the latest remote commit...
git pull --ff-only origin "%TARGET_BRANCH%"
if errorlevel 1 (
  echo ERROR: Could not fast-forward safely.
  echo This usually means local work conflicts with newer remote changes or the branch has diverged.
  echo Nothing was force-reset or discarded.
  pause
  exit /b 1
)

for /f "delims=" %%H in ('git rev-parse --short HEAD') do set "HEAD_SHA=%%H"
echo.
echo Current development source:
echo   Branch: %TARGET_BRANCH%
echo   HEAD:   %HEAD_SHA%
echo.

echo [3/4] Checking JavaScript dependencies...
if not exist "node_modules\" (
  echo node_modules is missing. Running npm ci...
  call npm ci
  if errorlevel 1 (
    echo ERROR: npm ci failed.
    pause
    exit /b 1
  )
) else (
  call npm ls --depth=0 >nul 2>&1
  if errorlevel 1 (
    echo Dependency state is stale or incomplete. Running npm ci...
    call npm ci
    if errorlevel 1 (
      echo ERROR: npm ci failed.
      pause
      exit /b 1
    )
  ) else (
    echo Dependencies are ready.
  )
)

echo.
echo [4/4] Starting the current working-tree product with Tauri dev...
echo This uses the current source tree, not target\release\gedankenfaden.exe.
echo Keep this window open while Gedankenfaden is running.
echo.
call npm run tauri dev

set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
  echo Gedankenfaden dev exited with code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
