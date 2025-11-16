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
        
        // Check for "no installed distributions" message
        const noDistributionsPattern = /windows subsystem for linux has no installed distributions/i;
        const microsoftStorePattern = /distributions can be installed by visiting the microsoft store/i;
        
        if (noDistributionsPattern.test(output) || 
            (microsoftStorePattern.test(output) && !output.includes('ubuntu'))) {
          addLog('⚠️ [RESULT] WSL is installed but NO distributions found', 'warning');
          addLog('📋 [ACTION] Ubuntu installation required', 'info');
          // WSL is installed but no distributions - don't mark as found yet
          // Continue to check Ubuntu installation
          wslFound = true; // WSL exists, but we need to check/install Ubuntu
          setWslInstalled(true);
          break;
        } else if (output.includes('default distribution') || 
                   output.includes('wsl version') || 
                   output.includes('kernel version') ||
                   result?.success) {
          addLog('✅ [RESULT] WSL is installed (detected via wsl --status output)', 'success');
          // Don't mark as complete yet - need to check Ubuntu first
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
        const allOutput = ((result?.stdout || '') + (result?.stderr || '')).toLowerCase();
        
        // Check for "no installed distributions" message
        const noDistributionsPattern = /windows subsystem for linux has no installed distributions/i;
        const microsoftStorePattern = /distributions can be installed by visiting the microsoft store/i;
        
        if (noDistributionsPattern.test(allOutput) || 
            (microsoftStorePattern.test(allOutput) && !allOutput.includes('ubuntu'))) {
          addLog('⚠️ [RESULT] WSL is installed but NO distributions found', 'warning');
          addLog('📋 [ACTION] Ubuntu installation required', 'info');
          wslFound = true; // WSL exists, but we need to install Ubuntu
          setWslInstalled(true);
        } else if (output.includes('ubuntu')) {
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
        const allOutput = ((result?.stdout || '') + (result?.stderr || '')).toLowerCase();
        
        // Check for "no installed distributions" message
        const noDistributionsPattern = /windows subsystem for linux has no installed distributions/i;
        const microsoftStorePattern = /distributions can be installed by visiting the microsoft store/i;
        
        if (noDistributionsPattern.test(allOutput) || 
            (microsoftStorePattern.test(allOutput) && !allOutput.includes('ubuntu'))) {
          addLog('❌ [RESULT] Ubuntu not found - no distributions installed', 'error');
          addLog('📋 [ACTION] System will automatically install Ubuntu...', 'info');
          addLog('💻 [COMMAND] Installation command: wsl --install -d Ubuntu', 'info');
          await installUbuntu();
          return; // Don't complete yet
        }
        
        // Check if Ubuntu exists in the distribution list
        const fullOutput = result?.stdout || '';
        const ubuntuPattern = /(ubuntu[^\s]*)/i;
        const ubuntuMatch = fullOutput.match(ubuntuPattern);
        
        if (ubuntuMatch || output.includes('ubuntu')) {
          const ubuntuDistroName = ubuntuMatch ? ubuntuMatch[1] : 'Ubuntu';
          addLog(`✅ [RESULT] Ubuntu is installed: ${ubuntuDistroName}`, 'success');
          
          // Check if Ubuntu is already the default
          addLog('🔍 [CHECK] Checking if Ubuntu is the default distribution...', 'info');
          const defaultResult = await window.cyberGuard.runWslCommand('--list --verbose', '');
          const defaultOutput = (defaultResult?.stdout || '').toLowerCase();
          
          // Check if Ubuntu is marked as default (usually has "*" or "Default" in the list)
          const isDefault = (defaultOutput.includes('*') && 
                           defaultOutput.includes('ubuntu') &&
                           defaultOutput.indexOf('*') < defaultOutput.indexOf('ubuntu')) ||
                           defaultOutput.includes('default') && defaultOutput.includes('ubuntu');
          
          if (!isDefault) {
            addLog(`📋 [ACTION] Setting Ubuntu (${ubuntuDistroName}) as default distribution...`, 'info');
            addLog(`💻 [COMMAND] Executing: wsl --set-default ${ubuntuDistroName}`, 'info');
            
            try {
              if (window.cyberGuard?.setDefaultWSLDistro) {
                const setDefaultResult = await window.cyberGuard.setDefaultWSLDistro(ubuntuDistroName);
                if (setDefaultResult?.success) {
                  addLog(`✅ [RESULT] Ubuntu (${ubuntuDistroName}) set as default distribution`, 'success');
                } else {
                  addLog(`⚠️ [WARNING] Could not set Ubuntu as default: ${setDefaultResult?.error || 'Unknown error'}`, 'warning');
                  addLog('📋 [INFO] Continuing anyway - Ubuntu is installed', 'info');
                }
              } else if (window.cyberGuard?.executeCommand) {
                // Fallback: use executeCommand
                const setDefaultCmd = await window.cyberGuard.executeCommand(`wsl --set-default ${ubuntuDistroName}`);
                if (setDefaultCmd?.success) {
                  addLog(`✅ [RESULT] Ubuntu (${ubuntuDistroName}) set as default distribution`, 'success');
                } else {
                  addLog(`⚠️ [WARNING] Could not set Ubuntu as default`, 'warning');
                }
              }
            } catch (error) {
              addLog(`⚠️ [WARNING] Error setting Ubuntu as default: ${error.message}`, 'warning');
              addLog('📋 [INFO] Continuing anyway - Ubuntu is installed', 'info');
            }
          } else {
            addLog('✅ [RESULT] Ubuntu is already the default distribution', 'success');
          }
          
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
          
          // Try to set Ubuntu as default
          addLog('📋 [ACTION] Setting Ubuntu as default distribution...', 'info');
          try {
            // Try to get Ubuntu distribution name from list
            if (window.cyberGuard?.listWSLDistributions) {
              const distros = await window.cyberGuard.listWSLDistributions();
              if (distros?.success && distros?.distributions) {
                const ubuntuDistro = distros.distributions.find(d => 
                  d.toLowerCase().includes('ubuntu')
                );
                if (ubuntuDistro && window.cyberGuard?.setDefaultWSLDistro) {
                  const setDefaultResult = await window.cyberGuard.setDefaultWSLDistro(ubuntuDistro);
                  if (setDefaultResult?.success) {
                    addLog(`✅ [RESULT] Ubuntu (${ubuntuDistro}) set as default`, 'success');
                  } else {
                    addLog(`⚠️ [WARNING] Could not set Ubuntu as default: ${setDefaultResult?.error || 'Unknown error'}`, 'warning');
                  }
                }
              }
            }
          } catch (error) {
            addLog(`⚠️ [WARNING] Could not set Ubuntu as default: ${error.message}`, 'warning');
          }
          
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

    // First, check if Ubuntu is already installed
    addLog('🔍 [CHECK] Checking if Ubuntu is already installed...', 'info');
    try {
      const alreadyInstalled = await window.cyberGuard?.verifyUbuntu?.();
      if (alreadyInstalled) {
        addLog('✅ [RESULT] Ubuntu is already installed!', 'success');
        setUbuntuInstalled(true);
        setProgress(100);
        setStatus('completed');
        setMessage('WSL and Ubuntu installation complete');
        addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
        onComplete();
        return;
      }
    } catch (error) {
      addLog(`⚠️ [WARNING] Could not verify existing installation: ${error.message}`, 'warning');
    }

    addLog('📦 [INSTALL] Installing Ubuntu distribution...', 'info');
    addLog('💻 [COMMAND] Executing: wsl --install -d Ubuntu', 'info');

    let installationFailed = false;
    let errorMessage = '';

    try {
      if (window.cyberGuard?.installUbuntu) {
        addLog('🔄 [PROCESS] Calling Ubuntu installation API...', 'info');
        const success = await window.cyberGuard.installUbuntu();
        
        if (success) {
          addLog('✅ [RESULT] Ubuntu installation command completed', 'success');
          addLog('⏳ [INFO] Ubuntu installation may take 5-10 minutes. Please wait...', 'info');
          addLog('📋 [NOTE] Installation is downloading from Microsoft Store in the background', 'info');
          
          // Wait a bit before first check (30 seconds)
          addLog('⏳ [WAIT] Waiting 30 seconds before first verification...', 'info');
          await new Promise(resolve => setTimeout(resolve, 30000));
          
          // Retry verification up to 15 times with increasing delays
          let hasUbuntu = false;
          let retryCount = 0;
          const maxRetries = 15; // Increased from 10
          
          while (!hasUbuntu && retryCount < maxRetries) {
            retryCount++;
            addLog(`🔍 [VERIFY] Verifying Ubuntu installation (attempt ${retryCount}/${maxRetries})...`, 'info');
            
            const verifyResult = await window.cyberGuard.verifyUbuntu?.();
            if (verifyResult) {
              hasUbuntu = true;
              
              // Set Ubuntu as default
              addLog('📋 [ACTION] Setting Ubuntu as default distribution...', 'info');
              try {
                if (window.cyberGuard?.listWSLDistributions) {
                  const distros = await window.cyberGuard.listWSLDistributions();
                  if (distros?.success && distros?.distributions) {
                    const ubuntuDistro = distros.distributions.find(d => 
                      d.toLowerCase().includes('ubuntu')
                    );
                    if (ubuntuDistro && window.cyberGuard?.setDefaultWSLDistro) {
                      const setDefaultResult = await window.cyberGuard.setDefaultWSLDistro(ubuntuDistro);
                      if (setDefaultResult?.success) {
                        addLog(`✅ [RESULT] Ubuntu (${ubuntuDistro}) set as default distribution`, 'success');
                      }
                    }
                  }
                }
              } catch (error) {
                addLog(`⚠️ [WARNING] Could not set Ubuntu as default: ${error.message}`, 'warning');
              }
              
              setUbuntuInstalled(true);
              setProgress(100);
              setStatus('completed');
              setMessage('WSL and Ubuntu installation complete');
              addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
              onComplete();
              return;
            } else {
              if (retryCount < maxRetries) {
                // Wait longer between retries (30 seconds instead of 15)
                const waitTime = 30000;
                addLog(`⏳ [WAIT] Ubuntu not found yet. Waiting ${waitTime/1000} seconds before next check...`, 'info');
                addLog('📋 [NOTE] Installation may still be in progress. Please be patient.', 'info');
                await new Promise(resolve => setTimeout(resolve, waitTime));
              }
            }
          }
          
          if (!hasUbuntu) {
            installationFailed = true;
            errorMessage = 'Ubuntu installation command completed but verification failed after multiple attempts. Installation may still be in progress - please wait a few more minutes and restart the application.';
          }
        } else {
          installationFailed = true;
          errorMessage = 'Ubuntu installation returned false';
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
              addLog('✅ [RESULT] Ubuntu installation command completed', 'success');
              addLog('⏳ [INFO] Ubuntu installation may take 5-10 minutes. Please wait...', 'info');
              addLog('📋 [NOTE] Installation is downloading from Microsoft Store in the background', 'info');
              
              // Wait much longer before first check (60 seconds)
              addLog('⏳ [WAIT] Waiting 60 seconds before first verification...', 'info');
              await new Promise(resolve => setTimeout(resolve, 60000));
              
              // Retry verification up to 15 times with increasing delays
              let hasUbuntu = false;
              let retryCount = 0;
              const maxRetries = 15;
              
              while (!hasUbuntu && retryCount < maxRetries) {
                retryCount++;
                addLog(`🔍 [VERIFY] Verifying Ubuntu installation (attempt ${retryCount}/${maxRetries})...`, 'info');
                
                const verifyResult = await window.cyberGuard.verifyUbuntu?.();
                if (verifyResult) {
                  hasUbuntu = true;
                  
                  // Set Ubuntu as default
                  addLog('📋 [ACTION] Setting Ubuntu as default distribution...', 'info');
                  try {
                    if (window.cyberGuard?.listWSLDistributions) {
                      const distros = await window.cyberGuard.listWSLDistributions();
                      if (distros?.success && distros?.distributions) {
                        const ubuntuDistro = distros.distributions.find(d => 
                          d.toLowerCase().includes('ubuntu')
                        );
                        if (ubuntuDistro && window.cyberGuard?.setDefaultWSLDistro) {
                          const setDefaultResult = await window.cyberGuard.setDefaultWSLDistro(ubuntuDistro);
                          if (setDefaultResult?.success) {
                            addLog(`✅ [RESULT] Ubuntu (${ubuntuDistro}) set as default distribution`, 'success');
                          }
                        }
                      }
                    }
                  } catch (error) {
                    addLog(`⚠️ [WARNING] Could not set Ubuntu as default: ${error.message}`, 'warning');
                  }
                  
                  setUbuntuInstalled(true);
                  setProgress(100);
                  setStatus('completed');
                  setMessage('WSL and Ubuntu installation complete');
                  addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
                  onComplete();
                  return;
                } else {
                  if (retryCount < maxRetries) {
                    // Wait longer between retries (30 seconds)
                    const waitTime = 30000;
                    addLog(`⏳ [WAIT] Ubuntu not found yet. Waiting ${waitTime/1000} seconds before next check...`, 'info');
                    addLog('📋 [NOTE] Installation may still be in progress. Please be patient.', 'info');
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                  }
                }
              }
              
              if (!hasUbuntu) {
                installationFailed = true;
                errorMessage = result?.error || 'Ubuntu installation completed but verification failed after multiple attempts. Installation may still be in progress - please wait a few more minutes and restart the application.';
              }
            } else {
              installationFailed = true;
              errorMessage = result?.error || 'Ubuntu installation failed';
            }
          } catch (error) {
            installationFailed = true;
            errorMessage = error.message || 'Ubuntu installation error';
            addLog(`❌ [ERROR] Ubuntu installation error: ${errorMessage}`, 'error');
          }
        } else {
          installationFailed = true;
          errorMessage = 'Command execution API not available';
        }
      }

      // If installation failed, show manual installation instructions
      if (installationFailed) {
        addLog('❌ [ERROR] Ubuntu auto-installation failed', 'error');
        addLog(`❌ [ERROR] ${errorMessage}`, 'error');
        addLog('📋 [MANUAL] Please install Ubuntu manually using the following steps:', 'info');
        addLog('1. Open PowerShell or Command Prompt as Administrator', 'info');
        addLog('2. Run the following command:', 'info');
        addLog('   wsl --install -d Ubuntu', 'info');
        addLog('3. Wait for the installation to complete (this may take several minutes)', 'info');
        addLog('4. After installation, restart this application', 'info');
        addLog('5. The system will automatically detect Ubuntu on next launch', 'info');
        
        setStatus('error');
        setMessage('Ubuntu installation failed - Manual installation required');
        setProgress(80);
        
        // Call onError with detailed message
        const manualInstallMessage = `Ubuntu auto-installation failed: ${errorMessage}\n\nPlease install Ubuntu manually:\n1. Open PowerShell or Command Prompt as Administrator\n2. Run: wsl --install -d Ubuntu\n3. Wait for installation to complete\n4. Restart this application`;
        onError(manualInstallMessage);
      } else {
        // Installation succeeded
        setProgress(100);
        setStatus('completed');
        setMessage('WSL and Ubuntu installation complete');
        addLog('✅ [COMPLETE] Step 1 completed successfully!', 'success');
        onComplete();
      }
    } catch (error) {
      addLog(`❌ [ERROR] Ubuntu installation error: ${error.message}`, 'error');
      addLog('📋 [MANUAL] Please install Ubuntu manually using the following steps:', 'info');
      addLog('1. Open PowerShell or Command Prompt as Administrator', 'info');
      addLog('2. Run the following command:', 'info');
      addLog('   wsl --install -d Ubuntu', 'info');
      addLog('3. Wait for the installation to complete (this may take several minutes)', 'info');
      addLog('4. After installation, restart this application', 'info');
      addLog('5. The system will automatically detect Ubuntu on next launch', 'info');
      
      setStatus('error');
      setMessage('Ubuntu installation failed - Manual installation required');
      setProgress(80);
      
      const manualInstallMessage = `Ubuntu installation failed: ${error.message}\n\nPlease install Ubuntu manually:\n1. Open PowerShell or Command Prompt as Administrator\n2. Run: wsl --install -d Ubuntu\n3. Wait for installation to complete\n4. Restart this application`;
      onError(manualInstallMessage);
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

  // Get the latest error log entry for manual installation instructions
  const errorLogs = logs.filter(log => log.type === 'error' || log.message.includes('[MANUAL]'));
  const manualInstallLogs = logs.filter(log => log.message.includes('[MANUAL]') || log.message.includes('wsl --install -d Ubuntu'));

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

      {/* Error Message with Manual Installation Instructions */}
      {status === 'error' && errorLogs.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-semibold text-red-900 dark:text-red-200 mb-2">
                Ubuntu Installation Failed
              </h4>
              <p className="text-sm text-red-800 dark:text-red-300 mb-3">
                Auto-installation failed. Please install Ubuntu manually using the steps below:
              </p>
              
              {/* Manual Installation Steps */}
              <div className="bg-white dark:bg-gray-800 rounded-md p-3 space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">1.</span>
                  <span className="text-gray-700 dark:text-gray-300">Open PowerShell or Command Prompt as Administrator</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">2.</span>
                  <span className="text-gray-700 dark:text-gray-300">Run the following command:</span>
                </div>
                <div className="ml-6 bg-gray-900 dark:bg-black rounded p-2 font-mono text-green-400 border border-gray-700">
                  wsl --install -d Ubuntu
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">3.</span>
                  <span className="text-gray-700 dark:text-gray-300">Wait for the installation to complete (this may take several minutes)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">4.</span>
                  <span className="text-gray-700 dark:text-gray-300">After installation, restart this application</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">5.</span>
                  <span className="text-gray-700 dark:text-gray-300">The system will automatically detect Ubuntu on next launch</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Step1WslInstallation;

