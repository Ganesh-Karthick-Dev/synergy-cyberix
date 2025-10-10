import { useState, useEffect } from 'react'

function ServerScanning() {
  const [target, setTarget] = useState('')
  const [permissionGranted, setPermissionGranted] = useState(false)
  const [permissionInput, setPermissionInput] = useState('')
  const [permissionError, setPermissionError] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState([])
  const [scanResults, setScanResults] = useState(null)
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

  const validateURL = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return {
        valid: true,
        hostname: urlObj.hostname,
        protocol: urlObj.protocol
      }
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' }
    }
  }

  const checkPrivateIP = async (hostname) => {
    try {
      // Simulate DNS resolution to check for private IPs
      const privateRanges = [
        /^192\.168\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./
      ]
      
      // This would normally do actual DNS resolution
      // For demo purposes, we'll simulate it
      return {
        isPrivate: false,
        ip: '203.0.113.1' // Simulated public IP
      }
    } catch (error) {
      return { isPrivate: false, error: 'DNS resolution failed' }
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

    if (!window.cyberGuard) {
      alert('Scanning system not available')
      return
    }

    setIsScanning(true)
    setScanResults(null)
    setScanProgress([])
    setScanStats({
      dnsResolved: false,
      portsScanned: 0,
      servicesDetected: 0,
      vulnerabilitiesFound: 0,
      directoriesFound: 0
    })

    const startTime = new Date()
    setScanStartTime(startTime)
    setExpectedEndTime(new Date(startTime.getTime() + 15 * 60 * 1000)) // 15 minutes expected

    try {
      await window.cyberGuard.startServerScan(target)
    } catch (error) {
      console.error('Server scan error:', error)
      addProgressLog('error', `Scan failed: ${error.message}`)
    }
  }

  const abortServerScan = async () => {
    if (window.cyberGuard) {
      try {
        await window.cyberGuard.abortServerScan()
        setIsScanning(false)
        addProgressLog('warning', 'Server scan aborted by user')
      } catch (error) {
        console.error('Abort error:', error)
      }
    }
  }

  const handlePermissionInput = (value) => {
    setPermissionInput(value)
    setPermissionError('')
    
    if (value.toUpperCase() === 'YES') {
      setPermissionGranted(true)
    } else if (value.trim() !== '') {
      setPermissionGranted(false)
      setPermissionError('Please type exactly "YES" to confirm permission')
    } else {
      setPermissionGranted(false)
    }
  }


  const addProgressLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString()
    setScanProgress(prev => [...prev, { type, message, timestamp }])
  }

  // Timer effect for smooth elapsed time updates
  useEffect(() => {
    let interval
    if (isScanning) {
      interval = setInterval(() => {
        setCurrentTime(new Date())
      }, 1000) // Update every second
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isScanning])

  // Listen for server scan progress and completion
  useEffect(() => {
    console.log('Setting up server scan event listeners...')
    console.log('window.cyberGuard available:', !!window.cyberGuard)
    
    if (window.cyberGuard) {
      console.log('Setting up onServerScanProgress listener...')
      window.cyberGuard.onServerScanProgress((update) => {
        console.log('🔥 Server scan progress received:', update)
        addProgressLog(update.stage || 'info', update.message)
        
        // Update stats based on progress
        if (update.stage === 'dns') {
          setScanStats(prev => ({ ...prev, dnsResolved: true }))
        } else if (update.stage === 'nmap') {
          setScanStats(prev => ({ ...prev, portsScanned: Math.min(100, prev.portsScanned + 5) }))
        } else if (update.stage === 'nikto') {
          setScanStats(prev => ({ ...prev, vulnerabilitiesFound: Math.min(20, prev.vulnerabilitiesFound + 1) }))
        } else if (update.stage === 'gobuster') {
          setScanStats(prev => ({ ...prev, directoriesFound: Math.min(100, prev.directoriesFound + 2) }))
        }
      })

      console.log('Setting up onServerScanDone listener...')
      window.cyberGuard.onServerScanDone((result) => {
                console.log('🔥 Server scan completed:', result)
                console.log('🔥 Scan results data:', result?.result)
                console.log('🔥 DNS data:', result?.result?.findings?.dns)
                console.log('🔥 Network data:', result?.result?.findings?.network)
                
                if (result && result.success) {
                  setScanResults(result.result)
                  setIsScanning(false)
                  addProgressLog('success', 'Server scan completed successfully')
                } else if (result && result.aborted) {
                  setIsScanning(false)
                  addProgressLog('warning', 'Server scan aborted by user')
                } else {
                  setIsScanning(false)
                  addProgressLog('error', 'Server scan failed')
                }
      })
    } else {
      console.error('window.cyberGuard not available!')
    }
  }, [])

  const downloadReport = async (format) => {
    if (!scanResults) {
      alert('No scan results available to download')
      return
    }

    try {
      if (format === 'html') {
        const htmlContent = generateHTMLReport(scanResults)
        const blob = new Blob([htmlContent], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `server-scan-${target.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.html`
        link.click()
        URL.revokeObjectURL(url)
      } else if (format === 'pdf') {
        // Generate PDF report using window.print() for better compatibility
        const htmlContent = generateHTMLReport(scanResults)
        const printWindow = window.open('', '_blank')
        printWindow.document.write(htmlContent)
        printWindow.document.close()
        
        // Wait for content to load, then trigger print dialog
        printWindow.onload = () => {
          printWindow.focus()
          printWindow.print()
          // After printing, close the window
          setTimeout(() => {
            printWindow.close()
          }, 1000)
        }
        
        // Fallback: Download as HTML if print fails
        setTimeout(() => {
          const blob = new Blob([htmlContent], { type: 'text/html' })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `server-scan-${target.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.html`
          link.click()
          URL.revokeObjectURL(url)
        }, 2000)
      } else if (format === 'excel') {
        // Generate Excel report
        const excelContent = generateExcelReport(scanResults)
        const blob = new Blob([excelContent], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `server-scan-${target.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.xlsx`
        link.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download report')
    }
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
            font-family: Arial, sans-serif; 
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

  const formatTime = (date) => {
    return date ? date.toLocaleTimeString() : 'N/A'
  }

  const getElapsedTime = () => {
    if (!scanStartTime) return '00:00:00'
    const elapsed = currentTime - scanStartTime
    const hours = Math.floor(elapsed / 3600000)
    const minutes = Math.floor((elapsed % 3600000) / 60000)
    const seconds = Math.floor((elapsed % 60000) / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const getRemainingTime = () => {
    if (!expectedEndTime) return 'N/A'
    const remaining = expectedEndTime - new Date()
    if (remaining <= 0) return '00:00:00'
    const hours = Math.floor(remaining / 3600000)
    const minutes = Math.floor((remaining % 3600000) / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">Server-level Scanning</h1>
        <p className="text-orange-100">Comprehensive non-destructive security assessment of web servers and applications</p>
      </div>

      {/* Target Input */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Scan Configuration</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Target URL or Hostname
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://example.com or example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              disabled={isScanning}
            />
          </div>

          {/* Permission Confirmation */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg className="w-6 h-6 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-800 mb-2">Permission Confirmation Required</h3>
                <p className="text-yellow-700 text-sm mb-3">
                  I confirm I own or have written permission to scan <strong>{target || '<TARGET_URL>'}</strong>
                </p>
                <div className="flex items-center space-x-3">
                  <input
                    type="text"
                    value={permissionInput}
                    onChange={(e) => handlePermissionInput(e.target.value)}
                    placeholder="Type YES to continue"
                    className={`px-3 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 ${
                      permissionError ? 'border-red-300 bg-red-50' : 'border-yellow-300'
                    }`}
                    disabled={isScanning}
                  />
                  {permissionError && (
                    <div className="text-red-600 text-sm mt-1">{permissionError}</div>
                  )}
                  <button
                    onClick={() => handlePermissionInput(permissionInput)}
                    className={`px-4 py-2 rounded-lg font-medium ${
                      permissionGranted
                        ? 'bg-green-100 text-green-800 border border-green-300'
                        : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                    }`}
                    disabled={isScanning}
                  >
                    {permissionGranted ? '✓ Confirmed' : 'Confirm Permission'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Scan Button */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={startServerScan}
              disabled={!permissionGranted || !target.trim() || isScanning}
              className={`px-8 py-3 rounded-lg font-semibold text-white transition-colors ${
                !permissionGranted || !target.trim() || isScanning
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
            >
              {isScanning ? 'Scanning...' : 'Start Server Scan'}
            </button>
            
            {isScanning && (
              <button
                onClick={abortServerScan}
                className="px-8 py-3 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Abort Scan
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scan Progress */}
      {isScanning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Scan Progress</span>
            </h3>
            <button
              onClick={abortServerScan}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Abort Scan</span>
            </button>
          </div>
          
          {/* Time Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-sm text-orange-600 font-medium">Started</div>
              <div className="text-lg font-bold text-orange-800">{formatTime(scanStartTime)}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <div className="text-sm text-green-600 font-medium">Elapsed</div>
              <div className="text-lg font-bold text-green-800">{getElapsedTime()}</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4 text-center">
              <div className="text-sm text-orange-600 font-medium">Expected End</div>
              <div className="text-lg font-bold text-orange-800">{formatTime(expectedEndTime)}</div>
            </div>
          </div>

          {/* Progress Log */}
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm max-h-64 overflow-y-auto">
            {scanProgress.map((log, index) => (
              <div key={index} className={`mb-1 ${
                log.type === 'error' ? 'text-red-400' :
                log.type === 'success' ? 'text-green-400' :
                log.type === 'warning' ? 'text-yellow-400' :
                'text-orange-400'
              }`}>
                [{log.timestamp}] {log.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scan Statistics */}
      {isScanning && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Statistics</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{scanStats.dnsResolved ? '✓' : '○'}</div>
              <div className="text-sm text-orange-700">DNS Resolved</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{scanStats.portsScanned}</div>
              <div className="text-sm text-green-700">Ports Scanned</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{scanStats.servicesDetected}</div>
              <div className="text-sm text-purple-700">Services</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{scanStats.vulnerabilitiesFound}</div>
              <div className="text-sm text-red-700">Vulnerabilities</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{scanStats.directoriesFound}</div>
              <div className="text-sm text-yellow-700">Directories</div>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Scan Results */}
      {scanResults && (
        <div className="space-y-6">
          {/* Debug Information */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-yellow-800 mb-2">Debug Information</h4>
            <div className="text-sm text-yellow-700">
              <p>Scan Results Available: {scanResults ? 'Yes' : 'No'}</p>
              <p>DNS Data: {scanResults?.findings?.dns ? 'Available' : 'Missing'}</p>
              <p>Network Data: {scanResults?.findings?.network ? 'Available' : 'Missing'}</p>
              <p>DNS IP: {scanResults?.findings?.dns?.ip || 'N/A'}</p>
              <p>Network Latency: {scanResults?.findings?.network?.latency || 'N/A'}</p>
            </div>
          </div>
          {/* Header with Download Buttons */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">🔒 Server Security Scan Results</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Comprehensive security assessment completed</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => downloadReport('html')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>HTML Report</span>
                </button>
                <button
                  onClick={() => downloadReport('excel')}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Excel Report</span>
                </button>
                <button
                  onClick={() => downloadReport('pdf')}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>PDF Report</span>
                </button>
              </div>
            </div>

            {/* Scan Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-orange-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-orange-700">{scanResults.summary?.portsScanned || 0}</div>
                    <div className="text-sm text-orange-600">Ports Scanned</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-700">{scanResults.summary?.servicesDetected || 0}</div>
                    <div className="text-sm text-green-600">Services Detected</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-700">{scanResults.summary?.vulnerabilitiesFound || 0}</div>
                    <div className="text-sm text-red-600">Vulnerabilities</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5a2 2 0 012-2h4a2 2 0 012 2v6a2 2 0 01-2 2H10a2 2 0 01-2-2V5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-700">{scanResults.summary?.directoriesFound || 0}</div>
                    <div className="text-sm text-yellow-600">Directories Found</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced DNS Resolution Details */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
              </svg>
              <span>DNS Resolution & Network Analysis</span>
            </h4>
            
            {/* DNS Records */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div className="text-sm text-orange-600 font-medium mb-1">Primary IP</div>
                <div className="text-lg font-semibold text-orange-800 font-mono">{scanResults.findings?.dns?.ip || 'N/A'}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="text-sm text-green-600 font-medium mb-1">Mail Server</div>
                <div className="text-lg font-semibold text-green-800">{scanResults.findings?.dns?.mx || 'N/A'}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div className="text-sm text-purple-600 font-medium mb-1">TXT Records</div>
                <div className="text-lg font-semibold text-purple-800">{scanResults.findings?.dns?.txt?.length || 0} found</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="text-sm text-yellow-600 font-medium mb-1">CNAME Records</div>
                <div className="text-lg font-semibold text-yellow-800">{scanResults.findings?.dns?.cname?.length || 0} found</div>
              </div>
            </div>

            {/* Detailed DNS Information */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">DNS Records Details</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">SOA Record:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.dns?.soa || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">PTR Record:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.dns?.ptr || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Name Servers:</span>
                    <span className="font-mono text-gray-900 dark:text-gray-100">{scanResults.findings?.dns?.ns?.join(', ') || 'N/A'}</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4">
                <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">SRV Records</h5>
                <div className="space-y-2 text-sm">
                  {(scanResults.findings?.dns?.srv || []).map((srv, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{srv.service}:</span>
                      <span className="font-mono text-gray-900 dark:text-gray-100">{srv.target}:{srv.port}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Network Performance */}
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 border border-orange-200">
              <h5 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Network Performance Metrics</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{scanResults.findings?.network?.latency || 'N/A'}</div>
                  <div className="text-gray-600 dark:text-gray-400">Latency</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{scanResults.findings?.network?.bandwidth || 'N/A'}</div>
                  <div className="text-gray-600 dark:text-gray-400">Bandwidth</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-600">{scanResults.findings?.network?.packetLoss || 'N/A'}</div>
                  <div className="text-gray-600 dark:text-gray-400">Packet Loss</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{scanResults.findings?.network?.jitter || 'N/A'}</div>
                  <div className="text-gray-600 dark:text-gray-400">Jitter</div>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Ports & Services Analysis */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Advanced Ports & Services Analysis</span>
            </h4>
            
            {/* Port Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="text-2xl font-bold text-red-600">
                  {(scanResults.findings?.ports || []).filter(p => p.riskLevel === 'High').length}
                </div>
                <div className="text-sm text-red-700">High Risk Ports</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">
                  {(scanResults.findings?.ports || []).filter(p => p.riskLevel === 'Medium').length}
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
          </div>

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

export default ServerScanning
