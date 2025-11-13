import React, { useState, useEffect } from 'react';
import ProgressBarWithCount from '../shared/ProgressBarWithCount';
import { CheckCircle, Loader2, Folder } from 'lucide-react';

/**
 * Step 3: Cyberix Folder Setup Component
 * Creates /root/cyberix folder and installs required repositories
 */
const Step3CyberixFolder = ({ username, password, onComplete, onError, onLog }) => {
  const [status, setStatus] = useState('checking'); // checking, creating, cloning, setting-up, completed, error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Checking Cyberix folder...');
  const [currentSubStep, setCurrentSubStep] = useState('');
  const [installedCount, setInstalledCount] = useState(0);
  const [totalCount, setTotalCount] = useState(3); // fluxploider, testssl, venv

  const addLog = (message, type = 'info') => {
    // Send to parent component's log
    if (onLog) {
      onLog(message, type);
    }
  };

  useEffect(() => {
    if (username && password) {
      setupCyberixFolder();
    } else {
      addLog('Waiting for WSL credentials...', 'info');
    }
  }, [username, password]);

  /**
   * Main setup function
   */
  const setupCyberixFolder = async () => {
    try {
      addLog('Starting Cyberix folder setup...', 'info');
      addLog('Getting root access...', 'info');

      // Step 1: Get root access and navigate to root
      setStatus('checking');
      setProgress(10);
      setMessage('Getting root access...');
      
      const rootAccessResult = await getRootAccess();
      if (!rootAccessResult.success) {
        throw new Error('Failed to get root access');
      }

      addLog('✅ Root access obtained', 'success');

      // Step 2: Check if cyberix folder exists
      setProgress(20);
      setMessage('Checking for cyberix folder...');
      addLog('Navigating to root directory (cd /)', 'info');
      addLog('Checking if cyberix folder exists (ls)', 'info');

      const folderCheckResult = await checkCyberixFolder();
      
      if (!folderCheckResult.exists) {
        addLog('Cyberix folder not found. Creating it...', 'info');
        await createCyberixFolder();
      } else {
        addLog('✅ Cyberix folder already exists', 'success');
      }

      // Step 3: Check and install required folders
      setProgress(30);
      setMessage('Checking required folders...');
      addLog('📋 [INFO] Listing folders in /root/cyberix', 'info');

      const foldersCheck = await checkRequiredFolders();
      
      // Count already installed folders
      let alreadyInstalled = 0;
      if (foldersCheck.fluxploider) alreadyInstalled++;
      if (foldersCheck.testssl) alreadyInstalled++;
      if (foldersCheck.venv) alreadyInstalled++;
      
      setInstalledCount(alreadyInstalled);
      addLog(`📊 [STATUS] Found ${alreadyInstalled}/${totalCount} folders already installed`, 'info');
      
      // Install missing folders
      let currentInstalled = alreadyInstalled;
      
      if (!foldersCheck.fluxploider) {
        currentInstalled++;
        setCurrentSubStep(`Installing fluxploider... (${currentInstalled}/${totalCount} installed)`);
        addLog(`📦 [INSTALL] Starting installation of fluxploider (${currentInstalled}/${totalCount})...`, 'info');
        await installFluxploider();
        setInstalledCount(currentInstalled);
        setProgress(30 + (currentInstalled / totalCount) * 50); // 30-80% for folder installation
        addLog(`✅ [COMPLETE] fluxploider installed (${currentInstalled}/${totalCount} folders)`, 'success');
      } else {
        addLog('✅ [SKIP] fluxploider already installed', 'info');
      }

      if (!foldersCheck.testssl) {
        currentInstalled++;
        setCurrentSubStep(`Installing testssl... (${currentInstalled}/${totalCount} installed)`);
        addLog(`📦 [INSTALL] Starting installation of testssl (${currentInstalled}/${totalCount})...`, 'info');
        await installTestssl();
        setInstalledCount(currentInstalled);
        setProgress(30 + (currentInstalled / totalCount) * 50); // 30-80% for folder installation
        addLog(`✅ [COMPLETE] testssl installed (${currentInstalled}/${totalCount} folders)`, 'success');
      } else {
        addLog('✅ [SKIP] testssl already installed', 'info');
      }

      if (!foldersCheck.venv) {
        currentInstalled++;
        setCurrentSubStep(`Setting up Python venv... (${currentInstalled}/${totalCount} installed)`);
        addLog(`📦 [INSTALL] Starting setup of Python venv (${currentInstalled}/${totalCount})...`, 'info');
        await setupPythonVenv();
        setInstalledCount(currentInstalled);
        setProgress(30 + (currentInstalled / totalCount) * 50); // 30-80% for folder installation
        addLog(`✅ [COMPLETE] Python venv setup complete (${currentInstalled}/${totalCount} folders)`, 'success');
      } else {
        addLog('✅ [SKIP] Python venv already exists', 'info');
      }
      
      // Update final count
      setInstalledCount(currentInstalled);

      // Step 4: Verify installation
      setProgress(90);
      setMessage('Verifying installation...');
      await verifyInstallation();

      setProgress(100);
      setStatus('completed');
      setMessage('Cyberix folder setup complete');
      addLog('✅ Step 3 completed successfully!', 'success');
      onComplete();
    } catch (error) {
      addLog(`Error: ${error.message}`, 'error');
      setStatus('error');
      setMessage('Setup failed');
      onError(error);
    }
  };

  /**
   * Get root access via WSL
   * This verifies we can get root access (like: wsl -> sudo su -> root@)
   */
  const getRootAccess = async () => {
    try {
      addLog('🔐 [ROOT ACCESS] Getting root access via WSL...', 'info');
      addLog('💻 [COMMAND] Executing: wsl -u root bash -c "echo \'***\' | sudo -S whoami"', 'info');
      addLog('📋 [INFO] This simulates: wsl -> sudo su -> root@', 'info');
      
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('❌ [ERROR] WSL command API not available', 'error');
        return { success: false, error: 'WSL command API not available' };
      }

      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(username, 'whoami', password);
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
      }
      
      if (result?.success && result.stdout && result.stdout.trim() === 'root') {
        addLog('✅ [RESULT] Root access verified successfully', 'success');
        addLog('✅ [STATUS] We now have root@ access (like: root@DESKTOP-PE1CVH1)', 'success');
        return { success: true };
      }
      addLog('❌ [RESULT] Root access verification failed', 'error');
      return { success: false, error: 'Root access verification failed' };
    } catch (error) {
      addLog(`❌ [ERROR] Root access error: ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  };

  /**
   * Check if cyberix folder exists in /root/cyberix
   * After getting root access, we check if /root/cyberix exists
   */
  const checkCyberixFolder = async () => {
    try {
      addLog('🔍 [FOLDER CHECK] Checking for cyberix folder in /root/cyberix...', 'info');
      addLog('💻 [COMMAND] Executing: test -d /root/cyberix', 'info');
      
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('❌ [ERROR] WSL command API not available', 'error');
        return { exists: false };
      }

      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username, 
        'test -d /root/cyberix && echo exists || echo notfound', 
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
      }
      
      const exists = result.stdout?.includes('exists') || false;
      
      if (exists) {
        addLog('✅ [RESULT] Cyberix folder found at /root/cyberix', 'success');
      } else {
        addLog('❌ [RESULT] Cyberix folder not found at /root/cyberix', 'info');
        addLog('📋 [ACTION] System will create the folder...', 'info');
      }
      
      return { exists };
    } catch (error) {
      addLog(`❌ [ERROR] Error checking folder: ${error.message}`, 'warning');
      return { exists: false };
    }
  };

  /**
   * Create cyberix folder
   * After getting root access (root@), we create /root/cyberix directly
   * Note: /root is the root user's home directory, /root/cyberix is where we install
   */
  const createCyberixFolder = async () => {
    setStatus('creating');
    setProgress(25);
    addLog('📦 [CREATE] Creating /root/cyberix folder...', 'info');
    addLog('💻 [COMMAND] Executing: mkdir -p /root/cyberix', 'info');
    addLog('📋 [INFO] We have root@ access, creating folder in root user home directory', 'info');

    try {
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        throw new Error('WSL command API not available');
      }

      // Create the folder - mkdir -p will create parent directories if needed
      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'mkdir -p /root/cyberix',
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
      }
      
      if (result?.success !== false) {
        addLog('✅ [RESULT] Cyberix folder created successfully at /root/cyberix', 'success');
      } else {
        throw new Error(result?.error || 'Failed to create folder');
      }
    } catch (error) {
      addLog(`❌ [ERROR] Failed to create folder: ${error.message}`, 'error');
      throw new Error(`Failed to create folder: ${error.message}`);
    }
  };

  /**
   * Check required folders
   * Navigate to cyberix folder and list contents
   */
  const checkRequiredFolders = async () => {
    try {
      addLog('🔍 [FOLDER CHECK] Checking required folders in /root/cyberix...', 'info');
      addLog('💻 [COMMAND] Navigating: cd /root/cyberix', 'info');
      addLog('💻 [COMMAND] Listing: ls', 'info');
      
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('❌ [ERROR] WSL command API not available', 'error');
        return { fluxploider: false, testssl: false, venv: false };
      }

      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && ls',
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
      }
      
      const output = (result?.stdout || '').toLowerCase();

      const hasFluxploider = output.includes('fluxploider');
      const hasTestssl = output.includes('testssl');
      const hasVenv = output.includes('.venv') || output.includes('venv');

      if (hasFluxploider) addLog('✅ [RESULT] fluxploider folder found', 'success');
      else addLog('❌ [RESULT] fluxploider folder not found', 'warning');

      if (hasTestssl) addLog('✅ [RESULT] testssl folder found', 'success');
      else addLog('❌ [RESULT] testssl folder not found', 'warning');

      if (hasVenv) addLog('✅ [RESULT] venv folder found', 'success');
      else addLog('❌ [RESULT] venv folder not found', 'warning');

      return {
        fluxploider: hasFluxploider,
        testssl: hasTestssl,
        venv: hasVenv
      };
    } catch (error) {
      addLog(`❌ [ERROR] Error checking folders: ${error.message}`, 'warning');
      return { fluxploider: false, testssl: false, venv: false };
    }
  };

  /**
   * Install fluxploider
   */
  const installFluxploider = async () => {
    setStatus('cloning');
    setProgress(40);
    addLog('📦 [INSTALL] Cloning fluxploider repository...', 'info');
    addLog('💻 [COMMAND] Executing: cd /root/cyberix && git clone https://github.com/almandin/fuxploider.git fluxploider', 'info');

    try {
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('⚠️ [WARNING] WSL command API not available', 'warning');
        return;
      }

      addLog('⏳ [INFO] Cloning repository (this may take a minute)...', 'info');
      addLog('⏳ [WAIT] Executing git clone command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && git clone https://github.com/almandin/fuxploider.git fluxploider',
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
        addLog('✅ [RESULT] fluxploider cloned successfully', 'success');
      } else {
        addLog(`⚠️ [WARNING] fluxploider clone warning: ${result?.error || 'Unknown error'}`, 'warning');
      }
      setProgress(50);
    } catch (error) {
      addLog(`⚠️ [WARNING] fluxploider clone warning: ${error.message}`, 'warning');
      // Continue anyway
    }
  };

  /**
   * Install testssl
   */
  const installTestssl = async () => {
    setStatus('cloning');
    setProgress(60);
    addLog('📦 [INSTALL] Cloning testssl repository...', 'info');
    addLog('💻 [COMMAND] Executing: cd /root/cyberix && git clone https://github.com/drwetter/testssl.sh.git testssl', 'info');

    try {
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('⚠️ [WARNING] WSL command API not available', 'warning');
        return;
      }

      addLog('⏳ [INFO] Cloning repository (this may take a minute)...', 'info');
      addLog('⏳ [WAIT] Executing git clone command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && git clone https://github.com/drwetter/testssl.sh.git testssl',
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
        addLog('✅ [RESULT] testssl cloned successfully', 'success');
      } else {
        addLog(`⚠️ [WARNING] testssl clone warning: ${result?.error || 'Unknown error'}`, 'warning');
      }
      setProgress(70);
    } catch (error) {
      addLog(`⚠️ [WARNING] testssl clone warning: ${error.message}`, 'warning');
      // Continue anyway
    }
  };

  /**
   * Setup Python virtual environment
   */
  const setupPythonVenv = async () => {
    setStatus('setting-up');
    setProgress(75);
    addLog('🐍 [PYTHON] Setting up Python virtual environment...', 'info');

    try {
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('⚠️ [WARNING] WSL command API not available', 'warning');
        return;
      }

      // Check if venv exists
      addLog('🔍 [CHECK] Checking if Python venv exists...', 'info');
      addLog('💻 [COMMAND] Executing: cd /root/cyberix && test -d .venv && echo exists || echo notexists', 'info');
      
      addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
      const checkResult = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && test -d .venv && echo exists || echo notexists',
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (checkResult?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${checkResult.stdout.trim()}`, 'info');
      }
      if (checkResult?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${checkResult.stderr.trim()}`, 'warning');
      }
      addLog(`📊 [RESULT] Check result: ${checkResult?.stdout?.trim() || 'N/A'}`, 'info');
      
      if (checkResult?.stdout?.includes('exists')) {
        addLog('✅ [RESULT] Python venv already exists, skipping creation', 'info');
      } else {
        addLog('📦 [CREATE] Creating Python virtual environment...', 'info');
        addLog('💻 [COMMAND] Executing: cd /root/cyberix && python3 -m venv .venv', 'info');
        
        // Create venv
        addLog('⏳ [WAIT] Executing command in WSL terminal...', 'info');
        const createResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          'cd /root/cyberix && python3 -m venv .venv',
          password
        );
        
        addLog('📥 [RESPONSE] Command execution completed', 'info');
        if (createResult?.stdout) {
          addLog(`📤 [TERMINAL OUTPUT] stdout:\n${createResult.stdout.trim()}`, 'info');
        }
        if (createResult?.stderr) {
          addLog(`📤 [TERMINAL OUTPUT] stderr:\n${createResult.stderr.trim()}`, 'warning');
        }
        
        addLog('✅ [RESULT] Virtual environment created', 'success');

        // Upgrade pip
        addLog('📦 [UPGRADE] Upgrading pip...', 'info');
        addLog('💻 [COMMAND] Executing: cd /root/cyberix && source .venv/bin/activate && pip3 install --upgrade pip setuptools wheel', 'info');
        
        addLog('⏳ [WAIT] Executing pip upgrade command in WSL terminal...', 'info');
        const pipResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          'cd /root/cyberix && source .venv/bin/activate && pip3 install --upgrade pip setuptools wheel',
          password
        );
        
        addLog('📥 [RESPONSE] Command execution completed', 'info');
        if (pipResult?.stdout) {
          addLog(`📤 [TERMINAL OUTPUT] stdout:\n${pipResult.stdout}`, 'info');
        }
        if (pipResult?.stderr) {
          addLog(`📤 [TERMINAL OUTPUT] stderr:\n${pipResult.stderr}`, 'warning');
        }
        
        addLog('✅ [RESULT] Pip upgraded successfully', 'success');
      }

      setProgress(85);
    } catch (error) {
      addLog(`⚠️ [WARNING] Python venv setup warning: ${error.message}`, 'warning');
      // Continue anyway
    }
  };

  /**
   * Verify installation
   */
  const verifyInstallation = async () => {
    addLog('🔍 [VERIFY] Verifying installation...', 'info');
    addLog('💻 [COMMAND] Executing: cd /root/cyberix && ls -la', 'info');

    try {
      if (!window.cyberGuard?.runWslCommandAsRoot) {
        addLog('⚠️ [WARNING] WSL command API not available', 'warning');
        return;
      }

      addLog('⏳ [WAIT] Executing verification command in WSL terminal...', 'info');
      const result = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && ls -la',
        password
      );
      
      addLog('📥 [RESPONSE] Command execution completed', 'info');
      if (result?.stdout) {
        addLog(`📤 [TERMINAL OUTPUT] stdout:\n${result.stdout.trim()}`, 'info');
      }
      if (result?.stderr) {
        addLog(`📤 [TERMINAL OUTPUT] stderr:\n${result.stderr.trim()}`, 'warning');
      }

      const output = (result?.stdout || '').toLowerCase();
      const hasFluxploider = output.includes('fluxploider');
      const hasTestssl = output.includes('testssl');
      const hasVenv = output.includes('.venv') || output.includes('venv');

      if (hasFluxploider && hasTestssl && hasVenv) {
        addLog('✅ [RESULT] All required folders are present', 'success');
      } else {
        addLog('⚠️ [WARNING] Some folders may be missing, but continuing...', 'warning');
      }
    } catch (error) {
      addLog(`❌ [ERROR] Verification error: ${error.message}`, 'warning');
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <Loader2 className="w-5 h-5 text-red-500 animate-spin" />;
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
            Cyberix Folder Setup
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {currentSubStep || message}
          </p>
        </div>
      </div>

      {/* Progress Bar - Folders Installation */}
      <ProgressBarWithCount
        current={installedCount}
        total={totalCount}
        label="Folders Installed"
        status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active'}
      />
      
      {/* Overall Progress Bar */}
      <div className="mt-4">
        <ProgressBarWithCount
          current={progress}
          total={100}
          label="Overall Setup Progress"
          status={status === 'completed' ? 'completed' : status === 'error' ? 'error' : 'active'}
        />
      </div>
    </div>
  );
};

export default Step3CyberixFolder;

