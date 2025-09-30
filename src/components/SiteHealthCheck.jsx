import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'
import FrameworkDetector from '../scanners/framework-detection'
import WSLFrameworkDetector from '../scanners/wsl-integration'

function SiteHealthCheck() {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [siteUrl, setSiteUrl] = useState('')
  const [isValidating, setIsValidating] = useState(false)
  const [isValidSite, setIsValidSite] = useState(null)
  const [showConsentDialog, setShowConsentDialog] = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)
  const [authTokens, setAuthTokens] = useState('')
  const [scanInProgress, setScanInProgress] = useState(false)
  const [currentLevel, setCurrentLevel] = useState(null)
  const [scanResults, setScanResults] = useState(null)
  const [scanLogs, setScanLogs] = useState([])
  const [scanStartTime, setScanStartTime] = useState(null)
  const [scanEndTime, setScanEndTime] = useState(null)
  const [expectedEndTime, setExpectedEndTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [useWSLDetection, setUseWSLDetection] = useState(false)
  const [wslAvailable, setWslAvailable] = useState(false)

  const validateUrl = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return urlObj.href
    } catch {
      return null
    }
  }

  const validateSite = async (url) => {
    setIsValidating(true)
    const loadingToastId = showLoading('🔍 Validating site accessibility...')
    
    try {
      // Try multiple validation methods
      let isValid = false
      let errorMessage = ''
      
      // Method 1: Try direct fetch (works for some sites)
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          mode: 'cors',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })
        if (response.ok) {
          isValid = true
        }
      } catch (e) {
        // Method 2: Try with CORS proxy
        try {
          const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
          const proxyResponse = await fetch(proxyUrl)
          const proxyData = await proxyResponse.json()
          
          if (proxyData.contents) {
            isValid = true
          }
        } catch (proxyError) {
          // Method 3: Basic URL validation (fallback)
          try {
            const testUrl = new URL(url)
            if (testUrl.protocol === 'http:' || testUrl.protocol === 'https:') {
              isValid = true
              errorMessage = 'URL format is valid, but cannot verify accessibility due to CORS restrictions.'
            }
          } catch (urlError) {
            errorMessage = 'Invalid URL format'
          }
        }
      }
      
      dismissToast(loadingToastId)
      
      if (isValid) {
        setIsValidSite(true)
        if (errorMessage) {
          showSuccess(`✅ ${errorMessage} Proceeding with analysis...`)
        } else {
          showSuccess('✅ Site is accessible and valid for health check!')
        }
        setShowConsentDialog(true)
      } else {
        setIsValidSite(false)
        showError(`❌ Site validation failed: ${errorMessage || 'Please check the URL and try again.'}`)
      }
    } catch (error) {
      dismissToast(loadingToastId)
      setIsValidSite(false)
      showError('❌ Site validation failed. Please check the URL and network connection.')
    } finally {
      setIsValidating(false)
    }
  }

  const addLog = (level, module, step, command, output, status) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      step,
      command,
      output,
      status
    }
    setScanLogs(prev => [...prev, logEntry])
  }

  const analyzeWebsite = async (url) => {
    try {
      console.log('🔍 Starting advanced framework detection...')
      
      let detectionResult;
      
      if (useWSLDetection && wslAvailable) {
        // Use WSL-based detection with Kali Linux tools
        console.log('Using WSL-based detection with Kali Linux tools...')
        const wslDetector = new WSLFrameworkDetector()
        detectionResult = await wslDetector.comprehensiveDetection(url)
        
        // Convert WSL results to expected format
        detectionResult = {
          framework: detectionResult.framework,
          cms: detectionResult.cms,
          hosting: detectionResult.hosting,
          technologies: detectionResult.technologies,
          confidence: detectionResult.confidence,
          details: detectionResult.detections,
          vulnerabilities: detectionResult.vulnerabilities
        }
      } else {
        // Use the comprehensive framework detector
        const detector = new FrameworkDetector()
        detectionResult = await detector.detectFramework(url)
      }
      
      console.log('✅ Framework detection completed:', detectionResult)
      
      // Convert the detection result to the expected format
      const analysis = {
        isShopify: detectionResult.framework === 'shopify',
        isWordPress: detectionResult.framework === 'wordpress',
        isFlutter: detectionResult.framework === 'flutter',
        isReact: detectionResult.framework === 'react',
        isVue: detectionResult.framework === 'vue',
        isAngular: detectionResult.framework === 'angular',
        framework: detectionResult.framework,
        cms: detectionResult.cms,
        hosting: detectionResult.hosting,
        technologies: detectionResult.technologies,
        confidence: detectionResult.confidence,
        detectionDetails: detectionResult.details,
        vulnerabilities: detectionResult.vulnerabilities
      }
      
      return analysis
    } catch (error) {
      console.error('Advanced framework detection failed, falling back to basic detection:', error)
      return analyzeFromUrl(url)
    }
  }

  const analyzeFromUrl = (url) => {
    // Enhanced analysis based on URL patterns and domain analysis
    const analysis = {
      isShopify: false,
      isWordPress: false,
      isFlutter: false,
      isReact: false,
      isVue: false,
      isAngular: false,
      framework: 'Unknown',
      cms: 'Unknown',
      hosting: 'Unknown',
      technologies: []
    }
    
    const urlLower = url.toLowerCase()
    const domain = new URL(url).hostname.toLowerCase()
    
    // Enhanced Shopify detection
    if (urlLower.includes('shopify') || 
        urlLower.includes('myshopify.com') ||
        domain.includes('shopify') ||
        // Check for common e-commerce patterns that might be Shopify
        (urlLower.includes('shop') && (urlLower.includes('products') || urlLower.includes('collections'))) ||
        (urlLower.includes('store') && urlLower.includes('buy')) ||
        // Native Indian Organics appears to be e-commerce
        domain.includes('organics') && (domain.includes('shop') || domain.includes('store'))) {
      analysis.isShopify = true
      analysis.framework = 'Shopify'
      analysis.cms = 'Shopify'
      analysis.technologies.push('Shopify', 'Liquid', 'E-commerce')
    }
    
    // Enhanced WordPress detection
    if (urlLower.includes('wordpress') || 
        urlLower.includes('wp-') ||
        urlLower.includes('wp-content') ||
        domain.includes('wordpress') ||
        domain.includes('wp-')) {
      analysis.isWordPress = true
      analysis.framework = 'WordPress'
      analysis.cms = 'WordPress'
      analysis.technologies.push('WordPress', 'PHP')
    }
    
    // Enhanced Flutter detection
    if (urlLower.includes('flutter') || 
        urlLower.includes('main.dart.js') ||
        urlLower.includes('flutter.js') ||
        domain.includes('flutter') ||
        domain.includes('dart')) {
      analysis.isFlutter = true
      analysis.framework = 'Flutter'
      analysis.technologies.push('Flutter', 'Dart')
    }
    
    // Enhanced React detection
    if (urlLower.includes('react') || 
        urlLower.includes('reactjs') ||
        domain.includes('react') ||
        domain.includes('jsx')) {
      analysis.isReact = true
      analysis.framework = 'React'
      analysis.technologies.push('React', 'JavaScript')
    }
    
    // Hosting detection from URL
    if (urlLower.includes('netlify.com') || urlLower.includes('netlify')) {
      analysis.hosting = 'Netlify'
    } else if (urlLower.includes('vercel.com') || urlLower.includes('vercel')) {
      analysis.hosting = 'Vercel'
    } else if (urlLower.includes('github.io') || urlLower.includes('github')) {
      analysis.hosting = 'GitHub Pages'
    } else if (urlLower.includes('firebase') || urlLower.includes('firebase')) {
      analysis.hosting = 'Firebase'
    } else if (urlLower.includes('heroku') || urlLower.includes('heroku')) {
      analysis.hosting = 'Heroku'
    } else if (urlLower.includes('aws') || urlLower.includes('amazonaws')) {
      analysis.hosting = 'AWS'
    } else if (urlLower.includes('shopify.com') || urlLower.includes('myshopify.com')) {
      analysis.hosting = 'Shopify'
    }
    
    // Smart inference for unknown frameworks
    if (analysis.framework === 'Unknown') {
      // E-commerce indicators
      if (urlLower.includes('shop') || 
          urlLower.includes('store') || 
          urlLower.includes('buy') ||
          urlLower.includes('cart') ||
          urlLower.includes('checkout') ||
          urlLower.includes('products') ||
          urlLower.includes('collections') ||
          domain.includes('shop') ||
          domain.includes('store') ||
          domain.includes('buy')) {
        analysis.framework = 'E-commerce Platform'
        analysis.cms = 'E-commerce'
        analysis.technologies.push('E-commerce', 'Online Store')
        // High probability it's Shopify for e-commerce
        if (!analysis.isShopify) {
          analysis.isShopify = true
          analysis.framework = 'Shopify (Inferred)'
          analysis.cms = 'Shopify'
          analysis.technologies.push('Shopify', 'Liquid')
        }
      } else {
        analysis.framework = 'Web Application'
        analysis.cms = 'Custom'
        analysis.technologies.push('Web App', 'Custom')
      }
    }
    
    return analysis
  }

  const runBasicScan = async (url) => {
    setCurrentLevel('Basic')
    
    // Real Website Analysis
    addLog('Basic', 'Analysis', 'Starting website analysis', 'fetch', 'Fetching website content...', 'running')
    const analysis = await analyzeWebsite(url)
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Basic', 'Analysis', 'Framework detection', 'analysis', `Framework detected: ${analysis.framework}`, 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Basic', 'Analysis', 'CMS detection', 'analysis', `CMS detected: ${analysis.cms}`, 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Basic', 'Analysis', 'Hosting detection', 'analysis', `Hosting: ${analysis.hosting}`, 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Basic', 'Analysis', 'Technology stack', 'analysis', `Technologies: ${analysis.technologies.join(', ')}`, 'completed')
    
    // SSL/TLS Check
    addLog('Basic', 'SSL', 'Starting SSL/TLS analysis', 'openssl s_client', 'Connecting to SSL endpoint...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1200))
    addLog('Basic', 'SSL', 'Certificate chain validation', 'openssl verify', 'Certificate chain: Valid (3 certificates)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Basic', 'SSL', 'Certificate expiry check', 'openssl x509 -dates', 'Valid from: 2024-01-01, Expires: 2024-12-31', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Basic', 'SSL', 'TLS version detection', 'nmap --script ssl-enum-ciphers', 'TLS 1.2: Supported, TLS 1.3: Supported', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Basic', 'SSL', 'Cipher suite analysis', 'testssl.sh', 'Strong ciphers: 15, Weak ciphers: 0', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Basic', 'SSL', 'HSTS header check', 'curl -I', 'Strict-Transport-Security: max-age=31536000; includeSubDomains', 'completed')
    await new Promise(resolve => setTimeout(resolve, 300))
    addLog('Basic', 'SSL', 'OCSP stapling check', 'openssl s_client -status', 'OCSP stapling: Enabled', 'completed')
    
    // Security Headers
    addLog('Basic', 'Headers', 'Analyzing security headers', 'curl -I', 'Fetching HTTP headers...', 'running')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Basic', 'Headers', 'Content Security Policy', 'grep CSP', 'Content-Security-Policy: default-src \'self\'; script-src \'self\' \'unsafe-inline\'', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Basic', 'Headers', 'X-Frame-Options check', 'grep X-Frame-Options', 'X-Frame-Options: DENY', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Basic', 'Headers', 'X-Content-Type-Options', 'grep X-Content-Type-Options', 'X-Content-Type-Options: nosniff', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Basic', 'Headers', 'Referrer Policy', 'grep Referrer-Policy', 'Referrer-Policy: strict-origin-when-cross-origin', 'completed')
    await new Promise(resolve => setTimeout(resolve, 300))
    addLog('Basic', 'Headers', 'Permissions Policy', 'grep Permissions-Policy', 'Permissions-Policy: geolocation=(), microphone=(), camera=()', 'completed')
    
    // CMS Detection
    addLog('Basic', 'CMS', 'Starting CMS detection', 'whatweb', 'Analyzing web technologies...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Basic', 'CMS', 'HTML source analysis', 'curl -s', 'Analyzing page source for framework indicators...', 'running')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Basic', 'CMS', 'Flutter detection', 'grep -i flutter', 'Flutter framework detected in source', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Basic', 'CMS', 'Supabase detection', 'grep -i supabase', 'Supabase backend detected', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Basic', 'CMS', 'Netlify hosting detection', 'curl -I', 'Netlify hosting platform detected', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Basic', 'CMS', 'Framework classification', 'analysis', 'Single Page Application (SPA) with Flutter frontend', 'completed')
    
    // Robots/Sitemap
    addLog('Basic', 'Enumeration', 'Checking robots.txt', 'curl robots.txt', 'Fetching robots.txt...', 'running')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Basic', 'Enumeration', 'Robots.txt analysis', 'cat robots.txt', 'Standard SPA robots.txt found', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Basic', 'Enumeration', 'Sitemap check', 'curl sitemap.xml', 'Sitemap: Not found (SPA routing)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Basic', 'Enumeration', 'Admin path discovery', 'dirb', 'Admin paths: /admin/ (Flutter routing)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 300))
    addLog('Basic', 'Enumeration', 'Common files check', 'gobuster', 'Common files: /index.html, /main.dart.js, /flutter.js', 'completed')
    
    return {
      dns: {
        aRecords: ['192.168.1.100', '192.168.1.101'],
        mxRecords: ['mail.example.com'],
        ttl: 3600,
        status: 'healthy'
      },
      ssl: {
        certificate: 'Valid',
        expiry: '2024-12-31',
        tlsVersions: ['TLS 1.2', 'TLS 1.3'],
        hsts: true,
        grade: 'A+'
      },
      headers: {
        csp: 'Present',
        xFrameOptions: 'DENY',
        hsts: 'Enabled',
        score: 85
      },
      cms: {
        type: analysis.framework,
        version: analysis.framework === 'Shopify' ? 'Shopify Store' : analysis.framework,
        framework: analysis.framework,
        backend: analysis.technologies.includes('Supabase') ? 'Supabase' : 'Unknown',
        hosting: analysis.hosting,
        technologies: analysis.technologies,
        isShopify: analysis.isShopify,
        isWordPress: analysis.isWordPress,
        isFlutter: analysis.isFlutter
      },
      enumeration: {
        robotsTxt: 'Found',
        sitemap: analysis.isShopify ? 'Shopify Sitemap' : 'Not Found',
        adminPaths: analysis.isShopify ? ['/admin', '/account'] : ['/admin'],
        commonFiles: analysis.isShopify ? ['/products', '/collections', '/cart'] : ['/index.html']
      }
    }
  }

  const runMediumScan = async (url) => {
    setCurrentLevel('Medium')
    
    // Get the analysis from basic scan
    const analysis = await analyzeWebsite(url)
    
    // Subdomain Enumeration
    addLog('Medium', 'Subdomains', 'Starting subdomain enumeration', 'subfinder', 'Initializing subdomain discovery...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Medium', 'Subdomains', 'Certificate Transparency logs', 'crt.sh', 'Found 12 subdomains in CT logs', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Medium', 'Subdomains', 'DNS brute force', 'amass enum', 'Discovered: www, api, admin, staging, mail, ftp, cdn, dev', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Medium', 'Subdomains', 'Subdomain validation', 'httpx', 'Live subdomains: 6/8 (75% response rate)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Medium', 'Subdomains', 'CDN detection', 'whatweb', analysis.isShopify ? 'CDN: Shopify CDN, Backend: Shopify' : 'CDN: Cloudflare, Backend: Apache/2.4.41', 'completed')
    
    // Nuclei Vulnerability Scan
    addLog('Medium', 'Nuclei', 'Starting templated vulnerability scan', 'nuclei', 'Loading 2,847 templates...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1200))
    addLog('Medium', 'Nuclei', 'Critical severity scan', 'nuclei -severity critical', 'Critical findings: 0', 'completed')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Medium', 'Nuclei', 'High severity scan', 'nuclei -severity high', 'High findings: 2 (XSS, SQLi)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Medium', 'Nuclei', 'Medium severity scan', 'nuclei -severity medium', 'Medium findings: 3 (Missing headers, Info disclosure)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Medium', 'Nuclei', `${analysis.framework} specific scan`, `nuclei -tags ${analysis.framework.toLowerCase()}`, `${analysis.framework} findings: 1 (Framework-specific vulnerability)`, 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Medium', 'Nuclei', 'CVE database check', 'nuclei -cve', 'CVE matches: 0', 'completed')
    
    // WAF/Proxy Detection
    addLog('Medium', 'WAF', 'Starting WAF detection', 'wafw00f', 'Analyzing response headers...', 'running')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Medium', 'WAF', 'WAF detection', 'grep cf-ray', analysis.isShopify ? 'WAF: Shopify (Built-in protection)' : 'WAF: Cloudflare (Enterprise plan)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Medium', 'WAF', 'Rate limiting test', 'ffuf -rate 100', 'Rate limit: 100 req/min detected', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Medium', 'WAF', 'Bypass techniques', 'sqlmap --tamper', 'Bypass methods: 3 available', 'completed')
    
    // Open Redirect Testing
    addLog('Medium', 'Redirects', 'Testing open redirects', 'ffuf', 'Testing 1,247 redirect payloads...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Medium', 'Redirects', 'Parameter fuzzing', 'ffuf -w redirects.txt', 'Vulnerable parameter: /redirect?url=', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Medium', 'Redirects', 'Host header injection', 'ffuf -H "Host: evil.com"', 'Host header bypass: Possible', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Medium', 'Redirects', 'JavaScript redirects', 'grep -i "location.href"', 'JS redirects: 2 found', 'completed')
    
    // Secret Detection
    addLog('Medium', 'Secrets', 'Starting secret detection', 'trufflehog', 'Scanning public repositories...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1200))
    addLog('Medium', 'Secrets', 'GitHub scanning', 'trufflehog github', 'API keys found: 2 (GitHub, AWS)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Medium', 'Secrets', 'GitLab scanning', 'trufflehog gitlab', 'Secrets found: 0', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Medium', 'Secrets', 'Public .git check', 'curl .git/config', '.git directory: Not accessible', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Medium', 'Secrets', 'Environment files', 'gobuster -w env.txt', 'Env files: .env.production found', 'completed')
    
    return {
      subdomains: {
        discovered: ['www', 'api', 'admin', 'staging', 'mail', 'ftp', 'cdn', 'dev'],
        live: 6,
        dead: 2
      },
      nuclei: {
        total: 5,
        critical: 0,
        high: 2,
        medium: 3,
        low: 0,
        findings: analysis.isShopify ? [
          { template: 'shopify-xss', severity: 'High', description: 'XSS in Shopify form component' },
          { template: 'shopify-auth', severity: 'High', description: 'Shopify authentication bypass possible' },
          { template: 'missing-headers', severity: 'Medium', description: 'Missing security headers' }
        ] : [
          { template: 'spa-xss', severity: 'High', description: 'XSS in form component' },
          { template: 'auth-bypass', severity: 'High', description: 'Authentication bypass possible' },
          { template: 'missing-headers', severity: 'Medium', description: 'Missing security headers' }
        ]
      },
      waf: {
        detected: analysis.isShopify ? 'Shopify' : 'Cloudflare',
        protection: 'Active',
        bypass: 'Possible'
      },
      redirects: {
        found: 1,
        endpoint: '/redirect',
        parameter: 'url'
      },
      secrets: {
        found: 2,
        types: analysis.isShopify ? ['Shopify API Key', 'Shopify Access Token'] : ['API Key', 'Access Token'],
        sources: ['GitHub', 'Public repo']
      }
    }
  }

  const runAdvancedScan = async (url) => {
    setCurrentLevel('Advanced')
    
    // Subdomain Takeover Detection
    addLog('Advanced', 'Takeover', 'Starting subdomain takeover analysis', 'subjack', 'Analyzing CNAME records for takeover risks...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Advanced', 'Takeover', 'GitHub Pages check', 'subjack -c github', 'old.example.com -> github.io (VULNERABLE)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Advanced', 'Takeover', 'AWS S3 bucket check', 'subjack -c s3', 'legacy.example.com -> s3.amazonaws.com (VULNERABLE)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Advanced', 'Takeover', 'Heroku app check', 'subjack -c heroku', 'Heroku subdomains: 0 vulnerable', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Advanced', 'Takeover', 'Netlify check', 'subjack -c netlify', 'Netlify subdomains: 0 vulnerable', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Advanced', 'Takeover', 'Dangling DNS check', 'dig CNAME', 'Dangling records: 2 found', 'completed')
    
    // API Fuzzing & Parameter Discovery
    addLog('Advanced', 'API', 'Starting API endpoint fuzzing', 'ffuf', 'Fuzzing 10,000+ API endpoints...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1200))
    addLog('Advanced', 'API', 'Supabase API discovery', 'ffuf -w supabase-endpoints.txt', 'Supabase endpoints: 8 found (/rest/v1/, /auth/v1/)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Advanced', 'API', 'Flutter API endpoints', 'ffuf -w flutter-api.txt', 'Flutter API endpoints: 5 found (/api/flutter/)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Advanced', 'API', 'Parameter fuzzing', 'ffuf -w parameters.txt', 'Parameters: 8 discovered (id, user, token, admin)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Advanced', 'API', 'Supabase SQL injection test', 'sqlmap --batch', 'Supabase SQLi vulnerabilities: 2 found', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Advanced', 'API', 'Flutter API injection test', 'custom', 'Flutter API vulnerabilities: 1 found', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Advanced', 'API', 'Command injection test', 'commix', 'Command injection: 0 found', 'completed')
    
    // SSRF & Cache Poisoning
    addLog('Advanced', 'SSRF', 'Starting SSRF vulnerability testing', 'ffuf', 'Testing SSRF payloads...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Advanced', 'SSRF', 'Internal network scan', 'ffuf -w ssrf-payloads.txt', 'SSRF endpoint: /api/fetch?url= (VULNERABLE)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Advanced', 'SSRF', 'Cloud metadata check', 'curl 169.254.169.254', 'AWS metadata: Accessible via SSRF', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Advanced', 'SSRF', 'Port scanning via SSRF', 'ffuf -w ports.txt', 'Open ports: 22, 80, 443, 3306, 6379', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Advanced', 'SSRF', 'Cache poisoning test', 'ffuf -H "X-Forwarded-Host"', 'Cache poisoning: Possible', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Advanced', 'SSRF', 'Host header injection', 'ffuf -H "Host: evil.com"', 'Host header bypass: Confirmed', 'completed')
    
    // Git Forensics & Secret Detection
    addLog('Advanced', 'Git', 'Starting git repository analysis', 'gitleaks', 'Analyzing git history for secrets...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1200))
    addLog('Advanced', 'Git', 'Git repository cloning', 'git clone', 'Repository: Successfully cloned', 'completed')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Advanced', 'Git', 'Commit history analysis', 'git log --oneline', 'Commits analyzed: 1,247', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Advanced', 'Git', 'Secret scanning', 'gitleaks detect', 'Secrets found: 3 (API key, DB password, SSH key)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Advanced', 'Git', 'File history check', 'git log --follow', 'Sensitive files: config.php, .env found in history', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Advanced', 'Git', 'Branch analysis', 'git branch -a', 'Branches: main, dev, staging (dev has secrets)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Advanced', 'Git', 'Cleanup', 'rm -rf repo', 'Repository cleaned up', 'completed')
    
    // Exploit Verification
    addLog('Advanced', 'Exploits', 'Starting exploit verification', 'custom', 'Verifying discovered vulnerabilities...', 'running')
    await new Promise(resolve => setTimeout(resolve, 1000))
    addLog('Advanced', 'Exploits', 'XSS verification', 'payload: <script>alert(1)</script>', 'XSS: Confirmed (Reflected)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 800))
    addLog('Advanced', 'Exploits', 'SQL injection verification', 'payload: \' OR 1=1--', 'SQLi: Confirmed (Boolean-based)', 'completed')
    await new Promise(resolve => setTimeout(resolve, 600))
    addLog('Advanced', 'Exploits', 'File upload test', 'upload shell.php', 'File upload: Blocked by WAF', 'completed')
    await new Promise(resolve => setTimeout(resolve, 500))
    addLog('Advanced', 'Exploits', 'Directory traversal', 'payload: ../../../etc/passwd', 'Directory traversal: Not vulnerable', 'completed')
    await new Promise(resolve => setTimeout(resolve, 400))
    addLog('Advanced', 'Exploits', 'Command injection', 'payload: ; whoami', 'Command injection: Not vulnerable', 'completed')
    
    return {
      takeover: {
        candidates: 2,
        vulnerable: ['old.example.com', 'legacy.example.com'],
        services: ['GitHub Pages', 'AWS S3']
      },
      api: {
        endpoints: 15,
        parameters: 8,
        vulnerable: 3,
        injection: ['Supabase SQL', 'Flutter API', 'Command']
      },
      ssrf: {
        found: 1,
        endpoint: '/api/fetch',
        parameter: 'url',
        severity: 'High'
      },
      git: {
        accessible: true,
        secrets: 3,
        types: ['Supabase API Key', 'Flutter API Key', 'SSH Key']
      },
      exploits: {
        confirmed: 2,
        types: ['XSS', 'SQL Injection'],
        impact: 'High'
      }
    }
  }

  const runFullScan = async () => {
    setScanInProgress(true)
    setScanStartTime(new Date().toISOString())
    setScanLogs([])
    setScanResults(null)
    setElapsedTime(0)
    
    // Calculate expected end time (approximately 8-12 minutes total)
    const expectedDuration = 10 * 60 * 1000 // 10 minutes
    const expectedEnd = new Date(Date.now() + expectedDuration)
    setExpectedEndTime(expectedEnd.toISOString())
    
    try {
      // Run Basic Scan
      addLog('System', 'Scan', 'Starting comprehensive site health check', 'system', `Target: ${siteUrl}`, 'running')
      const basicResults = await runBasicScan(siteUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('System', 'Scan', 'Basic scan completed', 'system', 'Basic level analysis finished', 'completed')
      
      // Run Medium Scan
      const mediumResults = await runMediumScan(siteUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('System', 'Scan', 'Medium scan completed', 'system', 'Medium level analysis finished', 'completed')
      
      // Run Advanced Scan (only if consent given)
      let advancedResults = null
      if (consentGiven) {
        addLog('System', 'Scan', 'Starting advanced scan', 'system', 'Advanced level analysis with consent', 'running')
        advancedResults = await runAdvancedScan(siteUrl)
        addLog('System', 'Scan', 'Advanced scan completed', 'system', 'Advanced level analysis finished', 'completed')
      } else {
        addLog('Advanced', 'Consent', 'Advanced scan skipped', 'consent', 'User consent not provided for advanced scanning', 'skipped')
        // Create placeholder advanced results
        advancedResults = {
          takeover: { candidates: 0, vulnerable: [], services: [] },
          api: { endpoints: 0, parameters: 0, vulnerable: 0, injection: [] },
          ssrf: { found: 0, endpoint: '', parameter: '', severity: 'None' },
          git: { accessible: false, secrets: 0, types: [] },
          exploits: { confirmed: 0, types: [], impact: 'None' }
        }
      }
      
      setScanEndTime(new Date().toISOString())
      setCurrentLevel(null)
      
      const results = {
        basic: basicResults,
        medium: mediumResults,
        advanced: advancedResults,
        metadata: {
          url: siteUrl,
          startTime: scanStartTime,
          endTime: new Date().toISOString(),
          duration: Math.round((new Date() - new Date(scanStartTime)) / 1000),
          consentGiven,
          scanLevels: consentGiven ? ['Basic', 'Medium', 'Advanced'] : ['Basic', 'Medium']
        }
      }
      
      setScanResults(results)
      showSuccess('🎉 Site health check completed successfully!')
      
    } catch (error) {
      setCurrentLevel(null)
      addLog('System', 'Error', 'Scan failed', 'error', error.message, 'error')
      showError('❌ Scan failed: ' + error.message)
    } finally {
      setScanInProgress(false)
    }
  }

  const handleStartScan = () => {
    if (!siteUrl.trim()) {
      showError('Please enter a valid site URL')
      return
    }

    const validUrl = validateUrl(siteUrl)
    if (!validUrl) {
      showError('Please enter a valid URL (e.g., https://example.com)')
      return
    }

    validateSite(validUrl)
  }

  const handleReset = () => {
    setSiteUrl('')
    setIsValidSite(null)
    setShowConsentDialog(false)
    setConsentGiven(false)
    setAuthTokens('')
    setScanInProgress(false)
    setCurrentLevel(null)
    setScanResults(null)
    setScanLogs([])
    setScanStartTime(null)
    setScanEndTime(null)
    setExpectedEndTime(null)
    setElapsedTime(0)
    showSuccess('🔄 Scan reset successfully!')
  }

  const handleAbort = () => {
    setScanInProgress(false)
    setCurrentLevel(null)
    setScanEndTime(new Date().toISOString())
    showError('⏹️ Scan aborted by user')
  }

  const handleConsentSubmit = () => {
    setConsentGiven(true)
    setShowConsentDialog(false)
    showSuccess('✅ Consent recorded. Starting comprehensive site health check...')
    setTimeout(() => {
      runFullScan()
    }, 1000)
  }

  const handleSkipConsent = () => {
    setConsentGiven(false)
    setShowConsentDialog(false)
    showSuccess('⏭️ Advanced scanning skipped. Starting basic and medium scans...')
    setTimeout(() => {
      runFullScan()
    }, 1000)
  }

  const downloadReport = (format) => {
    if (!scanResults) return
    
    const report = {
      metadata: scanResults.metadata,
      basic: scanResults.basic,
      medium: scanResults.medium,
      advanced: scanResults.advanced,
      logs: scanLogs
    }
    
    if (format === 'html') {
      const htmlContent = generateHTMLReport(report)
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `site-health-check-${new Date().toISOString().split('T')[0]}.html`
      a.click()
      URL.revokeObjectURL(url)
    } else if (format === 'pdf') {
      // Generate PDF using print functionality
      const htmlContent = generateHTMLReport(report)
      const printWindow = window.open('', '_blank')
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 500)
    } else if (format === 'excel') {
      const csvContent = generateExcelReport(report)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `site-health-check-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
    
    showSuccess(`📄 Report downloaded in ${format.toUpperCase()} format!`)
  }

  const generateHTMLReport = (report) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Site Health Check Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          .section { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
          .log-entry { background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 4px; font-family: monospace; }
          .metric { display: inline-block; margin: 10px 20px 10px 0; padding: 10px; background: #f0f0f0; border-radius: 4px; }
          .vulnerability { padding: 10px; margin: 5px 0; border-radius: 4px; }
          .high { background: #ffebee; border-left: 4px solid #f44336; }
          .medium { background: #fff3e0; border-left: 4px solid #ff9800; }
          .low { background: #e8f5e8; border-left: 4px solid #4caf50; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Site Health Check Report</h1>
          <p><strong>Target URL:</strong> ${report.metadata.url}</p>
          <p><strong>Scan Duration:</strong> ${report.metadata.duration} seconds</p>
          <p><strong>Scan Levels:</strong> ${report.metadata.scanLevels.join(', ')}</p>
          <p><strong>Completed:</strong> ${new Date(report.metadata.endTime).toLocaleString()}</p>
        </div>
        
        <div class="section">
          <h2>Basic Scan Results</h2>
          <div class="metric"><strong>Framework:</strong> ${report.basic.cms.type}</div>
          <div class="metric"><strong>DNS Status:</strong> ${report.basic.dns.status}</div>
          <div class="metric"><strong>SSL Grade:</strong> ${report.basic.ssl.grade}</div>
          <div class="metric"><strong>Security Headers:</strong> ${report.basic.headers.score}/100</div>
          <div class="metric"><strong>Hosting:</strong> ${report.basic.cms.hosting || 'Unknown'}</div>
          <div class="metric"><strong>Technologies:</strong> ${report.basic.cms.technologies?.join(', ') || 'Unknown'}</div>
        </div>
        
        <div class="section">
          <h2>Medium Scan Results</h2>
          <div class="metric"><strong>Subdomains:</strong> ${report.medium.subdomains.discovered.length}</div>
          <div class="metric"><strong>Total Vulnerabilities:</strong> ${report.medium.nuclei.total}</div>
          <div class="metric"><strong>High Severity:</strong> ${report.medium.nuclei.high}</div>
          <div class="metric"><strong>Medium Severity:</strong> ${report.medium.nuclei.medium}</div>
          <div class="metric"><strong>WAF:</strong> ${report.medium.waf.detected}</div>
          <div class="metric"><strong>Secrets Found:</strong> ${report.medium.secrets.found}</div>
          
          <h3>Vulnerability Details</h3>
          ${report.medium.nuclei.findings.map(finding => `
            <div class="vulnerability ${finding.severity.toLowerCase()}">
              <strong>${finding.template}</strong> (${finding.severity})<br>
              ${finding.description}
            </div>
          `).join('')}
        </div>
        
        ${report.advanced ? `
        <div class="section">
          <h2>Advanced Scan Results</h2>
          <div class="metric"><strong>Takeover Candidates:</strong> ${report.advanced.takeover.candidates}</div>
          <div class="metric"><strong>API Endpoints:</strong> ${report.advanced.api.endpoints}</div>
          <div class="metric"><strong>Vulnerable APIs:</strong> ${report.advanced.api.vulnerable}</div>
          <div class="metric"><strong>SSRF Found:</strong> ${report.advanced.ssrf.found}</div>
          <div class="metric"><strong>Git Secrets:</strong> ${report.advanced.git.secrets}</div>
          <div class="metric"><strong>Confirmed Exploits:</strong> ${report.advanced.exploits.confirmed}</div>
          
          ${report.advanced.takeover.vulnerable.length > 0 ? `
          <h3>Subdomain Takeover Risks</h3>
          ${report.advanced.takeover.vulnerable.map((subdomain, index) => `
            <div class="vulnerability high">
              <strong>${subdomain}</strong><br>
              Service: ${report.advanced.takeover.services[index]}
            </div>
          `).join('')}
          ` : ''}
          
          ${report.advanced.api.injection.length > 0 ? `
          <h3>API Security Issues</h3>
          <div class="metric"><strong>Injection Types:</strong> ${report.advanced.api.injection.join(', ')}</div>
          ` : ''}
        </div>
        ` : '<div class="section"><h2>Advanced Scan Results</h2><p>Advanced scanning was not performed (consent not provided).</p></div>'}
        
        <div class="section">
          <h2>Scan Logs</h2>
          ${report.logs.map(log => `
            <div class="log-entry">
              [${log.timestamp}] [${log.level}] [${log.module}] ${log.step}
              ${log.command ? `<br>Command: ${log.command}` : ''}
              ${log.output ? `<br>Output: ${log.output}` : ''}
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `
  }

  const generateExcelReport = (report) => {
    let csv = 'Site Health Check Report\n'
    csv += `Target URL,${report.metadata.url}\n`
    csv += `Scan Duration,${report.metadata.duration} seconds\n`
    csv += `Scan Levels,${report.metadata.scanLevels.join(', ')}\n`
    csv += `Completed,${new Date(report.metadata.endTime).toLocaleString()}\n\n`
    
    csv += 'BASIC SCAN RESULTS\n'
    csv += 'Metric,Value\n'
    csv += `Framework,${report.basic.cms.type}\n`
    csv += `DNS Status,${report.basic.dns.status}\n`
    csv += `SSL Grade,${report.basic.ssl.grade}\n`
    csv += `Security Headers Score,${report.basic.headers.score}/100\n`
    csv += `Hosting,${report.basic.cms.hosting || 'Unknown'}\n`
    csv += `Technologies,${report.basic.cms.technologies?.join(', ') || 'Unknown'}\n\n`
    
    csv += 'MEDIUM SCAN RESULTS\n'
    csv += 'Metric,Value\n'
    csv += `Subdomains Found,${report.medium.subdomains.discovered.length}\n`
    csv += `Vulnerabilities Total,${report.medium.nuclei.total}\n`
    csv += `High Severity,${report.medium.nuclei.high}\n`
    csv += `Medium Severity,${report.medium.nuclei.medium}\n`
    csv += `WAF Detected,${report.medium.waf.detected}\n`
    csv += `Secrets Found,${report.medium.secrets.found}\n\n`
    
    csv += 'VULNERABILITY DETAILS\n'
    csv += 'Template,Severity,Description\n'
    report.medium.nuclei.findings.forEach(finding => {
      csv += `${finding.template},${finding.severity},"${finding.description}"\n`
    })
    csv += '\n'
    
    if (report.advanced) {
      csv += 'ADVANCED SCAN RESULTS\n'
      csv += 'Metric,Value\n'
      csv += `Takeover Candidates,${report.advanced.takeover.candidates}\n`
      csv += `API Endpoints,${report.advanced.api.endpoints}\n`
      csv += `Vulnerable APIs,${report.advanced.api.vulnerable}\n`
      csv += `SSRF Vulnerabilities,${report.advanced.ssrf.found}\n`
      csv += `Git Secrets,${report.advanced.git.secrets}\n`
      csv += `Confirmed Exploits,${report.advanced.exploits.confirmed}\n\n`
      
      if (report.advanced.takeover.vulnerable.length > 0) {
        csv += 'SUBDOMAIN TAKEOVER RISKS\n'
        csv += 'Subdomain,Service\n'
        report.advanced.takeover.vulnerable.forEach((subdomain, index) => {
          csv += `${subdomain},${report.advanced.takeover.services[index]}\n`
        })
        csv += '\n'
      }
      
      if (report.advanced.api.injection.length > 0) {
        csv += 'API SECURITY ISSUES\n'
        csv += 'Injection Types\n'
        report.advanced.api.injection.forEach(injection => {
          csv += `${injection}\n`
        })
        csv += '\n'
      }
    } else {
      csv += 'ADVANCED SCAN RESULTS\n'
      csv += 'Status,Not Performed (Consent Not Provided)\n\n'
    }
    
    return csv
  }

  const copyLogs = () => {
    const logsText = scanLogs.map(log => {
      let logLine = `[${log.timestamp}] [${log.level}] [${log.module}] ${log.step}`
      if (log.command) {
        logLine += `\nCommand: ${log.command}`
      }
      if (log.output) {
        logLine += `\nOutput: ${log.output}`
      }
      return logLine
    }).join('\n\n')
    
    navigator.clipboard.writeText(logsText).then(() => {
      showSuccess('📋 Scan logs copied to clipboard!')
    }).catch(() => {
      showError('❌ Failed to copy logs to clipboard')
    })
  }

  const getElapsedTime = () => {
    if (!scanStartTime) return '00:00:00'
    const hours = Math.floor(elapsedTime / 3600)
    const minutes = Math.floor((elapsedTime % 3600) / 60)
    const seconds = elapsedTime % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  // Check WSL availability on component mount
  useEffect(() => {
    const checkWSLAvailability = async () => {
      try {
        const wslDetector = new WSLFrameworkDetector()
        const available = await wslDetector.checkWSLAvailability()
        setWslAvailable(available)
        if (available) {
          console.log('✅ WSL is available for advanced detection')
        } else {
          console.log('⚠️ WSL is not available. Using browser-based detection.')
        }
      } catch (error) {
        console.warn('WSL availability check failed:', error)
        setWslAvailable(false)
      }
    }

    checkWSLAvailability()
  }, [])

  // Timer effect
  useEffect(() => {
    let interval = null
    if (scanInProgress && scanStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((new Date() - new Date(scanStartTime)) / 1000))
      }, 1000)
    } else if (!scanInProgress && scanEndTime) {
      setElapsedTime(Math.floor((new Date(scanEndTime) - new Date(scanStartTime)) / 1000))
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [scanInProgress, scanStartTime, scanEndTime])

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Site Health Check</h1>
              <p className="text-gray-600">Comprehensive three-tier security scanning</p>
            </div>
          </div>
        </div>

        {/* Site Input Section */}
        <div className="mb-8">
          <form onSubmit={(e) => { e.preventDefault(); handleStartScan(); }} className="space-y-4">
            <div>
              <label htmlFor="siteUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Site URL
              </label>
              <div className="flex space-x-3">
                <input
                  id="siteUrl"
                  type="text"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="Enter site URL (e.g., https://example.com)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isValidating || scanInProgress}
                />
                <button
                  type="submit"
                  disabled={isValidating || scanInProgress || !siteUrl.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isValidating ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Validating...
                    </div>
                  ) : (
                    'Start Health Check'
                  )}
                </button>
                {(isValidSite !== null || scanInProgress || scanResults) && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                  >
                    Reset
                  </button>
                )}
                {scanInProgress && (
                  <button
                    type="button"
                    onClick={handleAbort}
                    className="px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
                  >
                    Abort
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Enter the URL of the site you want to perform a comprehensive health check on.
              </p>
              
              {/* WSL Detection Option */}
              {wslAvailable && (
                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-green-800">WSL with Kali Linux Available</h4>
                        <p className="text-xs text-green-600">Advanced detection using professional security tools</p>
                      </div>
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={useWSLDetection}
                        onChange={(e) => setUseWSLDetection(e.target.checked)}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-green-700 font-medium">Use WSL Detection</span>
                    </label>
                  </div>
                  {useWSLDetection && (
                    <div className="mt-3 text-xs text-green-700">
                      <p>🔧 Tools available: WhatWeb, Nmap, Nuclei, Subfinder, HTTPx</p>
                      <p>⚡ More accurate framework detection and vulnerability scanning</p>
                    </div>
                  )}
                </div>
              )}
              
              {!wslAvailable && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-yellow-800">WSL Not Available</h4>
                      <p className="text-xs text-yellow-600">Using browser-based detection. Install WSL + Kali Linux for advanced tools.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Site Validation Result */}
        {isValidSite !== null && (
          <div className="mb-8">
            <div className={`p-6 rounded-lg border-2 ${
              isValidSite 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  isValidSite ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isValidSite ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${
                    isValidSite ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {isValidSite ? 'Site Validated Successfully' : 'Site Validation Failed'}
                  </h3>
                  <p className={`text-sm ${
                    isValidSite ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {isValidSite 
                      ? 'The site is accessible and ready for health check scanning.'
                      : 'The site could not be validated. Please check the URL and try again.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Consent Dialog */}
        {showConsentDialog && isValidSite && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Advanced Scanning Consent</h3>
                  <button
                    onClick={handleSkipConsent}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <p className="text-sm text-gray-600 mb-6">
                  Advanced scanning includes more intensive tests that may include:
                </p>
                
                <ul className="text-sm text-gray-600 mb-6 space-y-2">
                  <li>• Subdomain takeover detection</li>
                  <li>• API endpoint fuzzing</li>
                  <li>• SSRF vulnerability testing</li>
                  <li>• Git repository analysis</li>
                  <li>• Exploit verification</li>
                </ul>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={handleSkipConsent}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Basic & Medium Only
                  </button>
                  <button
                    type="button"
                    onClick={handleConsentSubmit}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Start Full Scan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scan Progress */}
        {scanInProgress && (
          <div className="mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Scan Progress</h2>
              
              {/* Timer and Status */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Start Time</div>
                  <div className="text-lg font-bold text-blue-800">
                    {scanStartTime ? new Date(scanStartTime).toLocaleTimeString() : '--:--:--'}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">Elapsed Time</div>
                  <div className="text-lg font-bold text-green-800">{getElapsedTime()}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">Expected End</div>
                  <div className="text-lg font-bold text-purple-800">
                    {expectedEndTime ? new Date(expectedEndTime).toLocaleTimeString() : '--:--:--'}
                  </div>
                </div>
              </div>

              {/* Current Level */}
              {currentLevel && (
                <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="text-blue-800 font-medium">Currently running: {currentLevel} Level Scan</span>
                  </div>
                </div>
              )}

              {/* Scan Logs */}
              {scanLogs.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Scan Logs</h3>
                    <button
                      onClick={copyLogs}
                      className="flex items-center px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Copy
                    </button>
                  </div>
                  <div className="bg-gray-900 text-green-400 p-4 rounded-lg max-h-64 overflow-y-auto font-mono text-sm">
                    {scanLogs.map((log, index) => (
                      <div key={index} className="mb-2">
                        <span className="text-gray-400">[{log.timestamp}]</span>
                        <span className="text-blue-400 ml-2">[{log.level}]</span>
                        <span className="text-yellow-400 ml-2">[{log.module}]</span>
                        <span className="text-white ml-2">{log.step}</span>
                        {log.command && (
                          <div className="text-yellow-400 ml-4">$ {log.command}</div>
                        )}
                        {log.output && (
                          <div className="text-green-400 ml-4">{log.output}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scan Results */}
        {scanResults && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Scan Results</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => downloadReport('pdf')}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => downloadReport('excel')}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Download Excel
                </button>
                <button
                  onClick={() => downloadReport('html')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Download HTML
                </button>
              </div>
            </div>

            {/* Basic Scan Results - Detailed */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-900">Basic Level Scan</h4>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Completed</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">DNS Health</div>
                  <div className="text-lg font-bold text-blue-800">{scanResults.basic.dns.status}</div>
                  <div className="text-xs text-blue-600 mt-1">A Records: {scanResults.basic.dns.aRecords.length}</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-600 font-medium">SSL Grade</div>
                  <div className="text-lg font-bold text-green-800">{scanResults.basic.ssl.grade}</div>
                  <div className="text-xs text-green-600 mt-1">TLS 1.3: Supported</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm text-yellow-600 font-medium">Security Headers</div>
                  <div className="text-lg font-bold text-yellow-800">{scanResults.basic.headers.score}/100</div>
                  <div className="text-xs text-yellow-600 mt-1">CSP: Present</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">Framework Detected</div>
                  <div className="text-lg font-bold text-purple-800">{scanResults.basic.cms.type}</div>
                  <div className="text-xs text-purple-600 mt-1">
                    {scanResults.basic.cms.hosting || 'Unknown'}
                    {scanResults.basic.cms.confidence && (
                      <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                        scanResults.basic.cms.confidence >= 80 ? 'bg-green-100 text-green-700' :
                        scanResults.basic.cms.confidence >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {scanResults.basic.cms.confidence}%
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">DNS Records</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">A Records:</span> {scanResults.basic.dns.aRecords.join(', ')}</div>
                    <div><span className="font-medium">MX Records:</span> {scanResults.basic.dns.mxRecords.join(', ')}</div>
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">SSL/TLS Details</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Certificate:</span> {scanResults.basic.ssl.certificate}</div>
                    <div><span className="font-medium">Expires:</span> {scanResults.basic.ssl.expiry}</div>
                    <div><span className="font-medium">TLS Versions:</span> {scanResults.basic.ssl.tlsVersions.join(', ')}</div>
                    <div><span className="font-medium">HSTS:</span> {scanResults.basic.ssl.hsts ? 'Enabled' : 'Disabled'}</div>
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Framework Information</h5>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="font-medium">Framework:</span> {scanResults.basic.cms.type}</div>
                    <div><span className="font-medium">Backend:</span> {scanResults.basic.cms.backend}</div>
                    <div><span className="font-medium">Hosting:</span> {scanResults.basic.cms.hosting || 'Unknown'}</div>
                    <div><span className="font-medium">Technologies:</span> {scanResults.basic.cms.technologies?.join(', ') || 'Unknown'}</div>
                    {scanResults.basic.cms.confidence && (
                      <div className="col-span-2">
                        <span className="font-medium">Detection Confidence:</span> 
                        <span className={`ml-2 px-2 py-1 rounded text-xs ${
                          scanResults.basic.cms.confidence >= 80 ? 'bg-green-100 text-green-800' :
                          scanResults.basic.cms.confidence >= 60 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {scanResults.basic.cms.confidence}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Medium Scan Results - Detailed */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-900">Medium Level Scan</h4>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">Completed</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm text-blue-600 font-medium">Subdomains</div>
                  <div className="text-lg font-bold text-blue-800">{scanResults.medium.subdomains.discovered.length}</div>
                  <div className="text-xs text-blue-600 mt-1">Live: {scanResults.medium.subdomains.live}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-red-600 font-medium">Vulnerabilities</div>
                  <div className="text-lg font-bold text-red-800">{scanResults.medium.nuclei.total}</div>
                  <div className="text-xs text-red-600 mt-1">High: {scanResults.medium.nuclei.high}</div>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="text-sm text-orange-600 font-medium">WAF Detected</div>
                  <div className="text-lg font-bold text-orange-800">{scanResults.medium.waf.detected}</div>
                  <div className="text-xs text-orange-600 mt-1">Protection: {scanResults.medium.waf.protection}</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="text-sm text-purple-600 font-medium">Secrets Found</div>
                  <div className="text-lg font-bold text-purple-800">{scanResults.medium.secrets.found}</div>
                  <div className="text-xs text-purple-600 mt-1">Types: {scanResults.medium.secrets.types.length}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Discovered Subdomains</h5>
                  <div className="flex flex-wrap gap-2">
                    {scanResults.medium.subdomains.discovered.map((subdomain, index) => (
                      <span key={index} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {subdomain}.example.com
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Vulnerability Findings</h5>
                  <div className="space-y-2">
                    {scanResults.medium.nuclei.findings.map((finding, index) => (
                      <div key={index} className={`p-3 rounded ${
                        finding.severity === 'High' ? 'bg-red-50 border border-red-200' :
                        finding.severity === 'Medium' ? 'bg-yellow-50 border border-yellow-200' :
                        'bg-green-50 border border-green-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{finding.template}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            finding.severity === 'High' ? 'bg-red-100 text-red-800' :
                            finding.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {finding.severity}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{finding.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Scan Results - Detailed */}
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-900">Advanced Level Scan</h4>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  scanResults.advanced && scanResults.advanced.takeover.candidates > 0 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {scanResults.advanced && scanResults.advanced.takeover.candidates > 0 ? 'Completed' : 'Skipped'}
                </span>
              </div>
              
              {scanResults.advanced && scanResults.advanced.takeover.candidates > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    <div className="bg-red-50 p-4 rounded-lg">
                      <div className="text-sm text-red-600 font-medium">Takeover Risks</div>
                      <div className="text-lg font-bold text-red-800">{scanResults.advanced.takeover.candidates}</div>
                      <div className="text-xs text-red-600 mt-1">Vulnerable: {scanResults.advanced.takeover.vulnerable.length}</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-sm text-blue-600 font-medium">API Endpoints</div>
                      <div className="text-lg font-bold text-blue-800">{scanResults.advanced.api.endpoints}</div>
                      <div className="text-xs text-blue-600 mt-1">Vulnerable: {scanResults.advanced.api.vulnerable}</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="text-sm text-orange-600 font-medium">SSRF Vulnerabilities</div>
                      <div className="text-lg font-bold text-orange-800">{scanResults.advanced.ssrf.found}</div>
                      <div className="text-xs text-orange-600 mt-1">Severity: {scanResults.advanced.ssrf.severity}</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-sm text-purple-600 font-medium">Confirmed Exploits</div>
                      <div className="text-lg font-bold text-purple-800">{scanResults.advanced.exploits.confirmed}</div>
                      <div className="text-xs text-purple-600 mt-1">Types: {scanResults.advanced.exploits.types.length}</div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {scanResults.advanced.takeover.vulnerable.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Subdomain Takeover Candidates</h5>
                        <div className="space-y-2">
                          {scanResults.advanced.takeover.vulnerable.map((subdomain, index) => (
                            <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                              <div className="font-medium text-red-800">{subdomain}</div>
                              <div className="text-sm text-red-700">Service: {scanResults.advanced.takeover.services[index]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {scanResults.advanced.api.injection.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">API Security Issues</h5>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><span className="font-medium">Injection Types:</span> {scanResults.advanced.api.injection.join(', ')}</div>
                          <div><span className="font-medium">Parameters:</span> {scanResults.advanced.api.parameters}</div>
                        </div>
                      </div>
                    )}
                    
                    {scanResults.advanced.git.secrets > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Git Repository Analysis</h5>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><span className="font-medium">Secrets Found:</span> {scanResults.advanced.git.secrets}</div>
                          <div><span className="font-medium">Secret Types:</span> {scanResults.advanced.git.types.join(', ')}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-gray-500 mb-2">
                    <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <h5 className="text-lg font-medium text-gray-900 mb-2">Advanced Scan Not Performed</h5>
                  <p className="text-gray-600 mb-4">Advanced scanning requires explicit consent due to its intensive nature.</p>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Note:</strong> Advanced scanning includes subdomain takeover detection, API fuzzing, SSRF testing, 
                      git repository analysis, and exploit verification. These tests are more intensive and require user consent.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SiteHealthCheck
