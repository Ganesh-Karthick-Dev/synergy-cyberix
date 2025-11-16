import { useState, useEffect, useRef } from 'react'
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
  const { registerScan, updateScan, completeScan, stopScan, getScanIdForView, reconnectToScan, activeScans } = useGlobalScanState()
  // Removed useToast - no snack bars in server scan tab
  const [showDetails, setShowDetails] = useState(false)
  const [selectedPort, setSelectedPort] = useState(null)
  const [tgptConvertedResults, setTgptConvertedResults] = useState(null)
  const [isLoadingTgpt, setIsLoadingTgpt] = useState(false)
  const [tgptConversionComplete, setTgptConversionComplete] = useState(false)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiError, setAiError] = useState(null)
  const currentScanIdRef = useRef(null)
  const aiSuggestionRef = useRef(null)

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

  // Convert server scan results using tgpt (not needed - TGPT is done in main.js)
  const handleTgptConversion = async (rawJsonData) => {
    // TGPT conversion is done in main.js for each command
    // This function is kept for compatibility but should not be called
    console.log('⚠️ handleTgptConversion called but TGPT conversion is done in main.js')
    setTgptConversionComplete(true)
  }

  // Handle AI Suggestion button click (using Grok API)
  const handleAISuggestion = async () => {
    if (!scanResults) {
      alert('No scan results available')
      return
    }
    
    setIsLoadingTgpt(true)
    setAiError(null)
    setAiSuggestions(null)
    
    // Scroll to AI Suggestion section
    setTimeout(() => {
      if (aiSuggestionRef.current) {
        aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
    
    try {
      // Import Grok API
      const { getAISuggestions } = await import('../utils/grokApi')
      
      // Get the combined raw results for AI analysis
      const rawJsonData = scanResults?.results?.json?.rawResults ? 
        JSON.stringify(scanResults.results.json.rawResults, null, 2) : 
        JSON.stringify(scanResults, null, 2)
      
      // Call Grok API
      const suggestions = await getAISuggestions(
        'server-scan',
        'Server Scan',
        scanResults,
        rawJsonData,
        scanResults.target || target || 'Unknown'
      )
      
      setAiSuggestions(suggestions)
      
      // Scroll to AI Suggestion section after results are loaded
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 500)
    } catch (error) {
      console.error('Error fetching AI suggestions:', error)
      setAiError(error.message || 'Failed to fetch AI suggestions. Please try again.')
      alert(error.message || 'Failed to fetch AI suggestions. Please try again.')
      
      // Scroll to AI Suggestion section even on error
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } finally {
      setIsLoadingTgpt(false)
    }
  }

  // Handle PDF Export
  const handleExportPDF = async () => {
    if (!scanResults) {
      alert('No scan results to export')
      return
    }

    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const borderMargin = 5 // Small border margin
      const maxWidth = pageWidth - 2 * margin
      const footerY = pageHeight - 15
      let yPos = 20
      let isFirstPage = true

      // Helper function to draw page border - make it visible
      const drawPageBorder = () => {
        doc.setDrawColor(100, 100, 100) // Darker gray border for visibility
        doc.setLineWidth(1) // Thicker line for visibility
        doc.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      }

      // Helper function to draw footer
      const drawFooter = (pageNum, totalPages) => {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(128, 128, 128)
        // Left footer
        doc.text('Cyberix - A Webnox Product', margin, footerY, { align: 'left' })
        // Right footer - page number
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
      }

      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace = 10) => {
        if (yPos + requiredSpace > footerY - 10) {
          // Draw border and footer on current page before adding new one
          drawPageBorder()
          const currentPage = doc.internal.getNumberOfPages()
          drawFooter(currentPage, currentPage) // Will update total later
          
          doc.addPage()
          isFirstPage = false
          yPos = 20
        }
      }

      // Calculate scan metadata
      const startTime = scanTimer?.startTime ? new Date(scanTimer.startTime) : new Date()
      const completedTime = scanTimer?.completedTime || new Date()
      const duration = scanTimer?.elapsed || (completedTime - startTime) / 1000 // in seconds
      const durationMinutes = Math.floor(duration / 60)
      const durationSeconds = Math.floor(duration % 60)
      const durationText = `${durationMinutes}m ${durationSeconds}s`
      
      // Get analyzed results first
      const analyzedResults = scanResults?.results?.json?.analyzedResults
      
      // First Page Header - Scan Information
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      const scanName = analyzedResults?.nikto?.scanName || 'Server Security Scan'
      const scanDescription = analyzedResults?.nikto?.scanDescription || 'Comprehensive web server security assessment using Nikto scanner to identify vulnerabilities, misconfigurations, and security issues.'
      doc.text(scanName, margin, yPos, { align: 'left' })
      yPos += 8

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      
      // Scan Description
      if (scanDescription) {
        checkNewPage(10)
        doc.setFont('helvetica', 'italic')
        const descLines = doc.splitTextToSize(scanDescription, maxWidth)
        descLines.forEach(line => {
          checkNewPage(5)
          doc.text(line, margin, yPos)
          yPos += 5
        })
        yPos += 3
      }
      
      doc.setFont('helvetica', 'normal')
      
      // Scan Info Table with proper date/time formatting
      const infoItems = [
        { label: 'Scan Name:', value: scanName },
        { label: 'Total Time Taken:', value: durationText },
        { label: 'Started Date & Time:', value: formatDateTime(startTime) },
        { label: 'Completed Date & Time:', value: formatDateTime(completedTime) },
        { label: 'URL Tested:', value: scanResults.target || target || 'N/A' }
      ]

      infoItems.forEach((item, idx) => {
        checkNewPage(7)
        doc.setFont('helvetica', 'bold')
        doc.text(item.label, margin, yPos)
        doc.setFont('helvetica', 'normal')
        const valueX = margin + 50
        const valueLines = doc.splitTextToSize(item.value, maxWidth - 50)
        valueLines.forEach((line, lineIdx) => {
          doc.text(line, valueX, yPos + (lineIdx * 5))
        })
        yPos += Math.max(5, valueLines.length * 5) + 2
      })
      
      yPos += 5

      if (analyzedResults && Object.keys(analyzedResults).length > 0) {
        // Command configs - Only Nikto
        const commandConfigs = [
          { key: 'nikto', title: 'Server Security Scan', description: scanDescription }
        ]

        // Export each command result
        for (const config of commandConfigs) {
          const analyzed = analyzedResults[config.key]
          if (!analyzed || analyzed.error) continue

          checkNewPage(20)
          yPos += 5

          // Command Title and Description
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          doc.text(config.title, margin, yPos)
          yPos += 8
          
          if (config.description) {
            doc.setFontSize(10)
            doc.setFont('helvetica', 'italic')
            const descLines = doc.splitTextToSize(config.description, maxWidth)
            descLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin, yPos)
              yPos += 5
            })
            yPos += 3
          }

          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')

          // Scan Summary - With Total Findings, Recommendations, Vulnerabilities, and Status
          if (analyzed.summary) {
            let summaryData = analyzed.summary;
            if (typeof summaryData === 'string') {
              try {
                const trimmed = summaryData.trim();
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                    (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                  summaryData = JSON.parse(trimmed);
                }
              } catch (e) {
                summaryData = null;
              }
            }
            
            if (summaryData && typeof summaryData === 'object' && !Array.isArray(summaryData)) {
              checkNewPage(20)
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(12)
              doc.text('Scan Summary', margin, yPos)
              yPos += 8
              
              const totalFindings = summaryData.totalFindings || 
                                    (Array.isArray(analyzed.findings) ? analyzed.findings.length : 0) ||
                                    (analyzed.findings && typeof analyzed.findings === 'object' ? Object.keys(analyzed.findings).length : 0) ||
                                    0;
              const totalRecommendations = summaryData.totalRecommendations || 
                                           (Array.isArray(analyzed.recommendations) ? analyzed.recommendations.length : 0) ||
                                           0;
              const totalVulnerabilities = summaryData.totalVulnerabilities || 
                                           (Array.isArray(analyzed.vulnerabilities) ? analyzed.vulnerabilities.length : 0) ||
                                           0;
              const status = summaryData.status || summaryData.Status || 'moderate';
              
              doc.setFontSize(10)
              doc.setFont('helvetica', 'normal')
              
              checkNewPage(6)
              doc.text(`Total Findings: ${totalFindings}`, margin + 5, yPos)
              yPos += 6
              checkNewPage(6)
              doc.text(`Total Recommendations: ${totalRecommendations}`, margin + 5, yPos)
              yPos += 6
              checkNewPage(6)
              doc.text(`Total Vulnerabilities: ${totalVulnerabilities}`, margin + 5, yPos)
              yPos += 6
              checkNewPage(6)
              doc.setFont('helvetica', 'bold')
              doc.text(`Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`, margin + 5, yPos)
              doc.setFont('helvetica', 'normal')
              yPos += 8
            }
          }

          // Helper function to parse and format data
          const parseAndFormat = (data) => {
            if (!data) return null;
            if (typeof data === 'object' && !Array.isArray(data)) {
              return data;
            }
            if (typeof data === 'string') {
              const trimmed = data.trim();
              if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                  (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                  return JSON.parse(trimmed);
                } catch (e) {
                  return { _text: data };
                }
              }
              return { _text: data };
            }
            return { _text: String(data) };
          };

          // What We Did (Analysis Overview)
          if (analyzed.whatWeDid) {
            const whatWeDidData = parseAndFormat(analyzed.whatWeDid);
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.text('Analysis Overview', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            
            if (whatWeDidData._text) {
              const lines = doc.splitTextToSize(whatWeDidData._text, maxWidth)
              lines.forEach(line => {
                checkNewPage(5)
                doc.text(line, margin, yPos)
                yPos += 5
              })
            } else {
              Object.entries(whatWeDidData)
                .filter(([key]) => {
                  const keyLower = key.toLowerCase();
                  return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                         !keyLower.includes('command') && 
                         !keyLower.includes('cmd');
                })
                .forEach(([key, value]) => {
                  checkNewPage(6)
                  const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                  const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                  lines.forEach(line => {
                    checkNewPage(5)
                    doc.text(line, margin + 5, yPos)
                    yPos += 5
                  })
                })
            }
            yPos += 3
          }

          // What We Got (Key Findings)
          if (analyzed.whatWeGot) {
            const whatWeGotData = parseAndFormat(analyzed.whatWeGot);
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.text('Key Findings', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            
            if (whatWeGotData._text) {
              const lines = doc.splitTextToSize(whatWeGotData._text, maxWidth)
              lines.forEach(line => {
                checkNewPage(5)
                doc.text(line, margin, yPos)
                yPos += 5
              })
            } else {
              Object.entries(whatWeGotData)
                .filter(([key]) => {
                  const keyLower = key.toLowerCase();
                  return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                         !keyLower.includes('command') && 
                         !keyLower.includes('cmd');
                })
                .forEach(([key, value]) => {
                  checkNewPage(6)
                  const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                  
                  // Parse JSON strings in values
                  let parsedValue = value;
                  if (typeof value === 'string') {
                    const trimmed = value.trim();
                    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                      try {
                        parsedValue = JSON.parse(trimmed);
                      } catch (e) {
                        parsedValue = value;
                      }
                    }
                  }
                  
                  // Format arrays and objects
                  let displayValue = parsedValue;
                  if (Array.isArray(parsedValue)) {
                    displayValue = parsedValue.map((item, idx) => {
                      if (typeof item === 'object' && item !== null) {
                        return JSON.stringify(item)
                      }
                      return String(item)
                    }).join(', ')
                  } else if (typeof parsedValue === 'object' && parsedValue !== null) {
                    displayValue = JSON.stringify(parsedValue, null, 2)
                  } else {
                    displayValue = String(parsedValue)
                  }
                  
                  const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                  lines.forEach(line => {
                    checkNewPage(5)
                    doc.text(line, margin + 5, yPos)
                    yPos += 5
                  })
                })
            }
            yPos += 3
          }

          // Security Findings
          if (analyzed.findings && Array.isArray(analyzed.findings) && analyzed.findings.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.text('Security Findings', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            analyzed.findings.forEach((finding, idx) => {
              checkNewPage(15)
              doc.setFont('helvetica', 'bold')
              doc.text(`${idx + 1}. ${finding.type || finding.name || `Finding ${idx + 1}`}`, margin + 5, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              
              // Display all properties (filter out command-related keys)
              Object.entries(finding).forEach(([key, value]) => {
                const keyLower = key.toLowerCase();
                if (['type', 'name'].includes(keyLower) || value === null || value === undefined) return
                if (['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) ||
                    keyLower.includes('command') || keyLower.includes('cmd')) return
                
                checkNewPage(6)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                lines.forEach(line => {
                  checkNewPage(5)
                  doc.text(line, margin + 10, yPos)
                  yPos += 5
                })
              })
              yPos += 3
            })
            yPos += 3
          }

          // Security Recommendations
          if (analyzed.recommendations && Array.isArray(analyzed.recommendations) && analyzed.recommendations.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.text('Security Recommendations', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            analyzed.recommendations.forEach((rec, idx) => {
              checkNewPage(6)
              const recText = typeof rec === 'string' ? rec : (rec.description || rec.recommendation || rec.text || JSON.stringify(rec))
              const lines = doc.splitTextToSize(`${idx + 1}. ${recText}`, maxWidth - 10)
              lines.forEach(line => {
                checkNewPage(5)
                doc.text(line, margin + 5, yPos)
                yPos += 5
              })
            })
            yPos += 3
          }

          // Security Vulnerabilities
          if (analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities) && analyzed.vulnerabilities.length > 0) {
            checkNewPage(15)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(11)
            doc.text('Security Vulnerabilities', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            analyzed.vulnerabilities.forEach((vuln, idx) => {
              checkNewPage(15)
              doc.setFont('helvetica', 'bold')
              doc.text(`${idx + 1}. ${vuln.name || `Vulnerability ${idx + 1}`}`, margin + 5, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              
              // Display all properties including solution
              Object.entries(vuln).forEach(([key, value]) => {
                if (['name'].includes(key.toLowerCase()) || value === null || value === undefined) return
                
                checkNewPage(6)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                
                // Handle solution object specially
                if (key.toLowerCase() === 'solution' && typeof value === 'object') {
                  doc.setFont('helvetica', 'bold')
                  doc.text(`${formattedKey}:`, margin + 10, yPos)
                  yPos += 5
                  doc.setFont('helvetica', 'normal')
                  
                  if (value.description) {
                    const descLines = doc.splitTextToSize(value.description, maxWidth - 15)
                    descLines.forEach(line => {
                      checkNewPage(5)
                      doc.text(line, margin + 15, yPos)
                      yPos += 5
                    })
                  }
                  
                  if (value.steps && Array.isArray(value.steps)) {
                    value.steps.forEach((step, stepIdx) => {
                      checkNewPage(5)
                      const stepText = typeof step === 'string' ? step : JSON.stringify(step)
                      const stepLines = doc.splitTextToSize(`  ${stepIdx + 1}. ${stepText}`, maxWidth - 15)
                      stepLines.forEach(line => {
                        checkNewPage(5)
                        doc.text(line, margin + 15, yPos)
                        yPos += 5
                      })
                    })
                  } else if (typeof value === 'object') {
                    const solutionText = JSON.stringify(value, null, 2)
                    const solutionLines = doc.splitTextToSize(solutionText, maxWidth - 15)
                    solutionLines.forEach(line => {
                      checkNewPage(5)
                      doc.text(line, margin + 15, yPos)
                      yPos += 5
                    })
                  }
                } else {
                  const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                  const lines = doc.splitTextToSize(`${formattedKey}: ${displayValue}`, maxWidth - 10)
                  lines.forEach(line => {
                    checkNewPage(5)
                    doc.text(line, margin + 10, yPos)
                    yPos += 5
                  })
                }
              })
              yPos += 3
            })
            yPos += 3
          }
        }
      }

      // Draw borders and footers on all pages
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        drawPageBorder()
        drawFooter(i, totalPages)
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
          
          // Note: Notifications are handled by GlobalScanContext.jsx to avoid duplicates
          
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

  // Command configurations for server scan - Only Nikto
  const commandConfigs = [
    {
      key: 'nikto',
      title: 'Server Security Scan',
      description: 'Comprehensive web server security assessment using Nikto scanner to identify vulnerabilities, misconfigurations, and security issues.',
      icon: '🔍'
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelpDialog(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Server-Level Scanning</h3>
              <button
                onClick={() => setShowHelpDialog(false)}
                className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* What is Server-Level Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  What is Server-Level Scanning?
                </h4>
                <p className="text-orange-800 dark:text-orange-200 leading-relaxed text-lg">
                  Server-level scanning is a systematic, automated inspection of a server and the services it exposes to the internet. The goal is to discover:
                </p>
                <ul className="list-none space-y-3 ml-4">
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-orange-800 dark:text-orange-200">which services and ports are open (e.g., web server, SSH, database),</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-orange-800 dark:text-orange-200">which software and versions are running,</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-orange-800 dark:text-orange-200">obvious misconfigurations or known vulnerable components (e.g., outdated SSL/TLS, vulnerable server modules),</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 mt-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-orange-800 dark:text-orange-200">surface details that an attacker could use to probe further.</span>
                  </li>
                </ul>
                <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded-r-lg mt-4">
                  <p className="text-orange-800 dark:text-orange-200 italic leading-relaxed">
                    Think of it like a health check and vulnerability reconnaissance performed from the outside-in: we identify weak or exposed places so you can fix them before someone else finds them.
                  </p>
                </div>
              </div>

              {/* Why do we need Server-Level Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  Why do we need Server-Level Scanning?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Prevent breaches before they happen
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Finding misconfigurations, old software, or exposed admin interfaces early reduces the chance of a successful attack.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Prioritize fixes
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Scans help you focus resources on the highest-risk problems (e.g., an exposed admin page vs. a minor header misconfiguration).
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Meet compliance and audits
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Many standards (PCI, ISO, etc.) expect regular scans and evidence of remediation.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Improve incident response
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Knowing your server's attack surface helps you respond faster and more accurately if an incident occurs.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800 md:col-span-2">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      Maintain customer trust
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Regular scanning and remediation show due diligence to customers and partners.
                    </p>
                  </div>
                </div>
              </div>

              {/* How we help */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  How we help — our Server-Level Scanning service (high level)
                </h4>
                <p className="text-orange-800 dark:text-orange-200 leading-relaxed">
                  We run a carefully controlled and authorized set of reconnaissance and scanning tools (the same class of tools used by defenders and penetration testers) against your server(s). For each scan we:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Confirm written authorization</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">No scans are run without your explicit permission.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Perform discovery</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Identify live hosts, open ports, and running services.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Fingerprint software</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Determine server software and versions (web server, application server, TLS library).</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Check common web/vuln issues</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Automated checks for insecure configs, outdated components, SSL/TLS weaknesses, and common web server vulnerabilities.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Collect and collate results</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Create a clear, actionable report with severity, explanation, and recommended fixes.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      6
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Deliver the report</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Provide the report and (optionally) a walkthrough session to explain findings and remediation steps.</p>
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
            <div className="space-y-6 w-full max-w-full overflow-x-hidden box-border">
              {/* 1. Scan Completion Status */}
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 dark:text-green-200 font-medium">Server scan completed successfully</p>
                </div>
                <p className="text-green-700 dark:text-green-300 text-sm">
                  Analysis completed for target: <span className="font-mono font-medium">{scanResults.target || target}</span>
                  {scanResults.extractedIP && (
                    <span className="ml-2">(IP: <span className="font-mono font-medium">{scanResults.extractedIP}</span>)</span>
                  )}
                </p>
              </div>

              {/* Server Scan Security Report Section Header */}
              {scanResults?.results?.json?.analyzedResults && Object.keys(scanResults.results.json.analyzedResults).length > 0 && (
                <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-gray-900 dark:text-white">Server Scan Security Report</h3>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleExportPDF}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export
                      </button>
                      <button
                        onClick={handleAISuggestion}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI Suggestion
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Command Results - Display using commandConfigs */}
              {tgptConvertedResults && tgptConvertedResults.commandResults && Object.keys(tgptConvertedResults.commandResults).length > 0 && (
                <div className="space-y-6 w-full max-w-full overflow-x-hidden box-border">
                  {commandConfigs.map(config => {
                    const analyzed = tgptConvertedResults.commandResults[config.key]
                    if (!analyzed) return null
                    
                    // Show error message if TGPT parsing failed
                    if (analyzed.error) {
                      return (
                        <div key={config.key} className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-200 dark:border-yellow-800 rounded-xl p-6 shadow-lg">
                          <div className="flex items-start gap-4 mb-4 pb-4 border-b border-yellow-200 dark:border-yellow-800">
                            <div className="p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl shadow-lg">
                              <span className="text-4xl">{config.icon}</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="text-2xl font-extrabold text-yellow-900 dark:text-yellow-100 mb-3">{config.title}</h4>
                              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">{config.description}</p>
                            </div>
                          </div>
                          <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4 border border-yellow-200 dark:border-yellow-800">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-2">⚠️ TGPT Analysis Failed</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{analyzed.error}</p>
                            {analyzed.raw && (
                              <details className="mt-3">
                                <summary className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer">View Raw Result</summary>
                                <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto max-h-60">
                                  {analyzed.raw.substring(0, 1000)}{analyzed.raw.length > 1000 ? '...' : ''}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      )
                    }
                    
                    return (
                      <div key={config.key} className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl p-6 shadow-lg w-full max-w-full overflow-hidden box-border">
                        <div className="flex items-start gap-4 mb-4 pb-4 border-b border-orange-200 dark:border-orange-800 w-full max-w-full overflow-hidden">
                          <div className="p-4 bg-orange-100 dark:bg-orange-900/30 rounded-2xl shadow-lg flex-shrink-0">
                            <span className="text-4xl">{config.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-2xl font-extrabold text-orange-900 dark:text-orange-100 mb-3 break-words">{config.title}</h4>
                            <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed break-words">{config.description}</p>
                          </div>
                        </div>
                        
                        {/* Scan Summary - With Total Findings, Recommendations, Vulnerabilities, and Status */}
                        {analyzed.summary && (() => {
                          // Parse summary if it's a string
                          let summaryData = analyzed.summary;
                          if (typeof summaryData === 'string') {
                            try {
                              const trimmed = summaryData.trim();
                              if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                  (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                summaryData = JSON.parse(trimmed);
                              }
                            } catch (e) {
                              return null;
                            }
                          }
                          
                          if (!summaryData || typeof summaryData !== 'object' || Array.isArray(summaryData)) {
                            return null;
                          }
                          
                          // Extract specific summary fields
                          const totalFindings = summaryData.totalFindings || 
                                                (Array.isArray(analyzed.findings) ? analyzed.findings.length : 0) ||
                                                (analyzed.findings && typeof analyzed.findings === 'object' ? Object.keys(analyzed.findings).length : 0) ||
                                                0;
                          const totalRecommendations = summaryData.totalRecommendations || 
                                                       (Array.isArray(analyzed.recommendations) ? analyzed.recommendations.length : 0) ||
                                                       0;
                          const totalVulnerabilities = summaryData.totalVulnerabilities || 
                                                       (Array.isArray(analyzed.vulnerabilities) ? analyzed.vulnerabilities.length : 0) ||
                                                       0;
                          const status = summaryData.status || summaryData.Status || 'moderate';
                          
                          // Determine status color
                          const statusColor = status.toLowerCase() === 'safe' ? 'text-green-600 dark:text-green-400' :
                                              status.toLowerCase() === 'high risk' || status.toLowerCase() === 'highrisk' ? 'text-red-600 dark:text-red-400' :
                                              'text-orange-600 dark:text-orange-400';
                          const statusBg = status.toLowerCase() === 'safe' ? 'bg-green-100 dark:bg-green-900/30' :
                                          status.toLowerCase() === 'high risk' || status.toLowerCase() === 'highrisk' ? 'bg-red-100 dark:bg-red-900/30' :
                                          'bg-orange-100 dark:bg-orange-900/30';
                          
                          return (
                            <div className="mb-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 border-2 border-orange-200 dark:border-orange-800 shadow-lg">
                              <div className="flex items-center gap-2 mb-4">
                                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <h5 className="text-lg font-bold text-orange-900 dark:text-orange-100">Scan Summary</h5>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-orange-200 dark:border-orange-700 shadow-sm">
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    Total Findings
                                  </div>
                                  <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                    {totalFindings}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-orange-200 dark:border-orange-700 shadow-sm">
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    Total Recommendations
                                  </div>
                                  <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                    {totalRecommendations}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-orange-200 dark:border-orange-700 shadow-sm">
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    Total Vulnerabilities
                                  </div>
                                  <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                                    {totalVulnerabilities}
                                  </div>
                                </div>
                                <div className={`bg-white dark:bg-gray-800 rounded-lg p-4 border border-orange-200 dark:border-orange-700 shadow-sm ${statusBg}`}>
                                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    Status
                                  </div>
                                  <div className={`text-2xl font-bold ${statusColor}`}>
                                    {status.charAt(0).toUpperCase() + status.slice(1)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* What We Did & What We Got - Show only once, after Summary */}
                        {(analyzed.whatWeDid || analyzed.whatWeGot) && (() => {
                          // Helper function to parse and format data
                          const parseAndFormat = (data) => {
                            if (!data) return null;
                            
                            // If it's already an object, return it
                            if (typeof data === 'object' && !Array.isArray(data)) {
                              return data;
                            }
                            
                            // If it's a string, try to parse as JSON
                            if (typeof data === 'string') {
                              // Check if it looks like JSON
                              const trimmed = data.trim();
                              if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                  (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                try {
                                  return JSON.parse(trimmed);
                                } catch (e) {
                                  // If parsing fails, return as plain text
                                  return { _text: data };
                                }
                              }
                              // If it's plain text, return as text
                              return { _text: data };
                            }
                            
                            return { _text: String(data) };
                          };
                          
                          const whatWeDidData = parseAndFormat(analyzed.whatWeDid);
                          const whatWeGotData = parseAndFormat(analyzed.whatWeGot);
                          
                          return (
                            <div className="mb-8 space-y-4">
                              {whatWeDidData && (
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-5 border-2 border-blue-200 dark:border-blue-800 shadow-md">
                                  <div className="flex items-center gap-2 mb-3">
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <h5 className="text-sm font-bold text-blue-900 dark:text-blue-100">Analysis Overview</h5>
                                  </div>
                                  {whatWeDidData._text ? (
                                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                                      {whatWeDidData._text}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {Object.entries(whatWeDidData)
                                        .filter(([key]) => {
                                          const keyLower = key.toLowerCase();
                                          return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                                 !keyLower.includes('command') && 
                                                 !keyLower.includes('cmd');
                                        })
                                        .map(([key, value]) => (
                                          <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2 border-b border-blue-200 dark:border-blue-700 last:border-0">
                                            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide min-w-[120px]">
                                              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                                            </span>
                                            <span className="text-sm text-gray-800 dark:text-gray-200 flex-1">
                                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {whatWeGotData && (
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl p-5 border-2 border-green-200 dark:border-green-800 shadow-md">
                                  <div className="flex items-center gap-2 mb-3">
                                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <h5 className="text-sm font-bold text-green-900 dark:text-green-100">Key Findings</h5>
                                  </div>
                                  {whatWeGotData._text ? (
                                    <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                                      {whatWeGotData._text}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {Object.entries(whatWeGotData)
                                        .filter(([key]) => {
                                          const keyLower = key.toLowerCase();
                                          return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                                 !keyLower.includes('command') && 
                                                 !keyLower.includes('cmd');
                                        })
                                        .map(([key, value]) => (
                                          <div key={key} className="flex flex-col gap-2 pb-2 border-b border-green-200 dark:border-green-700 last:border-0">
                                            <span className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                                              {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                                            </span>
                                            <div className="text-sm text-gray-800 dark:text-gray-200 flex-1">
                                              {(() => {
                                                // First, try to parse if it's a JSON string
                                                let parsedValue = value;
                                                if (typeof value === 'string') {
                                                  const trimmed = value.trim();
                                                  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                                      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                                    try {
                                                      parsedValue = JSON.parse(trimmed);
                                                    } catch (e) {
                                                      parsedValue = value;
                                                    }
                                                  }
                                                }
                                                
                                                // Handle arrays - display as formatted list
                                                if (Array.isArray(parsedValue)) {
                                                  return (
                                                    <div className="space-y-2 mt-1">
                                                      {parsedValue.map((item, idx) => (
                                                        <div key={idx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                                                          {typeof item === 'object' && item !== null ? (
                                                            <div className="space-y-2">
                                                              {Object.entries(item).map(([subKey, subValue]) => (
                                                                <div key={subKey} className="flex items-start gap-2">
                                                                  <span className="font-semibold text-gray-600 dark:text-gray-400 min-w-[120px] text-xs">
                                                                    {subKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                                                                  </span>
                                                                  <span className="text-gray-800 dark:text-gray-200 flex-1 text-xs">
                                                                    {Array.isArray(subValue) ? (
                                                                      <div className="space-y-1">
                                                                        {subValue.map((arrItem, arrIdx) => (
                                                                          <div key={arrIdx} className="bg-gray-100 dark:bg-gray-600 rounded px-2 py-1">
                                                                            {typeof arrItem === 'object' ? JSON.stringify(arrItem) : String(arrItem)}
                                                                          </div>
                                                                        ))}
                                                                      </div>
                                                                    ) : typeof subValue === 'object' && subValue !== null ? (
                                                                      <div className="space-y-1">
                                                                        {Object.entries(subValue).map(([nestedKey, nestedValue]) => (
                                                                          <div key={nestedKey} className="flex gap-2">
                                                                            <span className="font-medium">{nestedKey}:</span>
                                                                            <span>{String(nestedValue)}</span>
                                                                          </div>
                                                                        ))}
                                                                      </div>
                                                                    ) : String(subValue)}
                                                                  </span>
                                                                </div>
                                                              ))}
                                                            </div>
                                                          ) : (
                                                            <span>{String(item)}</span>
                                                          )}
                                                        </div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                // Handle objects - display as key-value pairs
                                                if (typeof parsedValue === 'object' && parsedValue !== null) {
                                                  return (
                                                    <div className="space-y-2 mt-1 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                                                      {Object.entries(parsedValue).map(([subKey, subValue]) => (
                                                        <div key={subKey} className="flex items-start gap-2">
                                                          <span className="font-semibold text-gray-600 dark:text-gray-400 min-w-[120px] text-xs">
                                                            {subKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                                                          </span>
                                                          <span className="text-gray-800 dark:text-gray-200 flex-1 text-xs">
                                                            {Array.isArray(subValue) ? (
                                                              <div className="space-y-1">
                                                                {subValue.map((arrItem, arrIdx) => (
                                                                  <div key={arrIdx} className="bg-gray-100 dark:bg-gray-600 rounded px-2 py-1">
                                                                    {typeof arrItem === 'object' ? JSON.stringify(arrItem) : String(arrItem)}
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            ) : typeof subValue === 'object' && subValue !== null ? (
                                                              <div className="space-y-1">
                                                                {Object.entries(subValue).map(([nestedKey, nestedValue]) => (
                                                                  <div key={nestedKey} className="flex gap-2">
                                                                    <span className="font-medium">{nestedKey}:</span>
                                                                    <span>{String(nestedValue)}</span>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            ) : String(subValue)}
                                                          </span>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  );
                                                }
                                                // Handle primitives
                                                return <span>{String(parsedValue)}</span>;
                                              })()}
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        
                        {/* Findings */}
                        {analyzed.findings && Array.isArray(analyzed.findings) && analyzed.findings.length > 0 && (
                          <div className="mb-6 max-w-full overflow-hidden">
                            <h5 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">{config.name} - Findings ({analyzed.findings.length})</h5>
                            {/* Grid layout for SSL/TLS Scan and Nmap Version Scan (IP) - 3-4 findings per row */}
                            {(config.key === 'sslscan' || config.key === 'nmapSVIP') ? (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full max-w-full overflow-hidden">
                                {analyzed.findings.map((finding, idx) => {
                                  // Get description - handle all possible formats
                                  let description = finding.description || finding.text || finding.info || ''
                                  
                                  // If it's an array, check if it's a character array or regular array
                                  if (Array.isArray(description)) {
                                    if (description.length > 0 && typeof description[0] === 'string' && description[0].length === 1) {
                                      // Character array - join it
                                      description = description.join('')
                                    } else {
                                      // Regular array - join with space
                                      description = description.map(d => typeof d === 'string' ? d : JSON.stringify(d)).join(' ')
                                    }
                                  } else if (typeof description === 'object') {
                                    // Object - stringify it
                                    description = JSON.stringify(description, null, 2)
                                  } else {
                                    // String or other - convert to string
                                    description = String(description)
                                  }
                                  
                                  return (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 w-full max-w-full overflow-hidden box-border min-w-0">
                                      <div className="flex items-start justify-between mb-2">
                                        <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${
                                          finding.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                          finding.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                          finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                          'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                        }`}>
                                          {finding.type || finding.severity || 'info'}
                                        </span>
                                      </div>
                                      <p className="text-sm text-gray-700 dark:text-gray-300 break-words whitespace-normal w-full max-w-full min-w-0">
                                        {description}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="space-y-3 max-w-full overflow-hidden">
                                {analyzed.findings.map((finding, idx) => {
                                  // Get description first - this is the main content
                                  let description = finding.description || finding.text || finding.info || finding.message || ''
                                  
                                  // Handle description properly - prevent character-by-character display
                                  if (Array.isArray(description)) {
                                    if (description.length > 0) {
                                      // Check if it's a character array (all single chars)
                                      const isCharArray = description.every(item => typeof item === 'string' && item.length === 1)
                                      if (isCharArray) {
                                        description = description.join('')
                                      } else {
                                        description = description.map(d => {
                                          if (typeof d === 'string') return d
                                          if (typeof d === 'object') return JSON.stringify(d)
                                          return String(d)
                                        }).join(' ')
                                      }
                                    } else {
                                      description = ''
                                    }
                                  } else if (typeof description === 'object' && description !== null) {
                                    description = JSON.stringify(description, null, 2)
                                  } else {
                                    description = String(description || '')
                                  }
                                  
                                  // Get other properties (excluding description fields)
                                  const otherProps = Object.entries(finding).filter(([key]) => 
                                    !['type', 'name', 'severity', 'description', 'text', 'info', 'message'].includes(key.toLowerCase())
                                  )
                                  
                                  return (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 max-w-full overflow-hidden">
                                      <div className="flex items-start justify-between mb-3">
                                        <h6 className="font-semibold text-gray-900 dark:text-white break-words">
                                          {config.name} - {finding.type || finding.name || `Finding ${idx + 1}`}
                                        </h6>
                                        {finding.severity && (
                                          <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ml-2 ${
                                            finding.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                              finding.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                              finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                          }`}>
                                            {finding.severity.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Display description if available */}
                                      {description && (
                                        <div className="mb-3">
                                          <p className="text-sm text-gray-700 dark:text-gray-300 break-words whitespace-normal">
                                            {description}
                                          </p>
                                        </div>
                                      )}
                                      
                                      {/* Display other properties */}
                                      {otherProps.length > 0 && (
                                        <div className="space-y-2">
                                          {otherProps.map(([key, value]) => {
                                            if (value === null || value === undefined || 
                                                (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
                                                (Array.isArray(value) && value.length === 0)) {
                                              return null
                                            }
                                            
                                            const formattedKey = key
                                              .replace(/([A-Z])/g, ' $1')
                                              .replace(/^./, str => str.toUpperCase())
                                              .trim()
                                            
                                            let displayValue = value
                                            if (typeof value === 'boolean') {
                                              displayValue = value ? 'Yes' : 'No'
                                            } else if (typeof value === 'object' && !Array.isArray(value)) {
                                              displayValue = JSON.stringify(value, null, 2)
                                            } else if (Array.isArray(value)) {
                                              // Check if array contains single-character strings (character array)
                                              if (value.length > 0 && typeof value[0] === 'string' && value[0].length === 1 && 
                                                  value.every(v => typeof v === 'string' && v.length === 1)) {
                                                // Character array - join it
                                                displayValue = value.join('')
                                              } else {
                                                // Regular array - join with comma
                                                displayValue = value.map(v => {
                                                  if (typeof v === 'string') return v
                                                  if (typeof v === 'object') return JSON.stringify(v)
                                                  return String(v)
                                                }).join(', ')
                                              }
                                            } else {
                                              // Ensure it's a string
                                              displayValue = String(value)
                                            }
                                            
                                            return (
                                              <div key={key} className="text-sm max-w-full overflow-hidden">
                                                <span className="font-medium text-gray-700 dark:text-gray-300">{formattedKey}:</span>
                                                <span className="ml-2 text-gray-600 dark:text-gray-400 break-words whitespace-normal">{displayValue}</span>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Vulnerabilities */}
                        {analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities) && analyzed.vulnerabilities.length > 0 && (
                          <div className="mb-6 max-w-full overflow-hidden">
                            <h5 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3">{config.name} - Vulnerabilities ({analyzed.vulnerabilities.length})</h5>
                            <div className="space-y-3 max-w-full overflow-hidden">
                              {analyzed.vulnerabilities.map((vuln, idx) => {
                                const otherProps = Object.entries(vuln).filter(([key]) => 
                                  !['type', 'name', 'severity'].includes(key.toLowerCase())
                                )
                                
                                return (
                                  <div key={idx} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800 max-w-full overflow-hidden">
                                    <div className="flex items-start justify-between mb-3">
                                      <h6 className="font-semibold text-red-900 dark:text-red-100 break-words">
                                        {config.name} - {vuln.type || vuln.name || `Vulnerability ${idx + 1}`}
                                      </h6>
                                      {vuln.severity && (
                                        <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ml-2 ${
                                          vuln.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                            vuln.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                            vuln.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                        }`}>
                                          {vuln.severity.toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    
                                    <div className="space-y-2 max-w-full overflow-hidden">
                                      {otherProps.map(([key, value]) => {
                                        if (value === null || value === undefined || 
                                            (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
                                            (Array.isArray(value) && value.length === 0)) {
                                          return null
                                        }
                                        
                                        const formattedKey = key
                                          .replace(/([A-Z])/g, ' $1')
                                          .replace(/^./, str => str.toUpperCase())
                                          .trim()
                                        
                                        let displayValue = value
                                        if (typeof value === 'boolean') {
                                          displayValue = value ? 'Yes' : 'No'
                                        } else if (typeof value === 'object' && !Array.isArray(value)) {
                                          displayValue = JSON.stringify(value, null, 2)
                                        } else if (Array.isArray(value)) {
                                          // Check if character array
                                          if (value.length > 0 && typeof value[0] === 'string' && value[0].length === 1 && 
                                              value.every(v => typeof v === 'string' && v.length === 1)) {
                                            displayValue = value.join('')
                                          } else {
                                            displayValue = value.map(v => typeof v === 'string' ? v : JSON.stringify(v)).join(', ')
                                          }
                                        } else {
                                          displayValue = String(value)
                                        }
                                        
                                        return (
                                          <div key={key} className="text-sm max-w-full overflow-hidden">
                                            <span className="font-medium text-red-700 dark:text-red-300">{formattedKey}:</span>
                                            <span className="ml-2 text-red-600 dark:text-red-400 break-words whitespace-normal">{displayValue}</span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        
                        {/* Overall Risk Assessment */}
                        {(() => {
                          // Calculate overall risk based on findings and vulnerabilities
                          const hasCritical = analyzed.vulnerabilities?.some(v => v.severity === 'critical') || 
                                            analyzed.findings?.some(f => f.severity === 'critical')
                          const hasHigh = analyzed.vulnerabilities?.some(v => v.severity === 'high') || 
                                         analyzed.findings?.some(f => f.severity === 'high')
                          const hasMedium = analyzed.vulnerabilities?.some(v => v.severity === 'medium') || 
                                           analyzed.findings?.some(f => f.severity === 'medium')
                          
                          let riskLevel = 'Safe'
                          let riskColor = 'green'
                          let riskBg = 'bg-green-50 dark:bg-green-900/20'
                          let riskBorder = 'border-green-200 dark:border-green-800'
                          
                          if (hasCritical) {
                            riskLevel = 'High Risk'
                            riskColor = 'red'
                            riskBg = 'bg-red-50 dark:bg-red-900/20'
                            riskBorder = 'border-red-200 dark:border-red-800'
                          } else if (hasHigh) {
                            riskLevel = 'High Risk'
                            riskColor = 'red'
                            riskBg = 'bg-red-50 dark:bg-red-900/20'
                            riskBorder = 'border-red-200 dark:border-red-800'
                          } else if (hasMedium) {
                            riskLevel = 'Moderate Risk'
                            riskColor = 'orange'
                            riskBg = 'bg-orange-50 dark:bg-orange-900/20'
                            riskBorder = 'border-orange-200 dark:border-orange-800'
                          } else if (analyzed.vulnerabilities?.length > 0 || analyzed.findings?.length > 0) {
                            riskLevel = 'Low Risk'
                            riskColor = 'yellow'
                            riskBg = 'bg-yellow-50 dark:bg-yellow-900/20'
                            riskBorder = 'border-yellow-200 dark:border-yellow-800'
                          }
                          
                          return (
                            <div className={`mb-6 ${riskBg} rounded-lg p-6 border-2 ${riskBorder} max-w-full overflow-hidden`}>
                              <div className="flex items-center justify-between mb-4">
                                <h5 className="text-xl font-bold text-gray-900 dark:text-white">Overall Risk Assessment</h5>
                                <span className={`px-4 py-2 rounded-lg text-lg font-bold ${
                                  riskColor === 'red' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                  riskColor === 'orange' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                  riskColor === 'yellow' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                                }`}>
                                  {riskLevel}
                                </span>
                              </div>
                              <div className="space-y-3">
                                <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
                                  <h6 className="font-semibold text-gray-900 dark:text-white mb-2">Summary</h6>
                                  <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {riskLevel === 'Safe' ? 
                                      'Your server appears to be secure with no significant vulnerabilities detected.' :
                                      riskLevel === 'Low Risk' ?
                                      'Your server has some minor issues that should be addressed.' :
                                      riskLevel === 'Moderate Risk' ?
                                      'Your server has moderate security concerns that require attention.' :
                                      'Your server has critical security vulnerabilities that require immediate action.'}
                                  </p>
                                </div>
                                {analyzed.vulnerabilities && analyzed.vulnerabilities.length > 0 && (
                                  <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-4">
                                    <h6 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                                      Vulnerabilities Found: {analyzed.vulnerabilities.length}
                                    </h6>
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                      {analyzed.vulnerabilities.length} security vulnerability{analyzed.vulnerabilities.length > 1 ? 'ies' : ''} {analyzed.vulnerabilities.length > 1 ? 'were' : 'was'} detected during the scan.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                        
                        {/* Recommendations */}
                        {analyzed.recommendations && Array.isArray(analyzed.recommendations) && analyzed.recommendations.length > 0 && (
                          <div className="mb-6 max-w-full overflow-hidden">
                            <h5 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-3">{config.name} - Recommendations & Solutions ({analyzed.recommendations.length})</h5>
                            <div className="space-y-2">
                              {analyzed.recommendations.map((rec, idx) => (
                                <div key={idx} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                                  <p className="text-sm text-blue-900 dark:text-blue-100">
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
                    )
                  })}
                </div>
              )}

              {/* AI Suggestions Section */}
              <div ref={aiSuggestionRef} className="mt-6">
                {(aiSuggestions || aiError || isLoadingTgpt) && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Suggestions</h5>
                    </div>
                    
                    {isLoadingTgpt ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-3 text-gray-600 dark:text-gray-400">Generating AI suggestions...</span>
                      </div>
                    ) : aiError ? (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
                      </div>
                    ) : aiSuggestions ? (
                      <div className="space-y-4">
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                            {aiSuggestions}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Click the AI Suggestions button to get AI-powered recommendations based on your scan results.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ServerScanning
