import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'

function SettingsPanel() {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [systemStatus, setSystemStatus] = useState({
    wsl: { installed: false, checking: true },
    kali: { installed: false, checking: true },
    tools: {
      nmap: { installed: false, checking: true },
      dig: { installed: false, checking: true },
      dnsrecon: { installed: false, checking: true },
      dnsenum: { installed: false, checking: true },
      nikto: { installed: false, checking: true },
      sqlmap: { installed: false, checking: true },
      gobuster: { installed: false, checking: true }
    }
  })
  const [installing, setInstalling] = useState(false)

  // Check system requirements on component mount
  useEffect(() => {
    checkSystemRequirements()
  }, [])

  const checkSystemRequirements = async () => {
    if (typeof window !== 'undefined' && window.cyberGuard) {
      try {
        // Check WSL status
        const wslStatus = await window.cyberGuard.os?.checkWsl?.()
        setSystemStatus(prev => ({
          ...prev,
          wsl: { installed: wslStatus || false, checking: false }
        }))

        // Check Kali Linux status
        const kaliStatus = await window.cyberGuard.kali?.check?.()
        setSystemStatus(prev => ({
          ...prev,
          kali: { installed: kaliStatus || false, checking: false }
        }))

        // Check tools in Kali Linux
        if (kaliStatus) {
          const toolChecks = await Promise.all([
            checkTool('nmap'),
            checkTool('dig'),
            checkTool('dnsrecon'),
            checkTool('dnsenum'),
            checkTool('nikto'),
            checkTool('sqlmap'),
            checkTool('gobuster')
          ])

          setSystemStatus(prev => ({
            ...prev,
            tools: {
              nmap: { installed: toolChecks[0], checking: false },
              dig: { installed: toolChecks[1], checking: false },
              dnsrecon: { installed: toolChecks[2], checking: false },
              dnsenum: { installed: toolChecks[3], checking: false },
              nikto: { installed: toolChecks[4], checking: false },
              sqlmap: { installed: toolChecks[5], checking: false },
              gobuster: { installed: toolChecks[6], checking: false }
            }
          }))
        }
      } catch (error) {
        console.error('Error checking system requirements:', error)
      }
    }
  }

  const checkTool = async (toolName) => {
    try {
      if (window.cyberGuard?.wsl) {
        const result = await window.cyberGuard.wsl.runCommand(`which ${toolName}`)
        return result.success
      }
      return false
    } catch {
      return false
    }
  }

  const installWSL = async () => {
    if (!window.cyberGuard?.os?.installWsl) return

    setInstalling(true)
    const loadingToastId = showLoading('Installing WSL...')

    try {
      const result = await window.cyberGuard.os.installWsl()
      dismissToast(loadingToastId)

      if (result) {
        showSuccess('WSL installed successfully!')
        setSystemStatus(prev => ({ ...prev, wsl: { installed: true, checking: false } }))
      } else {
        showError('Failed to install WSL')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('Error installing WSL: ' + error.message)
    }

    setInstalling(false)
  }

  const installKali = async () => {
    if (!window.cyberGuard?.kali?.install) return

    setInstalling(true)
    const loadingToastId = showLoading('Installing Kali Linux...')

    try {
      const result = await window.cyberGuard.kali.install()
      dismissToast(loadingToastId)

      if (result) {
        showSuccess('Kali Linux installed successfully!')
        setSystemStatus(prev => ({ ...prev, kali: { installed: true, checking: false } }))
        // Check tools again after Kali installation
        setTimeout(checkSystemRequirements, 2000)
      } else {
        showError('Failed to install Kali Linux')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('Error installing Kali Linux: ' + error.message)
    }

    setInstalling(false)
  }

  const installTools = async () => {
    if (!window.cyberGuard?.wsl?.runCommand) return

    setInstalling(true)
    const loadingToastId = showLoading('Installing security tools...')

    try {
      // Install all required tools
      const commands = [
        'sudo apt update',
        'sudo apt install -y nmap dnsutils dnsrecon dnsenum nikto sqlmap gobuster'
      ]

      for (const cmd of commands) {
        await window.cyberGuard.wsl.runCommand(cmd)
      }

      dismissToast(loadingToastId)
      showSuccess('All security tools installed successfully!')
      setTimeout(checkSystemRequirements, 1000)
    } catch (error) {
      dismissToast(loadingToastId)
      showError('Error installing tools: ' + error.message)
    }

    setInstalling(false)
  }

  const requiredTools = [
    { name: 'nmap', description: 'Network mapper for port scanning', required: true },
    { name: 'dig', description: 'DNS lookup utility', required: true },
    { name: 'dnsrecon', description: 'DNS reconnaissance tool', required: true },
    { name: 'dnsenum', description: 'DNS enumeration tool', required: true },
    { name: 'nikto', description: 'Web server scanner', required: true },
    { name: 'sqlmap', description: 'SQL injection tool', required: true },
    { name: 'gobuster', description: 'Directory enumeration tool', required: true }
  ]

  const securitySettings = [
    {
      category: 'Authentication',
      settings: [
        { name: 'Two-Factor Authentication', enabled: true, description: 'Require 2FA for all users' },
        { name: 'Session Timeout', enabled: true, description: 'Auto logout after 30 minutes of inactivity' },
        { name: 'Password Complexity', enabled: true, description: 'Enforce strong password requirements' },
        { name: 'Login Monitoring', enabled: true, description: 'Monitor and alert on suspicious logins' }
      ]
    },
    {
      category: 'Network Security',
      settings: [
        { name: 'Firewall', enabled: true, description: 'Block unauthorized network traffic' },
        { name: 'Intrusion Detection', enabled: true, description: 'Monitor for malicious network activity' },
        { name: 'VPN Access', enabled: false, description: 'Allow secure remote connections' },
        { name: 'Network Segmentation', enabled: true, description: 'Isolate critical network segments' }
      ]
    },
    {
      category: 'Data Protection',
      settings: [
        { name: 'Data Encryption', enabled: true, description: 'Encrypt sensitive data at rest and in transit' },
        { name: 'Backup Encryption', enabled: true, description: 'Encrypt all backup files' },
        { name: 'Data Loss Prevention', enabled: true, description: 'Prevent unauthorized data transfers' },
        { name: 'File Integrity Monitoring', enabled: false, description: 'Monitor critical files for changes' }
      ]
    },
    {
      category: 'Compliance',
      settings: [
        { name: 'Audit Logging', enabled: true, description: 'Log all security-related events' },
        { name: 'Compliance Reporting', enabled: true, description: 'Generate automated compliance reports' },
        { name: 'Data Retention', enabled: true, description: 'Automatically manage data lifecycle' },
        { name: 'Privacy Controls', enabled: true, description: 'Enforce data privacy regulations' }
      ]
    }
  ]

  const systemSettings = {
    notifications: {
      emailAlerts: true,
      smsAlerts: false,
      dashboardAlerts: true,
      criticalOnly: false
    },
    monitoring: {
      realTimeScanning: true,
      scheduledScans: true,
      behaviorAnalysis: true,
      threatIntelligence: true
    },
    performance: {
      autoUpdates: true,
      lowResourceMode: false,
      compressionEnabled: true,
      cacheOptimization: true
    }
  }

  return (
    <div className="space-y-6">
      {/* System Requirements Status */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">System Requirements</h2>

        {/* WSL Status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                systemStatus.wsl.installed ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {systemStatus.wsl.checking ? (
                  <svg className="w-5 h-5 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : systemStatus.wsl.installed ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Windows Subsystem for Linux (WSL)</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Required for running Kali Linux tools</p>
              </div>
            </div>
            {!systemStatus.wsl.installed && !systemStatus.wsl.checking && (
              <button
                onClick={installWSL}
                disabled={installing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                {installing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Install WSL</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className={`text-sm ${systemStatus.wsl.installed ? 'text-green-600' : 'text-red-600'}`}>
            {systemStatus.wsl.checking ? 'Checking WSL status...' :
             systemStatus.wsl.installed ? '✅ WSL is installed and ready' : '❌ WSL is not installed'}
          </div>
        </div>

        {/* Kali Linux Status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                systemStatus.kali.installed ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {systemStatus.kali.checking ? (
                  <svg className="w-5 h-5 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : systemStatus.kali.installed ? (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Kali Linux</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Security testing distribution with penetration tools</p>
              </div>
            </div>
            {!systemStatus.kali.installed && !systemStatus.kali.checking && systemStatus.wsl.installed && (
              <button
                onClick={installKali}
                disabled={installing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                {installing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Install Kali</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className={`text-sm ${systemStatus.kali.installed ? 'text-green-600' : 'text-red-600'}`}>
            {systemStatus.kali.checking ? 'Checking Kali Linux status...' :
             systemStatus.kali.installed ? '✅ Kali Linux is installed and ready' : '❌ Kali Linux is not installed'}
          </div>
        </div>

        {/* Security Tools Status */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Security Tools</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Required penetration testing tools</p>
            </div>
            {systemStatus.kali.installed && Object.values(systemStatus.tools).some(tool => !tool.installed) && (
              <button
                onClick={installTools}
                disabled={installing}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors flex items-center space-x-2"
              >
                {installing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Installing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <span>Install Tools</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {requiredTools.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    systemStatus.tools[tool.name]?.installed ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {systemStatus.tools[tool.name]?.checking ? (
                      <svg className="w-4 h-4 text-gray-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    ) : systemStatus.tools[tool.name]?.installed ? (
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.name}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{tool.description}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  systemStatus.tools[tool.name]?.installed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {systemStatus.tools[tool.name]?.checking ? 'Checking...' :
                   systemStatus.tools[tool.name]?.installed ? 'Installed' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* System Status Summary */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">System Status Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className={`text-lg font-bold ${systemStatus.wsl.installed ? 'text-green-600' : 'text-red-600'}`}>
                {systemStatus.wsl.installed ? '✅' : '❌'}
              </div>
              <div className="text-blue-700 dark:text-blue-300">WSL</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${systemStatus.kali.installed ? 'text-green-600' : 'text-red-600'}`}>
                {systemStatus.kali.installed ? '✅' : '❌'}
              </div>
              <div className="text-blue-700 dark:text-blue-300">Kali Linux</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${
                Object.values(systemStatus.tools).filter(tool => tool.installed).length === requiredTools.length
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {Object.values(systemStatus.tools).filter(tool => tool.installed).length}/{requiredTools.length}
              </div>
              <div className="text-blue-700 dark:text-blue-300">Tools</div>
            </div>
            <div className="text-center">
              <div className={`text-lg font-bold ${
                systemStatus.wsl.installed && systemStatus.kali.installed &&
                Object.values(systemStatus.tools).every(tool => tool.installed)
                  ? 'text-green-600' : 'text-red-600'
              }`}>
                {systemStatus.wsl.installed && systemStatus.kali.installed &&
                 Object.values(systemStatus.tools).every(tool => tool.installed) ? '✅' : '❌'}
              </div>
              <div className="text-blue-700 dark:text-blue-300">Ready</div>
            </div>
          </div>
        </div>
      </div>

      {/* System Overview */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">System Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Security Status</p>
            <p className="text-xs text-green-600 mt-1">Optimal</p>
          </div>
          
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">System Performance</p>
            <p className="text-xs text-blue-600 mt-1">Excellent</p>
          </div>
          
          <div className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Last Updated</p>
            <p className="text-xs text-purple-600 mt-1">2 hours ago</p>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="space-y-6">
        {securitySettings.map((category, categoryIndex) => (
          <div key={categoryIndex} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{category.category}</h3>
            
            <div className="space-y-4">
              {category.settings.map((setting, settingIndex) => (
                <div key={settingIndex} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{setting.name}</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{setting.description}</p>
                  </div>
                  <div className="flex items-center ml-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked={setting.enabled}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <span className={`ml-3 text-xs font-medium ${
                      setting.enabled ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {setting.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* System Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notification Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Notifications</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.notifications).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Monitoring Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Monitoring</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.monitoring).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Settings */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Performance</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.performance).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-200 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-slate-700">
        <button className="px-6 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
          Reset to Defaults
        </button>
        <button className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors">
          Export Configuration
        </button>
        <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  )
}

export default SettingsPanel