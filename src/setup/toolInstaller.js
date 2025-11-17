const { runWSLAsRoot, checkTool, getToolVersion } = require('../utils/wslHelper');

const REQUIRED_TOOLS = [
  { name: 'curl', package: 'curl' },
  { name: 'wget', package: 'wget' },
  { name: 'unzip', package: 'unzip' },
  { name: 'git', package: 'git' },
  { name: 'pip3', package: 'python3-pip' },
  { name: 'jq', package: 'jq' },
  { name: 'nmap', package: 'nmap' },
  { name: 'nikto', package: 'nikto' },
  { name: 'sqlmap', package: 'sqlmap' },
  { name: 'hydra', package: 'hydra' },
  { name: 'gobuster', package: 'gobuster' },
  { name: 'dirb', package: 'dirb' },
  { name: 'amass', package: 'amass' },
  { name: 'john', package: 'john' },
  { name: 'medusa', package: 'medusa' },
  { name: 'mitmproxy', package: 'mitmproxy' },
  { name: 'socat', package: 'socat' },
  { name: 'fail2ban', package: 'fail2ban' },
  { name: 'wapiti', package: 'wapiti' },
  { name: 'whatweb', package: 'whatweb' },
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
  console.log('🔍 [TOOL-CHECKER] ===== STARTING TOOL CHECK =====');
  console.log(`🔍 [TOOL-CHECKER] Checking ${REQUIRED_TOOLS.length + 1} tools (${REQUIRED_TOOLS.length} apt tools + tgpt)`);
  
  const status = {};
  const installedTools = [];
  const missingTools = [];
  
  for (let i = 0; i < REQUIRED_TOOLS.length; i += 1) {
    const tool = REQUIRED_TOOLS[i];
    progress?.({ phase: 'checking', current: i + 1, total: REQUIRED_TOOLS.length + 1, tool: tool.name, message: `Checking ${tool.name}...` });
    
    console.log(`🔍 [TOOL-CHECKER] [${i + 1}/${REQUIRED_TOOLS.length}] Checking: ${tool.name} (package: ${tool.package})`);
    const isInstalled = await checkTool(tool.name);
    status[tool.name] = isInstalled;
    
    if (isInstalled) {
      installedTools.push(tool.name);
      console.log(`✅ [TOOL-CHECKER] ${tool.name} is INSTALLED`);
    } else {
      missingTools.push(tool.name);
      console.log(`❌ [TOOL-CHECKER] ${tool.name} is MISSING (package: ${tool.package})`);
    }
  }
  
  // Also check tgpt (installed via curl script, not apt)
  progress?.({ phase: 'checking', current: REQUIRED_TOOLS.length + 1, total: REQUIRED_TOOLS.length + 1, tool: 'tgpt', message: 'Checking tgpt...' });
  console.log(`🔍 [TOOL-CHECKER] [${REQUIRED_TOOLS.length + 1}/${REQUIRED_TOOLS.length + 1}] Checking: tgpt (installed via curl script)`);
  const tgptInstalled = await checkTool('tgpt');
  status.tgpt = tgptInstalled;
  
  if (tgptInstalled) {
    installedTools.push('tgpt');
    console.log(`✅ [TOOL-CHECKER] tgpt is INSTALLED`);
  } else {
    missingTools.push('tgpt');
    console.log(`❌ [TOOL-CHECKER] tgpt is MISSING`);
  }
  
  // Summary log
  console.log('🔍 [TOOL-CHECKER] ===== TOOL CHECK SUMMARY =====');
  console.log(`✅ [TOOL-CHECKER] Installed tools (${installedTools.length}):`, installedTools.join(', '));
  console.log(`❌ [TOOL-CHECKER] Missing tools (${missingTools.length}):`, missingTools.join(', '));
  console.log(`📊 [TOOL-CHECKER] Total: ${REQUIRED_TOOLS.length + 1} | Installed: ${installedTools.length} | Missing: ${missingTools.length}`);
  console.log('🔍 [TOOL-CHECKER] ===== TOOL CHECK COMPLETE =====');
  
  return status;
}

