import { useState, useEffect } from 'react'
import "./index.css"
import Dashboard from './Dashboard'
import Setup from './components/Setup'
import NetworkStatus from './components/NetworkStatus'
import SimpleWslPasswordDialog from './components/SimpleWslPasswordDialog'
import { ToastProvider, useToast } from './context/ToastContext'
import { ScanningProvider } from './context/ScanningContext'
import { ThemeProvider } from './context/ThemeContext'
import { getSecurePassword, hasSecurePassword, validateStoredPassword } from './utils/securePasswordStorage'
import logo from './assets/webp/Cybersecurity research-02.webp'

const AppContent = () => {
  const { showError, showSuccess, showLoading, dismissToast } = useToast()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentToastId, setCurrentToastId] = useState(null)
  const [setupComplete, setSetupComplete] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [installPath, setInstallPath] = useState(null)
  
  // New states for WSL credential flow
  const [showWslPasswordDialog, setShowWslPasswordDialog] = useState(false)
  const [isCheckingCredentials, setIsCheckingCredentials] = useState(false)

  // Check setup completion status on app load
  useEffect(() => {
    const checkSetupStatus = async () => {
      try {
        if (window.cyberGuard) {
          const setupStatus = await window.cyberGuard.checkSetupComplete()
          setSetupComplete(setupStatus.completed)
          setInstallPath(setupStatus.installPath)
        }
      } catch (error) {
        console.error('Error checking setup status:', error)
        setSetupComplete(false)
      } finally {
        setCheckingSetup(false)
      }
    }

    checkSetupStatus()
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
      // Simulate login process with realistic delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check credentials
      if (formData.username === 'admin' && formData.password === 'admin@123') {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show success toast
        showSuccess(`🎉 Welcome back, ${formData.username}! Login successful.`, {
          duration: 3000
        })
        
        // Start the WSL credential and tool checking flow
        await handlePostLoginFlow()
        
      } else {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show error toast with professional styling
        showError('❌ Authentication failed! Invalid credentials provided.', {
          duration: 5000
        })
      }
    } catch (error) {
      // Dismiss loading toast
      dismissToast(loadingToastId)
      
      // Show error toast for unexpected errors
      showError('🌐 Connection error. Please check your network and try again.', {
        duration: 6000
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
      
      // Check if we have stored WSL credentials
      if (hasSecurePassword()) {
        console.log('🔐 [APP] Found stored WSL password, validating...')
        
        // Validate the stored password
        const isValid = await validateStoredPassword()
        
        if (isValid) {
          console.log('✅ [APP] Stored password is valid, checking tools...')
          
      // Check which tools are missing
      const password = getSecurePassword()
      if (window.cyberGuard && window.cyberGuard.checkRequiredToolsOnly) {
        console.log('🔧 [APP] Calling checkRequiredToolsOnly with password:', password ? 'EXISTS' : 'NULL')
        const toolCheck = await window.cyberGuard.checkRequiredToolsOnly(password)
        
        console.log('🔧 [APP] ===== TOOL CHECK RESULT =====')
        console.log('🔧 [APP] Tool check result:', toolCheck)
        console.log('🔧 [APP] Tool check success:', toolCheck?.success)
        console.log('🔧 [APP] Tool check missingTools:', toolCheck?.missingTools)
        console.log('🔧 [APP] Tool check totalChecked:', toolCheck?.totalChecked)
        console.log('🔧 [APP] ===== END TOOL CHECK RESULT =====')
        
        if (toolCheck && toolCheck.success) {
              console.log('✅ [APP] All tools are ready!')
              // Navigate directly to dashboard
              setTimeout(() => {
                setIsAuthenticated(true)
              }, 800)
            } else if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
              console.log('⚠️ [APP] Some tools are missing:', toolCheck.missingTools)
              console.log('🔧 [APP] Missing tools detected, stopping here for now')
              // Just show the missing tools info and navigate to dashboard
              showError(`Missing ${toolCheck.missingTools.length} tools: ${toolCheck.missingTools.join(', ')}. Please install them manually.`)
              setTimeout(() => {
                setIsAuthenticated(true)
              }, 2000)
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
        } else {
          console.log('❌ [APP] Stored password is invalid, asking for new password')
          // Password is invalid, ask for new password
          setShowWslPasswordDialog(true)
        }
      } else {
        console.log('🔐 [APP] No stored WSL password found, asking for password')
        // No stored password, ask for password
        setShowWslPasswordDialog(true)
      }
    } catch (error) {
      console.error('❌ [APP] Post-login flow failed:', error)
      showError('Failed to initialize system. Please try again.')
    } finally {
      setIsCheckingCredentials(false)
    }
  }

  const handleLogout = () => {
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

  const handlePrefillCredentials = () => {
    setFormData(prev => ({
      ...prev,
      username: 'admin',
      password: 'admin@123'
    }))
    
    // Show success toast
    showSuccess('✅ Demo credentials filled! Ready to sign in.', {
      duration: 2000
    })
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
          console.log('🔧 [APP] Missing tools detected, stopping here for now')
          // Just show the missing tools info and navigate to dashboard
          showError(`Missing ${toolCheck.missingTools.length} tools: ${toolCheck.missingTools.join(', ')}. Please install them manually.`)
          setTimeout(() => {
            setIsAuthenticated(true)
          }, 2000)
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

  // Show setup screen if setup is not complete
  if (!setupComplete) {
    return (
      <NetworkStatus>
        <Setup onSetupComplete={handleSetupComplete} />
      </NetworkStatus>
    )
  }

  if (isAuthenticated) {
    return (
      <NetworkStatus>
        <Dashboard onLogout={handleLogout} />
      </NetworkStatus>
    )
  }

  // Show credential checking screen
  if (isCheckingCredentials) {
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
              Initializing System...
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Checking WSL credentials and security tools
            </p>
          </div>
        </div>
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
              
              <div className="grid grid-cols-2 gap-3">
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
              </div>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Demo Credentials:<br />
              <span className="font-mono text-xs bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 px-2 py-1 rounded">
                Username: admin | Password: admin@123
              </span>
            </p>
          </div>
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
    </NetworkStatus>
  )
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ScanningProvider>
          <AppContent />
        </ScanningProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App
