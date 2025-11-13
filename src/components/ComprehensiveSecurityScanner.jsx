import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import { useGlobalScanState } from '../context/GlobalScanContext'
import FrameworkDetector from '../scanners/framework-detection'
import ToolInstaller from './ToolInstaller'
import WslPasswordPrompt from './WslPasswordPrompt'
import ToolInstallationDialog from './ToolInstallationDialog'
import ProfessionalPDFExporter from './ProfessionalPDFExporter'
import { ensureToolsInstalled, checkAllTools } from '../utils/toolChecker'
import { hasSecurePassword } from '../utils/securePasswordStorage'
import { getAISuggestions, formatAISuggestions } from '../utils/grokApi'
import { scanComponents } from './scans'
import HelpDialog from './dialogs/HelpDialog'

// Elapsed Timer Display Component
const ElapsedTimerDisplay = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    if (!startTime) return
    
    const updateTimer = () => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      setElapsed(elapsedSeconds)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [startTime])
  
  const hrs = Math.floor(elapsed / 3600)
  const mins = Math.floor((elapsed % 3600) / 60)
  const secs = elapsed % 60
  const display = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  
  return (
    <div>
      <span className="font-medium text-gray-700 dark:text-gray-300">Elapsed Time:</span>
      <div className="text-gray-900 dark:text-gray-100 mt-1">{display}</div>
    </div>
  )
}

