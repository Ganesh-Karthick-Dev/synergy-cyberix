import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import { getSecurePassword } from '../utils/securePasswordStorage'

function SettingsPanel() {
  const { showError } = useToast()
  const [statuses, setStatuses] = useState({
    pip: { installed: false, checking: true },
    tools: {}
  })
  const [isChecking, setIsChecking] = useState(true)
  const [repos, setRepos] = useState([])
  const [reposChecking, setReposChecking] = useState(true)

  const REQUIRED_TOOLS = ['jq','unzip','nmap','nikto','sqlmap','hydra','gobuster','dirb','amass','john','medusa','mitmproxy','socat','fail2ban','curl','wget','ffuf','nuclei','dalfox','go','dnstwist']

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
          if (!ok) {
            const cmd2 = `bash -lc \"${t} -v\"`
            console.log(`[ToolCheck] ${t}: running -v ->`, cmd2)
            res = await window.cyberGuard?.runWslCommand?.(cmd2, password)
            console.log(`[ToolCheck] ${t}: -v result success=${res?.success} stdout=${(res?.stdout||'').trim()} stderr=${(res?.stderr||'').trim()}`)
            output = `${res?.stdout||''}\n${res?.stderr||''}`
            notFound = /command not found|not found/i.test(output)
            ok = (!!res?.success) || (!notFound && output.trim().length > 0)
          }
          console.log(`[ToolCheck] ${t}: available=${ok}`)
          return [t, { installed: ok, checking: false }]
        } catch (_e) {
          console.log(`[ToolCheck] ${t}: error during check`, _e?.message)
          return [t, { installed: false, checking: false }]
        }
      }))
      const toolMap = Object.fromEntries(toolEntries)
      setStatuses(prev => ({ ...prev, tools: toolMap }))
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

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Tool Requirements</h2>
          <button onClick={refresh} className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-900 text-white rounded">Recheck</button>
        </div>

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

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {REQUIRED_TOOLS.map((t) => (
              <div key={t} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded">
                <span className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-2">
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
                  renderBadge(!!statuses.tools[t]?.installed)
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel