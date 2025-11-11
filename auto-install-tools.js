#!/usr/bin/env node
// Auto-installer for all Cyberix security tools
// This script will automatically install all required tools on Windows

const { execa } = require('execa');
const os = require('os');
const path = require('path');

// Add error handling for missing dependencies
if (!execa) {
  console.error('❌ Error: execa module not found. Please run: npm install');
  process.exit(1);
}

const isWindows = os.platform() === 'win32';

// Tool definitions with multiple installation methods
const TOOLS = [
  // Basic tools - try multiple methods
  {
    name: 'git',
    methods: [
      { type: 'winget', cmd: 'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install git -y' },
      { type: 'manual', url: 'https://git-scm.com/download/win', description: 'Download from git-scm.com' }
    ]
  },
  {
    name: 'curl',
    methods: [
      { type: 'winget', cmd: 'winget install --id cURL.cURL -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install curl -y' }
    ]
  },
  {
    name: 'wget',
    methods: [
      { type: 'winget', cmd: 'winget install --id GNU.Wget -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install wget -y' }
    ]
  },
  {
    name: 'jq',
    methods: [
      { type: 'winget', cmd: 'winget install --id stedolan.jq -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install jq -y' },
      { type: 'manual', url: 'https://stedolan.github.io/jq/download/', description: 'Download from stedolan.github.io' }
    ]
  },
  {
    name: 'unzip',
    methods: [
      { type: 'winget', cmd: 'winget install --id 7zip.7zip -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install 7zip -y' }
    ]
  },
  {
    name: 'nmap',
    methods: [
      { type: 'winget', cmd: 'winget install --id InsecureCompatible.Nmap -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install nmap -y' },
      { type: 'manual', url: 'https://nmap.org/download.html', description: 'Download from nmap.org' }
    ]
  },
  {
    name: 'go',
    methods: [
      { type: 'winget', cmd: 'winget install --id GoLang.Go -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install golang -y' },
      { type: 'manual', url: 'https://golang.org/dl/', description: 'Download from golang.org' }
    ]
  },
  {
    name: 'openssl',
    methods: [
      { type: 'winget', cmd: 'winget install --id ShiningLight.OpenSSL -e --source winget --accept-package-agreements --accept-source-agreements' },
      { type: 'choco', cmd: 'choco install openssl -y' }
    ]
  },
  {
    name: 'tgpt',
    methods: [
      { type: 'pip', cmd: 'pip install tgpt' },
      { type: 'pip3', cmd: 'pip3 install tgpt' },
      { type: 'python', cmd: 'python -m pip install tgpt' },
      { type: 'python3', cmd: 'python3 -m pip install tgpt' }
    ]
  }
];

// Security tools that require WSL/Kali
const SECURITY_TOOLS = [
  'nikto', 'sqlmap', 'hydra', 'gobuster', 'dirb', 'theHarvester', 
  'amass', 'john', 'medusa', 'metasploit-framework', 'zaproxy', 
  'mitmproxy', 'socat', 'netcat', 'fail2ban', 'ffuf', 'nuclei', 'dalfox', 
  'whatweb', 'nmap'
];

async function runCommand(cmd, useWsl = false) {
  try {
    let finalCmd = cmd;
    if (useWsl) {
      finalCmd = `wsl -d kali-linux ${cmd}`;
    }
    
    const parts = finalCmd.split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    
    const result = await execa(command, args, { shell: true, timeout: 300000 }); // 5 minute timeout
    return { success: true, output: result.stdout, error: null };
  } catch (error) {
    return { success: false, output: null, error: error.message };
  }
}

async function checkToolExists(toolName) {
  try {
    // Special handling for Python packages
    if (toolName === 'tgpt') {
      try {
        // Check if tgpt is available as a Python module
        const result = await execa('python', ['-m', 'tgpt', '--version'], { shell: true, timeout: 5000 });
        return true;
      } catch (e1) {
        try {
          const result = await execa('python3', ['-m', 'tgpt', '--version'], { shell: true, timeout: 5000 });
          return true;
        } catch (e2) {
          try {
            const result = await execa('tgpt', ['--version'], { shell: true, timeout: 5000 });
            return true;
          } catch (e3) {
            return false;
          }
        }
      }
    }
    
    if (isWindows) {
      // Try where command first
      const result = await execa('where', [toolName], { shell: true });
      if (result.stdout && result.stdout.trim()) {
        return true;
      }
      
      // Try version check
      try {
        await execa(toolName, ['--version'], { shell: true, timeout: 5000 });
        return true;
      } catch (e) {
        return false;
      }
    } else {
      await execa('command', ['-v', toolName], { shell: true });
      return true;
    }
  } catch (e) {
    return false;
  }
}

