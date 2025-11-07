import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import { getAISuggestions, formatAISuggestions } from '../utils/grokApi'
import { getSecurePassword } from '../utils/securePasswordStorage'
import jsPDF from 'jspdf'

const WapitiScan = ({ 
  title, 
  description, 
  helpContent, 
  onDetectionCheck, 
  detectionType 
}) => {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [siteUrl, setSiteUrl] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectionResult, setDetectionResult] = useState(null)
  const [lastCheckedUrl, setLastCheckedUrl] = useState('')
  const [logs, setLogs] = useState([])
  const [scanResults, setScanResults] = useState(null)
  const [rawJson, setRawJson] = useState(null)
  const [rawCommand, setRawCommand] = useState('')
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [tgptConvertedResults, setTgptConvertedResults] = useState(null)
  const [isLoadingTgpt, setIsLoadingTgpt] = useState(false)
  const [tgptConversionComplete, setTgptConversionComplete] = useState(false)
  const [expectedCompletionTime, setExpectedCompletionTime] = useState(null)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)
  const aiSuggestionRef = useRef(null)
  const progressListenerRef = useRef(null)
  const doneListenerRef = useRef(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Timer - keep running during scan AND tgpt conversion
  useEffect(() => {
    // Keep timer running if scanning OR if tgpt conversion is in progress
    const shouldRunTimer = (isScanning || isLoadingTgpt || (scanResults && !tgptConversionComplete)) && startTime && !endTime
    
    if (shouldRunTimer) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        setElapsedTime(elapsed)
        // Update expected completion time every second
        const expected = getExpectedCompletionTime()
        setExpectedCompletionTime(expected)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isScanning, isLoadingTgpt, scanResults, tgptConversionComplete, startTime, endTime])

  // Update expected completion time when state changes
  useEffect(() => {
    if (startTime && !endTime) {
      const expected = getExpectedCompletionTime()
      setExpectedCompletionTime(expected)
    } else {
      setExpectedCompletionTime(null)
    }
  }, [isScanning, isLoadingTgpt, scanResults, tgptConversionComplete, startTime, endTime])

  // Format elapsed time
  const formatElapsedTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  // Calculate expected completion time
  const getExpectedCompletionTime = () => {
    if (!startTime || endTime) return null
    
    // Estimate based on current state
    const elapsed = Date.now() - startTime
    let estimatedRemaining = 0
    
    if (isLoadingTgpt) {
      // If tgpt is loading, estimate 2 minutes remaining
      estimatedRemaining = 2 * 60 * 1000
    } else if (scanResults && !tgptConversionComplete && !isLoadingTgpt) {
      // If scan is done but tgpt hasn't started yet, estimate 2 minutes
      estimatedRemaining = 2 * 60 * 1000
    } else if (isScanning) {
      // If still scanning, estimate based on typical scan time (5 minutes max)
      const maxScanTime = 5 * 60 * 1000
      estimatedRemaining = Math.max(0, maxScanTime - elapsed)
      // If scan is almost done, add 2 minutes for tgpt conversion
      if (estimatedRemaining < 60 * 1000) {
        estimatedRemaining = 2 * 60 * 1000
      }
    }
    
    if (estimatedRemaining > 0) {
      return Date.now() + estimatedRemaining
    }
    
    return null
  }

  // Format date/time
  const formatDateTime = (date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  // Validate URL
  const validateUrl = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return urlObj.href
    } catch {
      return null
    }
  }

  // Add log
  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, { timestamp, message, type }])
  }

  // Copy logs
  const copyLogs = () => {
    const logText = logs.map(log => `[${log.timestamp}] ${log.message}`).join('\n')
    navigator.clipboard.writeText(logText)
    showSuccess('Logs copied to clipboard!')
  }

  // Clear logs
  const clearLogs = () => {
    setLogs([])
    showSuccess('Logs cleared!')
  }

  // Detect CMS
  const handleDetection = async () => {
    const validUrl = validateUrl(siteUrl)
    if (!validUrl) {
      showError('Please enter a valid URL')
      return
    }

    setIsDetecting(true)
    setDetectionResult(null)
    addLog(`🔍 Checking if site is ${detectionType}...`, 'info')

    try {
      const isDetected = await onDetectionCheck(validUrl)
      setDetectionResult(isDetected)
      
      if (isDetected) {
        addLog(`✅ Site confirmed as ${detectionType}!`, 'success')
        showSuccess(`Site is ${detectionType}! You can now start the scan.`)
      } else {
        addLog(`❌ Site is not ${detectionType}.`, 'error')
        showError(`This site does not appear to be ${detectionType}. Please verify the URL.`)
      }
    } catch (error) {
      addLog(`❌ Detection error: ${error.message}`, 'error')
      showError(`Detection failed: ${error.message}`)
      setDetectionResult(false)
    } finally {
      setIsDetecting(false)
    }
  }

  // Reset detection when URL changes
  useEffect(() => {
    if (siteUrl !== lastCheckedUrl) {
      setDetectionResult(null)
    }
  }, [siteUrl, lastCheckedUrl])

  // Start scan - integrated with check
  const handleStartScan = async () => {
    const validUrl = validateUrl(siteUrl)
    if (!validUrl) {
      showError('Please enter a valid URL')
      return
    }

    let isDetected = detectionResult

    // If URL changed or not checked yet, check first
    if (lastCheckedUrl !== validUrl || detectionResult === null) {
      setIsDetecting(true)
      setDetectionResult(null)
      addLog(`🔍 Checking if site is ${detectionType}...`, 'info')

      try {
        isDetected = await onDetectionCheck(validUrl)
        setDetectionResult(isDetected)
        setLastCheckedUrl(validUrl)
        
        if (!isDetected) {
          setIsDetecting(false)
          addLog(`❌ Site is not ${detectionType}. This feature is specifically for ${detectionType} sites only.`, 'error')
          showError(`This site does not appear to be ${detectionType}. This feature is specifically designed for ${detectionType} sites only. Please verify the URL or use a different scan option.`)
          return
        }
        
        addLog(`✅ Site confirmed as ${detectionType}!`, 'success')
        showSuccess(`Site confirmed as ${detectionType}! Starting scan...`)
        setIsDetecting(false)
      } catch (error) {
        setIsDetecting(false)
        addLog(`❌ Detection error: ${error.message}`, 'error')
        showError(`Detection failed: ${error.message}`)
        setDetectionResult(false)
        return
      }
    }

    // If detection failed, don't proceed (use local variable, not state)
    if (!isDetected) {
      showError(`This site is not ${detectionType}. This feature is specifically for ${detectionType} sites only.`)
      return
    }

    setIsScanning(true)
    setStartTime(Date.now())
    setEndTime(null)
    setElapsedTime(0)
    setLogs([])
    setScanResults(null)
    setRawJson(null)
    setAiSuggestions(null)
    setTgptConvertedResults(null)
    setTgptConversionComplete(false)
    setRawCommand('')

    addLog(`🚀 Starting Wapiti scan for ${validUrl}...`, 'info')

    // Build command (removed wapp module due to database issues)
    const command = `wapiti -u ${validUrl} -d 3 -m xss,sql -f json -o local_scan.json --max-scan-time 300 --skip .jpg --skip .jpeg --skip .png --skip .webp`
    setRawCommand(command)
    addLog(`📋 Command: ${command}`, 'info')

    // Setup listeners
    if (progressListenerRef.current) {
      window.cyberGuard.removeWapitiProgressListener(progressListenerRef.current)
    }
    if (doneListenerRef.current) {
      window.cyberGuard.removeWapitiDoneListener(doneListenerRef.current)
    }

    const progressHandler = (data) => {
      if (data && data.message) {
        const logType = data.stage === 'error' ? 'error' : 
                       data.stage === 'success' ? 'success' : 
                       data.stage === 'warning' ? 'warning' : 'info'
        addLog(data.message, logType)
      }
    }

    const doneHandler = async (data) => {
      setIsScanning(false)
      // Don't stop timer yet - keep it running during tgpt conversion
      // setEndTime will be called after tgpt conversion completes

      if (data && data.error) {
        setEndTime(Date.now())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        addLog(`❌ Scan failed: ${data.error}`, 'error')
        showError(`Scan failed: ${data.error}`)
      } else if (data && (data.results || data.success)) {
        addLog('✅ Scan completed successfully!', 'success')
        
        // Read the JSON file using cat command and store in variable
        addLog('📂 Reading scan results from file...', 'info')
        const rawJsonData = data.rawJson || (typeof data.results === 'string' ? data.results : JSON.stringify(data.results, null, 2))
        
        // Store results but don't show them yet - wait for tgpt conversion
        setScanResults(data.results || data)
        setRawJson(rawJsonData)
        setTgptConversionComplete(false) // Reset conversion status
        
        addLog('📋 JSON content loaded: ' + rawJsonData.length + ' characters', 'info')
        
        // Automatically convert results using tgpt first
        // Only show results after tgpt conversion completes
        // Timer will continue running during conversion
        // Skip TGPT conversion for WordPress and Shopify tabs
        if (detectionType !== 'WordPress' && detectionType !== 'Shopify') {
          await handleTgptConversion(rawJsonData)
        } else {
          // For WordPress and Shopify, mark conversion as complete immediately
          setTgptConversionComplete(true)
          addLog('ℹ️ TGPT conversion skipped for ' + detectionType + ' tab', 'info')
        }
        
        // Stop timer only after tgpt conversion completes
        setEndTime(Date.now())
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
        
        showSuccess('Scan completed successfully!')
      }
    }

    // Register listeners and store handlers for cleanup
    progressListenerRef.current = window.cyberGuard.onWapitiProgress(progressHandler)
    doneListenerRef.current = window.cyberGuard.onWapitiDone(doneHandler)

    try {
      await window.cyberGuard.startWapitiScan(validUrl)
    } catch (error) {
      setIsScanning(false)
      setEndTime(Date.now())
      addLog(`❌ Failed to start scan: ${error.message}`, 'error')
      showError(`Failed to start scan: ${error.message}`)
    }
  }

  // Stop scan
  const handleStopScan = async () => {
    try {
      await window.cyberGuard.stopWapitiScan()
      setIsScanning(false)
      setEndTime(Date.now())
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      addLog('⏹️ Scan stopped by user', 'warning')
      showSuccess('Scan stopped successfully')
    } catch (error) {
      showError(`Failed to stop scan: ${error.message}`)
    }
  }

  // Convert results using tgpt
  const handleTgptConversion = async (rawJsonData) => {
    if (!rawJsonData) {
      console.log('⚠️ No raw JSON data for tgpt conversion')
      addLog('⚠️ No raw JSON data for tgpt conversion', 'warning')
      setTgptConversionComplete(true) // Allow showing results even if conversion fails
      return
    }

    setIsLoadingTgpt(true)
    setTgptConvertedResults(null)
    setTgptConversionComplete(false)
    addLog('🤖 Converting scan results using AI...', 'info')

    try {
      // Prepare the prompt for tgpt - explicitly request JSON output
      // Use a clear, specific prompt to ensure TGPT analyzes the scan results properly
      const prompt = `You are a security analyst. Analyze the following Wapiti security scan result and provide a comprehensive security report in JSON format.

IMPORTANT: You must analyze the scan results provided below and create a detailed security report. Do NOT provide generic responses or greetings.

Required JSON structure:
{
  "summary": {
    "target": "target URL from scan",
    "totalVulnerabilities": number,
    "scanDate": "date in readable format",
    "severityBreakdown": {
      "critical": number,
      "high": number,
      "medium": number,
      "low": number
    }
  },
  "vulnerabilities": [
    {
      "name": "vulnerability name",
      "severity": "critical|high|medium|low",
      "description": "clear description in simple terms",
      "impact": "what this means for the user",
      "location": "where it was found (URL, parameter, etc.)",
      "remediation": "step-by-step fix instructions",
      "references": ["url1", "url2"]
    }
  ],
  "recommendations": [
    "general security recommendation 1",
    "general security recommendation 2"
  ]
}

Wapiti Security Scan Result:
${rawJsonData}

Analyze the above scan result and provide ONLY valid JSON output. No additional text, no greetings, no explanations - just the JSON object.`
      
      // Log the tgpt command/prompt
      addLog('📋 Converting results with AI...', 'info')
      addLog('📋 Prompt length: ' + prompt.length + ' characters', 'info')
      addLog('📋 Full TGPT Prompt:', 'info')
      addLog(prompt, 'info')
      addLog('📋 TGPT Command: cat file | tgpt', 'info')
      console.log('🤖 [TGPT] Full prompt being sent:', prompt)
      console.log('🤖 [TGPT] Prompt length:', prompt.length, 'characters')
      
      // Execute tgpt command
      const password = getSecurePassword()
      if (!password) {
        throw new Error('WSL password not available')
      }

      addLog('⏳ Executing AI conversion...', 'info')
      const result = await window.cyberGuard?.convertWithTgpt?.(prompt, password)
      
      // Log the response
      if (result) {
        const outputLength = (result.output || result.stdout || '').length
        addLog('📤 AI Response received: ' + outputLength + ' characters', 'info')
        console.log('🤖 [TGPT] Response (first 1000 chars):', (result.output || result.stdout || '').substring(0, 1000))
        console.log('🤖 [TGPT] Full response:', result.output || result.stdout || '')
        console.log('🤖 [TGPT] Response stderr:', result.stderr || '')
      }
      
      if (result && result.success) {
        const tgptOutput = result.output || result.stdout || ''
        addLog('✅ AI conversion completed successfully!', 'success')
        addLog('📤 AI Output: ' + tgptOutput.length + ' characters', 'info')
        
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
            addLog('✅ Results parsed as JSON successfully!', 'success')
            addLog('📊 Parsed JSON structure: ' + Object.keys(parsedJson).join(', '), 'info')
            setTgptConvertedResults(parsedJson)
            showSuccess('Scan results converted to user-friendly format!')
          } catch (directParseError) {
            // If direct parse fails, try to find JSON in the output (might have text before/after)
            const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              addLog('🔍 Extracting JSON from AI response...', 'info')
              try {
                parsedJson = JSON.parse(jsonMatch[0])
                setTgptConvertedResults(parsedJson)
                addLog('✅ Results parsed as JSON successfully!', 'success')
                addLog('📊 Parsed JSON structure: ' + Object.keys(parsedJson).join(', '), 'info')
                showSuccess('Scan results converted to user-friendly format!')
              } catch (extractParseError) {
                // If JSON extraction fails, store as formatted text
                addLog('⚠️ JSON found but parsing failed, displaying as formatted text', 'warning')
                setTgptConvertedResults(cleanedOutput)
              }
            } else {
              // If no JSON found, store as formatted text
              addLog('ℹ️ No JSON found in AI response, displaying as formatted text', 'info')
              setTgptConvertedResults(cleanedOutput)
            }
          }
        } catch (parseError) {
          console.error('Failed to parse JSON:', parseError)
          addLog('❌ Failed to parse JSON: ' + parseError.message, 'error')
          // Store as formatted text if JSON parsing fails
          setTgptConvertedResults(cleanedOutput)
        }
        
        // Auto-scroll to tgpt results
        setTimeout(() => {
          const tgptSection = document.getElementById('tgpt-results-section')
          if (tgptSection) {
            tgptSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }, 100)
      } else {
        throw new Error(result?.error || 'Failed to convert results')
      }
    } catch (error) {
      addLog(`❌ Failed to convert results with AI: ${error.message}`, 'error')
      console.error('🤖 [TGPT] Conversion error:', error)
      console.error('🤖 [TGPT] Error details:', error.message, error.stack)
      // Show raw results even if conversion fails
    } finally {
      setIsLoadingTgpt(false)
      setTgptConversionComplete(true) // Mark conversion as complete (success or failure)
    }
  }

  // Get AI suggestions
  const handleGetAISuggestions = async () => {
    if (!scanResults) {
      showError('No scan results available')
      return
    }

    setIsLoadingAI(true)
    setAiSuggestions(null)
    addLog('🤖 Generating AI suggestions...', 'info')

    try {
      const suggestions = await getAISuggestions(
        'wapiti',
        'Wapiti Security Scan',
        scanResults,
        JSON.stringify(scanResults, null, 2),
        siteUrl
      )
      setAiSuggestions(formatAISuggestions(suggestions))
      addLog('✅ AI suggestions generated!', 'success')
      
      // Auto-scroll to AI suggestions
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } catch (error) {
      addLog(`❌ Failed to get AI suggestions: ${error.message}`, 'error')
      showError(`Failed to get AI suggestions: ${error.message}`)
    } finally {
      setIsLoadingAI(false)
    }
  }

  // Export PDF
  const handleExportPDF = async () => {
    if (!scanResults) {
      showError('No scan results to export')
      return
    }

    setIsExporting(true)
    addLog('📄 Generating PDF report...', 'info')

    try {
      const doc = new jsPDF()
      let yPos = 20

      // Title
      doc.setFontSize(18)
      doc.text(title, 14, yPos)
      yPos += 10

      // Scan info
      doc.setFontSize(12)
      doc.text(`Target URL: ${siteUrl}`, 14, yPos)
      yPos += 7
      doc.text(`Scan Date: ${formatDateTime(startTime)}`, 14, yPos)
      yPos += 7
      doc.text(`Duration: ${formatElapsedTime(elapsedTime)}`, 14, yPos)
      yPos += 10

      // Results
      doc.setFontSize(16)
      doc.text('Scan Results', 14, yPos)
      yPos += 10

      doc.setFontSize(10)
      const resultsText = JSON.stringify(scanResults, null, 2)
      const lines = doc.splitTextToSize(resultsText, 180)
      
      for (let i = 0; i < lines.length; i++) {
        if (yPos > 280) {
          doc.addPage()
          yPos = 20
        }
        doc.text(lines[i], 14, yPos)
        yPos += 7
      }

      // AI Suggestions
      if (aiSuggestions) {
        if (yPos > 250) {
          doc.addPage()
          yPos = 20
        }
        doc.setFontSize(16)
        doc.text('AI Suggestions', 14, yPos)
        yPos += 10
        doc.setFontSize(10)
        const aiLines = doc.splitTextToSize(aiSuggestions, 180)
        for (let i = 0; i < aiLines.length; i++) {
          if (yPos > 280) {
            doc.addPage()
            yPos = 20
          }
          doc.text(aiLines[i], 14, yPos)
          yPos += 7
        }
      }

      // Save
      const fileName = `wapiti-scan-${siteUrl.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
      addLog(`✅ PDF exported: ${fileName}`, 'success')
      showSuccess('PDF report exported successfully!')
    } catch (error) {
      addLog(`❌ Failed to export PDF: ${error.message}`, 'error')
      showError(`Failed to export PDF: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (progressListenerRef.current) {
        try {
          window.cyberGuard?.removeWapitiProgressListener?.(progressListenerRef.current)
        } catch (e) {
          console.error('Error removing progress listener:', e)
        }
      }
      if (doneListenerRef.current) {
        try {
          window.cyberGuard?.removeWapitiDoneListener?.(doneListenerRef.current)
        } catch (e) {
          console.error('Error removing done listener:', e)
        }
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // Render scan results
  const renderScanResults = () => {
    if (!scanResults) return null

    try {
      const results = typeof scanResults === 'string' ? JSON.parse(scanResults) : scanResults
      
      // Extract all data from Wapiti JSON structure
      const classifications = results.classifications || {}
      const vulnerabilities = results.vulnerabilities || []
      const anomalies = results.anomalies || []
      const info = results.info || {}
      const summary = results.summary || {}
      const target = results.target || siteUrl
      
      // Count total vulnerabilities
      const totalVulns = Object.keys(classifications).length + vulnerabilities.length
      
      return (
        <div className="mt-6 space-y-6 max-w-full overflow-x-hidden">
            {/* Summary Card */}
            <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/30 dark:via-indigo-900/30 dark:to-purple-900/30 rounded-xl shadow-2xl p-8 max-w-full overflow-x-hidden border border-blue-200 dark:border-blue-800 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-3xl font-bold text-gray-900 dark:text-white break-words">Scan Summary</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-blue-100 dark:border-blue-900 hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Target URL</div>
                  </div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white mt-2 break-all">{target}</div>
                </div>
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-red-100 dark:border-red-900 hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Total Vulnerabilities</div>
                  </div>
                  <div className="text-4xl font-bold bg-gradient-to-r from-red-600 to-red-700 bg-clip-text text-transparent mt-2">{totalVulns}</div>
                </div>
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 shadow-xl border-2 border-orange-100 dark:border-orange-900 hover:shadow-2xl transition-all duration-300">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Vulnerability Types</div>
                  </div>
                  <div className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-orange-700 bg-clip-text text-transparent mt-2">{Object.keys(classifications).length}</div>
                </div>
              </div>
            </div>

          {/* Classifications (Vulnerability Types) */}
          {Object.keys(classifications).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 max-w-full overflow-x-hidden border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white break-words">Security Vulnerabilities</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{Object.keys(classifications).length} vulnerability type{Object.keys(classifications).length !== 1 ? 's' : ''} detected</p>
                </div>
              </div>
              <div className="space-y-6">
                {Object.entries(classifications).map(([vulnType, vulnData], idx) => {
                  const vulnInfo = typeof vulnData === 'object' ? vulnData : {}
                  const desc = vulnInfo.desc || vulnInfo.description || 'No description available'
                  const sol = vulnInfo.sol || vulnInfo.solution || vulnInfo.recommendation || 'No solution provided'
                  const ref = vulnInfo.ref || vulnInfo.references || []
                  const refs = Array.isArray(ref) ? ref : (typeof ref === 'string' ? [ref] : [])
                  
                  return (
                    <div key={idx} className="border-l-4 border-red-500 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/30 dark:to-red-900/20 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 max-w-full overflow-x-hidden backdrop-blur-sm">
                      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                          </div>
                          <h4 className="text-2xl font-bold text-red-900 dark:text-red-200 break-words flex-1 min-w-0">{vulnType}</h4>
                        </div>
                        <span className="px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0 shadow-md">
                          High Risk
                        </span>
                      </div>
                      
                      {/* Description */}
                      <div className="mb-5">
                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-3 uppercase tracking-wide">Description</div>
                        <div className="text-gray-800 dark:text-gray-100 bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm rounded-lg p-4 border-2 border-gray-200 dark:border-gray-700 break-words overflow-wrap-anywhere shadow-inner leading-relaxed">
                          {desc}
                        </div>
                      </div>
                      
                      {/* Solution */}
                      <div className="mb-5">
                        <div className="text-sm font-bold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2 uppercase tracking-wide">
                          <div className="p-1.5 bg-green-100 dark:bg-green-900/50 rounded-lg">
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          Solution / Recommendation
                        </div>
                        <div className="text-gray-800 dark:text-gray-100 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/20 rounded-lg p-4 border-2 border-green-200 dark:border-green-800 break-words overflow-wrap-anywhere shadow-inner leading-relaxed">
                          {sol}
                        </div>
                      </div>
                      
                      {/* References */}
                      {refs.length > 0 && (
                        <div className="mb-4">
                          <div className="text-sm font-bold text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-2 uppercase tracking-wide">
                            <div className="p-1.5 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                              <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </div>
                            References
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {refs.map((refUrl, refIdx) => {
                              const isOWASP = refUrl.includes('owasp')
                              const isCWE = refUrl.includes('cwe')
                              const isWikipedia = refUrl.includes('wikipedia')
                              return (
                                <a
                                  key={refIdx}
                                  href={refUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 shadow-md hover:shadow-lg break-all ${
                                    isOWASP 
                                      ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700' 
                                      : isCWE
                                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700'
                                      : isWikipedia
                                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700'
                                      : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700'
                                  }`}
                                >
                                  {isOWASP ? '🔒 OWASP' : isCWE ? '🛡️ CWE' : isWikipedia ? '📚 Wikipedia' : '🔗 Reference'} {refIdx + 1}
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Additional Info */}
                      {Object.keys(vulnInfo).filter(k => !['desc', 'description', 'sol', 'solution', 'recommendation', 'ref', 'references'].includes(k)).length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Additional Information</div>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            {Object.entries(vulnInfo).filter(([k]) => !['desc', 'description', 'sol', 'solution', 'recommendation', 'ref', 'references'].includes(k)).map(([key, value]) => (
                              <div key={key} className="break-words overflow-wrap-anywhere">
                                <span className="font-medium">{key}:</span> {String(value)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Vulnerabilities Array */}
          {vulnerabilities.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-full overflow-x-hidden">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2 break-words">
                <svg className="w-6 h-6 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="break-words">Detected Vulnerabilities ({vulnerabilities.length})</span>
              </h3>
              <div className="space-y-4">
                {vulnerabilities.map((vuln, idx) => (
                  <div key={idx} className="border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 shadow-sm max-w-full overflow-x-hidden">
                    <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
                      <h4 className="text-lg font-bold text-orange-800 dark:text-orange-300 break-words flex-1 min-w-0">
                        {vuln.name || vuln.type || `Vulnerability ${idx + 1}`}
                      </h4>
                      {vuln.severity && (
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 ${
                          vuln.severity === 'high' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' :
                          vuln.severity === 'medium' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' :
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300'
                        }`}>
                          {vuln.severity.toUpperCase()}
                        </span>
                      )}
                    </div>
                    {vuln.description && (
                      <div className="text-gray-700 dark:text-gray-300 mb-3 break-words overflow-wrap-anywhere">{vuln.description}</div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      {vuln.url && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">URL:</span>
                          <div className="text-gray-600 dark:text-gray-400 break-all mt-1">{vuln.url}</div>
                        </div>
                      )}
                      {vuln.parameter && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">Parameter:</span>
                          <div className="text-gray-600 dark:text-gray-400 mt-1">{vuln.parameter}</div>
                        </div>
                      )}
                      {vuln.method && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">Method:</span>
                          <div className="text-gray-600 dark:text-gray-400 mt-1">{vuln.method}</div>
                        </div>
                      )}
                      {vuln.evidence && (
                        <div>
                          <span className="font-semibold text-gray-700 dark:text-gray-300">Evidence:</span>
                          <div className="text-gray-600 dark:text-gray-400 mt-1 break-all">{vuln.evidence}</div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-full overflow-x-hidden">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2 break-words">
                <svg className="w-6 h-6 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="break-words">Anomalies ({anomalies.length})</span>
              </h3>
              <div className="space-y-3">
                {anomalies.map((anomaly, idx) => (
                  <div key={idx} className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 shadow-sm">
                    <div className="text-gray-700 dark:text-gray-300 break-words overflow-wrap-anywhere">
                      {typeof anomaly === 'string' ? anomaly : JSON.stringify(anomaly, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info Section */}
          {Object.keys(info).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-full overflow-x-hidden">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2 break-words">
                <svg className="w-6 h-6 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="break-words">Additional Information</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(info).map(([key, value]) => (
                  <div key={key} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">{key}</div>
                    <div className="text-gray-600 dark:text-gray-400 break-all overflow-wrap-anywhere">
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {Object.keys(summary).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-full overflow-x-hidden">
              <h3 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white break-words">Scan Summary</h3>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(summary, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* No vulnerabilities */}
          {totalVulns === 0 && anomalies.length === 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
              <div className="text-6xl mb-4">✅</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-2">
                No Vulnerabilities Found!
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                The scan did not detect any security issues. Your application appears to be secure.
              </div>
            </div>
          )}

          {/* Raw JSON (Dev Purpose) - Collapsible */}
          {rawJson && (
            <div className="bg-gray-900 rounded-lg shadow-lg p-6 max-w-full overflow-x-hidden">
              <details className="group">
                <summary className="text-xl font-bold mb-4 text-white cursor-pointer list-none flex items-center justify-between break-words gap-2">
                  <span className="break-words">Raw JSON Result (Dev Purpose)</span>
                  <svg className="w-5 h-5 transform group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <pre className="text-xs text-green-400 overflow-auto max-h-96 p-4 bg-black rounded mt-4 break-all whitespace-pre-wrap">
                  {typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )
    } catch (error) {
      return (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="text-red-600 dark:text-red-400 font-semibold mb-2">Error parsing results: {error.message}</div>
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-4">Showing raw data below:</div>
          <pre className="mt-4 text-xs bg-gray-100 dark:bg-gray-900 p-4 rounded overflow-auto max-h-96 break-all whitespace-pre-wrap">
            {JSON.stringify(scanResults, null, 2)}
          </pre>
        </div>
      )
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white break-words">{title}</h2>
          <p className="text-gray-600 dark:text-gray-400 mt-2 break-words">{description}</p>
        </div>
        <button
          onClick={() => setShowHelpDialog(true)}
          className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Help"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>

      {/* URL Input */}
      <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">
          Site URL
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={siteUrl}
            onChange={(e) => {
              setSiteUrl(e.target.value)
              // Reset detection result when URL changes
              if (e.target.value !== lastCheckedUrl) {
                setDetectionResult(null)
                setLastCheckedUrl('')
              }
            }}
            placeholder="https://example.com"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            disabled={isScanning || isDetecting}
          />
          <button
            onClick={isScanning ? handleStopScan : handleStartScan}
            disabled={!siteUrl || isDetecting}
            className={`px-8 py-2.5 rounded-lg flex items-center gap-2 font-semibold shadow-lg transition-all ${
              isScanning
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/50'
                : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-green-500/50'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none`}
          >
            {isDetecting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Checking {detectionType}...
              </>
            ) : isScanning ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Stop Scan
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Start Scan
              </>
            )}
          </button>
        </div>
        {detectionResult !== null && (
          <div className={`mt-3 p-3 rounded-lg flex items-center gap-2 ${
            detectionResult 
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}>
            {detectionResult ? (
              <>
                <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-green-700 dark:text-green-300 font-medium">Site confirmed as {detectionType}. Ready to scan!</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-red-700 dark:text-red-300 font-medium">This site is not {detectionType}. This feature is specifically designed for {detectionType} sites only.</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Timing Info */}
      {startTime && (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scan Timing</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Start Date/Time</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{formatDateTime(startTime)}</div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Elapsed Time</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatElapsedTime(elapsedTime)}</div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Expected Completion</div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {expectedCompletionTime ? formatDateTime(expectedCompletionTime) : (endTime ? formatDateTime(endTime) : <span className="text-gray-500 dark:text-gray-400">Calculating...</span>)}
              </div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">End Date/Time</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{endTime ? formatDateTime(endTime) : <span className="text-green-600 dark:text-green-400">Running...</span>}</div>
            </div>
          </div>
        </div>
      )}

      {/* Console Logs */}
      {logs.length > 0 && (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Console Logs</h3>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={copyLogs}
                className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-all shadow-sm hover:shadow-md"
                title="Copy Logs"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={clearLogs}
                className="p-2.5 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-all shadow-sm hover:shadow-md"
                title="Clear Logs"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          <div
            ref={logContainerRef}
            className="bg-gray-900 text-green-400 font-mono text-sm p-4 rounded-lg max-h-96 overflow-y-auto overflow-x-auto border-2 border-gray-800 shadow-inner"
          >
            {logs.map((log, idx) => (
              <div key={idx} className="mb-1 break-words overflow-wrap-anywhere">
                <span className="text-gray-500">[{log.timestamp}]</span>{' '}
                <span className={log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-green-400'}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw Command (Dev Purpose) */}
      {rawCommand && (
        <div className="bg-gray-900 rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold mb-4 text-white">Raw Command (Dev Purpose)</h3>
          <pre className="text-sm text-green-400 font-mono p-4 bg-black rounded overflow-x-auto break-all whitespace-pre-wrap">
            {rawCommand}
          </pre>
        </div>
      )}

      {/* Scan Results - Only show raw results if tgpt conversion failed */}
      {tgptConversionComplete && !tgptConvertedResults && renderScanResults()}

      {/* Action Buttons */}
      {scanResults && (
        <div className="flex gap-4">
          <button
            onClick={handleGetAISuggestions}
            disabled={isLoadingAI}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoadingAI ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Generating AI Suggestions...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Get AI Suggestions
              </>
            )}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export PDF
              </>
            )}
          </button>
        </div>
      )}

      {/* TGPT Converted Results */}
      {/* Hide loading UI for WordPress and Shopify tabs */}
      {((isLoadingTgpt || tgptConvertedResults) && detectionType !== 'WordPress' && detectionType !== 'Shopify') || (tgptConvertedResults && (detectionType === 'WordPress' || detectionType === 'Shopify')) ? (
        <div id="tgpt-results-section" className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 dark:from-indigo-900/30 dark:via-purple-900/30 dark:to-pink-900/30 rounded-xl shadow-2xl p-8 mt-6 border border-indigo-200 dark:border-indigo-800 max-w-full overflow-x-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="text-3xl font-bold text-gray-900 dark:text-white">AI Converted Report</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">User-friendly format generated by AI</p>
            </div>
          </div>
          
          {isLoadingTgpt && detectionType !== 'WordPress' && detectionType !== 'Shopify' ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="animate-spin h-12 w-12 text-indigo-600 dark:text-indigo-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Converting results with AI...</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">This may take a few moments</p>
              </div>
            </div>
          ) : tgptConvertedResults ? (
            <div className="space-y-6">
              {typeof tgptConvertedResults === 'object' && tgptConvertedResults !== null ? (
                // Display structured JSON
                <>
                  {/* Summary Section */}
                  {tgptConvertedResults.summary && (
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 border-2 border-indigo-200 dark:border-indigo-700 shadow-lg">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Scan Summary
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tgptConvertedResults.summary.target && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Target URL</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white break-all">{tgptConvertedResults.summary.target}</div>
                          </div>
                        )}
                        {tgptConvertedResults.summary.totalVulnerabilities !== undefined && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Total Vulnerabilities</div>
                            <div className="text-3xl font-bold text-red-600 dark:text-red-400">{tgptConvertedResults.summary.totalVulnerabilities}</div>
                          </div>
                        )}
                        {tgptConvertedResults.summary.scanDate && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1">Scan Date</div>
                            <div className="text-lg font-bold text-gray-900 dark:text-white">{tgptConvertedResults.summary.scanDate}</div>
                          </div>
                        )}
                        {tgptConvertedResults.summary.severityBreakdown && (
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                            <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Severity Breakdown</div>
                            <div className="grid grid-cols-2 gap-2">
                              {tgptConvertedResults.summary.severityBreakdown.critical !== undefined && (
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-red-600">{tgptConvertedResults.summary.severityBreakdown.critical}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">Critical</div>
                                </div>
                              )}
                              {tgptConvertedResults.summary.severityBreakdown.high !== undefined && (
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-orange-600">{tgptConvertedResults.summary.severityBreakdown.high}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">High</div>
                                </div>
                              )}
                              {tgptConvertedResults.summary.severityBreakdown.medium !== undefined && (
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-yellow-600">{tgptConvertedResults.summary.severityBreakdown.medium}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">Medium</div>
                                </div>
                              )}
                              {tgptConvertedResults.summary.severityBreakdown.low !== undefined && (
                                <div className="text-center">
                                  <div className="text-2xl font-bold text-blue-600">{tgptConvertedResults.summary.severityBreakdown.low}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-400">Low</div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Vulnerabilities Section */}
                  {tgptConvertedResults.vulnerabilities && Array.isArray(tgptConvertedResults.vulnerabilities) && tgptConvertedResults.vulnerabilities.length > 0 && (
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 border-2 border-indigo-200 dark:border-indigo-700 shadow-lg">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                        <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Vulnerabilities ({tgptConvertedResults.vulnerabilities.length})
                      </h4>
                      <div className="space-y-4">
                        {tgptConvertedResults.vulnerabilities.map((vuln, idx) => {
                          const severityColors = {
                            critical: 'from-red-500 to-red-600',
                            high: 'from-orange-500 to-orange-600',
                            medium: 'from-yellow-500 to-yellow-600',
                            low: 'from-blue-500 to-blue-600'
                          }
                          const severityColor = severityColors[vuln.severity?.toLowerCase()] || 'from-gray-500 to-gray-600'
                          
                          return (
                            <div key={idx} className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 rounded-lg p-6 border-l-4 border-indigo-500 shadow-md">
                              <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                                <h5 className="text-xl font-bold text-gray-900 dark:text-white flex-1 min-w-0 break-words">{vuln.name || `Vulnerability ${idx + 1}`}</h5>
                                {vuln.severity && (
                                  <span className={`px-4 py-2 bg-gradient-to-r ${severityColor} text-white rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0`}>
                                    {vuln.severity.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              
                              {vuln.description && (
                                <div className="mb-4">
                                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Description</div>
                                  <div className="text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 break-words overflow-wrap-anywhere">
                                    {vuln.description}
                                  </div>
                                </div>
                              )}
                              
                              {vuln.impact && (
                                <div className="mb-4">
                                  <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Impact</div>
                                  <div className="text-gray-800 dark:text-gray-100 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800 break-words overflow-wrap-anywhere">
                                    {vuln.impact}
                                  </div>
                                </div>
                              )}
                              
                              {vuln.location && (
                                <div className="mb-4">
                                  <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Location</div>
                                  <div className="text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 rounded-lg p-3 break-all">
                                    {vuln.location}
                                  </div>
                                </div>
                              )}
                              
                              {vuln.remediation && (
                                <div className="mb-4">
                                  <div className="text-sm font-semibold text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Remediation Steps
                                  </div>
                                  <div className="text-gray-800 dark:text-gray-100 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800 break-words overflow-wrap-anywhere whitespace-pre-wrap">
                                    {vuln.remediation}
                                  </div>
                                </div>
                              )}
                              
                              {vuln.references && Array.isArray(vuln.references) && vuln.references.length > 0 && (
                                <div>
                                  <div className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">References</div>
                                  <div className="flex flex-wrap gap-2">
                                    {vuln.references.map((ref, refIdx) => (
                                      <a
                                        key={refIdx}
                                        href={ref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/60 text-sm transition-colors break-all"
                                      >
                                        Reference {refIdx + 1}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recommendations Section */}
                  {tgptConvertedResults.recommendations && Array.isArray(tgptConvertedResults.recommendations) && tgptConvertedResults.recommendations.length > 0 && (
                    <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-6 border-2 border-indigo-200 dark:border-indigo-700 shadow-lg">
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        General Recommendations
                      </h4>
                      <div className="space-y-3">
                        {tgptConvertedResults.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start gap-3 bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                            <div className="flex-shrink-0 w-6 h-6 bg-green-500 text-white rounded-full flex items-center justify-center font-bold text-sm mt-0.5">
                              {idx + 1}
                            </div>
                            <div className="text-gray-800 dark:text-gray-100 break-words overflow-wrap-anywhere flex-1">
                              {rec}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // Display as formatted text if not JSON
                <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl p-8 border-2 border-indigo-200 dark:border-indigo-700 shadow-lg">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                        <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="text-2xl font-bold text-gray-900 dark:text-white">AI Generated Report</h4>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                      <div className="text-gray-800 dark:text-gray-100 whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed font-mono text-sm">
                        {typeof tgptConvertedResults === 'string' ? tgptConvertedResults : JSON.stringify(tgptConvertedResults, null, 2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* AI Suggestions */}
      {aiSuggestions && (
        <div ref={aiSuggestionRef} className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg shadow-lg p-6 mt-6">
          <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">AI Suggestions</h3>
          <div className="prose dark:prose-invert max-w-none">
            <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words overflow-wrap-anywhere">{aiSuggestions}</div>
          </div>
        </div>
      )}

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Help</h3>
              <button
                onClick={() => setShowHelpDialog(false)}
                className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-gray-700 dark:text-gray-300">
              {helpContent || 'Help content will be provided later.'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WapitiScan

