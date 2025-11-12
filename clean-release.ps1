# Clean release folder and kill any running Cyberix processes
Write-Host "Cleaning release folder..."

# Kill any running Cyberix processes
Get-Process -Name "Cyberix" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Remove release folder if it exists
if (Test-Path "release\win-unpacked") {
    Remove-Item -Path "release\win-unpacked" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Release folder cleaned."
} else {
    Write-Host "No release folder found."
}

Write-Host "Cleanup complete."

