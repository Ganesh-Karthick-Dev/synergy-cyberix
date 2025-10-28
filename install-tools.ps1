# Cyberix Auto-Tool Installer (PowerShell)
# This script will automatically install all required tools on Windows

Write-Host "🚀 Cyberix Auto-Tool Installer" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "⚠️  This script should be run as Administrator for best results" -ForegroundColor Yellow
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host ""
}

# Function to check if a tool exists
function Test-ToolExists {
    param([string]$ToolName)
    
    try {
        $null = Get-Command $ToolName -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# Function to install a tool
function Install-Tool {
    param(
        [string]$ToolName,
        [string[]]$WingetId,
        [string[]]$ChocoId,
        [string]$ManualUrl = $null
    )
    
    Write-Host "🔧 Installing $ToolName..." -ForegroundColor Yellow
    
    # Check if already installed
    if (Test-ToolExists $ToolName) {
        Write-Host "✅ $ToolName is already installed" -ForegroundColor Green
        return $true
    }
    
    # Try winget first
    if ($WingetId) {
        Write-Host "  Trying winget..." -ForegroundColor Gray
        try {
            foreach ($id in $WingetId) {
                $result = winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  ✅ $ToolName installed successfully via winget" -ForegroundColor Green
                    return $true
                }
            }
        }
        catch {
            Write-Host "  ❌ winget failed" -ForegroundColor Red
        }
    }
    
    # Try chocolatey
    if ($ChocoId) {
        Write-Host "  Trying chocolatey..." -ForegroundColor Gray
        try {
            foreach ($id in $ChocoId) {
                $result = choco install $id -y --no-progress
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "  ✅ $ToolName installed successfully via chocolatey" -ForegroundColor Green
                    return $true
                }
            }
        }
        catch {
            Write-Host "  ❌ chocolatey failed" -ForegroundColor Red
        }
    }
    
    # Manual installation
    if ($ManualUrl) {
        Write-Host "  📋 Manual installation required:" -ForegroundColor Yellow
        Write-Host "     URL: $ManualUrl" -ForegroundColor Cyan
    }
    
    Write-Host "  ❌ All installation methods failed for $ToolName" -ForegroundColor Red
    return $false
}

# Install basic tools
Write-Host "📋 Installing basic tools..." -ForegroundColor Cyan

$tools = @(
    @{ Name = "git"; WingetId = @("Git.Git"); ChocoId = @("git"); ManualUrl = "https://git-scm.com/download/win" },
    @{ Name = "curl"; WingetId = @("cURL.cURL"); ChocoId = @("curl") },
    @{ Name = "wget"; WingetId = @("GNU.Wget"); ChocoId = @("wget") },
    @{ Name = "jq"; WingetId = @("stedolan.jq"); ChocoId = @("jq"); ManualUrl = "https://stedolan.github.io/jq/download/" },
    @{ Name = "7z"; WingetId = @("7zip.7zip"); ChocoId = @("7zip") },
    @{ Name = "nmap"; WingetId = @("InsecureCompatible.Nmap"); ChocoId = @("nmap"); ManualUrl = "https://nmap.org/download.html" },
    @{ Name = "go"; WingetId = @("GoLang.Go"); ChocoId = @("golang"); ManualUrl = "https://golang.org/dl/" },
    @{ Name = "openssl"; WingetId = @("ShiningLight.OpenSSL"); ChocoId = @("openssl") }
)

$successCount = 0
$totalCount = $tools.Count

foreach ($tool in $tools) {
    $success = Install-Tool -ToolName $tool.Name -WingetId $tool.WingetId -ChocoId $tool.ChocoId -ManualUrl $tool.ManualUrl
    if ($success) { $successCount++ }
}

# Setup WSL and Kali Linux
Write-Host "`n🐧 Setting up WSL and Kali Linux..." -ForegroundColor Cyan

# Check if WSL is available
try {
    $wslStatus = wsl --status 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ WSL is available" -ForegroundColor Green
    } else {
        throw "WSL not available"
    }
}
catch {
    Write-Host "❌ WSL not available. Installing WSL..." -ForegroundColor Red
    try {
        wsl --install
        Write-Host "✅ WSL installation initiated. Please restart your computer and run this script again." -ForegroundColor Yellow
        exit 0
    }
    catch {
        Write-Host "❌ WSL installation failed" -ForegroundColor Red
    }
}

# Check if Kali Linux is installed
try {
    $kaliTest = wsl -d kali-linux echo "kali-test" 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Kali Linux is available" -ForegroundColor Green
    } else {
        throw "Kali Linux not found"
    }
}
catch {
    Write-Host "❌ Kali Linux not found. Installing Kali Linux..." -ForegroundColor Red
    try {
        wsl --install -d kali-linux
        Write-Host "✅ Kali Linux installation initiated" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Kali Linux installation failed" -ForegroundColor Red
    }
}

# Install security tools in WSL
Write-Host "`n🔒 Installing security tools in WSL Kali Linux..." -ForegroundColor Cyan

$securityCommands = @(
    "wsl -d kali-linux sudo apt update",
    "wsl -d kali-linux sudo apt install -y nikto sqlmap hydra gobuster dirb",
    "wsl -d kali-linux sudo apt install -y theharvester amass john medusa",
    "wsl -d kali-linux sudo apt install -y metasploit-framework zaproxy mitmproxy",
    "wsl -d kali-linux sudo apt install -y socat netcat-openbsd fail2ban",
    "wsl -d kali-linux go install github.com/ffuf/ffuf@latest",
    "wsl -d kali-linux go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest",
    "wsl -d kali-linux go install github.com/hahwul/dalfox/v2@latest"
)

foreach ($cmd in $securityCommands) {
    Write-Host "  Running: $cmd" -ForegroundColor Gray
    try {
        Invoke-Expression $cmd
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Success" -ForegroundColor Green
        } else {
            Write-Host "  ❌ Failed" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "  ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n📊 Installation Summary" -ForegroundColor Cyan
Write-Host "=======================" -ForegroundColor Cyan
Write-Host "✅ Successfully installed: $successCount/$totalCount basic tools" -ForegroundColor Green
Write-Host "🔒 Security tools installed in WSL Kali Linux" -ForegroundColor Green
Write-Host "`n🎉 Installation complete!" -ForegroundColor Green
Write-Host "Please restart your terminal and run the Cyberix application." -ForegroundColor Yellow