const ComprehensiveSecurityScanner = () => {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const { registerScan, updateScan, completeScan, stopScan } = useGlobalScanState()
  const [targetUrl, setTargetUrl] = useState('')
  const overviewScanIdRef = useRef(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState({})
  const [logs, setLogs] = useState([])
  const [currentTest, setCurrentTest] = useState(null)
  const [completedTests, setCompletedTests] = useState(new Set())
  const [testProgress, setTestProgress] = useState({})
  const [scanTiming, setScanTiming] = useState({
    startTime: null,
    endTime: null,
    elapsedTime: 0,
    expectedCompletion: null
  })
  const [expandedTests, setExpandedTests] = useState(new Set())
  const [expandedFindings, setExpandedFindings] = useState(new Set())
  const [showToolInstaller, setShowToolInstaller] = useState(false)
  const [toolStatus, setToolStatus] = useState(null)
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  const [showToolInstallationDialog, setShowToolInstallationDialog] = useState(false)
  const [missingTools, setMissingTools] = useState([])
  const [totalTools, setTotalTools] = useState(0)
  const [showDnsDetailDialog, setShowDnsDetailDialog] = useState(false)
  const [selectedDnsResult, setSelectedDnsResult] = useState(null)
  const [backgroundScanning, setBackgroundScanning] = useState(false)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [scanStartTime, setScanStartTime] = useState(null)
  const [newScanResults, setNewScanResults] = useState({})
  const [showScanDetailDialog, setShowScanDetailDialog] = useState(false)
  const [selectedScanResult, setSelectedScanResult] = useState(null)
  const [isExporting, setIsExporting] = useState(false)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [selectedScans, setSelectedScans] = useState(new Set(['all-scans']))
  const [scanEndTime, setScanEndTime] = useState(null)
  const [showScanSelection, setShowScanSelection] = useState(false)
  const scanSelectionRef = useRef(null)
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)
  const scanTimeoutRef = useRef(null)
  const scanActiveRef = useRef(true)
  const dnsCompleteRef = useRef(false)
  const completionTriggeredRef = useRef(false)
  const aiSuggestionRef = useRef(null)
  const detailDialogScrollRef = useRef(null)

  // Define security tests - all visible in UI, but only File Upload Vulnerability Check runs
  // Order: Quick Fingerprint first, then DNS Resolution & Analysis second
  const securityTests = [
    {
      id: 'quick-fingerprint',
      name: 'Quick Fingerprint',
      description: 'Fast technology fingerprint to identify server, CMS and common libraries.',
      detailedDescription: 'This run performs a lightweight, non-intrusive fingerprint of the target site to quickly enumerate web server, CMS, common frameworks and observable headers. It\'s designed for reconnaissance with minimal requests and low noise so it\'s safe on production sites. Results are suitable for deciding follow-up scans (e.g., wpscan, nmap) and give a snapshot of what technologies are present. It does not try aggressive probes, so some plugins or obscure frameworks may be missed. Use this as the first step in a scanning workflow.',
      category: 'Reconnaissance',
      estimatedTime: 30,
      severity: 'informational',
      criticality: 'Fingerprinting helps identify technologies in use and potential attack surfaces.',
      fixRecommendations: [
        'Enable HSTS for HTTPS sites',
        'Add a strict Content-Security-Policy',
        'Keep CMS and plugins updated to latest versions',
        'Minimize exposed technology information in headers'
      ]
    },
    {
      id: 'dns-resolution',
      name: 'DNS Resolution & Analysis',
      description: 'Comprehensive DNS security analysis including record validation, DNSSEC, and zone transfer testing',
      detailedDescription: 'DNS Resolution & Analysis performs comprehensive DNS security testing including A, MX, TXT, NS, and SOA record analysis, reverse DNS lookups, DNSSEC validation, zone transfer testing, and subdomain enumeration. This scan identifies DNS misconfigurations, missing security records, and potential attack vectors.',
      category: 'Infrastructure',
      estimatedTime: 120,
      severity: 'high',
      criticality: 'DNS misconfigurations can lead to domain hijacking, email spoofing, and subdomain takeover attacks.',
      fixRecommendations: [
        'Enable DNSSEC to prevent DNS spoofing',
        'Implement proper SPF, DKIM, and DMARC records',
        'Disable zone transfers to prevent DNS enumeration',
        'Monitor DNS records for unauthorized changes',
        'Use strong DNS security policies',
        'Regularly audit DNS configuration'
      ]
    },
    {
      id: 'ssl-tls-analysis',
      name: 'SSL/TLS Analysis',
      description: 'Validate certificate, check TLS versions, and cipher strength',
      detailedDescription: 'SSL/TLS analysis examines certificate subject, issuer, validity, SANs, key size, signature algorithm, and supported protocols/ciphers. This test identifies expired or self-signed certificates, weak signature algorithms or ciphers, missing SANs, and incomplete certificate chains that could compromise secure communications.',
      category: 'Infrastructure',
      estimatedTime: 45,
      severity: 'high',
      criticality: 'Weak SSL/TLS configurations can lead to man-in-the-middle attacks, data interception, and compliance violations.',
      fixRecommendations: [
        'Use strong cipher suites (AES-256, ChaCha20)',
        'Disable weak protocols (SSL 2.0/3.0, TLS 1.0/1.1)',
        'Implement certificate transparency monitoring',
        'Configure HSTS headers',
        'Regular certificate renewal and monitoring'
      ]
    },
    {
      id: 'security-headers',
      name: 'Security Headers',
      description: 'Fetch and analyze HTTP response headers',
      detailedDescription: 'Security headers analysis examines full HTTP headers including CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and cookie security settings. This test identifies missing CSP or HSTS headers, insecure cookies, and absent clickjacking/XFO headers that could expose applications to client-side attacks.',
      category: 'Web Security',
      estimatedTime: 20,
      severity: 'medium',
      criticality: 'Missing security headers leave applications vulnerable to XSS, clickjacking, MIME sniffing, and other client-side attacks.',
      fixRecommendations: [
        'Implement Content Security Policy (CSP)',
        'Add X-Frame-Options header',
        'Configure X-Content-Type-Options',
        'Set Referrer-Policy header',
        'Enable HSTS for HTTPS sites'
      ]
    },
    {
      id: 'cms-detection',
      name: 'CMS Detection',
      description: 'Identify CMS/framework/web server',
      detailedDescription: 'CMS detection identifies content management systems, frameworks, and web server technologies. This test helps identify potential attack vectors, known vulnerabilities, and security misconfigurations specific to the detected technologies.',
      category: 'Reconnaissance',
      estimatedTime: 30,
      severity: 'medium',
      criticality: 'Exposed CMS information can help attackers identify specific vulnerabilities and attack vectors.',
      fixRecommendations: [
        'Hide version information in HTTP headers',
        'Remove or modify X-Powered-By headers',
        'Disable server signature disclosure',
        'Implement security headers to hide technology stack',
        'Regularly update CMS and plugins',
        'Use security plugins and hardening'
      ]
    },
    {
      id: 'subdomain-enumeration',
      name: 'Subdomain Enumeration',
      description: 'Enumerate all DNS subdomains',
      detailedDescription: 'Subdomain enumeration discovers all subdomains associated with the target domain. This test identifies potential attack surfaces, misconfigured subdomains, and takeover candidates that could be exploited by attackers.',
      category: 'Reconnaissance',
      estimatedTime: 90,
      severity: 'medium',
      criticality: 'Exposed subdomains can provide additional attack vectors and may contain sensitive information or misconfigurations.',
      fixRecommendations: [
        'Audit all discovered subdomains',
        'Secure misconfigured subdomains',
        'Implement subdomain monitoring',
        'Use wildcard SSL certificates properly',
        'Regular subdomain security assessments'
      ]
    },
    {
      id: 'port-scanning',
      name: 'Port Scanning',
      description: 'Discover open ports and running services',
      detailedDescription: 'Port scanning identifies open ports and running services on the target system. This test helps identify potential attack vectors, exposed services, and security misconfigurations that could be exploited by attackers.',
      category: 'Infrastructure',
      estimatedTime: 120,
      severity: 'high',
      criticality: 'Open ports can expose sensitive services and provide entry points for attackers.',
      fixRecommendations: [
        'Close unnecessary ports',
        'Secure exposed services',
        'Implement firewall rules',
        'Use port knocking for sensitive services',
        'Regular port security assessments'
      ]
    },
    {
      id: 'sql-injection-test',
      name: 'SQL Injection Test',
      description: 'Test for SQL injection vulnerabilities using sqlmap with high risk and level settings',
      detailedDescription: 'SQL injection testing uses sqlmap to systematically test web application parameters for SQL injection vulnerabilities. This scan uses risk level 3 and test level 5 to perform comprehensive testing, including error-based, boolean-based, time-based, and union-based SQL injection techniques. The scan identifies vulnerable parameters, extracts database information, and provides detailed remediation guidance.',
      category: 'Web Security',
      estimatedTime: 180,
      severity: 'critical',
      criticality: 'SQL injection vulnerabilities can lead to complete database compromise, data theft, data manipulation, and unauthorized access to sensitive information.',
      fixRecommendations: [
        'Immediately patch all vulnerable parameters',
        'Implement parameterized queries (prepared statements)',
        'Use input validation and sanitization',
        'Implement Web Application Firewall (WAF)',
        'Conduct code review for SQL injection vulnerabilities',
        'Regularly test for SQL injection vulnerabilities'
      ]
    },
    {
      id: 'xss-test',
      name: 'Cross-Site Scripting (XSS) Testing',
      description: 'Test for XSS vulnerabilities using dalfox with fast scan mode',
      detailedDescription: 'Cross-Site Scripting (XSS) testing uses dalfox to systematically test web application parameters for XSS vulnerabilities. This scan uses fast scan mode with 50 workers to perform comprehensive testing, including reflected XSS, stored XSS, and DOM-based XSS detection. The scan identifies vulnerable parameters, extracts payload information, and provides detailed remediation guidance.',
      category: 'Web Security',
      estimatedTime: 120,
      severity: 'critical',
      criticality: 'XSS vulnerabilities can lead to session hijacking, account takeover, data theft, and malicious script execution in users browsers.',
      fixRecommendations: [
        'Immediately patch all XSS vulnerabilities found',
        'Sanitize user inputs to escape HTML special characters',
        'Implement Content Security Policy (CSP) headers',
        'Use HTTP-only cookies to protect session data',
        'Validate and encode all data dynamically on server side',
        'Regularly test for XSS vulnerabilities'
      ]
    },
    {
      id: 'csrf-test',
      name: 'Cross-Site Request Forgery (CSRF) Testing',
      description: 'Test for CSRF vulnerabilities using curl POST request simulation',
      detailedDescription: 'Cross-Site Request Forgery (CSRF) testing uses curl to simulate malicious POST requests and analyze server responses for CSRF protection mechanisms. This scan sends POST requests with session cookies to test if the server properly validates CSRF tokens, SameSite cookies, and Origin/Referer headers. The scan identifies missing CSRF protection and provides detailed remediation guidance.',
      category: 'Web Security',
      estimatedTime: 30,
      severity: 'high',
      criticality: 'CSRF vulnerabilities can lead to unauthorized actions on behalf of authenticated users, including account changes, data manipulation, and privilege escalation.',
      fixRecommendations: [
        'Implement CSRF tokens in all forms and AJAX requests',
        'Set SameSite attribute for cookies to prevent cross-site requests',
        'Validate Origin and Referer headers on the server side',
        'Implement double-submit cookie pattern for additional protection',
        'Use state-changing operations only with proper CSRF protection',
        'Regularly test CSRF protection mechanisms'
      ]
    },
    {
      id: 'waf-detection',
      name: 'WAF (Firewall) Detection',
      description: 'Detect whether a target web application is protected by a Web Application Firewall (WAF) and identify the vendor/type',
      detailedDescription: 'WAF Detection determines whether network or application-layer filtering is active in front of a web server. The test fingerprints WAF products by sending a set of benign, non-exploit HTTP probes and analyzing response traits such as headers, error pages, cookies, redirects, and behavioral differences. Knowing a WAF is present helps legitimate testers avoid unnecessary blocking or accidental DoS during active tests, and helps site owners confirm protection is installed and returning expected responses.',
      category: 'Web Security',
      estimatedTime: 45,
      severity: 'high',
      criticality: 'WAF detection is informational to high severity depending on context. Presence of WAF affects further testing and indicates the level of protection in place.',
      fixRecommendations: [
        'Verify WAF configuration is appropriate for your security needs',
        'Ensure WAF rules are properly tuned',
        'Monitor WAF logs for false positives',
        'Regularly update WAF rules and signatures',
        'Test WAF effectiveness against common attack patterns',
        'Consider implementing custom WAF rules for your application'
      ]
    },
    {
      id: 'file-upload-check',
      name: 'File Upload Vulnerability Check',
      description: 'Verify whether uploads are improperly validated or web-accessible, potentially enabling code execution or data exposure',
      detailedDescription: 'Simulates benign file uploads using curl and analyzes responses, headers, and any returned URLs. Checks if files are accepted without proper validation, stored in web-accessible locations, or processed in a way that could allow code execution. Only run with explicit authorization.',
      category: 'Web Security / Input Validation',
      estimatedTime: 120,
      severity: 'high',
      criticality: 'If uploads allow web shells or arbitrary code execution, this escalates to critical severity.',
      fixRecommendations: [
        'Validate file type and content server-side (MIME + magic bytes)',
        'Store uploads outside webroot; serve via controlled handlers',
        'Set X-Content-Type-Options: nosniff and Content-Disposition: attachment',
        'Restrict allowed extensions; block executable types (.php, .jsp, .aspx)',
        'Rename files and disable direct origin access; enforce auth where required',
        'Log and monitor upload events; rate-limit if appropriate'
      ]
    },
    {
      id: 'ct-log-subdomain-discovery',
      name: 'Certificate Transparency (CT) Log Subdomain Discovery',
      description: 'This test collects all publicly logged SSL/TLS certificates for the target domain.\nIt helps identify hidden, forgotten, or unmonitored subdomains that may expose security risks.',
      detailedDescription: 'When any HTTPS domain is created, its certificate is recorded in public Certificate Transparency logs. This scan checks those logs to find all subdomains that have ever received a certificate — including internal, old, testing, or unpublished domains. Attackers use this same method to discover forgotten servers that might have security weaknesses. This test is safe, passive, and does not interact with the target website, it only reads public data.',
      category: 'Reconnaissance',
      estimatedTime: 30,
      severity: 'medium',
      criticality: 'Hidden or forgotten subdomains can expose security risks if not properly monitored and secured.',
      fixRecommendations: [
        'Audit all discovered subdomains and ensure they are properly secured',
        'Remove or secure forgotten test or development subdomains',
        'Implement subdomain monitoring and alerts',
        'Ensure all subdomains follow security best practices'
      ]
    },
    {
      id: 'http-methods-check',
      name: 'HTTP Allowed Methods Check',
      description: 'Checks if dangerous HTTP methods are enabled',
      detailedDescription: 'Performs an OPTIONS request to see if unsafe methods (PUT, DELETE, TRACE) are enabled.',
      category: 'Web Security',
      estimatedTime: 20,
      severity: 'critical',
      criticality: 'Dangerous HTTP methods can enable data tampering, file uploads, or debugging leaks.',
      fixRecommendations: [
        'Disable unsafe methods at server and web application firewall level.'
      ]
    },
    {
      id: 'host-header-injection',
      name: 'Host Trust Verification',
      description: 'Ensures server does not use client-controlled host header',
      detailedDescription: 'Sends a forged Host header and inspects if it appears in the response.',
      category: 'Web Security / Headers',
      estimatedTime: 20,
      severity: 'high',
      criticality: 'Host header injection can lead to cache poisoning, redirect abuse, and password reset poisoning.',
      fixRecommendations: [
        'Enforce host header validation at server or reverse proxy layer.'
      ]
    },
    {
      id: 'cors-policy-validation',
      name: 'CORS Policy Validation',
      description: 'Checks if Access-Control-Allow-Origin is insecure',
      detailedDescription: 'Sends a request with a malicious Origin to see if the response allows wildcard CORS.',
      category: 'Web Security / Headers',
      estimatedTime: 20,
      severity: 'critical',
      criticality: 'Overly-permissive CORS can allow data exfiltration from authenticated sessions.',
      fixRecommendations: [
        'Restrict CORS to trusted domains only and avoid use of wildcard *.'
      ]
    },
    {
      id: 'open-redirect-check',
      name: 'Open Redirect Check',
      description: 'Tests whether the server allows unvalidated redirects',
      detailedDescription: 'Sends a benign redirect parameter to verify if the server redirects to an arbitrary external domain.',
      category: 'Web Security / Input Validation',
      estimatedTime: 20,
      severity: 'high',
      criticality: 'Unvalidated redirects can be abused for phishing and credential theft.',
      fixRecommendations: [
        'Restrict allowed redirect URLs to internal whitelisted domains.'
      ]
    }
  ]

  // Helper function to handle scan selection
  const handleScanSelection = (scanId) => {
    setSelectedScans(prev => {
      const newSet = new Set(prev)
      
      if (scanId === 'all-scans') {
        if (newSet.has('all-scans')) {
          // Deselect all if all-scans is already selected
          newSet.clear()
        } else {
          // Select all scans
          newSet.clear()
          newSet.add('all-scans')
          securityTests.forEach(test => newSet.add(test.id))
        }
      } else {
        // Toggle individual scan
        if (newSet.has(scanId)) {
          newSet.delete(scanId)
          newSet.delete('all-scans') // Remove all-scans if individual scan is deselected
        } else {
          newSet.add(scanId)
          // Check if all scans are selected
          const allSelected = securityTests.every(test => newSet.has(test.id))
          if (allSelected) {
            newSet.add('all-scans')
          }
        }
      }
      
      return newSet
    })
  }

  // Clear all scan selections
  const handleClearSelections = () => {
    setSelectedScans(new Set())
  }

  // Get scans to run based on selection
  const getScansToRun = () => {
    if (selectedScans.has('all-scans')) {
      return securityTests
    }
    return securityTests.filter(test => selectedScans.has(test.id))
  }

  // Helper function to check if all scans are completed
  const areAllScansCompleted = () => {
    if (isScanning || backgroundScanning) {
      const scansToCheck = getScansToRun()
      return scansToCheck.every(test => {
        const result = scanResults[test.id] || newScanResults[test.id]
        return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
      })
    }
    return true // If not scanning, consider all scans as "completed" for UI purposes
  }

  // Function to generate PDF for individual scan
  const generateScanPDF = async (testId, result) => {
    setIsExporting(true)
    try {
      const exporter = new ProfessionalPDFExporter()

      const test = securityTests.find(t => t.id === testId)
      const testName = test ? test.name : testId

      // Extract clean content for PDF (no raw commands, JSON, etc.)
      const pdfData = {
        target: targetUrl,
        scanType: testName,
        startTime: result?.timestamp || result?.startTime,
        endTime: result?.completedAt || result?.endTime,
        duration: result?.duration,
        summary: result?.summary || {
          totalFindings: result?.findings?.length || 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        findings: result?.findings || [],
        recommendations: result?.recommendations || [],
        cleanResults: result?.cleanResults || result?.analysis || 'Scan completed successfully.'
      }

      const doc = await exporter.generatePDF(pdfData, (data) => ({
        title: `${testName} Report`,
        subtitle: 'Security Assessment Results',
        scanInfo: {
          target: data.target,
          scanType: data.scanType,
          startTime: data.startTime,
          endTime: data.endTime,
          duration: data.duration
        },
        summary: data.summary,
        findings: data.findings,
        recommendations: data.recommendations,
        content: data.cleanResults
      }))

      // Save PDF
      const fileName = `${testId}-scan-${targetUrl.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
      showSuccess('PDF report exported successfully!')
    } catch (error) {
      console.error('PDF generation error:', error)
      showError('Failed to generate PDF report')
    } finally {
      setIsExporting(false)
    }
  }

  // Check for stored password and tools on component mount
  useEffect(() => {
    const checkInitialState = async () => {
      try {
        console.log('[COMPREHENSIVE-SCANNER] Checking initial state...')

        // Check if we have stored WSL password
        if (window.cyberGuard && window.cyberGuard.getStoredRootPassword) {
          const storedPassword = await window.cyberGuard.getStoredRootPassword()

          if (storedPassword) {
            console.log('🔐 [COMPREHENSIVE-SCANNER] Found stored password, checking tools...')

            // Check which tools are missing
            const toolCheck = await window.cyberGuard.checkRequiredToolsOnly?.(storedPassword)

            if (toolCheck && toolCheck.success) {
              console.log('✅ [COMPREHENSIVE-SCANNER] All tools are ready!')
              showSuccess('All security tools are ready! You can start scanning.')
            } else if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
              console.log('⚠️ [COMPREHENSIVE-SCANNER] Some tools are missing:', toolCheck.missingTools)
              showError(`${toolCheck.missingTools.length} tools need installation. Click "Check Tools" to install them.`)
            }
          } else {
            console.log('🔐 [COMPREHENSIVE-SCANNER] No stored password found')
          }
        }
      } catch (error) {
        console.error('❌ [COMPREHENSIVE-SCANNER] Initial state check failed:', error)
      }
    }

    checkInitialState()
  }, [])

  // Timer for scan progress
  useEffect(() => {
    if (isScanning) {
      timerRef.current = setInterval(() => {
        setScanTiming(prev => ({
          ...prev,
          elapsedTime: prev.startTime ? Date.now() - prev.startTime : 0
        }))
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isScanning])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current)
      }
    }
  }, [])

  // Track which scans have already sent notifications (global tracking)
  const notifiedScansRef = useRef(new Set())

  // Use a more unique key to prevent duplicates across different scan runs
  const getNotificationKey = useCallback((testId, testName) => {
    return `overview-${testId}-${testName}-${Date.now()}`
  }, [])

  // Helper function to send notification for a completed scan
  const sendScanNotification = useCallback((testId, testName) => {
    const scanKey = `${testId}-${testName}`

    // Only send notification once per scan
    if (notifiedScansRef.current.has(scanKey)) {
      console.log(`[NOTIFICATION] Skipping duplicate notification for ${testName}`)
      return
    }

    notifiedScansRef.current.add(scanKey)

    // Send desktop push notification for individual scan completion
    if (window.cyberGuard?.showNotification) {
      try {
        console.log(`[NOTIFICATION] Sending notification for ${testName} completion`)
        const notificationPromise = window.cyberGuard.showNotification({
          title: 'Overview Scan',
          body: `In Overview Scan, ${testName} has been completed successfully.`,
          viewId: 'overview',
          scanId: `overview-${testId}`
        })

        if (notificationPromise && typeof notificationPromise.then === 'function') {
          notificationPromise.then(() => {
            console.log(`[NOTIFICATION] ✅ Notification sent successfully for ${testName}`)
          }).catch(err => {
            console.error(`[NOTIFICATION] ❌ Failed to send notification for ${testName}:`, err?.message || 'Unknown error')
            // Remove from set on error so it can be retried
            notifiedScansRef.current.delete(scanKey)
          })
        } else {
          console.log(`[NOTIFICATION] ⚠️ Notification call returned non-promise for ${testName}`)
          notifiedScansRef.current.delete(scanKey)
        }
      } catch (err) {
        console.error(`[NOTIFICATION] ❌ Error sending notification for ${testName}:`, err?.message || 'Unknown error')
        notifiedScansRef.current.delete(scanKey)
      }
    } else {
      console.warn('[NOTIFICATION] ⚠️ window.cyberGuard.showNotification is not available')
      notifiedScansRef.current.delete(scanKey)
    }
  }, [])

  // Watch for scan completion - check when completedTests or scanResults change
  useEffect(() => {
    // Don't check if not scanning and no active scan
    if (!isScanning && !backgroundScanning && !overviewScanIdRef.current) {
      return
    }

    if (completionTriggeredRef.current) {
      return // Already triggered completion
    }

    // Get the list of scans that should run
    const scansToCheck = getScansToRun()
    if (scansToCheck.length === 0) {
      return
    }

    // Check if all scans have completed
    const allCompleted = scansToCheck.every(test => {
      const result = scanResults[test.id] || newScanResults[test.id]
      // Only count as completed if status is 'completed' or 'failed' (not 'pending')
      return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
    })

    // Check completion even if scanning flags are false (they might have been set to false already)
    if (allCompleted && scansToCheck.length > 0) {
      console.log('✅ [SCAN-COMPLETION] All scans completed - finalizing...')
      console.log('✅ [SCAN-COMPLETION] Scans to check:', scansToCheck.length)
      console.log('✅ [SCAN-COMPLETION] isScanning:', isScanning, 'backgroundScanning:', backgroundScanning)

      // Prevent duplicate completion messages
      if (completionTriggeredRef.current) {
        console.log('⚠️ [SCAN-COMPLETION] Completion already triggered, skipping...')
        return
      }
      completionTriggeredRef.current = true

      // All scans are done
      setCurrentTest(null)
      const endTime = Date.now()
      setScanTiming(prev => ({ ...prev, endTime }))
      setScanEndTime(endTime)

      // Get final results and update timing
      const completedCount = scansToCheck.filter(test => {
        const result = scanResults[test.id] || newScanResults[test.id]
        return result && result.status === 'completed'
      }).length

      // Complete overview scan
      if (overviewScanIdRef.current) {
        console.log('✅ [SCAN-COMPLETION] Completing overview scan:', overviewScanIdRef.current)
        completeScan(overviewScanIdRef.current, {
          completedCount,
          totalCount: scansToCheck.length
        })
        overviewScanIdRef.current = null
      }

      // Send desktop push notification when all scans complete (only once)
      const allScansCompleteKey = 'overview-all-scans-complete'
      if (!notifiedScansRef.current.has(allScansCompleteKey)) {
        console.log('📢 [SCAN-COMPLETION] Sending notification...')
        notifiedScansRef.current.add(allScansCompleteKey)

        if (window.cyberGuard?.showNotification) {
          try {
            // Determine notification message based on number of scans
            let notificationBody
            const totalScans = scansToCheck.length
            const successfulScans = completedCount

            if (successfulScans === totalScans) {
              notificationBody = `All ${totalScans} security scans completed successfully!`
            } else if (successfulScans > 0) {
              notificationBody = `${successfulScans} of ${totalScans} security scans completed. Check results for details.`
            } else {
              notificationBody = `${totalScans} security scans completed. Check results for details.`
            }

            window.cyberGuard.showNotification({
              title: 'Security Scan Complete',
              body: notificationBody,
              viewId: 'overview',
              scanId: 'overview-all-complete'
            }).then(() => {
              console.log('✅ [SCAN-COMPLETION] Notification sent successfully')
            }).catch(err => {
              console.error('❌ [SCAN-COMPLETION] Notification error:', err?.message || 'Unknown error')
              notifiedScansRef.current.delete(allScansCompleteKey)
            })
          } catch (err) {
            console.error('❌ [SCAN-COMPLETION] Notification exception:', err?.message || 'Unknown error')
            notifiedScansRef.current.delete(allScansCompleteKey)
          }
        } else {
          console.warn('⚠️ [SCAN-COMPLETION] window.cyberGuard.showNotification not available')
          notifiedScansRef.current.delete(allScansCompleteKey)
        }
      } else {
        console.log('📢 [SCAN-COMPLETION] Notification already sent, skipping duplicate')
      }

      // Reset notification tracking for next scan (only individual scan notifications, not the all-complete one)
      // Keep the all-complete key to prevent duplicate notifications
      const allCompleteKey = 'overview-all-scans-complete'
      const keysToKeep = new Set([allCompleteKey])
      const newSet = new Set()
      notifiedScansRef.current.forEach(key => {
        if (keysToKeep.has(key)) {
          newSet.add(key)
        }
      })
      notifiedScansRef.current = newSet
    } else {
      console.log('⏳ [SCAN-COMPLETION] Not all scans completed yet. Completed:', scansToCheck.filter(test => {
        const result = scanResults[test.id] || newScanResults[test.id]
        return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
      }).length, 'of', scansToCheck.length)
    }
  }, [completedTests, scanResults, newScanResults, isScanning, backgroundScanning, selectedScans])

  // Set up auto-scan listener
  useEffect(() => {
    const handleAutoScan = () => {
      console.log('🚀 [COMPREHENSIVE-SCANNER] Auto-scan triggered!')
      if (targetUrl.trim() && !isScanning) {
        console.log('🚀 [COMPREHENSIVE-SCANNER] Starting auto-scan for:', targetUrl)
        startScan()
      } else if (!targetUrl.trim()) {
        console.log('⚠️ [COMPREHENSIVE-SCANNER] Auto-scan triggered but no target URL set')
      } else {
        console.log('⚠️ [COMPREHENSIVE-SCANNER] Auto-scan triggered but scanning already in progress')
      }
    }

    if (window.cyberGuard && window.cyberGuard.on) {
      window.cyberGuard.on('auto-scan', handleAutoScan)
      console.log('✅ [COMPREHENSIVE-SCANNER] Auto-scan listener registered')
    }

    return () => {
      if (window.cyberGuard && window.cyberGuard.off) {
        window.cyberGuard.off('auto-scan', handleAutoScan)
        console.log('🧹 [COMPREHENSIVE-SCANNER] Auto-scan listener cleaned up')
      }
    }
  }, [targetUrl, isScanning, startScan])

  // Dropdown position state
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0, openUpward: false })

  // Calculate dropdown position when shown
  useEffect(() => {
    if (showScanSelection && scanSelectionRef.current) {
      const rect = scanSelectionRef.current.getBoundingClientRect()
      const viewportHeight = window.innerHeight
      const spaceBelow = viewportHeight - rect.bottom
      const spaceAbove = rect.top
      // Calculate max dropdown height based on 80vh
      const maxDropdownHeight = Math.min(window.innerHeight * 0.8, 600) // 80vh but cap at 600px
      const minDropdownHeight = 300 // Minimum height to show

      // Decide opening direction based on available space
      const openUpward = spaceBelow < minDropdownHeight && spaceAbove > spaceBelow

      // Calculate top position to ensure dropdown fits in viewport
      let topPos
      if (openUpward) {
        // Open upward - position above the button
        topPos = Math.max(8, rect.top + window.scrollY - maxDropdownHeight - 8)
      } else {
        // Open downward - position below the button
        topPos = rect.bottom + window.scrollY + 8
      }

      // Calculate right position to align dropdown with button
      const rightPos = Math.max(8, window.innerWidth - rect.right - window.scrollX)

      setDropdownPosition({
        top: topPos,
        right: rightPos,
        openUpward,
        maxHeight: maxDropdownHeight
      })
    }
  }, [showScanSelection])

  // Format time helper
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  // Toggle finding expansion
  const toggleFindingExpansion = (findingId) => {
    const newExpanded = new Set(expandedFindings)
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId)
    } else {
      newExpanded.add(findingId)
    }
    setExpandedFindings(newExpanded)
  }

  return (
      {/* Merged Main Section - All sections in one container */}
      <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-2xl shadow-lg border border-orange-200 dark:border-slate-600 p-8 relative overflow-hidden mb-6" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Comprehensive Security Scanner Header */}
          <div className="relative">
            {/* Help Icon Button - Top Right */}
            <button
              onClick={() => setShowHelpDialog(true)}
              className="absolute top-0 right-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200 z-20"
              title="View detailed scan information"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="flex items-start justify-between mb-6 pr-12">
              <div className="flex items-center space-x-4 flex-1">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Comprehensive Security Scanner
                  </h1>
                  <p className="text-base text-gray-600 dark:text-gray-400">
                    The Comprehensive Security Scanner thoroughly analyzes your website or web application for vulnerabilities and security weaknesses. It checks everything from DNS and SSL/TLS configurations to XSS, SQL injection, and misconfigured headers. Stay safe online by identifying risks before attackers do.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Scan Timing Information */}
          {(isScanning || backgroundScanning || scanStartTime) && (
            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Scan Timing</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {scanStartTime && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Start Time:</span>
                    <div className="text-gray-900 dark:text-gray-100 mt-1">
                      {new Date(scanStartTime).toLocaleString()}
                    </div>
                  </div>
                )}
                {(isScanning || backgroundScanning) && scanStartTime && (
                  <ElapsedTimerDisplay startTime={scanStartTime} />
                )}
                {scanTiming.expectedCompletion && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Expected End:</span>
                    <div className="text-gray-900 dark:text-gray-100 mt-1">
                      {new Date(scanTiming.expectedCompletion).toLocaleString()}
                    </div>
                  </div>
                )}
                {scanEndTime && (
                  <div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">End Time:</span>
                    <div className="text-gray-900 dark:text-gray-100 mt-1">
                      {new Date(scanEndTime).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Target URL Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Target URL</h3>
            </div>
            
            <div className="flex space-x-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="Enter target URL (e.g., example.com or https://example.com)"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100"
                  disabled={isScanning}
                />
              </div>
              <div className="relative" ref={scanSelectionRef}>
                <button
                  onClick={() => setShowScanSelection(!showScanSelection)}
                  className="px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors font-medium whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isScanning || backgroundScanning}
                >
                  <div className="flex items-center space-x-2">
                    <span>Select Scans</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {showScanSelection && (
                  <div 
                    className="fixed w-80 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl shadow-xl z-[100]" 
                    style={{ 
                      top: `${dropdownPosition.top}px`, 
                      right: `${dropdownPosition.right}px`,
                      maxHeight: '80vh',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <div className="p-2 flex-shrink-0">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={selectedScans.has('all-scans')}
                            onChange={() => handleScanSelection('all-scans')}
                            className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                          />
                          <span className="font-semibold text-gray-900 dark:text-gray-100">All Scans</span>
                        </label>
                        <button
                          onClick={handleClearSelections}
                          className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                          title="Clear all selections"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-600 my-2"></div>
                    </div>
                    <div 
                      className="overflow-y-auto flex-1 min-h-0"
                      style={{ maxHeight: 'calc(80vh - 120px)', minHeight: '200px' }}
                    >
                      {securityTests.map((test, index) => (
                        <label key={test.id} className="flex items-center space-x-2 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedScans.has(test.id)}
                            onChange={() => handleScanSelection(test.id)}
                            className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{index + 1}. {test.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={isScanning ? stopLocalScan : startScan}
                disabled={!targetUrl.trim() && !isScanning}
                className={`px-8 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  isScanning
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg hover:shadow-xl'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isScanning ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Stop Scan</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Start Scan</span>
                  </div>
                )}
              </button>
            </div>
          </div>
          
          {/* Scan Completion Banner */}
          {!isScanning && !backgroundScanning && scanResults && Object.keys(scanResults).length > 0 && (() => {
            // Check if all selected scans are completed or if any scan has results
            const scansToCheck = getScansToRun()
            const allSelectedCompleted = scansToCheck.every(test => {
              const result = scanResults[test.id] || newScanResults[test.id]
              return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
            })
            const hasAnyResults = Object.keys(scanResults).length > 0 || Object.keys(newScanResults).length > 0
            
            if (!allSelectedCompleted && !hasAnyResults) return null
            
            const hasFailures = scansToCheck.some(test => {
              const result = scanResults[test.id] || newScanResults[test.id]
              return result && result.status === 'failed'
            })
            
            // Calculate elapsed time
            const startTime = scanTiming.startTime || scanStartTime
            const endTime = scanEndTime || scanTiming.endTime || Date.now()
            const elapsedMs = startTime ? (endTime - startTime) : 0
            const elapsedSeconds = Math.floor(elapsedMs / 1000)
            const elapsedMinutes = Math.floor(elapsedSeconds / 60)
            const elapsedHours = Math.floor(elapsedMinutes / 60)
            const elapsedDisplay = elapsedHours > 0 
              ? `${elapsedHours}:${String(elapsedMinutes % 60).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`
              : elapsedMinutes > 0
              ? `${elapsedMinutes}:${String(elapsedSeconds % 60).padStart(2, '0')}`
              : `0:${String(elapsedSeconds).padStart(2, '0')}`
            
            const formatDateTime = (timestamp) => {
              if (!timestamp) return 'N/A'
              return new Date(timestamp).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              })
            }
            
            return (
              <div className={`rounded-xl p-6 ${
                isDemoMode 
                  ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800'
                  : hasFailures
                  ? 'bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800'
                  : 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800'
              }`}>
                <div className="flex items-center space-x-4 mb-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isDemoMode 
                      ? 'bg-yellow-500'
                      : hasFailures
                      ? 'bg-red-500'
                      : 'bg-green-500'
                  }`}>
                    {isDemoMode ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    ) : hasFailures ? (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`text-lg font-semibold ${
                      isDemoMode 
                        ? 'text-yellow-900 dark:text-yellow-100'
                        : hasFailures
                        ? 'text-red-900 dark:text-red-100'
                        : 'text-green-900 dark:text-green-100'
                    }`}>
                      {isDemoMode 
                        ? 'DEMO Scan Completed!'
                        : 'Comprehensive Security Scanner has been completed'
                      }
                    </h3>
                    <p className={`text-sm mt-1 ${
                      isDemoMode 
                        ? 'text-yellow-700 dark:text-yellow-300'
                        : hasFailures
                        ? 'text-red-700 dark:text-red-300'
                        : 'text-green-700 dark:text-green-300'
                    }`}>
                      {isDemoMode 
                        ? 'This is simulated data for demonstration purposes only.'
                        : hasFailures
                        ? 'Some scans completed with errors. Review the results below for details.'
                        : 'All selected scans have been completed. Review the comprehensive results below for detailed findings and recommendations.'
                      }
                    </p>
                  </div>
                  {!isDemoMode && hasAnyResults && (
                    <button
                      onClick={generatePDFReport}
                      disabled={isExporting}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg font-medium transition-all duration-200 ${
                        isExporting
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl'
                      }`}
                      title="Export all scan results to PDF"
                    >
                      {isExporting ? (
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
                
                {/* Scan Timing Information */}
                {!isDemoMode && (startTime || endTime) && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Start Date & Time</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDateTime(startTime)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">End Date & Time</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDateTime(endTime)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Elapsed Time</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{elapsedDisplay}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Scans Completed</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {scansToCheck.filter(test => {
                          const result = scanResults[test.id] || newScanResults[test.id]
                          return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                        }).length} / {scansToCheck.length}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          
          {/* Scan Progress Overview */}
          {(isScanning || backgroundScanning || completedTests.size > 0) && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Analysis Progress</h3>
              
              {/* Only show progress metrics when scan is in progress, hide when completed */}
              {!isScanning && !backgroundScanning && (() => {
                const scansToCheck = getScansToRun()
                const allSelectedCompleted = scansToCheck.every(test => {
                  const result = scanResults[test.id] || newScanResults[test.id]
                  return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                })
                return !allSelectedCompleted // Show metrics only if not all completed
              })() && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {(() => {
                        const scansToCheck = getScansToRun()
                        return scansToCheck.filter(test => {
                          const result = scanResults[test.id] || newScanResults[test.id]
                          return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                        }).length
                      })()}/{getScansToRun().length}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Completed</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {getScansToRun().length - (() => {
                        const scansToCheck = getScansToRun()
                        return scansToCheck.filter(test => {
                          const result = scanResults[test.id] || newScanResults[test.id]
                          return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                        }).length
                      })()}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Remaining</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {(() => {
                        const scansToCheck = getScansToRun()
                        return scansToCheck.filter(test => {
                          const result = scanResults[test.id] || newScanResults[test.id]
                          return result && result.status === 'completed'
                        }).length
                      })()}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Successful</p>
                  </div>
                </div>
              )}
              
              {/* Overall Progress and Logs */}
              <div className="space-y-4">
                {/* Overall Progress */}
                <div>
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">Overall Progress</h4>
                  <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4">
                    <div 
                      className="bg-gradient-to-r from-orange-500 to-amber-600 h-4 rounded-full transition-all duration-300"
                      style={{ 
                        width: `${(() => {
                          const scansToCheck = getScansToRun()
                          const completed = scansToCheck.filter(test => {
                            const result = scanResults[test.id] || newScanResults[test.id]
                            return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                          }).length
                          return scansToCheck.length > 0 ? (completed / scansToCheck.length) * 100 : 0
                        })()}%` 
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {(() => {
                      const scansToCheck = getScansToRun()
                      const completed = scansToCheck.filter(test => {
                        const result = scanResults[test.id] || newScanResults[test.id]
                        return result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')
                      }).length
                      return `${completed} of ${scansToCheck.length} scans completed`
                    })()}
                  </p>
                </div>
                
                {/* Logs Section */}
                {logs.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">Logs</h4>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => {
                            const logText = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')
                            navigator.clipboard.writeText(logText)
                            showSuccess('Logs copied to clipboard!')
                          }}
                          className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                          title="Copy Logs"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setLogs([])}
                          className="w-8 h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                          title="Clear Logs"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div 
                      ref={logContainerRef}
                      className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm border border-gray-700"
                    >
                      <div className="space-y-2">
                        {logs.map((log, index) => (
                          <div key={index} className="text-sm">
                            {/* Command Display */}
                            {log.command && (
                              <div className="mb-2">
                                <div className="flex items-start space-x-2">
                                  <span className="text-gray-400 text-xs whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                  <span className="text-blue-400 text-xs whitespace-nowrap">[{log.testId || 'general'}]</span>
                                  <span className="text-yellow-400 text-xs whitespace-nowrap">Command:</span>
                                </div>
                                <div className="ml-4 mt-1">
                                  <div className="text-green-400 text-xs mb-1">$ {log.command}</div>
                                </div>
                              </div>
                            )}
                            {/* Output Display */}
                            {log.output && (
                              <div className="mb-2">
                                <div className="flex items-start space-x-2">
                                  <span className="text-gray-400 text-xs whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                  <span className="text-blue-400 text-xs whitespace-nowrap">[{log.testId || 'general'}]</span>
                                  <span className="text-yellow-400 text-xs whitespace-nowrap">Output:</span>
                                </div>
                                <div className="ml-4 mt-1">
                                  <pre className="text-white text-xs whitespace-pre-wrap break-words bg-gray-800 p-2 rounded">
                                    {log.output.length > 5000 
                                      ? log.output.substring(0, 5000) + '\n\n... (output truncated, showing first 5000 characters)'
                                      : log.output || '(no output)'
                                    }
                                  </pre>
                                </div>
                              </div>
                            )}
                            {/* Regular Message Display (for non-command/output logs) */}
                            {!log.command && !log.output && (
                              <div className="mb-1">
                                <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                <span className={`ml-2 ${
                                  log.type === 'error' ? 'text-red-400' :
                                  log.type === 'success' ? 'text-green-400' :
                                  log.type === 'warning' ? 'text-yellow-400' :
                                  'text-orange-400'
                                }`}>
                                  {log.message}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tool Status Display */}
      {toolStatus && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Tool Status</h3>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              toolStatus.allInstalled 
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' 
                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
            }`}>
              {toolStatus.allInstalled ? 'All Tools Ready' : `${toolStatus.missingTools.length} Missing`}
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(toolStatus.toolStatus).map(([tool, status]) => (
              <div key={tool} className="flex items-center space-x-2 p-2 rounded-lg bg-gray-50 dark:bg-slate-700">
                <div className={`w-2 h-2 rounded-full ${status.installed ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool}</span>
                {status.installed && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={status.path}>
                    {status.path.split('/').pop()}
                  </span>
                )}
              </div>
            ))}
          </div>
          
          {!toolStatus.allInstalled && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="font-medium text-yellow-800 dark:text-yellow-200">Missing Tools</span>
              </div>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                The following tools are required for security scanning: {toolStatus.missingTools.join(', ')}
              </p>
              
              {/* WSL Authentication Instructions */}
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center space-x-2 mb-2">
                  <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-blue-800 dark:text-blue-200">WSL Authentication Required</span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  Before installing tools, please authenticate WSL:
                </p>
                <ol className="text-xs text-blue-700 dark:text-blue-300 list-decimal list-inside space-y-1">
                  <li>Open Command Prompt or PowerShell</li>
                  <li>Run: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">wsl</code></li>
                  <li>Enter your username and password when prompted</li>
                  <li>Run: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">sudo su</code></li>
                  <li>Enter your password again</li>
                  <li>Close the WSL session and try installing tools again</li>
                </ol>
              </div>
              
              <button
                onClick={installMissingTools}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Install Missing Tools
              </button>
            </div>
          )}
        </div>
      )}

      {/* Demo Mode Warning */}
      {isDemoMode && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-100">DEMO MODE ACTIVE</h3>
              <p className="text-yellow-700 dark:text-yellow-300">
                This is a demonstration with simulated data. For real DNS security analysis, use the desktop application with proper network connectivity.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Background Scanning Indicator */}
      {backgroundScanning && !isDemoMode && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                {currentTest ? `${currentTest.name} Running` : 'Security Scan Running'}
              </h3>
              <p className="text-blue-700 dark:text-blue-300">
                {currentTest ? `${currentTest.name} is running in the background. You can navigate to other screens while the analysis continues.` : 'Security scan is running in the background. You can navigate to other screens while the analysis continues.'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {currentTest ? currentTest.name : 'Initializing...'}
              </div>
              <div className="text-xs text-blue-500 dark:text-blue-300">
                {currentTest ? (testProgress[currentTest.id] || 0) : 0}% Complete
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scan Completion Banner */}
      {(() => {
        console.log('[UI-DEBUG] Scan completion check:')
        console.log('[UI-DEBUG] - isScanning:', isScanning)
        console.log('[UI-DEBUG] - backgroundScanning:', backgroundScanning)
        console.log('[UI-DEBUG] - completedTests.size:', completedTests.size)
        console.log('[UI-DEBUG] - securityTests.length:', securityTests.length)
        console.log('[UI-DEBUG] - scanResults:', scanResults)
        console.log('[UI-DEBUG] - scanResults keys:', scanResults ? Object.keys(scanResults) : 'null')
        console.log('[UI-DEBUG] - scanResults length:', scanResults ? Object.keys(scanResults).length : 0)
        return null
      })()}

      {/* Security Tests Grid - Organized by Selection */}
      {(() => {
        const scansToCheck = getScansToRun()
        const isAllScansSelected = selectedScans.has('all-scans')
        const selectedScansList = securityTests.filter(test => 
          selectedScans.has(test.id) || isAllScansSelected
        )
        const unselectedScansList = securityTests.filter(test => 
          !selectedScans.has(test.id) && !isAllScansSelected && Object.keys(scanResults).length > 0
        )
        const showSeparateContainers = !isAllScansSelected && unselectedScansList.length > 0
        
        return (
          <>
            {/* User Selected Scans Container */}
            {showSeparateContainers && (
              <div className="mb-6 w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  User Selected Scans
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
                  {selectedScansList.map((test) => {
                    const isSelected = true
                    const isRunning = currentTest?.id === test.id
                    const progress = testProgress[test.id] || 0
                    const result = scanResults[test.id] || newScanResults[test.id]
                    const isExpanded = expandedTests.has(test.id)
                    // Check if this specific scan is completed
                    const scanCompleted = completedTests.has(test.id) || (result && result.status !== 'pending' && result.status !== undefined && result.status !== 'running')
                    // Show as completed if scan is done (always show green checkmark for completed scans, even during scanning)
                    const isCompleted = scanCompleted
                    const isNotScanned = false
                    const canOpen = !!(result && (result.status || result.report))
                    
                    // Get the appropriate scan component
                    const ScanComponent = scanComponents[test.id]
                    
                    if (!ScanComponent) {
                      console.warn(`No scan component found for test ID: ${test.id}`)
                      return null
                    }

                    return (
                      <ScanComponent
                        key={test.id}
                        isSelected={isSelected}
                        isRunning={isRunning}
                        progress={progress}
                        result={result}
                        isExpanded={isExpanded}
                        isCompleted={isCompleted}
                        isNotScanned={isNotScanned}
                        canOpen={canOpen}
                        isExporting={isExporting}
                        onToggleExpansion={toggleTestExpansion}
                        onOpenDetail={handleOpenDetail}
                        onGeneratePDF={generateScanPDF}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Unselected Scans Container */}
            {showSeparateContainers && unselectedScansList.length > 0 && (
              <div className="mb-6 w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Unselected Scans
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
                  {unselectedScansList.map((test) => {
                    const isSelected = false
                    const isRunning = false
                    const progress = 0
                    const result = null
                    const isExpanded = expandedTests.has(test.id)
                    const isCompleted = false
                    const isNotScanned = true
                    const canOpen = false
                    
                    // Get the appropriate scan component
                    const ScanComponent = scanComponents[test.id]
                    
                    if (!ScanComponent) {
                      console.warn(`No scan component found for test ID: ${test.id}`)
                      return null
                    }

                    return (
                      <div key={test.id} className="opacity-60">
                        <ScanComponent
                          isSelected={isSelected}
                          isRunning={isRunning}
                          progress={progress}
                          result={result}
                          isExpanded={isExpanded}
                          isCompleted={isCompleted}
                          isNotScanned={isNotScanned}
                          canOpen={canOpen}
                          isExporting={isExporting}
                          onToggleExpansion={toggleTestExpansion}
                          onOpenDetail={handleOpenDetail}
                          onGeneratePDF={generateScanPDF}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All Scans Container - Always show all scans separately below Unselected Scans */}
            <div className="mb-6 w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                All Scans
              </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full" style={{ gridAutoFlow: 'row', gridAutoRows: 'auto', width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
                {securityTests.map((test) => {
                  const isSelected = selectedScans.has(test.id) || selectedScans.has('all-scans')
                  const isRunning = currentTest?.id === test.id
                  const progress = testProgress[test.id] || 0
                  const result = scanResults[test.id] || newScanResults[test.id]
                  const isExpanded = expandedTests.has(test.id)
                  // Check if this specific scan is completed
                  const scanCompleted = completedTests.has(test.id) || (result && result.status !== 'pending' && result.status !== undefined && result.status !== 'running')
                  // Show as completed if scan is done (always show green checkmark for completed scans, even during scanning)
                  const isCompleted = scanCompleted
                  const isNotScanned = !isSelected && !isRunning && !isCompleted && Object.keys(scanResults).length > 0
                  const canOpen = !!(result && (result.status || result.report))
                  
                  // Debug logging for CSRF test
                  if (test.id === 'csrf-test') {
                    console.log('CSRF Debug - test.id:', test.id)
                    console.log('CSRF Debug - scanResults[csrf-test]:', scanResults['csrf-test'])
                    console.log('CSRF Debug - newScanResults[csrf-test]:', newScanResults['csrf-test'])
                    console.log('CSRF Debug - result:', result)
                    console.log('CSRF Debug - isCompleted:', isCompleted)
                    console.log('CSRF Debug - completedTests:', Array.from(completedTests))
                  }

                  // Get the appropriate scan component
                  const ScanComponent = scanComponents[test.id]
                  
                  if (!ScanComponent) {
                    console.warn(`No scan component found for test ID: ${test.id}`)
                    return null
                  }

                          return (
                    <ScanComponent
                      key={test.id}
                      isSelected={isSelected}
                      isRunning={isRunning}
                      progress={progress}
                      result={result}
                      isExpanded={isExpanded}
                      isCompleted={isCompleted}
                      isNotScanned={isNotScanned}
                      canOpen={canOpen}
                      isExporting={isExporting}
                      onToggleExpansion={toggleTestExpansion}
                      onOpenDetail={handleOpenDetail}
                      onGeneratePDF={generateScanPDF}
                    />
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}


      {/* Tool Installer Modal */}
      {showToolInstaller && (
        <ToolInstaller onClose={() => setShowToolInstaller(false)} />
      )}

      {/* WSL Password Prompt */}
      <WslPasswordPrompt
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSuccess={(username, password, toolCheck) => {
          // Credentials are now stored, check if tools need installation
          setShowPasswordPrompt(false)
          
          if (toolCheck && toolCheck.missingTools && toolCheck.missingTools.length > 0) {
            // Show tool installation dialog
            console.log('🔧 [COMPREHENSIVE-SCANNER] Missing tools detected, showing installation dialog')
            setMissingTools(toolCheck.missingTools)
            setTotalTools(toolCheck.totalChecked)
            setShowToolInstallationDialog(true)
          } else if (toolCheck && toolCheck.success) {
            // All tools are ready, start scan immediately
            console.log('🔧 [COMPREHENSIVE-SCANNER] All tools ready, starting scan')
            setTimeout(() => {
              if (targetUrl.trim()) {
                startScan()
              }
            }, 500)
          } else {
            // Retry tool checking
            setTimeout(() => {
              checkTools()
            }, 500)
          }
        }}
      />

      {/* Tool Installation Dialog */}
      <ToolInstallationDialog
        isOpen={showToolInstallationDialog}
        onClose={() => setShowToolInstallationDialog(false)}
        onComplete={(result) => {
          setShowToolInstallationDialog(false)
          if (result.success) {
            console.log('🔧 [COMPREHENSIVE-SCANNER] Tool installation completed successfully, starting scan')
            // Start scan after successful installation
            setTimeout(() => {
              if (targetUrl.trim()) {
                startScan()
              }
            }, 500)
          } else {
            console.log('🔧 [COMPREHENSIVE-SCANNER] Tool installation completed with issues')
            showError(`Tool installation completed with issues: ${result.error || 'Some tools may not be installed'}`)
          }
        }}
        missingTools={missingTools}
        totalTools={totalTools}
      />

      {/* DNS Detail Dialog */}
      {showDnsDetailDialog && selectedDnsResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    DNS Security Analysis - Comprehensive Report
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Detailed domain security assessment and vulnerability analysis
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={async () => {
                    if (selectedDnsResult?.report) {
                      // Scroll to AI Suggestion section
                      setTimeout(() => {
                        if (aiSuggestionRef.current && detailDialogScrollRef.current) {
                          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }, 100)
                      await fetchDnsAISuggestions('dns-resolution', 'DNS Resolution & Analysis', selectedDnsResult.report, selectedDnsResult.report.target || targetUrl)
                      // Scroll again after results are loaded
                      setTimeout(() => {
                        if (aiSuggestionRef.current && detailDialogScrollRef.current) {
                          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }
                      }, 500)
                    }
                  }}
                  disabled={isLoadingAI || !selectedDnsResult?.report}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2 disabled:cursor-not-allowed"
                >
                  {isLoadingAI ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Loading...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span>AI Suggestion</span>
                    </>
                  )}
                </button>
                <button
                  onClick={generatePDFReport}
                  className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Download PDF</span>
                </button>
                <button
                  onClick={() => setShowDnsDetailDialog(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div ref={detailDialogScrollRef} className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {selectedDnsResult.status === 'failed' ? (
                <div className="space-y-6">
                  {/* Failed Scan Message */}
                  <div className="bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800">
                    <div className="flex items-center space-x-4 mb-4">
                      <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">DNS Analysis Failed</h3>
                        <p className="text-red-700 dark:text-red-300">
                          Unable to complete DNS security analysis due to network connectivity issues.
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 border border-red-200 dark:border-red-700">
                      <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Error Details:</h4>
                      <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                        {selectedDnsResult.error || 'DNS servers could not be reached'}
                      </p>
                      
                      <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Troubleshooting Steps:</h4>
                      <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                        <li>• Check your internet connection</li>
                        <li>• Verify DNS server settings</li>
                        <li>• Try using different DNS servers (8.8.8.8, 1.1.1.1)</li>
                        <li>• Check firewall and proxy settings</li>
                        <li>• Ensure the target domain is accessible</li>
                      </ul>
                    </div>
                  </div>
                  
                  {/* Raw Output for Failed Scan */}
                  {selectedDnsResult.report?.rawOutput && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                      <details>
                        <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                          Error Output
                        </summary>
                        <div className="px-6 pb-6">
                          <pre className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96">
                            {selectedDnsResult.report.rawOutput}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              ) : selectedDnsResult.report ? (
                <div className="space-y-6">
                  {/* DNS Security Score */}
                  {selectedDnsResult.report.security_score && (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">DNS Security Score</h3>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                            {selectedDnsResult.report.security_score.score}/100
                          </div>
                          <div className="text-lg font-semibold text-purple-700 dark:text-purple-300">
                            Grade: {selectedDnsResult.report.security_score.grade}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedDnsResult.report.security_score.description}
                      </p>
                    </div>
                  )}

                  {/* Risk Summary */}
                  {selectedDnsResult.report.risk_summary && (
                    <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Risk Summary</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                            {selectedDnsResult.report.risk_summary.critical_issues}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Critical</p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                            {selectedDnsResult.report.risk_summary.high_issues}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">High</p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                            {selectedDnsResult.report.risk_summary.medium_issues}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Medium</p>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                            {selectedDnsResult.report.risk_summary.low_issues}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Low</p>
                        </div>
                      </div>
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 border border-orange-200 dark:border-orange-700">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-semibold text-gray-700 dark:text-gray-300">Overall Risk:</span>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            selectedDnsResult.report.risk_summary.overall_risk === 'Critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                            selectedDnsResult.report.risk_summary.overall_risk === 'High' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                            selectedDnsResult.report.risk_summary.overall_risk === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {selectedDnsResult.report.risk_summary.overall_risk}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {selectedDnsResult.report.risk_summary.summary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* DNS Records with Categorized Sections */}
                  {selectedDnsResult.report.records && (
                    <div className="space-y-6">
                      {/* Email Security Section */}
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          Email Security
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* SPF Records */}
                          {selectedDnsResult.report.records.SPF && selectedDnsResult.report.records.SPF.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">SPF Records</h4>
                              <div className="space-y-1">
                                {selectedDnsResult.report.records.SPF.map((spf, idx) => (
                                  <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm font-mono text-gray-600 dark:text-gray-400 break-all">
                                    {spf}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* DMARC Records */}
                          {selectedDnsResult.report.records.DMARC && selectedDnsResult.report.records.DMARC.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">DMARC Records</h4>
                              <div className="space-y-1">
                                {selectedDnsResult.report.records.DMARC.map((dmarc, idx) => (
                                  <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm font-mono text-gray-600 dark:text-gray-400 break-all">
                                    {dmarc}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* DNS Integrity Section */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          DNS Integrity
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* DNSSEC Status */}
                          {selectedDnsResult.report.dnssec && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">DNSSEC Status</h4>
                              <div className={`p-3 rounded-lg ${selectedDnsResult.report.dnssec.enabled ? 'bg-green-100 dark:bg-green-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`w-3 h-3 rounded-full ${selectedDnsResult.report.dnssec.enabled ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {selectedDnsResult.report.dnssec.enabled ? 'Enabled' : 'Disabled'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {selectedDnsResult.report.dnssec.recommendation}
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {/* Zone Transfer Status */}
                          {selectedDnsResult.report.zone_transfer && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Zone Transfer</h4>
                              <div className={`p-3 rounded-lg ${!selectedDnsResult.report.zone_transfer.allowed ? 'bg-green-100 dark:bg-green-900/20' : 'bg-red-100 dark:bg-red-900/20'}`}>
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`w-3 h-3 rounded-full ${!selectedDnsResult.report.zone_transfer.allowed ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {selectedDnsResult.report.zone_transfer.allowed ? 'Allowed' : 'Blocked'}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  {selectedDnsResult.report.zone_transfer.allowed ? 
                                    'Zone transfer is allowed - this may expose DNS records to attackers.' :
                                    'Zone transfer is properly blocked.'
                                  }
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Availability & Resilience Section */}
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          Availability & Resilience
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* A Records */}
                          {selectedDnsResult.report.records.A && selectedDnsResult.report.records.A.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">A Records (IPv4)</h4>
                              <div className="space-y-1">
                                {selectedDnsResult.report.records.A.map((ip, idx) => (
                                  <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm font-mono text-gray-600 dark:text-gray-400">
                                    {selectedDnsResult.report.domain} → {ip}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* NS Records */}
                          {selectedDnsResult.report.records.NS && selectedDnsResult.report.records.NS.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">NS Records (Name Servers)</h4>
                              <div className="space-y-1">
                                {selectedDnsResult.report.records.NS.map((ns, idx) => (
                                  <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm text-gray-600 dark:text-gray-400">
                                    {ns}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {/* MX Records */}
                          {selectedDnsResult.report.records.MX && selectedDnsResult.report.records.MX.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">MX Records (Mail Servers)</h4>
                              <div className="space-y-1">
                                {selectedDnsResult.report.records.MX.map((mx, idx) => (
                                  <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm text-gray-600 dark:text-gray-400">
                                    {mx}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Reverse DNS Information */}
                      {selectedDnsResult.report.reverse_dns && (
                        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reverse DNS</h3>
                          {selectedDnsResult.report.reverse_dns.available ? (
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">Available</span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                <strong>Hostname:</strong> {selectedDnsResult.report.reverse_dns.hostname}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                                <span className="font-medium text-gray-900 dark:text-gray-100">Not Available</span>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {selectedDnsResult.report.reverse_dns.note}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Scan Health */}
                      {selectedDnsResult.report.scan_health && (
                        <div className="bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20 rounded-lg p-6 border border-gray-200 dark:border-gray-800">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Health</h3>
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <span className={`w-3 h-3 rounded-full ${selectedDnsResult.report.scan_health.status === 'Complete' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                Status: {selectedDnsResult.report.scan_health.status}
                              </span>
                            </div>
                            <div className="space-y-1">
                              {selectedDnsResult.report.scan_health.notes.map((note, idx) => (
                                <p key={idx} className="text-sm text-gray-600 dark:text-gray-400">• {note}</p>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Security Findings with Category Grouping */}
                  {selectedDnsResult.report?.findings && selectedDnsResult.report.findings.length > 0 && (
                    <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Findings</h3>
                      <div className="space-y-4">
                        {selectedDnsResult.report.findings.map((finding, idx) => (
                          <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                            finding.severity === 'Critical' ? 'bg-red-50 border-red-400 dark:bg-red-900/10' :
                            finding.severity === 'High' ? 'bg-orange-50 border-orange-400 dark:bg-orange-900/10' :
                            finding.severity === 'Medium' ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/10' :
                            'bg-blue-50 border-blue-400 dark:bg-blue-900/10'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    finding.severity === 'Critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                    finding.severity === 'High' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                    finding.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                    'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                  }`}>
                                    {finding.severity}
                                  </span>
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                    {finding.issue}
                                  </h4>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                  {finding.explanation}
                                </p>
                                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/10 rounded text-sm text-blue-700 dark:text-blue-300">
                                  <strong>Recommendation:</strong> {finding.recommendation}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reverse DNS */}
                  {selectedDnsResult.report?.reverse_dns && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reverse DNS (PTR)</h3>
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded p-4">
                        {selectedDnsResult.report.reverse_dns.available ? (
                          <div>
                            <p className="text-sm text-green-600 dark:text-green-400 mb-2">Reverse DNS available</p>
                            <p className="text-sm font-mono text-gray-600 dark:text-gray-400">
                              {selectedDnsResult.report.reverse_dns.hostname}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">Reverse DNS lookup failed or timed out</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {selectedDnsResult.report.reverse_dns.note || 'Reverse DNS (PTR) records could not be resolved for the domain\'s IP addresses.'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scan Health */}
                  {selectedDnsResult.report?.scan_health && (
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Health</h3>
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded p-4">
                        <div className="flex items-center space-x-2 mb-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            selectedDnsResult.report.scan_health.status === 'Complete' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                            selectedDnsResult.report.scan_health.status === 'Partial' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                            {selectedDnsResult.report.scan_health.status}
                          </span>
                        </div>
                        {selectedDnsResult.report.scan_health.notes.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes:</p>
                            <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                              {selectedDnsResult.report.scan_health.notes.map((note, idx) => (
                                <li key={idx} className="flex items-start">
                                  <span className="mr-2">•</span>
                                  <span>{note}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Subdomains */}
                  {selectedDnsResult.report?.subdomains && selectedDnsResult.report.subdomains.length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Discovered Subdomains</h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                        {selectedDnsResult.report.subdomains.map((subdomain, idx) => (
                          <div key={idx} className="bg-white/60 dark:bg-slate-800/60 rounded p-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                            {subdomain}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Record Details */}
                  {selectedDnsResult.report.records && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Record Details</h3>
                      <div className="space-y-4">
                        {selectedDnsResult.report.records.a && selectedDnsResult.report.records.a.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">A Records</h4>
                            <div className="bg-gray-50 dark:bg-slate-700 rounded p-3">
                              {selectedDnsResult.report.records.a.map((ip, idx) => (
                                <div key={idx} className="font-mono text-sm text-gray-600 dark:text-gray-400">
                                  {targetUrl} → {ip}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedDnsResult.report.records.ns && selectedDnsResult.report.records.ns.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">NS Records (Name Servers)</h4>
                            <div className="bg-gray-50 dark:bg-slate-700 rounded p-3">
                              {selectedDnsResult.report.records.ns.map((ns, idx) => (
                                <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                  {ns}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedDnsResult.report.records.mx && selectedDnsResult.report.records.mx.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">MX Records (Mail Servers)</h4>
                            <div className="bg-gray-50 dark:bg-slate-700 rounded p-3">
                              {selectedDnsResult.report.records.mx.map((mx, idx) => (
                                <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                  {mx}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedDnsResult.report.records.txt && selectedDnsResult.report.records.txt.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">TXT Records</h4>
                            <div className="bg-gray-50 dark:bg-slate-700 rounded p-3">
                              {selectedDnsResult.report.records.txt.map((txt, idx) => (
                                <div key={idx} className="font-mono text-xs text-gray-600 dark:text-gray-400 break-all">
                                  {txt}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {selectedDnsResult.report.records.subdomains && selectedDnsResult.report.records.subdomains.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Discovered Subdomains</h4>
                            <div className="bg-gray-50 dark:bg-slate-700 rounded p-3">
                              {selectedDnsResult.report.records.subdomains.map((sub, idx) => (
                                <div key={idx} className="font-mono text-sm text-gray-600 dark:text-gray-400">
                                  {sub.name} → {sub.ip}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Security Assessment */}
                  <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      Security Risk Assessment
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 border border-red-200 dark:border-red-700">
                        <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Domain Takeover Risk</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Subdomain Hijacking:</span>
                            <span className={`font-medium ${
                              selectedDnsResult.report?.summary?.subdomainsFound > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}>
                              {selectedDnsResult.report?.summary?.subdomainsFound > 0 ? 'Medium Risk' : 'Low Risk'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Zone Transfer:</span>
                            <span className={`font-medium ${
                              selectedDnsResult.report?.summary?.zoneTransfer === 'blocked' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {selectedDnsResult.report?.summary?.zoneTransfer === 'blocked' ? 'Protected' : 'Vulnerable'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 border border-red-200 dark:border-red-700">
                        <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Email Security</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">SPF Protection:</span>
                            <span className={`font-medium ${
                              selectedDnsResult.report?.summary?.spfRecord ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {selectedDnsResult.report?.summary?.spfRecord ? 'Configured' : 'Missing'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">DMARC Policy:</span>
                            <span className={`font-medium ${
                              selectedDnsResult.report?.summary?.dmarcRecord ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {selectedDnsResult.report?.summary?.dmarcRecord ? 'Configured' : 'Missing'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white/60 dark:bg-slate-800/60 rounded-lg p-4 border border-red-200 dark:border-red-700">
                      <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">DNS Integrity</h4>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">DNSSEC Status:</span>
                        <span className={`font-medium ${
                          selectedDnsResult.report?.summary?.dnssec ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          {selectedDnsResult.report?.summary?.dnssec ? 'Enabled (Secure)' : 'Disabled (Vulnerable)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* AI Suggestion Section */}
                  {aiSuggestions && (
                    <div ref={aiSuggestionRef} className="bg-gradient-to-br from-purple-50 via-indigo-50 to-pink-50 dark:from-purple-900/20 dark:via-indigo-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-purple-300 dark:border-purple-700 mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-3">
                          <div className="relative">
                            <div className="absolute inset-0 bg-purple-500 rounded-lg blur opacity-50 animate-pulse"></div>
                            <svg className="w-6 h-6 text-purple-600 dark:text-purple-400 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </div>
                          <span>AI Suggestion</span>
                        </h3>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-5 border border-purple-200 dark:border-purple-700">
                        <div className="prose dark:prose-invert max-w-none">
                          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {aiSuggestions}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {aiError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
                      <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-800 dark:text-red-300">{aiError}</p>
                      </div>
                    </div>
                  )}

                  {/* DNS Scan Overview - Comprehensive Section */}
                  {selectedDnsResult.report?.scanMetadata && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-3">
                          <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          <span>DNS Scan — Overview</span>
                        </h3>
                        <div className="flex items-center space-x-4 text-sm">
                          <div className="flex items-center space-x-2">
                            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-gray-700 dark:text-gray-300">{selectedDnsResult.report.scanMetadata.durationSeconds}s</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-gray-700 dark:text-gray-300">{selectedDnsResult.report.scanMetadata.steps.length} steps</span>
                          </div>
                        </div>
                      </div>

                      {/* Summary */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-700">
                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                          {selectedDnsResult.report.scanMetadata.summaryText || 'DNS Resolution & Analysis scan completed successfully. All commands executed and results collected.'}
                        </p>
                      </div>

                      {/* Timeline */}
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Scan Timeline</span>
                        </h4>
                        <div className="relative">
                          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-blue-200 dark:bg-blue-700"></div>
                          <div className="space-y-4">
                            {selectedDnsResult.report.scanMetadata.steps.map((step, idx) => {
                              const stepTime = new Date(step.timestamp)
                              const timeStr = stepTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              return (
                                <div key={step.id} className="relative flex items-start space-x-4 pl-12">
                                  <div className="absolute left-3 top-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-slate-800"></div>
                                  <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{step.name}</span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{timeStr}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                        step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                        step.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                      }`}>
                                        {step.status}
                                      </span>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">stdout: {step.stdoutBytes}b</span>
                                      {step.stderrBytes > 0 && (
                                        <span className="text-xs text-yellow-600 dark:text-yellow-400">stderr: {step.stderrBytes}b</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Commands Table */}
                      <div className="mb-6">
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>Command Execution Details</span>
                        </h4>
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 dark:bg-slate-700">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Step</th>
                                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Output</th>
                                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                {selectedDnsResult.report.scanMetadata.steps.map((step, idx) => (
                                  <tr key={step.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-4 py-3">
                                      <div className="font-medium text-gray-900 dark:text-gray-100">{step.name}</div>
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {new Date(step.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                                      {step.description}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="flex flex-col items-center space-y-1">
                                        <span className="text-xs text-gray-600 dark:text-gray-400">{step.stdoutBytes}b</span>
                                        {step.stderrBytes > 0 && (
                                          <span className="text-xs text-yellow-600 dark:text-yellow-400">{step.stderrBytes}b</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                        step.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                      }`}>
                                        {step.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>


                      {/* Warnings & Errors */}
                      {selectedDnsResult.report.scanMetadata.warnings && selectedDnsResult.report.scanMetadata.warnings.length > 0 && (
                        <div className="mb-6">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>Warnings & Noteworthy Findings</span>
                          </h4>
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                            <ul className="space-y-2">
                              {selectedDnsResult.report.scanMetadata.warnings.map((warning, idx) => (
                                <li key={idx} className="flex items-start space-x-2 text-sm text-yellow-800 dark:text-yellow-300">
                                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span>{warning}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Raw Log Viewer */}
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>Raw Scan Log</span>
                        </h4>
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                          <details>
                            <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 rounded-t-lg">
                              Click to expand raw scan log
                            </summary>
                            <div className="px-4 pb-4">
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {(() => {
                                    const dnsLogs = logs.filter(log => log.testId === 'dns-resolution')
                                    return dnsLogs.map(log => {
                                      const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                      return `[${time}] ${log.message}`
                                    }).join('\n')
                                  })()}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Findings & Recommendations */}
                  {selectedDnsResult.findings && selectedDnsResult.findings.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Detailed Findings & Recommendations</h3>
                      <div className="space-y-3">
                        {selectedDnsResult.findings.map((finding, idx) => {
                          // Ensure finding has required properties with defaults
                          const findingType = finding.type || 'info';
                          const findingMessage = finding.message || 'No message available';
                          const findingDetails = finding.details || '';
                          
                          return (
                          <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                            findingType === 'critical' ? 'bg-red-50 border-red-400 dark:bg-red-900/10' :
                            findingType === 'high' ? 'bg-orange-50 border-orange-400 dark:bg-orange-900/10' :
                            findingType === 'medium' ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/10' :
                            findingType === 'low' ? 'bg-blue-50 border-blue-400 dark:bg-blue-900/10' :
                            'bg-green-50 border-green-400 dark:bg-green-900/10'
                          }`}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    findingType === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                    findingType === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                    findingType === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                    findingType === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                                    'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  }`}>
                                    {findingType.toUpperCase()}
                                  </span>
                                  <span className={`font-medium ${
                                    findingType === 'critical' ? 'text-red-800 dark:text-red-300' :
                                    findingType === 'high' ? 'text-orange-800 dark:text-orange-300' :
                                    findingType === 'medium' ? 'text-yellow-800 dark:text-yellow-300' :
                                    findingType === 'low' ? 'text-blue-800 dark:text-blue-300' :
                                    'text-green-800 dark:text-green-300'
                                  }`}>
                                    {findingMessage}
                                  </span>
                                </div>
                                {findingDetails && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                                    {findingDetails}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Raw Output */}
                  {selectedDnsResult.report.rawOutput && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                      <details>
                        <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                          Raw Command Output
                        </summary>
                        <div className="px-6 pb-6">
                          <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96">
                            {selectedDnsResult.report.rawOutput}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No Report Data Available</h3>
                  <p className="text-gray-600 dark:text-gray-400">
                    No detailed report data is available for this DNS analysis.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scan Detail Dialog */}
      {showScanDetailDialog && selectedScanResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {selectedScanResult.result?.testName || 'Security Scan Results'}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Detailed analysis results and findings
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedScanResult?.testId && selectedScanResult?.result) {
                      generateScanPDF(selectedScanResult.testId, selectedScanResult.result)
                    }
                  }}
                  disabled={isExporting}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                  title="Export PDF"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span>Export PDF</span>
                    </>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    fetchAISuggestions()
                  }}
                  disabled={isLoadingAI}
                  className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                  title="AI Suggestion"
                >
                  {isLoadingAI ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      <span>AI Suggestion</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowScanDetailDialog(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)] overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
              {/* Scan Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600 mb-6" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {selectedScanResult.result?.status === 'completed' ? 'Completed' : 
                       selectedScanResult.result?.status === 'timed out' ? 'Timed Out' : 'Failed'}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {selectedScanResult.result?.findings?.length || 0}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Findings</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {selectedScanResult.result?.recommendations?.length || 0}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Recommendations</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {selectedScanResult.result?.severity || 'N/A'}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Severity</p>
                  </div>
                </div>
              </div>

              {/* AI Suggestion Section - Moved to top with unique styling */}
              {(aiSuggestions || isLoadingAI || aiError) && (
                <div ref={aiSuggestionRef} className="relative bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-600 dark:from-purple-900 dark:via-pink-900 dark:to-indigo-900 rounded-xl p-6 border-4 border-purple-300 dark:border-purple-700 mb-6 shadow-2xl transform transition-all duration-300 hover:scale-[1.01]">
                  {/* Animated background pattern */}
                  <div className="absolute inset-0 opacity-10 overflow-hidden rounded-xl">
                    <div className="absolute -top-4 -left-4 w-24 h-24 bg-white rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-white rounded-full blur-3xl animate-pulse delay-300"></div>
                  </div>
                  
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="relative">
                          <div className="absolute inset-0 bg-purple-400 rounded-lg blur-lg opacity-50 animate-pulse"></div>
                          <svg className="relative w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                            <span>AI Suggestion</span>
                          </h3>
                          <p className="text-xs text-white/80 mt-1">Intelligent security analysis and recommendations</p>
                        </div>
                      </div>
                      {aiSuggestions && (
                        <button
                          onClick={fetchAISuggestions}
                          disabled={isLoadingAI}
                          className="text-sm px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-all duration-200 disabled:opacity-50 backdrop-blur-sm border border-white/30"
                          title="Refresh AI suggestions"
                        >
                          <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh
                        </button>
                      )}
                    </div>
                    
                    {isLoadingAI && (
                      <div className="flex flex-col items-center justify-center py-12 bg-white/10 rounded-xl backdrop-blur-sm">
                        <div className="relative">
                          <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mb-4"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <svg className="w-6 h-6 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                            </svg>
                          </div>
                        </div>
                        <p className="text-white font-medium">Generating AI suggestions...</p>
                        <p className="text-sm text-white/80 mt-2">Analyzing scan results with AI</p>
                      </div>
                    )}
                    
                    {aiError && (
                      <div className="bg-red-500/20 dark:bg-red-900/40 border-2 border-red-300 dark:border-red-700 rounded-xl p-4 backdrop-blur-sm">
                        <div className="flex items-start space-x-3">
                          <svg className="w-6 h-6 text-red-200 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="flex-1">
                            <h4 className="text-sm font-semibold text-white mb-1">Error loading AI suggestions</h4>
                            <p className="text-sm text-red-100 dark:text-red-300">{aiError}</p>
                            <button
                              onClick={fetchAISuggestions}
                              className="mt-3 text-sm px-4 py-2 bg-red-500/30 hover:bg-red-500/40 text-white rounded-lg transition-colors border border-red-300/50"
                            >
                              Try Again
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {aiSuggestions && !isLoadingAI && !aiError && (
                      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-xl p-6 border-2 border-white/30 shadow-xl">
                        <div className="flex items-start space-x-3 mb-4">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
                              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900 dark:text-white mb-1">AI Analysis Complete</h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Generated insights and recommendations</p>
                          </div>
                        </div>
                        <div className="prose dark:prose-invert max-w-none">
                          <div className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed text-sm bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 p-4 rounded-lg border border-gray-200 dark:border-slate-700">
                            {formatAISuggestions(aiSuggestions)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Comprehensive Scan Report */}
              {selectedScanResult.result?.report && (
                <div className="space-y-6">
                  {/* Risk Level & Summary */}
                  {selectedScanResult.result.report.riskLevel && (
                    <div className={`rounded-lg p-6 border ${
                      selectedScanResult.result.report.riskLevel === 'Critical' ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' :
                      selectedScanResult.result.report.riskLevel === 'High' ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800' :
                      selectedScanResult.result.report.riskLevel === 'Medium' ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800' :
                      'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                    }`}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Risk Assessment</h3>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                          selectedScanResult.result.report.riskLevel === 'Critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                          selectedScanResult.result.report.riskLevel === 'High' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                          selectedScanResult.result.report.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                          'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                        }`}>
                          {selectedScanResult.result.report.riskLevel} Risk
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedScanResult.result.report.summary}
                      </p>
                    </div>
                  )}

                  {/* Scan Details */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Target</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.target}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Scan Type</label>
                        <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.scanType}</p>
                      </div>
                    </div>
                  </div>

                  {/* Specific Report Sections based on scan type */}
                  {selectedScanResult.result.report.scanType === 'SSL/TLS Analysis' && selectedScanResult.result.report.supportedProtocols && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">SSL/TLS Configuration</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Supported Protocols</label>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {selectedScanResult.result.report.supportedProtocols.join(', ')}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Cipher Strength</label>
                          <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.cipherStrength}</p>
                        </div>
                        {selectedScanResult.result.report.certificateInfo && (
                          <>
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Certificate Issuer</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.issuer}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Valid Until</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.validTo}</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedScanResult.result.report.scanType === 'Security Headers' && selectedScanResult.result.report.headersFound && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Headers</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Headers Found</h4>
                          <div className="space-y-1">
                            {Object.entries(selectedScanResult.result.report.headersFound).map(([key, value]) => (
                              <div key={key} className="text-sm text-gray-600 dark:text-gray-400">
                                <span className="font-mono">{key}:</span> {value}
                              </div>
                            ))}
                          </div>
                        </div>
                        {selectedScanResult.result.report.missingHeaders && selectedScanResult.result.report.missingHeaders.length > 0 && (
                          <div>
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Missing Headers</h4>
                            <div className="space-y-1">
                              {selectedScanResult.result.report.missingHeaders.map((header, idx) => (
                                <div key={idx} className="text-sm text-red-600 dark:text-red-400">
                                  {header}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedScanResult.result.report.scanType === 'Port Scanning' && selectedScanResult.result.report.openPorts && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Open Ports</h3>
                      <div className="space-y-2">
                        {selectedScanResult.result.report.openPorts.map((port, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded">
                            <div className="flex items-center space-x-4">
                              <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                                {port.port}
                              </span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">{port.service}</span>
                              {port.version && (
                                <span className="text-xs text-gray-500 dark:text-gray-500">{port.version}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}


                  {/* CORS Policy Validation Results */}
                  {selectedScanResult.result.report.scanType === 'CORS Policy Validation' && selectedScanResult.result.report.summary && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">CORS Policy Validation Results</h3>
                      <div className={`p-4 rounded-lg border-l-4 ${
                        selectedScanResult.result.report.summary.status === 'Vulnerable'
                          ? 'bg-red-50 border-red-400 dark:bg-red-900/10 dark:border-red-600'
                          : 'bg-green-50 border-green-400 dark:bg-green-900/10 dark:border-green-600'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">Status:</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            selectedScanResult.result.report.summary.status === 'Vulnerable'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {selectedScanResult.result.report.summary.status || 'Safe'}
                          </span>
                        </div>
                        <div className="mt-2">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Evidence:</span>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {selectedScanResult.result.report.summary.evidence || 'No evidence available'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Command Display - Always show for all scans */}
                  {(() => {
                    const report = selectedScanResult.result.report || {}
                    const testId = selectedScanResult.result.testId || selectedScanResult.testId
                    const target = report.target || targetUrl
                    
                    // Get command from various possible locations - prioritize report.command
                    let command = report.command || report.summary?.command
                    
                    // For DNS scans, combine all commands from rawCommandsOutput
                    if (!command && report.rawCommandsOutput && Array.isArray(report.rawCommandsOutput)) {
                      command = report.rawCommandsOutput
                        .map((cmd, idx) => `# Command ${idx + 1}: ${cmd.name || 'Unknown'}\n${cmd.command || cmd.cmd || 'N/A'}`)
                        .join('\n\n')
                    }
                    
                    // For File Upload, get from json.commands
                    if (!command && report.json && report.json.commands && Array.isArray(report.json.commands)) {
                      command = report.json.commands
                        .map((cmd, idx) => `# Command ${idx + 1}: ${cmd.name || cmd.id || 'Unknown'}\n${cmd.command || cmd.cmd || 'N/A'}`)
                        .join('\n\n')
                    }
                    
                    // Generate command based on testId if not stored
                    if (!command) {
                      const domain = target.replace(/^https?:\/\//, '').split('/')[0]
                      switch (testId) {
                        case 'dns-resolution':
                          command = `dig +noall +answer ${domain} A MX TXT NS SOA\ndnsrecon -d ${domain}\ndnsenum ${domain}`
                          break
                        case 'ssl-tls-analysis':
                          command = `echo | openssl s_client -connect ${domain}:443 -servername ${domain} 2>/dev/null | openssl x509 -noout -text\nnmap --script ssl-enum-ciphers -p 443 ${domain}`
                          break
                        case 'security-headers':
                          command = `curl -I -L ${target}`
                          break
                        case 'subdomain-enumeration':
                          command = `dnsrecon -d ${domain} -t brt`
                          break
                        case 'port-scanning':
                          command = `nmap -sV --top-ports 100 ${domain}`
                          break
                        case 'sql-injection-test':
                          command = `sqlmap -u ${target} --batch --level=1 --risk=1 --dbs`
                          break
                        case 'xss-test':
                        case 'xss-scan':
                          command = `dalfox url "${target}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json`
                          break
                        case 'csrf-test':
                          command = `curl -X POST -H "Origin: http://evil.com" -H "Content-Type: application/x-www-form-urlencoded" -d "test=1" "${target}"`
                          break
                        case 'cms-detection':
                          command = `whatweb -v ${target}\ncurl -s -I ${target} | grep -i "server\\|x-powered-by\\|x-generator"`
                          break
                        case 'cors-policy-validation':
                          command = `curl -I -H "Origin: http://evil.com" ${target} | grep -i "access-control-allow-origin" || true`
                          break
                        case 'open-redirect-check':
                          command = `curl -I ${target.replace(/\/$/, '')}/?redirect=http://evil.com`
                          break
                        case 'host-header-injection':
                          command = `curl -I -H "Host: attacker.com" ${target}`
                          break
                        case 'http-methods-check':
                          command = `curl -X OPTIONS -I ${target}`
                          break
                        case 'waf-detection':
                          command = `wafw00f ${target}`
                          break
                        case 'file-upload-check':
                          command = `curl -v -F "file=@test.txt" "${target}/admin/upload" 2>&1\ncurl -v -F "file=@harmless.php.txt" "${target}/admin/upload" 2>&1\ncurl -I "${target}/admin/uploads/harmless.php.txt" 2>&1`
                          break
                        case 'ct-log-subdomain-discovery':
                          const domainForCT = target.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
                          command = `curl -s 'https://crt.sh/?q=%25.${domainForCT}&output=json' | jq .`
                          break
                        case 'quick-fingerprint':
                          command = `whatweb -v ${target}`
                          break
                        default:
                          command = `Command not available for ${testId}`
                      }
                    }
                    
                    // Don't show for DNS (it has its own comprehensive command display)
                    if (testId === 'dns-resolution') {
                      return null
                    }
                    
                    return (
                      <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>Command Executed</span>
                        </h3>
                        <div className="bg-gray-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-words">
                            {command}
                          </pre>
                        </div>
                      </div>
                    )
                  })()}

                  {/* DNS Resolution & Analysis Results - Overview Section */}
                  {(selectedScanResult.testId === 'dns-resolution' || selectedScanResult.result?.report?.scanType === 'DNS Resolution & Analysis' || selectedScanResult.result?.report?.scanType === 'DNS Analysis') && selectedScanResult.result?.report && (
                    <div className="space-y-6">
                      {/* DNS Scan Overview */}
                      {selectedScanResult.result.report.scanMetadata && (
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                          <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center space-x-3">
                              <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <span>DNS Scan — Overview</span>
                            </h3>
                            <div className="flex items-center space-x-4 text-sm">
                              <div className="flex items-center space-x-2">
                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.scanMetadata.durationSeconds}s</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.scanMetadata.steps.length} steps</span>
                              </div>
                            </div>
                          </div>

                          {/* Summary */}
                          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-6 border border-blue-200 dark:border-blue-700">
                            <p className="text-gray-800 dark:text-gray-200 leading-relaxed">
                              {selectedScanResult.result.report.scanMetadata.summaryText || 'DNS Resolution & Analysis scan completed successfully. All commands executed and results collected.'}
                            </p>
                          </div>

                          {/* Timeline */}
                          <div className="mb-6">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span>Scan Timeline</span>
                            </h4>
                            <div className="relative">
                              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-blue-200 dark:bg-blue-700"></div>
                              <div className="space-y-4">
                                {selectedScanResult.result.report.scanMetadata.steps.map((step, idx) => {
                                  const stepTime = new Date(step.timestamp)
                                  const timeStr = stepTime.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                  return (
                                    <div key={step.id} className="relative flex items-start space-x-4 pl-12">
                                      <div className="absolute left-3 top-1.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-white dark:border-slate-800"></div>
                                      <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{step.name}</span>
                                          <span className="text-xs text-gray-500 dark:text-gray-400">{timeStr}</span>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                            step.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                          }`}>
                                            {step.status}
                                          </span>
                                          <span className="text-xs text-gray-500 dark:text-gray-400">stdout: {step.stdoutBytes}b</span>
                                          {step.stderrBytes > 0 && (
                                            <span className="text-xs text-yellow-600 dark:text-yellow-400">stderr: {step.stderrBytes}b</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Commands Table */}
                          <div className="mb-6">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                              </svg>
                              <span>Command Execution Details</span>
                            </h4>
                            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-gray-50 dark:bg-slate-700">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Step</th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Command</th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Output</th>
                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Artifacts</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                                    {selectedScanResult.result.report.scanMetadata.steps.map((step, idx) => (
                                      <tr key={step.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                                        <td className="px-4 py-3">
                                          <div className="font-medium text-gray-900 dark:text-gray-100">{step.name}</div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {new Date(step.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <code className="text-xs bg-gray-100 dark:bg-slate-900 px-2 py-1 rounded text-gray-800 dark:text-gray-200 font-mono break-all">
                                            {step.command}
                                          </code>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                                          {step.description}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <div className="flex flex-col items-center space-y-1">
                                            <span className="text-xs text-gray-600 dark:text-gray-400">{step.stdoutBytes}b</span>
                                            {step.stderrBytes > 0 && (
                                              <span className="text-xs text-yellow-600 dark:text-yellow-400">{step.stderrBytes}b</span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                                            step.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                            step.status === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                            'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                                          }`}>
                                            {step.status}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          {step.artifactPaths && step.artifactPaths.length > 0 ? (
                                            <div className="flex flex-col items-center space-y-1">
                                              {step.artifactPaths.map((path, pidx) => (
                                                <span key={pidx} className="text-xs text-blue-600 dark:text-blue-400 font-mono">{path}</span>
                                              ))}
                                            </div>
                                          ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>

                          {/* Artifacts Summary */}
                          {selectedScanResult.result.report.scanMetadata.artifacts && selectedScanResult.result.report.scanMetadata.artifacts.length > 0 && (
                            <div className="mb-6">
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span>Discovered Artifacts</span>
                              </h4>
                              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  {selectedScanResult.result.report.scanMetadata.artifacts.map((artifact, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                                      <div className="flex items-center space-x-3">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <div>
                                          <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{artifact.path}</div>
                                          <div className="text-xs text-gray-500 dark:text-gray-400">{artifact.type.toUpperCase()} • {(artifact.sizeBytes / 1024).toFixed(2)} KB</div>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Warnings & Errors */}
                          {selectedScanResult.result.report.scanMetadata.warnings && selectedScanResult.result.report.scanMetadata.warnings.length > 0 && (
                            <div className="mb-6">
                              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>Warnings & Noteworthy Findings</span>
                              </h4>
                              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                <ul className="space-y-2">
                                  {selectedScanResult.result.report.scanMetadata.warnings.map((warning, idx) => (
                                    <li key={idx} className="flex items-start space-x-2 text-sm text-yellow-800 dark:text-yellow-300">
                                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      <span>{warning}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}

                          {/* Next Steps */}
                          <div className="mb-6">
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <span>Next Steps</span>
                            </h4>
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                              <ul className="space-y-2">
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Review discovered subdomains and validate ownership</span>
                                </li>
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Check MX records and verify email security (SPF, DKIM, DMARC)</span>
                                </li>
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Perform zone transfer testing to ensure it's disabled</span>
                                </li>
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Review DNSSEC status and enable if missing</span>
                                </li>
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Run follow-up scans: Port scanning on discovered IPs, SSL/TLS analysis</span>
                                </li>
                                <li className="flex items-start space-x-3 text-sm text-gray-700 dark:text-gray-300">
                                  <input type="checkbox" className="mt-1" />
                                  <span>Download and inspect artifact files (dnsrecon_output.json, dnsenum_output.xml)</span>
                                </li>
                              </ul>
                            </div>
                          </div>

                          {/* Raw Log Viewer */}
                          <div>
                            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>Raw Scan Log</span>
                            </h4>
                            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                              <details>
                                <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 rounded-t-lg">
                                  Click to expand raw scan log
                                </summary>
                                <div className="px-4 pb-4">
                                  <div className="bg-gray-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                                    <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                      {(() => {
                                        const dnsLogs = logs.filter(log => log.testId === 'dns-resolution')
                                        return dnsLogs.map(log => {
                                          const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                          return `[${time}] ${log.message}`
                                        }).join('\n')
                                      })()}
                                    </pre>
                                  </div>
                                </div>
                              </details>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Always show raw DNS results if available */}
                      {(selectedScanResult.result.report.digAny || selectedScanResult.result.report.digRecords || selectedScanResult.result.report.dnsrecon || selectedScanResult.result.report.dnsenum || selectedScanResult.result.report.reverseDns) && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center space-x-2">
                            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>DNS Scan Raw Results</span>
                          </h3>
                          
                          {selectedScanResult.result.report.digAny && selectedScanResult.result.report.digAny.length > 0 && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Basic DNS Lookup (ANY):</h4>
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 border border-gray-700 dark:border-gray-600 overflow-x-auto">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(selectedScanResult.result.report.digAny, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                          
                          {selectedScanResult.result.report.digRecords && selectedScanResult.result.report.digRecords.length > 0 && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Detailed DNS Records (A, MX, TXT, NS, SOA):</h4>
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 border border-gray-700 dark:border-gray-600 overflow-x-auto">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(selectedScanResult.result.report.digRecords, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                          
                          {selectedScanResult.result.report.reverseDns && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Reverse DNS:</h4>
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 border border-gray-700 dark:border-gray-600">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {selectedScanResult.result.report.reverseDns}
                                </pre>
                              </div>
                            </div>
                          )}
                          
                          {selectedScanResult.result.report.dnsrecon && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">DNS Reconnaissance (dnsrecon):</h4>
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 border border-gray-700 dark:border-gray-600 overflow-x-auto max-h-96 overflow-y-auto">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(selectedScanResult.result.report.dnsrecon, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                          
                          {selectedScanResult.result.report.dnsenum && (
                            <div className="mb-4">
                              <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">DNS Enumeration (dnsenum):</h4>
                              <div className="bg-gray-900 dark:bg-black rounded-lg p-4 border border-gray-700 dark:border-gray-600 overflow-x-auto max-h-96 overflow-y-auto">
                                <pre className="text-xs text-green-400 dark:text-green-300 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(selectedScanResult.result.report.dnsenum, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* DNS Summary - Legacy format support */}
                      {selectedScanResult.result.report.risk_summary && (
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.risk_summary?.overall_risk === 'Critical' 
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                          : selectedScanResult.result.report.risk_summary?.overall_risk === 'High'
                          ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                          : selectedScanResult.result.report.risk_summary?.overall_risk === 'Medium'
                          ? 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                          : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">DNS Security Analysis</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selectedScanResult.result.report.risk_summary?.overall_risk === 'Critical' 
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : selectedScanResult.result.report.risk_summary?.overall_risk === 'High'
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
                              : selectedScanResult.result.report.risk_summary?.overall_risk === 'Medium'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {selectedScanResult.result.report.risk_summary?.overall_risk || 'Unknown'} Risk
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {selectedScanResult.result.report.risk_summary?.summary || 'DNS security analysis completed.'}
                            </p>
                          </div>
                        )}

                      {/* DNS Records */}
                      {selectedScanResult.result.report.records && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">DNS Records</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {Object.entries(selectedScanResult.result.report.records).map(([recordType, records]) => (
                              <div key={recordType}>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">{recordType} Records</h4>
                                <div className="space-y-1">
                                  {records && records.length > 0 ? (
                                    records.map((record, idx) => (
                                      <div key={idx} className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-slate-700 p-2 rounded">
                                        {typeof record === 'object' ? JSON.stringify(record, null, 2) : String(record)}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-sm text-gray-500 dark:text-gray-500 italic">No {recordType} records found</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* DNSSEC Status */}
                      {selectedScanResult.result.report.dnssec && (
                        <div className={`rounded-lg p-6 border ${
                          selectedScanResult.result.report.dnssec.enabled 
                            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                            : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                        }`}>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">DNSSEC Status</h3>
                          <p className={`text-sm ${
                            selectedScanResult.result.report.dnssec.enabled 
                              ? 'text-green-700 dark:text-green-300'
                              : 'text-red-700 dark:text-red-300'
                          }`}>
                            {selectedScanResult.result.report.dnssec.enabled ? 'DNSSEC is enabled' : 'DNSSEC is not enabled'}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                            {selectedScanResult.result.report.dnssec.recommendation}
                          </p>
                        </div>
                      )}

                      {/* Zone Transfer Status */}
                      {selectedScanResult.result.report.zone_transfer && (
                        <div className={`rounded-lg p-6 border ${
                          selectedScanResult.result.report.zone_transfer.allowed 
                            ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                            : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                        }`}>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Zone Transfer Status</h3>
                          <p className={`text-sm ${
                            selectedScanResult.result.report.zone_transfer.allowed 
                              ? 'text-red-700 dark:text-red-300'
                              : 'text-green-700 dark:text-green-300'
                          }`}>
                            {selectedScanResult.result.report.zone_transfer.allowed ? 'Zone transfer is allowed (security risk)' : 'Zone transfer is blocked (secure)'}
                          </p>
                        </div>
                      )}

                      {/* Subdomains */}
                      {selectedScanResult.result.report.subdomains && selectedScanResult.result.report.subdomains.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Discovered Subdomains</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedScanResult.result.report.subdomains.map((subdomain, idx) => (
                              <div key={idx} className="p-2 bg-gray-50 dark:bg-slate-700 rounded text-sm font-mono text-gray-600 dark:text-gray-400">
                                {subdomain}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Raw Output */}
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Raw Scan Output</h3>
                          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {selectedScanResult.result.report.rawOutput}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* File Upload Vulnerability Check Results */}
                  {selectedScanResult.testId === 'file-upload-check' && selectedScanResult.result?.report?.json && (
                    <div className="space-y-6 pr-2">
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.json.aggregate_findings?.upload_allowed
                          ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                          : selectedScanResult.result.report.json.aggregate_findings?.upload_allowed === false
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                          : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Aggregate Findings</h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                            {selectedScanResult.result.report.json.aggregate_findings?.severity?.toUpperCase() || 'UNKNOWN'}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Upload Allowed:</span>
                            <span className="ml-2">{
                              selectedScanResult.result.report.json.aggregate_findings?.upload_allowed === true ? 'Yes' :
                              selectedScanResult.result.report.json.aggregate_findings?.upload_allowed === false ? 'No' : 'Unknown'
                            }</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Confidence:</span>
                            <span className="ml-2">{selectedScanResult.result.report.json.aggregate_findings?.confidence || 'low'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Evidence Count:</span>
                            <span className="ml-2">{selectedScanResult.result.report.json.aggregate_findings?.evidence?.length || 0}</span>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.json.aggregate_findings?.rationale}</p>
                      </div>

                      {/* Professional Client-Facing Summary */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Report</h3>
                        {(() => {
                          const j = selectedScanResult.result.report.json
                          const cmds = j.commands || []
                          const byLabel = (label) => cmds.find(c => (c.raw_label || '').includes(label) || (c.raw_label === label) || (c.id === label))
                          const upTest = byLabel('curl_upload_test') || byLabel('curl_upload_test.txt')
                          const upHarmless = byLabel('curl_upload_harmless') || byLabel('curl_upload_harmless.txt')
                          const head = byLabel('curl_head_candidate') || byLabel('curl_head_candidate.txt')
                          const etcp = byLabel('curl_upload_etcpasswd') || byLabel('curl_upload_etcpasswd.txt')
                          const status = (c) => c?.status_code ?? null
                          const ok = (c) => !!(status(c) && status(c) >= 200 && status(c) < 300)
                          const target = selectedScanResult.result.report.target || j.meta?.target
                          const uploadsUrl = target?.includes('/admin/upload') ? target.replace(/\/upload$/, '/uploads/harmless.php.txt') : (j.public_accessibility?.access_test_url || '')
                          const ts = j.meta?.generated_at_utc || new Date().toISOString()
                          const uploadAllowed = ok(upTest) || ok(upHarmless)
                          const publicAccess = ok(head)
                          const risk = j.aggregate_findings?.severity || 'unknown'
                          return (
                            <div className="space-y-4 text-sm text-gray-800 dark:text-gray-200">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div><span className="font-medium">Timestamp:</span> {ts}</div>
                                <div className="break-words"><span className="font-medium">Target:</span> {target || 'N/A'}</div>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Test Objective</div>
                                <div>Assess whether the upload endpoint correctly validates and stores files, and whether uploaded content is publicly accessible.</div>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Scope of Testing</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li className="break-words">Upload endpoint: {target || 'N/A'}</li>
                                  {uploadsUrl && (<li className="break-words">Candidate access URL: {uploadsUrl}</li>)}
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Commands Executed (summary)</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li>Basic upload with test.txt {ok(upTest) ? '(200 OK)' : ''}</li>
                                  <li>Disguised script upload harmless.php.txt {ok(upHarmless) ? '(200 OK)' : ''}</li>
                                  <li>Checked public accessibility of uploaded file (HEAD) {ok(head) ? '(200 OK)' : ''}</li>
                                  <li>Sensitive file upload attempt (/etc/passwd) {ok(etcp) ? '(200 OK)' : ''}</li>
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Results</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li>Upload (test.txt): {status(upTest) ?? 'N/A'}</li>
                                  <li>Upload (harmless.php.txt): {status(upHarmless) ?? 'N/A'}</li>
                                  <li>Public access (HEAD): {status(head) ?? 'N/A'}</li>
                                  <li>Upload (/etc/passwd): {status(etcp) ?? 'N/A'}</li>
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Proof of Evidence</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  {ok(upHarmless) && uploadsUrl && (<li className="break-words">Uploaded filename: harmless.php.txt → {uploadsUrl}</li>)}
                                  {status(upTest) && (<li>HTTP status (test.txt): {status(upTest)}</li>)}
                                  {status(upHarmless) && (<li>HTTP status (harmless.php.txt): {status(upHarmless)}</li>)}
                                  {status(head) && (<li>HTTP status (HEAD): {status(head)}</li>)}
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Vulnerability Status</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li>File upload allowed: {uploadAllowed ? 'Yes' : 'No/Unknown'}</li>
                                  <li>Malicious file upload possible: {ok(upHarmless) ? 'Yes (disguised script accepted)' : 'Unclear'}</li>
                                  <li>Public file access allowed: {publicAccess ? 'Yes' : 'No/Unknown'}</li>
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Risk Level</div>
                                <div className="capitalize">{risk}</div>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Compliance Impact (indicative)</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li>OWASP A05:2021 – Security Misconfiguration</li>
                                  <li>OWASP A08:2021 – Software and Data Integrity Failures</li>
                                </ul>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Recommendations</div>
                                <ul className="list-disc ml-5 space-y-0.5">
                                  <li>Restrict allowed file types; block executable/script formats</li>
                                  <li>Validate MIME type and file signatures server-side</li>
                                  <li>Store uploads outside webroot; disable direct access</li>
                                  <li>Randomize filenames and enforce access control</li>
                                </ul>
                              </div>
                            </div>
                          )
                        })()}
                      </div>

                      {/* Commands intentionally hidden per request */}

                      {/* External recommendations block removed to avoid duplication */}

                      {/* Full JSON intentionally hidden per request */}
                    </div>
                  )}

                  {/* CT Log Subdomain Discovery Results */}
                  {/* Quick Fingerprint Results */}
                  {selectedScanResult.testId === 'quick-fingerprint' && selectedScanResult.result?.report?.summary && (
                        <div className="space-y-6 pr-2">
                          <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Quick Fingerprint Summary</h3>
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                selectedScanResult.result.report.summary.severity_hint === 'High' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                selectedScanResult.result.report.summary.severity_hint === 'Medium' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                              }`}>
                                {selectedScanResult.result.report.summary.severity_hint || 'Informational'}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Target URL:</span>
                                <div className="mt-1 text-gray-900 dark:text-gray-100 break-all">
                                  {selectedScanResult.result.report.summary.target_url || 'N/A'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Status Code:</span>
                                <span className="ml-2 text-gray-900 dark:text-gray-100 font-semibold">
                                  {selectedScanResult.result.report.summary.status_code || 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Title:</span>
                                <div className="mt-1 text-gray-900 dark:text-gray-100">
                                  {selectedScanResult.result.report.summary.title || 'N/A'}
                                </div>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">IP Address:</span>
                                <div className="mt-1 text-gray-900 dark:text-gray-100">
                                  {selectedScanResult.result.report.summary.ip || 'N/A'}
                                </div>
                              </div>
                              {selectedScanResult.result.report.summary.country && (
                                <div>
                                  <span className="font-medium text-gray-700 dark:text-gray-300">Country:</span>
                                  <div className="mt-1 text-gray-900 dark:text-gray-100">
                                    {selectedScanResult.result.report.summary.country}
                                  </div>
                                </div>
                              )}
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Plugins Detected:</span>
                                <span className="ml-2 text-gray-900 dark:text-gray-100 font-semibold">
                                  {selectedScanResult.result.report.summary.plugins?.length || 0}
                                </span>
                              </div>
                            </div>
                            
                            {selectedScanResult.result.report.summary.summary && (
                              <div className="mt-4">
                                <span className="font-medium text-gray-700 dark:text-gray-300">Summary:</span>
                                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.summary.summary}</p>
                              </div>
                            )}
                          </div>

                          {selectedScanResult.result.report.summary.plugins && selectedScanResult.result.report.summary.plugins.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Detected Plugins</h3>
                              <div className="space-y-3">
                                {selectedScanResult.result.report.summary.plugins.map((plugin, idx) => (
                                  <div key={idx} className="border border-gray-200 dark:border-slate-600 rounded-lg p-4 bg-gray-50 dark:bg-slate-700">
                                    <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">{plugin.name || 'Unknown'}</div>
                                    {plugin.description && (
                                      <p className="text-sm text-gray-600 dark:text-gray-400">{plugin.description}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedScanResult.result.report.summary.http_headers && Object.keys(selectedScanResult.result.report.summary.http_headers).length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">HTTP Headers</h3>
                              <div className="space-y-2">
                                {Object.entries(selectedScanResult.result.report.summary.http_headers).map(([header, value], idx) => (
                                  <div key={idx} className="border-b border-gray-200 dark:border-slate-600 pb-2">
                                    <div className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">{header}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 break-all mt-1">{value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedScanResult.result.report.summary.recommendation && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-6 border border-yellow-200 dark:border-yellow-800">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Recommendations</h3>
                              <p className="text-sm text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.summary.recommendation}</p>
                            </div>
                          )}

                          {/* Raw Command Output */}
                          {selectedScanResult.result.report.summary.raw_output && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                              <details>
                                <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                                  Raw Command Output
                                </summary>
                                <div className="px-6 pb-6">
                                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                    {selectedScanResult.result.report.summary.raw_output}
                                  </pre>
                                </div>
                              </details>
                            </div>
                          )}
                        </div>
                  )}

                  {/* SSL/TLS Analysis Results */}
                  {(selectedScanResult.testId === 'ssl-tls-analysis' || selectedScanResult.result?.report?.scanType === 'SSL/TLS Analysis') && selectedScanResult.result?.report && (
                    <div className="space-y-6 pr-2 min-w-0 max-w-full overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                      <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 overflow-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">SSL/TLS Certificate Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm min-w-0 max-w-full" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                          {selectedScanResult.result.report.certificateInfo?.subject && (
                            <div className="md:col-span-2 min-w-0" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Subject:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>{selectedScanResult.result.report.certificateInfo.subject}</div>
                              {selectedScanResult.result.report.certificateInfo?.subjectFull && typeof selectedScanResult.result.report.certificateInfo.subjectFull === 'object' && (
                                <details className="mt-2">
                                  <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">View detailed subject information</summary>
                                  <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-700 rounded text-xs font-mono space-y-1">
                                    {Object.entries(selectedScanResult.result.report.certificateInfo.subjectFull).map(([key, value]) => (
                                      <div key={key} className="flex">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300 w-32">{key}:</span>
                                        <span className="text-gray-900 dark:text-gray-100 flex-1">{String(value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.issuer && (
                            <div className="md:col-span-2 min-w-0" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Issuer:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%' }}>{selectedScanResult.result.report.certificateInfo.issuer}</div>
                              {selectedScanResult.result.report.certificateInfo?.issuerFull && typeof selectedScanResult.result.report.certificateInfo.issuerFull === 'object' && (
                                <details className="mt-2">
                                  <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">View detailed issuer information</summary>
                                  <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-700 rounded text-xs font-mono space-y-1">
                                    {Object.entries(selectedScanResult.result.report.certificateInfo.issuerFull).map(([key, value]) => (
                                      <div key={key} className="flex">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300 w-32">{key}:</span>
                                        <span className="text-gray-900 dark:text-gray-100 flex-1">{String(value)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.serialNumber && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Serial Number:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 font-mono text-xs">{selectedScanResult.result.report.certificateInfo.serialNumber}</div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.version && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Version:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.version}</div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.signatureAlgorithm && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Signature Algorithm:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">
                                {typeof selectedScanResult.result.report.certificateInfo.signatureAlgorithm === 'object' 
                                  ? (selectedScanResult.result.report.certificateInfo.signatureAlgorithm.algorithm || JSON.stringify(selectedScanResult.result.report.certificateInfo.signatureAlgorithm, null, 2))
                                  : String(selectedScanResult.result.report.certificateInfo.signatureAlgorithm)}
                              </div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.publicKeyAlgorithm && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Public Key Algorithm:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">
                                {typeof selectedScanResult.result.report.certificateInfo.publicKeyAlgorithm === 'object' 
                                  ? (selectedScanResult.result.report.certificateInfo.publicKeyAlgorithm.algorithm || JSON.stringify(selectedScanResult.result.report.certificateInfo.publicKeyAlgorithm, null, 2))
                                  : String(selectedScanResult.result.report.certificateInfo.publicKeyAlgorithm)}
                              </div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.publicKeyBits && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Public Key Bits:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.publicKeyBits}</div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.validityNotBefore && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Valid From:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.validityNotBefore}</div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.validityNotAfter && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Valid To:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.certificateInfo.validityNotAfter}</div>
                            </div>
                          )}
                          {selectedScanResult.result.report.certificateInfo?.status && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                              <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                selectedScanResult.result.report.certificateInfo.status === 'Valid' 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              }`}>
                                {selectedScanResult.result.report.certificateInfo.status}
                              </span>
                            </div>
                          )}
                        </div>
                        {selectedScanResult.result.report.subjectAlternativeNames && (
                          <div className="mt-4">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Subject Alternative Names:</span>
                            <div className="mt-2 space-y-1">
                              {Array.isArray(selectedScanResult.result.report.subjectAlternativeNames) 
                                ? selectedScanResult.result.report.subjectAlternativeNames.map((san, idx) => (
                                    <div key={idx} className="text-sm text-gray-600 dark:text-gray-400 font-mono">{san}</div>
                                  ))
                                : <div className="text-sm text-gray-600 dark:text-gray-400 font-mono">{selectedScanResult.result.report.subjectAlternativeNames}</div>
                              }
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                          <details>
                            <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                              Raw Certificate JSON Output
                            </summary>
                            <div className="px-6 pb-6">
                              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                {JSON.stringify(selectedScanResult.result.report.certificateJson || {}, null, 2)}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Security Headers Results */}
                  {(selectedScanResult.testId === 'security-headers' || selectedScanResult.result?.report?.scanType === 'Security Headers') && selectedScanResult.result?.report && (
                    <div className="space-y-6 pr-2">
                      <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Headers Analysis</h3>
                        {selectedScanResult.result.report.headersJson && Object.keys(selectedScanResult.result.report.headersJson).length > 0 ? (
                          <div className="space-y-3">
                            {Object.entries(selectedScanResult.result.report.headersJson).map(([header, value]) => (
                              <div key={header} className="border-b border-gray-200 dark:border-slate-600 pb-2">
                                <div className="font-mono text-sm font-medium text-gray-700 dark:text-gray-300">{header}</div>
                                <div className="text-sm text-gray-600 dark:text-gray-400 break-all mt-1">{value}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600 dark:text-gray-400">No headers found</p>
                        )}
                        {selectedScanResult.result.report.missingHeaders && selectedScanResult.result.report.missingHeaders.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
                            <h4 className="font-medium text-red-700 dark:text-red-300 mb-2">Missing Security Headers:</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-red-600 dark:text-red-400">
                              {selectedScanResult.result.report.missingHeaders.map((header, idx) => (
                                <li key={idx}>{header}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                          <details>
                            <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                              Raw Headers JSON Output
                            </summary>
                            <div className="px-6 pb-6">
                              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                {selectedScanResult.result.report.rawOutput}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )}


                  {/* CMS Detection Results */}
                  {(selectedScanResult.testId === 'cms-detection' || selectedScanResult.result?.report?.scanType === 'CMS Detection') && selectedScanResult.result?.report && (
                    <div className="space-y-6 pr-2">
                      <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">CMS Detection Results</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
                          {selectedScanResult.result.report.cms && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">CMS Detected:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 font-semibold">
                                {selectedScanResult.result.report.cms}
                                {selectedScanResult.result.report.framework && ` (${selectedScanResult.result.report.framework})`}
                              </div>
                            </div>
                          )}
                          {selectedScanResult.result.report.server && (
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Web Server:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.server}</div>
                            </div>
                          )}
                        </div>
                        {selectedScanResult.result.report.parsedData && (
                          <div className="space-y-3">
                            {selectedScanResult.result.report.parsedData.cms && selectedScanResult.result.report.parsedData.cms.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Detected CMS Platforms:</h4>
                                <div className="space-y-1">
                                  {selectedScanResult.result.report.parsedData.cms.map((cms, idx) => (
                                    <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                      {cms.name} {cms.version !== 'Unknown' ? `(${cms.version})` : ''}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedScanResult.result.report.parsedData.servers && selectedScanResult.result.report.parsedData.servers.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Web Servers:</h4>
                                <div className="space-y-1">
                                  {selectedScanResult.result.report.parsedData.servers.map((server, idx) => (
                                    <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">{server}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedScanResult.result.report.parsedData.technologies && selectedScanResult.result.report.parsedData.technologies.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Technologies Detected:</h4>
                                <div className="space-y-1">
                                  {selectedScanResult.result.report.parsedData.technologies.map((tech, idx) => (
                                    <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">
                                      {tech.name} {tech.version !== 'Unknown' ? `(${tech.version})` : ''}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {selectedScanResult.result.report.parsedData.plugins && selectedScanResult.result.report.parsedData.plugins.length > 0 && (
                              <div>
                                <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Plugins Detected:</h4>
                                <div className="space-y-1">
                                  {selectedScanResult.result.report.parsedData.plugins.map((plugin, idx) => (
                                    <div key={idx} className="text-sm text-gray-600 dark:text-gray-400">{plugin}</div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                          <details>
                            <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                              Raw wig Output
                            </summary>
                            <div className="px-6 pb-6">
                              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                {selectedScanResult.result.report.rawOutput}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subdomain Enumeration Results */}
                  {(selectedScanResult.testId === 'subdomain-enumeration' || selectedScanResult.result?.report?.scanType === 'Subdomain Enumeration') && selectedScanResult.result?.report && (
                    <div className="space-y-6 pr-2">
                      <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Subdomain Enumeration Results</h3>
                          <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                            {selectedScanResult.result.report.count || 0} Subdomains Found
                          </span>
                        </div>
                        {selectedScanResult.result.report.subdomainsFound && selectedScanResult.result.report.subdomainsFound.length > 0 ? (
                          <div className="mb-4">
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Discovered Subdomains:</h4>
                            <div className="space-y-2">
                              {selectedScanResult.result.report.subdomainsFound.map((subdomain, idx) => {
                                // Find matching amass data entry
                                const amassEntry = selectedScanResult.result.report.amassData?.find(entry => entry.name === subdomain)
                                return (
                                  <div key={idx} className="bg-white dark:bg-slate-700 rounded-lg p-3 border border-gray-200 dark:border-slate-600">
                                    <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 break-all">
                                      {subdomain}
                                    </div>
                                    {amassEntry && (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
                                        {amassEntry.addresses && amassEntry.addresses.length > 0 && (
                                          <div>
                                            <span className="font-medium">IP:</span> {amassEntry.addresses.map(addr => addr.ip || addr).join(', ')}
                                          </div>
                                        )}
                                        {amassEntry.cidr && (
                                          <div>
                                            <span className="font-medium">CIDR:</span> {amassEntry.cidr}
                                          </div>
                                        )}
                                        {amassEntry.description && (
                                          <div>
                                            <span className="font-medium">Description:</span> {amassEntry.description}
                                          </div>
                                        )}
                                        {amassEntry.asn && (
                                          <div>
                                            <span className="font-medium">ASN:</span> {amassEntry.asn}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600 dark:text-gray-400">No subdomains found</p>
                        )}
                        {selectedScanResult.result.report.amassData && selectedScanResult.result.report.amassData.length > 0 && (
                          <div className="mt-4">
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Detailed Amass Data:</h4>
                            <div className="bg-white dark:bg-slate-700 rounded p-3 max-h-96 overflow-y-auto">
                              <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                {JSON.stringify(selectedScanResult.result.report.amassData, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                          <details>
                            <summary className="text-lg font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700">
                              Raw amass JSON Output
                            </summary>
                            <div className="px-6 pb-6">
                              <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                                {selectedScanResult.result.report.rawOutput}
                              </pre>
                            </div>
                          </details>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedScanResult.testId === 'ct-log-subdomain-discovery' && selectedScanResult.result?.report?.summary && (
                        <div className="space-y-6 pr-2">
                          <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Certificate Transparency Log Summary</h3>
                              <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                                {selectedScanResult.result.report.summary.status || 'Completed'}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4">
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Total Certificates:</span>
                                <span className="ml-2 text-gray-900 dark:text-gray-100 font-semibold">
                                  {selectedScanResult.result.report.summary.certificates?.length || 0}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Unique Subdomains:</span>
                                <span className="ml-2 text-gray-900 dark:text-gray-100 font-semibold">
                                  {selectedScanResult.result.report.summary.unique_subdomains?.length || 0}
                                </span>
                              </div>
                              <div>
                                <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                                <span className="ml-2 text-gray-900 dark:text-gray-100">
                                  {selectedScanResult.result.report.summary.status || 'Completed'}
                                </span>
                              </div>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{selectedScanResult.result.report.summary.evidence}</p>
                          </div>

                          {selectedScanResult.result.report.summary.unique_subdomains && selectedScanResult.result.report.summary.unique_subdomains.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Unique Subdomains</h3>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {selectedScanResult.result.report.summary.unique_subdomains.map((subdomain, idx) => (
                                  <div key={idx} className="bg-gray-50 dark:bg-slate-700 rounded px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                    {subdomain}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Discovered Certificates</h3>
                            {selectedScanResult.result.report.summary.certificates && selectedScanResult.result.report.summary.certificates.length > 0 ? (
                              <div className="space-y-4">
                                {selectedScanResult.result.report.summary.certificates.map((cert, idx) => (
                                  <div key={idx} className="border border-gray-200 dark:border-slate-600 rounded-lg p-4 bg-gray-50 dark:bg-slate-700">
                                    <div className="space-y-2 text-sm">
                                      <div>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">Name Value:</span>
                                        <div className="mt-1 text-gray-900 dark:text-gray-100 break-words font-mono text-xs bg-white dark:bg-slate-800 p-2 rounded">
                                          {cert.name_value || 'N/A'}
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">Serial Number:</span>
                                          <div className="mt-1 text-gray-900 dark:text-gray-100 break-all font-mono text-xs">
                                            {cert.serial_number || 'N/A'}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">Entry Timestamp:</span>
                                          <div className="mt-1 text-gray-900 dark:text-gray-100">
                                            {cert.entry_timestamp || 'N/A'}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">Not Before:</span>
                                          <div className="mt-1 text-gray-900 dark:text-gray-100">
                                            {cert.not_before || 'N/A'}
                                          </div>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">Not After:</span>
                                          <div className="mt-1 text-gray-900 dark:text-gray-100">
                                            {cert.not_after || 'N/A'}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-600 dark:text-gray-400">No certificates found.</p>
                            )}
                          </div>
                        </div>
                  )}

                  {/* CSRF Scan Results */}
                  {/* WAF Detection Results */}
                  {selectedScanResult.testId === 'waf-detection' && selectedScanResult.result?.report && (
                  <div className="space-y-6">
                      {/* WAF Detection Summary */}
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.summary?.wafDetected
                          ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                          : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">WAF Detection Summary</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selectedScanResult.result.report.summary?.wafDetected
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                              : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {selectedScanResult.result.report.summary?.wafDetected ? 'WAF Detected' : 'No WAF Detected'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          {selectedScanResult.result.report.summary?.wafType && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">WAF Type</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100 font-semibold">
                                {selectedScanResult.result.report.summary.wafType}
                              </p>
                            </div>
                          )}
                          {selectedScanResult.result.report.summary?.wafVendor && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vendor</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                {selectedScanResult.result.report.summary.wafVendor}
                              </p>
                            </div>
                          )}
                          {selectedScanResult.result.report.summary?.numberOfRequests && (
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Requests Made</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">
                                {selectedScanResult.result.report.summary.numberOfRequests}
                              </p>
                            </div>
                          )}
                        </div>

                        {selectedScanResult.result.report.details?.wafInfo && (
                          <div className="bg-white dark:bg-slate-700 rounded p-4 mt-4">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {selectedScanResult.result.report.details.wafInfo}
                            </p>
                          </div>
                        )}

                        {selectedScanResult.result.report.details?.reason && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded p-4 mt-4 border-l-4 border-yellow-500">
                            <p className="text-xs font-medium text-yellow-900 dark:text-yellow-200 mb-1">Detection Reason</p>
                            <p className="text-sm text-yellow-800 dark:text-yellow-300">
                              {selectedScanResult.result.report.details.reason}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Raw Output */}
                      {selectedScanResult.result.report.rawOutput && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Raw wafw00f Output</h3>
                          <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
                            <pre className="text-xs text-gray-100 font-mono whitespace-pre-wrap">
                              {selectedScanResult.result.report.rawOutput}
                            </pre>
                          </div>
                        </div>
                      )}
                  </div>
                  )}

                  {(selectedScanResult.result.report.scanType === 'Cross-Site Request Forgery (CSRF) Testing' || selectedScanResult.result.report.scanType === 'CSRF Test') && (
                    <div className="space-y-6">
                      {/* CSRF Summary */}
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.csrfVulnerability === 'Potential Vulnerability'
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                          : selectedScanResult.result.report.csrfVulnerability === 'Protected'
                          ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                          : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">CSRF Test Results</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selectedScanResult.result.report.csrfVulnerability === 'Potential Vulnerability'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : selectedScanResult.result.report.csrfVulnerability === 'Protected'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                          }`}>
                            {selectedScanResult.result.report.csrfVulnerability || 'UNKNOWN'}
                          </span>
                        </div>
                        {selectedScanResult.result.report.summary && (
                          <div className="mb-4">
                            {typeof selectedScanResult.result.report.summary === 'string' ? (
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {selectedScanResult.result.report.summary}
                              </p>
                            ) : selectedScanResult.result.report.summary && typeof selectedScanResult.result.report.summary === 'object' ? (
                              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                                {selectedScanResult.result.report.summary.status && (
                                  <p><span className="font-medium">Status:</span> {String(selectedScanResult.result.report.summary.status)}</p>
                                )}
                                {selectedScanResult.result.report.summary.vulnerabilities_found !== undefined && (
                                  <p><span className="font-medium">Vulnerabilities Found:</span> {selectedScanResult.result.report.summary.vulnerabilities_found}</p>
                                )}
                                {selectedScanResult.result.report.summary.reflected_parameters !== undefined && (
                                  <p><span className="font-medium">Reflected Parameters:</span> {Array.isArray(selectedScanResult.result.report.summary.reflected_parameters) ? selectedScanResult.result.report.summary.reflected_parameters.length : 0}</p>
                                )}
                                {selectedScanResult.result.report.summary.hasOriginCheck !== undefined && (
                                  <p><span className="font-medium">Origin Check:</span> {selectedScanResult.result.report.summary.hasOriginCheck ? 'Yes' : 'No'}</p>
                                )}
                                {selectedScanResult.result.report.summary.hasRefererCheck !== undefined && (
                                  <p><span className="font-medium">Referer Check:</span> {selectedScanResult.result.report.summary.hasRefererCheck ? 'Yes' : 'No'}</p>
                                )}
                                {selectedScanResult.result.report.summary.hasCSRFToken !== undefined && (
                                  <p><span className="font-medium">CSRF Token:</span> {selectedScanResult.result.report.summary.hasCSRFToken ? 'Yes' : 'No'}</p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        )}
                        
                        {/* HTTP Status */}
                        {selectedScanResult.result.report.httpStatusCode && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">HTTP Status:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.httpStatusCode}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Method:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">POST</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Target:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.target}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Protection:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">
                                {selectedScanResult.result.report.csrfVulnerability === 'Protected' ? 'Detected' : 'Not Detected'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Response Headers */}
                      {selectedScanResult.result.report.responseHeaders && Object.keys(selectedScanResult.result.report.responseHeaders).length > 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Response Headers</h3>
                          <div className="space-y-2">
                            {Object.entries(selectedScanResult.result.report.responseHeaders).map(([key, value]) => (
                              <div key={key} className="flex justify-between items-start py-2 border-b border-gray-100 dark:border-slate-700 last:border-b-0">
                                <span className="font-medium text-gray-700 dark:text-gray-300 text-sm">{key}:</span>
                                <span className="text-gray-600 dark:text-gray-400 text-sm ml-4 text-right break-all">{value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CSRF Protection Analysis */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">CSRF Protection Analysis</h3>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <span className="font-medium text-gray-700 dark:text-gray-300">CSRF Tokens</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              selectedScanResult.result.report.responseHeaders?.['x-csrf-token'] || selectedScanResult.result.report.responseHeaders?.['csrf-token']
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            }`}>
                              {selectedScanResult.result.report.responseHeaders?.['x-csrf-token'] || selectedScanResult.result.report.responseHeaders?.['csrf-token'] ? 'Present' : 'Missing'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <span className="font-medium text-gray-700 dark:text-gray-300">SameSite Cookies</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              selectedScanResult.result.report.responseHeaders?.['set-cookie']?.includes('SameSite')
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                            }`}>
                              {selectedScanResult.result.report.responseHeaders?.['set-cookie']?.includes('SameSite') ? 'Present' : 'Missing'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Origin Validation</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              selectedScanResult.result.report.responseHeaders?.['access-control-allow-origin']
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                            }`}>
                              {selectedScanResult.result.report.responseHeaders?.['access-control-allow-origin'] ? 'Configured' : 'Not Configured'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* XSS Scan Results */}
                  {(selectedScanResult.result.report.scanType === 'Cross-Site Scripting (XSS) Testing' || selectedScanResult.result.report.scanType === 'XSS Test') && (
                    <div className="space-y-6">
                      {/* XSS Summary */}
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.vulnerabilities_found > 0
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                          : selectedScanResult.result.report.reflected_parameters && selectedScanResult.result.report.reflected_parameters.length > 0
                          ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                          : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">XSS Test Results</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selectedScanResult.result.report.vulnerabilities_found > 0
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : selectedScanResult.result.report.reflected_parameters && selectedScanResult.result.report.reflected_parameters.length > 0
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {selectedScanResult.result.report.vulnerabilities_found > 0 ? 'VULNERABLE' : 
                             selectedScanResult.result.report.reflected_parameters && selectedScanResult.result.report.reflected_parameters.length > 0 ? 'REFLECTED' : 'SAFE'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {selectedScanResult.result.report.summary}
                        </p>
                        
                        {/* Scan Details */}
                        {selectedScanResult.result.report.scan_details && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Method:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.scan_details.method}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Workers:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.scan_details.performance}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Timeout:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.scan_details.timeout}s</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Fast Scan:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.scan_details.fast_scan ? 'Yes' : 'No'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Scan Statistics */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Statistics</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                              {selectedScanResult.result.report.parameters_tested || 0}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Parameters Tested</p>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                              {selectedScanResult.result.report.total_testing_points_found || 0}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Testing Points</p>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {selectedScanResult.result.report.vulnerabilities_found || 0}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Vulnerabilities</p>
                          </div>
                          <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                              {selectedScanResult.result.report.reflected_parameters ? selectedScanResult.result.report.reflected_parameters.length : 0}
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">Reflected Params</p>
                          </div>
                        </div>
                      </div>

                      {/* Vulnerabilities Found */}
                      {selectedScanResult.result.report.vulnerability_details && selectedScanResult.result.report.vulnerability_details.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6 border border-red-200 dark:border-red-800">
                          <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-4">Vulnerabilities Detected</h3>
                          <div className="space-y-4">
                            {selectedScanResult.result.report.vulnerability_details.map((vuln, idx) => (
                              <div key={idx} className="bg-red-100 dark:bg-red-900/30 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-mono text-sm font-medium text-red-800 dark:text-red-200">
                                    Parameter: {vuln.param}
                                  </span>
                                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    vuln.severity === 'High' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
                                    vuln.severity === 'Medium' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                                    'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                                  }`}>
                                    {vuln.severity}
                                  </span>
                                </div>
                                <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                                  <div><strong>Payload:</strong> <code className="bg-red-200 dark:bg-red-800 px-1 rounded">{vuln.payload}</code></div>
                                  <div><strong>CWE:</strong> {vuln.cwe}</div>
                                  <div><strong>Type:</strong> {vuln.inject_type}</div>
                                  <div><strong>Evidence:</strong> <code className="bg-red-200 dark:bg-red-800 px-1 rounded">{vuln.evidence}</code></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reflected Parameters */}
                      {selectedScanResult.result.report.reflected_parameters && selectedScanResult.result.report.reflected_parameters.length > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                          <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-4">Reflected Parameters</h3>
                          <p className="text-sm text-orange-700 dark:text-orange-300 mb-4">
                            These parameters are reflected in the response and should be monitored for potential XSS vulnerabilities.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedScanResult.result.report.reflected_parameters.map((param, idx) => (
                              <div key={idx} className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded text-sm font-mono text-orange-800 dark:text-orange-200">
                                {param}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content Type */}
                      {selectedScanResult.result.report.content_type && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Content Type</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">{selectedScanResult.result.report.content_type}</p>
                        </div>
                      )}

                      {/* Raw Output */}
                      {selectedScanResult.result.report.raw_output && (
                        <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Raw Scan Output</h3>
                          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {selectedScanResult.result.report.raw_output}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SQL Injection Scan Results */}
                  {(selectedScanResult.result.report.scanType === 'SQL Injection Test' || selectedScanResult.result.report.scanType === 'SQL Injection Scan') && (
                    <div className="space-y-6">
                      {/* SQL Injection Summary */}
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.vulnerability_found 
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' 
                          : selectedScanResult.result.report.http_errors && selectedScanResult.result.report.http_errors.length > 0
                          ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                          : 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                      }`}>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">SQL Injection Test Results</h3>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selectedScanResult.result.report.vulnerability_found 
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                              : selectedScanResult.result.report.http_errors && selectedScanResult.result.report.http_errors.length > 0
                              ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                          }`}>
                            {selectedScanResult.result.report.vulnerability_found ? 'VULNERABLE' : 
                             selectedScanResult.result.report.http_errors && selectedScanResult.result.report.http_errors.length > 0 ? 'PROTECTED' : 'SAFE'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {selectedScanResult.result.report.summary}
                        </p>

                        {/* Defensive Attack Note */}
                        <div className={`mt-4 p-4 rounded-lg border-l-4 ${
                          selectedScanResult.result.report.vulnerability_found
                            ? 'bg-red-100 dark:bg-red-900/30 border-red-500 dark:border-red-400'
                            : 'bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-400'
                        }`}>
                          <div className="flex items-start space-x-3">
                            <div className={`flex-shrink-0 mt-0.5 ${
                              selectedScanResult.result.report.vulnerability_found
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-green-600 dark:text-green-400'
                            }`}>
                              {selectedScanResult.result.report.vulnerability_found ? (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-semibold mb-2 ${
                                selectedScanResult.result.report.vulnerability_found
                                  ? 'text-red-900 dark:text-red-200'
                                  : 'text-green-900 dark:text-green-200'
                              }`}>
                                {selectedScanResult.result.report.vulnerability_found 
                                  ? '⚠️ Security Vulnerability Detected' 
                                  : '✅ Security Status: Safe'}
                              </h4>
                              <p className={`text-sm ${
                                selectedScanResult.result.report.vulnerability_found
                                  ? 'text-red-800 dark:text-red-300'
                                  : 'text-green-800 dark:text-green-300'
                              }`}>
                                {selectedScanResult.result.report.vulnerability_found ? (
                                  <>
                                    <strong>Defensive Attack Result:</strong> A defensive SQL injection attack was attempted against your application, and the attack <strong>succeeded</strong>. This means your application is <strong>NOT SAFE</strong> and is vulnerable to SQL injection attacks. An attacker could potentially access, modify, or delete data from your database. <strong>Immediate action is required to fix this vulnerability.</strong>
                                  </>
                                ) : (
                                  <>
                                    <strong>Defensive Attack Result:</strong> A defensive SQL injection attack was attempted against your application, and the attack <strong>did not succeed</strong>. This means your application is <strong>SAFE</strong> from SQL injection attacks. The defensive measures in place (such as parameterized queries, input validation, or WAF protection) successfully prevented the attack from succeeding.
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Test Details */}
                        {selectedScanResult.result.report.test_details && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Level:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.test_details.level}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Risk:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.test_details.risk}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Technique:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.test_details.technique}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Threads:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.test_details.threads}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Parameters Tested */}
                      {selectedScanResult.result.report.parameters_tested && selectedScanResult.result.report.parameters_tested.length > 0 && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Parameters Tested</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {selectedScanResult.result.report.parameters_tested.map((param, idx) => (
                              <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-700 rounded text-sm font-mono text-gray-600 dark:text-gray-400">
                                {param}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* HTTP Errors */}
                      {selectedScanResult.result.report.http_errors && selectedScanResult.result.report.http_errors.length > 0 && (
                        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                          <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-4">HTTP Errors Detected</h3>
                          <div className="space-y-2">
                            {selectedScanResult.result.report.http_errors.map((error, idx) => (
                              <div key={idx} className="flex items-center justify-between p-3 bg-orange-100 dark:bg-orange-900/30 rounded">
                                <span className="font-mono text-sm font-medium text-orange-800 dark:text-orange-200">
                                  HTTP {error.code}
                                </span>
                                <span className="text-sm text-orange-600 dark:text-orange-300">
                                  {error.description} - {error.count} times
                                </span>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-orange-700 dark:text-orange-300 mt-4">
                            These errors typically indicate server-side protection such as WAF or IP blocking.
                          </p>
                        </div>
                      )}

                      {/* Protection Detection */}
                      {selectedScanResult.result.report.protection_detected && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">Protection Mechanisms Detected</h3>
                          <p className="text-sm text-blue-700 dark:text-blue-300">
                            The server appears to be protected by WAF (Web Application Firewall) or similar security mechanisms.
                            This may have interfered with the SQL injection testing.
                          </p>
                        </div>
                      )}

                      {/* Database Information */}
                      {selectedScanResult.result.report.database_info && selectedScanResult.result.report.database_info.dbms && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Database Information</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Database Type</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.database_info.dbms}</p>
                            </div>
                            {selectedScanResult.result.report.database_info.version && (
                              <div>
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Version</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{selectedScanResult.result.report.database_info.version}</p>
                              </div>
                            )}
                            {selectedScanResult.result.report.database_info.databases && selectedScanResult.result.report.database_info.databases.length > 0 && (
                              <div className="md:col-span-2">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Accessible Databases</label>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {selectedScanResult.result.report.database_info.databases.map((db, idx) => (
                                    <span key={idx} className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400 rounded text-xs font-mono">
                                      {db}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Recommendations Section */}
                      <div className={`rounded-lg p-6 border ${
                        selectedScanResult.result.report.vulnerability_found
                          ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                          : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                      }`}>
                        <h3 className={`text-lg font-semibold mb-4 ${
                          selectedScanResult.result.report.vulnerability_found
                            ? 'text-red-900 dark:text-red-100'
                            : 'text-blue-900 dark:text-blue-100'
                        }`}>
                          {selectedScanResult.result.report.vulnerability_found 
                            ? '🔧 Immediate Action Required - Recommendations' 
                            : '💡 Security Best Practices & Recommendations'}
                        </h3>
                        <div className="space-y-3">
                          {selectedScanResult.result.report.vulnerability_found ? (
                            <>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">1.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Implement Parameterized Queries (Prepared Statements)</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Use prepared statements with parameter binding to prevent SQL injection. This is the most effective defense mechanism.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">2.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Enable Input Validation and Sanitization</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Validate and sanitize all user inputs before processing. Use whitelist validation where possible.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">3.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Implement Least Privilege Database Access</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Ensure database users have minimal required permissions. Avoid using database administrator accounts for application connections.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">4.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Deploy Web Application Firewall (WAF)</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Use a WAF to filter and block malicious SQL injection attempts at the network level.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">5.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Regular Security Audits and Penetration Testing</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Conduct regular security audits and penetration tests to identify and fix vulnerabilities before attackers can exploit them.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-red-600 dark:text-red-400 font-bold mt-1">6.</span>
                                <div>
                                  <p className="font-medium text-red-900 dark:text-red-200">Update and Patch Database Systems</p>
                                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">Keep your database management system and all related software updated with the latest security patches.</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex items-start space-x-2">
                                <span className="text-blue-600 dark:text-blue-400 font-bold mt-1">1.</span>
                                <div>
                                  <p className="font-medium text-blue-900 dark:text-blue-200">Continue Using Parameterized Queries</p>
                                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Maintain your current security practices. Continue using prepared statements for all database queries.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-blue-600 dark:text-blue-400 font-bold mt-1">2.</span>
                                <div>
                                  <p className="font-medium text-blue-900 dark:text-blue-200">Regular Security Monitoring</p>
                                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Continue monitoring for suspicious activities and maintain security logs for audit purposes.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-blue-600 dark:text-blue-400 font-bold mt-1">3.</span>
                                <div>
                                  <p className="font-medium text-blue-900 dark:text-blue-200">Keep Security Measures Updated</p>
                                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Regularly update your security tools, libraries, and frameworks to protect against newly discovered vulnerabilities.</p>
                                </div>
                              </div>
                              <div className="flex items-start space-x-2">
                                <span className="text-blue-600 dark:text-blue-400 font-bold mt-1">4.</span>
                                <div>
                                  <p className="font-medium text-blue-900 dark:text-blue-200">Implement Security Headers</p>
                                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">Ensure proper security headers are configured to provide additional layers of protection.</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        {selectedScanResult.result?.recommendations && selectedScanResult.result.recommendations.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                            <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Additional Recommendations:</h4>
                            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                              {selectedScanResult.result.recommendations.map((rec, idx) => (
                                <li key={idx}>{rec}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Raw Output */}
                      {selectedScanResult.result.report.raw_output && (
                        <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Raw Scan Output</h3>
                          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
                            {selectedScanResult.result.report.raw_output}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
              
              {/* Findings & Recommendations */}
              {selectedScanResult.result?.findings && selectedScanResult.result.findings.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Findings & Recommendations</h3>
                  <div className="space-y-3">
                    {selectedScanResult.result.findings.map((finding, idx) => {
                      // Ensure finding has required properties with defaults
                      const findingType = finding.type || 'info';
                      const findingMessage = finding.message || 'No message available';
                      
                      return (
                        <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                          findingType === 'critical' ? 'bg-red-50 border-red-400 dark:bg-red-900/10' :
                          findingType === 'high' ? 'bg-orange-50 border-orange-400 dark:bg-orange-900/10' :
                          findingType === 'medium' ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/10' :
                          findingType === 'low' ? 'bg-blue-50 border-blue-400 dark:bg-blue-900/10' :
                          'bg-green-50 border-green-400 dark:bg-green-900/10'
                        }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                findingType === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                findingType === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                findingType === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                findingType === 'low' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                                'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                              }`}>
                                {findingType.toUpperCase()}
                              </span>
                              <span className={`font-medium ${
                                findingType === 'critical' ? 'text-red-800 dark:text-red-300' :
                                findingType === 'high' ? 'text-orange-800 dark:text-orange-300' :
                                findingType === 'medium' ? 'text-yellow-800 dark:text-yellow-300' :
                                findingType === 'low' ? 'text-blue-800 dark:text-blue-300' :
                                'text-green-800 dark:text-green-300'
                              }`}>
                                {typeof findingMessage === 'object' 
                                  ? JSON.stringify(findingMessage, null, 2)
                                  : findingMessage
                                }
                              </span>
                            </div>
                            {finding.details && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 ml-4">
                                {typeof finding.details === 'object' 
                                  ? JSON.stringify(finding.details, null, 2)
                                  : finding.details
                                }
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Issues & Recommendations from Report */}
              {selectedScanResult.result?.report?.issues && selectedScanResult.result.report.issues.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Issues</h3>
                  <div className="space-y-3">
                    {selectedScanResult.result.report.issues.map((issue, idx) => (
                      <div key={idx} className={`p-4 rounded-lg border-l-4 ${
                        selectedScanResult.result.report.riskLevel === 'Critical' ? 'bg-red-50 border-red-400 dark:bg-red-900/10' :
                        selectedScanResult.result.report.riskLevel === 'High' ? 'bg-orange-50 border-orange-400 dark:bg-orange-900/10' :
                        selectedScanResult.result.report.riskLevel === 'Medium' ? 'bg-yellow-50 border-yellow-400 dark:bg-yellow-900/10' :
                        'bg-blue-50 border-blue-400 dark:bg-blue-900/10'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                              {issue.description || issue.header || issue.port || 'Security Issue'}
                            </h4>
                            {issue.risk && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                {issue.risk}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations from Report */}
              {selectedScanResult.result?.report?.recommendations && selectedScanResult.result.report.recommendations.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recommendations</h3>
                  <ul className="space-y-2">
                    {selectedScanResult.result.report.recommendations.map((recommendation, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {selectedScanResult.result?.recommendations && selectedScanResult.result.recommendations.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Recommendations</h3>
                  <ul className="space-y-2">
                    {selectedScanResult.result.recommendations.map((recommendation, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span className="text-sm text-gray-700 dark:text-gray-300">{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Help Dialog */}
      <HelpDialog isOpen={showHelpDialog} onClose={() => setShowHelpDialog(false)} />
    </div>
  )
}

export default ComprehensiveSecurityScanner;

