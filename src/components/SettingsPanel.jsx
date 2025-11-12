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

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Tool Requirements</h2>
          <div className="flex gap-2">
            {getMissingToolsCount() > 0 && (
              <button 
                onClick={handleInstallAll} 
                disabled={isInstalling || isChecking}
                className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInstalling ? 'Installing...' : `Install All (${getMissingToolsCount()})`}
              </button>
            )}
            <button 
              onClick={refresh} 
              disabled={isInstalling}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-900 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Recheck
            </button>
          </div>
        </div>

        {isInstalling && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Installing Tools...</span>
              <span className="text-sm text-blue-700 dark:text-blue-300">
                {installProgress.current} / {installProgress.total}
              </span>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2 mb-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(installProgress.current / Math.max(installProgress.total, 1)) * 100}%` }}
              ></div>
            </div>
            {installProgress.message && (
              <p className="text-xs text-blue-700 dark:text-blue-300">{installProgress.message}</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded">
            <div className="text-sm text-gray-900 dark:text-gray-100">pip / pip3</div>
            {renderBadge(statuses.pip.installed)}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded">
            <div className="text-sm text-gray-900 dark:text-gray-100">
              tgpt
              {statuses.tgpt.checking && (
                <svg className="w-4 h-4 text-gray-400 animate-spin inline-block ml-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
            </div>
            {statuses.tgpt.checking ? (
              <span className="ml-2 text-xs font-semibold text-gray-400">Checking...</span>
            ) : (
              <div className="flex items-center gap-2">
                {renderBadge(statuses.tgpt.installed)}
                {statuses.tgpt.version && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">({statuses.tgpt.version})</span>
                )}
              </div>
            )}
          </div>

          {/* Cloned repositories list */}
          <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Cloned Repositories (/cybrix)</div>
              {reposChecking && (
                <svg className="w-4 h-4 text-gray-300 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
            </div>
            {reposChecking ? (
              <div className="text-xs text-gray-400">Checking repositories...</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {repos.length === 0 ? (
                  <span className="text-xs text-gray-400">No repositories found</span>
                ) : (
                  repos.map((r) => (
                    <span key={r} className="text-xs px-2 py-1 rounded bg-slate-600/40 text-gray-100 border border-slate-500">{r}</span>
                  ))
                )}
              </div>
            )}
        </div>

      {/* Security Settings */}
      <div className="space-y-6">
        {securitySettings.map((category, categoryIndex) => (
          <div key={categoryIndex} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">{category.category}</h3>
            
            <div className="space-y-4">
              {category.settings.map((setting, settingIndex) => (
                <div key={settingIndex} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
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
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Malware & Defacement Tools Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Malware & Defacement Tools</h2>
          <div className="flex gap-2">
            {getMissingMaldefToolsCount() > 0 && (
              <button 
                onClick={handleInstallMaldefTools} 
                disabled={isInstallingMaldef || isCheckingMaldef}
                className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isInstallingMaldef ? 'Installing...' : `Install All (${getMissingMaldefToolsCount()})`}
              </button>
            )}
            <button 
              onClick={refreshMaldefTools} 
              disabled={isInstallingMaldef}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-900 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Recheck
            </button>
          </div>
        </div>

        {isInstallingMaldef && (
          <div className="mb-4 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-900 dark:text-purple-100">Installing Tools...</span>
              <span className="text-sm text-purple-700 dark:text-purple-300">
                {maldefInstallProgress.current} / {maldefInstallProgress.total}
              </span>
            </div>
            <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2 mb-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(maldefInstallProgress.current / Math.max(maldefInstallProgress.total, 1)) * 100}%` }}
              ></div>
            </div>
            {maldefInstallProgress.message && (
              <p className="text-xs text-purple-700 dark:text-purple-300">{maldefInstallProgress.message}</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Required Tools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {MALDEF_TOOLS.map((tool) => {
                const toolStatus = maldefStatuses[tool.name]
                const isInstalled = !!toolStatus?.installed
                
                return (
                  <div key={tool.name} className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {isCheckingMaldef ? (
                          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        {tool.name}
                        <span className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200 px-1 rounded">
                          {tool.category}
                        </span>
                      </span>
                      {isCheckingMaldef ? (
                        <span className="ml-2 text-xs font-semibold text-gray-400">Checking...</span>
                      ) : (
                        <span className={`text-xs font-semibold ${isInstalled ? 'text-green-600' : 'text-red-600'}`}>
                          {isInstalled ? '✓ Installed' : '✗ Missing'}
                        </span>
                      )}
                    </div>
                    {toolStatus?.path && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Path: {toolStatus.path}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <PasswordModal
          onCancel={() => setShowPasswordModal(false)}
          onSubmit={(password) => {
            // Determine which installation to trigger based on installType
            if (installType === 'maldef') {
              handleInstallMaldefWithPassword(password)
            } else {
              handleInstallWithPassword(password)
            }
          }}
        />
      )}
    </div>
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