@echo off
echo 🚀 Cyberix Auto-Tool Installer
echo ================================
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ Running as Administrator
) else (
    echo ⚠️  This script should be run as Administrator for best results
    echo Right-click and select "Run as administrator"
    echo.
    pause
)

echo.
echo Choose installation method:
echo 1. Node.js installer (recommended)
echo 2. Simple Node.js installer (fallback)
echo 3. PowerShell installer
echo 4. Manual installation guide
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo.
    echo 🔧 Running Node.js installer...
    node auto-install-tools.js
) else if "%choice%"=="2" (
    echo.
    echo 🔧 Running Simple Node.js installer...
    node simple-install.js
) else if "%choice%"=="3" (
    echo.
    echo 🔧 Running PowerShell installer...
    powershell -ExecutionPolicy Bypass -File install-tools.ps1
) else if "%choice%"=="4" (
    echo.
    echo 📋 Opening manual installation guide...
    start WINDOWS_TOOL_INSTALLATION_GUIDE.md
) else (
    echo ❌ Invalid choice
)

echo.
echo Press any key to exit...
pause >nul
