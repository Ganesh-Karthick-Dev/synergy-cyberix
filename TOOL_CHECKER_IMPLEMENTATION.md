# Tool Checker Implementation

## Overview
This document describes the implementation of the automated tool checking and installation system for the Cyberix security scanner.

## Files Created/Modified

### 1. `src/utils/toolChecker.js` (NEW)
A comprehensive tool checking and installation utility that:
- Checks for required security tools
- Provides installation commands
- Handles both apt-based and Go-based tool installations
- Works in Linux/WSL environments
- Uses ES6 module syntax for React compatibility
- Browser-compatible using Electron IPC (no Node.js modules in renderer)

**Key Functions:**
- `checkTool(toolName)` - Check if a single tool is installed
- `checkAllTools()` - Check all required tools and return status
- `installMissingTools(missingTools)` - Install missing tools via apt
- `ensureToolsInstalled()` - Main function to check and install tools if needed
- `getToolCheckCommand()` - Get the manual tool check command
- `getInstallCommand()` - Get the manual installation command

### 2. `src/components/ComprehensiveSecurityScanner.jsx` (MODIFIED)
Enhanced the scanner component with:
- Tool checking before scan starts
- Automatic tool installation prompts
- Tool status display UI
- Integration with existing scan workflow

### 3. `src/main/main.js` (MODIFIED)
Added new IPC handlers for tool checking:
- `tools:checkTool` - Check if a single tool is installed
- `tools:installTools` - Install missing tools via apt and Go

### 4. `src/main/preload.js` (MODIFIED)
Exposed new tool checking functions to renderer:
- `checkTool(toolName)` - Check single tool via IPC
- `installTools(aptCommand, goCommands)` - Install tools via IPC

**New Features:**
- `checkTools()` - Check tools and display status
- `installMissingTools()` - Install missing tools with user confirmation
- Tool status display section with visual indicators
- Automatic tool checking before scan initiation

## Required Tools

The system checks for these 23 security tools:

### Basic Tools (via apt)
- `jq` - JSON processor
- `unzip` - Archive extraction
- `nmap` - Network scanner
- `nikto` - Web vulnerability scanner
- `sqlmap` - SQL injection scanner
- `hydra` - Password cracker
- `gobuster` - Directory/file brute-forcer
- `dirb` - Web content scanner
- `theharvester` - Email/subdomain/port scanner
- `amass` - Attack surface mapping
- `john` - Password cracker
- `medusa` - Network authentication cracker
- `metasploit-framework` - Penetration testing framework
- `zaproxy` - Web application security scanner
- `mitmproxy` - Interactive TLS-capable intercepting proxy
- `socat` - Multipurpose relay
- `fail2ban` - Intrusion prevention system
- `curl` - Data transfer tool
- `wget` - File downloader

### Go-based Tools
- `ffuf` - Web fuzzer
- `nuclei` - Vulnerability scanner
- `dalfox` - XSS scanner

### Development Tools
- `go` - Go programming language
- `build-essential` - Essential build tools
- `ca-certificates` - Certificate authorities

## Installation Commands

### Tool Check Command
```bash
for tool in jq unzip nmap nikto sqlmap hydra gobuster dirb theharvester amass \
john medusa metasploit-framework zaproxy mitmproxy socat fail2ban \
curl wget ffuf nuclei dalfox go; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "✅ $tool is installed -> $(command -v $tool)"
  else
    echo "❌ $tool is NOT installed"
  fi
done
```

### Installation Command
```bash
sudo apt install -y \
  jq unzip nmap nikto sqlmap hydra gobuster dirb theharvester amass \
  john medusa metasploit-framework zaproxy mitmproxy socat fail2ban \
  curl wget build-essential ca-certificates
```

### Go Tools Installation
```bash
go install github.com/ffuf/ffuf@latest
go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
go install github.com/hahwul/dalfox/v2@latest
```

## User Workflow

1. **User enters target URL** in the scanner interface
2. **User clicks "Start Scan"** button
3. **System automatically checks tools** before starting scan
4. **If tools are missing:**
   - System shows missing tools list
   - User is prompted to install missing tools
   - If user agrees, tools are installed automatically
   - System re-checks tools after installation
5. **If all tools are ready:**
   - Scan proceeds normally
6. **Tool status is displayed** in a dedicated UI section

## UI Components

### Tool Status Display
- Visual grid showing all tools with status indicators
- Green dot = installed, Red dot = missing
- Tool paths displayed for installed tools
- Missing tools section with install button

### Check Tools Button
- Manual tool checking functionality
- Shows loading state during checking
- Displays results via toast notifications

### Install Missing Tools Button
- Appears when tools are missing
- Triggers automatic installation
- Shows progress during installation

## Error Handling

- Graceful handling of missing dependencies
- Clear error messages for installation failures
- Fallback to manual installation instructions
- Platform detection (Linux/WSL required)

## Integration Points

- **Scan Start Process**: Tool checking is integrated into the scan initiation workflow
- **Toast Notifications**: Uses existing toast system for user feedback
- **Loading States**: Proper loading indicators during tool operations
- **Error Recovery**: Clear error messages and recovery options

## Testing

The implementation has been tested with:
- Tool checking functionality
- Command generation
- Error handling
- UI integration

## Future Enhancements

- Support for Windows tool installation
- Tool version checking
- Custom tool configurations
- Batch tool updates
- Tool dependency resolution
