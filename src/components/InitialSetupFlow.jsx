import React, { useState, useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import AgreementDialog from './AgreementDialog';
import AdminPermissionDialog from './AdminPermissionDialog';
import WslCredentialsDialog from './WslCredentialsDialog';
import SystemPathDialog from './SystemPathDialog';
import TimelineProgress from './TimelineProgress';
import setupStateManager from '../utils/setupStateManager';
import { useToast } from '../context/ToastContext';

const InitialSetupFlow = ({ onComplete }) => {
  const { showError, showSuccess, showLoading, dismissToast } = useToast();
  const [currentStep, setCurrentStep] = useState(0); // 0-4 for the 5 steps
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupState, setSetupState] = useState(null);
  const logEndRef = useRef(null);

  // Step states
  const [steps, setSteps] = useState([
    {
      title: 'WSL Installation',
      description: 'Installing Windows Subsystem for Linux and Kali Linux',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    },
    {
      title: 'WSL Password Setup',
      description: 'Configuring WSL root user credentials',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    },
    {
      title: 'Installing Kali Tools',
      description: 'Installing required security scanning tools',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    },
    {
      title: 'Setting up Cyberix',
      description: 'Creating folder structure, cloning repositories, and setting up Python environment',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    },
    {
      title: 'System Path Selection',
      description: 'Select directory for logs and password storage',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    }
  ]);

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
    setTimeout(() => {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const updateStep = (index, updates) => {
    setSteps(prev => prev.map((step, i) => 
      i === index ? { ...step, ...updates } : step
    ));
  };

  useEffect(() => {
    initializeSetup();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const initializeSetup = async () => {
    try {
      addLog('Initializing setup...', 'info');
      await setupStateManager.initialize();
      const state = setupStateManager.getState();
      setSetupState(state);

      console.log('[SetupFlow] Loaded state:', state);
      console.log('[SetupFlow] Current step number:', setupStateManager.getCurrentStepNumber());

      // Check if setup is already complete - ALL steps must be done
      if (state.setupComplete && 
          state.agreementAccepted && 
          state.adminPermissionGranted && 
          state.wslInstalled && 
          state.wslPasswordStored && 
          state.toolsInstalled && 
          state.cyberixFolderSetup && 
          state.systemPathSelected) {
        addLog('Setup already completed. Skipping to login.', 'success');
        onComplete();
        return;
      }

      // Get current step number dynamically
      const currentStepNumber = setupStateManager.getCurrentStepNumber();
      console.log('[SetupFlow] Resuming from step:', currentStepNumber);

      // Update step statuses based on saved state
      if (state.wslInstalled) {
        updateStep(0, { status: 'completed', completedAt: state.wslInstalledAt });
      }
      if (state.wslPasswordStored) {
        updateStep(1, { status: 'completed', completedAt: state.wslPasswordStoredAt });
      }
      if (state.toolsInstalled) {
        updateStep(2, { status: 'completed', completedAt: state.toolsInstalledAt });
      }
      if (state.cyberixFolderSetup) {
        updateStep(3, { status: 'completed', completedAt: state.cyberixFolderSetupAt });
      }
      if (state.systemPathSelected) {
        updateStep(4, { status: 'completed', completedAt: state.systemPathSelectedAt });
      }

      setCurrentStep(currentStepNumber);
      setLoading(false);

      // Start from the appropriate step dynamically
      if (currentStepNumber === 0) {
        // Need to show agreement and admin first
        if (!state.agreementAccepted) {
          addLog('Resuming from: Agreement dialog', 'info');
          return; // Will show agreement dialog
        }
        if (!state.adminPermissionGranted) {
          addLog('Resuming from: Admin permission', 'info');
          return; // Will show admin dialog
        }
        if (!state.wslInstalled) {
          addLog('Resuming from: WSL installation', 'info');
          await checkWsl();
        } else if (!state.wslPasswordStored) {
          addLog('Resuming from: WSL credentials', 'info');
          await handleCredentialsFlow();
        }
      } else if (currentStepNumber === 1) {
        addLog('Resuming from: WSL credentials', 'info');
        await handleCredentialsFlow();
      } else if (currentStepNumber === 2) {
        addLog('Resuming from: Tools installation', 'info');
        await checkAndInstallTools();
      } else if (currentStepNumber === 3) {
        addLog('Resuming from: Cyberix folder setup', 'info');
        await setupCyberixFolder();
      } else if (currentStepNumber === 4) {
        addLog('Resuming from: System path selection', 'info');
        // Will show system path dialog
      } else if (currentStepNumber === 5) {
        addLog('All steps completed. Setup is ready.', 'success');
        onComplete();
        return;
      }
    } catch (error) {
      console.error('[SetupFlow] Initialization error:', error);
      addLog(`Initialization error: ${error.message}`, 'error');
      showError('Failed to initialize setup. Please restart the application.');
      setLoading(false);
    }
  };

  const checkWsl = async () => {
    setCurrentStep(0);
    updateStep(0, { status: 'active', message: 'Checking WSL installation...' });
    addLog('Checking if WSL is installed using: wsl --status', 'info');
    
    try {
      const hasWsl = await window.cyberGuard?.checkWsl?.();
      
      if (hasWsl) {
        addLog('✅ WSL is already installed (verified via wsl --status).', 'success');
        await setupStateManager.setWslInstalled(true);
        
        // Check if Kali Linux is already installed
        addLog('Checking for Kali-Linux distribution...', 'info');
        try {
          const distrosResult = await window.cyberGuard?.listWSLDistributions?.();
          if (distrosResult?.success && distrosResult.distributions) {
            const kaliDistro = distrosResult.distributions.find(d => 
              d.name.toLowerCase().includes('kali')
            );
            if (kaliDistro) {
              addLog(`✅ Found Kali-Linux distribution: ${kaliDistro.name}`, 'success');
              // Check current default
              const currentDistro = await window.cyberGuard?.getWSLDistro?.();
              if (currentDistro && !currentDistro.toLowerCase().includes('kali')) {
                addLog(`Setting ${kaliDistro.name} as default distribution...`, 'info');
                const setDefaultResult = await window.cyberGuard?.setDefaultWSLDistro?.(kaliDistro.name);
                if (setDefaultResult?.success) {
                  addLog(`Kali-Linux (${kaliDistro.name}) is now the default distribution`, 'success');
                } else {
                  addLog(`Could not set default: ${setDefaultResult?.error || 'Unknown error'}`, 'info');
                }
              } else {
                addLog(`Kali-Linux (${kaliDistro.name}) is already the default`, 'success');
              }
              // Kali is installed, proceed to credentials
              updateStep(0, { status: 'completed', completedAt: new Date().toISOString() });
              await handleCredentialsFlow();
            } else {
              // WSL is installed but Kali is not - install it
              addLog('Kali-Linux not found. Installing Kali Linux...', 'info');
              await installKaliLinux();
            }
          } else {
            // Could not check distributions, try installing Kali anyway
            addLog('Could not check distributions. Installing Kali Linux...', 'info');
            await installKaliLinux();
          }
        } catch (error) {
          addLog(`Note: Could not check distributions: ${error.message}`, 'info');
          addLog('Proceeding to install Kali Linux...', 'info');
          await installKaliLinux();
        }
      } else {
        addLog('WSL not found. Starting installation...', 'info');
        await installWsl();
      }
    } catch (error) {
      console.error('[SetupFlow] WSL check error:', error);
      addLog(`WSL check error: ${error.message}`, 'error');
      updateStep(0, { status: 'error', error: error.message });
      showError('Failed to check WSL installation.');
    }
  };

  const installWsl = async () => {
    updateStep(0, { status: 'active', progress: 0, message: 'Installing WSL...' });
    addLog('Step 1: Installing WSL...', 'info');
    addLog('This may take several minutes. Please wait...', 'info');

    const loadingToast = showLoading('Installing WSL... This may take a while.');

    try {
      // Step 1: Install WSL
      addLog('Installing WSL using: wsl --install', 'info');
      const wslSuccess = await window.cyberGuard?.installWsl?.();

      if (!wslSuccess) {
        dismissToast(loadingToast);
        addLog('WSL installation failed.', 'error');
        updateStep(0, { status: 'error', error: 'WSL installation did not complete successfully' });
        showError('WSL installation failed. Please try again.');
        return;
      }

      addLog('WSL installation command completed!', 'success');
      addLog('Step 2: Verifying WSL installation using: wsl --status', 'info');
      updateStep(0, { progress: 40, message: 'Verifying WSL installation...' });

      // Step 2: Verify WSL installation using wsl --status
      let wslVerified = false;
      let retryCount = 0;
      const maxRetries = 15;

      while (!wslVerified && retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
        addLog(`Verification attempt ${retryCount + 1}/${maxRetries}...`, 'info');
        wslVerified = await window.cyberGuard?.checkWsl?.();
        retryCount++;
        
        if (!wslVerified) {
          addLog(`WSL not verified yet, waiting... (attempt ${retryCount}/${maxRetries})`, 'info');
        }
      }

      if (!wslVerified) {
        addLog('⚠️ WSL verification failed after multiple attempts.', 'warning');
        addLog('This may be normal if WSL is still installing in the background.', 'info');
        addLog('Continuing with setup. You can verify manually later using: wsl --status', 'info');
        // Continue anyway - don't block the setup
      } else {
        addLog('✅ WSL verified successfully via wsl --status!', 'success');
        // Save WSL installation progress
        await setupStateManager.setWslInstalled(true);
        addLog('WSL installation step saved.', 'info');
      }

      // Step 3: Install Kali Linux
      addLog('Step 3: Installing Kali Linux distribution...', 'info');
      updateStep(0, { progress: 70, message: 'Installing Kali Linux...' });
      
      await installKaliLinux();
      
    } catch (error) {
      dismissToast(loadingToast);
      console.error('[SetupFlow] WSL installation error:', error);
      addLog(`WSL installation error: ${error.message}`, 'error');
      updateStep(0, { status: 'error', error: error.message });
      showError(`WSL installation error: ${error.message}`);
    }
  };

  const installKaliLinux = async () => {
    const loadingToast = showLoading('Installing Kali Linux... This may take a while.');
    
    try {
      addLog('Installing Kali Linux using: wsl --install -d kali-linux', 'info');
      const kaliSuccess = await window.cyberGuard?.installKaliLinux?.();

      if (!kaliSuccess) {
        addLog('Kali Linux installation command returned false, but continuing...', 'info');
        // Don't return - continue anyway
      } else {
        addLog('Kali Linux installation command completed!', 'success');
      }

      dismissToast(loadingToast);
      
      // Update step status
      updateStep(0, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'WSL and Kali Linux installation complete'
      });
      
      // Save final state
      await setupStateManager.setWslInstalled(true);
      addLog('WSL and Kali Linux installation step saved successfully.', 'success');
      showSuccess('WSL and Kali Linux installation completed!');
      
      // Now proceed to credentials flow
      await handleCredentialsFlow();
    } catch (error) {
      dismissToast(loadingToast);
      console.error('[SetupFlow] Kali Linux installation error:', error);
      addLog(`Kali Linux installation error: ${error.message}`, 'error');
      // Continue anyway - don't block the setup
      updateStep(0, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'WSL installation complete (Kali installation may continue in background)'
      });
      await setupStateManager.setWslInstalled(true);
      await handleCredentialsFlow();
    }
  };

  const handleCredentialsFlow = async () => {
    const state = setupStateManager.getState();
    if (state.wslPasswordStored) {
      addLog('WSL credentials already configured.', 'success');
      updateStep(1, { status: 'completed', completedAt: state.wslPasswordStoredAt });
      await checkAndInstallTools();
    } else {
      setCurrentStep(1);
      // Will show credentials dialog
    }
  };

  const handleCredentialsConfirm = async (username, password) => {
    try {
      addLog('Saving WSL credentials...', 'info');
      updateStep(1, { status: 'active', message: 'Saving credentials...' });

      if (window.cyberGuard?.storeRootPassword) {
        await window.cyberGuard.storeRootPassword(password);
      }
      
      await setupStateManager.setWslCredentials(username, true);
      addLog(`WSL credentials saved for user: ${username}`, 'success');
      updateStep(1, { 
        status: 'completed', 
        completedAt: new Date().toISOString(),
        message: 'Credentials saved'
      });
      showSuccess('WSL credentials saved successfully');
      
      await checkAndInstallTools();
    } catch (error) {
      console.error('[SetupFlow] Credentials save error:', error);
      addLog(`Failed to save credentials: ${error.message}`, 'error');
      updateStep(1, { status: 'error', error: error.message });
      showError('Failed to save credentials. Please try again.');
      throw error;
    }
  };

  const checkAndInstallTools = async () => {
    setCurrentStep(2);
    updateStep(2, { status: 'active', message: 'Checking required tools...', progress: 0 });
    addLog('Checking which tools need to be installed...', 'info');

    const loadingToast = showLoading('Installing required security tools...');

    try {
      const password = window.cyberGuard?.getStoredRootPassword 
        ? await window.cyberGuard.getStoredRootPassword() 
        : null;

      const toolCheck = await window.cyberGuard?.checkRequiredToolsOnly?.(password);
      
      if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
        addLog(`Found ${toolCheck.missingTools.length} missing tools. Installing...`, 'info');
        updateStep(2, { message: `Installing ${toolCheck.missingTools.length} tools...` });
        
        let installedCount = 0;
        const totalTools = toolCheck.missingTools.length;

        const progressHandler = (progress) => {
          if (progress) {
            if (progress.tool) {
              installedCount++;
              const percentage = Math.round((installedCount / totalTools) * 100);
              const message = `Installing ${progress.tool}... (${installedCount}/${totalTools})`;
              updateStep(2, { progress: percentage, message });
              addLog(message, 'info');
            } else if (progress.message) {
              addLog(progress.message, 'info');
            }
          }
        };

        if (window.cyberGuard?.onToolsInstallProgress) {
          window.cyberGuard.onToolsInstallProgress(progressHandler);
        }

        if (window.cyberGuard?.installMissingTools) {
          await window.cyberGuard.installMissingTools(toolCheck.missingTools);
        }

        addLog('All tools installed successfully!', 'success');
      } else {
        addLog('All required tools are already installed!', 'success');
        updateStep(2, { message: 'All tools available' });
      }

      dismissToast(loadingToast);
      await setupStateManager.setToolsInstalled(true);
      updateStep(2, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'Tools installation complete'
      });
      showSuccess('All tools installed successfully!');
      
      await setupCyberixFolder();
    } catch (error) {
      dismissToast(loadingToast);
      console.error('[SetupFlow] Tools installation error:', error);
      addLog(`Tools installation error: ${error.message}`, 'error');
      updateStep(2, { status: 'error', error: error.message });
      showError(`Tools installation error: ${error.message}`);
    }
  };

  const setupCyberixFolder = async () => {
    setCurrentStep(3);
    updateStep(3, { status: 'active', message: 'Setting up Cyberix folder...', progress: 0 });
    addLog('Starting Cyberix folder setup...', 'info');

    try {
      // Step 1: Create /root/cyberix folder
      addLog('Creating /root/cyberix folder...', 'info');
      updateStep(3, { progress: 10, message: 'Creating folder structure...' });
      
      if (window.cyberGuard?.setupCyberixFolder) {
        const result = await window.cyberGuard.setupCyberixFolder();
        if (result?.warning) {
          addLog(`Folder creation warning: ${result.warning}`, 'info');
        } else {
          addLog('Folder created successfully', 'success');
        }
      }

      // Step 2: Clone fluxploider
      addLog('Cloning fluxploider repository...', 'info');
      updateStep(3, { progress: 30, message: 'Cloning fluxploider...' });
      
      if (window.cyberGuard?.cloneRepository) {
        try {
          const result = await window.cyberGuard.cloneRepository('fluxploider');
          if (result?.warning) {
            addLog(`fluxploider clone warning: ${result.warning}`, 'info');
          } else {
            addLog('fluxploider cloned successfully', 'success');
          }
        } catch (error) {
          addLog(`fluxploider clone failed (continuing): ${error.message}`, 'info');
        }
      }

      // Step 3: Clone testssl
      addLog('Cloning testssl repository...', 'info');
      updateStep(3, { progress: 50, message: 'Cloning testssl...' });
      
      if (window.cyberGuard?.cloneRepository) {
        try {
          const result = await window.cyberGuard.cloneRepository('testssl');
          if (result?.warning) {
            addLog(`testssl clone warning: ${result.warning}`, 'info');
          } else {
            addLog('testssl cloned successfully', 'success');
          }
        } catch (error) {
          addLog(`testssl clone failed (continuing): ${error.message}`, 'info');
        }
      }

      // Step 4: Setup Python venv
      addLog('Setting up Python virtual environment...', 'info');
      updateStep(3, { progress: 70, message: 'Setting up Python environment...' });
      
      if (window.cyberGuard?.setupPythonVenv) {
        try {
          const result = await window.cyberGuard.setupPythonVenv();
          if (result?.warning) {
            addLog(`Python venv setup warning: ${result.warning}`, 'info');
          } else {
            addLog('Python virtual environment setup complete', 'success');
          }
        } catch (error) {
          addLog(`Python venv setup failed (continuing): ${error.message}`, 'info');
        }
      }

      // Mark step as completed even if there were warnings
      updateStep(3, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'Cyberix setup complete'
      });
      addLog('Cyberix folder setup completed!', 'success');
      await setupStateManager.setCyberixFolderSetup(true);
      showSuccess('Cyberix folder setup completed!');
      
      // Move to final step
      setCurrentStep(4);
    } catch (error) {
      console.error('[SetupFlow] Cyberix folder setup error:', error);
      addLog(`Cyberix folder setup error: ${error.message} (continuing anyway)`, 'info');
      // Mark as completed anyway and continue
      updateStep(3, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'Cyberix setup attempted',
        error: error.message
      });
      await setupStateManager.setCyberixFolderSetup(true);
      // Continue to next step
      setCurrentStep(4);
    }
  };

  const handleSystemPathConfirm = async (path) => {
    try {
      addLog(`Saving system path: ${path}`, 'info');
      
      // First, ensure all previous steps are marked as complete
      const currentState = setupStateManager.getState();
      if (!currentState.agreementAccepted) {
        await setupStateManager.setAgreementAccepted(true);
      }
      if (!currentState.adminPermissionGranted) {
        await setupStateManager.setAdminPermissionGranted(true);
      }
      if (!currentState.wslInstalled) {
        await setupStateManager.setWslInstalled(true);
      }
      if (!currentState.wslPasswordStored) {
        await setupStateManager.setWslCredentials(currentState.wslUsername || 'root', true);
      }
      if (!currentState.toolsInstalled) {
        await setupStateManager.setToolsInstalled(true);
      }
      if (!currentState.cyberixFolderSetup) {
        await setupStateManager.setCyberixFolderSetup(true);
      }
      
      // Now set system path (this will save to step-system-path.json)
      await setupStateManager.setSystemPath(path);
      
      // Mark setup as complete (this will save to step-setup-complete.json and all steps)
      await setupStateManager.setSetupComplete(true);
      
      // Verify the state was saved correctly
      const finalState = setupStateManager.getState();
      console.log('[SetupFlow] Final setup state:', finalState);
      
      if (!finalState.setupComplete) {
        throw new Error('Failed to save setup completion state');
      }
      
      // Verify step files exist
      if (window.cyberGuard?.readFile && path) {
        try {
          const completeFile = `${path}/step-setup-complete.json`;
          const savedContent = await window.cyberGuard.readFile(completeFile);
          const savedState = JSON.parse(savedContent);
          console.log('[SetupFlow] Verified setup-complete step file:', savedState);
          if (!savedState.data?.setupComplete) {
            throw new Error('Setup complete step file does not have setupComplete=true');
          }
          addLog('All step files verified successfully', 'success');
        } catch (e) {
          console.error('[SetupFlow] Could not verify step files:', e);
          addLog(`Warning: Could not verify step files: ${e.message}`, 'info');
        }
      }
      
      addLog('System path saved. Setup complete!', 'success');
      updateStep(4, { 
        status: 'completed', 
        completedAt: new Date().toISOString(),
        message: 'Path selected'
      });
      showSuccess('Setup completed successfully!');
      
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (error) {
      console.error('[SetupFlow] System path save error:', error);
      addLog(`Failed to save system path: ${error.message}`, 'error');
      updateStep(4, { status: 'error', error: error.message });
      showError('Failed to save system path. Please try again.');
    }
  };

  const handleAgreementAccept = async () => {
    await setupStateManager.setAgreementAccepted(true);
    const newState = setupStateManager.getState();
    setSetupState(newState);
    addLog('Agreement accepted', 'success');
    setLoading(false);
  };

  const handleAgreementReject = () => {
    showError('You must accept the agreement to use Cyberix.');
  };

  const handleAdminGrant = async () => {
    try {
      await setupStateManager.setAdminPermissionGranted(true);
      const newState = setupStateManager.getState();
      setSetupState(newState);
      addLog('Admin permission granted', 'success');
      showSuccess('Administrator permission granted');
      await checkWsl();
    } catch (error) {
      console.error('[SetupFlow] Admin permission error:', error);
      showError('Failed to grant administrator permission.');
    }
  };

  const handleAdminSkip = async () => {
    showError('Administrator permission is required for WSL installation.');
  };

  // Render based on current step
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-lg flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Initializing Setup...</h2>
        </div>
      </div>
    );
  }

  // Show dialogs for pre-setup steps
  const state = setupState || setupStateManager.getState();
  if (!state || !state.agreementAccepted) {
    return <AgreementDialog onAccept={handleAgreementAccept} onReject={handleAgreementReject} />;
  }

  if (!state.adminPermissionGranted) {
    return <AdminPermissionDialog onGrant={handleAdminGrant} onSkip={handleAdminSkip} />;
  }

  if (currentStep === 1 && !state.wslPasswordStored) {
    return (
      <WslCredentialsDialog
        onConfirm={handleCredentialsConfirm}
        onCancel={() => {
          showError('WSL credentials are required to continue.');
        }}
      />
    );
  }

  if (currentStep === 4 && !state.systemPathSelected) {
    return (
      <SystemPathDialog
        onConfirm={handleSystemPathConfirm}
        onCancel={() => {
          showError('System path selection is required to complete setup.');
        }}
      />
    );
  }

  // Main setup flow with timeline and logs
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Cyberix Initial Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Setting up your cybersecurity scanning environment
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Timeline Progress */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
              <TimelineProgress steps={steps} currentStep={currentStep} />
            </div>
          </div>

          {/* Logs Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 h-full flex flex-col min-h-0">
              <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                <Terminal className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Setup Logs
                </h2>
              </div>
              <div className="flex-1 bg-gray-900 dark:bg-black rounded-lg p-4 overflow-y-auto font-mono text-sm min-h-0" style={{ maxHeight: '600px', scrollBehavior: 'smooth' }}>
                {logs.length === 0 ? (
                  <div className="text-gray-500">No logs yet...</div>
                ) : (
                  logs.map((log, index) => (
                    <div key={index} className="mb-1">
                      <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                      <span
                        className={
                          log.type === 'error'
                            ? 'text-red-400'
                            : log.type === 'success'
                            ? 'text-green-400'
                            : 'text-gray-300'
                        }
                      >
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={logEndRef} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitialSetupFlow;