async function installTool(tool, progress) {
  const { name, package: pkg } = tool;
  
  console.log(`📦 [TOOL-INSTALLER] ===== INSTALLING ${name.toUpperCase()} =====`);
  console.log(`📦 [TOOL-INSTALLER] Tool: ${name}`);
  console.log(`📦 [TOOL-INSTALLER] Package: ${pkg}`);
  
  // Step 1: Update package lists
  progress?.({ tool: name, progress: 10, message: 'Updating package lists...' });
  const updateCommand = 'DEBIAN_FRONTEND=noninteractive apt-get update -qq';
  console.log(`📦 [TOOL-INSTALLER] [STEP 1/4] Updating package lists...`);
  console.log(`💻 [TOOL-INSTALLER] [COMMAND] ${updateCommand}`);
  
  const upd = await runWSLAsRoot(updateCommand);
  console.log(`📦 [TOOL-INSTALLER] [STEP 1/4] Update result:`, {
    success: upd.success,
    stdout: upd.stdout ? upd.stdout.substring(0, 200) : '(empty)',
    stderr: upd.stderr ? upd.stderr.substring(0, 200) : '(empty)',
    error: upd.error || '(none)'
  });
  
  if (!upd.success) {
    console.error(`❌ [TOOL-INSTALLER] [STEP 1/4] Update FAILED for ${name}`);
    console.error(`❌ [TOOL-INSTALLER] Error:`, upd.error || upd.stderr);
    throw new Error(upd.stderr || upd.error || 'apt-get update failed');
  }
  console.log(`✅ [TOOL-INSTALLER] [STEP 1/4] Package lists updated successfully`);

  // Step 2: Install the package
  progress?.({ tool: name, progress: 30, message: `Installing ${name}...` });
  const installCommand = `DEBIAN_FRONTEND=noninteractive apt-get install -y ${pkg}`;
  console.log(`📦 [TOOL-INSTALLER] [STEP 2/4] Installing ${name} (package: ${pkg})...`);
  console.log(`💻 [TOOL-INSTALLER] [COMMAND] ${installCommand}`);
  console.log(`⏱️  [TOOL-INSTALLER] [TIMEOUT] 15 minutes`);
  
  const inst = await runWSLAsRoot(installCommand, 15 * 60 * 1000);
  console.log(`📦 [TOOL-INSTALLER] [STEP 2/4] Install result:`, {
    success: inst.success,
    stdoutLength: inst.stdout ? inst.stdout.length : 0,
    stderrLength: inst.stderr ? inst.stderr.length : 0,
    error: inst.error || '(none)',
    stdoutPreview: inst.stdout ? inst.stdout.substring(0, 500) : '(empty)',
    stderrPreview: inst.stderr ? inst.stderr.substring(0, 500) : '(empty)'
  });
  
  if (!inst.success) {
    console.error(`❌ [TOOL-INSTALLER] [STEP 2/4] Installation FAILED for ${name}`);
    console.error(`❌ [TOOL-INSTALLER] Full stderr:`, inst.stderr);
    console.error(`❌ [TOOL-INSTALLER] Full error:`, inst.error);
    throw new Error(inst.stderr || inst.error || 'install failed');
  }
  console.log(`✅ [TOOL-INSTALLER] [STEP 2/4] Installation command completed`);

  // Step 3: Verify installation
  progress?.({ tool: name, progress: 80, message: `Verifying ${name}...` });
  console.log(`📦 [TOOL-INSTALLER] [STEP 3/4] Verifying ${name} installation...`);
  console.log(`💻 [TOOL-INSTALLER] [COMMAND] command -v ${name}`);
  
  const ok = await checkTool(name);
  console.log(`📦 [TOOL-INSTALLER] [STEP 3/4] Verification result:`, {
    tool: name,
    installed: ok
  });
  
  if (!ok) {
    console.error(`❌ [TOOL-INSTALLER] [STEP 3/4] Verification FAILED - ${name} not found after installation`);
    console.error(`❌ [TOOL-INSTALLER] This means the installation command succeeded but the tool is not in PATH`);
    throw new Error(`${name} not found after installation`);
  }
  console.log(`✅ [TOOL-INSTALLER] [STEP 3/4] Verification PASSED - ${name} is now available`);

  // Step 4: Get version
  console.log(`📦 [TOOL-INSTALLER] [STEP 4/4] Getting ${name} version...`);
  const version = await getToolVersion(name);
  console.log(`📦 [TOOL-INSTALLER] [STEP 4/4] Version:`, version);
  
  progress?.({ tool: name, progress: 100, message: `✓ ${name} installed`, version });
  
  console.log(`✅ [TOOL-INSTALLER] ===== ${name.toUpperCase()} INSTALLATION COMPLETE =====`);
  console.log(`✅ [TOOL-INSTALLER] Tool: ${name} | Package: ${pkg} | Version: ${version}`);
  
  return { success: true, version };
}

