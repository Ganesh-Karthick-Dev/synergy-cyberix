# Windows Tool Installation Guide

## Overview
This guide helps you install the required security tools on Windows for the Cyberix application.

## Prerequisites

### 1. Install Windows Package Manager (winget)
Winget is the recommended package manager for Windows. It should be available on Windows 10 version 1709 and later.

To check if winget is installed:
```cmd
winget --version
```

If not installed, download it from: https://github.com/microsoft/winget-cli/releases

### 2. Install WSL and Kali Linux (Recommended for Security Tools)
Many security tools work best in a Linux environment. We recommend installing WSL with Kali Linux:

```cmd
# Install WSL
wsl --install

# Install Kali Linux specifically
wsl --install -d kali-linux
```

## Tool Installation Methods

### Method 1: Using the Built-in Tool Installer
1. Open the Cyberix application
2. Go to the Tool Installer section
3. Select the tools you want to install
4. Click "Install Selected Tools"

### Method 2: Manual Installation

#### Basic Tools (via winget)
```cmd
# Git
winget install --id Git.Git -e --source winget

# cURL
winget install --id cURL.cURL -e --source winget

# Wget
winget install --id GNU.Wget -e --source winget

# jq
winget install --id stedolan.jq -e --source winget

# 7-Zip (for unzip functionality)
winget install --id 7zip.7zip -e --source winget

# OpenSSL
winget install --id ShiningLight.OpenSSL -e --source winget

# Go
winget install --id GoLang.Go -e --source winget

# Nmap
winget install --id InsecureCompatible.Nmap -e --source winget
```

#### Security Tools (via WSL Kali Linux)
After installing WSL and Kali Linux, run these commands in WSL:

```bash
# Update package list
sudo apt update

# Install security tools
sudo apt install -y nikto sqlmap hydra gobuster dirb
sudo apt install -y theharvester amass john medusa
sudo apt install -y metasploit-framework zaproxy mitmproxy
sudo apt install -y socat netcat-openbsd fail2ban

# Install Go-based tools (if Go is installed)
go install github.com/ffuf/ffuf@latest
go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
go install github.com/hahwul/dalfox/v2@latest
```

## Troubleshooting

### Common Issues

#### 1. "winget not found"
- Make sure you're running Windows 10 version 1709 or later
- Download winget from the official GitHub releases
- Run Command Prompt as Administrator

#### 2. "WSL not available"
- Enable WSL feature: `dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart`
- Enable Virtual Machine Platform: `dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart`
- Restart your computer
- Install WSL: `wsl --install`

#### 3. "Kali Linux installation failed"
- Make sure WSL is properly installed first
- Try: `wsl --install -d kali-linux`
- If that fails, try: `wsl --list --online` to see available distributions
- Install manually from Microsoft Store: "Kali Linux"

#### 4. "Permission denied" errors
- Run Command Prompt or PowerShell as Administrator
- For WSL commands, you may need to set up a user account in WSL first

#### 5. "Tool not found after installation"
- Restart your terminal/command prompt
- Check if the tool is in your PATH
- For Go tools, make sure GOPATH/bin is in your PATH

### Alternative Installation Methods

#### Chocolatey (Alternative Package Manager)
If winget doesn't work, you can try Chocolatey:

```cmd
# Install Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install tools
choco install git curl wget jq 7zip openssl golang nmap -y
```

#### Manual Downloads
For tools that don't work with package managers, you can download them manually:

- **Nmap**: https://nmap.org/download.html
- **Go**: https://golang.org/dl/
- **Git**: https://git-scm.com/download/win

## Verification

After installation, verify tools are working:

```cmd
# Check basic tools
git --version
curl --version
wget --version
jq --version
go version
nmap --version

# Check WSL tools (run in WSL)
wsl -d kali-linux nikto -Version
wsl -d kali-linux sqlmap --version
wsl -d kali-linux hydra -h
```

## Next Steps

1. Restart the Cyberix application
2. Run the tool checker again to verify all tools are detected
3. Start using the security scanning features

## Support

If you continue to have issues:
1. Check the application logs for detailed error messages
2. Ensure you have administrator privileges
3. Try installing tools one by one to identify problematic ones
4. Consider using a Linux virtual machine as an alternative
