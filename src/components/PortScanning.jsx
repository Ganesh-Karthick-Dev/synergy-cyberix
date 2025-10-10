import { useState, useEffect } from 'react'
import { useScanning } from '../context/ScanningContext'
import scanLogger from '../utils/scanLogger'

function PortScanning() {
  const [isStarting, setIsStarting] = useState(false)
  const [target, setTarget] = useState('')
  const [scanResults, setScanResults] = useState(null)
  const [kaliStatus, setKaliStatus] = useState('Checking...')
  const [scanStats, setScanStats] = useState({
    totalPorts: 0,
    openPorts: 0,
    closedPorts: 0,
    filteredPorts: 0,
    services: 0,
    criticalRisks: 0,
    highRisks: 0,
    mediumRisks: 0,
    lowRisks: 0,
    confidence: 0
  })
  const [portFilter, setPortFilter] = useState('all') // 'all', 'open', 'closed', 'filtered'
  const [severityFilter, setSeverityFilter] = useState('all') // 'all', 'critical', 'high', 'medium', 'low'
  const [serviceFilter, setServiceFilter] = useState('all') // 'all', 'http', 'https', 'ssh', 'database', 'other'
  const [stateFilter, setStateFilter] = useState('all') // 'all', 'open', 'closed', 'filtered'
  const [riskFilter, setRiskFilter] = useState('all') // 'all', 'critical', 'high', 'medium', 'low'
  const [selectedPort, setSelectedPort] = useState(null)
  const [showBannerModal, setShowBannerModal] = useState(false)
  const [showScriptModal, setShowScriptModal] = useState(false)
  const [showCVEModal, setShowCVEModal] = useState(false)

  const { scanStatus, scanProgress, startPortScan, abortScan } = useScanning()
  const [expandedCritical, setExpandedCritical] = useState(new Set())

  const toggleCriticalExpand = (key) => {
    setExpandedCritical(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
    setScanStats({ totalPorts: 0, openPorts: 0, closedPorts: 0, filteredPorts: 0, services: 0 })
    
    // Log scan start
    const startTime = new Date()
    await scanLogger.logScan({
      scanType: 'port',
      scanName: 'Port Scan',
      target: target.trim(),
      status: 'started',
      startTime: startTime.toISOString(),
      endTime: null,
      duration: null,
      result: 'Scan initiated'
    })
    
    try {
      await startPortScan(target)
    } catch (error) {
      console.error('Scan start error:', error)
      alert('Failed to start port scan: ' + (error?.message || String(error)))
      
      // Log scan failure
      await scanLogger.logScan({
        scanType: 'port',
        scanName: 'Port Scan',
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
      window.cyberGuard.onPortScanDone(async (result) => {
        try {
          if (result && result.success) {
            setScanResults(result.result)
            
            // Log scan completion
            const endTime = new Date()
            const startTime = new Date(endTime.getTime() - (result.duration || 0))
            const openPorts = result.result?.ports?.filter(p => p.state === 'open').length || 0
            const resultSummary = `Scan completed - ${openPorts} open ports found`
            
            await scanLogger.logScan({
              scanType: 'port',
              scanName: 'Port Scan',
              target: target.trim(),
              status: 'completed',
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              duration: result.duration || 0,
              result: resultSummary
            })
          } else {
            setScanResults({ error: 'Port scan failed' })
            
            // Log scan failure
            const endTime = new Date()
            await scanLogger.logScan({
              scanType: 'port',
              scanName: 'Port Scan',
              target: target.trim(),
              status: 'failed',
              startTime: new Date(endTime.getTime() - 60000).toISOString(), // Default 1 min
              endTime: endTime.toISOString(),
              duration: 60000,
              result: 'Port scan failed'
            })
          }
        } catch (error) {
          console.error('Error handling port scan completion:', error)
          setScanResults({ error: 'Error processing scan results' })
          
          // Log scan error
          const endTime = new Date()
          await scanLogger.logScan({
            scanType: 'port',
            scanName: 'Port Scan',
            target: target.trim(),
            status: 'failed',
            startTime: new Date(endTime.getTime() - 60000).toISOString(),
            endTime: endTime.toISOString(),
            duration: 60000,
            result: `Error processing results: ${error.message}`
          })
        }
      })
    }
  }, [target])

  // Parse scan statistics from progress messages and results
  useEffect(() => {
    if (scanResults && scanResults.findings) {
      const findings = scanResults.findings
      const openPorts = findings.filter(port => port.state === 'open').length
      const closedPorts = findings.filter(port => port.state === 'closed').length
      const filteredPorts = findings.filter(port => port.state === 'filtered').length
      const criticalRisks = findings.filter(port => port.severity === 'Critical').length
      const highRisks = findings.filter(port => port.severity === 'High').length
      const mediumRisks = findings.filter(port => port.severity === 'Medium').length
      const lowRisks = findings.filter(port => port.severity === 'Low').length
      const avgConfidence = findings.length > 0 ? 
        Math.round(findings.reduce((sum, port) => sum + (port.confidence || 0), 0) / findings.length) : 0

      setScanStats({
        totalPorts: findings.length,
        openPorts,
        closedPorts,
        filteredPorts,
        services: openPorts,
        criticalRisks,
        highRisks,
        mediumRisks,
        lowRisks,
        confidence: avgConfidence
      })
    } else {
      // Fallback to progress message parsing
      let inferredTotal = 0
      scanProgress.forEach(update => {
        if (update.message.includes('open port')) {
          inferredTotal += 1
          setScanStats(prev => ({ ...prev, openPorts: prev.openPorts + 1 }))
        }
        if (update.message.includes('closed port')) {
          inferredTotal += 1
          setScanStats(prev => ({ ...prev, closedPorts: prev.closedPorts + 1 }))
        }
        if (update.message.includes('filtered port')) {
          inferredTotal += 1
          setScanStats(prev => ({ ...prev, filteredPorts: prev.filteredPorts + 1 }))
        }
        if (update.message.includes('service detected')) {
          setScanStats(prev => ({ ...prev, services: prev.services + 1 }))
        }
      })
      if (inferredTotal > 0) {
        setScanStats(prev => ({ ...prev, totalPorts: (prev.totalPorts || 0) + inferredTotal }))
      }
    }
  }, [scanProgress, scanResults])

  const downloadResults = () => {
    if (!scanResults) return
    
    // Generate PDF content
    const pdfContent = generatePDFReport(scanResults, target)
    const pdfBlob = new Blob([pdfContent], { type: 'application/pdf' })
    const url = URL.createObjectURL(pdfBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'port-scan-' + target + '-' + Date.now() + '.pdf'
    link.click()
    URL.revokeObjectURL(url)
  }

  const downloadHTMLResults = () => {
    if (!scanResults) return
    const html = generateHTMLReport(scanResults, target)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'port-scan-' + target + '-' + Date.now() + '.html'
    link.click()
    URL.revokeObjectURL(url)
  }

  const generatePDFReport = (data, targetHost) => {
    // Generate HTML content with print styles for PDF
    const htmlContent = generateHTMLReport(data, targetHost)
    
    // Add print-specific CSS for better PDF generation
    const printStyles = `
      <style>
        @media print {
          body { 
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .summary-item, .state-badge, .risk-assessment, .recommendation-item {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      </style>
    `
    
    const fullHtmlContent = htmlContent.replace('</head>', printStyles + '</head>')
    
    // Create a data URL for the HTML content
    const htmlBlob = new Blob([fullHtmlContent], { type: 'text/html' })
    const htmlUrl = URL.createObjectURL(htmlBlob)
    
    // Open in new window for printing/saving as PDF
    const printWindow = window.open(htmlUrl, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        // Wait a bit for styles to load
        setTimeout(() => {
          printWindow.print()
          setTimeout(() => {
            URL.revokeObjectURL(htmlUrl)
            printWindow.close()
          }, 1000)
        }, 500)
      }
    }
    
    return fullHtmlContent
  }

  const generatePDFContent = (data, targetHost) => {
    let content = 'BT\n'
    
    // Title with colors
    content += '/F1 20 Tf\n'
    content += '0.06 0.11 0.18 rg\n'  // Dark blue for title
    content += '72 720 Td\n'
    content += '(ADVANCED PORT SCAN REPORT) Tj\n'
    content += '0 -35 Td\n'
    content += '/F2 12 Tf\n'
    content += '0.39 0.45 0.53 rg\n'  // Gray for target
    content += '(Target: ' + targetHost + ') Tj\n'
    content += '0 -25 Td\n'
    content += '0.58 0.64 0.72 rg\n'  // Light gray for timestamp
    content += '(Generated: ' + new Date().toLocaleString() + ') Tj\n'
    content += '0 -45 Td\n'
    
    // Summary
    if (data.findings && Array.isArray(data.findings)) {
      const openPorts = data.findings.filter(port => port.state === 'open').length
      const closedPorts = data.findings.filter(port => port.state === 'closed').length
      const filteredPorts = data.findings.filter(port => port.state === 'filtered').length
      const criticalRisks = data.findings.filter(port => port.severity === 'Critical').length
      const highRisks = data.findings.filter(port => port.severity === 'High').length
      const mediumRisks = data.findings.filter(port => port.severity === 'Medium').length
      const lowRisks = data.findings.filter(port => port.severity === 'Low').length
      const avgConfidence = Math.round(data.findings.reduce((sum, port) => sum + (port.confidence || 0), 0) / data.findings.length)
      
      content += '/F1 16 Tf\n'
      content += '0.1 0.1 0.1 rg\n'  // Dark gray for title
      content += '(SCAN SUMMARY) Tj\n'
      content += '0 -25 Td\n'
      content += '/F2 11 Tf\n'
      
      // Total Ports - Gray
      content += '0.3 0.3 0.3 rg\n'
      content += '(Total Ports Scanned: ' + data.findings.length + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Open Ports - Green
      content += '0.09 0.64 0.21 rg\n'
      content += '(Open Ports: ' + openPorts + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Closed Ports - Gray
      content += '0.39 0.45 0.53 rg\n'
      content += '(Closed Ports: ' + closedPorts + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Filtered Ports - Yellow
      content += '0.57 0.25 0.06 rg\n'
      content += '(Filtered Ports: ' + filteredPorts + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Critical Risks - Red
      content += '0.86 0.15 0.15 rg\n'
      content += '(Critical Risks: ' + criticalRisks + ') Tj\n'
      content += '0 -18 Td\n'
      
      // High Risks - Orange
      content += '0.92 0.35 0.05 rg\n'
      content += '(High Risks: ' + highRisks + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Medium Risks - Yellow
      content += '0.85 0.47 0.02 rg\n'
      content += '(Medium Risks: ' + mediumRisks + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Low Risks - Green
      content += '0.09 0.50 0.24 rg\n'
      content += '(Low Risks: ' + lowRisks + ') Tj\n'
      content += '0 -18 Td\n'
      
      // Average Confidence - Blue
      content += '0.15 0.39 0.92 rg\n'
      content += '(Average Confidence: ' + avgConfidence + '%) Tj\n'
      content += '0 -35 Td\n'
      
      // Sectioned Port details by State (UI-like rows)
      content += '/F1 16 Tf\n'
      content += '0.1 0.1 0.1 rg\n'  // Dark gray for title
      content += '(DETAILED PORT ANALYSIS) Tj\n'
      content += '0 -25 Td\n'
      const stateBuckets = ['open', 'closed', 'filtered']
      stateBuckets.forEach(state => {
        const items = data.findings.filter(p => p.state === state)
        if (items.length === 0) return
        const stateLabel = state.toUpperCase() + ' PORTS (' + items.length + ' ports)'
        
        // Set color for section header based on state
        if (state === 'open') {
          content += '0.09 0.64 0.21 rg\n'  // Green for open
        } else if (state === 'closed') {
          content += '0.39 0.45 0.53 rg\n'  // Gray for closed
        } else {
          content += '0.85 0.47 0.02 rg\n'  // Yellow for filtered
        }
        
        content += '/F1 12 Tf\n(' + stateLabel + ') Tj\n0 -15 Td\n/F2 9 Tf\n'
        items.sort((a,b)=>a.port-b.port).forEach(port => {
          // Set color for port number based on severity
          if (state === 'open') {
            if (port.severity === 'Critical') {
              content += '0.86 0.15 0.15 rg\n'  // Red for critical
            } else if (port.severity === 'High') {
              content += '0.92 0.35 0.05 rg\n'  // Orange for high
            } else if (port.severity === 'Medium') {
              content += '0.85 0.47 0.02 rg\n'  // Yellow for medium
            } else {
              content += '0.09 0.50 0.24 rg\n'  // Green for low
            }
          } else {
            content += '0.2 0.2 0.2 rg\n'  // Dark gray for closed/filtered
          }
          
          const line1 = 'Port ' + port.port + '/' + (port.protocol || 'tcp').toUpperCase() + '  ' + (port.service || 'Unknown') + ' [' + port.state.toUpperCase() + ']'
          content += '(' + line1 + ') Tj\n0 -10 Td\n'
          
          // Service info in normal color
          content += '0.1 0.1 0.1 rg\n'
          const line2 = 'Service: ' + (port.version || 'Unknown Version')
          const line3 = (port.banner && port.banner !== 'N/A' ? ('Banner: ' + port.banner.substring(0, 100).replace(/\(/g,'[').replace(/\)/g,']')) : 'Banner: N/A')
          const line4 = (port.cve_links && port.cve_links.length ? ('CVEs: ' + port.cve_links.join(', ').substring(0, 150)) : 'CVEs: None')
          const line5 = 'Confidence: ' + (port.confidence || 0) + '%'
          const line6 = (port.recommendation ? ('Recommendation: ' + port.recommendation.substring(0, 250).replace(/\(/g,'[').replace(/\)/g,']')) : 'Recommendation: No specific recommendations available.')
          
          content += '(' + line2 + ') Tj\n0 -10 Td\n'
          content += '(' + line3 + ') Tj\n0 -10 Td\n'
          content += '(' + line4 + ') Tj\n0 -10 Td\n'
          content += '(' + line5 + ') Tj\n0 -10 Td\n'
          content += '(' + line6 + ') Tj\n0 -10 Td\n'
          
          if (state === 'open' && port.severity && port.description) {
            const riskLevel = port.severity.toUpperCase()
            const riskIcon = riskLevel === 'CRITICAL' ? '[CRITICAL]' : riskLevel === 'HIGH' ? '[HIGH]' : riskLevel === 'MEDIUM' ? '[MEDIUM]' : '[LOW]'
            const desc = riskIcon + ' Risk Assessment: ' + port.description.substring(0, 200).replace(/\(/g,'[').replace(/\)/g,']')
            
            // Set color for risk assessment based on severity
            if (port.severity === 'Critical') {
              content += '0.86 0.15 0.15 rg\n'  // Red for critical
            } else if (port.severity === 'High') {
              content += '0.92 0.35 0.05 rg\n'  // Orange for high
            } else if (port.severity === 'Medium') {
              content += '0.85 0.47 0.02 rg\n'  // Yellow for medium
            } else {
              content += '0.09 0.50 0.24 rg\n'  // Green for low
            }
            content += '(' + desc + ') Tj\n0 -10 Td\n'
          }
        content += '0 -8 Td\n'
        })
        content += '0 -15 Td\n'
      })
      
      // Add remediation recommendations
      content += '0 -25 Td\n'
      content += '/F1 16 Tf\n'
      content += '0.1 0.1 0.1 rg\n'  // Dark gray for title
      content += '(SECURITY RECOMMENDATIONS) Tj\n'
      content += '0 -20 Td\n'
      content += '/F2 10 Tf\n'
      
      const criticalPorts = data.findings.filter(port => port.severity === 'Critical')
      if (criticalPorts.length > 0) {
        content += '0.86 0.15 0.15 rg\n'  // Red for critical
        content += '(CRITICAL: Block external access to database ports) Tj\n'
        content += '0 -12 Td\n'
        content += '(CRITICAL: Change default passwords immediately) Tj\n'
        content += '0 -12 Td\n'
      }
      
      const highRiskPorts = data.findings.filter(port => port.severity === 'High')
      if (highRiskPorts.length > 0) {
        content += '0.92 0.35 0.05 rg\n'  // Orange for high
        content += '(HIGH: Update outdated service versions) Tj\n'
        content += '0 -12 Td\n'
        content += '(HIGH: Configure SSL/TLS properly) Tj\n'
        content += '0 -12 Td\n'
      }
      
      content += '0.85 0.47 0.02 rg\n'  // Yellow for medium
      content += '(MEDIUM: Implement proper authentication) Tj\n'
      content += '0 -12 Td\n'
      content += '0.09 0.50 0.24 rg\n'  // Green for low
      content += '(LOW: Review and harden configurations) Tj\n'
    }
    
    content += 'ET\n'
    return content
  }

  const generateHTMLReport = (data, targetHost) => {
    const escape = (s) => (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const now = new Date().toLocaleString()
    const findings = Array.isArray(data.findings) ? data.findings : []
    const openPorts = findings.filter(p => p.state === 'open').length
    const closedPorts = findings.filter(p => p.state === 'closed').length
    const filteredPorts = findings.filter(p => p.state === 'filtered').length
    const critical = findings.filter(p => p.severity === 'Critical')
    const high = findings.filter(p => p.severity === 'High')
    const medium = findings.filter(p => p.severity === 'Medium')
    const low = findings.filter(p => p.severity === 'Low')
    const avgConfidence = findings.length > 0 ? Math.round(findings.reduce((s, p) => s + (p.confidence || 0), 0) / findings.length) : 0
    
    const getServiceIcon = (service) => {
      const serviceLower = service?.toLowerCase() || ''
      if (serviceLower.includes('http')) {
        return '🌐'
      }
      if (serviceLower === 'ssh') {
        return '🔐'
      }
      if (['mysql', 'postgresql', 'redis', 'mongodb', 'oracle'].includes(serviceLower)) {
        return '🗄️'
      }
      return '⚙️'
    }
    
    const renderSection = (title, items, color) => `
      <section style="margin:16px 0;">
        <h3 style="margin:0 0 8px 0;color:${color};font-family:Segoe UI,Arial;font-size:16px;font-weight:600;">${title} (${items.length} ports)</h3>
        ${items.length === 0 ? `<div style="color:#6b7280;padding:16px;text-align:center;background:#f9fafb;border-radius:8px;">No ${title.toLowerCase()} found</div>` : `
          <table style="width:100%;border-collapse:collapse;font-family:Segoe UI,Arial;font-size:12px;table-layout:fixed;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#f9fafb;color:#374151;">
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">Port</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">Protocol</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">State</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">Service</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;width:28rem;">Version</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;width:14rem;">Banner</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;width:12rem;">CVEs</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;">Confidence</th>
                <th style="text-align:left;padding:12px;border:1px solid #e5e7eb;font-weight:600;text-transform:uppercase;font-size:11px;letter-spacing:0.5px;width:20rem;">Recommendations</th>
              </tr>
            </thead>
            <tbody>
              ${items.sort((a,b)=>a.port-b.port).map(p => `
                <tr style="border-bottom:1px solid #e5e7eb;transition:background-color 0.2s;">
                  <td style="padding:12px;border:1px solid #e5e7eb;">
                    <div style="display:flex;align-items:center;">
                      <div style="flex-shrink:0;height:32px;width:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-right:8px;
                        ${p.state === 'open' ? (p.severity === 'Critical' ? 'background:#fef2f2;' :
                          p.severity === 'High' ? 'background:#fff7ed;' :
                          p.severity === 'Medium' ? 'background:#fffbeb;' :
                          'background:#ecfdf5;') :
                        p.state === 'closed' ? 'background:#f3f4f6;' :
                        'background:#fef3c7;'}">
                        <span style="font-size:14px;font-weight:600;
                          ${p.state === 'open' ? (p.severity === 'Critical' ? 'color:#dc2626;' :
                            p.severity === 'High' ? 'color:#ea580c;' :
                            p.severity === 'Medium' ? 'color:#d97706;' :
                            'color:#16a34a;') :
                          p.state === 'closed' ? 'color:#374151;' :
                          'color:#92400e;'}">${p.port}</span>
                      </div>
                    </div>
                  </td>
                  <td style="padding:12px;border:1px solid #e5e7eb;font-family:monospace;font-weight:500;">${(p.protocol || 'tcp').toUpperCase()}</td>
                  <td style="padding:12px;border:1px solid #e5e7eb;">
                    <span style="padding:4px 8px;border-radius:12px;font-size:10px;font-weight:600;text-transform:uppercase;
                      ${p.state === 'open' ? 'background:#dcfce7;color:#166534;border:1px solid #bbf7d0;' :
                        p.state === 'closed' ? 'background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;' :
                        'background:#fef3c7;color:#92400e;border:1px solid #fde68a;'}">${p.state}</span>
                  </td>
                  <td style="padding:12px;border:1px solid #e5e7eb;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="font-size:16px;">${getServiceIcon(p.service)}</span>
                      <span style="font-weight:500;">${escape(p.service || 'Unknown')}</span>
                    </div>
                  </td>
                  <td style="padding:12px;border:1px solid #e5e7eb;">
                    <div style="word-break:break-word;margin-bottom:8px;">${escape(p.version || 'Unknown')}</div>
                    ${p.state === 'open' && p.severity && p.description ? `
                      <div style="margin-top:8px;padding:8px;border-radius:8px;white-space:pre-wrap;word-break:break-word;max-width:28rem;
                        ${p.severity === 'Critical' ? 'background:#fef2f2;border:1px solid #fecaca;color:#991b1b;' :
                          p.severity === 'High' ? 'background:#fff7ed;border:1px solid #fed7aa;color:#c2410c;' :
                          p.severity === 'Medium' ? 'background:#fffbeb;border:1px solid #fde68a;color:#a16207;' :
                          'background:#ecfdf5;border:1px solid #bbf7d0;color:#15803d;'}">
                        <div style="font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:4px;">
                          <span>${p.severity === 'Critical' ? '🚨' : p.severity === 'High' ? '⚠️' : p.severity === 'Medium' ? '⚡' : 'ℹ️'}</span>
                          <span>Risk Assessment: ${p.severity}</span>
                        </div>
                        <div style="font-size:11px;line-height:1.4;">${escape(p.description || 'Service analysis in progress...')}</div>
                      </div>
                    ` : ''}
                  </td>
                  <td style="padding:12px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word;font-size:11px;" title="${escape(p.banner || '')}">${escape((p.banner || '').slice(0,100))}${(p.banner||'').length>100?'...':''}</td>
                  <td style="padding:12px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word;font-size:11px;">${(p.cve_links||[]).map(escape).join(', ') || 'None'}</td>
                  <td style="padding:12px;border:1px solid #e5e7eb;">
                    <div style="display:flex;align-items:center;">
                      <div style="width:64px;background:#e5e7eb;border-radius:4px;height:8px;margin-right:8px;">
                        <div style="height:8px;border-radius:4px;
                          ${p.confidence >= 80 ? 'background:#16a34a;' : p.confidence >= 60 ? 'background:#d97706;' : 'background:#dc2626;'}" 
                          style="width:${p.confidence || 0}%"></div>
                      </div>
                      <span style="font-size:11px;color:#6b7280;font-weight:500;">${p.confidence || 0}%</span>
                    </div>
                  </td>
                  <td style="padding:12px;border:1px solid #e5e7eb;white-space:pre-wrap;word-break:break-word;font-size:11px;line-height:1.4;">${escape(p.recommendation || 'No specific recommendations available.')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </section>
    `
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Advanced Port Scan Report - ${escape(targetHost)}</title>
  <style>
    body { 
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif; 
      margin: 0; 
      padding: 24px; 
      background: #f8fafc; 
      color: #1e293b; 
      line-height: 1.6;
    }
    .container { 
      max-width: 1400px; 
      margin: 0 auto; 
    }
    .card { 
      background: white; 
      border-radius: 16px; 
      padding: 24px; 
      margin-bottom: 24px; 
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      border: 1px solid #e2e8f0;
    }
    h1 { 
      margin: 0 0 16px 0; 
      color: #0f172a; 
      font-size: 28px; 
      font-weight: 800; 
      letter-spacing: -0.025em;
    }
    h2 { 
      margin: 0 0 16px 0; 
      color: #1e293b; 
      font-size: 20px; 
      font-weight: 700; 
    }
    h3 { 
      margin: 0 0 12px 0; 
      color: #334155; 
      font-size: 16px; 
      font-weight: 600; 
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-item {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid;
      font-weight: 600;
      text-align: center;
      font-size: 14px;
    }
    .summary-total { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }
    .summary-open { background: #ecfdf5; border-color: #bbf7d0; color: #166534; }
    .summary-closed { background: #f8fafc; border-color: #e2e8f0; color: #64748b; }
    .summary-filtered { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .summary-critical { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
    .summary-high { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }
    .summary-medium { background: #fffbeb; border-color: #fde68a; color: #d97706; }
    .summary-low { background: #ecfdf5; border-color: #bbf7d0; color: #16a34a; }
    .summary-confidence { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
    
    table { 
      width: 100%; 
      border-collapse: collapse; 
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    th { 
      background: #f8fafc; 
      font-weight: 600; 
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
      color: #64748b;
    }
    tr:hover {
      background: #f8fafc;
    }
    .port-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      font-weight: 700;
      font-size: 14px;
    }
    .state-badge {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      border: 1px solid;
    }
    .risk-assessment {
      margin-top: 8px;
      padding: 8px;
      border-radius: 8px;
      font-size: 11px;
      line-height: 1.4;
    }
    .confidence-bar {
      width: 64px;
      height: 8px;
      background: #e2e8f0;
      border-radius: 4px;
      overflow: hidden;
    }
    .confidence-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s ease;
    }
    .recommendations {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .recommendation-item {
      padding: 16px;
      border-radius: 12px;
      border: 1px solid;
      font-weight: 500;
    }
    .recommendation-critical { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
    .recommendation-high { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }
    .recommendation-medium { background: #fffbeb; border-color: #fde68a; color: #d97706; }
    .recommendation-low { background: #ecfdf5; border-color: #bbf7d0; color: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
  <div class="card">
      <h1>ADVANCED PORT SCAN REPORT</h1>
      <div style="color: #64748b; font-size: 14px; margin-bottom: 4px;">Target: ${escape(targetHost)}</div>
      <div style="color: #94a3b8; font-size: 12px;">Generated: ${escape(now)}</div>
  </div>
    
    <div class="card">
      <h2>SCAN SUMMARY</h2>
      <div class="summary-grid">
        <div class="summary-item summary-total">Total Ports Scanned: ${findings.length}</div>
        <div class="summary-item summary-open">Open Ports: ${openPorts}</div>
        <div class="summary-item summary-closed">Closed Ports: ${closedPorts}</div>
        <div class="summary-item summary-filtered">Filtered Ports: ${filteredPorts}</div>
        <div class="summary-item summary-critical">Critical Risks: ${critical.length}</div>
        <div class="summary-item summary-high">High Risks: ${high.length}</div>
        <div class="summary-item summary-medium">Medium Risks: ${medium.length}</div>
        <div class="summary-item summary-low">Low Risks: ${findings.filter(p => p.severity === 'Low').length}</div>
        <div class="summary-item summary-confidence">Average Confidence: ${avgConfidence}%</div>
    </div>
  </div>
    
    <div class="card">
      <h2>DETAILED PORT ANALYSIS</h2>
      ${renderSection('OPEN PORTS', findings.filter(p => p.state === 'open'), '#16a34a')}
      ${renderSection('CLOSED PORTS', findings.filter(p => p.state === 'closed'), '#64748b')}
      ${renderSection('FILTERED PORTS', findings.filter(p => p.state === 'filtered'), '#d97706')}
    </div>
    
    <div class="card">
      <h2>SECURITY RECOMMENDATIONS</h2>
      <div class="recommendations">
        <div class="recommendation-item recommendation-critical">
          <strong>🚨 CRITICAL:</strong> Block external access to database ports (3306, 5432, 6379, 1433, 1521, 27017, 11211). Database services should never be exposed to external networks.
        </div>
        <div class="recommendation-item recommendation-critical">
          <strong>🚨 CRITICAL:</strong> Change default passwords immediately for all database services and enable strong authentication.
        </div>
        <div class="recommendation-item recommendation-high">
          <strong>⚠️ HIGH:</strong> Update outdated service versions to latest stable releases and implement security patches.
        </div>
        <div class="recommendation-item recommendation-high">
          <strong>⚠️ HIGH:</strong> Configure SSL/TLS properly with strong cipher suites and disable weak protocols.
        </div>
        <div class="recommendation-item recommendation-medium">
          <strong>⚡ MEDIUM:</strong> Implement proper authentication and access controls for all exposed services.
        </div>
        <div class="recommendation-item recommendation-low">
          <strong>ℹ️ LOW:</strong> Review and harden service configurations according to security best practices.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`
  }

  // Helpers for UI grouping
  const groupBySeverity = (items) => {
    const buckets = { Critical: [], High: [], Medium: [], Low: [] }
    items.forEach(i => {
      if (buckets[i.severity]) buckets[i.severity].push(i)
      else buckets.Low.push(i)
    })
    return buckets
  }
  const groupByState = (items) => {
    const buckets = { open: [], closed: [], filtered: [] }
    items.forEach(i => {
      if (buckets[i.state]) buckets[i.state].push(i)
    })
    return buckets
  }

  // Filter ports based on selected filters
  const getFilteredPorts = () => {
    if (!scanResults || !scanResults.findings || !Array.isArray(scanResults.findings)) {
      return []
    }
    
    let filtered = scanResults.findings
    
    // Filter by port state (legacy filter)
    if (portFilter !== 'all') {
      filtered = filtered.filter(port => port.state === portFilter)
    }
    
    // Filter by new state filter
    if (stateFilter !== 'all') {
      filtered = filtered.filter(port => port.state === stateFilter)
    }
    
    // Filter by severity (legacy filter)
    if (severityFilter !== 'all') {
      filtered = filtered.filter(port => port.severity === severityFilter)
    }
    
    // Filter by new risk filter
    if (riskFilter !== 'all') {
      filtered = filtered.filter(port => port.severity === riskFilter)
    }
    
    // Filter by service type
    if (serviceFilter !== 'all') {
      filtered = filtered.filter(port => {
        const service = port.service?.toLowerCase() || ''
        switch (serviceFilter) {
          case 'http':
            return service === 'http'
          case 'https':
            return service === 'https'
          case 'ssh':
            return service === 'ssh'
          case 'database':
            return ['mysql', 'postgresql', 'redis', 'mongodb', 'oracle'].includes(service)
          case 'other':
            return !['http', 'https', 'ssh', 'mysql', 'postgresql', 'redis', 'mongodb', 'oracle'].includes(service)
          default:
            return true
        }
      })
    }
    
    // Sort by severity (Critical → High → Medium → Low), then by port number
    const severityOrder = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 }
    filtered.sort((a, b) => {
      const severityDiff = (severityOrder[a.severity] || 4) - (severityOrder[b.severity] || 4)
      if (severityDiff !== 0) return severityDiff
      return a.port - b.port
    })
    
    return filtered
  }

  // Get service icon (SVG, no emojis)
  const getServiceIcon = (service) => {
    const serviceLower = service?.toLowerCase() || ''
    if (serviceLower.includes('http')) {
      return (
        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1018 0A9 9 0 003 12zm3 0h12m-9 0a9.003 9.003 0 003 6.708A9.003 9.003 0 0012 12a9.003 9.003 0 00-3-6.708A9.003 9.003 0 006 12z" />
        </svg>
      )
    }
    if (serviceLower === 'ssh') {
      return (
        <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-1V9a5 5 0 10-10 0v2H6a2 2 0 00-2 2v6a2 2 0 002 2zm3-10a3 3 0 016 0v2H9V9z" />
        </svg>
      )
    }
    if (['mysql', 'postgresql', 'redis', 'mongodb', 'oracle'].includes(serviceLower)) {
      return (
        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6v10c0 1.657 3.582 3 8 3s8-1.343 8-3V6M4 6c0 1.657 3.582 3 8 3s8-1.343 8-3M4 6c0-1.657 3.582-3 8-3s8 1.343 8 3" />
        </svg>
      )
    }
    return (
      <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      </svg>
    )
  }

  // Get severity color classes
  const getSeverityClasses = (severity) => {
    switch (severity) {
      case 'Critical':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'High':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'Low':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Status */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white dark:bg-slate-800/20 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Port Scanning</h2>
              <p className="text-green-100">Advanced port discovery and service enumeration</p>
            </div>
          </div>
        
        </div>
      </div>


      {/* Scan Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-green-100 rounded-lg">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Port Scan Configuration</h3>
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
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                disabled={scanStatus.isScanning}
              />
            </div>
          </div>
          
          {/* Scan Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="font-medium text-green-900">Common Ports</h4>
              </div>
              <p className="text-sm text-green-700">Scans 1000 most common ports for efficiency</p>
            </div>
            <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <h4 className="font-medium text-orange-900">Service Detection</h4>
              </div>
              <p className="text-sm text-orange-700">Identifies running services and versions</p>
            </div>
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <h4 className="font-medium text-purple-900">OS Detection</h4>
              </div>
              <p className="text-sm text-purple-700">Advanced OS fingerprinting capabilities</p>
            </div>
          </div>
          
          <div className="flex space-x-4">
            <button
              onClick={handleStartScan}
              disabled={isStarting || !target.trim()}
              className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2"
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
                  <span>Start Port Scan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Scan Statistics */}
      {(scanStatus.isScanning || scanResults) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Scan Statistics</span>
          </h3>
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-3">
            <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="text-xl font-bold text-gray-600 dark:text-gray-200">{scanStats.totalPorts}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300">Total</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xl font-bold text-green-600">{scanStats.openPorts}</div>
              <div className="text-xs text-green-700">Open</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-green-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
              <div className="text-xl font-bold text-gray-600 dark:text-gray-200">{scanStats.closedPorts}</div>
              <div className="text-xs text-gray-700 dark:text-gray-300">Closed</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-xl font-bold text-yellow-600">{scanStats.filteredPorts}</div>
              <div className="text-xs text-yellow-700">Filtered</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-yellow-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <div className="text-xl font-bold text-red-600">{scanStats.criticalRisks}</div>
              <div className="text-xs text-red-700">Critical</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-red-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-xl font-bold text-orange-600">{scanStats.highRisks}</div>
              <div className="text-xs text-orange-700">High</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-orange-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-xl font-bold text-yellow-600">{scanStats.mediumRisks}</div>
              <div className="text-xs text-yellow-700">Medium</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-yellow-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xl font-bold text-green-600">{scanStats.lowRisks}</div>
              <div className="text-xs text-green-700">Low</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-green-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xl font-bold text-blue-600">{scanStats.confidence}%</div>
              <div className="text-xs text-blue-700">Confidence</div>
              {scanStatus.isScanning && (
                <div className="text-xs text-blue-600 mt-1 animate-pulse">Live</div>
              )}
            </div>
          </div>
          
          {scanStatus.isScanning && (
            <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-orange-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm text-orange-800 font-medium">Scan in progress - Statistics updating in real-time</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan Progress */}
      {scanProgress.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <span>Port Scan Results</span>
            </h3>
            <div className="flex gap-2">
              <button
                onClick={downloadResults}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download PDF</span>
              </button>
              <button
                onClick={downloadHTMLResults}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download HTML</span>
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
            <div className="space-y-6">
              {/* Success Message */}
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 font-medium">Port scan completed successfully</p>
                </div>
                <p className="text-green-700 text-sm">
                  Analysis completed for target: <span className="font-mono font-medium">{target}</span>
                </p>
              </div>
              
              {/* Results Summary */}
              {scanResults.findings && Array.isArray(scanResults.findings) && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h4 className="font-medium text-orange-900 mb-4 flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Scan Summary</span>
                  </h4>
                  
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-green-200">
                      <div className="text-2xl font-bold text-green-600">
                        {scanResults.findings.filter(port => port.state === 'open').length}
                      </div>
                      <div className="text-sm text-green-700">Open Ports</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200">
                      <div className="text-2xl font-bold text-gray-600">
                        {scanResults.findings.filter(port => port.state === 'closed').length}
                      </div>
                      <div className="text-sm text-gray-700">Closed Ports</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-yellow-200">
                      <div className="text-2xl font-bold text-yellow-600">
                        {scanResults.findings.filter(port => port.state === 'filtered').length}
                      </div>
                      <div className="text-sm text-yellow-700">Filtered Ports</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-red-200">
                      <div className="text-2xl font-bold text-red-600">
                        {scanResults.findings.filter(port => port.severity === 'Critical').length}
                      </div>
                      <div className="text-sm text-red-700">Critical</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-orange-200">
                      <div className="text-2xl font-bold text-orange-600">
                        {scanResults.findings.filter(port => port.severity === 'High').length}
                      </div>
                      <div className="text-sm text-orange-700">High Risk</div>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-slate-800 rounded-lg border border-blue-200">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round(scanResults.findings.reduce((sum, port) => sum + (port.confidence || 0), 0) / scanResults.findings.length)}%
                      </div>
                      <div className="text-sm text-blue-700">Confidence</div>
                    </div>
                  </div>
                  
                  {scanResults.summary && (
                    <div className="mt-4 p-3 bg-white dark:bg-slate-800 rounded-lg border border-orange-200">
                      <p className="text-orange-800 text-sm">{scanResults.summary}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Detailed Results by Severity Sections */}
              {scanResults.findings && Array.isArray(scanResults.findings) && scanResults.findings.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                  <div className="bg-gray-50 dark:bg-slate-800 px-6 py-4 border-b border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center space-x-2">
                          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Port Scan Results</span>
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          Showing {getFilteredPorts().length} of {scanResults.findings.length} ports • 
                          <span className="text-green-600 font-medium"> {scanResults.findings.filter(p => p.state === 'open').length} open</span> • 
                          <span className="text-gray-600 font-medium"> {scanResults.findings.filter(p => p.state === 'closed').length} closed</span> • 
                          <span className="text-yellow-600 font-medium"> {scanResults.findings.filter(p => p.state === 'filtered').length} filtered</span>
                        </p>
                      </div>
                      
                      {/* Filter Controls */}
                      <div className="flex flex-wrap gap-3 mt-4">
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">State:</label>
                          <select 
                            value={stateFilter} 
                            onChange={(e) => setStateFilter(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="all">All States</option>
                            <option value="open">Open</option>
                            <option value="closed">Closed</option>
                            <option value="filtered">Filtered</option>
                          </select>
                    </div>
                        
                        <div className="flex items-center space-x-2">
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Risk:</label>
                          <select 
                            value={riskFilter} 
                            onChange={(e) => setRiskFilter(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="all">All Risks</option>
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                          </select>
                  </div>
                  
                        {(stateFilter !== 'all' || riskFilter !== 'all') && (
                          <button
                            onClick={() => {
                              setStateFilter('all')
                              setRiskFilter('all')
                            }}
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
                          >
                            Clear Filters
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Port state grouped sections */}
                  <div className="divide-y divide-gray-200 dark:divide-slate-700">
                    {['open', 'closed', 'filtered'].map(state => {
                      const items = getFilteredPorts().filter(p => p.state === state)
                      if (items.length === 0) return null
                      
                      const stateConfig = {
                        open: { label: 'Open Ports', color: 'green', bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-700' },
                        closed: { label: 'Closed Ports', color: 'gray', bgColor: 'bg-gray-50', borderColor: 'border-gray-200', textColor: 'text-gray-700' },
                        filtered: { label: 'Filtered Ports', color: 'yellow', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', textColor: 'text-yellow-700' }
                      }
                      
                      const config = stateConfig[state]
                      
                      return (
                        <div key={state} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${config.bgColor} ${config.borderColor} ${config.textColor}`}>
                                {config.label}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">{items.length} ports</span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Port</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Protocol</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">State</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Service</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">Version</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-48">Banner</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">CVEs</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">Confidence</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-64">Recommendations</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200">
                        {items.sort((a,b)=>a.port-b.port).map((port, index) => (
                                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                                    <td className="px-3 py-2">
                                      <div className="flex items-center">
                                        <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${
                                          state === 'open' ? (port.severity === 'Critical' ? 'bg-red-100' :
                                          port.severity === 'High' ? 'bg-orange-100' :
                                          port.severity === 'Medium' ? 'bg-yellow-100' :
                                          'bg-green-100') :
                                          state === 'closed' ? 'bg-gray-100' :
                                          'bg-yellow-100'
                                        }`}>
                                          <span className={`text-xs font-semibold ${
                                            state === 'open' ? (port.severity === 'Critical' ? 'text-red-800' :
                                            port.severity === 'High' ? 'text-orange-800' :
                                            port.severity === 'Medium' ? 'text-yellow-800' :
                                            'text-green-800') :
                                            state === 'closed' ? 'text-gray-800' :
                                            'text-yellow-800'
                                          }`}>
                                            {port.port}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100 font-mono">{port.protocol ? port.protocol.toUpperCase() : 'TCP'}</td>
                                    <td className="px-3 py-2">
                                      <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold rounded-full ${
                                        state === 'open' ? 'bg-green-100 text-green-800' :
                                        state === 'closed' ? 'bg-gray-100 text-gray-800' :
                                        'bg-yellow-100 text-yellow-800'
                                      }`}>
                                        {state.toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      <div className="flex items-center space-x-1">
                                        <span className="text-sm">{getServiceIcon(port.service)}</span>
                                        <span className="truncate">{port.service || 'Unknown'}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      <div className="break-words max-w-32" title={port.version}>{port.version || 'Unknown'}</div>
                                      {state === 'open' && (() => {
                                        const key = `${port.port}-${port.service || 'unknown'}`
                                        const isExpanded = expandedCritical.has(key)
                                        const severityColor = {
                                          'Critical': 'text-red-700 bg-red-50 border-red-200',
                                          'High': 'text-orange-700 bg-orange-50 border-orange-200',
                                          'Medium': 'text-yellow-700 bg-yellow-50 border-yellow-200',
                                          'Low': 'text-green-700 bg-green-50 border-green-200'
                                        }
                                        const severityIcon = {
                                          'Critical': '🚨',
                                          'High': '⚠️',
                                          'Medium': '⚡',
                                          'Low': 'ℹ️'
                                        }
                                        return (
                  <div className={`mt-1 text-xs border rounded p-1.5 whitespace-pre-wrap break-words ${severityColor[port.severity] || 'text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700'}`} style={{maxWidth:'28rem'}}>
                                            <div className="font-semibold mb-1 flex items-center gap-1">
                                              <span className="text-xs">{severityIcon[port.severity] || 'ℹ️'}</span>
                                              <span className="text-xs">Risk: {port.severity}</span>
                                            </div>
                                            <div className="text-xs" style={isExpanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                              {port.description || 'Service analysis in progress...'}
                                            </div>
                                            <button
                                              onClick={() => toggleCriticalExpand(key)}
                                              className={`mt-1 text-xs underline hover:no-underline ${severityColor[port.severity]?.split(' ')[0] || 'text-gray-700'}`}
                                            >
                                              {isExpanded ? 'Less' : 'More'}
                                            </button>
                                          </div>
                                        )
                                      })()}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      <div className="whitespace-pre-wrap break-words max-w-48" title={port.banner || ''}>{port.banner || 'N/A'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      {port.cve_links && port.cve_links.length > 0 ? (
                                        <div className="space-y-0.5">
                                          {port.cve_links.slice(0, 2).map((cve, idx) => (
                                            <div key={idx}>
                                              <a href={`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cve}`} 
                                                 target="_blank" 
                                                 rel="noopener noreferrer"
                                                 className="text-blue-600 hover:text-blue-800 underline text-xs">
                                                {cve}
                                              </a>
                                            </div>
                                          ))}
                                          {port.cve_links.length > 2 && (
                                            <div className="text-xs text-gray-500">+{port.cve_links.length - 2} more</div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 text-xs">None</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      <div className="flex items-center">
                                        <div className="w-12 bg-gray-200 rounded-full h-1.5 mr-2">
                                          <div className={`${port.confidence >= 80 ? 'bg-green-500' : port.confidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'} h-1.5 rounded-full`} style={{ width: `${port.confidence || 0}%` }}></div>
                                        </div>
                                        <span className="text-xs text-gray-600">{port.confidence || 0}%</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-gray-900 dark:text-gray-100">
                                      <div className="whitespace-pre-wrap break-words max-w-64" title={port.recommendation || ''}>
                                        {port.recommendation || 'No specific recommendations available.'}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {getFilteredPorts().length === 0 && portFilter !== 'all' && (
                    <div className="bg-gray-50 dark:bg-slate-800 px-6 py-8 text-center">
                      <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">No {portFilter} ports found</p>
                    </div>
                  )}
                  
                  {getFilteredPorts().length > 10 && (
                    <div className="bg-gray-50 dark:bg-slate-800 px-6 py-3 border-t border-gray-200 dark:border-slate-700">
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        Showing {getFilteredPorts().length} {portFilter === 'all' ? 'total' : portFilter} ports
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* Information Panel - Only show when no scan results */}
      {!scanResults && (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
          <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>About Port Scanning</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">What is Port Scanning?</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Port scanning is a method used to identify open ports and services running on a target system. 
              It helps security professionals understand what services are available and potentially vulnerable.
            </p>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Common Ports</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
              <div>• Port 22: SSH</div>
              <div>• Port 80: HTTP</div>
              <div>• Port 443: HTTPS</div>
              <div>• Port 21: FTP</div>
              <div>• Port 25: SMTP</div>
              <div>• Port 53: DNS</div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Scan Types</h4>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>TCP Connect Scan - Most reliable</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                <span>SYN Scan - Fast and stealthy</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>UDP Scan - For UDP services</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span>Service Detection - Version info</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Banner Modal */}
      {showBannerModal && selectedPort && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Banner Information - Port {selectedPort.port}
              </h3>
              <button
                onClick={() => setShowBannerModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="bg-gray-100 dark:bg-slate-700 rounded-lg p-4 font-mono text-sm">
              <pre className="whitespace-pre-wrap">{selectedPort.banner}</pre>
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(selectedPort.banner)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={() => setShowBannerModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Script Findings Modal */}
      {showScriptModal && selectedPort && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Script Findings - Port {selectedPort.port}
              </h3>
              <button
                onClick={() => setShowScriptModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {selectedPort.script_findings && selectedPort.script_findings.length > 0 ? (
                selectedPort.script_findings.map((script, index) => (
                  <div key={index} className="bg-gray-100 dark:bg-slate-700 rounded-lg p-3">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 mb-1">
                      {script.id}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {script.output}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No script findings available
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => {
                  const allScripts = selectedPort.script_findings?.map(s => `${s.id}: ${s.output}`).join('\n') || ''
                  navigator.clipboard.writeText(allScripts)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Copy All
              </button>
              <button
                onClick={() => setShowScriptModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CVE Information Modal */}
      {showCVEModal && selectedPort && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                CVE Information - Port {selectedPort.port}
              </h3>
              <button
                onClick={() => setShowCVEModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              {selectedPort.cve_links && selectedPort.cve_links.length > 0 ? (
                selectedPort.cve_links.map((cve, index) => (
                  <div key={index} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                    <div className="font-semibold text-sm text-red-900 dark:text-red-100 mb-1">
                      {cve}
                    </div>
                    <div className="text-sm text-red-700 dark:text-red-300">
                      Potential vulnerability in {selectedPort.service} {selectedPort.version}
                    </div>
                    <div className="mt-2">
                      <a
                        href={`https://cve.mitre.org/cgi-bin/cvename.cgi?name=${cve}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View Details →
                      </a>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 dark:text-gray-400 text-center py-4">
                  No CVE information available
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => {
                  const allCVEs = selectedPort.cve_links?.join('\n') || ''
                  navigator.clipboard.writeText(allCVEs)
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Copy All
              </button>
              <button
                onClick={() => setShowCVEModal(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PortScanning