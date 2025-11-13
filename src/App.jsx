import { useState, useEffect } from 'react'
import "./index.css"
import Dashboard from './Dashboard'
import InitialSetupFlow from './components/InitialSetupFlow'
import NetworkStatus from './components/NetworkStatus'
import { ToastProvider, useToast } from './context/ToastContext'
import { ScanningProvider } from './context/ScanningContext'
import { GlobalScanProvider } from './context/GlobalScanContext'
import { ThemeProvider } from './context/ThemeContext'
import { NotificationProvider } from './context/NotificationContext'
import setupStateManager from './utils/setupStateManager'

// Expose setupStateManager to window for debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.setupStateManager = setupStateManager;
}

import SimpleWslPasswordDialog from './components/SimpleWslPasswordDialog';
import WslUserCreationDialog from './components/WslUserCreationDialog';
import logo from './assets/webp/Cybersecurity research-02.webp'
import { ensureReposInstalled } from './utils/kaliRepoInstaller'
import { getWslCredentials, storeWslCredentialsComplete } from './utils/wslPasswordManager'
import { hasSecurePassword, getSecurePassword, validateStoredPassword } from './utils/securePasswordStorage'
import { authApi } from './services/authApi'

const AppContent = () => {
  // CRITICAL: Log immediately when component loads
  console.log('[App] ========== APP COMPONENT LOADED ==========');
  console.log('[App] Component rendering at:', new Date().toISOString());
  
  const { showError, showSuccess, showLoading, dismissToast, updateToast } = useToast()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentToastId, setCurrentToastId] = useState(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true) // Start with true to show loading
  const [showSetupFlow, setShowSetupFlow] = useState(false)
  
  console.log('[App] Initial state:', {
    checkingSetup,
    setupComplete,
    showSetupFlow,
    isAuthenticated
  });
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(false)
  const [showWslPasswordDialog, setShowWslPasswordDialog] = useState(false)
  const [showWslUserCreationDialog, setShowWslUserCreationDialog] = useState(false)
  const [wslInstallationStatus, setWslInstallationStatus] = useState(null)
  const [installPath, setInstallPath] = useState(null)

  // Check setup completion status on app load
  useEffect(() => {
    console.log('[App] ========== useEffect TRIGGERED ==========');
    console.log('[App] useEffect running at:', new Date().toISOString());
    
    const checkSetupStatus = async () => {
      console.log('[App] ========== checkSetupStatus FUNCTION CALLED ==========');
      try {
        console.log('[App] ========== STARTING SETUP CHECK ==========');
        console.log('[App] window.cyberGuard available:', !!window.cyberGuard);
        
        // FIRST: Check if files exist in C:\Users\Admin\AppData\Roaming\Cyberix
        let cyberixFolderExists = false;
        try {
          if (window.cyberGuard?.checkCyberixFolderExists) {
            const folderCheck = await window.cyberGuard.checkCyberixFolderExists();
            cyberixFolderExists = folderCheck?.exists === true;
            console.log('[App] Cyberix folder exists:', cyberixFolderExists);
            console.log('[App] Cyberix folder path:', folderCheck?.path);
            console.log('[App] Files count:', folderCheck?.fileCount || 0);
          }
        } catch (e) {
          console.log('[App] Could not check Cyberix folder:', e.message);
        }
        
        // SECOND: Check if installation log file exists in NEW default path: C:\Users\Admin\AppData\Roaming\Cyberix\Cyberix-Logs\installation_process\installation-process.log
        let installationLogExists = false;
        let installationLogLocation = null;
        try {
          if (window.cyberGuard?.checkInstallationLogFile) {
            const logCheck = await window.cyberGuard.checkInstallationLogFile();
            installationLogExists = logCheck?.exists === true;
            installationLogLocation = logCheck?.location || null;
            console.log('[App] Installation log file exists:', installationLogExists);
            console.log('[App] Installation log location:', installationLogLocation);
            if (logCheck?.path) {
              console.log('[App] Installation log path:', logCheck.path);
            }
          }
        } catch (e) {
          console.log('[App] Could not check installation log file:', e.message);
        }

        // THIRD: Determine if this is a fresh install
        // If Cyberix folder doesn't exist OR no installation log exists, it's a fresh install
        const isFreshInstall = !cyberixFolderExists || !installationLogExists;
        
        console.log('[App] ========== SETUP STATUS CHECK ==========');
        console.log('[App] Installation log exists:', installationLogExists);
        console.log('[App] Installation log location:', installationLogLocation);
        console.log('[App] Is fresh install:', isFreshInstall);
        
        // Initialize setup state manager to load state from files
        await setupStateManager.initialize();
        const state = setupStateManager.getState();
        
        // If installation log exists, check if all steps are complete
        let allStepsComplete = false;
        if (installationLogExists) {
          console.log('[App] Setup state from manager:', {
            setupComplete: state.setupComplete,
            agreementAccepted: state.agreementAccepted,
            adminPermissionGranted: state.adminPermissionGranted,
            wslInstalled: state.wslInstalled,
            wslPasswordStored: state.wslPasswordStored,
            toolsInstalled: state.toolsInstalled,
            cyberixFolderSetup: state.cyberixFolderSetup,
            systemPathSelected: state.systemPathSelected
          });
          
          // STRICT CHECK: All steps must be complete AND setupComplete flag must be true
          // This ensures we don't skip setup if any step is missing
          allStepsComplete = 
              state.setupComplete === true && 
              state.agreementAccepted === true && 
              state.adminPermissionGranted === true && 
              state.wslInstalled === true && 
              state.wslPasswordStored === true && 
              state.toolsInstalled === true && 
              state.cyberixFolderSetup === true && 
              state.systemPathSelected === true;
        }
        
        console.log('[App] All steps complete check:', allStepsComplete);
        if (installationLogExists) {
          console.log('[App] Individual step status:', {
            setupComplete: state.setupComplete,
            agreementAccepted: state.agreementAccepted,
            adminPermissionGranted: state.adminPermissionGranted,
            wslInstalled: state.wslInstalled,
            wslPasswordStored: state.wslPasswordStored,
            toolsInstalled: state.toolsInstalled,
            cyberixFolderSetup: state.cyberixFolderSetup,
            systemPathSelected: state.systemPathSelected
          });
        }
        console.log('[App] ==========================================');
        
        // DECISION: Show setup if:
        // 1. It's a fresh install (no log file AND no setup files), OR
        // 2. Not all steps are complete
        if (isFreshInstall) {
          console.log('[App] 🆕 Fresh install detected! Showing setup flow.');
          // Clear any stale localStorage data
          try {
            localStorage.removeItem('cyberix-setup-state');
            localStorage.removeItem('cyberix.setup.state');
            console.log('[App] Cleared stale localStorage data');
          } catch (e) {
            console.log('[App] Could not clear localStorage:', e.message);
          }
          setSetupComplete(false);
          setShowSetupFlow(true);
          setCheckingSetup(false); // CRITICAL: Always set to false
        } else if (allStepsComplete) {
          console.log('[App] ✅ Setup is complete. Skipping setup flow.');
          setSetupComplete(true);
          setShowSetupFlow(false);
          setCheckingSetup(false); // CRITICAL: Always set to false
        } else {
          console.log('[App] ⚠️ Setup is incomplete. Showing setup flow.');
          console.log('[App] Missing steps:', {
            setupComplete: !state.setupComplete,
            agreement: !state.agreementAccepted,
            admin: !state.adminPermissionGranted,
            wsl: !state.wslInstalled,
            password: !state.wslPasswordStored,
            tools: !state.toolsInstalled,
            folder: !state.cyberixFolderSetup,
            path: !state.systemPathSelected
          });
          setSetupComplete(false);
          setShowSetupFlow(true);
          setCheckingSetup(false); // CRITICAL: Always set to false
        }
      } catch (error) {
        console.error('[App] ❌ ERROR checking setup status:', error);
        console.error('[App] Error stack:', error.stack);
        // On error, ALWAYS show setup flow to be safe
        console.log('[App] ⚠️ Error occurred, showing setup flow as fallback');
        setSetupComplete(false);
        setShowSetupFlow(true);
        setCheckingSetup(false);
      }
    };

    // CRITICAL: Always call checkSetupStatus
    console.log('[App] Calling checkSetupStatus()...');
    checkSetupStatus().catch(err => {
      console.error('[App] ❌ FATAL ERROR in checkSetupStatus:', err);
      // Fallback: show setup flow
      setSetupComplete(false);
      setShowSetupFlow(true);
      setCheckingSetup(false);
    });
  }, [])

  const handleSetupComplete = async (path) => {
    try {
      // Mark setup as complete
      await window.cyberGuard.markSetupComplete(path)
      setSetupComplete(true)
      setInstallPath(path)
      showSuccess('Setup completed successfully! Welcome to Cyberix.')
    } catch (error) {
      console.error('Error completing setup:', error)
      showError('Failed to complete setup. Please try again.')
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Show professional loading toast
    const loadingToastId = showLoading('🔐 Authenticating your credentials...')
    setCurrentToastId(loadingToastId)
    
    try {
      // TEMPORARY: Hardcoded login check (API integration commented out)
      // Check if email is "admin" and password is "1234"
      if (formData.username === 'admin' && formData.password === '1234') {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show success toast
        showSuccess(`🎉 Welcome back, admin! Login successful.`, {
          duration: 3000
        })
        
        // Start the WSL credential and tool checking flow
        await handlePostLoginFlow()
      } else {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show error toast
        showError('❌ Authentication failed! Invalid credentials provided.', {
          duration: 5000
        })
      }
      
      /* COMMENTED OUT: API Integration (temporarily disabled)
      // Call the API for authentication
      const response = await authApi.login({
        username: formData.username,
        password: formData.password,
        rememberMe: formData.rememberMe
      })
      
      // Dismiss loading toast
      dismissToast(loadingToastId)
      
      // Show success toast
      showSuccess(`🎉 Welcome back, ${response.user?.username || formData.username}! Login successful.`, {
        duration: 3000
      })
      
      // Start the WSL credential and tool checking flow
      await handlePostLoginFlow()
      */
      
    } catch (error) {
      // Dismiss loading toast
      dismissToast(loadingToastId)
      
      // Show error toast with message from API or default message
      const errorMessage = error.response?.data?.message || 
                           error.message || 
                           '❌ Authentication failed! Invalid credentials provided.'
      showError(errorMessage, {
        duration: 5000
      })
    } finally {
      setIsLoading(false)
      setCurrentToastId(null)
    }
  }

  const handlePostLoginFlow = async () => {
    try {
      console.log('🚀 [APP] Starting post-login flow...')
      setIsCheckingCredentials(true)
      
      // Step 1: Check if WSL is installed
      console.log('🔍 [APP] Checking if WSL is installed...')
      setWslInstallationStatus('checking')
      
      let wslInstalled = false
      if (window.cyberGuard && window.cyberGuard.checkWsl) {
        try {
          wslInstalled = await window.cyberGuard.checkWsl()
          console.log('🔍 [APP] WSL installation check result:', wslInstalled)
        } catch (error) {
          console.error('❌ [APP] Error checking WSL:', error)
        }
      }
      
      // Step 2: If WSL is not installed, install it
      if (!wslInstalled) {
        console.log('❌ [APP] WSL is not installed. Starting installation...')
        setWslInstallationStatus('installing')
        
        const installToast = showLoading('Installing WSL... This may take a few minutes and may require administrator privileges.')
        
        if (window.cyberGuard && window.cyberGuard.installWslDirect) {
          try {
            // Listen for installation progress
            if (window.cyberGuard.onWslInstallProgress) {
              window.cyberGuard.onWslInstallProgress((message) => {
                console.log('📢 [APP] WSL install progress:', message)
              })
            }
            
            const installResult = await window.cyberGuard.installWslDirect()
            dismissToast(installToast)
            
            console.log('📋 [APP] WSL installation result:', installResult)
            
            if (installResult && installResult.success) {
              console.log('✅ [APP] WSL installation initiated:', installResult.message)
              showSuccess(installResult.message || 'WSL installation started. You may need to restart your computer.')
              
              // If message indicates restart needed, don't check again
              if (installResult.message && installResult.message.toLowerCase().includes('restart')) {
                console.log('⚠️ [APP] WSL installation requires a restart')
                showError('WSL installation requires a system restart. Please restart your computer and log in again.')
                setIsCheckingCredentials(false)
                return
              }
              
              // Wait a bit and check again
              await new Promise(resolve => setTimeout(resolve, 3000))
              wslInstalled = await window.cyberGuard.checkWsl()
              
              if (wslInstalled) {
                console.log('✅ [APP] WSL is now installed')
                setWslInstallationStatus('installed')
              } else {
                console.log('⚠️ [APP] WSL installation may require a restart')
                showError('WSL installation requires a system restart. Please restart your computer and log in again.')
                setIsCheckingCredentials(false)
                return
              }
            } else {
              console.error('❌ [APP] WSL installation failed:', installResult?.error)
              
              // Provide helpful error message with manual installation instructions
              const errorMsg = installResult?.error || 'Failed to install WSL'
              showError(`${errorMsg}\n\nPlease install WSL manually:\n1. Open PowerShell as Administrator\n2. Run: wsl --install\n3. Restart your computer\n4. Log in again`)
              setIsCheckingCredentials(false)
              return
            }
          } catch (error) {
            dismissToast(installToast)
            console.error('❌ [APP] WSL installation error:', error)
            showError('Failed to install WSL: ' + error.message)
            setIsCheckingCredentials(false)
            return
          }
        } else {
          dismissToast(installToast)
          console.error('❌ [APP] WSL installation API not available')
          showError('WSL installation feature not available. Please install WSL manually.')
          setIsCheckingCredentials(false)
          return
        }
      } else {
        console.log('✅ [APP] WSL is installed')
        setWslInstallationStatus('installed')
      }
      
      // Step 3: Check and install Kali Linux if missing
      console.log('🔍 [APP] Checking if Kali Linux is installed...')
      let kaliInstalled = false
      if (window.cyberGuard && window.cyberGuard.checkKali) {
        try {
          kaliInstalled = await window.cyberGuard.checkKali()
          console.log('🔍 [APP] Kali Linux installation check result:', kaliInstalled)
        } catch (error) {
          console.error('❌ [APP] Error checking Kali Linux:', error)
        }
      }
      
      // If Kali Linux is not installed, install it automatically
      if (!kaliInstalled && wslInstalled) {
        console.log('❌ [APP] Kali Linux is not installed. Starting automatic installation...')
        
        const kaliInstallToast = showLoading('Installing Kali Linux... This may take several minutes as it downloads ~1-2GB.')
        
        if (window.cyberGuard && window.cyberGuard.installKali) {
          try {
            // Listen for installation progress with percentage
            if (window.cyberGuard.onKaliInstallProgress) {
              window.cyberGuard.onKaliInstallProgress((progressData) => {
                console.log('📢 [APP] Kali install progress:', progressData)
                
                // progressData can be either a string (old format) or object (new format)
                if (typeof progressData === 'string') {
                  updateToast(kaliInstallToast, { message: progressData || 'Installing Kali Linux...' })
                } else if (progressData && typeof progressData === 'object') {
                  // New format with percentage, message, stage, elapsed
                  const percentage = progressData.percentage || 0
                  const message = progressData.message || 'Installing Kali Linux...'
                  const stage = progressData.stage || 'installing'
                  const elapsed = progressData.elapsed || 0
                  
                  const formattedMessage = `${message} (${percentage}%)`
                  const fullMessage = elapsed > 0 
                    ? `${formattedMessage} - ${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed`
                    : formattedMessage
                  
                  updateToast(kaliInstallToast, { 
                    message: fullMessage,
                    percentage: percentage,
                    stage: stage
                  })
                }
              })
            }
            
            const kaliInstallResult = await window.cyberGuard.installKali()
            dismissToast(kaliInstallToast)
            
            console.log('📋 [APP] Kali Linux installation result:', kaliInstallResult)
            
            if (kaliInstallResult) {
              console.log('✅ [APP] Kali Linux installation initiated')
              showSuccess('Kali Linux installation started. This may take several minutes. You can continue using the application.')
              
              // Wait a bit and check again
              await new Promise(resolve => setTimeout(resolve, 5000))
              kaliInstalled = await window.cyberGuard.checkKali()
              
              if (kaliInstalled) {
                console.log('✅ [APP] Kali Linux is now installed')
              } else {
                console.log('ℹ️ [APP] Kali Linux installation in progress (may take several minutes)')
              }
            } else {
              console.log('⚠️ [APP] Kali Linux installation may have failed, but continuing...')
            }
          } catch (error) {
            dismissToast(kaliInstallToast)
            console.error('❌ [APP] Kali Linux installation error:', error)
            // Don't block the flow if Kali installation fails - user can install manually later
            showError('Kali Linux installation failed. You can install it manually later using: wsl --install -d kali-linux')
          }
        } else {
          dismissToast(kaliInstallToast)
          console.error('❌ [APP] Kali Linux installation API not available')
        }
      } else if (kaliInstalled) {
        console.log('✅ [APP] Kali Linux is installed')
      } else if (!wslInstalled) {
        console.log('⚠️ [APP] WSL is not installed, skipping Kali Linux installation')
      }
      
      // Step 4: Check if we have stored WSL credentials
      const storedCredentials = getWslCredentials()
      const hasStoredPassword = hasSecurePassword()
      
      if (storedCredentials && storedCredentials.username && storedCredentials.password) {
        console.log('🔐 [APP] Found stored WSL credentials, validating...')
        
        // Validate the stored credentials
        if (window.cyberGuard && window.cyberGuard.validateWslCredentials) {
          try {
            const isValid = await window.cyberGuard.validateWslCredentials(
              storedCredentials.username,
              storedCredentials.password
            )
            
            if (isValid && isValid.success) {
              console.log('✅ [APP] Stored credentials are valid')
              // Continue with existing flow
            } else {
              console.log('❌ [APP] Stored credentials are invalid, asking for new credentials')
              setShowWslUserCreationDialog(true)
              setIsCheckingCredentials(false)
              return
            }
          } catch (error) {
            console.error('❌ [APP] Error validating credentials:', error)
            // Show user creation dialog on validation error
            setShowWslUserCreationDialog(true)
            setIsCheckingCredentials(false)
            return
          }
        } else if (hasStoredPassword) {
          // Fallback to old password validation
          const isValid = await validateStoredPassword()
          if (!isValid) {
            console.log('❌ [APP] Stored password is invalid, asking for new credentials')
            setShowWslUserCreationDialog(true)
            setIsCheckingCredentials(false)
            return
          }
        } else {
          // No stored credentials, show user creation dialog
          console.log('🔐 [APP] No stored WSL credentials found, asking for credentials')
          setShowWslUserCreationDialog(true)
          setIsCheckingCredentials(false)
          return
        }
      } else if (hasStoredPassword) {
        console.log('🔐 [APP] Found stored WSL password, validating...')
        
        // Validate the stored password
        const isValid = await validateStoredPassword()
        
        if (isValid) {
          console.log('✅ [APP] Stored password is valid, checking tools...')
          // Also ensure Kali repos are prepared (supports future multiple URLs)
          try {
            const password = getSecurePassword()
            const urls = [
              'https://github.com/almandin/fuxploider.git',
              'https://github.com/drwetter/testssl.sh.git'
            ]
            const progressToast = showLoading('Things are getting ready to serve you...')
            const setupResult = await ensureReposInstalled(urls, password)
            dismissToast(progressToast)
            if (!setupResult.success) {
              console.warn('Repo setup failed:', setupResult.error)
            }
          } catch (e) {
            console.warn('Repo setup skipped/failed:', e?.message)
          }
          
          // Check which tools are missing
          const password = getSecurePassword()
          if (window.cyberGuard && window.cyberGuard.checkRequiredToolsOnly) {
            console.log('🔧 [APP] Calling checkRequiredToolsOnly with password:', password ? 'EXISTS' : 'NULL')
            
            // Add timeout to prevent hanging
            const toolCheckPromise = window.cyberGuard.checkRequiredToolsOnly(password)
            const timeoutPromise = new Promise((resolve) => {
              setTimeout(() => {
                console.log('⚠️ [APP] Tool check timeout, proceeding anyway...')
                resolve({ success: false, timeout: true })
              }, 30000) // 30 second timeout
            })
            
            const toolCheck = await Promise.race([toolCheckPromise, timeoutPromise])
            
            console.log('🔧 [APP] ===== TOOL CHECK RESULT =====')
            console.log('🔧 [APP] Tool check result:', toolCheck)
            console.log('🔧 [APP] Tool check success:', toolCheck?.success)
            console.log('🔧 [APP] Tool check missingTools:', toolCheck?.missingTools)
            console.log('🔧 [APP] Tool check totalChecked:', toolCheck?.totalChecked)
            console.log('🔧 [APP] ===== END TOOL CHECK RESULT =====')
            
            // Check tgpt in background (non-blocking)
            if (password && window.cyberGuard && window.cyberGuard.checkAndInstallTgpt) {
              window.cyberGuard.checkAndInstallTgpt(password).catch(err => {
                console.log('⚠️ [APP] tgpt check/install failed (non-blocking):', err)
              })
            }
            
            if (toolCheck && toolCheck.success) {
              console.log('✅ [APP] All tools are ready!')
              // Navigate directly to dashboard
              setIsCheckingCredentials(false)
              setTimeout(() => {
                setIsAuthenticated(true)
              }, 500)
            } else if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
              console.log('⚠️ [APP] Some tools are missing:', toolCheck.missingTools)
              console.log('🔧 [APP] Missing tools detected, proceeding anyway')
              // Navigate to dashboard without showing error notification
              setIsCheckingCredentials(false)
              setTimeout(() => {
                setIsAuthenticated(true)
              }, 500)
            } else {
              console.log('✅ [APP] Tool check completed, navigating to dashboard')
              setIsCheckingCredentials(false)
              setTimeout(() => {
                setIsAuthenticated(true)
              }, 500)
            }
          } else {
            console.log('✅ [APP] Tool check API not available, navigating to dashboard')
            setIsCheckingCredentials(false)
            setTimeout(() => {
              setIsAuthenticated(true)
            }, 500)
          }
        } else {
          console.log('❌ [APP] Stored password is invalid, asking for new password')
          setIsCheckingCredentials(false)
          // Password is invalid, ask for new password
          setShowWslPasswordDialog(true)
        }
      } else {
        console.log('🔐 [APP] No stored WSL password found, asking for password')
        setIsCheckingCredentials(false)
        // No stored password, ask for password
        setShowWslPasswordDialog(true)
      }
    } catch (error) {
      console.error('❌ [APP] Post-login flow failed:', error)
      setIsCheckingCredentials(false)
      showError('Failed to initialize system. Please try again.')
      // Still allow access to dashboard even if check fails
      setTimeout(() => {
        setIsAuthenticated(true)
      }, 2000)
    }
  }

  const handleLogout = async () => {
    try {
      // Call logout API
      await authApi.logout()
    } catch (error) {
      // Even if API call fails, clear local state
      console.error('Logout API error:', error)
    }
    
    // Show logout toast
    showSuccess('👋 Successfully logged out! See you next time.', {
      duration: 2500
    })
    
    setTimeout(() => {
      setIsAuthenticated(false)
      setFormData({
        username: '',
        password: '',
        rememberMe: false
      })
    }, 500)
  }

  const handleClearCredentials = () => {
    setFormData(prev => ({
      ...prev,
      username: '',
      password: ''
    }))
    
    // Show info toast
    showSuccess('🗑️ Credentials cleared!', {
      duration: 1500
    })
  }

  const handleWslPasswordSuccess = async (password) => {
    console.log('✅ [APP] WSL password validated, checking tools...')
    setShowWslPasswordDialog(false)
    
    try {
      // Prepare Kali environment: pip, /root/cyberix, clone URLs, install requirements
      const urls = [
        'https://github.com/almandin/fuxploider.git'
      ]
      // Show progress to the user
      const progressToast = showLoading('Things are getting ready to serve you...')
      const setupResult = await ensureReposInstalled(urls, password)
      dismissToast(progressToast)
      if (!setupResult.success) {
        showError(setupResult.error || 'Failed to prepare Kali environment')
      }

      // Check which tools are missing
      if (window.cyberGuard && window.cyberGuard.checkRequiredToolsOnly) {
        console.log('🔧 [APP] Calling checkRequiredToolsOnly with password:', password ? 'EXISTS' : 'NULL')
        const toolCheck = await window.cyberGuard.checkRequiredToolsOnly(password)
        
        console.log('🔧 [APP] ===== TOOL CHECK RESULT (PASSWORD SUCCESS) =====')
        console.log('🔧 [APP] Tool check result:', toolCheck)
        console.log('🔧 [APP] Tool check success:', toolCheck?.success)
        console.log('🔧 [APP] Tool check missingTools:', toolCheck?.missingTools)
        console.log('🔧 [APP] Tool check totalChecked:', toolCheck?.totalChecked)
        console.log('🔧 [APP] ===== END TOOL CHECK RESULT (PASSWORD SUCCESS) =====')
        
        if (toolCheck && toolCheck.success) {
          console.log('✅ [APP] All tools are ready!')
          // Navigate directly to dashboard
          setTimeout(() => {
            setIsAuthenticated(true)
          }, 800)
        } else if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
          console.log('⚠️ [APP] Some tools are missing:', toolCheck.missingTools)
          console.log('🔧 [APP] Missing tools detected, proceeding to dashboard')
          // Navigate to dashboard without showing error notification
          setTimeout(() => {
            setIsAuthenticated(true)
          }, 800)
        } else {
          console.log('✅ [APP] Tool check completed, navigating to dashboard')
          setTimeout(() => {
            setIsAuthenticated(true)
          }, 800)
        }
      } else {
        console.log('✅ [APP] Tool check API not available, navigating to dashboard')
        setTimeout(() => {
          setIsAuthenticated(true)
        }, 800)
      }
    } catch (error) {
      console.error('❌ [APP] Tool check failed:', error)
      showError('Failed to check security tools. Please try again.')
    }
  }

  const handleWslPasswordCancel = () => {
    setShowWslPasswordDialog(false)
    // User cancelled, stay on login screen
  }

  const handleWslUserCreationSuccess = async (username, password) => {
    console.log('✅ [APP] WSL user created successfully:', username)
    setShowWslUserCreationDialog(false)
    
    try {
      // Store credentials securely
      const stored = await storeWslCredentialsComplete(username, password)
      if (stored) {
        console.log('✅ [APP] Credentials stored successfully')
        showSuccess(`WSL user "${username}" created and credentials saved!`)
        
        // Continue with the post-login flow (tool checking, etc.)
        setIsCheckingCredentials(true)
        
        // Prepare Kali environment if needed
        try {
          const urls = [
            'https://github.com/almandin/fuxploider.git'
          ]
          const progressToast = showLoading('Preparing environment...')
          const setupResult = await ensureReposInstalled(urls, password)
          dismissToast(progressToast)
          if (!setupResult.success) {
            console.warn('Repo setup failed:', setupResult.error)
          }
        } catch (e) {
          console.warn('Repo setup skipped/failed:', e?.message)
        }
        
        // Check tools
        if (window.cyberGuard && window.cyberGuard.checkRequiredToolsOnly) {
          console.log('🔧 [APP] Checking required tools...')
          const toolCheck = await window.cyberGuard.checkRequiredToolsOnly(password)
          
          if (toolCheck && toolCheck.success) {
            console.log('✅ [APP] All tools are ready!')
            setTimeout(() => {
              setIsAuthenticated(true)
            }, 800)
          } else if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
            console.log('⚠️ [APP] Some tools are missing:', toolCheck.missingTools)
            // Navigate to dashboard without showing error notification
            setTimeout(() => {
              setIsAuthenticated(true)
            }, 800)
          } else {
            setTimeout(() => {
              setIsAuthenticated(true)
            }, 800)
          }
        } else {
          setTimeout(() => {
            setIsAuthenticated(true)
          }, 800)
        }
      } else {
        showError('Failed to store credentials. Please try again.')
      }
    } catch (error) {
      console.error('❌ [APP] Error after user creation:', error)
      showError('Failed to complete setup. Please try again.')
    } finally {
      setIsCheckingCredentials(false)
    }
  }

  const handleWslUserCreationCancel = () => {
    setShowWslUserCreationDialog(false)
    // User cancelled, stay on login screen
  }


  // Show loading screen while checking setup status
  if (checkingSetup) {
    return (
      <NetworkStatus>
        <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-orange-500 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Loading Cyberix...
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Checking setup status
            </p>
          </div>
        </div>
      </NetworkStatus>
    )
  }


  if (showSetupFlow) {
    console.log('[App] Rendering InitialSetupFlow (showSetupFlow=true)');
    return (
      <NetworkStatus>
        <InitialSetupFlow 
          onComplete={async () => {
            console.log('[App] Setup flow completed');
            await setupStateManager.setSetupComplete(true);
            setSetupComplete(true);
            setShowSetupFlow(false);
          }} 
        />
      </NetworkStatus>
    )
  }
  
  console.log('[App] Rendering login screen (neither checkingSetup nor showSetupFlow)');

  if (isAuthenticated) {
    return (
      <NetworkStatus>
        <Dashboard onLogout={handleLogout} />
      </NetworkStatus>
    )
  }


  return (
    <NetworkStatus>
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div>
            <h2 className="text-3xl font-bold text-white bg-orange-500 w-fit text-center mx-auto p-3 rounded-lg mb-2">
             Cyberix
            </h2>
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              Please sign in to your account
            </p>
          </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-md text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-md text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="rememberMe"
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Remember me
                </label>
              </div>

              <div>
                <a href="#" className="text-sm text-orange-600 hover:text-orange-500 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  'Sign in'
                )}
              </button>
              
              {/* <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handlePrefillCredentials}
                  disabled={isLoading}
                  className="flex justify-center py-2 px-4 border border-orange-300 dark:border-orange-600 rounded-md shadow-sm text-sm font-medium text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Fill Demo
                </button>
                
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  disabled={isLoading}
                  className="flex justify-center py-2 px-4 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear
                </button>
              </div> */}
            </div>
          </form>

          {/* <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Demo Credentials:<br />
              <span className="font-mono text-xs bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                Username: admin | Password: admin@123
              </span>
            </p>
          </div> */}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Protected by industry-standard encryption
          </p>
        </div>
      </div>
    </div>

    {/* WSL Password Dialog */}
    <SimpleWslPasswordDialog
      isOpen={showWslPasswordDialog}
      onClose={handleWslPasswordCancel}
      onSuccess={handleWslPasswordSuccess}
    />

    {/* WSL User Creation Dialog */}
    <WslUserCreationDialog
      isOpen={showWslUserCreationDialog}
      onClose={handleWslUserCreationCancel}
      onSuccess={handleWslUserCreationSuccess}
    />
    </NetworkStatus>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NotificationProvider>
          <GlobalScanProvider>
            <ScanningProvider>
              <AppContent />
            </ScanningProvider>
          </GlobalScanProvider>
        </NotificationProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
