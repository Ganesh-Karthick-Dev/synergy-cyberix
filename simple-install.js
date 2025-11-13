#!/usr/bin/env node
// Simplified installer that works without complex dependencies

const { exec } = require('child_process');
const os = require('os');
const util = require('util');

const execAsync = util.promisify(exec);
const isWindows = os.platform() === 'win32';

// Basic tools that can be installed via winget
const BASIC_TOOLS = [
  { name: 'git', id: 'Git.Git' },
  { name: 'curl', id: 'cURL.cURL' },
  { name: 'wget', id: 'GNU.Wget' },
  { name: 'jq', id: 'stedolan.jq' },
  { name: '7zip', id: '7zip.7zip' },
  { name: 'nmap', id: 'InsecureCompatible.Nmap' },
  { name: 'go', id: 'GoLang.Go' },
  { name: 'openssl', id: 'ShiningLight.OpenSSL' }
];

async function checkTool(toolName) {
  try {
    if (isWindows) {
      const { stdout } = await execAsync(`where ${toolName}`);
      return stdout.trim().length > 0;
    } else {
      const { stdout } = await execAsync(`which ${toolName}`);
      return stdout.trim().length > 0;
    }
  } catch (e) {
    return false;
  }
}

async function installTool(tool) {
  console.log(`🔧 Installing ${tool.name}...`);
  
  // Check if already installed
  const exists = await checkTool(tool.name);
  if (exists) {
    console.log(`✅ ${tool.name} is already installed`);
    return true;
  }
  
  if (!isWindows) {
    console.log(`❌ ${tool.name} installation not supported on this platform`);
    return false;
  }
  
  try {
    const cmd = `winget install --id ${tool.id} -e --source winget --accept-package-agreements --accept-source-agreements`;
    console.log(`  Running: ${cmd}`);
    
    const { stdout, stderr } = await execAsync(cmd);
    if (stderr && !stderr.includes('already installed')) {
      console.log(`  ⚠️  Warning: ${stderr}`);
    }
    
    console.log(`  ✅ ${tool.name} installation completed`);
    return true;
  } catch (error) {
    console.log(`  ❌ Failed to install ${tool.name}: ${error.message}`);
    return false;
  }
}

async function setupWSL() {
  console.log('\n🐧 Setting up WSL for security tools...');
  
  try {
    // Check if WSL is available
    await execAsync('wsl --status');
    console.log('✅ WSL is available');
    
    // Check if Kali Linux is installed
    try {
      await execAsync('wsl -d kali-linux echo "kali-test"');
      console.log('✅ Kali Linux is available');
      return true;
    } catch (e) {
      console.log('❌ Kali Linux not found. Installing...');
      try {
        await execAsync('wsl --install -d kali-linux');
        console.log('✅ Kali Linux installation initiated');
        return true;
      } catch (installError) {
        console.log(`❌ Kali Linux installation failed: ${installError.message}`);
        return false;
      }
    }
  } catch (e) {
    console.log('❌ WSL not available. Installing WSL...');
    try {
      await execAsync('wsl --install');
      console.log('✅ WSL installation initiated. Please restart your computer.');
      return false;
    } catch (installError) {
      console.log(`❌ WSL installation failed: ${installError.message}`);
      return false;
    }
  }
}

async function installSecurityTools() {
  console.log('\n🔒 Installing security tools in WSL Kali Linux...');
  
  const commands = [
    'wsl -d kali-linux sudo apt update',
    'wsl -d kali-linux sudo apt install -y nikto sqlmap hydra gobuster dirb',
    'wsl -d kali-linux sudo apt install -y theharvester amass john medusa',
    'wsl -d kali-linux sudo apt install -y metasploit-framework zaproxy mitmproxy',
    'wsl -d kali-linux sudo apt install -y socat netcat-openbsd fail2ban'
  ];
  
  for (const cmd of commands) {
    console.log(`  Running: ${cmd}`);
    try {
      const { stdout, stderr } = await execAsync(cmd);
      if (stderr && !stderr.includes('already installed')) {
        console.log(`  ⚠️  Warning: ${stderr}`);
      }
      console.log(`  ✅ Success`);
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log('🚀 Cyberix Simple Tool Installer');
  console.log('=================================');
  console.log(`📁 Current directory: ${process.cwd()}`);
  console.log(`🖥️  Platform: ${os.platform()}`);
  
  if (!isWindows) {
    console.log('❌ This installer is designed for Windows');
    process.exit(1);
  }
  
  console.log('\n📋 Installing basic tools...');
  let successCount = 0;
  
  for (const tool of BASIC_TOOLS) {
    const success = await installTool(tool);
    if (success) successCount++;
  }
  
  console.log(`\n📊 Basic tools: ${successCount}/${BASIC_TOOLS.length} installed successfully`);
  
  // Setup WSL and security tools
  const wslReady = await setupWSL();
  if (wslReady) {
    await installSecurityTools();
  }
  
  console.log('\n🎉 Installation complete!');
  console.log('Please restart your terminal and run the Cyberix application.');
}

// Run the installer
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  console.error('\n💡 Troubleshooting tips:');
  console.error('• Make sure you have Node.js installed');
  console.error('• Try running as administrator');
  console.error('• Check if winget is available: winget --version');
  process.exit(1);
});
