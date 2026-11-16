@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed. Install Node.js LTS from https://nodejs.org/
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm was not found.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules\" (
  echo Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed. Check your internet connection and Node.js version.
    pause
    exit /b 1
  )
)
echo Opening two terminal windows. Keep both running.
start "SDG Backend" cmd /k "npm run dev:server"
start "SDG Frontend" cmd /k "npm run dev"
echo.
echo Open http://localhost:5173 in Chrome or Edge.
echo Read README.md to install the Arduino fingerprint sensor firmware.
pause
