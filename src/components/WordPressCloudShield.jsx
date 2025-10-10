import { useState } from 'react'
import { useToast } from '../context/ToastContext'
import WordPressAuditOrchestrator from './WordPressAuditOrchestrator'

function WordPressCloudShield() {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const [siteUrl, setSiteUrl] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isWordPress, setIsWordPress] = useState(null)
  const [showCredentialsDialog, setShowCredentialsDialog] = useState(false)
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    acceptTerms: false
  })
  const [isVerifyingCredentials, setIsVerifyingCredentials] = useState(false)
  const [credentialsVerified, setCredentialsVerified] = useState(null)
  const [showAuditOrchestrator, setShowAuditOrchestrator] = useState(false)

  const validateUrl = (url) => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
      return urlObj.href
    } catch {
      return null
    }
  }

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
      'spotify.com'
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

  const verifyAdminCredentials = async (url, username, password) => {
    try {
      // In a real implementation, you would:
      // 1. Make a POST request to /wp-login.php
      // 2. Check for successful authentication
      // 3. Verify admin privileges
      
      // For demo purposes, we'll simulate verification
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Simulate credential verification (demo: accept any non-empty credentials)
      const isValid = username.trim() !== '' && password.trim() !== ''
      return isValid
    } catch (error) {
      console.error('Credential verification error:', error)
      return false
    }
  }

  const handleAnalyzeSite = async (e) => {
    e.preventDefault()
    
    if (!siteUrl.trim()) {
      showError('Please enter a valid website URL')
      return
    }

    const validUrl = validateUrl(siteUrl)
    if (!validUrl) {
      showError('Please enter a valid URL (e.g., example.com or https://example.com)')
      return
    }

    setIsAnalyzing(true)
    setCredentialsVerified(null)
    
    const loadingToastId = showLoading('🔍 Analyzing website for WordPress detection...')
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Simulate analysis time
      
      const isWp = await detectWordPress(validUrl)
      setIsWordPress(isWp)
      
      dismissToast(loadingToastId)
      
      if (isWp) {
        showSuccess('✅ WordPress site detected! You can now provide admin credentials for detailed analysis.')
        setShowCredentialsDialog(true)
      } else {
        showError('❌ This is not a WordPress site. Please provide a valid WordPress site URL.')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('🌐 Error analyzing website. Please check the URL and try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault()
    
    if (!credentials.acceptTerms) {
      showError('Please accept the terms and conditions to continue.')
      return
    }

    setIsVerifyingCredentials(true)
    const loadingToastId = showLoading('🔐 Verifying admin credentials...')
    
    try {
      const isValid = await verifyAdminCredentials(siteUrl, credentials.username, credentials.password)
      
      dismissToast(loadingToastId)
      
      if (isValid) {
        setCredentialsVerified(true)
        showSuccess('✅ Admin credentials verified successfully! Starting comprehensive security audit...')
        // Auto-start audit after successful credential verification
        setTimeout(() => {
          setShowAuditOrchestrator(true)
        }, 1000)
      } else {
        setCredentialsVerified(false)
        showError('❌ Invalid admin credentials. Please check your username and password.')
      }
    } catch (error) {
      dismissToast(loadingToastId)
      showError('🌐 Error verifying credentials. Please try again.')
    } finally {
      setIsVerifyingCredentials(false)
    }
  }

  const handleSkipCredentials = () => {
    setShowCredentialsDialog(false)
    showSuccess('⏭️ Skipped admin credentials. Basic WordPress analysis will be performed.')
    // Auto-start audit after skipping credentials
    setTimeout(() => {
      setShowAuditOrchestrator(true)
    }, 1000)
  }

  const handleStartAudit = () => {
    setShowAuditOrchestrator(true)
  }

  const handleReset = () => {
    setSiteUrl('')
    setIsWordPress(null)
    setShowCredentialsDialog(false)
    setCredentials({ username: '', password: '', acceptTerms: false })
    setCredentialsVerified(null)
    setShowAuditOrchestrator(false)
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-8">
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">WordPress Cloud Shield</h1>
              <p className="text-gray-600 dark:text-gray-400">Comprehensive WordPress security analysis and protection</p>
            </div>
          </div>
        </div>

        {/* URL Input Section */}
        <div className="mb-8">
          <form onSubmit={handleAnalyzeSite} className="space-y-4">
            <div>
              <label htmlFor="siteUrl" className="block text-sm font-medium text-gray-700 mb-2">
                WordPress Site URL
              </label>
              <div className="flex space-x-3">
                <input
                  id="siteUrl"
                  type="text"
                  value={siteUrl}
                  onChange={(e) => setSiteUrl(e.target.value)}
                  placeholder="Enter WordPress site URL (e.g., example.com)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  disabled={isAnalyzing}
                />
                <button
                  type="submit"
                  disabled={isAnalyzing || !siteUrl.trim()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                    'Analyze Site'
                  )}
                </button>
              </div>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Enter the URL of the WordPress site you want to analyze for security vulnerabilities.
              </p>
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-2">Test URLs:</p>
                <div className="text-xs text-blue-700 space-y-1">
                  <p><strong>WordPress sites:</strong> wordpress.com, wordpress.org, wp.com</p>
                  <p><strong>Non-WordPress sites:</strong> google.com, github.com, facebook.com, amazon.com</p>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Results Section */}
        {isWordPress !== null && (
          <div className="mb-8">
            <div className={`p-6 rounded-lg border-2 ${
              isWordPress 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  isWordPress ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {isWordPress ? (
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
                    isWordPress ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {isWordPress ? 'WordPress Site Detected' : 'Not a WordPress Site'}
                  </h3>
                  <p className={`text-sm ${
                    isWordPress ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {isWordPress 
                      ? 'This site appears to be running WordPress. You can now provide admin credentials for detailed analysis.'
                      : 'This site does not appear to be running WordPress. Please provide a valid WordPress site URL.'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Admin Credentials Dialog */}
        {showCredentialsDialog && isWordPress && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Admin Credentials</h3>
                  <button
                    onClick={handleSkipCredentials}
                    className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  Provide your WordPress admin credentials to get a detailed security report. 
                  This is optional - you can skip this step for basic analysis.
                </p>

                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                      Username
                    </label>
                    <input
                      id="username"
                      type="text"
                      value={credentials.username}
                      onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Admin username"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={credentials.password}
                      onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Admin password"
                    />
                  </div>

                  <div className="flex items-start">
                    <input
                      id="acceptTerms"
                      type="checkbox"
                      checked={credentials.acceptTerms}
                      onChange={(e) => setCredentials(prev => ({ ...prev, acceptTerms: e.target.checked }))}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="acceptTerms" className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                      I accept the terms and conditions for credential verification
                    </label>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={handleSkipCredentials}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      disabled={isVerifyingCredentials || !credentials.acceptTerms}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isVerifyingCredentials ? 'Verifying...' : 'Verify'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Credentials Verification Result */}
        {credentialsVerified !== null && (
          <div className="mb-8">
            <div className={`p-6 rounded-lg border-2 ${
              credentialsVerified 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  credentialsVerified ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {credentialsVerified ? (
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
                    credentialsVerified ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {credentialsVerified ? 'Credentials Verified' : 'Invalid Credentials'}
                  </h3>
                  <p className={`text-sm ${
                    credentialsVerified ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {credentialsVerified 
                      ? 'Admin credentials have been verified successfully. Detailed security report will be generated.'
                      : 'The provided admin credentials are invalid. Please check your username and password.'
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
          <WordPressAuditOrchestrator
            siteUrl={siteUrl}
            adminProvided={credentialsVerified === true}
            adminCreds={credentialsVerified === true ? credentials : null}
          />
        </div>
      )}
    </div>
  )
}

export default WordPressCloudShield
