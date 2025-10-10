import { useState, useEffect } from 'react'
import { useScanning } from '../context/ScanningContext'
import scanLogger from '../utils/scanLogger'

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
    setIsStarting(true)
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
    
    // Log scan start
    const startTime = new Date()
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
      await startNetworkScan(target)
    } catch (error) {
      console.error('Scan start error:', error)
      alert('Failed to start network scan: ' + (error?.message || String(error)))
      
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
    } finally {
      setIsStarting(false)
    }
  }

  // Listen for scan completion
  useEffect(() => {
    if (window.cyberGuard) {
      window.cyberGuard.onNetworkScanDone(async (result) => {
        try {
          console.log('Network scan completed:', result)
          console.log('Result type:', typeof result)
          console.log('Result keys:', result ? Object.keys(result) : 'No result')
          
          let scanData = null
          let isSuccess = false
          
          if (result && result.success && result.result) {
            // Handle new backend shape: { jsonReport, htmlReport, pdfReport, reportData }
            const r = result.result
            if (r && r.reportData) {
              console.log('Merging reportData with file paths for UI rendering')
              scanData = { ...r.reportData, jsonReport: r.jsonReport, htmlReport: r.htmlReport, pdfReport: r.pdfReport }
              setScanResults(scanData)
              isSuccess = true
            } else {
              console.log('Setting scan results from success:', r)
              scanData = r
              setScanResults(scanData)
              isSuccess = true
            }
          } else if (result && result.result) {
            // Direct result object
            const r = result.result
            if (r && r.reportData) {
              scanData = { ...r.reportData, jsonReport: r.jsonReport, htmlReport: r.htmlReport, pdfReport: r.pdfReport }
              setScanResults(scanData)
              isSuccess = true
            } else {
              console.log('Setting direct scan results:', r)
              scanData = r
              setScanResults(scanData)
              isSuccess = true
            }
          } else if (result && !result.success && !result.result) {
            // Handle case where result is the actual data directly
            if (result.reportData) {
              scanData = { ...result.reportData, jsonReport: result.jsonReport, htmlReport: result.htmlReport, pdfReport: result.pdfReport }
              setScanResults(scanData)
              isSuccess = true
            } else {
              console.log('Setting result as direct data:', result)
              scanData = result
              setScanResults(scanData)
              isSuccess = true
            }
          } else if (result && result.success && !result.result) {
            // Handle case where success is true but no result property
            if (result.reportData) {
              scanData = { ...result.reportData, jsonReport: result.jsonReport, htmlReport: result.htmlReport, pdfReport: result.pdfReport }
              setScanResults(scanData)
              isSuccess = true
            } else {
              console.log('Setting result as success data:', result)
              scanData = result
              setScanResults(scanData)
              isSuccess = true
            }
          } else {
            console.warn('Invalid scan result:', result)
            setScanResults({ 
              summary: 'Scan completed but no detailed results available',
              error: result?.error || 'Unknown error'
            })
            isSuccess = false
          }
          
          // Log scan completion
          const endTime = new Date()
          const startTime = new Date(endTime.getTime() - (result?.duration || 120000)) // Default 2 min
          const openPorts = scanData?.ports?.filter(p => p.state === 'open').length || 0
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
          setScanResults({ 
            summary: 'Scan completed with errors',
            error: error.message 
          })
          
          // Log scan error
          const endTime = new Date()
          await scanLogger.logScan({
            scanType: 'network',
            scanName: 'Network Scan',
            target: target.trim(),
            status: 'failed',
            startTime: new Date(endTime.getTime() - 120000).toISOString(),
            endTime: endTime.toISOString(),
            duration: 120000,
            result: `Error processing results: ${error.message}`
          })
        }
      })
    }
  }, [target])

  // Update scan statistics from actual scan results
  useEffect(() => {
    console.log('Updating scan statistics, scanResults:', scanResults)
    console.log('scanResults.scanStats:', scanResults?.scanStats)
    console.log('scanResults.summary:', scanResults?.summary)
    console.log('scanResults.findings:', scanResults?.findings)
    
    if (scanResults && scanResults.scanStats) {
      // Priority 1: Use scanStats directly from results
      console.log('Using scanStats directly:', scanResults.scanStats)
      setScanStats({
        openPorts: scanResults.scanStats.openPorts || 0,
        closedPorts: scanResults.scanStats.closedPorts || 0,
        filteredPorts: scanResults.scanStats.filteredPorts || 0,
        services: scanResults.scanStats.openPorts || 0 // Use open ports as services
      })
    } else if (scanResults && scanResults.summary && typeof scanResults.summary === 'object') {
      // Priority 2: Use summary object
      console.log('Using summary object for stats:', scanResults.summary)
      setScanStats({
        openPorts: scanResults.summary.openPorts || 0,
        closedPorts: scanResults.summary.closedPorts || 0,
        filteredPorts: scanResults.summary.filteredPorts || 0,
        services: scanResults.summary.totalFiles || 0
      })
    } else if (scanResults && scanResults.findings && scanResults.findings.allPorts) {
      // Priority 3: Calculate from port data
      console.log('Using findings.allPorts for stats:', scanResults.findings.allPorts)
      const allPorts = scanResults.findings.allPorts
      const openPorts = allPorts.filter(port => port.status === 'open').length
      const closedPorts = allPorts.filter(port => port.status === 'closed').length
      const filteredPorts = allPorts.filter(port => port.status === 'filtered').length
      
      setScanStats({
        openPorts,
        closedPorts,
        filteredPorts,
        services: openPorts
      })
    } else if (scanResults && scanResults.serviceDetections) {
      // Priority 4: Use service detections to estimate port counts
      console.log('Using serviceDetections for stats:', scanResults.serviceDetections)
      const openPorts = scanResults.serviceDetections.length
      setScanStats({
        openPorts,
        closedPorts: 0,
        filteredPorts: 0,
        services: openPorts
      })
    } else {
      // Fallback: parse from progress messages (old method)
      console.log('Using progress messages for stats')
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
    }
  }, [scanResults, scanProgress])

  // Derive critical/high issues with explanations and remediation
  useEffect(() => {
    if (!scanResults) { setRiskIssues([]); return }
    const issues = []

    const addIssue = (sev, title, why, fix, ref = null) => {
      issues.push({ severity: sev, title, why, fix, ref })
    }

    // From explicit vulnerabilities if present
    if (Array.isArray(scanResults.vulnerabilities)) {
      scanResults.vulnerabilities.forEach(v => {
        const sev = (v.severity || '').toLowerCase()
        if (sev === 'critical' || sev === 'high') {
          addIssue(
            sev,
            v.type || 'Vulnerability',
            v.description || 'This finding has been flagged as high risk.',
            v.remediation || 'Apply vendor patches and follow best-practice hardening.',
            v.references && v.references[0] ? v.references[0] : null
          )
        }
      })
    }

    // Heuristics from open ports
    const open = scanResults?.findings?.allPorts || []
    const openOnly = open.filter(p => p.status === 'open')
    const isOpen = (port) => openOnly.some(p => Number(p.port) === Number(port))

    if (isOpen(22)) {
      addIssue(
        'high',
        'SSH exposed on the internet (port 22)',
        'Public SSH increases attack surface (credential stuffing, brute force, key theft).',
        'Restrict SSH to VPN or specific IPs, disable password login, enable key-based auth, and consider moving to a non-default port.',
      )
    }
    if (isOpen(3306)) {
      addIssue(
        'critical',
        'MySQL exposed (port 3306)',
        'Databases accessible from the internet can lead to data exfiltration and RCE via auth bypass or weak creds.',
        'Bind MySQL to localhost/private network, enforce TLS and strong auth, and restrict with firewall/security groups.'
      )
    }
    if (isOpen(5432)) {
      addIssue(
        'critical',
        'PostgreSQL exposed (port 5432)',
        'Internet-exposed databases are a common breach vector.',
        'Restrict access to trusted networks, require TLS and strong auth, disable unused roles, and monitor access logs.'
      )
    }
    if (isOpen(6379)) {
      addIssue(
        'critical',
        'Redis exposed without authentication (port 6379)',
        'Default Redis often runs without auth; exposure can allow arbitrary data manipulation and RCE.',
        'Enable requirepass or ACLs, bind to localhost/VPC, and place behind a firewall or proxy.'
      )
    }
    if (isOpen(80) && !isOpen(443)) {
      addIssue(
        'high',
        'HTTP without HTTPS',
        'Unencrypted traffic allows credential/session interception.',
        'Enable HTTPS with modern TLS, redirect HTTP to HTTPS, and set HSTS.'
      )
    }

    setRiskIssues(issues)
  }, [scanResults])

  const downloadResults = async (format = 'json') => {
    if (!scanResults) {
      alert('No scan results available to download')
      return
    }
    
    console.log('Downloading format:', format)
    console.log('Scan results:', scanResults)
    
    try {
      // Check if we have actual generated report files from the backend
      if (scanResults.jsonReport && format === 'json') {
        // Use the actual generated JSON report
        await downloadGeneratedReport(scanResults.jsonReport, 'JSON')
        return
      } else if (scanResults.htmlReport && format === 'html') {
        // Use the actual generated HTML report
        await downloadGeneratedReport(scanResults.htmlReport, 'HTML')
        return
      } else if (scanResults.pdfReport && format === 'pdf') {
        // Use the actual generated PDF report
        await downloadGeneratedReport(scanResults.pdfReport, 'PDF')
        return
      }
      
      // Fallback: Generate reports from scan data if backend reports are not available
      let dataStr, mimeType, extension, filename
      
      if (format === 'json') {
        dataStr = JSON.stringify(scanResults, null, 2)
        mimeType = 'application/json'
        extension = 'json'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.json`
      } else if (format === 'txt') {
        // Convert to professional text format
        dataStr = convertToProfessionalText(scanResults)
        mimeType = 'text/plain;charset=utf-8'
        extension = 'txt'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.txt`
      } else if (format === 'html') {
        // Generate HTML report from scan data
        dataStr = generateHTMLFromScanData(scanResults)
        mimeType = 'text/html;charset=utf-8'
        extension = 'html'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.html`
      } else if (format === 'pdf') {
        // Generate proper PDF content
        dataStr = convertToPDF(scanResults)
        mimeType = 'application/pdf'
        extension = 'pdf'
        filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.pdf`
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

  const openPortDetails = (portRow) => {
    // Enrich with service detection entry if available
    let serviceInfo = null
    if (scanResults?.serviceDetections && portRow?.port) {
      serviceInfo = scanResults.serviceDetections.find(s => Number(s.port) === Number(portRow.port)) || null
    }
    setSelectedPort({ ...portRow, serviceInfo })
    setShowDetails(true)
  }

  const closePortDetails = () => {
    setShowDetails(false)
    setSelectedPort(null)
  }

  // Helper function to download generated reports from backend
  const downloadGeneratedReport = async (filePath, format) => {
    try {
      if (window.cyberGuard && window.cyberGuard.saveReportAs) {
        const filename = `network-scan-${target}-${new Date().toISOString().split('T')[0]}.${format.toLowerCase()}`
        await window.cyberGuard.saveReportAs(filePath, filename)
        alert(`✅ ${format} report downloaded successfully`)
      } else {
        throw new Error('Report download system not available')
      }
    } catch (error) {
      console.error(`Error downloading ${format} report:`, error)
      alert(`❌ Failed to download ${format} report: ${error.message}`)
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

  // Generate HTML report from scan data
  const generateHTMLFromScanData = (data) => {
    if (!data) return '<html><body><h1>No scan data available</h1></body></html>'
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Network Analysis Report - ${scanStatus.target || 'Unknown'}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #007acc; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #007acc; margin: 0; }
        .header p { color: #666; margin: 5px 0; }
        .section { margin: 30px 0; }
        .section h2 { color: #333; border-left: 4px solid #007acc; padding-left: 15px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .summary-card { background: #f8f9fa; padding: 15px; border-radius: 6px; border-left: 4px solid #28a745; }
        .summary-card h3 { margin: 0 0 10px 0; color: #333; }
        .summary-card p { margin: 0; color: #666; }
        .findings-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .findings-table th, .findings-table td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        .findings-table th { background: #f8f9fa; font-weight: bold; }
        .status-open { color: #28a745; font-weight: bold; }
        .status-closed { color: #dc3545; font-weight: bold; }
        .status-filtered { color: #ffc107; font-weight: bold; }
        .recommendations { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; }
        .recommendations h3 { margin-top: 0; color: #856404; }
        .recommendations ul { margin: 0; }
        .recommendations li { margin: 5px 0; }
        .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌐 Network Analysis Report</h1>
            <p><strong>Target:</strong> ${scanStatus.target || 'Unknown'}</p>
            <p><strong>Scan Date:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Scan Type:</strong> Network Analysis</p>
        </div>
        
        <div class="section">
            <h2>📊 Executive Summary</h2>
            ${data.summary && typeof data.summary === 'object' ? `
            <div class="summary-grid">
                <div class="summary-card">
                    <h3>Total Files Generated</h3>
                    <p>${data.summary.totalFiles || 0}</p>
                </div>
                <div class="summary-card">
                    <h3>Service Detection</h3>
                    <p>${data.summary.bannerGrabbing || 'N/A'}</p>
                </div>
                <div class="summary-card">
                    <h3>OS Detection</h3>
                    <p>${data.summary.osDetection || 'N/A'}</p>
                </div>
                <div class="summary-card">
                    <h3>MAC Detection</h3>
                    <p>${data.summary.macDetection || 'N/A'}</p>
                </div>
                <div class="summary-card">
                    <h3>Total Ports Scanned</h3>
                    <p>${data.summary.totalPortsScanned || 0}</p>
                </div>
                <div class="summary-card">
                    <h3>Open Ports</h3>
                    <p>${data.summary.openPorts || 0}</p>
                </div>
            </div>
            ` : `
            <div class="summary-card">
                <h3>Scan Status</h3>
                <p>${data.summaryText || data.summary || 'Completed'}</p>
            </div>
            `}
        </div>
        
        ${data.findings?.allPorts && data.findings.allPorts.length > 0 ? `
        <div class="section">
            <h2>🔍 Network Findings</h2>
            <table class="findings-table">
                <thead>
                    <tr>
                        <th>Port</th>
                        <th>Status</th>
                        <th>Service</th>
                        <th>Banner/Details</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.findings.allPorts.map(port => `
                    <tr>
                        <td>${port.port}</td>
                        <td><span class="status-${port.status}">${port.status.toUpperCase()}</span></td>
                        <td>${port.service || 'Unknown'}</td>
                        <td>${port.banner || (port.status === 'open' ? 'No banner received' : 'N/A')}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}
        
        ${data.findings?.osDetection ? `
        <div class="section">
            <h2>🖥️ Operating System Detection</h2>
            <div style="background: #e8f4fd; padding: 15px; border-radius: 6px; border-left: 4px solid #007acc;">
                <p><strong>OS Family:</strong> ${data.findings.osDetection.family}</p>
                <p><strong>OS Version:</strong> ${data.findings.osDetection.version}</p>
                <p><strong>Confidence:</strong> ${data.findings.osDetection.confidence}%</p>
                <p><strong>Details:</strong> ${data.findings.osDetection.details}</p>
            </div>
        </div>
        ` : ''}
        
        ${data.recommendations && data.recommendations.length > 0 ? `
        <div class="section">
            <h2>💡 Security Recommendations</h2>
            <div class="recommendations">
                <h3>Recommended Actions</h3>
                <ul>
                    ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
        ` : ''}
        
        <div class="footer">
            <p>Report generated by Cyberix Security Scanner</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`
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
    } else {
      pdfContent += '📋 EXECUTIVE SUMMARY\n'
      pdfContent += '═══════════════════════════════════════════════════════════════════════════════\n'
      pdfContent += `Status: ${data.summaryText || data.summary || 'Completed'}\n\n`
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
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors"
                disabled={scanStatus.isScanning}
              />
            </div>
          </div>
          
          {/* Scan Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-medium text-orange-900">Port Discovery</h4>
              </div>
              <p className="text-sm text-orange-700">Comprehensive port scanning with service detection</p>
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
              disabled={isStarting || !target.trim()}
              className="px-8 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2"
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
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{scanStats.services}</div>
              <div className="text-sm text-orange-700">Services</div>
            </div>
          </div>
        </div>
      )}

      {/* Scan Progress */}
      {scanProgress.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Scan Progress</span>
          </h3>
          <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
            {scanProgress.map((entry, index) => (
              <div key={index} className={`mb-1 flex items-start space-x-2 ${
                entry.stage === 'error' ? 'text-red-400' :
                entry.stage === 'warning' ? 'text-yellow-400' :
                entry.stage === 'installing' ? 'text-orange-400' :
                'text-green-400'
              }`}>
                <span className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">[{new Date().toLocaleTimeString()}]</span>
                <span className="font-medium">{entry.stage.toUpperCase()}:</span>
                <span>{entry.message}</span>
              </div>
            ))}
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadResults('json')}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>JSON</span>
              </button>
              <button
                onClick={() => downloadResults('html')}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span>HTML</span>
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
              
              {(scanResults.summaryText || (typeof scanResults.summary === 'string' && scanResults.summary)) && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h4 className="font-medium text-orange-900 mb-2 flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Summary</span>
                  </h4>
                  <p className="text-orange-800">{scanResults.summaryText || scanResults.summary}</p>
                </div>
              )}

              {/* Executive Summary */}
              {scanResults.summary && typeof scanResults.summary === 'object' && (
                <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white mb-6">
                  <h3 className="text-2xl font-bold mb-4 flex items-center space-x-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Executive Summary</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanResults.summary.totalFiles || 0}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Total Files Generated</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{scanResults.summary.bannerGrabbing || 'N/A'}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Service Detection</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{scanResults.summary.osDetection || 'N/A'}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">OS Detection</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{scanResults.summary.macDetection || 'N/A'}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">MAC Detection</div>
                    </div>
                  </div>
                  
                  {/* Port Statistics in Executive Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanStats.openPorts + scanStats.closedPorts + scanStats.filteredPorts}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Total Ports Scanned</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanStats.openPorts}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Open Ports</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanStats.closedPorts}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Closed Ports</div>
                    </div>
                    <div className="bg-white dark:bg-slate-800/20 rounded-lg p-4">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanStats.filteredPorts}</div>
                      <div className="text-sm text-gray-700 dark:text-gray-300">Filtered Ports</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced PDF Report Preview */}
              {scanResults && (
                <div className="p-8 mb-8">
                  {/* Header with gradient background */}
                  <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-xl p-6 mb-6 text-white shadow-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="bg-white dark:bg-slate-800/20 rounded-lg p-2">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold">PDF Report Preview</h3>
                          <p className="text-red-100 text-sm">Live preview of your security scan report</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-red-100">Generated</div>
                        <div className="font-semibold">{new Date().toLocaleDateString()}</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Report Content with enhanced styling */}
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-inner border border-gray-200 dark:border-slate-700 overflow-hidden">
              
                    
                    <div className="p-6 space-y-6">
                      {/* Report Header */}
                    

                      
                      
                      {/* Enhanced Scan Overview */}
                      <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-xl p-6 border-l-4 border-orange-500 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="bg-orange-500 rounded-lg p-2">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <h4 className="text-xl font-bold text-orange-800">SCAN OVERVIEW</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between items-center py-2 border-b border-orange-200">
                              <span className="font-semibold text-orange-700">Scan Date:</span>
                              <span className="text-orange-900 font-mono">{new Date().toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center py-2 border-b border-orange-200">
                              <span className="font-semibold text-orange-700">Target:</span>
                              <span className="text-orange-900 font-mono bg-orange-100 px-2 py-1 rounded">{target}</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center py-2 border-b border-orange-200">
                              <span className="font-semibold text-orange-700">Scan Type:</span>
                              <span className="text-orange-900">Network Analysis</span>
                            </div>
                            <div className="flex justify-between items-center py-2">
                              <span className="font-semibold text-orange-700">Status:</span>
                              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                <span>Completed Successfully</span>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Enhanced Executive Summary */}
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border-l-4 border-green-500 shadow-sm">
                        <div className="flex items-center space-x-3 mb-6">
                          <div className="bg-green-500 rounded-lg p-2">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <h4 className="text-xl font-bold text-green-800">EXECUTIVE SUMMARY</h4>
                        </div>
                        
                        {/* Summary Cards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-green-200">
                            <div className="text-2xl font-bold text-green-600">{scanResults.summary && typeof scanResults.summary === 'object' ? scanResults.summary.totalFiles || 0 : 0}</div>
                            <div className="text-sm text-green-700 font-medium">Total Files Generated</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-green-200">
                            <div className="text-lg font-semibold text-green-600">{scanResults.summary && typeof scanResults.summary === 'object' ? scanResults.summary.bannerGrabbing || 'N/A' : 'N/A'}</div>
                            <div className="text-sm text-green-700 font-medium">Service Detection</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-green-200">
                            <div className="text-lg font-semibold text-green-600">{scanResults.summary && typeof scanResults.summary === 'object' ? scanResults.summary.osDetection || 'N/A' : 'N/A'}</div>
                            <div className="text-sm text-green-700 font-medium">OS Detection</div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-green-200">
                            <div className="text-lg font-semibold text-green-600">{scanResults.summary && typeof scanResults.summary === 'object' ? scanResults.summary.macDetection || 'N/A' : 'N/A'}</div>
                            <div className="text-sm text-green-700 font-medium">MAC Detection</div>
                          </div>
                        </div>
                        
                        {/* Port Statistics */}
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-green-200">
                          <h5 className="font-semibold text-green-800 mb-3 flex items-center space-x-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            <span>Port Analysis</span>
                          </h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-gray-800">{scanStats.openPorts + scanStats.closedPorts + scanStats.filteredPorts}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">Total Scanned</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-green-600">{scanStats.openPorts}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">Open</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-red-600">{scanStats.closedPorts}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">Closed</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-yellow-600">{scanStats.filteredPorts}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">Filtered</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Enhanced Scan Statistics */}
                      <div className="bg-gradient-to-r from-purple-50 to-violet-50 rounded-xl p-6 border-l-4 border-purple-500 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="bg-purple-500 rounded-lg p-2">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </div>
                          <h4 className="text-xl font-bold text-purple-800">SCAN STATISTICS</h4>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-purple-200">
                            <div className="text-3xl font-bold text-green-600 mb-1">{scanStats.openPorts}</div>
                            <div className="text-sm text-purple-700 font-medium">Open Ports</div>
                            <div className="w-full bg-green-100 rounded-full h-2 mt-2">
                              <div className="bg-green-500 h-2 rounded-full" style={{width: `${(scanStats.openPorts / Math.max(scanStats.openPorts + scanStats.closedPorts + scanStats.filteredPorts, 1)) * 100}%`}}></div>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-purple-200">
                            <div className="text-3xl font-bold text-red-600 mb-1">{scanStats.closedPorts}</div>
                            <div className="text-sm text-purple-700 font-medium">Closed Ports</div>
                            <div className="w-full bg-red-100 rounded-full h-2 mt-2">
                              <div className="bg-red-500 h-2 rounded-full" style={{width: `${(scanStats.closedPorts / Math.max(scanStats.openPorts + scanStats.closedPorts + scanStats.filteredPorts, 1)) * 100}%`}}></div>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-purple-200">
                            <div className="text-3xl font-bold text-yellow-600 mb-1">{scanStats.filteredPorts}</div>
                            <div className="text-sm text-purple-700 font-medium">Filtered Ports</div>
                            <div className="w-full bg-yellow-100 rounded-full h-2 mt-2">
                              <div className="bg-yellow-500 h-2 rounded-full" style={{width: `${(scanStats.filteredPorts / Math.max(scanStats.openPorts + scanStats.closedPorts + scanStats.filteredPorts, 1)) * 100}%`}}></div>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 text-center shadow-sm border border-purple-200">
                            <div className="text-3xl font-bold text-orange-600 mb-1">{scanStats.services}</div>
                            <div className="text-sm text-purple-700 font-medium">Services</div>
                          <div className="w-full bg-orange-100 rounded-full h-2 mt-2">
                              <div className="bg-blue-500 h-2 rounded-full" style={{width: `${Math.min(100, (scanStats.services / Math.max(scanStats.openPorts, 1)) * 100)}%`}}></div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Enhanced Service Detection Results */}
                      {scanResults.serviceDetections && scanResults.serviceDetections.length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl p-6 border-l-4 border-orange-500 shadow-sm">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="bg-orange-500 rounded-lg p-2">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                            </div>
                            <h4 className="text-xl font-bold text-orange-800">SERVICE DETECTION RESULTS</h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {scanResults.serviceDetections.slice(0, 6).map((service, index) => (
                              <div key={index} className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-orange-200">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center space-x-2">
                                    <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm font-semibold">
                                      Port {service.port}
                                    </div>
                                    <div className="text-orange-600 font-medium">{service.service}</div>
                                  </div>
                                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                                </div>
                                {service.version && (
                                  <div className="text-sm text-gray-600 dark:text-gray-400 bg-gray-50 px-2 py-1 rounded">
                                    Version: {service.version}
                                  </div>
                                )}
                                {service.banner && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono bg-gray-100 p-2 rounded">
                                    {service.banner.substring(0, 100)}...
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {scanResults.serviceDetections.length > 6 && (
                            <div className="mt-4 text-center">
                              <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-lg inline-block">
                                ... and {scanResults.serviceDetections.length - 6} more services detected
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Enhanced OS Detection Results */}
                      {scanResults.osDetection && (
                        <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-xl p-6 border-l-4 border-indigo-500 shadow-sm">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="bg-indigo-500 rounded-lg p-2">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <h4 className="text-xl font-bold text-indigo-800">OS DETECTION RESULTS</h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-indigo-200">
                              <div className="text-sm text-indigo-600 font-medium mb-1">Operating System</div>
                              <div className="text-lg font-bold text-indigo-800">{scanResults.osDetection.family || 'Unknown'}</div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-indigo-200">
                              <div className="text-sm text-indigo-600 font-medium mb-1">Version</div>
                              <div className="text-lg font-bold text-indigo-800">{scanResults.osDetection.version || 'Unknown'}</div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-indigo-200">
                              <div className="text-sm text-indigo-600 font-medium mb-1">Confidence</div>
                              <div className="text-lg font-bold text-indigo-800 flex items-center space-x-2">
                                <span>{scanResults.osDetection.confidence || 0}%</span>
                                <div className="w-16 bg-indigo-100 rounded-full h-2">
                                  <div className="bg-indigo-500 h-2 rounded-full" style={{width: `${scanResults.osDetection.confidence || 0}%`}}></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Enhanced MAC Detection Results */}
                      {scanResults.macDetection && (
                        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-6 border-l-4 border-teal-500 shadow-sm">
                          <div className="flex items-center space-x-3 mb-4">
                            <div className="bg-teal-500 rounded-lg p-2">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </div>
                            <h4 className="text-xl font-bold text-teal-800">MAC DETECTION RESULTS</h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-teal-200">
                              <div className="text-sm text-teal-600 font-medium mb-1">MAC Address</div>
                              <div className="text-lg font-bold text-teal-800 font-mono">{scanResults.macDetection.macAddress || 'N/A'}</div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-teal-200">
                              <div className="text-sm text-teal-600 font-medium mb-1">Vendor</div>
                              <div className="text-lg font-bold text-teal-800">{scanResults.macDetection.vendor || 'N/A'}</div>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-teal-200">
                              <div className="text-sm text-teal-600 font-medium mb-1">Device Type</div>
                              <div className="text-lg font-bold text-teal-800">{scanResults.macDetection.deviceType || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {/* Enhanced Security Recommendations */}
                      <div className="bg-gradient-to-r from-red-50 to-pink-50 rounded-xl p-6 border-l-4 border-red-500 shadow-sm">
                        <div className="flex items-center space-x-3 mb-4">
                          <div className="bg-red-500 rounded-lg p-2">
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          <h4 className="text-xl font-bold text-red-800">SECURITY RECOMMENDATIONS</h4>
                        </div>
                        <div className="space-y-3">
                          {[
                            { 
                              icon: (
                                <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                </svg>
                              ), 
                              text: 'Review open ports and close unnecessary services', 
                              priority: 'High' 
                            },
                            { 
                              icon: (
                                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ), 
                              text: 'Update detected services to latest versions', 
                              priority: 'High' 
                            },
                            { 
                              icon: (
                                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              ), 
                              text: 'Implement proper firewall rules', 
                              priority: 'Medium' 
                            },
                            { 
                              icon: (
                                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              ), 
                              text: 'Monitor network traffic for anomalies', 
                              priority: 'Medium' 
                            },
                            { 
                              icon: (
                                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                              ), 
                              text: 'Regular security assessments recommended', 
                              priority: 'Low' 
                            }
                          ].map((rec, index) => (
                            <div key={index} className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-red-200 flex items-start space-x-3">
                              <div className="flex-shrink-0 mt-1">{rec.icon}</div>
                              <div className="flex-1">
                                <div className="text-red-800 font-medium">{rec.text}</div>
                                <div className="text-sm text-red-600 mt-1">
                                  Priority: <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                    rec.priority === 'High' ? 'bg-red-100 text-red-800' :
                                    rec.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>{rec.priority}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Enhanced Report Footer */}
                      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6 border-t border-gray-200 dark:border-slate-700">
                        <div className="text-center">
                          <div className="flex items-center justify-center space-x-2 mb-4">
                            <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span className="text-lg font-semibold text-gray-700">Report generated by Cyberix Security Scanner</span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            For detailed analysis and comprehensive data, download the complete PDF report
                          </div>
                          <div className="flex justify-center space-x-3">
                            <button
                              onClick={() => downloadResults('pdf')}
                              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center space-x-2 transition-colors duration-200 shadow-lg hover:shadow-xl"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>Download PDF</span>
                            </button>
                            <button
                              onClick={() => downloadResults('html')}
                              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold flex items-center space-x-2 transition-colors duration-200 shadow-lg hover:shadow-xl"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              <span>Download HTML</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Debug Information - Show scan results structure */}
              {/* {process.env.NODE_ENV === 'development' && scanResults && (
                <div className="bg-gray-100 rounded-xl p-4 border border-gray-300">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Debug Info - Scan Results Structure</h4>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <p>Scan Results Keys: {Object.keys(scanResults).join(', ')}</p>
                    <p>Summary Type: {typeof scanResults.summary}</p>
                    <p>Summary Keys: {scanResults.summary && typeof scanResults.summary === 'object' ? Object.keys(scanResults.summary).join(', ') : 'N/A'}</p>
                    <p>Findings: {scanResults.findings ? 'Present' : 'Missing'}</p>
                    <p>Findings Keys: {scanResults.findings ? Object.keys(scanResults.findings).join(', ') : 'N/A'}</p>
                    <p>All Ports: {scanResults.findings?.allPorts ? scanResults.findings.allPorts.length : 0}</p>
                    <p>Scan Stats: {JSON.stringify(scanStats)}</p>
                  </div>
                </div>
              )} */}

              {/* Port Scan Results */}
              {scanResults.findings && scanResults.findings.allPorts && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Network Findings - Port Scan Results</span>
                  </h3>
                  {/* Results Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-500">
                      <div className="text-sm text-gray-600">Top Services Detected</div>
                      <div className="mt-2 text-gray-900 dark:text-gray-100 text-sm">
                        {(scanResults.serviceDetections || [])
                          .slice(0,5)
                          .map((s, i) => (
                            <div key={i} className="flex justify-between border-b border-gray-100 py-1">
                              <span className="font-medium">{s.service || 'unknown'}</span>
                              <span className="font-mono">:{s.port}</span>
                            </div>
                          ))}
                        {(scanResults.serviceDetections || []).length === 0 && (
                          <div className="text-gray-500">No services identified</div>
                        )}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-indigo-500">
                      <div className="text-sm text-gray-600">Target</div>
                      <div className="mt-2 font-mono text-gray-900 dark:text-gray-100">{target || scanResults.target || 'Unknown'}</div>
                      <div className="text-xs text-gray-500 mt-1">Scan Time: {new Date().toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-emerald-500">
                      <div className="text-sm text-gray-600">Files Generated</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {scanResults.jsonReport && (
                          <button onClick={() => downloadGeneratedReport(scanResults.jsonReport, 'JSON')} className="px-3 py-1 text-xs bg-orange-600 text-white rounded">JSON</button>
                        )}
                        {scanResults.htmlReport && (
                          <button onClick={() => downloadGeneratedReport(scanResults.htmlReport, 'HTML')} className="px-3 py-1 text-xs bg-green-600 text-white rounded">HTML</button>
                        )}
                        {scanResults.pdfReport && (
                          <button onClick={() => downloadGeneratedReport(scanResults.pdfReport, 'PDF')} className="px-3 py-1 text-xs bg-red-600 text-white rounded">PDF</button>
                        )}
                        {!scanResults.jsonReport && !scanResults.htmlReport && !scanResults.pdfReport && (
                          <div className="text-gray-500 text-sm">No files available</div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Port Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-green-500">
                      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{scanResults.summary?.totalPortsScanned || 0}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Total Ports Scanned</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-green-500">
                      <div className="text-2xl font-bold text-green-600">{scanResults.summary?.openPorts || 0}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Open Ports</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-red-500">
                      <div className="text-2xl font-bold text-red-600">{scanResults.summary?.closedPorts || 0}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Closed Ports</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border-l-4 border-yellow-500">
                      <div className="text-2xl font-bold text-yellow-600">{scanResults.summary?.filteredPorts || 0}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">Filtered Ports</div>
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
                          <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-700">Actions</th>
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
                            <td className="border border-gray-300 px-4 py-2">
                              <button onClick={() => openPortDetails(port)} className="text-orange-600 hover:text-orange-700 font-medium">
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {scanResults.findings.allPorts.length > 20 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                        Showing first 20 ports of {scanResults.findings.allPorts.length} total
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Operating System Detection */}
              {scanResults.findings?.osDetection && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-6 border border-orange-200 mb-6">
                  <h3 className="text-lg font-semibold text-orange-900 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Operating System Detection</span>
                  </h3>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">OS Family:</span>
                      <span className="text-orange-600 font-semibold">{scanResults.findings.osDetection.family || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">OS Version:</span>
                      <span className="text-orange-600 font-semibold">{scanResults.findings.osDetection.version || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Confidence:</span>
                      <span className="text-green-600 font-semibold">{scanResults.findings.osDetection.confidence || 0}%</span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700 block mb-2">Details:</span>
                      <span className="text-gray-600 dark:text-gray-400">{scanResults.findings.osDetection.details || 'N/A'}</span>
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
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 space-y-3">
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
                      <span className="text-gray-600 dark:text-gray-400">{new Date(scanResults.findings.scanStatistics.startTime).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-gray-700">Scan End:</span>
                      <span className="text-gray-600 dark:text-gray-400">{new Date(scanResults.findings.scanStatistics.endTime).toLocaleString()}</span>
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
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
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

              {/* Critical & High Risks */}
              {riskIssues.length > 0 && (
                <div className="bg-gradient-to-r from-rose-50 to-red-50 rounded-xl p-6 border border-red-200 mb-6">
                  <h3 className="text-lg font-semibold text-red-800 mb-4 flex items-center space-x-2">
                    <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20"><path d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.594c.75 1.334-.213 2.997-1.742 2.997H3.48c-1.53 0-2.492-1.663-1.742-2.997L8.257 3.1zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-2a1 1 0 01-1-1V7a1 1 0 112 0v3a1 1 0 01-1 1z"/></svg>
                    <span>Critical & High Risks</span>
                  </h3>
                  <div className="space-y-4">
                    {riskIssues.map((i, idx) => (
                      <div key={idx} className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-red-100">
                        <div className="flex items-start justify-between">
                          <div className="font-semibold text-gray-900 dark:text-gray-100">{i.title}</div>
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${i.severity === 'critical' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{i.severity.toUpperCase()}</span>
                        </div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300"><span className="font-medium">Why this matters:</span> {i.why}</div>
                        <div className="mt-2 text-sm text-gray-700 dark:text-gray-300"><span className="font-medium">How to fix:</span> {i.fix}</div>
                        {i.ref && (
                          <div className="mt-2 text-xs"><a href={i.ref} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Reference</a></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug Information */}
              {/* {process.env.NODE_ENV === 'development' && (
                <div className="bg-gray-100 rounded-xl p-4 border border-gray-300">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Debug Info</h4>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <p>Scan Results Keys: {scanResults ? Object.keys(scanResults).join(', ') : 'No results'}</p>
                    <p>Summary: {scanResults.summary ? 'Present' : 'Missing'}</p>
                    <p>Findings: {scanResults.findings ? 'Present' : 'Missing'}</p>
                    <p>Ports: {scanResults.findings?.allPorts ? scanResults.findings.allPorts.length : 0}</p>
                    <p>Recommendations: {scanResults.recommendations ? scanResults.recommendations.length : 0}</p>
                  </div>
                </div>
              )} */}
            </div>
          )}
          {/* Port Details Modal */}
          {showDetails && selectedPort && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl border border-gray-200 dark:border-slate-700">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
                  <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Port {selectedPort.port} Details</h4>
                  <button onClick={closePortDetails} className="text-gray-500 hover:text-gray-700">✕</button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Service</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{selectedPort.service || selectedPort.serviceInfo?.service || 'Unknown'}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Version</div>
                      <div className="font-medium text-gray-900 dark:text-gray-100">{selectedPort.serviceInfo?.version || 'N/A'}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-4 md:col-span-2">
                      <div className="text-sm text-gray-600 dark:text-gray-400">Banner</div>
                      <div className="font-mono text-sm text-gray-900 dark:text-gray-100 break-words">{selectedPort.banner || selectedPort.serviceInfo?.banner || 'N/A'}</div>
                    </div>
                  </div>
                  {selectedPort.serviceInfo?.cpe && (
                    <div className="bg-gray-50 dark:bg-slate-900/40 rounded-lg p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400">CPE</div>
                      <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{selectedPort.serviceInfo.cpe}</div>
                    </div>
                  )}
                  <div className="text-xs text-gray-500">Tip: Use Port Scanning for deep vulnerability analysis.</div>
                </div>
                <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
                  <button onClick={closePortDetails} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NetworkScanning