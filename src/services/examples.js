<<<<<<< HEAD
/**
 * API Services Usage Examples
 * This file demonstrates how to use the new axios-based API services
 * in your existing Electron + React application
 */

import { authApi, scansApi, aiApi, apiHelpers } from './index.js'

// =============================================
// AUTHENTICATION EXAMPLES
// =============================================

/**
 * Example: User login with the new API service
 */
export async function exampleLogin() {
  try {
    const credentials = {
      username: 'admin',
      password: 'admin@123',
      rememberMe: true
    }

    const response = await authApi.login(credentials)

    // Response includes user data and token (automatically stored)
    console.log('Login successful:', response.user)
    return response

  } catch (error) {
    // Error handling is automatic via interceptors
    // User-friendly toast notifications are shown
    console.error('Login failed:', error.message)
    throw error
  }
}

/**
 * Example: Check authentication status
 */
export function exampleCheckAuth() {
  const isAuthenticated = authApi.isAuthenticated()
  const token = authApi.getToken()

  console.log('Is authenticated:', isAuthenticated)
  console.log('Token exists:', !!token)

  return { isAuthenticated, hasToken: !!token }
}

/**
 * Example: Get user profile
 */
export async function exampleGetProfile() {
  try {
    const profile = await authApi.getProfile()
    console.log('User profile:', profile)
    return profile
  } catch (error) {
    console.error('Failed to get profile:', error.message)
    throw error
  }
}

// =============================================
// SCANNING EXAMPLES
// =============================================

/**
 * Example: Start a website security scan
 */
export async function exampleWebsiteScan() {
  try {
    const scanConfig = {
      target: 'https://example.com',
      scanTypes: ['vulnerability', 'malware', 'headers'],
      options: {
        depth: 2,
        followRedirects: true,
        timeout: 30000
      },
      priority: 'high'
    }

    const scanResponse = await scansApi.startWebsiteScan(scanConfig)
    console.log('Scan started:', scanResponse.scanId)

    // Poll for results (in real app, use WebSocket or polling)
    return scanResponse

  } catch (error) {
    console.error('Scan failed:', error.message)
    throw error
  }
}

/**
 * Example: Get scan results
 */
export async function exampleGetScanResults(scanId) {
  try {
    // Get scan status
    const status = await scansApi.getScanStatus(scanId)
    console.log('Scan status:', status)

    if (status.completed) {
      // Get full results
      const results = await scansApi.getScanResults(scanId)
      console.log('Scan results:', results)
      return results
    } else {
      console.log('Scan still running, progress:', status.progress)
      return status
    }

  } catch (error) {
    console.error('Failed to get scan results:', error.message)
    throw error
  }
}

/**
 * Example: Comprehensive security scan
 */
export async function exampleComprehensiveScan() {
  try {
    const scanConfig = {
      target: 'example.com',
      modules: [
        'website-security',
        'network-scan',
        'dns-enumeration',
        'subdomain-discovery'
      ],
      options: {
        aggressive: false,
        stealth: true,
        reportFormat: 'detailed'
      }
    }

    const response = await scansApi.startComprehensiveScan(scanConfig)
    console.log('Comprehensive scan started:', response)
    return response

  } catch (error) {
    console.error('Comprehensive scan failed:', error.message)
    throw error
  }
}

// =============================================
// AI ANALYSIS EXAMPLES
// =============================================

/**
 * Example: Get AI analysis for scan results
 */
export async function exampleAIAnalysis() {
  try {
    // This replaces the old getAISuggestions function
    const analysisData = {
      scanType: 'website-vulnerability',
      scanName: 'Website Security Audit',
      scanResults: {
        findings: [
          { type: 'warning', message: 'Outdated SSL certificate' },
          { type: 'error', message: 'XSS vulnerability found' }
        ],
        severity: 'high',
        status: 'completed'
      },
      rawOutput: 'nmap scan output here...',
      target: 'https://example.com'
    }

    const aiSuggestions = await aiApi.analyzeScanResults(analysisData)
    console.log('AI Analysis:', aiSuggestions)
    return aiSuggestions

  } catch (error) {
    console.error('AI analysis failed:', error.message)
    throw error
  }
}

