const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { URL } = require('url')
const puppeteer = require('puppeteer')

// Utility functions
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function sanitizeUrl(input) {
  const u = new URL(input.startsWith('http') ? input : `https://${input}`)
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Invalid URL protocol')
  return u.toString()
}

function initReportData(url) {
  return {
    target: url,
    timestamp: new Date().toISOString(),
    meta: { 
      durationSeconds: 0, 
      toolVersions: { node: process.version, puppeteer: 'latest' }, 
      legal: { authorized: true, mode: 'defensive' } 
    },
    summary: { 
      severityCount: { info: 0, low: 0, medium: 0, high: 0 }, 
      overallRisk: 'Info',
      totalFindings: 0
    },
    results: { 
      headers: [], 
      ssl: {}, 
      dependencies: [], 
      forms: [],
      mixedContent: [],
      portScan: [],
      crawl: { pages: [], totalPages: 0 },
      findings: [] 
    },
    report: { 
      responsibleDisclosure: 'Assessment performed under authorization. No destructive actions taken.', 
      footer: 'For authorized use only - Defensive analysis only' 
    }
  }
}

// HTTP Request utility
function doRequest(url, method = 'GET', headers = {}, redirects = 0) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url)
      const lib = urlObj.protocol === 'http:' ? http : https
      const options = {
        method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          ...headers
        },
        timeout: 10000
      }
      
      const req = lib.request(urlObj, options, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 3) {
          resolve(doRequest(new URL(res.headers.location, urlObj).toString(), method, headers, redirects + 1))
          return
        }
        
        let data = ''
        res.on('data', (chunk) => data += chunk.toString('utf8'))
        res.on('end', () => resolve({ response: res, body: data, statusCode: res.statusCode }))
      })
      
      req.on('error', () => resolve(null))
      req.on('timeout', () => {
        req.destroy()
        resolve(null)
      })
      req.end()
    } catch {
      resolve(null)
    }
  })
}

// Security Headers Analysis
async function analyzeSecurityHeaders(url, onProgress) {
  const findings = []
  const headers = []
  
  onProgress && onProgress({ stage: 'headers', message: 'Analyzing security headers...' })
  
  const response = await doRequest(url)
  if (!response) {
    findings.push({
      title: 'Unable to connect to target',
      severity: 'high',
      why: 'Failed to establish connection to the target URL',
      fix: 'Verify the URL is correct and the server is accessible'
    })
    return { headers, findings }
  }

  const responseHeaders = response.response.headers
  const getHeader = (name) => responseHeaders[name.toLowerCase()] || responseHeaders[name] || ''

  // Critical security headers
  const securityHeaders = [
    {
      name: 'Content-Security-Policy',
      severity: 'medium',
      recommendation: "Set a comprehensive CSP (e.g., default-src 'self'; script-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none')",
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'Strict-Transport-Security',
      severity: 'medium',
      recommendation: 'Enable HSTS: max-age=31536000; includeSubDomains; preload',
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'X-Frame-Options',
      severity: 'low',
      recommendation: 'Add X-Frame-Options: DENY (or use frame-ancestors in CSP)',
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'X-Content-Type-Options',
      severity: 'low',
      recommendation: 'Add X-Content-Type-Options: nosniff',
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'Referrer-Policy',
      severity: 'low',
      recommendation: 'Set Referrer-Policy: strict-origin-when-cross-origin',
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'Permissions-Policy',
      severity: 'low',
      recommendation: 'Add Permissions-Policy to restrict powerful features (camera, microphone, geolocation)',
      check: (value) => value ? 'present' : 'missing'
    },
    {
      name: 'X-XSS-Protection',
      severity: 'low',
      recommendation: 'Add X-XSS-Protection: 1; mode=block (though CSP is preferred)',
      check: (value) => value ? 'present' : 'missing'
    }
  ]

  securityHeaders.forEach(header => {
    const value = getHeader(header.name)
    const status = header.check(value)
    
    headers.push({
      name: header.name,
      status,
      value: value || '',
      severity: status === 'missing' ? header.severity : 'info',
      recommendation: status === 'missing' ? header.recommendation : undefined
    })

    if (status === 'missing') {
      findings.push({
        title: `${header.name} header missing`,
        severity: header.severity,
        why: `${header.name} helps protect users from various attacks and reduces the attack surface.`,
        fix: header.recommendation
      })
    }
  })

  return { headers, findings }
}

// SSL/TLS Analysis
async function analyzeSSL(url, onProgress) {
  onProgress && onProgress({ stage: 'ssl', message: 'Analyzing SSL/TLS configuration...' })
  
  try {
    const response = await doRequest(url)
    if (!response) {
      return {
        valid: false,
        issuer: 'Unknown',
        protocols: [],
        weakCiphers: [],
        expiryDays: null,
        severity: 'high',
        recommendations: ['Ensure HTTPS with a valid certificate is properly configured']
      }
    }

    const cert = response.response.socket?.getPeerCertificate ? response.response.socket.getPeerCertificate() : null
    let expiryDays = null
    let issuer = ''
    let valid = !!cert

    if (cert && cert.valid_to) {
      const exp = new Date(cert.valid_to)
      expiryDays = Math.max(0, Math.round((exp - new Date()) / (1000 * 60 * 60 * 24)))
      issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown'
    }

    const sslInfo = {
      valid,
      issuer,
      protocols: ['TLSv1.2', 'TLSv1.3'], // Simplified - would need more detailed analysis
      weakCiphers: [],
      expiryDays,
      severity: 'info',
      recommendations: []
    }

    if (expiryDays !== null && expiryDays < 30) {
      sslInfo.severity = expiryDays < 14 ? 'high' : 'medium'
      sslInfo.recommendations.push(`Certificate expires in ${expiryDays} days - renew immediately`)
    }

    if (!valid) {
      sslInfo.severity = 'high'
      sslInfo.recommendations.push('Invalid or missing SSL certificate')
    }

    return sslInfo
  } catch (error) {
    return {
      valid: false,
      issuer: 'Unknown',
      protocols: [],
      weakCiphers: [],
      expiryDays: null,
      severity: 'high',
      recommendations: ['SSL/TLS configuration analysis failed - verify HTTPS setup']
    }
  }
}

