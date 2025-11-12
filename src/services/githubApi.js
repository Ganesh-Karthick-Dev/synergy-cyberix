/**
 * GitHub API - Handles GitHub OAuth authentication and repository access
 * Integrates with the existing API scanning services
 */

import api from './api.js'
import { API_ENDPOINTS, API_ENV } from './apiConfig.js'

/**
 * GitHub API methods
 */
export const githubApi = {
  /**
   * Initiate GitHub OAuth flow for login (web-based)
   * This redirects to the backend OAuth endpoint which handles the full flow
   * @param {Object} options - OAuth options
   * @param {string} options.redirect - Redirect URL after authentication
   * @returns {Promise<string>} OAuth authorization URL
   */
  async initiateLoginOAuth(options = {}) {
    try {
      // For web-based login, redirect to backend OAuth endpoint
      // Keep the /api in the base URL since AUTH_LOGIN is relative to /api
      const baseUrl = API_ENV.BASE_URL // Keep /api in base URL
      const authUrl = `${baseUrl}${API_ENDPOINTS.GITHUB.AUTH_LOGIN}${options.redirect ? `?redirect=${encodeURIComponent(options.redirect)}` : ''}`

      // Redirect to the OAuth endpoint
      if (typeof window !== 'undefined') {
        window.location.href = authUrl
      }

      return authUrl
    } catch (error) {
      console.error('Failed to initiate GitHub OAuth login:', error)
      throw error
    }
  },

  /**
   * Initiate GitHub OAuth flow for API access (Electron apps)
   * Uses the primary GitHub OAuth endpoint: /api/github/auth
   * @param {Object} options - OAuth options
   * @param {string} options.redirect - Redirect URL after authentication (for Electron app)
   * @returns {Promise<string>} OAuth authorization URL
   */
  async initiateOAuth(options = {}) {
    try {
      const params = {}
      if (options.redirect) {
        params.redirect = options.redirect
      }

      // Use the primary GitHub OAuth endpoint (/api/github/auth)
      // Keep the /api in the base URL since AUTH is relative to /api
      const baseUrl = API_ENV.BASE_URL // Keep /api in base URL
      // Use AUTH endpoint for primary OAuth flow (/github/auth)
      const authUrl = `${baseUrl}${API_ENDPOINTS.GITHUB.AUTH}${options.redirect ? `?redirect=${encodeURIComponent(options.redirect)}` : ''}`

      return authUrl
    } catch (error) {
      console.error('Failed to initiate GitHub OAuth:', error)
      throw error
    }
  },

  /**
   * Handle GitHub OAuth callback
   * This is typically called after the OAuth flow completes
   * Uses the primary GitHub OAuth callback endpoint: /api/github/callback
   * @param {string} code - OAuth authorization code
   * @param {string} state - OAuth state parameter
   * @returns {Promise<Object>} OAuth response with access token and user info
   */
  async handleCallback(code, state) {
    try {
      // Use the primary GitHub OAuth callback endpoint (/api/github/callback)
      const response = await api.get(API_ENDPOINTS.GITHUB.CALLBACK, {
        params: {
          code,
          state
        }
      })

      // Store GitHub access token if provided
      // Handle different response structures
      const accessToken = response.data?.data?.accessToken || 
                         response.data?.accessToken || 
                         response.data?.data?.token ||
                         response.data?.token

      if (accessToken) {
        this.setGitHubToken(accessToken, true)
      }

      return response.data
    } catch (error) {
      console.error('Failed to handle GitHub OAuth callback:', error)
      throw error
    }
  },

  /**
   * Get authenticated user's GitHub profile
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} User profile information
   */
  async getUserInfo(token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.USER, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get GitHub user info:', error)
      throw error
    }
  },

  /**
   * Get user's GitHub organizations
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Array>} List of organizations
   */
  async getOrganizations(token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.ORGANIZATIONS, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get GitHub organizations:', error)
      throw error
    }
  },

  /**
   * Get repositories for a specific organization
   * @param {string} org - Organization name
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Array>} List of repositories
   */
  async getOrganizationRepos(org, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!org) {
        throw new Error('Organization name is required')
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.REPOS(org), {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get organization repositories:', error)
      throw error
    }
  },

  /**
   * Get repository contents (all files and directories recursively)
   * @param {string} owner - Repository owner (username or org name)
   * @param {string} repo - Repository name
   * @param {Object} options - Options for fetching contents
   * @param {string} options.path - Path to start from (default: root)
   * @param {string} options.branch - Branch name (default: default branch)
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Array>} Repository contents (files and directories)
   */
  async getRepositoryContents(owner, repo, options = {}, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!owner || !repo) {
        throw new Error('Owner and repository name are required')
      }

      const params = {}
      if (options.path) {
        params.path = options.path
      }
      if (options.branch) {
        params.branch = options.branch
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.REPO_CONTENTS(owner, repo), {
        params,
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get repository contents:', error)
      throw error
    }
  },

  /**
   * Get repository branches
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Array>} List of branches
   */
  async getRepositoryBranches(owner, repo, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!owner || !repo) {
        throw new Error('Owner and repository name are required')
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.REPO_BRANCHES(owner, repo), {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get repository branches:', error)
      throw error
    }
  },

  /**
   * Scan a GitHub repository for API endpoints
   * Discovers, analyzes, and checks for exposed/mismatched API endpoints
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} scanConfig - API scan configuration
   * @param {Array} scanConfig.scanTypes - Types of API scans (discovery, mismatch, exposed)
   * @param {string} scanConfig.branch - Branch to scan (default: default branch)
   * @param {Object} scanConfig.options - Additional scan options
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} API endpoint scan results
   */
  async scanRepositoryAPIEndpoints(owner, repo, scanConfig = {}, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!owner || !repo) {
        throw new Error('Owner and repository name are required')
      }

      const response = await api.post(API_ENDPOINTS.GITHUB.REPO_API_SCAN(owner, repo), {
        scanTypes: scanConfig.scanTypes || ['discovery', 'mismatch', 'exposed'],
        branch: scanConfig.branch || 'main',
        options: {
          includeDocumentation: scanConfig.includeDocumentation !== false,
          includeSwagger: scanConfig.includeSwagger !== false,
          includeOpenAPI: scanConfig.includeOpenAPI !== false,
          checkAuthentication: scanConfig.checkAuthentication !== false,
          checkAuthorization: scanConfig.checkAuthorization !== false,
          checkRateLimiting: scanConfig.checkRateLimiting !== false,
          checkCORS: scanConfig.checkCORS !== false,
          ...scanConfig.options
        }
      }, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to scan repository API endpoints:', error)
      throw error
    }
  },

  /**
   * Get discovered API endpoints from a repository
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} options - Options for endpoint discovery
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} Discovered API endpoints
   */
  async getRepositoryAPIEndpoints(owner, repo, options = {}, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!owner || !repo) {
        throw new Error('Owner and repository name are required')
      }

      const response = await api.get(API_ENDPOINTS.GITHUB.REPO_API_ENDPOINTS(owner, repo), {
        params: {
          branch: options.branch || 'main',
          includeDocumentation: options.includeDocumentation !== false,
          includeSwagger: options.includeSwagger !== false,
          includeOpenAPI: options.includeOpenAPI !== false
        },
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get repository API endpoints:', error)
      throw error
    }
  },

  /**
   * Scan a GitHub repository for security vulnerabilities
   * Integrates with the existing scanning services
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {Object} scanConfig - Scan configuration
   * @param {Array} scanConfig.scanTypes - Types of scans to perform
   * @param {string} scanConfig.branch - Branch to scan (default: default branch)
   * @param {Object} scanConfig.options - Additional scan options
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} Scan results
   */
  async scanRepository(owner, repo, scanConfig = {}, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      if (!owner || !repo) {
        throw new Error('Owner and repository name are required')
      }

      const response = await api.post(API_ENDPOINTS.GITHUB.REPO_SCAN(owner, repo), {
        scanTypes: scanConfig.scanTypes || ['code', 'dependencies', 'secrets'],
        branch: scanConfig.branch || 'main',
        options: scanConfig.options || {}
      }, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to scan repository:', error)
      throw error
    }
  },

  /**
   * Get scan status for a repository scan
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} scanId - Scan ID
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} Scan status
   */
  async getRepositoryScanStatus(owner, repo, scanId, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      const response = await api.get(`${API_ENDPOINTS.GITHUB.REPO_SCAN(owner, repo)}/${scanId}/status`, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get repository scan status:', error)
      throw error
    }
  },

  /**
   * Get scan results for a repository scan
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} scanId - Scan ID
   * @param {string} token - GitHub access token (optional, uses stored token if not provided)
   * @returns {Promise<Object>} Scan results
   */
  async getRepositoryScanResults(owner, repo, scanId, token = null) {
    try {
      const githubToken = token || this.getGitHubToken()
      if (!githubToken) {
        throw new Error('GitHub access token is required. Please authenticate first.')
      }

      const response = await api.get(`${API_ENDPOINTS.GITHUB.REPO_SCAN(owner, repo)}/${scanId}/results`, {
        headers: {
          'X-GitHub-Token': githubToken
        }
      })

      return response.data
    } catch (error) {
      console.error('Failed to get repository scan results:', error)
      throw error
    }
  },

  /**
   * Check if user is authenticated with GitHub
   * @returns {boolean} Whether user has a GitHub access token
   */
  isAuthenticated() {
    return !!this.getGitHubToken()
  },

  /**
   * Get stored GitHub access token
   * @returns {string|null} GitHub access token or null
   */
  getGitHubToken() {
    if (typeof window !== 'undefined') {
      return (
        localStorage.getItem('github_token') ||
        sessionStorage.getItem('github_token') ||
        null
      )
    }
    return null
  },

  /**
   * Set GitHub access token
   * @param {string} token - GitHub access token
   * @param {boolean} persistent - Whether to store persistently (default: true)
   */
  setGitHubToken(token, persistent = true) {
    if (typeof window !== 'undefined') {
      if (persistent) {
        localStorage.setItem('github_token', token)
      } else {
        sessionStorage.setItem('github_token', token)
      }
    }
  },

  /**
   * Clear GitHub access token
   */
  clearGitHubToken() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('github_token')
      sessionStorage.removeItem('github_token')
    }
  },

  /**
   * Logout from GitHub (clear token)
   */
  logout() {
    this.clearGitHubToken()
  }
}

export default githubApi