/**
 * Example: Generate AI-powered security report
 */
export async function exampleGenerateReport() {
  try {
    const reportData = {
      scans: [
        { type: 'website', results: websiteResults },
        { type: 'network', results: networkResults }
      ],
      target: 'example.com',
      format: 'executive',
      includeRecommendations: true
    }

    const report = await aiApi.generateSecurityReport(reportData)
    console.log('AI Report generated:', report)
    return report

  } catch (error) {
    console.error('Report generation failed:', error.message)
    throw error
  }
}

// =============================================
// INTEGRATION WITH EXISTING COMPONENTS
// =============================================

/**
 * Example: Integration with existing MalwareDefacementMonitor component
 * This shows how to add API calls to your existing components
 */
export async function integrateWithExistingComponent() {
  // In your MalwareDefacementMonitor.jsx, you can now use:

  // Instead of direct fetch calls, use the API services
  try {
    // Start a malware scan
    const scanResult = await scansApi.startMalwareScan({
      target: 'https://example.com',
      deepScan: true,
      signatures: ['malware.yar', 'webshell.yar']
    })

    // Get AI analysis for the results
    if (scanResult.completed) {
      const aiAnalysis = await aiApi.analyzeScanResults({
        scanType: 'malware-detection',
        scanName: 'Malware Defacement Scan',
        scanResults: scanResult,
        rawOutput: scanResult.rawOutput,
        target: 'https://example.com'
      })

      return {
        scanResult,
        aiAnalysis
      }
    }

  } catch (error) {
    // Errors are handled automatically by interceptors
    console.error('Integration failed:', error)
    throw error
  }
}

/**
 * Example: Error handling in React components
 */
export function exampleReactComponentIntegration() {
  // In your React components, you can now do:

  /*
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)

  const handleScan = async () => {
    setLoading(true)
    try {
      const scanResult = await scansApi.startWebsiteScan({
        target: targetUrl,
        scanTypes: ['basic', 'vulnerability']
      })

      // Get AI suggestions
      const aiSuggestions = await aiApi.analyzeScanResults({
        scanType: 'website',
        scanName: 'Security Scan',
        scanResults: scanResult,
        target: targetUrl
      })

      setResults({ scan: scanResult, ai: aiSuggestions })
    } catch (error) {
      // Error toast is shown automatically by interceptors
      console.error('Scan failed:', error)
    } finally {
      setLoading(false)
    }
  }
  */

  return 'See component integration example above'
}

/**
 * Example: Using API helpers for advanced operations
 */
export async function exampleAPIHelpers() {
  // Upload a file
  const uploadResult = await apiHelpers.upload('/api/upload', file, (progress) => {
    console.log('Upload progress:', progress)
  })

  // Download a file
  await apiHelpers.download('/api/reports/123.pdf', 'security-report.pdf')

  // Make custom API calls
  const customResult = await apiHelpers.get('/api/custom/endpoint', {
    params: { filter: 'active' }
  })

  return { uploadResult, customResult }
}

// =============================================
// MIGRATION HELPERS
// =============================================

/**
 * Migration helper: Convert old fetch calls to new API service
 */
export function migrateFromFetch() {
  // OLD WAY (direct fetch):
  /*
  const oldWay = async () => {
    const response = await fetch('/api/scans/website', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        target: 'example.com',
        scanTypes: ['basic']
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return data
  }
  */

  // NEW WAY (axios API service):
  /*
  const newWay = async () => {
    return await scansApi.startWebsiteScan({
      target: 'example.com',
      scanTypes: ['basic']
    })
  }
  */

  console.log('Migration: Replace fetch calls with API service methods')
  console.log('Benefits: Automatic auth, error handling, retries, logging')
}
=======
/**
 * API Services Usage Examples
 * This file demonstrates how to use the new axios-based API services
 * in your existing Electron + React application
 */