// JavaScript Dependencies Analysis
async function analyzeDependencies(url, onProgress) {
  onProgress && onProgress({ stage: 'dependencies', message: 'Analyzing JavaScript dependencies...' })
  
  const dependencies = []
  const findings = []
  
  try {
    const response = await doRequest(url)
    if (!response || !response.body) {
      return { dependencies, findings }
    }

    const html = response.body
    
    // Extract script sources
    const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi
    const scripts = []
    let match
    while ((match = scriptRegex.exec(html)) !== null) {
      scripts.push(match[1])
    }

    // Common vulnerable libraries with known versions
    const libraryPatterns = [
      {
        name: 'jQuery',
        pattern: /jquery[-.](\d+\.\d+\.\d+)/i,
        latest: '3.7.1',
        cves: ['CVE-2020-11023', 'CVE-2020-11022'],
        severity: 'medium'
      },
      {
        name: 'Bootstrap',
        pattern: /bootstrap(?:\.bundle)?[-.](\d+\.\d+\.\d+)/i,
        latest: '5.3.3',
        cves: [],
        severity: 'low'
      },
      {
        name: 'React',
        pattern: /react[-.](\d+\.\d+\.\d+)/i,
        latest: '18.3.1',
        cves: [],
        severity: 'low'
      },
      {
        name: 'Angular',
        pattern: /angular(?:\.min)?[-.](\d+\.\d+\.\d+)/i,
        latest: '17.3.4',
        cves: [],
        severity: 'low'
      },
      {
        name: 'Lodash',
        pattern: /lodash[-.](\d+\.\d+\.\d+)/i,
        latest: '4.17.21',
        cves: ['CVE-2021-23337'],
        severity: 'medium'
      }
    ]

    scripts.forEach(scriptSrc => {
      libraryPatterns.forEach(lib => {
        const match = lib.pattern.exec(scriptSrc)
        if (match) {
          const version = match[1]
          const isOutdated = version !== lib.latest
          
          dependencies.push({
            library: lib.name,
            version,
            latest: lib.latest,
            cves: lib.cves,
            severity: isOutdated ? lib.severity : 'info',
            recommendation: isOutdated ? `Upgrade ${lib.name} from ${version} to ${lib.latest}` : undefined
          })

          if (isOutdated) {
            findings.push({
              title: `Outdated ${lib.name} library detected`,
              severity: lib.severity,
              why: `Version ${version} of ${lib.name} is outdated. Latest version is ${lib.latest}.`,
              fix: `Upgrade to ${lib.latest} to receive security patches and bug fixes.`
            })
          }
        }
      })
    })

  } catch (error) {
    findings.push({
      title: 'Dependency analysis failed',
      severity: 'low',
      why: 'Unable to analyze JavaScript dependencies due to an error',
      fix: 'Manual review of JavaScript libraries recommended'
    })
  }

  return { dependencies, findings }
}

// Form Security Analysis
async function analyzeForms(url, onProgress) {
  onProgress && onProgress({ stage: 'forms', message: 'Analyzing form security...' })
  
  const forms = []
  const findings = []
  
  try {
    const response = await doRequest(url)
    if (!response || !response.body) {
      return { forms, findings }
    }

    const html = response.body
    
    // Extract forms
    const formRegex = /<form[^>]*>(.*?)<\/form>/gis
    let formMatch
    let formIndex = 0
    
    while ((formMatch = formRegex.exec(html)) !== null) {
      formIndex++
      const formHtml = formMatch[0]
      const formContent = formMatch[1]
      
      const form = {
        index: formIndex,
        hasCSRF: false,
        hasPassword: false,
        hasEmail: false,
        method: 'GET',
        action: '',
        issues: []
      }

      // Extract form attributes
      const methodMatch = formHtml.match(/method=["']([^"']+)["']/i)
      if (methodMatch) form.method = methodMatch[1].toUpperCase()

      const actionMatch = formHtml.match(/action=["']([^"']+)["']/i)
      if (actionMatch) form.action = actionMatch[1]

      // Check for CSRF protection
      if (formContent.includes('csrf') || formContent.includes('_token') || formContent.includes('authenticity_token')) {
        form.hasCSRF = true
      } else if (form.method === 'POST') {
        form.issues.push('Missing CSRF protection')
        findings.push({
          title: `Form ${formIndex} missing CSRF protection`,
          severity: 'medium',
          why: 'Forms without CSRF protection are vulnerable to cross-site request forgery attacks',
          fix: 'Implement CSRF tokens for all state-changing forms'
        })
      }

      // Check for password fields
      if (formContent.includes('type="password"')) {
        form.hasPassword = true
        if (!formHtml.includes('https://')) {
          form.issues.push('Password form not using HTTPS')
          findings.push({
            title: `Form ${formIndex} with password field not using HTTPS`,
            severity: 'high',
            why: 'Password forms should always use HTTPS to prevent credential interception',
            fix: 'Ensure all password forms are served over HTTPS'
          })
        }
      }

      // Check for email fields
      if (formContent.includes('type="email"')) {
        form.hasEmail = true
      }

      forms.push(form)
    }

  } catch (error) {
    findings.push({
      title: 'Form analysis failed',
      severity: 'low',
      why: 'Unable to analyze forms due to an error',
      fix: 'Manual review of forms recommended'
    })
  }

  return { forms, findings }
}

// Mixed Content Analysis
async function analyzeMixedContent(url, onProgress) {
  onProgress && onProgress({ stage: 'mixed-content', message: 'Checking for mixed content issues...' })
  
  const mixedContent = []
  const findings = []
  
  try {
    const response = await doRequest(url)
    if (!response || !response.body) {
      return { mixedContent, findings }
    }

    const html = response.body
    const isHTTPS = url.startsWith('https://')
    
    if (isHTTPS) {
      // Check for HTTP resources in HTTPS page
      const httpRegex = /(?:src|href)=["']http:\/\/([^"']+)["']/gi
      let match
      
      while ((match = httpRegex.exec(html)) !== null) {
        const resource = match[1]
        mixedContent.push({
          type: 'HTTP resource in HTTPS page',
          resource: `http://${resource}`,
          severity: 'medium'
        })
        
        findings.push({
          title: 'Mixed content detected',
          severity: 'medium',
          why: `HTTP resource loaded in HTTPS page: ${resource}`,
          fix: 'Update all resources to use HTTPS URLs'
        })
      }
    }

  } catch (error) {
    findings.push({
      title: 'Mixed content analysis failed',
      severity: 'low',
      why: 'Unable to analyze mixed content due to an error',
      fix: 'Manual review of resource URLs recommended'
    })
  }

  return { mixedContent, findings }
}

// Port Scanning (defensive)
async function performPortScan(url, onProgress) {
  onProgress && onProgress({ stage: 'port-scan', message: 'Performing defensive port scan...' })
  
  const portResults = []
  const findings = []
  
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname
    
    // Common ports to check (defensive scan only)
    const commonPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 993, 995, 3389, 5432, 3306, 6379]
    
    for (const port of commonPorts) {
      try {
        const result = await new Promise((resolve) => {
          const socket = new (urlObj.protocol === 'https:' ? require('tls') : require('net')).Socket()
          socket.setTimeout(3000)
          
          socket.on('connect', () => {
            socket.destroy()
            resolve({ port, status: 'open', service: getServiceName(port) })
          })
          
          socket.on('timeout', () => {
            socket.destroy()
            resolve({ port, status: 'filtered', service: getServiceName(port) })
          })
          
          socket.on('error', () => {
            socket.destroy()
            resolve({ port, status: 'closed', service: getServiceName(port) })
          })
          
          socket.connect(port, hostname)
        })
        
        portResults.push(result)
        
        // Check for potentially risky open ports
        if (result.status === 'open') {
          const riskyPorts = [21, 23, 25, 110, 143, 3389, 5432, 3306, 6379]
          if (riskyPorts.includes(port)) {
            findings.push({
              title: `Potentially risky port ${port} is open`,
              severity: 'medium',
              why: `Port ${port} (${result.service}) is open and may expose sensitive services`,
              fix: 'Review if this service needs to be publicly accessible and implement proper access controls'
            })
          }
        }
        
      } catch (error) {
        // Port scan failed for this port
      }
    }
    
  } catch (error) {
    findings.push({
      title: 'Port scan failed',
      severity: 'low',
      why: 'Unable to perform port scan due to an error',
      fix: 'Manual port scan recommended'
    })
  }
  
  return { portResults, findings }
}

