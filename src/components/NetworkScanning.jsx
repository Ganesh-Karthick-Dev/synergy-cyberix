import { useState, useEffect } from 'react'
import { useScanning } from '../context/ScanningContext'

function NetworkScanning() {
  const [target, setTarget] = useState('')
  const [scanResults, setScanResults] = useState(null)
  const [kaliStatus, setKaliStatus] = useState('Checking...')
  const [scanStats, setScanStats] = useState({
    openPorts: 0,
    closedPorts: 0,
    filteredPorts: 0,
    services: 0
  })

  const { scanStatus, scanProgress, startNetworkScan, abortScan } = useScanning()

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

    setScanResults(null)
    setScanStats({ openPorts: 0, closedPorts: 0, filteredPorts: 0, services: 0 })

    try {
      await startNetworkScan(target)
    } catch (error) {
      console.error('Scan start error:', error)
    }
  }

  // Listen for scan completion
  useEffect(() => {
    if (window.cyberGuard) {
      window.cyberGuard.onNetworkScanDone((result) => {
        try {
          console.log('Network scan completed:', result)
          console.log('Result type:', typeof result)
          console.log('Result keys:', result ? Object.keys(result) : 'No result')
          
          if (result && result.success) {
            console.log('Setting scan results:', result.result)
            setScanResults(result.result)
          } else if (result && result.result) {
            // Direct result object
            console.log('Setting direct scan results:', result.result)
            setScanResults(result.result)
          } else {
            console.warn('Invalid scan result:', result)
            setScanResults({ 
              summary: 'Scan completed but no detailed results available',
              error: result?.error || 'Unknown error'
            })
          }
        } catch (error) {
          console.error('Error handling network scan completion:', error)
          setScanResults({ 
            summary: 'Scan completed with errors',
            error: error.message 
          })
        }
      })
    }
  }, [])

  // Parse scan statistics from progress messages
  useEffect(() => {
    scanProgress.forEach(update => {
      if (update.message.includes('open port')) {
        setScanStats(prev => ({ ...prev, openPorts: prev.openPorts + 1 }))
      }
      if (update.message.includes('closed port')) {
        setScanStats(prev => ({ ...prev, closedPorts: prev.closedPorts + 1 }))
      }
      if (update.message.includes('filtered port')) {
        setScanStats(prev => ({ ...prev, filteredPorts: prev.filteredPorts + 1 }))
      }
      if (update.message.includes('service detected')) {
        setScanStats(prev => ({ ...prev, services: prev.services + 1 }))
      }
    })
  }, [scanProgress])

  const downloadResults = (format = 'json') => {
    if (!scanResults) {
      alert('No scan results available to download')
      return
    }
    
    console.log('Downloading format:', format)
    console.log('Scan results:', scanResults)
    
    let dataStr, mimeType, extension, filename
    
    try {
      if (format === 'json') {
        dataStr = JSON.stringify(scanResults, null, 2)
        mimeType = 'application/json'
        extension = 'json'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.json`
      } else if (format === 'csv') {
        // Convert to Excel-compatible CSV format
        dataStr = convertToExcelCSV(scanResults)
        mimeType = 'text/csv;charset=utf-8'
        extension = 'csv'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.csv`
      } else if (format === 'txt') {
        // Convert to professional text format
        dataStr = convertToProfessionalText(scanResults)
        mimeType = 'text/plain;charset=utf-8'
        extension = 'txt'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.txt`
      } else if (format === 'pdf') {
        // Convert to PDF format (as text file for now)
        dataStr = convertToPDF(scanResults)
        mimeType = 'text/plain;charset=utf-8'
        extension = 'txt'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}-report.txt`
      }
      
      console.log('Generated data length:', dataStr.length)
      console.log('MIME type:', mimeType)
      console.log('Filename:', filename)
      
      // Create blob with proper encoding
      const dataBlob = new Blob([dataStr], { type: mimeType })
      
      // Create download link
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'
      
      // Add to DOM, click, and remove
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      setTimeout(() => {
        URL.revokeObjectURL(url)
      }, 100)
      
      // Show success message
      alert(`✅ Download started: ${filename}`)
    } catch (error) {
      console.error('Download error:', error)
      alert(`❌ Download failed: ${error.message}`)
    }
  }

  const convertToExcelCSV = (data) => {
    if (!data) return 'No scan data available'
    
    console.log('Converting to Excel CSV:', data)
    
    let csv = ''
    
    // Header Section
    csv += 'Network Security Scan Report\n'
    csv += `Scan Date,${new Date().toLocaleString()}\n`
    csv += `Target,${scanStatus.target || 'Unknown'}\n`
    csv += `Scan Type,Network Analysis\n`
    csv += `Status,${data.summary || 'Completed'}\n\n`
    
    // Executive Summary
    if (data.summary && typeof data.summary === 'object') {
      csv += 'Executive Summary\n'
      csv += 'Metric,Value\n'
      csv += `Total Files Generated,${data.summary.totalFiles || 0}\n`
      csv += `Service Detection,${data.summary.bannerGrabbing || 'N/A'}\n`
      csv += `OS Detection,${data.summary.osDetection || 'N/A'}\n`
      csv += `MAC Detection,${data.summary.macDetection || 'N/A'}\n`
      csv += `Total Ports Scanned,${data.summary.totalPortsScanned || 0}\n`
      csv += `Open Ports,${data.summary.openPorts || 0}\n`
      csv += `Closed Ports,${data.summary.closedPorts || 0}\n`
      csv += `Filtered Ports,${data.summary.filteredPorts || 0}\n\n`
    }
    
    // OS Detection Section
    if (data.findings?.osDetection) {
      csv += 'Operating System Detection\n'
      csv += 'OS Family,OS Version,Confidence,Details\n'
      csv += `"${data.findings.osDetection.family || 'Unknown'}","${data.findings.osDetection.version || 'Unknown'}",${data.findings.osDetection.confidence || 0},"${(data.findings.osDetection.details || 'N/A').replace(/"/g, '""')}"\n\n`
    }
    
    // Scan Statistics
    if (data.findings?.scanStatistics) {
      csv += 'Scan Statistics & Timing\n'
      csv += 'Metric,Value\n'
      csv += `Duration,"${data.findings.scanStatistics.duration} seconds"\n`
      csv += `Packets Sent,${data.findings.scanStatistics.packetsSent}\n`
      csv += `Packets Received,${data.findings.scanStatistics.packetsReceived}\n`
      csv += `Scan Start,"${new Date(data.findings.scanStatistics.startTime).toLocaleString()}"\n`
      csv += `Scan End,"${new Date(data.findings.scanStatistics.endTime).toLocaleString()}"\n\n`
    }
    
    // Port Scan Results
    if (data.findings?.allPorts && data.findings.allPorts.length > 0) {
      csv += 'Port Scan Results\n'
      csv += 'Port,Status,Service,Banner\n'
      data.findings.allPorts.forEach(port => {
        const banner = (port.banner || 'N/A').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ')
        csv += `${port.port},"${port.status.toUpperCase()}","${port.service}","${banner}"\n`
      })
      csv += '\n'
    }
    
    // Recommendations Section
    if (data.recommendations && data.recommendations.length > 0) {
      csv += 'Security Recommendations\n'
      csv += 'Priority,Recommendation\n'
      data.recommendations.forEach((rec, index) => {
        const cleanRec = rec.replace(/"/g, '""')
        csv += `High,"${cleanRec}"\n`
      })
      csv += '\n'
    }
    
    // Summary
    csv += 'Scan Summary\n'
    csv += `Summary,"${(data.summary || 'Network analysis completed successfully.').replace(/"/g, '""')}"\n`
    
    console.log('Generated CSV length:', csv.length)
    return csv
  }

  const convertToProfessionalText = (data) => {
    if (!data) return 'No scan results available'
    
    let text = ``
    text += `╔══════════════════════════════════════════════════════════════════════════════╗\n`
    text += `║                           NETWORK SECURITY SCAN REPORT                      ║\n`
    text += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`
    
    text += `📊 SCAN OVERVIEW\n`
    text += `═══════════════════════════════════════════════════════════════════════════════\n`
    text += `Scan Date:     ${new Date().toLocaleString()}\n`
    text += `Target:        ${scanStatus.target}\n`
    text += `Scan Type:     Network Security Analysis\n`
    text += `Status:        ${data.summary || 'Completed'}\n\n`
    
    // OS Detection Section
    if (data.osDetection) {
      text += `🖥️  OPERATING SYSTEM DETECTION\n`
      text += `═══════════════════════════════════════════════════════════════════════════════\n`
      text += `OS Version:    ${data.osDetection.version || 'Unknown'}\n`
      text += `Confidence:    ${data.osDetection.confidence || 0}%\n`
      text += `Details:       ${data.osDetection.details || 'N/A'}\n\n`
    }
    
    // Scan Statistics
    if (data.scanStats) {
      text += `📈 SCAN STATISTICS\n`
      text += `═══════════════════════════════════════════════════════════════════════════════\n`
      text += `Open Ports:        ${data.scanStats.openPorts || 0}\n`
      text += `Closed Ports:      ${data.scanStats.closedPorts || 0}\n`
      text += `Filtered Ports:    ${data.scanStats.filteredPorts || 0}\n`
      text += `Services Detected:  ${data.scanStats.services || 0}\n\n`
    }
    
    // Security Recommendations
    if (data.recommendations && data.recommendations.length > 0) {
      text += `🔒 SECURITY RECOMMENDATIONS\n`
      text += `═══════════════════════════════════════════════════════════════════════════════\n`
      data.recommendations.forEach((rec, index) => {
        text += `${index + 1}. ${rec}\n`
      })
      text += `\n`
    }
    
    text += `═══════════════════════════════════════════════════════════════════════════════\n`
    text += `Report Generated by Cyberix Security Scanner\n`
    text += `Generated on: ${new Date().toLocaleString()}\n`
    
    return text
  }

  const convertToPDF = (data) => {
    console.log('Converting to PDF:', data)
    
    // Create a comprehensive PDF content with all scan data
    let pdfContent = ''
    
    // Header
    pdfContent += '╔══════════════════════════════════════════════════════════════════════════════╗\n'
    pdfContent += '║                           NETWORK SECURITY SCAN REPORT                      ║\n'
    pdfContent += '║                        Generated by Cyberix Security Scanner                ║\n'
    pdfContent += '╚══════════════════════════════════════════════════════════════════════════════╝\n\n'
    
    // Scan Overview
    pdfContent += '📊 SCAN OVERVIEW\n'
    pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
    pdfContent += `Scan Date:     ${new Date().toLocaleString()}\n`
    pdfContent += `Target:        ${scanStatus.target || 'Unknown'}\n`
    pdfContent += `Scan Type:     Network Security Analysis\n`
    pdfContent += `Status:        ${data.summary || 'Completed'}\n\n`

    // Executive Summary
    if (data.summary && typeof data.summary === 'object') {
      pdfContent += '📋 EXECUTIVE SUMMARY\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += `Total Files Generated: ${data.summary.totalFiles || 0}\n`
      pdfContent += `Service Detection:     ${data.summary.bannerGrabbing || 'N/A'}\n`
      pdfContent += `OS Detection:          ${data.summary.osDetection || 'N/A'}\n`
      pdfContent += `MAC Detection:         ${data.summary.macDetection || 'N/A'}\n`
      pdfContent += `Total Ports Scanned:   ${data.summary.totalPortsScanned || 0}\n`
      pdfContent += `Open Ports:           ${data.summary.openPorts || 0}\n`
      pdfContent += `Closed Ports:         ${data.summary.closedPorts || 0}\n`
      pdfContent += `Filtered Ports:       ${data.summary.filteredPorts || 0}\n\n`
    }

    // OS Detection Section
    if (data.findings?.osDetection) {
      pdfContent += '🖥️  OPERATING SYSTEM DETECTION\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += `OS Family:     ${data.findings.osDetection.family || 'Unknown'}\n`
      pdfContent += `OS Version:     ${data.findings.osDetection.version || 'Unknown'}\n`
      pdfContent += `Confidence:    ${data.findings.osDetection.confidence || 0}%\n`
      pdfContent += `Details:       ${data.findings.osDetection.details || 'N/A'}\n\n`
    }

    // Scan Statistics
    if (data.findings?.scanStatistics) {
      pdfContent += '📈 SCAN STATISTICS & TIMING\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += `Duration:          ${data.findings.scanStatistics.duration} seconds\n`
      pdfContent += `Packets Sent:      ${data.findings.scanStatistics.packetsSent}\n`
      pdfContent += `Packets Received:  ${data.findings.scanStatistics.packetsReceived}\n`
      pdfContent += `Scan Start:        ${new Date(data.findings.scanStatistics.startTime).toLocaleString()}\n`
      pdfContent += `Scan End:          ${new Date(data.findings.scanStatistics.endTime).toLocaleString()}\n\n`
    }

    // Port Scan Results
    if (data.findings?.allPorts && data.findings.allPorts.length > 0) {
      pdfContent += '🔍 PORT SCAN RESULTS\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += 'Port    Status     Service    Banner/Details\n'
      pdfContent += '───────────────────────────────────────────────────────────────────────────────\n'
      
      data.findings.allPorts.slice(0, 50).forEach(port => {
        const banner = (port.banner || 'N/A').replace(/\n/g, ' ').replace(/\r/g, ' ')
        pdfContent += `${port.port.toString().padEnd(8)} ${port.status.toUpperCase().padEnd(10)} ${port.service.padEnd(10)} ${banner}\n`
      })
      
      if (data.findings.allPorts.length > 50) {
        pdfContent += `\n... and ${data.findings.allPorts.length - 50} more ports\n`
      }
      pdfContent += '\n'
    }

    // Security Recommendations
    if (data.recommendations && data.recommendations.length > 0) {
      pdfContent += '🔒 SECURITY RECOMMENDATIONS\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += 'Recommended Actions:\n\n'
      data.recommendations.forEach((rec, index) => {
        pdfContent += `${index + 1}. ${rec}\n`
      })
      pdfContent += '\n'
    }

    // Scan Summary
    pdfContent += '📋 SCAN SUMMARY\n'
    pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
    pdfContent += `${data.summary || 'Network analysis completed successfully.'}\n\n`
    
    pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
    pdfContent += 'Report Generated by Cyberix Security Scanner\n'
    pdfContent += `Generated on: ${new Date().toLocaleString()}\n`

    console.log('Generated PDF content length:', pdfContent.length)
    return pdfContent
  }

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg border border-gray-200 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Network Scanning</h2>
              <p className="text-blue-100">Professional network analysis and port discovery</p>
            </div>
          </div>
         
        </div>
      </div>


      {/* Scan Configuration */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900">Scan Configuration</h3>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Target IP Address or Hostname
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g., 192.168.1.1, example.com, or scanme.nmap.org"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                disabled={scanStatus.isScanning}
              />
            </div>
          </div>
          
          {/* Scan Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-medium text-blue-900">Port Discovery</h4>
              </div>
              <p className="text-sm text-blue-700">Comprehensive port scanning with service detection</p>
            </div>
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h4 className="font-medium text-green-900">Service Detection</h4>
              </div>
              <p className="text-sm text-green-700">Identifies running services and versions</p>
            </div>
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <h4 className="font-medium text-purple-900">OS Detection</h4>
              </div>
              <p className="text-sm text-purple-700">Advanced OS fingerprinting and analysis</p>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={handleStartScan}
              disabled={scanStatus.isScanning || !target.trim()}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2"
            >
              {scanStatus.isScanning ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Scanning...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-5-8V6a2 2 0 012-2h2a2 2 0 012 2v2M7 7h10a2 2 0 012 2v8a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2z" />
                  </svg>
                  <span>Start Network Scan</span>
                </>
              )}
            </button>
            
            {scanStatus.isScanning && (
              <button
                onClick={abortScan}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center space-x-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Abort Scan</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Scan Statistics */}
      {scanStatus.isScanning && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Scan Statistics</span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{scanStats.openPorts}</div>
              <div className="text-sm text-green-700">Open Ports</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">{scanStats.closedPorts}</div>
              <div className="text-sm text-red-700">Closed Ports</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-2xl font-bold text-yellow-600">{scanStats.filteredPorts}</div>
              <div className="text-sm text-yellow-700">Filtered</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{scanStats.services}</div>
              <div className="text-sm text-blue-700">Services</div>
            </div>
          </div>
        </div>
      )}

      {/* Scan Progress */}
      {scanProgress.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Scan Progress</span>
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
            {scanProgress.map((entry, index) => (
              <div key={index} className={`mb-1 flex items-start space-x-2 ${
                entry.stage === 'error' ? 'text-red-400' :
                entry.stage === 'warning' ? 'text-yellow-400' :
                entry.stage === 'installing' ? 'text-blue-400' :
                'text-green-400'
              }`}>
                <span className="text-gray-500 text-xs mt-0.5">[{new Date().toLocaleTimeString()}]</span>
                <span className="font-medium">{entry.stage.toUpperCase()}:</span>
                <span>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scan Results */}
      {scanResults && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Scan Results</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadResults('json')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>JSON</span>
              </button>
              <button
                onClick={() => downloadResults('csv')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Excel</span>
              </button>
              <button
                onClick={() => downloadResults('txt')}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>TXT</span>
              </button>
              <button
                onClick={() => downloadResults('pdf')}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <span>PDF</span>
              </button>
            </div>
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
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 font-medium">Network scan completed successfully</p>
                </div>
                <p className="text-green-700 text-sm">
                  Analysis completed for target: <span className="font-mono font-medium">{target}</span>
                </p>
              </div>
              
              {scanResults.summary && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2 flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Summary</span>
                  </h4>
                  <p className="text-blue-800">{scanResults.summary}</p>
                </div>
              )}

              {/* Executive Summary */}
              {scanResults.summary && (
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl shadow-lg border border-gray-200 p-6 text-white mb-6">
                  <h3 className="text-2xl font-bold mb-4 flex items-center space-x-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Executive Summary</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white/20 rounded-lg p-4">
                      <div className="text-2xl font-bold">{scanResults.summary.totalFiles || 0}</div>
                      <div className="text-sm opacity-90">Total Files Generated</div>
                    </div>
                    <div className="bg-white/20 rounded-lg p-4">
                      <div className="text-lg font-semibold">{scanResults.summary.bannerGrabbing || 'N/A'}</div>
                      <div className="text-sm opacity-90">Service Detection</div>
                    </div>
                    <div className="bg-white/20 rounded-lg p-4">
                      <div className="text-lg font-semibold">{scanResults.summary.osDetection || 'N/A'}</div>
                      <div className="text-sm opacity-90">OS Detection</div>
                    </div>
                    <div className="bg-white/20 rounded-lg p-4">
                      <div className="text-lg font-semibold">{scanResults.summary.macDetection || 'N/A'}</div>
                      <div className="text-sm opacity-90">MAC Detection</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Port Scan Results */}
              {scanResults.findings && scanResults.findings.allPorts && (
                <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Network Findings - Port Scan Results</span>
                  </h3>
                  
                  {/* Port Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-green-500">
                      <div className="text-2xl font-bold text-gray-900">{scanResults.summary?.totalPortsScanned || 0}</div>
                      <div className="text-sm text-gray-600">Total Ports Scanned</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-green-500">
                      <div className="text-2xl font-bold text-green-600">{scanResults.summary?.openPorts || 0}</div>
                      <div className="text-sm text-gray-600">Open Ports</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-red-500">
                      <div className="text-2xl font-bold text-red-600">{scanResults.summary?.closedPorts || 0}</div>
                      <div className="text-sm text-gray-600">Closed Ports</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-yellow-500">
                      <div className="text-2xl font-bold text-yellow-600">{scanResults.summary?.filteredPorts || 0}</div>
                      <div className="text-sm text-gray-600">Filtered Ports</div>
                    </div>
                  </div>

                  {/* Port Details Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Port</th>
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Status</th>
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Service</th>
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Banner/Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scanResults.findings.allPorts.slice(0, 20).map((port, index) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="border border-gray-300 px-4 py-2 font-mono">{port.port}</td>
                            <td className="border border-gray-300 px-4 py-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                port.status === 'open' ? 'bg-green-100 text-green-800' :
                                port.status === 'closed' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {port.status.toUpperCase()}
                              </span>
                            </td>
                            <td className="border border-gray-300 px-4 py-2">{port.service}</td>
                            <td className="border border-gray-300 px-4 py-2 text-sm font-mono">{port.banner || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {scanResults.findings.allPorts.length > 20 && (
                      <p className="text-sm text-gray-500 mt-2 text-center">
                        Showing first 20 ports of {scanResults.findings.allPorts.length} total
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Operating System Detection */}
              {scanResults.findings?.osDetection && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-6 border border-blue-200 mb-6">
                  <h3 className="text-lg font-semibold text-blue-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Operating System Detection</span>
                  </h3>
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">OS Family:</span>
                      <span className="text-blue-600 font-semibold">{scanResults.findings.osDetection.family || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">OS Version:</span>
                      <span className="text-blue-600 font-semibold">{scanResults.findings.osDetection.version || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Confidence:</span>
                      <span className="text-green-600 font-semibold">{scanResults.findings.osDetection.confidence || 0}%</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 block mb-2">Details:</span>
                      <span className="text-gray-600">{scanResults.findings.osDetection.details || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Scan Statistics & Timing */}
              {scanResults.findings?.scanStatistics && (
                <div className="bg-gradient-to-br from-yellow-50 to-orange-100 rounded-xl p-6 border border-yellow-200 mb-6">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Scan Statistics & Timing</span>
                  </h3>
                  <div className="bg-white rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Scan Duration:</span>
                      <span className="text-yellow-600 font-semibold">{scanResults.findings.scanStatistics.duration} seconds</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Packets Sent:</span>
                      <span className="text-yellow-600 font-semibold">{scanResults.findings.scanStatistics.packetsSent}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Packets Received:</span>
                      <span className="text-yellow-600 font-semibold">{scanResults.findings.scanStatistics.packetsReceived}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Scan Start:</span>
                      <span className="text-gray-600">{new Date(scanResults.findings.scanStatistics.startTime).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Scan End:</span>
                      <span className="text-gray-600">{new Date(scanResults.findings.scanStatistics.endTime).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Recommendations */}
              {scanResults.recommendations && scanResults.recommendations.length > 0 && (
                <div className="bg-gradient-to-br from-yellow-50 to-orange-100 rounded-xl p-6 border border-yellow-200 mb-6">
                  <h3 className="text-lg font-semibold text-yellow-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 19.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>Security Recommendations</span>
                  </h3>
                  <div className="bg-white rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-800 mb-3">Recommended Actions</h4>
                    <div className="space-y-3">
                      {scanResults.recommendations.map((rec, index) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className="flex-shrink-0 w-6 h-6 bg-yellow-100 rounded-full flex items-center justify-center">
                            <span className="text-yellow-600 font-semibold text-sm">{index + 1}</span>
                          </div>
                          <p className="text-gray-700">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Debug Information */}
              {process.env.NODE_ENV === 'development' && (
                <div className="bg-gray-100 rounded-xl p-4 border border-gray-300">
                  <h4 className="font-medium text-gray-900 mb-2">Debug Info</h4>
                  <div className="text-xs text-gray-600">
                    <p>Scan Results Keys: {scanResults ? Object.keys(scanResults).join(', ') : 'No results'}</p>
                    <p>Summary: {scanResults.summary ? 'Present' : 'Missing'}</p>
                    <p>Findings: {scanResults.findings ? 'Present' : 'Missing'}</p>
                    <p>Ports: {scanResults.findings?.allPorts ? scanResults.findings.allPorts.length : 0}</p>
                    <p>Recommendations: {scanResults.recommendations ? scanResults.recommendations.length : 0}</p>
                  </div>
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