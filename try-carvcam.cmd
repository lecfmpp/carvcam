@echo off
rem CarvCAM: installs (first run only), builds the production version and opens it in the browser.
rem Usage: double-click this file (needs Node.js 18 or newer).
rem        try-carvcam.cmd --dev   (development mode)
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

for %%D in (cam-engine app) do (
  if not exist "%%D\node_modules" (
    echo ==^> Installing dependencies for %%D ^(first run only^)...
    pushd %%D
    call npm install --no-audit --no-fund || (popd & pause & exit /b 1)
    popd
  )
)

cd app
if "%~1"=="--dev" (
  echo ==^> Development mode at http://localhost:5173
  call npx vite --open
) else (
  echo ==^> Building the production version and opening http://localhost:4173
  echo     After the first launch, CarvCAM also opens offline at that address.
  call npm run local
)
pause