function getServiceName(port) {
  const services = {
    21: 'FTP', 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS',
    80: 'HTTP', 110: 'POP3', 143: 'IMAP', 443: 'HTTPS', 993: 'IMAPS',
    995: 'POP3S', 3389: 'RDP', 5432: 'PostgreSQL', 3306: 'MySQL', 6379: 'Redis'
  }
  return services[port] || 'Unknown'
}

// Advanced Website Crawling with Full Page Discovery
async function crawlWebsite(url, options = {}) {
  const { onProgress = () => {}, maxPages = 50, maxDepth = 5, crawlDelay = 1000, credentials, mirrorBrowsing = false } = options
  onProgress && onProgress({ stage: 'crawl:start', message: 'Starting comprehensive website crawl...', target: url, maxPages, maxDepth })
  
  const pages = []
  const findings = []
  const visited = new Set()
  const queue = [{ url, depth: 0 }]
  const sitemapUrls = new Set()
  let browser = null
  let lastMirrorTs = 0
  let shellRef = null
  try { shellRef = require('electron').shell } catch {}
  
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    })
    
    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    
    // Set viewport for consistent rendering
    await page.setViewport({ width: 1920, height: 1080 })
    
    // Handle authentication if provided
    let authSuccess = false
    if (credentials && credentials.username && credentials.password) {
      onProgress && onProgress({ stage: 'auth', message: 'Starting authentication process...' })
      authSuccess = await handleAuthentication(page, url, credentials, onProgress)
      if (!authSuccess) {
        onProgress && onProgress({ stage: 'auth', message: 'Authentication failed, continuing with public pages only' })
      } else {
        onProgress && onProgress({ stage: 'auth', message: 'Authentication successful! Now crawling protected pages...' })
        // After successful auth, navigate back to main page to start crawling
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }
    
    // Live preview mirror (base64 screenshot every 3s)
    let mirrorInterval = null
    try {
      mirrorInterval = setInterval(async () => {
        try {
          const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false })
          onProgress && onProgress({ type: 'preview', image: `data:image/png;base64,${screenshot}`, timestamp: Date.now() })
        } catch {}
      }, 3000)
    } catch {}

    // First, try to discover sitemap
    await discoverSitemap(url, sitemapUrls, onProgress)
    
    // Add sitemap URLs to queue
    sitemapUrls.forEach(sitemapUrl => {
      if (!visited.has(sitemapUrl)) {
        queue.push({ url: sitemapUrl, depth: 0 })
      }
    })
    
    // Main crawling loop
    while (queue.length > 0 && pages.length < maxPages) {
      const { url: currentUrl, depth } = queue.shift()

      // Skip static assets defensively even if they slipped into the queue (e.g., via sitemap or scripts)
      try {
        const u = new URL(currentUrl)
        const pathnameLower = u.pathname.toLowerCase()
        if (/(\.css|\.js|\.mjs|\.map|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.bmp|\.webp|\.avif|\.woff|\.woff2|\.ttf|\.eot|\.pdf|\.zip|\.tar|\.gz|\.mp4|\.webm|\.mp3|\.avi|\.mov)$/.test(pathnameLower)) {
          continue
        }
      } catch {}
      
      if (visited.has(currentUrl) || depth > maxDepth) continue
      visited.add(currentUrl)
      
      onProgress && onProgress({ 
        stage: 'crawl:navigate', 
        message: `Crawling page ${pages.length + 1}/${maxPages}: ${currentUrl} (depth: ${depth}, queue: ${queue.length})`,
        currentUrl,
        depth,
        pagesScanned: pages.length,
        queueSize: queue.length,
        maxPages,
        maxDepth
      })
      if (mirrorBrowsing && shellRef) {
        const now = Date.now()
        if (now - lastMirrorTs > 2000) {
          try { shellRef.openExternal(currentUrl) } catch {}
          lastMirrorTs = now
        }
      }
      
      try {
        // Navigate to page with comprehensive wait conditions
        const response = await page.goto(currentUrl, { 
          waitUntil: ['networkidle0', 'domcontentloaded'],
          timeout: 30000 
        })
        
        const status = response.status()
        const finalUrl = page.url()
        
        // Wait for dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Handle infinite scroll and lazy loading
        await handleInfiniteScroll(page, onProgress)
        
        // Extract page information
        const pageInfo = await extractPageInfo(page, currentUrl, finalUrl, status)
        pages.push(pageInfo)

        // Emit an immediate preview for this page (ensures we show every navigated screen)
        try {
          const snap = await page.screenshot({ encoding: 'base64', fullPage: true })
          onProgress && onProgress({ type: 'preview', image: `data:image/png;base64,${snap}`, timestamp: Date.now(), pageUrl: finalUrl })
        } catch {}
        
        // Check for redirects
        if (currentUrl !== finalUrl) {
          findings.push({
            title: `Redirect detected: ${currentUrl} → ${finalUrl}`,
            severity: 'info',
            why: 'Page redirects to a different URL',
            fix: 'Verify redirect is intentional and properly configured'
          })
        }
        
        // Extract links for further crawling (only if page loaded successfully)
        if (status >= 200 && status < 400) {
          const newLinks = await extractInternalLinks(page, currentUrl)
          
          // Add new links to queue with proper deduplication
          newLinks.forEach(link => {
            // Normalize URL to avoid duplicates
            const normalizedLink = normalizeUrl(link)
            if (!visited.has(normalizedLink) && !queue.some(q => q.url === normalizedLink) && queue.length < maxPages * 3) {
              queue.push({ url: normalizedLink, depth: depth + 1 })
            }
          })
          
          onProgress && onProgress({ 
            stage: 'crawl:discover', 
            message: `Found ${newLinks.length} links, added ${newLinks.filter(link => !visited.has(normalizeUrl(link)) && !queue.some(q => q.url === normalizeUrl(link))).length} new URLs to queue (total: ${queue.length})`,
            currentUrl,
            discovered: newLinks.length,
            queueSize: queue.length,
            pagesScanned: pages.length
          })
        }
        
        // Check for client-side errors
        const errors = await page.evaluate(() => {
          return window.console.errors || []
        })
        
        if (errors.length > 0) {
          findings.push({
            title: `JavaScript errors detected on ${currentUrl}`,
            severity: 'low',
            why: `${errors.length} JavaScript error(s) found`,
            fix: 'Review and fix JavaScript errors to improve user experience'
          })
        }
        
        // Respect crawl delay
        if (crawlDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, crawlDelay))
        }
        
      } catch (error) {
        pages.push({
          url: currentUrl,
          finalUrl: currentUrl,
          status: 0,
          title: '',
          loadTime: Date.now(),
          error: error.message
        })
        
        findings.push({
          title: `Failed to crawl page: ${currentUrl}`,
          severity: 'low',
          why: `Error: ${error.message}`,
          fix: 'Check if the page is accessible and not blocking automated requests'
        })
      }
    }
    
    onProgress && onProgress({ 
      stage: 'crawl', 
      message: `Crawl completed. Discovered ${pages.length} pages.` 
    })
    
  } catch (error) {
    findings.push({
      title: 'Website crawl failed',
      severity: 'medium',
      why: 'Unable to crawl website with Puppeteer',
      fix: 'Check if the website is accessible and not blocking automated requests'
    })
  } finally {
    // stop preview mirror timer
    try { if (typeof mirrorInterval !== 'undefined' && mirrorInterval) clearInterval(mirrorInterval) } catch {}
    if (browser) {
      await browser.close()
    }
  }
  
  return { pages, findings, totalPages: pages.length }
}

