# Malware & Defacement Monitoring System

A comprehensive automated malware and defacement monitoring system for WSL (Ubuntu/Debian/Kali Linux) that integrates with Electron.js frontend.

## Features

- **Real-time Console Output**: All scanner commands stream live stdout/stderr to the UI exactly as they appear in WSL terminal
- **Exact Command Reproducibility**: Every command is identical to what you can run manually in WSL
- **Automatic Tool Installation**: Uses only apt-installable tools for seamless setup
- **Modular Scanner Architecture**: Individual scanner functions for each tool
- **Hash-based Defacement Detection**: Baseline comparison using SHA256 hashes
- **Unified JSON Reports**: Aggregated results from all scanners

## Architecture

### Core Modules

1. **`scanners.js`** - Modular scanner functions with real-time streaming
   - Web scanners: Nikto, Wapiti, WPScan
   - Malware scanners: ClamAV, YARA
   - Rootkit scanners: RKHunter, chkrootkit
   - System audit: Lynis

2. **`toolInstaller.js`** - Automatic tool checking and installation
   - Checks for required tools
   - Batch installs missing tools via apt
   - Updates ClamAV virus definitions

3. **`defacementMonitor.js`** - Hash-based defacement detection
   - Creates baselines using SHA256 hashes
   - Compares current content against baseline
   - Real-time filesystem monitoring with inotifywait

4. **`resultAggregator.js`** - Unified JSON report generation
   - Aggregates results from all scanners
   - Calculates risk scores
   - Generates recommendations

5. **`comprehensiveOrchestrator.js`** - Main orchestrator
   - Coordinates all scanner modules
   - Manages scan workflow
   - Handles real-time progress streaming

## Installation

### Required Tools (Auto-installed)

All tools are installed via apt:

```bash
sudo apt update && sudo apt install -y \
  curl wget tshark tcpdump ngrep jq \
  nikto wapiti wpscan \
  clamav clamav-daemon yara \
  rkhunter chkrootkit lynis \
  inotify-tools git pandoc
```

### Manual Installation (if needed)

```bash
# Update ClamAV definitions
sudo freshclam

# Install YARA rules (optional)
sudo mkdir -p /opt/maldef/rules
# Copy your YARA rules to /opt/maldef/rules/
```

## Usage

### Basic Scan

```javascript
const { runComprehensiveScan } = require('./comprehensiveOrchestrator')

const result = await runComprehensiveScan('https://example.com', {
  outRoot: './temp-scans',
  distro: 'kali-linux',
  scanTypes: {
    web: true,
    malware: true,
    defacement: true
  },
  onProgress: (update) => {
    console.log(`[${update.stage}] ${update.message}`)
    // Real-time console output in update.raw
  }
})
```

### Defacement Monitoring

```javascript
const { createBaseline, compareAgainstBaseline } = require('./defacementMonitor')

// Create baseline
await createBaseline('kali-linux', 'https://example.com', './baselines', (update) => {
  console.log(update.message)
})

// Compare against baseline
const comparison = await compareAgainstBaseline(
  'kali-linux',
  'https://example.com',
  './baselines/example.com_baseline.json',
  (update) => {
    console.log(update.message)
  }
)

if (comparison.changed) {
  console.log('⚠️ DEFACEMENT DETECTED!')
}
```

### Individual Scanner Usage

```javascript
const { scanWithNikto, scanWithClamav } = require('./scanners')

// Nikto scan
const niktoResult = await scanWithNikto(
  'kali-linux',
  'https://example.com',
  './output',
  (update) => {
    console.log(update.message) // Real-time output
    console.log(update.raw)      // Raw console output
  }
)

// ClamAV scan
const clamavResult = await scanWithClamav(
  'kali-linux',
  './scanned-files',
  './output',
  (update) => {
    console.log(update.message)
  }
)
```

## Command Examples

All commands are exact and reproducible in WSL terminal:

### Web Scanning

```bash
# Nikto
nikto -h https://example.com -output nikto_report.json -Format json

# Wapiti
wapiti -u https://example.com --format json -o wapiti_report

# WPScan
wpscan --url https://example.com --format json --output wpscan_report.json --no-update
```

### Malware Scanning

```bash
# ClamAV
clamscan -r -i /path/to/scan --log=clamav_scan.log

# YARA
yara -r /opt/maldef/rules/sample_web_malware.yar /path/to/scan

# Update ClamAV definitions
sudo freshclam
```

### Rootkit Scanning

```bash
# RKHunter
rkhunter --check --skip-keypress --report-warnings-only --logfile rkhunter_report.log

# chkrootkit
chkrootkit > chkrootkit_report.log 2>&1
```

### Defacement Detection

```bash
# Generate hash
curl -s https://example.com | sha256sum

# Compare against baseline
curl -s https://example.com | sha256sum -c baseline.hash
```

## Configuration

See `config.example.json` for configuration options:

- Scan types and tool selection
- Scheduling (cron-based)
- Baseline management
- Notification settings
- Report formats

## Real-time Console Output

All scanners use `child_process.spawn()` for real-time streaming:

```javascript
const { spawn } = require('child_process')

const scanner = spawn('wsl.exe', ['-d', 'kali-linux', '--', 'sh', '-lc', 'nikto -h https://example.com'])

scanner.stdout.on('data', (data) => {
  // Live output - streamed to UI
  console.log(data.toString())
})

scanner.stderr.on('data', (data) => {
  // Live error output
  console.error(data.toString())
})
```

## Report Format

Reports are generated in unified JSON format:

```json
{
  "metadata": {
    "target": "https://example.com",
    "timestamp": "2024-01-15T10:30:00Z",
    "scanDuration": 125000,
    "toolsUsed": ["nikto", "wapiti", "clamav", "yara"]
  },
  "summary": {
    "status": "warning",
    "riskScore": 45,
    "severity": "HIGH",
    "totalFindings": 12
  },
  "findings": {
    "web": { "count": 5, "findings": [...] },
    "malware": { "count": 2, "findings": [...] },
    "defacement": { "changed": false }
  },
  "recommendations": [...]
}
```

## Testing

### EICAR Test File

Test malware detection with EICAR test file:

```bash
echo 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.txt
clamscan eicar.txt
```

### Defacement Test

```bash
# Create baseline
curl -s https://example.com | sha256sum > baseline.hash

# Modify content (simulate defacement)
curl -s https://example.com | sed 's/Original/Defaced/' | sha256sum -c baseline.hash
# Should fail with hash mismatch
```

## Troubleshooting

### Tools Not Found

If tools are not found, ensure WSL distribution is correct:

```bash
wsl -l -v  # List available distributions
```

### Permission Issues

Some tools require sudo. The system handles this automatically, but you may need to configure password-less sudo or provide password via IPC.

### ClamAV Update Fails

```bash
sudo freshclam
# If fails, check internet connection and ClamAV mirrors
```

## License

See LICENSE file in project root.

