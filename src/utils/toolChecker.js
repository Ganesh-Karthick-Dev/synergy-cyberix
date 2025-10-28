// Tool Checker and Installer for Cyberix
// This module handles checking and installing required security tools
// Browser-compatible version that uses Electron IPC

import { getSecurePassword, hasSecurePassword } from './securePasswordStorage';

// Required tools for security scanning
const REQUIRED_TOOLS = [
  'jq', 'unzip', 'nmap', 'nikto', 'sqlmap', 'hydra', 'gobuster', 'dirb',
  'amass', 'john', 'medusa', 'zaproxy', 'mitmproxy', 'socat', 'fail2ban', 
  'curl', 'wget', 'ffuf', 'nuclei', 'dalfox', 'go'
];

// Installation command for missing tools
const INSTALL_COMMAND = `sudo apt install -y \\
  jq unzip nmap nikto sqlmap hydra gobuster dirb amass \\
  john medusa zaproxy mitmproxy socat fail2ban curl wget`;

// Go-based tools installation commands
const GO_TOOLS_INSTALL = [
  'go install github.com/ffuf/ffuf@latest',
  'go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest',
  'go install github.com/hahwul/dalfox/v2@latest'
];

/**
 * Check if a single tool is installed using Electron IPC
 * @param {string} toolName - Name of the tool to check
 * @returns {Promise<{installed: boolean, path?: string, requiresAuth?: boolean}>}
 */
async function checkTool(toolName) {
  try {
    if (window.cyberGuard && window.cyberGuard.checkTool) {
      // Get stored password
      const password = getSecurePassword();
      
      const result = await window.cyberGuard.checkTool(
        toolName, 
        password
      );
      return result;
    } else {
      // Fallback for development/testing
      console.warn('Electron API not available, simulating tool check');
      return { installed: false };
    }
  } catch (error) {
    console.error(`Error checking tool ${toolName}:`, error);
    return { installed: false };
  }
}

/**
 * Check all required tools and return status
 * @returns {Promise<{allInstalled: boolean, missingTools: string[], toolStatus: Object}>}
 */
async function checkAllTools() {
  console.log('🔍 Checking required security tools...');
  console.log('📋 Tools to check:', REQUIRED_TOOLS.join(', '));
  
  const toolStatus = {};
  const missingTools = [];
  
  for (const tool of REQUIRED_TOOLS) {
    console.log(`\n🔍 Checking: ${tool}`);
    const status = await checkTool(tool);
    toolStatus[tool] = status;
    
    if (status.installed) {
      console.log(`✅ ${tool} is installed -> ${status.path}`);
    } else {
      console.log(`❌ ${tool} is NOT installed`);
      missingTools.push(tool);
    }
  }
  
  const allInstalled = missingTools.length === 0;
  
  console.log('\n📊 Tool Check Summary:');
  if (allInstalled) {
    console.log('🎉 All required tools are installed!');
  } else {
    console.log(`⚠️  Missing ${missingTools.length} tools: ${missingTools.join(', ')}`);
  }
  
  return {
    allInstalled,
    missingTools,
    toolStatus
  };
}

/**
 * Install missing tools using Electron IPC
 * @param {string[]} missingTools - Array of missing tool names
 * @returns {Promise<boolean>} - Success status
 */
async function installMissingTools(missingTools) {
  console.log('🔧 Installing missing tools...');
  console.log('📋 Missing tools:', missingTools.join(', '));
  console.log('📋 APT Command:', INSTALL_COMMAND);
  console.log('📋 Go Commands:', GO_TOOLS_INSTALL.join(', '));
  
  try {
    if (window.cyberGuard && window.cyberGuard.installTools) {
      // Get stored password
      const password = getSecurePassword();
      
      if (password) {
        console.log('🔐 Using stored WSL password');
      } else {
        console.log('⚠️  No stored WSL password found');
      }
      
      console.log('🚀 Starting tool installation via Electron IPC...');
      const result = await window.cyberGuard.installTools(
        INSTALL_COMMAND, 
        GO_TOOLS_INSTALL,
        password
      );
      
      if (result.success) {
        console.log('✅ Tool installation completed successfully');
      } else {
        console.log('❌ Tool installation failed:', result.error);
      }
      
      return result.success;
    } else {
      // Fallback for development/testing
      console.warn('⚠️  Electron API not available, cannot install tools');
      return false;
    }
  } catch (error) {
    console.error('❌ Tool installation failed:', error.message);
    return false;
  }
}

/**
 * Main function to check and install tools if needed
 * @returns {Promise<boolean>} - True if all tools are ready, false otherwise
 */
async function ensureToolsInstalled() {
  console.log('🚀 Cyberix Tool Checker');
  console.log('======================');
  console.log('📅 Started at:', new Date().toISOString());
  
  // Check all tools
  console.log('\n🔍 Phase 1: Checking all required tools...');
  const { allInstalled, missingTools } = await checkAllTools();
  
  if (allInstalled) {
    console.log('\n✅ All tools are ready for scanning!');
    console.log('📅 Completed at:', new Date().toISOString());
    return true;
  }
  
  // Install missing tools
  console.log(`\n🔧 Phase 2: Installing ${missingTools.length} missing tools...`);
  const installSuccess = await installMissingTools(missingTools);
  
  if (!installSuccess) {
    console.log('\n❌ Tool installation failed. Please install manually.');
    console.log('📅 Failed at:', new Date().toISOString());
    return false;
  }
  
  // Re-check tools after installation
  console.log('\n🔍 Phase 3: Re-checking tools after installation...');
  const { allInstalled: recheckResult } = await checkAllTools();
  
  if (recheckResult) {
    console.log('\n🎉 All tools are now ready for scanning!');
    console.log('📅 Completed at:', new Date().toISOString());
    return true;
  } else {
    console.log('\n❌ Some tools are still missing after installation');
    console.log('📅 Failed at:', new Date().toISOString());
    return false;
  }
}

/**
 * Get tool checking command for manual execution
 * @returns {string} - The command to check tools
 */
function getToolCheckCommand() {
  const toolsList = REQUIRED_TOOLS.join(' ');
  return `for tool in ${toolsList}; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "✅ $tool is installed -> $(command -v $tool)"
  else
    echo "❌ $tool is NOT installed"
  fi
done`;
}

/**
 * Get installation command for manual execution
 * @returns {string} - The installation command
 */
function getInstallCommand() {
  return INSTALL_COMMAND;
}

export {
  checkTool,
  checkAllTools,
  installMissingTools,
  ensureToolsInstalled,
  getToolCheckCommand,
  getInstallCommand,
  REQUIRED_TOOLS,
  INSTALL_COMMAND
};
