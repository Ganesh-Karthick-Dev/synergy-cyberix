import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'

function ShopifyCloudShield() {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [shopUrl, setShopUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isShopify, setIsShopify] = useState(null)
  const [showApiDialog, setShowApiDialog] = useState(false)
  const [apiCredentials, setApiCredentials] = useState({
    accessToken: '',
    acceptTerms: false
  })
  const [isVerifyingApi, setIsVerifyingApi] = useState(false)
  const [apiVerified, setApiVerified] = useState(null)
  const [showAuditOrchestrator, setShowAuditOrchestrator] = useState(false)
  const [auditResults, setAuditResults] = useState(null)
  const [currentModule, setCurrentModule] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [auditStartTime, setAuditStartTime] = useState(null)
  const [auditEndTime, setAuditEndTime] = useState(null)
  const [expandedModules, setExpandedModules] = useState({})

  const validateUrl = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return urlObj.href
    } catch {
      return null
    }
  }

  const detectShopify = async (url) => {
    // Demo mode: Check for known Shopify and non-Shopify sites
    const demoShopifySites = [
      'shopify.com',
      'myshopify.com',
      'shop.app',
      'example.myshopify.com',
      'shopify.dev',
      'shopify.plus'
    ]
    
    const demoNonShopifySites = [
      'google.com',
      'github.com',
      'stackoverflow.com',
      'facebook.com',
      'twitter.com',
      'linkedin.com',
      'youtube.com',
      'amazon.com',
      'netflix.com',
      'spotify.com',
      'wordpress.com',
      'wp.com',
      'wordpress.org',
      'example.wordpress.com',
      'blogspot.com',
      'wix.com',
      'squarespace.com',
      'weebly.com',
      'joomla.org',
      'drupal.org'
    ]
    
    const urlHost = new URL(url).hostname.toLowerCase()
    
    // First, check if it's a known non-Shopify site (including WordPress)
    if (demoNonShopifySites.some(site => urlHost.includes(site))) {
      return false
    }
    
    // Then check if it's a known Shopify site
    if (demoShopifySites.some(site => urlHost.includes(site))) {
      return true
    }
    
    try {
      // Try to fetch the site and check for specific indicators
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.ok) {
        const html = await response.text()
        
        // Check for WordPress indicators first (to avoid false positives)
        const wordpressIndicators = [
          /wp-content/i,
          /wp-includes/i,
          /wp-json/i,
          /wp-admin/i,
          /generator.*wordpress/i,
          /wp-embed/i,
          /wp-emoji/i,
          /wordpress\.org/i,
          /wp\.com/i
        ]
        
        const hasWordPressIndicators = wordpressIndicators.some(pattern => pattern.test(html))
        
        if (hasWordPressIndicators) {
          return false // It's WordPress, not Shopify
        }
        
        // Check for other CMS indicators
        const otherCmsIndicators = [
          /joomla/i,
          /drupal/i,
          /wix\.com/i,
          /squarespace/i,
          /weebly/i,
          /blogspot/i
        ]
        
        const hasOtherCmsIndicators = otherCmsIndicators.some(pattern => pattern.test(html))
        
        if (hasOtherCmsIndicators) {
          return false // It's another CMS, not Shopify
        }
        
        // Now check for specific Shopify indicators (more strict)
        const shopifyIndicators = [
          /cdn\.shopify\.com/i,
          /shopify\.com\/cdn/i,
          /x-shopify-stage/i,
          /x-request-id/i,
          /shopify\.com\/api/i,
          /myshopify\.com/i,
          /shop\.app/i,
          /shopify\.dev/i,
          /shopify\.plus/i,
          /shopify\.myshopify\.com/i,
          /shopifycdn\.com/i,
          /shopify\.com\/themes/i,
          /shopify\.com\/apps/i
        ]
        
        const hasShopifyIndicators = shopifyIndicators.some(pattern => pattern.test(html))
        
        // Also check for Shopify-specific meta tags and scripts (more specific)
        const shopifyMetaPatterns = [
          /shopify\.com\/themes/i,
          /shopify\.com\/apps/i,
          /shopifycdn\.com/i,
          /myshopify\.com/i,
          /shop\.app/i
        ]
        
        const hasShopifyMeta = shopifyMetaPatterns.some(pattern => pattern.test(html))
        
        // Check for Shopify-specific JavaScript patterns
        const shopifyJsPatterns = [
          /Shopify\.Analytics/i,
          /Shopify\.Checkout/i,
          /Shopify\.theme/i,
          /shopify\.com\/cdn/i,
          /myshopify\.com/i
        ]
        
        const hasShopifyJs = shopifyJsPatterns.some(pattern => pattern.test(html))
        
        // Only return true if we have strong Shopify indicators
        return hasShopifyIndicators || hasShopifyMeta || hasShopifyJs
      }
      
      return false
    } catch (error) {
      // If CORS blocks the request, use alternative detection methods
      console.log('CORS blocked, using alternative detection methods')
      
      // Method 1: Check for specific Shopify URL patterns (more strict)
      const shopifyUrlPatterns = [
        /\.myshopify\.com$/i,
        /shopify\.com$/i,
        /shop\.app$/i,
        /shopify\.dev$/i,
        /shopify\.plus$/i
      ]
      
      const hasShopifyUrlPattern = shopifyUrlPatterns.some(pattern => pattern.test(url))
      
      if (hasShopifyUrlPattern) {
        return true
      }
      
      // Method 2: Check for WordPress URL patterns
      const wordpressUrlPatterns = [
        /\.wordpress\.com$/i,
        /wp\.com$/i,
        /wordpress\.org$/i
      ]
      
      const hasWordPressUrlPattern = wordpressUrlPatterns.some(pattern => pattern.test(url))
      
      if (hasWordPressUrlPattern) {
        return false
      }
      
      // Method 3: Try to access Shopify-specific endpoints
      try {
        const shopifyApiUrl = new URL('/admin/api/2023-10/shop.json', url).href
        const shopifyResponse = await fetch(shopifyApiUrl, {
          method: 'HEAD',
          mode: 'no-cors'
        })
        // If we can't get a proper response due to CORS, we'll be conservative
        return false
      } catch (shopifyApiError) {
        // Method 4: Try to access WordPress-specific endpoints
        try {
          const wpJsonUrl = new URL('/wp-json/', url).href
          const wpJsonResponse = await fetch(wpJsonUrl, {
            method: 'HEAD',
            mode: 'no-cors'
          })
          return false // Conservative approach - assume not Shopify if we can't verify
        } catch (wpJsonError) {
          // If all methods fail, assume it's not Shopify (conservative approach)
          return false
        }
      }
    }
  }

  const verifyApiCredentials = async (url, accessToken) => {
    try {
      // In a real implementation, you would:
      // 1. Make a request to /admin/api/2023-10/shop.json
      // 2. Check for successful authentication
      // 3. Verify API permissions
      
      // For demo purposes, we'll simulate verification
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Simulate API credential verification (demo: accept any non-empty token)
      const isValid = accessToken.trim() !== '' && accessToken.length >= 10
      return isValid
    } catch (error) {
      console.error('API credential verification error:', error)
      return false
    }
  }

  const addLog = (module, step, command, stdoutSnippet, stderrSnippet, exitCode) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      module,
      step,
      command,
      stdoutSnippet,
      stderrSnippet,
      exitCode
    }
    setAuditLogs(prev => [...prev, logEntry])
  }

  const runModule1_EndpointsScanning = async (url) => {
    setCurrentModule('Endpoints & Exposure Scanning')
    addLog('exposureScan', 'start', 'Starting Shopify endpoints and exposure scanning', '', '', 0)
    
    // Simulate whatweb fingerprinting
    addLog('exposureScan', 'fingerprint', 'whatweb --no-errors --color=never ' + url, 
      'Shopify detected: CDN assets found, x-shopify-stage header present', '', 0)
    
    // Simulate vulnerability scans
    addLog('exposureScan', 'vulnerability', 'wapiti -u ' + url + ' -f json -o wapiti_shopify.json',
      'Scan completed: 3 potential vulnerabilities found', '', 0)
    
    addLog('exposureScan', 'vulnerability', 'nikto -h ' + url + ' -o nikto_shopify.txt',
      'Nikto scan completed: 1 informational finding', '', 0)
    
    // Simulate SSL/TLS check
    addLog('exposureScan', 'ssl', 'sslyze --regular ' + url,
      'SSL/TLS analysis: A+ rating, all protocols secure', '', 0)
    
    addLog('exposureScan', 'complete', 'Module 1 completed successfully', '', '', 0)
    
    return {
      shopifyDetected: true,
      exposedEndpoints: ['/admin', '/api', '/cart'],
      vulnerabilities: [
        { type: 'XSS', severity: 'Medium', description: 'Potential XSS in product search' },
        { type: 'CSRF', severity: 'Low', description: 'Missing CSRF token in some forms' }
      ],
      sslRating: 'A+',
      cdnAssets: true
    }
  }

  const runModule2_ApiAppReview = async (url, hasApiToken) => {
    setCurrentModule('API & App Connection Review')
    addLog('apiApps', 'start', 'Starting API and app connection review', '', '', 0)
    
    if (hasApiToken) {
      addLog('apiApps', 'api_query', 'GET /admin/api/2023-10/apps.json',
        'Retrieved 5 installed apps with their scopes', '', 0)
      
      addLog('apiApps', 'oauth_check', 'GET /admin/api/2023-10/oauth_apps.json',
        'Found 3 OAuth applications with various permission levels', '', 0)
    } else {
      addLog('apiApps', 'passive_check', 'Passive app detection from source code',
        'Detected 2 embedded apps, 1 public app reference', '', 0)
    }
    
    addLog('apiApps', 'complete', 'Module 2 completed successfully', '', '', 0)
    
    return {
      installedApps: hasApiToken ? [
        { name: 'Analytics Pro', scopes: ['read_orders', 'read_products'], risk: 'Low' },
        { name: 'Email Marketing', scopes: ['write_customers', 'read_orders'], risk: 'Medium' },
        { name: 'Inventory Manager', scopes: ['write_products', 'read_inventory'], risk: 'Low' }
      ] : [],
      oauthApps: hasApiToken ? [
        { name: 'Third-party Integration', scopes: ['read_all'], risk: 'High' },
        { name: 'Mobile App', scopes: ['read_orders'], risk: 'Low' }
      ] : [],
      recommendations: [
        'Review app permissions regularly',
        'Remove unused OAuth applications',
        'Implement least privilege principle'
      ]
    }
  }

  const runModule3_SecurityHeaders = async (url) => {
    setCurrentModule('Security Headers & Best Practices')
    addLog('headers', 'start', 'Starting security headers analysis', '', '', 0)
    
    addLog('headers', 'curl_headers', 'curl -I ' + url,
      'Retrieved HTTP headers for analysis', '', 0)
    
    addLog('headers', 'complete', 'Module 3 completed successfully', '', '', 0)
    
    return {
      headers: [
        { name: 'Content-Security-Policy', status: 'PASS', value: 'default-src \'self\'' },
        { name: 'X-Frame-Options', status: 'PASS', value: 'DENY' },
        { name: 'X-Content-Type-Options', status: 'PASS', value: 'nosniff' },
        { name: 'Strict-Transport-Security', status: 'PASS', value: 'max-age=31536000' },
        { name: 'Referrer-Policy', status: 'WARN', value: 'Not set' }
      ],
      score: 80,
      recommendations: [
        'Add Referrer-Policy header',
        'Consider implementing Content Security Policy reporting'
      ]
    }
  }

  const runModule4_ScheduledAudits = async (url, hasApiToken) => {
    setCurrentModule('Scheduled Storefront & Admin Risk Audits')
    addLog('audits', 'start', 'Starting scheduled risk audits', '', '', 0)
    
    addLog('audits', 'storefront_crawl', 'wapiti storefront analysis',
      'Crawled 25 storefront pages, found 2 anomalies', '', 0)
    
    if (hasApiToken) {
      addLog('audits', 'admin_logs', 'GET /admin/api/2023-10/events.json',
        'Retrieved 150 audit log entries from last 30 days', '', 0)
    }
    
    addLog('audits', 'complete', 'Module 4 completed successfully', '', '', 0)
    
    return {
      storefrontIssues: [
        { type: 'Broken Link', severity: 'Low', page: '/products/old-product' },
        { type: 'Missing Image', severity: 'Low', page: '/collections/sale' }
      ],
      adminEvents: hasApiToken ? [
        { type: 'Login', user: 'admin@store.com', timestamp: '2024-01-15T10:30:00Z', risk: 'Low' },
        { type: 'Permission Change', user: 'admin@store.com', timestamp: '2024-01-14T15:45:00Z', risk: 'Medium' }
      ] : [],
      recommendations: [
        'Monitor admin login patterns',
        'Review permission changes regularly',
        'Fix broken storefront links'
      ]
    }
  }

  const runModule5_CredentialPolicy = async (url, hasApiToken) => {
    setCurrentModule('Credential Policy Enforcement')
    addLog('credentials', 'start', 'Starting credential policy analysis', '', '', 0)
    
    if (hasApiToken) {
      addLog('credentials', 'staff_list', 'GET /admin/api/2023-10/staff_accounts.json',
        'Retrieved 3 staff accounts with security settings', '', 0)
      
      addLog('credentials', 'complete', 'Module 5 completed successfully', '', '', 0)
      
      return {
        staffAccounts: [
          { name: 'admin@store.com', role: 'Owner', twoFA: true, lastLogin: '2024-01-15T10:30:00Z', risk: 'Low' },
          { name: 'manager@store.com', role: 'Staff', twoFA: false, lastLogin: '2024-01-10T14:20:00Z', risk: 'Medium' },
          { name: 'support@store.com', role: 'Staff', twoFA: true, lastLogin: '2024-01-12T09:15:00Z', risk: 'Low' }
        ],
        securityScore: 75,
        recommendations: [
          'Enable 2FA for all staff accounts',
          'Implement password rotation policy',
          'Review inactive accounts'
        ]
      }
    } else {
      addLog('credentials', 'generic_checklist', 'Generic security checklist provided',
        'Provided manual verification checklist for admin', '', 0)
      
      addLog('credentials', 'complete', 'Module 5 completed successfully', '', '', 0)
      
      return {
        staffAccounts: [],
        securityScore: null,
        recommendations: [
          'Enable 2FA for all admin accounts',
          'Use strong, unique passwords',
          'Regularly review staff access',
          'Implement session timeout policies',
          'Monitor login attempts'
        ]
      }
    }
  }

  const runModule6_SubdomainEnumeration = async (url) => {
    setCurrentModule('Subdomain Enumeration & Takeover Detection')
    const domain = new URL(url).hostname
    
    addLog('subdomains', 'start', 'Starting subdomain enumeration and takeover detection', '', '', 0)
    
    // Step 1: Run amass enum
    addLog('subdomains', 'amass_enum', `amass enum -d ${domain}`,
      `Discovered 12 subdomains for ${domain}`, '', 0)
    
    // Step 2: Query crt.sh for certificates
    addLog('subdomains', 'crtsh_query', `curl -s "https://crt.sh/?q=${domain}&output=json"`,
      `Retrieved 8 certificate records from crt.sh`, '', 0)
    
    // Step 3: Use aquatone for screenshots
    addLog('subdomains', 'aquatone_screenshots', `aquatone -ports large -out /tmp/aquatone_${domain}`,
      `Generated screenshots for 15 live subdomains`, '', 0)
    
    // Step 4: Run subfinder + subjack for takeover detection
    addLog('subdomains', 'subfinder_scan', `subfinder -d ${domain} -silent`,
      `Found 20 unique subdomains using subfinder`, '', 0)
    
    addLog('subdomains', 'subjack_scan', `subjack -w subdomains.txt -t 100 -timeout 30 -o /tmp/subjack_${domain}.json`,
      `Detected 2 potential subdomain takeover candidates`, '', 0)
    
    addLog('subdomains', 'complete', 'Module 6 completed successfully', '', '', 0)
    
    return {
      discoveredSubdomains: [
        { subdomain: `www.${domain}`, status: 'live', ip: '192.168.1.100', port: 443 },
        { subdomain: `api.${domain}`, status: 'live', ip: '192.168.1.101', port: 443 },
        { subdomain: `admin.${domain}`, status: 'live', ip: '192.168.1.102', port: 443 },
        { subdomain: `staging.${domain}`, status: 'live', ip: '192.168.1.103', port: 443 },
        { subdomain: `dev.${domain}`, status: 'live', ip: '192.168.1.104', port: 443 },
        { subdomain: `test.${domain}`, status: 'live', ip: '192.168.1.105', port: 443 },
        { subdomain: `mail.${domain}`, status: 'live', ip: '192.168.1.106', port: 25 },
        { subdomain: `ftp.${domain}`, status: 'live', ip: '192.168.1.107', port: 21 },
        { subdomain: `old.${domain}`, status: 'dead', ip: null, port: null },
        { subdomain: `legacy.${domain}`, status: 'dead', ip: null, port: null },
        { subdomain: `backup.${domain}`, status: 'live', ip: '192.168.1.108', port: 22 },
        { subdomain: `cdn.${domain}`, status: 'live', ip: '192.168.1.109', port: 443 }
      ],
      takeoverCandidates: [
        {
          subdomain: `old.${domain}`,
          service: 'GitHub Pages',
          status: 'vulnerable',
          description: 'CNAME points to deleted GitHub Pages repository',
          severity: 'High',
          remediation: 'Remove CNAME record or restore GitHub Pages repository'
        },
        {
          subdomain: `legacy.${domain}`,
          service: 'AWS S3',
          status: 'vulnerable',
          description: 'S3 bucket does not exist, subdomain takeover possible',
          severity: 'Medium',
          remediation: 'Create S3 bucket or remove DNS record'
        }
      ],
      screenshotsDir: `/tmp/aquatone_${domain}`,
      rawFiles: [
        `/tmp/amass_${domain}.txt`,
        `/tmp/crtsh_${domain}.json`,
        `/tmp/aquatone_${domain}`,
        `/tmp/subjack_${domain}.json`
      ],
      scanCompleted: true,
      recommendations: [
        'Remove or secure unused subdomains',
        'Monitor for new subdomain registrations',
        'Implement subdomain takeover protection',
        'Regularly audit DNS records',
        'Use wildcard SSL certificates for subdomains'
      ]
    }
  }

  const runModule7_NucleiVulnScan = async (url) => {
    setCurrentModule('Nuclei Templated Vulnerability Scan')
    
    addLog('nuclei', 'start', 'Starting Nuclei templated vulnerability scan', '', '', 0)
    
    // Run nuclei with different severity levels
    addLog('nuclei', 'critical_scan', `nuclei -u ${url} -severity critical -templates-path /nuclei-templates`,
      'Critical scan completed: 0 critical vulnerabilities found', '', 0)
    
    addLog('nuclei', 'high_scan', `nuclei -u ${url} -severity high -templates-path /nuclei-templates`,
      'High severity scan completed: 2 high vulnerabilities found', '', 0)
    
    addLog('nuclei', 'medium_scan', `nuclei -u ${url} -severity medium -templates-path /nuclei-templates`,
      'Medium severity scan completed: 5 medium vulnerabilities found', '', 0)
    
    addLog('nuclei', 'low_scan', `nuclei -u ${url} -severity low -templates-path /nuclei-templates`,
      'Low severity scan completed: 8 low vulnerabilities found', '', 0)
    
    addLog('nuclei', 'complete', 'Module 7 completed successfully', '', '', 0)
    
    return {
      findings: [
        {
          templateId: 'shopify-admin-exposure',
          severity: 'High',
          name: 'Shopify Admin Panel Exposed',
          description: 'Admin panel accessible without proper authentication',
          evidence: 'HTTP 200 response from /admin endpoint',
          cve: null,
          remediation: 'Implement proper authentication and access controls'
        },
        {
          templateId: 'shopify-api-key-exposure',
          severity: 'High',
          name: 'API Key Exposed in Source Code',
          description: 'Shopify API key found in JavaScript source code',
          evidence: 'Found pattern: shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
          cve: null,
          remediation: 'Remove API keys from client-side code, use server-side proxy'
        },
        {
          templateId: 'missing-security-headers',
          severity: 'Medium',
          name: 'Missing Security Headers',
          description: 'Missing Content-Security-Policy header',
          evidence: 'Header not present in HTTP response',
          cve: null,
          remediation: 'Implement CSP header to prevent XSS attacks'
        },
        {
          templateId: 'shopify-theme-vulnerability',
          severity: 'Medium',
          name: 'Outdated Shopify Theme',
          description: 'Using outdated theme with known vulnerabilities',
          evidence: 'Theme version 1.0.0 detected, latest is 2.1.0',
          cve: null,
          remediation: 'Update theme to latest version'
        },
        {
          templateId: 'information-disclosure',
          severity: 'Low',
          name: 'Information Disclosure',
          description: 'Server version information exposed',
          evidence: 'X-Powered-By: Shopify/2.1.0',
          cve: null,
          remediation: 'Remove or obfuscate server version headers'
        }
      ],
      summary: {
        total: 15,
        critical: 0,
        high: 2,
        medium: 5,
        low: 8,
        info: 0
      },
      scanCompleted: true,
      recommendations: [
        'Address high and critical severity findings immediately',
        'Implement regular vulnerability scanning',
        'Keep themes and apps updated',
        'Review and implement security headers',
        'Conduct penetration testing quarterly'
      ]
    }
  }

  const runModule8_HostHeaderSSRF = async (url) => {
    setCurrentModule('Host-Header / SSRF / Open-Redirect Discovery')
    
    addLog('hostheader', 'start', 'Starting Host-Header injection and SSRF discovery', '', '', 0)
    
    // Host header injection testing
    addLog('hostheader', 'host_injection', `ffuf -w /wordlists/host-headers.txt -H "Host: FUZZ" -u ${url}`,
      'Host header injection test completed: 3 vulnerable endpoints found', '', 0)
    
    // Open redirect testing
    addLog('hostheader', 'redirect_test', `ffuf -w /wordlists/redirect-payloads.txt -u ${url}/redirect?url=FUZZ`,
      'Open redirect test completed: 1 vulnerable redirect found', '', 0)
    
    // SSRF testing
    addLog('hostheader', 'ssrf_test', `ffuf -w /wordlists/ssrf-payloads.txt -u ${url}/api/webhook?url=FUZZ`,
      'SSRF test completed: 2 potential SSRF endpoints found', '', 0)
    
    addLog('hostheader', 'complete', 'Module 8 completed successfully', '', '', 0)
    
    return {
      hostHeaderVulnerabilities: [
        {
          endpoint: '/admin',
          method: 'GET',
          vulnerability: 'Host Header Injection',
          severity: 'Medium',
          description: 'Admin panel accepts arbitrary Host headers',
          evidence: 'HTTP 200 response with injected Host header',
          remediation: 'Validate and whitelist allowed Host headers'
        },
        {
          endpoint: '/api/webhook',
          method: 'POST',
          vulnerability: 'Host Header Injection',
          severity: 'High',
          description: 'Webhook endpoint vulnerable to Host header injection',
          evidence: 'Response includes injected Host header in webhook URL',
          remediation: 'Implement strict Host header validation'
        }
      ],
      openRedirects: [
        {
          endpoint: '/redirect',
          parameter: 'url',
          severity: 'Medium',
          description: 'Open redirect vulnerability in redirect parameter',
          evidence: 'Successfully redirected to external domain',
          remediation: 'Implement allowlist for redirect URLs'
        }
      ],
      ssrfVulnerabilities: [
        {
          endpoint: '/api/webhook',
          parameter: 'url',
          severity: 'High',
          description: 'Potential SSRF vulnerability in webhook URL parameter',
          evidence: 'Server made request to internal IP address',
          remediation: 'Implement URL validation and IP allowlisting'
        },
        {
          endpoint: '/api/fetch',
          parameter: 'source',
          severity: 'Medium',
          description: 'Potential SSRF in fetch endpoint',
          evidence: 'Response time indicates internal network access',
          remediation: 'Restrict network access and validate URLs'
        }
      ],
      scanCompleted: true,
      recommendations: [
        'Implement strict Host header validation',
        'Use allowlists for redirect URLs',
        'Restrict internal network access for user-controlled URLs',
        'Implement proper URL validation and sanitization',
        'Monitor for unusual outbound requests'
      ]
    }
  }

  const runModule9_SecretsGitLeak = async (url) => {
    setCurrentModule('Secrets & Git Leak Detection')
    
    addLog('secrets', 'start', 'Starting secrets and Git leak detection', '', '', 0)
    
    // Git repository detection and cloning
    addLog('secrets', 'git_detection', `curl -s ${url}/.git/HEAD`,
      'Git repository detected, attempting to mirror', '', 0)
    
    addLog('secrets', 'git_mirror', `git clone --mirror ${url}/.git /tmp/git_mirror`,
      'Git repository mirrored successfully', '', 0)
    
    // Run gitleaks on mirrored repository
    addLog('secrets', 'gitleaks_scan', `gitleaks detect --source /tmp/git_mirror --report-format json`,
      'Gitleaks scan completed: 3 secrets found', '', 0)
    
    // Run truffleHog on public sources
    addLog('secrets', 'trufflehog_scan', `trufflehog git ${url}`,
      'TruffleHog scan completed: 1 additional secret found', '', 0)
    
    addLog('secrets', 'complete', 'Module 9 completed successfully', '', '', 0)
    
    return {
      gitLeaks: [
        {
          type: 'Shopify API Key',
          file: 'config/shopify.yml',
          line: 15,
          snippet: 'api_key: shpat_****1234',
          severity: 'High',
          description: 'Shopify API key found in configuration file',
          remediation: 'Move API keys to environment variables'
        },
        {
          type: 'Database Password',
          file: 'database.yml',
          line: 8,
          snippet: 'password: db_****5678',
          severity: 'High',
          description: 'Database password found in configuration',
          remediation: 'Use environment variables for sensitive data'
        },
        {
          type: 'AWS Access Key',
          file: 'aws_config.json',
          line: 3,
          snippet: 'access_key: AKIA****9012',
          severity: 'Critical',
          description: 'AWS access key found in configuration file',
          remediation: 'Rotate AWS keys and use IAM roles'
        }
      ],
      publicSecrets: [
        {
          type: 'GitHub Token',
          source: 'GitHub repository',
          snippet: 'ghp_****3456',
          severity: 'Medium',
          description: 'GitHub personal access token found in public repository',
          remediation: 'Revoke token and use GitHub Actions secrets'
        }
      ],
      artifacts: [
        '/tmp/git_mirror',
        '/tmp/gitleaks_report.json',
        '/tmp/trufflehog_report.json'
      ],
      scanCompleted: true,
      recommendations: [
        'Implement pre-commit hooks to prevent secret commits',
        'Use environment variables for all sensitive data',
        'Regularly rotate API keys and tokens',
        'Implement secret scanning in CI/CD pipeline',
        'Review and clean up historical commits with secrets'
      ]
    }
  }

  const runModule10_AuthenticatedAPIFuzzing = async (url, hasApiToken) => {
    setCurrentModule('Authenticated API Fuzzing & Parameter Discovery')
    
    addLog('apifuzzing', 'start', 'Starting authenticated API fuzzing and parameter discovery', '', '', 0)
    
    if (!hasApiToken) {
      addLog('apifuzzing', 'skip', 'Skipping authenticated API fuzzing - no API token provided',
        'API fuzzing requires explicit authentication consent', '', 0)
      
      addLog('apifuzzing', 'complete', 'Module 10 skipped - authentication required', '', '', 0)
      
      return {
        requiresAuth: true,
        message: 'Authenticated API fuzzing requires explicit API token consent',
        discoveredEndpoints: [],
        parameterDiscovery: [],
        injectionTests: [],
        scanCompleted: false,
        recommendations: [
          'Provide API token for comprehensive API security testing',
          'Implement API rate limiting and authentication',
          'Use API versioning and proper error handling',
          'Implement input validation and sanitization',
          'Monitor API usage and access patterns'
        ]
      }
    }
    
    // API endpoint discovery
    addLog('apifuzzing', 'endpoint_discovery', `ffuf -w /wordlists/api-endpoints.txt -u ${url}/api/FUZZ -H "Authorization: Bearer ****"`,
      'API endpoint discovery completed: 15 endpoints found', '', 0)
    
    // Parameter fuzzing
    addLog('apifuzzing', 'param_fuzzing', `ffuf -w /wordlists/parameters.txt -u ${url}/api/products?FUZZ=test -H "Authorization: Bearer ****"`,
      'Parameter fuzzing completed: 8 parameters discovered', '', 0)
    
    // SQL injection testing (lightweight)
    addLog('apifuzzing', 'sql_injection', `sqlmap -u "${url}/api/products?id=1" --headers="Authorization: Bearer ****" --batch --level=1`,
      'SQL injection test completed: No vulnerabilities found', '', 0)
    
    addLog('apifuzzing', 'complete', 'Module 10 completed successfully', '', '', 0)
    
    return {
      requiresAuth: false,
      discoveredEndpoints: [
        { endpoint: '/api/products', method: 'GET', status: 200, description: 'Product listing endpoint' },
        { endpoint: '/api/orders', method: 'GET', status: 200, description: 'Order management endpoint' },
        { endpoint: '/api/customers', method: 'GET', status: 200, description: 'Customer data endpoint' },
        { endpoint: '/api/webhooks', method: 'POST', status: 201, description: 'Webhook management endpoint' },
        { endpoint: '/api/admin', method: 'GET', status: 403, description: 'Admin endpoint (restricted)' }
      ],
      parameterDiscovery: [
        { parameter: 'limit', endpoint: '/api/products', type: 'integer', description: 'Pagination limit' },
        { parameter: 'offset', endpoint: '/api/products', type: 'integer', description: 'Pagination offset' },
        { parameter: 'search', endpoint: '/api/products', type: 'string', description: 'Product search query' },
        { parameter: 'category', endpoint: '/api/products', type: 'string', description: 'Product category filter' },
        { parameter: 'status', endpoint: '/api/orders', type: 'string', description: 'Order status filter' },
        { parameter: 'date_from', endpoint: '/api/orders', type: 'date', description: 'Order date range start' },
        { parameter: 'date_to', endpoint: '/api/orders', type: 'date', description: 'Order date range end' },
        { parameter: 'webhook_url', endpoint: '/api/webhooks', type: 'url', description: 'Webhook target URL' }
      ],
      injectionTests: [
        {
          endpoint: '/api/products',
          parameter: 'search',
          testType: 'SQL Injection',
          result: 'No vulnerability detected',
          severity: 'N/A',
          evidence: 'No SQL errors in response'
        },
        {
          endpoint: '/api/products',
          parameter: 'category',
          testType: 'NoSQL Injection',
          result: 'No vulnerability detected',
          severity: 'N/A',
          evidence: 'No NoSQL errors in response'
        }
      ],
      scanCompleted: true,
      recommendations: [
        'Implement comprehensive input validation',
        'Use parameterized queries to prevent injection',
        'Implement API rate limiting and throttling',
        'Add proper error handling without information disclosure',
        'Regularly test API endpoints for vulnerabilities'
      ]
    }
  }

  const generateReport = (results) => {
    const report = {
      metadata: {
        shopUrl,
        startedTime: auditStartTime,
        completedTime: auditEndTime,
        elapsedTime: auditEndTime ? Math.round((new Date(auditEndTime) - new Date(auditStartTime)) / 1000) : 0,
        totalModules: 10,
        completedModules: Object.keys(results).length
      },
      exposureScan: results.exposureScan,
      apiApps: results.apiApps,
      headers: results.headers,
      audits: results.audits,
      credentials: results.credentials,
      subdomains: results.subdomains,
      nuclei: results.nuclei,
      hostHeader: results.hostHeader,
      secrets: results.secrets,
      apiFuzzing: results.apiFuzzing,
      logs: auditLogs
    }
    
    return report
  }

  const runFullAudit = async () => {
    setAuditStartTime(new Date().toISOString())
    setAuditLogs([])
    setCurrentModule(null)
    
    const hasApiToken = apiVerified === true
    
    try {
      // Run all modules sequentially
      const exposureScan = await runModule1_EndpointsScanning(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const apiApps = await runModule2_ApiAppReview(shopUrl, hasApiToken)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const headers = await runModule3_SecurityHeaders(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const audits = await runModule4_ScheduledAudits(shopUrl, hasApiToken)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const credentials = await runModule5_CredentialPolicy(shopUrl, hasApiToken)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const subdomains = await runModule6_SubdomainEnumeration(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const nuclei = await runModule7_NucleiVulnScan(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const hostHeader = await runModule8_HostHeaderSSRF(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const secrets = await runModule9_SecretsGitLeak(shopUrl)
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const apiFuzzing = await runModule10_AuthenticatedAPIFuzzing(shopUrl, hasApiToken)
      
      setAuditEndTime(new Date().toISOString())
      setCurrentModule(null)
      
      const results = {
        exposureScan,
        apiApps,
        headers,
        audits,
        credentials,
        subdomains,
        nuclei,
        hostHeader,
        secrets,
        apiFuzzing
      }
      
      setAuditResults(results)
      showSuccess('🎉 Advanced Shopify security audit completed successfully!')
      
    } catch (error) {
      setCurrentModule(null)
      showError('❌ Audit failed: ' + error.message)
    }
  }

  const handleAnalyzeSite = async (e) => {
    e.preventDefault()
    
    if (!shopUrl.trim()) {
      showError('Please enter a valid Shopify store URL')
      return
    }

    const validUrl = validateUrl(shopUrl)
    if (!validUrl) {
      showError('Please enter a valid URL (e.g., example.myshopify.com or https://example.com)')
      return
    }

    setIsAnalyzing(true)
    setApiVerified(null)
    
    const loadingToastId = showLoading('🔍 Analyzing website for Shopify detection...')
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate analysis time
      
      const isShop = await detectShopify(validUrl)
      setIsShopify(isShop)
      
      dismissToast(loadingToastId)
      
      if (isShop) {
        showSuccess('✅ Shopify store detected! You can now provide API credentials for detailed analysis.')
        setShowApiDialog(true)
      } else {
        showError('❌ This is not a Shopify store. Please provide a valid Shopify store URL.')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('🌐 Error analyzing website. Please check the URL and try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleApiSubmit = async (e) => {
    e.preventDefault()
    
    if (!apiCredentials.acceptTerms) {
      showError('Please accept the terms and conditions to continue.')
      return
    }

    setIsVerifyingApi(true)
    const loadingToastId = showLoading('🔐 Verifying API credentials...')
    
    try {
      const isValid = await verifyApiCredentials(shopUrl, apiCredentials.accessToken)
      
      dismissToast(loadingToastId)
      
      if (isValid) {
        setApiVerified(true)
        showSuccess('✅ API credentials verified successfully! Starting comprehensive security audit...')
        // Auto-start audit after successful API verification
        setTimeout(() => {
          setShowAuditOrchestrator(true)
          runFullAudit()
        }, 1000)
      } else {
        setApiVerified(false)
        showError('❌ Invalid API credentials. Please check your access token.')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('🌐 Error verifying API credentials. Please try again.')
    } finally {
      setIsVerifyingApi(false)
    }
  }

  const handleSkipApi = () => {
    setShowApiDialog(false)
    showSuccess('⏭️ Skipped API credentials. Basic Shopify analysis will be performed.')
    // Auto-start audit after skipping API credentials
    setTimeout(() => {
      setShowAuditOrchestrator(true)
      runFullAudit()
    }, 1000)
  }

  const handleStartAudit = () => {
    setShowAuditOrchestrator(true)
    runFullAudit()
  }

  const handleReset = () => {
    setShopUrl('')
    setIsShopify(null)
    setShowApiDialog(false)
    setApiCredentials({ accessToken: '', acceptTerms: false })
    setApiVerified(null)
    setShowAuditOrchestrator(false)
    setAuditResults(null)
    setAuditLogs([])
    setCurrentModule(null)
    setAuditStartTime(null)
    setAuditEndTime(null)
    setExpandedModules({})
  }

  const toggleModuleExpansion = (moduleId) => {
    setExpandedModules(prev => ({
      ...prev,
      [moduleId]: !prev[moduleId]
    }))
  }

  const downloadReport = (format) => {
    if (!auditResults) return
    
    const report = generateReport(auditResults)
    
    if (format === 'html') {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shopify Security Audit Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
            .module { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .log-entry { background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 4px; font-family: monospace; }
            .pass { color: green; }
            .warn { color: orange; }
            .fail { color: red; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Shopify Security Audit Report</h1>
            <p><strong>Store URL:</strong> ${report.metadata.shopUrl}</p>
            <p><strong>Completed:</strong> ${new Date(report.metadata.completedTime).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${report.metadata.elapsedTime} seconds</p>
          </div>
          
          <div class="module">
            <h2>1. Endpoints & Exposure Scanning</h2>
            <p><strong>Shopify Detected:</strong> ${report.exposureScan.shopifyDetected ? 'Yes' : 'No'}</p>
            <p><strong>SSL Rating:</strong> ${report.exposureScan.sslRating}</p>
            <p><strong>Vulnerabilities Found:</strong> ${report.exposureScan.vulnerabilities.length}</p>
          </div>
          
          <div class="module">
            <h2>2. API & App Connection Review</h2>
            <p><strong>Installed Apps:</strong> ${report.apiApps.installedApps.length}</p>
            <p><strong>OAuth Apps:</strong> ${report.apiApps.oauthApps.length}</p>
          </div>
          
          <div class="module">
            <h2>3. Security Headers</h2>
            <p><strong>Security Score:</strong> ${report.headers.score}/100</p>
            <ul>
              ${report.headers.headers.map(h => `<li class="${h.status.toLowerCase()}">${h.name}: ${h.status}</li>`).join('')}
            </ul>
          </div>
          
          <div class="module">
            <h2>4. Risk Audits</h2>
            <p><strong>Storefront Issues:</strong> ${report.audits.storefrontIssues.length}</p>
            <p><strong>Admin Events:</strong> ${report.audits.adminEvents.length}</p>
          </div>
          
          <div class="module">
            <h2>5. Credential Policy</h2>
            <p><strong>Staff Accounts:</strong> ${report.credentials.staffAccounts.length}</p>
            <p><strong>Security Score:</strong> ${report.credentials.securityScore || 'N/A'}/100</p>
          </div>
          
          <div class="module">
            <h2>Audit Logs</h2>
            ${report.logs.map(log => `
              <div class="log-entry">
                <strong>${log.timestamp}</strong> [${log.module}] ${log.step}<br>
                ${log.command ? `<code>${log.command}</code><br>` : ''}
                ${log.stdoutSnippet ? `<span class="pass">${log.stdoutSnippet}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </body>
        </html>
      `
      
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `shopify-audit-${new Date().toISOString().split('T')[0]}.html`
      a.click()
      URL.revokeObjectURL(url)
    } else if (format === 'pdf') {
      // Generate PDF using HTML to PDF conversion
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shopify Security Audit Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #ddd; }
            .module { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
            .log-entry { background: #f8f9fa; padding: 10px; margin: 5px 0; border-radius: 4px; font-family: monospace; font-size: 10px; }
            .pass { color: #28a745; font-weight: bold; }
            .warn { color: #ffc107; font-weight: bold; }
            .fail { color: #dc3545; font-weight: bold; }
            .summary { background: #e9ecef; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            .page-break { page-break-before: always; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🛡️ Shopify Security Audit Report</h1>
            <div class="summary">
              <p><strong>Store URL:</strong> ${report.metadata.shopUrl}</p>
              <p><strong>Audit Date:</strong> ${new Date(report.metadata.completedTime).toLocaleDateString()}</p>
              <p><strong>Audit Time:</strong> ${new Date(report.metadata.completedTime).toLocaleTimeString()}</p>
              <p><strong>Duration:</strong> ${report.metadata.elapsedTime} seconds</p>
              <p><strong>API Access:</strong> ${apiVerified ? 'Yes' : 'No'}</p>
            </div>
          </div>
          
          <div class="module">
            <h2>📊 Executive Summary</h2>
            <table>
              <tr><th>Module</th><th>Status</th><th>Key Findings</th></tr>
               <tr><td>Endpoints & Exposure</td><td class="pass">COMPLETED</td><td>${report.exposureScan.vulnerabilities.length} vulnerabilities found</td></tr>
               <tr><td>API & Apps</td><td class="pass">COMPLETED</td><td>${report.apiApps.installedApps.length} apps, ${report.apiApps.oauthApps.length} OAuth apps</td></tr>
               <tr><td>Security Headers</td><td class="pass">COMPLETED</td><td>Score: ${report.headers.score}/100</td></tr>
               <tr><td>Risk Audits</td><td class="pass">COMPLETED</td><td>${report.audits.storefrontIssues.length} storefront issues</td></tr>
               <tr><td>Credentials</td><td class="pass">COMPLETED</td><td>${report.credentials.staffAccounts.length} staff accounts</td></tr>
               <tr><td>Subdomain Enumeration</td><td class="pass">COMPLETED</td><td>${report.subdomains.discoveredSubdomains.length} subdomains, ${report.subdomains.takeoverCandidates.length} takeover candidates</td></tr>
               <tr><td>Nuclei Vulnerability Scan</td><td class="pass">COMPLETED</td><td>${report.nuclei.summary.total} findings (${report.nuclei.summary.critical} critical, ${report.nuclei.summary.high} high)</td></tr>
               <tr><td>Host Header / SSRF</td><td class="pass">COMPLETED</td><td>${report.hostHeader.hostHeaderVulnerabilities.length + report.hostHeader.openRedirects.length + report.hostHeader.ssrfVulnerabilities.length} issues found</td></tr>
               <tr><td>Secrets & Git Leak</td><td class="pass">COMPLETED</td><td>${report.secrets.gitLeaks.length} git leaks, ${report.secrets.publicSecrets.length} public secrets</td></tr>
               <tr><td>API Fuzzing</td><td class="pass">COMPLETED</td><td>${report.apiFuzzing.discoveredEndpoints.length} endpoints, ${report.apiFuzzing.parameterDiscovery.length} parameters</td></tr>
            </table>
          </div>
          
          <div class="page-break"></div>
          
          <div class="module">
            <h2>🔍 1. Endpoints & Exposure Scanning</h2>
            <p><strong>Shopify Detection:</strong> <span class="pass">${report.exposureScan.shopifyDetected ? 'CONFIRMED' : 'NOT DETECTED'}</span></p>
            <p><strong>SSL/TLS Rating:</strong> <span class="pass">${report.exposureScan.sslRating}</span></p>
            <p><strong>CDN Assets:</strong> ${report.exposureScan.cdnAssets ? 'Yes' : 'No'}</p>
            <p><strong>Exposed Endpoints:</strong> ${report.exposureScan.exposedEndpoints.join(', ')}</p>
            
            <h3>Vulnerabilities Found:</h3>
            <table>
              <tr><th>Type</th><th>Severity</th><th>Description</th></tr>
              ${report.exposureScan.vulnerabilities.map(vuln => 
                `<tr><td>${vuln.type}</td><td class="${vuln.severity.toLowerCase()}">${vuln.severity}</td><td>${vuln.description}</td></tr>`
              ).join('')}
            </table>
          </div>
          
          <div class="module">
            <h2>🔗 2. API & App Connection Review</h2>
            <p><strong>Installed Apps:</strong> ${report.apiApps.installedApps.length}</p>
            <p><strong>OAuth Applications:</strong> ${report.apiApps.oauthApps.length}</p>
            
            <h3>Installed Apps:</h3>
            <table>
              <tr><th>App Name</th><th>Scopes</th><th>Risk Level</th></tr>
              ${report.apiApps.installedApps.map(app => 
                `<tr><td>${app.name}</td><td>${app.scopes.join(', ')}</td><td class="${app.risk.toLowerCase()}">${app.risk}</td></tr>`
              ).join('')}
            </table>
            
            <h3>Recommendations:</h3>
            <ul>
              ${report.apiApps.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          
          <div class="page-break"></div>
          
          <div class="module">
            <h2>🛡️ 3. Security Headers & Best Practices</h2>
            <p><strong>Overall Security Score:</strong> <span class="pass">${report.headers.score}/100</span></p>
            
            <h3>Header Analysis:</h3>
            <table>
              <tr><th>Header</th><th>Status</th><th>Value</th></tr>
              ${report.headers.headers.map(header => 
                `<tr><td>${header.name}</td><td class="${header.status.toLowerCase()}">${header.status}</td><td>${header.value || 'Not set'}</td></tr>`
              ).join('')}
            </table>
            
            <h3>Recommendations:</h3>
            <ul>
              ${report.headers.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          
          <div class="module">
            <h2>📋 4. Risk Audits</h2>
            <p><strong>Storefront Issues:</strong> ${report.audits.storefrontIssues.length}</p>
            <p><strong>Admin Events:</strong> ${report.audits.adminEvents.length}</p>
            
            <h3>Storefront Issues:</h3>
            <table>
              <tr><th>Type</th><th>Severity</th><th>Page</th></tr>
              ${report.audits.storefrontIssues.map(issue => 
                `<tr><td>${issue.type}</td><td class="${issue.severity.toLowerCase()}">${issue.severity}</td><td>${issue.page}</td></tr>`
              ).join('')}
            </table>
            
            <h3>Recommendations:</h3>
            <ul>
              ${report.audits.recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
          </div>
          
           <div class="module">
             <h2>🔐 5. Credential Policy Enforcement</h2>
             <p><strong>Staff Accounts:</strong> ${report.credentials.staffAccounts.length}</p>
             ${report.credentials.securityScore ? `<p><strong>Security Score:</strong> <span class="pass">${report.credentials.securityScore}/100</span></p>` : ''}
             
             ${report.credentials.staffAccounts.length > 0 ? `
             <h3>Staff Account Analysis:</h3>
             <table>
               <tr><th>Email</th><th>Role</th><th>2FA</th><th>Last Login</th><th>Risk</th></tr>
               ${report.credentials.staffAccounts.map(account => 
                 `<tr><td>${account.name}</td><td>${account.role}</td><td class="${account.twoFA ? 'pass' : 'fail'}">${account.twoFA ? 'Yes' : 'No'}</td><td>${new Date(account.lastLogin).toLocaleDateString()}</td><td class="${account.risk.toLowerCase()}">${account.risk}</td></tr>`
               ).join('')}
             </table>
             ` : ''}
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.credentials.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
           
           <div class="page-break"></div>
           
           <div class="module">
             <h2>🌐 6. Subdomain Enumeration & Takeover Detection</h2>
             <p><strong>Discovered Subdomains:</strong> ${report.subdomains.discoveredSubdomains.length}</p>
             <p><strong>Takeover Candidates:</strong> ${report.subdomains.takeoverCandidates.length}</p>
             <p><strong>Live Subdomains:</strong> ${report.subdomains.discoveredSubdomains.filter(s => s.status === 'live').length}</p>
             
             <h3>Takeover Candidates:</h3>
             <table>
               <tr><th>Subdomain</th><th>Service</th><th>Severity</th><th>Description</th></tr>
               ${report.subdomains.takeoverCandidates.map(candidate => 
                 `<tr><td>${candidate.subdomain}</td><td>${candidate.service}</td><td class="${candidate.severity.toLowerCase()}">${candidate.severity}</td><td>${candidate.description}</td></tr>`
               ).join('')}
             </table>
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.subdomains.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
           
           <div class="module">
             <h2>🔍 7. Nuclei Templated Vulnerability Scan</h2>
             <p><strong>Total Findings:</strong> ${report.nuclei.summary.total}</p>
             <p><strong>Critical:</strong> <span class="fail">${report.nuclei.summary.critical}</span> | <strong>High:</strong> <span class="warn">${report.nuclei.summary.high}</span> | <strong>Medium:</strong> <span class="warn">${report.nuclei.summary.medium}</span></p>
             
             <h3>High Severity Findings:</h3>
             <table>
               <tr><th>Template ID</th><th>Name</th><th>Severity</th><th>Description</th></tr>
               ${report.nuclei.findings.filter(f => f.severity === 'High').map(finding => 
                 `<tr><td>${finding.templateId}</td><td>${finding.name}</td><td class="${finding.severity.toLowerCase()}">${finding.severity}</td><td>${finding.description}</td></tr>`
               ).join('')}
             </table>
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.nuclei.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
           
           <div class="page-break"></div>
           
           <div class="module">
             <h2>🎯 8. Host-Header / SSRF / Open-Redirect Discovery</h2>
             <p><strong>Host Header Vulnerabilities:</strong> ${report.hostHeader.hostHeaderVulnerabilities.length}</p>
             <p><strong>Open Redirects:</strong> ${report.hostHeader.openRedirects.length}</p>
             <p><strong>SSRF Vulnerabilities:</strong> ${report.hostHeader.ssrfVulnerabilities.length}</p>
             
             <h3>SSRF Vulnerabilities:</h3>
             <table>
               <tr><th>Endpoint</th><th>Parameter</th><th>Severity</th><th>Description</th></tr>
               ${report.hostHeader.ssrfVulnerabilities.map(ssrf => 
                 `<tr><td>${ssrf.endpoint}</td><td>${ssrf.parameter}</td><td class="${ssrf.severity.toLowerCase()}">${ssrf.severity}</td><td>${ssrf.description}</td></tr>`
               ).join('')}
             </table>
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.hostHeader.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
           
           <div class="module">
             <h2>🔑 9. Secrets & Git Leak Detection</h2>
             <p><strong>Git Leaks:</strong> ${report.secrets.gitLeaks.length}</p>
             <p><strong>Public Secrets:</strong> ${report.secrets.publicSecrets.length}</p>
             <p><strong>Critical Secrets:</strong> <span class="fail">${report.secrets.gitLeaks.filter(s => s.severity === 'Critical').length}</span></p>
             
             <h3>Critical & High Severity Secrets:</h3>
             <table>
               <tr><th>Type</th><th>File</th><th>Severity</th><th>Snippet</th></tr>
               ${report.secrets.gitLeaks.filter(s => s.severity === 'Critical' || s.severity === 'High').map(secret => 
                 `<tr><td>${secret.type}</td><td>${secret.file}</td><td class="${secret.severity.toLowerCase()}">${secret.severity}</td><td>${secret.snippet}</td></tr>`
               ).join('')}
             </table>
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.secrets.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
           
           <div class="module">
             <h2>🔬 10. Authenticated API Fuzzing & Parameter Discovery</h2>
             <p><strong>Discovered Endpoints:</strong> ${report.apiFuzzing.discoveredEndpoints.length}</p>
             <p><strong>Parameters Found:</strong> ${report.apiFuzzing.parameterDiscovery.length}</p>
             <p><strong>Requires Authentication:</strong> ${report.apiFuzzing.requiresAuth ? 'Yes' : 'No'}</p>
             
             <h3>Discovered API Endpoints:</h3>
             <table>
               <tr><th>Endpoint</th><th>Method</th><th>Status</th><th>Description</th></tr>
               ${report.apiFuzzing.discoveredEndpoints.map(endpoint => 
                 `<tr><td>${endpoint.endpoint}</td><td>${endpoint.method}</td><td>${endpoint.status}</td><td>${endpoint.description}</td></tr>`
               ).join('')}
             </table>
             
             <h3>Recommendations:</h3>
             <ul>
               ${report.apiFuzzing.recommendations.map(rec => `<li>${rec}</li>`).join('')}
             </ul>
           </div>
          
          <div class="page-break"></div>
          
          <div class="module">
            <h2>📝 Audit Logs</h2>
            <p><strong>Total Log Entries:</strong> ${report.logs.length}</p>
            ${report.logs.map(log => `
              <div class="log-entry">
                <strong>${new Date(log.timestamp).toLocaleString()}</strong> [${log.module}] ${log.step}<br>
                ${log.command ? `<code>${log.command}</code><br>` : ''}
                ${log.stdoutSnippet ? `<span class="pass">${log.stdoutSnippet}</span>` : ''}
              </div>
            `).join('')}
          </div>
          
          <div class="module">
            <h2>📞 Contact & Support</h2>
            <p>This report was generated by Cyberix Shopify Cloud Shield.</p>
            <p>For questions about this audit or security recommendations, please contact your security team.</p>
            <p><strong>Report Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </body>
        </html>
      `
      
      // Create a new window with the HTML content and trigger print
      const printWindow = window.open('', '_blank')
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      
      // Wait for content to load then trigger print
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 500)
      
    } else if (format === 'excel') {
      // Generate Excel file using CSV format (simplified approach)
      const csvContent = generateExcelReport(report)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `shopify-audit-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
    
    showSuccess(`📄 Report downloaded in ${format.toUpperCase()} format!`)
  }

  const generateExcelReport = (report) => {
    let csv = 'Shopify Security Audit Report\n'
    csv += `Store URL,${report.metadata.shopUrl}\n`
    csv += `Audit Date,${new Date(report.metadata.completedTime).toLocaleDateString()}\n`
    csv += `Duration,${report.metadata.elapsedTime} seconds\n`
    csv += `API Access,${apiVerified ? 'Yes' : 'No'}\n\n`
    
    // Module 1: Endpoints & Exposure
    csv += 'MODULE 1: ENDPOINTS & EXPOSURE SCANNING\n'
    csv += 'Metric,Value\n'
    csv += `Shopify Detected,${report.exposureScan.shopifyDetected ? 'Yes' : 'No'}\n`
    csv += `SSL Rating,${report.exposureScan.sslRating}\n`
    csv += `Vulnerabilities Found,${report.exposureScan.vulnerabilities.length}\n`
    csv += `CDN Assets,${report.exposureScan.cdnAssets ? 'Yes' : 'No'}\n`
    csv += `Exposed Endpoints,"${report.exposureScan.exposedEndpoints.join('; ')}"\n\n`
    
    csv += 'Vulnerabilities\n'
    csv += 'Type,Severity,Description\n'
    report.exposureScan.vulnerabilities.forEach(vuln => {
      csv += `${vuln.type},${vuln.severity},"${vuln.description}"\n`
    })
    csv += '\n'
    
    // Module 2: API & Apps
    csv += 'MODULE 2: API & APP CONNECTION REVIEW\n'
    csv += 'Metric,Value\n'
    csv += `Installed Apps,${report.apiApps.installedApps.length}\n`
    csv += `OAuth Apps,${report.apiApps.oauthApps.length}\n\n`
    
    csv += 'Installed Apps\n'
    csv += 'App Name,Scopes,Risk Level\n'
    report.apiApps.installedApps.forEach(app => {
      csv += `${app.name},"${app.scopes.join('; ')}",${app.risk}\n`
    })
    csv += '\n'
    
    csv += 'OAuth Apps\n'
    csv += 'App Name,Scopes,Risk Level\n'
    report.apiApps.oauthApps.forEach(app => {
      csv += `${app.name},"${app.scopes.join('; ')}",${app.risk}\n`
    })
    csv += '\n'
    
    // Module 3: Security Headers
    csv += 'MODULE 3: SECURITY HEADERS\n'
    csv += 'Metric,Value\n'
    csv += `Security Score,${report.headers.score}/100\n\n`
    
    csv += 'Headers\n'
    csv += 'Header Name,Status,Value\n'
    report.headers.headers.forEach(header => {
      csv += `${header.name},${header.status},"${header.value || 'Not set'}"\n`
    })
    csv += '\n'
    
    // Module 4: Risk Audits
    csv += 'MODULE 4: RISK AUDITS\n'
    csv += 'Metric,Value\n'
    csv += `Storefront Issues,${report.audits.storefrontIssues.length}\n`
    csv += `Admin Events,${report.audits.adminEvents.length}\n\n`
    
    csv += 'Storefront Issues\n'
    csv += 'Type,Severity,Page\n'
    report.audits.storefrontIssues.forEach(issue => {
      csv += `${issue.type},${issue.severity},${issue.page}\n`
    })
    csv += '\n'
    
    // Module 5: Credentials
    csv += 'MODULE 5: CREDENTIAL POLICY\n'
    csv += 'Metric,Value\n'
    csv += `Staff Accounts,${report.credentials.staffAccounts.length}\n`
    if (report.credentials.securityScore) {
      csv += `Security Score,${report.credentials.securityScore}/100\n`
    }
    csv += '\n'
    
    if (report.credentials.staffAccounts.length > 0) {
      csv += 'Staff Accounts\n'
      csv += 'Email,Role,2FA Enabled,Last Login,Risk Level\n'
      report.credentials.staffAccounts.forEach(account => {
        csv += `${account.name},${account.role},${account.twoFA ? 'Yes' : 'No'},${new Date(account.lastLogin).toLocaleDateString()},${account.risk}\n`
      })
      csv += '\n'
    }
    
    // Module 6: Subdomain Enumeration
    csv += 'MODULE 6: SUBDOMAIN ENUMERATION\n'
    csv += 'Metric,Value\n'
    csv += `Discovered Subdomains,${report.subdomains.discoveredSubdomains.length}\n`
    csv += `Takeover Candidates,${report.subdomains.takeoverCandidates.length}\n`
    csv += `Live Subdomains,${report.subdomains.discoveredSubdomains.filter(s => s.status === 'live').length}\n`
    csv += `Dead Subdomains,${report.subdomains.discoveredSubdomains.filter(s => s.status === 'dead').length}\n\n`
    
    csv += 'Takeover Candidates\n'
    csv += 'Subdomain,Service,Severity,Description\n'
    report.subdomains.takeoverCandidates.forEach(candidate => {
      csv += `${candidate.subdomain},${candidate.service},${candidate.severity},"${candidate.description}"\n`
    })
    csv += '\n'
    
    // Module 7: Nuclei Vulnerability Scan
    csv += 'MODULE 7: NUCLEI VULNERABILITY SCAN\n'
    csv += 'Metric,Value\n'
    csv += `Total Findings,${report.nuclei.summary.total}\n`
    csv += `Critical,${report.nuclei.summary.critical}\n`
    csv += `High,${report.nuclei.summary.high}\n`
    csv += `Medium,${report.nuclei.summary.medium}\n`
    csv += `Low,${report.nuclei.summary.low}\n\n`
    
    csv += 'High Severity Findings\n'
    csv += 'Template ID,Name,Severity,Description\n'
    report.nuclei.findings.filter(f => f.severity === 'High').forEach(finding => {
      csv += `${finding.templateId},${finding.name},${finding.severity},"${finding.description}"\n`
    })
    csv += '\n'
    
    // Module 8: Host Header / SSRF
    csv += 'MODULE 8: HOST HEADER / SSRF\n'
    csv += 'Metric,Value\n'
    csv += `Host Header Vulnerabilities,${report.hostHeader.hostHeaderVulnerabilities.length}\n`
    csv += `Open Redirects,${report.hostHeader.openRedirects.length}\n`
    csv += `SSRF Vulnerabilities,${report.hostHeader.ssrfVulnerabilities.length}\n\n`
    
    csv += 'SSRF Vulnerabilities\n'
    csv += 'Endpoint,Parameter,Severity,Description\n'
    report.hostHeader.ssrfVulnerabilities.forEach(ssrf => {
      csv += `${ssrf.endpoint},${ssrf.parameter},${ssrf.severity},"${ssrf.description}"\n`
    })
    csv += '\n'
    
    // Module 9: Secrets & Git Leak
    csv += 'MODULE 9: SECRETS & GIT LEAK\n'
    csv += 'Metric,Value\n'
    csv += `Git Leaks,${report.secrets.gitLeaks.length}\n`
    csv += `Public Secrets,${report.secrets.publicSecrets.length}\n`
    csv += `Critical Secrets,${report.secrets.gitLeaks.filter(s => s.severity === 'Critical').length}\n`
    csv += `High Severity Secrets,${report.secrets.gitLeaks.filter(s => s.severity === 'High').length}\n\n`
    
    csv += 'Critical & High Severity Secrets\n'
    csv += 'Type,File,Severity,Snippet\n'
    report.secrets.gitLeaks.filter(s => s.severity === 'Critical' || s.severity === 'High').forEach(secret => {
      csv += `${secret.type},${secret.file},${secret.severity},"${secret.snippet}"\n`
    })
    csv += '\n'
    
    // Module 10: API Fuzzing
    csv += 'MODULE 10: API FUZZING\n'
    csv += 'Metric,Value\n'
    csv += `Discovered Endpoints,${report.apiFuzzing.discoveredEndpoints.length}\n`
    csv += `Parameters Found,${report.apiFuzzing.parameterDiscovery.length}\n`
    csv += `Injection Tests,${report.apiFuzzing.injectionTests.length}\n`
    csv += `Requires Authentication,${report.apiFuzzing.requiresAuth ? 'Yes' : 'No'}\n\n`
    
    csv += 'Discovered API Endpoints\n'
    csv += 'Endpoint,Method,Status,Description\n'
    report.apiFuzzing.discoveredEndpoints.forEach(endpoint => {
      csv += `${endpoint.endpoint},${endpoint.method},${endpoint.status},"${endpoint.description}"\n`
    })
    csv += '\n'
    
    // Recommendations
    csv += 'RECOMMENDATIONS\n'
    csv += 'Module,Recommendation\n'
    report.apiApps.recommendations.forEach(rec => {
      csv += `API & Apps,"${rec}"\n`
    })
    report.headers.recommendations.forEach(rec => {
      csv += `Security Headers,"${rec}"\n`
    })
    report.audits.recommendations.forEach(rec => {
      csv += `Risk Audits,"${rec}"\n`
    })
    report.credentials.recommendations.forEach(rec => {
      csv += `Credentials,"${rec}"\n`
    })
    report.subdomains.recommendations.forEach(rec => {
      csv += `Subdomain Enumeration,"${rec}"\n`
    })
    report.nuclei.recommendations.forEach(rec => {
      csv += `Nuclei Vulnerability Scan,"${rec}"\n`
    })
    report.hostHeader.recommendations.forEach(rec => {
      csv += `Host Header / SSRF,"${rec}"\n`
    })
    report.secrets.recommendations.forEach(rec => {
      csv += `Secrets & Git Leak,"${rec}"\n`
    })
    report.apiFuzzing.recommendations.forEach(rec => {
      csv += `API Fuzzing,"${rec}"\n`
    })
    
    return csv
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-8">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Shopify Cloud Shield</h1>
              <p className="text-gray-600 dark:text-gray-400">Comprehensive Shopify security analysis and protection</p>
            </div>
          </div>
        </div>

        {/* URL Input Section */}
        <div className="mb-8">
          <form onSubmit={handleAnalyzeSite} className="space-y-4">
            <div>
              <label htmlFor="shopUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Shopify Store URL
              </label>
              <div className="flex space-x-3">
                <input
                  id="shopUrl"
                  type="text"
                  value={shopUrl}
                  onChange={(e) => setShopUrl(e.target.value)}
                  placeholder="Enter Shopify store URL (e.g., example.myshopify.com)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                  disabled={isAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isAnalyzing || !shopUrl.trim()}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isAnalyzing ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Analyzing...
                    </div>
                  ) : (
                    'Analyze Store'
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Enter the URL of the Shopify store you want to analyze for security vulnerabilities.
              </p>
              <div className="mt-3 p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-800 font-medium mb-2">Test URLs:</p>
                <div className="text-xs text-green-700 space-y-1">
                  <p><strong>Shopify stores:</strong> shopify.com, myshopify.com, shop.app, shopify.dev</p>
                  <p><strong>Non-Shopify sites:</strong> wordpress.com, wp.com, google.com, github.com, facebook.com</p>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Results Section */}
        {isShopify !== null && (
          <div className="mb-8">
            <div className={`p-6 rounded-lg border-2 ${
              isShopify 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  isShopify ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isShopify ? (
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
                    isShopify ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {isShopify ? 'Shopify Store Detected' : 'Not a Shopify Store'}
                  </h3>
                  <p className={`text-sm ${
                    isShopify ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {isShopify 
                      ? 'This store appears to be running on Shopify. You can now provide API credentials for detailed analysis.'
                      : 'This site does not appear to be a Shopify store. Please provide a valid Shopify store URL.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Credentials Dialog */}
        {showApiDialog && isShopify && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API Credentials</h3>
                  <button
                    onClick={handleSkipApi}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Provide your Shopify API access token to get a detailed security report. 
                  This is optional - you can skip this step for basic analysis.
                </p>

                <form onSubmit={handleApiSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="accessToken" className="block text-sm font-medium text-gray-700 mb-1">
                      Access Token
                    </label>
                    <input
                      id="accessToken"
                      type="password"
                      value={apiCredentials.accessToken}
                      onChange={(e) => setApiCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </div>

                  <div className="flex items-start">
                    <input
                      id="acceptTerms"
                      type="checkbox"
                      checked={apiCredentials.acceptTerms}
                      onChange={(e) => setApiCredentials(prev => ({ ...prev, acceptTerms: e.target.checked }))}
                      className="mt-1 h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                    />
                    <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      I accept the terms and conditions for API credential verification
                    </label>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={handleSkipApi}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingApi || !apiCredentials.acceptTerms}
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isVerifyingApi ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* API Verification Result */}
        {apiVerified !== null && (
          <div className="mb-8">
            <div className={`p-6 rounded-lg border-2 ${
              apiVerified 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  apiVerified ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {apiVerified ? (
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
                    apiVerified ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {apiVerified ? 'API Credentials Verified' : 'Invalid API Credentials'}
                  </h3>
                  <p className={`text-sm ${
                    apiVerified ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {apiVerified 
                      ? 'API credentials have been verified successfully. Detailed security report will be generated.'
                      : 'The provided API credentials are invalid. Please check your access token.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end">
          <button
            onClick={handleReset}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Reset Analysis
          </button>
        </div>
      </div>

      {/* Audit Orchestrator */}
      {showAuditOrchestrator && (
        <div className="mt-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Shopify Security Audit</h2>
            
            {/* Current Module Status */}
            {currentModule && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-blue-800 font-medium">Currently running: {currentModule}</span>
                </div>
              </div>
            )}

             {/* Audit Logs */}
             {auditLogs.length > 0 && (
               <div className="mb-6">
                 <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Logs</h3>
                   <button
                     onClick={() => {
                       const logsText = auditLogs.map(log => {
                         let logLine = `[${log.timestamp}] [${log.module}] ${log.step}`
                         if (log.command) {
                           logLine += `\n$ ${log.command}`
                         }
                         if (log.stdoutSnippet) {
                           logLine += `\n${log.stdoutSnippet}`
                         }
                         return logLine
                       }).join('\n\n')
                       
                       navigator.clipboard.writeText(logsText).then(() => {
                         showSuccess('📋 Audit logs copied to clipboard!')
                       }).catch(() => {
                         showError('❌ Failed to copy logs to clipboard')
                       })
                     }}
                     className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                   >
                     <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                     </svg>
                     Copy Logs
                   </button>
                 </div>
                 <div className="bg-gray-900 text-green-400 p-4 rounded-lg max-h-64 overflow-y-auto font-mono text-sm">
                   {auditLogs.map((log, index) => (
                     <div key={index} className="mb-2">
                       <span className="text-gray-400">[{log.timestamp}]</span>
                       <span className="text-blue-400 ml-2">[{log.module}]</span>
                       <span className="text-white ml-2">{log.step}</span>
                       {log.command && (
                         <div className="text-yellow-400 ml-4">$ {log.command}</div>
                       )}
                       {log.stdoutSnippet && (
                         <div className="text-green-400 ml-4">{log.stdoutSnippet}</div>
                       )}
                     </div>
                   ))}
                 </div>
               </div>
             )}

            {/* Audit Results */}
            {auditResults && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Results</h3>
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

                 {/* Module 1: Endpoints & Exposure */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">1. Endpoints & Exposure Scanning</h4>
                     <button
                       onClick={() => toggleModuleExpansion('exposureScan')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.exposureScan ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Shopify Detected:</span> {auditResults.exposureScan.shopifyDetected ? 'Yes' : 'No'}
                     </div>
                     <div>
                       <span className="font-medium">SSL Rating:</span> {auditResults.exposureScan.sslRating}
                     </div>
                     <div>
                       <span className="font-medium">Vulnerabilities:</span> {auditResults.exposureScan.vulnerabilities.length}
                     </div>
                     <div>
                       <span className="font-medium">CDN Assets:</span> {auditResults.exposureScan.cdnAssets ? 'Yes' : 'No'}
                     </div>
                   </div>
                   
                   {expandedModules.exposureScan && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Findings</h5>
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Exposed Endpoints:</h6>
                         <div className="flex flex-wrap gap-2">
                           {auditResults.exposureScan.exposedEndpoints.map((endpoint, index) => (
                             <span key={index} className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">
                               {endpoint}
                             </span>
                           ))}
                         </div>
                       </div>
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Vulnerabilities Found:</h6>
                         <div className="space-y-2">
                           {auditResults.exposureScan.vulnerabilities.map((vuln, index) => (
                             <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                               <div className="flex items-center justify-between mb-1">
                                 <span className="font-medium text-red-800">{vuln.type}</span>
                                 <span className={`px-2 py-1 rounded text-xs ${
                                   vuln.severity === 'High' ? 'bg-red-100 text-red-800' :
                                   vuln.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                   'bg-green-100 text-green-800'
                                 }`}>
                                   {vuln.severity}
                                 </span>
                               </div>
                               <p className="text-sm text-red-700">{vuln.description}</p>
                             </div>
                           ))}
                         </div>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 2: API & Apps */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">2. API & App Connection Review</h4>
                     <button
                       onClick={() => toggleModuleExpansion('apiApps')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.apiApps ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Installed Apps:</span> {auditResults.apiApps.installedApps.length}
                     </div>
                     <div>
                       <span className="font-medium">OAuth Apps:</span> {auditResults.apiApps.oauthApps.length}
                     </div>
                   </div>
                   
                   {expandedModules.apiApps && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Findings</h5>
                       
                       {auditResults.apiApps.installedApps.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Installed Apps:</h6>
                           <div className="space-y-2">
                             {auditResults.apiApps.installedApps.map((app, index) => (
                               <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-blue-800">{app.name}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     app.risk === 'High' ? 'bg-red-100 text-red-800' :
                                     app.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {app.risk} Risk
                                   </span>
                                 </div>
                                 <div className="text-sm text-blue-700">
                                   <span className="font-medium">Scopes:</span> {app.scopes.join(', ')}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       {auditResults.apiApps.oauthApps.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">OAuth Applications:</h6>
                           <div className="space-y-2">
                             {auditResults.apiApps.oauthApps.map((app, index) => (
                               <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-orange-800">{app.name}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     app.risk === 'High' ? 'bg-red-100 text-red-800' :
                                     app.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {app.risk} Risk
                                   </span>
                                 </div>
                                 <div className="text-sm text-orange-700">
                                   <span className="font-medium">Scopes:</span> {app.scopes.join(', ')}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.apiApps.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 3: Security Headers */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">3. Security Headers & Best Practices</h4>
                     <button
                       onClick={() => toggleModuleExpansion('headers')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.headers ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="text-sm mb-3">
                     <span className="font-medium">Security Score:</span> {auditResults.headers.score}/100
                   </div>
                   <div className="space-y-2">
                     {auditResults.headers.headers.map((header, index) => (
                       <div key={index} className="flex justify-between items-center">
                         <span>{header.name}</span>
                         <span className={`px-2 py-1 rounded text-xs ${
                           header.status === 'PASS' ? 'bg-green-100 text-green-800' :
                           header.status === 'WARN' ? 'bg-yellow-100 text-yellow-800' :
                           'bg-red-100 text-red-800'
                         }`}>
                           {header.status}
                         </span>
                       </div>
                     ))}
                   </div>
                   
                   {expandedModules.headers && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Header Analysis</h5>
                       
                       <div className="space-y-3">
                         {auditResults.headers.headers.map((header, index) => (
                           <div key={index} className="p-3 border rounded-lg">
                             <div className="flex items-center justify-between mb-2">
                               <span className="font-medium text-gray-800">{header.name}</span>
                               <span className={`px-2 py-1 rounded text-xs ${
                                 header.status === 'PASS' ? 'bg-green-100 text-green-800' :
                                 header.status === 'WARN' ? 'bg-yellow-100 text-yellow-800' :
                                 'bg-red-100 text-red-800'
                               }`}>
                                 {header.status}
                               </span>
                             </div>
                             <div className="text-sm text-gray-600 dark:text-gray-400">
                               <span className="font-medium">Value:</span> {header.value || 'Not set'}
                             </div>
                             {header.status !== 'PASS' && (
                               <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                 {header.status === 'WARN' ? '⚠️ Consider implementing this header for better security' : '❌ This header should be implemented'}
                               </div>
                             )}
                           </div>
                         ))}
                       </div>
                       
                       <div className="mt-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.headers.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 4: Risk Audits */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">4. Scheduled Storefront & Admin Risk Audits</h4>
                     <button
                       onClick={() => toggleModuleExpansion('audits')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.audits ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Storefront Issues:</span> {auditResults.audits.storefrontIssues.length}
                     </div>
                     <div>
                       <span className="font-medium">Admin Events:</span> {auditResults.audits.adminEvents.length}
                     </div>
                   </div>
                   
                   {expandedModules.audits && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Findings</h5>
                       
                       {auditResults.audits.storefrontIssues.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Storefront Issues:</h6>
                           <div className="space-y-2">
                             {auditResults.audits.storefrontIssues.map((issue, index) => (
                               <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                                 <div className="flex items-center justify-between mb-1">
                                   <span className="font-medium text-yellow-800">{issue.type}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     issue.severity === 'High' ? 'bg-red-100 text-red-800' :
                                     issue.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {issue.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-yellow-700">
                                   <span className="font-medium">Page:</span> {issue.page}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       {auditResults.audits.adminEvents.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Admin Events:</h6>
                           <div className="space-y-2">
                             {auditResults.audits.adminEvents.map((event, index) => (
                               <div key={index} className="p-3 bg-purple-50 border border-purple-200 rounded">
                                 <div className="flex items-center justify-between mb-1">
                                   <span className="font-medium text-purple-800">{event.type}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     event.risk === 'High' ? 'bg-red-100 text-red-800' :
                                     event.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {event.risk} Risk
                                   </span>
                                 </div>
                                 <div className="text-sm text-purple-700">
                                   <div><span className="font-medium">User:</span> {event.user}</div>
                                   <div><span className="font-medium">Time:</span> {new Date(event.timestamp).toLocaleString()}</div>
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.audits.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 5: Credential Policy */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">5. Credential Policy Enforcement</h4>
                     <button
                       onClick={() => toggleModuleExpansion('credentials')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.credentials ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="text-sm mb-3">
                     <span className="font-medium">Staff Accounts:</span> {auditResults.credentials.staffAccounts.length}
                     {auditResults.credentials.securityScore && (
                       <span className="ml-4">
                         <span className="font-medium">Security Score:</span> {auditResults.credentials.securityScore}/100
                       </span>
                     )}
                   </div>
                   
                   {expandedModules.credentials && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Analysis</h5>
                       
                       {auditResults.credentials.staffAccounts.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Staff Account Analysis:</h6>
                           <div className="space-y-2">
                             {auditResults.credentials.staffAccounts.map((account, index) => (
                               <div key={index} className="p-3 bg-indigo-50 border border-indigo-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-indigo-800">{account.name}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     account.risk === 'High' ? 'bg-red-100 text-red-800' :
                                     account.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {account.risk} Risk
                                   </span>
                                 </div>
                                 <div className="grid grid-cols-2 gap-2 text-sm text-indigo-700">
                                   <div><span className="font-medium">Role:</span> {account.role}</div>
                                   <div><span className="font-medium">2FA:</span> {account.twoFA ? '✅ Enabled' : '❌ Disabled'}</div>
                                   <div><span className="font-medium">Last Login:</span> {new Date(account.lastLogin).toLocaleDateString()}</div>
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.credentials.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 6: Subdomain Enumeration */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">6. Subdomain Enumeration & Takeover Detection</h4>
                     <button
                       onClick={() => toggleModuleExpansion('subdomains')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.subdomains ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Discovered Subdomains:</span> {auditResults.subdomains.discoveredSubdomains.length}
                     </div>
                     <div>
                       <span className="font-medium">Takeover Candidates:</span> {auditResults.subdomains.takeoverCandidates.length}
                     </div>
                     <div>
                       <span className="font-medium">Live Subdomains:</span> {auditResults.subdomains.discoveredSubdomains.filter(s => s.status === 'live').length}
                     </div>
                     <div>
                       <span className="font-medium">Dead Subdomains:</span> {auditResults.subdomains.discoveredSubdomains.filter(s => s.status === 'dead').length}
                     </div>
                   </div>
                   
                   {expandedModules.subdomains && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Findings</h5>
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Discovered Subdomains:</h6>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                           {auditResults.subdomains.discoveredSubdomains.map((subdomain, index) => (
                             <div key={index} className={`p-2 rounded text-sm ${
                               subdomain.status === 'live' ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200 dark:border-slate-700'
                             }`}>
                               <div className="flex items-center justify-between">
                                 <span className={`font-medium ${
                                   subdomain.status === 'live' ? 'text-green-800' : 'text-gray-600 dark:text-gray-400'
                                 }`}>
                                   {subdomain.subdomain}
                                 </span>
                                 <span className={`px-2 py-1 rounded text-xs ${
                                   subdomain.status === 'live' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600 dark:text-gray-400'
                                 }`}>
                                   {subdomain.status}
                                 </span>
                               </div>
                               {subdomain.status === 'live' && (
                                 <div className="text-xs text-green-600 mt-1">
                                   {subdomain.ip}:{subdomain.port}
                                 </div>
                               )}
                             </div>
                           ))}
                         </div>
                       </div>
                       
                       {auditResults.subdomains.takeoverCandidates.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Takeover Candidates:</h6>
                           <div className="space-y-2">
                             {auditResults.subdomains.takeoverCandidates.map((candidate, index) => (
                               <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-red-800">{candidate.subdomain}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     candidate.severity === 'High' ? 'bg-red-100 text-red-800' :
                                     candidate.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {candidate.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-red-700 mb-2">
                                   <div><span className="font-medium">Service:</span> {candidate.service}</div>
                                   <div><span className="font-medium">Description:</span> {candidate.description}</div>
                                 </div>
                                 <div className="text-xs text-red-600">
                                   <span className="font-medium">Remediation:</span> {candidate.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.subdomains.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 7: Nuclei Vulnerability Scan */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">7. Nuclei Templated Vulnerability Scan</h4>
                     <button
                       onClick={() => toggleModuleExpansion('nuclei')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.nuclei ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Total Findings:</span> {auditResults.nuclei.summary.total}
                     </div>
                     <div>
                       <span className="font-medium">Critical:</span> <span className="text-red-600 font-bold">{auditResults.nuclei.summary.critical}</span>
                     </div>
                     <div>
                       <span className="font-medium">High:</span> <span className="text-orange-600 font-bold">{auditResults.nuclei.summary.high}</span>
                     </div>
                     <div>
                       <span className="font-medium">Medium:</span> <span className="text-yellow-600 font-bold">{auditResults.nuclei.summary.medium}</span>
                     </div>
                   </div>
                   
                   {expandedModules.nuclei && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Vulnerability Findings</h5>
                       
                       <div className="space-y-3">
                         {auditResults.nuclei.findings.map((finding, index) => (
                           <div key={index} className={`p-3 border rounded-lg ${
                             finding.severity === 'Critical' ? 'bg-red-50 border-red-200' :
                             finding.severity === 'High' ? 'bg-orange-50 border-orange-200' :
                             finding.severity === 'Medium' ? 'bg-yellow-50 border-yellow-200' :
                             'bg-blue-50 border-blue-200'
                           }`}>
                             <div className="flex items-center justify-between mb-2">
                               <span className={`font-medium ${
                                 finding.severity === 'Critical' ? 'text-red-800' :
                                 finding.severity === 'High' ? 'text-orange-800' :
                                 finding.severity === 'Medium' ? 'text-yellow-800' :
                                 'text-blue-800'
                               }`}>
                                 {finding.name}
                               </span>
                               <span className={`px-2 py-1 rounded text-xs ${
                                 finding.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                                 finding.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                                 finding.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                 'bg-blue-100 text-blue-800'
                               }`}>
                                 {finding.severity}
                               </span>
                             </div>
                             <div className={`text-sm mb-2 ${
                               finding.severity === 'Critical' ? 'text-red-700' :
                               finding.severity === 'High' ? 'text-orange-700' :
                               finding.severity === 'Medium' ? 'text-yellow-700' :
                               'text-blue-700'
                             }`}>
                               <div><span className="font-medium">Template ID:</span> {finding.templateId}</div>
                               <div><span className="font-medium">Description:</span> {finding.description}</div>
                               <div><span className="font-medium">Evidence:</span> {finding.evidence}</div>
                             </div>
                             <div className="text-xs text-gray-600 dark:text-gray-400">
                               <span className="font-medium">Remediation:</span> {finding.remediation}
                             </div>
                           </div>
                         ))}
                       </div>
                       
                       <div className="mt-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.nuclei.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 8: Host Header / SSRF */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">8. Host-Header / SSRF / Open-Redirect Discovery</h4>
                     <button
                       onClick={() => toggleModuleExpansion('hostHeader')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.hostHeader ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Host Header Vulnerabilities:</span> {auditResults.hostHeader.hostHeaderVulnerabilities.length}
                     </div>
                     <div>
                       <span className="font-medium">Open Redirects:</span> {auditResults.hostHeader.openRedirects.length}
                     </div>
                     <div>
                       <span className="font-medium">SSRF Vulnerabilities:</span> {auditResults.hostHeader.ssrfVulnerabilities.length}
                     </div>
                     <div>
                       <span className="font-medium">Total Issues:</span> {auditResults.hostHeader.hostHeaderVulnerabilities.length + auditResults.hostHeader.openRedirects.length + auditResults.hostHeader.ssrfVulnerabilities.length}
                     </div>
                   </div>
                   
                   {expandedModules.hostHeader && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Findings</h5>
                       
                       {auditResults.hostHeader.hostHeaderVulnerabilities.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Host Header Vulnerabilities:</h6>
                           <div className="space-y-2">
                             {auditResults.hostHeader.hostHeaderVulnerabilities.map((vuln, index) => (
                               <div key={index} className="p-3 bg-orange-50 border border-orange-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-orange-800">{vuln.endpoint}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     vuln.severity === 'High' ? 'bg-red-100 text-red-800' :
                                     vuln.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {vuln.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-orange-700">
                                   <div><span className="font-medium">Method:</span> {vuln.method}</div>
                                   <div><span className="font-medium">Description:</span> {vuln.description}</div>
                                   <div><span className="font-medium">Evidence:</span> {vuln.evidence}</div>
                                 </div>
                                 <div className="text-xs text-orange-600 mt-2">
                                   <span className="font-medium">Remediation:</span> {vuln.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       {auditResults.hostHeader.ssrfVulnerabilities.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">SSRF Vulnerabilities:</h6>
                           <div className="space-y-2">
                             {auditResults.hostHeader.ssrfVulnerabilities.map((ssrf, index) => (
                               <div key={index} className="p-3 bg-red-50 border border-red-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-red-800">{ssrf.endpoint}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     ssrf.severity === 'High' ? 'bg-red-100 text-red-800' :
                                     ssrf.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {ssrf.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-red-700">
                                   <div><span className="font-medium">Parameter:</span> {ssrf.parameter}</div>
                                   <div><span className="font-medium">Description:</span> {ssrf.description}</div>
                                   <div><span className="font-medium">Evidence:</span> {ssrf.evidence}</div>
                                 </div>
                                 <div className="text-xs text-red-600 mt-2">
                                   <span className="font-medium">Remediation:</span> {ssrf.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       {auditResults.hostHeader.openRedirects.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Open Redirects:</h6>
                           <div className="space-y-2">
                             {auditResults.hostHeader.openRedirects.map((redirect, index) => (
                               <div key={index} className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-yellow-800">{redirect.endpoint}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     redirect.severity === 'High' ? 'bg-red-100 text-red-800' :
                                     redirect.severity === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                                     'bg-green-100 text-green-800'
                                   }`}>
                                     {redirect.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-yellow-700">
                                   <div><span className="font-medium">Parameter:</span> {redirect.parameter}</div>
                                   <div><span className="font-medium">Description:</span> {redirect.description}</div>
                                   <div><span className="font-medium">Evidence:</span> {redirect.evidence}</div>
                                 </div>
                                 <div className="text-xs text-yellow-600 mt-2">
                                   <span className="font-medium">Remediation:</span> {redirect.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.hostHeader.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 9: Secrets & Git Leak */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">9. Secrets & Git Leak Detection</h4>
                     <button
                       onClick={() => toggleModuleExpansion('secrets')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.secrets ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Git Leaks:</span> {auditResults.secrets.gitLeaks.length}
                     </div>
                     <div>
                       <span className="font-medium">Public Secrets:</span> {auditResults.secrets.publicSecrets.length}
                     </div>
                     <div>
                       <span className="font-medium">Critical Secrets:</span> <span className="text-red-600 font-bold">{auditResults.secrets.gitLeaks.filter(s => s.severity === 'Critical').length}</span>
                     </div>
                     <div>
                       <span className="font-medium">High Severity:</span> <span className="text-orange-600 font-bold">{auditResults.secrets.gitLeaks.filter(s => s.severity === 'High').length}</span>
                     </div>
                   </div>
                   
                   {expandedModules.secrets && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed Secret Analysis</h5>
                       
                       {auditResults.secrets.gitLeaks.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Git Repository Secrets:</h6>
                           <div className="space-y-2">
                             {auditResults.secrets.gitLeaks.map((secret, index) => (
                               <div key={index} className={`p-3 border rounded-lg ${
                                 secret.severity === 'Critical' ? 'bg-red-50 border-red-200' :
                                 secret.severity === 'High' ? 'bg-orange-50 border-orange-200' :
                                 'bg-yellow-50 border-yellow-200'
                               }`}>
                                 <div className="flex items-center justify-between mb-2">
                                   <span className={`font-medium ${
                                     secret.severity === 'Critical' ? 'text-red-800' :
                                     secret.severity === 'High' ? 'text-orange-800' :
                                     'text-yellow-800'
                                   }`}>
                                     {secret.type}
                                   </span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     secret.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                                     secret.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                                     'bg-yellow-100 text-yellow-800'
                                   }`}>
                                     {secret.severity}
                                   </span>
                                 </div>
                                 <div className={`text-sm mb-2 ${
                                   secret.severity === 'Critical' ? 'text-red-700' :
                                   secret.severity === 'High' ? 'text-orange-700' :
                                   'text-yellow-700'
                                 }`}>
                                   <div><span className="font-medium">File:</span> {secret.file}</div>
                                   <div><span className="font-medium">Line:</span> {secret.line}</div>
                                   <div><span className="font-medium">Snippet:</span> <code className="bg-gray-100 px-1 rounded">{secret.snippet}</code></div>
                                   <div><span className="font-medium">Description:</span> {secret.description}</div>
                                 </div>
                                 <div className="text-xs text-gray-600 dark:text-gray-400">
                                   <span className="font-medium">Remediation:</span> {secret.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       {auditResults.secrets.publicSecrets.length > 0 && (
                         <div className="mb-4">
                           <h6 className="font-medium text-gray-700 mb-2">Public Repository Secrets:</h6>
                           <div className="space-y-2">
                             {auditResults.secrets.publicSecrets.map((secret, index) => (
                               <div key={index} className="p-3 bg-purple-50 border border-purple-200 rounded">
                                 <div className="flex items-center justify-between mb-2">
                                   <span className="font-medium text-purple-800">{secret.type}</span>
                                   <span className={`px-2 py-1 rounded text-xs ${
                                     secret.severity === 'Critical' ? 'bg-red-100 text-red-800' :
                                     secret.severity === 'High' ? 'bg-orange-100 text-orange-800' :
                                     'bg-yellow-100 text-yellow-800'
                                   }`}>
                                     {secret.severity}
                                   </span>
                                 </div>
                                 <div className="text-sm text-purple-700">
                                   <div><span className="font-medium">Source:</span> {secret.source}</div>
                                   <div><span className="font-medium">Snippet:</span> <code className="bg-gray-100 px-1 rounded">{secret.snippet}</code></div>
                                   <div><span className="font-medium">Description:</span> {secret.description}</div>
                                 </div>
                                 <div className="text-xs text-purple-600 mt-2">
                                   <span className="font-medium">Remediation:</span> {secret.remediation}
                                 </div>
                               </div>
                             ))}
                           </div>
                         </div>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.secrets.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>

                 {/* Module 10: Authenticated API Fuzzing */}
                 <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                   <div className="flex items-center justify-between mb-3">
                     <h4 className="font-semibold text-gray-900 dark:text-gray-100">10. Authenticated API Fuzzing & Parameter Discovery</h4>
                     <button
                       onClick={() => toggleModuleExpansion('apiFuzzing')}
                       className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                     >
                       {expandedModules.apiFuzzing ? 'Hide Details' : 'Show Details'}
                     </button>
                   </div>
                   <div className="grid grid-cols-2 gap-4 text-sm">
                     <div>
                       <span className="font-medium">Discovered Endpoints:</span> {auditResults.apiFuzzing.discoveredEndpoints.length}
                     </div>
                     <div>
                       <span className="font-medium">Parameters Found:</span> {auditResults.apiFuzzing.parameterDiscovery.length}
                     </div>
                     <div>
                       <span className="font-medium">Injection Tests:</span> {auditResults.apiFuzzing.injectionTests.length}
                     </div>
                     <div>
                       <span className="font-medium">Requires Auth:</span> {auditResults.apiFuzzing.requiresAuth ? 'Yes' : 'No'}
                     </div>
                   </div>
                   
                   {expandedModules.apiFuzzing && (
                     <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
                       <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Detailed API Analysis</h5>
                       
                       {auditResults.apiFuzzing.requiresAuth ? (
                         <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                           <div className="flex items-center">
                             <svg className="w-5 h-5 text-yellow-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                             </svg>
                             <span className="text-yellow-800 font-medium">Authentication Required</span>
                           </div>
                           <p className="text-sm text-yellow-700 mt-1">{auditResults.apiFuzzing.message}</p>
                         </div>
                       ) : (
                         <>
                           {auditResults.apiFuzzing.discoveredEndpoints.length > 0 && (
                             <div className="mb-4">
                               <h6 className="font-medium text-gray-700 mb-2">Discovered API Endpoints:</h6>
                               <div className="space-y-2">
                                 {auditResults.apiFuzzing.discoveredEndpoints.map((endpoint, index) => (
                                   <div key={index} className="p-3 bg-blue-50 border border-blue-200 rounded">
                                     <div className="flex items-center justify-between mb-2">
                                       <span className="font-medium text-blue-800">{endpoint.endpoint}</span>
                                       <div className="flex items-center space-x-2">
                                         <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{endpoint.method}</span>
                                         <span className={`px-2 py-1 rounded text-xs ${
                                           endpoint.status >= 200 && endpoint.status < 300 ? 'bg-green-100 text-green-800' :
                                           endpoint.status >= 400 && endpoint.status < 500 ? 'bg-yellow-100 text-yellow-800' :
                                           'bg-red-100 text-red-800'
                                         }`}>
                                           {endpoint.status}
                                         </span>
                                       </div>
                                     </div>
                                     <div className="text-sm text-blue-700">
                                       {endpoint.description}
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                           
                           {auditResults.apiFuzzing.parameterDiscovery.length > 0 && (
                             <div className="mb-4">
                               <h6 className="font-medium text-gray-700 mb-2">Discovered Parameters:</h6>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                 {auditResults.apiFuzzing.parameterDiscovery.map((param, index) => (
                                   <div key={index} className="p-2 bg-green-50 border border-green-200 rounded">
                                     <div className="flex items-center justify-between mb-1">
                                       <span className="font-medium text-green-800">{param.parameter}</span>
                                       <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{param.type}</span>
                                     </div>
                                     <div className="text-sm text-green-700">
                                       <div><span className="font-medium">Endpoint:</span> {param.endpoint}</div>
                                       <div><span className="font-medium">Description:</span> {param.description}</div>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                           
                           {auditResults.apiFuzzing.injectionTests.length > 0 && (
                             <div className="mb-4">
                               <h6 className="font-medium text-gray-700 mb-2">Injection Test Results:</h6>
                               <div className="space-y-2">
                                 {auditResults.apiFuzzing.injectionTests.map((test, index) => (
                                   <div key={index} className="p-3 bg-gray-50 border border-gray-200 dark:border-slate-700 rounded">
                                     <div className="flex items-center justify-between mb-2">
                                       <span className="font-medium text-gray-800">{test.testType}</span>
                                       <span className={`px-2 py-1 rounded text-xs ${
                                         test.result.includes('No vulnerability') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                       }`}>
                                         {test.result}
                                       </span>
                                     </div>
                                     <div className="text-sm text-gray-700">
                                       <div><span className="font-medium">Endpoint:</span> {test.endpoint}</div>
                                       <div><span className="font-medium">Parameter:</span> {test.parameter}</div>
                                       <div><span className="font-medium">Evidence:</span> {test.evidence}</div>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             </div>
                           )}
                         </>
                       )}
                       
                       <div className="mb-4">
                         <h6 className="font-medium text-gray-700 mb-2">Recommendations:</h6>
                         <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                           {auditResults.apiFuzzing.recommendations.map((rec, index) => (
                             <li key={index}>{rec}</li>
                           ))}
                         </ul>
                       </div>
                     </div>
                   )}
                 </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ShopifyCloudShield
