import WapitiScan from './WapitiScan'

const ShopifyScan = () => {
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
        
        return hasShopifyIndicators
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

  const helpContent = (
    <>
      {/* What we check on Shopify */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          What we check on Shopify
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
          Because Shopify is a hosted platform where core platform components are managed by Shopify, the focus shifts to the areas you control:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Theme code and template exposures
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Custom theme templates and assets that may leak information or contain insecure client-side code.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Third-party app interactions
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Apps and integrations that request excessive permissions or expose endpoints.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Content and client-side XSS
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Reflected or stored scripts in theme templates, app-provided widgets, or content fields.
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-5 border border-red-200 dark:border-red-800">
            <h5 className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L12 12m-5.71-5.71L12 12" />
              </svg>
              Open redirects and exposed parameters
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              URL patterns or redirect behaviors that could be abused.
            </p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-5 border border-yellow-200 dark:border-yellow-800">
            <h5 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              Insecure JavaScript or third-party scripts
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              External scripts loaded into the storefront that can modify DOM or capture data.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              API exposure through apps or public endpoints
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Misconfigured apps or webhook endpoints that accept unauthenticated input.
            </p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-5 border border-pink-200 dark:border-pink-800">
            <h5 className="font-semibold text-pink-900 dark:text-pink-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              TLS and header checks on storefront endpoints
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Ensure storefronts use modern TLS and appropriate security headers.
            </p>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-5 border border-teal-200 dark:border-teal-800">
            <h5 className="font-semibold text-teal-900 dark:text-teal-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Discovery of hidden or forgotten store assets
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Backup files, staging previews, or dev URLs that shouldn't be public.
            </p>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-5 border border-cyan-200 dark:border-cyan-800 md:col-span-2">
            <h5 className="font-semibold text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Misconfigured redirects or DNS issues
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Potential for subdomain takeover or incorrect DNS that affects store availability/security.
            </p>
          </div>
        </div>
      </div>

      {/* How the scanning modules map to Shopify risks */}
      <div className="space-y-4 mt-8">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          How the scanning modules map to Shopify risks (conceptually)
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          We use the available checks to identify Shopify-relevant issues without attempting to probe the platform's managed internals:
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Fingerprinting & asset enumeration</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Detect theme frameworks and third-party scripts used in the storefront.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">XSS detection</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Look for places where user-supplied content or third-party widgets could execute scripts on visitors' browsers.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">File disclosure & content discovery</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Find public assets, backups, staging previews, or misplaced files in the theme assets.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              4
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Header, cookie, and TLS evaluation</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Verify TLS configuration for custom domains and security headers for storefront pages.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              5
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Open redirect & uncommon HTTP method detection</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Reveal URL handling that could redirect users or accept unexpected methods.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              6
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Third-party app inspection (surface-level)</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Identify app endpoints and scripts loaded by apps; flag apps requesting broad privileges or calling external domains.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              7
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Client-side script analysis</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Flag risky patterns in included JavaScript (e.g., untrusted script injections, analytics scripts with excessive permissions).</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              8
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Subdomain takeover detection</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Surface dangling DNS records or unused subdomains related to the shop's domain.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why Shopify stores need these scans */}
      <div className="space-y-4 mt-8">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          Why Shopify stores need these scans
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Customer trust & payment flow
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Storefront vulnerabilities affect checkout, payment redirection, or customer data collection.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Third-party app risk
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Apps can introduce privacy or security weaknesses; identifying risky apps early reduces exposure.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              Theme customizations
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Custom themes are a common source of client-side issues that only appear at runtime.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Regulatory requirements
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              E-commerce sites must often demonstrate due diligence in protecting customer data.
            </p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <WapitiScan
      title="Shopify Security Scan"
      description="Comprehensive security scanning for Shopify stores using Wapiti. Detects XSS, SQL injection, and other web application vulnerabilities."
      helpContent={helpContent}
      onDetectionCheck={detectShopify}
      detectionType="Shopify"
    />
  )
}

export default ShopifyScan

