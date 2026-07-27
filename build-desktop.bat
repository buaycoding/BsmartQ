@echo off
REM BsmartQ Desktop Build Script for Windows

echo.
echo ====================================================
echo BsmartQ Desktop Application Builder
echo ====================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Checking Node.js version...
node --version
echo.

echo [2/5] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo.

echo [3/5] Building BsmartQ Desktop for Windows...
echo Note: This may take several minutes...
echo.
call npm run build:win
if errorlevel 1 (
    echo ERROR: Build failed!
    echo Please check the error messages above.
    pause
    exit /b 1
)
echo.

echo ====================================================
echo SUCCESS! Desktop application built successfully!
echo ====================================================
echo.
echo Output files in: dist\
echo.
echo Installation files:
echo - BsmartQ Desktop-1.0.0-x64.exe (NSIS Installer)
echo - BsmartQ Desktop 1.0.0.exe (Portable)
echo.
echo You can now:
echo 1. Distribute the .exe files to users
echo 2. Or run locally: npm run desktop
echo.
pause
