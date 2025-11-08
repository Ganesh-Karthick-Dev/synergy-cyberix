import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import FrameworkDetector from '../scanners/framework-detection'
import ToolInstaller from './ToolInstaller'
import WslPasswordPrompt from './WslPasswordPrompt'
import ToolInstallationDialog from './ToolInstallationDialog'
import { ensureToolsInstalled, checkAllTools } from '../utils/toolChecker'
import { hasSecurePassword } from '../utils/securePasswordStorage'
import { getAISuggestions, formatAISuggestions } from '../utils/grokApi'

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
      const jsPDF = (await import('jspdf')).default
      const doc = new jsPDF()
      
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const borderMargin = 10
      const footerHeight = 20
      let yPos = margin + 10
      let pageNumber = 1
      const totalPages = 1 // Will be updated after content is added
      
      // Function to draw page border (only on each page, not around content)
      const drawPageBorder = () => {
        doc.setDrawColor(80, 80, 80)
        doc.setLineWidth(0.8)
        doc.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      }
      
      // Function to add footer with "Cyberix - A Webnox Product" and page number
      const addFooter = () => {
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber
        const totalPages = doc.internal.getNumberOfPages()
        
        // Footer line
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight)
        
        // Footer text: "Cyberix - A Webnox Product"
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text('Cyberix - A Webnox Product', pageWidth / 2, pageHeight - footerHeight + 12, { align: 'center' })
        
        // Page number
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
      }
      
      // Helper to update all page footers
      const updateAllFooters = () => {
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          drawPageBorder()
          const currentPage = i
          
          // Footer line
          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.5)
          doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight)
          
          // Footer text: "Cyberix - A Webnox Product"
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(100, 100, 100)
          doc.text('Cyberix - A Webnox Product', pageWidth / 2, pageHeight - footerHeight + 12, { align: 'center' })
          
          // Page number
          doc.setFontSize(9)
          doc.setTextColor(100, 100, 100)
          doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
        }
      }
      
      // Draw border and footer on first page
      drawPageBorder()
      addFooter()
      
      const addText = (text, x, y, fontSize = 12, fontStyle = 'normal', align = 'left', color = [0, 0, 0]) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color[0], color[1], color[2])
        const lines = doc.splitTextToSize(text || '', pageWidth - 2 * x - margin - 10)
        doc.text(lines, x, y, { align })
        return y + (lines.length * fontSize * 0.4) + 5
      }
      
      const checkNewPage = (requiredSpace = 20) => {
        // Account for footer space
        const availableHeight = pageHeight - margin - footerHeight - 10
        if (yPos + requiredSpace > availableHeight) {
          // Add footer to current page before adding new page
          addFooter()
          
          doc.addPage()
          pageNumber++
          drawPageBorder() // Draw border on new page
          addFooter() // Add footer to new page
          yPos = margin + 10
        }
      }
      
      const addSectionBox = (title, contentLines = [], heightPadding = 15, backgroundColor = [250, 250, 250], borderColor = [180, 180, 180]) => {
        checkNewPage(30)
        
        // Calculate approximate height
        let estimatedHeight = 20 + heightPadding
        contentLines.forEach(line => {
          if (line.text) {
            const lines = doc.splitTextToSize(line.text || '', pageWidth - 2 * margin - 25)
            estimatedHeight += Math.max(8, lines.length * 6) + 4
          }
        })
        
        // Professional section box
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
        doc.setLineWidth(0.6)
        doc.setFillColor(backgroundColor[0], backgroundColor[1], backgroundColor[2])
        doc.rect(margin + 5, yPos - 5, pageWidth - 2 * margin - 10, estimatedHeight, 'FD')
        
        // Section title with professional background
        doc.setFillColor(245, 245, 245)
        doc.rect(margin + 6, yPos - 4, pageWidth - 2 * margin - 12, 16, 'F')
        
        // Title text
        doc.setTextColor(40, 40, 40)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text(title, margin + 10, yPos + 6)
        
        // Content lines
        let currentY = yPos + 18
        contentLines.forEach(line => {
          if (line.text) {
            doc.setFontSize(line.fontSize || 10)
            doc.setFont('helvetica', line.fontStyle || 'normal')
            doc.setTextColor(line.color ? line.color[0] : 60, line.color ? line.color[1] : 60, line.color ? line.color[2] : 60)
            const lines = doc.splitTextToSize(line.text, pageWidth - 2 * margin - 30)
            lines.forEach((l, idx) => {
              doc.text(l, margin + 10 + (line.indent || 0), currentY + (idx * 6))
            })
            currentY += Math.max(8, lines.length * 6) + 4
          }
        })
        
        yPos = yPos - 5 + estimatedHeight + 10
      }
      
      const test = securityTests.find(t => t.id === testId)
      const testName = test ? test.name : testId
      
      // Enhanced Header with better styling
      doc.setFillColor(59, 130, 246) // Blue
      doc.setDrawColor(59, 130, 246)
      doc.setLineWidth(0)
      doc.rect(margin + 5, yPos - 5, pageWidth - 2 * margin - 10, 35, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      doc.text('Security Scan Report', pageWidth / 2, yPos + 10, { align: 'center' })
      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      doc.text(`Test: ${testName}`, pageWidth / 2, yPos + 20, { align: 'center' })
      yPos += 45
      
      // Enhanced Scan Details Section
      addSectionBox('Scan Details', [
        { text: `Target: ${targetUrl}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
        { text: `Date: ${new Date().toLocaleString()}`, fontSize: 11, fontStyle: 'normal', color: [60, 60, 60] },
        { text: `Scanner: Cyberix Security Scanner`, fontSize: 11, fontStyle: 'normal', color: [60, 60, 60] }
      ])
      
      // Result Content - Include all content from detailed report dialog
      if (result) {
        const report = result.report || {}
        
        // Enhanced Scan Summary Section
        const statusColor = result.status === 'completed' ? [34, 197, 94] : result.status === 'failed' ? [239, 68, 68] : [156, 163, 175]
        addSectionBox('Scan Summary', [
          { text: `Status: ${result.status || 'N/A'}`, fontSize: 11, fontStyle: 'bold', color: statusColor },
          { text: `Findings Count: ${result.findings?.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
          { text: `Recommendations: ${result.recommendations?.length || report.recommendations?.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
          { text: `Severity Level: ${result.severity || test?.severity || 'N/A'}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] }
        ])
        
        // Enhanced Risk Assessment Section
        if (report.riskLevel || report.risk_summary) {
          const riskLevel = report.risk_summary?.overall_risk || report.riskLevel
          const riskColor = riskLevel === 'Critical' ? [239, 68, 68] : riskLevel === 'High' ? [249, 115, 22] : 
                           riskLevel === 'Medium' ? [234, 179, 8] : riskLevel === 'Low' ? [34, 197, 94] : [100, 100, 100]
          const riskLines = [
            { text: `Overall Risk: ${riskLevel}`, fontSize: 12, fontStyle: 'bold', color: riskColor }
          ]
          if (report.risk_summary?.summary) {
            riskLines.push({ text: report.risk_summary.summary, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          if (report.risk_summary) {
            riskLines.push(
              { text: `Total Issues: ${report.risk_summary.total_issues || 0}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] },
              { text: `Critical: ${report.risk_summary.critical_issues || 0} | High: ${report.risk_summary.high_issues || 0} | Medium: ${report.risk_summary.medium_issues || 0} | Low: ${report.risk_summary.low_issues || 0}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
            )
          }
          addSectionBox('Risk Assessment', riskLines)
        }
        
        // Enhanced Security Score Section (for DNS scans)
        if (report.security_score) {
          addSectionBox('Security Score', [
            { text: `Score: ${report.security_score.score}/100`, fontSize: 12, fontStyle: 'bold', color: [30, 30, 30] },
            { text: `Grade: ${report.security_score.grade}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] },
            { text: report.security_score.description || '', fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
          ])
        }
        
        // Enhanced Scan Details Section
        if (report.target || report.scanType) {
          const scanDetailsLines = []
          if (report.target) scanDetailsLines.push({ text: `Target: ${report.target}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (report.scanType) scanDetailsLines.push({ text: `Scan Type: ${report.scanType}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (scanDetailsLines.length > 0) {
            addSectionBox('Scan Information', scanDetailsLines)
          }
        }
        
        // DNS-Specific Content - Enhanced with structured boxes
        if (testId === 'dns-resolution' || report.scanType === 'DNS Resolution & Analysis' || report.scanType === 'DNS Analysis') {
          // DNS Summary
          if (report.summary) {
            const dnsLines = []
            if (report.summary.dnssec !== undefined) {
              const dnssecColor = report.summary.dnssec ? [34, 197, 94] : [234, 179, 8]
              dnsLines.push({ text: `DNSSEC: ${report.summary.dnssec ? 'Enabled' : 'Disabled'}`, fontSize: 11, fontStyle: 'normal', color: dnssecColor })
            }
            if (report.summary.zoneTransfer) {
              dnsLines.push({ text: `Zone Transfer: ${report.summary.zoneTransfer}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            }
            if (report.summary.spfRecord !== undefined) {
              const spfColor = report.summary.spfRecord ? [34, 197, 94] : [234, 179, 8]
              dnsLines.push({ text: `SPF Record: ${report.summary.spfRecord ? 'Configured' : 'Missing'}`, fontSize: 11, fontStyle: 'normal', color: spfColor })
            }
            if (report.summary.dmarcRecord !== undefined) {
              const dmarcColor = report.summary.dmarcRecord ? [34, 197, 94] : [234, 179, 8]
              dnsLines.push({ text: `DMARC Record: ${report.summary.dmarcRecord ? 'Configured' : 'Missing'}`, fontSize: 11, fontStyle: 'normal', color: dmarcColor })
            }
            if (report.summary.subdomainsFound !== undefined) {
              dnsLines.push({ text: `Subdomains Found: ${report.summary.subdomainsFound}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            }
            if (dnsLines.length > 0) {
              addSectionBox('DNS Summary', dnsLines)
            }
          }
          
          // DNS Records - Enhanced
          if (report.records) {
            const recordLines = []
            Object.entries(report.records).forEach(([recordType, records]) => {
              if (records && Array.isArray(records) && records.length > 0) {
                recordLines.push({ text: `${recordType} Records (${records.length}):`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
                records.slice(0, 10).forEach((record, idx) => {
                  const recordText = typeof record === 'object' ? JSON.stringify(record) : String(record)
                  recordLines.push({ text: `  ${idx + 1}. ${recordText}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 0 })
                })
                if (records.length > 10) {
                  recordLines.push({ text: `  ... and ${records.length - 10} more ${recordType} records`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100], indent: 0 })
                }
              }
            })
            if (recordLines.length > 0) {
              addSectionBox('DNS Records', recordLines, 20)
            }
          }
          
          // DNSSEC Status - Enhanced
          if (report.dnssec) {
            const dnssecColor = report.dnssec.enabled ? [34, 197, 94] : [239, 68, 68]
            const dnssecLines = [
              { text: `Status: ${report.dnssec.enabled ? 'Enabled' : 'Disabled'}`, fontSize: 11, fontStyle: 'bold', color: dnssecColor }
            ]
            if (report.dnssec.recommendation) {
              dnssecLines.push({ text: report.dnssec.recommendation, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
            }
            addSectionBox('DNSSEC Status', dnssecLines)
          }
          
          // Zone Transfer Status - Enhanced
          if (report.zone_transfer) {
            const zoneColor = report.zone_transfer.allowed ? [239, 68, 68] : [34, 197, 94]
            addSectionBox('Zone Transfer Status', [
              { text: `Status: ${report.zone_transfer.allowed ? 'Allowed (Security Risk)' : 'Blocked (Secure)'}`, fontSize: 11, fontStyle: 'bold', color: zoneColor }
            ])
          }
          
          // Subdomains - Enhanced
          if (report.subdomains && report.subdomains.length > 0) {
            const subdomainLines = report.subdomains.slice(0, 30).map((subdomain, idx) => ({
              text: `${idx + 1}. ${subdomain}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
            }))
            if (report.subdomains.length > 30) {
              subdomainLines.push({ text: `... and ${report.subdomains.length - 30} more subdomains`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Discovered Subdomains', subdomainLines, 15)
          }
          
          // Scan Health (if available)
          if (report.scan_health) {
            const healthLines = [
              { text: `Status: ${report.scan_health.status}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] }
            ]
            if (report.scan_health.notes && report.scan_health.notes.length > 0) {
              report.scan_health.notes.forEach(note => {
                healthLines.push({ text: `• ${note}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60], indent: 0 })
              })
            }
            addSectionBox('Scan Health', healthLines)
          }
        }
        
        // SSL/TLS-Specific Content - Enhanced
        if (report.scanType === 'SSL/TLS Analysis') {
          if (report.supportedProtocols) {
            const sslLines = [
              { text: `Supported Protocols: ${report.supportedProtocols.join(', ')}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] }
            ]
            if (report.cipherStrength) {
              sslLines.push({ text: `Cipher Strength: ${report.cipherStrength}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            }
            if (report.certificateInfo) {
              if (report.certificateInfo.issuer) {
                sslLines.push({ text: `Certificate Issuer: ${report.certificateInfo.issuer}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
              }
              if (report.certificateInfo.validTo) {
                sslLines.push({ text: `Valid Until: ${report.certificateInfo.validTo}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
              }
            }
            addSectionBox('SSL/TLS Configuration', sslLines)
          }
        }
        
        // Security Headers-Specific Content - Enhanced
        if (report.scanType === 'Security Headers') {
          if (report.headersFound || report.missingHeaders) {
            const headerLines = []
            if (report.headersFound) {
              headerLines.push({ text: 'Headers Found:', fontSize: 11, fontStyle: 'bold', color: [34, 197, 94] })
              Object.entries(report.headersFound).slice(0, 15).forEach(([key, value]) => {
                headerLines.push({ text: `${key}: ${value}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              })
            }
            if (report.missingHeaders && report.missingHeaders.length > 0) {
              headerLines.push({ text: 'Missing Headers:', fontSize: 11, fontStyle: 'bold', color: [239, 68, 68] })
              report.missingHeaders.forEach((header) => {
                headerLines.push({ text: `- ${header}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              })
            }
            if (headerLines.length > 0) {
              addSectionBox('Security Headers', headerLines, 20)
            }
          }
        }
        
        // Port Scanning-Specific Content - Enhanced
        if (report.scanType === 'Port Scanning') {
          if (report.openPorts && report.openPorts.length > 0) {
            const portLines = []
            report.openPorts.slice(0, 25).forEach((port, idx) => {
              portLines.push({ 
                text: `Port ${port.port}: ${port.service || 'Unknown Service'} ${port.version ? `(${port.version})` : ''}`, 
                fontSize: 10, 
                fontStyle: 'normal', 
                color: [60, 60, 60] 
              })
            })
            if (report.openPorts.length > 25) {
              portLines.push({ text: `... and ${report.openPorts.length - 25} more ports`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Open Ports', portLines, 15)
          }
        }
        
        // Subdomain Enumeration-Specific Content - Enhanced
        if (report.scanType === 'Subdomain Enumeration') {
          if (report.subdomainsFound && report.subdomainsFound.length > 0) {
            const subdomainLines = report.subdomainsFound.slice(0, 35).map((subdomain, idx) => ({
              text: `${idx + 1}. ${subdomain}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
            }))
            if (report.subdomainsFound.length > 35) {
              subdomainLines.push({ text: `... and ${report.subdomainsFound.length - 35} more subdomains`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Discovered Subdomains', subdomainLines, 15)
          }
        }
        
        // Quick Fingerprint-Specific Content - ALL from detailed dialog
        if (testId === 'quick-fingerprint' && report.summary) {
          const summary = report.summary
          const quickFingerprintLines = []
          
          // Summary section
          if (summary.target_url) quickFingerprintLines.push({ text: `Target URL: ${summary.target_url}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.status_code) quickFingerprintLines.push({ text: `Status Code: ${summary.status_code}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.title) quickFingerprintLines.push({ text: `Title: ${summary.title}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.ip) quickFingerprintLines.push({ text: `IP Address: ${summary.ip}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.country) quickFingerprintLines.push({ text: `Country: ${summary.country}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.plugins) quickFingerprintLines.push({ text: `Plugins Detected: ${summary.plugins.length || 0}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
          if (summary.summary) quickFingerprintLines.push({ text: `Summary: ${summary.summary}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          if (summary.severity_hint) {
            const severityColor = summary.severity_hint === 'High' ? [239, 68, 68] : summary.severity_hint === 'Medium' ? [249, 115, 22] : [59, 130, 246]
            quickFingerprintLines.push({ text: `Severity: ${summary.severity_hint}`, fontSize: 11, fontStyle: 'bold', color: severityColor })
          }
          
          if (quickFingerprintLines.length > 0) {
            addSectionBox('Quick Fingerprint Summary', quickFingerprintLines)
          }
          
          // Plugins section
          if (summary.plugins && summary.plugins.length > 0) {
            const pluginLines = summary.plugins.slice(0, 20).map((plugin, idx) => ({
              text: `${idx + 1}. ${plugin.name || 'Unknown'}${plugin.description ? ` - ${plugin.description}` : ''}`, 
              fontSize: 10, 
              fontStyle: 'normal', 
              color: [60, 60, 60]
            }))
            if (summary.plugins.length > 20) {
              pluginLines.push({ text: `... and ${summary.plugins.length - 20} more plugins`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Detected Plugins', pluginLines, 15)
          }
          
          // HTTP Headers section
          if (summary.http_headers && Object.keys(summary.http_headers).length > 0) {
            const headerLines = []
            Object.entries(summary.http_headers).slice(0, 30).forEach(([key, value]) => {
              headerLines.push({ text: `${key}: ${value}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60] })
            })
            if (Object.keys(summary.http_headers).length > 30) {
              headerLines.push({ text: `... and ${Object.keys(summary.http_headers).length - 30} more headers`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            if (headerLines.length > 0) {
              addSectionBox('HTTP Headers', headerLines, 15)
            }
          }
          
          // Recommendation section
          if (summary.recommendation) {
            addSectionBox('Recommendations', [
              { text: summary.recommendation, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
            ])
          }
        }
        
        // File Upload Check-Specific Content - ALL from detailed dialog
        if (testId === 'file-upload-check' && report.json) {
          const json = report.json
          
          // Aggregate Findings
          if (json.aggregate_findings) {
            const findings = json.aggregate_findings
            const uploadAllowedColor = findings.upload_allowed === true ? [239, 68, 68] : findings.upload_allowed === false ? [34, 197, 94] : [156, 163, 175]
            const findingLines = [
              { text: `Upload Allowed: ${findings.upload_allowed === true ? 'Yes' : findings.upload_allowed === false ? 'No' : 'Unknown'}`, fontSize: 11, fontStyle: 'bold', color: uploadAllowedColor },
              { text: `Confidence: ${findings.confidence || 'low'}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
              { text: `Severity: ${findings.severity || 'unknown'}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
              { text: `Evidence Count: ${findings.evidence?.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] }
            ]
            if (findings.rationale) {
              findingLines.push({ text: `Rationale: ${findings.rationale}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
            }
            addSectionBox('Aggregate Findings', findingLines)
          }
          
          // Professional Client-Facing Summary (Report section from dialog)
          if (json.meta || json.commands || json.public_accessibility) {
            const reportLines = []
            
            if (json.meta) {
              if (json.meta.generated_at_utc) reportLines.push({ text: `Timestamp: ${json.meta.generated_at_utc}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
              if (json.meta.target) reportLines.push({ text: `Target: ${json.meta.target}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            }
            
            reportLines.push({ text: 'Test Objective: Assess whether the upload endpoint correctly validates and stores files, and whether uploaded content is publicly accessible.', fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
            
            if (json.commands && Array.isArray(json.commands)) {
              const cmds = json.commands
              const byLabel = (label) => cmds.find(c => (c.raw_label || '').includes(label) || (c.raw_label === label) || (c.id === label))
              const upTest = byLabel('curl_upload_test') || byLabel('curl_upload_test.txt')
              const upHarmless = byLabel('curl_upload_harmless') || byLabel('curl_upload_harmless.txt')
              const head = byLabel('curl_head_candidate') || byLabel('curl_head_candidate.txt')
              const etcp = byLabel('curl_upload_etcpasswd') || byLabel('curl_upload_etcpasswd.txt')
              const status = (c) => c?.status_code ?? null
              const ok = (c) => !!(status(c) && status(c) >= 200 && status(c) < 300)
              
              reportLines.push({ text: 'Commands Executed (summary):', fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
              reportLines.push({ text: `  • Basic upload with test.txt ${ok(upTest) ? '(200 OK)' : ''}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Disguised script upload harmless.php.txt ${ok(upHarmless) ? '(200 OK)' : ''}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Checked public accessibility of uploaded file (HEAD) ${ok(head) ? '(200 OK)' : ''}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Sensitive file upload attempt (/etc/passwd) ${ok(etcp) ? '(200 OK)' : ''}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              
              reportLines.push({ text: 'Results:', fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
              reportLines.push({ text: `  • Upload (test.txt): ${status(upTest) ?? 'N/A'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Upload (harmless.php.txt): ${status(upHarmless) ?? 'N/A'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Public access (HEAD): ${status(head) ?? 'N/A'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Upload (/etc/passwd): ${status(etcp) ?? 'N/A'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              
              const uploadAllowed = ok(upTest) || ok(upHarmless)
              const publicAccess = ok(head)
              
              reportLines.push({ text: 'Vulnerability Status:', fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
              reportLines.push({ text: `  • File upload allowed: ${uploadAllowed ? 'Yes' : 'No/Unknown'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Malicious file upload possible: ${ok(upHarmless) ? 'Yes (disguised script accepted)' : 'Unclear'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
              reportLines.push({ text: `  • Public file access allowed: ${publicAccess ? 'Yes' : 'No/Unknown'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
            }
            
            if (json.aggregate_findings?.severity) {
              reportLines.push({ text: `Risk Level: ${json.aggregate_findings.severity}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
            }
            
            if (reportLines.length > 0) {
              addSectionBox('Detailed Report', reportLines, 20)
            }
          }
        }
        
        // CT Log Subdomain Discovery-Specific Content - ALL from detailed dialog
        if (testId === 'ct-log-subdomain-discovery' && report.summary) {
          const summary = report.summary
          const ctLines = []
          
          if (summary.status) ctLines.push({ text: `Status: ${summary.status}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.certificates) ctLines.push({ text: `Total Certificates: ${summary.certificates.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.unique_subdomains) ctLines.push({ text: `Unique Subdomains: ${summary.unique_subdomains.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (summary.evidence) ctLines.push({ text: `Evidence: ${summary.evidence}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          
          if (ctLines.length > 0) {
            addSectionBox('Certificate Transparency Log Summary', ctLines)
          }
          
          // Unique Subdomains
          if (summary.unique_subdomains && summary.unique_subdomains.length > 0) {
            const subdomainLines = summary.unique_subdomains.slice(0, 50).map((subdomain, idx) => ({
              text: `${idx + 1}. ${subdomain}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
            }))
            if (summary.unique_subdomains.length > 50) {
              subdomainLines.push({ text: `... and ${summary.unique_subdomains.length - 50} more subdomains`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Unique Subdomains', subdomainLines, 15)
          }
          
          // Discovered Certificates
          if (summary.certificates && summary.certificates.length > 0) {
            const certLines = []
            summary.certificates.slice(0, 20).forEach((cert, idx) => {
              certLines.push({ text: `Certificate ${idx + 1}:`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
              if (cert.name_value) certLines.push({ text: `  Name Value: ${cert.name_value}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (cert.serial_number) certLines.push({ text: `  Serial Number: ${cert.serial_number}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (cert.entry_timestamp) certLines.push({ text: `  Entry Timestamp: ${cert.entry_timestamp}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (cert.not_before) certLines.push({ text: `  Not Before: ${cert.not_before}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (cert.not_after) certLines.push({ text: `  Not After: ${cert.not_after}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
            })
            if (summary.certificates.length > 20) {
              certLines.push({ text: `... and ${summary.certificates.length - 20} more certificates`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            if (certLines.length > 0) {
              addSectionBox('Discovered Certificates', certLines, 20)
            }
          }
        }
        
        // WAF Detection-Specific Content - ALL from detailed dialog
        if (testId === 'waf-detection' && report.summary) {
          const wafLines = []
          
          if (report.summary.wafDetected !== undefined) {
            const wafDetectedColor = report.summary.wafDetected ? [59, 130, 246] : [156, 163, 175]
            wafLines.push({ text: `WAF Detected: ${report.summary.wafDetected ? 'Yes' : 'No'}`, fontSize: 11, fontStyle: 'bold', color: wafDetectedColor })
          }
          if (report.summary.wafType) wafLines.push({ text: `WAF Type: ${report.summary.wafType}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (report.summary.wafVendor) wafLines.push({ text: `Vendor: ${report.summary.wafVendor}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (report.summary.numberOfRequests) wafLines.push({ text: `Requests Made: ${report.summary.numberOfRequests}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          
          if (report.details?.wafInfo) {
            wafLines.push({ text: `Detection Information: ${report.details.wafInfo}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          if (report.details?.reason) {
            wafLines.push({ text: `Detection Reason: ${report.details.reason}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          
          if (wafLines.length > 0) {
            addSectionBox('WAF Detection Summary', wafLines)
          }
          
          // Raw Output
          if (report.rawOutput) {
            const rawLines = doc.splitTextToSize(report.rawOutput.substring(0, 2000), pageWidth - 2 * margin - 25)
            const displayRawLines = rawLines.slice(0, 40).map(line => ({
              text: line, fontSize: 8, fontStyle: 'normal', color: [80, 80, 80]
            }))
            if (report.rawOutput.length > 2000 || rawLines.length > 40) {
              displayRawLines.push({ text: `... (output truncated, showing first 2000 characters of ${report.rawOutput.length} total)`, fontSize: 8, fontStyle: 'italic', color: [120, 120, 120] })
            }
            addSectionBox('Raw wafw00f Output', displayRawLines, 10)
          }
        }
        
        // CSRF Test-Specific Content - ALL from detailed dialog
        if ((testId === 'csrf-test' || report.scanType === 'Cross-Site Request Forgery (CSRF) Testing') && report.csrfVulnerability) {
          const csrfColor = report.csrfVulnerability === 'Potential Vulnerability' ? [239, 68, 68] : report.csrfVulnerability === 'Protected' ? [34, 197, 94] : [234, 179, 8]
          const csrfLines = [
            { text: `CSRF Vulnerability: ${report.csrfVulnerability}`, fontSize: 11, fontStyle: 'bold', color: csrfColor }
          ]
          
          if (report.summary) csrfLines.push({ text: `Summary: ${report.summary}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          if (report.httpStatusCode) csrfLines.push({ text: `HTTP Status Code: ${report.httpStatusCode}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          if (report.target) csrfLines.push({ text: `Target: ${report.target}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
          
          if (csrfLines.length > 0) {
            addSectionBox('CSRF Test Results', csrfLines)
          }
          
          // Response Headers
          if (report.responseHeaders && Object.keys(report.responseHeaders).length > 0) {
            const headerLines = []
            Object.entries(report.responseHeaders).slice(0, 20).forEach(([key, value]) => {
              headerLines.push({ text: `${key}: ${value}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60] })
            })
            if (Object.keys(report.responseHeaders).length > 20) {
              headerLines.push({ text: `... and ${Object.keys(report.responseHeaders).length - 20} more headers`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            if (headerLines.length > 0) {
              addSectionBox('Response Headers', headerLines, 15)
            }
          }
          
          // CSRF Protection Analysis
          const protectionLines = []
          const hasCsrfToken = report.responseHeaders?.['x-csrf-token'] || report.responseHeaders?.['csrf-token']
          const hasSameSite = report.responseHeaders?.['set-cookie']?.includes('SameSite')
          const hasOrigin = report.responseHeaders?.['access-control-allow-origin']
          
          protectionLines.push({ 
            text: `CSRF Tokens: ${hasCsrfToken ? 'Present' : 'Missing'}`, 
            fontSize: 11, 
            fontStyle: 'normal', 
            color: hasCsrfToken ? [34, 197, 94] : [239, 68, 68] 
          })
          protectionLines.push({ 
            text: `SameSite Cookies: ${hasSameSite ? 'Present' : 'Missing'}`, 
            fontSize: 11, 
            fontStyle: 'normal', 
            color: hasSameSite ? [34, 197, 94] : [239, 68, 68] 
          })
          protectionLines.push({ 
            text: `Origin Validation: ${hasOrigin ? 'Configured' : 'Not Configured'}`, 
            fontSize: 11, 
            fontStyle: 'normal', 
            color: hasOrigin ? [34, 197, 94] : [234, 179, 8] 
          })
          
          if (protectionLines.length > 0) {
            addSectionBox('CSRF Protection Analysis', protectionLines)
          }
        }
        
        // XSS Test-Specific Content - ALL from detailed dialog
        if ((testId === 'xss-test' || report.scanType === 'Cross-Site Scripting (XSS) Testing') && report.vulnerabilities_found !== undefined) {
          const xssColor = report.vulnerabilities_found > 0 ? [239, 68, 68] : (report.reflected_parameters && report.reflected_parameters.length > 0) ? [249, 115, 22] : [34, 197, 94]
          const xssLines = [
            { text: `Vulnerabilities Found: ${report.vulnerabilities_found || 0}`, fontSize: 11, fontStyle: 'bold', color: xssColor },
            { text: `Status: ${report.vulnerabilities_found > 0 ? 'VULNERABLE' : (report.reflected_parameters && report.reflected_parameters.length > 0) ? 'REFLECTED' : 'SAFE'}`, fontSize: 11, fontStyle: 'bold', color: xssColor }
          ]
          
          if (report.summary) xssLines.push({ text: `Summary: ${report.summary}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          
          if (report.scan_details) {
            if (report.scan_details.method) xssLines.push({ text: `Method: ${report.scan_details.method}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.scan_details.performance) xssLines.push({ text: `Workers: ${report.scan_details.performance}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.scan_details.timeout) xssLines.push({ text: `Timeout: ${report.scan_details.timeout}s`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.scan_details.fast_scan !== undefined) xssLines.push({ text: `Fast Scan: ${report.scan_details.fast_scan ? 'Yes' : 'No'}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
          }
          
          if (xssLines.length > 0) {
            addSectionBox('XSS Test Results', xssLines)
          }
          
          // Scan Statistics
          if (report.parameters_tested !== undefined || report.total_testing_points_found !== undefined || report.vulnerabilities_found !== undefined || report.reflected_parameters) {
            const statsLines = []
            if (report.parameters_tested !== undefined) statsLines.push({ text: `Parameters Tested: ${report.parameters_tested}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.total_testing_points_found !== undefined) statsLines.push({ text: `Testing Points: ${report.total_testing_points_found}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.vulnerabilities_found !== undefined) statsLines.push({ text: `Vulnerabilities: ${report.vulnerabilities_found}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.reflected_parameters) statsLines.push({ text: `Reflected Parameters: ${report.reflected_parameters.length || 0}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
            
            if (statsLines.length > 0) {
              addSectionBox('Scan Statistics', statsLines)
            }
          }
          
          // Vulnerability Details
          if (report.vulnerability_details && report.vulnerability_details.length > 0) {
            const vulnLines = []
            report.vulnerability_details.slice(0, 15).forEach((vuln, idx) => {
              vulnLines.push({ text: `Vulnerability ${idx + 1}:`, fontSize: 11, fontStyle: 'bold', color: [239, 68, 68] })
              if (vuln.param) vulnLines.push({ text: `  Parameter: ${vuln.param}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (vuln.payload) vulnLines.push({ text: `  Payload: ${vuln.payload}`, fontSize: 9, fontStyle: 'normal', color: [80, 80, 80], indent: 5 })
              if (vuln.severity) vulnLines.push({ text: `  Severity: ${vuln.severity}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (vuln.cwe) vulnLines.push({ text: `  CWE: ${vuln.cwe}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (vuln.inject_type) vulnLines.push({ text: `  Type: ${vuln.inject_type}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60], indent: 5 })
              if (vuln.evidence) vulnLines.push({ text: `  Evidence: ${vuln.evidence}`, fontSize: 9, fontStyle: 'normal', color: [80, 80, 80], indent: 5 })
            })
            if (report.vulnerability_details.length > 15) {
              vulnLines.push({ text: `... and ${report.vulnerability_details.length - 15} more vulnerabilities`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            if (vulnLines.length > 0) {
              addSectionBox('Vulnerabilities Detected', vulnLines, 20)
            }
          }
          
          // Reflected Parameters
          if (report.reflected_parameters && report.reflected_parameters.length > 0) {
            const reflectedLines = report.reflected_parameters.slice(0, 30).map((param, idx) => ({
              text: `${idx + 1}. ${param}`, fontSize: 10, fontStyle: 'normal', color: [249, 115, 22]
            }))
            if (report.reflected_parameters.length > 30) {
              reflectedLines.push({ text: `... and ${report.reflected_parameters.length - 30} more reflected parameters`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Reflected Parameters', reflectedLines, 15)
          }
          
          // Content Type
          if (report.content_type) {
            addSectionBox('Content Type', [
              { text: report.content_type, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
            ])
          }
          
          // Raw Output
          if (report.raw_output) {
            const rawLines = doc.splitTextToSize(report.raw_output.substring(0, 2000), pageWidth - 2 * margin - 25)
            const displayRawLines = rawLines.slice(0, 40).map(line => ({
              text: line, fontSize: 8, fontStyle: 'normal', color: [80, 80, 80]
            }))
            if (report.raw_output.length > 2000 || rawLines.length > 40) {
              displayRawLines.push({ text: `... (output truncated, showing first 2000 characters)`, fontSize: 8, fontStyle: 'italic', color: [120, 120, 120] })
            }
            addSectionBox('Raw Scan Output', displayRawLines, 10)
          }
        }
        
        // SQL Injection Test-Specific Content - ALL from detailed dialog
        if ((testId === 'sql-injection-test' || report.scanType === 'SQL Injection Test' || report.scanType === 'SQL Injection Scan') && report.vulnerability_found !== undefined) {
          const sqlColor = report.vulnerability_found ? [239, 68, 68] : (report.http_errors && report.http_errors.length > 0) ? [249, 115, 22] : [34, 197, 94]
          const sqlLines = [
            { text: `Vulnerability Found: ${report.vulnerability_found ? 'Yes' : 'No'}`, fontSize: 11, fontStyle: 'bold', color: sqlColor },
            { text: `Status: ${report.vulnerability_found ? 'VULNERABLE' : (report.http_errors && report.http_errors.length > 0) ? 'PROTECTED' : 'SAFE'}`, fontSize: 11, fontStyle: 'bold', color: sqlColor }
          ]
          
          if (report.summary) sqlLines.push({ text: `Summary: ${report.summary}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          
          if (report.test_details) {
            if (report.test_details.level) sqlLines.push({ text: `Level: ${report.test_details.level}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.test_details.risk) sqlLines.push({ text: `Risk: ${report.test_details.risk}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.test_details.technique) sqlLines.push({ text: `Technique: ${report.test_details.technique}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.test_details.threads) sqlLines.push({ text: `Threads: ${report.test_details.threads}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
          }
          
          if (sqlLines.length > 0) {
            addSectionBox('SQL Injection Test Results', sqlLines)
          }
          
          // Parameters Tested
          if (report.parameters_tested && report.parameters_tested.length > 0) {
            const paramLines = report.parameters_tested.slice(0, 30).map((param, idx) => ({
              text: `${idx + 1}. ${param}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
            }))
            if (report.parameters_tested.length > 30) {
              paramLines.push({ text: `... and ${report.parameters_tested.length - 30} more parameters`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
            }
            addSectionBox('Parameters Tested', paramLines, 15)
          }
          
          // HTTP Errors
          if (report.http_errors && report.http_errors.length > 0) {
            const errorLines = report.http_errors.map((error, idx) => ({
              text: `HTTP ${error.code || 'Unknown'}: ${error.description || 'No description'} - ${error.count || 0} times`, 
              fontSize: 10, 
              fontStyle: 'normal', 
              color: [249, 115, 22] 
            }))
            if (errorLines.length > 0) {
              addSectionBox('HTTP Errors Detected', errorLines, 15)
              addSectionBox('Protection Detection Note', [
                { text: 'These errors typically indicate server-side protection such as WAF or IP blocking.', fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
              ])
            }
          }
          
          // Protection Detection
          if (report.protection_detected) {
            addSectionBox('Protection Mechanisms Detected', [
              { text: 'The server appears to be protected by WAF (Web Application Firewall) or similar security mechanisms. This may have interfered with the SQL injection testing.', fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
            ])
          }
          
          // Database Information
          if (report.database_info && report.database_info.dbms) {
            const dbLines = [
              { text: `Database Type: ${report.database_info.dbms}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] }
            ]
            if (report.database_info.version) dbLines.push({ text: `Version: ${report.database_info.version}`, fontSize: 10, fontStyle: 'normal', color: [30, 30, 30] })
            if (report.database_info.databases && report.database_info.databases.length > 0) {
              dbLines.push({ text: `Accessible Databases: ${report.database_info.databases.join(', ')}`, fontSize: 10, fontStyle: 'normal', color: [239, 68, 68] })
            }
            if (dbLines.length > 0) {
              addSectionBox('Database Information', dbLines)
            }
          }
          
          // Raw Output
          if (report.raw_output) {
            const rawLines = doc.splitTextToSize(report.raw_output.substring(0, 2000), pageWidth - 2 * margin - 25)
            const displayRawLines = rawLines.slice(0, 40).map(line => ({
              text: line, fontSize: 8, fontStyle: 'normal', color: [80, 80, 80]
            }))
            if (report.raw_output.length > 2000 || rawLines.length > 40) {
              displayRawLines.push({ text: `... (output truncated, showing first 2000 characters)`, fontSize: 8, fontStyle: 'italic', color: [120, 120, 120] })
            }
            addSectionBox('Raw Scan Output', displayRawLines, 10)
          }
        }
        
        // Enhanced Findings Section
        if (result.findings && result.findings.length > 0) {
          const findingLines = []
          result.findings.forEach((finding, idx) => {
            const findingType = finding.type || 'info'
            const findingMessage = finding.message || 'No message available'
            const findingDetails = finding.details ? (typeof finding.details === 'object' ? JSON.stringify(finding.details, null, 2) : String(finding.details)) : ''
            const findingColor = findingType === 'critical' ? [239, 68, 68] : findingType === 'high' ? [249, 115, 22] : 
                               findingType === 'medium' ? [234, 179, 8] : findingType === 'low' ? [59, 130, 246] : [34, 197, 94]
            findingLines.push({ text: `${idx + 1}. [${findingType.toUpperCase()}] ${findingMessage}`, fontSize: 11, fontStyle: 'bold', color: findingColor })
            if (findingDetails) {
              const detailsText = findingDetails.length > 300 ? findingDetails.substring(0, 300) + '...' : findingDetails
              findingLines.push({ text: `   Details: ${detailsText}`, fontSize: 9, fontStyle: 'normal', color: [80, 80, 80], indent: 5 })
            }
          })
          addSectionBox('Findings & Recommendations', findingLines, 20)
        }
        
        // Enhanced Issues from Report
        if (report.issues && report.issues.length > 0) {
          const issueLines = report.issues.map((issue, idx) => {
            const issueText = typeof issue === 'object' ? JSON.stringify(issue, null, 2) : String(issue)
            const displayText = issueText.length > 250 ? issueText.substring(0, 250) + '...' : issueText
            return { text: `${idx + 1}. ${displayText}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
          })
          addSectionBox('Issues', issueLines, 15)
        }
        
        // Enhanced Recommendations Section
        const allRecommendations = [
          ...(result.recommendations || []),
          ...(report.recommendations || [])
        ]
        if (allRecommendations.length > 0) {
          const recLines = allRecommendations.map((rec, idx) => ({
            text: `${idx + 1}. ${rec}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
          }))
          addSectionBox('Recommendations', recLines, 15)
        }
        
        // Enhanced Raw Output Section
        if (report.rawOutput || report.raw_output) {
          const rawText = report.rawOutput || report.raw_output || ''
          const rawLines = doc.splitTextToSize(rawText.substring(0, 3000), pageWidth - 2 * margin - 25)
          const displayRawLines = rawLines.slice(0, 50).map(line => ({
            text: line, fontSize: 8, fontStyle: 'normal', color: [80, 80, 80]
          }))
          if (rawText.length > 3000 || rawLines.length > 50) {
            displayRawLines.push({ text: `... (output truncated, showing first 3000 characters of ${rawText.length} total)`, fontSize: 8, fontStyle: 'italic', color: [120, 120, 120] })
          }
          addSectionBox('Raw Scan Output', displayRawLines, 10)
        }
      }
      
      // Update all footers with correct page numbers
      updateAllFooters()
      
      const fileName = `Security_Scan_${testId}_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      showSuccess(`PDF report generated: ${fileName}`)
    } catch (error) {
      console.error('PDF generation error:', error)
      showError('Failed to generate PDF report')
    } finally {
      setIsExporting(false)
    }
  }

  // Initialize selected scans with all scans when component mounts
  useEffect(() => {
    if (selectedScans.size === 1 && selectedScans.has('all-scans')) {
      const initial = new Set(['all-scans'])
      securityTests.forEach(test => initial.add(test.id))
      setSelectedScans(initial)
    }
  }, []) // Only run once on mount

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

  // Track which scans have already sent notifications
  const notifiedScansRef = useRef(new Set())

  // Helper function to send notification for a completed scan
  const sendScanNotification = useCallback((testId, testName) => {
    const scanKey = `${testId}-completed`
    
    // Only send notification once per scan
    if (notifiedScansRef.current.has(scanKey)) {
      return
    }
    
    notifiedScansRef.current.add(scanKey)
    
    // Send desktop push notification for individual scan completion
    if (window.cyberGuard?.showNotification) {
      try {
        console.log(`[NOTIFICATION] Sending notification for ${testName} completion`)
        const notificationPromise = window.cyberGuard.showNotification({
          title: `${testName} Completed`,
          body: `${testName} for ${targetUrl || 'target'} has been completed successfully.`,
          viewId: 'overview'
        })
        
        if (notificationPromise && typeof notificationPromise.then === 'function') {
          notificationPromise.then(() => {
            console.log(`[NOTIFICATION] ✅ Notification sent successfully for ${testName}`)
          }).catch(err => {
            console.error(`[NOTIFICATION] ❌ Failed to send notification for ${testName}:`, err?.message || 'Unknown error')
          })
        } else {
          console.log(`[NOTIFICATION] ⚠️ Notification call returned non-promise for ${testName}`)
        }
      } catch (err) {
        console.error(`[NOTIFICATION] ❌ Error sending notification for ${testName}:`, err?.message || 'Unknown error')
      }
    } else {
      console.warn('[NOTIFICATION] ⚠️ window.cyberGuard.showNotification is not available')
    }
  }, [targetUrl])

  // Watch for individual scan completions and send notifications
  useEffect(() => {
    // Get all available scans (not just selected ones) to check for completions
    const allScans = securityTests
    
    // Check each scan and send notification when it completes
    allScans.forEach(test => {
      const result = scanResults[test.id] || newScanResults[test.id]
      
      // Send notification for each completed scan (only once per scan)
      if (result && result.status === 'completed') {
        sendScanNotification(test.id, test.name)
      }
    })
  }, [scanResults, newScanResults, sendScanNotification])

  // Watch for scan completion - check when completedTests or scanResults change
  useEffect(() => {
    if (!isScanning && !backgroundScanning) {
      return // Don't check if not scanning
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

    if (allCompleted && scansToCheck.length > 0 && (isScanning || backgroundScanning)) {
      console.log('✅ [SCAN-COMPLETION] All scans completed - finalizing...')
      
      // Prevent duplicate completion messages
      completionTriggeredRef.current = true
      
      // All scans are done
      setCurrentTest(null)
      const endTime = Date.now()
      setScanTiming(prev => ({ ...prev, endTime }))
      setScanEndTime(endTime)
      setIsScanning(false)
      setBackgroundScanning(false)
      
      const completedCount = scansToCheck.filter(test => {
        const result = scanResults[test.id] || newScanResults[test.id]
        return result && result.status === 'completed'
      }).length
      
      // Send desktop push notification when all scans complete (no snackbar)
      if (window.cyberGuard?.showNotification) {
        try {
          window.cyberGuard.showNotification({
            title: 'Comprehensive Security Scan Completed',
            body: `All security scans completed! ${completedCount} of ${scansToCheck.length} scans completed successfully.`,
            viewId: 'overview'
          }).catch(err => {
            console.log('Notification not available:', err?.message || 'Unknown error')
          })
        } catch (err) {
          console.log('Notification not available:', err?.message || 'Unknown error')
        }
      }
      
      // Reset notification tracking for next scan
      notifiedScansRef.current.clear()
    }
  }, [completedTests, scanResults, newScanResults, isScanning, backgroundScanning])

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
        const maxBottom = window.innerHeight + window.scrollY - 8
        const calculatedTop = rect.bottom + window.scrollY + 8
        topPos = Math.min(calculatedTop, maxBottom - maxDropdownHeight)
      }
      
      setDropdownPosition({
        top: topPos,
        right: window.innerWidth - rect.right + window.scrollX,
        openUpward
      })
    }
  }, [showScanSelection])

  // Click outside handler for scan selection dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (scanSelectionRef.current && !scanSelectionRef.current.contains(event.target)) {
        setShowScanSelection(false)
      }
    }

    if (showScanSelection) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showScanSelection])

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
        message: 'Checking for wafw00f tool...',
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
        message: `Running wafw00f on ${targetUrl}...`,
        testId: 'waf-detection',
        type: 'info'
      }])
      
      setTestProgress(prev => ({ ...prev, 'waf-detection': 50 }))
      
      // Command: wafw00f ${targetUrl}
      const wafCmd = `wafw00f ${targetUrl}`
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `Executing command: ${wafCmd}`,
        testId: 'waf-detection',
        type: 'info'
      }])
      let wafResult = null
      
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        wafResult = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(wafCmd), requireConfirm: false })
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
            command: wafCmd,
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
        message: `WAF Detection completed - ${parsedResults.detected ? `WAF Detected: ${parsedResults.wafType || 'Generic/Unknown'}` : 'No WAF Detected'}`,
        testId: 'waf-detection',
        type: 'success'
      }])
      
    } catch (error) {
      console.error('WAF Detection error:', error)
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `WAF Detection failed: ${error.message}`,
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
      setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Starting File Upload Vulnerability Check...', testId: 'file-upload-check', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Target URL: ${targetUrl}`, testId: 'file-upload-check', type: 'info' }])

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

      setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Executing commands sequentially in Kali Linux...', testId: 'file-upload-check', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'file-upload-check': 15 }))
      console.log('[FILE-UPLOAD] Executing commands sequentially in Kali Linux...')

      // Prepare test.txt file first
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify('echo "SIMPLE" > test.txt'), requireConfirm: false })
      }

      // Execute each command sequentially and collect results
      let raw = ''
      if (window.cyberGuard && window.cyberGuard.runAsRoot) {
        console.log('⚙️ [FILE-UPLOAD] Running commands sequentially via WSL...')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Running commands sequentially via WSL...', testId: 'file-upload-check', type: 'info' }])
        
        for (let i = 0; i < commandSets.length; i++) {
          const cmdSet = commandSets[i]
          console.log(`▶️ [FILE-UPLOAD] Executing set ${i + 1}/${commandSets.length}: ${cmdSet.cmd}`)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Executing set ${i + 1}/${commandSets.length}: ${cmdSet.cmd}`, testId: 'file-upload-check', type: 'info' }])
          
          const execRes = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmdSet.cmd), requireConfirm: false })
          const output = (execRes?.stdout || '') + (execRes?.stderr || '')
          
          raw += `===FILE:${cmdSet.label}===\n${output}\n`
          
          console.log(`✅ [FILE-UPLOAD] Set ${i + 1} completed - ${output.length} bytes`)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Set ${i + 1} completed - Raw output:\n${output.substring(0, 1000)}${output.length > 1000 ? '...' : ''}`, testId: 'file-upload-check', type: 'success' }])
          
          setTestProgress(prev => ({ ...prev, 'file-upload-check': 15 + (i + 1) * 15 }))
        }
      } else {
        console.error('❌ [FILE-UPLOAD] cyberGuard.runAsRoot not available')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Error: WSL command execution not available', testId: 'file-upload-check', type: 'error' }])
      }

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 60 }))
      
      // Log raw results
      const rawError = ''
      
      console.log('📥 [FILE-UPLOAD] Raw stdout length:', raw.length)
      console.log('📥 [FILE-UPLOAD] Raw stderr length:', rawError.length)
      
      if (raw) {
        console.log('📥 [FILE-UPLOAD] Raw stdout (full):', raw)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `Received ${raw.length} bytes of output from Kali`, testId: 'file-upload-check', type: 'info' }])
        
        // Log the full raw output in chunks if it's too long
        if (raw.length <= 5000) {
          // If output is small enough, show it all
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Raw output from Kali:\n${raw}`, testId: 'file-upload-check', type: 'info' }])
        } else {
          // If output is large, show first chunk, then log message about full output
          const preview = raw.substring(0, 2000)
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Raw output preview (first 2000 chars):\n${preview}\n\n... (showing ${raw.length - 2000} more bytes - full output saved in report)`, testId: 'file-upload-check', type: 'info' }])
        }
      } else {
        console.warn('⚠️ [FILE-UPLOAD] No stdout received')
        setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Warning: No output received from Kali', testId: 'file-upload-check', type: 'warning' }])
      }
      
      if (rawError) {
        console.log('📥 [FILE-UPLOAD] Raw stderr:', rawError)
        if (rawError.length <= 500) {
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Stderr:\n${rawError}`, testId: 'file-upload-check', type: 'warning' }])
        } else {
          setLogs(prev => [...prev, { timestamp: Date.now(), message: `Stderr (first 500 chars):\n${rawError.substring(0, 500)}...`, testId: 'file-upload-check', type: 'warning' }])
        }
      }

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 70 }))
      console.log('[FILE-UPLOAD] Parsing raw output...')
      setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Parsing raw output to JSON...', testId: 'file-upload-check', type: 'info' }])
      
      const parsed = parseFileUploadRawToJson(raw, uploadUrl)
      
      console.log('✅ [FILE-UPLOAD] Parsed JSON:', JSON.stringify(parsed, null, 2))
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Parsed ${parsed.commands?.length || 0} commands`, testId: 'file-upload-check', type: 'success' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Upload Allowed: ${parsed.aggregate_findings?.upload_allowed === true ? 'Yes' : parsed.aggregate_findings?.upload_allowed === false ? 'No' : 'Unknown'}`, testId: 'file-upload-check', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Severity: ${parsed.aggregate_findings?.severity || 'unknown'}`, testId: 'file-upload-check', type: 'info' }])

      setTestProgress(prev => ({ ...prev, 'file-upload-check': 80 }))
      console.log('📝 [FILE-UPLOAD] Creating report...')
      setLogs(prev => [...prev, { timestamp: Date.now(), message: 'Creating scan report...', testId: 'file-upload-check', type: 'info' }])

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
          command: commandSets.map(cs => cs.cmd).join('\n'),
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
      setLogs(prev => [...prev, { timestamp: Date.now(), message: 'File Upload Vulnerability Check completed successfully!', testId: 'file-upload-check', type: 'success' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Final Summary - Upload Allowed: ${parsed.aggregate_findings?.upload_allowed === true ? 'Yes' : parsed.aggregate_findings?.upload_allowed === false ? 'No' : 'Unknown'}, Severity: ${parsed.aggregate_findings?.severity || 'unknown'}, Commands: ${parsed.commands?.length || 0}`, testId: 'file-upload-check', type: 'success' }])
    } catch (e) {
      console.error('❌ [FILE-UPLOAD] Error during File Upload Vulnerability Check:', e)
      console.error('❌ [FILE-UPLOAD] Error message:', e.message)
      console.error('❌ [FILE-UPLOAD] Error stack:', e.stack)
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${e.message}`, testId: 'file-upload-check', type: 'error' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `File Upload Vulnerability Check failed`, testId: 'file-upload-check', type: 'error' }])
      
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
    console.log(`▶️ [${label.toUpperCase()}] Command: ${cmd}`)
    // Log command separately with full details
    setLogs(prev => [...prev, { 
      timestamp: Date.now(), 
      message: `▶️ ${label}: ${cmd}`, 
      testId: label, 
      type: 'info',
      command: cmd,
      output: null
    }])
    const res = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmd), requireConfirm: false })
    const output = (res?.stdout || '') + (res?.stderr ? `\n${res.stderr}` : '')
    console.log(`✅ [${label.toUpperCase()}] Completed - Output length: ${output.length} bytes`)
    if (output && output.length > 0) {
      console.log(`📊 [${label.toUpperCase()}] Output:\n${output.substring(0, 500)}${output.length > 500 ? '...' : ''}`)
    }
    // Log output separately
    setLogs(prev => [...prev, { 
      timestamp: Date.now(), 
      message: `${label} completed (${output.length} bytes)`, 
      testId: label, 
      type: 'success',
      command: null,
      output: output
    }])
    return output
  }

  // Helper: run command and return stdout/stderr separately (useful for JSON parsing)
  const runWSLSeparated = async (label, cmd) => {
    console.log(`▶️ [${label.toUpperCase()}] Command: ${cmd}`)
    // Log command separately with full details
    setLogs(prev => [...prev, { 
      timestamp: Date.now(), 
      message: `▶️ ${label}: ${cmd}`, 
      testId: label, 
      type: 'info',
      command: cmd,
      output: null
    }])
    const res = await window.cyberGuard.runAsRoot({ command: 'bash -lc ' + JSON.stringify(cmd), requireConfirm: false })
    const stdout = res?.stdout || ''
    const stderr = res?.stderr || ''
    const combinedOutput = stdout + (stderr ? `\n${stderr}` : '')
    console.log(`✅ [${label.toUpperCase()}] Completed - stdout: ${stdout.length} bytes, stderr: ${stderr.length} bytes`)
    if (stdout && stdout.length > 0) {
      console.log(`📊 [${label.toUpperCase()}] Stdout:\n${stdout.substring(0, 500)}${stdout.length > 500 ? '...' : ''}`)
    }
    if (stderr && stderr.length > 0) {
      console.log(`⚠️ [${label.toUpperCase()}] Stderr:\n${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`)
    }
    // Log output separately
    setLogs(prev => [...prev, { 
      timestamp: Date.now(), 
      message: `${label} completed (stdout: ${stdout.length} bytes, stderr: ${stderr.length} bytes)`, 
      testId: label, 
      type: 'success',
      command: null,
      output: combinedOutput
    }])
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
    const command = `curl -I -H "Origin: http://evil.com" ${JSON.stringify(url)} | grep -i "access-control-allow-origin" || true`
    const out = await runWSL('cors-policy-validation', command)
    
    // Clean up the output - remove curl progress indicators and other noise
    let cleanedOutput = out.trim()
    // Remove curl progress lines (lines starting with %)
    cleanedOutput = cleanedOutput.split('\n')
      .filter(line => !line.trim().startsWith('%') && !line.trim().startsWith('Total') && !line.trim().startsWith('Dload') && !line.trim().startsWith('Upload') && !line.trim().startsWith('Speed') && !line.trim().startsWith('Time') && !line.trim().startsWith('--:--'))
      .filter(line => line.trim().length > 0)
      .join('\n')
    
    const vulnerable = /access-control-allow-origin:\s*\*/i.test(cleanedOutput)
    const hasCorsHeader = /access-control-allow-origin:/i.test(cleanedOutput)
    
    let evidence = cleanedOutput || 'No ACAO header returned'
    if (!hasCorsHeader) {
      evidence = 'No Access-Control-Allow-Origin header found in response'
    } else if (vulnerable) {
      evidence = 'Access-Control-Allow-Origin header is set to wildcard (*) - allowing all origins'
    } else {
      const originMatch = cleanedOutput.match(/access-control-allow-origin:\s*([^\r\n]+)/i)
      if (originMatch) {
        evidence = `Access-Control-Allow-Origin: ${originMatch[1].trim()}`
      }
    }
    
    return buildSimpleJson({
      test_name: 'CORS Policy Validation',
      severity: vulnerable ? 'Critical' : 'Info',
      status: vulnerable ? 'Vulnerable' : 'Safe',
      evidence: evidence,
      recommendation: vulnerable ? 'Restrict CORS to trusted domains only and avoid use of wildcard *.' : 'CORS configuration appears secure. Continue monitoring for proper configuration.',
      command: command,
      rawOutput: cleanedOutput
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
      setCurrentTest({ id: 'ct-log-subdomain-discovery', name: 'Certificate Transparency (CT) Log Subdomain Discovery' })
      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 10 }))
      
      // Extract domain from URL
      let domain = targetBase
      try {
        const urlObj = new URL(targetBase.startsWith('http') ? targetBase : `https://${targetBase}`)
        domain = urlObj.hostname.replace(/^www\./, '')
      } catch {
        domain = targetBase.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      }

      console.log(`[CT-LOG] Querying crt.sh for domain: ${domain}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Querying Certificate Transparency logs for: ${domain}`, testId: 'ct-log-subdomain-discovery', type: 'info' }])

      // Use exact command format with single quotes to avoid bash quote issues
      // curl -s "https://crt.sh/?q=%25.{domain}&output=json" | jq .
      const cmd = `curl -s 'https://crt.sh/?q=%25.${domain}&output=json' | jq .`
      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 30 }))
      const { stdout, stderr } = await runWSLSeparated('ct-log-subdomain-discovery', cmd)

      console.log(`📥 [CT-LOG] stdout length: ${stdout.length}, stderr length: ${stderr.length}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Received ${stdout.length} bytes from crt.sh (via jq)`, testId: 'ct-log-subdomain-discovery', type: 'info' }])
      if (stderr) {
        console.log(`⚠️ [CT-LOG] stderr from jq/curl:`, stderr)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `stderr: ${stderr.substring(0, 500)}${stderr.length > 500 ? '...' : ''}`, testId: 'ct-log-subdomain-discovery', type: 'warning' }])
      }

      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 50 }))
      
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
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `Failed to parse JSON: ${parseErr.message}`, testId: 'ct-log-subdomain-discovery', type: 'warning' }])
        setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 100 }))
        const result = {
          testId: 'ct-log-subdomain-discovery',
          testName: 'Certificate Transparency (CT) Log Subdomain Discovery',
          category: 'Reconnaissance',
          severity: 'medium',
          status: 'completed',
          timestamp: new Date().toISOString(),
          findings: [{
            type: 'warning',
            message: `Failed to parse certificate data from crt.sh${stderr ? ` (stderr: ${stderr.substring(0,120)})` : ''}`,
            details: 'Verify domain name and crt.sh API availability'
          }],
          recommendations: ['Verify domain name and crt.sh API availability', 'Check network connectivity'],
          report: {
            scanType: 'Certificate Transparency (CT) Log Subdomain Discovery',
            target: targetBase,
            summary: {
              test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
              severity: 'Medium',
              status: 'Completed',
              evidence: `Failed to parse certificate data from crt.sh${stderr ? ` (stderr: ${stderr.substring(0,120)})` : ''}`,
              recommendation: 'Verify domain name and crt.sh API availability',
              certificates: [],
              unique_subdomains: []
            },
            command: cmd,
            certificates: [],
            unique_subdomains: []
          }
        }
        setScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
        setNewScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
        setCompletedTests(prev => new Set([...prev, 'ct-log-subdomain-discovery']))
        return result
      }

      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 70 }))
      
      console.log(`✅ [CT-LOG] Parsed ${certs.length} certificates`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Parsed ${certs.length} certificates`, testId: 'ct-log-subdomain-discovery', type: 'success' }])

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

      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 90 }))
      
      console.log(`📊 [CT-LOG] Found ${uniqueSubdomains.size} unique subdomains`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Found ${uniqueSubdomains.size} unique subdomains across ${processedCerts.length} certificates`, testId: 'ct-log-subdomain-discovery', type: 'success' }])

      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 100 }))
      
      const result = {
        testId: 'ct-log-subdomain-discovery',
        testName: 'Certificate Transparency (CT) Log Subdomain Discovery',
        category: 'Reconnaissance',
        severity: 'medium',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: [{
          type: 'info',
          message: `Discovered ${uniqueSubdomains.size} unique subdomains from ${processedCerts.length} certificates`,
          details: `CT Log Subdomain Discovery completed successfully`
        }],
        recommendations: ['Audit all discovered subdomains and ensure they are properly secured', 'Monitor for unauthorized subdomain certificates'],
        report: {
          scanType: 'Certificate Transparency (CT) Log Subdomain Discovery',
          target: targetBase,
          summary: {
            test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
            severity: 'Medium',
            status: 'Completed',
            evidence: `Discovered ${uniqueSubdomains.size} unique subdomains from ${processedCerts.length} certificates`,
            recommendation: 'Audit all discovered subdomains and ensure they are properly secured',
            certificates: processedCerts,
            unique_subdomains: Array.from(uniqueSubdomains).sort()
          },
          command: cmd,
          certificates: processedCerts,
          unique_subdomains: Array.from(uniqueSubdomains).sort()
        }
      }
      
      setScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
      setNewScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
      setCompletedTests(prev => new Set([...prev, 'ct-log-subdomain-discovery']))
      
      return result
    } catch (error) {
      console.error(`❌ [CT-LOG] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'ct-log-subdomain-discovery', type: 'error' }])
      setTestProgress(prev => ({ ...prev, 'ct-log-subdomain-discovery': 100 }))
      
      const result = {
        testId: 'ct-log-subdomain-discovery',
        testName: 'Certificate Transparency (CT) Log Subdomain Discovery',
        category: 'Reconnaissance',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [{
          type: 'error',
          message: `Error: ${error.message}`,
          details: 'Verify network connectivity and crt.sh API availability'
        }],
        recommendations: ['Verify network connectivity and crt.sh API availability', 'Check domain name format'],
        report: {
          scanType: 'Certificate Transparency (CT) Log Subdomain Discovery',
          target: targetBase,
          summary: {
            test_name: 'Certificate Transparency (CT) Log Subdomain Discovery',
            severity: 'Medium',
            status: 'Failed',
            evidence: `Error: ${error.message}`,
            recommendation: 'Verify network connectivity and crt.sh API availability',
            certificates: [],
            unique_subdomains: []
          },
          certificates: [],
          unique_subdomains: []
        }
      }
      
      setScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
      setNewScanResults(prev => ({ ...prev, 'ct-log-subdomain-discovery': result }))
      setCompletedTests(prev => new Set([...prev, 'ct-log-subdomain-discovery']))
      
      return result
    }
  }

  // Run XSS Test
  const runXSSTest = async (targetBase) => {
    try {
      setCurrentTest({ id: 'xss-test', name: 'Cross-Site Scripting (XSS) Testing' })
      setTestProgress(prev => ({ ...prev, 'xss-test': 10 }))
      
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      console.log(`🔍 [XSS] Starting XSS test for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting XSS test for: ${targetUrl}`, testId: 'xss-test', type: 'info' }])
      
      // Command: dalfox url "${targetUrl}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json
      const cmd = `dalfox url "${targetUrl}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json`
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Executing command: ${cmd}`, testId: 'xss-test', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'xss-test': 30 }))
      
      const { stdout, stderr } = await runWSLSeparated('xss-test', cmd)
      
      setTestProgress(prev => ({ ...prev, 'xss-test': 60 }))
      
      // Parse dalfox JSON output
      let vulnerabilities = []
      let vulnerabilitiesFound = 0
      let reflectedParams = []
      
      try {
        if (stdout.trim()) {
          const lines = stdout.trim().split('\n')
          for (const line of lines) {
            if (line.trim()) {
              try {
                const vuln = JSON.parse(line)
                if (vuln.type && vuln.payload) {
                  vulnerabilities.push(vuln)
                  vulnerabilitiesFound++
                  if (vuln.param) {
                    reflectedParams.push(vuln.param)
                  }
                }
              } catch (e) {
                // Skip non-JSON lines
              }
            }
          }
        }
      } catch (parseErr) {
        console.error(`❌ [XSS] Parse error:`, parseErr)
      }
      
      setTestProgress(prev => ({ ...prev, 'xss-test': 90 }))
      
      const result = {
        testId: 'xss-test',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: vulnerabilitiesFound > 0 ? 'high' : 'medium',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: vulnerabilitiesFound > 0 ? [
          {
            type: 'critical',
            message: `Found ${vulnerabilitiesFound} XSS vulnerability/vulnerabilities`,
            details: vulnerabilities.map(v => `${v.type}: ${v.payload}`).join(', ')
          }
        ] : [
          {
            type: 'info',
            message: 'No XSS vulnerabilities found',
            details: 'XSS test completed successfully'
          }
        ],
        recommendations: vulnerabilitiesFound > 0 ? [
          'Implement proper input validation and output encoding',
          'Use Content Security Policy (CSP) headers',
          'Sanitize user input before rendering'
        ] : [
          'Continue to monitor for XSS vulnerabilities',
          'Implement Content Security Policy (CSP) headers as defense in depth'
        ],
        report: {
          scanType: 'Cross-Site Scripting (XSS) Testing',
          target: targetUrl,
          command: cmd,
          summary: {
            vulnerabilities_found: vulnerabilitiesFound,
            reflected_parameters: [...new Set(reflectedParams)],
            status: vulnerabilitiesFound > 0 ? 'VULNERABLE' : 'SAFE'
          },
          vulnerabilities: vulnerabilities,
          rawOutput: stdout + (stderr ? `\n${stderr}` : '')
        }
      }
      
      setTestProgress(prev => ({ ...prev, 'xss-test': 100 }))
      setScanResults(prev => ({ ...prev, 'xss-test': result }))
      setNewScanResults(prev => ({ ...prev, 'xss-test': result }))
      setCompletedTests(prev => new Set([...prev, 'xss-test']))
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `XSS test completed - Found ${vulnerabilitiesFound} vulnerability/vulnerabilities`, testId: 'xss-test', type: vulnerabilitiesFound > 0 ? 'error' : 'success' }])
      
      return result
    } catch (error) {
      console.error(`❌ [XSS] Error:`, error)
      setTestProgress(prev => ({ ...prev, 'xss-test': 100 }))
      
      const result = {
        testId: 'xss-test',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [{
          type: 'error',
          message: `XSS test failed: ${error.message}`,
          details: 'Verify dalfox is installed and target URL is accessible'
        }],
        recommendations: ['Verify dalfox is installed: pip3 install dalfox', 'Check network connectivity'],
        report: {
          scanType: 'Cross-Site Scripting (XSS) Testing',
          target: targetBase,
          command: `dalfox url "${targetBase}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json`,
          summary: { status: 'FAILED' },
          rawOutput: ''
        }
      }
      
      setScanResults(prev => ({ ...prev, 'xss-test': result }))
      setNewScanResults(prev => ({ ...prev, 'xss-test': result }))
      setCompletedTests(prev => new Set([...prev, 'xss-test']))
      
      return result
    }
  }

  // Run CSRF Test
  const runCSRFTest = async (targetBase) => {
    try {
      setCurrentTest({ id: 'csrf-test', name: 'Cross-Site Request Forgery (CSRF) Testing' })
      setTestProgress(prev => ({ ...prev, 'csrf-test': 10 }))
      
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      console.log(`🔍 [CSRF] Starting CSRF test for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting CSRF test for: ${targetUrl}`, testId: 'csrf-test', type: 'info' }])
      
      // Command: curl -X POST -H "Origin: http://evil.com" -H "Content-Type: application/x-www-form-urlencoded" -d "test=1" "${targetUrl}"
      const cmd = `curl -X POST -H "Origin: http://evil.com" -H "Content-Type: application/x-www-form-urlencoded" -d "test=1" "${targetUrl}"`
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Executing command: ${cmd}`, testId: 'csrf-test', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'csrf-test': 30 }))
      
      const out = await runWSL('csrf-test', cmd)
      
      setTestProgress(prev => ({ ...prev, 'csrf-test': 60 }))
      
      // Analyze response for CSRF protection
      const hasOriginCheck = /access-control-allow-origin/i.test(out) || /access-control-allow-credentials/i.test(out)
      const hasRefererCheck = /referer/i.test(out.toLowerCase())
      const hasCSRFToken = /csrf|token|_token|authenticity_token/i.test(out)
      const vulnerable = !hasOriginCheck && !hasRefererCheck && !hasCSRFToken
      
      setTestProgress(prev => ({ ...prev, 'csrf-test': 90 }))
      
      const result = {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: vulnerable ? 'high' : 'medium',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: vulnerable ? [
          {
            type: 'high',
            message: 'Potential CSRF vulnerability detected',
            details: 'Server accepted POST request without proper CSRF protection mechanisms'
          }
        ] : [
          {
            type: 'info',
            message: 'CSRF protection mechanisms detected',
            details: 'Server appears to have CSRF protection in place'
          }
        ],
        recommendations: vulnerable ? [
          'Implement CSRF tokens for all state-changing operations',
          'Validate Origin and Referer headers',
          'Use SameSite cookie attribute'
        ] : [
          'Continue monitoring CSRF protection',
          'Ensure all state-changing operations are protected'
        ],
        report: {
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          target: targetUrl,
          command: cmd,
          csrfVulnerability: vulnerable ? 'Potential Vulnerability' : 'Protected',
          summary: {
            status: vulnerable ? 'VULNERABLE' : 'PROTECTED',
            hasOriginCheck,
            hasRefererCheck,
            hasCSRFToken
          },
          rawOutput: out
        }
      }
      
      setTestProgress(prev => ({ ...prev, 'csrf-test': 100 }))
      setScanResults(prev => ({ ...prev, 'csrf-test': result }))
      setNewScanResults(prev => ({ ...prev, 'csrf-test': result }))
      setCompletedTests(prev => new Set([...prev, 'csrf-test']))
      
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `CSRF test completed - ${vulnerable ? 'Potential vulnerability detected' : 'Protected'}`, testId: 'csrf-test', type: vulnerable ? 'error' : 'success' }])
      
      return result
    } catch (error) {
      console.error(`❌ [CSRF] Error:`, error)
      setTestProgress(prev => ({ ...prev, 'csrf-test': 100 }))
      
      const result = {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [{
          type: 'error',
          message: `CSRF test failed: ${error.message}`,
          details: 'Verify target URL is accessible'
        }],
        recommendations: ['Check network connectivity', 'Verify target URL format'],
        report: {
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          target: targetBase,
          command: `curl -X POST -H "Origin: http://evil.com" -H "Content-Type: application/x-www-form-urlencoded" -d "test=1" "${targetBase}"`,
          csrfVulnerability: 'Unknown',
          summary: { status: 'FAILED' },
          rawOutput: ''
        }
      }
      
      setScanResults(prev => ({ ...prev, 'csrf-test': result }))
      setNewScanResults(prev => ({ ...prev, 'csrf-test': result }))
      setCompletedTests(prev => new Set([...prev, 'csrf-test']))
      
      return result
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
      
      console.log(`[QUICK-FINGERPRINT] Starting whatweb fingerprint for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting Quick Fingerprint scan for: ${targetUrl}`, testId: 'quick-fingerprint', type: 'info' }])

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
      const cmd = `whatweb -v ${targetUrl}`
      
      // Log the kali command before execution
      setLogs(prev => [...prev, { 
        timestamp: Date.now(), 
        message: `Quick Fingerprint Commands (Kali Linux):`, 
        testId: 'quick-fingerprint', 
        type: 'info' 
      }])
      setLogs(prev => [...prev, { 
        timestamp: Date.now(), 
        message: `  • Web Fingerprint: whatweb -v ${targetUrl}`, 
        testId: 'quick-fingerprint', 
        type: 'info' 
      }])
      
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
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Quick Fingerprint completed: ${result.plugins.length} plugins detected`, testId: 'quick-fingerprint', type: 'success' }])
      
      return result
    } catch (error) {
      console.error(`❌ [QUICK-FINGERPRINT] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'quick-fingerprint', type: 'error' }])
      
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

  // SSL/TLS Analysis
  const runSslTlsAnalysis = async (targetBase) => {
    try {
      // Clean the input - remove any spaces and URL encoding
      const cleanedInput = targetBase.trim().replace(/%20/g, ' ').trim()
      const targetUrl = cleanedInput.startsWith('http') ? cleanedInput : `https://${cleanedInput}`
      let domain = targetUrl
      try {
        const urlObj = new URL(targetUrl)
        domain = urlObj.hostname
      } catch {
        domain = targetUrl.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0]
      }
      
      // Clean domain - remove any spaces, URL encoding, and ensure it's valid
      domain = domain.trim().replace(/%20/g, '').replace(/\s+/g, '').toLowerCase()
      
      // Ensure domain is not empty
      if (!domain || domain.length === 0) {
        throw new Error('Invalid domain extracted from URL')
      }

      console.log(`[SSL-TLS] Starting SSL/TLS Analysis for: ${targetUrl} (domain: ${domain})`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting SSL/TLS Analysis for: ${targetUrl}`, testId: 'ssl-tls-analysis', type: 'info' }])

      // Extract domain for SSL commands
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `SSL/TLS Analysis Commands (Kali Linux):`, testId: 'ssl-tls-analysis', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Certificate Extraction: openssl s_client -connect ${domain}:443 -servername ${domain} </dev/null 2>/dev/null | openssl x509 -outform PEM > cert.pem`, testId: 'ssl-tls-analysis', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Certificate JSON: cat cert.pem | jc --x509-cert`, testId: 'ssl-tls-analysis', type: 'info' }])

      // Step 1: Extract certificate to PEM file - use domain for both connect and servername
      const cmd1 = `openssl s_client -connect ${domain}:443 -servername ${domain} </dev/null 2>/dev/null | openssl x509 -outform PEM > cert.pem`
      const { stdout: stdout1, stderr: stderr1 } = await runWSLSeparated('ssl-tls-analysis', cmd1)
      
      // Step 2: Convert PEM to JSON using jc
      const cmd2 = `cat cert.pem | jc --x509-cert`
      const { stdout: stdout2, stderr: stderr2 } = await runWSLSeparated('ssl-tls-analysis', cmd2)
      
      const jsonOutput = stdout2.trim()
      let certificateData = null
      
      // Parse JSON output from jc
      try {
        if (jsonOutput && jsonOutput !== '[]' && jsonOutput.startsWith('[')) {
          const parsed = JSON.parse(jsonOutput)
          certificateData = Array.isArray(parsed) ? parsed[0] : parsed
        } else if (jsonOutput && jsonOutput.startsWith('{')) {
          certificateData = JSON.parse(jsonOutput)
        }
      } catch (parseError) {
        console.error('Failed to parse certificate JSON:', parseError)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `Warning: Failed to parse certificate JSON. Raw output: ${jsonOutput.substring(0, 200)}`, testId: 'ssl-tls-analysis', type: 'warning' }])
      }

      const sslResult = {
        scanType: 'SSL/TLS Analysis',
        target: domain,
        supportedProtocols: [],
        cipherStrength: 'Unknown',
        deprecatedProtocols: [],
        weakCiphers: [],
        certificateInfo: {
          issuer: 'Unknown',
          validFrom: null,
          validTo: null,
          status: 'Unknown',
          subject: null,
          serialNumber: null,
          version: null,
          signatureAlgorithm: null,
          publicKeyAlgorithm: null,
          publicKeyBits: null,
          validityNotBefore: null,
          validityNotAfter: null,
          issuerDN: null,
          subjectDN: null,
          issuerFull: null,
          subjectFull: null
        },
        summary: 'SSL/TLS analysis completed',
        rawOutput: jsonOutput,
        certificateJson: certificateData
      }

      // Extract information from JSON certificate data
      if (certificateData) {
        // Handle nested structure (tbs_certificate) or flat structure
        const tbsCert = certificateData.tbs_certificate || certificateData
        const rootSignature = certificateData.signature_algorithm || tbsCert.signature
        
        // Issuer information - extract all fields
        const issuer = tbsCert.issuer || certificateData.issuer
        if (issuer) {
          if (typeof issuer === 'string') {
            sslResult.certificateInfo.issuer = issuer
          } else if (typeof issuer === 'object') {
            // Build issuer string from all available fields
            const issuerParts = []
            if (issuer.common_name) issuerParts.push(`CN=${issuer.common_name}`)
            if (issuer.organization_name || issuer.organization) issuerParts.push(`O=${issuer.organization_name || issuer.organization}`)
            if (issuer.organizational_unit_name || issuer.organizational_unit) issuerParts.push(`OU=${issuer.organizational_unit_name || issuer.organizational_unit}`)
            if (issuer.locality_name || issuer.locality) issuerParts.push(`L=${issuer.locality_name || issuer.locality}`)
            if (issuer.state_or_province_name || issuer.state) issuerParts.push(`ST=${issuer.state_or_province_name || issuer.state}`)
            if (issuer.country_name || issuer.country) issuerParts.push(`C=${issuer.country_name || issuer.country}`)
            if (issuer.email_address || issuer.email) issuerParts.push(`E=${issuer.email_address || issuer.email}`)
            
            sslResult.certificateInfo.issuer = issuerParts.length > 0 
              ? issuerParts.join(', ') 
              : (issuer.common_name || JSON.stringify(issuer))
            
            // Store full issuer object for detailed display
            sslResult.certificateInfo.issuerFull = issuer
          }
        }
        
        // Subject information - extract all fields
        const subject = tbsCert.subject || certificateData.subject
        if (subject) {
          if (typeof subject === 'string') {
            sslResult.certificateInfo.subject = subject
          } else if (typeof subject === 'object') {
            // Build subject string from all available fields
            const subjectParts = []
            if (subject.common_name) subjectParts.push(`CN=${subject.common_name}`)
            if (subject.organization_name || subject.organization) subjectParts.push(`O=${subject.organization_name || subject.organization}`)
            if (subject.organizational_unit_name || subject.organizational_unit) subjectParts.push(`OU=${subject.organizational_unit_name || subject.organizational_unit}`)
            if (subject.locality_name || subject.locality) subjectParts.push(`L=${subject.locality_name || subject.locality}`)
            if (subject.state_or_province_name || subject.state) subjectParts.push(`ST=${subject.state_or_province_name || subject.state}`)
            if (subject.country_name || subject.country) subjectParts.push(`C=${subject.country_name || subject.country}`)
            if (subject.email_address || subject.email) subjectParts.push(`E=${subject.email_address || subject.email}`)
            
            sslResult.certificateInfo.subject = subjectParts.length > 0 
              ? subjectParts.join(', ') 
              : (subject.common_name || JSON.stringify(subject))
            
            // Store full subject object for detailed display
            sslResult.certificateInfo.subjectFull = subject
          }
        }
        
        // Serial number
        const serialNumber = tbsCert.serial_number || certificateData.serial_number || tbsCert.serial_number_str || certificateData.serial_number_str
        if (serialNumber) {
          sslResult.certificateInfo.serialNumber = serialNumber
        }
        
        // Version
        const version = tbsCert.version || certificateData.version
        if (version) {
          sslResult.certificateInfo.version = version
        }
        
        // Signature algorithm - check root level first, then tbs_certificate
        if (rootSignature) {
          if (typeof rootSignature === 'object') {
            sslResult.certificateInfo.signatureAlgorithm = rootSignature.algorithm || JSON.stringify(rootSignature)
          } else {
            sslResult.certificateInfo.signatureAlgorithm = rootSignature
          }
        } else if (tbsCert.signature_algorithm || certificateData.signature_algorithm) {
          const sigAlg = tbsCert.signature_algorithm || certificateData.signature_algorithm
          if (typeof sigAlg === 'object') {
            sslResult.certificateInfo.signatureAlgorithm = sigAlg.algorithm || JSON.stringify(sigAlg)
          } else {
            sslResult.certificateInfo.signatureAlgorithm = sigAlg
          }
        }
        
        // Public key information
        const publicKeyInfo = tbsCert.subject_public_key_info || certificateData.public_key || certificateData.subject_public_key_info
        if (publicKeyInfo) {
          const algorithm = publicKeyInfo.algorithm || (publicKeyInfo.algorithm && publicKeyInfo.algorithm.algorithm ? publicKeyInfo.algorithm : null)
          if (algorithm) {
            if (typeof algorithm === 'object') {
              sslResult.certificateInfo.publicKeyAlgorithm = algorithm.algorithm || JSON.stringify(algorithm)
            } else {
              sslResult.certificateInfo.publicKeyAlgorithm = algorithm
            }
          }
          // Try to get bits from public_key or calculate from modulus
          if (publicKeyInfo.public_key) {
            if (publicKeyInfo.public_key.modulus) {
              // Estimate bits from modulus length (hex string, each 2 chars = 1 byte, 8 bits per byte)
              const modulusHex = publicKeyInfo.public_key.modulus.replace(/:/g, '').replace(/\s/g, '')
              sslResult.certificateInfo.publicKeyBits = modulusHex.length * 4 // Each hex char = 4 bits
            }
          }
          if (publicKeyInfo.bits) {
            sslResult.certificateInfo.publicKeyBits = publicKeyInfo.bits
          }
        }
        
        // Validity dates - check for ISO format first, then timestamp
        const validity = tbsCert.validity || certificateData.validity
        if (validity) {
          if (validity.not_before_iso) {
            sslResult.certificateInfo.validityNotBefore = validity.not_before_iso
            sslResult.certificateInfo.validFrom = validity.not_before_iso
          } else if (validity.not_before) {
            // Convert timestamp to ISO string
            const date = new Date(validity.not_before * 1000)
            sslResult.certificateInfo.validityNotBefore = date.toISOString()
            sslResult.certificateInfo.validFrom = date.toISOString()
          }
          
          if (validity.not_after_iso) {
            sslResult.certificateInfo.validityNotAfter = validity.not_after_iso
            sslResult.certificateInfo.validTo = validity.not_after_iso
            
            // Check if certificate is expired
            const notAfter = new Date(validity.not_after_iso)
            const now = new Date()
            sslResult.certificateInfo.status = notAfter < now ? 'Expired' : 'Valid'
          } else if (validity.not_after) {
            // Convert timestamp to ISO string
            const date = new Date(validity.not_after * 1000)
            sslResult.certificateInfo.validityNotAfter = date.toISOString()
            sslResult.certificateInfo.validTo = date.toISOString()
            
            // Check if certificate is expired
            const notAfter = new Date(validity.not_after * 1000)
            const now = new Date()
            sslResult.certificateInfo.status = notAfter < now ? 'Expired' : 'Valid'
          }
        } else {
          // Fallback to old format
          if (certificateData.validity_not_before) {
            sslResult.certificateInfo.validityNotBefore = certificateData.validity_not_before
            sslResult.certificateInfo.validFrom = certificateData.validity_not_before
          }
          if (certificateData.validity_not_after) {
            sslResult.certificateInfo.validityNotAfter = certificateData.validity_not_after
            sslResult.certificateInfo.validTo = certificateData.validity_not_after
            
            // Check if certificate is expired
            const notAfter = new Date(certificateData.validity_not_after)
            const now = new Date()
            sslResult.certificateInfo.status = notAfter < now ? 'Expired' : 'Valid'
          }
        }
        
        // Issuer DN and Subject DN
        if (certificateData.issuer_dn) {
          sslResult.certificateInfo.issuerDN = certificateData.issuer_dn
        }
        if (certificateData.subject_dn) {
          sslResult.certificateInfo.subjectDN = certificateData.subject_dn
        }
        
        // Extract extensions for additional info (subject alternative names)
        const extensions = tbsCert.extensions || certificateData.extensions
        if (extensions && Array.isArray(extensions)) {
          // Find subject_alt_name extension
          const sanExtension = extensions.find(ext => 
            ext.extn_id === 'subject_alt_name' || 
            ext.extn_id === 'subjectAltName' ||
            ext.oid === '2.5.29.17'
          )
          if (sanExtension && sanExtension.extn_value) {
            if (Array.isArray(sanExtension.extn_value)) {
              sslResult.subjectAlternativeNames = sanExtension.extn_value
            } else {
              sslResult.subjectAlternativeNames = [sanExtension.extn_value]
            }
          }
        } else if (certificateData.extensions && certificateData.extensions.subject_alt_name) {
          sslResult.subjectAlternativeNames = certificateData.extensions.subject_alt_name
        }
      }

      console.log(`✅ [SSL-TLS] SSL/TLS Analysis completed`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `SSL/TLS Analysis completed - Certificate parsed successfully`, testId: 'ssl-tls-analysis', type: 'success' }])
      
      return sslResult
    } catch (error) {
      console.error(`❌ [SSL-TLS] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'ssl-tls-analysis', type: 'error' }])
      return {
        scanType: 'SSL/TLS Analysis',
        target: targetBase,
        error: error.message,
        summary: `SSL/TLS analysis failed: ${error.message}`
      }
    }
  }

  // Security Headers Analysis
  const runSecurityHeaders = async (targetBase) => {
    try {
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      
      console.log(`[SECURITY-HEADERS] Starting Security Headers Analysis for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting Security Headers Analysis for: ${targetUrl}`, testId: 'security-headers', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Security Headers Analysis Commands (Kali Linux):`, testId: 'security-headers', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Headers Check: curl -I -L ${targetUrl} 2>/dev/null | awk...`, testId: 'security-headers', type: 'info' }])

      const cmd = `curl -I -L ${targetUrl} 2>/dev/null | awk 'BEGIN {print "{"} /^[^:]+:/ {gsub("\\r",""); split($0,a,": "); printf "\\"%s\\": \\"%s\\",\\n", a[1], a[2]} END {print "}"}' | sed '$ s/,$//'`
      const { stdout, stderr } = await runWSLSeparated('security-headers', cmd)
      const jsonOutput = stdout.trim()
      
      let headersJson = {}
      try {
        if (jsonOutput && jsonOutput.startsWith('{')) {
          headersJson = JSON.parse(jsonOutput)
        }
      } catch (parseError) {
        console.error('Failed to parse headers JSON:', parseError)
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `Warning: Failed to parse headers JSON. Raw output: ${jsonOutput.substring(0, 200)}`, testId: 'security-headers', type: 'warning' }])
        
        // Fallback: parse headers manually if JSON parsing fails
        const output = stdout + (stderr ? `\n${stderr}` : '')
        const lines = output.split('\n')
        lines.forEach(line => {
          if (line.includes(':')) {
            const [key, ...valueParts] = line.split(':')
            const value = valueParts.join(':').trim()
            const keyLower = key.trim().toLowerCase()
            headersJson[keyLower] = value
          }
        })
      }

      const headersResult = {
        scanType: 'Security Headers',
        target: targetUrl,
        headersFound: headersJson,
        missingHeaders: [],
        summary: 'Security headers analysis completed',
        command: cmd,
        rawOutput: jsonOutput,
        headersJson: headersJson
      }

      const requiredHeaders = [
        'strict-transport-security',
        'content-security-policy',
        'x-frame-options',
        'x-content-type-options',
        'x-xss-protection',
        'referrer-policy',
        'permissions-policy'
      ]

      // Check for missing headers (case-insensitive)
      const foundHeadersLower = Object.keys(headersJson).map(h => h.toLowerCase())
      requiredHeaders.forEach(header => {
        if (!foundHeadersLower.includes(header.toLowerCase())) {
          headersResult.missingHeaders.push(header)
        }
      })

      console.log(`✅ [SECURITY-HEADERS] Security Headers Analysis completed - Missing: ${headersResult.missingHeaders.length}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Security Headers Analysis completed - Found: ${Object.keys(headersJson).length}, Missing: ${headersResult.missingHeaders.length}`, testId: 'security-headers', type: 'success' }])
      
      return headersResult
    } catch (error) {
      console.error(`❌ [SECURITY-HEADERS] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'security-headers', type: 'error' }])
      return {
        scanType: 'Security Headers',
        target: targetBase,
        error: error.message,
        summary: `Security headers analysis failed: ${error.message}`
      }
    }
  }

  // DNS Resolution & Analysis
  const runDnsResolution = async (targetBase) => {
    try {
      let domain = targetBase
      try {
        const urlObj = new URL(targetBase.startsWith('http') ? targetBase : `https://${targetBase}`)
        domain = urlObj.hostname.replace(/^www\./, '')
      } catch {
        domain = targetBase.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      }

      console.log(`[DNS-RESOLUTION] Starting DNS Resolution & Analysis for: ${domain}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting DNS Resolution & Analysis for: ${domain}`, testId: 'dns-resolution', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `DNS Resolution & Analysis Commands (Kali Linux):`, testId: 'dns-resolution', type: 'info' }])
      
      const scanStartTime = new Date().toISOString()
      const commandSteps = []
      
      const dnsResult = {
        scanType: 'DNS Resolution & Analysis',
        target: domain,
        digAny: [],
        digRecords: [],
        reverseDns: null,
        dnsrecon: null,
        dnsenum: null,
        summary: 'DNS resolution & analysis completed',
        rawOutput: '',
        scanMetadata: {
          startTime: scanStartTime,
          endTime: null,
          durationSeconds: 0,
          steps: [],
          artifacts: [],
          warnings: [],
          summaryText: ''
        }
      }

      // Command 1: dig domain ANY | jc --dig --pretty
      const step1Start = Date.now()
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Basic DNS Lookup: dig ${domain} ANY | jc --dig --pretty`, testId: 'dns-resolution', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'dns-resolution': 10 }))
      const cmd1 = `dig ${domain} ANY | jc --dig --pretty`
      const { stdout: stdout1, stderr: stderr1 } = await runWSLSeparated('dns-resolution', cmd1)
      const json1 = stdout1.trim()
      
      commandSteps.push({
        id: 'dig-any',
        timestamp: new Date(step1Start).toISOString(),
        name: 'Basic DNS Lookup (ANY)',
        command: cmd1,
        description: 'Retrieve all DNS record types for comprehensive domain analysis',
        stdoutBytes: stdout1.length,
        stderrBytes: stderr1 ? stderr1.length : 0,
        status: stderr1 && stderr1.length > 0 ? 'warning' : 'completed',
        artifactPaths: [],
        stdoutSnippet: stdout1.substring(0, 200)
      })
      
      if (json1 && json1 !== '[]' && json1 !== '') {
        try {
          const parsed1 = JSON.parse(json1)
          dnsResult.digAny = Array.isArray(parsed1) ? parsed1 : [parsed1]
        } catch (e) {
          console.error('Failed to parse dig ANY JSON:', e)
        }
      } else {
        dnsResult.digAny = []
        setLogs(prev => [...prev, { timestamp: Date.now(), message: `Warning: Server appears unreachable (empty result)`, testId: 'dns-resolution', type: 'warning' }])
      }

      // Command 2: dig +noall +answer domain A MX TXT NS SOA | jc --dig
      const step2Start = Date.now()
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Detailed DNS Records: dig +noall +answer ${domain} A MX TXT NS SOA | jc --dig`, testId: 'dns-resolution', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'dns-resolution': 30 }))
      const cmd2 = `dig +noall +answer ${domain} A MX TXT NS SOA | jc --dig`
      const { stdout: stdout2, stderr: stderr2 } = await runWSLSeparated('dns-resolution', cmd2)
      const json2 = stdout2.trim()
      
      commandSteps.push({
        id: 'dig-records',
        timestamp: new Date(step2Start).toISOString(),
        name: 'Detailed DNS Records',
        command: cmd2,
        description: 'Extract specific record types (A, MX, TXT, NS, SOA) for security analysis',
        stdoutBytes: stdout2.length,
        stderrBytes: stderr2 ? stderr2.length : 0,
        status: stderr2 && stderr2.length > 0 ? 'warning' : 'completed',
        artifactPaths: [],
        stdoutSnippet: stdout2.substring(0, 200)
      })
      
      if (json2 && json2 !== '[]' && json2 !== '') {
        try {
          const parsed2 = JSON.parse(json2)
          dnsResult.digRecords = Array.isArray(parsed2) ? parsed2 : [parsed2]
        } catch (e) {
          console.error('Failed to parse dig records JSON:', e)
        }
      }

      // Command 3: dig -x $(dig +short domain) +short
      const step3Start = Date.now()
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Reverse DNS: dig -x $(dig +short ${domain}) +short`, testId: 'dns-resolution', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'dns-resolution': 50 }))
      const cmd3 = `dig -x $(dig +short ${domain}) +short`
      const { stdout: stdout3, stderr: stderr3 } = await runWSLSeparated('dns-resolution', cmd3)
      dnsResult.reverseDns = stdout3.trim() || null
      
      commandSteps.push({
        id: 'reverse-dns',
        timestamp: new Date(step3Start).toISOString(),
        name: 'Reverse DNS Lookup',
        command: cmd3,
        description: 'Perform reverse DNS lookup to identify hostnames associated with IP addresses',
        stdoutBytes: stdout3.length,
        stderrBytes: stderr3 ? stderr3.length : 0,
        status: stderr3 && stderr3.length > 0 ? 'warning' : 'completed',
        artifactPaths: [],
        stdoutSnippet: stdout3.substring(0, 200)
      })

      // Commands 4-5: dnsrecon
      const step4Start = Date.now()
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • DNS Reconnaissance: dnsrecon -d ${domain} -j dnsrecon_output.json`, testId: 'dns-resolution', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'dns-resolution': 70 }))
      const cmd4 = `dnsrecon -d ${domain} -j dnsrecon_output.json`
      const { stdout: stdout4, stderr: stderr4 } = await runWSLSeparated('dns-resolution', cmd4)
      
      commandSteps.push({
        id: 'dnsrecon-scan',
        timestamp: new Date(step4Start).toISOString(),
        name: 'DNS Reconnaissance',
        command: cmd4,
        description: 'Perform comprehensive DNS reconnaissance to discover subdomains and records',
        stdoutBytes: stdout4.length,
        stderrBytes: stderr4 ? stderr4.length : 0,
        status: stderr4 && stderr4.length > 0 ? 'warning' : 'completed',
        artifactPaths: ['dnsrecon_output.json'],
        stdoutSnippet: stdout4.substring(0, 200)
      })
      
      const cmd5 = `cat dnsrecon_output.json`
      const { stdout: stdout5, stderr: stderr5 } = await runWSLSeparated('dns-resolution', cmd5)
      const json5 = stdout5.trim()
      
      commandSteps.push({
        id: 'dnsrecon-read',
        timestamp: new Date(Date.now()).toISOString(),
        name: 'Read DNS Recon Output',
        command: cmd5,
        description: 'Read the dnsrecon JSON output file',
        stdoutBytes: stdout5.length,
        stderrBytes: stderr5 ? stderr5.length : 0,
        status: stderr5 && stderr5.length > 0 ? 'warning' : 'completed',
        artifactPaths: ['dnsrecon_output.json'],
        stdoutSnippet: json5.substring(0, 200)
      })
      
      if (json5 && json5 !== '[]' && json5 !== '') {
        try {
          dnsResult.dnsrecon = JSON.parse(json5)
        } catch (e) {
          console.error('Failed to parse dnsrecon JSON:', e)
          dnsResult.dnsrecon = { raw: json5 }
        }
      }

      // Commands 6-8: dnsenum
      const step6Start = Date.now()
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • DNS Enumeration: Creating wordlist and running dnsenum`, testId: 'dns-resolution', type: 'info' }])
      setTestProgress(prev => ({ ...prev, 'dns-resolution': 85 }))
      const cmd6 = `echo -e "www\\nmail\\nftp\\nblog" > custom_wordlist.txt`
      const { stdout: stdout6, stderr: stderr6 } = await runWSLSeparated('dns-resolution', cmd6)
      
      commandSteps.push({
        id: 'create-wordlist',
        timestamp: new Date(step6Start).toISOString(),
        name: 'Create Wordlist',
        command: cmd6,
        description: 'Create custom wordlist for DNS enumeration',
        stdoutBytes: stdout6.length,
        stderrBytes: stderr6 ? stderr6.length : 0,
        status: stderr6 && stderr6.length > 0 ? 'warning' : 'completed',
        artifactPaths: ['custom_wordlist.txt'],
        stdoutSnippet: stdout6.substring(0, 200)
      })
      
      const cmd7 = `dnsenum --threads 10 --noreverse -t 5 -p 5 -f custom_wordlist.txt ${domain} -o dnsenum_output.xml`
      const { stdout: stdout7, stderr: stderr7 } = await runWSLSeparated('dns-resolution', cmd7)
      
      commandSteps.push({
        id: 'dnsenum-scan',
        timestamp: new Date(Date.now()).toISOString(),
        name: 'DNS Enumeration',
        command: cmd7,
        description: 'Perform DNS enumeration to discover subdomains using brute force',
        stdoutBytes: stdout7.length,
        stderrBytes: stderr7 ? stderr7.length : 0,
        status: stderr7 && stderr7.length > 0 ? 'warning' : 'completed',
        artifactPaths: ['dnsenum_output.xml'],
        stdoutSnippet: stdout7.substring(0, 200)
      })
      
      const cmd8 = `cat dnsenum_output.xml`
      const { stdout: stdout8, stderr: stderr8 } = await runWSLSeparated('dns-resolution', cmd8)
      const xmlOutput = stdout8.trim()
      
      commandSteps.push({
        id: 'dnsenum-read',
        timestamp: new Date(Date.now()).toISOString(),
        name: 'Read DNS Enum Output',
        command: cmd8,
        description: 'Read the dnsenum XML output file',
        stdoutBytes: stdout8.length,
        stderrBytes: stderr8 ? stderr8.length : 0,
        status: stderr8 && stderr8.length > 0 ? 'warning' : 'completed',
        artifactPaths: ['dnsenum_output.xml'],
        stdoutSnippet: xmlOutput.substring(0, 200)
      })
      
      // Convert XML to JSON
      if (xmlOutput) {
        try {
          // Simple XML to JSON conversion for dnsenum output
          const xmlToJson = (xmlString) => {
            const result = { hosts: [], subdomains: [] }
            const hostMatches = xmlString.match(/<host hostname="([^"]+)" ip="([^"]+)"[^>]*>/g)
            if (hostMatches) {
              hostMatches.forEach(match => {
                const hostnameMatch = match.match(/hostname="([^"]+)"/)
                const ipMatch = match.match(/ip="([^"]+)"/)
                if (hostnameMatch && ipMatch) {
                  result.hosts.push({
                    hostname: hostnameMatch[1],
                    ip: ipMatch[1]
                  })
                  if (hostnameMatch[1] !== domain && hostnameMatch[1].endsWith(domain)) {
                    result.subdomains.push(hostnameMatch[1])
                  }
                }
              })
            }
            return result
          }
          dnsResult.dnsenum = xmlToJson(xmlOutput)
        } catch (e) {
          console.error('Failed to convert dnsenum XML to JSON:', e)
          dnsResult.dnsenum = { raw: xmlOutput }
        }
      }

      setTestProgress(prev => ({ ...prev, 'dns-resolution': 100 }))
      console.log(`✅ [DNS-RESOLUTION] DNS Resolution & Analysis completed`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `DNS Resolution & Analysis completed successfully`, testId: 'dns-resolution', type: 'success' }])
      
      // Calculate scan metadata
      const scanEndTime = new Date().toISOString()
      const durationMs = Date.now() - new Date(scanStartTime).getTime()
      const durationSeconds = Math.floor(durationMs / 1000)
      
      // Collect warnings
      const warnings = []
      commandSteps.forEach(step => {
        if (step.stderrBytes > 0) {
          warnings.push(`${step.name} produced ${step.stderrBytes} bytes of stderr output`)
        }
        if (step.status === 'warning') {
          warnings.push(`${step.name} completed with warnings`)
        }
      })
      
      // Collect artifacts
      const artifacts = []
      const artifactMap = new Map()
      commandSteps.forEach(step => {
        step.artifactPaths.forEach(path => {
          if (!artifactMap.has(path)) {
            artifactMap.set(path, {
              path,
              type: path.endsWith('.json') ? 'json' : path.endsWith('.xml') ? 'xml' : path.endsWith('.txt') ? 'text' : 'unknown',
              sizeBytes: 0 // Will be estimated from stdout if available
            })
          }
        })
      })
      artifacts.push(...Array.from(artifactMap.values()))
      
      // Update artifact sizes from command outputs
      const dnsreconArtifact = artifacts.find(a => a.path === 'dnsrecon_output.json')
      if (dnsreconArtifact && stdout5) dnsreconArtifact.sizeBytes = stdout5.length
      
      const dnsenumArtifact = artifacts.find(a => a.path === 'dnsenum_output.xml')
      if (dnsenumArtifact && xmlOutput) dnsenumArtifact.sizeBytes = xmlOutput.length
      
      const wordlistArtifact = artifacts.find(a => a.path === 'custom_wordlist.txt')
      if (wordlistArtifact) wordlistArtifact.sizeBytes = 20 // Approximate
      
      // Create summary text
      const summaryText = `DNS Resolution & Analysis completed successfully in ${durationSeconds} seconds. ${commandSteps.length} commands executed. ${warnings.length > 0 ? `${warnings.length} warning(s) detected.` : 'No warnings.'}`
      
      dnsResult.scanMetadata = {
        startTime: scanStartTime,
        endTime: scanEndTime,
        durationSeconds,
        steps: commandSteps,
        artifacts,
        warnings,
        summaryText
      }
      
      return dnsResult
    } catch (error) {
      console.error(`❌ [DNS-RESOLUTION] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'dns-resolution', type: 'error' }])
      return {
        scanType: 'DNS Resolution & Analysis',
        target: targetBase,
        error: error.message,
        summary: `DNS resolution & analysis failed: ${error.message}`
      }
    }
  }

  // CMS Detection
  const runCmsDetection = async (targetBase) => {
    try {
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      
      console.log(`[CMS-DETECTION] Starting CMS Detection for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting CMS Detection for: ${targetUrl}`, testId: 'cms-detection', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `CMS Detection Commands (Kali Linux):`, testId: 'cms-detection', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • CMS Fingerprint: wig -a -t 10 -q -w /dev/null ${targetUrl}`, testId: 'cms-detection', type: 'info' }])

      const cmd = `wig -a -t 10 -q -w /dev/null ${targetUrl}`
      const { stdout, stderr } = await runWSLSeparated('cms-detection', cmd)
      const output = stdout + (stderr ? `\n${stderr}` : '')

      const cmsResult = {
        scanType: 'CMS Detection',
        target: targetUrl,
        status: '200 OK',
        server: 'Unknown',
        cms: null,
        framework: null,
        summary: 'CMS detection completed',
        command: cmd,
        rawOutput: output,
        parsedData: {}
      }

      // Parse wig output - wig provides structured text output
      // Look for CMS/technology information in the output
      const lines = output.split('\n')
      const detectedTechnologies = []
      const detectedCMS = []
      const detectedServers = []
      const detectedPlugins = []
      
      lines.forEach(line => {
        const trimmedLine = line.trim()
        
        // Look for CMS detection patterns
        if (/WordPress|WP|wp-content|wp-admin/i.test(trimmedLine)) {
          const versionMatch = trimmedLine.match(/(?:WordPress|WP)[\/\s]?([0-9.]+)/i)
          if (versionMatch) {
            detectedCMS.push({ name: 'WordPress', version: versionMatch[1] })
          } else if (!detectedCMS.some(c => c.name === 'WordPress')) {
            detectedCMS.push({ name: 'WordPress', version: 'Unknown' })
          }
        }
        
        if (/Joomla|joomla/i.test(trimmedLine) && !detectedCMS.some(c => c.name === 'Joomla')) {
          const versionMatch = trimmedLine.match(/Joomla[\/\s]?([0-9.]+)/i)
          detectedCMS.push({ name: 'Joomla', version: versionMatch ? versionMatch[1] : 'Unknown' })
        }
        
        if (/Drupal|drupal/i.test(trimmedLine) && !detectedCMS.some(c => c.name === 'Drupal')) {
          const versionMatch = trimmedLine.match(/Drupal[\/\s]?([0-9.]+)/i)
          detectedCMS.push({ name: 'Drupal', version: versionMatch ? versionMatch[1] : 'Unknown' })
        }
        
        // Look for server information
        if (/nginx/i.test(trimmedLine) && !detectedServers.some(s => s.includes('nginx'))) {
          detectedServers.push('nginx')
        }
        if (/Apache/i.test(trimmedLine) && !detectedServers.some(s => s.includes('Apache'))) {
          const versionMatch = trimmedLine.match(/Apache[\/\s]?([0-9.]+)/i)
          detectedServers.push(versionMatch ? `Apache ${versionMatch[1]}` : 'Apache')
        }
        if (/IIS|Microsoft-IIS/i.test(trimmedLine) && !detectedServers.some(s => s.includes('IIS'))) {
          detectedServers.push('Microsoft IIS')
        }
        
        // Look for technologies and frameworks
        if (/PHP|php/i.test(trimmedLine)) {
          const versionMatch = trimmedLine.match(/PHP[\/\s]?([0-9.]+)/i)
          if (!detectedTechnologies.some(t => t.name === 'PHP')) {
            detectedTechnologies.push({ name: 'PHP', version: versionMatch ? versionMatch[1] : 'Unknown' })
          }
        }
        
        // Extract plugin information if available
        if (/plugin|Plugin|PLUGIN/i.test(trimmedLine) && !trimmedLine.includes('WordPress')) {
          const pluginMatch = trimmedLine.match(/([A-Za-z0-9-]+)\s+(?:plugin|Plugin)/i)
          if (pluginMatch) {
            detectedPlugins.push(pluginMatch[1])
          }
        }
      })

      // Set CMS result
      if (detectedCMS.length > 0) {
        cmsResult.cms = detectedCMS[0].name
        cmsResult.framework = detectedCMS[0].version
      }

      // Set server
      if (detectedServers.length > 0) {
        cmsResult.server = detectedServers[0]
      }

      // Store parsed data
      cmsResult.parsedData = {
        cms: detectedCMS,
        servers: detectedServers,
        technologies: detectedTechnologies,
        plugins: detectedPlugins
      }

      console.log(`✅ [CMS-DETECTION] CMS Detection completed - CMS: ${cmsResult.cms || 'None'}, Server: ${cmsResult.server || 'Unknown'}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `CMS Detection completed - CMS: ${cmsResult.cms || 'None'}, Server: ${cmsResult.server || 'Unknown'}`, testId: 'cms-detection', type: 'success' }])
      
      return cmsResult
    } catch (error) {
      console.error(`❌ [CMS-DETECTION] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'cms-detection', type: 'error' }])
      return {
        scanType: 'CMS Detection',
        target: targetBase,
        error: error.message,
        summary: `CMS detection failed: ${error.message}`
      }
    }
  }

  // Subdomain Enumeration
  const runSubdomainEnumeration = async (targetBase) => {
    try {
      let domain = targetBase
      try {
        const urlObj = new URL(targetBase.startsWith('http') ? targetBase : `https://${targetBase}`)
        domain = urlObj.hostname.replace(/^www\./, '')
      } catch {
        domain = targetBase.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
      }

      console.log(`[SUBDOMAIN] Starting Subdomain Enumeration for: ${domain}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting Subdomain Enumeration for: ${domain}`, testId: 'subdomain-enumeration', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Subdomain Enumeration Commands (Kali Linux):`, testId: 'subdomain-enumeration', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Subdomain Enumeration: amass enum -d ${domain} -json amass_subdomains.json`, testId: 'subdomain-enumeration', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Reading Results: cat amass_subdomains.json`, testId: 'subdomain-enumeration', type: 'info' }])

      // Step 1: Run amass enum
      const cmd1 = `amass enum -d ${domain} -json amass_subdomains.json`
      await runWSLSeparated('subdomain-enumeration', cmd1)
      
      // Step 2: Read the JSON output
      const cmd2 = `cat amass_subdomains.json`
      const { stdout, stderr } = await runWSLSeparated('subdomain-enumeration', cmd2)
      const jsonOutput = stdout.trim()

      const subdomainResult = {
        scanType: 'Subdomain Enumeration',
        target: domain,
        subdomainsFound: [],
        count: 0,
        summary: 'Subdomain enumeration completed',
        command: cmd1,
        rawOutput: jsonOutput,
        amassData: []
      }

      // Parse amass JSON output (one JSON object per line)
      if (jsonOutput) {
        const lines = jsonOutput.split('\n').filter(line => line.trim())
        const subdomainSet = new Set()
        const amassEntries = []
        
        lines.forEach(line => {
          try {
            const entry = JSON.parse(line)
            amassEntries.push(entry)
            
            // Extract subdomain from entry
            if (entry.name) {
              const subdomain = entry.name.trim()
              if (subdomain.includes(domain) && !subdomainSet.has(subdomain)) {
                subdomainSet.add(subdomain)
              }
            }
          } catch (parseError) {
            // Skip invalid JSON lines
            console.warn('Failed to parse amass JSON line:', line)
          }
        })

        subdomainResult.amassData = amassEntries
        subdomainResult.subdomainsFound = Array.from(subdomainSet).sort()
        subdomainResult.count = subdomainResult.subdomainsFound.length
      }

      console.log(`✅ [SUBDOMAIN] Subdomain Enumeration completed - Found: ${subdomainResult.count}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Subdomain Enumeration completed - Found: ${subdomainResult.count} subdomain(s)`, testId: 'subdomain-enumeration', type: 'success' }])
      
      return subdomainResult
    } catch (error) {
      console.error(`❌ [SUBDOMAIN] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'subdomain-enumeration', type: 'error' }])
      return {
        scanType: 'Subdomain Enumeration',
        target: targetBase,
        error: error.message,
        summary: `Subdomain enumeration failed: ${error.message}`
      }
    }
  }

  // Port Scanning
  const runPortScanning = async (targetBase) => {
    try {
      let domain = targetBase
      try {
        const urlObj = new URL(targetBase.startsWith('http') ? targetBase : `https://${targetBase}`)
        domain = urlObj.hostname
      } catch {
        domain = targetBase.replace(/^https?:\/\//, '').split('/')[0]
      }

      console.log(`[PORT-SCAN] Starting Port Scanning for: ${domain}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting Port Scanning for: ${domain}`, testId: 'port-scanning', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Port Scanning Commands (Kali Linux):`, testId: 'port-scanning', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • Top Ports Scan: nmap -sV --top-ports 100 ${domain}`, testId: 'port-scanning', type: 'info' }])

      const cmd = `timeout 120 nmap -sV --top-ports 100 ${domain} 2>/dev/null || echo "nmap scan failed or timed out"`
      const { stdout, stderr } = await runWSLSeparated('port-scanning', cmd)
      const output = stdout + (stderr ? `\n${stderr}` : '')

      const portResult = {
        scanType: 'Port Scanning',
        target: domain,
        openPorts: [],
        totalOpen: 0,
        summary: 'Port scanning completed',
        command: cmd // Store the actual command used
      }

      // Parse nmap output for open ports
      const lines = output.split('\n')
      lines.forEach(line => {
        // Look for lines like: 443/tcp open https nginx
        const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|open\|filtered)\s+([^\s]+)\s*(.*)/i)
        if (portMatch) {
          const port = parseInt(portMatch[1])
          const protocol = portMatch[2]
          const state = portMatch[3]
          const service = portMatch[4]
          const version = portMatch[5] ? portMatch[5].trim() : ''
          
          portResult.openPorts.push({
            port,
            protocol,
            state,
            service,
            version
          })
        }
      })

      portResult.totalOpen = portResult.openPorts.length

      console.log(`✅ [PORT-SCAN] Port Scanning completed - Found: ${portResult.totalOpen} open port(s)`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Port Scanning completed - Found: ${portResult.totalOpen} open port(s)`, testId: 'port-scanning', type: 'success' }])
      
      return portResult
    } catch (error) {
      console.error(`❌ [PORT-SCAN] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'port-scanning', type: 'error' }])
      return {
        scanType: 'Port Scanning',
        target: targetBase,
        error: error.message,
        summary: `Port scanning failed: ${error.message}`
      }
    }
  }

  // SQL Injection Test
  const runSqlInjectionTest = async (targetBase) => {
    try {
      const targetUrl = targetBase.startsWith('http') ? targetBase : `https://${targetBase}`
      
      console.log(`[SQL-INJECTION] Starting SQL Injection Test for: ${targetUrl}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Starting SQL Injection Test for: ${targetUrl}`, testId: 'sql-injection-test', type: 'info' }])

      setLogs(prev => [...prev, { timestamp: Date.now(), message: `SQL Injection Test Commands (Kali Linux):`, testId: 'sql-injection-test', type: 'info' }])
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `  • SQL Injection Test: sqlmap -u ${targetUrl} --batch --level=1 --risk=1 --dbs`, testId: 'sql-injection-test', type: 'info' }])

      // Use a simpler sqlmap command for basic testing
      const cmd = `timeout 300 sqlmap -u ${targetUrl} --batch --level=1 --risk=1 --dbs 2>/dev/null || echo "sqlmap test completed or timed out"`
      const { stdout, stderr } = await runWSLSeparated('sql-injection-test', cmd)
      const output = stdout + (stderr ? `\n${stderr}` : '')

      const sqlResult = {
        scanType: 'SQL Injection Test',
        target: targetUrl,
        vulnerable: false,
        databasesFound: [],
        summary: 'SQL injection test completed',
        command: cmd // Store the actual command used
      }

      // Parse sqlmap output
      if (output.includes('vulnerable') || output.includes('injection') || output.includes('payload')) {
        sqlResult.vulnerable = true
      }

      // Extract database names
      const dbMatches = output.match(/available databases \[([\d]+)\]:\s*([^\n]+)/i)
      if (dbMatches) {
        const dbList = dbMatches[2].split(/[,\s]+/).filter(db => db.trim())
        sqlResult.databasesFound = dbList
      }

      console.log(`✅ [SQL-INJECTION] SQL Injection Test completed - Vulnerable: ${sqlResult.vulnerable}`)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `SQL Injection Test completed - Vulnerable: ${sqlResult.vulnerable ? 'Yes' : 'No'}`, testId: 'sql-injection-test', type: 'success' }])
      
      return sqlResult
    } catch (error) {
      console.error(`❌ [SQL-INJECTION] Error:`, error)
      setLogs(prev => [...prev, { timestamp: Date.now(), message: `Error: ${error.message}`, testId: 'sql-injection-test', type: 'error' }])
      return {
        scanType: 'SQL Injection Test',
        target: targetBase,
        error: error.message,
        summary: `SQL injection test failed: ${error.message}`
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
                ? 'Additional security scans completed with some errors - check individual scan results for details'
                : 'Additional security scans completed successfully!',
              testId: 'additional-scans',
              type: hasErrors ? 'warning' : 'success'
            }])
            
            // Complete the scanning process
            setCurrentTest(null)
            const endTime = Date.now()
            setScanTiming(prev => ({ ...prev, endTime }))
            setScanEndTime(endTime)
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
            message: 'Additional security scans completed successfully! (Demo Mode)',
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
        message: `Additional scans failed: ${error.message}`,
        testId: 'additional-scans',
        type: 'error'
      }])
    }
  }

  // Open scan detail dialog
  const openScanDetailDialog = (testId, result) => {
    console.log('Opening scan detail dialog for:', testId, result)
    console.log('Result type:', typeof result)
    console.log('Result keys:', result ? Object.keys(result) : 'null')
    console.log('Result report:', result?.report)
    console.log('Result scanType:', result?.report?.scanType)
    setSelectedScanResult({ testId, result })
    setShowScanDetailDialog(true)
    // Clear AI suggestions when opening a new scan dialog
    setAiSuggestions(null)
    setAiError(null)
  }

  // Fetch AI suggestions for the current scan
  const fetchAISuggestions = async () => {
    if (!selectedScanResult) return

    setIsLoadingAI(true)
    setAiError(null)
    setAiSuggestions(null)

    // Scroll to AI Suggestion section
    setTimeout(() => {
      if (aiSuggestionRef.current) {
        aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)

    try {
      const { testId, result } = selectedScanResult
      const test = securityTests.find(t => t.id === testId)
      const scanName = test?.name || result?.testName || testId
      
      // Extract raw output from various possible locations
      const report = result?.report || {}
      let rawOutput = ''
      
      // Try different locations for raw output
      if (report.rawOutput) {
        rawOutput = report.rawOutput
      } else if (report.raw_output) {
        rawOutput = report.raw_output
      } else if (report.rawCommandsOutput && Array.isArray(report.rawCommandsOutput)) {
        // For DNS scans, combine all command outputs
        rawOutput = report.rawCommandsOutput
          .map(cmd => `Command: ${cmd.command || cmd.cmd || 'N/A'}\nOutput: ${cmd.output || ''}\n${cmd.stderr ? `Error: ${cmd.stderr}\n` : ''}`)
          .join('\n\n---\n\n')
      } else if (report.summary?.raw_output) {
        rawOutput = report.summary.raw_output
      } else if (result?.rawOutput) {
        rawOutput = result.rawOutput
      } else if (result?.raw_output) {
        rawOutput = result.raw_output
      }
      
      // Get target URL
      const target = report.target || report.summary?.target_url || targetUrl
      
      // Call Grok API
      const suggestions = await getAISuggestions(
        testId,
        scanName,
        result,
        rawOutput,
        target
      )
      
      setAiSuggestions(suggestions)
      showSuccess('AI suggestions generated successfully!')
      
      // Scroll to AI Suggestion section after results are loaded
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } catch (error) {
      console.error('Error fetching AI suggestions:', error)
      setAiError(error.message || 'Failed to fetch AI suggestions. Please try again.')
      showError(error.message || 'Failed to fetch AI suggestions. Please try again.')
      
      // Scroll to AI Suggestion section even on error
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } finally {
      setIsLoadingAI(false)
    }
  }

  // Check tools before starting scan

  // Generate comprehensive PDF Report with all scan data
  const generatePDFReport = async () => {
    console.log('📄 [PDF] Generating comprehensive security report...')
    
    // Check if this is a DNS-specific PDF generation
    const isDnsReport = selectedDnsResult && selectedDnsResult.report
    
    if (isDnsReport) {
      // Generate DNS-specific PDF
      if (!selectedDnsResult.report) {
        showError('No DNS scan results available to generate report')
        return
      }
    } else {
      // General comprehensive report
      if ((!scanResults || Object.keys(scanResults).length === 0) && 
          (!newScanResults || Object.keys(newScanResults).length === 0)) {
        showError('No scan results available to generate report')
        return
      }
    }

    setIsExporting(true)
    
    try {
      // Import jsPDF dynamically
      const { jsPDF } = await import('jspdf')
      
      // Create new PDF document
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const borderMargin = 10
      const footerHeight = 20
      let yPosition = margin + 10
      
      // Function to draw page border (only on each page, not around content)
      const drawPageBorder = () => {
        doc.setDrawColor(80, 80, 80)
        doc.setLineWidth(0.8)
        doc.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      }
      
      // Function to add footer with "Cyberix - A Webnox Product" and page number
      const addFooter = () => {
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber
        const totalPages = doc.internal.getNumberOfPages()
        
        // Footer line
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight)
        
        // Footer text: "Cyberix - A Webnox Product"
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text('Cyberix - A Webnox Product', pageWidth / 2, pageHeight - footerHeight + 12, { align: 'center' })
        
        // Page number
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
      }
      
      // Helper to update all page footers
      const updateAllFooters = () => {
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          drawPageBorder()
          const currentPage = i
          
          // Footer line
          doc.setDrawColor(200, 200, 200)
          doc.setLineWidth(0.5)
          doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight)
          
          // Footer text: "Cyberix - A Webnox Product"
          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(100, 100, 100)
          doc.text('Cyberix - A Webnox Product', pageWidth / 2, pageHeight - footerHeight + 12, { align: 'center' })
          
          // Page number
          doc.setFontSize(9)
          doc.setTextColor(100, 100, 100)
          doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
        }
      }
      
      // Draw border and footer on first page
      drawPageBorder()
      addFooter()
      
      // Helper function to add text with word wrap
      const addText = (text, x, y, maxWidth = pageWidth - 40, fontSize = 12, fontStyle = 'normal', color = [0, 0, 0]) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color[0], color[1], color[2])
        const lines = doc.splitTextToSize(text || '', maxWidth)
        doc.text(lines, x, y)
        return y + (lines.length * (fontSize * 0.4)) + 5
      }
      
      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace = 20) => {
        // Account for footer space
        const availableHeight = pageHeight - margin - footerHeight - 10
        if (yPosition + requiredSpace > availableHeight) {
          // Add footer to current page before adding new page
          addFooter()
          
          doc.addPage()
          drawPageBorder() // Draw border on new page
          addFooter() // Add footer to new page
          yPosition = margin + 10
        }
      }
      
      // Enhanced section box helper with professional styling
      const addSectionBox = (title, contentLines = [], heightPadding = 15, backgroundColor = [250, 250, 250], borderColor = [180, 180, 180]) => {
        checkNewPage(30)
        
        // Calculate approximate height
        let estimatedHeight = 20 + heightPadding
        contentLines.forEach(line => {
          if (line.text) {
            const lines = doc.splitTextToSize(line.text || '', pageWidth - 2 * margin - 25)
            estimatedHeight += Math.max(8, lines.length * 6) + 4
          }
        })
        
        // Professional section box
        doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
        doc.setLineWidth(0.6)
        doc.setFillColor(backgroundColor[0], backgroundColor[1], backgroundColor[2])
        doc.rect(margin + 5, yPosition - 5, pageWidth - 2 * margin - 10, estimatedHeight, 'FD')
        
        // Section title with professional background
        doc.setFillColor(245, 245, 245)
        doc.rect(margin + 6, yPosition - 4, pageWidth - 2 * margin - 12, 16, 'F')
        
        // Title text
        doc.setTextColor(40, 40, 40)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text(title, margin + 10, yPosition + 6)
        
        // Content lines
        let currentY = yPosition + 18
        contentLines.forEach(line => {
          if (line.text) {
            doc.setFontSize(line.fontSize || 10)
            doc.setFont('helvetica', line.fontStyle || 'normal')
            doc.setTextColor(line.color ? line.color[0] : 60, line.color ? line.color[1] : 60, line.color ? line.color[2] : 60)
            const lines = doc.splitTextToSize(line.text, pageWidth - 2 * margin - 30)
            lines.forEach((l, idx) => {
              doc.text(l, margin + 10 + (line.indent || 0), currentY + (idx * 6))
            })
            currentY += Math.max(8, lines.length * 6) + 4
          }
        })
        
        yPosition = yPosition - 5 + estimatedHeight + 10
      }
      
      // Enhanced Title Header
      doc.setFillColor(59, 130, 246) // Blue
      doc.setDrawColor(59, 130, 246)
      doc.setLineWidth(0)
      doc.rect(margin + 5, yPosition - 5, pageWidth - 2 * margin - 10, 40, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(22)
      doc.setFont('helvetica', 'bold')
      
      if (isDnsReport) {
        doc.text('DNS Security Analysis - Comprehensive Report', pageWidth / 2, yPosition + 10, { align: 'center' })
        doc.setFontSize(14)
        doc.setFont('helvetica', 'normal')
        doc.text('Detailed domain security assessment and vulnerability analysis', pageWidth / 2, yPosition + 22, { align: 'center' })
      } else {
        doc.text('Comprehensive Security Analysis Report', pageWidth / 2, yPosition + 10, { align: 'center' })
        doc.setFontSize(14)
        doc.setFont('helvetica', 'normal')
        doc.text('Cyberix Security Scanner', pageWidth / 2, yPosition + 22, { align: 'center' })
      }
      yPosition += 50
      
      // Enhanced Scan Details Section
      const targetInfo = isDnsReport ? (selectedDnsResult.report.target || targetUrl) : targetUrl
      addSectionBox('Report Information', [
        { text: `Target: ${targetInfo}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] },
        { text: `Analysis Date: ${new Date().toLocaleString()}`, fontSize: 11, fontStyle: 'normal', color: [60, 60, 60] },
        { text: `Generated By: Cyberix Security Scanner`, fontSize: 11, fontStyle: 'normal', color: [60, 60, 60] }
      ])
      
      // If DNS report, generate DNS-specific content
      if (isDnsReport) {
        const report = selectedDnsResult.report
        
        // AI Suggestion Section
        if (aiSuggestions) {
          checkNewPage(40)
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('AI Suggestion', margin + 10, yPosition)
          yPosition += 5
          
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          const aiLines = doc.splitTextToSize(aiSuggestions, pageWidth - 2 * margin - 20)
          aiLines.forEach((line, idx) => {
            checkNewPage(15)
            doc.text(line, margin + 10, yPosition + (idx * 6))
          })
          yPosition += (aiLines.length * 6) + 15
        }
        
        // DNS Security Score
        if (report.security_score) {
          addSectionBox('DNS Security Score', [
            { text: `Score: ${report.security_score.score}/100`, fontSize: 12, fontStyle: 'bold', color: [30, 30, 30] },
            { text: `Grade: ${report.security_score.grade}`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] },
            { text: report.security_score.description || '', fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
          ])
        }
        
        // Risk Summary
        if (report.risk_summary) {
          const riskLevel = report.risk_summary.overall_risk || 'Unknown'
          const riskColor = riskLevel === 'Critical' ? [239, 68, 68] : riskLevel === 'High' ? [249, 115, 22] : 
                           riskLevel === 'Medium' ? [234, 179, 8] : riskLevel === 'Low' ? [34, 197, 94] : [100, 100, 100]
          const riskLines = [
            { text: `Overall Risk: ${riskLevel}`, fontSize: 12, fontStyle: 'bold', color: riskColor },
            { text: `Total Issues: ${report.risk_summary.total_issues || 0}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] },
            { text: `Critical: ${report.risk_summary.critical_issues || 0} | High: ${report.risk_summary.high_issues || 0} | Medium: ${report.risk_summary.medium_issues || 0} | Low: ${report.risk_summary.low_issues || 0}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] }
          ]
          if (report.risk_summary.summary) {
            riskLines.push({ text: report.risk_summary.summary, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          addSectionBox('Risk Summary', riskLines)
        }
        
        // Security Risk Assessment
        if (report.summary) {
          const assessmentLines = []
          if (report.summary.subdomainsFound !== undefined) {
            assessmentLines.push({ text: `Subdomain Hijacking: ${report.summary.subdomainsFound > 0 ? 'Medium Risk' : 'Low Risk'}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          if (report.summary.zoneTransfer) {
            const zoneColor = report.summary.zoneTransfer === 'blocked' ? [34, 197, 94] : [239, 68, 68]
            assessmentLines.push({ text: `Zone Transfer: ${report.summary.zoneTransfer === 'blocked' ? 'Protected' : 'Vulnerable'}`, fontSize: 10, fontStyle: 'normal', color: zoneColor })
          }
          if (report.summary.spfRecord !== undefined) {
            const spfColor = report.summary.spfRecord ? [34, 197, 94] : [239, 68, 68]
            assessmentLines.push({ text: `SPF Protection: ${report.summary.spfRecord ? 'Configured' : 'Missing'}`, fontSize: 10, fontStyle: 'normal', color: spfColor })
          }
          if (report.summary.dmarcRecord !== undefined) {
            const dmarcColor = report.summary.dmarcRecord ? [34, 197, 94] : [239, 68, 68]
            assessmentLines.push({ text: `DMARC Policy: ${report.summary.dmarcRecord ? 'Configured' : 'Missing'}`, fontSize: 10, fontStyle: 'normal', color: dmarcColor })
          }
          if (report.summary.dnssec !== undefined) {
            const dnssecColor = report.summary.dnssec ? [34, 197, 94] : [239, 68, 68]
            assessmentLines.push({ text: `DNSSEC Status: ${report.summary.dnssec ? 'Enabled (Secure)' : 'Disabled (Vulnerable)'}`, fontSize: 10, fontStyle: 'normal', color: dnssecColor })
          }
          if (assessmentLines.length > 0) {
            addSectionBox('Security Risk Assessment', assessmentLines)
          }
        }
        
        // DNS Scan Overview - Scan Metadata
        if (report.scanMetadata) {
          checkNewPage(40)
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('DNS Scan — Overview', margin + 10, yPosition)
          yPosition += 10
          
          // Summary
          if (report.scanMetadata.summaryText) {
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            const summaryLines = doc.splitTextToSize(report.scanMetadata.summaryText, pageWidth - 2 * margin - 20)
            summaryLines.forEach((line, idx) => {
              checkNewPage(15)
              doc.text(line, margin + 10, yPosition + (idx * 6))
            })
            yPosition += (summaryLines.length * 6) + 15
          }
          
          // Timeline
          if (report.scanMetadata.steps && report.scanMetadata.steps.length > 0) {
            checkNewPage(30)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Scan Timeline', margin + 10, yPosition)
            yPosition += 8
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            report.scanMetadata.steps.forEach((step, idx) => {
              checkNewPage(20)
              const stepTime = new Date(step.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
              const statusColor = step.status === 'completed' ? [34, 197, 94] : step.status === 'warning' ? [234, 179, 8] : [239, 68, 68]
              doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
              doc.setFont('helvetica', 'bold')
              doc.text(`[${stepTime}] ${step.name} - ${step.status}`, margin + 10, yPosition)
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(60, 60, 60)
              doc.text(`  Output: ${step.stdoutBytes}b${step.stderrBytes > 0 ? `, stderr: ${step.stderrBytes}b` : ''}`, margin + 15, yPosition + 6)
              yPosition += 15
            })
            yPosition += 10
          }
          
          // Command Execution Details Table
          if (report.scanMetadata.steps && report.scanMetadata.steps.length > 0) {
            checkNewPage(40)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Command Execution Details', margin + 10, yPosition)
            yPosition += 8
            
            doc.setFontSize(8)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(70, 70, 70)
            // Table header
            doc.text('Step', margin + 10, yPosition)
            doc.text('Description', margin + 50, yPosition)
            doc.text('Output', margin + 130, yPosition)
            doc.text('Status', margin + 160, yPosition)
            yPosition += 8
            
            doc.setDrawColor(200, 200, 200)
            doc.setLineWidth(0.3)
            doc.line(margin + 10, yPosition - 2, pageWidth - margin - 10, yPosition - 2)
            
            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            report.scanMetadata.steps.forEach((step, idx) => {
              checkNewPage(25)
              doc.setTextColor(30, 30, 30)
              const stepTime = new Date(step.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
              
              // Step name with timestamp
              const stepText = `${step.name}\n${stepTime}`
              const stepLines = doc.splitTextToSize(stepText, 40)
              stepLines.forEach((line, lidx) => {
                doc.text(line, margin + 10, yPosition + (lidx * 5))
              })
              
              // Description
              const descLines = doc.splitTextToSize(step.description || '', 75)
              descLines.forEach((line, lidx) => {
                doc.text(line, margin + 50, yPosition + (lidx * 5))
              })
              
              // Output
              doc.text(`${step.stdoutBytes}b${step.stderrBytes > 0 ? `/${step.stderrBytes}b` : ''}`, margin + 130, yPosition)
              
              // Status
              const statusColor = step.status === 'completed' ? [34, 197, 94] : step.status === 'warning' ? [234, 179, 8] : [239, 68, 68]
              doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
              doc.setFont('helvetica', 'bold')
              doc.text(step.status, margin + 160, yPosition)
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(30, 30, 30)
              
              yPosition += Math.max(stepLines.length, descLines.length) * 5 + 8
            })
            yPosition += 10
          }
          
          // Warnings
          if (report.scanMetadata.warnings && report.scanMetadata.warnings.length > 0) {
            checkNewPage(30)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Warnings & Noteworthy Findings', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(234, 179, 8)
            report.scanMetadata.warnings.forEach((warning, idx) => {
              checkNewPage(15)
              doc.text(`• ${warning}`, margin + 15, yPosition)
              yPosition += 8
            })
            yPosition += 10
          }
        }
        
        // DNS Records
        if (report.records) {
          const recordLines = []
          Object.entries(report.records).forEach(([recordType, records]) => {
            if (records && Array.isArray(records) && records.length > 0) {
              recordLines.push({ text: `${recordType} Records (${records.length}):`, fontSize: 11, fontStyle: 'bold', color: [30, 30, 30] })
              records.slice(0, 10).forEach((record, idx) => {
                const recordText = typeof record === 'object' ? JSON.stringify(record) : String(record)
                recordLines.push({ text: `  ${idx + 1}. ${recordText}`, fontSize: 9, fontStyle: 'normal', color: [60, 60, 60], indent: 0 })
              })
              if (records.length > 10) {
                recordLines.push({ text: `  ... and ${records.length - 10} more ${recordType} records`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100], indent: 0 })
              }
            }
          })
          if (recordLines.length > 0) {
            addSectionBox('DNS Records', recordLines, 20)
          }
        }
        
        // DNSSEC Status
        if (report.dnssec) {
          const dnssecColor = report.dnssec.enabled ? [34, 197, 94] : [239, 68, 68]
          const dnssecLines = [
            { text: `Status: ${report.dnssec.enabled ? 'Enabled' : 'Disabled'}`, fontSize: 11, fontStyle: 'bold', color: dnssecColor }
          ]
          if (report.dnssec.recommendation) {
            dnssecLines.push({ text: report.dnssec.recommendation, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60] })
          }
          addSectionBox('DNSSEC Status', dnssecLines)
        }
        
        // Zone Transfer Status
        if (report.zone_transfer) {
          const zoneColor = report.zone_transfer.allowed ? [239, 68, 68] : [34, 197, 94]
          addSectionBox('Zone Transfer Status', [
            { text: `Status: ${report.zone_transfer.allowed ? 'Allowed (Security Risk)' : 'Blocked (Secure)'}`, fontSize: 11, fontStyle: 'bold', color: zoneColor }
          ])
        }
        
        // Subdomains
        if (report.subdomains && report.subdomains.length > 0) {
          const subdomainLines = report.subdomains.slice(0, 30).map((subdomain, idx) => ({
            text: `${idx + 1}. ${subdomain}`, fontSize: 10, fontStyle: 'normal', color: [60, 60, 60]
          }))
          if (report.subdomains.length > 30) {
            subdomainLines.push({ text: `... and ${report.subdomains.length - 30} more subdomains`, fontSize: 9, fontStyle: 'italic', color: [100, 100, 100] })
          }
          addSectionBox('Discovered Subdomains', subdomainLines, 15)
        }
        
        // Security Findings
        if (report.findings && report.findings.length > 0) {
          checkNewPage(30)
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Security Findings', margin + 10, yPosition)
          yPosition += 10
          
          report.findings.forEach((finding, idx) => {
            checkNewPage(40)
            const severityColor = finding.severity === 'Critical' ? [239, 68, 68] : 
                                  finding.severity === 'High' ? [249, 115, 22] : 
                                  finding.severity === 'Medium' ? [234, 179, 8] : [59, 130, 246]
            
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(severityColor[0], severityColor[1], severityColor[2])
            yPosition = addText(`${finding.severity}: ${finding.issue}`, margin + 10, yPosition)
            
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(60, 60, 60)
            if (finding.explanation) {
              const explLines = doc.splitTextToSize(finding.explanation, pageWidth - 2 * margin - 20)
              explLines.forEach((line, lidx) => {
                doc.text(line, margin + 15, yPosition + (lidx * 5))
              })
              yPosition += (explLines.length * 5) + 5
            }
            if (finding.recommendation) {
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(30, 30, 30)
              doc.text('Recommendation:', margin + 15, yPosition)
              doc.setFont('helvetica', 'normal')
              const recLines = doc.splitTextToSize(finding.recommendation, pageWidth - 2 * margin - 25)
              recLines.forEach((line, lidx) => {
                doc.text(line, margin + 20, yPosition + 7 + (lidx * 5))
              })
              yPosition += (recLines.length * 5) + 12
            }
          })
          yPosition += 10
        }
        
        // DNS Scan Raw Results
        if (report.digAny || report.digRecords || report.dnsrecon || report.dnsenum || report.reverseDns) {
          checkNewPage(30)
          doc.setFontSize(16)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('DNS Scan Raw Results', margin + 10, yPosition)
          yPosition += 10
          
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 60, 60)
          
          // Basic DNS Lookup (ANY)
          if (report.digAny && report.digAny.length > 0) {
            checkNewPage(20)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Basic DNS Lookup (ANY):', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            const digAnyText = JSON.stringify(report.digAny, null, 2).substring(0, 1500)
            const digAnyLines = doc.splitTextToSize(digAnyText, pageWidth - 2 * margin - 20)
            digAnyLines.slice(0, 30).forEach((line, idx) => {
              checkNewPage(8)
              doc.text(line, margin + 10, yPosition + (idx * 4))
            })
            yPosition += (digAnyLines.length * 4) + 10
          }
          
          // Detailed DNS Records
          if (report.digRecords && report.digRecords.length > 0) {
            checkNewPage(20)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Detailed DNS Records (A, MX, TXT, NS, SOA):', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            const digRecordsText = JSON.stringify(report.digRecords, null, 2).substring(0, 1000)
            const digRecordsLines = doc.splitTextToSize(digRecordsText, pageWidth - 2 * margin - 20)
            digRecordsLines.slice(0, 25).forEach((line, idx) => {
              checkNewPage(8)
              doc.text(line, margin + 10, yPosition + (idx * 4))
            })
            yPosition += (digRecordsLines.length * 4) + 10
          }
          
          // Reverse DNS
          if (report.reverseDns) {
            checkNewPage(15)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Reverse DNS:', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            const reverseDnsLines = doc.splitTextToSize(String(report.reverseDns), pageWidth - 2 * margin - 20)
            reverseDnsLines.slice(0, 10).forEach((line, idx) => {
              checkNewPage(8)
              doc.text(line, margin + 10, yPosition + (idx * 4))
            })
            yPosition += (reverseDnsLines.length * 4) + 10
          }
          
          // DNS Reconnaissance
          if (report.dnsrecon) {
            checkNewPage(20)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('DNS Reconnaissance (dnsrecon):', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            const dnsreconText = JSON.stringify(report.dnsrecon, null, 2).substring(0, 1500)
            const dnsreconLines = doc.splitTextToSize(dnsreconText, pageWidth - 2 * margin - 20)
            dnsreconLines.slice(0, 30).forEach((line, idx) => {
              checkNewPage(8)
              doc.text(line, margin + 10, yPosition + (idx * 4))
            })
            yPosition += (dnsreconLines.length * 4) + 10
          }
          
          // DNS Enumeration
          if (report.dnsenum) {
            checkNewPage(20)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('DNS Enumeration (dnsenum):', margin + 10, yPosition)
            yPosition += 5
            
            doc.setFontSize(7)
            doc.setFont('helvetica', 'normal')
            const dnsenumText = JSON.stringify(report.dnsenum, null, 2).substring(0, 1500)
            const dnsenumLines = doc.splitTextToSize(dnsenumText, pageWidth - 2 * margin - 20)
            dnsenumLines.slice(0, 30).forEach((line, idx) => {
              checkNewPage(8)
              doc.text(line, margin + 10, yPosition + (idx * 4))
            })
            yPosition += (dnsenumLines.length * 4) + 10
          }
        }
        
        // Raw Output
        if (report.rawOutput) {
          checkNewPage(30)
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Raw Command Output', margin + 10, yPosition)
          yPosition += 5
          
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(60, 60, 60)
          const rawLines = doc.splitTextToSize(report.rawOutput.substring(0, 2000), pageWidth - 2 * margin - 20)
          rawLines.slice(0, 40).forEach((line, idx) => {
            checkNewPage(8)
            doc.text(line, margin + 10, yPosition + (idx * 4))
          })
          if (report.rawOutput.length > 2000) {
            yPosition += (40 * 4) + 5
            doc.setFont('helvetica', 'italic')
            doc.text(`... (output truncated, ${Math.floor(report.rawOutput.length / 1000)}KB total)`, margin + 10, yPosition)
          }
        }
        
        // Update all footers and save
        updateAllFooters()
        doc.save(`DNS_Security_Analysis_${targetInfo.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`)
        setIsExporting(false)
        showSuccess('DNS Security Analysis PDF report generated successfully!')
        return
      }
      
      // Enhanced Table of Contents (for general comprehensive report)
      const tocLines = []
      const scansForTOC = getScansToRun()
      scansForTOC.forEach((test, idx) => {
        tocLines.push({ text: `${idx + 1}. ${test.name}`, fontSize: 11, fontStyle: 'normal', color: [30, 30, 30] })
      })
      addSectionBox('Table of Contents', tocLines, 10)
      
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
          yPosition = addText('Reverse DNS available', 20, yPosition)
          yPosition = addText(`Hostname: ${structuredData.reverse_dns.hostname}`, 25, yPosition)
        } else {
          yPosition = addText('Reverse DNS lookup failed or timed out', 20, yPosition)
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
          'Email Security': '',
          'DNS Integrity': '',
          'Availability & Resilience': '',
          'Other': ''
        };
        
        Object.entries(groupedFindings).forEach(([category, findings]) => {
          checkNewPage(20)
          
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText(`${category}`, 20, yPosition)
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
      
      // Helper function to add scan section with all detailed content
      const addScanSection = (scanNumber, scanName, testId, result) => {
        if (!result) return yPosition
        
        const report = result.report || {}
        checkNewPage(40)
        
        // Section Header
        doc.setFontSize(16)
        doc.setFont('helvetica', 'bold')
        yPosition = addText(`${scanNumber}. ${scanName}`, 20, yPosition)
        yPosition += 10
        
        // Scan Summary
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.rect(20, yPosition - 10, pageWidth - 40, 40)
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        yPosition = addText('Scan Summary', 25, yPosition)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        yPosition = addText(`Status: ${result.status || 'N/A'}`, 25, yPosition)
        yPosition = addText(`Findings: ${result.findings?.length || 0}`, 25, yPosition)
        yPosition = addText(`Recommendations: ${result.recommendations?.length || report.recommendations?.length || 0}`, 25, yPosition)
        yPosition = addText(`Severity: ${result.severity || 'N/A'}`, 25, yPosition)
        yPosition += 10
        
        // Risk Assessment
        if (report.riskLevel || report.risk_summary) {
          checkNewPage(30)
          doc.rect(20, yPosition - 10, pageWidth - 40, 25)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Risk Assessment', 25, yPosition)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          if (report.risk_summary?.overall_risk) {
            yPosition = addText(`Overall Risk: ${report.risk_summary.overall_risk}`, 25, yPosition)
          } else if (report.riskLevel) {
            yPosition = addText(`Risk Level: ${report.riskLevel}`, 25, yPosition)
          }
          yPosition += 10
        }
        
        // Scan Details
        if (report.target || report.scanType) {
          checkNewPage(30)
          doc.rect(20, yPosition - 10, pageWidth - 40, 25)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Scan Details', 25, yPosition)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          if (report.target) yPosition = addText(`Target: ${report.target}`, 25, yPosition)
          if (report.scanType) yPosition = addText(`Scan Type: ${report.scanType}`, 25, yPosition)
          yPosition += 10
        }
        
        // Scan-specific content (same as generateScanPDF logic)
        if (testId === 'ssl-tls-analysis' || report.scanType === 'SSL/TLS Analysis') {
          if (report.supportedProtocols) {
            checkNewPage(40)
            doc.rect(20, yPosition - 10, pageWidth - 40, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('SSL/TLS Configuration', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`Supported Protocols: ${report.supportedProtocols.join(', ')}`, 25, yPosition)
            if (report.cipherStrength) {
              yPosition = addText(`Cipher Strength: ${report.cipherStrength}`, 25, yPosition)
            }
            if (report.certificateInfo) {
              if (report.certificateInfo.issuer) {
                yPosition = addText(`Certificate Issuer: ${report.certificateInfo.issuer}`, 25, yPosition)
              }
              if (report.certificateInfo.validTo) {
                yPosition = addText(`Valid Until: ${report.certificateInfo.validTo}`, 25, yPosition)
              }
            }
            yPosition += 10
          }
        }
        
        if (testId === 'security-headers' || report.scanType === 'Security Headers') {
          if (report.headersFound || report.missingHeaders) {
            checkNewPage(50)
            doc.rect(20, yPosition - 10, pageWidth - 40, 40)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Security Headers', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            if (report.headersFound) {
              yPosition = addText('Headers Found:', 25, yPosition)
              Object.entries(report.headersFound).forEach(([key, value]) => {
                checkNewPage(15)
                yPosition = addText(`${key}: ${value}`, 30, yPosition)
              })
            }
            if (report.missingHeaders && report.missingHeaders.length > 0) {
              checkNewPage(30)
              yPosition = addText('Missing Headers:', 25, yPosition)
              report.missingHeaders.forEach((header) => {
                checkNewPage(15)
                yPosition = addText(`- ${header}`, 30, yPosition)
              })
            }
            yPosition += 10
          }
        }
        
        if (testId === 'port-scanning' || report.scanType === 'Port Scanning') {
          if (report.openPorts && report.openPorts.length > 0) {
            checkNewPage(50)
            doc.rect(20, yPosition - 10, pageWidth - 40, 40)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Open Ports', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            report.openPorts.slice(0, 20).forEach((port, idx) => {
              const portInfo = `Port: ${port.port}, Service: ${port.service || 'N/A'}, Version: ${port.version || 'N/A'}`
              checkNewPage(15)
              yPosition = addText(`${idx + 1}. ${portInfo}`, 25, yPosition)
            })
            if (report.openPorts.length > 20) {
              yPosition = addText(`... and ${report.openPorts.length - 20} more ports`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        if (testId === 'subdomain-enumeration' || report.scanType === 'Subdomain Enumeration') {
          if (report.subdomainsFound && report.subdomainsFound.length > 0) {
            checkNewPage(50)
            doc.rect(20, yPosition - 10, pageWidth - 40, 40)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Discovered Subdomains', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            report.subdomainsFound.slice(0, 30).forEach((subdomain, idx) => {
              checkNewPage(15)
              yPosition = addText(`${idx + 1}. ${subdomain}`, 25, yPosition)
            })
            if (report.subdomainsFound.length > 30) {
              yPosition = addText(`... and ${report.subdomainsFound.length - 30} more`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // Open Redirect Check
        if (testId === 'open-redirect-check' || report.scanType === 'Open Redirect Check') {
          if (report.summary) {
            checkNewPage(40)
            doc.rect(20, yPosition - 10, pageWidth - 40, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Open Redirect Check Results', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`🔍 We checked your site for unvalidated redirects by sending a request with a malicious redirect parameter`, 25, yPosition)
            const statusColor = report.summary.status === 'Vulnerable' ? [239, 68, 68] : [34, 197, 94]
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`Result: ${report.summary.status === 'Vulnerable' ? '❌ FAILURE - Potential vulnerability detected' : '✅ SUCCESS - No unvalidated redirects found'}`, 25, yPosition)
            doc.setTextColor(60, 60, 60)
            doc.setFont('helvetica', 'normal')
            if (report.summary.evidence) {
              yPosition = addText(`Evidence: ${report.summary.evidence}`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // Host Trust Verification
        if (testId === 'host-header-injection' || report.scanType === 'Host Trust Verification') {
          if (report.summary) {
            checkNewPage(40)
            doc.rect(20, yPosition - 10, pageWidth - 40, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Host Trust Verification Results', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`🔍 We created a defensive attack against your site by sending a request with a malicious Host header`, 25, yPosition)
            const statusColor = report.summary.status === 'Vulnerable' ? [239, 68, 68] : [34, 197, 94]
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`Result: ${report.summary.status === 'Vulnerable' ? '❌ FAILURE - Potential host header injection vulnerability detected' : '✅ SUCCESS - Host header properly validated'}`, 25, yPosition)
            doc.setTextColor(60, 60, 60)
            doc.setFont('helvetica', 'normal')
            if (report.summary.evidence) {
              yPosition = addText(`Evidence: ${report.summary.evidence}`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // HTTP Allowed Methods Check
        if (testId === 'http-methods-check' || report.scanType === 'HTTP Allowed Methods Check') {
          if (report.summary) {
            checkNewPage(40)
            doc.rect(20, yPosition - 10, pageWidth - 40, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('HTTP Allowed Methods Check Results', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`🔍 We checked your site for dangerous HTTP methods by sending an OPTIONS request`, 25, yPosition)
            const statusColor = report.summary.status === 'Vulnerable' ? [239, 68, 68] : [34, 197, 94]
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`Result: ${report.summary.status === 'Vulnerable' ? '❌ FAILURE - Dangerous HTTP methods enabled' : '✅ SUCCESS - Only safe HTTP methods enabled'}`, 25, yPosition)
            doc.setTextColor(60, 60, 60)
            doc.setFont('helvetica', 'normal')
            if (report.summary.evidence) {
              yPosition = addText(`Evidence: ${report.summary.evidence}`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // CORS Policy Validation
        if (testId === 'cors-policy-validation' || report.scanType === 'CORS Policy Validation') {
          if (report.summary) {
            checkNewPage(40)
            doc.rect(20, yPosition - 10, pageWidth - 40, 30)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('CORS Policy Validation Results', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`🔍 We created a defensive attack against your site by sending a request with a malicious Origin header`, 25, yPosition)
            const statusColor = report.summary.status === 'Vulnerable' ? [239, 68, 68] : [34, 197, 94]
            doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`Result: ${report.summary.status === 'Vulnerable' ? '❌ FAILURE - Insecure CORS policy detected' : '✅ SUCCESS - CORS policy is secure'}`, 25, yPosition)
            doc.setTextColor(60, 60, 60)
            doc.setFont('helvetica', 'normal')
            if (report.summary.evidence) {
              yPosition = addText(`Evidence: ${report.summary.evidence}`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // CT Log Subdomain Discovery
        if (testId === 'ct-log-subdomain-discovery' || report.scanType === 'Certificate Transparency (CT) Log Subdomain Discovery') {
          if (report.summary) {
            checkNewPage(50)
            doc.rect(20, yPosition - 10, pageWidth - 40, 40)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            yPosition = addText('Certificate Transparency (CT) Log Subdomain Discovery', 25, yPosition)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            if (report.summary.evidence) {
              yPosition = addText(`Evidence: ${report.summary.evidence}`, 25, yPosition)
            }
            if (report.unique_subdomains && report.unique_subdomains.length > 0) {
              checkNewPage(30)
              yPosition = addText(`Discovered Subdomains (${report.unique_subdomains.length}):`, 25, yPosition)
              report.unique_subdomains.slice(0, 30).forEach((subdomain, idx) => {
                checkNewPage(15)
                yPosition = addText(`${idx + 1}. ${subdomain}`, 30, yPosition)
              })
              if (report.unique_subdomains.length > 30) {
                yPosition = addText(`... and ${report.unique_subdomains.length - 30} more`, 30, yPosition)
              }
            }
            if (report.certificates && report.certificates.length > 0) {
              checkNewPage(20)
              yPosition = addText(`Certificates Found: ${report.certificates.length}`, 25, yPosition)
            }
            yPosition += 10
          }
        }
        
        // Command Display
        if (report.command) {
          checkNewPage(40)
          doc.rect(20, yPosition - 10, pageWidth - 40, 30)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Command Executed', 25, yPosition)
          doc.setFontSize(8)
          doc.setFont('courier', 'normal')
          doc.setTextColor(60, 60, 60)
          const cmdLines = doc.splitTextToSize(report.command, pageWidth - 2 * margin - 40)
          cmdLines.forEach((line, idx) => {
            checkNewPage(10)
            doc.text(line, 25, yPosition + (idx * 4))
          })
          yPosition += (cmdLines.length * 4) + 10
        }
        
        // Findings Section
        if (result.findings && result.findings.length > 0) {
          checkNewPage(60)
          doc.rect(20, yPosition - 10, pageWidth - 40, 50)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Findings & Recommendations', 25, yPosition)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          result.findings.forEach((finding, idx) => {
            checkNewPage(40)
            const findingType = finding.type || 'info'
            const findingMessage = finding.message || 'No message available'
            const findingDetails = finding.details ? (typeof finding.details === 'object' ? JSON.stringify(finding.details, null, 2) : String(finding.details)) : ''
            doc.setFont('helvetica', 'bold')
            yPosition = addText(`${idx + 1}. [${findingType.toUpperCase()}] ${findingMessage}`, 25, yPosition)
            if (findingDetails) {
              doc.setFont('helvetica', 'normal')
              yPosition = addText(`   Details: ${findingDetails.substring(0, 200)}${findingDetails.length > 200 ? '...' : ''}`, 30, yPosition)
            }
          })
          yPosition += 10
        }
        
        // Issues from Report
        if (report.issues && report.issues.length > 0) {
          checkNewPage(50)
          doc.rect(20, yPosition - 10, pageWidth - 40, 40)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Issues', 25, yPosition)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          report.issues.forEach((issue, idx) => {
            checkNewPage(30)
            const issueText = typeof issue === 'object' ? JSON.stringify(issue, null, 2) : String(issue)
            yPosition = addText(`${idx + 1}. ${issueText.substring(0, 200)}${issueText.length > 200 ? '...' : ''}`, 25, yPosition)
          })
          yPosition += 10
        }
        
        // Recommendations Section
        const allRecommendations = [
          ...(result.recommendations || []),
          ...(report.recommendations || [])
        ]
        if (allRecommendations.length > 0) {
          checkNewPage(60)
          doc.rect(20, yPosition - 10, pageWidth - 40, 50)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Recommendations', 25, yPosition)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          allRecommendations.forEach((rec, idx) => {
            checkNewPage(20)
            yPosition = addText(`${idx + 1}. ${rec}`, 25, yPosition)
          })
          yPosition += 10
        }
        
        // Raw Output
        if (report.rawOutput || report.raw_output) {
          checkNewPage(60)
          doc.rect(20, yPosition - 10, pageWidth - 40, 50)
          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          yPosition = addText('Raw Scan Output', 25, yPosition)
          doc.setFontSize(8)
          doc.setFont('courier', 'normal')
          const rawText = report.rawOutput || report.raw_output || ''
          const rawLines = doc.splitTextToSize(rawText.substring(0, 3000), pageWidth - 50)
          rawLines.forEach(line => {
            checkNewPage(15)
            doc.text(line, 25, yPosition)
            yPosition += 5
          })
          if (rawText.length > 3000) {
            doc.setFont('helvetica', 'normal')
            yPosition = addText(`... (output truncated, total length: ${rawText.length} characters)`, 25, yPosition)
          }
          yPosition += 10
        }
        
        return yPosition
      }
      
      // Process all scan results - iterate through selected scans
      const scansToReport = getScansToRun()
      let sectionNumber = 2 // Start after DNS which is handled separately
      
      scansToReport.forEach((test) => {
        const result = allResults[test.id]
        if (result && test.id !== 'dns-resolution' && test.id !== 'waf-detection') {
          // Use the helper function to add comprehensive scan section
          yPosition = addScanSection(sectionNumber++, test.name, test.id, result)
        }
      })
      
      // SSL/TLS Analysis Section (if exists)
      if (allResults['ssl-tls-analysis'] && scansToReport.some(t => t.id === 'ssl-tls-analysis')) {
        const sslResult = allResults['ssl-tls-analysis']
        // Already handled by addScanSection above
      }
      
      // Security Headers Section (if exists)
      if (allResults['security-headers'] && scansToReport.some(t => t.id === 'security-headers')) {
        const headersResult = allResults['security-headers']
        // Already handled by addScanSection above
      }
      
      // CMS Detection Section (if exists)
      if (allResults['cms-detection'] && scansToReport.some(t => t.id === 'cms-detection')) {
        const cmsResult = allResults['cms-detection']
        // Already handled by addScanSection above
      }
      
      // Subdomain Enumeration Section (if exists)
      if (allResults['subdomain-enumeration'] && scansToReport.some(t => t.id === 'subdomain-enumeration')) {
        const subdomainResult = allResults['subdomain-enumeration']
        // Already handled by addScanSection above
      }
      
      // Port Scanning Section (if exists)
      if (allResults['port-scanning'] && scansToReport.some(t => t.id === 'port-scanning')) {
        const portResult = allResults['port-scanning']
        // Already handled by addScanSection above
      }
      
      // Add other scan types (SQL Injection, XSS, CSRF, WAF, File Upload, etc.)
      const otherScanTypes = ['sql-injection-test', 'xss-test', 'csrf-test', 'file-upload-check', 'ct-log-subdomain-discovery', 'http-methods-check', 'host-header-injection', 'cors-policy-validation', 'open-redirect-check', 'quick-fingerprint']
      otherScanTypes.forEach(testId => {
        if (allResults[testId] && scansToReport.some(t => t.id === testId)) {
          const test = securityTests.find(t => t.id === testId)
          if (test) {
            yPosition = addScanSection(sectionNumber++, test.name, testId, allResults[testId])
          }
        }
      })
      
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
      // Update all footers with correct page numbers
      updateAllFooters()
      
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
    console.log('[DNS-DIALOG] Opening DNS detail dialog for result:', result)
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
      console.log('[SCAN-DEBUG] Testing Kali handlers...')
    try {
      if (window.cyberGuard && window.cyberGuard.testKaliHandlers) {
        const testResult = await window.cyberGuard.testKaliHandlers()
        console.log('[SCAN-DEBUG] Kali handlers test result:', testResult)
      } else {
        console.log('[SCAN-DEBUG] cyberGuard or testKaliHandlers not available')
      }
    } catch (testError) {
      console.log('[SCAN-DEBUG] Kali handlers test failed:', testError)
    }

    // Skip tool checking since we already verified during login
    console.log('Starting security scan (tools already verified during login)...')
    console.log('Initializing scan state...')
    
    setIsScanning(true)
    setBackgroundScanning(true)
    completionTriggeredRef.current = false // Reset completion flag
    // Clear all previous scan results when starting new scan
    setScanResults({})
    setNewScanResults({})
    setLogs([])
    setCompletedTests(new Set())
    setTestProgress({})
    setCurrentTest(null)
    setExpandedTests(new Set())
    setExpandedFindings(new Set())
    setScanStartTime(null)
    setScanEndTime(null)
    // Reset notification tracking for new scan
    notifiedScansRef.current.clear()
    
    const startTime = Date.now()
    setScanStartTime(startTime)
    
    // Run all selected scans sequentially
    const targetBase = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`
    const scansToRun = getScansToRun()
    
    setScanTiming({
      startTime,
      endTime: null,
      elapsedTime: 0,
      expectedCompletion: startTime + (scansToRun.reduce((total, test) => total + test.estimatedTime, 0) * 1000)
    })
    
    // Set a timeout for DNS scan (8 minutes to be safe)
    scanTimeoutRef.current = setTimeout(() => {
      if (isScanning || backgroundScanning) {
        console.log('⏰ DNS scan timeout reached - forcing completion')
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '⏰ DNS scan timeout reached (8 minutes) - scan may still be running in background',
          testId: 'dns-resolution',
          type: 'warning'
        }])
        
        // Don't force completion, just log the timeout
        // The scan might still be running and will complete later
      }
    }, 480000) // 8 minutes timeout
    
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: `Starting comprehensive security scan with ${scansToRun.length} selected scan(s)...`,
      testId: 'general',
      type: 'info'
    }])
    
    // Set ref to track scan status (to avoid React state async issues)
    scanActiveRef.current = true
    
    // Execute all selected scans sequentially
    for (const test of scansToRun) {
      // Check if scan was stopped by user using ref (which updates immediately)
      // We use ref instead of state because React state updates are async
      if (!scanActiveRef.current) {
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: 'Scan stopped by user',
          testId: 'general',
          type: 'warning'
        }])
        break
      }
      
      try {
        setCurrentTest({ id: test.id, name: test.name })
        setTestProgress(prev => ({ ...prev, [test.id]: 10 }))
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `Starting ${test.name}...`,
          testId: test.id,
          type: 'info'
        }])
        
        let report = null
        
        // Execute the appropriate scan function based on test ID
        if (test.id === 'quick-fingerprint') {
          const json = await runQuickFingerprint(targetBase)
          report = {
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
            report: { 
              scanType: 'Quick Fingerprint', 
              target: targetBase, 
              summary: json,
              command: `whatweb -v ${targetBase}`
            }
          }
        } else if (test.id === 'waf-detection') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting WAF Detection scan...`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running WAF detection scan...`,
            testId: test.id,
            type: 'info'
          }])
          const result = await runWAFDetection()
          console.log(`✅ [${test.id.toUpperCase()}] WAF Detection scan completed`)
          report = result
        } else if (test.id === 'file-upload-check') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting File Upload Check scan...`)
          const result = await runFileUploadCheck()
          console.log(`✅ [${test.id.toUpperCase()}] File Upload Check scan completed`)
          report = result
        } else if (test.id === 'ct-log-subdomain-discovery') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting CT Log Subdomain Discovery scan...`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running Certificate Transparency log query...`,
            testId: test.id,
            type: 'info'
          }])
          const result = await runCTLogSubdomainDiscovery(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] CT Log Subdomain Discovery scan completed`)
          report = result
        } else if (test.id === 'dns-resolution') {
          // DNS analysis using direct command execution
          const dnsResult = await runDnsResolution(targetBase)
          report = {
            testId: 'dns-resolution',
            testName: 'DNS Resolution & Analysis',
            category: 'Reconnaissance',
            severity: 'informational',
            status: 'completed',
            timestamp: new Date().toISOString(),
            findings: [
              {
                type: 'info',
                message: `DNS Resolution & Analysis completed`,
                details: dnsResult.summary || 'DNS analysis completed successfully'
              }
            ],
            recommendations: [],
            report: dnsResult
          }
          // Old Electron IPC implementation (commented out)
          /*if (window.cyberGuard && window.cyberGuard.startKaliScan) {
            setTestProgress(prev => ({ ...prev, [test.id]: 20 }))
            dnsCompleteRef.current = false
            
            // Set up progress handlers BEFORE starting the scan
            const progressHandler = (progress) => {
              console.log('📊 [DNS-PROGRESS] Received progress:', progress)
              
              // Only process DNS-related progress while waiting for DNS
              // Ignore XSS/CSRF progress messages until their turn in queue
              const testId = progress.testId || ''
              
              // Only log DNS-related progress to UI
              if (testId === 'dns-resolution' || progress.message?.includes('DNS') || progress.message?.includes('dns')) {
                if (progress.message) {
                  setLogs(prev => [...prev, {
                    timestamp: Date.now(),
                    message: progress.message,
                    testId: 'dns-resolution',
                    type: progress.type || 'info'
                  }])
                }
                
                // Update progress based on message content
                if (progress.message) {
                  let progressValue = 20
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
                      'dns-resolution': progressValue
                    }))
                  }
                }
              } else {
                // XSS/CSRF progress - store but don't process yet (wait for their turn in queue)
                console.log(`📝 [DNS-PROGRESS] Received progress for ${testId} - storing but not processing until queue reaches it`)
              }
            }
            
            // Store handler reference so we can clean it up later
            let handlerActive = true
            
            const completeHandler = (results) => {
              console.log('✅ [DNS-COMPLETE] Complete handler called, results:', results)
              
              if (results && results.tests) {
                // ALWAYS process DNS result when it completes (even after timeout)
                if (results.tests['dns-resolution']) {
                  const dnsResult = results.tests['dns-resolution']
                  console.log('✅ [DNS-COMPLETE] DNS result found:', dnsResult)
                  
                  // Update DNS scan result (always, even if handlerActive is false)
                  setScanResults(prev => ({ ...prev, 'dns-resolution': dnsResult }))
                  setNewScanResults(prev => ({ ...prev, 'dns-resolution': dnsResult }))
                  setCompletedTests(prev => new Set([...(prev || new Set()), 'dns-resolution']))
                  setTestProgress(prev => ({ ...prev, 'dns-resolution': 100 }))
                  
                  // ALWAYS set the ref to true when DNS completes (so polling can detect it immediately)
                  // This ensures DNS completion is detected as soon as it happens (within 2 minutes)
                  dnsCompleteRef.current = true
                  
                  // Also process XSS/CSRF if they're in the same results batch (DNS completed)
                  // This ensures all results are properly updated when they arrive together
                  Object.keys(results.tests).forEach(testId => {
                    if (testId !== 'dns-resolution' && (testId === 'xss-test' || testId === 'csrf-test')) {
                      const otherResult = results.tests[testId]
                      // Use the actual status from the result, don't force 'pending'
                      const resultStatus = otherResult.status || 'completed'
                      console.log(`✅ [DNS-COMPLETE] Processing ${testId} result with DNS - Status: ${resultStatus}`)
                      
                      const finalResult = { ...otherResult, status: resultStatus }
                      setScanResults(prev => {
                        const existing = prev[testId]
                        // If existing result has 'pending' status, update it to the actual status
                        if (existing && existing.status === 'pending') {
                          console.log(`✅ [DNS-COMPLETE] Updating ${testId} from pending to ${resultStatus}`)
                        }
                        return { ...prev, [testId]: finalResult }
                      })
                      setNewScanResults(prev => {
                        const existing = prev[testId]
                        // If existing result has 'pending' status, update it to the actual status
                        if (existing && existing.status === 'pending') {
                          console.log(`✅ [DNS-COMPLETE] Updating ${testId} from pending to ${resultStatus}`)
                        }
                        return { ...prev, [testId]: finalResult }
                      })
                      
                      // Add to completedTests if status is final (not 'pending')
                      if (resultStatus !== 'pending') {
                        setCompletedTests(prev => new Set([...(prev || new Set()), testId]))
                        setTestProgress(prev => ({ ...prev, [testId]: 100 }))
                      }
                    }
                  })
                  
                  // Only resolve promise if we're still waiting (handlerActive)
                  if (handlerActive) {
                    handlerActive = false
                    setLogs(prev => [...prev, {
                      timestamp: Date.now(),
                      message: `DNS Resolution & Analysis completed - Status: ${dnsResult.status}`,
                      testId: 'dns-resolution',
                      type: dnsResult.status === 'completed' ? 'success' : 'error'
                    }])
                    console.log('✅ [DNS-COMPLETE] DNS completed - ref set to true, promise should resolve via polling')
                  } else {
                    // DNS completed after timeout - update status in background
                    console.log('✅ [DNS-COMPLETE] DNS completed after timeout - updating status')
                    setLogs(prev => [...prev, {
                      timestamp: Date.now(),
                      message: `DNS Resolution & Analysis completed in background - Status: ${dnsResult.status}`,
                      testId: 'dns-resolution',
                      type: dnsResult.status === 'completed' ? 'success' : 'error'
                    }])
                  }
                } else {
                  // XSS/CSRF completed but NOT DNS - do NOT process, just store silently
                  console.log('📝 [DNS-COMPLETE] XSS/CSRF completed but DNS not done yet - storing results but NOT processing until DNS completes')
                  
                  // Store XSS/CSRF results silently (don't log or mark complete)
                  // They will be processed when queue reaches them
                  Object.keys(results.tests).forEach(testId => {
                    if (testId !== 'dns-resolution' && (testId === 'xss-test' || testId === 'csrf-test')) {
                      const otherResult = results.tests[testId]
                      // Store with original status from result (don't force 'pending')
                      // The scan loop will handle status conversion when it processes them
                      const resultWithStatus = otherResult.status || 'completed'
                      setScanResults(prev => {
                        const existing = prev[testId]
                        if (!existing || existing.status === 'pending') {
                          return { ...prev, [testId]: { ...otherResult, status: resultWithStatus } }
                        }
                        return prev
                      })
                      setNewScanResults(prev => {
                        const existing = prev[testId]
                        if (!existing || existing.status === 'pending') {
                          return { ...prev, [testId]: { ...otherResult, status: resultWithStatus } }
                        }
                        return prev
                      })
                      console.log(`📝 [DNS-COMPLETE] Silently stored ${testId} result with status: ${resultWithStatus} (will process when queue reaches it)`)
                    }
                  })
                  
                  // DO NOT resolve promise - continue waiting for DNS
                  console.log('⏳ [DNS-COMPLETE] Continuing to wait for DNS completion...')
                  return
                }
              }
            }
            
            // Set up event listeners BEFORE starting the scan
            window.cyberGuard.onKaliProgress(progressHandler)
            window.cyberGuard.onKaliComplete(completeHandler)
            
            // Log DNS scan commands BEFORE starting
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `Starting DNS Resolution & Analysis for: ${targetUrl}`,
              testId: 'dns-resolution',
              type: 'info'
            }])
            
            // Extract domain for display purposes
            let displayDomain = targetUrl
            try {
              if (targetUrl.includes('://')) {
                const url = new URL(targetUrl)
                displayDomain = url.hostname
              } else if (targetUrl.includes('/')) {
                displayDomain = targetUrl.split('/')[0]
              }
            } catch (error) {
              displayDomain = targetUrl
            }
            
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: 'DNS Analysis Commands (Kali Linux):',
              testId: 'dns-resolution',
              type: 'info'
            }])
            
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `  • Batch DNS Analysis: dig +short ${displayDomain} A && dig +noall +answer ${displayDomain} A/MX/TXT/NS/SOA && reverse DNS lookup`,
              testId: 'dns-resolution',
              type: 'info'
            }])
            
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `  • Reverse DNS: dig -x $(dig +short ${displayDomain} A) +short`,
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
              message: 'DNS scan typically takes 1-2 minutes to complete...',
              testId: 'dns-resolution',
              type: 'info'
            }])
            
            // Start DNS scan and wait for completion
            try {
              await new Promise((resolve, reject) => {
                let progressCheckInterval
                let timeoutTimer
                
                // Set a timeout (5 minutes max wait as per user request)
                timeoutTimer = setTimeout(() => {
                  clearInterval(progressCheckInterval)
                  if (!dnsCompleteRef.current) {
                    setLogs(prev => [...prev, {
                      timestamp: Date.now(),
                      message: 'DNS scan timeout reached (5 minutes) - continuing with next scan (SSL/TLS Analysis). DNS will continue running in background.',
                      testId: 'dns-resolution',
                      type: 'warning'
                    }])
                    
                    // Create a placeholder result so the scan can continue to next test (SSL/TLS)
                    // DNS scan continues in background and will be processed when it completes
                    const timeoutResult = {
                      testId: 'dns-resolution',
                      testName: 'DNS Resolution & Analysis',
                      category: test.category,
                      severity: test.severity,
                      status: 'timed out', // Mark as timed out - DNS exceeded 5 minute limit
                      timestamp: new Date().toISOString(),
                      error: 'DNS scan timeout - scan took longer than 5 minutes. Partial results available when DNS completes in background.',
                      findings: [
                        {
                          type: 'warning',
                          message: 'DNS scan timed out after 5 minutes',
                          details: 'Scan was moved to next test to avoid blocking. DNS will continue in background and results will be updated when available.'
                        }
                      ],
                      recommendations: test.fixRecommendations || [],
                      report: { 
                        scanType: test.name, 
                        target: targetBase,
                        timedOut: true,
                        partialResults: 'DNS scan exceeded 5-minute timeout. Partial results will be available when DNS completes.'
                      }
                    }
                    setScanResults(prev => ({ ...prev, [test.id]: timeoutResult }))
                    setNewScanResults(prev => ({ ...prev, [test.id]: timeoutResult }))
                    // Add to completedTests since it's timed out (final status)
                    setCompletedTests(prev => new Set([...(prev || new Set()), test.id]))
                    setTestProgress(prev => ({ ...prev, [test.id]: 100 }))
                    dnsCompleteRef.current = true // Allow loop to continue
                    
                    console.log('⏭️ [DNS] Moving to next scan (SSL/TLS) while DNS continues in background')
                  }
                  resolve()
                }, 300000) // 5 minutes = 300000ms
                
                // Check for completion every 500ms for faster detection (DNS completes in ~2 minutes)
                progressCheckInterval = setInterval(() => {
                  // CRITICAL: Check the ref FIRST (set by completeHandler) - this is the fastest way
                  if (dnsCompleteRef.current) {
                    console.log('✅ [DNS-POLL] DNS complete ref is true, resolving immediately')
                    clearInterval(progressCheckInterval)
                    clearTimeout(timeoutTimer)
                    resolve()
                    return
                  }
                  
                  // Also check scanResults state as backup (may have slight delay)
                  setScanResults(currentResults => {
                    setNewScanResults(currentNewResults => {
                      const result = currentResults[test.id] || currentNewResults[test.id]
                      // Accept 'completed', 'failed', or 'timed out' as completion signals (not 'pending')
                      if (result && (result.status === 'completed' || result.status === 'failed' || result.status === 'timed out')) {
                        console.log(`✅ [DNS-POLL] DNS scan status detected in state: ${result.status}`)
                        dnsCompleteRef.current = true
                        clearInterval(progressCheckInterval)
                        clearTimeout(timeoutTimer)
                        resolve()
                        return currentNewResults
                      }
                      return currentNewResults
                    })
                    return currentResults
                  })
                }, 500) // Check every 500ms instead of 1 second for faster detection
                
                // Start the scan AFTER setting up handlers
                // Note: startKaliScan runs ALL tests (XSS, CSRF, DNS), but we only care about DNS here
                console.log('🚀 [DNS] Starting Kali scan (will run all tests, but waiting for DNS only)...')
                window.cyberGuard.startKaliScan(targetUrl).catch(error => {
                  console.error('❌ [DNS] Error starting DNS scan:', error)
                  handlerActive = false
                  setLogs(prev => [...prev, {
                    timestamp: Date.now(),
                    message: `DNS scan failed to start: ${error.message}`,
                    testId: 'dns-resolution',
                    type: 'error'
                  }])
                  clearInterval(progressCheckInterval)
                  clearTimeout(timeoutTimer)
                  reject(error)
                })
              })
              
              // Wait a bit for state to update, then get the result
              await new Promise(resolve => setTimeout(resolve, 500))
              
              // Get the result after completion using functional update
              let dnsResult = null
              setScanResults(currentResults => {
                setNewScanResults(currentNewResults => {
                  dnsResult = currentResults[test.id] || currentNewResults[test.id]
                  return currentNewResults
                })
                return currentResults
              })
              
              // Wait for state update
              await new Promise(resolve => setTimeout(resolve, 100))
              
              // Try again if not found
              if (!dnsResult) {
                const result = scanResults[test.id] || newScanResults[test.id]
                if (result) {
                  dnsResult = result
                }
              }
              
              // Try multiple times to get the result (race condition protection)
              let retries = 0
              while (!dnsResult && retries < 5) {
                await new Promise(resolve => setTimeout(resolve, 200))
                setScanResults(currentResults => {
                  setNewScanResults(currentNewResults => {
                    dnsResult = currentResults[test.id] || currentNewResults[test.id]
                    return currentNewResults
                  })
                  return currentResults
                })
                retries++
              }
              
              if (dnsResult) {
                console.log('✅ [DNS] DNS result found after waiting:', dnsResult.status)
                report = dnsResult
                // Ensure it's marked as completed in state
                setScanResults(prev => ({ ...prev, [test.id]: dnsResult }))
                setNewScanResults(prev => ({ ...prev, [test.id]: dnsResult }))
                setCompletedTests(prev => new Set([...(prev || new Set()), test.id]))
                setTestProgress(prev => ({ ...prev, [test.id]: 100 }))
              } else {
                // Create a placeholder report for DNS if no result found (mark as failed so loop continues)
                console.log('⚠️ [DNS] No DNS result found after waiting, creating placeholder')
                report = {
                  testId: 'dns-resolution',
                  testName: 'DNS Resolution & Analysis',
                  category: test.category,
                  severity: test.severity,
                  status: 'failed',
                  timestamp: new Date().toISOString(),
                  error: 'DNS scan completed but no result was found',
                  findings: [],
                  recommendations: test.fixRecommendations || [],
                  report: { scanType: test.name, target: targetBase }
                }
                
                // Also save this to state so it's available for checking
                setScanResults(prev => ({ ...prev, [test.id]: report }))
                setNewScanResults(prev => ({ ...prev, [test.id]: report }))
                setCompletedTests(prev => new Set([...(prev || new Set()), test.id]))
                
                setLogs(prev => [...prev, {
                  timestamp: Date.now(),
                  message: 'DNS scan completed but no result found - marking as failed and continuing',
                  testId: 'dns-resolution',
                  type: 'warning'
                }])
              }
            } catch (error) {
              console.error('Error in DNS analysis:', error)
              throw error
            }
          } else {
            throw new Error('Electron API not available - DNS analysis cannot run')
          }
          */
        } else if (test.id === 'open-redirect-check') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting Open Redirect Check...`)
          const redirectUrl = `${targetBase.replace(/\/$/, '')}/?redirect=http://evil.com`
          const cmd = `curl -I ${JSON.stringify(redirectUrl)}`
          console.log(`▶️ [${test.id.toUpperCase()}] Command: ${cmd}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running Open Redirect Check...`,
            testId: test.id,
            type: 'info'
          }])
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `🔍 We checked your site for unvalidated redirects by sending a request with a malicious redirect parameter`,
            testId: test.id,
            type: 'info'
          }])
          const json = await runOpenRedirectCheck(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] Open Redirect Check completed - Status: ${json.status}`)
          console.log(`📊 [${test.id.toUpperCase()}] Result: ${JSON.stringify(json, null, 2)}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Open Redirect Check result: ${json.status === 'Vulnerable' ? '❌ FAILURE - Potential vulnerability detected' : '✅ SUCCESS - No unvalidated redirects found'}`,
            testId: test.id,
            type: json.status === 'Vulnerable' ? 'error' : 'success'
          }])
          report = {
            testId: 'open-redirect-check',
            testName: 'Open Redirect Check',
            category: test.category,
            severity: (json.severity || 'high').toLowerCase(),
            status: json.status === 'Vulnerable' ? 'completed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: [
              {
                type: json.status === 'Vulnerable' ? 'high' : 'info',
                message: json.status === 'Vulnerable' ? 'Potential open redirect vulnerability detected' : 'No unvalidated redirects found',
                details: json.evidence || json.status
              }
            ],
            recommendations: json.recommendation ? [json.recommendation] : test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, command: cmd, summary: json }
          }
        } else if (test.id === 'cors-policy-validation') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting CORS Policy Validation...`)
          const cmd = `curl -I -H "Origin: http://evil.com" ${JSON.stringify(targetBase)} | grep -i "access-control-allow-origin" || true`
          console.log(`▶️ [${test.id.toUpperCase()}] Command: ${cmd}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running CORS Policy Validation...`,
            testId: test.id,
            type: 'info'
          }])
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `🔍 We created a defensive attack against your site by sending a request with a malicious Origin header`,
            testId: test.id,
            type: 'info'
          }])
          const json = await runCorsPolicyValidation(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] CORS Policy Validation completed - Status: ${json.status}`)
          console.log(`📊 [${test.id.toUpperCase()}] Result: ${JSON.stringify(json, null, 2)}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `CORS Policy Validation result: ${json.status === 'Vulnerable' ? '❌ FAILURE - Insecure CORS policy detected' : '✅ SUCCESS - CORS policy is secure'}`,
            testId: test.id,
            type: json.status === 'Vulnerable' ? 'error' : 'success'
          }])
          report = {
            testId: 'cors-policy-validation',
            testName: 'CORS Policy Validation',
            category: test.category,
            severity: (json.severity || 'critical').toLowerCase(),
            status: json.status === 'Vulnerable' ? 'completed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: [
              {
                type: json.status === 'Vulnerable' ? 'critical' : 'info',
                message: json.status === 'Vulnerable' ? 'Insecure CORS policy detected (wildcard or allows arbitrary origins)' : 'CORS policy is secure',
                details: json.evidence || json.status
              }
            ],
            recommendations: json.recommendation ? [json.recommendation] : test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, command: cmd, summary: json }
          }
        } else if (test.id === 'host-header-injection') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting Host Trust Verification...`)
          const cmd = `curl -I -H "Host: attacker.com" ${JSON.stringify(targetBase)}`
          console.log(`▶️ [${test.id.toUpperCase()}] Command: ${cmd}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running Host Trust Verification...`,
            testId: test.id,
            type: 'info'
          }])
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `🔍 We created a defensive attack against your site by sending a request with a malicious Host header`,
            testId: test.id,
            type: 'info'
          }])
          const json = await runHostHeaderInjection(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] Host Trust Verification completed - Status: ${json.status}`)
          console.log(`📊 [${test.id.toUpperCase()}] Result: ${JSON.stringify(json, null, 2)}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Host Trust Verification result: ${json.status === 'Vulnerable' ? '❌ FAILURE - Potential host header injection vulnerability detected' : '✅ SUCCESS - Host header properly validated'}`,
            testId: test.id,
            type: json.status === 'Vulnerable' ? 'error' : 'success'
          }])
          report = {
            testId: 'host-header-injection',
            testName: 'Host Trust Verification',
            category: test.category,
            severity: (json.severity || 'high').toLowerCase(),
            status: json.status === 'Vulnerable' ? 'completed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: [
              {
                type: json.status === 'Vulnerable' ? 'high' : 'info',
                message: json.status === 'Vulnerable' ? 'Potential host header injection vulnerability detected' : 'Host header properly validated',
                details: json.evidence || json.status
              }
            ],
            recommendations: json.recommendation ? [json.recommendation] : test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, command: cmd, summary: json }
          }
        } else if (test.id === 'http-methods-check') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting HTTP Allowed Methods Check...`)
          const cmd = `curl -X OPTIONS -I ${JSON.stringify(targetBase)}`
          console.log(`▶️ [${test.id.toUpperCase()}] Command: ${cmd}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Running HTTP Allowed Methods Check...`,
            testId: test.id,
            type: 'info'
          }])
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `🔍 We checked your site for dangerous HTTP methods by sending an OPTIONS request`,
            testId: test.id,
            type: 'info'
          }])
          const json = await runHttpMethodsCheck(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] HTTP Allowed Methods Check completed - Status: ${json.status}`)
          console.log(`📊 [${test.id.toUpperCase()}] Result: ${JSON.stringify(json, null, 2)}`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `HTTP Allowed Methods Check result: ${json.status === 'Vulnerable' ? '❌ FAILURE - Dangerous HTTP methods enabled' : '✅ SUCCESS - Only safe HTTP methods enabled'}`,
            testId: test.id,
            type: json.status === 'Vulnerable' ? 'error' : 'success'
          }])
          report = {
            testId: 'http-methods-check',
            testName: 'HTTP Allowed Methods Check',
            category: test.category,
            severity: (json.severity || 'critical').toLowerCase(),
            status: json.status === 'Vulnerable' ? 'completed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: [
              {
                type: json.status === 'Vulnerable' ? 'critical' : 'info',
                message: json.status === 'Vulnerable' ? 'Dangerous HTTP methods (PUT, DELETE, TRACE) enabled' : 'Only safe HTTP methods enabled',
                details: json.evidence || json.status
              }
            ],
            recommendations: json.recommendation ? [json.recommendation] : test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, command: cmd, summary: json }
          }
        } else if (test.id === 'ssl-tls-analysis') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting SSL/TLS Analysis...`)
          const result = await runSslTlsAnalysis(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] SSL/TLS Analysis completed`)
          
          report = {
            testId: 'ssl-tls-analysis',
            testName: 'SSL/TLS Analysis',
            category: test.category,
            severity: test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: 'info',
                message: `SSL/TLS Analysis completed - Protocols: ${result.supportedProtocols?.join(', ') || 'Unknown'}, Cipher Strength: ${result.cipherStrength || 'Unknown'}`,
                details: result.summary || 'SSL/TLS analysis completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'security-headers') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting Security Headers Analysis...`)
          const result = await runSecurityHeaders(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] Security Headers Analysis completed`)
          
          report = {
            testId: 'security-headers',
            testName: 'Security Headers',
            category: test.category,
            severity: test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: result.missingHeaders?.length > 0 ? 'warning' : 'info',
                message: `Security Headers Analysis completed - Found: ${Object.keys(result.headersFound || {}).length}, Missing: ${result.missingHeaders?.length || 0}`,
                details: result.summary || 'Security headers analysis completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'cms-detection') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting CMS Detection...`)
          const result = await runCmsDetection(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] CMS Detection completed`)
          
          report = {
            testId: 'cms-detection',
            testName: 'CMS Detection',
            category: test.category,
            severity: test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: 'info',
                message: `CMS Detection completed - CMS: ${result.cms || 'None'}, Server: ${result.server || 'Unknown'}`,
                details: result.summary || 'CMS detection completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'subdomain-enumeration') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting Subdomain Enumeration...`)
          const result = await runSubdomainEnumeration(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] Subdomain Enumeration completed`)
          
          report = {
            testId: 'subdomain-enumeration',
            testName: 'Subdomain Enumeration',
            category: test.category,
            severity: test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: 'info',
                message: `Subdomain Enumeration completed - Found: ${result.count || 0} subdomain(s)`,
                details: result.summary || 'Subdomain enumeration completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'port-scanning') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting Port Scanning...`)
          const result = await runPortScanning(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] Port Scanning completed`)
          
          report = {
            testId: 'port-scanning',
            testName: 'Port Scanning',
            category: test.category,
            severity: test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: 'info',
                message: `Port Scanning completed - Found: ${result.totalOpen || 0} open port(s)`,
                details: result.summary || 'Port scanning completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'sql-injection-test') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting SQL Injection Test...`)
          const result = await runSqlInjectionTest(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] SQL Injection Test completed`)
          
          report = {
            testId: 'sql-injection-test',
            testName: 'SQL Injection Test',
            category: test.category,
            severity: result.vulnerable ? 'high' : test.severity,
            status: result.error ? 'failed' : 'completed',
            timestamp: new Date().toISOString(),
            findings: result.error ? [] : [
              {
                type: result.vulnerable ? 'critical' : 'info',
                message: `SQL Injection Test completed - Vulnerable: ${result.vulnerable ? 'Yes' : 'No'}`,
                details: result.summary || 'SQL injection test completed successfully'
              }
            ],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase, ...result }
          }
        } else if (test.id === 'xss-test') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting XSS Test...`)
          const result = await runXSSTest(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] XSS Test completed`)
          report = result
        } else if (test.id === 'csrf-test') {
          console.log(`🔍 [${test.id.toUpperCase()}] Starting CSRF Test...`)
          const result = await runCSRFTest(targetBase)
          console.log(`✅ [${test.id.toUpperCase()}] CSRF Test completed`)
          report = result
        } else {
          // For scans not yet fully implemented, still create a report
          // This ensures the queue continues in strict FIFO order
          console.log(`⚠️ [${test.id.toUpperCase()}] Scan not yet fully implemented - creating placeholder report`)
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `Starting ${test.name}...`,
            testId: test.id,
            type: 'info'
          }])
          
          // Create placeholder report so scan continues in queue order
          report = {
            testId: test.id,
            testName: test.name,
            category: test.category,
            severity: test.severity,
            status: 'failed',
            timestamp: new Date().toISOString(),
            error: `${test.name} scan implementation is in progress. This test will be fully functional in a future update.`,
            findings: [],
            recommendations: test.fixRecommendations || [],
            report: { scanType: test.name, target: targetBase }
          }
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: `${test.name} - Implementation in progress (placeholder report created)`,
            testId: test.id,
            type: 'warning'
          }])
          // Continue with report creation below - DO NOT use continue statement
        }
        
        if (report) {
          setScanResults(prev => ({ ...prev, [test.id]: report }))
          setNewScanResults(prev => ({ ...prev, [test.id]: report }))
          
          // Only add to completedTests if status is final (not 'pending')
          // 'pending' means scan is still running in background
          if (report.status !== 'pending') {
            setCompletedTests(prev => new Set([...(prev || new Set()), test.id]))
          }
          
          // Set progress to 100% for all final statuses
          if (report.status !== 'pending') {
            setTestProgress(prev => ({ ...prev, [test.id]: 100 }))
          }
          
          // Log completion status based on actual result
          if (report.status === 'completed') {
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `${test.name} completed successfully`,
              testId: test.id,
              type: 'success'
            }])
          } else if (report.status === 'failed') {
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `${test.name} ${report.error ? 'failed' : 'completed with warnings'}: ${report.error || 'See details in report'}`,
              testId: test.id,
              type: report.error ? 'error' : 'warning'
            }])
          } else {
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `${test.name} finished with status: ${report.status}`,
              testId: test.id,
              type: 'info'
            }])
          }
        }
      } catch (error) {
        console.error(`Error running ${test.name}:`, error)
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `${test.name} failed: ${error.message}`,
          testId: test.id,
          type: 'error'
        }])
        
        // Mark as failed
        const failedReport = {
          testId: test.id,
          testName: test.name,
          category: test.category,
          severity: test.severity,
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: error.message,
          findings: [],
          recommendations: [],
          report: { scanType: test.name, target: targetBase }
        }
        setScanResults(prev => ({ ...prev, [test.id]: failedReport }))
        setNewScanResults(prev => ({ ...prev, [test.id]: failedReport }))
        setCompletedTests(prev => new Set([...(prev || new Set()), test.id]))
      }
    }
    
    // All scans completed - the useEffect hook will handle final completion check
    // This ensures we check with the latest state values after all updates
    // The useEffect will trigger when scanResults/newScanResults change
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
                message: 'Executing comprehensive DNS analysis commands...',
                testId: 'dns-resolution',
                type: 'info'
              }])
            }
            
            if (progress.message.includes('DNS Analysis output')) {
              setLogs(prev => [...prev, {
                timestamp: Date.now(),
                message: 'Processing DNS analysis output...',
                testId: 'dns-resolution',
                type: 'info'
              }])
            }
          }
        }

        const completeHandler = (results) => {
          console.log('[FRONTEND] ===== SQL INJECTION TEST COMPLETED =====')
          console.log('[FRONTEND] Raw results received:', results)
          console.log('[FRONTEND] Results type:', typeof results)
          console.log('[FRONTEND] Results keys:', results ? Object.keys(results) : 'null')
          console.log('[FRONTEND] Has tests property:', results && results.tests)
          console.log('[FRONTEND] Tests keys:', results && results.tests ? Object.keys(results.tests) : 'null')
          
          // Generic handling: if we received any tests but not the SQL one, still surface them (e.g., CSRF-only run)
          if (results && results.tests) {
            const testKeys = Object.keys(results.tests)
            if (testKeys.length > 0 && !results.tests['sql-injection-test']) {
              console.log('[FRONTEND] Non-SQL tests received, updating UI with available tests:', testKeys)
              setScanResults(prev => ({ ...prev, ...results.tests }))
              setNewScanResults(prev => ({ ...prev, ...results.tests }))
              setCompletedTests(new Set(testKeys))
              setCurrentTest(null)
              const endTime = Date.now()
            setScanTiming(prev => ({ ...prev, endTime }))
            setScanEndTime(endTime)
              setIsScanning(false)
              setBackgroundScanning(false)
              return
            }
          }
          
          // Add completion log
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: 'Kali SQL injection test completed - processing results...',
            testId: 'sql-injection-test',
            type: 'info'
          }])
          
          if (results && results.tests && results.tests['sql-injection-test']) {
            const sqlResult = results.tests['sql-injection-test']
            
            console.log('[FRONTEND] SQL injection test result details:', sqlResult)
            console.log('[FRONTEND] SQL injection test result status:', sqlResult.status)
            console.log('[FRONTEND] SQL injection test result error:', sqlResult.error)
            console.log('[FRONTEND] SQL injection test result report:', sqlResult.report)
            
            // Add success log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: `SQL injection test completed successfully - Status: ${sqlResult.status}`,
              testId: 'sql-injection-test',
              type: 'success'
            }])
            
            // Check if the scan actually failed - now only check status, not raw output
            // The backend will process results even when some commands fail
            if (sqlResult.status === 'failed' || sqlResult.error) {
              console.log('[FRONTEND] SQL injection test failed - showing error results')
              
              // Add failure log
              setLogs(prev => [...prev, {
                timestamp: Date.now(),
                message: 'SQL injection test failed - no meaningful results obtained',
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
              const endTime = Date.now()
            setScanTiming(prev => ({ ...prev, endTime }))
            setScanEndTime(endTime)
              setIsScanning(false)
              setBackgroundScanning(false)
              
              showError('SQL injection test failed - no meaningful results obtained. Please check your network connection and try again.')
              return
            }
            
            // Add success completion log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: 'SQL Injection Test completed successfully!',
              testId: 'sql-injection-test',
              type: 'success'
            }])
            
            console.log('[FRONTEND] Processing successful SQL injection test results...')
            setScanResults(prev => ({ ...prev, ...results.tests }))
            // Ensure results are also mirrored into newScanResults for uniform access
            setNewScanResults(prev => ({ ...prev, ...results.tests }))
            setCompletedTests(new Set([ ...Array.from(completedTests), ...Object.keys(results.tests) ]))
            
            const criticalFindings = Object.values(results.tests).reduce((total, test) => {
              return total + (test.findings?.filter(f => f.type === 'critical').length || 0)
            }, 0)
            
            console.log('[FRONTEND] Critical findings count:', criticalFindings)
            
            // Complete the scanning process - STOP HERE as requested
            console.log('SQL injection test completed - stopping scan as requested')
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: 'SQL injection test completed - stopping scan process',
              testId: 'sql-injection-test',
              type: 'info'
            }])
            
            setCurrentTest(null)
            const endTime = Date.now()
            setScanTiming(prev => ({ ...prev, endTime }))
            setScanEndTime(endTime)
            setIsScanning(false)
            setBackgroundScanning(false)
            
            showSuccess(`SQL injection test completed! Found ${criticalFindings} critical security issues.`)
          } else {
            console.log('[FRONTEND] No valid SQL injection test results received')
            
            // Add failure log
            setLogs(prev => [...prev, {
              timestamp: Date.now(),
              message: 'SQL injection test failed - no valid results received from Kali',
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
            const endTime = Date.now()
            setScanTiming(prev => ({ ...prev, endTime }))
            setScanEndTime(endTime)
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
          message: `Starting DNS analysis for: ${targetUrl}`,
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
          message: 'DNS scan typically takes 1-2 minutes to complete...',
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
          message: 'Electron API not available - running DEMO DNS scan',
          testId: 'dns-resolution',
          type: 'warning'
        }])
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: 'Simulating DNS commands for DEMO purposes only...',
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
            message: 'Testing zone transfer: dig axfr example.com',
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
            message: 'Enumerating subdomains: subfinder -d example.com',
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
            message: 'Demo DNS security analysis completed successfully!',
            testId: 'dns-resolution',
            type: 'success'
          }])
          
          setLogs(prev => [...prev, {
            timestamp: Date.now(),
            message: 'Analysis Summary: 5 findings detected (2 warnings, 1 high risk, 2 info)',
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
    // Set ref to false immediately so loop can check it
    scanActiveRef.current = false
    setIsScanning(false)
    setBackgroundScanning(false)
    setCurrentTest(null)
    
    // Clear timeout when scan is stopped
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    
    // Clear all scan results when stopped
    setScanResults({})
    setNewScanResults({})
    setCompletedTests(new Set())
    setTestProgress({})
    setExpandedTests(new Set())
    setExpandedFindings(new Set())
    setScanStartTime(null)
    setScanEndTime(null)
    setScanTiming({
      startTime: null,
      endTime: null,
      elapsedTime: 0,
      expectedCompletion: null
    })
    
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: '⏹️ Scan stopped by user - all results cleared',
      testId: 'general',
      type: 'warning'
    }])
    showError('Scan stopped by user')
  }

  // Toggle test expansion
  const toggleTestExpansion = (testId) => {
    setExpandedTests(prev => {
      const newExpanded = new Set(prev)
    if (newExpanded.has(testId)) {
      newExpanded.delete(testId)
    } else {
      newExpanded.add(testId)
    }
      return newExpanded
    })
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
      {/* Merged Main Section - All sections in one container */}
      <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-2xl shadow-lg border border-orange-200 dark:border-slate-600 p-8 relative overflow-hidden mb-6">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6">
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
              <div className="mb-6 w-full overflow-hidden">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  User Selected Scans
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ width: '100%', maxWidth: '100%' }}>
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
                    
                    return (
                      <div
                        key={test.id}
                        className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-200 overflow-hidden ${
                          canOpen
                            ? 'border-green-200 dark:border-green-800'
                            : isRunning
                            ? 'border-orange-200 dark:border-orange-800'
                            : 'border-gray-200 dark:border-slate-700'
                        } hover:shadow-md ${canOpen ? 'cursor-pointer' : ''}`}
                        style={{ boxSizing: 'border-box' }}
                        onClick={canOpen ? () => {
                          if (test.id === 'dns-resolution') {
                            openDnsDetailDialog(result);
                          } else {
                            openScanDetailDialog(test.id, result);
                          }
                        } : undefined}
                      >
                        {/* Render scan card content - using same structure as before */}
                        {(() => {
                          return (
                            <div className="p-6 overflow-hidden" style={{ boxSizing: 'border-box' }}>
                              <div className="flex items-center justify-between mb-4" style={{ minWidth: 0 }}>
                                <div className="flex items-center space-x-3 flex-shrink" style={{ minWidth: 0, flex: '1 1 0%' }}>
                                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
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
                                  <div className="flex-1" style={{ minWidth: 0, overflow: 'hidden' }}>
                                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.name}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.category}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 flex-shrink-0">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    test.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                    test.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                    test.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                    'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                                  }`}>
                                    {test.severity}
                                  </span>
                                  {/* View Detail and Export PDF Icon Buttons for Completed Scans */}
                                  {isCompleted && canOpen && result && (
                                    <>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (test.id === 'dns-resolution') {
                                            openDnsDetailDialog(result)
                                          } else {
                                            openScanDetailDialog(test.id, result)
                                          }
                                        }}
                                        className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                                        title="View Details"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          generateScanPDF(test.id, result)
                                        }}
                                        disabled={isExporting}
                                        className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Export PDF"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 break-words">{test.description}</p>
                              
                              {/* About Section - Add expand/collapse button */}
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

                              {/* Expanded Content - Only show when card is expanded */}
                              {isExpanded && (
                                <>
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
                                  </div>
                                )
                              })()}
                                </>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Unselected Scans Container */}
            {showSeparateContainers && unselectedScansList.length > 0 && (
              <div className="mb-6 w-full overflow-hidden">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Unselected Scans
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ width: '100%', maxWidth: '100%' }}>
                  {unselectedScansList.map((test) => {
                    const isSelected = false
                    const isRunning = false
                    const progress = 0
                    const result = null
                    const isExpanded = expandedTests.has(test.id)
                    const isCompleted = false
                    const isNotScanned = true
                    const canOpen = false
                    
                    return (
                      <div
                        key={test.id}
                        className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 transition-all duration-200 opacity-60 overflow-hidden`}
                        style={{ boxSizing: 'border-box' }}
                      >
                        <div className="p-6 overflow-hidden" style={{ boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>
                          <div className="flex items-center justify-between mb-4" style={{ minWidth: 0, width: '100%' }}>
                            <div className="flex items-center space-x-3 flex-shrink" style={{ minWidth: 0, flex: '1 1 0%' }}>
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-slate-600 flex-shrink-0">
                                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </div>
                              <div className="flex-1" style={{ minWidth: 0, overflow: 'hidden' }}>
                                <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.name}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.category}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 flex-shrink-0">
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
                          
                          {/* Not Scanned Status */}
                          <div className="mb-4 p-3 bg-gray-100 dark:bg-slate-700 rounded-lg border border-gray-300 dark:border-slate-600">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400 text-center">Not Scanned</p>
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings:</h4>
                            <p className="text-sm text-gray-500 dark:text-gray-400">This scan was not selected for execution.</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All Scans Container - Always show all scans separately below Unselected Scans */}
            <div className="mb-6 w-full overflow-hidden">
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
                <svg className="w-6 h-6 mr-2 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                All Scans
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full" style={{ gridAutoFlow: 'row', gridAutoRows: 'auto' }}>
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

                  return (
                    <div
                      key={test.id}
                      className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-200 overflow-hidden ${
                        canOpen
                          ? 'border-green-200 dark:border-green-800'
                          : isRunning
                          ? 'border-orange-200 dark:border-orange-800'
                          : 'border-gray-200 dark:border-slate-700'
                      } hover:shadow-md ${canOpen ? 'cursor-pointer' : ''}`}
                      style={{ boxSizing: 'border-box' }}
                      onClick={canOpen ? () => {
                        console.log('Card clicked:', test.id)
                        console.log('isCompleted:', isCompleted)
                        console.log('result exists:', !!result)
                        console.log('result:', result)
                        if (test.id === 'dns-resolution') {
                          openDnsDetailDialog(result);
                        } else {
                          openScanDetailDialog(test.id, result);
                        }
                      } : undefined}
                    >
                      <div className="p-6 overflow-hidden" style={{ boxSizing: 'border-box' }}>
                        <div className="flex items-center justify-between mb-4" style={{ minWidth: 0 }}>
                          <div className="flex items-center space-x-3 flex-shrink" style={{ minWidth: 0, flex: '1 1 0%' }}>
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isCompleted
                                ? 'bg-green-100 dark:bg-green-900/20'
                                : isRunning
                                ? 'bg-orange-100 dark:bg-orange-900/20'
                                : isNotScanned
                                ? 'bg-gray-200 dark:bg-slate-600'
                                : 'bg-gray-100 dark:bg-slate-700'
                            }`}>
                              {isCompleted ? (
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : isRunning ? (
                                <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
                              ) : isNotScanned ? (
                                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1" style={{ minWidth: 0, overflow: 'hidden' }}>
                              <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.name}</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.category}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 flex-shrink-0">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              test.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                              test.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                              test.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            }`}>
                              {test.severity}
                            </span>
                            {/* View Detail and Export PDF Icon Buttons for Completed Scans */}
                            {isCompleted && canOpen && result && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (test.id === 'dns-resolution') {
                                      openDnsDetailDialog(result)
                                    } else {
                                      openScanDetailDialog(test.id, result)
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                                  title="View Details"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    generateScanPDF(test.id, result)
                                  }}
                                  disabled={isExporting}
                                  className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Export PDF"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 break-words">{test.description}</p>
                        
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
                        
                        {/* Expanded Content - Only show when card is expanded */}
                        {isExpanded && (
                          <>
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

                        {/* PDF Export Button for Individual Scan */}
                        {canOpen && result && (
                          <div className="mb-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                generateScanPDF(test.id, result)
                              }}
                              disabled={isExporting}
                              className="w-full px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={`Export ${test.name} results to PDF`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              <span>Export PDF</span>
                            </button>
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
                          </>
                        )}
                      </div>
                    </div>
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
                      await fetchAISuggestions('dns-resolution', 'DNS Resolution & Analysis', selectedDnsResult.report, selectedDnsResult.report.target || targetUrl)
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
                  onClick={(e) => {
                    e.stopPropagation()
                    if (selectedScanResult?.testId && selectedScanResult?.result) {
                      generateScanPDF(selectedScanResult.testId, selectedScanResult.result)
                    }
                  }}
                  disabled={isExporting}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                  title="Export this scan report to PDF"
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
                  title="Get AI-powered suggestions for this scan"
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
            
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {/* Scan Summary */}
              <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600 mb-6">
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

                  {selectedScanResult.result.report.scanType === 'Subdomain Enumeration' && selectedScanResult.result.report.subdomainsFound && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Discovered Subdomains</h3>
                      {selectedScanResult.result.report.subdomainsFound.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {selectedScanResult.result.report.subdomainsFound.map((subdomain, idx) => (
                            <div key={idx} className="p-2 bg-gray-50 dark:bg-slate-700 rounded text-sm font-mono text-gray-600 dark:text-gray-400">
                              {subdomain}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-400">No subdomains found.</p>
                      )}
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
                    <div className="space-y-6 pr-2 min-w-0 max-w-full overflow-hidden">
                      <div className="rounded-lg p-6 border bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 overflow-hidden">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">SSL/TLS Certificate Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm min-w-0 max-w-full">
                          {selectedScanResult.result.report.certificateInfo?.subject && (
                            <div className="md:col-span-2">
                              <span className="font-medium text-gray-700 dark:text-gray-300">Subject:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 break-words">{selectedScanResult.result.report.certificateInfo.subject}</div>
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
                            <div className="md:col-span-2">
                              <span className="font-medium text-gray-700 dark:text-gray-300">Issuer:</span>
                              <div className="mt-1 text-gray-900 dark:text-gray-100 break-words">{selectedScanResult.result.report.certificateInfo.issuer}</div>
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
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                              {selectedScanResult.result.report.subdomainsFound.map((subdomain, idx) => (
                                <div key={idx} className="bg-white dark:bg-slate-700 rounded px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                  {subdomain}
                                </div>
                              ))}
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
                  className="w-10 h-10 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 hover:from-red-100 hover:to-red-200 dark:hover:from-red-900 dark:hover:to-red-800 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 flex items-center justify-center font-bold"
                >
                  ×
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

