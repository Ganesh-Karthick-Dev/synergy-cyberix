/**
 * GitHub OAuth Helpers - Electron integration utilities
 * Provides helper functions for integrating GitHub OAuth with Electron apps
 */

import { githubApi } from './index.js'
import { API_ENV } from './apiConfig.js'

/**
 * GitHub OAuth helpers for Electron integration
 */
export const githubHelpers = {
  /**
   * Initiate GitHub OAuth flow in Electron
   * Opens the OAuth URL in the default browser
   * @param {Object} options - OAuth options
   * @param {string} options.redirect - Custom redirect URL (default: myapp://github-callback)
   * @param {Function} options.onSuccess - Callback when OAuth succeeds
   * @param {Function} options.onError - Callback when OAuth fails
   * @returns {Promise<string>} OAuth authorization URL
   */
  async initiateOAuthInElectron(options = {}) {
    try {
      // Default redirect URL for Electron app
      const redirectUrl = options.redirect || 'myapp://github-callback'

      // Get OAuth URL
      const authUrl = await githubApi.initiateOAuth({ redirect: redirectUrl })

      // Open in default browser (Electron)
      if (window.cyberGuard && window.cyberGuard.openExternal) {
        await window.cyberGuard.openExternal(authUrl)
      } else if (window.electron && window.electron.shell) {
        await window.electron.shell.openExternal(authUrl)
      } else {
        // Fallback: open in new window
        window.open(authUrl, '_blank')
      }

      return authUrl
    } catch (error) {
      console.error('Failed to initiate GitHub OAuth in Electron:', error)
      if (options.onError) {
        options.onError(error)
      }
      throw error
    }
  },

  /**
   * Handle GitHub OAuth callback from Electron
   * Parses the callback URL and extracts token and user info
   * @param {string} callbackUrl - Callback URL from OAuth redirect
   * @returns {Promise<Object>} OAuth response with token and user info
   */
  async handleElectronCallback(callbackUrl) {
    try {
      const url = new URL(callbackUrl)
      const token = url.searchParams.get('token')
      const userParam = url.searchParams.get('user')

      if (!token) {
        throw new Error('No access token found in callback URL')
      }

      // Parse user info if provided
      let user = null
      if (userParam) {
        try {
          user = JSON.parse(decodeURIComponent(userParam))
        } catch (e) {
          console.warn('Failed to parse user info from callback:', e)
        }
      }

      // Store GitHub token
      githubApi.setGitHubToken(token, true)

      // Get user info if not provided in callback
      if (!user) {
        const userInfo = await githubApi.getUserInfo(token)
        user = userInfo.data || userInfo
      }

      return {
        success: true,
        token,
        user,
        message: 'GitHub authentication successful'
      }
    } catch (error) {
      console.error('Failed to handle Electron callback:', error)
      throw error
    }
  },

  /**
   * Setup Electron protocol handler for GitHub OAuth
   * Registers the custom protocol handler for OAuth callbacks
   * @param {string} protocol - Custom protocol (default: myapp)
   * @param {Function} callback - Callback function to handle OAuth response
   */
  setupElectronProtocolHandler(protocol = 'myapp', callback) {
    try {
      // In Electron main process, you would do:
      // app.setAsDefaultProtocolClient(protocol)
      // app.on('open-url', (event, url) => { ... })

      // In renderer process, listen for protocol events
      if (window.cyberGuard && window.cyberGuard.onProtocolUrl) {
        window.cyberGuard.onProtocolUrl((url) => {
          if (url.startsWith(`${protocol}://github-callback`)) {
            this.handleElectronCallback(url)
              .then((result) => {
                if (callback) {
                  callback(null, result)
                }
              })
              .catch((error) => {
                if (callback) {
                  callback(error, null)
                }
              })
          }
        })
      } else {
        console.warn('Electron protocol handler not available. Please set up in main process.')
      }
    } catch (error) {
      console.error('Failed to setup Electron protocol handler:', error)
      throw error
    }
  },

  /**
   * Complete GitHub OAuth flow in Electron
   * Combines initiation and callback handling
   * @param {Object} options - OAuth options
   * @param {string} options.redirect - Custom redirect URL
   * @param {number} options.timeout - Timeout in milliseconds (default: 5 minutes)
   * @returns {Promise<Object>} OAuth response with token and user info
   */
  async completeOAuthFlow(options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const redirectUrl = options.redirect || 'myapp://github-callback'
        const timeout = options.timeout || 300000 // 5 minutes

        // Setup protocol handler
        this.setupElectronProtocolHandler('myapp', (error, result) => {
          if (error) {
            reject(error)
          } else {
            resolve(result)
          }
        })

        // Initiate OAuth
        await this.initiateOAuthInElectron({ redirect: redirectUrl })

        // Set timeout
        const timeoutId = setTimeout(() => {
          reject(new Error('OAuth flow timed out. Please try again.'))
        }, timeout)

        // Clear timeout when resolved
        const originalResolve = resolve
        resolve = (value) => {
          clearTimeout(timeoutId)
          originalResolve(value)
        }

      } catch (error) {
        reject(error)
      }
    })
  },

  /**
   * Check if GitHub OAuth is configured
   * @returns {boolean} Whether GitHub OAuth is properly configured
   */
  isConfigured() {
    return !!(
      API_ENV.GITHUB_CLIENT_ID &&
      API_ENV.GITHUB_CLIENT_SECRET &&
      API_ENV.GITHUB_CALLBACK_URL
    )
  },

  /**
   * Get GitHub OAuth configuration status
   * @returns {Object} Configuration status
   */
  getConfigurationStatus() {
    return {
      clientId: !!API_ENV.GITHUB_CLIENT_ID,
      clientSecret: !!API_ENV.GITHUB_CLIENT_SECRET,
      callbackUrl: !!API_ENV.GITHUB_CALLBACK_URL,
      configured: this.isConfigured()
    }
  }
}

/**
 * Example usage in Electron main process:
 * 
 * // In main.js
 * import { app, protocol } from 'electron'
 * 
 * // Set custom protocol
 * app.setAsDefaultProtocolClient('myapp')
 * 
 * // Handle protocol URL (macOS)
 * app.on('open-url', (event, url) => {
 *   event.preventDefault()
 *   // Send to renderer process
 *   mainWindow.webContents.send('github-oauth-callback', url)
 * })
 * 
 * // Handle protocol URL (Windows/Linux)
 * app.on('ready', () => {
 *   protocol.registerHttpProtocol('myapp', (request, callback) => {
 *     // Send to renderer process
 *     mainWindow.webContents.send('github-oauth-callback', request.url)
 *   })
 * })
 */

/**
 * Example usage in React component:
 * 
 * import { githubApi, githubHelpers } from '../services'
 * 
 * const handleGitHubLogin = async () => {
 *   try {
 *     // Check configuration
 *     if (!githubHelpers.isConfigured()) {
 *       alert('GitHub OAuth is not configured. Please set environment variables.')
 *       return
 *     }
 * 
 *     // Complete OAuth flow
 *     const result = await githubHelpers.completeOAuthFlow({
 *       redirect: 'myapp://github-callback',
 *       timeout: 300000
 *     })
 * 
 *     console.log('GitHub OAuth successful:', result)
 *     // Use result.token and result.user
 * 
 *   } catch (error) {
 *     console.error('GitHub OAuth failed:', error)
 *   }
 * }
 */

export default githubHelpers
