import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import FrameworkDetector from '../scanners/framework-detection'
import ToolInstaller from './ToolInstaller'
import WslPasswordPrompt from './WslPasswordPrompt'
import ToolInstallationDialog from './ToolInstallationDialog'
import { ensureToolsInstalled, checkAllTools } from '../utils/toolChecker'
import { hasSecurePassword } from '../utils/securePasswordStorage'

const ComprehensiveSecurityScanner = () => {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [targetUrl, setTargetUrl] = useState('')
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
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)
  const scanTimeoutRef = useRef(null)

  // Define security tests - all visible in UI, but only File Upload Vulnerability Check runs
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
    }
  ]

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Check for stored password and tools on component mount
  useEffect(() => {
    const checkInitialState = async () => {
      try {
        console.log('🔍 [COMPREHENSIVE-SCANNER] Checking initial state...')
        
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

  // Set up auto-scan listener
  useEffect(() => {
    const handleAutoScan = () => {
      console.log('🚀 [COMPREHENSIVE-SCANNER] Auto-scan triggered!')
      if (targetUrl.trim() && !isScanning) {
        console.log('🚀 [COMPREHENSIVE-SCANNER] Starting auto-scan for:', targetUrl)
        startScan()
      } else if (!targetUrl.trim()) {
        console.log('⚠️ [COMPREHENSIVE-SCANNER] Auto-scan triggered but no target URL set')
        showError('Please enter a target URL first')
      } else if (isScanning) {
        console.log('⚠️ [COMPREHENSIVE-SCANNER] Auto-scan triggered but scan already running')
      }
    }

    // Listen for auto-scan events from main process
    if (window.cyberGuard && window.cyberGuard.onScanAutoStart) {
      window.cyberGuard.onScanAutoStart(handleAutoScan)
    }

    return () => {
      // Cleanup listener
    }
  }, [targetUrl, isScanning])

  // Format time helper
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // Format date time helper
  const formatDateTime = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  }

  // Parse wafw00f output to JSON
  const parseWafw00f = (stdout = '') => {
    const stripAnsi = (s = '') => (s || '').replace(/\x1b\[[0-9;]*m/g, '')
    const clean = stripAnsi(stdout)
    const result = {
      tool: 'wafw00f',
      detected: false,
      wafType: null,
      wafVendor: null,
      wafInfo: null,
      reason: null,
      responseCode: null,
      numberOfRequests: null,
      raw: clean
    }

    // Pattern 1: Specific WAF detected (e.g., "is behind Cloudflare (Cloudflare Inc.) WAF")
    const wafDetectedPattern = /is behind (.+?)(?:\s*\(([^)]+)\))?\s*WAF/i
    const detectedMatch = clean.match(wafDetectedPattern)
    
    if (detectedMatch) {
      result.detected = true
      result.wafType = stripAnsi(detectedMatch[1]?.trim() || '') || null
      result.wafVendor = stripAnsi(detectedMatch[2]?.trim() || detectedMatch[1]?.trim() || '') || null
      result.wafInfo = `The site is behind ${result.wafType}${result.wafVendor && result.wafVendor !== result.wafType ? ` (${result.wafVendor})` : ''} WAF`
    }
    
    // Pattern 2: Generic detection
    const genericPattern = /seems to be behind (?:a )?WAF|behind (?:a )?WAF or|Generic Detection results/i
    if (!result.detected && genericPattern.test(clean)) {
      result.detected = true
      result.wafType = 'Generic/Unknown'
      result.wafInfo = 'The site seems to be behind a WAF or some sort of security solution'
    }
    
    // Extract reason for generic detection
    const reasonMatch = clean.match(/Reason:\s*(.+?)(?:\n|$)/i)
    if (reasonMatch) {
      result.reason = stripAnsi(reasonMatch[1]?.trim() || '') || null
      
      // Try to extract response codes from reason
      const responseCodeMatch = result.reason.match(/response code (?:is|to) "?(\d+)"?/i)
      if (responseCodeMatch) {
        result.responseCode = responseCodeMatch[1]
      }
    }
    
    // Extract number of requests
    const requestsMatch = clean.match(/Number of requests:\s*(\d+)/i)
    if (requestsMatch) {
      result.numberOfRequests = parseInt(requestsMatch[1], 10)
    }
    
    // Extract target URL if present
    const targetMatch = clean.match(/Checking (.+)/i)
    if (targetMatch) {
      result.target = stripAnsi(targetMatch[1]?.trim() || '') || null
    }
    
    return result
  }

  // Run WAF Detection scan
  const runWAFDetection = async () => {
    try {
      setCurrentTest({ id: 'waf-detection', name: 'WAF (Firewall) Detection' })
      setTestProgress(prev => ({ ...prev, 'waf-detection': 10 }))
      
      // Check if wafw00f is installed
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: '🔍 Checking for wafw00f tool...',
        testId: 'waf-detection',
        type: 'info'
      }])
      
      const checkCmd = 'command -v wafw00f >/dev/null 2>&1 && echo OK || echo MISSING'
      let checkRes = null
      
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        checkRes = await window.cyberGuard.runAsRoot({ command: checkCmd, requireConfirm: false })
      }
      
      const isInstalled = checkRes?.stdout?.includes('OK')
      
      if (!isInstalled) {
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '📦 wafw00f not found, installing...',
          testId: 'waf-detection',
          type: 'info'
        }])
        
        setTestProgress(prev => ({ ...prev, 'waf-detection': 20 }))
        
        // Install wafw00f via pip
        const pipCmd = 'export DEBIAN_FRONTEND=noninteractive; pip3 install wafw00f 2>&1 || pip install wafw00f 2>&1'
        if (window.cyberGuard && window.cyberGuard.runAsRoot) {
          await window.cyberGuard.runAsRoot({ command: pipCmd, requireConfirm: false })
        }
        
        setTestProgress(prev => ({ ...prev, 'waf-detection': 40 }))
      }
      
      // Run wafw00f
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `🔍 Running wafw00f on ${targetUrl}...`,
        testId: 'waf-detection',
        type: 'info'
      }])
      
      setTestProgress(prev => ({ ...prev, 'waf-detection': 50 }))
      
      const wafCmd = `wafw00f ${targetUrl}`
      let wafResult = null
      
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        wafResult = await window.cyberGuard.runAsRoot({ command: wafCmd, requireConfirm: false })
      }
      
      setTestProgress(prev => ({ ...prev, 'waf-detection': 80 }))
      
      // Parse results
      const parsedResults = parseWafw00f(wafResult?.stdout || '')
      
      const wafReport = {
        testId: 'waf-detection',
        testName: 'WAF (Firewall) Detection',
        category: 'Web Security',
        severity: 'high',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: parsedResults.detected ? [
          {
            type: 'info',
            message: `WAF Detected: ${parsedResults.wafType || 'Generic/Unknown'}`,
            details: parsedResults.wafInfo || 'WAF detected but type could not be identified'
          }
        ] : [
          {
            type: 'info',
            message: 'No WAF Detected',
            details: 'No Web Application Firewall detected. The target appears to be unprotected or using an undetected WAF solution.'
          }
        ],
        recommendations: parsedResults.detected ? [
          'Verify WAF configuration is appropriate for your security needs',
          'Ensure WAF rules are properly tuned',
          'Monitor WAF logs for false positives'
        ] : [
          'Consider implementing a Web Application Firewall for additional protection',
          'Review your current security posture',
          'Implement security headers and other protection mechanisms'
        ],
        report: {
          scanType: 'WAF (Firewall) Detection',
          target: targetUrl,
          summary: {
            wafDetected: parsedResults.detected,
            wafType: parsedResults.wafType,
            wafVendor: parsedResults.wafVendor,
            numberOfRequests: parsedResults.numberOfRequests,
            responseCode: parsedResults.responseCode
          },
          details: parsedResults,
          rawOutput: parsedResults.raw || wafResult?.stdout || ''
        }
      }
      
      setTestProgress(prev => ({ ...prev, 'waf-detection': 100 }))
      setScanResults(prev => ({ ...prev, 'waf-detection': wafReport }))
      setNewScanResults(prev => ({ ...prev, 'waf-detection': wafReport }))
      setCompletedTests(prev => new Set([...prev, 'waf-detection']))
      
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `✅ WAF Detection completed - ${parsedResults.detected ? `WAF Detected: ${parsedResults.wafType || 'Generic/Unknown'}` : 'No WAF Detected'}`,
        testId: 'waf-detection',
        type: 'success'
      }])
      
    } catch (error) {
      console.error('WAF Detection error:', error)
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `❌ WAF Detection failed: ${error.message}`,
        testId: 'waf-detection',
        type: 'error'
      }])
      
      setScanResults(prev => ({
        ...prev,
        'waf-detection': {
          testId: 'waf-detection',
          testName: 'WAF (Firewall) Detection',
          category: 'Web Security',
          severity: 'high',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message,
          findings: [],
          recommendations: [],
          report: { summary: {}, details: {}, rawOutput: '' }
        }
      }))
      setCompletedTests(prev => new Set([...prev, 'waf-detection']))
    } finally {
      setTestProgress(prev => ({ ...prev, 'waf-detection': 100 }))
    }
  }

  // Parse the concatenated raw outputs from file upload test into structured JSON per schema
  const parseFileUploadRawToJson = (raw = '', target = '') => {
    const nowIso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    const result = {
      meta: {
        parser_version: '1.0',
        generated_at_utc: nowIso,
        target: target || null,
        tester_host: null,
        tester_ip: null
      },
      commands: [],
      aggregate_findings: {
        upload_allowed: null,
        evidence: [],
        severity: 'unknown',
        confidence: 'low',
        rationale: 'Insufficient data'
      },
      recommendations: [
        'Validate file content-type and magic bytes server-side',
        'Store uploads outside webroot and serve via controlled handler',
        'Block executable extensions and enforce allowlist',
        'Set X-Content-Type-Options: nosniff and Content-Disposition: attachment',
        'Restrict direct access to upload paths; require auth where needed'
      ],
      raw_outputs_attached: true
    }

    if (!raw || typeof raw !== 'string') return result

    // Split by our emitted markers ===FILE:filename===
    const parts = raw.split(/\n===FILE:(.+?)===\n/)
    // parts structure: [prefix, filename1, content1, filename2, content2, ...]
    for (let i = 1; i < parts.length; i += 2) {
      const label = (parts[i] || '').trim()
      const content = (parts[i + 1] || '')
      const id = `cmd-${(i + 1) / 2}`

      // Extract command if present (look for curl commands)
      const cmdMatch = content.match(/(curl\s+[^\n]+)/i) || content.match(/POST\s+([^\s]+)/i)
      let command = cmdMatch ? cmdMatch[1] : null
      // Also try to extract from the output itself
      if (!command && label) {
        if (label.includes('upload')) command = 'curl -v -F file upload'
        if (label.includes('head')) command = 'curl -I retrieval check'
        if (label.includes('get')) command = 'curl retrieval check'
        if (label.includes('etcpasswd')) command = 'curl -F file=/etc/passwd upload'
      }
      
      // Extract HTTP status code - handle both < HTTP/2 200 and HTTP/2 200 formats
      const statusMatch = content.match(/<\s*HTTP\/[0-9.]+\s+(\d{3})/m) || 
                         content.match(/^HTTP\/[0-9.]+\s+(\d{3})/m) ||
                         content.match(/HTTP\/2\s+(\d{3})/m)
      const status_code = statusMatch ? parseInt(statusMatch[1], 10) : null

      // Parse response headers from curl verbose blocks
      // Handle both < header: value and header: value formats
      const headers = {}
      const headerLines = content.match(/^<\s*([^:]+):\s*(.+)$/mg) || 
                         content.match(/^([a-zA-Z0-9\-]+):\s*(.+)$/gm)
      if (headerLines) {
        headerLines.forEach(l => {
          const cleanLine = l.replace(/^<\s*/, '')
          const m = cleanLine.match(/^([^:]+):\s*(.*)$/)
          if (m) {
            const key = m[1].trim().split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).join('-')
            headers[key] = m[2].trim()
          }
        })
      }
      const response_headers = Object.keys(headers).length > 0 ? headers : null

      // TLS cert block parsing (subject/issuer/dates)
      let tls_cert = null
      if (/^subject=/m.test(content) || /^issuer=/m.test(content)) {
        const subject = (content.match(/^subject=\s*(.+)$/m) || [])[1] || null
        const issuer = (content.match(/^issuer=\s*(.+)$/m) || [])[1] || null
        const not_before = (content.match(/^notBefore=\s*(.+)$/m) || [])[1] || null
        const not_after = (content.match(/^notAfter=\s*(.+)$/m) || [])[1] || null
        tls_cert = { subject, issuer, not_before, not_after }
      }

      // Tester IP if present
      if (!result.meta.tester_ip) {
        const ip = (content.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/) || [])[1]
        if (ip) result.meta.tester_ip = ip
      }

      // Observations
      const observations = []
      if (/\* Connected to /i.test(content)) observations.push('connection established')
      if (/\bHTTP\/[0-9.]+\s+2\d\d\b/.test(content)) {
        observations.push(`HTTP ${status_code} response`)
        if (status_code === 200) observations.push('upload succeeded or file accessible')
      }
      if (/\bHTTP\/[0-9.]+\s+403\b/.test(content)) observations.push('upload blocked with 403 Forbidden')
      if (/\bHTTP\/[0-9.]+\s+404\b/.test(content)) observations.push('path returned 404 Not Found')
      if (/\bHTTP\/[0-9.]+\s+500\b/.test(content)) observations.push('server error (500)')
      if (/SSL certificate verify ok/i.test(content)) observations.push('TLS certificate verified')
      if (/cloudflare/i.test(content)) observations.push('Cloudflare detected')
      if (/server:\s*cloudflare/i.test(content)) observations.push('server behind Cloudflare')
      if (/content-type:\s*text\/html/i.test(content)) observations.push('response is HTML')
      if (/curl:\s*\(\d+\)/.test(content)) observations.push('curl reported an error')
      if (!observations.length && status_code) {
        observations.push(`HTTP status code: ${status_code}`)
      }

      result.commands.push({
        id,
        raw_label: label || null,
        command: command || null,
        start_time: null,
        end_time: null,
        stdout_stderr: content,
        status_code: status_code || null,
        response_headers,
        tls_cert,
        errors: (content.match(/^curl:\s*\(\d+\)\s*.*$/mg) || []).map(s => s.trim()),
        observations
      })
    }

    // Aggregate logic
    const findCmd = (pred) => result.commands.find(pred)
    const findUploadCmds = () => result.commands.filter(c => 
      (c.command && /curl\s+-v?\s+-F/.test(c.command)) || 
      (c.raw_label && /upload/.test(c.raw_label))
    )
    const findGetCmds = () => result.commands.filter(c =>
      (c.command && /curl\s+(?:-I\s+)?https?:\/\//.test(c.command) && !/curl\s+-F/.test(c.command)) ||
      (c.raw_label && (/head|get/.test(c.raw_label)))
    )
    
    const uploadCmds = findUploadCmds()
    const getCmds = findGetCmds()
    
    const any2xxUpload = uploadCmds.some(c => c.status_code && c.status_code >= 200 && c.status_code < 300)
    const anyGet200 = getCmds.some(c => c.status_code === 200)
    
    let upload_allowed = null
    if (any2xxUpload && anyGet200) {
      upload_allowed = true
    } else if (any2xxUpload && !anyGet200) {
      upload_allowed = true // Upload succeeded but retrieval may have failed - still counts as allowed
    } else if (result.commands.length && uploadCmds.length > 0 && 
               uploadCmds.every(c => c.status_code && c.status_code >= 400)) {
      upload_allowed = false
    } else if (result.commands.length === 0) {
      upload_allowed = null
    }
    
    result.aggregate_findings.upload_allowed = upload_allowed

    // Evidence and severity/confidence
    result.commands.forEach(c => {
      if (c.status_code) {
        const statusLine = c.stdout_stderr.match(/<\s*HTTP\/[0-9.]+\s+\d{3}.*/) || 
                          c.stdout_stderr.match(/HTTP\/[0-9.]+\s+\d{3}.*/) || 
                          [`HTTP/${c.status_code}`]
        result.aggregate_findings.evidence.push(`${c.id}: '${statusLine[0].trim()}'`)
      }
    })
    
    if (upload_allowed === true) {
      result.aggregate_findings.severity = 'high'
      result.aggregate_findings.confidence = anyGet200 ? 'high' : 'medium'
      result.aggregate_findings.rationale = anyGet200 
        ? 'Upload attempt returned 2xx and a subsequent GET returned 200 for a candidate path, indicating files can be uploaded and retrieved.'
        : 'Upload attempt returned 2xx status, indicating file upload was accepted. However, file retrieval test did not return 200.'
    } else if (upload_allowed === false) {
      result.aggregate_findings.severity = 'none'
      result.aggregate_findings.confidence = 'high'
      result.aggregate_findings.rationale = 'All observed upload requests returned 4xx/5xx status codes, indicating uploads are blocked or denied.'
    } else {
      result.aggregate_findings.severity = 'unknown'
      result.aggregate_findings.confidence = 'low'
      result.aggregate_findings.rationale = 'Outputs did not provide sufficient evidence to conclude whether uploads were accepted. May need manual review.'
    }
    return result
  }

  // Run File Upload Vulnerability Check
  const runFileUploadCheck = async () => {
    try {
      setCurrentTest({ id: 'file-upload-check', name: 'File Upload Vulnerability Check' })
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 5 }))

      console.log('🚀 [FILE-UPLOAD] Starting File Upload Vulnerability Check')
      console.log('🎯 [FILE-UPLOAD] Target URL:', targetUrl)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: '🚀 Starting File Upload Vulnerability Check...', testId: 'file-upload-check', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `🎯 Target URL: ${targetUrl}`, testId: 'file-upload-check', type: 'info' }])

      // Construct upload URL - if target includes /admin, use ${target}/upload, otherwise append /admin/upload
      let uploadUrl = targetUrl.trim().replace(/\/$/, '') // Remove trailing slash
      if (uploadUrl.includes('/admin')) {
        uploadUrl = uploadUrl + '/upload'
      } else {
        uploadUrl = uploadUrl + '/admin/upload'
      }
      
      // Construct uploads path for retrieval test
      let uploadsUrl = targetUrl.trim().replace(/\/$/, '') // Remove trailing slash
      if (uploadsUrl.includes('/admin')) {
        uploadsUrl = uploadsUrl + '/uploads/harmless.php.txt'
      } else {
        uploadsUrl = uploadsUrl + '/admin/uploads/harmless.php.txt'
      }

      console.log('🔗 [FILE-UPLOAD] Upload URL:', uploadUrl)
      console.log('🔗 [FILE-UPLOAD] Uploads URL:', uploadsUrl)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `🔗 Upload URL: ${uploadUrl}`, testId: 'file-upload-check', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `🔗 Uploads path: ${uploadsUrl}`, testId: 'file-upload-check', type: 'info' }])

      // Define commands to execute sequentially (one by one)
      const commandSets = [
        { label: 'curl_upload_test.txt', cmd: `curl -v -F "file=@test.txt" "${uploadUrl}" 2>&1` },
        { label: 'curl_upload_harmless.txt', cmd: `echo "TEST" > harmless.php.txt && curl -v -F "file=@harmless.php.txt" "${uploadUrl}" 2>&1` },
        { label: 'curl_head_candidate.txt', cmd: `curl -I "${uploadsUrl}" 2>&1` },
        { label: 'curl_upload_etcpasswd.txt', cmd: `curl -v -F "file=@/etc/passwd" "${uploadUrl}" 2>&1` }
      ]

      // Log each command
      console.log('📋 [FILE-UPLOAD] Commands to execute:')
      setLogs(prev => [...prev, { timestamp: Date.now(), message: '📋 Commands to execute:', testId: 'file-upload-check', type: 'info' }])
      
      commandSets.forEach((cmdSet, idx) => {
        console.log(`  ${idx + 1}. ${cmdSet.cmd}`)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `  ${idx + 1}. ${cmdSet.cmd}`, testId: 'file-upload-check', type: 'info' }])
      })

      setLogs(prev => [...prev, { timestamp: Date.now(), message: '🔍 Executing commands sequentially in Kali Linux...', testId: 'file-upload-check', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 15 }))
      console.log('🔍 [FILE-UPLOAD] Executing commands sequentially in Kali Linux...')

      // Prepare test.txt file first
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify('echo "SIMPLE" > test.txt'), requireConfirm: false })
      }

      // Execute each command sequentially and collect results
      let raw = ''
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        console.log('⚙️ [FILE-UPLOAD] Running commands sequentially via WSL...')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: '⚙️ Running commands sequentially via WSL...', testId: 'file-upload-check', type: 'info' }])
        
        for (let i = 0; i < commandSets.length; i++) {
          const cmdSet = commandSets[i]
          console.log(`▶️ [FILE-UPLOAD] Executing set ${i + 1}/${commandSets.length}: ${cmdSet.cmd}`)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `▶️ Executing set ${i + 1}/${commandSets.length}: ${cmdSet.cmd}`, testId: 'file-upload-check', type: 'info' }])
          
          const execRes = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmdSet.cmd), requireConfirm: false })
          const output = (execRes?.stdout || '') + (execRes?.stderr || '')
          
          raw += `===FILE:${cmdSet.label}===\n${output}\n`
          
          console.log(`✅ [FILE-UPLOAD] Set ${i + 1} completed - ${output.length} bytes`)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ Set ${i + 1} completed - Raw output:\n${output.substring(0, 1000)}${output.length > 1000 ? '...' : ''}`, testId: 'file-upload-check', type: 'success' }])
          
          setTestProgress(prev => ({ ...prev, 'file-upload-check': 15 + (i + 1) * 15 }))
        }
      } else {
        console.error('❌ [FILE-UPLOAD] cyberGuard.runAsRoot not available')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: '❌ Error: WSL command execution not available', testId: 'file-upload-check', type: 'error' }])
      }

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 60 }))
      
      // Log raw results
      const rawError = ''
      
      console.log('📥 [FILE-UPLOAD] Raw stdout length:', raw.length)
      console.log('📥 [FILE-UPLOAD] Raw stderr length:', rawError.length)
      
      if (raw) {
        console.log('📥 [FILE-UPLOAD] Raw stdout (full):', raw)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `📥 Received ${raw.length} bytes of output from Kali`, testId: 'file-upload-check', type: 'info' }])
        
        // Log the full raw output in chunks if it's too long
        if (raw.length <= 5000) {
          // If output is small enough, show it all
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `📄 Raw output from Kali:\n${raw}`, testId: 'file-upload-check', type: 'info' }])
        } else {
          // If output is large, show first chunk, then log message about full output
          const preview = raw.substring(0, 2000)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `📄 Raw output preview (first 2000 chars):\n${preview}\n\n... (showing ${raw.length - 2000} more bytes - full output saved in report)`, testId: 'file-upload-check', type: 'info' }])
        }
      } else {
        console.warn('⚠️ [FILE-UPLOAD] No stdout received')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: '⚠️ Warning: No output received from Kali', testId: 'file-upload-check', type: 'warning' }])
      }
      
      if (rawError) {
        console.log('📥 [FILE-UPLOAD] Raw stderr:', rawError)
        if (rawError.length <= 500) {
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `⚠️ Stderr:\n${rawError}`, testId: 'file-upload-check', type: 'warning' }])
        } else {
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `⚠️ Stderr (first 500 chars):\n${rawError.substring(0, 500)}...`, testId: 'file-upload-check', type: 'warning' }])
        }
      }

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 70 }))
      console.log('🔍 [FILE-UPLOAD] Parsing raw output...')
      setLogs(prev => [...prev, { timestamp: Date.now(), message: '🔍 Parsing raw output to JSON...', testId: 'file-upload-check', type: 'info' }])
      
      const parsed = parseFileUploadRawToJson(raw, uploadUrl)
      
      console.log('✅ [FILE-UPLOAD] Parsed JSON:', JSON.stringify(parsed, null, 2))
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ Parsed ${parsed.commands?.length || 0} commands`, testId: 'file-upload-check', type: 'success' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📊 Upload Allowed: ${parsed.aggregate_findings?.upload_allowed === true ? 'Yes' : parsed.aggregate_findings?.upload_allowed === false ? 'No' : 'Unknown'}`, testId: 'file-upload-check', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📊 Severity: ${parsed.aggregate_findings?.severity || 'unknown'}`, testId: 'file-upload-check', type: 'info' }])

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 80 }))
      console.log('📝 [FILE-UPLOAD] Creating report...')
      setLogs(prev => [...prev, { timestamp: Date.now(), message: '📝 Creating scan report...', testId: 'file-upload-check', type: 'info' }])

      const report = {
        testId: 'file-upload-check',
        testName: 'File Upload Vulnerability Check',
        category: 'Web Security',
        severity: 'high',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: [
          {
            type: parsed.aggregate_findings.severity === 'critical' ? 'critical' : parsed.aggregate_findings.severity === 'high' ? 'high' : parsed.aggregate_findings.severity,
            message: parsed.aggregate_findings.upload_allowed === true ? 'Upload appears allowed and retrievable' : parsed.aggregate_findings.upload_allowed === false ? 'Uploads blocked or not retrievable' : 'Unable to determine upload behavior',
            details: parsed.aggregate_findings.rationale
          }
        ],
        recommendations: parsed.recommendations || [],
        report: {
          scanType: 'File Upload Vulnerability Check',
          target: targetUrl,
          json: parsed // keep the structured JSON (not shown as raw in UI)
        }
      }

      console.log('✅ [FILE-UPLOAD] Report created successfully')
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 90 }))
      
      setScanResults(prev => ({ ...prev, 'file-upload-check': report }))
      setNewScanResults(prev => ({ ...prev, 'file-upload-check': report }))
      setCompletedTests(prev => new Set([...(prev || new Set()), 'file-upload-check']))
      
      console.log('✅ [FILE-UPLOAD] File Upload Vulnerability Check completed successfully!')
      console.log('📊 [FILE-UPLOAD] Summary:', {
        upload_allowed: parsed.aggregate_findings?.upload_allowed,
        severity: parsed.aggregate_findings?.severity,
        commands_executed: parsed.commands?.length || 0
      })
      
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 100 }))
      setLogs(prev => [...prev, { timestamp: Date.now(), message: '✅ File Upload Vulnerability Check completed successfully!', testId: 'file-upload-check', type: 'success' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📊 Final Summary - Upload Allowed: ${parsed.aggregate_findings?.upload_allowed === true ? 'Yes' : parsed.aggregate_findings?.upload_allowed === false ? 'No' : 'Unknown'}, Severity: ${parsed.aggregate_findings?.severity || 'unknown'}, Commands: ${parsed.commands?.length || 0}`, testId: 'file-upload-check', type: 'success' }])
    } catch (e) {
      console.error('❌ [FILE-UPLOAD] Error during File Upload Vulnerability Check:', e)
      console.error('❌ [FILE-UPLOAD] Error message:', e.message)
      console.error('❌ [FILE-UPLOAD] Error stack:', e.stack)
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `❌ Error: ${e.message}`, testId: 'file-upload-check', type: 'error' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `❌ File Upload Vulnerability Check failed`, testId: 'file-upload-check', type: 'error' }])
      
      setScanResults(prev => ({
        ...prev,
        'file-upload-check': {
          testId: 'file-upload-check',
          testName: 'File Upload Vulnerability Check',
          category: 'Web Security',
          severity: 'high',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: e.message,
          findings: [],
          recommendations: [],
          report: { scanType: 'File Upload Vulnerability Check', target: targetUrl }
        }
      }))
      setCompletedTests(prev => new Set([...(prev || new Set()), 'file-upload-check']))
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 100 }))
    }
  }

  // Helper: run a single WSL command and return stdout+stderr
  const runWSL = async (label, cmd) => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message: `▶️ ${label}: ${cmd}`, testId: label, type: 'info' }])
    const res = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmd), requireConfirm: false })
    const output = (res?.stdout || '') + (res?.stderr ? `\n${res.stderr}` : '')
    setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ ${label} completed (${output.length} bytes)`, testId: label, type: 'success' }])
    return output
  }

  // Helper: run command and return stdout/stderr separately (useful for JSON parsing)
  const runWSLSeparated = async (label, cmd) => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message: `▶️ ${label}: ${cmd}`, testId: label, type: 'info' }])
    const res = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmd), requireConfirm: false })
    const stdout = res?.stdout || ''
    const stderr = res?.stderr || ''
    setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ ${label} completed (stdout: ${stdout.length} bytes, stderr: ${stderr.length} bytes)`, testId: label, type: 'success' }])
    return { stdout, stderr }
  }

  // Parse helper per requested JSON format
  const buildSimpleJson = ({ test_name, severity, status, evidence, recommendation }) => ({ test_name, severity, status, evidence, recommendation })

  const runOpenRedirectCheck = async (targetBase) => {
    const url = `${targetBase.replace(/\/$/, '')}/?redirect=http://evil.com`
    const out = await runWSL('open-redirect-check', `curl -I ${JSON.stringify(url)}`)
    const vulnerable = /\bLocation:\s*http:\/\/evil\.com/i.test(out)
    return buildSimpleJson({
      test_name: 'Open Redirect Check',
      severity: 'High',
      status: vulnerable ? 'Vulnerable' : 'Safe',
      evidence: vulnerable ? (out.match(/Location:[^\n]*/i)?.[0] || 'Location: http://evil.com') : 'No unvalidated Location header observed',
      recommendation: 'Restrict allowed redirect URLs to internal whitelisted domains.'
    })
  }

  const runCorsPolicyValidation = async (targetBase) => {
    const url = targetBase
    const out = await runWSL('cors-policy-validation', `curl -I -H "Origin: http://evil.com" ${JSON.stringify(url)} | grep -i "access-control-allow-origin" || true`)
    const vulnerable = /access-control-allow-origin:\s*\*/i.test(out)
    return buildSimpleJson({
      test_name: 'CORS Policy Validation',
      severity: 'Critical',
      status: vulnerable ? 'Vulnerable' : 'Safe',
      evidence: out.trim() || 'No ACAO header returned',
      recommendation: 'Restrict CORS to trusted domains only and avoid use of wildcard *.'
    })
  }

  const runHostHeaderInjection = async (targetBase) => {
    const out = await runWSL('host-header-injection', `curl -I -H "Host: attacker.com" ${JSON.stringify(targetBase)}`)
    const vulnerable = /attacker\.com/i.test(out)
    return buildSimpleJson({
      test_name: 'Host Trust Verification',
      severity: 'High',
      status: vulnerable ? 'Vulnerable' : 'Safe',
      evidence: vulnerable ? 'attacker.com appeared in response' : 'Host header not reflected/used',
      recommendation: 'Enforce host header validation at server or reverse proxy layer.'
    })
  }

  const runHttpMethodsCheck = async (targetBase) => {
    const out = await runWSL('http-methods-check', `curl -X OPTIONS -I ${JSON.stringify(targetBase)}`)
    const vulnerable = /Allow:\s*.*(PUT|DELETE|TRACE)/i.test(out)
    return buildSimpleJson({
      test_name: 'HTTP Allowed Methods Check',
      severity: 'Critical',
      status: vulnerable ? 'Vulnerable' : 'Safe',
      evidence: (out.match(/Allow:[^\n]*/i)?.[0] || '').trim(),
      recommendation: 'Disable unsafe methods at server and web application firewall level.'
    })
  }

  const runCTLogSubdomainDiscovery = async (targetBase) => {
    try {
      // Extract domain from URL
      let domain = targetBase
      try {
        const urlObj = new URL(targetBase.startsWith('http') ? targetBase : `https://${targetBase}`)
        domain = urlObj.hostname.replace(/^www\./, '')
      } catch {
        domain = targetBase.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      }

      console.log(`🔍 [CT-LOG] Querying crt.sh for domain: ${domain}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `🔍 Querying Certificate Transparency logs for: ${domain}`, testId: 'ct-log-subdomain-discovery', type: 'info' }])

      // Use exact command format with single quotes to avoid bash quote issues
      // curl -s "https://crt.sh/?q=%25.{domain}&output=json" | jq .
      const cmd = `curl -s 'https://crt.sh/?q=%25.${domain}&output=json' | jq .`
      const { stdout, stderr } = await runWSLSeparated('ct-log-subdomain-discovery', cmd)

      console.log(`📥 [CT-LOG] stdout length: ${stdout.length}, stderr length: ${stderr.length}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📥 Received ${stdout.length} bytes from crt.sh (via jq)`, testId: 'ct-log-subdomain-discovery', type: 'info' }])
      if (stderr) {
        console.log(`⚠️ [CT-LOG] stderr from jq/curl:`, stderr)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `⚠️ stderr: ${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`, testId: 'ct-log-subdomain-discovery', type: 'warning' }])
      }

      let certs = []
      try {
        // Parse JSON array
        const trimmed = stdout.trim()
        if (/^</.test(trimmed)) {
          throw new Error('Received HTML instead of JSON (possible rate limit)')
        }
        if (trimmed) {
          certs = JSON.parse(trimmed)
          if (!Array.isArray(certs)) {
            certs = [certs]
          }
        }
      } catch (parseErr) {
        console.error(`❌ [CT-LOG] JSON parse error:`, parseErr)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `⚠️ Failed to parse JSON: ${parseErr.message}`, testId: 'ct-log-subdomain-discovery', type: 'warning' }])
        return {
          test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
          severity: 'Medium',
          status: 'Completed',
          evidence: `Failed to parse certificate data from crt.sh${stderr ? ` (stderr: ${stderr.substring(0,120)})` : ''}`,
          recommendation: 'Verify domain name and crt.sh API availability',
          certificates: [],
          unique_subdomains: []
        }
      }

      console.log(`✅ [CT-LOG] Parsed ${certs.length} certificates`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ Parsed ${certs.length} certificates`, testId: 'ct-log-subdomain-discovery', type: 'success' }])

      // Extract unique subdomains from name_value (can contain multiple separated by \n)
      // Also deduplicate certificates to avoid showing the same certificate multiple times
      const uniqueSubdomains = new Set()
      const seenCertificates = new Set()
      const processedCerts = []
      
      for (const cert of certs) {
        const nameValue = cert.name_value || ''
        const serialNumber = cert.serial_number || ''
        
        // Create a unique key for this certificate (serial_number + first name_value entry)
        const firstSubdomain = nameValue.split('\n').find(s => s.trim()) || ''
        const certKey = `${serialNumber}:${firstSubdomain.trim()}`
        
        // Skip if we've already processed this certificate
        if (seenCertificates.has(certKey)) {
          continue
        }
        seenCertificates.add(certKey)
        
        // Extract all subdomains from name_value
        const subdomains = nameValue.split('\n').filter(s => s.trim())
        subdomains.forEach(sub => uniqueSubdomains.add(sub.trim()))
        
        processedCerts.push({
          name_value: nameValue,
          serial_number: serialNumber || 'N/A',
          entry_timestamp: cert.entry_timestamp || 'N/A',
          not_before: cert.not_before || 'N/A',
          not_after: cert.not_after || 'N/A'
        })
      }

      console.log(`📊 [CT-LOG] Found ${uniqueSubdomains.size} unique subdomains`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📊 Found ${uniqueSubdomains.size} unique subdomains across ${processedCerts.length} certificates`, testId: 'ct-log-subdomain-discovery', type: 'success' }])

      return {
        test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
        severity: 'Medium',
        status: 'Completed',
        evidence: `Discovered ${uniqueSubdomains.size} unique subdomains from ${processedCerts.length} certificates`,
        recommendation: 'Audit all discovered subdomains and ensure they are properly secured',
        certificates: processedCerts,
        unique_subdomains: Array.from(uniqueSubdomains).sort()
      }
    } catch (error) {
      console.error(`❌ [CT-LOG] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `❌ Error: ${error.message}`, testId: 'ct-log-subdomain-discovery', type: 'error' }])
      return {
        test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
        severity: 'Medium',
        status: 'Failed',
        evidence: `Error: ${error.message}`,
        recommendation: 'Verify network connectivity and crt.sh API availability',
        certificates: [],
        unique_subdomains: []
      }
    }
  }

  // Helper function to strip ANSI escape codes
  const stripAnsiCodes = (text) => {
    if (!text || typeof text !== 'string') return text
    // Remove ANSI escape codes: \x1b[...m, [1m, [33m, [0m, etc.
    return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '').replace(/\[\d+[m[]?/g, '').trim()
  }

  const runQuickFingerprint = async (targetBase) => {
    try {
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      const now = new Date().toISOString()
      
      console.log(`🔍 [QUICK-FINGERPRINT] Starting whatweb fingerprint for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `🔍 Starting Quick Fingerprint scan for: ${targetUrl}`, testId: 'quick-fingerprint', type: 'info' }])

      let result = {
        test_name: 'whatweb-fingerprint',
        target_url: targetUrl,
        timestamp: now,
        status_code: null,
        title: null,
        ip: null,
        country: null,
        summary: null,
        plugins: [],
        http_headers: {},
        raw_output: null,
        severity_hint: 'Informational',
        recommendation: '',
        notes: ''
      }

      // Use whatweb -v command as specified
      console.log(`📝 [QUICK-FINGERPRINT] Running whatweb -v...`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `📝 Running whatweb -v for fingerprint scan...`, testId: 'quick-fingerprint', type: 'info' }])
      
      const cmd = `whatweb -v ${targetUrl}`
      const { stdout: out, stderr: err } = await runWSLSeparated('quick-fingerprint', cmd)
      const verboseOutput = out + (err ? `\n${err}` : '')
        
      if (verboseOutput) {
        // Parse verbose output
        const lines = verboseOutput.split('\n')
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          
          // Status
          const statusMatch = line.match(/^Status\s*:\s*(.+)$/i)
          if (statusMatch) {
            const statusText = stripAnsiCodes(statusMatch[1])
            const statusNum = parseInt(statusText.match(/\d+/)?.[0] || '0', 10)
            result.status_code = statusNum || null
          }
          
          // Title
          const titleMatch = line.match(/^Title\s*:\s*(.+)$/i)
          if (titleMatch) result.title = stripAnsiCodes(titleMatch[1])
          
          // IP
          const ipMatch = line.match(/^IP\s*:\s*(.+)$/i)
          if (ipMatch) result.ip = stripAnsiCodes(ipMatch[1])
          
          // Country
          const countryMatch = line.match(/^Country\s*:\s*(.+)$/i)
          if (countryMatch) result.country = stripAnsiCodes(countryMatch[1])
          
          // Summary
          const summaryMatch = line.match(/^Summary\s*:\s*(.+)$/i)
          if (summaryMatch) result.summary = stripAnsiCodes(summaryMatch[1])
          
          // Detected Plugins section
          if (line.match(/^Detected Plugins:/i)) {
            let pluginName = null
            let pluginDesc = []
            i++
            
            while (i < lines.length) {
              const pluginLine = lines[i].trim()
              if (!pluginLine) {
                if (pluginName) {
                  result.plugins.push({
                    name: stripAnsiCodes(pluginName),
                    description: stripAnsiCodes(pluginDesc.join(' ').trim()) || `Detected ${stripAnsiCodes(pluginName)}`
                  })
                  pluginName = null
                  pluginDesc = []
                }
                i++
                continue
              }
              
              const pluginNameMatch = pluginLine.match(/^\[\s*(.+?)\s*\]/)
              if (pluginNameMatch) {
                if (pluginName) {
                  result.plugins.push({
                    name: stripAnsiCodes(pluginName),
                    description: stripAnsiCodes(pluginDesc.join(' ').trim()) || `Detected ${stripAnsiCodes(pluginName)}`
                  })
                }
                pluginName = stripAnsiCodes(pluginNameMatch[1])
                pluginDesc = []
              } else if (pluginName) {
                pluginDesc.push(stripAnsiCodes(pluginLine))
              }
              
                // Check if we hit HTTP Headers section
              if (pluginLine.match(/^HTTP Headers:/i)) {
                if (pluginName) {
                  result.plugins.push({
                    name: stripAnsiCodes(pluginName),
                    description: stripAnsiCodes(pluginDesc.join(' ').trim()) || `Detected ${stripAnsiCodes(pluginName)}`
                  })
                }
                break
              }
              
              i++
            }
            
            // Process HTTP Headers
            if (i < lines.length && lines[i].trim().match(/^HTTP Headers:/i)) {
              i++
              while (i < lines.length) {
                const headerLine = lines[i].trim()
                if (!headerLine) break
                
                const headerMatch = headerLine.match(/^([^:]+):\s*(.+)$/)
                if (headerMatch) {
                  const headerName = stripAnsiCodes(headerMatch[1].trim())
                  const headerValue = stripAnsiCodes(headerMatch[2].trim())
                  result.http_headers[headerName] = headerValue
                }
                i++
              }
            }
            break
          }
        }
        
        result.raw_output = verboseOutput
      } else {
        result.raw_output = `Command failed. stdout: ${out || 'empty'}, stderr: ${err || 'empty'}`
      }

      // Compute severity_hint and recommendations
      const recommendations = []
      
      if (!result.http_headers['Strict-Transport-Security'] && !result.http_headers['strict-transport-security']) {
        recommendations.push('Enable HSTS')
        if (result.severity_hint === 'Informational') result.severity_hint = 'Medium'
      }
      
      if (!result.http_headers['Content-Security-Policy'] && !result.http_headers['content-security-policy']) {
        recommendations.push('Add a strict Content-Security-Policy')
        if (result.severity_hint === 'Informational') result.severity_hint = 'Medium'
      }
      
      // Check for outdated CMS (simplified check)
      const cmsPlugins = result.plugins.filter(p => 
        /wordpress|joomla|drupal|magento/i.test(p.name)
      )
      if (cmsPlugins.length > 0) {
        // Note: In a real implementation, you'd check versions. For now, just note it.
        recommendations.push('Ensure CMS and plugins are updated to latest versions')
        if (result.severity_hint === 'Informational') result.severity_hint = 'High'
      }
      
      result.recommendation = recommendations.join('. ') || 'Review detected technologies and ensure security headers are properly configured.'
      
      console.log(`✅ [QUICK-FINGERPRINT] Completed fingerprint scan`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `✅ Quick Fingerprint completed: ${result.plugins.length} plugins detected`, testId: 'quick-fingerprint', type: 'success' }])
      
      return result
    } catch (error) {
      console.error(`❌ [QUICK-FINGERPRINT] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `❌ Error: ${error.message}`, testId: 'quick-fingerprint', type: 'error' }])
      
      return {
        test_name: 'whatweb-fingerprint',
        target_url: targetBase,
        timestamp: new Date().toISOString(),
        status_code: null,
        title: null,
        ip: null,
        country: null,
        summary: null,
        plugins: [],
        http_headers: {},
        raw_output: `Error: ${error.message}`,
        severity_hint: 'Informational',
        recommendation: 'Verify whatweb is installed and target URL is accessible',
        notes: error.message
      }
    }
  }

  // Execute the 5 additional security scans using Electron IPC
  const executeAdditionalScans = async () => {
    console.log('🔧 Executing additional security scans via Electron IPC...')
    
    try {
      // Use Electron's IPC to communicate with the main process for additional scans
      if (window.cyberGuard && window.cyberGuard.startAdditionalScans) {
        console.log('🔧 Starting additional scans via cyberGuard IPC...')
        
        const domain = targetUrl.replace(/^https?:\/\//, '').split('/')[0]
        
        // Set up progress tracking for additional scans
        const progressHandler = (progress) => {
          console.log('📊 [ADDITIONAL-SCANS-PROGRESS] Received progress:', progress)
          
          if (progress.message) {
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: progress.message,
              testId: progress.testId || 'additional-scans',
              type: progress.type || 'info'
            }])
          }
          
          // Update current test for additional scans
          if (progress.testId && progress.testId !== currentTest?.id) {
            setCurrentTest({
              id: progress.testId,
              name: progress.testName || progress.testId,
              progress: 0
            })
          }
          
          // Update test progress
          if (progress.testId) {
            setTestProgress(prev => ({
              ...prev,
              [progress.testId]: progress.progress || 0
            }))
          }
        }
        
        // Set up completion handler
        const completionHandler = (results) => {
          console.log('🔧 [ADDITIONAL-SCANS] Received completion results:', results)
          
          if (results && results.tests) {
            // Process each scan result
            const processedResults = {}
            
            // Process each test result
            Object.entries(results.tests).forEach(([testId, testResult]) => {
              if (testId !== 'dns-resolution') { // Skip DNS as it's already processed
                processedResults[testId] = {
                  testId: testId,
                  testName: testResult.testName || testId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                  category: testResult.category || 'Security',
                  severity: testResult.severity || 'medium',
                  status: testResult.status || 'completed',
                  timestamp: new Date().toISOString(),
                  findings: testResult.findings || [
                    { 
                      type: testResult.status === 'failed' ? 'error' : 'info', 
                      message: testResult.status === 'failed' ? `${testId} failed` : `${testId} completed`, 
                      details: testResult.summary || (testResult.status === 'failed' ? 'Scan failed' : 'Scan completed successfully')
                    }
                  ],
                  recommendations: testResult.recommendations || [],
                  report: testResult.report || { summary: testResult.summary || 'Scan completed' }
                }
              }
            })
            
            // Update state with new scan results
            setNewScanResults(processedResults)
            
            // Update completed tests
            setCompletedTests(prev => {
              const newSet = new Set(prev)
              Object.keys(processedResults).forEach(testId => {
                newSet.add(testId)
              })
              return newSet
            })
            
            // Add completion log with error details if any
            const hasErrors = Object.values(processedResults).some(result => result.status === 'failed');
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: hasErrors 
                ? '⚠️ Additional security scans completed with some errors - check individual scan results for details'
                : '✅ Additional security scans completed successfully!',
              testId: 'additional-scans',
              type: hasErrors ? 'warning' : 'success'
            }])
            
            // Complete the scanning process
            setCurrentTest(null)
            setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
            setIsScanning(false)
            setBackgroundScanning(false)
            
            console.log('✅ Additional scans completed successfully')
          }
        }
        
        // Set up IPC listeners
        window.cyberGuard.onAdditionalProgress(progressHandler)
        window.cyberGuard.onAdditionalComplete(completionHandler)
        
        // Start the additional scans
        await window.cyberGuard.startAdditionalScans(domain)
        
      } else {
        console.log('⚠️ cyberGuard.startAdditionalScans not available, using fallback simulation')
        
        const domain = targetUrl.replace(/^https?:\/\//, '').split('/')[0]
        
        // Fallback: Simulate the additional scans with demo data
        setTimeout(() => {
          const demoResults = {
            'ssl-tls-analysis': {
              testId: 'ssl-tls-analysis',
              testName: 'SSL/TLS Analysis',
              category: 'Infrastructure',
              severity: 'high',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'info', message: 'SSL/TLS analysis completed', details: 'TLS 1.2 and 1.3 supported, strong cipher configuration detected' }
              ],
              recommendations: [
                'Review SSL/TLS configuration',
                'Update to latest TLS versions',
                'Remove weak cipher suites'
              ],
              report: {
                scanType: 'SSL/TLS Analysis',
                target: domain,
                supportedProtocols: ['TLSv1.2', 'TLSv1.3'],
                cipherStrength: 'A',
                summary: 'Strong SSL/TLS configuration with modern protocols'
              }
            },
            'security-headers': {
              testId: 'security-headers',
              testName: 'Security Headers',
              category: 'Web Security',
              severity: 'medium',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'warning', message: 'Security headers analysis completed', details: 'Some security headers are missing' }
              ],
              recommendations: [
                'Implement missing security headers',
                'Configure Content Security Policy',
                'Enable HSTS'
              ],
              report: {
                scanType: 'Security Headers',
                target: `https://${domain}`,
                missingHeaders: ['Content-Security-Policy', 'X-Frame-Options'],
                summary: 'Most security headers present, missing: Content-Security-Policy, X-Frame-Options'
              }
            },
            'cms-detection': {
              testId: 'cms-detection',
              testName: 'CMS Detection',
              category: 'Reconnaissance',
              severity: 'medium',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'info', message: 'CMS detection completed', details: 'No CMS detected, server: nginx' }
              ],
              recommendations: [
                'Hide version information',
                'Update CMS and plugins',
                'Implement security headers'
              ],
              report: {
                scanType: 'CMS Detection',
                target: `https://${domain}`,
                server: 'nginx',
                cms: null,
                summary: 'No CMS detected, server: nginx'
              }
            },
            'subdomain-enumeration': {
              testId: 'subdomain-enumeration',
              testName: 'Subdomain Enumeration',
              category: 'Reconnaissance',
              severity: 'medium',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'info', message: 'Subdomain enumeration completed', details: '3 subdomains identified: www, mail, api' }
              ],
              recommendations: [
                'Audit discovered subdomains',
                'Secure misconfigured subdomains',
                'Implement subdomain monitoring'
              ],
              report: {
                scanType: 'Subdomain Enumeration',
                target: domain,
                subdomainsFound: ['www', 'mail', 'api'],
                count: 3,
                summary: '3 subdomains identified: www, mail, api'
              }
            },
            'port-scanning': {
              testId: 'port-scanning',
              testName: 'Port Scanning',
              category: 'Infrastructure',
              severity: 'high',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'info', message: 'Port scanning completed', details: '4 open ports detected: 22/ssh, 80/http, 443/https, 3000/ppp' }
              ],
              recommendations: [
                'Close unnecessary ports',
                'Secure exposed services',
                'Implement firewall rules'
              ],
              report: {
                scanType: 'Port Scanning',
                target: domain,
                openPorts: [
                  { port: 22, service: 'ssh', version: 'OpenSSH 8.4p1' },
                  { port: 80, service: 'http', version: 'nginx' },
                  { port: 443, service: 'https', version: 'nginx' },
                  { port: 3000, service: 'ppp', version: 'Next.js (suspected)' }
                ],
                totalOpen: 4,
                summary: '4 open ports detected: 22/ssh, 80/http, 443/https, 3000/ppp'
              }
            }
          }
          
          // Update state with demo results
          setNewScanResults(demoResults)
          
          // Update completed tests
          setCompletedTests(prev => {
            const newSet = new Set(prev)
            Object.keys(demoResults).forEach(testId => {
              newSet.add(testId)
            })
            return newSet
          })
          
          // Add completion log
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '✅ Additional security scans completed successfully! (Demo Mode)',
            testId: 'additional-scans',
            type: 'success'
          }])
          
          // Complete the scanning process
          setCurrentTest(null)
          setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
          setIsScanning(false)
          setBackgroundScanning(false)
          
          console.log('✅ Additional scans completed successfully (Demo Mode)')
        }, 2000) // 2 second delay to simulate scan time
      }
      
    } catch (error) {
      console.error('❌ Additional scans failed:', error)
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `❌ Additional scans failed: ${error.message}`,
        testId: 'additional-scans',
        type: 'error'
      }])
    }
  }

  // Open scan detail dialog
  const openScanDetailDialog = (testId, result) => {
    console.log('🔍 Opening scan detail dialog for:', testId, result)
    console.log('🔍 Result type:', typeof result)
    console.log('🔍 Result keys:', result ? Object.keys(result) : 'null')
    console.log('🔍 Result report:', result?.report)
    console.log('🔍 Result scanType:', result?.report?.scanType)
    setSelectedScanResult({ testId, result })
    setShowScanDetailDialog(true)
  }

  // Check tools before starting scan

  // Generate comprehensive PDF Report with all scan data
  const generatePDFReport = async () => {
    console.log('📄 [PDF] Generating comprehensive security report...')
    
    if ((!scanResults || Object.keys(scanResults).length === 0) && 
        (!newScanResults || Object.keys(newScanResults).length === 0)) {
      showError('No scan results available to generate report')
      return
    }

    setIsExporting(true)
    
    try {
      // Import jsPDF dynamically
      const { jsPDF } = await import('jspdf')
      
      // Create new PDF document
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      let yPosition = 20
      
      // Helper function to add text with word wrap
      const addText = (text, x, y, maxWidth = pageWidth - 40) => {
        const lines = doc.splitTextToSize(text, maxWidth)
        doc.text(lines, x, y)
        return y + (lines.length * 7)
      }
      
      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace = 20) => {
        if (yPosition + requiredSpace > pageHeight - 20) {
          doc.addPage()
          yPosition = 20
        }
      }
      
      // Title
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      yPosition = addText('Comprehensive Security Analysis Report', 20, yPosition)
      yPosition += 10
      
      // Target and timestamp
      doc.setFontSize(12)
      doc.setFont('helvetica', 'normal')
      yPosition = addText(`Target: ${targetUrl}`, 20, yPosition)
      yPosition = addText(`Analysis Date: ${new Date().toLocaleString()}`, 20, yPosition)
      yPosition = addText(`Scanner: Cyberix Security Scanner`, 20, yPosition)
      yPosition += 15
      
      // Table of Contents
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      yPosition = addText('Table of Contents', 20, yPosition)
      yPosition += 5
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      yPosition = addText('1. WAF (Firewall) Detection', 20, yPosition)
      yPosition = addText('2. DNS Resolution & Analysis', 20, yPosition)
      yPosition = addText('3. SSL/TLS Analysis', 20, yPosition)
      yPosition = addText('4. Security Headers Analysis', 20, yPosition)
      yPosition = addText('5. CMS Detection', 20, yPosition)
      yPosition = addText('6. Subdomain Enumeration', 20, yPosition)
      yPosition = addText('7. Port Scanning', 20, yPosition)
      yPosition += 15
      
      // WAF Detection Section
      const wafResult = scanResults['waf-detection'] || newScanResults['waf-detection']
      if (wafResult?.report) {
        checkNewPage(50)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('1. WAF (Firewall) Detection', 20, yPosition)
        yPosition += 10
        
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Detection Summary', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        const wafDetected = wafResult.report.summary?.wafDetected || false
        yPosition = addText(`WAF Detected: ${wafDetected ? 'Yes' : 'No'}`, 20, yPosition)
        
        if (wafDetected) {
          if (wafResult.report.summary?.wafType) {
            yPosition = addText(`WAF Type: ${wafResult.report.summary.wafType}`, 20, yPosition)
          }
          if (wafResult.report.summary?.wafVendor) {
            yPosition = addText(`Vendor: ${wafResult.report.summary.wafVendor}`, 20, yPosition)
          }
          if (wafResult.report.summary?.numberOfRequests) {
            yPosition = addText(`Number of Requests: ${wafResult.report.summary.numberOfRequests}`, 20, yPosition)
          }
          
          if (wafResult.report.details?.wafInfo) {
            yPosition += 5
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Detection Information:', 20, yPosition)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(wafResult.report.details.wafInfo, 25, yPosition)
          }
          
          if (wafResult.report.details?.reason) {
            yPosition += 5
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Detection Reason:', 20, yPosition)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(wafResult.report.details.reason, 25, yPosition)
          }
        } else {
          yPosition = addText('No Web Application Firewall detected. The target appears to be unprotected or using an undetected WAF solution.', 20, yPosition)
        }
        
        // Full JSON Report
        if (wafResult.report.details) {
          checkNewPage(40)
          yPosition += 10
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Full JSON Report', 20, yPosition)
          yPosition += 5
          
          doc.setFontSize(8)
          doc.setFont('courier', 'normal')
          const jsonText = JSON.stringify(wafResult.report.details, null, 2)
          yPosition = addText(jsonText, 20, yPosition)
        }
        
        // Raw Output
        if (wafResult.report.rawOutput) {
          checkNewPage(40)
          yPosition += 15
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Raw wafw00f Output', 20, yPosition)
          yPosition += 5
          
          doc.setFontSize(8)
          doc.setFont('courier', 'normal')
          yPosition = addText(wafResult.report.rawOutput, 20, yPosition)
        }
        
        yPosition += 15
      }
      
      const dnsResult = scanResults['dns-resolution']
      const structuredData = dnsResult?.report?.structuredData
      
      // DNS Security Score
      if (structuredData?.security_score) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('DNS Security Score', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        yPosition = addText(`Score: ${structuredData.security_score.score}/100 (Grade: ${structuredData.security_score.grade})`, 20, yPosition)
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(structuredData.security_score.description, 20, yPosition)
        yPosition += 15
      }
      
      // Risk Summary
      if (structuredData?.risk_summary) {
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Risk Summary', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Overall Risk: ${structuredData.risk_summary.overall_risk}`, 20, yPosition)
        yPosition = addText(`Total Issues: ${structuredData.risk_summary.total_issues}`, 20, yPosition)
        yPosition = addText(`Critical: ${structuredData.risk_summary.critical_issues} | High: ${structuredData.risk_summary.high_issues} | Medium: ${structuredData.risk_summary.medium_issues} | Low: ${structuredData.risk_summary.low_issues}`, 20, yPosition)
        yPosition += 5
        yPosition = addText(structuredData.risk_summary.summary, 20, yPosition)
        yPosition += 15
      }
      
      // DNS Records Section (Updated to match UI)
      if (structuredData?.records) {
        checkNewPage(30)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('DNS Records', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        // A Records
        if (structuredData.records.A.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('A Records (IPv4):', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          structuredData.records.A.forEach(ip => {
            yPosition = addText(`  ${structuredData.domain} → ${ip}`, 25, yPosition)
          })
          yPosition += 5
        }
        
        // NS Records
        if (structuredData.records.NS.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('NS Records (Name Servers):', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          structuredData.records.NS.forEach(ns => {
            yPosition = addText(`  ${ns}`, 25, yPosition)
          })
          yPosition += 5
        }
        
        // MX Records
        if (structuredData.records.MX.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('MX Records (Mail Servers):', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          structuredData.records.MX.forEach(mx => {
            yPosition = addText(`  ${mx}`, 25, yPosition)
          })
          yPosition += 5
        }
        
        // SPF Records
        if (structuredData.records.SPF.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('SPF Records:', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          structuredData.records.SPF.forEach(spf => {
            yPosition = addText(`  ${spf}`, 25, yPosition)
          })
          yPosition += 5
        }
        
        // DMARC Records
        if (structuredData.records.DMARC.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('DMARC Records:', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          structuredData.records.DMARC.forEach(dmarc => {
            yPosition = addText(`  ${dmarc}`, 25, yPosition)
          })
          yPosition += 10
        }
      }
      
      // Reverse DNS Section
      if (structuredData?.reverse_dns) {
        checkNewPage(20)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Reverse DNS (PTR)', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        if (structuredData.reverse_dns.available) {
          yPosition = addText('✅ Reverse DNS available', 20, yPosition)
          yPosition = addText(`Hostname: ${structuredData.reverse_dns.hostname}`, 25, yPosition)
        } else {
          yPosition = addText('⚠️ Reverse DNS lookup failed or timed out', 20, yPosition)
          yPosition = addText(structuredData.reverse_dns.note || 'Reverse DNS (PTR) records could not be resolved.', 25, yPosition)
        }
        yPosition += 10
      }
      
      // Scan Health Section
      if (structuredData?.scan_health) {
        checkNewPage(20)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Scan Health', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        yPosition = addText(`Status: ${structuredData.scan_health.status}`, 20, yPosition)
        
        if (structuredData.scan_health.notes.length > 0) {
          yPosition = addText('Notes:', 20, yPosition)
          structuredData.scan_health.notes.forEach(note => {
            yPosition = addText(`• ${note}`, 25, yPosition)
          })
        }
        yPosition += 10
      }
      
      // Security Findings Section (Updated with categories)
      if (structuredData?.findings && structuredData.findings.length > 0) {
        checkNewPage(30)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Security Findings', 20, yPosition)
        yPosition += 5
        
        // Group findings by category
        const groupedFindings = structuredData.findings.reduce((acc, finding) => {
          const category = finding.category || 'Other';
          if (!acc[category]) acc[category] = [];
          acc[category].push(finding);
          return acc;
        }, {});
        
        const categoryIcons = {
          'Email Security': '📧',
          'DNS Integrity': '⚙️',
          'Availability & Resilience': '🌐',
          'Other': '🔍'
        };
        
        Object.entries(groupedFindings).forEach(([category, findings]) => {
          checkNewPage(20)
          
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText(`${categoryIcons[category] || '🔍'} ${category}`, 20, yPosition)
          yPosition += 3
          
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          
          findings.forEach(finding => {
            checkNewPage(15)
            
            // Finding header with severity
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`${finding.severity.toUpperCase()}: ${finding.issue}`, 25, yPosition)
            
            // Details
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`Details: ${finding.details}`, 30, yPosition)
            
            // Recommendation
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Recommendation:', 30, yPosition)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(finding.recommendation || 'Review and implement appropriate security measures.', 35, yPosition)
            yPosition += 5
          })
          yPosition += 5
        })
      }
      
      // Subdomains Section
      if (structuredData?.subdomains && structuredData.subdomains.length > 0) {
        checkNewPage(20)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Discovered Subdomains', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        structuredData.subdomains.forEach(subdomain => {
          yPosition = addText(`• ${subdomain}`, 25, yPosition)
        })
        yPosition += 10
      }
      
      // Executive Summary Section
      if (structuredData?.security_score && structuredData?.risk_summary) {
        checkNewPage(30)
        
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Executive Summary', 20, yPosition)
        yPosition += 5
        
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        
        // Security Score Summary
        doc.setFont('helvetica', 'bold')
        yPosition = addText('DNS Security Assessment:', 20, yPosition)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Security Score: ${structuredData.security_score.score}/100 (Grade: ${structuredData.security_score.grade})`, 25, yPosition)
        yPosition = addText(structuredData.security_score.description, 25, yPosition)
        yPosition += 5
        
        // Risk Summary
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Risk Assessment:', 20, yPosition)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Overall Risk: ${structuredData.risk_summary.overall_risk}`, 25, yPosition)
        yPosition = addText(`Total Issues: ${structuredData.risk_summary.total_issues} (Critical: ${structuredData.risk_summary.critical_issues}, High: ${structuredData.risk_summary.high_issues}, Medium: ${structuredData.risk_summary.medium_issues}, Low: ${structuredData.risk_summary.low_issues})`, 25, yPosition)
        yPosition = addText(structuredData.risk_summary.summary, 25, yPosition)
        yPosition += 10
        
        // Key Recommendations
        if (dnsResult.recommendations && dnsResult.recommendations.length > 0) {
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Key Recommendations:', 20, yPosition)
          doc.setFont('helvetica', 'normal')
          
          dnsResult.recommendations.slice(0, 5).forEach(recommendation => {
            checkNewPage(10)
            yPosition = addText(`• ${recommendation}`, 25, yPosition)
          })
          
          if (dnsResult.recommendations.length > 5) {
            yPosition = addText(`... and ${dnsResult.recommendations.length - 5} more recommendations`, 25, yPosition)
          }
          yPosition += 10
        }
      }
      
      // Add new scan sections
      const allResults = { ...scanResults, ...newScanResults }
      
      // SSL/TLS Analysis Section
      if (allResults['ssl-tls-analysis']) {
        checkNewPage(30)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('2. SSL/TLS Analysis', 20, yPosition)
        yPosition += 5
        
        const sslResult = allResults['ssl-tls-analysis']
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${sslResult.status}`, 20, yPosition)
        yPosition = addText(`Summary: ${sslResult.report?.summary || 'No summary available'}`, 20, yPosition)
        
        if (sslResult.report?.supportedProtocols) {
          yPosition = addText(`Supported Protocols: ${sslResult.report.supportedProtocols.join(', ')}`, 20, yPosition)
        }
        if (sslResult.report?.cipherStrength) {
          yPosition = addText(`Cipher Strength: ${sslResult.report.cipherStrength}`, 20, yPosition)
        }
        yPosition += 10
      }
      
      // Security Headers Section
      if (allResults['security-headers']) {
        checkNewPage(30)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('3. Security Headers Analysis', 20, yPosition)
        yPosition += 5
        
        const headersResult = allResults['security-headers']
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${headersResult.status}`, 20, yPosition)
        yPosition = addText(`Summary: ${headersResult.report?.summary || 'No summary available'}`, 20, yPosition)
        
        if (headersResult.report?.missingHeaders && headersResult.report.missingHeaders.length > 0) {
          yPosition = addText(`Missing Headers: ${headersResult.report.missingHeaders.join(', ')}`, 20, yPosition)
        }
        yPosition += 10
      }
      
      // CMS Detection Section
      if (allResults['cms-detection']) {
        checkNewPage(30)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('4. CMS Detection', 20, yPosition)
        yPosition += 5
        
        const cmsResult = allResults['cms-detection']
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${cmsResult.status}`, 20, yPosition)
        yPosition = addText(`Summary: ${cmsResult.report?.summary || 'No summary available'}`, 20, yPosition)
        
        if (cmsResult.report?.cms) {
          yPosition = addText(`CMS Detected: ${cmsResult.report.cms}`, 20, yPosition)
        }
        if (cmsResult.report?.server) {
          yPosition = addText(`Server: ${cmsResult.report.server}`, 20, yPosition)
        }
        yPosition += 10
      }
      
      // Subdomain Enumeration Section
      if (allResults['subdomain-enumeration']) {
        checkNewPage(30)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('5. Subdomain Enumeration', 20, yPosition)
        yPosition += 5
        
        const subdomainResult = allResults['subdomain-enumeration']
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${subdomainResult.status}`, 20, yPosition)
        yPosition = addText(`Summary: ${subdomainResult.report?.summary || 'No summary available'}`, 20, yPosition)
        
        if (subdomainResult.report?.count !== undefined) {
          yPosition = addText(`Subdomains Found: ${subdomainResult.report.count}`, 20, yPosition)
        }
        if (subdomainResult.report?.subdomainsFound && subdomainResult.report.subdomainsFound.length > 0) {
          yPosition = addText(`Subdomains: ${subdomainResult.report.subdomainsFound.slice(0, 5).join(', ')}${subdomainResult.report.subdomainsFound.length > 5 ? '...' : ''}`, 20, yPosition)
        }
        yPosition += 10
      }
      
      // Port Scanning Section
      if (allResults['port-scanning']) {
        checkNewPage(30)
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('6. Port Scanning', 20, yPosition)
        yPosition += 5
        
        const portResult = allResults['port-scanning']
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${portResult.status}`, 20, yPosition)
        yPosition = addText(`Summary: ${portResult.report?.summary || 'No summary available'}`, 20, yPosition)
        
        if (portResult.report?.totalOpen !== undefined) {
          yPosition = addText(`Open Ports: ${portResult.report.totalOpen}`, 20, yPosition)
        }
        if (portResult.report?.openPorts && portResult.report.openPorts.length > 0) {
          yPosition = addText(`Ports: ${portResult.report.openPorts.map(p => `${p.port}/${p.service}`).slice(0, 5).join(', ')}${portResult.report.openPorts.length > 5 ? '...' : ''}`, 20, yPosition)
        }
        yPosition += 10
      }
      
      // Footer with enhanced information
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      
      const currentDate = new Date();
      const generatedDateTime = currentDate.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      });
      
      doc.text('Generated by Cyberix Security Scanner', 20, pageHeight - 20)
      doc.text(`Generated on: ${generatedDateTime}`, 20, pageHeight - 10)
      doc.text(`Target: ${targetUrl}`, pageWidth - 120, pageHeight - 20)
      doc.text(`Report ID: SEC-${Date.now()}`, pageWidth - 120, pageHeight - 10)
      
      // Save the PDF with enhanced filename
      const reportDate = new Date();
      const dateStr = reportDate.toISOString().split('T')[0];
      const timeStr = reportDate.toTimeString().split(' ')[0].replace(/:/g, '-');
      const domainStr = targetUrl.replace(/[^a-zA-Z0-9]/g, '-');
      const reportFileName = `cyberix-security-report-${domainStr}-${dateStr}-${timeStr}.pdf`
      doc.save(reportFileName)
      
      showSuccess('Comprehensive security report generated successfully!')
    } catch (error) {
      console.error('❌ [PDF] Error generating security report:', error)
      showError('Failed to generate security report: ' + error.message)
    } finally {
      setIsExporting(false)
    }
  }

  // Open DNS Detail Dialog
  const openDnsDetailDialog = (result) => {
    console.log('🔍 [DNS-DIALOG] Opening DNS detail dialog for result:', result)
    setSelectedDnsResult(result)
    setShowDnsDetailDialog(true)
  }

  // Install missing tools
  const installMissingTools = async () => {
    console.log('🔧 User clicked "Install Missing Tools" button')
    console.log('📅 Installation started at:', new Date().toISOString())
    
    setIsCheckingTools(true)
    
    try {
      // Check if we have WSL credentials
      if (!hasSecurePassword()) {
        console.log('🔐 No WSL credentials found, showing password prompt')
        setIsCheckingTools(false)
        setShowPasswordPrompt(true)
        return false
      }
      
      console.log('🔐 WSL credentials found, proceeding with installation')
      const success = await ensureToolsInstalled()
      if (success) {
        console.log('✅ Tool installation completed successfully!')
        showSuccess('All tools installed successfully!')
        // Re-check tools after installation
        const status = await checkAllTools()
        setToolStatus(status)
        return true
      } else {
        console.log('❌ Tool installation failed')
        showError('Tool installation failed. Please install manually.')
        return false
      }
    } catch (error) {
      console.error('❌ Tool installation error:', error.message)
      // Check if it's an authentication error
      if (error.message && error.message.includes('authentication')) {
        showError('WSL authentication required. Please provide credentials.')
        setShowPasswordPrompt(true)
      } else {
        showError(`Tool installation failed: ${error.message}`)
      }
      return false
    } finally {
      setIsCheckingTools(false)
      console.log('📅 Installation completed at:', new Date().toISOString())
    }
  }

  // Start comprehensive security scan
  const startScan = async () => {
    console.log('🚀 User clicked "Start Scan" button')
    console.log('🎯 Target URL:', targetUrl)
    console.log('📅 Scan started at:', new Date().toISOString())
    
    if (!targetUrl.trim()) {
      console.log('❌ No target URL provided')
      showError('Please enter a target URL')
      return
    }

    // Validate URL format
    try {
      new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`)
      console.log('✅ URL format is valid')
    } catch {
      console.log('❌ Invalid URL format')
      showError('Please enter a valid URL')
      return
    }

    // Test Kali handlers first
    console.log('🔍 [SCAN-DEBUG] Testing Kali handlers...')
    try {
      if (window.cyberGuard && window.cyberGuard.testKaliHandlers) {
        const testResult = await window.cyberGuard.testKaliHandlers()
        console.log('🔍 [SCAN-DEBUG] Kali handlers test result:', testResult)
      } else {
        console.log('🔍 [SCAN-DEBUG] cyberGuard or testKaliHandlers not available')
      }
    } catch (testError) {
      console.log('🔍 [SCAN-DEBUG] Kali handlers test failed:', testError)
    }

    // Skip tool checking since we already verified during login
    console.log('🎉 Starting security scan (tools already verified during login)...')
    console.log('📊 Initializing scan state...')
    
    setIsScanning(true)
    setBackgroundScanning(true)
    setScanResults({})
    setLogs([])
    setCompletedTests(new Set())
    setTestProgress({})
    setCurrentTest(null)
    setExpandedTests(new Set())
    setExpandedFindings(new Set())
    
    const startTime = Date.now()
    setScanStartTime(startTime)
    setScanTiming({
      startTime,
      endTime: null,
      elapsedTime: 0,
      expectedCompletion: startTime + (securityTests.reduce((total, test) => total + test.estimatedTime, 0) * 1000)
    })
    
    // Set a timeout for DNS scan (2 minutes to be safe)
    scanTimeoutRef.current = setTimeout(() => {
      if (isScanning || backgroundScanning) {
        console.log('⏰ DNS scan timeout reached - forcing completion')
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '⏰ DNS scan timeout reached (2 minutes) - scan may still be running in background',
          testId: 'dns-resolution',
          type: 'warning'
        }])
        
        // Don't force completion, just log the timeout
        // The scan might still be running and will complete later
      }
    }, 120000) // 2 minutes timeout

    // Run Quick Fingerprint as the first scan and stop after it completes
    const targetBase = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`
    
    setCurrentTest({ id: 'quick-fingerprint', name: 'Quick Fingerprint' })
    setTestProgress(prev => ({ ...prev, 'quick-fingerprint': 10 }))
    
    const json = await runQuickFingerprint(targetBase)
    
    const report = {
      testId: 'quick-fingerprint',
      testName: 'Quick Fingerprint',
      category: 'Reconnaissance',
      severity: (json.severity_hint || 'informational').toLowerCase(),
      status: 'completed',
      timestamp: new Date().toISOString(),
      findings: [ 
        { 
          type: json.severity_hint === 'High' ? 'high' : json.severity_hint === 'Medium' ? 'medium' : 'info', 
          message: `Quick Fingerprint completed: ${json.plugins?.length || 0} plugins detected`, 
          details: json.summary || 'Fingerprint scan completed successfully' 
        } 
      ],
      recommendations: json.recommendation ? [ json.recommendation ] : [],
      report: { scanType: 'Quick Fingerprint', target: targetBase, summary: json }
    }
    
    setScanResults(prev => ({ ...prev, 'quick-fingerprint': report }))
    setNewScanResults(prev => ({ ...prev, 'quick-fingerprint': report }))
    setCompletedTests(prev => new Set([...(prev || new Set()), 'quick-fingerprint']))
    setTestProgress(prev => ({ ...prev, 'quick-fingerprint': 100 }))

    setCurrentTest(null)
    setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
    setIsScanning(false)
    setBackgroundScanning(false)
    showSuccess('Quick Fingerprint scan completed!')
    return
  }
  
  // Old scan code (disabled - only File Upload check runs now)
  /*
  const startScanOld = async () => {
    try {
      // Set up progress tracking via IPC with enhanced SQL injection test logging
        const progressHandler = (progress) => {
          console.log('📊 [SQL-INJECTION-PROGRESS] Received progress:', progress)
          
          // Enhanced logging for SQL injection test commands and results
          if (progress.message) {
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: progress.message,
              testId: progress.testId || 'sql-injection-test',
              type: progress.type || 'info'
            }])
          }
          
          // Update current test for SQL injection test
          if (progress.testId && progress.testId !== currentTest?.id) {
            setCurrentTest({ 
              id: progress.testId, 
              name: progress.message?.split(':')[0] || 'SQL Injection Test' 
            })
          }
          
          // Update progress for DNS analysis steps with better timing
          if (progress.message) {
            let progressValue = 0
            if (progress.message.includes('Starting DNS resolution') || progress.message.includes('Executing DNS Analysis')) progressValue = 5
            else if (progress.message.includes('Querying A records') || progress.message.includes('dig +short')) progressValue = 15
            else if (progress.message.includes('Querying MX records') || progress.message.includes('dig +noall +answer')) progressValue = 25
            else if (progress.message.includes('Querying TXT records')) progressValue = 35
            else if (progress.message.includes('Reverse DNS lookup') || progress.message.includes('dig -x')) progressValue = 45
            else if (progress.message.includes('dnsrecon') || progress.message.includes('DNS reconnaissance')) progressValue = 60
            else if (progress.message.includes('dnsenum') || progress.message.includes('DNS enumeration')) progressValue = 75
            else if (progress.message.includes('Checking SPF')) progressValue = 85
            else if (progress.message.includes('Checking DMARC')) progressValue = 90
            else if (progress.message.includes('Testing zone transfer')) progressValue = 95
            else if (progress.message.includes('completed successfully') || progress.message.includes('DNS Analysis output')) progressValue = 100
            
            if (progressValue > 0) {
              setTestProgress(prev => ({
                ...prev,
                [progress.testId || 'dns-resolution']: progressValue
              }))
            }
            
            // Add specific logging for DNS commands
            if (progress.message.includes('Executing DNS Analysis')) {
              setLogs(prev => [...prev, {
                timestamp: Date.now(),
                message: '🔍 Executing comprehensive DNS analysis commands...',
                testId: 'dns-resolution',
                type: 'info'
              }])
            }
            
            if (progress.message.includes('DNS Analysis output')) {
              setLogs(prev => [...prev, {
                timestamp: Date.now(),
                message: '📊 Processing DNS analysis output...',
                testId: 'dns-resolution',
                type: 'info'
              }])
            }
          }
        }

        const completeHandler = (results) => {
          console.log('🔍 [FRONTEND] ===== SQL INJECTION TEST COMPLETED =====')
          console.log('🔍 [FRONTEND] Raw results received:', results)
          console.log('🔍 [FRONTEND] Results type:', typeof results)
          console.log('🔍 [FRONTEND] Results keys:', results ? Object.keys(results) : 'null')
          console.log('🔍 [FRONTEND] Has tests property:', results && results.tests)
          console.log('🔍 [FRONTEND] Tests keys:', results && results.tests ? Object.keys(results.tests) : 'null')
          
          // Generic handling: if we received any tests but not the SQL one, still surface them (e.g., CSRF-only run)
          if (results && results.tests) {
            const testKeys = Object.keys(results.tests)
            if (testKeys.length > 0 && !results.tests['sql-injection-test']) {
              console.log('🔍 [FRONTEND] Non-SQL tests received, updating UI with available tests:', testKeys)
              setScanResults(prev => ({ ...prev, ...results.tests }))
              setNewScanResults(prev => ({ ...prev, ...results.tests }))
              setCompletedTests(new Set(testKeys))
              setCurrentTest(null)
              setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
              setIsScanning(false)
              setBackgroundScanning(false)
              return
            }
          }
          
          // Add completion log
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '⏱️ Kali SQL injection test completed - processing results...',
            testId: 'sql-injection-test',
            type: 'info'
          }])
          
          if (results && results.tests && results.tests['sql-injection-test']) {
            const sqlResult = results.tests['sql-injection-test']
            
            console.log('🔍 [FRONTEND] SQL injection test result details:', sqlResult)
            console.log('🔍 [FRONTEND] SQL injection test result status:', sqlResult.status)
            console.log('🔍 [FRONTEND] SQL injection test result error:', sqlResult.error)
            console.log('🔍 [FRONTEND] SQL injection test result report:', sqlResult.report)
            
            // Add success log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `✅ SQL injection test completed successfully - Status: ${sqlResult.status}`,
              testId: 'sql-injection-test',
              type: 'success'
            }])
            
            // Check if the scan actually failed - now only check status, not raw output
            // The backend will process results even when some commands fail
            if (sqlResult.status === 'failed' || sqlResult.error) {
              console.log('🔍 [FRONTEND] SQL injection test failed - showing error results')
              
              // Add failure log
              setLogs(prev => [...prev, {
                timestamp: Date.now(),
                message: '❌ SQL injection test failed - no meaningful results obtained',
                testId: 'sql-injection-test',
                type: 'error'
              }])
              
              // Set failed scan results with actual error details (merge with existing)
              setScanResults(prev => ({
                ...prev,
                'sql-injection-test': {
                  testId: 'sql-injection-test',
                  testName: 'SQL Injection Test',
                  category: 'Web Security',
                  severity: 'high',
                  status: 'failed',
                  timestamp: new Date().toISOString(),
                  error: sqlResult.error || 'SQL injection test could not be completed',
                  findings: [
                    { 
                      type: 'critical', 
                      message: 'SQL injection test failed', 
                      details: 'Unable to complete SQL injection test. This could indicate network connectivity issues, target server problems, or sqlmap tool not installed.' 
                    }
                  ],
                  recommendations: [
                    'Check network connectivity',
                    'Verify target URL accessibility',
                    'Ensure sqlmap tool is installed',
                    'Check firewall and proxy settings',
                    'Verify target web server is responding'
                  ],
                  report: {
                    summary: {
                      totalTests: 0,
                      vulnerableParameters: 0,
                      safeParameters: 0,
                      sqlInjectionTestStatus: 'failed'
                    },
                    findings: [],
                    rawOutput: sqlResult.report?.rawOutput || 'SQL injection test failed - no results obtained'
                  }
                }
              }))
              
              setCompletedTests(new Set(['sql-injection-test']))
              setCurrentTest(null)
              setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
              setIsScanning(false)
              setBackgroundScanning(false)
              
              showError('SQL injection test failed - no meaningful results obtained. Please check your network connection and try again.')
              return
            }
            
            // Add success completion log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: '✅ SQL Injection Test completed successfully!',
              testId: 'sql-injection-test',
              type: 'success'
            }])
            
            console.log('🔍 [FRONTEND] Processing successful SQL injection test results...')
            setScanResults(prev => ({ ...prev, ...results.tests }))
            // Ensure results are also mirrored into newScanResults for uniform access
            setNewScanResults(prev => ({ ...prev, ...results.tests }))
            setCompletedTests(new Set([ ...Array.from(completedTests), ...Object.keys(results.tests) ]))
            
            const criticalFindings = Object.values(results.tests).reduce((total, test) => {
              return total + (test.findings?.filter(f => f.type === 'critical').length || 0)
            }, 0)
            
            console.log('🔍 [FRONTEND] Critical findings count:', criticalFindings)
            
            // Complete the scanning process - STOP HERE as requested
            console.log('🛑 SQL injection test completed - stopping scan as requested')
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: '🛑 SQL injection test completed - stopping scan process',
              testId: 'sql-injection-test',
              type: 'info'
            }])
            
            setCurrentTest(null)
            setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
            setIsScanning(false)
            setBackgroundScanning(false)
            
            showSuccess(`SQL injection test completed! Found ${criticalFindings} critical security issues.`)
          } else {
            console.log('🔍 [FRONTEND] No valid SQL injection test results received')
            
            // Add failure log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: '❌ SQL injection test failed - no valid results received from Kali',
              testId: 'sql-injection-test',
              type: 'error'
            }])
            
            // Set failed scan results (merge with existing)
            setScanResults(prev => ({
              ...prev,
              'sql-injection-test': {
                testId: 'sql-injection-test',
                testName: 'SQL Injection Test',
                category: 'Web Security',
                severity: 'high',
                status: 'failed',
                timestamp: new Date().toISOString(),
                error: 'No valid SQL injection test results received from Kali scan',
                findings: [
                  { 
                    type: 'critical', 
                    message: 'SQL injection test failed', 
                    details: 'No valid SQL injection test results were received from the Kali scan. This could indicate a network issue, target server problem, or sqlmap tool not installed.' 
                  }
                ],
                recommendations: [
                  'Check network connectivity',
                  'Verify target URL accessibility',
                  'Ensure sqlmap tool is installed',
                  'Check firewall settings',
                  'Verify Kali tools are properly installed'
                ],
                report: {
                  summary: {
                    totalTests: 0,
                    vulnerableParameters: 0,
                    safeParameters: 0,
                    sqlInjectionTestStatus: 'failed'
                  },
                  findings: [],
                  rawOutput: 'SQL injection test failed - no valid results received from Kali'
                }
              }
            }))
            
            setCompletedTests(new Set(['sql-injection-test']))
            setCurrentTest(null)
            setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
            setIsScanning(false)
            setBackgroundScanning(false)
            
            showError('SQL injection test failed - no valid results received from Kali scan.')
          }
        }

        // Set up event listeners
        window.cyberGuard.onKaliProgress(progressHandler)
        window.cyberGuard.onKaliComplete(completeHandler)

        // Add DNS scan command logging
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `🔍 Starting DNS analysis for: ${targetUrl}`,
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '📋 DNS Analysis Commands (Kali Linux):',
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        // Extract domain for display purposes
        let displayDomain = targetUrl;
        try {
          if (targetUrl.includes('://')) {
            const url = new URL(targetUrl);
            displayDomain = url.hostname;
          } else if (targetUrl.includes('/')) {
            displayDomain = targetUrl.split('/')[0];
          }
        } catch (error) {
          displayDomain = targetUrl;
        }
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `  • Batch DNS Analysis: dig +short ${displayDomain} A && dig +noall +answer ${displayDomain} A/MX/TXT/NS/SOA && reverse DNS lookup`,
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `  • Reverse DNS: dig -x \$(dig +short ${displayDomain} A) +short`,
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `  • DNS Reconnaissance: timeout 30 dnsrecon -d ${displayDomain}`,
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `  • DNS Enumeration: timeout 30 dnsenum ${displayDomain}`,
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '⏱️ DNS scan typically takes 1-2 minutes to complete...',
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        // Start the scan via Electron IPC
        await window.cyberGuard.startKaliScan(targetUrl)
      } else {
        // Fallback: Simulate DNS scan with enhanced logging
        setIsDemoMode(true)
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '⚠️ Electron API not available - running DEMO DNS scan',
          testId: 'dns-resolution',
          type: 'warning'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '🔍 Simulating DNS commands for DEMO purposes only...',
          testId: 'dns-resolution',
          type: 'info'
        }])
        
        // Simulate DNS scan completion with demo data and enhanced logging
        setTimeout(() => {
          // Add simulated command execution logs
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📡 Executing: dig A example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '   → example.com. 300 IN A 192.168.1.100\n   → example.com. 300 IN A 192.168.1.101',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📡 Executing: dig MX example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '   → example.com. 300 IN MX 10 mail.example.com\n   → example.com. 300 IN MX 20 backup.example.com',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📡 Executing: dig TXT example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '   → example.com. 300 IN TXT "v=spf1 include:_spf.google.com ~all"',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📡 Executing: dig NS example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📡 Executing: dig SOA example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '🔍 Testing zone transfer: dig axfr example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '   → Zone transfer blocked (good security practice)',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '🔒 Checking DNSSEC: dig +dnssec example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '   → DNSSEC not enabled (security risk)',
            testId: 'dns-resolution',
            type: 'warning'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '🌐 Enumerating subdomains: subfinder -d example.com',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          const demoResults = {
            'dns-resolution': {
              testId: 'dns-resolution',
              testName: 'DNS Resolution & Analysis',
              category: 'Infrastructure',
              severity: 'high',
              status: 'completed',
              timestamp: new Date().toISOString(),
              findings: [
                { type: 'success', message: 'DNS resolution successful', details: 'Domain resolves to valid IP addresses' },
                { type: 'warning', message: 'Missing SPF record', details: 'Email spoofing protection not configured - attackers can send emails on behalf of your domain' },
                { type: 'warning', message: 'Missing DMARC record', details: 'Email authentication policy not configured - no protection against email spoofing' },
                { type: 'info', message: 'DNSSEC not enabled', details: 'DNS responses are not cryptographically signed - vulnerable to DNS cache poisoning' },
                { type: 'high', message: 'Zone transfer allowed', details: 'DNS zone transfer is not restricted - potential information disclosure' }
              ],
              recommendations: [
                'Configure SPF record to prevent email spoofing',
                'Implement DMARC policy for email authentication',
                'Enable DNSSEC for DNS integrity',
                'Restrict DNS zone transfers',
                'Monitor DNS changes regularly'
              ],
              report: {
                summary: {
                  dnssec: false,
                  zoneTransfer: 'allowed',
                  spfRecord: false,
                  dmarcRecord: false,
                  subdomainsFound: 3,
                  dnsResolutionStatus: 'successful'
                },
                records: {
                  a: ['192.168.1.100', '192.168.1.101'],
                  aaaa: ['2001:db8::1'],
                  ns: ['ns1.example.com', 'ns2.example.com'],
                  mx: ['mail.example.com (10)', 'backup.example.com (20)'],
                  txt: ['v=spf1 include:_spf.google.com ~all'],
                  subdomains: [
                    { name: 'www.example.com', ip: '192.168.1.100' },
                    { name: 'mail.example.com', ip: '192.168.1.102' },
                    { name: 'ftp.example.com', ip: '192.168.1.103' }
                  ]
                },
                rawOutput: 'dig example.com A\n\n; <<>> DiG 9.16.1-Ubuntu <<>> example.com A\n;; global options: +cmd\n;; Got answer:\n;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 12345\n;; flags: qr rd ra; QUERY: 1, ANSWER: 2, AUTHORITY: 0, ADDITIONAL: 1\n\n;; QUESTION SECTION:\n;example.com.\t\t\tIN\tA\n\n;; ANSWER SECTION:\nexample.com.\t\t\t300\tIN\tA\t192.168.1.100\nexample.com.\t\t\t300\tIN\tA\t192.168.1.101\n\n;; ADDITIONAL SECTION:\n\n;; Query time: 45 msec\n;; SERVER: 8.8.8.8#53(8.8.8.8)\n;; WHEN: Mon Jan 01 12:00:00 UTC 2024\n;; MSG SIZE  rcvd: 75'
              }
            }
          }
          
        setScanResults(prev => ({ ...prev, ...demoResults }))
          setCompletedTests(new Set(Object.keys(demoResults)))
          setCurrentTest(null)
          setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
          setIsScanning(false)
          setBackgroundScanning(false)
          
          // Add final completion log
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '✅ Demo DNS security analysis completed successfully!',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: '📊 Analysis Summary: 5 findings detected (2 warnings, 1 high risk, 2 info)',
            testId: 'dns-resolution',
            type: 'info'
          }])
          
          showSuccess('DEMO DNS scan completed! This is simulated data only. Use the desktop application for real DNS security analysis.')
        }, 3000)
      }
      
    } catch (error) {
      console.error('Scan error:', error)
      setIsScanning(false)
      setCurrentTest(null)
      showError(`Scan failed: ${error.message}`)
    }
  }
  */

  // Stop scan
  const stopScan = () => {
    setIsScanning(false)
    setBackgroundScanning(false)
    setCurrentTest(null)
    
    // Clear timeout when scan is stopped
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: '⏹️ DNS scan stopped by user',
      testId: 'dns-resolution',
      type: 'warning'
    }])
    showError('DNS scan stopped by user')
  }

  // Toggle test expansion
  const toggleTestExpansion = (testId) => {
    const newExpanded = new Set(expandedTests)
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId)
    } else {
      newExpanded.add(testId)
    }
    setExpandedTests(newExpanded)
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
    <div className="space-y-6">
      {/* Enhanced Header */}
      <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-2xl shadow-lg border border-orange-200 dark:border-slate-600 p-8 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Comprehensive Security Scanner
                </h1>
                <p className="text-base text-gray-600 dark:text-gray-400 mt-1">
                  The Comprehensive Security Scanner thoroughly analyzes your website or web application for vulnerabilities and security weaknesses. It checks everything from DNS and SSL/TLS configurations to XSS, SQL injection, and misconfigured headers. Stay safe online by identifying risks before attackers do.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowHelpDialog(true)}
              className="w-10 h-10 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-md hover:shadow-lg"
              title="View detailed scan information"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
        
        {/* Enhanced URL Input */}
        <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl p-6 border border-orange-200 dark:border-slate-600 shadow-lg">
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
              <button
                onClick={isScanning ? stopScan : startScan}
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
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Note:</strong> This scanner uses Kali Linux tools and requires WSL to be installed and configured properly.
            </p>
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
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100">DNS Security Analysis Running</h3>
              <p className="text-blue-700 dark:text-blue-300">
                Comprehensive DNS security analysis is running in the background. You can navigate to other screens while the analysis continues.
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                {currentTest ? currentTest.name : 'Initializing...'}
              </div>
              <div className="text-xs text-blue-500 dark:text-blue-300">
                {testProgress['dns-resolution'] || 0}% Complete
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scan Completion Banner */}
      {(() => {
        console.log('🔍 [UI-DEBUG] Scan completion check:')
        console.log('🔍 [UI-DEBUG] - isScanning:', isScanning)
        console.log('🔍 [UI-DEBUG] - backgroundScanning:', backgroundScanning)
        console.log('🔍 [UI-DEBUG] - completedTests.size:', completedTests.size)
        console.log('🔍 [UI-DEBUG] - securityTests.length:', securityTests.length)
        console.log('🔍 [UI-DEBUG] - scanResults:', scanResults)
        console.log('🔍 [UI-DEBUG] - scanResults keys:', scanResults ? Object.keys(scanResults) : 'null')
        console.log('🔍 [UI-DEBUG] - scanResults length:', scanResults ? Object.keys(scanResults).length : 0)
        return null
      })()}
      {!isScanning && !backgroundScanning && scanResults && Object.keys(scanResults).length > 0 && (
        <div className={`rounded-xl p-6 mb-6 ${
          isDemoMode 
            ? 'bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border border-yellow-200 dark:border-yellow-800'
            : scanResults['dns-resolution']?.status === 'failed'
            ? 'bg-gradient-to-r from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800'
            : 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800'
        }`}>
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDemoMode 
                ? 'bg-yellow-500'
                : scanResults['dns-resolution']?.status === 'failed'
                ? 'bg-red-500'
                : 'bg-green-500'
            }`}>
              {isDemoMode ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              ) : scanResults['dns-resolution']?.status === 'failed' ? (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${
                isDemoMode 
                  ? 'text-yellow-900 dark:text-yellow-100'
                  : scanResults['dns-resolution']?.status === 'failed'
                  ? 'text-red-900 dark:text-red-100'
                  : 'text-green-900 dark:text-green-100'
              }`}>
                {isDemoMode 
                  ? 'DEMO DNS Analysis Completed!'
                  : scanResults['dns-resolution']?.status === 'failed'
                  ? 'DNS Analysis Failed!'
                  : 'DNS Security Analysis Completed!'
                }
              </h3>
              <p className={`${
                isDemoMode 
                  ? 'text-yellow-700 dark:text-yellow-300'
                  : scanResults['dns-resolution']?.status === 'failed'
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-green-700 dark:text-green-300'
              }`}>
                {isDemoMode 
                  ? 'This is simulated data for demonstration purposes only. Use the desktop application for real DNS security analysis.'
                  : scanResults['dns-resolution']?.status === 'failed'
                  ? 'DNS analysis failed due to network connectivity issues. Please check your connection and try again.'
                  : 'DNS security analysis has been completed. Review the comprehensive results below for detailed findings and recommendations.'
                }
              </p>
            </div>
          </div>
          
          {/* Export PDF Button */}
          {!isDemoMode && (scanResults['dns-resolution']?.status === 'completed' || Object.keys(newScanResults).length > 0) && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Export Report</h4>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Generate comprehensive PDF report with all scan results</p>
                </div>
                <button
                  onClick={generatePDFReport}
                  disabled={isExporting}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 ${
                    isExporting
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
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
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scan Progress Overview */}
      {(isScanning || backgroundScanning || completedTests.size > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Security Analysis Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {completedTests.size}/{securityTests.length}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Analysis Completed</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {formatTime(scanTiming.elapsedTime)}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Elapsed Time</p>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {scanTiming.endTime ? formatDateTime(new Date(scanTiming.endTime)) : (scanTiming.expectedCompletion ? formatDateTime(new Date(scanTiming.expectedCompletion)) : 'N/A')}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Expected Completion</p>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Overall Progress</span>
              <span>{Math.round((completedTests.size / securityTests.length) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-orange-500 to-amber-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedTests.size / securityTests.length) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Current Test */}
          {(currentTest || backgroundScanning) && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-orange-900">
                  {backgroundScanning ? 'DNS Security Analysis' : `Currently Running: ${currentTest?.name}`}
                </h4>
                <span className="text-sm text-orange-700">{testProgress['dns-resolution'] || 0}%</span>
              </div>
              <div className="w-full bg-orange-200 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${testProgress['dns-resolution'] || 0}%` }}
                ></div>
              </div>
              {backgroundScanning && (
                <div className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                  🔄 Running in background - you can navigate to other screens
                </div>
              )}
            </div>
          )}

          {/* Real-time Logs */}
          {logs.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">DNS Analysis Logs</h4>
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      const logText = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')
                      navigator.clipboard.writeText(logText)
                      showSuccess('Logs copied to clipboard!')
                    }}
                    className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200"
                  >
                    Copy Logs
                  </button>
                  <button
                    onClick={() => setLogs([])}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear Logs
                  </button>
                </div>
              </div>
              <div 
                ref={logContainerRef}
                className="bg-gray-900 text-green-400 rounded-lg p-4 h-48 overflow-y-auto font-mono text-sm"
              >
                {logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="ml-2">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Tests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {securityTests.map((test) => {
          const isRunning = currentTest?.id === test.id
          const progress = testProgress[test.id] || 0
          const result = scanResults[test.id] || newScanResults[test.id]
          const isExpanded = expandedTests.has(test.id)
          const isCompleted = completedTests.has(test.id) || !!result
          const canOpen = !!(result && (result.status || result.report))
          
          // Debug logging for CSRF test
          if (test.id === 'csrf-test') {
            console.log('🔍 CSRF Debug - test.id:', test.id)
            console.log('🔍 CSRF Debug - scanResults[csrf-test]:', scanResults['csrf-test'])
            console.log('🔍 CSRF Debug - newScanResults[csrf-test]:', newScanResults['csrf-test'])
            console.log('🔍 CSRF Debug - result:', result)
            console.log('🔍 CSRF Debug - isCompleted:', isCompleted)
            console.log('🔍 CSRF Debug - completedTests:', Array.from(completedTests))
          }

          return (
            <div
              key={test.id}
              className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-200 ${
                canOpen
                  ? 'border-green-200 dark:border-green-800'
                  : isRunning
                  ? 'border-orange-200 dark:border-orange-800'
                  : 'border-gray-200 dark:border-slate-700'
              } hover:shadow-md ${canOpen ? 'cursor-pointer' : ''}`}
              onClick={canOpen ? () => {
                console.log('🔍 Card clicked:', test.id)
                console.log('🔍 isCompleted:', isCompleted)
                console.log('🔍 result exists:', !!result)
                console.log('🔍 result:', result)
                if (test.id === 'dns-resolution') {
                  openDnsDetailDialog(result);
                } else {
                  openScanDetailDialog(test.id, result);
                }
              } : undefined}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isCompleted
                        ? 'bg-green-100 dark:bg-green-900/20'
                        : isRunning
                        ? 'bg-orange-100 dark:bg-orange-900/20'
                        : 'bg-gray-100 dark:bg-slate-700'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : isRunning ? (
                        <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{test.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{test.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      test.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                      test.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                      test.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                    }`}>
                      {test.severity}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{test.description}</p>
                
                {/* About Section */}
                <div className="mb-4">
                  <button
                    onClick={() => toggleTestExpansion(test.id)}
                    className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    <span>About this test</span>
                    <svg 
                      className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{test.detailedDescription}</p>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        <p><strong>Estimated time:</strong> {test.estimatedTime} seconds</p>
                        <p><strong>Category:</strong> {test.category}</p>
                        <p><strong>Severity:</strong> {test.severity}</p>
                      </div>
                      
                      {/* Special DNS Results Display */}
                      {test.id === 'dns-resolution' && result && result.report && (
                        <div className="mt-4 space-y-4">
                          <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">DNS Analysis Results</h5>
                          
                          {/* Summary Section */}
                          {result.report.summary && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                              <h6 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Summary</h6>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">DNSSEC:</span>
                                  <span className={`font-medium ${result.report.summary.dnssec ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {result.report.summary.dnssec ? 'Enabled' : 'Disabled'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">Zone Transfer:</span>
                                  <span className={`font-medium ${result.report.summary.zoneTransfer === 'blocked' ? 'text-green-600' : 'text-red-600'}`}>
                                    {result.report.summary.zoneTransfer === 'blocked' ? 'Blocked' : 'Allowed'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">SPF Record:</span>
                                  <span className={`font-medium ${result.report.summary.spfRecord ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {result.report.summary.spfRecord ? 'Configured' : 'Missing'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">DMARC Record:</span>
                                  <span className={`font-medium ${result.report.summary.dmarcRecord ? 'text-green-600' : 'text-yellow-600'}`}>
                                    {result.report.summary.dmarcRecord ? 'Configured' : 'Missing'}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600 dark:text-gray-400">Subdomains:</span>
                                  <span className="font-medium text-blue-600">{result.report.summary.subdomainsFound}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Record Details */}
                          {result.report.records && (
                            <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                              <h6 className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-3">Record Details</h6>
                              <div className="space-y-2 text-xs">
                                {result.report.records.a && result.report.records.a.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">A Records:</span>
                                    <div className="ml-2 text-gray-600 dark:text-gray-400">
                                      {result.report.records.a.map((ip, idx) => (
                                        <div key={idx} className="font-mono">{ip}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {result.report.records.ns && result.report.records.ns.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">NS Records:</span>
                                    <div className="ml-2 text-gray-600 dark:text-gray-400">
                                      {result.report.records.ns.map((ns, idx) => (
                                        <div key={idx}>{ns}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {result.report.records.mx && result.report.records.mx.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">MX Records:</span>
                                    <div className="ml-2 text-gray-600 dark:text-gray-400">
                                      {result.report.records.mx.map((mx, idx) => (
                                        <div key={idx}>{mx}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {result.report.records.txt && result.report.records.txt.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">TXT Records:</span>
                                    <div className="ml-2 text-gray-600 dark:text-gray-400">
                                      {result.report.records.txt.map((txt, idx) => (
                                        <div key={idx} className="font-mono text-xs break-all">{txt}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {result.report.records.subdomains && result.report.records.subdomains.length > 0 && (
                                  <div>
                                    <span className="font-medium text-gray-700 dark:text-gray-300">Subdomains:</span>
                                    <div className="ml-2 text-gray-600 dark:text-gray-400">
                                      {result.report.records.subdomains.map((sub, idx) => (
                                        <div key={idx} className="font-mono">
                                          {sub.name} → {sub.ip}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Raw Output (Collapsible) */}
                          {result.report.rawOutput && (
                            <details className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
                              <summary className="text-xs font-semibold text-gray-900 dark:text-gray-100 p-4 cursor-pointer">
                                Raw Command Output
                              </summary>
                              <div className="px-4 pb-4">
                                <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                                  {result.report.rawOutput}
                                </pre>
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Criticality Information - Only show if test is completed and has critical findings */}
                {result && result.findings && result.findings.some(f => f.type === 'critical') && test.criticality && (
                  <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">Critical Impact:</p>
                    <p className="text-xs text-red-700 dark:text-red-300">{test.criticality}</p>
                  </div>
                )}
                
                {/* Fix Recommendations - Only show if test is completed and has critical findings */}
                {result && result.findings && result.findings.some(f => f.type === 'critical') && test.fixRecommendations && test.fixRecommendations.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Key Fixes:</p>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      {test.fixRecommendations.slice(0, 3).map((rec, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-orange-500 mr-1">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Progress Bar */}
                {(isRunning || isCompleted) && (
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isCompleted ? 'bg-green-500' : 'bg-orange-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Test Results */}
                {(() => {
                  if (!result) {
                    return (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings:</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400">No results yet</p>
                      </div>
                    )
                  }

                  const criticalFindings = result.findings?.filter(f => f.type === 'critical') || []
                  const highFindings = result.findings?.filter(f => f.type === 'high') || []
                  const mediumFindings = result.findings?.filter(f => f.type === 'medium') || []
                  const lowFindings = result.findings?.filter(f => f.type === 'warning') || []
                  const infoFindings = result.findings?.filter(f => f.type === 'info' || f.type === 'success') || []

                  return (
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings:</h4>
                      
                      {/* Findings Summary */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {criticalFindings.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span className="text-red-600 dark:text-red-400">{criticalFindings.length} Critical</span>
                          </div>
                        )}
                        {highFindings.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                            <span className="text-orange-600 dark:text-orange-400">{highFindings.length} High</span>
                          </div>
                        )}
                        {mediumFindings.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                            <span className="text-yellow-600 dark:text-yellow-400">{mediumFindings.length} Medium</span>
                          </div>
                        )}
                        {lowFindings.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                            <span className="text-blue-600 dark:text-blue-400">{lowFindings.length} Low</span>
                          </div>
                        )}
                        {infoFindings.length > 0 && (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-green-600 dark:text-green-400">{infoFindings.length} Info</span>
                          </div>
                        )}
                      </div>

                      {/* Result Preview Summary */}
                      <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Result Summary:</h5>
                        <div className="space-y-1">
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Status:</span> 
                            <span className={`ml-1 ${
                              result.status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}>
                              {result.status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Findings:</span> {result.findings?.length || 0}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            <span className="font-medium">Recommendations:</span> {result.recommendations?.length || 0}
                          </div>
                          {result.timestamp && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium">Completed:</span> {formatDateTime(new Date(result.timestamp))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scan Summary Statistics */}
      {!isScanning && scanResults && Object.keys(scanResults).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">DNS Security Analysis Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const allFindings = Object.values(scanResults).flatMap(result => result.findings || [])
              const criticalCount = allFindings.filter(f => f.type === 'critical').length
              const highCount = allFindings.filter(f => f.type === 'high').length
              const mediumCount = allFindings.filter(f => f.type === 'medium').length
              const lowCount = allFindings.filter(f => f.type === 'warning').length
              const infoCount = allFindings.filter(f => f.type === 'info' || f.type === 'success').length

              return (
                <>
                  <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{criticalCount}</div>
                    <p className="text-sm text-red-700 dark:text-red-300">Critical</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{highCount}</div>
                    <p className="text-sm text-orange-700 dark:text-orange-300">High</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{mediumCount}</div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">Medium</p>
                  </div>
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{lowCount + infoCount}</div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">Low/Info</p>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Download Report Section */}
      {!isScanning && !backgroundScanning && scanResults && Object.keys(scanResults).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Download DNS Security Report</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Download a comprehensive DNS security analysis report in PDF format for detailed documentation and further analysis.
          </p>
          <div className="flex space-x-4">
            <button 
              onClick={generatePDFReport}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Download DNS Report (PDF)</span>
            </button>
          </div>
        </div>
      )}

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
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
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
                      {/* 📧 Email Security Section */}
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <span className="text-xl mr-2">📧</span>
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

                      {/* ⚙️ DNS Integrity Section */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <span className="text-xl mr-2">⚙️</span>
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

                      {/* 🌐 Availability & Resilience Section */}
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                          <span className="text-xl mr-2">🌐</span>
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
                      
                      {/* Group findings by category */}

                  {/* Reverse DNS */}
                  {selectedDnsResult.report?.reverse_dns && (
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Reverse DNS (PTR)</h3>
                      <div className="bg-white/60 dark:bg-slate-800/60 rounded p-4">
                        {selectedDnsResult.report.reverse_dns.available ? (
                          <div>
                            <p className="text-sm text-green-600 dark:text-green-400 mb-2">✅ Reverse DNS available</p>
                            <p className="text-sm font-mono text-gray-600 dark:text-gray-400">
                              {selectedDnsResult.report.reverse_dns.hostname}
                            </p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">⚠️ Reverse DNS lookup failed or timed out</p>
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
                          );
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
                  onClick={() => setShowScanDetailDialog(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Scan Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {selectedScanResult.result?.status === 'completed' ? '✅' : '❌'}
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

                  {selectedScanResult.result.report.scanType === 'Subdomain Enumeration' && selectedScanResult.result.report.subdomainsFound && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Discovered Subdomains</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {selectedScanResult.result.report.subdomainsFound.map((subdomain, idx) => (
                          <div key={idx} className="p-2 bg-gray-50 dark:bg-slate-700 rounded text-sm font-mono text-gray-600 dark:text-gray-400">
                            {subdomain}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DNS Resolution & Analysis Results */}
                  {(selectedScanResult.result.report.scanType === 'DNS Resolution & Analysis' || selectedScanResult.result.report.scanType === 'DNS Analysis') && (
                    <div className="space-y-6">
                      {/* DNS Summary */}
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
                        
                        {/* Security Score */}
                        {selectedScanResult.result.report.security_score && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Security Score:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.security_score.score}/100</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Grade:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.security_score.grade}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Total Issues:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.risk_summary?.total_issues || 0}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">Critical Issues:</span>
                              <span className="ml-2 text-gray-600 dark:text-gray-400">{selectedScanResult.result.report.risk_summary?.critical_issues || 0}</span>
                            </div>
                          </div>
                        )}
                      </div>

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
                                        {record}
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
                            {selectedScanResult.result.report.dnssec.enabled ? '✅ DNSSEC is enabled' : '❌ DNSSEC is not enabled'}
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
                            {selectedScanResult.result.report.zone_transfer.allowed ? '❌ Zone transfer is allowed (security risk)' : '✅ Zone transfer is blocked (secure)'}
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
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {selectedScanResult.result.report.summary}
                        </p>
                        
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
                      );
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
      {showHelpDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    Detailed Description of All Scans
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Learn about each security scan and why it matters
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowHelpDialog(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* DNS Resolution & Analysis */}
              <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                    </svg>
                  </div>
                  DNS Resolution & Analysis
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks your domain name system (DNS) setup and resolves IP addresses correctly.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Misconfigured DNS can make your site unreachable or vulnerable to DNS attacks.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> DNS is like the phonebook of the internet—if the phonebook is wrong, no one can reach you.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures your website is reliably accessible and protected from DNS hijacking.</p>
                </div>
              </div>

              {/* SSL/TLS Analysis */}
              <div className="group bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  SSL/TLS Analysis
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Verifies your website's encryption and secure protocols.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Weak SSL/TLS allows attackers to intercept sensitive data.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> SSL/TLS is the invisible shield protecting online banking, email, and login credentials.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps user data safe during transmission, enhancing trust.</p>
                </div>
              </div>

              {/* Security Headers */}
              <div className="group bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-teal-500 dark:border-teal-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  Security Headers
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks HTTP headers like Content-Security-Policy and X-Frame-Options.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Headers prevent attacks like clickjacking, XSS, and code injection.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Missing headers can let hackers "trick" browsers into executing malicious scripts.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Adds an extra layer of defense for visitors' browsers.</p>
                </div>
              </div>

              {/* CMS Detection */}
              <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  CMS Detection
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies if your site is running WordPress, Joomla, Drupal, etc.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Knowing the CMS helps spot known vulnerabilities quickly.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Hackers often target outdated CMS versions—they are low-hanging fruit.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps keep your site updated and secure.</p>
                </div>
              </div>

              {/* Subdomain Enumeration */}
              <div className="group bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Subdomain Enumeration
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Finds all subdomains associated with your domain.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Hidden subdomains can expose sensitive areas to attackers.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many breaches occur via forgotten subdomains.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Gives you a complete picture of your online footprint.</p>
                </div>
              </div>

              {/* Port Scanning */}
              <div className="group bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-teal-500 dark:border-teal-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  Port Scanning
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks open network ports on your server.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Open ports can be exploited to gain unauthorized access.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Hackers often scan ports before launching attacks.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps secure your server from unnecessary exposure.</p>
                </div>
              </div>

              {/* SQL Injection Test */}
              <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                  </div>
                  SQL Injection Test
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects vulnerabilities where attackers can inject malicious SQL commands.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> SQL injections can leak or delete sensitive data.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> SQL injection has caused some of the biggest data breaches in history.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects your database and user information.</p>
                </div>
              </div>

              {/* Cross-Site Scripting (XSS) Testing */}
              <div className="group bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  Cross-Site Scripting (XSS) Testing
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies if attackers can inject malicious scripts into your site.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> XSS can steal cookies, session tokens, or even redirect users.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many phishing attacks rely on XSS vulnerabilities.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps your site safe from malicious scripts affecting users.</p>
                </div>
              </div>

              {/* Cross-Site Request Forgery (CSRF) Testing */}
              <div className="group bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-yellow-500 dark:border-yellow-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9H15a2 2 0 002-2V5a2 2 0 00-2-2h-.878M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Cross-Site Request Forgery (CSRF) Testing
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks if attackers can trick users into performing unwanted actions.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> CSRF can let hackers transfer money, change passwords, or delete data.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> CSRF attacks exploit trust between a user's browser and the website.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects user actions and sensitive transactions.</p>
                </div>
              </div>

              {/* WAF (Firewall) Detection */}
              <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  WAF (Firewall) Detection
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects if a Web Application Firewall is active.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> WAFs block malicious traffic and attacks.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Not all WAFs are equal—some let advanced attacks slip through.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures your firewall is in place and functioning correctly.</p>
                </div>
              </div>

              {/* File Upload Vulnerability Check */}
              <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  File Upload Vulnerability Check
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Tests if uploaded files can execute malicious code.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Vulnerable upload features can allow malware or ransomware.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Even an image file can hide malicious scripts.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps users and servers safe from harmful uploads.</p>
                </div>
              </div>

              {/* Certificate Transparency (CT) Log Subdomain Discovery */}
              <div className="group bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-purple-500 dark:border-purple-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  Certificate Transparency (CT) Log Subdomain Discovery
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks CT logs to find subdomains and SSL certificates.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps detect rogue certificates or shadow subdomains.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> CT logs are a public record of SSL certificates issued for your domain.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps prevent impersonation or phishing attacks.</p>
                </div>
              </div>

              {/* HTTP Allowed Methods Check */}
              <div className="group bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  HTTP Allowed Methods Check
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks which HTTP methods (GET, POST, PUT, DELETE) your server allows.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Unsafe methods can let attackers modify data or access sensitive endpoints.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many servers leave dangerous methods enabled by default.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Minimizes server attack surface.</p>
                </div>
              </div>

              {/* Host Trust Verification */}
              <div className="group bg-gradient-to-br from-blue-50 to-teal-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  Host Trust Verification
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Ensures the server is legitimate and not maliciously impersonated.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps prevent man-in-the-middle attacks.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> A fake host can intercept all communications with your website.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects users from fake or phishing websites.</p>
                </div>
              </div>

              {/* CORS Policy Validation */}
              <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  CORS Policy Validation
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks Cross-Origin Resource Sharing (CORS) settings.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Poor CORS settings can let malicious sites access sensitive data.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Misconfigured CORS is a common vulnerability in modern web apps.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures data is shared safely across trusted domains.</p>
                </div>
              </div>

              {/* Open Redirect Check */}
              <div className="group bg-gradient-to-br from-orange-50 to-red-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                  Open Redirect Check
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects if your site redirects users to malicious URLs.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Open redirects are often used in phishing scams.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> A single open redirect can make users fall for scams even on trusted domains.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps users from being tricked or redirected to unsafe sites.</p>
                </div>
              </div>

              {/* Quick Fingerprint */}
              <div className="group bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  Quick Fingerprint
                </h3>
                <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies the technologies, frameworks, and server software your site uses.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps you understand your attack surface and potential vulnerabilities.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Attackers often start by fingerprinting a site to find weak points.</p>
                  <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps admins make informed decisions about updates and security measures.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ComprehensiveSecurityScanner;
