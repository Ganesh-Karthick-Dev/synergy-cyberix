@echo off
echo 🔍 Checking WSL Status...
echo.

echo 📋 WSL Version Check:
wsl --version
echo.

echo 📋 WSL Status:
wsl --status
echo.

echo 📋 WSL Distributions:
wsl -l -v
echo.

echo 📋 WSL Simple List:
wsl -l
echo.

echo 📋 Testing WSL Command:
wsl echo "WSL is working"
echo.

echo ✅ WSL Status Check Complete
pause
