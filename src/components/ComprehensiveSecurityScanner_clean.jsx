import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import FrameworkDetector from '../scanners/framework-detection'

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
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)

  // Define security tests - All 6 core security tests are now enabled
  const securityTests = [
    {
      id: 'dns-resolution',
      name: 'DNS Resolution & Analysis',
      description: 'Analyze DNS records, check for DNS hijacking, and validate domain configuration',
      detailedDescription: 'DNS analysis examines A, MX, TXT, NS, SOA, and PTR records to identify security misconfigurations. This test checks for missing SPF/DKIM/DMARC records, validates MX targets, detects PTR mismatches, and verifies NS delegation to prevent domain hijacking and email spoofing attacks.',
      category: 'Infrastructure',
      estimatedTime: 30,
      severity: 'info',
      criticality: 'DNS vulnerabilities can lead to complete domain takeover, email spoofing, and traffic redirection to malicious servers.',
      fixRecommendations: [
        'Implement DNSSEC for DNS integrity',
        'Configure proper SPF, DKIM, and DMARC records',
        'Use DNS monitoring services',
        'Regularly audit DNS configurations'
      ]
    },
    {
      id: 'ssl-tls-analysis',
      name: 'SSL/TLS Certificate Analysis',
      description: 'Examine certificate validity, cipher suites, and TLS configuration',
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
      name: 'Security Headers Analysis',
      description: 'Check for missing security headers like CSP, HSTS, X-Frame-Options',
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
      name: 'CMS & Framework Detection',
      description: 'Identify content management system and detect version information',
      detailedDescription: 'CMS and framework detection examines web server information, CMS/framework name and version, and detected plugins/themes. This test identifies outdated CMS versions, known vulnerable versions, and public admin panels that could provide attackers with specific vulnerability targets and exploit paths.',
      category: 'Reconnaissance',
      estimatedTime: 60,
      severity: 'info',
      criticality: 'Outdated CMS versions and exposed version information provide attackers with specific vulnerability targets and exploit paths.',
      fixRecommendations: [
        'Keep CMS and plugins updated',
        'Hide version information',
        'Remove default admin paths',
        'Implement security plugins',
        'Regular security audits'
      ]
    },
    {
      id: 'subdomain-enumeration',
      name: 'Subdomain Enumeration',
      description: 'Discover subdomains and check for subdomain takeover vulnerabilities',
      detailedDescription: 'Subdomain enumeration uses multiple techniques including DNS brute-forcing, certificate transparency logs, and search engine queries to discover subdomains. This test identifies exposed administrative interfaces, development environments, and subdomain takeover vulnerabilities that could provide attackers with additional attack surface.',
      category: 'Reconnaissance',
      estimatedTime: 90,
      severity: 'medium',
      criticality: 'Exposed subdomains can reveal additional attack surface, administrative interfaces, and potential subdomain takeover vulnerabilities.',
      fixRecommendations: [
        'Monitor subdomain registrations',
        'Secure administrative subdomains',
        'Remove unused DNS entries',
        'Implement subdomain takeover protection',
        'Regular subdomain audits'
      ]
    },
    {
      id: 'port-scanning',
      name: 'Port Scanning & Service Detection',
      description: 'Identify open ports, services, and potential vulnerabilities',
      detailedDescription: 'Port scanning and service detection identifies open network ports, running services, and their versions. This test reveals exposed services, outdated software versions, and potential entry points that attackers could exploit to gain unauthorized access to systems.',
      category: 'Infrastructure',
      estimatedTime: 120,
      severity: 'high',
      criticality: 'Open ports and exposed services provide direct attack vectors for unauthorized access, data breaches, and system compromise.',
      fixRecommendations: [
        'Close unnecessary ports',
        'Update outdated services',
        'Implement network segmentation',
        'Use firewall rules',
        'Regular port audits'
      ]
    }
    // NOTE: Additional security tests can be added here in the future
  ]

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

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

  // Start comprehensive security scan
  const startScan = async () => {
    if (!targetUrl.trim()) {
      showError('Please enter a target URL')
      return
    }

    // Validate URL format
    try {
      new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`)
    } catch {
      showError('Please enter a valid URL')
      return
    }

    setIsScanning(true)
    setScanResults({})
    setLogs([])
    setCompletedTests(new Set())
    setTestProgress({})
    setCurrentTest(null)
    setExpandedTests(new Set())
    setExpandedFindings(new Set())
    
    const startTime = Date.now()
    setScanTiming({
      startTime,
      endTime: null,
      elapsedTime: 0,
      expectedCompletion: startTime + (securityTests.reduce((total, test) => total + test.estimatedTime, 0) * 1000)
    })

    showLoading('Starting comprehensive security scan...')

    try {
      const { KaliSecurityScanner } = await import('../scanners/kali-security-scanner')
      
      const scanner = new KaliSecurityScanner(targetUrl, `./temp-scans/security-scan-${Date.now()}`)
      
      // Set up progress tracking
      scanner.setProgressCallback((progress) => {
        setLogs(prev => [...prev, progress])
        setCurrentTest({ id: progress.testId, name: progress.message.split(':')[0] })
        
        // Update progress for current test
        setTestProgress(prev => ({
          ...prev,
          [progress.testId]: Math.min((prev[progress.testId] || 0) + 10, 100)
        }))
      })

      scanner.setCompleteCallback((results) => {
        setScanResults(results.tests)
        setCompletedTests(new Set(Object.keys(results.tests)))
        setCurrentTest(null)
        setScanTiming(prev => ({ ...prev, endTime: Date.now() }))
        setIsScanning(false)
        
        showSuccess(`Security scan completed! Found ${results.summary.totalTests} tests with ${results.summary.criticalFindings} critical findings.`)
      })

      // Start the scan
      await scanner.runAllTests()
      
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
    setCurrentTest(null)
    showError('Scan stopped by user')
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
                  Advanced cybersecurity analysis using Kali Linux tools
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
              Why 6 Core Security Tests?
            </h2>
            <p className="text-orange-800 dark:text-orange-200 mb-6">
              Our comprehensive security scanner focuses on the 6 most critical security areas that provide maximum coverage with minimal false positives. Each test uses proven Kali Linux tools to deliver accurate, actionable results.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔍 DNS Analysis</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Prevents domain hijacking and email spoofing</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔒 SSL/TLS Analysis</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Ensures secure communications and compliance</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🛡️ Security Headers</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Protects against XSS and clickjacking</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔍 CMS Detection</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Identifies vulnerable software versions</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🌐 Subdomain Enum</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Discovers hidden attack surfaces</p>
              </div>
              <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-orange-200 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">🔌 Port Scanning</h3>
                <p className="text-sm text-orange-700 dark:text-orange-300">Maps exposed services and vulnerabilities</p>
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

      {/* Scan Completion Banner */}
      {!isScanning && completedTests.size === securityTests.length && scanResults && Object.keys(scanResults).length > 0 && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl p-6 mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">Scan Completed Successfully!</h3>
              <p className="text-green-700 dark:text-green-300">
                All {securityTests.length} security tests have been completed. Review the results below for detailed findings and recommendations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scan Progress Overview */}
      {(isScanning || completedTests.size > 0) && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Progress</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {completedTests.size}/{securityTests.length}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Tests Completed</p>
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
          {currentTest && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-orange-900">Currently Running: {currentTest.name}</h4>
                <span className="text-sm text-orange-700">{testProgress[currentTest.id] || 0}%</span>
              </div>
              <div className="w-full bg-orange-200 rounded-full h-2">
                <div 
                  className="bg-orange-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${testProgress[currentTest.id] || 0}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Real-time Logs */}
          {logs.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">Scan Logs</h4>
                <div className="flex space-x-2">
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
          const isCompleted = completedTests.has(test.id)
          const isRunning = currentTest?.id === test.id
          const progress = testProgress[test.id] || 0
          const result = scanResults[test.id]
          const isExpanded = expandedTests.has(test.id)

          return (
            <div
              key={test.id}
              className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-200 ${
                isCompleted
                  ? 'border-green-200 dark:border-green-800'
                  : isRunning
                  ? 'border-orange-200 dark:border-orange-800'
                  : 'border-gray-200 dark:border-slate-700'
              } hover:shadow-md`}
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
      {!isScanning && completedTests.size === securityTests.length && scanResults && Object.keys(scanResults).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Summary</h3>
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
      {!isScanning && completedTests.size === securityTests.length && scanResults && Object.keys(scanResults).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Download Report</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Download a comprehensive security report in multiple formats for further analysis and documentation.
          </p>
          <div className="flex space-x-4">
            <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
              Download JSON
            </button>
            <button className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors">
              Download PDF
            </button>
            <button className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors">
              Download CSV
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ComprehensiveSecurityScanner
