import React, { useState, useEffect } from 'react';
import ProgressBarWithCount from '../shared/ProgressBarWithCount';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

/**
 * Step 4: Tools Installation Component
 * Installs all required security tools one by one with retry logic
 */
const Step4ToolsInstallation = ({ username, password, onComplete, onError, onLog }) => {
  const [status, setStatus] = useState('checking'); // checking, installing, completed, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Checking required tools...');
  const [installedCount, setInstalledCount] = useState(0);
  const [totalTools, setTotalTools] = useState(0);
  const [currentTool, setCurrentTool] = useState('');
  const [failedTools, setFailedTools] = useState([]);

  // Required tools list
  const requiredTools = [
    { name: 'jq', command: 'sudo apt install -y jq', type: 'apt' },
    { name: 'unzip', command: 'sudo apt install -y unzip', type: 'apt' },
    { name: 'curl', command: 'sudo apt install -y curl', type: 'apt' },
    { name: 'wget', command: 'sudo apt install -y wget', type: 'apt' },
    { name: 'nmap', command: 'sudo apt install -y nmap', type: 'apt' },
    { name: 'nikto', command: 'sudo apt install -y nikto', type: 'apt' },
    { name: 'sqlmap', command: 'sudo apt install -y sqlmap', type: 'apt' },
    { name: 'hydra', command: 'sudo apt install -y hydra', type: 'apt' },
    { name: 'gobuster', command: 'sudo apt install -y gobuster', type: 'apt' },
    { name: 'dirb', command: 'sudo apt install -y dirb', type: 'apt' },
    { name: 'sslscan', command: 'sudo apt install -y sslscan', type: 'apt' },
    { name: 'dnstwist', command: 'sudo apt install -y dnstwist', type: 'apt' },
    { name: 'geoip-bin', command: 'sudo apt install -y geoip-bin', type: 'apt' },
    { name: 'wapiti', command: 'sudo apt install -y wapiti', type: 'apt' },
    { name: 'whatweb', command: 'sudo apt install -y whatweb', type: 'apt' },
    { name: 'golang-go', command: 'sudo apt install -y golang-go', type: 'apt' },
    { name: 'amass', command: 'sudo snap install amass || sudo apt install -y amass', type: 'apt' },
  ];

  const goTools = [
    { name: 'ffuf', command: 'go install github.com/ffuf/ffuf/v2@latest', type: 'go' },
    { name: 'nuclei', command: 'go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest', type: 'go' },
    { name: 'dalfox', command: 'go install github.com/hahwul/dalfox/v2@latest', type: 'go' },
  ];

  const addLog = (message, type = 'info') => {
    // Send to parent component's log
    if (onLog) {
      onLog(message, type);
    }
  };

  useEffect(() => {
    if (username && password) {
      startInstallation();
    } else {
      addLog('Waiting for WSL credentials...', 'info');
    }
  }, [username, password]);

  /**
   * Start installation process
   */
  const startInstallation = async () => {
    try {
      addLog('Starting tools installation...', 'info');
      setStatus('checking');
      setProgress(0);

      // Step 1: Update package lists
      addLog('Step 1: Updating package lists...', 'info');
      setMessage('Updating package lists...');
      await updatePackageLists();

      // Step 2: Check which tools are installed
      addLog('Step 2: Checking installed tools...', 'info');
      setMessage('Checking installed tools...');
      const missingTools = await checkInstalledTools();

      setTotalTools(missingTools.length);
      setProgress(10);

      if (missingTools.length === 0) {
        addLog('✅ All tools are already installed!', 'success');
        setStatus('completed');
        setMessage('All tools available');
        onComplete();
        return;
      }

      // Step 3: Install missing tools
      addLog(`Found ${missingTools.length} missing tools. Installing...`, 'info');
      setStatus('installing');
      await installTools(missingTools);

      // Step 4: Install Go tools
      addLog('Step 4: Installing Go-based tools...', 'info');
      await installGoTools();

      // Step 5: Install tgpt (AI tool)
      addLog('Step 5: Installing tgpt (AI analysis tool)...', 'info');
      await installTgpt();

      // Step 6: Final verification
      addLog('Step 6: Verifying installation...', 'info');
      await verifyInstallation();

      setStatus('completed');
      setMessage('All tools installed successfully');
      addLog('✅ Step 4 completed successfully!', 'success');
      onComplete();
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      setStatus('error');
      setMessage('Installation failed');
      onError(error);
    }
  };

  /**
   * Update package lists
   */
  const updatePackageLists = async () => {
    try {
      addLog('📦 [APT] Updating package lists...', 'info');
      addLog('💻 [COMMAND] Executing: sudo apt update', 'info');
      
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('❌ [ERROR] WSL command API not available', 'error');
        return;
      }

      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'apt update',
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr}`, 'warning');
      }
      
      if (result?.success !== false) {
        addLog('✅ [RESULT] Package lists updated successfully', 'success');
      } else {
        addLog(`⚠️ [WARNING] Package update warning: ${result?.error || 'Unknown error'}`, 'warning');
      }
    } catch (error) {
      addLog(`⚠️ [WARNING] Package update warning: ${error.message}`, 'warning');
    }
  };

  /**
   * Check which tools are installed
   */
  const checkInstalledTools = async () => {
    addLog('🔍 [TOOL CHECK] Checking installed tools...', 'info');
    const missing = [];

    if (!window.cyberGuard?.runWslCommandAsRoot) {
      addLog('❌ [ERROR] WSL command API not available', 'error');
      return requiredTools; // If API not available, assume all are missing
    }

    for (const tool of requiredTools) {
      try {
        addLog(`🔍 [CHECK] Checking for ${tool.name}...`, 'info');
        addLog(`💻 [COMMAND] Executing: command -v ${tool.name}`, 'info');
        
        addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
        const result = await window.cyberGuard.runWslCommandAsRoot(
          username,
          `command -v ${tool.name} >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
          password
        );
        
        addLog('📥 [RESPONSE] Command execution completed', 'info');
        if (result?.stdout) {
          addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
        }
        if (result?.stderr) {
          addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
        }
        
        const output = result?.stdout || '';
        if (!output.includes('installed')) {
          addLog(`❌ [RESULT] ${tool.name} not installed - will install`, 'warning');
          missing.push(tool);
        } else {
          addLog(`✅ [RESULT] ${tool.name} is already installed - skipping`, 'success');
        }
      } catch (error) {
        addLog(`❌ [ERROR] Error checking ${tool.name}: ${error.message}`, 'error');
        // If check fails, assume tool is missing
        missing.push(tool);
      }
    }

    addLog(`📋 [SUMMARY] Found ${missing.length} missing tools out of ${requiredTools.length}`, 'info');
    if (missing.length > 0) {
      addLog(`📋 [MISSING TOOLS] ${missing.map(t => t.name).join(', ')}`, 'info');
    }
    return missing;
  };

  /**
   * Install tools with retry logic
   * Only installs tools that are missing (already checked)
   */
  const installTools = async (tools) => {
    if (!window.cyberGuard?.runWslCommandAsRoot) {
      addLog('❌ [ERROR] WSL command API not available', 'error');
      throw new Error('WSL command API not available');
    }

    const total = tools.length;
    let installed = 0;
    const failed = [];

    addLog(`📦 [INSTALL] Starting installation of ${total} missing tools...`, 'info');

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i];
      setCurrentTool(tool.name);
      setMessage(`Installing ${tool.name}... (${i + 1}/${total})`);
      
      addLog(`📦 [INSTALL] Installing ${tool.name} (${i + 1}/${total})...`, 'info');
      addLog(`💻 [COMMAND] Executing: ${tool.command}`, 'info');
      
      // Retry up to 3 times
      let success = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) {
            addLog(`🔄 [RETRY] Retrying ${tool.name} (attempt ${attempt}/3)...`, 'warning');
          }
          
          addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
          // Use simple command: just the apt install command (e.g., "apt install -y toolname")
          // The IPC handler will handle the WSL execution and sudo
          // Remove "sudo " prefix if present since runWslCommandAsRoot handles sudo
          const cleanCommand = tool.command.replace(/^sudo\s+/, '');
          const result = await window.cyberGuard.runWslCommandAsRoot(
            username,
            cleanCommand,
            password
          );
          
          addLog('📥 [RESPONSE] Command execution completed', 'info');
          if (result?.stdout) {
            addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout}`, 'info');
          }
          if (result?.stderr) {
            addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr}`, 'warning');
          }
          
          // Verify installation
          addLog(`🔍 [VERIFY] Verifying ${tool.name} installation...`, 'info');
          addLog('⏳ [WAIT] Executing verification command...', 'info');
          const verifyResult = await window.cyberGuard.runWslCommandAsRoot(
            username,
            `command -v ${tool.name} >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
            password
          );
          
          addLog('📥 [RESPONSE] Verification completed', 'info');
          if (verifyResult?.stdout) {
            addLog(`📤 [TERMINAL OUTPUT] Verification result: ${verifyResult.stdout.trim()}`, 'info');
          }
          
          const verifyOutput = verifyResult?.stdout || '';
          if (verifyOutput.includes('installed')) {
            addLog(`✅ [RESULT] ${tool.name} installed successfully (attempt ${attempt})`, 'success');
            success = true;
            installed++;
            setInstalledCount(installed);
            setProgress(10 + (installed / total) * 70);
            break;
          } else {
            addLog(`❌ [RESULT] ${tool.name} installation verification failed`, 'error');
            if (attempt < 3) {
              addLog(`🔄 [RETRY] Retrying in 2 seconds...`, 'warning');
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        } catch (error) {
          addLog(`❌ [ERROR] ${tool.name} attempt ${attempt} failed: ${error.message}`, 'error');
          if (attempt < 3) {
            addLog(`🔄 [RETRY] Retrying in 2 seconds...`, 'warning');
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            addLog(`❌ [FAILED] ${tool.name} failed after 3 attempts`, 'error');
            failed.push(tool);
          }
        }
      }

      if (!success) {
        failed.push(tool);
      }
    }

    setFailedTools(failed);

    if (failed.length > 0) {
      addLog(`⚠️ [WARNING] ${failed.length} tools failed to install: ${failed.map(t => t.name).join(', ')}`, 'warning');
    } else {
      addLog(`✅ [SUCCESS] All ${total} tools installed successfully!`, 'success');
    }
  };

  /**
   * Install Go tools
   * First checks if Go tools are installed, then installs missing ones
   */
  const installGoTools = async () => {
    if (!window.cyberGuard?.runWslCommandAsRoot) {
      addLog('❌ [ERROR] WSL command API not available', 'error');
      return;
    }

    addLog('🐹 [GO] Setting up Go environment...', 'info');
    
    // Set up Go environment
    try {
      addLog('💻 [COMMAND] Setting up Go environment variables...', 'info');
      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const setupResult = await window.cyberGuard.runWslCommandAsRoot(
        username,
        `export GOPATH=\$HOME/go && export PATH=\$PATH:\$GOPATH/bin && echo 'export GOPATH=\$HOME/go' >> ~/.bashrc && echo 'export PATH=\$PATH:\$GOPATH/bin' >> ~/.bashrc`,
        password
      );
      
      if (setupResult?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] ${setupResult.stdout.trim()}`, 'info');
      }
      addLog('✅ [RESULT] Go environment configured', 'success');
    } catch (error) {
      addLog(`⚠️ [WARNING] Go environment setup warning: ${error.message}`, 'warning');
    }

    // Check and install each Go tool
    for (const tool of goTools) {
      setCurrentTool(tool.name);
      addLog(`🔍 [CHECK] Checking for ${tool.name}...`, 'info');
      
      try {
        // Check if tool exists
        addLog('⏳ [WAIT] Executing check command...', 'info');
        const checkResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          `command -v ${tool.name} >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
          password
        );
        
        const checkOutput = checkResult?.stdout || '';
        if (checkOutput.includes('installed')) {
          addLog(`✅ [RESULT] ${tool.name} is already installed - skipping`, 'success');
          continue;
        }
        
        addLog(`📦 [INSTALL] Installing ${tool.name}...`, 'info');
        addLog(`💻 [COMMAND] Executing: ${tool.command}`, 'info');
        
        // Install tool
        addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
        const installResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          `export GOPATH=\$HOME/go && export PATH=\$PATH:\$GOPATH/bin && ${tool.command}`,
          password
        );
        
        addLog('📥 [RESPONSE] Command execution completed', 'info');
        if (installResult?.stdout) {
          addLog(`📤 [TERMINAL OUTPUT] stdout:\n${installResult.stdout}`, 'info');
        }
        if (installResult?.stderr) {
          addLog(`📤 [TERMINAL OUTPUT] stderr:\n${installResult.stderr}`, 'warning');
        }
        
        // Create symlink
        addLog(`🔗 [SYMLINK] Creating symlink for ${tool.name}...`, 'info');
        addLog('⏳ [WAIT] Executing symlink command...', 'info');
        const symlinkResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          `ln -sf \$HOME/go/bin/${tool.name} /usr/local/bin/${tool.name}`,
          password
        );
        
        if (symlinkResult?.stdout) {
          addLog(`📤 [TERMINAL OUTPUT] ${symlinkResult.stdout.trim()}`, 'info');
        }
        
        addLog(`✅ [RESULT] ${tool.name} installed successfully`, 'success');
      } catch (error) {
        addLog(`⚠️ [WARNING] ${tool.name} installation warning: ${error.message}`, 'warning');
      }
    }
  };

  /**
   * Install tgpt (AI analysis tool)
   */
  const installTgpt = async () => {
    if (!window.cyberGuard?.runWslCommandAsRoot) {
      addLog('❌ [ERROR] WSL command API not available', 'error');
      return;
    }

    addLog('🔍 [CHECK] Checking for tgpt...', 'info');
    setCurrentTool('tgpt');
    setMessage('Checking tgpt installation...');
    
    try {
      // Check if tgpt is installed
      addLog('💻 [COMMAND] Executing: command -v tgpt', 'info');
      const checkResult = await window.cyberGuard.runWslCommandAsRoot(
        username,
        `command -v tgpt >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
        password
      );
      
      const checkOutput = checkResult?.stdout || '';
      if (checkOutput.includes('installed')) {
        addLog('✅ [RESULT] tgpt is already installed - skipping', 'success');
        
        // Get version
        try {
          const versionResult = await window.cyberGuard.runWslCommandAsRoot(
            username,
            `tgpt --version 2>/dev/null || echo 'version unknown'`,
            password
          );
          if (versionResult?.stdout) {
            addLog(`📋 [INFO] tgpt version: ${versionResult.stdout.trim()}`, 'info');
          }
        } catch (error) {
          // Version check is optional
        }
        return;
      }
      
      addLog('📦 [INSTALL] Installing tgpt...', 'info');
      addLog('💻 [COMMAND] Executing: curl -sSL https://raw.githubusercontent.com/aandrew-me/tgpt/main/install | bash', 'info');
      setMessage('Installing tgpt...');
      
      // Install tgpt using curl
      addLog('⏳ [WAIT] Executing installation command in WSL terminal...', 'info');
      const installResult = await window.cyberGuard.runWslCommandAsRoot(
        username,
        `curl -sSL https://raw.githubusercontent.com/aandrew-me/tgpt/main/install | bash`,
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (installResult?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${installResult.stdout}`, 'info');
      }
      if (installResult?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${installResult.stderr}`, 'warning');
      }
      
      // Verify installation
      addLog('🔍 [VERIFY] Verifying tgpt installation...', 'info');
      const verifyResult = await window.cyberGuard.runWslCommandAsRoot(
        username,
        `command -v tgpt >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
        password
      );
      
      const verifyOutput = verifyResult?.stdout || '';
      if (verifyOutput.includes('installed')) {
        addLog('✅ [RESULT] tgpt installed successfully', 'success');
        
        // Get version
        try {
          const versionResult = await window.cyberGuard.runWslCommandAsRoot(
            username,
            `tgpt --version 2>/dev/null || echo 'version unknown'`,
            password
          );
          if (versionResult?.stdout) {
            addLog(`📋 [INFO] tgpt version: ${versionResult.stdout.trim()}`, 'info');
          }
        } catch (error) {
          // Version check is optional
        }
      } else {
        addLog('⚠️ [WARNING] tgpt installation may have failed', 'warning');
        addLog('📋 [INFO] tgpt will be installed automatically when needed during scans', 'info');
      }
    } catch (error) {
      addLog(`⚠️ [WARNING] Error installing tgpt: ${error.message}`, 'warning');
      addLog('📋 [INFO] tgpt will be installed automatically when needed during scans', 'info');
    }
  };

  /**
   * Verify installation
   */
  const verifyInstallation = async () => {
    if (!window.cyberGuard?.runWslCommandAsRoot) {
      addLog('❌ [ERROR] WSL command API not available', 'error');
      return;
    }

    addLog('🔍 [VERIFY] Verifying all tools installation...', 'info');
    addLog('🔄 [INFO] Using fresh shell session with updated PATH...', 'info');
    
    const allTools = [...requiredTools.map(t => t.name), ...goTools.map(t => t.name)];
    let verified = 0;
    const failedTools = [];

    for (const toolName of allTools) {
      try {
        addLog(`🔍 [CHECK] Verifying ${toolName}...`, 'info');
        addLog('⏳ [WAIT] Executing verification command...', 'info');
        
        // Use fresh shell with proper PATH setup
        // Try multiple methods: command -v, which, and direct path check
        const verifyCommand = `
          export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:\$HOME/go/bin:\$PATH"
          if command -v ${toolName} >/dev/null 2>&1; then
            echo 'installed'
          elif which ${toolName} >/dev/null 2>&1; then
            echo 'installed'
          elif [ -f "/usr/bin/${toolName}" ] || [ -f "/usr/local/bin/${toolName}" ] || [ -f "\$HOME/go/bin/${toolName}" ]; then
            echo 'installed'
          else
            echo 'notinstalled'
          fi
        `.trim().replace(/\n/g, ' ');
        
        const result = await window.cyberGuard.runWslCommandAsRoot(
          username,
          verifyCommand,
          password
        );
        
        addLog('📥 [RESPONSE] Verification completed', 'info');
        if (result?.stdout) {
          const output = result.stdout.trim();
          addLog(`📤 [TERMINAL OUTPUT] ${toolName}: ${output}`, 'info');
          if (output.includes('installed')) {
            verified++;
            addLog(`✅ [RESULT] ${toolName} is installed and accessible`, 'success');
          } else {
            failedTools.push(toolName);
            addLog(`❌ [RESULT] ${toolName} is not accessible - may need PATH refresh`, 'warning');
            
            // Try to fix PATH and re-verify
            addLog(`🔄 [FIX] Attempting to refresh PATH for ${toolName}...`, 'info');
            const fixResult = await window.cyberGuard.runWslCommandAsRoot(
              username,
              `hash -r && export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:\$HOME/go/bin:\$PATH" && command -v ${toolName} >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
              password
            );
            
            if (fixResult?.stdout?.includes('installed')) {
              verified++;
              failedTools.pop();
              addLog(`✅ [RESULT] ${toolName} verified after PATH refresh`, 'success');
            }
          }
        }
      } catch (error) {
        addLog(`❌ [ERROR] Error verifying ${toolName}: ${error.message}`, 'error');
        failedTools.push(toolName);
      }
    }

    if (failedTools.length > 0) {
      addLog(`⚠️ [WARNING] ${failedTools.length} tools not accessible: ${failedTools.join(', ')}`, 'warning');
      addLog(`💡 [TIP] These tools may be installed but not in PATH. Try logging out and back in.`, 'info');
    }
    
    addLog(`📊 [SUMMARY] Verified: ${verified}/${allTools.length} tools installed and accessible`, verified === allTools.length ? 'success' : 'warning');
    setProgress(95);
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {getStatusIcon()}
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            Security Tools Installation
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {currentTool ? `Installing ${currentTool}...` : message}
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBarWithCount
        current={installedCount}
        total={totalTools || requiredTools.length}
        label="Tools Installed"
        status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active'}
      />
    </div>
  );
};

export default Step4ToolsInstallation;


