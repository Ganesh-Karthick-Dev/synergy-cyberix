import React, { useState, useEffect, useRef } from 'react'
import { useScanning } from '../context/ScanningContext'
import { useGlobalScanState } from '../context/GlobalScanContext'
import scanLogger from '../utils/scanLogger'
// Removed useToast import - no snack bars in server scan tab
import { getSecurePassword } from '../utils/securePasswordStorage'
import jsPDF from 'jspdf'
import { Search, Syringe, Globe, Lock, Radio, Target, Zap } from 'lucide-react'

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

function ServerScanning() {
  const [isStarting, setIsStarting] = useState(false)
  const [target, setTarget] = useState('')
  const [scanResults, setScanResults] = useState(null)
  const [kaliStatus, setKaliStatus] = useState('Checking...')
  const [scanStats, setScanStats] = useState({
    dnsResolved: false,
    portsScanned: 0,
    servicesDetected: 0,
    vulnerabilitiesFound: 0,
    directoriesFound: 0
  })
  const [scanStartTime, setScanStartTime] = useState(null)
  const [expectedEndTime, setExpectedEndTime] = useState(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const mountedRef = useRef(true)

  // Safe state updater that prevents updates after unmount
  const safeSetState = (setter) => (value) => {
    if (mountedRef.current) {
      setter(value)
    }
  }

  // Create safe versions of all setters
  const safeSetIsStarting = safeSetState(setIsStarting)
  const safeSetTarget = safeSetState(setTarget)
  const safeSetScanResults = safeSetState(setScanResults)
  const safeSetKaliStatus = safeSetState(setKaliStatus)
  const safeSetScanStats = safeSetState(setScanStats)
  const safeSetScanStartTime = safeSetState(setScanStartTime)
  const safeSetExpectedEndTime = safeSetState(setExpectedEndTime)
  const safeSetCurrentTime = safeSetState(setCurrentTime)

  const validateURL = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return {
        valid: true,
        hostname: urlObj.hostname,
        protocol: urlObj.protocol
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

  const startServerScan = async () => {
    if (!target.trim()) {
      alert('Please enter a target URL')
      return
    }

    if (!permissionGranted) {
      alert('Please confirm permission to scan the target')
      return
    }

    // Validate URL
    const urlValidation = validateURL(target)
    if (!urlValidation.valid) {
      alert(`Invalid URL: ${urlValidation.error}`)
      return
    }

    // Check for private IP
    const ipCheck = await checkPrivateIP(urlValidation.hostname)
    if (ipCheck.isPrivate) {
      const confirmPrivate = window.confirm(
        `Warning: Target resolves to private IP (${ipCheck.ip}). This may be against your organization's policy. Continue?`
      )
      if (!confirmPrivate) {
        return
      }
    }

    try {
      const doc = new jsPDF()
      let yPos = 20
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 15
      const maxWidth = pageWidth - 2 * margin

      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace = 10) => {
        if (yPos > 280) {
          doc.addPage()
          yPos = 20
        }
      }

      // Title
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Server Scan Security Report', margin, yPos)
      yPos += 10

      // Scan Info
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      doc.text(`Target: ${scanResults.target || target}`, margin, yPos)
      yPos += 7
      if (scanResults.extractedIP) {
        doc.text(`IP Address: ${scanResults.extractedIP}`, margin, yPos)
        yPos += 7
      }
      doc.text(`Scan Date: ${new Date().toLocaleString()}`, margin, yPos)
      yPos += 10

      // Get analyzed results
      const analyzedResults = scanResults?.results?.json?.analyzedResults
      if (analyzedResults && Object.keys(analyzedResults).length > 0) {
        // Command configs in order for server scan
        const commandConfigs = [
          { key: 'nikto', title: 'Nikto Web Server Scan' },
          { key: 'sqlmap', title: 'SQLMap Database Scan' },
          { key: 'nmapSV', title: 'Nmap Version Scan (All Ports)' },
          { key: 'sslscan', title: 'SSL/TLS Scan' },
          { key: 'host', title: 'DNS Resolution' },
          { key: 'nmapSVIP', title: 'Nmap Version Scan (IP)' },
          { key: 'nmapSCIP', title: 'Nmap Script Scan (IP)' }
        ]

        // Export each command result
        for (const config of commandConfigs) {
          const analyzed = analyzedResults[config.key]
          if (!analyzed || analyzed.error) continue

          checkNewPage(20)
          yPos += 5

          // Command Title
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          doc.text(config.title, margin, yPos)
          yPos += 8

          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')

          // What We Did
          if (analyzed.whatWeDid) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Did:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            const whatWeDidText = typeof analyzed.whatWeDid === 'string' ? analyzed.whatWeDid : JSON.stringify(analyzed.whatWeDid)
            const whatWeDidLines = doc.splitTextToSize(whatWeDidText, maxWidth)
            whatWeDidLines.forEach(line => {
              checkNewPage(7)
              doc.text(line, margin, yPos)
              yPos += 6
            })
            yPos += 3
          }

          // What We Got
          if (analyzed.whatWeGot) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Got:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            const whatWeGotText = typeof analyzed.whatWeGot === 'string' ? analyzed.whatWeGot : JSON.stringify(analyzed.whatWeGot)
            const whatWeGotLines = doc.splitTextToSize(whatWeGotText, maxWidth)
            whatWeGotLines.forEach(line => {
              checkNewPage(7)
              doc.text(line, margin, yPos)
              yPos += 6
            })
            yPos += 3
          }

          // Summary
          if (analyzed.summary && typeof analyzed.summary === 'object') {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text('Summary:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            Object.entries(analyzed.summary).forEach(([key, value]) => {
              if (value === null || value === undefined) return
              checkNewPage(7)
              const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
              const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
              doc.text(`${formattedKey}: ${displayValue}`, margin + 5, yPos)
              yPos += 6
            })
            yPos += 3
          }

          // Ports (for port scans)
          if ((config.key === 'nmapSV' || config.key === 'nmapSVIP' || config.key === 'nmapSCIP') && analyzed.ports && Array.isArray(analyzed.ports) && analyzed.ports.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text(`Port Details (${analyzed.ports.length} ports):`, margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            analyzed.ports.forEach(port => {
              checkNewPage(7)
              const portNum = port.port || port.number || port.portNumber || 'N/A'
              const state = port.state || 'unknown'
              const service = port.service || (typeof port.service === 'object' ? port.service?.name : 'N/A')
              const version = port.version || (typeof port.service === 'object' ? port.service?.version : 'N/A')
              doc.text(`Port ${portNum}: ${state} - ${service} ${version ? `(${version})` : ''}`, margin + 5, yPos)
              yPos += 6
            })
            yPos += 3
          }

          // Findings
          if (analyzed.findings) {
            if (Array.isArray(analyzed.findings) && analyzed.findings.length > 0) {
              checkNewPage(15)
              doc.setFont('helvetica', 'bold')
              doc.text(`Findings (${analyzed.findings.length}):`, margin, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              analyzed.findings.forEach((finding, idx) => {
                checkNewPage(20)
                doc.setFont('helvetica', 'bold')
                doc.text(`${idx + 1}. ${finding.type || finding.name || `Finding ${idx + 1}`}`, margin + 5, yPos)
                yPos += 6
                doc.setFont('helvetica', 'normal')
                
                // Display all properties
                Object.entries(finding).forEach(([key, value]) => {
                  if (['type', 'name'].includes(key.toLowerCase()) || value === null || value === undefined) return
                  checkNewPage(7)
                  const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                  const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                  lines.forEach(line => {
                    checkNewPage(7)
                    doc.text(line, margin + 10, yPos)
                    yPos += 6
                  })
                })
                yPos += 3
              })
            } else if (!Array.isArray(analyzed.findings) && typeof analyzed.findings === 'object') {
              checkNewPage(15)
              doc.setFont('helvetica', 'bold')
              doc.text('Findings:', margin, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              Object.entries(analyzed.findings).forEach(([key, value]) => {
                if (value === null || value === undefined) return
                checkNewPage(7)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                lines.forEach(line => {
                  checkNewPage(7)
                  doc.text(line, margin + 5, yPos)
                  yPos += 6
                })
              })
            }
            yPos += 3
          }

          // Vulnerabilities
          if (analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities) && analyzed.vulnerabilities.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text(`Vulnerabilities (${analyzed.vulnerabilities.length}):`, margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            analyzed.vulnerabilities.forEach((vuln, idx) => {
              checkNewPage(20)
              doc.setFont('helvetica', 'bold')
              doc.text(`${idx + 1}. ${vuln.name || `Vulnerability ${idx + 1}`}`, margin + 5, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              
              // Display all properties
              Object.entries(vuln).forEach(([key, value]) => {
                if (['name'].includes(key.toLowerCase()) || value === null || value === undefined) return
                checkNewPage(7)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                lines.forEach(line => {
                  checkNewPage(7)
                  doc.text(line, margin + 10, yPos)
                  yPos += 6
                })
              })
              yPos += 3
            })
            yPos += 3
          }

          // Recommendations
          if (analyzed.recommendations && Array.isArray(analyzed.recommendations) && analyzed.recommendations.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.text('Recommendations:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            analyzed.recommendations.forEach((rec, idx) => {
              checkNewPage(7)
              const recText = typeof rec === 'string' ? rec : (rec.description || rec.recommendation || rec.text || JSON.stringify(rec))
              const lines = doc.splitTextToSize(`${idx + 1}. ${recText}`, maxWidth - 10)
              lines.forEach(line => {
                checkNewPage(7)
                doc.text(line, margin + 5, yPos)
                yPos += 6
              })
            })
            yPos += 3
          }
        }
      }

      // Footer
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(128, 128, 128)
        doc.text('Cyberix - A Webnox Product', pageWidth / 2, 285, { align: 'center' })
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, 285, { align: 'right' })
      }

      // Save PDF
      const fileName = `server-scan-${(scanResults.target || target).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
      alert('PDF report exported successfully!')
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert(`Failed to export PDF: ${error.message}`)
    }
  }

  const handleStartScan = async () => {
    if (!target.trim()) {
      alert('Please enter a target URL or hostname')
      return
    }

    if (!window.cyberGuard) {
      alert('Scanning system not available')
      return
    }

    // Check if there's already an active scan in global state
    const existingScan = activeScans.find(s => s.scanType === 'Server Scan' && s.viewId === 'server-scan')
    if (existingScan) {
      alert('Server scan is already in progress')
      // Reconnect to existing scan
      currentScanIdRef.current = existingScan.id
      setIsStarting(true)
      if (existingScan.target) {
        setTarget(existingScan.target)
      }
      if (existingScan.startTime) {
        const startTime = new Date(existingScan.startTime)
        const now = new Date()
        const elapsed = Math.floor((now - startTime) / 1000)
        setScanTimer({
          startTime: startTime,
          elapsed: elapsed,
          expectedEndTime: null,
          completedTime: null,
          isRunning: true
        })
      }
      return
    }

    setIsStarting(true)
    setScanResults(null)
    setScanStats({ openPorts: 0, closedPorts: 0, filteredPorts: 0, services: 0 })
    setConsoleLog([])
    setCommandResults({})
    setTgptConvertedResults(null)
    setIsLoadingTgpt(false)
    setTgptConversionComplete(false)
    
    // Initialize timer with actual system time
    const startTime = new Date()
    const expectedEndTime = new Date(startTime.getTime() + 15 * 60 * 1000) // 15 minutes from start
    setScanTimer({
      startTime: startTime,
      elapsed: 0,
      expectedEndTime: expectedEndTime,
      completedTime: null,
      isRunning: true
    })
    
    // Register scan in global state
    const scanId = registerScan({
      scanType: 'Server Scan',
                      target: target.trim(),
      progress: 0,
      message: 'Initializing server scan...',
      startTime: startTime.toISOString(),
      viewId: 'server-scan',
      onStop: async () => {
        if (window.cyberGuard) {
          await window.cyberGuard.abortServerScan()
        }
        stopScan(scanId)
        setIsStarting(false)
      },
      onView: () => {
        // Navigate to server scan view (handled by Dashboard)
        if (window.cyberGuard?.navigateToView) {
          window.cyberGuard.navigateToView('server-scan')
        }
      }
    })
    currentScanIdRef.current = scanId
    
    // Log scan start
                    await scanLogger.logScan({
                      scanType: 'server',
                      scanName: 'Server Scan',
                      target: target.trim(),
      status: 'started',
      startTime: startTime.toISOString(),
      endTime: null,
      duration: null,
      result: 'Scan initiated'
    })
    
    try {
      console.log('Starting server scan for target:', target.trim())
      const result = await window.cyberGuard.startServerScan(target.trim())
      console.log('Server scan started, result:', result)
      
      if (result && result.error) {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('Scan start error:', error)
      alert('Failed to start server scan: ' + (error?.message || String(error)))
      setIsStarting(false)
      stopScan(scanId)
      
      // Log scan failure
                    await scanLogger.logScan({
                      scanType: 'server',
                      scanName: 'Server Scan',
                      target: target.trim(),
                      status: 'failed',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        duration: new Date().getTime() - startTime.getTime(),
        result: `Failed to start: ${error.message}`
      })
    }
  }

  // Listen for scan progress updates (component-specific handlers for UI updates)
  useEffect(() => {
    if (!window.cyberGuard) return
    
    // Define the progress handler (for component state updates)
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
    
    // Register the listener (global listeners in GlobalScanContext handle scan state)
    window.cyberGuard.onServerScanProgress(progressHandler)

    // Note: We don't remove listeners on unmount - they should persist
    // The global listeners in GlobalScanContext handle the scan state

    return () => {
      mountedRef.current = false
    }
  }, [])

  // Check for active scan on mount (reconnection) - restore UI state
  useEffect(() => {
    // Check if there's an active server scan
    const serverScan = activeScans.find(s => s.scanType === 'Server Scan' && s.viewId === 'server-scan')
    
    if (serverScan) {
      // Only reconnect if we don't already have this scan connected
      if (currentScanIdRef.current !== serverScan.id) {
        console.log('🔄 Reconnecting to existing server scan:', serverScan.id)
        
        // Reconnect to existing scan
        currentScanIdRef.current = serverScan.id
        
        // Restore UI state
        setIsStarting(true)
        
        // Restore timer state
        if (serverScan.startTime) {
          const startTime = new Date(serverScan.startTime)
          const now = new Date()
          const elapsed = Math.floor((now - startTime) / 1000) // seconds
          
          setScanTimer({
            startTime: startTime,
            elapsed: elapsed,
            expectedEndTime: null, // We don't store this in global state
            completedTime: null,
            isRunning: true
          })
        }
        
        // Restore target
        if (serverScan.target) {
          setTarget(serverScan.target)
        }
        
        // Update handlers
        reconnectToScan('server-scan', {
          onStop: async () => {
            if (window.cyberGuard) {
              await window.cyberGuard.abortServerScan()
            }
            stopScan(serverScan.id)
            setIsStarting(false)
            setScanTimer(prev => ({ ...prev, isRunning: false }))
            currentScanIdRef.current = null
          },
          onView: () => {
            // Already on this view
          }
        })
        
        console.log('✅ Reconnected to existing server scan:', serverScan.id)
      }
    } else {
      // No active scan - clear connection if we had one
      if (currentScanIdRef.current) {
        console.log('🧹 Clearing scan connection - no active scan')
        currentScanIdRef.current = null
        setIsStarting(false)
        setScanTimer(prev => ({ ...prev, isRunning: false }))
      }
    }
  }, [activeScans, reconnectToScan, stopScan]) // Re-run when activeScans changes

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
    if (!isStarting && scanTimer.isRunning && scanTimer.startTime && !scanTimer.completedTime) {
      const completedTime = new Date()
      setScanTimer(prev => ({
        ...prev,
        isRunning: false,
        completedTime: completedTime
      }))
    }
  }, [isStarting, scanTimer.isRunning, scanTimer.startTime, scanTimer.completedTime])

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
      window.cyberGuard.onServerScanDone(async (result) => {
        try {
          console.log('Server scan completed:', result)
          setIsStarting(false)
          
          // Check if scan was aborted
          if (result && result.aborted) {
            console.log('Scan was aborted')
            setScanTimer(prev => ({ 
              ...prev, 
              isRunning: false,
              completedTime: new Date()
            }))
            if (currentScanIdRef.current) {
              stopScan(currentScanIdRef.current)
              currentScanIdRef.current = null
            }
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
          let scanData = null
          if (result && result.results) {
            // New structure with command results
            setCommandResults(result.results)
            
            // Ensure we have the JSON data properly structured
            scanData = {
              results: {
                json: result.results.json || result.results,
                markdown: result.results.markdown || '',
                raw: result.results.raw || ''
              },
              target: result.target || target,
              extractedIP: result.extractedIP || null,
              success: result.success !== false,
              analyzedResults: result.results.json?.analyzedResults || null
            }
            
            setScanResults(scanData)
            
            // If analyzedResults are already available from main.js, use them directly
            // Structure: result.results.json.analyzedResults contains all TGPT results for each command
            const analyzedResults = result.results.json?.analyzedResults || null
            
            console.log('🔍 [UI] Checking analyzedResults:', {
              hasAnalyzedResults: !!analyzedResults,
              keys: analyzedResults ? Object.keys(analyzedResults) : [],
              analyzedResults: analyzedResults
            })
            
            if (analyzedResults && Object.keys(analyzedResults).length > 0) {
              console.log('✅ [UI] Using analyzedResults from main.js:', Object.keys(analyzedResults).length, 'commands analyzed')
              // Combine all analyzed results into a single display format
              const allAnalyzed = analyzedResults
              const combinedResults = {
                summary: {
                  target: result.target || target,
                  totalFindings: 0,
                  totalVulnerabilities: 0,
                  riskLevel: 'info',
                  commandsAnalyzed: Object.keys(allAnalyzed).length
                },
                findings: [],
                vulnerabilities: [],
                commandResults: {} // Store individual command results for display
              }
              
              // Process each analyzed result - keep track of each command's analysis
              Object.entries(allAnalyzed).forEach(([key, analyzed]) => {
                console.log(`🔍 [UI] Processing command ${key}:`, {
                  hasAnalyzed: !!analyzed,
                  hasError: analyzed?.error,
                  hasFindings: !!analyzed?.findings,
                  findingsCount: analyzed?.findings?.length || 0,
                  hasVulns: !!analyzed?.vulnerabilities,
                  vulnsCount: analyzed?.vulnerabilities?.length || 0
                })
                
                // Store individual command result even if there's an error (for debugging)
                if (analyzed) {
                  combinedResults.commandResults[key] = analyzed
                }
                
                // Only process successful results for findings/vulnerabilities
                if (analyzed && !analyzed.error) {
                  
                  // Combine findings
                  if (analyzed.findings && Array.isArray(analyzed.findings)) {
                    // Add command name to each finding for context
                    const findingsWithCommand = analyzed.findings.map(f => ({
                      ...f,
                      command: key,
                      commandName: key === 'nikto' ? 'Nikto Web Server Scan' :
                                  key === 'sqlmap' ? 'SQLMap Database Scan' :
                                  key === 'nmapSV' ? 'Nmap Version Scan (All Ports)' :
                                  key === 'sslscan' ? 'SSL/TLS Scan' :
                                  key === 'host' ? 'DNS Resolution' :
                                  key === 'nmapSVIP' ? 'Nmap Version Scan (IP)' :
                                  key === 'nmapSCIP' ? 'Nmap Script Scan (IP)' : key
                    }))
                    combinedResults.findings.push(...findingsWithCommand)
                    combinedResults.summary.totalFindings += analyzed.findings.length
                  }
                  
                  // Combine vulnerabilities
                  if (analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities)) {
                    // Add command name to each vulnerability for context
                    const vulnsWithCommand = analyzed.vulnerabilities.map(v => ({
                      ...v,
                      command: key,
                      commandName: key === 'nikto' ? 'Nikto Web Server Scan' :
                                  key === 'sqlmap' ? 'SQLMap Database Scan' :
                                  key === 'nmapSV' ? 'Nmap Version Scan (All Ports)' :
                                  key === 'sslscan' ? 'SSL/TLS Scan' :
                                  key === 'host' ? 'DNS Resolution' :
                                  key === 'nmapSVIP' ? 'Nmap Version Scan (IP)' :
                                  key === 'nmapSCIP' ? 'Nmap Script Scan (IP)' : key
                    }))
                    combinedResults.vulnerabilities.push(...vulnsWithCommand)
                    combinedResults.summary.totalVulnerabilities += analyzed.vulnerabilities.length
                  }
                  
                  // Update risk level based on highest severity found
                  if (analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities)) {
                    analyzed.vulnerabilities.forEach(v => {
                      const severity = v.severity?.toLowerCase()
                      if (severity === 'critical' && combinedResults.summary.riskLevel !== 'critical') {
                        combinedResults.summary.riskLevel = 'critical'
                      } else if (severity === 'high' && !['critical'].includes(combinedResults.summary.riskLevel)) {
                        combinedResults.summary.riskLevel = 'high'
                      } else if (severity === 'medium' && !['critical', 'high'].includes(combinedResults.summary.riskLevel)) {
                        combinedResults.summary.riskLevel = 'medium'
                      } else if (severity === 'low' && !['critical', 'high', 'medium'].includes(combinedResults.summary.riskLevel)) {
                        combinedResults.summary.riskLevel = 'low'
                      }
                    })
                  }
                }
              })
              
              console.log('✅ [UI] Final combinedResults:', {
                commandResultsCount: Object.keys(combinedResults.commandResults).length,
                totalFindings: combinedResults.summary.totalFindings,
                totalVulnerabilities: combinedResults.summary.totalVulnerabilities,
                commandResults: Object.keys(combinedResults.commandResults)
              })
              
              setTgptConvertedResults(combinedResults)
              setTgptConversionComplete(true)
              setIsLoadingTgpt(false)
              console.log('✅ [UI] TGPT results processed and displayed for', Object.keys(allAnalyzed).length, 'commands')
            } else {
              // No analyzedResults from main.js - this should not happen if password was available
              console.log('⚠️ [UI] No analyzedResults from main.js - TGPT analysis may have been skipped (password not available)')
              setIsLoadingTgpt(false)
            }
          } else if (result && result.success && result.result) {
            // Handle old backend shape (legacy - should not be used for new scans)
            const r = result.result
            if (r && r.reportData) {
              scanData = { ...r.reportData, jsonReport: r.jsonReport, htmlReport: r.htmlReport, pdfReport: r.pdfReport }
              setScanResults(scanData)
            } else {
              scanData = r
              setScanResults(scanData)
            }
          } else {
            scanData = { 
              summary: 'Scan completed',
              success: result?.success || false,
              error: result?.error || null
            }
            setScanResults(scanData)
          }
          
          // Log scan completion
          const endTime = new Date()
          const startTime = new Date(endTime.getTime() - (result?.duration || 900000))
          const isSuccess = result?.success !== false
          const resultSummary = isSuccess ? 
            'Server scan completed successfully' : 
            'Server scan failed'
          
          await scanLogger.logScan({
            scanType: 'server',
            scanName: 'Server Scan',
            target: target.trim(),
            status: isSuccess ? 'completed' : 'failed',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            duration: result?.duration || 900000,
            result: resultSummary
          })
          
          // Send desktop push notification
          if (isSuccess && window.cyberGuard?.showNotification) {
            try {
              window.cyberGuard.showNotification({
                title: 'Server Scan Completed',
                body: `Server scan completed successfully for ${target}`,
                viewId: 'server-scan'
              }).catch(err => {
                console.log('[NOTIFICATION] Failed to send notification:', err?.message || 'Unknown error')
              })
            } catch (err) {
              console.log('[NOTIFICATION] Failed to send notification:', err?.message || 'Unknown error')
            }
          }
          
          // Update global scan state to mark scan as complete
          if (currentScanIdRef.current) {
            completeScan(currentScanIdRef.current, {
              success: result?.success !== false,
              target: result.target || target,
              extractedIP: result.extractedIP || null,
              results: scanData
            })
            currentScanIdRef.current = null
          }
          
        } catch (error) {
          console.error('Error handling server scan completion:', error)
          setIsStarting(false)
          setScanResults({ 
            summary: 'Scan completed with errors',
            error: error.message 
          })
        }
      })
    }
  }, [target])

  // Get progress from active scan or scanStatus
  const currentProgress = activeScans.find(s => s.scanType === 'Server Scan' && s.viewId === 'server-scan')?.progress || scanStatus.progress || 0

  // Abort handler
  const handleAbortScan = async () => {
    if (window.cyberGuard) {
      try {
        await window.cyberGuard.abortServerScan()
        if (currentScanIdRef.current) {
          stopScan(currentScanIdRef.current)
          currentScanIdRef.current = null
        }
        setIsStarting(false)
        setScanTimer(prev => ({ ...prev, isRunning: false, completedTime: new Date() }))
      } catch (error) {
        console.error('Abort error:', error)
      }
    }
  }

  // Command configurations for server scan
  const commandConfigs = [
    {
      key: 'nikto',
      name: 'Nikto Web Server Scan',
      description: 'Web server vulnerability scanner',
      icon: Search,
      color: '#FF6B6B'
    },
    {
      key: 'sqlmap',
      name: 'SQLMap Database Scan',
      description: 'SQL injection vulnerability scanner',
      icon: Syringe,
      color: '#4ECDC4'
    },
    {
      key: 'nmapSV',
      name: 'Nmap Version Scan (All Ports)',
      description: 'Comprehensive port and service version scan',
      icon: Globe,
      color: '#45B7D1'
    },
    {
      key: 'sslscan',
      name: 'SSL/TLS Scan',
      description: 'SSL/TLS configuration and vulnerability scan',
      icon: Lock,
      color: '#FFA07A'
    },
    {
      key: 'host',
      name: 'DNS Resolution',
      description: 'Resolve hostname to IP address',
      icon: Radio,
      color: '#98D8C8'
    },
    {
      key: 'nmapSVIP',
      name: 'Nmap Version Scan (IP)',
      description: 'Version scan on resolved IP address',
      icon: Target,
      color: '#6C5CE7'
    },
    {
      key: 'nmapSCIP',
      name: 'Nmap Script Scan (IP)',
      description: 'Default script scan on resolved IP address',
      icon: Zap,
      color: '#A29BFE'
    }
  ]

  // Render command card
  const renderCommandCard = (config) => {
    const result = commandResults[config.key]
    const analyzed = tgptConvertedResults?.commandResults?.[config.key]
    const isRunning = isStarting && !result
    const isCompleted = !!result
    const hasAnalyzed = !!analyzed && !analyzed.error
    const hasError = result?.error || analyzed?.error

    return (
      <div key={config.key} className="command-card" style={{
        border: `2px solid ${config.color}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: '#ffffff',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          {config.icon && <config.icon size={24} style={{ marginRight: '12px', color: config.color }} />}
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: config.color, fontSize: '18px', fontWeight: '600' }}>
              {config.name}
            </h3>
            <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
              {config.description}
            </p>
          </div>
          <div style={{
            padding: '6px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
            backgroundColor: isRunning ? '#FFF3CD' : isCompleted ? (hasError ? '#F8D7DA' : '#D4EDDA') : '#E9ECEF',
            color: isRunning ? '#856404' : isCompleted ? (hasError ? '#721C24' : '#155724') : '#6C757D'
          }}>
            {isRunning ? 'Running...' : isCompleted ? (hasError ? 'Error' : 'Completed') : 'Pending'}
          </div>
        </div>

        {isRunning && (
          <div style={{ padding: '12px', backgroundColor: '#F8F9FA', borderRadius: '4px', marginTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="spinner" style={{
                width: '16px',
                height: '16px',
                border: '2px solid #f3f3f3',
                borderTop: `2px solid ${config.color}`,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ color: '#666', fontSize: '14px' }}>Executing command...</span>
            </div>
          </div>
        )}

        {hasError && (
          <div style={{ padding: '12px', backgroundColor: '#F8D7DA', borderRadius: '4px', marginTop: '12px' }}>
            <p style={{ margin: 0, color: '#721C24', fontSize: '14px', fontWeight: '600' }}>Error:</p>
            <p style={{ margin: '4px 0 0 0', color: '#721C24', fontSize: '13px' }}>
              {result?.error || analyzed?.error || 'Unknown error occurred'}
            </p>
          </div>
        )}

        {hasAnalyzed && (
          <div style={{ marginTop: '12px' }}>
            {analyzed.summary && (
              <div style={{ padding: '12px', backgroundColor: '#E7F3FF', borderRadius: '4px', marginBottom: '12px' }}>
                <p style={{ margin: 0, color: '#004085', fontSize: '14px', fontWeight: '600' }}>Summary:</p>
                <p style={{ margin: '4px 0 0 0', color: '#004085', fontSize: '13px' }}>
                  {typeof analyzed.summary === 'string' ? analyzed.summary : 
                   typeof analyzed.summary === 'object' ? JSON.stringify(analyzed.summary, null, 2) : 
                   String(analyzed.summary)}
                </p>
              </div>
            )}

            {analyzed.findings && analyzed.findings.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px 0', color: '#333', fontSize: '14px', fontWeight: '600' }}>
                  Findings ({analyzed.findings.length}):
                </p>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {analyzed.findings.map((finding, idx) => (
                    <div key={idx} style={{
                      padding: '8px',
                      backgroundColor: '#F8F9FA',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      borderLeft: `3px solid ${config.color}`
                    }}>
                      <p style={{ margin: 0, color: '#333', fontSize: '13px', fontWeight: '600' }}>
                        {finding.title || finding.name || `Finding ${idx + 1}`}
                      </p>
                      {finding.description && (
                        <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '12px' }}>
                          {typeof finding.description === 'string' ? finding.description : 
                           typeof finding.description === 'object' ? JSON.stringify(finding.description, null, 2) : 
                           String(finding.description)}
                        </p>
                      )}
                      {finding.severity && (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          marginTop: '4px',
                          backgroundColor: finding.severity === 'high' ? '#F8D7DA' : finding.severity === 'medium' ? '#FFF3CD' : '#D4EDDA',
                          color: finding.severity === 'high' ? '#721C24' : finding.severity === 'medium' ? '#856404' : '#155724'
                        }}>
                          {finding.severity.toUpperCase()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analyzed.vulnerabilities && analyzed.vulnerabilities.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px 0', color: '#DC3545', fontSize: '14px', fontWeight: '600' }}>
                  Vulnerabilities ({analyzed.vulnerabilities.length}):
                </p>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {analyzed.vulnerabilities.map((vuln, idx) => (
                    <div key={idx} style={{
                      padding: '8px',
                      backgroundColor: '#FFF5F5',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #DC3545'
                    }}>
                      <p style={{ margin: 0, color: '#DC3545', fontSize: '13px', fontWeight: '600' }}>
                        {vuln.title || vuln.name || `Vulnerability ${idx + 1}`}
                      </p>
                      {vuln.description && (
                        <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '12px' }}>
                          {typeof vuln.description === 'string' ? vuln.description : 
                           typeof vuln.description === 'object' ? JSON.stringify(vuln.description, null, 2) : 
                           String(vuln.description)}
                        </p>
                      )}
                      {vuln.severity && (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600',
                          marginTop: '4px',
                          backgroundColor: vuln.severity === 'critical' ? '#F8D7DA' : vuln.severity === 'high' ? '#F8D7DA' : vuln.severity === 'medium' ? '#FFF3CD' : '#D4EDDA',
                          color: vuln.severity === 'critical' ? '#721C24' : vuln.severity === 'high' ? '#721C24' : vuln.severity === 'medium' ? '#856404' : '#155724'
                        }}>
                          {vuln.severity.toUpperCase()}
                        </span>
                      )}
                      {vuln.recommendation && (
                        <p style={{ margin: '4px 0 0 0', color: '#004085', fontSize: '12px', fontStyle: 'italic' }}>
                          💡 {typeof vuln.recommendation === 'string' ? vuln.recommendation : 
                              typeof vuln.recommendation === 'object' ? JSON.stringify(vuln.recommendation, null, 2) : 
                              String(vuln.recommendation)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analyzed.recommendations && analyzed.recommendations.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <p style={{ margin: '0 0 8px 0', color: '#004085', fontSize: '14px', fontWeight: '600' }}>
                  Recommendations ({analyzed.recommendations.length}):
                </p>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {analyzed.recommendations.map((rec, idx) => (
                    <div key={idx} style={{
                      padding: '8px',
                      backgroundColor: '#E7F3FF',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      borderLeft: '3px solid #004085'
                    }}>
                      <p style={{ margin: 0, color: '#004085', fontSize: '13px' }}>
                        {typeof rec === 'string' ? rec : 
                         typeof rec === 'object' ? JSON.stringify(rec, null, 2) : 
                         String(rec)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {result && !hasAnalyzed && !hasError && (
          <div style={{ padding: '12px', backgroundColor: '#F8F9FA', borderRadius: '4px', marginTop: '12px' }}>
            <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>
              Command executed successfully. Waiting for analysis...
            </p>
          </div>
        )}
      </div>
    )
  }

  const generateHTMLReport = (results) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Server Security Scan Report</title>
    <style>
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
        body { 
            font-family: 'Poppins', sans-serif; 
            margin: 20px; 
            line-height: 1.6; 
            color: #333;
        }
        .header { 
            background: #f0f0f0; 
            padding: 20px; 
            border-radius: 5px; 
            margin-bottom: 20px; 
            border: 2px solid #ddd;
        }
        .section { 
            margin: 20px 0; 
            page-break-inside: avoid;
        }
        table { 
            border-collapse: collapse; 
            width: 100%; 
            margin: 10px 0; 
            font-size: 14px;
        }
        th, td { 
            border: 1px solid #ddd; 
            padding: 8px; 
            text-align: left; 
        }
        th { 
            background-color: #f2f2f2; 
            font-weight: bold;
        }
        .high { color: red; font-weight: bold; }
        .medium { color: orange; font-weight: bold; }
        .low { color: green; font-weight: bold; }
        .vulnerability { 
            background: #fff3cd; 
            padding: 10px; 
            margin: 5px 0; 
            border-left: 4px solid #ffc107; 
            border-radius: 4px;
        }
        .summary-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e9ecef;
        }
        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: #007bff;
        }
        .stat-label {
            font-size: 14px;
            color: #6c757d;
            margin-top: 5px;
        }
        h1 { color: #007bff; }
        h2 { color: #495057; border-bottom: 2px solid #007bff; padding-bottom: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔒 Server Security Scan Report</h1>
        <p><strong>Target:</strong> ${results.target}</p>
        <p><strong>Hostname:</strong> ${results.hostname}</p>
        <p><strong>Scan Date:</strong> ${new Date(results.timestamp).toLocaleString()}</p>
        <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="section">
        <h2>📊 Scan Summary</h2>
        <div class="summary-stats">
            <div class="stat-card">
                <div class="stat-number">${results.summary?.portsScanned || 0}</div>
                <div class="stat-label">Ports Scanned</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${results.summary?.servicesDetected || 0}</div>
                <div class="stat-label">Services Detected</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${results.summary?.vulnerabilitiesFound || 0}</div>
                <div class="stat-label">Vulnerabilities</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${results.summary?.directoriesFound || 0}</div>
                <div class="stat-label">Directories Found</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>🌐 DNS Resolution</h2>
        <p><strong>Resolved IPs:</strong> ${results.findings?.dns?.ip || 'N/A'}</p>
        <p><strong>MX Record:</strong> ${results.findings?.dns?.mx || 'N/A'}</p>
        <p><strong>TXT Records:</strong> ${results.findings?.dns?.txt?.join(', ') || 'N/A'}</p>
    </div>
    
    <div class="section">
        <h2>🔌 Open Ports</h2>
        <table>
            <tr><th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th></tr>
            ${(results.findings?.ports || []).map(port => `
                <tr>
                    <td>${port.port}</td>
                    <td>${port.protocol}</td>
                    <td>${port.state}</td>
                    <td>${port.service}</td>
                    <td>${port.version}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>⚠️ Vulnerabilities</h2>
        ${(results.findings?.vulnerabilities || []).length > 0 ? 
            results.findings.vulnerabilities.map(vuln => `
                <div class="vulnerability">
                    <strong>${vuln.type || 'Unknown'}</strong><br>
                    <em>Severity: ${vuln.severity || 'Unknown'}</em><br>
                    ${vuln.description || 'No description available'}
                </div>
            `).join('') :
            '<p>✅ No vulnerabilities detected.</p>'
        }
    </div>
    
    <div class="section">
        <h2>📁 Web Directories</h2>
        <table>
            <tr><th>Path</th><th>Status</th><th>Size</th></tr>
            ${(results.findings?.directories || []).map(dir => `
                <tr>
                    <td>${dir.path}</td>
                    <td>${dir.status}</td>
                    <td>${dir.size || 'N/A'}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>📋 Recommendations</h2>
        <ul>
            <li>Review and close unnecessary open ports</li>
            <li>Update services to latest versions</li>
            <li>Implement proper firewall rules</li>
            <li>Regular security assessments recommended</li>
            <li>Monitor network traffic for anomalies</li>
        </ul>
    </div>
    
    <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ddd; text-align: center; color: #6c757d;">
        <p>Report generated by Cyberix Security Scanner</p>
        <p>Generated on: ${new Date().toLocaleString()}</p>
    </div>
</body>
</html>
    `
  }

  const generateExcelReport = (results) => {
    // This is a simplified Excel generation
    // In a real implementation, you'd use a library like xlsx
    const csvContent = `Target,Hostname,Scan Date,Ports Scanned,Services Detected,Vulnerabilities,Directories
${results.target},${results.hostname},${new Date(results.timestamp).toLocaleString()},${results.summary.portsScanned},${results.summary.servicesDetected},${results.summary.vulnerabilitiesFound},${results.summary.directoriesFound}`
    
    return csvContent
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Merged Section - Server Scanning, Scan Configuration, and Console Log */}
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-8 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl relative overflow-hidden w-full max-w-full box-border">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6 w-full max-w-full overflow-x-hidden">
          {/* Header with Help Icon */}
          <div className="relative">
            <button
              onClick={() => setShowHelpDialog(true)}
              className="absolute top-0 right-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200 z-20"
              title="View detailed scan information"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="flex items-center space-x-3 mb-6 pr-12">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Server Scanning</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Comprehensive non-destructive security assessment of web servers and applications</p>
              </div>
            </div>
          </div>

          {/* Scan Configuration */}
          <div className="space-y-6 w-full max-w-full overflow-x-hidden">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Target URL or Hostname
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
                    placeholder="e.g., https://example.com, example.com, or webnox.in"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors bg-white/80 dark:bg-slate-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm"
                    disabled={isStarting}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && target.trim() && !isStarting) {
                        handleStartScan()
                      }
                    }}
                  />
                </div>
                <button
                  onClick={isStarting ? handleAbortScan : handleStartScan}
                  disabled={!target.trim() && !isStarting}
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2 whitespace-nowrap shadow-lg"
                >
                  {isStarting ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Stop Scan</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <span>Start Scan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {/* Enhanced Timer Display */}
            {(scanTimer.isRunning || scanTimer.completedTime) && scanTimer.startTime && (() => {
              // Get progress from active scan in global state
              const activeServerScan = activeScans.find(s => s.scanType === 'Server Scan' && s.viewId === 'server-scan')
              const currentProgress = activeServerScan?.progress || 0
              const currentMessage = activeServerScan?.message || 'Initializing server scan...'
              
              return (
                <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-6 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center space-x-2 mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {scanTimer.isRunning ? 'Scan in Progress' : 'Scan Completed'}
                  </h4>
                </div>
                
                {/* Progress Bar */}
                {scanTimer.isRunning && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Progress</span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{currentProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${currentProgress}%` }}
                      ></div>
                    </div>
                    {currentMessage && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">{currentMessage}</p>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg p-4 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm">
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
                  <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg p-4 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm">
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
                  <div className="bg-white/70 dark:bg-slate-800/70 rounded-lg p-4 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm">
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
              )
            })()}

            {/* Console Log - Below Scan Completed */}
            {consoleLog && consoleLog.length > 0 && (
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-6 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm mt-6">
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
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center shadow-md"
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
                      className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center shadow-md"
                      title="Clear Log"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm w-full max-w-full overflow-x-hidden box-border">
                  <div className="space-y-1 w-full max-w-full">
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

          </div>
        </div>
      </div>

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">Server-Level Scanning</h3>
              <button
                onClick={() => setShowHelpDialog(false)}
                className="w-10 h-10 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 hover:from-red-100 hover:to-red-200 dark:hover:from-red-900 dark:hover:to-red-800 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 flex items-center justify-center font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-8">
              {/* What is Server-Level Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  What is Server-Level Scanning?
                </h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
                  Server-level scanning is a systematic, automated inspection of a server and the services it exposes to the internet. The goal is to discover:
                </p>
                <ul className="list-none space-y-3 ml-4">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-300">which services and ports are open (e.g., web server, SSH, database),</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-300">which software and versions are running,</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-300">obvious misconfigurations or known vulnerable components (e.g., outdated SSL/TLS, vulnerable server modules),</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-gray-700 dark:text-gray-300">surface details that an attacker could use to probe further.</span>
                  </li>
                </ul>
                <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded-r-lg mt-4">
                  <p className="text-gray-800 dark:text-gray-200 italic leading-relaxed">
                    Think of it like a health check and vulnerability reconnaissance performed from the outside-in: we identify weak or exposed places so you can fix them before someone else finds them.
                  </p>
                </div>
              </div>

              {/* Why do we need Server-Level Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  Why do we need Server-Level Scanning?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
                    <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Prevent breaches before they happen
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Finding misconfigurations, old software, or exposed admin interfaces early reduces the chance of a successful attack.
                    </p>
                  </div>
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
                    <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Prioritize fixes
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Scans help you focus resources on the highest-risk problems (e.g., an exposed admin page vs. a minor header misconfiguration).
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
                    <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Meet compliance and audits
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Many standards (PCI, ISO, etc.) expect regular scans and evidence of remediation.
                    </p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-5 border border-yellow-200 dark:border-yellow-800">
                    <h5 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Improve incident response
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Knowing your server's attack surface helps you respond faster and more accurately if an incident occurs.
                    </p>
                  </div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800 md:col-span-2">
                    <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Maintain customer trust
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Regular scanning and remediation show due diligence to customers and partners.
                    </p>
                  </div>
                </div>
              </div>

              {/* How we help */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  How we help — our Server-Level Scanning service (high level)
                </h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  We run a carefully controlled and authorized set of reconnaissance and scanning tools (the same class of tools used by defenders and penetration testers) against your server(s). For each scan we:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Confirm written authorization</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">No scans are run without your explicit permission.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Perform discovery</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Identify live hosts, open ports, and running services.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Fingerprint software</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Determine server software and versions (web server, application server, TLS library).</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Check common web/vuln issues</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Automated checks for insecure configs, outdated components, SSL/TLS weaknesses, and common web server vulnerabilities.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Collect and collate results</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Create a clear, actionable report with severity, explanation, and recommended fixes.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      6
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Deliver the report</h5>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Provide the report and (optionally) a walkthrough session to explain findings and remediation steps.</p>
                    </div>
                  </div>
                </div>
              </div>
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
            <>
              <div className="space-y-6 w-full max-w-full overflow-x-hidden box-border">
                {/* 1. Scan Completion Status */}
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center space-x-2 mb-2">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-green-800 dark:text-green-200 font-medium">Server scan completed successfully</p>
                  </div>
                  <div className="text-sm text-yellow-700">Medium Risk Ports</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <div className="text-2xl font-bold text-green-600">
                    {(scanResults.findings?.ports || []).filter(p => p.riskLevel === 'Low').length}
                  </div>
                  <div className="text-sm text-green-700">Low Risk Ports</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                  <div className="text-2xl font-bold text-orange-600">{(scanResults.findings?.ports || []).length}</div>
                  <div className="text-sm text-orange-700">Total Open Ports</div>
                </div>
              </div>

              {/* Detailed Ports Table */}
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Port</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Service</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Version</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Banner</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Risk</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Vulnerabilities</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(scanResults.findings?.ports || []).map((port, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-mono text-orange-600 font-semibold">{port.port}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{port.protocol}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{port.service}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{port.cpe}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900 dark:text-gray-100">{port.version}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{port.banner}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate text-gray-600 dark:text-gray-400 font-mono text-xs">
                          {port.banner}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          port.riskLevel === 'High' ? 'bg-red-100 text-red-800' :
                          port.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {port.riskLevel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {port.vulnerabilities?.length || 0} issues
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-orange-600 hover:text-orange-800 text-xs font-medium">
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Port Recommendations */}
            <div className="mt-6 bg-gradient-to-r from-red-50 to-yellow-50 rounded-lg p-4 border border-red-200">
              <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">🔒 Critical Port Security Recommendations</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h6 className="font-medium text-red-800 mb-2">High Priority Actions:</h6>
                  <ul className="space-y-1 text-gray-700">
                    <li>• Secure database ports (3306, 5432, 6379) with authentication</li>
                    <li>• Change default SSH port (22) to non-standard port</li>
                    <li>• Implement firewall rules to restrict database access</li>
                  </ul>
                </div>
                <div>
                  <h6 className="font-medium text-yellow-800 mb-2">Medium Priority Actions:</h6>
                  <ul className="space-y-1 text-gray-700">
                    <li>• Update web server configuration and hide version</li>
                    <li>• Implement proper SSL/TLS configuration</li>
                    <li>• Enable security headers for HTTP/HTTPS services</li>
                  </ul>
                </div>
              </div>
            </div>
            </>
          )}

          {/* Advanced Security Vulnerabilities Analysis */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>Advanced Security Vulnerabilities Analysis</span>
            </h4>
            
            {/* Vulnerability Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-2xl font-bold text-red-600">
                  {(scanResults.findings?.vulnerabilities || []).filter(v => v.severity === 'Critical').length}
                </div>
                <div className="text-sm text-red-700">Critical</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-2xl font-bold text-orange-600">
                  {(scanResults.findings?.vulnerabilities || []).filter(v => v.severity === 'High').length}
                </div>
                <div className="text-sm text-orange-700">High</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">
                  {(scanResults.findings?.vulnerabilities || []).filter(v => v.severity === 'Medium').length}
                </div>
                <div className="text-sm text-yellow-700">Medium</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-2xl font-bold text-orange-600">
                  {(scanResults.findings?.vulnerabilities || []).reduce((sum, v) => sum + (v.cvss || 0), 0).toFixed(1)}
                </div>
                <div className="text-sm text-orange-700">CVSS Score</div>
              </div>
            </div>

            {(scanResults.findings?.vulnerabilities || []).length > 0 ? (
              <div className="space-y-4">
                {scanResults.findings.vulnerabilities.map((vuln, index) => (
                  <div key={index} className={`p-6 rounded-lg border-l-4 shadow-sm ${
                    vuln.severity === 'Critical' ? 'bg-red-50 border-red-400' :
                    vuln.severity === 'High' ? 'bg-orange-50 border-orange-400' :
                    vuln.severity === 'Medium' ? 'bg-yellow-50 border-yellow-400' :
                    'bg-green-50 border-green-400'
                  }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-3">
                          <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{vuln.type}</h5>
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            vuln.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                            vuln.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                            vuln.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {vuln.severity}
                          </span>
                          {vuln.cvss && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-sm font-mono">
                              CVSS: {vuln.cvss}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-700 mb-3">{vuln.description}</p>
                        
                        {/* CVE Information */}
                        {vuln.cve && vuln.cve !== 'N/A' && (
                          <div className="mb-3">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">CVE:</span>
                            <span className="ml-2 font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                              {vuln.cve}
                            </span>
                          </div>
                        )}
                        
                        {/* Affected Components */}
                        {vuln.affected && (
                          <div className="mb-3">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Affected:</span>
                            <span className="ml-2 text-sm text-gray-700">{vuln.affected}</span>
                          </div>
                        )}
                        
                        {/* Remediation */}
                        <div className="mb-3">
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Remediation:</span>
                          <p className="mt-1 text-sm text-gray-700">{vuln.remediation}</p>
                        </div>
                        
                        {/* References */}
                        {vuln.references && vuln.references.length > 0 && (
                          <div>
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">References:</span>
                            <div className="mt-1 space-y-1">
                              {vuln.references.map((ref, refIndex) => (
                                <a 
                                  key={refIndex}
                                  href={ref} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block text-sm text-orange-600 hover:text-orange-800 hover:underline"
                                >
                                  {ref}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h5 className="text-lg font-semibold text-green-600 mb-2">No Vulnerabilities Detected</h5>
                <p className="text-gray-600 dark:text-gray-400">Great! No security vulnerabilities were found during the scan.</p>
              </div>
            )}
          </div>

          {/* Web Directories Details */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
              </svg>
              <span>Discovered Web Directories</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(scanResults.findings?.directories || []).map((dir, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="font-medium text-gray-900 dark:text-gray-100 font-mono">{dir.path}</h5>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      dir.status === 200 ? 'bg-green-100 text-green-800' :
                      dir.status === 403 ? 'bg-yellow-100 text-yellow-800' :
                      dir.status === 404 ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {dir.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Size: {dir.size ? `${dir.size} bytes` : 'Unknown'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SSL/TLS Security Analysis */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>SSL/TLS Security Analysis</span>
            </h4>
            
            {/* SSL Certificate Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Certificate Information</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Issuer:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.ssl?.certificate?.issuer || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Subject:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.ssl?.certificate?.subject || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Valid From:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.ssl?.certificate?.validFrom || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Valid To:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.ssl?.certificate?.validTo || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Key Size:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.ssl?.certificate?.keySize || 'N/A'} bits</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Protocol Support</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">TLS 1.0:</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      scanResults.findings?.ssl?.protocols?.tls10 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {scanResults.findings?.ssl?.protocols?.tls10 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">TLS 1.1:</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      scanResults.findings?.ssl?.protocols?.tls11 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                    }`}>
                      {scanResults.findings?.ssl?.protocols?.tls11 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">TLS 1.2:</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      scanResults.findings?.ssl?.protocols?.tls12 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {scanResults.findings?.ssl?.protocols?.tls12 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">TLS 1.3:</span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      scanResults.findings?.ssl?.protocols?.tls13 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {scanResults.findings?.ssl?.protocols?.tls13 ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SSL Vulnerabilities */}
            <div className="bg-red-50 rounded-lg p-4 border border-red-200">
              <h5 className="font-semibold text-red-800 mb-3">SSL/TLS Security Issues</h5>
              <ul className="space-y-1 text-sm text-red-700">
                {(scanResults.findings?.ssl?.vulnerabilities || []).map((issue, index) => (
                  <li key={index} className="flex items-center space-x-2">
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Web Application Technology Stack */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Web Application Technology Stack</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-orange-600 font-medium mb-1">Web Server</div>
                <div className="text-lg font-semibold text-orange-800">{scanResults.findings?.webApplication?.technology?.server || 'N/A'}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-green-600 font-medium mb-1">Programming Language</div>
                <div className="text-lg font-semibold text-green-800">{scanResults.findings?.webApplication?.technology?.language || 'N/A'}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-sm text-purple-600 font-medium mb-1">Framework</div>
                <div className="text-lg font-semibold text-purple-800">{scanResults.findings?.webApplication?.technology?.framework || 'N/A'}</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="text-sm text-yellow-600 font-medium mb-1">Database</div>
                <div className="text-lg font-semibold text-yellow-800">{scanResults.findings?.webApplication?.technology?.database || 'N/A'}</div>
              </div>
            </div>

            {/* Security Headers Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Present Security Headers</h5>
                <div className="space-y-2">
                  {(scanResults.findings?.webApplication?.securityHeaders?.present || []).map((header, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-gray-700 font-mono">{header}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Missing Security Headers</h5>
                <div className="space-y-2">
                  {(scanResults.findings?.webApplication?.securityHeaders?.missing || []).map((header, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm text-gray-700 font-mono">{header}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Compliance & Risk Assessment */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Compliance & Risk Assessment</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-sm text-red-600 font-medium mb-1">PCI DSS</div>
                <div className="text-2xl font-bold text-red-800">{scanResults.compliance?.pci?.score || 'N/A'}</div>
                <div className="text-xs text-red-700">{scanResults.compliance?.pci?.status || 'N/A'}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-orange-600 font-medium mb-1">GDPR</div>
                <div className="text-2xl font-bold text-orange-800">{scanResults.compliance?.gdpr?.score || 'N/A'}</div>
                <div className="text-xs text-orange-700">{scanResults.compliance?.gdpr?.status || 'N/A'}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-green-600 font-medium mb-1">ISO 27001</div>
                <div className="text-2xl font-bold text-green-800">{scanResults.compliance?.iso27001?.score || 'N/A'}</div>
                <div className="text-xs text-green-700">{scanResults.compliance?.iso27001?.status || 'N/A'}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-sm text-purple-600 font-medium mb-1">SOX</div>
                <div className="text-2xl font-bold text-purple-800">{scanResults.compliance?.sox?.score || 'N/A'}</div>
                <div className="text-xs text-purple-700">{scanResults.compliance?.sox?.status || 'N/A'}</div>
              </div>
            </div>

            {/* Risk Score */}
            <div className="bg-gradient-to-r from-red-50 to-yellow-50 rounded-lg p-4 border border-red-200">
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100">Overall Risk Score</h5>
                <span className="text-2xl font-bold text-red-600">{scanResults.summary?.riskScore || 'N/A'}/10</span>
              </div>
              <div className="text-sm text-gray-700 mb-2">Security Level: <span className="font-semibold text-red-600">{scanResults.summary?.securityLevel || 'N/A'}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-red-500 h-2 rounded-full" 
                  style={{ width: `${(scanResults.summary?.riskScore || 0) * 10}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Advanced Security Recommendations */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Advanced Security Recommendations</span>
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Critical Recommendations */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <h5 className="font-semibold text-red-800 mb-3 flex items-center space-x-2">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Critical Priority</span>
                </h5>
                <ul className="space-y-2 text-sm text-red-700">
                  {(scanResults.recommendations?.critical || []).map((rec, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-red-500 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* High Priority Recommendations */}
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <h5 className="font-semibold text-orange-800 mb-3 flex items-center space-x-2">
                  <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>High Priority</span>
                </h5>
                <ul className="space-y-2 text-sm text-orange-700">
                  {(scanResults.recommendations?.high || []).map((rec, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-orange-500 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Medium Priority Recommendations */}
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <h5 className="font-semibold text-yellow-800 mb-3 flex items-center space-x-2">
                  <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>Medium Priority</span>
                </h5>
                <ul className="space-y-2 text-sm text-yellow-700">
                  {(scanResults.recommendations?.medium || []).map((rec, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-yellow-500 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Low Priority Recommendations */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <h5 className="font-semibold text-green-800 mb-3 flex items-center space-x-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Low Priority</span>
                </h5>
                <ul className="space-y-2 text-sm text-green-700">
                  {(scanResults.recommendations?.low || []).map((rec, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-green-500 mt-1">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServerScanning;