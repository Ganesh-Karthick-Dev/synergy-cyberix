import { useState, useEffect } from 'react'
import { useScanning } from '../context/ScanningContext'
import scanLogger from '../utils/scanLogger'

// Import markdown converter
let markdownToHTML;
try {
  const reportGen = require('../utils/scanReportGenerator');
  markdownToHTML = reportGen.markdownToHTML;
} catch (e) {
  // Fallback if module not found
  markdownToHTML = (md) => md.replace(/\n/g, '<br />');
}

// Helper function to strip ANSI escape codes
const stripAnsiCodes = (text) => {
  if (!text || typeof text !== 'string') return text
  // Remove ANSI escape codes: \x1b[...m, [1m, [33m, [0m, etc.
  // But preserve timestamps like [2025-11-04 14:30:01]
  // Only remove actual ANSI escape sequences, not bracket patterns
  
  // First, protect timestamps by temporarily replacing them
  const timestampPattern = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/g
  const timestamps = []
  let protectedText = text.replace(timestampPattern, (match, content) => {
    timestamps.push(match)
    return `__TIMESTAMP_${timestamps.length - 1}__`
  })
  
  // Remove ANSI codes
  let cleaned = protectedText
    .replace(/\x1b\[[0-9;]*m/g, '')  // Remove ANSI escape sequences
    .replace(/\[[0-9;]*m/g, '')      // Remove incomplete ANSI patterns
    .replace(/\[\d+[m[]?/g, '')      // Remove ANSI number patterns
  
  // Restore timestamps
  timestamps.forEach((timestamp, index) => {
    cleaned = cleaned.replace(`__TIMESTAMP_${index}__`, timestamp)
  })
  
  return cleaned.trim()
}

// Helper to sanitize error messages (remove wsl references)
const sanitizeError = (error) => {
  if (!error || typeof error !== 'string') return error
  return error.replace(/Command failed: wsl\s+/gi, 'Command failed: ').replace(/wsl\s+/gi, '')
}

function NetworkScanning() {
  const [isStarting, setIsStarting] = useState(false)
  const [target, setTarget] = useState('')
  const [scanResults, setScanResults] = useState(null)
  const [kaliStatus, setKaliStatus] = useState('Checking...')
  const [scanStats, setScanStats] = useState({
    openPorts: 0,
    closedPorts: 0,
    filteredPorts: 0,
    services: 0
  })
  const [riskIssues, setRiskIssues] = useState([])
  const [consoleLog, setConsoleLog] = useState([])
  const [commandResults, setCommandResults] = useState({})
  const [scanTimer, setScanTimer] = useState({
    startTime: null,
    elapsed: 0,
    expectedEndTime: null,
    completedTime: null,
    isRunning: false
  })

  const { scanStatus, scanProgress, startNetworkScan, abortScan } = useScanning()
  const [showDetails, setShowDetails] = useState(false)
  const [selectedPort, setSelectedPort] = useState(null)

  useEffect(() => {
    checkKaliStatus()
  }, [])

  const checkKaliStatus = async () => {
    try {
      if (window.cyberGuard) {
        const isInstalled = await window.cyberGuard.checkKali()
        setKaliStatus(isInstalled ? 'Kali Linux is installed' : 'Kali Linux is not installed')
      } else {
        setKaliStatus('Scanning system not available (development mode)')
      }
    } catch (error) {
      setKaliStatus('Unable to check Kali status')
      console.error('Kali check error:', error)
    }
  }

  const installKali = async () => {
    if (!window.cyberGuard) return
    
    try {
      setKaliStatus('Installing Kali Linux...')
      
      window.cyberGuard.onKaliInstallProgress((message) => {
        setScanProgress(prev => [...prev, { stage: 'installing', message }])
      })
      
      window.cyberGuard.onKaliInstallComplete((success) => {
        if (success) {
          setKaliStatus('Kali Linux installation completed')
        } else {
          setKaliStatus('Kali Linux installation failed')
        }
      })
      
      await window.cyberGuard.installKali()
    } catch (error) {
      setKaliStatus('Installation error: ' + error.message)
    }
  }

  const handleStartScan = async () => {
    if (!target.trim()) {
      alert('Please enter a target IP or hostname')
      return
    }

    if (!window.cyberGuard) {
      alert('Scanning system not available')
      return
    }

    if (scanStatus.isScanning) {
      alert('Scan is already in progress')
      return
    }

    setIsStarting(true)
    setScanResults(null)
    setScanStats({ openPorts: 0, closedPorts: 0, filteredPorts: 0, services: 0 })
    setConsoleLog([])
    setCommandResults({})
    
    // Initialize timer with actual system time
    const startTime = new Date()
    const expectedEndTime = new Date(startTime.getTime() + 10 * 60 * 1000) // 10 minutes from start
    setScanTimer({
      startTime: startTime,
      elapsed: 0,
      expectedEndTime: expectedEndTime,
      completedTime: null,
      isRunning: true
    })
    
    // Log scan start
    await scanLogger.logScan({
      scanType: 'network',
      scanName: 'Network Scan',
      target: target.trim(),
      status: 'started',
      startTime: startTime.toISOString(),
      endTime: null,
      duration: null,
      result: 'Scan initiated'
    })
    
    try {
      console.log('Starting network scan for target:', target.trim())
      const result = await window.cyberGuard.startNetworkScan(target.trim())
      console.log('Network scan started, result:', result)
      
      if (result && result.error) {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Scan start error:', error)
      alert('Failed to start network scan: ' + (error?.message || String(error)))
      setIsStarting(false)
      
      // Log scan failure
      await scanLogger.logScan({
        scanType: 'network',
        scanName: 'Network Scan',
        target: target.trim(),
        status: 'failed',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: new Date().getTime() - startTime.getTime(),
        result: `Failed to start: ${error.message}`
      })
    }
  }

  // Listen for scan progress updates
  useEffect(() => {
    if (!window.cyberGuard) return
    
    // Define the progress handler
    const progressHandler = (update) => {
        // Append console log if present (store as array of lines)
        if (update.consoleLog) {
          setConsoleLog(prev => {
            const newLines = update.consoleLog.split('\n').filter(line => line.trim())
            return [...prev, ...newLines]
          })
          console.log(update.consoleLog)
        }
        
        // Store command results
        if (update.command && update.stage) {
          setCommandResults(prev => ({
            ...prev,
            [update.stage]: {
              command: update.command,
              output: update.output || '',
              message: update.message || '',
              stage: update.stage
            }
          }))
        }
    }
    
    // Register the listener
    window.cyberGuard.onNetworkScanProgress(progressHandler)
    
    // Cleanup: Remove listener when component unmounts or dependencies change
    return () => {
      if (window.cyberGuard && window.cyberGuard.removeListener) {
        // Note: ipcRenderer.removeListener might be needed if available
        // For now, we rely on React's cleanup and Electron's automatic cleanup
      }
    }
  }, [])

  // Timer effect - update elapsed time every second using actual system time
  useEffect(() => {
    let interval = null
    if (scanTimer.isRunning && scanTimer.startTime) {
      interval = setInterval(() => {
        // Use actual system time to calculate elapsed
        const now = new Date()
        const start = new Date(scanTimer.startTime)
        const elapsed = Math.floor((now - start) / 1000) // seconds
        setScanTimer(prev => ({ ...prev, elapsed }))
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [scanTimer.isRunning, scanTimer.startTime])

  // Handle scan abort - set completed time
  useEffect(() => {
    if (!scanStatus.isScanning && !isStarting && scanTimer.isRunning && scanTimer.startTime && !scanTimer.completedTime) {
      const completedTime = new Date()
      setScanTimer(prev => ({
        ...prev,
        isRunning: false,
        completedTime: completedTime
      }))
    }
  }, [scanStatus.isScanning, isStarting, scanTimer.isRunning, scanTimer.startTime, scanTimer.completedTime])

  // Format time helper
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Format date/time helper
  const formatDateTime = (date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  // Listen for scan completion
  useEffect(() => {
    if (window.cyberGuard) {
      window.cyberGuard.onNetworkScanDone(async (result) => {
        try {
          console.log('Network scan completed:', result)
          setIsStarting(false)
          
          // Check if scan was aborted
          if (result && result.aborted) {
            console.log('Scan was aborted')
            setScanTimer(prev => ({ 
              ...prev, 
              isRunning: false,
              completedTime: new Date()
            }))
            return
          }
          
          const completedTime = new Date()
          setScanTimer(prev => ({ 
            ...prev, 
            isRunning: false,
            completedTime: completedTime
          }))
          console.log('Set isStarting to false')
          
          // Handle new command-based results structure
          if (result && result.results) {
            // New structure with command results
            setCommandResults(result.results)
            
            // Ensure we have the JSON data properly structured
            const scanData = {
              results: {
                json: result.results.json || result.results,
                markdown: result.results.markdown || '',
                raw: result.results.raw || ''
              },
              target: result.target || target,
              extractedIP: result.extractedIP || null,
              success: result.success !== false
            }
            
            setScanResults(scanData)
          } else if (result && result.success && result.result) {
            // Handle old backend shape
            const r = result.result
            if (r && r.reportData) {
              const scanData = { ...r.reportData, jsonReport: r.jsonReport, htmlReport: r.htmlReport, pdfReport: r.pdfReport }
              setScanResults(scanData)
            } else {
              setScanResults(r)
            }
          } else {
            setScanResults({ 
              summary: 'Scan completed',
              success: result?.success || false,
              error: result?.error || null
            })
          }
          
          // Log scan completion
          const endTime = new Date()
          const startTime = new Date(endTime.getTime() - (result?.duration || 120000))
          const isSuccess = result?.success !== false
          const nmapOutput = result?.results?.nmapFullScan?.stdout || result?.results?.nmapFastScan?.stdout || ''
          const openPortsMatch = nmapOutput.match(/(\d+)\/tcp\s+open/g)
          const openPorts = openPortsMatch ? openPortsMatch.length : 0
          const resultSummary = isSuccess ? 
            `Scan completed - ${openPorts} open ports found` : 
            'Network scan failed'
          
          await scanLogger.logScan({
            scanType: 'network',
            scanName: 'Network Scan',
            target: target.trim(),
            status: isSuccess ? 'completed' : 'failed',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: result?.duration || 120000,
            result: resultSummary
          })
          
        } catch (error) {
          console.error('Error handling network scan completion:', error)
          setIsStarting(false)
          setScanResults({ 
            summary: 'Scan completed with errors',
            error: error.message 
          })
        }
      })
    }
  }, [target])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white dark:bg-slate-800/20 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Network Scanning</h2>
            <p className="text-orange-100">Professional network analysis and port discovery</p>
          </div>
        </div>
      </div>

      {/* Scan Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-orange-100 rounded-lg">
            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Scan Configuration</h3>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Target IP Address or Hostname
            </label>
            <div className="flex gap-3">
              <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g., 192.168.1.1, example.com, or webnox.in"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                disabled={scanStatus.isScanning || isStarting}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && target.trim() && !scanStatus.isScanning && !isStarting) {
                    handleStartScan()
                  }
                }}
              />
            </div>
            <button
                onClick={scanStatus.isScanning || isStarting ? abortScan : handleStartScan}
                disabled={!target.trim() && !scanStatus.isScanning && !isStarting}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2 whitespace-nowrap"
            >
              {scanStatus.isScanning || isStarting ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                    <span>Stop Scan</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-5-8V6a2 2 0 012-2h2a2 2 0 012 2v2M7 7h10a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
                  </svg>
                    <span>Start Scan</span>
                </>
              )}
            </button>
            </div>
          </div>
          
          {/* Enhanced Timer Display */}
          {(scanTimer.isRunning || scanTimer.completedTime) && scanTimer.startTime && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-6 shadow-lg">
              <div className="flex items-center space-x-2 mb-4">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanTimer.isRunning ? 'Scan in Progress' : 'Scan Completed'}
                </h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-200 dark:border-blue-700 shadow-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Started</span>
                  </div>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {formatDateTime(scanTimer.startTime)}
                    </span>
                  </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-200 dark:border-blue-700 shadow-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Elapsed Time</span>
                  </div>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {formatTime(scanTimer.elapsed)}
                    </span>
                  </div>
                <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-blue-200 dark:border-blue-700 shadow-sm">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      {scanTimer.isRunning ? 'Expected End' : 'Completed'}
                    </span>
                  </div>
                  <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {scanTimer.completedTime 
                      ? formatDateTime(scanTimer.completedTime)
                      : formatDateTime(scanTimer.expectedEndTime)
                    }
                    </span>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Console Log - Vertical Display */}
      {consoleLog && consoleLog.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>Console Log</span>
          </h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const logText = consoleLog.join('\n')
                  navigator.clipboard.writeText(logText).then(() => {
                    alert('Log copied to clipboard!')
                  }).catch(() => {
                    alert('Failed to copy log')
                  })
                }}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                title="Copy Log"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear the console log?')) {
                    setConsoleLog([])
                  }
                }}
                className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center"
                title="Clear Log"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
            <div className="space-y-1">
              {consoleLog.map((line, index) => {
                let cleanedLine = stripAnsiCodes(line)
                
                // Fix truncated timestamps at the start of line (e.g., "-11-04 09:00:01]" -> "[2025-11-04 09:00:01]")
                // Pattern: starts with "-" followed by MM-DD HH:MM:SS]
                cleanedLine = cleanedLine.replace(/^-(\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/g, (match, rest) => {
                  const now = new Date()
                  const year = now.getFullYear()
                  return `[${year}-${rest}]`
                })
                
                // Fix timestamps missing opening bracket (e.g., "2025-11-04 09:00:01]" -> "[2025-11-04 09:00:01]")
                cleanedLine = cleanedLine.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/g, '[$1]')
                
                // Fix timestamps that are completely missing brackets
                cleanedLine = cleanedLine.replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '[$1]')
                
                return (
                <div key={index} className="text-green-400 py-1 border-b border-gray-800 last:border-b-0">
                    {cleanedLine}
                </div>
                )
              })}
            </div>
          </div>
        </div>
      )}


      {/* Scan Results */}
      {scanResults && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Scan Results</span>
            </h3>
          </div>
          
          {scanResults.error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-800 font-medium">{scanResults.error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 dark:text-green-200 font-medium">Network scan completed successfully</p>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm">
                  Analysis completed for target: <span className="font-mono font-medium">{scanResults.target || target}</span>
                  {scanResults.extractedIP && (
                    <span className="ml-2">(IP: <span className="font-mono font-medium">{scanResults.extractedIP}</span>)</span>
                  )}
                </p>
              </div>

              {/* Markdown Report Display */}
              {scanResults.results?.markdown && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-lg">
                  <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                    <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Security Scan Report</span>
                    </h4>
                  </div>
                  
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100 prose-code:text-blue-600 dark:prose-code:text-blue-400 prose-pre:bg-gray-900 dark:prose-pre:bg-slate-800 prose-pre:text-green-400 overflow-x-auto"
                    dangerouslySetInnerHTML={{ 
                      __html: markdownToHTML(scanResults.results.markdown) 
                    }}
                  />
                </div>
              )}

              {/* Detailed Scan Results - Section by Section */}
              {scanResults.results?.json && (() => {
                const jsonData = scanResults.results.json;
                const parsed = jsonData.parsed || {};
                const findings = jsonData.findings || {};
                
                return (
                  <div className="space-y-6">
                    {/* 1. WhatWeb Results */}
                    {parsed.whatweb && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Web Technology Detection</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">WhatWeb fingerprinting results</p>
                          </div>
                        </div>
                        
                        <div className="space-y-4">
                          {parsed.whatweb.domain && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Domain:</span>
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{parsed.whatweb.domain}</span>
                            </div>
                          )}
                          {parsed.whatweb.server && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Web Server:</span>
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded text-sm font-medium">{parsed.whatweb.server}</span>
                            </div>
                          )}
                          {parsed.whatweb.status && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Status:</span>
                              <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-sm font-medium">{parsed.whatweb.status}</span>
                            </div>
                          )}
                          {parsed.whatweb.ip && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">IP Address:</span>
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{parsed.whatweb.ip}</span>
                            </div>
                          )}
                          {findings.whatweb?.finding && (
                            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                              <p className="text-sm text-blue-900 dark:text-blue-100">{findings.whatweb.finding}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2. Ping Results */}
                    {parsed.ping && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                          <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">ICMP Ping Test</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Network connectivity test results</p>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {parsed.ping.transmitted !== undefined && (
                            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Packets Transmitted</p>
                              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{parsed.ping.transmitted}</p>
                            </div>
                          )}
                          {parsed.ping.received !== undefined && (
                            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Packets Received</p>
                              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{parsed.ping.received}</p>
                            </div>
                          )}
                          {parsed.ping.packet_loss_percent !== undefined && (
                            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Packet Loss</p>
                              <p className={`text-2xl font-bold ${parsed.ping.packet_loss_percent > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                {parsed.ping.packet_loss_percent.toFixed(1)}%
                              </p>
                            </div>
                          )}
                          {findings.ping?.finding && (
                            <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{findings.ping.finding}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3. DNS Records */}
                    {parsed.dns && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                            <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">DNS Records</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Domain name resolution information</p>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          {parsed.dns.A_record && (
                            <div className="flex items-center space-x-2">
                              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">A Record:</span>
                              <span className="text-sm text-gray-900 dark:text-gray-100 font-mono bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">{parsed.dns.A_record}</span>
                            </div>
                          )}
                          {parsed.dns.MX_records && parsed.dns.MX_records.length > 0 && (
                            <div>
                              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">MX Records:</p>
                              <div className="space-y-2">
                                {parsed.dns.MX_records.map((mx, idx) => (
                                  <div key={idx} className="flex items-center space-x-2 bg-gray-50 dark:bg-slate-700 p-2 rounded">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Priority {mx.priority}:</span>
                                    <span className="text-sm text-gray-900 dark:text-gray-100 font-mono">{mx.server}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {findings.dns_records?.finding && (
                            <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                              <p className="text-sm text-purple-900 dark:text-purple-100">{findings.dns_records.finding}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Nmap Port Scan Results */}
                    {(parsed.nmap_xml || parsed.nmap_text) && (
                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                          <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                            <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Port Scan Results</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nmap port discovery and service detection</p>
                          </div>
                        </div>
                        
                        {(() => {
                          const nmapData = parsed.nmap_xml || parsed.nmap_text || {};
                          const hosts = nmapData.hosts || [];
                          const ports = nmapData.ports || [];
                          const hostInfo = hosts[0] || nmapData;
                          
                          return (
                            <div className="space-y-4">
                              {hostInfo.ip && (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Target IP:</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100 font-mono bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">{hostInfo.ip}</span>
                                </div>
                              )}
                              {hostInfo.host && (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Hostname:</span>
                                  <span className="text-sm text-gray-900 dark:text-gray-100">{hostInfo.host}</span>
                                </div>
                              )}
                              {hostInfo.status && (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Host Status:</span>
                                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                                    hostInfo.status === 'up' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                                    'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                                  }`}>
                                    {hostInfo.status}
                                  </span>
                                </div>
                              )}
                              
                              {ports.length > 0 && (
                                <div className="mt-4">
                                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                    Open Ports ({ports.length}):
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {ports.map((port, idx) => (
                                      <div key={idx} className="bg-gray-50 dark:bg-slate-700 rounded-lg p-3 border border-gray-200 dark:border-slate-600">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="font-bold text-gray-900 dark:text-gray-100">
                                            Port {port.port}/{port.proto || port.protocol || 'tcp'}
                                          </span>
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            port.state === 'open' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                                            port.state === 'closed' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200' :
                                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200'
                                          }`}>
                                            {port.state || 'unknown'}
                                          </span>
                                        </div>
                                        {port.service && (typeof port.service === 'object' ? port.service.name : port.service) && (
                                          <p className="text-sm text-gray-700 dark:text-gray-300">
                                            Service: <span className="font-medium">{typeof port.service === 'object' ? port.service.name : port.service}</span>
                                          </p>
                                        )}
                                        {port.service && typeof port.service === 'object' && port.service.product && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Product: {port.service.product}
                                            {port.service.version && ` (${port.service.version})`}
                                          </p>
                                        )}
                                        {port.version && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{port.version}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {findings.open_ports && (
                                <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                                  <p className="text-sm text-orange-900 dark:text-orange-100 font-medium">{findings.open_ports.finding}</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* 5. Other Findings */}
                    {Object.entries(findings).filter(([key]) => !['whatweb', 'ping', 'dns_records', 'open_ports'].includes(key)).map(([key, finding]) => (
                      <div key={key} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 capitalize">{key.replace(/_/g, ' ')}</h3>
                          <span className={`px-3 py-1 rounded text-sm font-medium ${
                            finding.risk === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                            finding.risk === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                            finding.risk === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                          }`}>
                            {finding.risk || 'info'}
                          </span>
                        </div>
                        {finding.finding && (
                          <p className="text-gray-700 dark:text-gray-300 mb-4">{finding.finding}</p>
                        )}
                        {finding.recommended_tests && finding.recommended_tests.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Recommended Actions:</p>
                            <ul className="space-y-2">
                              {finding.recommended_tests.map((test, idx) => (
                                <li key={idx} className="flex items-start space-x-2">
                                  <span className="text-blue-600 dark:text-blue-400 mt-1">•</span>
                                  <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-slate-700 px-2 py-1 rounded">{test}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Overall Recommendation */}
              {scanResults.results?.json?.overall_recommendation && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-4">
                  <h4 className="text-lg font-semibold text-blue-900 dark:text-blue-100 flex items-center space-x-2 mb-3">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>Overall Recommendation</span>
                  </h4>
                  {scanResults.results.json.overall_recommendation.summary && (
                    <p className="text-blue-800 dark:text-blue-200 mb-3">{scanResults.results.json.overall_recommendation.summary}</p>
                  )}
                  {scanResults.results.json.overall_recommendation.next_steps_safe_scans && scanResults.results.json.overall_recommendation.next_steps_safe_scans.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">Next Steps:</p>
                      <ul className="list-disc list-inside text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        {scanResults.results.json.overall_recommendation.next_steps_safe_scans.map((step, idx) => (
                          <li key={idx} className="font-mono text-xs">{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Raw JSON Output - Collapsed by default, shown at the end */}
              {(scanResults.results?.json || scanResults.results) && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 mb-2 flex items-center space-x-2">
                      <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>View Raw JSON Data</span>
                    </summary>
                    <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto mt-2">
                      <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">
                        {JSON.stringify(scanResults.results?.json || scanResults.results || scanResults, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              )}

              {/* Legacy Command Results (fallback) */}
              {scanResults.results && !scanResults.results.markdown && (
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Command Execution Results</span>
                  </h4>
                  
                  {/* WhatWeb Result */}
                  {scanResults.results.whatweb && (() => {
                    const result = scanResults.results.whatweb
                    const parsed = result.parsed || {}
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>1. WhatWeb Scan - Web Technology Detection</span>
                          </h5>
                        </div>
                        
                        {/* Parsed Data Display */}
                        {parsed.url && (
                          <div className="mb-4 space-y-3">
                            {parsed.url && (
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-sm text-blue-900 dark:text-blue-100">
                                  <span className="font-semibold">Target URL:</span>{' '}
                                  <span className="font-mono text-blue-600 dark:text-blue-400">{parsed.url}</span>
                                </p>
                              </div>
                            )}
                            
                            {parsed.status && (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                  <p className="text-xs text-gray-600 dark:text-gray-400">HTTP Status</p>
                                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    {parsed.status.code} {parsed.status.text}
                                  </p>
                                </div>
                                {parsed.country && (
                                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">Country</p>
                                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{parsed.country}</p>
                                  </div>
                                )}
                                {parsed.server && (
                                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">Web Server</p>
                                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{parsed.server}</p>
                                  </div>
                                )}
                                {parsed.title && (
                                  <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                    <p className="text-xs text-gray-600 dark:text-gray-400">Page Title</p>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={parsed.title}>{parsed.title}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {parsed.technologies && parsed.technologies.length > 0 && (
                              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Detected Technologies:</p>
                                <div className="flex flex-wrap gap-2">
                                  {parsed.technologies.map((tech, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-xs font-medium">
                                      {tech.name}: {tech.value}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Raw Output (collapsible) */}
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                            View Raw Output
                          </summary>
                          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput || 'No output available'}</pre>
                          </div>
                        </details>
                      </div>
                    )
                  })()}

                  {/* Ping Result */}
                  {scanResults.results.ping && (() => {
                    const result = scanResults.results.ping
                    const parsed = result.parsed || {}
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>2. Ping Test - Network Connectivity</span>
                          </h5>
                        </div>
                        
                        {/* Parsed Data Display */}
                        {parsed.target && (
                          <div className="mb-4 space-y-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <p className="text-xs text-blue-600 dark:text-blue-400">Target</p>
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">{parsed.target}</p>
                                {parsed.ip && (
                                  <p className="text-xs text-blue-700 dark:text-blue-300 font-mono mt-1">{parsed.ip}</p>
                                )}
                              </div>
                              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <p className="text-xs text-gray-600 dark:text-gray-400">Packets Transmitted</p>
                                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{parsed.packetsTransmitted || 0}</p>
                              </div>
                              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <p className="text-xs text-gray-600 dark:text-gray-400">Packets Received</p>
                                <p className={`text-lg font-semibold ${parsed.packetsReceived > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {parsed.packetsReceived || 0}
                                </p>
                              </div>
                              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <p className="text-xs text-gray-600 dark:text-gray-400">Packet Loss</p>
                                <p className={`text-lg font-semibold ${parsed.packetLoss === 0 ? 'text-green-600 dark:text-green-400' : parsed.packetLoss === 100 ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                                  {parsed.packetLoss || 0}%
                                </p>
                              </div>
                            </div>
                            
                            {parsed.rtt && (
                              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Round-Trip Time (RTT) Statistics:</p>
                                <div className="grid grid-cols-4 gap-3">
                                  <div>
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Minimum</p>
                                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">{parsed.rtt.min} ms</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Average</p>
                                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">{parsed.rtt.avg} ms</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Maximum</p>
                                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">{parsed.rtt.max} ms</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Mean Deviation</p>
                                    <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">{parsed.rtt.mdev} ms</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {parsed.time && (
                              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                <p className="text-xs text-gray-600 dark:text-gray-400">Total Time</p>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{parsed.time} ms</p>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Raw Output (collapsible) */}
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                            View Raw Output
                          </summary>
                          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput || 'No output available'}</pre>
                          </div>
                        </details>
                      </div>
                    )
                  })()}

                  {/* Hping3 Result */}
                  {scanResults.results.hping3 && (() => {
                    const result = scanResults.results.hping3
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    const errorMsg = sanitizeError(result.error || '')
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>3. Hping3 Scan - Advanced Packet Analysis</span>
                          </h5>
                        </div>
                        
                        {errorMsg && (
                          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-900 dark:text-red-100">
                              <span className="font-semibold">Error:</span> {errorMsg}
                            </p>
                          </div>
                        )}
                        
                        {rawOutput && (
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                              View Raw Output
                            </summary>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}

                  {/* Host Result */}
                  {scanResults.results.host && (() => {
                    const result = scanResults.results.host
                    const parsed = result.parsed || {}
                    const ip = result.ip || parsed.ip
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>4. Host Lookup - DNS Resolution</span>
                          </h5>
                        </div>
                        
                        {/* Parsed Data Display */}
                        {ip && (
                          <div className="mb-4 space-y-3">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                              <p className="text-sm text-blue-900 dark:text-blue-100">
                                <span className="font-semibold">Resolved IP Address:</span>{' '}
                                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{ip}</span>
                              </p>
                              {parsed.domain && (
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Domain: {parsed.domain}</p>
                              )}
                            </div>
                            
                            {parsed.mxRecords && parsed.mxRecords.length > 0 && (
                              <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Mail Exchange (MX) Records:</p>
                                <div className="space-y-2">
                                  {parsed.mxRecords.map((mx, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-purple-100 dark:bg-purple-900 rounded">
                                      <span className="text-sm text-purple-800 dark:text-purple-200 font-mono">{mx.host}</span>
                                      <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-200 dark:bg-purple-800 px-2 py-1 rounded">
                                        Priority: {mx.priority}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Raw Output (collapsible) */}
                        <details className="mt-4">
                          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                            View Raw Output
                          </summary>
                          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                            <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput || 'No output available'}</pre>
                          </div>
                        </details>
                      </div>
                    )
                  })()}

                  {/* Nmap Host Discovery Result */}
                  {scanResults.results.nmapHostDiscovery && (() => {
                    const result = scanResults.results.nmapHostDiscovery
                    const parsed = result.parsed || {}
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    const errorMsg = sanitizeError(result.error || '')
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>5. Nmap Host Discovery - Network Presence Detection</span>
                          </h5>
                        </div>
                        
                        {errorMsg && (
                          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-900 dark:text-red-100">
                              <span className="font-semibold">Error:</span> {errorMsg}
                            </p>
                          </div>
                        )}
                        
                        {parsed.host && (
                          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                              <span className="font-semibold">Host:</span> {parsed.host}
                            </p>
                            {parsed.hostState && (
                              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">State: {parsed.hostState}</p>
                            )}
                          </div>
                        )}
                        
                        {parsed.ports && parsed.ports.length > 0 && (
                          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                            <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Open Ports:</p>
                            <div className="flex flex-wrap gap-2">
                              {parsed.ports.map((port, idx) => (
                                <span key={idx} className="px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-xs font-medium">
                                  {port.port}/{port.protocol} ({port.state})
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {rawOutput && (
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                              View Raw Output
                            </summary>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}

                  {/* Nmap Fast Scan Result */}
                  {scanResults.results.nmapFastScan && (() => {
                    const result = scanResults.results.nmapFastScan
                    const parsed = result.parsed || {}
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    const errorMsg = sanitizeError(result.error || '')
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>6. Nmap Fast Scan - Common Ports Discovery</span>
                          </h5>
                        </div>
                        
                        {errorMsg && (
                          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-900 dark:text-red-100">
                              <span className="font-semibold">Error:</span> {errorMsg}
                            </p>
                          </div>
                        )}
                        
                        {parsed.host && (
                          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                              <span className="font-semibold">Host:</span> {parsed.host}
                            </p>
                            {parsed.hostState && (
                              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">State: {parsed.hostState}</p>
                            )}
                          </div>
                        )}
                        
                        {parsed.ports && parsed.ports.length > 0 && (
                          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                            <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">Discovered Ports ({parsed.ports.length}):</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {parsed.ports.map((port, idx) => (
                                <div key={idx} className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-mono text-purple-800 dark:text-purple-200">{port.port}/{port.protocol}</span>
                                    <span className={`text-xs px-2 py-1 rounded ${port.state === 'open' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                      {port.state}
                                    </span>
                                  </div>
                                  {port.service && (
                                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Service: {port.service}</p>
                                  )}
                                  {port.version && (
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Version: {port.version}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {rawOutput && (
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                              View Raw Output
                            </summary>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}

                  {/* Nmap Full Scan Result */}
                  {scanResults.results.nmapFullScan && (() => {
                    const result = scanResults.results.nmapFullScan
                    const parsed = result.parsed || {}
                    const rawOutput = stripAnsiCodes((result.raw?.stdout || '') + (result.raw?.stderr || ''))
                    const errorMsg = sanitizeError(result.error || '')
                    
                    return (
                      <div className="bg-white dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {result.success ? 'SUCCESS' : 'FAILED'}
                            </span>
                            <span>7. Nmap Full Port Scan - Complete Port Range Analysis (1-65535)</span>
                          </h5>
                        </div>
                        
                        {errorMsg && (
                          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-900 dark:text-red-100">
                              <span className="font-semibold">Error:</span> {errorMsg}
                            </p>
                          </div>
                        )}
                        
                        {parsed.host && (
                          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                              <span className="font-semibold">Host:</span> {parsed.host}
                            </p>
                            {parsed.hostState && (
                              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">State: {parsed.hostState}</p>
                            )}
                          </div>
                        )}
                        
                        {parsed.ports && parsed.ports.length > 0 && (
                          <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                            <p className="text-sm font-semibold text-purple-900 dark:text-purple-100 mb-2">
                              Open Ports Found ({parsed.ports.length}):
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                              {parsed.ports.map((port, idx) => (
                                <div key={idx} className="p-2 bg-purple-100 dark:bg-purple-900 rounded">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-mono text-purple-800 dark:text-purple-200">{port.port}/{port.protocol}</span>
                                    <span className={`text-xs px-2 py-1 rounded ${port.state === 'open' ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                                      {port.state}
                                    </span>
                                  </div>
                                  {port.service && (
                                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">Service: {port.service}</p>
                                  )}
                                  {port.version && (
                                    <p className="text-xs text-purple-600 dark:text-purple-400">Version: {port.version}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {rawOutput && (
                          <details className="mt-4">
                            <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-2">
                              View Raw Output
                            </summary>
                            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
                              <pre className="text-green-400 font-mono text-xs whitespace-pre-wrap leading-relaxed">{rawOutput}</pre>
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NetworkScanning
