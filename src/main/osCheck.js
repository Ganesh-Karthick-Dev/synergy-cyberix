const os = require('os');
const { spawn } = require('child_process');
const fs = require('fs');

function detectPlatform() {
  const platform = os.platform();
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

// Enhanced platform detection for Kali Linux
async function detectKaliEnvironment() {
  const platform = os.platform();

  if (platform === 'win32') {
    // Check if WSL is available and Kali is installed
    try {
      const wslCheck = spawn('wsl', ['-l', '-v'], { shell: true });
      let output = '';
      wslCheck.stdout.on('data', (d) => output += d.toString());
      wslCheck.stderr.on('data', (d) => output += d.toString());

      return new Promise((resolve) => {
        wslCheck.on('close', (code) => {
          if (code === 0 && output.toLowerCase().includes('kali')) {
            resolve({ type: 'wsl-kali', distro: 'kali-linux' });
          } else {
            resolve({ type: 'windows', distro: null });
          }
        });
        wslCheck.on('error', () => resolve({ type: 'windows', distro: null }));
      });
    } catch (e) {
      return { type: 'windows', distro: null };
    }
  } else if (platform === 'linux') {
    // Check if we're on native Kali Linux
    try {
      // Check for Kali-specific files and commands
      const kaliIndicators = [
        '/etc/os-release',
        '/usr/bin/nmap',
        '/usr/bin/nikto'
      ];

      let isKali = false;

      // Check os-release file
      if (fs.existsSync('/etc/os-release')) {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        if (osRelease.toLowerCase().includes('kali')) {
          isKali = true;
        }
      }

      // Check for Kali tools
      const kaliTools = ['nmap', 'nikto', 'sqlmap', 'hydra'];
      let kaliToolsCount = 0;
      for (const tool of kaliTools) {
        try {
          const toolCheck = spawn('which', [tool], { shell: true });
          await new Promise((resolve) => {
            toolCheck.on('close', (code) => {
              if (code === 0) kaliToolsCount++;
              resolve();
            });
          });
        } catch (e) {
          // Tool not found, continue
        }
      }

      if (isKali || kaliToolsCount >= 3) {
        return { type: 'native-kali', distro: null };
      } else {
        return { type: 'linux', distro: null };
      }
    } catch (e) {
      return { type: 'linux', distro: null };
    }
  } else {
    return { type: platform, distro: null };
  }
}

async function checkWslInstalled() {
  // Only relevant on Windows; treat as installed elsewhere
  if (os.platform() !== 'win32') return true;

  // 1) Try modern status API
  const tryStatus = () => new Promise((resolve) => {
    const proc = spawn('wsl', ['--status'], { shell: true });
    let output = '';
    proc.stdout.on('data', (d) => (output += d.toString()))
    proc.stderr.on('data', (d) => (output += d.toString()))
    proc.on('error', () => resolve(undefined));
    proc.on('close', (code) => {
      if (code === 0) return resolve(true);
      // If command exists but reports missing/disabled
      if (/not\s+installed|not\s+enabled|no\s+distribution/i.test(output)) return resolve(false);
      resolve(undefined);
    });
  });

  // 2) Fallback: list distributions (works on older builds)
  const tryList = () => new Promise((resolve) => {
    const proc = spawn('wsl', ['-l', '-v'], { shell: true });
    let output = '';
    proc.stdout.on('data', (d) => (output += d.toString()))
    proc.stderr.on('data', (d) => (output += d.toString()))
    proc.on('error', () => resolve(undefined));
    proc.on('close', (code) => {
      if (code === 0) {
        // Header usually contains NAME STATE VERSION; empty list still means WSL feature is present
        return resolve(true);
      }
      if (/no\s+installed\s+distributions/i.test(output)) return resolve(true);
      resolve(undefined);
    });
  });

  // 3) Last resort: check optional Windows features
  const tryFeatures = () => new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      "(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State, (Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform).State | Out-String"
    ], { shell: true });
    let output = '';
    ps.stdout.on('data', (d) => (output += d.toString()));
    ps.stderr.on('data', (d) => (output += d.toString()));
    ps.on('error', () => resolve(undefined));
    ps.on('close', () => {
      const states = output.toLowerCase();
      if (states.includes('enabled')) return resolve(true);
      resolve(false);
    });
  });

  const s = await tryStatus();
  if (typeof s === 'boolean') return s;
  const l = await tryList();
  if (typeof l === 'boolean') return l;
  const f = await tryFeatures();
  if (typeof f === 'boolean') return f;
  return false;
}

function installWsl(onLog, onDone) {
  // On Windows, prefer elevated install. We cannot stream elevated output reliably.
  if (os.platform() === 'win32') {
    // Attempt elevated install first (UAC prompt). This won't stream logs.
    const elevated = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      "Start-Process -Verb RunAs powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -Command \"wsl --install\"' -Wait"
    ], { shell: true });

    elevated.on('error', (err) => {
      onLog('Elevation failed, attempting non-elevated install...\n' + String(err));
      // Fallback to non-elevated streaming (may fail without admin)
      const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', 'wsl --install'], { shell: true });
      proc.stdout.on('data', (d) => onLog(d.toString()));
      proc.stderr.on('data', (d) => onLog(d.toString()));
      proc.on('close', (code) => onDone(code === 0));
    });

    elevated.on('close', (code) => {
      if (code === 0) {
        onLog('WSL installation finished (elevated). You may need to restart.');
        onDone(true);
      } else {
        onLog('Elevated install did not complete successfully (code ' + code + '). Trying non-elevated...');
        const proc = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', 'wsl --install'], { shell: true });
        proc.stdout.on('data', (d) => onLog(d.toString()));
        proc.stderr.on('data', (d) => onLog(d.toString()));
        proc.on('close', (c2) => onDone(c2 === 0));
      }
    });
    return;
  }

  // Non-Windows: nothing to do
  onDone(true);
}

module.exports = {
  detectPlatform,
  detectKaliEnvironment,
  checkWslInstalled,
  installWsl
};