// Handle authentication for protected sites
async function handleAuthentication(page, baseUrl, credentials, onProgress) {
  try {
    onProgress && onProgress({ stage: 'auth', message: 'Attempting authentication...' })
    
    // Try the main page first, then common login paths
    const loginPaths = [baseUrl, '/login', '/wp-login.php', '/admin/login', '/account/login', '/signin', '/user/login', '/auth/login']
    const baseUrlObj = new URL(baseUrl)
    
    for (const loginPath of loginPaths) {
      try {
        const loginUrl = new URL(loginPath, baseUrl).toString()
        onProgress && onProgress({ stage: 'auth', message: `Trying login path: ${loginUrl}` })
        
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 15000 })
        
        // Wait a bit for any dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Look for login form with more comprehensive selectors
        const loginForm = await page.$('form[action*="login"], form[action*="signin"], form[action*="auth"], form[method="post"], form')
        if (loginForm) {
          onProgress && onProgress({ stage: 'auth', message: 'Found login form, filling credentials...' })
          
          // Clear any existing values first
          await page.evaluate(() => {
            const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"]')
            inputs.forEach(input => input.value = '')
          })
          
          // Try different username field selectors
          const usernameSelectors = [
            'input[name="username"]',
            'input[name="email"]', 
            'input[name="user"]',
            'input[name="login"]',
            'input[name="user_login"]',
            'input[name="log"]',
            'input[type="email"]',
            'input[placeholder*="username" i]',
            'input[placeholder*="email" i]',
            'input[placeholder*="user" i]',
            'input[id*="username" i]',
            'input[id*="email" i]',
            'input[id*="user" i]',
            'input[id*="login" i]'
          ]
          
          let usernameField = null
          for (const selector of usernameSelectors) {
            usernameField = await page.$(selector)
            if (usernameField) {
              onProgress && onProgress({ stage: 'auth', message: `Found username field: ${selector}` })
              break
            }
          }
          
          if (usernameField) {
            await usernameField.click()
            await usernameField.type(credentials.username, { delay: 100 })
            onProgress && onProgress({ stage: 'auth', message: 'Username entered successfully' })
          } else {
            onProgress && onProgress({ stage: 'auth', message: 'No username field found' })
          }
          
          // Try different password field selectors
          const passwordSelectors = [
            'input[name="password"]',
            'input[name="pass"]',
            'input[name="pwd"]',
            'input[name="user_pass"]',
            'input[type="password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="pass" i]',
            'input[id*="password" i]',
            'input[id*="pass" i]'
          ]
          
          let passwordField = null
          for (const selector of passwordSelectors) {
            passwordField = await page.$(selector)
            if (passwordField) {
              onProgress && onProgress({ stage: 'auth', message: `Found password field: ${selector}` })
              break
            }
          }
          
          if (passwordField) {
            await passwordField.click()
            await passwordField.type(credentials.password, { delay: 100 })
            onProgress && onProgress({ stage: 'auth', message: 'Password entered successfully' })
          } else {
            onProgress && onProgress({ stage: 'auth', message: 'No password field found' })
          }
          
          // Wait a moment before submitting
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Try different submit button selectors
          const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:contains("Login")',
            'button:contains("Sign In")',
            'button:contains("Log In")',
            'button:contains("Submit")',
            'input[value*="Login" i]',
            'input[value*="Sign In" i]',
            'input[value*="Submit" i]',
            'button[id*="login" i]',
            'button[id*="submit" i]',
            'button[class*="login" i]',
            'button[class*="submit" i]'
          ]
          
          let submitButton = null
          for (const selector of submitSelectors) {
            submitButton = await page.$(selector)
            if (submitButton) {
              onProgress && onProgress({ stage: 'auth', message: `Found submit button: ${selector}` })
              break
            }
          }
          
          if (submitButton) {
            onProgress && onProgress({ stage: 'auth', message: 'Submitting login form...' })
            
            // Submit form and wait for navigation
            try {
              await Promise.all([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                submitButton.click()
              ])
              
              // Check if authentication was successful
              const currentUrl = page.url()
              const pageContent = await page.content()
              
              // Check for success indicators
              const successIndicators = [
                !currentUrl.includes('login'),
                !currentUrl.includes('signin'),
                !currentUrl.includes('error'),
                !pageContent.toLowerCase().includes('invalid'),
                !pageContent.toLowerCase().includes('incorrect'),
                !pageContent.toLowerCase().includes('failed'),
                pageContent.toLowerCase().includes('dashboard') || 
                pageContent.toLowerCase().includes('welcome') ||
                pageContent.toLowerCase().includes('logout') ||
                pageContent.toLowerCase().includes('profile')
              ]
              
              if (successIndicators.filter(Boolean).length >= 3) {
                onProgress && onProgress({ stage: 'auth', message: 'Authentication successful!' })
                return true
              } else {
                onProgress && onProgress({ stage: 'auth', message: `Authentication failed - still on login page or error detected. Current URL: ${currentUrl}` })
              }
            } catch (error) {
              onProgress && onProgress({ stage: 'auth', message: `Error submitting form: ${error.message}` })
            }
          } else {
            onProgress && onProgress({ stage: 'auth', message: 'No submit button found' })
          }
        } else {
          onProgress && onProgress({ stage: 'auth', message: `No login form found at ${loginUrl}` })
        }
      } catch (error) {
        onProgress && onProgress({ stage: 'auth', message: `Error trying ${loginPath}: ${error.message}` })
        // Continue to next login path
        continue
      }
    }
    
    onProgress && onProgress({ stage: 'auth', message: 'No login form found or authentication failed' })
    return false
  } catch (error) {
    onProgress && onProgress({ stage: 'auth', message: `Authentication error: ${error.message}` })
    return false
  }
}

