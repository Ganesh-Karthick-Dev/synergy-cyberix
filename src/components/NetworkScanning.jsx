import { useState, useEffect, useRef } from 'react'
import { useScanning } from '../context/ScanningContext'
import { useGlobalScanState } from '../context/GlobalScanContext'
import scanLogger from '../utils/scanLogger'
// Removed useToast import - no snack bars in network scan tab
import { getSecurePassword } from '../utils/securePasswordStorage'
import jsPDF from 'jspdf'

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
  const { registerScan, updateScan, completeScan, stopScan, getScanIdForView, reconnectToScan, activeScans } = useGlobalScanState()
  // Removed useToast - no snack bars in network scan tab
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

  // Convert network scan results using tgpt
  const handleTgptConversion = async (rawJsonData) => {
    if (!rawJsonData) {
      console.log('⚠️ No raw JSON data for tgpt conversion')
      setTgptConversionComplete(true)
      return
    }

    setIsLoadingTgpt(true)
    setTgptConvertedResults(null)
    setTgptConversionComplete(false)
    setConsoleLog(prev => [...prev, '🤖 Converting network scan results using AI...'])

    try {
      // Prepare the prompt for tgpt - analyze network scan results
      const prompt = `You are a security analyst. Analyze the following network security scan result and provide a comprehensive security report in JSON format.

IMPORTANT: You must analyze the scan results provided below and create a detailed security report. Do NOT provide generic responses or greetings.

Your analysis should:
1. Analyze the raw scan results
2. Identify findings and vulnerabilities (if any)
3. For each vulnerability, provide detailed solutions on how to fix it

Required JSON structure:
{
  "summary": {
    "target": "target IP or hostname from scan",
    "scanDate": "date in readable format",
    "totalFindings": number,
    "totalVulnerabilities": number,
    "riskLevel": "critical|high|medium|low|info",
    "openPorts": number,
    "services": number
  },
  "findings": [
    {
      "type": "finding type (e.g., open_port, service_version, dns_record, etc.)",
      "severity": "critical|high|medium|low|info",
      "description": "clear description of the finding",
      "location": "where it was found (port, service, etc.)",
      "details": "detailed information about the finding"
    }
  ],
  "vulnerabilities": [
    {
      "name": "vulnerability name",
      "severity": "critical|high|medium|low",
      "description": "clear description in simple terms",
      "impact": "what this means for the security",
      "location": "where it was found (port, service, IP, etc.)",
      "solution": {
        "steps": [
          "step-by-step fix instruction 1",
          "step-by-step fix instruction 2",
          "step-by-step fix instruction 3"
        ],
        "recommendations": "additional recommendations"
      },
      "references": ["url1", "url2"]
    }
  ],
  "recommendations": [
    "general security recommendation 1",
    "general security recommendation 2"
  ]
}

Network Security Scan Result:
${rawJsonData}

Analyze the above scan result and provide ONLY valid JSON output. No additional text, no greetings, no explanations - just the JSON object.`

      setConsoleLog(prev => [...prev, '📋 Converting results with AI...'])
      setConsoleLog(prev => [...prev, '📋 Prompt length: ' + prompt.length + ' characters'])
      
      // Log the actual prompt being sent to AI in the UI console
      setConsoleLog(prev => [...prev, '📝 AI Analysis Prompt:'])
      // Split prompt into lines and log each line (limit to first 50 lines to avoid overwhelming)
      const promptLines = prompt.split('\n')
      const linesToLog = promptLines.slice(0, 50)
      linesToLog.forEach((line, index) => {
        setConsoleLog(prev => [...prev, `   ${index + 1}: ${line.substring(0, 200)}${line.length > 200 ? '...' : ''}`])
      })
      if (promptLines.length > 50) {
        setConsoleLog(prev => [...prev, `   ... (${promptLines.length - 50} more lines)`])
      }
      
      console.log('🤖 [TGPT] Full prompt being sent:', prompt)
      console.log('🤖 [TGPT] Prompt length:', prompt.length, 'characters')
      
      // Execute tgpt command
      const password = getSecurePassword()
      if (!password) {
        throw new Error('WSL password not available')
      }

      setConsoleLog(prev => [...prev, '⏳ Executing AI conversion...'])
      const result = await window.cyberGuard?.convertWithTgpt?.(prompt, password)
      
      // Log the response
      if (result) {
        const outputLength = (result.output || result.stdout || '').length
        setConsoleLog(prev => [...prev, '📤 AI Response received: ' + outputLength + ' characters'])
        console.log('🤖 [TGPT] Response (first 1000 chars):', (result.output || result.stdout || '').substring(0, 1000))
        console.log('🤖 [TGPT] Full response:', result.output || result.stdout || '')
        console.log('🤖 [TGPT] Response stderr:', result.stderr || '')
      }
      
      if (result && result.success) {
        const tgptOutput = result.output || result.stdout || ''
        setConsoleLog(prev => [...prev, '✅ AI conversion completed successfully!'])
        setConsoleLog(prev => [...prev, '📤 AI Output: ' + tgptOutput.length + ' characters'])
        
        // Clean the output - remove markdown code blocks if present
        let cleanedOutput = tgptOutput.trim()
        
        // Remove markdown code blocks (```json ... ``` or ``` ... ```)
        cleanedOutput = cleanedOutput.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
        
        // Try to extract JSON from the output
        let parsedJson = null
        try {
          // First, try to parse the entire cleaned output as JSON
          try {
            parsedJson = JSON.parse(cleanedOutput)
            setConsoleLog(prev => [...prev, '✅ Results parsed as JSON successfully!'])
            setConsoleLog(prev => [...prev, '📊 Parsed JSON structure: ' + Object.keys(parsedJson).join(', ')])
            setTgptConvertedResults(parsedJson)
          } catch (directParseError) {
            // If direct parse fails, try to find JSON in the output (might have text before/after)
            const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              setConsoleLog(prev => [...prev, '🔍 Extracting JSON from AI response...'])
              try {
                parsedJson = JSON.parse(jsonMatch[0])
                setTgptConvertedResults(parsedJson)
                setConsoleLog(prev => [...prev, '✅ Results parsed as JSON successfully!'])
                setConsoleLog(prev => [...prev, '📊 Parsed JSON structure: ' + Object.keys(parsedJson).join(', ')])
              } catch (extractParseError) {
                // If JSON extraction fails, store as formatted text
                setConsoleLog(prev => [...prev, '⚠️ JSON found but parsing failed, displaying as formatted text'])
                setTgptConvertedResults(cleanedOutput)
              }
            } else {
              // If no JSON found, store as formatted text
              setConsoleLog(prev => [...prev, 'ℹ️ No JSON found in AI response, displaying as formatted text'])
              setTgptConvertedResults(cleanedOutput)
            }
          }
        } catch (parseError) {
          console.error('Failed to parse JSON:', parseError)
          setConsoleLog(prev => [...prev, '❌ Failed to parse JSON: ' + parseError.message])
          // Store as formatted text if JSON parsing fails
          setTgptConvertedResults(cleanedOutput)
        }
      } else {
        throw new Error(result?.error || 'Failed to convert results')
      }
    } catch (error) {
      setConsoleLog(prev => [...prev, `❌ Failed to convert results with AI: ${error.message}`])
      console.error('🤖 [TGPT] Conversion error:', error)
      console.error('🤖 [TGPT] Error details:', error.message, error.stack)
      // Show raw results even if conversion fails
    } finally {
      setIsLoadingTgpt(false)
      setTgptConversionComplete(true) // Mark conversion as complete (success or failure)
    }
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
        'network-scan',
        'Network Scan',
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
      
      // First Page Header - Scan Information
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      const scanName = 'Network Scan Security Report'
      doc.text(scanName, margin, yPos, { align: 'left' })
      yPos += 8

      doc.setFontSize(10)
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

      // Get analyzed results
      const analyzedResults = scanResults?.results?.json?.analyzedResults
      if (analyzedResults && Object.keys(analyzedResults).length > 0) {
        // Command configs matching UI order
        const commandConfigs = [
          { key: 'whatweb', title: 'Web Technology & Framework Analysis', description: 'Comprehensive web technology fingerprinting and detection.' },
          { key: 'ping', title: 'Network Connectivity & Latency Assessment', description: 'ICMP connectivity test to verify network reachability.' },
          { key: 'host', title: 'DNS Resolution & Record Analysis', description: 'DNS lookup to resolve domain names to IP addresses.' },
          { key: 'hping', title: 'Advanced Network Packet Analysis', description: 'Advanced packet crafting tool for network testing.' },
          { key: 'nmapSn', title: 'Network Host Discovery & Enumeration', description: 'Network host discovery scan to identify active hosts.' },
          { key: 'nmapFast', title: 'Rapid Port Scanning & Service Detection', description: 'Quick port scan to identify open ports and services.' },
          { key: 'nmapFull', title: 'Comprehensive Port Scanning & Analysis', description: 'Comprehensive port scan with detailed service detection.' }
        ]

        // Export each command result
        for (const config of commandConfigs) {
          const analyzed = analyzedResults[config.key]
          if (!analyzed || analyzed.error) continue

          checkNewPage(20)
          yPos += 5

          // Command Title and Description (matching UI)
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(0, 0, 0)
          doc.text(config.title, margin, yPos)
          yPos += 6
          
          if (config.description) {
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(100, 100, 100)
            const descLines = doc.splitTextToSize(config.description, maxWidth)
            descLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin, yPos)
              yPos += 4
            })
            yPos += 5
          }

          doc.setTextColor(0, 0, 0)

          // Analysis Overview (What We Did) - Enhanced parsing
          if (analyzed.whatWeDid) {
            checkNewPage(15)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('Analysis Overview', margin, yPos)
            yPos += 6
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            
            // Parse whatWeDid
            let whatWeDidData = analyzed.whatWeDid
            if (typeof whatWeDidData === 'string') {
              try {
                const trimmed = whatWeDidData.trim()
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                    (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                  whatWeDidData = JSON.parse(trimmed)
                }
              } catch (e) {
                // Keep as string
              }
            }
            
            if (typeof whatWeDidData === 'object' && whatWeDidData !== null && !Array.isArray(whatWeDidData) && !whatWeDidData._text) {
              // Display as key-value pairs
              Object.entries(whatWeDidData).forEach(([key, value]) => {
                const keyLower = key.toLowerCase()
                if (['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) ||
                    keyLower.includes('command') || keyLower.includes('cmd')) {
                  return // Skip command-related keys
                }
                
                checkNewPage(6)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value)
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.text(formattedKey + ':', margin, yPos)
                doc.setFont('helvetica', 'normal')
                const valueLines = doc.splitTextToSize(displayValue, maxWidth - 50)
                valueLines.forEach((line, lineIdx) => {
                  checkNewPage(5)
                  doc.text(line, margin + 5, yPos + (lineIdx * 4))
                })
                yPos += Math.max(4, valueLines.length * 4) + 2
              })
            } else {
              const whatWeDidText = whatWeDidData._text || (typeof whatWeDidData === 'string' ? whatWeDidData : JSON.stringify(whatWeDidData))
              const lines = doc.splitTextToSize(whatWeDidText, maxWidth)
              lines.forEach((line, lineIdx) => {
                checkNewPage(5)
                doc.text(line, margin, yPos + (lineIdx * 4))
              })
              yPos += lines.length * 4 + 2
            }
            yPos += 3
          }

          // Key Findings (What We Got) - Enhanced to show all details even for errors like 403
          if (analyzed.whatWeGot) {
            checkNewPage(15)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('Key Findings', margin, yPos)
            yPos += 6
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            
            // Parse whatWeGot - handle both string and object formats
            let whatWeGotData = analyzed.whatWeGot
            if (typeof whatWeGotData === 'string') {
              try {
                const trimmed = whatWeGotData.trim()
                if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                    (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                  whatWeGotData = JSON.parse(trimmed)
                }
              } catch (e) {
                // Keep as string if parsing fails
              }
            }
            
            // Display as key-value pairs if it's an object
            if (typeof whatWeGotData === 'object' && whatWeGotData !== null && !Array.isArray(whatWeGotData) && !whatWeGotData._text) {
              // Display all key-value pairs - don't filter out any data
              Object.entries(whatWeGotData).forEach(([key, value]) => {
                const keyLower = key.toLowerCase()
                // Only skip command-related keys, but show everything else including status codes, errors, etc.
                if (['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) ||
                    keyLower.includes('command') || keyLower.includes('cmd')) {
                  return // Skip command-related keys
                }
                
                checkNewPage(6)
                const formattedKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()
                
                // Handle JSON strings in values
                let parsedValue = value
                if (typeof value === 'string') {
                  const trimmed = value.trim()
                  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                    try {
                      parsedValue = JSON.parse(trimmed)
                    } catch (e) {
                      // Keep as string if parsing fails
                    }
                  }
                }
                
                // Format arrays and objects
                let displayValue = parsedValue
                if (Array.isArray(parsedValue)) {
                  displayValue = parsedValue.map((item, idx) => {
                    if (typeof item === 'object' && item !== null) {
                      return JSON.stringify(item)
                    }
                    return String(item)
                  }).join(', ')
                } else if (typeof parsedValue === 'object' && parsedValue !== null) {
                  displayValue = JSON.stringify(parsedValue)
                } else {
                  displayValue = String(parsedValue)
                }
                
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(8)
                doc.text(formattedKey + ':', margin, yPos)
                doc.setFont('helvetica', 'normal')
                const valueLines = doc.splitTextToSize(displayValue, maxWidth - 50)
                valueLines.forEach((line, lineIdx) => {
                  checkNewPage(5)
                  doc.text(line, margin + 5, yPos + (lineIdx * 4))
                })
                yPos += Math.max(4, valueLines.length * 4) + 2
              })
            } else {
              // If it's a string or _text property, display as text
              const whatWeGotText = whatWeGotData._text || (typeof whatWeGotData === 'string' ? whatWeGotData : JSON.stringify(whatWeGotData))
              const lines = doc.splitTextToSize(whatWeGotText, maxWidth)
              lines.forEach((line, lineIdx) => {
                checkNewPage(5)
                doc.text(line, margin, yPos + (lineIdx * 4))
              })
              yPos += lines.length * 4 + 2
            }
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

          // Port Details (for port scans) - Enhanced table view matching UI
          if ((config.key === 'nmapFast' || config.key === 'nmapFull') && analyzed.ports && Array.isArray(analyzed.ports) && analyzed.ports.length > 0) {
            checkNewPage(25)
            
            // Sort ports: Open first, then Filtered, then Closed
            const sortedPorts = [...analyzed.ports].sort((a, b) => {
              const stateOrder = { 'open': 1, 'filtered': 2, 'closed': 3, 'unknown': 4 }
              const aState = (a.state || 'unknown').toLowerCase()
              const bState = (b.state || 'unknown').toLowerCase()
              return (stateOrder[aState] || 99) - (stateOrder[bState] || 99)
            })
            
            // Count ports by state
            const openPorts = sortedPorts.filter(p => (p.state || '').toLowerCase() === 'open')
            const filteredPorts = sortedPorts.filter(p => (p.state || '').toLowerCase() === 'filtered')
            const closedPorts = sortedPorts.filter(p => (p.state || '').toLowerCase() === 'closed')
            
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text(`Port Details (${analyzed.ports.length} ports)`, margin, yPos)
            yPos += 8
            
            // Show port counts
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            if (openPorts.length > 0) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(0, 150, 0) // Green for open
              doc.text(`Open: ${openPorts.length}`, margin, yPos)
              doc.setTextColor(0, 0, 0)
              doc.setFont('helvetica', 'normal')
            }
            if (filteredPorts.length > 0) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(200, 150, 0) // Yellow/Orange for filtered
              doc.text(`Filtered: ${filteredPorts.length}`, margin + 40, yPos)
              doc.setTextColor(0, 0, 0)
              doc.setFont('helvetica', 'normal')
            }
            if (closedPorts.length > 0) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(200, 0, 0) // Red for closed
              doc.text(`Closed: ${closedPorts.length}`, margin + 90, yPos)
              doc.setTextColor(0, 0, 0)
              doc.setFont('helvetica', 'normal')
            }
            yPos += 8
            
            // Table setup
            const colWidths = {
              port: 25,
              state: 35,
              service: 60,
              version: 50
            }
            const tableStartX = margin
            const rowHeight = 6
            const headerHeight = 7
            
            // Draw table header with background
            checkNewPage(headerHeight + 2)
            doc.setFillColor(255, 200, 150) // Light orange background
            doc.rect(tableStartX, yPos - headerHeight + 2, maxWidth, headerHeight, 'F')
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(0, 0, 0)
            doc.text('Port', tableStartX + 2, yPos)
            doc.text('State', tableStartX + colWidths.port + 2, yPos)
            doc.text('Service', tableStartX + colWidths.port + colWidths.state + 2, yPos)
            doc.text('Version', tableStartX + colWidths.port + colWidths.state + colWidths.service + 2, yPos)
            
            // Draw header border
            doc.setDrawColor(200, 150, 100)
            doc.setLineWidth(0.5)
            doc.line(tableStartX, yPos - headerHeight + 2, tableStartX + maxWidth, yPos - headerHeight + 2)
            doc.line(tableStartX, yPos + 2, tableStartX + maxWidth, yPos + 2)
            
            yPos += 3
            
            // Draw table rows
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            
            sortedPorts.forEach((port, idx) => {
              checkNewPage(rowHeight + 2)
              
              const portNum = port.port || port.number || port.portNumber || 'N/A'
              const state = (port.state || 'unknown').toLowerCase()
              const service = port.service || (typeof port.service === 'object' ? port.service?.name : 'N/A')
              const version = port.version || (typeof port.service === 'object' ? port.service?.version : 'N/A')
              
              // Draw row border
              doc.setDrawColor(220, 220, 220)
              doc.setLineWidth(0.3)
              doc.line(tableStartX, yPos, tableStartX + maxWidth, yPos)
              
              // Port number (monospace font for better alignment)
              doc.setFont('courier', 'normal')
              doc.text(String(portNum), tableStartX + 2, yPos)
              
              // State with color coding
              doc.setFont('helvetica', 'bold')
              if (state === 'open') {
                doc.setTextColor(0, 150, 0) // Green
              } else if (state === 'filtered') {
                doc.setTextColor(200, 150, 0) // Yellow/Orange
              } else if (state === 'closed') {
                doc.setTextColor(200, 0, 0) // Red
              } else {
                doc.setTextColor(100, 100, 100) // Gray
              }
              doc.text(state.charAt(0).toUpperCase() + state.slice(1), tableStartX + colWidths.port + 2, yPos)
              doc.setTextColor(0, 0, 0)
              
              // Service
              doc.setFont('helvetica', 'normal')
              const serviceText = String(service).substring(0, 25) // Limit length
              doc.text(serviceText, tableStartX + colWidths.port + colWidths.state + 2, yPos)
              
              // Version
              const versionText = String(version).substring(0, 20) // Limit length
              doc.text(versionText, tableStartX + colWidths.port + colWidths.state + colWidths.service + 2, yPos)
              
              yPos += rowHeight
            })
            
            // Draw bottom border
            doc.setDrawColor(200, 150, 100)
            doc.setLineWidth(0.5)
            doc.line(tableStartX, yPos, tableStartX + maxWidth, yPos)
            
            yPos += 5
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

      // Draw borders and footers on all pages
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        drawPageBorder()
        drawFooter(i, totalPages)
      }

      // Save PDF
      const fileName = `network-scan-${(scanResults.target || target).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
      alert('PDF report exported successfully!')
    } catch (error) {
      console.error('Failed to export PDF:', error)
      alert(`Failed to export PDF: ${error.message}`)
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

    // Check if there's already an active scan in global state
    const existingScan = activeScans.find(s => s.scanType === 'Network Scan' && s.viewId === 'network-scan')
    if (existingScan) {
      alert('Network scan is already in progress')
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

    if (scanStatus.isScanning) {
      alert('Scan is already in progress')
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
    const expectedEndTime = new Date(startTime.getTime() + 10 * 60 * 1000) // 10 minutes from start
    setScanTimer({
      startTime: startTime,
      elapsed: 0,
      expectedEndTime: expectedEndTime,
      completedTime: null,
      isRunning: true
    })
    
    // Register scan in global state
    const scanId = registerScan({
      scanType: 'Network Scan',
      target: target.trim(),
      progress: 0,
      message: 'Initializing network scan...',
      startTime: startTime.toISOString(),
      viewId: 'network-scan',
      onStop: async () => {
        if (window.cyberGuard) {
          await window.cyberGuard.abortNetworkScan()
        }
        stopScan(scanId)
        setIsStarting(false)
      },
      onView: () => {
        // Navigate to network scan view (handled by Dashboard)
        if (window.cyberGuard?.navigateToView) {
          window.cyberGuard.navigateToView('network-scan')
        }
      }
    })
    currentScanIdRef.current = scanId
    
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
      stopScan(scanId)
      
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
    window.cyberGuard.onNetworkScanProgress(progressHandler)
    
    // Note: We don't remove listeners on unmount - they should persist
    // The global listeners in GlobalScanContext handle the scan state
  }, [])

  // Check for active scan on mount (reconnection) - restore UI state
  useEffect(() => {
    // Check if there's an active network scan
    const networkScan = activeScans.find(s => s.scanType === 'Network Scan' && s.viewId === 'network-scan')
    
    if (networkScan) {
      // Only reconnect if we don't already have this scan connected
      if (currentScanIdRef.current !== networkScan.id) {
        console.log('🔄 Reconnecting to existing network scan:', networkScan.id)
        
        // Reconnect to existing scan
        currentScanIdRef.current = networkScan.id
        
        // Restore UI state
        setIsStarting(true)
        
        // Restore timer state
        if (networkScan.startTime) {
          const startTime = new Date(networkScan.startTime)
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
        if (networkScan.target) {
          setTarget(networkScan.target)
        }
        
        // Update handlers
        reconnectToScan('network-scan', {
          onStop: async () => {
            if (window.cyberGuard) {
              await window.cyberGuard.abortNetworkScan()
            }
            stopScan(networkScan.id)
            setIsStarting(false)
            setScanTimer(prev => ({ ...prev, isRunning: false }))
            currentScanIdRef.current = null
          },
          onView: () => {
            // Already on this view
          }
        })
        
        console.log('✅ Reconnected to existing network scan:', networkScan.id)
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
                
                if (analyzed && !analyzed.error) {
                  // Store individual command result
                  combinedResults.commandResults[key] = analyzed
                  
                  // Combine findings
                  if (analyzed.findings && Array.isArray(analyzed.findings)) {
                    // Add command name to each finding for context
                    const findingsWithCommand = analyzed.findings.map(f => ({
                      ...f,
                      command: key,
                      commandName: key === 'whatweb' ? 'WhatWeb Scan' :
                                  key === 'ping' ? 'Ping Test' :
                                  key === 'hping' ? 'Hping3 Scan' :
                                  key === 'host' ? 'DNS Resolution' :
                                  key === 'nmapSn' ? 'Nmap Host Discovery' :
                                  key === 'nmapFast' ? 'Nmap Fast Scan' :
                                  key === 'nmapFull' ? 'Nmap Full Scan' : key
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
                      commandName: key === 'whatweb' ? 'WhatWeb Scan' :
                                  key === 'ping' ? 'Ping Test' :
                                  key === 'hping' ? 'Hping3 Scan' :
                                  key === 'host' ? 'DNS Resolution' :
                                  key === 'nmapSn' ? 'Nmap Host Discovery' :
                                  key === 'nmapFast' ? 'Nmap Fast Scan' :
                                  key === 'nmapFull' ? 'Nmap Full Scan' : key
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
              // Do NOT call handleTgptConversion here - we only want TGPT called from main.js one-by-one
            }
          } else if (result && result.success && result.result) {
            // Handle old backend shape (legacy - should not be used for new scans)
            const r = result.result
            if (r && r.reportData) {
              const scanData = { ...r.reportData, jsonReport: r.jsonReport, htmlReport: r.htmlReport, pdfReport: r.pdfReport }
              setScanResults(scanData)
              // Do NOT call handleTgptConversion - TGPT should be called from main.js
            } else {
              setScanResults(r)
              // Do NOT call handleTgptConversion - TGPT should be called from main.js
            }
          } else {
            setScanResults({ 
              summary: 'Scan completed',
              success: result?.success || false,
              error: result?.error || null
            })
            // Do NOT call handleTgptConversion - TGPT should be called from main.js
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
          
          // Note: Notification is handled by GlobalScanContext to avoid duplicates
          // We just need to clear the local reference
          if (currentScanIdRef.current) {
            currentScanIdRef.current = null
          }
          
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

  // Get progress from active scan or scanStatus
  const currentProgress = activeScans.find(s => s.scanType === 'Network Scan' && s.viewId === 'network-scan')?.progress || scanStatus.progress || 0

  return (
    <div className="space-y-6">
      {/* Merged Section - Network Scanning, Scan Configuration, and Console Log */}
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-8 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6">
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Network Scanning</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Professional network analysis and port discovery</p>
              </div>
            </div>
          </div>

          {/* Progress Bar - Hidden when FloatingProgressCard is active */}

          {/* Scan Configuration */}
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
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-colors bg-white/80 dark:bg-slate-700/80 text-gray-900 dark:text-gray-100 backdrop-blur-sm"
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
                  className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center space-x-2 whitespace-nowrap shadow-lg"
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
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-xl p-6 border border-white/30 dark:border-slate-700/50 backdrop-blur-sm">
                <div className="flex items-center space-x-2 mb-4">
                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {scanTimer.isRunning ? 'Scan in Progress' : 'Scan Completed'}
                  </h4>
                </div>
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
            )}

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
          </div>

        </div>
      </div>

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowHelpDialog(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 p-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-white">Network Scanning</h3>
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
              {/* What is Network Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  What is Network Scanning?
                </h4>
                <p className="text-orange-800 dark:text-orange-200 leading-relaxed text-lg">
                  Network scanning is the process of probing a network and its connected hosts from the outside (and sometimes inside) to build an accurate map of what devices and services are present, how they communicate, and where potential weaknesses may exist.
                </p>
                <p className="text-orange-800 dark:text-orange-200 leading-relaxed">
                  Where server-level scanning targets a single server and its web-facing services, network scanning looks at the broader network context: which hosts are reachable, which ports are open across those hosts, how packets travel through the network, and what network-level behaviors might reveal misconfiguration or attack surface.
                </p>
                <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded-r-lg mt-4">
                  <p className="text-orange-800 dark:text-orange-200 italic leading-relaxed">
                    Think of it as a GPS and X-ray for your network: we discover devices and routes, then inspect the "doors" (ports) and the labels on those doors (service banners/version info) to identify risky entry points.
                  </p>
                </div>
              </div>

              {/* Why do we need Network Scanning? */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  Why do we need Network Scanning?
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Visibility of your attack surface
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Networks change often. Devices get added, ports get opened, and services get enabled. Scanning gives you a current map of exposure.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Find invisible or forgotten hosts
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Development servers, test boxes, or legacy devices are frequently left accessible. Detecting them reduces hidden risks.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      Detect network misconfigurations
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Misrouted traffic, open management interfaces, permissive ICMP/ping responses, or wrongly exposed services can be identified and fixed.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Support incident response & threat hunting
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      A recent network scan helps responders understand what was reachable and potentially compromised at a point in time.
                    </p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800 md:col-span-2">
                    <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Comply with policy and audits
                    </h5>
                    <p className="text-sm text-orange-800 dark:text-orange-200">
                      Many standards require regular network discovery and evidence of remediation.
                    </p>
                  </div>
                </div>
              </div>

              {/* How we help */}
              <div className="space-y-4">
                <h4 className="text-2xl font-bold text-orange-900 dark:text-orange-100 flex items-center gap-3">
                  <div className="w-1 h-8 bg-orange-500 rounded"></div>
                  How we help — our Network Scanning service (high level)
                </h4>
                <p className="text-orange-800 dark:text-orange-200 leading-relaxed">
                  We perform carefully controlled, authorized network discovery and probing using proven methods. Key steps in our process:
                </p>
                <div className="space-y-3">
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Scope & Authorization</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We document exactly which IPs, ranges, and hostnames are in scope and get written permission. This prevents accidental scanning of third-party networks.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Host discovery</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We determine which addresses are live and responding on the network (both IPv4 and IPv6 if applicable). This builds the initial inventory of active hosts.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Reachability & latency checks</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We measure basic responsiveness and packet loss to surface network health issues and transient connectivity problems.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Port and service enumeration</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">For each live host we probe the range of network ports to find which are open and accept connections. For every open port we attempt to identify the service and version that's running (for example, web servers, SSH, database listeners, remote admin interfaces, etc.).</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Service fingerprinting & banner analysis</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We collect non-invasive service metadata (protocol banners, protocol behaviors) to determine software types and versions — crucial for correlating known vulnerabilities.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      6
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Stealth and timing considerations</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We tune probes to be respectful of network performance and intrusion detection systems. For production environments we use conservative probe rates and schedule scans during agreed maintenance windows where necessary.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      7
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Network path & topology mapping</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We analyze routing and hops between the scanning point and targets to detect firewalls, load balancers, or routing anomalies that could affect security posture.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      8
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Contextual vulnerability correlation</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">Where we identify specific software versions or exposed services, we cross-reference with known vulnerabilities and provide an evidence-backed assessment of risk.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                    <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
                      9
                    </div>
                    <div className="flex-1">
                      <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">Prioritization and remediation guidance</h5>
                      <p className="text-sm text-orange-800 dark:text-orange-200">We don't just list findings — we prioritize them, explain business impact, and provide practical remediation steps.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Scan Results - Enhanced UI */}
      {scanResults && (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl shadow-xl border-2 border-gray-200 dark:border-slate-700 p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Network Scan Results</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Comprehensive security analysis report</p>
              </div>
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
              {/* 1. Scan Completion Status */}
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

              {/* Network Scan Security Report Section Header - Enhanced */}
              {scanResults?.results?.json?.analyzedResults && Object.keys(scanResults.results.json.analyzedResults).length > 0 && (
                <div className="mb-8 pb-6 border-b-2 border-orange-200 dark:border-orange-800">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="p-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl shadow-lg">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-4xl font-extrabold bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">Network Security Analysis Report</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Detailed security assessment and vulnerability analysis</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleExportPDF}
                        className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 text-white rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export PDF
                      </button>
                      <button
                        onClick={handleAISuggestion}
                        className="px-5 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI Suggestions
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Command Results in Specific Order */}
              {scanResults?.results?.json?.analyzedResults && Object.keys(scanResults.results.json.analyzedResults).length > 0 && (
                <div className="space-y-6">
                  {(() => {
                    // Helper function to recursively parse JSON strings in the analyzed results
                    const parseJsonStrings = (obj) => {
                      if (!obj || typeof obj !== 'object') return obj;
                      
                      if (Array.isArray(obj)) {
                        return obj.map(item => parseJsonStrings(item));
                      }
                      
                      const parsed = {};
                      for (const [key, value] of Object.entries(obj)) {
                        if (typeof value === 'string') {
                          const trimmed = value.trim();
                          // Try to parse if it looks like JSON
                          if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                              (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                            try {
                              parsed[key] = parseJsonStrings(JSON.parse(trimmed));
                            } catch (e) {
                              // If parsing fails, keep as string
                              parsed[key] = value;
                            }
                          } else {
                            parsed[key] = value;
                          }
                        } else if (typeof value === 'object' && value !== null) {
                          parsed[key] = parseJsonStrings(value);
                        } else {
                          parsed[key] = value;
                        }
                      }
                      return parsed;
                    };
                    
                    // Parse any JSON strings in the analyzed results
                    const rawAnalyzedResults = scanResults.results.json.analyzedResults;
                    const analyzedResults = parseJsonStrings(rawAnalyzedResults);
                    
                    // Helper function to render a command result card
                    const renderCommandCard = (analyzed, config) => {
                      if (!analyzed || analyzed.error) return null;
                      
                      const colors = {
                        bg: 'bg-orange-50 dark:bg-orange-900/20',
                        border: 'border-orange-200 dark:border-orange-800',
                        iconBg: 'bg-orange-100 dark:bg-orange-900/30',
                        text: 'text-orange-900 dark:text-orange-100'
                      };
                      
                      return (
                        <div key={config.key} className={`${colors.bg} ${colors.border} rounded-2xl border-2 p-8 shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:-translate-y-1`}>
                          {/* Scan Name and Description - At Top */}
                          <div className="flex items-start gap-5 mb-8 pb-6 border-b-2 border-orange-200 dark:border-orange-800">
                            <div className={`p-4 ${colors.iconBg} rounded-2xl shadow-lg`}>
                              <span className="text-4xl">{config.icon}</span>
                            </div>
                            <div className="flex-1">
                              <h4 className="text-2xl font-extrabold text-orange-900 dark:text-orange-100 mb-3">{config.title}</h4>
                              <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">{config.description}</p>
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
                                // If parsing fails, skip summary display
                                return null;
                              }
                            }
                            
                            if (!summaryData || typeof summaryData !== 'object' || Array.isArray(summaryData)) {
                              return null;
                            }
                            
                            const summaryEntries = Object.entries(summaryData).filter(([key, value]) => {
                              // Skip if value is null, undefined, or empty object/array
                              if (value === null || value === undefined) return false;
                              if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
                              if (Array.isArray(value) && value.length === 0) return false;
                              
                              // Filter out command-related keys
                              const keyLower = key.toLowerCase();
                              if (['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) ||
                                  keyLower.includes('command') || keyLower.includes('cmd')) {
                                return false;
                              }
                              
                              return true;
                            });
                            
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
                                                      // If parsing fails, keep as string
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
                          
                          {/* Row Layout: Findings (Left) and Recommendations (Right) */}
                          <div className="mb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Findings - Left Side */}
                            {analyzed.findings && Array.isArray(analyzed.findings) && analyzed.findings.length > 0 && (() => {
                            // Extract keys from whatWeGot to avoid duplication
                            const whatWeGotKeys = new Set();
                            if (analyzed.whatWeGot) {
                              let whatWeGotData = analyzed.whatWeGot;
                              // Parse if it's a JSON string
                              if (typeof whatWeGotData === 'string') {
                                try {
                                  const trimmed = whatWeGotData.trim();
                                  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                    whatWeGotData = JSON.parse(trimmed);
                                  }
                                } catch (e) {
                                  // Keep as string if parsing fails
                                }
                              }
                              
                              // Collect all keys from whatWeGot object
                              if (typeof whatWeGotData === 'object' && whatWeGotData !== null && !Array.isArray(whatWeGotData)) {
                                Object.keys(whatWeGotData).forEach(key => {
                                  whatWeGotKeys.add(key.toLowerCase());
                                  // Also check for common variations
                                  whatWeGotKeys.add(key.toLowerCase().replace(/\s+/g, ''));
                                });
                              }
                            }
                            
                            // Filter findings to exclude duplicates from whatWeGot
                            const uniqueFindings = analyzed.findings.filter((finding, idx) => {
                              // Skip if this finding is just repeating whatWeGot data
                              if (finding.type && whatWeGotKeys.has(finding.type.toLowerCase())) {
                                return false;
                              }
                              if (finding.name && whatWeGotKeys.has(finding.name.toLowerCase())) {
                                return false;
                              }
                              // Check if finding detail matches whatWeGot keys
                              if (finding.detail) {
                                const detailLower = String(finding.detail).toLowerCase();
                                for (const key of whatWeGotKeys) {
                                  if (detailLower.includes(key)) {
                                    // Check if this is just a duplicate
                                    const findingValue = finding.detail || finding.description || '';
                                    // If whatWeGot already shows this, skip
                                    return false;
                                  }
                                }
                              }
                              return true;
                            });
                            
                            // Also filter out findings that are just basic info already shown in Key Findings
                            const basicInfoKeys = ['status', 'country', 'server', 'ipaddress', 'ip', 'http server', 'title'];
                            const filteredFindings = uniqueFindings.filter(finding => {
                              const findingType = (finding.type || finding.name || '').toLowerCase();
                              const findingDetail = (finding.detail || finding.description || '').toLowerCase();
                              
                              // Skip if it's basic info already shown
                              for (const basicKey of basicInfoKeys) {
                                if (findingType.includes(basicKey) || findingDetail.includes(basicKey)) {
                                  // Check if this info is already in whatWeGot
                                  if (whatWeGotKeys.size > 0) {
                                    return false; // Skip duplicates
                                  }
                                }
                              }
                              return true;
                            });
                            
                            if (filteredFindings.length === 0) return null;
                            
                            return (
                              <div className="mb-8">
                                <div className="flex items-center gap-3 mb-4">
                                  <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                  <h5 className="text-lg font-bold text-gray-900 dark:text-white">Security Findings</h5>
                                  <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-semibold">
                                    {filteredFindings.length} {filteredFindings.length === 1 ? 'Finding' : 'Findings'}
                                  </span>
                                </div>
                                <div className="space-y-3">
                                  {filteredFindings.map((finding, idx) => {
                                  // Get all properties except type, name, severity, command, commandName (filter out Kali command info)
                                  const otherProps = Object.entries(finding).filter(([key]) => {
                                    const keyLower = key.toLowerCase();
                                    return !['type', 'name', 'severity', 'command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                           !keyLower.includes('command') && 
                                           !keyLower.includes('cmd');
                                  });
                                  
                                  return (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                      <div className="flex items-start justify-between mb-3">
                                        <h6 className="text-sm font-semibold text-gray-900 dark:text-white">
                                          {finding.type || finding.name || `Finding ${idx + 1}`}
                                        </h6>
                                        {finding.severity && (
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            finding.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                            finding.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                            finding.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                            'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                          }`}>
                                            {finding.severity.toUpperCase()}
                                          </span>
                                        )}
                                      </div>
                                      
                                      {/* Display ALL other properties with proper JSON formatting */}
                                      <div className="space-y-2">
                                        {otherProps.map(([key, value]) => {
                                          if (value === null || value === undefined || 
                                              (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
                                              (Array.isArray(value) && value.length === 0)) {
                                            return null;
                                          }
                                          
                                          // Format key name
                                          const formattedKey = key
                                            .replace(/([A-Z])/g, ' $1')
                                            .replace(/^./, str => str.toUpperCase())
                                            .trim();
                                          
                                          // Parse JSON strings and format properly
                                          let parsedValue = value;
                                          if (typeof value === 'string') {
                                            const trimmed = value.trim();
                                            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                              try {
                                                parsedValue = JSON.parse(trimmed);
                                              } catch (e) {
                                                // Keep as string if parsing fails
                                                parsedValue = value;
                                              }
                                            }
                                          }
                                          
                                          return (
                                            <div key={key} className="mb-2">
                                              <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{formattedKey}</div>
                                              <div className={`text-sm ${
                                                key.toLowerCase().includes('description') || key.toLowerCase().includes('details') || key.toLowerCase().includes('info') ?
                                                  'text-gray-700 dark:text-gray-300' :
                                                  key.toLowerCase().includes('location') || key.toLowerCase().includes('address') || key.toLowerCase().includes('ip') || key.toLowerCase().includes('url') ?
                                                    'text-gray-600 dark:text-gray-400 font-mono' :
                                                    'text-gray-700 dark:text-gray-300'
                                              }`}>
                                                {(() => {
                                                  // Handle arrays - display as formatted list
                                                  if (Array.isArray(parsedValue)) {
                                                    return (
                                                      <div className="space-y-2 mt-1">
                                                        {parsedValue.map((item, itemIdx) => (
                                                          <div key={itemIdx} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                                                            {typeof item === 'object' && item !== null ? (
                                                              <div className="space-y-2">
                                                                {Object.entries(item).map(([subKey, subValue]) => (
                                                                  <div key={subKey} className="flex items-start gap-2">
                                                                    <span className="font-semibold text-gray-600 dark:text-gray-400 min-w-[120px] text-xs">
                                                                      {subKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                                                                    </span>
                                                                    <span className="text-gray-800 dark:text-gray-200 flex-1 text-xs">
                                                                      {String(subValue)}
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
                                                              {String(subValue)}
                                                            </span>
                                                          </div>
                                                        ))}
                                                      </div>
                                                    );
                                                  }
                                                  // Handle primitives
                                                  return typeof parsedValue === 'string' && parsedValue.length > 500 ? 
                                                    <div className="whitespace-pre-wrap break-words">{parsedValue}</div> :
                                                    String(parsedValue);
                                                })()}
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })() || <div></div>}
                            
                            {/* Recommendations - Right Side */}
                            {analyzed.recommendations && Array.isArray(analyzed.recommendations) && analyzed.recommendations.length > 0 ? (
                              <div>
                                <div className="flex items-center gap-3 mb-4">
                                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <h5 className="text-lg font-bold text-green-600 dark:text-green-400">Security Recommendations</h5>
                                </div>
                                <ul className="space-y-2">
                                  {analyzed.recommendations.map((rec, idx) => {
                                    const recText = typeof rec === 'string' ? rec : (rec.description || rec.recommendation || rec.text || JSON.stringify(rec));
                                    return (
                                      <li key={idx} className="flex items-start gap-2 bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                                        <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{recText}</span>
                                      </li>
                                    );
                                  })}
                                </ul>
                              </div>
                            ) : (
                              <div></div>
                            )}
                          </div>
                          
                          {/* Vulnerabilities - Horizontal Scrollable List View */}
                          {analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities) && analyzed.vulnerabilities.length > 0 && (
                            <div className="mb-8">
                              <div className="flex items-center gap-3 mb-4">
                                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <h5 className="text-lg font-bold text-red-600 dark:text-red-400">Security Vulnerabilities</h5>
                                <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-full text-sm font-semibold">
                                  {analyzed.vulnerabilities.length} {analyzed.vulnerabilities.length === 1 ? 'Vulnerability' : 'Vulnerabilities'}
                                </span>
                              </div>
                              <div className="overflow-x-auto">
                                <div className="flex gap-4 pb-4" style={{ minWidth: 'max-content' }}>
                                  {analyzed.vulnerabilities.map((vuln, idx) => {
                                    // Filter out command-related keys
                                    const filteredVuln = Object.entries(vuln).filter(([key]) => {
                                      const keyLower = key.toLowerCase();
                                      return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                             !keyLower.includes('command') && 
                                             !keyLower.includes('cmd');
                                    });
                                    
                                    return (
                                      <div key={idx} className="flex-shrink-0 w-80 bg-white dark:bg-gray-800 rounded-lg p-5 border-2 border-red-200 dark:border-red-800 shadow-lg">
                                        <div className="flex items-start justify-between mb-3">
                                          <h6 className="text-base font-semibold text-gray-900 dark:text-white">
                                            {vuln.name || vuln.type || `Vulnerability ${idx + 1}`}
                                          </h6>
                                          {vuln.severity && (
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                              vuln.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                              vuln.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200' :
                                              vuln.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                                            }`}>
                                              {vuln.severity.toUpperCase()}
                                            </span>
                                          )}
                                        </div>
                                        
                                        {vuln.description && (
                                          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                            {vuln.description}
                                          </p>
                                        )}
                                        
                                        {vuln.location && (
                                          <div className="mb-3">
                                            <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Location</div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                                              {typeof vuln.location === 'string' ? vuln.location : 
                                               typeof vuln.location === 'object' ? JSON.stringify(vuln.location) : 
                                               String(vuln.location)}
                                            </p>
                                          </div>
                                        )}
                                        
                                        {vuln.solution && (
                                          <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                                            <div className="text-xs font-semibold text-green-700 dark:text-green-300 mb-2">Solution</div>
                                            {vuln.solution.steps && Array.isArray(vuln.solution.steps) ? (
                                              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
                                                {vuln.solution.steps.map((step, stepIdx) => (
                                                  <li key={stepIdx}>{step}</li>
                                                ))}
                                              </ol>
                                            ) : (
                                              <p className="text-sm text-gray-700 dark:text-gray-300">{typeof vuln.solution === 'string' ? vuln.solution : vuln.solution.description || vuln.solution.recommendations || ''}</p>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Port Grid for Port Scanning Commands - Enhanced */}
                          {(config.key === 'nmapFast' || config.key === 'nmapFull') && analyzed.ports && Array.isArray(analyzed.ports) && analyzed.ports.length > 0 && (
                            <div className="mb-8">
                              <div className="flex items-center gap-3 mb-4">
                                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <h5 className="text-lg font-bold text-orange-900 dark:text-orange-100">Port Details</h5>
                                <span className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-full text-sm font-semibold">
                                  {analyzed.ports.length} {analyzed.ports.length === 1 ? 'Port' : 'Ports'}
                                </span>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="w-full border-collapse bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
                                  <thead>
                                    <tr className="bg-orange-100 dark:bg-orange-900/30">
                                      <th className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-left text-sm font-semibold text-orange-900 dark:text-orange-100">Port</th>
                                      <th className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-left text-sm font-semibold text-orange-900 dark:text-orange-100">State</th>
                                      <th className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-left text-sm font-semibold text-orange-900 dark:text-orange-100">Service</th>
                                      <th className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-left text-sm font-semibold text-orange-900 dark:text-orange-100">Version</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {analyzed.ports.map((port, idx) => (
                                      <tr key={idx} className="hover:bg-orange-50 dark:hover:bg-orange-900/10">
                                        <td className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                                          {port.port || port.number || port.portNumber || 'N/A'}
                                        </td>
                                        <td className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-sm">
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            port.state === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' :
                                            port.state === 'closed' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200' :
                                            port.state === 'filtered' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' :
                                            'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-200'
                                          }`}>
                                            {port.state || 'unknown'}
                                          </span>
                                        </td>
                                        <td className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                                          {port.service || (typeof port.service === 'object' ? port.service?.name : 'N/A')}
                                        </td>
                                        <td className="border border-orange-200 dark:border-orange-800 px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                          {port.version || (typeof port.service === 'object' ? port.service?.version : 'N/A')}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          
                          {/* Handle findings as flat object (not array) - e.g., {country: "...", httpServer: "...", ipAddress: "...", title: "..."} */}
                          {/* Skip this section if whatWeGot already contains this data */}
                          {analyzed.findings && !Array.isArray(analyzed.findings) && typeof analyzed.findings === 'object' && Object.keys(analyzed.findings).length > 0 && (() => {
                            // Check if whatWeGot already contains these findings
                            if (analyzed.whatWeGot) {
                              let whatWeGotData = analyzed.whatWeGot;
                              if (typeof whatWeGotData === 'string') {
                                try {
                                  const trimmed = whatWeGotData.trim();
                                  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                    whatWeGotData = JSON.parse(trimmed);
                                  }
                                } catch (e) {
                                  // Keep as string
                                }
                              }
                              
                              // If whatWeGot is an object with similar keys, skip showing findings as object
                              if (typeof whatWeGotData === 'object' && whatWeGotData !== null && !Array.isArray(whatWeGotData)) {
                                const whatWeGotKeys = Object.keys(whatWeGotData).map(k => k.toLowerCase());
                                const findingsKeys = Object.keys(analyzed.findings).map(k => k.toLowerCase());
                                
                                // If most keys overlap, skip this section (already shown in Key Findings)
                                const overlap = findingsKeys.filter(k => whatWeGotKeys.includes(k)).length;
                                if (overlap >= findingsKeys.length * 0.7) {
                                  return null; // Skip duplicate display
                                }
                              }
                            }
                            
                            return (
                            <div className="mb-6">
                              <h5 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Findings</h5>
                              <div className="space-y-3">
                                {Object.entries(analyzed.findings)
                                  .filter(([key]) => {
                                    const keyLower = key.toLowerCase();
                                    return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                           !keyLower.includes('command') && 
                                           !keyLower.includes('cmd');
                                  })
                                  .map(([key, value], idx) => {
                                  if (value === null || value === undefined || 
                                      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
                                      (Array.isArray(value) && value.length === 0)) {
                                    return null;
                                  }
                                  
                                  // Format key name
                                  const formattedKey = key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, str => str.toUpperCase())
                                    .trim();
                                  
                                  // Format value
                                  let displayValue = value;
                                  if (typeof value === 'boolean') {
                                    displayValue = value ? 'Yes' : 'No';
                                  } else if (typeof value === 'object' && !Array.isArray(value)) {
                                    displayValue = JSON.stringify(value, null, 2);
                                  } else if (Array.isArray(value)) {
                                    displayValue = value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                                  }
                                  
                                  return (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                      <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{formattedKey}</div>
                                      <div className={`text-sm ${
                                        key.toLowerCase().includes('description') || key.toLowerCase().includes('details') || key.toLowerCase().includes('info') ?
                                          'text-gray-700 dark:text-gray-300' :
                                          key.toLowerCase().includes('location') || key.toLowerCase().includes('address') || key.toLowerCase().includes('ip') || key.toLowerCase().includes('url') ?
                                            'text-gray-600 dark:text-gray-400 font-mono' :
                                            'text-gray-700 dark:text-gray-300'
                                      }`}>
                                        {typeof displayValue === 'string' && displayValue.length > 500 ? 
                                          <div className="whitespace-pre-wrap break-words">{displayValue}</div> :
                                          String(displayValue)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })()}
                          
                          {/* What We Did & What We Got section removed - redundant with new template structure */}
                          {false && (analyzed.whatWeDid || analyzed.whatWeGot) && (() => {
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
                                                      // If parsing fails, keep as string
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
                          
                          {/* Handle findings as flat object (not array) - e.g., {country: "...", httpServer: "...", ipAddress: "...", title: "..."} */}
                          {/* Skip this section if whatWeGot already contains this data */}
                          {analyzed.findings && !Array.isArray(analyzed.findings) && typeof analyzed.findings === 'object' && Object.keys(analyzed.findings).length > 0 && (() => {
                            // Check if whatWeGot already contains these findings
                            if (analyzed.whatWeGot) {
                              let whatWeGotData = analyzed.whatWeGot;
                              if (typeof whatWeGotData === 'string') {
                                try {
                                  const trimmed = whatWeGotData.trim();
                                  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                                      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                                    whatWeGotData = JSON.parse(trimmed);
                                  }
                                } catch (e) {
                                  // Keep as string
                                }
                              }
                              
                              // If whatWeGot is an object with similar keys, skip showing findings as object
                              if (typeof whatWeGotData === 'object' && whatWeGotData !== null && !Array.isArray(whatWeGotData)) {
                                const whatWeGotKeys = Object.keys(whatWeGotData).map(k => k.toLowerCase());
                                const findingsKeys = Object.keys(analyzed.findings).map(k => k.toLowerCase());
                                
                                // If most keys overlap, skip this section (already shown in Key Findings)
                                const overlap = findingsKeys.filter(k => whatWeGotKeys.includes(k)).length;
                                if (overlap >= findingsKeys.length * 0.7) {
                                  return null; // Skip duplicate display
                                }
                              }
                            }
                            
                            return (
                            <div className="mb-6">
                              <h5 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Findings</h5>
                              <div className="space-y-3">
                                {Object.entries(analyzed.findings)
                                  .filter(([key]) => {
                                    const keyLower = key.toLowerCase();
                                    return !['command', 'commandname', 'cmd', 'commandline', 'kali', 'tool'].includes(keyLower) &&
                                           !keyLower.includes('command') && 
                                           !keyLower.includes('cmd');
                                  })
                                  .map(([key, value], idx) => {
                                  if (value === null || value === undefined || 
                                      (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) ||
                                      (Array.isArray(value) && value.length === 0)) {
                                    return null;
                                  }
                                  
                                  // Format key name
                                  const formattedKey = key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, str => str.toUpperCase())
                                    .trim();
                                  
                                  // Format value
                                  let displayValue = value;
                                  if (typeof value === 'boolean') {
                                    displayValue = value ? 'Yes' : 'No';
                                  } else if (typeof value === 'object' && !Array.isArray(value)) {
                                    displayValue = JSON.stringify(value, null, 2);
                                  } else if (Array.isArray(value)) {
                                    displayValue = value.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join(', ');
                                  }
                                  
                                  return (
                                    <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                      <div className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{formattedKey}</div>
                                      <div className={`text-sm ${
                                        key.toLowerCase().includes('description') || key.toLowerCase().includes('details') || key.toLowerCase().includes('info') ?
                                          'text-gray-700 dark:text-gray-300' :
                                          key.toLowerCase().includes('location') || key.toLowerCase().includes('address') || key.toLowerCase().includes('ip') || key.toLowerCase().includes('url') ?
                                            'text-gray-600 dark:text-gray-400 font-mono' :
                                            'text-gray-700 dark:text-gray-300'
                                      }`}>
                                        {typeof displayValue === 'string' && displayValue.length > 500 ? 
                                          <div className="whitespace-pre-wrap break-words">{displayValue}</div> :
                                          String(displayValue)}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })()}
                          
                          {/* What We Did & What We Got section removed - redundant with new template structure */}
                          {false && (analyzed.whatWeDid || analyzed.whatWeGot) && (() => {
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
                                                      // If parsing fails, keep as string
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
                          
                          {/* Old Vulnerabilities section - disabled, using horizontal scrollable version above */}
                          {false && analyzed.vulnerabilities && Array.isArray(analyzed.vulnerabilities) && analyzed.vulnerabilities.length > 0 && (
                            <div className="mb-8">
                              {/* This section is disabled - vulnerabilities are shown in horizontal scrollable view above */}
                            </div>
                          )}
                          
                          {/* Fallback: Display full JSON if expected fields are missing */}
                          {(!analyzed.summary && !analyzed.findings && !analyzed.vulnerabilities && !analyzed.recommendations && !analyzed.ports) && (
                            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                              <h5 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Complete Analysis Report</h5>
                              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto">
                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                  {JSON.stringify(analyzed, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    };
                    
                    // Define command configs in the exact order specified with enhanced titles
                    const commandConfigs = [
                      {
                        key: 'whatweb',
                        title: 'Web Technology & Framework Analysis',
                        description: 'Comprehensive web technology fingerprinting and detection. Identifies web servers, content management systems, frameworks, and technologies used by the target website.',
                        icon: '🌐'
                      },
                      {
                        key: 'ping',
                        title: 'Network Connectivity & Latency Assessment',
                        description: 'ICMP connectivity test to verify network reachability and measure response times. Checks if the target host is online and responsive to network requests.',
                        icon: '📡'
                      },
                      {
                        key: 'host',
                        title: 'DNS Resolution & Record Analysis',
                        description: 'DNS lookup to resolve domain names to IP addresses. Retrieves A, MX, TXT, and other DNS records for the target domain.',
                        icon: '🔍'
                      },
                      {
                        key: 'hping',
                        title: 'Advanced Network Packet Analysis',
                        description: 'Advanced packet crafting tool for network testing. Tests TCP connectivity and firewall rules by sending custom packets to analyze network behavior.',
                        icon: '🔧'
                      },
                      {
                        key: 'nmapSn',
                        title: 'Network Host Discovery & Enumeration',
                        description: 'Network host discovery scan to identify active hosts on the network. Uses ICMP and ARP protocols to determine if hosts are up and reachable.',
                        icon: '🎯'
                      },
                      {
                        key: 'nmapFast',
                        title: 'Rapid Port Scanning & Service Detection',
                        description: 'Quick port scan of the top 100 most common ports. Provides fast overview of open ports and services without scanning all ports.',
                        icon: '⚡'
                      },
                      {
                        key: 'nmapFull',
                        title: 'Comprehensive Port & Service Enumeration',
                        description: 'Comprehensive port scan of all 65535 ports with service version detection. Most thorough scan that identifies all open ports and running services.',
                        icon: '🛡️'
                      }
                    ];
                    
                    return (
                      <>
                        {commandConfigs.map((config) => {
                          const analyzed = analyzedResults[config.key];
                          return renderCommandCard(analyzed, config);
                        })}
                      </>
                    );
                  })()}
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

              {/* Raw Results - AI Analysis and Kali Raw Results */}
              {scanResults && scanResults.success && (
                <div id="raw-results-section" className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 mt-6 border border-gray-200 dark:border-gray-700 max-w-full overflow-x-hidden">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Raw Results</h3>
                  
                  {/* Combined AI Analysis Result */}
                  {scanResults?.results?.json?.analyzedResults && (
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Combined Analysis Report</h4>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                          {JSON.stringify(scanResults.results.json.analyzedResults, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                  
                  {/* Combined Kali Raw Results */}
                  {scanResults?.results?.json?.rawResults && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Combined Raw Scan Results (Kali Output)</h4>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                          {JSON.stringify(scanResults.results.json.rawResults, null, 2)}
                        </pre>
                      </div>
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

              {/* Legacy Command Results (fallback) - Only show if AI analysis results are NOT available */}
              {scanResults.results && !scanResults.results.markdown && !tgptConvertedResults && (
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