import { authApi, scansApi, aiApi, apiHelpers } from './index.js'

// =============================================
// AUTHENTICATION EXAMPLES
// =============================================

/**
 * Example: User login with the new API service
 */
export async function exampleLogin() {
  try {
    const credentials = {
      username: 'admin',
      password: 'admin@123',
      rememberMe: true
    }

    const response = await authApi.login(credentials)

    // Response includes user data and token (automatically stored)
    console.log('Login successful:', response.user)
    return response

  } catch (error) {
    // Error handling is automatic via interceptors
    // User-friendly toast notifications are shown
    console.error('Login failed:', error.message)
    throw error
  }
}

/**
 * Example: Check authentication status
 */
export function exampleCheckAuth() {
  const isAuthenticated = authApi.isAuthenticated()
  const token = authApi.getToken()

  console.log('Is authenticated:', isAuthenticated)
  console.log('Token exists:', !!token)

  return { isAuthenticated, hasToken: !!token }
}

/**
 * Example: Get user profile
 */
export async function exampleGetProfile() {
  try {
    const profile = await authApi.getProfile()
    console.log('User profile:', profile)
    return profile
  } catch (error) {
    console.error('Failed to get profile:', error.message)
    throw error
  }
}

// =============================================
// SCANNING EXAMPLES
// =============================================

/**
 * Example: Start a website security scan
 */
export async function exampleWebsiteScan() {
  try {
    const scanConfig = {
      target: 'https://example.com',
      scanTypes: ['vulnerability', 'malware', 'headers'],
      options: {
        depth: 2,
        followRedirects: true,
        timeout: 30000
      },
      priority: 'high'
    }

    const scanResponse = await scansApi.startWebsiteScan(scanConfig)
    console.log('Scan started:', scanResponse.scanId)

    // Poll for results (in real app, use WebSocket or polling)
    return scanResponse

  } catch (error) {
    console.error('Scan failed:', error.message)
    throw error
  }
}

/**
 * Example: Get scan results
 */
export async function exampleGetScanResults(scanId) {
  try {
    // Get scan status
    const status = await scansApi.getScanStatus(scanId)
    console.log('Scan status:', status)

    if (status.completed) {
      // Get full results
      const results = await scansApi.getScanResults(scanId)
      console.log('Scan results:', results)
      return results
    } else {
      console.log('Scan still running, progress:', status.progress)
      return status
    }

  } catch (error) {
    console.error('Failed to get scan results:', error.message)
    throw error
  }
}

/**
 * Example: Comprehensive security scan
 */
export async function exampleComprehensiveScan() {
  try {
    const scanConfig = {
      target: 'example.com',
      modules: [
        'website-security',
        'network-scan',
        'dns-enumeration',
        'subdomain-discovery'
      ],
      options: {
        aggressive: false,
        stealth: true,
        reportFormat: 'detailed'
      }
    }

    const response = await scansApi.startComprehensiveScan(scanConfig)
    console.log('Comprehensive scan started:', response)
    return response

  } catch (error) {
    console.error('Comprehensive scan failed:', error.message)
    throw error
  }
}

// =============================================
// AI ANALYSIS EXAMPLES
// =============================================

/**
 * Example: Get AI analysis for scan results
 */
export async function exampleAIAnalysis() {
  try {
    // This replaces the old getAISuggestions function
    const analysisData = {
      scanType: 'website-vulnerability',
      scanName: 'Website Security Audit',
      scanResults: {
        findings: [
          { type: 'warning', message: 'Outdated SSL certificate' },
          { type: 'error', message: 'XSS vulnerability found' }
        ],
        severity: 'high',
        status: 'completed'
      },
      rawOutput: 'nmap scan output here...',
      target: 'https://example.com'
    }

    const aiSuggestions = await aiApi.analyzeScanResults(analysisData)
    console.log('AI Analysis:', aiSuggestions)
    return aiSuggestions

  } catch (error) {
    console.error('AI analysis failed:', error.message)
    throw error
  }
}