// Discover sitemap URLs
async function discoverSitemap(baseUrl, sitemapUrls, onProgress) {
  try {
    onProgress && onProgress({ stage: 'sitemap', message: 'Discovering sitemap...' })
    
    const sitemapPaths = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemaps.xml',
      '/sitemap/sitemap.xml',
      '/robots.txt'
    ]
    
    for (const sitemapPath of sitemapPaths) {
      try {
        const sitemapUrl = new URL(sitemapPath, baseUrl).toString()
        const response = await doRequest(sitemapUrl)
        
        if (response && response.statusCode === 200) {
          if (sitemapPath === '/robots.txt') {
            // Extract sitemap URLs from robots.txt
            const robotsContent = response.body
            const sitemapMatches = robotsContent.match(/Sitemap:\s*(.+)/gi)
            if (sitemapMatches) {
              sitemapMatches.forEach(match => {
                const url = match.replace(/Sitemap:\s*/i, '').trim()
                sitemapUrls.add(url)
              })
            }
          } else {
            // Parse XML sitemap
            const urls = await parseSitemapXML(response.body)
            urls.forEach(url => sitemapUrls.add(url))
          }
        }
      } catch (error) {
        // Continue to next sitemap path
        continue
      }
    }
    
    onProgress && onProgress({ 
      stage: 'sitemap', 
      message: `Found ${sitemapUrls.size} URLs in sitemap` 
    })
  } catch (error) {
    onProgress && onProgress({ 
      stage: 'sitemap', 
      message: `Sitemap discovery failed: ${error.message}` 
    })
  }
}