async function installTool(tool) {
  console.log(`🔧 Installing ${tool.name}...`);
  
  // Check if already installed
  const exists = await checkToolExists(tool.name);
  if (exists) {
    console.log(`✅ ${tool.name} is already installed`);
    return { success: true, method: 'already_installed' };
  }
  
  // Try each installation method
  for (const method of tool.methods) {
    console.log(`  Trying ${method.type} method...`);
    
    if (method.type === 'manual') {
      console.log(`  📋 Manual installation required:`);
      console.log(`     ${method.description}`);
      console.log(`     URL: ${method.url}`);
      continue;
    }
    
    const result = await runCommand(method.cmd);
    if (result.success) {
      console.log(`  ✅ ${tool.name} installed successfully via ${method.type}`);
      return { success: true, method: method.type };
    } else {
      console.log(`  ❌ ${method.type} failed: ${result.error}`);
    }
  }
  
  console.log(`  ❌ All installation methods failed for ${tool.name}`);
  return { success: false, method: 'failed' };
}

async function setupWSL() {
  console.log('🐧 Setting up WSL and Kali Linux for security tools...');
  
  // Check if WSL is available
  try {
    await execa('wsl', ['--status'], { shell: true });
    console.log('✅ WSL is available');
  } catch (e) {
    console.log('❌ WSL not available. Installing WSL...');
    const result = await runCommand('wsl --install');
    if (result.success) {
      console.log('✅ WSL installation initiated. Please restart your computer and run this script again.');
      return false;
    } else {
      console.log('❌ WSL installation failed:', result.error);
      return false;
    }
  }
  
  // Check if Kali Linux is installed
  try {
    await execa('wsl', ['-d', 'kali-linux', 'echo', 'kali-test'], { shell: true });
    console.log('✅ Kali Linux is available');
  } catch (e) {
    console.log('❌ Kali Linux not found. Installing Kali Linux...');
    const result = await runCommand('wsl --install -d kali-linux');
    if (result.success) {
      console.log('✅ Kali Linux installation initiated');
    } else {
      console.log('❌ Kali Linux installation failed:', result.error);
      return false;
    }
  }
  
  return true;
}

async function installSecurityTools() {
  console.log('🔒 Installing security tools in WSL Kali Linux...');
  
  const securityInstallCommands = [
    'sudo apt update',
    'sudo apt install -y nikto sqlmap hydra gobuster dirb',
    'sudo apt install -y theharvester amass john medusa',
    'sudo apt install -y metasploit-framework zaproxy mitmproxy',
    'sudo apt install -y socat netcat-openbsd fail2ban',
    'sudo apt install -y whatweb',
    'sudo apt install -y nmap',
    'go install github.com/ffuf/ffuf@latest',
    'go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest',
    'go install github.com/hahwul/dalfox/v2@latest'
  ];
  
  for (const cmd of securityInstallCommands) {
    console.log(`  Running: ${cmd}`);
    const result = await runCommand(cmd, true); // Use WSL for security tools
    if (result.success) {
      console.log(`  ✅ Success`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
  }
}

async function main() {
  console.log('🚀 Cyberix Auto-Tool Installer');
  console.log('================================');
  console.log(`📁 Current working directory: ${process.cwd()}`);
  console.log(`📁 Script directory: ${__dirname}`);
  
  if (!isWindows) {
    console.log('❌ This installer is designed for Windows. Please use the Linux installer.');
    process.exit(1);
  }
  
  console.log('📋 Installing basic tools...');
  const results = [];
  
  // Install basic tools
  for (const tool of TOOLS) {
    const result = await installTool(tool);
    results.push({ tool: tool.name, ...result });
  }
  
  // Setup WSL and install security tools
  const wslReady = await setupWSL();
  if (wslReady) {
    await installSecurityTools();
  }
  
  // Summary
  console.log('📊 Installation Summary');
  console.log('=======================');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successfully installed: ${successful} tools`);
  console.log(`❌ Failed to install: ${failed} tools`);
  
  if (failed > 0) {
    console.log('❌ Failed tools:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.tool}`);
    });
  }
  
  if (wslReady) {
    console.log('🔒 Security tools installed in WSL Kali Linux');
  } else {
    console.log('⚠️  WSL setup required for security tools');
  }
  
  console.log('🎉 Installation complete!');
  console.log('Please restart your terminal and run the Cyberix application.');
}

// Run the installer
main().catch(error => {
  console.error('❌ Fatal error:', error.message);
  console.error('Stack trace:', error.stack);
  console.error('\n💡 Troubleshooting tips:');
  console.error('• Make sure you have Node.js installed');
  console.error('• Run: npm install to install dependencies');
  console.error('• Try running as administrator');
  console.error('• Check if the project path contains spaces or special characters');
  process.exit(1);
});