/**
 * Example: Generate AI-powered security report
 */
export async function exampleGenerateReport() {
  try {
    const reportData = {
      scans: [
        { type: 'website', results: websiteResults },
        { type: 'network', results: networkResults }
      ],
      target: 'example.com',
      format: 'executive',
      includeRecommendations: true
    }

    const report = await aiApi.generateSecurityReport(reportData)
    console.log('AI Report generated:', report)
    return report

  } catch (error) {
    console.error('Report generation failed:', error.message)
    throw error
  }
}

// =============================================
// INTEGRATION WITH EXISTING COMPONENTS
// =============================================

/**
 * Example: Integration with existing MalwareDefacementMonitor component
 * This shows how to add API calls to your existing components
 */
export async function integrateWithExistingComponent() {
  // In your MalwareDefacementMonitor.jsx, you can now use:

  // Instead of direct fetch calls, use the API services
  try {
    // Start a malware scan
    const scanResult = await scansApi.startMalwareScan({
      target: 'https://example.com',
      deepScan: true,
      signatures: ['malware.yar', 'webshell.yar']
    })

    // Get AI analysis for the results
    if (scanResult.completed) {
      const aiAnalysis = await aiApi.analyzeScanResults({
        scanType: 'malware-detection',
        scanName: 'Malware Defacement Scan',
        scanResults: scanResult,
        rawOutput: scanResult.rawOutput,
        target: 'https://example.com'
      })

      return {
        scanResult,
        aiAnalysis
      }
    }

  } catch (error) {
    // Errors are handled automatically by interceptors
    console.error('Integration failed:', error)
    throw error
  }
}

/**
 * Example: Error handling in React components
 */
export function exampleReactComponentIntegration() {
  // In your React components, you can now do:

  /*
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)

  const handleScan = async () => {
    setLoading(true)
    try {
      const scanResult = await scansApi.startWebsiteScan({
        target: targetUrl,
        scanTypes: ['basic', 'vulnerability']
      })

      // Get AI suggestions
      const aiSuggestions = await aiApi.analyzeScanResults({
        scanType: 'website',
        scanName: 'Security Scan',
        scanResults: scanResult,
        target: targetUrl
      })

      setResults({ scan: scanResult, ai: aiSuggestions })
    } catch (error) {
      // Error toast is shown automatically by interceptors
      console.error('Scan failed:', error)
    } finally {
      setLoading(false)
    }
  }
  */

  return 'See component integration example above'
}

/**
 * Example: Using API helpers for advanced operations
 */
export async function exampleAPIHelpers() {
  // Upload a file
  const uploadResult = await apiHelpers.upload('/api/upload', file, (progress) => {
    console.log('Upload progress:', progress)
  })

  // Download a file
  await apiHelpers.download('/api/reports/123.pdf', 'security-report.pdf')

  // Make custom API calls
  const customResult = await apiHelpers.get('/api/custom/endpoint', {
    params: { filter: 'active' }
  })

  return { uploadResult, customResult }
}

// =============================================
// MIGRATION HELPERS
// =============================================

/**
 * Migration helper: Convert old fetch calls to new API service
 */
export function migrateFromFetch() {
  // OLD WAY (direct fetch):
  /*
  const oldWay = async () => {
    const response = await fetch('/api/scans/website', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        target: 'example.com',
        scanTypes: ['basic']
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    return data
  }
  */

  // NEW WAY (axios API service):
  /*
  const newWay = async () => {
    return await scansApi.startWebsiteScan({
      target: 'example.com',
      scanTypes: ['basic']
    })
  }
  */

  console.log('Migration: Replace fetch calls with API service methods')
  console.log('Benefits: Automatic auth, error handling, retries, logging')
}
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
