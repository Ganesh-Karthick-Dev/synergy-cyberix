@echo off
echo 🚀 Starting Cyberix Desktop Application...
echo.

echo 📋 Checking if development server is running...
netstat -an | findstr :6977 >nul
if %errorlevel% equ 0 (
    echo ✅ Development server is running on port 6977
) else (
    echo ⚠️  Development server not found on port 6977
    echo 🔧 Starting development server...
    start "Vite Dev Server" cmd /k "npm run dev"
    echo ⏳ Waiting for development server to start...
    timeout /t 5 /nobreak >nul
)

echo.
echo 🖥️  Starting Electron desktop application...
npm run electron

pause