// Parse XML sitemap
async function parseSitemapXML(xmlContent) {
  const urls = []
  try {
    // Simple XML parsing for sitemap
    const urlMatches = xmlContent.match(/<loc>(.*?)<\/loc>/g)
    if (urlMatches) {
      urlMatches.forEach(match => {
        const url = match.replace(/<\/?loc>/g, '').trim()
        if (url) urls.push(url)
      })
    }
  } catch (error) {
    // Fallback to regex if XML parsing fails
    const urlRegex = /https?:\/\/[^\s<>"]+/g
    const matches = xmlContent.match(urlRegex)
    if (matches) {
      urls.push(...matches)
    }
  }
  return urls
}

// Handle infinite scroll and lazy loading
async function handleInfiniteScroll(page, onProgress) {
  try {
    let previousHeight = 0
    let currentHeight = await page.evaluate('document.body.scrollHeight')
    let scrollAttempts = 0
    const maxScrollAttempts = 10
    
    while (currentHeight > previousHeight && scrollAttempts < maxScrollAttempts) {
      previousHeight = currentHeight
      
      // Scroll to bottom
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
      
      // Wait for content to load
      await page.waitForTimeout(2000)
      
      // Check for new content
      currentHeight = await page.evaluate('document.body.scrollHeight')
      scrollAttempts++
      
      if (currentHeight > previousHeight) {
        onProgress && onProgress({ 
          stage: 'scroll', 
          message: `Loading more content... (attempt ${scrollAttempts})` 
        })
      }
    }
    
    // Scroll back to top
    await page.evaluate('window.scrollTo(0, 0)')
    await page.waitForTimeout(1000)
    
  } catch (error) {
    // Continue if scroll handling fails
  }
}

// Extract comprehensive page information
async function extractPageInfo(page, originalUrl, finalUrl, status) {
  try {
    const title = await page.title().catch(() => '')
    const metaDescription = await page.$eval('meta[name="description"]', el => el.content).catch(() => '')
    const canonical = await page.$eval('link[rel="canonical"]', el => el.href).catch(() => '')
    const robots = await page.$eval('meta[name="robots"]', el => el.content).catch(() => '')
    
    // Get page load time
    const loadTime = await page.evaluate(() => {
      return performance.timing.loadEventEnd - performance.timing.navigationStart
    }).catch(() => 0)
    
    // Check for common frameworks
    const framework = await page.evaluate(() => {
      if (window.React) return 'React'
      if (window.angular) return 'Angular'
      if (window.Vue) return 'Vue'
      if (window.next) return 'Next.js'
      if (window.__NUXT__) return 'Nuxt.js'
      if (document.querySelector('[data-reactroot]')) return 'React (SSR)'
      if (document.querySelector('[ng-app]')) return 'Angular (Legacy)'
      return 'Unknown'
    }).catch(() => 'Unknown')
    
    return {
      url: originalUrl,
      finalUrl,
      status,
      title,
      metaDescription,
      canonical,
      robots,
      loadTime,
      framework,
      timestamp: new Date().toISOString()
    }
  } catch (error) {
    return {
      url: originalUrl,
      finalUrl,
      status,
      title: '',
      metaDescription: '',
      canonical: '',
      robots: '',
      loadTime: 0,
      framework: 'Unknown',
      timestamp: new Date().toISOString(),
      error: error.message
    }
  }
}

// Normalize URL for consistent comparison
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url)
    // Remove fragments, normalize path, and ensure consistent format
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`
  } catch (error) {
    return url
  }
}

// Extract internal links with advanced detection
async function extractInternalLinks(page, baseUrl) {
  try {
    const baseUrlObj = new URL(baseUrl)
    const links = new Set()
    
    // Get all links from the page with more comprehensive selectors
    const pageLinks = await page.evaluate(() => {
      const links = []
      
      // Standard anchor tags
      const anchors = Array.from(document.querySelectorAll('a[href]'))
      anchors.forEach(a => {
        if (a.href) links.push(a.href)
      })
      
      // Form actions
      const forms = Array.from(document.querySelectorAll('form[action]'))
      forms.forEach(form => {
        if (form.action) links.push(form.action)
      })
      
      // Image sources that might be pages
      const images = Array.from(document.querySelectorAll('img[src]'))
      images.forEach(img => {
        if (img.src && img.src.includes('/')) links.push(img.src)
      })
      
      // Link tags (CSS, etc.)
      const linkTags = Array.from(document.querySelectorAll('link[href]'))
      linkTags.forEach(link => {
        if (link.href) links.push(link.href)
      })
      
      // Script sources
      const scripts = Array.from(document.querySelectorAll('script[src]'))
      scripts.forEach(script => {
        if (script.src) links.push(script.src)
      })
      
      return links
    })
    
    // Get dynamically generated links (for SPAs)
    const dynamicLinks = await page.evaluate(() => {
      const links = []
      
      // Check for React Router links
      const reactLinks = document.querySelectorAll('[data-react-router], [href*="#/"], [to]')
      reactLinks.forEach(link => {
        if (link.href || link.getAttribute('to')) {
          links.push(link.href || link.getAttribute('to'))
        }
      })
      
      // Check for Angular Router links
      const angularLinks = document.querySelectorAll('[ng-href], [ui-sref], [routerLink]')
      angularLinks.forEach(link => {
        if (link.href || link.getAttribute('ng-href') || link.getAttribute('ui-sref')) {
          links.push(link.href || link.getAttribute('ng-href') || link.getAttribute('ui-sref'))
        }
      })
      
      // Check for Vue Router links
      const vueLinks = document.querySelectorAll('[v-link], [to]')
      vueLinks.forEach(link => {
        if (link.href || link.getAttribute('to')) {
          links.push(link.href || link.getAttribute('to'))
        }
      })
      
      // Check for any elements with onclick handlers that might navigate
      const clickElements = Array.from(document.querySelectorAll('[onclick*="location"], [onclick*="window.open"], [onclick*="href"]'))
      clickElements.forEach(element => {
        const onclick = element.getAttribute('onclick')
        if (onclick) {
          // Extract URLs from onclick handlers (basic regex)
          const urlMatches = onclick.match(/['"]([^'"]*\/[^'"]*)['"]/g)
          if (urlMatches) {
            urlMatches.forEach(match => {
              const url = match.replace(/['"]/g, '')
              if (url.startsWith('/') || url.startsWith('http')) {
                links.push(url)
              }
            })
          }
        }
      })

      // Try to read SPA route registrations from script tags (very heuristic)
      const scripts = Array.from(document.scripts)
      scripts.forEach(s => {
        const txt = s.textContent || ''
        // react-router like: <Route path="/something"
        const routeMatches = txt.match(/path\s*[:=]\s*['\"][^'\"]+['\"]/g)
        if (routeMatches) {
          routeMatches.forEach(m => {
            const p = (m.split(/['\"]/)[1] || '').trim()
            if (p && p.startsWith('/')) links.push(p)
          })
        }
      })
      
      return links
    })
    
    // Combine all links
    const allLinks = [...pageLinks, ...dynamicLinks]
    
    // Filter and normalize links
    allLinks.forEach(link => {
      try {
        if (!link || typeof link !== 'string') return
        
        // Handle relative URLs
        let url
        if (link.startsWith('http://') || link.startsWith('https://')) {
          url = new URL(link)
        } else if (link.startsWith('/')) {
          url = new URL(link, baseUrl)
        } else if (link.startsWith('#')) {
          // Skip fragment-only links
          return
        } else {
          url = new URL(link, baseUrl)
        }
        
        // Only include same-domain links and exclude static assets
        if (url.origin === baseUrlObj.origin) {
          // Skip static assets
          const pathname = url.pathname.toLowerCase()
          if (pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|pdf|zip|mp4|mp3|avi|mov)$/)) {
            return
          }
          
          // Normalize the URL
          const normalizedUrl = normalizeUrl(url.toString())
          // Avoid asset-like paths here too
          const pathLower = url.pathname.toLowerCase()
          if (!/(\.css|\.js|\.mjs|\.map|\.png|\.jpg|\.jpeg|\.gif|\.svg|\.ico|\.bmp|\.webp|\.avif|\.woff|\.woff2|\.ttf|\.eot|\.pdf|\.zip|\.tar|\.gz|\.mp4|\.webm|\.mp3|\.avi|\.mov)$/.test(pathLower)) {
            links.add(normalizedUrl)
          }
        }
      } catch (error) {
        // Skip invalid URLs
      }
    })
    
    return Array.from(links)
  } catch (error) {
    return []
  }
}

// Generate comprehensive report with per-page analysis
function generateComprehensiveReportHTML(data) {
  const sev = data.summary.severityCount
  const totalFindings = data.summary.totalFindings
  const totalPages = data.summary.totalPages || 0
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Security Analysis Report - ${data.target}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            line-height: 1.6; 
            color: #333; 
            background: #f8fafc;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header { 
            background: linear-gradient(135deg, #f97316, #ea580c); 
            color: white; 
            padding: 40px; 
            border-radius: 12px; 
            margin-bottom: 30px;
            text-align: center;
        }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.9; }
        .summary { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 20px; 
            margin-bottom: 30px; 
        }
        .summary-card { 
            background: white; 
            padding: 25px; 
            border-radius: 12px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            text-align: center;
            border-left: 4px solid #f97316;
        }
        .summary-card h3 { color: #f97316; margin-bottom: 10px; }
        .summary-card .number { font-size: 2rem; font-weight: bold; color: #1f2937; }
        .section { 
            background: white; 
            margin-bottom: 30px; 
            border-radius: 12px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
            overflow: hidden;
        }
        .section-header { 
            background: #f97316; 
            color: white; 
            padding: 20px; 
            font-size: 1.3rem; 
            font-weight: 600;
        }
        .section-content { padding: 25px; }
        .finding { 
            border: 1px solid #e5e7eb; 
            border-radius: 8px; 
            padding: 20px; 
            margin-bottom: 15px; 
            background: #f9fafb;
        }
        .finding-header { 
            display: flex; 
            justify-content: between; 
            align-items: center; 
            margin-bottom: 10px; 
        }
        .finding-title { font-weight: 600; color: #1f2937; }
        .severity { 
            padding: 4px 12px; 
            border-radius: 20px; 
            font-size: 0.8rem; 
            font-weight: 600; 
            text-transform: uppercase;
        }
        .severity.high { background: #fee2e2; color: #991b1b; }
        .severity.medium { background: #fef3c7; color: #92400e; }
        .severity.low { background: #fef9c3; color: #854d0e; }
        .severity.info { background: #dbeafe; color: #1e40af; }
        .finding-details { color: #6b7280; }
        .finding-details p { margin-bottom: 8px; }
        .finding-details strong { color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #e5e7eb; 
        }
        th { background: #f9fafb; font-weight: 600; color: #374151; }
        .footer { 
            text-align: center; 
            padding: 30px; 
            color: #6b7280; 
            border-top: 1px solid #e5e7eb; 
            margin-top: 40px;
        }
        .timestamp { color: #9ca3af; font-size: 0.9rem; }
        .page-analysis { 
            border: 1px solid #e5e7eb; 
            border-radius: 8px; 
            padding: 20px; 
            margin-bottom: 20px; 
            background: #f9fafb;
        }
        .page-analysis h4 { 
            margin-bottom: 15px; 
            color: #1f2937; 
            border-bottom: 1px solid #e5e7eb; 
            padding-bottom: 10px;
        }
        .page-analysis h4 a { 
            color: #f97316; 
            text-decoration: none; 
        }
        .page-analysis h4 a:hover { 
            text-decoration: underline; 
        }
        .page-info { 
            background: white; 
            padding: 15px; 
            border-radius: 6px; 
            margin-bottom: 15px; 
            border-left: 4px solid #f97316;
        }
        .page-info p { 
            margin-bottom: 8px; 
            color: #374151; 
        }
        .page-findings { 
            margin-top: 15px; 
        }
        .page-findings h5 { 
            color: #1f2937; 
            margin-bottom: 10px; 
        }
        .no-issues { 
            color: #10b981; 
            font-style: italic; 
            padding: 10px; 
            background: #ecfdf5; 
            border-radius: 6px; 
            border-left: 4px solid #10b981;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Security Analysis Report</h1>
            <p>Defensive security assessment for ${data.target}</p>
            <div class="timestamp">Generated on ${new Date(data.timestamp).toLocaleString()}</div>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>Pages Scanned</h3>
                <div class="number">${totalPages}</div>
            </div>
            <div class="summary-card">
                <h3>Total Findings</h3>
                <div class="number">${totalFindings}</div>
            </div>
            <div class="summary-card">
                <h3>High Severity</h3>
                <div class="number">${sev.high}</div>
            </div>
            <div class="summary-card">
                <h3>Medium Severity</h3>
                <div class="number">${sev.medium}</div>
            </div>
            <div class="summary-card">
                <h3>Low Severity</h3>
                <div class="number">${sev.low}</div>
            </div>
        </div>

        ${data.results.findings.length > 0 ? `
        <div class="section">
            <div class="section-header">Security Findings</div>
            <div class="section-content">
                ${data.results.findings.map(finding => `
                    <div class="finding">
                        <div class="finding-header">
                            <div class="finding-title">${finding.title}</div>
                            <div class="severity ${finding.severity}">${finding.severity}</div>
                        </div>
                        <div class="finding-details">
                            <p><strong>Issue:</strong> ${finding.why}</p>
                            <p><strong>Recommendation:</strong> ${finding.fix}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${data.results.headers.length > 0 ? `
        <div class="section">
            <div class="section-header">Security Headers Analysis</div>
            <div class="section-content">
                <table>
                    <thead>
                        <tr>
                            <th>Header</th>
                            <th>Status</th>
                            <th>Severity</th>
                            <th>Recommendation</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.results.headers.map(header => `
                            <tr>
                                <td><code>${header.name}</code></td>
                                <td>${header.status}</td>
                                <td><span class="severity ${header.severity}">${header.severity}</span></td>
                                <td>${header.recommendation || 'N/A'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        ${data.results.ssl ? `
        <div class="section">
            <div class="section-header">SSL/TLS Configuration</div>
            <div class="section-content">
                <div class="finding">
                    <div class="finding-details">
                        <p><strong>Valid Certificate:</strong> ${data.results.ssl.valid ? 'Yes' : 'No'}</p>
                        <p><strong>Issuer:</strong> ${data.results.ssl.issuer}</p>
                        <p><strong>Protocols:</strong> ${data.results.ssl.protocols.join(', ')}</p>
                        <p><strong>Expiry:</strong> ${data.results.ssl.expiryDays !== null ? data.results.ssl.expiryDays + ' days' : 'Unknown'}</p>
                        ${data.results.ssl.recommendations.length > 0 ? `
                            <p><strong>Recommendations:</strong></p>
                            <ul>
                                ${data.results.ssl.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                            </ul>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
        ` : ''}

        ${data.results.dependencies.length > 0 ? `
        <div class="section">
            <div class="section-header">JavaScript Dependencies</div>
            <div class="section-content">
                <table>
                    <thead>
                        <tr>
                            <th>Library</th>
                            <th>Current Version</th>
                            <th>Latest Version</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.results.dependencies.map(dep => `
                            <tr>
                                <td>${dep.library}</td>
                                <td>${dep.version}</td>
                                <td>${dep.latest}</td>
                                <td><span class="severity ${dep.severity}">${dep.severity}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        ${data.results.pageAnalyses && data.results.pageAnalyses.length > 0 ? `
        <div class="section">
            <div class="section-header">Per-Page Analysis Results</div>
            <div class="section-content">
                ${data.results.pageAnalyses.map(pageAnalysis => `
                    <div class="page-analysis">
                        <h4><a href="${pageAnalysis.pageUrl}" target="_blank">${pageAnalysis.pageUrl}</a></h4>
                        <div class="page-info">
                            <p><strong>Title:</strong> ${pageAnalysis.pageInfo.title || 'N/A'}</p>
                            <p><strong>Framework:</strong> ${pageAnalysis.pageInfo.framework || 'Unknown'}</p>
                            <p><strong>Load Time:</strong> ${pageAnalysis.pageInfo.loadTime || 0}ms</p>
                            <p><strong>Status:</strong> ${pageAnalysis.pageInfo.status || 'Unknown'}</p>
                            ${pageAnalysis.pageInfo.metaDescription ? `<p><strong>Meta Description:</strong> ${pageAnalysis.pageInfo.metaDescription}</p>` : ''}
                            ${pageAnalysis.pageInfo.canonical ? `<p><strong>Canonical:</strong> ${pageAnalysis.pageInfo.canonical}</p>` : ''}
                            ${pageAnalysis.pageInfo.robots ? `<p><strong>Robots:</strong> ${pageAnalysis.pageInfo.robots}</p>` : ''}
                        </div>
                        ${pageAnalysis.findings.length > 0 ? `
                            <div class="page-findings">
                                <h5>Issues Found (${pageAnalysis.findings.length}):</h5>
                                ${pageAnalysis.findings.map(finding => `
                                    <div class="finding">
                                        <div class="finding-header">
                                            <div class="finding-title">${finding.title}</div>
                                            <div class="severity ${finding.severity}">${finding.severity}</div>
                                        </div>
                                        <div class="finding-details">
                                            <p><strong>Issue:</strong> ${finding.why}</p>
                                            <p><strong>Recommendation:</strong> ${finding.fix}</p>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="no-issues">No security issues found on this page.</p>'}
                    </div>
                `).join('')}
            </div>
        </div>
        ` : ''}

        ${data.results.crawl.pages.length > 0 ? `
        <div class="section">
            <div class="section-header">Website Crawl Results</div>
            <div class="section-content">
                <p><strong>Pages Crawled:</strong> ${data.results.crawl.pages.length}</p>
                <table>
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>Status</th>
                            <th>Title</th>
                            <th>Framework</th>
                            <th>Load Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.results.crawl.pages.map(page => `
                            <tr>
                                <td><a href="${page.url}" target="_blank">${page.url}</a></td>
                                <td>${page.status}</td>
                                <td>${page.title || 'N/A'}</td>
                                <td>${page.framework || 'Unknown'}</td>
                                <td>${page.loadTime || 0}ms</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}

        <div class="footer">
            <p><strong>Disclaimer:</strong> ${data.report.responsibleDisclosure}</p>
            <p>${data.report.footer}</p>
            <p class="timestamp">Analysis completed in ${data.meta.durationSeconds} seconds</p>
        </div>
    </div>
</body>
</html>`
}

// Generate PDF using Puppeteer
async function generatePDF(html, outputPath) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      }
    })
    
    await browser.close()
    return true
  } catch (error) {
    console.error('PDF generation failed:', error)
    return false
  }
}

// Per-page security analysis
async function analyzePageSecurity(pageUrl, pageInfo, onProgress) {
  const pageFindings = []
  
  try {
    onProgress && onProgress({ 
      stage: 'page-analysis', 
      message: `Analyzing security for: ${pageUrl}` 
    })
    
    // Analyze security headers for this specific page
    const headersResult = await analyzeSecurityHeaders(pageUrl, onProgress)
    pageFindings.push(...headersResult.findings)
    
    // Analyze forms on this page
    const formsResult = await analyzeForms(pageUrl, onProgress)
    pageFindings.push(...formsResult.findings)
    
    // Analyze mixed content for this page
    const mixedContentResult = await analyzeMixedContent(pageUrl, onProgress)
    pageFindings.push(...mixedContentResult.findings)
    
    // Analyze dependencies for this page
    const dependenciesResult = await analyzeDependencies(pageUrl, onProgress)
    pageFindings.push(...dependenciesResult.findings)
    
    // Check for missing metadata
    if (!pageInfo.metaDescription) {
      pageFindings.push({
        title: 'Missing meta description',
        severity: 'low',
        why: 'Meta description is missing, which affects SEO and social media sharing',
        fix: 'Add a descriptive meta description tag to improve SEO and social media previews'
      })
    }
    
    if (!pageInfo.canonical) {
      pageFindings.push({
        title: 'Missing canonical URL',
        severity: 'low',
        why: 'Canonical URL is missing, which can cause duplicate content issues',
        fix: 'Add a canonical link tag to specify the preferred URL for this page'
      })
    }
    
    if (!pageInfo.robots) {
      pageFindings.push({
        title: 'Missing robots meta tag',
        severity: 'info',
        why: 'Robots meta tag is missing, search engines may not know how to crawl this page',
        fix: 'Add robots meta tag to control how search engines crawl and index this page'
      })
    }
    
    // Check for performance issues
    if (pageInfo.loadTime > 5000) {
      pageFindings.push({
        title: 'Slow page load time',
        severity: 'medium',
        why: `Page load time is ${pageInfo.loadTime}ms, which is above recommended 3 seconds`,
        fix: 'Optimize images, minify CSS/JS, enable compression, and use a CDN to improve load times'
      })
    }
    
    return {
      pageUrl,
      pageInfo,
      findings: pageFindings,
      totalFindings: pageFindings.length
    }
    
  } catch (error) {
    pageFindings.push({
      title: `Page analysis failed for ${pageUrl}`,
      severity: 'low',
      why: `Error: ${error.message}`,
      fix: 'Check if the page is accessible and not blocking automated requests'
    })
    
    return {
      pageUrl,
      pageInfo,
      findings: pageFindings,
      totalFindings: pageFindings.length
    }
  }
}

// Main security analysis function with comprehensive crawling
async function runSecurityAnalysis(url, options = {}) {
  const startTime = Date.now()
  const safeUrl = sanitizeUrl(url)
  const data = initReportData(safeUrl)
  const onProgress = options.onProgress || (() => {})
  
  onProgress({ stage: 'start', message: 'Initializing comprehensive security analysis...' })
  
  try {
    // First, perform initial analysis on the main page
    onProgress({ stage: 'initial', message: 'Performing initial security analysis...' })
    
    const [headersResult, sslResult, dependenciesResult, formsResult, mixedContentResult, portScanResult] = await Promise.all([
      options.includeHeaders !== false ? analyzeSecurityHeaders(safeUrl, onProgress) : { headers: [], findings: [] },
      options.includeSSL !== false ? analyzeSSL(safeUrl, onProgress) : {},
      options.includeDependencies !== false ? analyzeDependencies(safeUrl, onProgress) : { dependencies: [], findings: [] },
      options.includeForms !== false ? analyzeForms(safeUrl, onProgress) : { forms: [], findings: [] },
      options.includeMixedContent !== false ? analyzeMixedContent(safeUrl, onProgress) : { mixedContent: [], findings: [] },
      options.includePortScan ? performPortScan(safeUrl, onProgress) : { portResults: [], findings: [] }
    ])
    
    // Store initial results
    data.results.headers = headersResult.headers || []
    data.results.ssl = sslResult || {}
    data.results.dependencies = dependenciesResult.dependencies || []
    data.results.forms = formsResult.forms || []
    data.results.mixedContent = mixedContentResult.mixedContent || []
    data.results.portScan = portScanResult.portResults || []
    
    // Now perform comprehensive crawling
    onProgress({ stage: 'crawl', message: 'Starting comprehensive website crawl...' })
    
    const crawlOptions = {
      onProgress,
      maxPages: options.maxPages || 50,
      maxDepth: options.maxDepth || 5,
      crawlDelay: options.crawlDelay || 1000,
      credentials: options.credentials
    }
    
    const crawlResult = await crawlWebsite(safeUrl, crawlOptions)
    data.results.crawl = crawlResult || { pages: [], totalPages: 0 }
    
    // Perform per-page analysis
    onProgress({ stage: 'page-analysis', message: 'Analyzing security for each discovered page...' })
    
    const pageAnalyses = []
    const allPageFindings = []
    
    for (let i = 0; i < crawlResult.pages.length; i++) {
      const page = crawlResult.pages[i]
      
      onProgress({ 
        stage: 'page-analysis', 
        message: `Analyzing page ${i + 1}/${crawlResult.pages.length}: ${page.url}` 
      })
      
      const pageAnalysis = await analyzePageSecurity(page.url, page, onProgress)
      pageAnalyses.push(pageAnalysis)
      allPageFindings.push(...pageAnalysis.findings)
    }
    
    data.results.pageAnalyses = pageAnalyses
    
    // Collect all findings from initial analysis and per-page analysis
    const allFindings = [
      ...(headersResult.findings || []),
      ...(dependenciesResult.findings || []),
      ...(formsResult.findings || []),
      ...(mixedContentResult.findings || []),
      ...(portScanResult.findings || []),
      ...(crawlResult.findings || []),
      ...allPageFindings
    ]
    
    data.results.findings = allFindings
    
    // Calculate severity counts
    const severityCount = { info: 0, low: 0, medium: 0, high: 0 }
    allFindings.forEach(finding => {
      severityCount[finding.severity] = (severityCount[finding.severity] || 0) + 1
    })
    
    data.summary.severityCount = severityCount
    data.summary.totalFindings = allFindings.length
    data.summary.totalPages = crawlResult.pages.length
    data.summary.overallRisk = severityCount.high > 0 ? 'High' : severityCount.medium > 0 ? 'Medium' : 'Low'
    
    // Also set the summary at the top level for frontend compatibility
    data.reportData = {
      ...data.reportData,
      summary: data.summary,
      target: url,
      timestamp: new Date().toISOString()
    }
    
    // Generate comprehensive reports
    onProgress({ stage: 'report', message: 'Generating comprehensive security analysis report...' })
    
    const htmlReport = generateComprehensiveReportHTML(data)
    const timestamp = Date.now()
    const outputDir = options.outputDir || path.join(process.cwd(), 'temp-scans', `security-analysis-${timestamp}`)
    
    // Ensure output directory exists
    await fs.promises.mkdir(outputDir, { recursive: true })
    
    const htmlPath = path.join(outputDir, 'security-analysis.html')
    const pdfPath = path.join(outputDir, 'security-analysis.pdf')
    
    await fs.promises.writeFile(htmlPath, htmlReport)
    
    // Generate PDF
    const pdfGenerated = await generatePDF(htmlReport, pdfPath)
    
    data.meta.durationSeconds = Math.round((Date.now() - startTime) / 1000)
    
    onProgress({ stage: 'complete', message: `Security analysis completed! Scanned ${crawlResult.pages.length} pages and found ${allFindings.length} issues.` })
    
    // Log the pages that were discovered
    onProgress({ stage: 'complete', message: `Pages discovered: ${crawlResult.pages.map(p => p.url).join(', ')}` })
    
    return {
      reportData: data,
      htmlReport: htmlPath,
      pdfReport: pdfGenerated ? pdfPath : null
    }
    
  } catch (error) {
    onProgress({ stage: 'error', message: `Analysis failed: ${error.message}` })
    throw error
  }
}

module.exports = { runSecurityAnalysis }
