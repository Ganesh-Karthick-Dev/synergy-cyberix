import { useState, useEffect, useRef } from 'react'
import scanLogger from '../utils/scanLogger'

function SecurityAnalyzer() {
  const [url, setUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [progress, setProgress] = useState([])
  const [result, setResult] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previews, setPreviews] = useState([]) // {image, timestamp, pageUrl}
  const [previewIdx, setPreviewIdx] = useState(0)
  const [snackbar, setSnackbar] = useState(null)
  const logsRef = useRef(null)
  const summaryRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [useCredentials, setUseCredentials] = useState(false)
  const [severityFilter, setSeverityFilter] = useState({ info: true, low: true, medium: true, high: true })
  const [detailsModal, setDetailsModal] = useState({ open: false, page: null })
  const [showPassword, setShowPassword] = useState(false)
  const [scanOptions, setScanOptions] = useState({
    includeHeaders: true,
    includeSSL: true,
    includeDependencies: true,
    includeForms: true,
    includeMixedContent: true,
    includePortScan: false,
    maxPages: 50,
    maxDepth: 5,
    crawlDelay: 1000,
    mirrorBrowsing: true
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.cyberGuard) return
    
    const onProgress = (data) => {
      if (data?.type === 'preview') {
        setPreview(data.image)
        setPreviews(prev => {
          const next = [...prev, { image: data.image, timestamp: data.timestamp || Date.now(), pageUrl: data.pageUrl || '' }]
          // cap to last 50 previews to avoid memory bloat
          const capped = next.slice(-50)
          return capped
        })
        setPreviewIdx(idx => {
          const nextLen = previews.length + 1
          return nextLen - 1
        })
        return
      }
      setProgress(prev => [...prev, data])
    }
    
    const onComplete = async (data) => {
      setResult(data?.result || data)
      setIsScanning(false)
      
      // Log scan completion
      const endTime = new Date().toISOString()
      const startTime = new Date(Date.now() - (data?.duration || 0)).toISOString()
      const result = data?.result ? 
        `Analysis completed with ${data.result.findings?.length || 0} findings` : 
        'Analysis completed successfully'
      
      await scanLogger.logScan({
        scanType: 'security-analyzer',
        scanName: 'Security Analysis',
        target: url.trim(),
        status: 'completed',
        startTime: startTime,
        endTime: endTime,
        duration: data?.duration || 0,
        result: result
      })
      
      // show snackbar and scroll to summary when complete
      setSnackbar('Analysis completed')
      try { summaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) } catch {}
      setTimeout(() => setSnackbar(null), 3000)
    }
    
    window.cyberGuard.onSecurityAnalyzerProgress?.(onProgress)
    window.cyberGuard.onSecurityAnalyzerComplete?.(onComplete)
    
    return () => {}
  }, [])

  const startAnalysis = async () => {
    if (!authorized) {
      alert('Please confirm you have written authorization to perform this security analysis.')
      return
    }
    
    if (!url.trim()) {
      alert('Please enter a valid website URL')
      return
    }

    setIsScanning(true)
    setProgress([])
    setResult(null)

    // Log scan start
    const scanId = await scanLogger.logScan({
      scanType: 'security-analyzer',
      scanName: 'Security Analysis',
      target: url.trim(),
      status: 'started',
      startTime: new Date().toISOString(),
      endTime: null,
      duration: null,
      result: 'Scan initiated'
    })

    try {
      // Open the target website in browser for transparency
      await window.cyberGuard.openExternal(url.trim())
      
      // Start the comprehensive security analysis
      await window.cyberGuard.startSecurityAnalysis({
        url: url.trim(),
        credentials: useCredentials ? credentials : null,
        options: scanOptions
      })
    } catch (error) {
      console.error('Failed to start security analysis:', error)
      setIsScanning(false)
      
      // Log scan failure
      await scanLogger.logScan({
        scanType: 'security-analyzer',
        scanName: 'Security Analysis',
        target: url.trim(),
        status: 'failed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        result: `Failed to start: ${error.message}`
      })
      
      alert('Failed to start security analysis. Please try again.')
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200'
      case 'medium': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'low': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'info': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getSeverityIcon = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'high':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      case 'medium':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
      case 'low':
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  const toggleSeverity = (level) => {
    setSeverityFilter(prev => ({ ...prev, [level]: !prev[level] }))
  }

  const filteredFindings = (findings = []) => findings.filter(f => {
    const sev = (f && f.severity ? String(f.severity) : '').toLowerCase()
    return severityFilter[sev] !== false
  })

  // duplicate removed

  const copyLogsToClipboard = async () => {
    try {
      const text = progress.map(p => {
        const ts = new Date().toLocaleTimeString()
        const msg = typeof p === 'string' ? p : (p.message || '')
        const url = p && p.currentUrl ? `\n→ ${p.currentUrl}` : ''
        return `[${ts}] ${msg}${url}`
      }).join('\n')
      await navigator.clipboard.writeText(text)
      alert('Logs copied to clipboard')
    } catch (e) {
      console.error('Copy failed', e)
      alert('Failed to copy logs')
    }
  }

  // Auto-scroll logs to bottom when new entries arrive
  useEffect(() => {
    try {
      const el = logsRef.current
      if (el) el.scrollTop = el.scrollHeight
    } catch {}
  }, [progress])

  return (
    <div className="max-w-7xl mx-auto">
      {snackbar && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded shadow-lg border border-slate-700">
          {snackbar}
        </div>
      )}
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-orange-100 rounded-lg">
            <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Security Analyzer</h1>
            <p className="text-gray-600 dark:text-gray-400">Comprehensive defensive security analysis for websites</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Configuration - Full width */}
        <div>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 w-full">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Configuration
            </h2>

            {/* URL Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Website URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                disabled={isScanning}
              />
            </div>

            {/* Authorization Checkbox */}
            <div className="mb-6">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                  className="mt-1 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded"
                  disabled={isScanning}
                />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <span className="font-medium">I have written authorization</span> to perform security analysis on this website. This is a defensive, read-only assessment.
                </div>
              </label>
            </div>

            {/* Credentials Section */}
            <div className="mb-6">
              <label className="flex items-center gap-3 mb-3">
                <input
                  type="checkbox"
                  checked={useCredentials}
                  onChange={(e) => setUseCredentials(e.target.checked)}
                  className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded"
                  disabled={isScanning}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Use authentication credentials (optional)
                </span>
              </label>
              
              {useCredentials && (
                <div className="space-y-3 pl-7">
                  <input
                    type="text"
                    value={credentials.username}
                    onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="Username or email"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                    disabled={isScanning}
                  />
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={credentials.password}
                      onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Password"
                      className="w-full pr-10 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                      disabled={isScanning}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7 0-1.016.343-1.957.937-2.793M6.223 6.223A9.957 9.957 0 0112 5c5 0 9 4 9 7 0 1.148-.41 2.289-1.143 3.32M3 3l18 18M9.88 9.88A3 3 0 0012 15a3 3 0 002.121-5.121" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Credentials are used only for read-only verification and are never stored.
                  </p>
                </div>
              )}
            </div>

            {/* Scan Options */}
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Scan Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Boolean options */}
                <div className="space-y-3">
                  {Object.entries(scanOptions).filter(([key, value]) => typeof value === 'boolean').map(([key, value]) => (
                    <label key={key} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={(e) => setScanOptions(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600 rounded"
                        disabled={isScanning}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      </span>
                    </label>
                  ))}
                </div>

                {/* Numeric options */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Max Pages to Scan
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="200"
                      value={scanOptions.maxPages}
                      onChange={(e) => setScanOptions(prev => ({ ...prev, maxPages: parseInt(e.target.value) || 50 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700"
                      disabled={isScanning}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Max Crawl Depth
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={scanOptions.maxDepth}
                      onChange={(e) => setScanOptions(prev => ({ ...prev, maxDepth: parseInt(e.target.value) || 5 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700"
                      disabled={isScanning}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Crawl Delay (ms)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      step="100"
                      value={scanOptions.crawlDelay}
                      onChange={(e) => setScanOptions(prev => ({ ...prev, crawlDelay: parseInt(e.target.value) || 1000 }))}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-slate-600 rounded text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700"
                      disabled={isScanning}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startAnalysis}
              disabled={!authorized || !url.trim() || isScanning}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {isScanning ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Start Security Analysis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Logs */}
          {(progress.length > 0 || preview) && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Analysis Progress
                </h3>
                <button onClick={copyLogsToClipboard} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-slate-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2M8 16h8a2 2 0 002-2v-6M8 16v2a2 2 0 002 2h6M8 16l8-8" />
                  </svg>
                  Copy logs
                </button>
              </div>
              {(previews.length > 0 || preview) && (
                <div className="mb-4 border rounded overflow-hidden bg-black">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
                    <div className="text-sm text-gray-300">Live Scan Preview</div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-400 hidden sm:block truncate max-w-[40ch]">{previews[previewIdx]?.pageUrl || result?.reportData?.target}</div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))} className="px-2 py-1 text-xs bg-gray-800 text-gray-200 rounded hover:bg-gray-700">Prev</button>
                        <span className="text-xs text-gray-300">{previews.length ? previewIdx + 1 : 1}/{Math.max(previews.length, 1)}</span>
                        <button onClick={() => setPreviewIdx(i => Math.min((previews.length - 1), i + 1))} className="px-2 py-1 text-xs bg-gray-800 text-gray-200 rounded hover:bg-gray-700">Next</button>
                      </div>
                    </div>
                  </div>
                  <img src={(previews.length ? previews[previewIdx]?.image : preview) || preview} alt="Live scan" className="w-full object-cover" />
                </div>
              )}
              <div ref={logsRef} className="bg-gray-900 text-green-300 font-mono text-sm rounded-lg p-4 max-h-60 overflow-auto">
                {progress.map((item, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-gray-400">[{new Date().toLocaleTimeString()}]</span> {item.message || item}
                    {item.currentUrl && (
                      <div className="text-gray-400">→ {item.currentUrl} {typeof item.pagesScanned==='number' ? `(scanned: ${item.pagesScanned}, queue: ${item.queueSize ?? 0})` : ''}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {result && (
            <div className="space-y-8">
              <div ref={summaryRef} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Analysis Summary
                  </h3>
                  <div className="flex gap-2">
                    {result.htmlReport && (
                      <button
                        onClick={() => window.cyberGuard.saveReportAs(result.htmlReport, 'security-analysis.html')}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Download HTML
                      </button>
                    )}
                    {result.pdfReport && (
                      <button
                        onClick={() => window.cyberGuard.saveReportAs(result.pdfReport, 'security-analysis.pdf')}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        Download PDF
                      </button>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Target: <span className="font-mono text-gray-900 dark:text-gray-100">{result.reportData?.target || result.target}</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Pages Scanned: <span className="text-gray-900 dark:text-gray-100">{result.reportData?.summary?.totalPages || 0}</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Completed: <span className="text-gray-900 dark:text-gray-100">{new Date(result.reportData?.timestamp || Date.now()).toLocaleString()}</span>
                  </p>
                </div>

                {/* Severity Counts */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(result.reportData?.summary?.severityCount || { info: 0, low: 0, medium: 0, high: 0 }).map(([severity, count]) => (
                    <div key={severity} className="text-center p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {getSeverityIcon(severity)}
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">{severity}</span>
                        </div>
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{count}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Findings - Grid with severity filters */}
              {result.reportData?.results?.findings && result.reportData.results.findings.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Security Findings
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {['info','low','medium','high'].map(level => (
                        <button key={level} onClick={() => toggleSeverity(level)} className={`px-3 py-1 rounded border text-xs font-medium ${severityFilter[level] ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-gray-100 border-gray-300 text-gray-600'}`}>
                          {level.charAt(0).toUpperCase()+level.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredFindings(result.reportData.results.findings).map((finding, index) => (
                      <div key={index} className="border border-gray-200 dark:border-slate-600 rounded-lg p-4 overflow-hidden">
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">{finding.title}</h4>
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(finding.severity)}`}>
                            {getSeverityIcon(finding.severity)}
                            {finding.severity}
                          </span>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          <p><span className="font-medium">Issue:</span> <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{finding.why}</span></p>
                          <p><span className="font-medium">Recommendation:</span> <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{finding.fix}</span></p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Security Headers */}
              {result.reportData?.results?.headers && result.reportData.results.headers.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Security Headers
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-slate-600">
                          <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Header</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Status</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Severity</th>
                          <th className="text-left py-3 px-2 font-medium text-gray-700 dark:text-gray-300">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.reportData.results.headers.map((header, index) => (
                          <tr key={index} className="border-b border-gray-100 dark:border-slate-700">
                            <td className="py-3 px-2 font-mono text-gray-900 dark:text-gray-100">{header.name}</td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                header.status === 'present' 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {header.status}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(header.severity)}`}>
                                {getSeverityIcon(header.severity)}
                                {header.severity}
                              </span>
                            </td>
                            <td className="py-3 px-2 text-gray-600 dark:text-gray-400">{header.recommendation || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SSL/TLS Information */}
              {result.reportData?.results?.tls && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    SSL/TLS Configuration
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Issuer:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">{result.reportData.results.tls.issuer || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Protocols:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">{result.reportData.results.tls.protocols?.join(', ') || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Valid:</span>
                      <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                        result.reportData.results.tls.valid 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.reportData.results.tls.valid ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 dark:text-gray-300">Expiry:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {result.reportData.results.tls.expiryDays !== null 
                          ? `${result.reportData.results.tls.expiryDays} days` 
                          : 'Unknown'
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Dependencies */}
              {result.reportData?.results?.dependencies && result.reportData.results.dependencies.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    JavaScript Dependencies
                  </h3>
                  <div className="space-y-3">
                    {result.reportData.results.dependencies.map((dep, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">{dep.library}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            Current: {dep.version} → Latest: {dep.latest}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getSeverityColor(dep.severity)}`}>
                            {getSeverityIcon(dep.severity)}
                            {dep.severity}
                          </span>
                          {dep.recommendation && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">{dep.recommendation}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-Page Analysis Results - Grid with modal details */}
              {result.reportData?.results?.pageAnalyses && result.reportData.results.pageAnalyses.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Per-Page Analysis Results
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {result.reportData.results.pageAnalyses.map((pageAnalysis, index) => (
                      <div key={index} className="border border-gray-200 dark:border-slate-600 rounded-lg p-4 overflow-hidden">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                          <a href={pageAnalysis.pageUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:text-orange-700 transition-colors break-all">
                            {pageAnalysis.pageUrl}
                          </a>
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 dark:text-gray-400 mb-3 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          <div className="col-span-2"><span className="font-medium">Title:</span> {pageAnalysis.pageInfo.title || 'N/A'}</div>
                          <div><span className="font-medium">Framework:</span> {pageAnalysis.pageInfo.framework || 'Unknown'}</div>
                          <div><span className="font-medium">Status:</span> {pageAnalysis.pageInfo.status || 'Unknown'}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-sm text-gray-700 dark:text-gray-300">Issues found: <span className="font-semibold">{pageAnalysis.findings.length}</span></div>
                          <button onClick={() => setDetailsModal({ open: true, page: pageAnalysis })} className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700">View details</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4" style={{ backgroundColor: 'rgba(255, 153, 102, 0.08)' }}>
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-orange-800 dark:text-orange-200">
                    <p className="font-medium mb-1">Authorized Use Only</p>
                    <p>This security analysis was performed in defensive, read-only mode. No intrusive scans or exploits were executed. All findings are for authorized internal security analysis purposes only.</p>
                  </div>
                </div>
              </div>
              {/* Issues Modal */}
              <IssuesModal open={detailsModal.open} page={detailsModal.page} onClose={() => setDetailsModal({ open: false, page: null })} getSeverityColor={getSeverityColor} getSeverityIcon={getSeverityIcon} />
            </div>
          )}
        </div>
      </div>
  )
}

// Simple modal to show page issues
function IssuesModal({ open, page, onClose, getSeverityColor, getSeverityIcon }) {
  if (!open || !page) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={onClose}></div>
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-3xl border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Issues - {page.pageInfo.title || page.pageUrl}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{page.pageUrl}</p>
          </div>
          <button onClick={onClose} className="ml-4 px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-100 rounded hover:bg-gray-200 dark:hover:bg-slate-600">Close</button>
        </div>
        {page.findings?.length ? (
          <div className="space-y-3 max-h-[60vh] overflow-auto break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
            {page.findings.map((finding, idx) => (
              <div key={idx} className="border border-gray-200 dark:border-slate-700 rounded p-3">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{finding.title}</h4>
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(finding.severity)}`}>
                    {getSeverityIcon(finding.severity)}
                    {finding.severity}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  <p><span className="font-medium">Issue:</span> <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{finding.why}</span></p>
                  <p><span className="font-medium">Recommendation:</span> <span className="break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{finding.fix}</span></p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-gray-600 dark:text-gray-400">No issues on this page.</div>
        )}
      </div>
    </div>
  )
}

export default SecurityAnalyzer
