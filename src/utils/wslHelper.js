const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Detect the actual WSL distribution name
let WSL_DISTRO = 'Ubuntu'; // Default fallback (changed from kali-linux)
let detectedDistro = null;

async function detectWSLDistro() {
  if (detectedDistro) return detectedDistro;
  
  try {
    // Get list of installed distributions - use full path for production compatibility
    const { stdout } = await execPromise('C:\\Windows\\System32\\wsl.exe -l -v');
    const lines = stdout.split('\n').filter(line => line.trim());
    
    // First, look for Ubuntu (preferred)
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('ubuntu')) {
        // Extract the distribution name (first word, usually)
        const distroName = line.trim().split(/\s+/)[0];
        detectedDistro = distroName;
        console.log(`[WSL Helper] Detected Ubuntu distribution: ${distroName}`);
        return distroName;
      }
    }
    
    // If no Ubuntu found, look for Kali Linux
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('kali')) {
        const distroName = line.trim().split(/\s+/)[0];
        detectedDistro = distroName;
        console.log(`[WSL Helper] Detected Kali distribution: ${distroName}`);
        return distroName;
      }
    }
    
    // If neither found, try to get default distribution
    try {
      const { stdout: defaultOut } = await execPromise('C:\\Windows\\System32\\wsl.exe -l --default');
      const defaultDistro = defaultOut.trim().split('\n')[1]?.trim().split(/\s+/)[0];
      if (defaultDistro) {
        detectedDistro = defaultDistro;
        console.log(`[WSL Helper] Using default distribution: ${defaultDistro}`);
        return defaultDistro;
      }
    } catch (e) {
      console.log('[WSL Helper] Could not get default distribution');
    }
    
    // Fallback to ubuntu (changed from kali-linux)
    detectedDistro = 'Ubuntu';
    console.log(`[WSL Helper] Using fallback distribution: Ubuntu`);
    return 'Ubuntu';
  } catch (error) {
    console.log(`[WSL Helper] Error detecting distribution: ${error.message}`);
    detectedDistro = 'Ubuntu';
    return 'Ubuntu';
  }
}

// Initialize on module load
detectWSLDistro().then(distro => {
  WSL_DISTRO = distro;
});

function escapeDoubleQuotes(s) {
  return (s || '').replace(/"/g, '\\"');
}

async function runWSLAsRoot(command) {
  const distro = await detectWSLDistro();
  const escaped = escapeDoubleQuotes(command);
  // Use full path to wsl.exe for production compatibility
  const full = `C:\\Windows\\System32\\wsl.exe -d ${distro} -u root bash -lc "${escaped}"`;
  try {
    const { stdout, stderr } = await execPromise(full, { maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function runWSL(command) {
  const distro = await detectWSLDistro();
  const escaped = escapeDoubleQuotes(command);
  // Use full path to wsl.exe for production compatibility
  const full = `C:\\Windows\\System32\\wsl.exe -d ${distro} bash -lc "${escaped}"`;
  try {
    const { stdout, stderr } = await execPromise(full, { maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

// Run raw command directly in WSL without bash -c wrapper
async function runWSLRaw(command) {
  const distro = await detectWSLDistro();
  // Command is passed directly to WSL without bash -c wrapping
  // Use full path to wsl.exe for production compatibility
  const full = `C:\\Windows\\System32\\wsl.exe -d ${distro} ${command}`;
  try {
    const { stdout, stderr } = await execPromise(full, { maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function checkWSL() {
  try {
    // Use full path to wsl.exe for production compatibility
    const { stdout } = await execPromise('C:\\Windows\\System32\\wsl.exe -l -v');
    const out = (stdout || '').toLowerCase();
    return out.includes('kali') || out.includes('ubuntu');
  } catch {
    return false;
  }
}

async function checkTool(toolName) {
  // Use root user for consistency with QuickCheckScreen and SettingsPanel
  // Tools are installed system-wide, so checking as root ensures we find them
  const res = await runWSLAsRoot(`command -v ${toolName} >/dev/null 2>&1 && echo installed || echo missing`);
  return !!(res.success && res.stdout.trim() === 'installed');
}

async function getToolVersion(toolName) {
  // Use root user for consistency
  const cmds = [`${toolName} --version`, `${toolName} -v`, `${toolName} -V`];
  for (const cmd of cmds) {
    const r = await runWSLAsRoot(`${cmd} 2>/dev/null`);
    if (r.success && r.stdout) return r.stdout.split('\n')[0];
  }
  return 'unknown';
}

// Get the detected distribution name
async function getWSLDistro() {
  return await detectWSLDistro();
}

// Set a distribution as the default
async function setDefaultDistro(distroName) {
  try {
    // Use full path to wsl.exe for production compatibility
    await execPromise(`C:\\Windows\\System32\\wsl.exe --set-default ${distroName}`);
    // Reset detected distro so it will be re-detected
    detectedDistro = null;
    WSL_DISTRO = distroName;
    console.log(`[WSL Helper] Set default distribution to: ${distroName}`);
    return { success: true, message: `Default distribution set to ${distroName}` };
  } catch (error) {
    console.log(`[WSL Helper] Error setting default distribution: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Get list of all installed distributions
async function listDistributions() {
  try {
    // Use full path to wsl.exe for production compatibility
    const { stdout } = await execPromise('C:\\Windows\\System32\\wsl.exe -l -v');
    const lines = stdout.split('\n').filter(line => line.trim());
    const distributions = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) {
        const parts = line.split(/\s+/);
        const name = parts[0];
        if (name && name !== 'NAME') {
          distributions.push({
            name: name,
            state: parts[1] || 'Unknown',
            version: parts[2] || 'Unknown'
          });
        }
      }
    }
    
    return { success: true, distributions };
  } catch (error) {
    console.log(`[WSL Helper] Error listing distributions: ${error.message}`);
    return { success: false, error: error.message, distributions: [] };
  }
}

module.exports = {
  WSL_DISTRO,
  getWSLDistro,
  detectWSLDistro,
  setDefaultDistro,
  listDistributions,
  runWSLAsRoot,
  runWSL,
  runWSLRaw,
  checkWSL,
  checkTool,
  getToolVersion
};


