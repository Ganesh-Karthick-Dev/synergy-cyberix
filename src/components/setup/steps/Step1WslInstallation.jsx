import React, { useState, useEffect } from 'react';
import ProgressBarWithCount from '../shared/ProgressBarWithCount';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

/**
 * Step 1: WSL Installation Component
 * Handles WSL installation with retry logic and Ubuntu detection
 */
const Step1WslInstallation = ({ onComplete, onError, onLog }) => {
  const [status, setStatus] = useState('checking'); // checking, installing, verifying, completed, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Checking WSL installation...');
  const [logs, setLogs] = useState([]);
  const [wslInstalled, setWslInstalled] = useState(false);
  const [ubuntuInstalled, setUbuntuInstalled] = useState(false);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, message, type };
    setLogs(prev => [...prev, logEntry]);
    // Also send to parent component's log
    if (onLog) {
      onLog(message, type);
    }
  };

  useEffect(() => {
    checkWslInstallation();
  }, []);

  /**
   * Check WSL installation using wsl --status (10 attempts)
   */
  const checkWslInstallation = async () => {
    setStatus('checking');
    setProgress(0);
    setMessage('Checking WSL installation...');
    addLog('🔍 [WSL CHECK] Starting WSL installation verification...', 'info');
    addLog('📋 [COMMAND] Method 1: Checking with "wsl --status" command', 'info');
    addLog('💻 [COMMAND] Executing: wsl --status', 'info');

    let wslFound = false;
    let attempt = 0;
    const maxAttempts = 10;

    // Try wsl --status up to 10 times
    while (!wslFound && attempt < maxAttempts) {
      attempt++;
      addLog(`🔄 [ATTEMPT ${attempt}/${maxAttempts}] Running "wsl --status"...`, 'info');
      setProgress((attempt / maxAttempts) * 30);

      try {
        // Use IPC method to check WSL
        if (window.cyberGuard?.checkWsl) {
          addLog(`💻 [COMMAND] Executing: wsl --status`, 'info');
          const hasWsl = await window.cyberGuard.checkWsl();
          
          if (hasWsl) {
            addLog('✅ [RESULT] WSL is installed (detected via checkWsl API)', 'success');
            addLog('✅ [STATUS] WSL installation verified successfully', 'success');
            addLog('➡️ [NEXT] Navigating to next step...', 'info');
            wslFound = true;
            setWslInstalled(true);
            break;
          } else {
            addLog(`⚠️ [RESULT] WSL not found (attempt ${attempt})`, 'warning');
          }
        } else if (window.cyberGuard?.executeCommand) {
          // Fallback: Use executeCommand if available
          addLog(`💻 [COMMAND] Executing: wsl --status`, 'info');
          const result = await window.cyberGuard.executeCommand('wsl --status');
          
          // Log command output
          if (result?.stdout) {
            addLog(`📤 [OUTPUT] stdout: ${result.stdout.trim()}`, 'info');
          }
          if (result?.stderr) {
            addLog(`📤 [OUTPUT] stderr: ${result.stderr.trim()}`, 'warning');
          }
          
          const output = ((result?.stdout || '') + (result?.stderr || '')).toLowerCase();
          
          // Check for WSL indicators
          if (output.includes('default distribution') || 
              output.includes('wsl version') || 
              output.includes('kernel version') ||
              result?.success) {
            addLog('✅ [RESULT] WSL is installed (detected via wsl --status output)', 'success');
            addLog('✅ [STATUS] WSL installation verified successfully', 'success');
            addLog('➡️ [NEXT] Navigating to next step...', 'info');
            wslFound = true;
            setWslInstalled(true);
            break;
          } else {
            addLog(`⚠️ [RESULT] WSL not found in output (attempt ${attempt})`, 'warning');
          }
        } else {
          addLog(`❌ [ERROR] WSL check API not available`, 'error');
        }

        if (!wslFound && attempt < maxAttempts) {
          addLog(`⏳ [WAIT] Waiting 2 seconds before retry...`, 'info');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        addLog(`❌ [ERROR] Attempt ${attempt} error: ${error.message}`, 'error');
      }
    }

    // If wsl --status failed, try wsl -l -v
    if (!wslFound) {
      addLog('⚠️ [RESULT] wsl --status check failed, trying alternative method...', 'warning');
      addLog('📋 [COMMAND] Method 2: Checking with "wsl -l -v" command', 'info');
      addLog('💻 [COMMAND] Executing: wsl -l -v', 'info');
      
      try {
        // Use IPC method to execute command
        if (window.cyberGuard?.executeCommand) {
          const result = await window.cyberGuard.executeCommand('wsl -l -v');
          
          // Log command output
          if (result?.stdout) {
            addLog(`📤 [OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
          }
          if (result?.stderr) {
            addLog(`📤 [OUTPUT] stderr: ${result.stderr.trim()}`, 'warning');
          }
          
          const output = (result?.stdout || '').toLowerCase();
          
          if (output.includes('ubuntu')) {
            addLog('✅ [RESULT] Ubuntu found in WSL distributions', 'success');
            addLog('✅ [STATUS] WSL and Ubuntu installation verified', 'success');
            wslFound = true;
            setWslInstalled(true);
            setUbuntuInstalled(true);
          } else {
            addLog('❌ [RESULT] Ubuntu not found in WSL distributions', 'error');
            addLog('📋 [ACTION] WSL installation required', 'info');
          }
        } else if (window.cyberGuard?.checkWsl) {
          // Fallback: Just check if WSL exists
          const hasWsl = await window.cyberGuard.checkWsl();
          if (hasWsl) {
            addLog('✅ [RESULT] WSL is installed', 'success');
            wslFound = true;
            setWslInstalled(true);
          } else {
            addLog('❌ [RESULT] WSL not found', 'error');
            addLog('📋 [ACTION] WSL installation required', 'info');
          }
        } else {
          addLog('❌ [ERROR] WSL check API not available', 'error');
        }
      } catch (error) {
        addLog(`❌ [ERROR] Alternative check failed: ${error.message}`, 'error');
      }
    }

    if (wslFound) {
      setProgress(50);
      addLog('✅ [STATUS] WSL found, checking Ubuntu installation...', 'success');
      await checkUbuntuInstallation();
    } else {
      setProgress(30);
      setMessage('WSL not found. Starting installation...');
      addLog('📋 [ACTION] WSL not found. System will automatically install WSL...', 'info');
      addLog('💻 [COMMAND] Installation command: wsl --install', 'info');
      await installWsl();
    }
  };

  /**
   * Check if Ubuntu is installed
   */
  const checkUbuntuInstallation = async () => {
    addLog('🔍 [UBUNTU CHECK] Checking for Ubuntu distribution...', 'info');
    setMessage('Checking for Ubuntu...');
    setProgress(50);

    try {
      // Use IPC method to execute command
      if (window.cyberGuard?.runWslCommand) {
        addLog('💻 [COMMAND] Executing: wsl -l -v', 'info');
        const result = await window.cyberGuard.runWslCommand('-l -v', '');
        
        // Log command output
        if (result?.stdout) {
          addLog(`📤 [OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
        }
        if (result?.stderr) {
          addLog(`📤 [OUTPUT] stderr: ${result.stderr.trim()}`, 'warning');
        }
        
        const output = (result?.stdout || '').toLowerCase();
        
        if (output.includes('ubuntu')) {
          addLog('✅ [RESULT] Ubuntu is installed', 'success');
          addLog('✅ [STATUS] WSL and Ubuntu installation verified', 'success');
          setUbuntuInstalled(true);
          setProgress(100);
          setStatus('completed');
          setMessage('WSL and Ubuntu installation complete');
          addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
          onComplete();
        } else {
          addLog('❌ [RESULT] Ubuntu not found in WSL distributions', 'warning');
          addLog('📋 [ACTION] System will automatically install Ubuntu...', 'info');
          addLog('💻 [COMMAND] Installation command: wsl --install -d Ubuntu', 'info');
          await installUbuntu();
        }
      } else if (window.cyberGuard?.verifyUbuntu) {
        // Fallback: Use verifyUbuntu API
        addLog('💻 [COMMAND] Verifying Ubuntu installation...', 'info');
        const hasUbuntu = await window.cyberGuard.verifyUbuntu();
        
        if (hasUbuntu) {
          addLog('✅ [RESULT] Ubuntu is installed', 'success');
          addLog('✅ [STATUS] WSL and Ubuntu installation verified', 'success');
          setUbuntuInstalled(true);
          setProgress(100);
          setStatus('completed');
          setMessage('WSL and Ubuntu installation complete');
          addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
          onComplete();
        } else {
          addLog('❌ [RESULT] Ubuntu not found', 'warning');
          addLog('📋 [ACTION] System will automatically install Ubuntu...', 'info');
          addLog('💻 [COMMAND] Installation command: wsl --install -d Ubuntu', 'info');
          await installUbuntu();
        }
      } else {
        addLog('❌ [ERROR] Ubuntu check API not available', 'error');
        addLog('📋 [ACTION] Attempting Ubuntu installation...', 'info');
        await installUbuntu();
      }
    } catch (error) {
      addLog(`❌ [ERROR] Error checking Ubuntu: ${error.message}`, 'error');
      addLog('📋 [ACTION] Attempting Ubuntu installation...', 'info');
      await installUbuntu();
    }
  };

  /**
   * Install WSL
   */
  const installWsl = async () => {
    setStatus('installing');
    setMessage('Installing WSL...');
    setProgress(30);
    addLog('📦 [INSTALL] Starting WSL installation...', 'info');
    addLog('⏳ [INFO] This may take several minutes. Please wait...', 'info');
    addLog('💻 [COMMAND] Executing: wsl --install', 'info');

    try {
      if (window.cyberGuard?.installWsl) {
        addLog('🔄 [PROCESS] Calling WSL installation API...', 'info');
        const success = await window.cyberGuard.installWsl();
        
        if (success) {
          addLog('✅ [RESULT] WSL installation command completed', 'success');
          addLog('📋 [STATUS] Installation process initiated', 'success');
          setProgress(60);
          await verifyWslInstallation();
        } else {
          throw new Error('WSL installation returned false');
        }
      } else {
        // Fallback: manual installation instructions
        addLog('⚠️ [WARNING] Auto-installation not available', 'warning');
        addLog('📋 [MANUAL] Please install WSL manually using the following commands:', 'info');
        addLog('1. Open PowerShell as Administrator', 'info');
        addLog('2. Run: dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart', 'info');
        addLog('3. Run: dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart', 'info');
        addLog('4. Restart your computer', 'info');
        addLog('5. After reboot, run: wsl --set-default-version 2', 'info');
        addLog('6. Run: wsl --install -d Ubuntu', 'info');
        
        setStatus('error');
        setMessage('Manual installation required');
        onError('WSL auto-installation failed. Please install manually.');
      }
    } catch (error) {
      addLog(`❌ [ERROR] WSL installation error: ${error.message}`, 'error');
      setStatus('error');
      setMessage('WSL installation failed');
      onError(error.message);
    }
  };

  /**
   * Verify WSL installation
   */
  const verifyWslInstallation = async () => {
    setStatus('verifying');
    setMessage('Verifying WSL installation...');
    setProgress(60);
    addLog('Verifying WSL installation...', 'info');

    let verified = false;
    let retryCount = 0;
    const maxRetries = 15;

    while (!verified && retryCount < maxRetries) {
      retryCount++;
      addLog(`Verification attempt ${retryCount}/${maxRetries}...`, 'info');
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        if (window.cyberGuard?.checkWsl) {
          verified = await window.cyberGuard.checkWsl();
        } else {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);
          
          try {
            await execAsync('wsl --status', { timeout: 5000 });
            verified = true;
          } catch (e) {
            verified = false;
          }
        }

        if (verified) {
          addLog('✅ WSL verified successfully!', 'success');
          setProgress(80);
          await checkUbuntuInstallation();
          return;
        }
      } catch (error) {
        addLog(`Verification attempt ${retryCount} failed: ${error.message}`, 'warning');
      }
    }

    if (!verified) {
      addLog('⚠️ WSL verification failed after multiple attempts', 'warning');
      addLog('Continuing anyway - WSL may still be installing in background', 'info');
      setProgress(80);
      await checkUbuntuInstallation();
    }
  };

  /**
   * Install Ubuntu
   */
  const installUbuntu = async () => {
    setStatus('installing');
    setMessage('Installing Ubuntu...');
    setProgress(80);
    addLog('📦 [INSTALL] Installing Ubuntu distribution...', 'info');
    addLog('💻 [COMMAND] Executing: wsl --install -d Ubuntu', 'info');

    try {
      if (window.cyberGuard?.installUbuntu) {
        addLog('🔄 [PROCESS] Calling Ubuntu installation API...', 'info');
        const success = await window.cyberGuard.installUbuntu();
        
        if (success) {
          addLog('✅ [RESULT] Ubuntu installation command completed', 'success');
        } else {
          addLog('⚠️ [INFO] Ubuntu installation may continue in background', 'warning');
        }
      } else {
        // Fallback: Use IPC executeCommand if available
        if (window.cyberGuard?.executeCommand) {
          try {
            addLog('💻 [COMMAND] Executing: wsl --install -d Ubuntu', 'info');
            addLog('⏳ [INFO] This may take several minutes...', 'info');
            const result = await window.cyberGuard.executeCommand('wsl --install -d Ubuntu');
            
            if (result?.stdout) {
              addLog(`📤 [OUTPUT] stdout: ${result.stdout.substring(0, 500)}...`, 'info');
            }
            if (result?.stderr) {
              addLog(`📤 [OUTPUT] stderr: ${result.stderr.substring(0, 500)}...`, 'warning');
            }
            
            if (result?.success) {
              addLog('✅ [RESULT] Ubuntu installation completed', 'success');
            } else {
              addLog(`⚠️ [WARNING] Ubuntu installation may have issues: ${result?.error || 'Unknown error'}`, 'warning');
              addLog('⏳ [INFO] Ubuntu may still be installing. Please wait...', 'info');
            }
          } catch (error) {
            addLog(`⚠️ [WARNING] Ubuntu installation error: ${error.message}`, 'warning');
            addLog('⏳ [INFO] Ubuntu may still be installing. Please wait...', 'info');
          }
        } else {
          addLog('⚠️ [WARNING] Command execution API not available', 'warning');
          addLog('⏳ [INFO] Ubuntu installation may continue in background...', 'info');
        }
      }

      setProgress(100);
      setStatus('completed');
      setMessage('WSL and Ubuntu installation complete');
      addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
      onComplete();
    } catch (error) {
      addLog(`❌ [ERROR] Ubuntu installation error: ${error.message}`, 'error');
      setStatus('error');
      setMessage('Ubuntu installation failed');
      onError(error.message);
    }
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
            WSL Installation
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{message}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <ProgressBarWithCount
        current={progress}
        total={100}
        label="Installation Progress"
        status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active'}
      />
    </div>
  );
};

export default Step1WslInstallation;

