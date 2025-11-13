import WapitiScan from './WapitiScan'

const WordPressScan = () => {
  const detectWordPress = async (url) => {
    // Demo mode: Check for known WordPress and non-WordPress sites
    const demoWordPressSites = [
      'wordpress.com',
      'wordpress.org',
      'wp.com',
      'example.wordpress.com'
    ]
    
    const demoNonWordPressSites = [
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
      'shopify.com',
      'myshopify.com'
    ]
    
    const urlHost = new URL(url).hostname.toLowerCase()
    
    // Check if it's a known WordPress site
    if (demoWordPressSites.some(site => urlHost.includes(site))) {
      return true
    }
    
    // Check if it's a known non-WordPress site
    if (demoNonWordPressSites.some(site => urlHost.includes(site))) {
      return false
    }
    
    try {
      // Try to fetch the site and check for WordPress indicators
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      if (response.ok) {
        const html = await response.text()
        
        // Check for WordPress indicators in the HTML
        const wordpressIndicators = [
          /wp-content/i,
          /wp-includes/i,
          /wp-json/i,
          /wordpress/i,
          /wp-admin/i,
          /generator.*wordpress/i,
          /wp-embed/i,
          /wp-emoji/i
        ]
        
        const hasWordPressIndicators = wordpressIndicators.some(pattern => pattern.test(html))
        
        // Also check for common WordPress meta tags
        const hasWordPressMeta = html.includes('generator') && html.includes('WordPress')
        
        return hasWordPressIndicators || hasWordPressMeta
      }
      
      return false
    } catch (error) {
      // If CORS blocks the request, use alternative detection methods
      console.log('CORS blocked, using alternative detection methods')
      
      // Method 1: Check for common WordPress URL patterns
      const urlPatterns = [
        /\.wordpress\.com/i,
        /wordpress\.org/i,
        /wp-content/i,
        /wp-admin/i
      ]
      
      const hasWordPressUrlPattern = urlPatterns.some(pattern => pattern.test(url))
      
      if (hasWordPressUrlPattern) {
        return true
      }
      
      // Method 2: Try to access common WordPress endpoints
      try {
        const wpJsonUrl = new URL('/wp-json/', url).href
        const wpJsonResponse = await fetch(wpJsonUrl, {
          method: 'HEAD',
          mode: 'no-cors'
        })
        // If we can't get a proper response due to CORS, we'll assume it might be WordPress
        // In a real implementation, you'd use a backend service to check this
        return false // Conservative approach - assume not WordPress if we can't verify
      } catch (wpJsonError) {
        // Method 3: Check for WordPress-specific subdirectories
        try {
          const wpContentUrl = new URL('/wp-content/', url).href
          const wpContentResponse = await fetch(wpContentUrl, {
            method: 'HEAD',
            mode: 'no-cors'
          })
          return false // Conservative approach
        } catch (wpContentError) {
          // If all methods fail, assume it's not WordPress
          return false
        }
      }
    }
  }

  const helpContent = (
    <>
      {/* What we check on WordPress */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          What we check on WordPress
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
          WordPress is a flexible CMS with many moving parts (core, themes, plugins). Our scan focuses on common and high-impact risks:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Plugin and theme vulnerabilities
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Plugins/themes are frequent sources of flaws. We fingerprint versions and look for indicators of known vulnerabilities.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Authentication and authorization weaknesses
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Weak login forms, missing rate-limiting, and poorly protected administrative pages.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Cross-Site Scripting (XSS)
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Both reflected and persistent XSS conditions that could allow attacker-supplied scripts to run in users' browsers.
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-5 border border-red-200 dark:border-red-800">
            <h5 className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              SQL injection indicators
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Patterns that suggest user-controlled input reaches database queries unsafely.
            </p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-5 border border-yellow-200 dark:border-yellow-800">
            <h5 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              File disclosure & backup exposures
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Accidentally accessible configuration, backup, or upload files that contain secrets.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Command execution and dangerous code paths
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Code execution vectors (e.g., poorly sanitized eval-like functions) surfaced by banner analysis and error patterns.
            </p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-5 border border-pink-200 dark:border-pink-800">
            <h5 className="font-semibold text-pink-900 dark:text-pink-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Server-level misconfigurations
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              TLS/SSL weaknesses, insecure headers, cookie flags, and unusual HTTP methods that reduce protection.
            </p>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-5 border border-teal-200 dark:border-teal-800">
            <h5 className="font-semibold text-teal-900 dark:text-teal-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Known WordPress-specific risks
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Outdated core, vulnerable plugins/themes, exposed readme/backups, and misconfigured REST/API endpoints.
            </p>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-5 border border-cyan-200 dark:border-cyan-800 md:col-span-2">
            <h5 className="font-semibold text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Automated content-discovery
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Hidden directories, admin pages, and upload endpoints that are often forgotten.
            </p>
          </div>
        </div>
      </div>

      {/* How the scanning modules map to WordPress risks */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          How the scanning modules map to WordPress risks (conceptually)
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          We use the capabilities you described to look for WordPress-specific issues:
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Application fingerprinting</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Identify WordPress and detect plugins/themes via known fingerprints.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">XSS detection (reflected & persistent)</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Reveals places where inputs can be stored or reflected back to users (e.g., comments, forms).</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">SQL injection checks (error/boolean/time-based)</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Surface inputs that might reach the database (search bars, custom fields, plugin endpoints).</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              4
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">File disclosure detection</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Finds exposed config files, backups, or uploads that could leak credentials.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              5
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Command execution detection & server-side checks</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Indicate risky code paths or vulnerable plugin features that may allow execution.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              6
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Header, cookie, and TLS evaluation</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Spot weak security headers, missing cookie flags, and TLS configurations that affect WordPress sessions.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              7
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Dangerous-file & backup search</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Detect backup archives, unprotected export files, or staging copies.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              8
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Brute force login form detection (dictionary-based)</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Test for common weak credentials or lack of rate limiting (in a safe, non-intrusive manner unless otherwise authorized).</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              9
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Subdomain takeover and open-redirect detection</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Identify DNS/hosting misconfigurations or redirect patterns that affect the WordPress ecosystem.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              10
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Automated crawling and scope controls</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Enumerate accessible pages, REST endpoints, and API routes used by plugins.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why WordPress owners need these scans */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          Why WordPress owners need these scans
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              High target density
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              WordPress sites are common targets because of third-party code.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Rapid plugin churn
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Plugins are added/removed frequently and may introduce vulnerabilities.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Sensitive data & user sessions
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Compromise can expose user data or allow account takeover.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Compliance and uptime
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Regular scanning helps satisfy auditing and uptime/security commitments.
            </p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <WapitiScan
      title="WordPress Cloud Shield"
      description="Comprehensive security scanning for WordPress sites using Wapiti. Detects XSS, SQL injection, and other web application vulnerabilities."
      helpContent={helpContent}
      onDetectionCheck={detectWordPress}
      detectionType="WordPress"
    />
  )
}

export default WordPressScan

