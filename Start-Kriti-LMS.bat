@echo off
setlocal EnableExtensions
title Kriti Drona LMS

rem Repo root = folder containing this file
set "ROOT=%~dp0"
set "APP=%ROOT%frontend_app"
set "URL=http://localhost:3000"

cd /d "%APP%" || (
  echo Could not find frontend_app at: %APP%
  pause
  exit /b 1
)

where npm >nul 2>&1 || (
  echo Node.js / npm not found. Install Node LTS from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing npm dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

rem Free port 3000 if a stale Next.js process is still bound after reboot
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$c=Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach($p in $c){ if($p){ Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }"

rem Clear a broken/incomplete .next cache (causes unstyled "weird" page: CSS/JS 404)
if exist ".next\" (
  if not exist ".next\static\css\" (
    echo Clearing incomplete Next.js cache...
    rmdir /s /q ".next" 2>nul
  )
)

echo.
echo ========================================
echo   Kriti Drona LMS
echo   %URL%
echo ========================================
echo   First open after reboot can take 1-2 min
echo   while styles compile. Keep this window open.
echo   Close it or press Ctrl+C to stop.
echo ========================================
echo.

rem Open browser only after HTML + CSS are actually served
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\wait_and_open_browser.ps1" -Url "%URL%" -TimeoutSec 180

call npm run dev

echo.
echo Server stopped.
pause
