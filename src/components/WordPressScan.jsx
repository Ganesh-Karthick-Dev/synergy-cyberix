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

  return (
    <WapitiScan
      title="WordPress Security Scan"
      description="Comprehensive security scanning for WordPress sites using Wapiti. Detects XSS, SQL injection, and other web application vulnerabilities."
      helpContent="WordPress Security Scan helps identify security vulnerabilities in your WordPress site. It performs comprehensive scans for XSS, SQL injection, and other common web application vulnerabilities. Make sure the site is accessible and you have permission to scan it."
      onDetectionCheck={detectWordPress}
      detectionType="WordPress"
    />
  )
}

export default WordPressScan