async function installAllTools(progress) {
  console.log('🚀 [TOOL-INSTALLER] ===== STARTING INSTALL ALL TOOLS =====');
  
  // Step 1: Check all tools
  console.log('🚀 [TOOL-INSTALLER] [STEP 1] Checking all tools...');
  const status = await checkAllTools(progress);
  
  // Step 2: Identify missing tools
  const missing = REQUIRED_TOOLS.filter(t => !status[t.name]);
  const missingTgpt = !status.tgpt;
  
  console.log('🚀 [TOOL-INSTALLER] [STEP 2] Analyzing missing tools...');
  console.log(`📊 [TOOL-INSTALLER] Total tools: ${REQUIRED_TOOLS.length + 1}`);
  console.log(`📊 [TOOL-INSTALLER] Missing apt tools: ${missing.length}`);
  console.log(`📊 [TOOL-INSTALLER] Missing tgpt: ${missingTgpt ? 'Yes' : 'No'}`);
  
  if (missing.length === 0 && !missingTgpt) {
    console.log('✅ [TOOL-INSTALLER] All tools are already installed!');
    progress?.({ phase: 'complete', message: 'All tools already installed', overallProgress: 100 });
    return { success: true, results: [] };
  }

  console.log(`🚀 [TOOL-INSTALLER] [STEP 3] Installing ${missing.length} missing tool(s)...`);
  if (missing.length > 0) {
    console.log(`📋 [TOOL-INSTALLER] Tools to install:`, missing.map(t => `${t.name} (${t.package})`).join(', '));
  }

  const results = [];
  for (let i = 0; i < missing.length; i += 1) {
    const t = missing[i];
    console.log(`\n🚀 [TOOL-INSTALLER] [${i + 1}/${missing.length}] Starting installation of ${t.name}...`);
    progress?.({ phase: 'installing', current: i + 1, total: missing.length, tool: t.name, overallProgress: Math.round((i / missing.length) * 100) });
    
    try {
      const r = await installTool(t, progress);
      results.push({ tool: t.name, ...r });
      console.log(`✅ [TOOL-INSTALLER] [${i + 1}/${missing.length}] ${t.name} installed successfully`);
    } catch (e) {
      console.error(`❌ [TOOL-INSTALLER] [${i + 1}/${missing.length}] ${t.name} installation FAILED`);
      console.error(`❌ [TOOL-INSTALLER] Error:`, e.message);
      results.push({ tool: t.name, success: false, error: e?.message || String(e) });
    }
  }

  // Step 4: Verify all installations
  console.log('\n🚀 [TOOL-INSTALLER] [STEP 4] Verifying all installations...');
  const verifyStatus = await checkAllTools(progress);
  const stillMissing = REQUIRED_TOOLS.filter(t => !verifyStatus[t.name]);
  const stillMissingTgpt = !verifyStatus.tgpt;
  
  console.log('🚀 [TOOL-INSTALLER] ===== INSTALLATION VERIFICATION =====');
  if (stillMissing.length === 0 && !stillMissingTgpt) {
    console.log('✅ [TOOL-INSTALLER] All tools verified and installed successfully!');
  } else {
    console.log(`⚠️  [TOOL-INSTALLER] Some tools still missing after installation:`);
    if (stillMissing.length > 0) {
      console.log(`❌ [TOOL-INSTALLER] Missing apt tools:`, stillMissing.map(t => t.name).join(', '));
    }
    if (stillMissingTgpt) {
      console.log(`❌ [TOOL-INSTALLER] tgpt is still missing`);
    }
  }
  
  // Final summary
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log('🚀 [TOOL-INSTALLER] ===== INSTALLATION SUMMARY =====');
  console.log(`📊 [TOOL-INSTALLER] Attempted: ${missing.length} tools`);
  console.log(`✅ [TOOL-INSTALLER] Successful: ${successCount} tools`);
  console.log(`❌ [TOOL-INSTALLER] Failed: ${failCount} tools`);
  console.log(`📊 [TOOL-INSTALLER] Final status: ${stillMissing.length === 0 && !stillMissingTgpt ? 'ALL INSTALLED' : 'SOME MISSING'}`);
  console.log('🚀 [TOOL-INSTALLER] ===== INSTALL ALL TOOLS COMPLETE =====\n');

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


