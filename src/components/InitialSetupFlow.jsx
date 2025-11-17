import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Moon, Sun } from 'lucide-react';
import AgreementDialog from './AgreementDialog';
import AdminPermissionDialog from './AdminPermissionDialog';
import TimelineProgress from './TimelineProgress';
import PlatformDetector from './setup/PlatformDetector';
import Step1WslInstallation from './setup/steps/Step1WslInstallation';
import Step2WslCredentials from './setup/steps/Step2WslCredentials';
import Step3CyberixFolder from './setup/steps/Step3CyberixFolder';
import Step4ToolsInstallation from './setup/steps/Step4ToolsInstallation';
import Step5SystemPath from './setup/steps/Step5SystemPath';
import setupStateManager from '../utils/setupStateManager';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';

const InitialSetupFlow = ({ onComplete }) => {
  const { showError, showSuccess } = useToast();
  const { isDark, toggleTheme } = useTheme();
  const [currentStep, setCurrentStep] = useState(0); // 0-4 for the 5 steps
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setupState, setSetupState] = useState(null);
  const [platform, setPlatform] = useState(null);
  const [wslCredentials, setWslCredentials] = useState({ username: null, password: null });
  const [showDialogs, setShowDialogs] = useState(true); // Show T&C and Permission dialogs by default
  const logEndRef = useRef(null);

  // Set initial theme to dark on mount
  useEffect(() => {
    // Force dark theme on initial load
    if (!isDark) {
      // Use setTimeout to avoid state update during render
      setTimeout(() => {
        toggleTheme();
      }, 0);
    }
    // Ensure dark class is applied
    document.documentElement.classList.add('dark');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step states
  const [steps, setSteps] = useState([
    {
      title: 'WSL Installation',
      description: 'Installing Windows Subsystem for Linux and Ubuntu',
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
      title: 'Setting up Cyberix',
      description: 'Creating folder structure, cloning repositories, and setting up Python environment',
      status: 'pending',
      progress: 0,
      message: '',
      completedAt: null,
      error: null
    },
    {
      title: 'Installing Security Tools',
      description: 'Installing required security scanning tools',
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

  /**
   * Initialize setup - check for existing installation logs and resume
   */
  const initializeSetup = async () => {
    try {
      addLog('Initializing setup...', 'info');
      
      // FIRST: Check if installation log file exists (in user picked path OR default path)
      let installationLogExists = false;
      try {
        if (window.cyberGuard?.checkInstallationLogFile) {
          const logCheck = await window.cyberGuard.checkInstallationLogFile();
          installationLogExists = logCheck?.exists === true;
          if (installationLogExists) {
            addLog(`Installation log found in ${logCheck?.location || 'path'}`, 'info');
          } else {
            addLog('No installation log found - this is a fresh install', 'info');
          }
        }
      } catch (e) {
        console.error('Error checking installation log:', e);
      }
      
      // Initialize installation logs
      if (window.cyberGuard?.initializeInstallationLogs) {
        await window.cyberGuard.initializeInstallationLogs();
      }

      // Check for installation log file to resume
      let resumeStep = 0;
      if (installationLogExists && window.cyberGuard?.getLastCompletedStep) {
        const lastStepResult = await window.cyberGuard.getLastCompletedStep();
        if (lastStepResult?.success) {
          resumeStep = lastStepResult.stepNumber || 0;
          addLog(`Resuming from step ${resumeStep + 1}`, 'info');
        }
      }

      // Initialize state manager
      await setupStateManager.initialize();
      const state = setupStateManager.getState();
      
      // If installation log exists, mark agreement and permission as accepted (they were done before)
      // This prevents showing T&C and Permission dialogs again
      if (installationLogExists) {
        if (!state.agreementAccepted) {
          await setupStateManager.setAgreementAccepted(true);
          state.agreementAccepted = true;
        }
        if (!state.adminPermissionGranted) {
          await setupStateManager.setAdminPermissionGranted(true);
          state.adminPermissionGranted = true;
        }
        // Don't show T&C and Permission dialogs if installation log exists
        setShowDialogs(false);
      } else {
        // Fresh install - show T&C and Permission dialogs
        setShowDialogs(true);
      }
      
      setSetupState(state);

      // Check if setup is already complete
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

      // Update step statuses based on saved state
      if (state.wslInstalled) {
        updateStep(0, { status: 'completed', completedAt: state.wslInstalledAt });
        resumeStep = Math.max(resumeStep, 1);
      }
      if (state.wslPasswordStored) {
        updateStep(1, { status: 'completed', completedAt: state.wslPasswordStoredAt });
        resumeStep = Math.max(resumeStep, 2);
      }
      if (state.cyberixFolderSetup) {
        updateStep(2, { status: 'completed', completedAt: state.cyberixFolderSetupAt });
        resumeStep = Math.max(resumeStep, 3);
      }
      if (state.toolsInstalled) {
        updateStep(3, { status: 'completed', completedAt: state.toolsInstalledAt });
        resumeStep = Math.max(resumeStep, 4);
      }
      if (state.systemPathSelected) {
        updateStep(4, { status: 'completed', completedAt: state.systemPathSelectedAt });
        resumeStep = 5;
      }

      // Check again if all steps are complete after updating step statuses
      // This handles the case where the state check above might have missed it
      const allStepsComplete = 
        state.setupComplete === true && 
        state.agreementAccepted === true && 
        state.adminPermissionGranted === true && 
        state.wslInstalled === true && 
        state.wslPasswordStored === true && 
        state.toolsInstalled === true && 
        state.cyberixFolderSetup === true && 
        state.systemPathSelected === true;

      if (allStepsComplete || resumeStep >= 5) {
        // All steps are complete, skip to login
        addLog('✅ All setup steps are complete. Moving to login screen...', 'success');
        setLoading(false);
        // Small delay to show the completion message
        setTimeout(() => {
          onComplete();
        }, 500);
        return;
      }

      // Only set currentStep if we're not complete (valid range is 0-4)
      if (resumeStep < 5) {
        setCurrentStep(resumeStep);
      }
      setLoading(false);

      // Log step completion if resuming
      if (resumeStep > 0 && resumeStep < 5 && window.cyberGuard?.logInstallationStep) {
        for (let i = 1; i <= resumeStep; i++) {
          await window.cyberGuard.logInstallationStep(i, steps[i - 1].title, 'completed');
        }
      }
    } catch (error) {
      console.error('[SetupFlow] Initialization error:', error);
      addLog(`Initialization error: ${error.message}`, 'error');
      showError('Failed to initialize setup. Please restart the application.');
      setLoading(false);
    }
  };

  /**
   * Handle Step 1 completion (WSL Installation)
   */
  const handleStep1Complete = async () => {
    addLog('Step 1 completed: WSL Installation', 'success');
    updateStep(0, { 
      status: 'completed', 
      progress: 100, 
      completedAt: new Date().toISOString(),
      message: 'WSL and Ubuntu installation complete'
    });
    
    // Log to installation log file
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(1, 'WSL Installation', 'completed', 'WSL and Ubuntu installed successfully');
    }
    
    await setupStateManager.setWslInstalled(true);
    setCurrentStep(1);
  };

  const handleStep1Error = async (error) => {
    addLog(`Step 1 error: ${error}`, 'error');
    updateStep(0, { status: 'error', error: error });
    
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(1, 'WSL Installation', 'failed', error);
    }
    
    showError(`WSL installation failed: ${error}`);
  };

  /**
   * Handle Step 2 completion (WSL Credentials)
   */
  const handleStep2Complete = async (credentials) => {
    addLog('Step 2 completed: WSL Credentials', 'success');
    // Clear any previous error and mark as completed
    updateStep(1, { 
      status: 'completed', 
      progress: 100, 
      completedAt: new Date().toISOString(),
      message: 'Credentials saved',
      error: null // Clear any previous error
    });
    
    // Save credentials
    setWslCredentials(credentials);
    await setupStateManager.setWslCredentials(credentials.username, true);
    
    // Password is already stored in Step2WslCredentials component after validation
    // No need to store again here to avoid duplicate encryption
    
    // Log to installation log file
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(2, 'WSL Password Setup', 'completed', `Username: ${credentials.username}`);
    }
    
    setCurrentStep(2);
  };

  const handleStep2Error = async (error) => {
    addLog(`Step 2 error: ${error.message}`, 'error');
    updateStep(1, { status: 'error', error: error.message });
    
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(2, 'WSL Password Setup', 'failed', error.message);
    }
    
    showError(`Credentials setup failed: ${error.message}`);
  };

  /**
   * Handle Step 3 completion (Cyberix Folder)
   */
  const handleStep3Complete = async () => {
    addLog('Step 3 completed: Cyberix Folder Setup', 'success');
    updateStep(2, { 
      status: 'completed', 
      progress: 100, 
      completedAt: new Date().toISOString(),
      message: 'Cyberix setup complete'
    });
    
    // Log to installation log file
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(3, 'Setting up Cyberix', 'completed', 'fluxploider, testssl, and venv folders installed');
    }
    
    await setupStateManager.setCyberixFolderSetup(true);
    setCurrentStep(3);
  };

  const handleStep3Error = async (error) => {
    addLog(`Step 3 error: ${error.message}`, 'error');
    updateStep(2, { status: 'error', error: error.message });
    
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(3, 'Setting up Cyberix', 'failed', error.message);
    }
    
    showError(`Cyberix folder setup failed: ${error.message}`);
  };

  /**
   * Handle Step 4 completion (Tools Installation)
   */
  const handleStep4Complete = async () => {
    addLog('Step 4 completed: Tools Installation', 'success');
    updateStep(3, { 
      status: 'completed', 
      progress: 100, 
      completedAt: new Date().toISOString(),
      message: 'Tools installation complete'
    });
    
    // Log to installation log file
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(4, 'Installing Security Tools', 'completed', 'All required tools installed');
    }
    
    await setupStateManager.setToolsInstalled(true);
    setCurrentStep(4);
  };

  const handleStep4Error = async (error) => {
    addLog(`Step 4 error: ${error.message}`, 'error');
    updateStep(3, { status: 'error', error: error.message });
    
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(4, 'Installing Security Tools', 'failed', error.message);
    }
    
    showError(`Tools installation failed: ${error.message}`);
  };

  /**
   * Handle Step 5 completion (System Path)
   */
  const handleStep5Complete = async (selectedPath) => {
    try {
      addLog('Step 5 completed: System Path Selection', 'success');
      updateStep(4, { 
        status: 'completed', 
        progress: 100, 
        completedAt: new Date().toISOString(),
        message: 'Path selected'
      });
      
      // Move installation logs to selected path
      if (window.cyberGuard?.moveInstallationLogs) {
        try {
          await window.cyberGuard.moveInstallationLogs(selectedPath);
        } catch (error) {
          console.error('Error moving installation logs:', error);
          addLog('⚠️ Warning: Could not move installation logs', 'warning');
        }
      }
      
      // Create System Logs folder
      if (window.cyberGuard?.createSystemLogsFolder) {
        try {
          await window.cyberGuard.createSystemLogsFolder(selectedPath);
        } catch (error) {
          console.error('Error creating system logs folder:', error);
          addLog('⚠️ Warning: Could not create system logs folder', 'warning');
        }
      }
      
      // Log to installation log file
      if (window.cyberGuard?.logInstallationStep) {
        try {
          await window.cyberGuard.logInstallationStep(5, 'System Path Selection', 'completed', `Path: ${selectedPath}`);
        } catch (error) {
          console.error('Error logging installation step:', error);
        }
      }
      
      // Save system path
      try {
        await setupStateManager.setSystemPath(selectedPath);
        await setupStateManager.setSetupComplete(true);
      } catch (error) {
        console.error('Error saving system path:', error);
        addLog('⚠️ Warning: Could not save system path', 'warning');
        // Still continue with navigation even if saving fails
      }
      
      // Sync files to both default and user-picked locations
      if (window.cyberGuard?.syncFilesToBothLocations) {
        try {
          await window.cyberGuard.syncFilesToBothLocations(selectedPath);
          addLog('✅ Files synced to both locations', 'success');
        } catch (error) {
          console.error('Error syncing files:', error);
          addLog('⚠️ Warning: Could not sync files to both locations', 'warning');
        }
      }
      
      addLog('✅ All setup steps completed!', 'success');
      addLog('🔄 Navigating to login screen...', 'info');
      showSuccess('Setup completed successfully!');
      
      // Ensure onComplete is called even if there were warnings
      // Use a shorter delay to make navigation feel more responsive
      setTimeout(() => {
        try {
          if (onComplete && typeof onComplete === 'function') {
            onComplete();
          } else {
            console.error('onComplete is not a function:', typeof onComplete);
            addLog('❌ Error: Navigation callback not available', 'error');
          }
        } catch (error) {
          console.error('Error calling onComplete:', error);
          addLog('❌ Error during navigation', 'error');
        }
      }, 1000);
    } catch (error) {
      console.error('Error in handleStep5Complete:', error);
      addLog(`❌ Error: ${error.message}`, 'error');
      // Even on error, try to navigate to login screen
      setTimeout(() => {
        try {
          if (onComplete && typeof onComplete === 'function') {
            onComplete();
          }
        } catch (navError) {
          console.error('Error calling onComplete after error:', navError);
        }
      }, 1000);
    }
  };

  const handleStep5Error = async (error) => {
    addLog(`Step 5 error: ${error.message}`, 'error');
    updateStep(4, { status: 'error', error: error.message });
    
    if (window.cyberGuard?.logInstallationStep) {
      await window.cyberGuard.logInstallationStep(5, 'System Path Selection', 'failed', error.message);
    }
    
    showError(`System path selection failed: ${error.message}`);
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

  // Show dialogs for pre-setup steps ONLY if installation log doesn't exist
  // If installation log exists, user already went through T&C and Permission
  const state = setupState || setupStateManager.getState();
  
  // Only show T&C and Permission if installation log doesn't exist (fresh install)
  if (showDialogs && (!state || !state.agreementAccepted)) {
    return <AgreementDialog onAccept={handleAgreementAccept} onReject={handleAgreementReject} />;
  }

  if (showDialogs && (!state || !state.adminPermissionGranted)) {
    return <AdminPermissionDialog onGrant={handleAdminGrant} onSkip={handleAdminSkip} />;
  }

  // Main setup flow with timeline and step components
  return (
    <PlatformDetector onPlatformDetected={setPlatform}>
      <div className="h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {/* Theme Toggle Button - Fixed position */}
        <button
          onClick={toggleTheme}
          className="fixed top-4 right-4 z-50 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          ) : (
            <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          )}
        </button>

        <div className="flex h-full">
          {/* Left Section: Timeline (30% width) - Scrollable separately */}
          <div className="w-[30%] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 h-full overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  Cyberix Setup
                </h1>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Installation Progress
                </p>
              </div>

              {/* Timeline Progress */}
              <TimelineProgress steps={steps} currentStep={currentStep} />
            </div>
          </div>

          {/* Right Section: Current Process + Console Logs (70% width) - Fully scrollable */}
          <div className="w-[70%] flex flex-col bg-gray-50 dark:bg-slate-900 h-full overflow-y-auto">
            {/* Top: Current Step Component - Not scrollable, fits content */}
            <div className="flex-shrink-0 p-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                {currentStep === 0 && (
                  <Step1WslInstallation 
                    onComplete={handleStep1Complete}
                    onError={handleStep1Error}
                    onLog={addLog}
                  />
                )}
                {currentStep === 1 && (
                  <Step2WslCredentials 
                    onComplete={handleStep2Complete}
                    onError={handleStep2Error}
                    onLog={addLog}
                  />
                )}
                {currentStep === 2 && wslCredentials.username && wslCredentials.password && (
                  <Step3CyberixFolder 
                    username={wslCredentials.username}
                    password={wslCredentials.password}
                    onComplete={handleStep3Complete}
                    onError={handleStep3Error}
                    onLog={addLog}
                  />
                )}
                {currentStep === 3 && wslCredentials.username && wslCredentials.password && (
                  <Step4ToolsInstallation 
                    username={wslCredentials.username}
                    password={wslCredentials.password}
                    onComplete={handleStep4Complete}
                    onError={handleStep4Error}
                    onLog={addLog}
                  />
                )}
                {currentStep === 4 && (
                  <Step5SystemPath 
                    onComplete={handleStep5Complete}
                    onError={handleStep5Error}
                    onLog={addLog}
                  />
                )}
              </div>
            </div>

            {/* Bottom: Console Logs - Fixed height with nested scroll */}
            <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Console Log
                  </h2>
                </div>
                <div className="bg-gray-900 dark:bg-black rounded-lg p-4 font-mono text-sm h-[300px] overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-y-auto">
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
                                : log.type === 'warning'
                                ? 'text-yellow-400'
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
      </div>
    </PlatformDetector>
  );
};

export default InitialSetupFlow;
