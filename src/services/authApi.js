/**
 * Authentication API - Handles user authentication, login, logout, and profile management
 */

import api, { apiHelpers } from './api.js'
import { API_ENDPOINTS } from './apiConfig.js'

/**
 * Authentication API methods
 */
export const authApi = {
  /**
   * User login
   * @param {Object} credentials - User credentials
   * @param {string} credentials.username - Username
   * @param {string} credentials.password - Password
   * @param {boolean} credentials.rememberMe - Remember login
   * @returns {Promise<Object>} Login response with user data and token
   */
  async login(credentials) {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.LOGIN, {
        username: credentials.username,
        password: credentials.password,
        rememberMe: credentials.rememberMe || false
      })

      // Store authentication token
      if (response.data?.token) {
        apiHelpers.setAuthToken(response.data.token)
      }

      return response.data
    } catch (error) {
      console.error('Login failed:', error)
      throw error
    }
  },

  /**
   * User logout
   * @returns {Promise<Object>} Logout response
   */
  async logout() {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.LOGOUT)
      // Clear authentication token regardless of response
      apiHelpers.clearAuth()
      return response.data
    } catch (error) {
      // Clear token even if logout request fails
      apiHelpers.clearAuth()
      console.error('Logout failed:', error)
      throw error
    }
  },

  /**
   * Refresh authentication token
   * @returns {Promise<Object>} Token refresh response
   */
  async refreshToken() {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.REFRESH)
      // Update stored token
      if (response.data?.token) {
        apiHelpers.setAuthToken(response.data.token)
      }
      return response.data
    } catch (error) {
      console.error('Token refresh failed:', error)
      // Clear invalid token
      apiHelpers.clearAuth()
      throw error
    }
  },

  /**
   * Get user profile
   * @returns {Promise<Object>} User profile data
   */
  async getProfile() {
    try {
      const response = await api.get(API_ENDPOINTS.AUTH.PROFILE)
      return response.data
    } catch (error) {
      console.error('Failed to get user profile:', error)
      throw error
    }
  },

  /**
   * Update user profile
   * @param {Object} profileData - Updated profile data
   * @returns {Promise<Object>} Updated profile response
   */
  async updateProfile(profileData) {
    try {
      const response = await api.put(API_ENDPOINTS.AUTH.PROFILE, profileData)
      return response.data
    } catch (error) {
      console.error('Failed to update profile:', error)
      throw error
    }
  },

  /**
   * User registration
   * @param {Object} userData - User registration data
   * @param {string} userData.username - Username
   * @param {string} userData.email - Email address
   * @param {string} userData.password - Password
   * @param {string} userData.confirmPassword - Password confirmation
   * @returns {Promise<Object>} Registration response
   */
  async register(userData) {
    try {
      const response = await api.post(API_ENDPOINTS.AUTH.REGISTER, {
        username: userData.username,
        email: userData.email,
        password: userData.password,
        confirmPassword: userData.confirmPassword
      })
      return response.data
    } catch (error) {
      console.error('Registration failed:', error)
      throw error
    }
  },

  /**
   * Change user password
   * @param {Object} passwordData - Password change data
   * @param {string} passwordData.currentPassword - Current password
   * @param {string} passwordData.newPassword - New password
   * @param {string} passwordData.confirmPassword - Password confirmation
   * @returns {Promise<Object>} Password change response
   */
  async changePassword(passwordData) {
    try {
      const response = await api.post(`${API_ENDPOINTS.AUTH.PROFILE}/change-password`, {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
        confirmPassword: passwordData.confirmPassword
      })
      return response.data
    } catch (error) {
      console.error('Password change failed:', error)
      throw error
    }
  },

  /**
   * Request password reset
   * @param {string} email - User email address
   * @returns {Promise<Object>} Password reset request response
   */
  async requestPasswordReset(email) {
    try {
      const response = await api.post('/auth/forgot-password', { email })
      return response.data
    } catch (error) {
      console.error('Password reset request failed:', error)
      throw error
    }
  },

  /**
   * Reset password with token
   * @param {string} token - Password reset token
   * @param {string} newPassword - New password
   * @param {string} confirmPassword - Password confirmation
   * @returns {Promise<Object>} Password reset response
   */
  async resetPassword(token, newPassword, confirmPassword) {
    try {
      const response = await api.post('/auth/reset-password', {
        token,
        newPassword,
        confirmPassword
      })
      return response.data
    } catch (error) {
      console.error('Password reset failed:', error)
      throw error
    }
  },

  /**
   * Verify email address
   * @param {string} token - Email verification token
   * @returns {Promise<Object>} Email verification response
   */
  async verifyEmail(token) {
    try {
      const response = await api.post('/auth/verify-email', { token })
      return response.data
    } catch (error) {
      console.error('Email verification failed:', error)
      throw error
    }
  },

  /**
   * Check authentication status
   * @returns {boolean} Whether user is authenticated
   */
  isAuthenticated() {
    return apiHelpers.isAuthenticated()
  },

  /**
   * Get stored authentication token
   * @returns {string|null} Authentication token or null
   */
  getToken() {
    return localStorage.getItem('auth_token') ||
           sessionStorage.getItem('auth_token') ||
           null
  },

  /**
   * Initiate GitHub OAuth login
   * Redirects user to GitHub OAuth page
   * @param {Object} options - OAuth options
   * @param {string} options.redirect - URL to redirect to after successful login (default: '/')
   * @returns {void} Redirects to GitHub OAuth page
   */
  async loginWithGitHub(options = {}) {
    try {
      // Use current window origin for redirect to ensure correct port
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
      const redirect = options.redirect || '/'
      
      // If redirect is relative, prepend current origin
      const fullRedirect = redirect.startsWith('http') 
        ? redirect 
        : `${currentOrigin}${redirect}`
      
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000/api'
      const authUrl = `${baseUrl}/auth/github?redirect=${encodeURIComponent(fullRedirect)}`
      
      console.log('🔐 [GitHub OAuth] Initiating login with redirect:', fullRedirect)
      console.log('🔐 [GitHub OAuth] Auth URL:', authUrl)
      
      // Redirect to GitHub OAuth endpoint
      if (typeof window !== 'undefined') {
        window.location.href = authUrl
      }
    } catch (error) {
      console.error('Failed to initiate GitHub OAuth login:', error)
      throw error
    }
  },

  /**
   * Check if user is authenticated after GitHub OAuth callback
   * This should be called after redirect from GitHub OAuth
   * @returns {Promise<Object>} User profile if authenticated, null if not authenticated
   */
  async checkGitHubAuth() {
    try {
      // Check if we have cookies set by the backend
      // Use apiHelpers.get to ensure credentials are included
      const response = await apiHelpers.get(API_ENDPOINTS.AUTH.PROFILE, {
        withCredentials: true // Important: include cookies
      })
      
      // If successful, user is authenticated
      if (response.data?.data) {
        // Store user info if needed
        return response.data
      }
      
      return null
    } catch (error) {
      // Handle 401 errors gracefully - user is simply not authenticated
      // Don't log as error since this is expected behavior
      if (error.response?.status === 401) {
        console.log('User is not authenticated with GitHub OAuth')
        return null
      }
      
      // For other errors, log but don't throw
      console.error('Failed to check GitHub authentication:', error)
      return null
    }
  },

  /**
   * Get GitHub repositories for authenticated user
   * @returns {Promise<Object>} Repositories response
   */
  async getGitHubRepositories() {
    try {
      const response = await api.get('/auth/github/repositories')
      return response.data
    } catch (error) {
      console.error('Failed to get GitHub repositories:', error)
      throw error
    }
  }
}

export default authApi
