const { runWSLAsRoot, checkTool, getToolVersion } = require('../utils/wslHelper');

const REQUIRED_TOOLS = [
  { name: 'curl', package: 'curl' },
  { name: 'wget', package: 'wget' },
  { name: 'unzip', package: 'unzip' },
  { name: 'git', package: 'git' },
  { name: 'pip3', package: 'python3-pip' },
  { name: 'jq', package: 'jq' },
  { name: 'nmap', package: 'nmap' },
  { name: 'hydra', package: 'hydra' },
  { name: 'gobuster', package: 'gobuster' },
  { name: 'dirb', package: 'dirb' },
  { name: 'amass', package: 'amass' },
  { name: 'john', package: 'john' },
  { name: 'medusa', package: 'medusa' },
  { name: 'mitmproxy', package: 'mitmproxy' },
  { name: 'socat', package: 'socat' },
  { name: 'fail2ban', package: 'fail2ban' },
  { name: 'ffuf', package: 'ffuf' },
  { name: 'nuclei', package: 'nuclei' },
  { name: 'dalfox', package: 'dalfox' },
  { name: 'go', package: 'golang-go' },
  { name: 'dnstwist', package: 'dnstwist' },
  // API Scanning tools (Wireshark-based)
  { name: 'tshark', package: 'tshark' },
  { name: 'wfuzz', package: 'wfuzz' },
  { name: 'geoiplookup', package: 'geoip-bin' }
];

// API-specific tools list (Wireshark-based approach)
const API_SCANNING_TOOLS = [
  'tshark'
];

async function checkAllTools(progress) {
  const status = {};
  for (let i = 0; i < REQUIRED_TOOLS.length; i += 1) {
    const tool = REQUIRED_TOOLS[i];
    progress?.({ phase: 'checking', current: i + 1, total: REQUIRED_TOOLS.length, tool: tool.name, message: `Checking ${tool.name}...` });
    status[tool.name] = await checkTool(tool.name);
  }
  return status;
}

async function installTool(tool, progress) {
  const { name, package: pkg } = tool;
  progress?.({ tool: name, progress: 10, message: 'Updating package lists...' });
  const upd = await runWSLAsRoot('DEBIAN_FRONTEND=noninteractive apt-get update -qq');
  if (!upd.success) throw new Error(upd.stderr || upd.error || 'apt-get update failed');

  progress?.({ tool: name, progress: 30, message: `Installing ${name}...` });
  const inst = await runWSLAsRoot(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkg}`, 15 * 60 * 1000);
  if (!inst.success) throw new Error(inst.stderr || inst.error || 'install failed');

  progress?.({ tool: name, progress: 80, message: `Verifying ${name}...` });
  const ok = await checkTool(name);
  if (!ok) throw new Error(`${name} not found after installation`);

  const version = await getToolVersion(name);
  progress?.({ tool: name, progress: 100, message: `✓ ${name} installed`, version });
  return { success: true, version };
}

async function installAllTools(progress) {
  const status = await checkAllTools(progress);
  const missing = REQUIRED_TOOLS.filter(t => !status[t.name]);
  if (missing.length === 0) {
    progress?.({ phase: 'complete', message: 'All tools already installed', overallProgress: 100 });
    return { success: true, results: [] };
  }

  const results = [];
  for (let i = 0; i < missing.length; i += 1) {
    const t = missing[i];
    progress?.({ phase: 'installing', current: i + 1, total: missing.length, tool: t.name, overallProgress: Math.round((i / missing.length) * 100) });
    try {
      const r = await installTool(t, progress);
      results.push({ tool: t.name, ...r });
    } catch (e) {
      results.push({ tool: t.name, success: false, error: e?.message || String(e) });
    }
  }

  progress?.({ phase: 'complete', message: 'Installation complete', overallProgress: 100 });
  return { success: results.every(r => r.success), results };
}

module.exports = { 
  REQUIRED_TOOLS, 
  API_SCANNING_TOOLS,
  checkAllTools, 
  installTool, 
  installAllTools 
};


