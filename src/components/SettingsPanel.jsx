import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { getSecurePassword } from '../utils/securePasswordStorage'

function SettingsPanel() {
  const { showError, showSuccess, showLoading, dismissToast } = useToast()
  const [statuses, setStatuses] = useState({
    pip: { installed: false, checking: true },
    tools: {},
    toolVersions: {}
  })
  const [isChecking, setIsChecking] = useState(true)
  const [repos, setRepos] = useState([])
  const [reposChecking, setReposChecking] = useState(true)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)
  const [installProgress, setInstallProgress] = useState({ current: 0, total: 0, message: '' })

  const REQUIRED_TOOLS = ['jq','unzip','nmap','hydra','gobuster','dirb','amass','john','medusa','mitmproxy','socat','fail2ban','curl','wget','ffuf','nuclei','dalfox','go','dnstwist','zaproxy','wfuzz','tshark']
  
  // API Scanning tools subset (Wireshark-based)
  const API_SCANNING_TOOLS = ['tshark']

  useEffect(() => {
    refresh()
  }, [])

  const refresh = async () => {
    setIsChecking(true)
    setReposChecking(true)
    try {
      const password = getSecurePassword()
      const pipRes = await window.cyberGuard?.runWslCommand?.('command -v pip3 || command -v pip', password)
      setStatuses(prev => ({
          ...prev,
        pip: { installed: !!(pipRes?.success && (pipRes.stdout || '').trim()), checking: false }
      }))

      // List cloned repos under /cybrix
      const listRes = await window.cyberGuard?.runWslCommand?.('bash -lc "[ -d /cybrix ] && ls -1 /cybrix || echo \"\""', password)
      const lines = (listRes?.stdout || '').split('\n').map(s => s.trim()).filter(Boolean)
      setRepos(lines)
      setReposChecking(false)

      // Check tools using version flags: "--version" then "-v" if needed (no sudo, no PATH exports)
      const toolEntries = await Promise.all(REQUIRED_TOOLS.map(async (t) => {
        try {
          const cmd1 = `bash -lc \"${t} --version\"`
          console.log(`[ToolCheck] ${t}: running --version ->`, cmd1)
          let res = await window.cyberGuard?.runWslCommand?.(cmd1, password)
          console.log(`[ToolCheck] ${t}: --version result success=${res?.success} stdout=${(res?.stdout||'').trim()} stderr=${(res?.stderr||'').trim()}`)
          let output = `${res?.stdout||''}\n${res?.stderr||''}`
          let notFound = /command not found|not found/i.test(output)
          let ok = (!!res?.success) || (!notFound && output.trim().length > 0)
          let version = null
          
          if (ok && res?.stdout) {
            // Extract version from output
            const versionMatch = res.stdout.match(/(\d+\.\d+\.\d+|\d+\.\d+)/)
            if (versionMatch) {
              version = versionMatch[1]
            } else {
              // Try to get first line
              const firstLine = res.stdout.split('\n')[0].trim()
              if (firstLine && firstLine.length < 50) {
                version = firstLine
              }
            }
          }
          
          if (!ok) {
            const cmd2 = `bash -lc \"${t} -v\"`
            console.log(`[ToolCheck] ${t}: running -v ->`, cmd2)
            res = await window.cyberGuard?.runWslCommand?.(cmd2, password)
            console.log(`[ToolCheck] ${t}: -v result success=${res?.success} stdout=${(res?.stdout||'').trim()} stderr=${(res?.stderr||'').trim()}`)
            output = `${res?.stdout||''}\n${res?.stderr||''}`
            notFound = /command not found|not found/i.test(output)
            ok = (!!res?.success) || (!notFound && output.trim().length > 0)
            
            if (ok && res?.stdout && !version) {
              const versionMatch = res.stdout.match(/(\d+\.\d+\.\d+|\d+\.\d+)/)
              if (versionMatch) {
                version = versionMatch[1]
              } else {
                const firstLine = res.stdout.split('\n')[0].trim()
                if (firstLine && firstLine.length < 50) {
                  version = firstLine
                }
              }
            }
          }
          
          console.log(`[ToolCheck] ${t}: available=${ok}, version=${version || 'N/A'}`)
          return [t, { installed: ok, checking: false, version: version || null }]
        } catch (_e) {
          console.log(`[ToolCheck] ${t}: error during check`, _e?.message)
          return [t, { installed: false, checking: false, version: null }]
        }
      }))
      const toolMap = Object.fromEntries(toolEntries)
      const versionMap = Object.fromEntries(toolEntries.map(([t, data]) => [t, data.version]))
      setStatuses(prev => ({ ...prev, tools: toolMap, toolVersions: versionMap }))
    } catch (e) {
      showError('Failed to check tools')
      setStatuses(prev => ({ ...prev, pip: { installed: false, checking: false } }))
    }
    setIsChecking(false)
  }

  const renderBadge = (ok) => (
    <span className={`ml-2 text-xs font-semibold ${ok ? 'text-green-600' : 'text-red-600'}`}>
      {ok ? 'Available' : 'Unavailable'}
    </span>
  )

  const handleInstallAll = () => {
    setShowPasswordModal(true)
  }

  const handleInstallWithPassword = async (password) => {
    if (!password) {
      showError('Password is required')
      return
    }

    setShowPasswordModal(false)
    setIsInstalling(true)
    setInstallProgress({ current: 0, total: REQUIRED_TOOLS.length, message: 'Starting installation...' })

    try {
      // Store password for session
      await window.cyberGuard?.storeRootPassword?.(password)

      // Check which tools are missing
      const missingTools = REQUIRED_TOOLS.filter(t => !statuses.tools[t]?.installed)
      
      if (missingTools.length === 0) {
        showSuccess('All tools are already installed!')
        setIsInstalling(false)
        return
      }

      const loadingToast = showLoading(`Installing ${missingTools.length} tools...`)

      // Set up progress listener
      window.cyberGuard?.onInstallProgress?.((progress) => {
        if (progress.tool) {
          const toolIndex = missingTools.indexOf(progress.tool)
          setInstallProgress({
            current: toolIndex + 1,
            total: missingTools.length,
            message: progress.message || `Installing ${progress.tool}...`
          })
        } else if (progress.phase === 'installing') {
          setInstallProgress({
            current: progress.current || 0,
            total: progress.total || missingTools.length,
            message: progress.message || 'Installing tools...'
          })
        }
      })

      // Start installation using rootless installer
      await window.cyberGuard?.installAllToolsRootless?.()

      dismissToast(loadingToast)
      showSuccess(`Successfully installed ${missingTools.length} tools!`)
      
      // Refresh tool status
      await refresh()
    } catch (error) {
      console.error('Installation error:', error)
      showError(`Installation failed: ${error?.message || 'Unknown error'}`)
    } finally {
      setIsInstalling(false)
      setInstallProgress({ current: 0, total: 0, message: '' })
    }
  }

  const getMissingToolsCount = () => {
    return REQUIRED_TOOLS.filter(t => !statuses.tools[t]?.installed).length
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

          {/* API Scanning Tools Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">API Scanning Tools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {API_SCANNING_TOOLS.map((t) => {
                const toolStatus = statuses.tools[t]
                const isInstalled = !!toolStatus?.installed
                const version = statuses.toolVersions[t] || toolStatus?.version || null
                
                return (
                  <div key={t} className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {isChecking ? (
                          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        {t}
                      </span>
                      {isChecking ? (
                        <span className="ml-2 text-xs font-semibold text-gray-400">Checking...</span>
                      ) : (
                        <span className={`text-xs font-semibold ${isInstalled ? 'text-green-600' : 'text-red-600'}`}>
                          {isInstalled ? '✓ Installed' : '✗ Missing'}
                        </span>
                      )}
                    </div>
                    {version && (
                      <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Version: {version}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* All Tools Section */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">All Security Tools</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {REQUIRED_TOOLS.map((t) => {
                const toolStatus = statuses.tools[t]
                const isInstalled = !!toolStatus?.installed
                const version = statuses.toolVersions[t] || toolStatus?.version || null
                const isAPITool = API_SCANNING_TOOLS.includes(t)
                
                return (
                  <div key={t} className={`flex flex-col p-3 bg-gray-50 dark:bg-slate-700 rounded ${isAPITool ? 'border-2 border-blue-300 dark:border-blue-600' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        {isChecking ? (
                          <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : null}
                        {t}
                        {isAPITool && <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1 rounded">API</span>}
                      </span>
                      {isChecking ? (
                        <span className="ml-2 text-xs font-semibold text-gray-400">Checking...</span>
                      ) : (
                        <span className={`text-xs font-semibold ${isInstalled ? 'text-green-600' : 'text-red-600'}`}>
                          {isInstalled ? '✓' : '✗'}
                        </span>
                      )}
                    </div>
                    {version && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        v{version}
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
          onSubmit={handleInstallWithPassword}
        />
      )}
    </div>
  )
}

function PasswordModal({ onCancel, onSubmit }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

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
        
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder="Enter WSL root password"
          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        
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