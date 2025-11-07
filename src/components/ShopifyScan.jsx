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

  return (
    <WapitiScan
      title="Shopify Security Scan"
      description="Comprehensive security scanning for Shopify stores using Wapiti. Detects XSS, SQL injection, and other web application vulnerabilities."
      helpContent="Shopify Security Scan helps identify security vulnerabilities in your Shopify store. It performs comprehensive scans for XSS, SQL injection, and other common web application vulnerabilities. Make sure the store is accessible and you have permission to scan it."
      onDetectionCheck={detectShopify}
      detectionType="Shopify"
    />
  )
}

export default ShopifyScan

