import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { getSecurePassword } from '../utils/securePasswordStorage'
import { getWslCredentials } from '../utils/wslPasswordManager'
import { CheckCircle, XCircle, AlertCircle, Loader2, Clock } from 'lucide-react'

function QuickCheckScreen({ onComplete }) {
  const { showError, showSuccess } = useToast()
  const [currentStepId, setCurrentStepId] = useState(null)
  const [steps, setSteps] = useState([
    { 
      id: 'password', 
      title: 'Validating WSL Password', 
      description: 'Checking password credentials...',
      status: 'pending',
      error: null,
      completedAt: null
    },
    { 
      id: 'wsl', 
      title: 'Checking WSL Installation', 
      description: 'Verifying WSL is installed...',
      status: 'pending',
      error: null,
      completedAt: null
    },
    { 
      id: 'ubuntu', 
      title: 'Checking Ubuntu Distribution', 
      description: 'Verifying Ubuntu is installed...',
      status: 'pending',
      error: null,
      completedAt: null
    },
    { 
      id: 'folders', 
      title: 'Verifying Cyberix Folders', 
      description: 'Checking required folders...',
      status: 'pending',
      error: null,
      completedAt: null
    },
    { 
      id: 'tools', 
      title: 'Verifying Security Tools', 
      description: 'Checking installed tools...',
      status: 'pending',
      error: null,
      completedAt: null
    },
    { 
      id: 'logPath', 
      title: 'Checking Log Storage Path', 
      description: 'Verifying log configuration...',
      status: 'pending',
      error: null,
      completedAt: null
    }
  ])
  const [platform, setPlatform] = useState(null)

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

  useEffect(() => {
    performQuickChecks()
  }, [])

  const updateStep = (stepId, updates) => {
    setSteps(prev => prev.map(step => 
      step.id === stepId ? { ...step, ...updates } : step
    ))
  }

  const getPlatform = async () => {
    try {
      if (window.cyberGuard?.getPlatform) {
        return await window.cyberGuard.getPlatform()
      }
      return 'win32'
    } catch {
      return 'win32'
    }
  }

  const performQuickChecks = async () => {
    try {
      // Get platform first
      const detectedPlatform = await getPlatform()
      setPlatform(detectedPlatform)

      // Check 1: Password validity (ALWAYS FIRST)
      setCurrentStepId('password')
      await checkPassword()
      await delay(400)

      // Check 2: WSL and Ubuntu (Windows only)
      if (detectedPlatform === 'win32') {
        setCurrentStepId('wsl')
        await checkWSL()
        await delay(400)

        setCurrentStepId('ubuntu')
        await checkUbuntu()
        await delay(400)
      } else {
        // Skip WSL/Ubuntu checks for non-Windows
        updateStep('wsl', { status: 'skipped', description: 'WSL check skipped (not Windows)' })
        updateStep('ubuntu', { status: 'skipped', description: 'Ubuntu check skipped (not Windows)' })
        await delay(300)
      }

      // Check 3: Folders (before tools, as tools depend on folders)
      setCurrentStepId('folders')
      await checkFolders()
      await delay(400)

      // Check 4: Security Tools
      setCurrentStepId('tools')
      await checkTools()
      await delay(400)

      // Check 5: Log Path
      setCurrentStepId('logPath')
      await checkLogPath()
      await delay(500)
      
      setCurrentStepId(null)

      // Wait a bit before completing
      await delay(800)
      
      // Complete - navigate to dashboard
      onComplete()
    } catch (error) {
      console.error('Quick check failed:', error)
      showError('Quick check failed. Please try again.')
      // Still complete after delay
      setTimeout(() => {
        onComplete()
      }, 2000)
    }
  }

  // Get password from C:\Users\Admin\AppData\Roaming\Cyberix\wsl_password.enc
  const getPasswordFromFile = async () => {
    try {
      // First try localStorage
      let password = getSecurePassword()
      if (password) {
        console.log('🔐 [QUICK-CHECK] Password found in localStorage')
        return password
      }

      // If not in localStorage, try to get from file via IPC
      if (window.cyberGuard?.getStoredRootPassword) {
        password = await window.cyberGuard.getStoredRootPassword()
        if (password) {
          console.log('🔐 [QUICK-CHECK] Password found in file system')
          return password
        }
      }

      console.log('🔐 [QUICK-CHECK] Password not found in localStorage or file')
      return null
    } catch (error) {
      console.error('🔐 [QUICK-CHECK] Error getting password:', error)
      return null
    }
  }

  const checkPassword = async () => {
    updateStep('password', { status: 'checking', description: 'Validating password...' })
    await delay(200)

    try {
      const password = await getPasswordFromFile()
      if (!password) {
        updateStep('password', { 
          status: 'error', 
          description: 'Password not found',
          error: 'WSL password is not stored. Please run setup again.',
          completedAt: new Date().toISOString()
        })
        return
      }

      if (window.cyberGuard?.testWslRootCredentials) {
        const result = await window.cyberGuard.testWslRootCredentials(password)
        if (result?.success) {
          updateStep('password', { 
            status: 'success', 
            description: 'Password is valid',
            completedAt: new Date().toISOString()
          })
        } else {
          updateStep('password', { 
            status: 'error', 
            description: 'Password is invalid',
            error: 'WSL password is incorrect. Please update it in settings.',
            completedAt: new Date().toISOString()
          })
        }
      } else {
        updateStep('password', { 
          status: 'error', 
          description: 'Cannot verify password',
          error: 'Password verification API not available',
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('password', { 
        status: 'error', 
        description: 'Password check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const checkWSL = async () => {
    updateStep('wsl', { status: 'checking', description: 'Checking WSL installation...' })
    await delay(200)

    try {
      if (window.cyberGuard?.checkWsl) {
        const hasWsl = await window.cyberGuard.checkWsl()
        if (hasWsl) {
          updateStep('wsl', { 
            status: 'success', 
            description: 'WSL is installed',
            completedAt: new Date().toISOString()
          })
        } else {
          updateStep('wsl', { 
            status: 'error', 
            description: 'WSL not found',
            error: 'WSL is not installed. Please install WSL first.',
            completedAt: new Date().toISOString()
          })
        }
      } else {
        updateStep('wsl', { 
          status: 'error', 
          description: 'Cannot check WSL',
          error: 'WSL check API not available',
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('wsl', { 
        status: 'error', 
        description: 'WSL check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const checkUbuntu = async () => {
    updateStep('ubuntu', { status: 'checking', description: 'Checking Ubuntu distribution...' })
    await delay(200)

    try {
      if (window.cyberGuard?.verifyUbuntu) {
        const hasUbuntu = await window.cyberGuard.verifyUbuntu()
        if (hasUbuntu) {
          updateStep('ubuntu', { 
            status: 'success', 
            description: 'Ubuntu is installed',
            completedAt: new Date().toISOString()
          })
        } else {
          updateStep('ubuntu', { 
            status: 'error', 
            description: 'Ubuntu not found',
            error: 'Ubuntu distribution is not installed in WSL.',
            completedAt: new Date().toISOString()
          })
        }
      } else {
        updateStep('ubuntu', { 
          status: 'error', 
          description: 'Cannot check Ubuntu',
          error: 'Ubuntu check API not available',
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('ubuntu', { 
        status: 'error', 
        description: 'Ubuntu check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const checkFolders = async () => {
    updateStep('folders', { status: 'checking', description: 'Verifying Cyberix folders...' })
    await delay(200)

    try {
      // Get password from file system (C:\Users\Admin\AppData\Roaming\Cyberix\wsl_password.enc)
      const password = await getPasswordFromFile()
      if (!password) {
        updateStep('folders', { 
          status: 'error', 
          description: 'Cannot check folders',
          error: 'Password required to check folders',
          completedAt: new Date().toISOString()
        })
        return
      }

      // Get username from stored credentials (same as Installation Setup)
      let username = 'root'
      const storedCredentials = getWslCredentials()
      if (storedCredentials?.username) {
        username = storedCredentials.username
        console.log('🔐 [QUICK-CHECK] Using username from stored credentials:', username)
      } else if (window.cyberGuard?.getWslUsername) {
        const wslUserResult = await window.cyberGuard.getWslUsername()
        if (wslUserResult?.username) {
          username = wslUserResult.username
          console.log('🔐 [QUICK-CHECK] Using username from API:', username)
        }
      }

      if (!window.cyberGuard?.runWslCommandAsRoot) {
        updateStep('folders', { 
          status: 'error', 
          description: 'Cannot check folders',
          error: 'WSL command API not available',
          completedAt: new Date().toISOString()
        })
        return
      }

      // Check if /root/cyberix exists (SAME as Installation Setup)
      const folderCheck = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'test -d /root/cyberix && echo exists || echo notfound',
        password
      )

      if (!folderCheck?.stdout?.includes('exists')) {
        updateStep('folders', { 
          status: 'error', 
          description: 'Cyberix folder not found',
          error: '/root/cyberix folder does not exist',
          completedAt: new Date().toISOString()
        })
        return
      }

      // Check each folder individually using test -d (more reliable than parsing ls output)
      // This matches the approach used in Step3CyberixFolder for venv check
      const checkFluxploider = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && test -d fluxploider && echo exists || echo notfound',
        password
      )
      
      const checkTestssl = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && test -d testssl && echo exists || echo notfound',
        password
      )
      
      const checkVenv = await window.cyberGuard.runWslCommandAsRoot(
        username,
        'cd /root/cyberix && test -d .venv && echo exists || echo notfound',
        password
      )

      const hasFluxploider = checkFluxploider?.stdout?.includes('exists') || false
      const hasTestssl = checkTestssl?.stdout?.includes('exists') || false
      const hasVenv = checkVenv?.stdout?.includes('exists') || false

      const missing = []
      if (!hasFluxploider) missing.push('fluxploider')
      if (!hasTestssl) missing.push('testssl')
      if (!hasVenv) missing.push('venv')

      if (missing.length === 0) {
        updateStep('folders', { 
          status: 'success', 
          description: 'All Cyberix folders present',
          completedAt: new Date().toISOString()
        })
      } else {
        updateStep('folders', { 
          status: 'error', 
          description: 'Some folders missing',
          error: `Missing folders: ${missing.join(', ')}`,
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('folders', { 
        status: 'error', 
        description: 'Folder check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const checkTools = async () => {
    updateStep('tools', { status: 'checking', description: 'Verifying security tools...' })
    await delay(200)

    try {
      // Get password from file system (C:\Users\Admin\AppData\Roaming\Cyberix\wsl_password.enc)
      const password = await getPasswordFromFile()
      if (!password) {
        updateStep('tools', { 
          status: 'error', 
          description: 'Cannot check tools',
          error: 'Password required to check tools',
          completedAt: new Date().toISOString()
        })
        return
      }

      // Get username from stored credentials (same as Installation Setup)
      let username = 'root'
      const storedCredentials = getWslCredentials()
      if (storedCredentials?.username) {
        username = storedCredentials.username
        console.log('🔐 [QUICK-CHECK] Using username from stored credentials:', username)
      } else if (window.cyberGuard?.getWslUsername) {
        const wslUserResult = await window.cyberGuard.getWslUsername()
        if (wslUserResult?.username) {
          username = wslUserResult.username
          console.log('🔐 [QUICK-CHECK] Using username from API:', username)
        }
      }

      if (!window.cyberGuard?.runWslCommandAsRoot) {
        updateStep('tools', { 
          status: 'error', 
          description: 'Cannot check tools',
          error: 'WSL command API not available',
          completedAt: new Date().toISOString()
        })
        return
      }

      // Required tools list (SAME as Installation Setup - Step4ToolsInstallation.jsx)
      const requiredTools = [
        'jq', 'unzip', 'curl', 'wget', 'nmap', 'nikto', 'sqlmap', 'hydra', 
        'gobuster', 'dirb', 'sslscan', 'dnstwist', 'geoip-bin', 'wapiti', 
        'golang-go', 'amass', 'ffuf', 'nuclei', 'dalfox'
      ]

      const missingTools = []
      
      // Check each tool individually using runWslCommandAsRoot (SAME as Installation Setup)
      for (const toolName of requiredTools) {
        try {
          const result = await window.cyberGuard.runWslCommandAsRoot(
            username,
            `command -v ${toolName} >/dev/null 2>&1 && echo 'installed' || echo 'notinstalled'`,
            password
          )
          
          const output = result?.stdout || ''
          if (!output.includes('installed')) {
            missingTools.push(toolName)
            console.log(`❌ [QUICK-CHECK] Tool missing: ${toolName}`)
          } else {
            console.log(`✅ [QUICK-CHECK] Tool found: ${toolName}`)
          }
        } catch (error) {
          // If check fails, assume tool is missing
          missingTools.push(toolName)
          console.error(`❌ [QUICK-CHECK] Error checking ${toolName}:`, error.message)
        }
      }

      if (missingTools.length === 0) {
        updateStep('tools', { 
          status: 'success', 
          description: 'All security tools are installed',
          completedAt: new Date().toISOString()
        })
      } else {
        updateStep('tools', { 
          status: 'error', 
          description: `${missingTools.length} tools missing`,
          error: `Missing tools: ${missingTools.join(', ')}`,
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('tools', { 
        status: 'error', 
        description: 'Tool check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const checkLogPath = async () => {
    updateStep('logPath', { status: 'checking', description: 'Checking log storage path...' })
    await delay(200)

    try {
      if (window.cyberGuard?.checkInstallationLogFile) {
        const logFile = await window.cyberGuard.checkInstallationLogFile()
        if (logFile?.exists) {
          updateStep('logPath', { 
            status: 'success', 
            description: 'Log storage path configured',
            completedAt: new Date().toISOString()
          })
        } else {
          updateStep('logPath', { 
            status: 'error', 
            description: 'Log path not configured',
            error: 'Installation log file not found. Please complete setup.',
            completedAt: new Date().toISOString()
          })
        }
      } else {
        updateStep('logPath', { 
          status: 'error', 
          description: 'Cannot check log path',
          error: 'Log path API not available',
          completedAt: new Date().toISOString()
        })
      }
    } catch (error) {
      updateStep('logPath', { 
        status: 'error', 
        description: 'Log path check failed',
        error: error.message,
        completedAt: new Date().toISOString()
      })
    }
  }

  const getStepStatus = (step) => {
    if (!step) return 'pending'
    if (step.status === 'error') return 'error'
    if (step.status === 'skipped') return 'skipped'
    if (step.status === 'success') return 'completed'
    if (step.id === currentStepId) return 'active'
    if (currentStepId && step.id !== currentStepId) {
      // Check if this step should be completed (all steps before currentStepId)
      const stepOrder = ['password', 'wsl', 'ubuntu', 'folders', 'tools', 'logPath']
      const currentIndex = stepOrder.indexOf(currentStepId)
      const stepIndex = stepOrder.indexOf(step.id)
      if (stepIndex < currentIndex) return 'completed'
    }
    return 'pending'
  }

  const getStepIcon = (status) => {
    if (status === 'completed') {
      return <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
    }
    if (status === 'active') {
      return <Loader2 className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" />
    }
    if (status === 'error') {
      return <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
    }
    if (status === 'skipped') {
      return <AlertCircle className="w-6 h-6 text-gray-400" />
    }
    return <Clock className="w-6 h-6 text-gray-400" />
  }

  const getStepColor = (status) => {
    if (status === 'completed') return 'border-green-500 bg-green-500'
    if (status === 'active') return 'border-blue-500 bg-blue-500'
    if (status === 'error') return 'border-red-500 bg-red-500'
    if (status === 'skipped') return 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
    return 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700'
  }

  const getTextColor = (status) => {
    if (status === 'completed') return 'text-green-700 dark:text-green-400'
    if (status === 'active') return 'text-blue-700 dark:text-blue-400 font-semibold'
    if (status === 'error') return 'text-red-700 dark:text-red-400'
    if (status === 'skipped') return 'text-gray-500 dark:text-gray-400'
    return 'text-gray-500 dark:text-gray-400'
  }

  // Filter out skipped steps for display (only show WSL/Ubuntu on Windows)
  const visibleSteps = platform === 'win32' 
    ? steps 
    : steps.filter(step => step.id !== 'wsl' && step.id !== 'ubuntu')

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-orange-50/30 to-gray-50 dark:from-slate-900 dark:via-orange-900/10 dark:to-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Quick System Check
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Verifying system components...
          </p>
        </div>

        {/* Timeline Progress */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
          <div className="space-y-4">
            {visibleSteps.map((step, index) => {
              const status = getStepStatus(step)
              const isLast = index === visibleSteps.length - 1

              return (
                <div key={step.id} className="relative flex items-start gap-4">
                  {/* Icon and Connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center z-10 transition-all duration-300 ${getStepColor(status)}`}
                    >
                      {getStepIcon(status)}
                    </div>
                    
                    {/* Connector Line */}
                    {!isLast && (
                      <div
                        className={`w-0.5 mt-2 transition-all duration-300 ${
                          status === 'completed'
                            ? 'bg-green-500'
                            : status === 'active'
                            ? 'bg-blue-500'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ height: '4rem', minHeight: '4rem' }}
                      />
                    )}
                  </div>

                  {/* Step Details */}
                  <div className="flex-1 pt-1 pb-4">
                    <div className={`font-semibold text-lg mb-1 transition-colors duration-300 ${getTextColor(status)}`}>
                      {step.title}
                    </div>
                    <div className={`text-sm mb-2 transition-colors duration-300 ${getTextColor(status)}`}>
                      {step.description}
                    </div>
                    
                    {/* Error Message */}
                    {step.error && (
                      <div className="text-xs text-red-600 dark:text-red-400 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        {step.error}
                      </div>
                    )}

                    {/* Completion Time */}
                    {status === 'completed' && step.completedAt && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        ✓ Completed
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QuickCheckScreen

