# Cyberix Desktop Security Suite

Electron + React app for scanning and monitoring.

## Malware & Defacement Monitor (Prototype)

This module crawls pages with a headless browser (Puppeteer), captures artifacts (rendered HTML, screenshots, network logs), computes SHA-256 hashes, and optionally runs YARA/ClamAV inside WSL. It maintains a baseline of page hashes to detect defacement via hash changes and displays a simple diff list in the UI.

Key files:
- `src/maldef/pwScanner.js`: Puppeteer crawler and artifact capture
- `src/maldef/orchestrator.js`: Orchestrates crawl + WSL scans + baseline compare
- `src/maldef/wslRunner.js`: Thin wrapper to run commands in WSL
- `src/maldef/baselineManager.js`: Load/save baseline and compare
- `src/maldef/wsl-setup.sh`: Installs YARA/ClamAV and a sample YARA rule in WSL
- `src/components/MalwareDefacementMonitor.jsx`: UI to start scans and view logs
- `src/components/DiffViewer.jsx`: Displays baseline comparison results

### WSL Setup (Ubuntu/Kali)

1. Open WSL terminal
2. Run: `sudo bash /mnt/<drive>/path/to/repo/src/maldef/wsl-setup.sh`
3. Ensure `yara` and `clamscan` are available

Security: do not hardcode API keys; store secrets securely and prompt users for permission before scans.
