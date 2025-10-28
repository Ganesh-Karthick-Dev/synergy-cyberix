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
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)
  const scanTimeoutRef = useRef(null)

  // Define security tests - REVERSE ORDER for debugging (newest scans first)
  // Final order will be: 1.DNS 2.SSL/TLS 3.Security Headers 4.CMS 5.Subdomain 6.Port 7.SQL 8.XSS
  // Current reverse order: 8.XSS 7.SQL 6.Port 5.Subdomain 4.CMS 3.Security Headers 2.SSL/TLS 1.DNS
  const securityTests = [
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
    // {
    //   id: 'ssl-tls-analysis',
    //   name: 'SSL/TLS Certificate Analysis',
    //   description: 'Examine certificate validity, cipher suites, and TLS configuration',
    //   detailedDescription: 'SSL/TLS analysis examines certificate subject, issuer, validity, SANs, key size, signature algorithm, and supported protocols/ciphers. This test identifies expired or self-signed certificates, weak signature algorithms or ciphers, missing SANs, and incomplete certificate chains that could compromise secure communications.',
    //   category: 'Infrastructure',
    //   estimatedTime: 45,
    //   severity: 'high',
    //   criticality: 'Weak SSL/TLS configurations can lead to man-in-the-middle attacks, data interception, and compliance violations.',
    //   fixRecommendations: [
    //     'Use strong cipher suites (AES-256, ChaCha20)',
    //     'Disable weak protocols (SSL 2.0/3.0, TLS 1.0/1.1)',
    //     'Implement certificate transparency monitoring',
    //     'Configure HSTS headers',
    //     'Regular certificate renewal and monitoring'
    //   ]
    // },
    // {
    //   id: 'security-headers',
    //   name: 'Security Headers Analysis',
    //   description: 'Check for missing security headers like CSP, HSTS, X-Frame-Options',
    //   detailedDescription: 'Security headers analysis examines full HTTP headers including CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and cookie security settings. This test identifies missing CSP or HSTS headers, insecure cookies, and absent clickjacking/XFO headers that could expose applications to client-side attacks.',
    //   category: 'Web Security',
    //   estimatedTime: 20,
    //   severity: 'medium',
    //   criticality: 'Missing security headers leave applications vulnerable to XSS, clickjacking, MIME sniffing, and other client-side attacks.',
    //   fixRecommendations: [
    //     'Implement Content Security Policy (CSP)',
    //     'Add X-Frame-Options header',
    //     'Configure X-Content-Type-Options',
    //     'Set Referrer-Policy header',
    //     'Enable HSTS for HTTPS sites'
    //   ]
    // },
    // {
    //   id: 'cms-detection',
    //   name: 'CMS & Framework Detection',
    //   description: 'Identify content management system and detect version information',
    //   detailedDescription: 'CMS and framework detection examines web server information, CMS/framework name and version, and detected plugins/themes. This test identifies outdated CMS versions, known vulnerable versions, and public admin panels that could provide attackers with specific vulnerability targets and exploit paths.',
    //   category: 'Reconnaissance',
    //   estimatedTime: 60,
    //   severity: 'info',
    //   criticality: 'Outdated CMS versions and exposed version information provide attackers with specific vulnerability targets and exploit paths.',
    //   fixRecommendations: [
    //     'Keep CMS and plugins updated',
    //     'Hide version information',
    //     'Remove default admin paths',
    //     'Implement security plugins',
    //     'Regular security audits'
    //   ]
    // },
    // {
    //   id: 'subdomain-enumeration',
    //   name: 'Subdomain Enumeration',
    //   description: 'Discover subdomains and check for subdomain takeover vulnerabilities',
    //   detailedDescription: 'Subdomain enumeration uses multiple techniques including DNS brute-forcing, certificate transparency logs, and search engine queries to discover subdomains. This test identifies exposed administrative interfaces, development environments, and subdomain takeover vulnerabilities that could provide attackers with additional attack surface.',
    //   category: 'Reconnaissance',
    //   estimatedTime: 90,
    //   severity: 'medium',
    //   criticality: 'Exposed subdomains can reveal additional attack surface, administrative interfaces, and potential subdomain takeover vulnerabilities.',
    //   fixRecommendations: [
    //     'Monitor subdomain registrations',
    //     'Secure administrative subdomains',
    //     'Remove unused DNS entries',
    //     'Implement subdomain takeover protection',
    //     'Regular subdomain audits'
    //   ]
    // },
    // {
    //   id: 'port-scanning',
    //   name: 'Port Scanning & Service Detection',
    //   description: 'Identify open ports, services, and potential vulnerabilities',
    //   detailedDescription: 'Port scanning and service detection identifies open network ports, running services, and their versions. This test reveals exposed services, outdated software versions, and potential entry points that attackers could exploit to gain unauthorized access to systems.',
    //   category: 'Infrastructure',
    //   estimatedTime: 120,
    //   severity: 'high',
    //   criticality: 'Open ports and exposed services provide direct attack vectors for unauthorized access, data breaches, and system compromise.',
    //   fixRecommendations: [
    //     'Close unnecessary ports',
    //     'Update outdated services',
    //     'Implement network segmentation',
    //     'Use firewall rules',
    //     'Regular port audits'
    //   ]
    // }
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
      yPosition = addText('1. DNS Resolution & Analysis', 20, yPosition)
      yPosition = addText('2. SSL/TLS Analysis', 20, yPosition)
      yPosition = addText('3. Security Headers Analysis', 20, yPosition)
      yPosition = addText('4. CMS Detection', 20, yPosition)
      yPosition = addText('5. Subdomain Enumeration', 20, yPosition)
      yPosition = addText('6. Port Scanning', 20, yPosition)
      yPosition += 15
      
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

    console.log('✅ Scan state initialized, beginning SQL injection test...')
    // Add initial SQL injection test log
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: '🚀 Starting SQL Injection Test...',
      testId: 'sql-injection-test'
    }])

    try {
      // Use Electron's IPC to communicate with the main process for scanning
      if (window.cyberGuard && window.cyberGuard.startKaliScan) {
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
              setScanResults(results.tests)
              setNewScanResults(results.tests)
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
              
              // Set failed scan results with actual error details
              setScanResults({
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
              })
              
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
            setScanResults(results.tests)
            // Ensure results are also mirrored into newScanResults for uniform access
            setNewScanResults(results.tests)
            setCompletedTests(new Set(Object.keys(results.tests)))
            
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
            
            // Set failed scan results
            setScanResults({
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
            })
            
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
          
          setScanResults(demoResults)
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
              <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Comprehensive Security Scanner
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-400 mt-1">
                  Complete security analysis including DNS, SSL/TLS, headers, CMS detection, subdomains, and port scanning
                </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced Why 20 Defensive Attacks Section - Orange Theme */}
        <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-900/20 dark:via-amber-900/20 dark:to-yellow-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-8 mb-8 relative overflow-hidden">
          {/* Background Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-0 left-0 w-20 h-20 bg-orange-500 rounded-full -translate-y-10 -translate-x-10"></div>
            <div className="absolute bottom-0 right-0 w-16 h-16 bg-amber-500 rounded-full translate-y-8 translate-x-8"></div>
          </div>
          
          <div className="relative z-10">
            <h2 className="text-2xl font-bold text-orange-900 dark:text-orange-100 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Comprehensive Security Analysis
            </h2>
            <p className="text-orange-800 dark:text-orange-200 mb-6">
              Our comprehensive security scanner provides complete analysis across multiple attack vectors including DNS vulnerabilities, SSL/TLS configurations, security headers, CMS detection, subdomain enumeration, and port scanning. This multi-layered approach delivers deep, actionable insights using advanced Kali Linux tools.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔍 DNS Record Analysis</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Comprehensive A, AAAA, MX, TXT, NS, SOA record examination</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔐 SSL/TLS Analysis</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Certificate validation, cipher strength, and protocol analysis</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🛡️ Security Headers</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">HTTP security headers analysis and missing header detection</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔍 CMS Detection</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Content management system and framework identification</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🌐 Subdomain Discovery</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Advanced subdomain enumeration and takeover detection</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔌 Port Scanning</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Open port detection and service identification</p>
              </div>
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

                  {/* CSRF Scan Results */}
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
          </div>
        </div>
      )}
    </div>
  )
}

export default ComprehensiveSecurityScanner
