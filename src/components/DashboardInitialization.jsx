import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { getSecurePassword } from '../utils/securePasswordStorage'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

// Required tools from initial setup (Step4ToolsInstallation)
const REQUIRED_TOOLS = [
  'jq', 'unzip', 'curl', 'wget', 'nmap', 'nikto', 'sqlmap', 'hydra', 
  'gobuster', 'dirb', 'sslscan', 'dnstwist', 'geoip-bin', 'wapiti', 
  'golang-go', 'amass', 'ffuf', 'nuclei', 'dalfox'
]

function DashboardInitialization({ onComplete }) {
  const { showError, showSuccess } = useToast()
  const [progress, setProgress] = useState(0)
  const [currentCheck, setCurrentCheck] = useState('Initializing system...')
  const [checks, setChecks] = useState({
    password: { status: 'pending', message: 'Validating WSL password', error: null, isActive: false },
    wsl: { status: 'pending', message: 'Checking WSL installation', error: null, isActive: false },
    ubuntu: { status: 'pending', message: 'Checking Ubuntu distribution', error: null, isActive: false },
    folders: { status: 'pending', message: 'Verifying Cyberix folders', error: null, isActive: false },
    tools: { status: 'pending', message: 'Verifying security tools', error: null, isActive: false },
    logPath: { status: 'pending', message: 'Checking log storage path', error: null, isActive: false }
  })
  const [errors, setErrors] = useState([])
  const [platform, setPlatform] = useState(null)

  const totalChecks = Object.keys(checks).length

  useEffect(() => {
    // Start checks immediately
    performSystemChecks()
  }, [])

  const updateProgress = () => {
    setChecks(prev => {
      const completed = Object.values(prev).filter(c => 
        c.status === 'success' || c.status === 'skipped' || c.status === 'error'
      ).length
      const newProgress = Math.round((completed / totalChecks) * 100)
      setProgress(Math.min(100, newProgress))
      return prev
    })
  }

  const performSystemChecks = async () => {
    try {
      // Get platform first
      const detectedPlatform = await getPlatform()
      setPlatform(detectedPlatform)
      
      // Check 1: Password validity (ALWAYS FIRST)
      await checkPassword()
      updateProgress()
      await delay(300) // Small delay for visual feedback
      
      // Check 2: WSL and Ubuntu (Windows only)
      if (detectedPlatform === 'win32') {
        await checkWSL()
        updateProgress()
        await delay(300)
        
        await checkUbuntu()
        updateProgress()
        await delay(300)
      } else {
        // Skip WSL/Ubuntu checks for non-Windows
        setChecks(prev => ({
          ...prev,
          wsl: { status: 'skipped', message: 'WSL check skipped (not Windows)', error: null, isActive: false },
          ubuntu: { status: 'skipped', message: 'Ubuntu check skipped (not Windows)', error: null, isActive: false }
        }))
        updateProgress()
        await delay(200)
      }
      
      // Check 3: Folders (before tools, as tools depend on folders)
      await checkFolders()
      updateProgress()
      await delay(300)
      
      // Check 4: Security Tools
      await checkTools()
      updateProgress()
      await delay(300)
      
      // Check 5: Log Path
      await checkLogPath()
      updateProgress()
      
      // Wait a bit before final check
      await delay(500)
      
      // Get final state of checks
      setChecks(prev => {
        const allPassed = Object.values(prev).every(c => 
          c.status === 'success' || c.status === 'skipped'
        )
        
        if (allPassed) {
          setProgress(100)
          setCurrentCheck('All checks passed!')
          // Complete immediately without delay
          onComplete()
        } else {
          // Collect errors
          const errorList = []
          Object.entries(prev).forEach(([key, check]) => {
            if (check.status === 'error' && check.error) {
              errorList.push({ check: key, message: check.error })
            }
          })
          setErrors(errorList)
          
          // Show errors in snackbar
          if (errorList.length > 0) {
            showError(`${errorList.length} issue(s) found. Please fix them to continue.`)
          }
          setCurrentCheck('Some checks failed. Please review the issues below.')
        }
        
        return prev
      })
    } catch (error) {
      console.error('System check failed:', error)
      showError('System check failed. Please try again.')
    }
  }

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  const getPlatform = async () => {
    try {
      // Use IPC method to get platform
      if (window.cyberGuard?.getPlatform) {
        return await window.cyberGuard.getPlatform()
      }
      // Default to Windows for WSL checks
      return 'win32'
    } catch {
      return 'win32'
    }
  }

  const checkPassword = async () => {
    setCurrentCheck('Validating WSL password...')
    // Activate this check with animation
    setChecks(prev => ({
      ...prev,
      password: { ...prev.password, status: 'checking', isActive: true }
    }))
    
    await delay(200) // Animation delay
    
    try {
      const password = getSecurePassword()
      if (!password) {
        setChecks(prev => ({
          ...prev,
          password: { status: 'error', message: 'Password not found', error: 'WSL password is not stored. Please run setup again.', isActive: false }
        }))
        return
      }

      // Test password validity
      if (window.cyberGuard?.testWslRootCredentials) {
        const result = await window.cyberGuard.testWslRootCredentials(password)
        if (result?.success) {
          setChecks(prev => ({
            ...prev,
            password: { status: 'success', message: 'Password is valid', error: null, isActive: false }
          }))
        } else {
          setChecks(prev => ({
            ...prev,
            password: { status: 'error', message: 'Password is invalid', error: 'WSL password is incorrect. Please update it in settings.', isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          password: { status: 'error', message: 'Cannot verify password', error: 'Password verification API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        password: { status: 'error', message: 'Password check failed', error: error.message, isActive: false }
      }))
    }
  }

  const checkWSL = async () => {
    setCurrentCheck('Checking WSL installation...')
    setChecks(prev => ({
      ...prev,
      wsl: { ...prev.wsl, status: 'checking', isActive: true }
    }))
    await delay(200)
    
    try {
      if (window.cyberGuard?.checkWsl) {
        const hasWsl = await window.cyberGuard.checkWsl()
        if (hasWsl) {
          setChecks(prev => ({
            ...prev,
            wsl: { status: 'success', message: 'WSL is installed', error: null, isActive: false }
          }))
        } else {
          setChecks(prev => ({
            ...prev,
            wsl: { status: 'error', message: 'WSL not found', error: 'WSL is not installed. Please install WSL first.', isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          wsl: { status: 'error', message: 'Cannot check WSL', error: 'WSL check API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        wsl: { status: 'error', message: 'WSL check failed', error: error.message, isActive: false }
      }))
    }
  }

  const checkUbuntu = async () => {
    setCurrentCheck('Checking Ubuntu distribution...')
    setChecks(prev => ({
      ...prev,
      ubuntu: { ...prev.ubuntu, status: 'checking', isActive: true }
    }))
    await delay(200)
    
    try {
      if (window.cyberGuard?.verifyUbuntu) {
        const hasUbuntu = await window.cyberGuard.verifyUbuntu()
        if (hasUbuntu) {
          setChecks(prev => ({
            ...prev,
            ubuntu: { status: 'success', message: 'Ubuntu is installed', error: null, isActive: false }
          }))
        } else {
          setChecks(prev => ({
            ...prev,
            ubuntu: { status: 'error', message: 'Ubuntu not found', error: 'Ubuntu distribution is not installed in WSL.', isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          ubuntu: { status: 'error', message: 'Cannot check Ubuntu', error: 'Ubuntu check API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        ubuntu: { status: 'error', message: 'Ubuntu check failed', error: error.message, isActive: false }
      }))
    }
  }

  const checkTools = async () => {
    setCurrentCheck('Verifying security tools...')
    setChecks(prev => ({
      ...prev,
      tools: { ...prev.tools, status: 'checking', isActive: true }
    }))
    await delay(200)
    
    try {
      const password = getSecurePassword()
      if (!password) {
        setChecks(prev => ({
          ...prev,
          tools: { status: 'error', message: 'Cannot check tools', error: 'Password required to check tools', isActive: false }
        }))
        return
      }

      if (window.cyberGuard?.checkRequiredToolsOnly) {
        const result = await window.cyberGuard.checkRequiredToolsOnly(password)
        if (result?.success) {
          const missingCount = result.missingTools?.length || 0
          if (missingCount === 0) {
            setChecks(prev => ({
              ...prev,
              tools: { status: 'success', message: 'All security tools are installed', error: null, isActive: false }
            }))
          } else {
            setChecks(prev => ({
              ...prev,
              tools: { status: 'error', message: `${missingCount} tools missing`, error: `Missing tools: ${result.missingTools.join(', ')}`, isActive: false }
            }))
          }
        } else {
          setChecks(prev => ({
            ...prev,
            tools: { status: 'error', message: 'Tool check failed', error: result?.error || 'Failed to check tools', isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          tools: { status: 'error', message: 'Cannot check tools', error: 'Tool check API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        tools: { status: 'error', message: 'Tool check failed', error: error.message, isActive: false }
      }))
    }
  }

  const checkFolders = async () => {
    setCurrentCheck('Verifying Cyberix folders...')
    setChecks(prev => ({
      ...prev,
      folders: { ...prev.folders, status: 'checking', isActive: true }
    }))
    await delay(200)
    
    try {
      const password = getSecurePassword()
      if (!password) {
        setChecks(prev => ({
          ...prev,
          folders: { status: 'error', message: 'Cannot check folders', error: 'Password required to check folders', isActive: false }
        }))
        return
      }

      // Get WSL username
      let username = 'root'
      if (window.cyberGuard?.getWslUsername) {
        const wslUser = await window.cyberGuard.getWslUsername()
        if (wslUser) username = wslUser
      }

      if (window.cyberGuard?.runWslCommandAsRoot) {
        // Check if /root/cyberix exists
        const folderCheck = await window.cyberGuard.runWslCommandAsRoot(
          username,
          'test -d /root/cyberix && echo exists || echo notfound',
          password
        )

        if (!folderCheck?.stdout?.includes('exists')) {
          setChecks(prev => ({
            ...prev,
            folders: { status: 'error', message: 'Cyberix folder not found', error: '/root/cyberix folder does not exist', isActive: false }
          }))
          return
        }

        // Check for required folders inside /root/cyberix
        const listResult = await window.cyberGuard.runWslCommandAsRoot(
          username,
          'cd /root/cyberix && ls -la',
          password
        )

        const output = (listResult?.stdout || '').toLowerCase()
        const hasFluxploider = output.includes('fluxploider')
        const hasTestssl = output.includes('testssl')
        const hasVenv = output.includes('.venv') || output.includes('venv')

        const missing = []
        if (!hasFluxploider) missing.push('fluxploider')
        if (!hasTestssl) missing.push('testssl')
        if (!hasVenv) missing.push('venv')

        if (missing.length === 0) {
          setChecks(prev => ({
            ...prev,
            folders: { status: 'success', message: 'All Cyberix folders present', error: null, isActive: false }
          }))
        } else {
          setChecks(prev => ({
            ...prev,
            folders: { status: 'error', message: 'Some folders missing', error: `Missing folders: ${missing.join(', ')}`, isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          folders: { status: 'error', message: 'Cannot check folders', error: 'WSL command API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        folders: { status: 'error', message: 'Folder check failed', error: error.message, isActive: false }
      }))
    }
  }

  const checkLogPath = async () => {
    setCurrentCheck('Checking log storage path...')
    setChecks(prev => ({
      ...prev,
      logPath: { ...prev.logPath, status: 'checking', isActive: true }
    }))
    await delay(200)
    
    try {
      if (window.cyberGuard?.checkInstallationLogFile) {
        const logFile = await window.cyberGuard.checkInstallationLogFile()
        if (logFile?.exists) {
          setChecks(prev => ({
            ...prev,
            logPath: { status: 'success', message: 'Log storage path configured', error: null, isActive: false }
          }))
        } else {
          setChecks(prev => ({
            ...prev,
            logPath: { status: 'error', message: 'Log path not configured', error: 'Installation log file not found. Please complete setup.', isActive: false }
          }))
        }
      } else {
        setChecks(prev => ({
          ...prev,
          logPath: { status: 'error', message: 'Cannot check log path', error: 'Log path API not available', isActive: false }
        }))
      }
    } catch (error) {
      setChecks(prev => ({
        ...prev,
        logPath: { status: 'error', message: 'Log path check failed', error: error.message, isActive: false }
      }))
    }
  }

  const getCheckIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'checking':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      case 'skipped':
        return <AlertCircle className="w-5 h-5 text-gray-400" />
      default:
        return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
    }
  }

  const getCheckColor = (status) => {
    switch (status) {
      case 'success':
        return 'text-green-600 dark:text-green-400'
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'checking':
        return 'text-blue-600 dark:text-blue-400'
      case 'skipped':
        return 'text-gray-500 dark:text-gray-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-gray-50 dark:from-slate-900 dark:via-orange-900/10 dark:to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Things are getting ready for You
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {currentCheck || 'Initializing system...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                System Check Progress
              </span>
              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>

          {/* Check Items */}
          <div className="space-y-3 mt-6">
            {Object.entries(checks).map(([key, check]) => (
              <div
                key={key}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-300 ${
                  check.isActive
                    ? 'transform translate-y-[-2px] shadow-md'
                    : ''
                } ${
                  check.status === 'success'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : check.status === 'error'
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : check.status === 'skipped'
                    ? 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    : check.status === 'checking'
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getCheckIcon(check.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`font-medium ${getCheckColor(check.status)}`}>
                    {check.message}
                  </div>
                  {check.error && (
                    <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                      {check.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Summary */}
        {errors.length > 0 && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
                  Issues Found
                </h3>
                <ul className="space-y-1 text-sm text-red-800 dark:text-red-200">
                  {errors.map((err, idx) => (
                    <li key={idx}>• {err.message}</li>
                  ))}
                </ul>
                <p className="text-xs text-red-700 dark:text-red-300 mt-2">
                  Please fix these issues to continue. You may need to run the setup again.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardInitialization

