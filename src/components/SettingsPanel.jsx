import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { getSecurePassword } from '../utils/securePasswordStorage'

function SettingsPanel() {
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

  // MALDEF Tools definition
  const MALDEF_TOOLS = [
    { name: 'tshark', package: 'tshark', category: 'network' },
    { name: 'tcpdump', package: 'tcpdump', category: 'network' },
    { name: 'ngrep', package: 'ngrep', category: 'network' },
    { name: 'nikto', package: 'nikto', category: 'web' },
    { name: 'wapiti', package: 'wapiti', category: 'web' },
    { name: 'wpscan', package: 'wpscan', category: 'web' },
    { name: 'clamav', package: 'clamav', category: 'malware' },
    { name: 'clamav-daemon', package: 'clamav-daemon', category: 'malware' },
    { name: 'freshclam', package: 'clamav-freshclam', category: 'malware' },
    { name: 'yara', package: 'yara', category: 'malware' },
    { name: 'rkhunter', package: 'rkhunter', category: 'malware' },
    { name: 'chkrootkit', package: 'chkrootkit', category: 'malware' },
    { name: 'lynis', package: 'lynis', category: 'audit' },
    { name: 'jq', package: 'jq', category: 'helper' },
    { name: 'curl', package: 'curl', category: 'helper' },
    { name: 'wget', package: 'wget', category: 'helper' },
    { name: 'git', package: 'git', category: 'helper' },
    { name: 'pandoc', package: 'pandoc', category: 'helper' },
    { name: 'inotifywait', package: 'inotify-tools', category: 'monitoring' }
  ]

  // State for tool requirements
  const [statuses, setStatuses] = useState({
    pip: { installed: false, checking: false, version: null },
    tgpt: { installed: false, checking: false, version: null }
  })
  const [isInstalling, setIsInstalling] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [installProgress, setInstallProgress] = useState({ current: 0, total: 0, message: '' })
  const [repos, setRepos] = useState([])
  const [reposChecking, setReposChecking] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [installType, setInstallType] = useState('tools')

  // State for maldef tools
  const [maldefStatuses, setMaldefStatuses] = useState({})
  const [isInstallingMaldef, setIsInstallingMaldef] = useState(false)
  const [isCheckingMaldef, setIsCheckingMaldef] = useState(false)
  const [maldefInstallProgress, setMaldefInstallProgress] = useState({ current: 0, total: 0, message: '' })

  // Helper functions
  const renderBadge = (installed) => {
    return (
      <span className={`text-xs font-semibold px-2 py-1 rounded ${
        installed ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
      }`}>
        {installed ? '✓ Installed' : '✗ Missing'}
      </span>
    )
  }

  const getMissingToolsCount = () => {
    let count = 0
    if (!statuses.pip.installed) count++
    if (!statuses.tgpt.installed) count++
    return count
  }

  const getMissingMaldefToolsCount = () => {
    return MALDEF_TOOLS.filter(tool => !maldefStatuses[tool.name]?.installed).length
  }

  const refresh = async () => {
    setIsChecking(true)
    // Add refresh logic here
    setTimeout(() => setIsChecking(false), 1000)
  }

  const refreshMaldefTools = async () => {
    setIsCheckingMaldef(true)
    // Add refresh logic here
    setTimeout(() => setIsCheckingMaldef(false), 1000)
  }

  const handleInstallAll = () => {
    setInstallType('tools')
    setShowPasswordModal(true)
  }

  const handleInstallMaldefTools = () => {
    setInstallType('maldef')
    setShowPasswordModal(true)
  }

  const handleInstallWithPassword = async (password) => {
    setIsInstalling(true)
    setInstallProgress({ current: 0, total: 2, message: 'Installing tools...' })
    // Add installation logic here
    setTimeout(() => {
      setIsInstalling(false)
      setInstallProgress({ current: 0, total: 0, message: '' })
    }, 2000)
  }

  const handleInstallMaldefWithPassword = async (password) => {
    setIsInstallingMaldef(true)
    setMaldefInstallProgress({ current: 0, total: MALDEF_TOOLS.length, message: 'Installing tools...' })
    // Add installation logic here
    setTimeout(() => {
      setIsInstallingMaldef(false)
      setMaldefInstallProgress({ current: 0, total: 0, message: '' })
    }, 2000)
  }

  useEffect(() => {
    // Initialize tool checks
    refresh()
    refreshMaldefTools()
  }, [])

  return (
    <div>Test</div>
  )
}

function PasswordModal({ onCancel, onSubmit }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = () => {
    if (!password.trim()) {
      setError('Password is required')
      return
    }
    setError('')
    onSubmit(password)
    setPassword('')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Root Password Required
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Enter your WSL root password to install missing security tools. This password will be used for this installation session only.
        </p>
        
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            placeholder="Enter WSL sudo password"
            className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
        
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Install All Tools
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel