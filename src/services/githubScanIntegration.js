/**
 * GitHub Scan Integration - Integrates GitHub OAuth with API scanning services
 * Provides functions to scan GitHub repositories using the existing scanning infrastructure
 */

import { githubApi, scansApi, aiApi } from './index.js'

/**
 * GitHub Repository Scanning Integration
 * Combines GitHub OAuth with security scanning services
 */
export const githubScanIntegration = {
  /**
   * Scan a GitHub repository for security vulnerabilities
   * Integrates GitHub API with existing scanning services
   * @param {string} owner - Repository owner (username or org)
   * @param {string} repo - Repository name
   * @param {Object} scanConfig - Scan configuration
   * @param {Array} scanConfig.scanTypes - Types of scans to perform
   * @param {string} scanConfig.branch - Branch to scan (default: main)
   * @param {boolean} scanConfig.includeCode - Include code analysis (default: true)
   * @param {boolean} scanConfig.includeDependencies - Include dependency scanning (default: true)
   * @param {boolean} scanConfig.includeSecrets - Include secret scanning (default: true)
   * @param {Object} scanConfig.options - Additional scan options
   * @returns {Promise<Object>} Comprehensive scan results
   */
  async scanRepository(owner, repo, scanConfig = {}) {
    try {
      // Check authentication
      if (!githubApi.isAuthenticated()) {
        throw new Error('GitHub authentication required. Please authenticate first.')
      }

      const token = githubApi.getGitHubToken()

      // Get repository information
      const repoInfo = await githubApi.getRepositoryContents(owner, repo, {
        path: '',
        branch: scanConfig.branch || 'main'
      }, token)

      // Get repository branches
      const branches = await githubApi.getRepositoryBranches(owner, repo, token)

      // Perform API endpoint scan first
      let apiEndpointResults = null
      if (scanConfig.scanTypes?.includes('api-endpoints') || scanConfig.includeAPIEndpoints !== false) {
        try {
          apiEndpointResults = await githubApi.scanRepositoryAPIEndpoints(owner, repo, {
            scanTypes: ['discovery', 'mismatch', 'exposed'],
            branch: scanConfig.branch || 'main',
            options: {
              includeDocumentation: true,
              includeSwagger: true,
              includeOpenAPI: true,
              checkAuthentication: true,
              checkAuthorization: true,
              checkRateLimiting: true,
              checkCORS: true,
              ...scanConfig.options
            }
          }, token)
        } catch (error) {
          console.warn('API endpoint scan failed:', error)
          // Continue with other scans
        }
      }

      // Perform security scan using GitHub API endpoint
      const scanResult = await githubApi.scanRepository(owner, repo, {
        scanTypes: scanConfig.scanTypes || ['code', 'dependencies', 'secrets'],
        branch: scanConfig.branch || 'main',
        options: {
          includeCode: scanConfig.includeCode !== false,
          includeDependencies: scanConfig.includeDependencies !== false,
          includeSecrets: scanConfig.includeSecrets !== false,
          ...scanConfig.options
        }
      }, token)

      // Get AI analysis of scan results
      let aiAnalysis = null
      if (scanResult.completed && scanResult.results) {
        try {
          aiAnalysis = await aiApi.analyzeScanResults({
            scanType: 'github-repository',
            scanName: `GitHub Repository Scan: ${owner}/${repo}`,
            scanResults: scanResult.results,
            rawOutput: JSON.stringify(scanResult, null, 2),
            target: `https://github.com/${owner}/${repo}`
          })
        } catch (error) {
          console.warn('AI analysis failed:', error)
          // Continue without AI analysis
        }
      }

      return {
        success: true,
        repository: {
          owner,
          repo,
          branches: branches.data || branches,
          defaultBranch: branches.data?.[0]?.name || 'main'
        },
        scan: scanResult,
        apiEndpoints: apiEndpointResults,
        aiAnalysis,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('Failed to scan GitHub repository:', error)
      throw error
    }
  },

  /**
   * Scan multiple repositories in an organization
   * @param {string} org - Organization name
   * @param {Object} options - Scan options
   * @param {Array} options.repos - Specific repositories to scan (optional, scans all if not provided)
   * @param {Array} options.scanTypes - Types of scans to perform
   * @param {Function} options.onProgress - Progress callback (repo, status)
   * @returns {Promise<Array>} Array of scan results for each repository
   */
  async scanOrganizationRepos(org, options = {}) {
    try {
      // Check authentication
      if (!githubApi.isAuthenticated()) {
        throw new Error('GitHub authentication required. Please authenticate first.')
      }

      // Get organization repositories
      const reposResponse = await githubApi.getOrganizations()
      const orgs = reposResponse.data || reposResponse
      const targetOrg = orgs.find(o => o.login === org)

      if (!targetOrg) {
        throw new Error(`Organization '${org}' not found or not accessible`)
      }

      const reposResponse2 = await githubApi.getOrganizationRepos(org)
      const allRepos = reposResponse2.data || reposResponse2

      // Filter repositories if specific ones are requested
      const reposToScan = options.repos
        ? allRepos.filter(r => options.repos.includes(r.name))
        : allRepos

      const results = []
      const scanTypes = options.scanTypes || ['code', 'dependencies', 'secrets']

      // Scan each repository
      for (let i = 0; i < reposToScan.length; i++) {
        const repo = reposToScan[i]

        try {
          if (options.onProgress) {
            options.onProgress(repo.name, 'scanning', i + 1, reposToScan.length)
          }

          const scanResult = await this.scanRepository(repo.owner?.login || org, repo.name, {
            scanTypes,
            branch: repo.defaultBranch || 'main',
            options: options.scanOptions || {}
          })

          results.push({
            repository: repo.name,
            success: true,
            scan: scanResult
          })

          if (options.onProgress) {
            options.onProgress(repo.name, 'completed', i + 1, reposToScan.length)
          }

        } catch (error) {
          console.error(`Failed to scan repository ${repo.name}:`, error)
          results.push({
            repository: repo.name,
            success: false,
            error: error.message
          })

          if (options.onProgress) {
            options.onProgress(repo.name, 'failed', i + 1, reposToScan.length)
          }
        }
      }

      return {
        success: true,
        organization: org,
        totalRepos: reposToScan.length,
        scannedRepos: results.filter(r => r.success).length,
        failedRepos: results.filter(r => !r.success).length,
        results,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error('Failed to scan organization repositories:', error)
      throw error
    }
  },

  /**
   * Get scan status for a repository scan
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} scanId - Scan ID
   * @returns {Promise<Object>} Scan status
   */
  async getScanStatus(owner, repo, scanId) {
    try {
      return await githubApi.getRepositoryScanStatus(owner, repo, scanId)
    } catch (error) {
      console.error('Failed to get scan status:', error)
      throw error
    }
  },

  /**
   * Get scan results for a repository scan
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} scanId - Scan ID
   * @returns {Promise<Object>} Scan results
   */
  async getScanResults(owner, repo, scanId) {
    try {
      const results = await githubApi.getRepositoryScanResults(owner, repo, scanId)

      // Get AI analysis if results are available
      if (results.data && results.data.completed) {
        try {
          const aiAnalysis = await aiApi.analyzeScanResults({
            scanType: 'github-repository',
            scanName: `GitHub Repository Scan: ${owner}/${repo}`,
            scanResults: results.data,
            rawOutput: JSON.stringify(results.data, null, 2),
            target: `https://github.com/${owner}/${repo}`
          })

          return {
            ...results,
            aiAnalysis
          }
        } catch (error) {
          console.warn('AI analysis failed:', error)
        }
      }

      return results
    } catch (error) {
      console.error('Failed to get scan results:', error)
      throw error
    }
  },

  /**
   * Export scan results for a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} scanId - Scan ID
   * @param {string} format - Export format (pdf, json, csv, html)
   * @returns {Promise<Blob>} Exported file blob
   */
  async exportScanResults(owner, repo, scanId, format = 'pdf') {
    try {
      // Use the existing scans API export functionality
      return await scansApi.exportScanResults(scanId, format)
    } catch (error) {
      console.error('Failed to export scan results:', error)
      throw error
    }
  }
}

/**
 * Example usage:
 * 
 * import { githubApi, githubHelpers, githubScanIntegration } from '../services'
 * 
 * // Step 1: Authenticate with GitHub
 * const handleGitHubLogin = async () => {
 *   try {
 *     const result = await githubHelpers.completeOAuthFlow({
 *       redirect: 'myapp://github-callback'
 *     })
 *     console.log('GitHub authenticated:', result.user)
 *   } catch (error) {
 *     console.error('GitHub authentication failed:', error)
 *   }
 * }
 * 
 * // Step 2: Scan a repository
 * const scanRepo = async () => {
 *   try {
 *     const result = await githubScanIntegration.scanRepository('owner', 'repo-name', {
 *       scanTypes: ['code', 'dependencies', 'secrets'],
 *       branch: 'main',
 *       includeCode: true,
 *       includeDependencies: true,
 *       includeSecrets: true
 *     })
 *     console.log('Scan results:', result)
 *   } catch (error) {
 *     console.error('Scan failed:', error)
 *   }
 * }
 * 
 * // Step 3: Scan all repositories in an organization
 * const scanOrg = async () => {
 *   try {
 *     const result = await githubScanIntegration.scanOrganizationRepos('organization-name', {
 *       scanTypes: ['code', 'dependencies'],
 *       onProgress: (repo, status, current, total) => {
 *         console.log(`Scanning ${repo}: ${status} (${current}/${total})`)
 *       }
 *     })
 *     console.log('Organization scan results:', result)
 *   } catch (error) {
 *     console.error('Organization scan failed:', error)
 *   }
 * }
 */

export default githubScanIntegration
