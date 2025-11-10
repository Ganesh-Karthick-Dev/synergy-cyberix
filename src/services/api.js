/**
 * API Service - Centralized HTTP client for the application
 * Provides axios instance with interceptors, error handling, and authentication
 */

import axios from 'axios'

// API Configuration
const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000/api',
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000
}

// Create axios instance with default config
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT,
  withCredentials: true, // Important: include cookies for authentication
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
})

// Request queue for managing concurrent requests
let requestQueue = []
let isRefreshing = false

// Request interceptor for authentication and logging
api.interceptors.request.use(
  (config) => {
    // Add timestamp for request tracking
    config.metadata = {
      startTime: Date.now(),
      requestId: Math.random().toString(36).substr(2, 9)
    }

    // Add authentication token if available
    const token = getAuthToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      // Debug logging for token
      if (import.meta.env.DEV) {
        console.log(`🔐 [API] Token found, adding Authorization header`, {
          tokenLength: token.length,
          tokenPreview: token.substring(0, 20) + '...',
          url: config.url,
          source: localStorage.getItem('auth_token') === token ? 'localStorage' : 
                 sessionStorage.getItem('auth_token') === token ? 'sessionStorage' : 'unknown'
        })
      }
    } else {
      // Debug logging when no token - check all possible sources
      if (import.meta.env.DEV) {
        const localToken = localStorage.getItem('auth_token');
        const sessionToken = sessionStorage.getItem('auth_token');
        const cyberGuardToken = window.cyberGuard?.getAuthToken?.();
        
        console.log(`⚠️ [API] No token found for request: ${config.url}`, {
          localStorage: localToken ? `Has token (${localToken.length} chars)` : 'No token',
          sessionStorage: sessionToken ? `Has token (${sessionToken.length} chars)` : 'No token',
          cyberGuard: cyberGuardToken ? `Has token (${cyberGuardToken.length} chars)` : 'No token',
          allKeys: Object.keys(localStorage).filter(k => k.includes('token') || k.includes('auth'))
        })
      }
    }

    // Log request in development
    if (import.meta.env.DEV) {
      console.log(`🚀 [API] ${config.method?.toUpperCase()} ${config.url}`, {
        requestId: config.metadata.requestId,
        hasAuth: !!config.headers.Authorization,
        data: config.data,
        params: config.params
      })
    }

    return config
  },
  (error) => {
    console.error('❌ [API] Request interceptor error:', error)
    return Promise.reject(error)
  }
)

// Response interceptor for error handling and logging
api.interceptors.response.use(
  (response) => {
    // Calculate response time
    const duration = Date.now() - response.config.metadata.startTime

    // Log successful response in development
    if (import.meta.env.DEV) {
      console.log(`✅ [API] ${response.status} ${response.config.url} (${duration}ms)`, {
        requestId: response.config.metadata.requestId,
        data: response.data
      })
    }

    return response
  },
  async (error) => {
    const originalRequest = error.config

    // Calculate error response time if available
    const duration = originalRequest?.metadata?.startTime
      ? Date.now() - originalRequest.metadata.startTime
      : 'unknown'

    // Log error details
    console.error(`❌ [API] ${error.response?.status || 'Network'} Error (${duration}ms):`, {
      url: originalRequest?.url,
      method: originalRequest?.method?.toUpperCase(),
      requestId: originalRequest?.metadata?.requestId,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    })

    // Handle specific error types
    if (error.response) {
      const { status, data } = error.response

      switch (status) {
        case 401:
          // Unauthorized - token might be expired
          return handleUnauthorizedError(error, originalRequest)

        case 403:
          // Forbidden - insufficient permissions
          handleForbiddenError(data)
          break

        case 404:
          // Not found
          handleNotFoundError(originalRequest.url)
          break

        case 422:
          // Validation error
          handleValidationError(data)
          break

        case 429:
          // Rate limited
          return handleRateLimitError(error, originalRequest)

        case 500:
        case 502:
        case 503:
        case 504:
          // Server errors - retry logic
          return handleServerError(error, originalRequest)

        default:
          // Other client/server errors
          handleGenericError(status, data)
      }
    } else if (error.code === 'NETWORK_ERROR' || error.message.includes('Network Error')) {
      // Network connectivity issues
      return handleNetworkError(error, originalRequest)
    } else if (error.code === 'ECONNABORTED') {
      // Timeout
      return handleTimeoutError(error, originalRequest)
    }

    return Promise.reject(error)
  }
)

// Error handlers
function handleUnauthorizedError(error, originalRequest) {
  // Clear invalid token
  clearAuthToken()

  // Don't redirect for auth check endpoints - these are expected to fail if not authenticated
  const authCheckEndpoints = ['/auth/profile', '/auth/github', '/auth/github/callback']
  const isAuthCheckEndpoint = authCheckEndpoints.some(endpoint => 
    originalRequest?.url?.includes(endpoint)
  )

  // If this is not a retry and we have refresh logic, attempt refresh
  if (!originalRequest._retry && originalRequest.url !== '/auth/login' && !isAuthCheckEndpoint) {
    // Redirect to login or trigger re-authentication
    if (typeof window !== 'undefined') {
      // In Electron renderer process, emit event to main process
      if (window.cyberGuard && window.cyberGuard.emit) {
        window.cyberGuard.emit('auth:unauthorized')
      }

      // For web environment, redirect to login
      // Only redirect if we're not already on a page that handles auth gracefully
      if (window.location && !window.location.pathname.includes('/api-scanner')) {
        window.location.href = '/login'
      }
    }
  }

  return Promise.reject(error)
}

function handleForbiddenError(data) {
  const message = data?.message || 'Access forbidden. You do not have permission to perform this action.'
  showErrorToast(message)
}

function handleNotFoundError(url) {
  const message = `Resource not found: ${url}`
  console.warn('🔍 [API]', message)
  showErrorToast('The requested resource was not found.')
}

function handleValidationError(data) {
  const errors = data?.errors || data?.message || 'Validation failed'
  console.warn('📝 [API] Validation error:', errors)

  if (typeof errors === 'object') {
    // Handle field-specific validation errors
    const errorMessages = Object.values(errors).flat()
    showErrorToast(errorMessages.join('\n'))
  } else {
    showErrorToast(errors)
  }
}

function handleRateLimitError(error, originalRequest) {
  const retryAfter = error.response?.headers?.['retry-after'] || 5
  const message = `Rate limit exceeded. Retrying in ${retryAfter} seconds...`

  showErrorToast(message)

  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(api(originalRequest))
    }, retryAfter * 1000)
  })
}

function handleServerError(error, originalRequest) {
  // Implement retry logic for server errors
  if (!originalRequest._retryCount) {
    originalRequest._retryCount = 0
  }

  if (originalRequest._retryCount < API_CONFIG.RETRY_ATTEMPTS) {
    originalRequest._retryCount += 1

    const delay = API_CONFIG.RETRY_DELAY * Math.pow(2, originalRequest._retryCount - 1)
    const message = `Server error. Retrying (${originalRequest._retryCount}/${API_CONFIG.RETRY_ATTEMPTS}) in ${delay}ms...`

    console.warn(`🔄 [API] ${message}`)
    showErrorToast('Connection issue. Retrying...')

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(api(originalRequest))
      }, delay)
    })
  }

  showErrorToast('Server is currently unavailable. Please try again later.')
  return Promise.reject(error)
}

function handleNetworkError(error, originalRequest) {
  const message = 'Network connection lost. Please check your internet connection.'
  showErrorToast(message)

  // For network errors, we might want to queue requests for retry
  if (navigator.onLine) {
    // If we're online but still getting network errors, retry once
    if (!originalRequest._retryCount) {
      originalRequest._retryCount = 1
      return new Promise((resolve) => {
        setTimeout(() => resolve(api(originalRequest)), 2000)
      })
    }
  }

  return Promise.reject(error)
}

function handleTimeoutError(error, originalRequest) {
  const message = 'Request timed out. Please try again.'
  showErrorToast(message)

  return Promise.reject(error)
}

function handleGenericError(status, data) {
  const message = data?.message || `Request failed with status ${status}`
  showErrorToast(message)
}

// Toast notification helpers (will integrate with existing toast system)
function showErrorToast(message) {
  // Try to use existing toast system if available
  if (typeof window !== 'undefined' && window.cyberGuard && window.cyberGuard.showToast) {
    window.cyberGuard.showToast('error', message)
  } else {
    console.error('❌ [API]', message)
  }
}

// Authentication helpers
function getAuthToken() {
  // Check multiple sources for auth token
  if (typeof window !== 'undefined') {
    const localToken = localStorage.getItem('auth_token');
    const sessionToken = sessionStorage.getItem('auth_token');
    const cyberGuardToken = window.cyberGuard?.getAuthToken?.();
    
    // Debug logging in development
    if (import.meta.env.DEV && !localToken && !sessionToken && !cyberGuardToken) {
      console.warn('⚠️ [getAuthToken] No token found in any source', {
        localStorage: localToken ? 'Has token' : 'No token',
        sessionStorage: sessionToken ? 'Has token' : 'No token',
        cyberGuard: cyberGuardToken ? 'Has token' : 'No token',
        allLocalStorageKeys: Object.keys(localStorage).filter(k => k.includes('token') || k.includes('auth'))
      });
    }
    
    return localToken || sessionToken || cyberGuardToken || null;
  }
  return null
}

function clearAuthToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_token')
    sessionStorage.removeItem('auth_token')
    if (window.cyberGuard?.clearAuthToken) {
      window.cyberGuard.clearAuthToken()
    }
  }
}

// Request helper methods
export const apiHelpers = {
  // Set authentication token
  setAuthToken: (token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token)
    }
  },

  // Clear authentication
  clearAuth: () => {
    clearAuthToken()
  },

  // Check if user is authenticated
  isAuthenticated: () => {
    return !!getAuthToken()
  },

  // Generic GET request
  get: (url, config = {}) => api.get(url, config),

  // Generic POST request
  post: (url, data = {}, config = {}) => api.post(url, data, config),

  // Generic PUT request
  put: (url, data = {}, config = {}) => api.put(url, data, config),

  // Generic PATCH request
  patch: (url, data = {}, config = {}) => api.patch(url, data, config),

  // Generic DELETE request
  delete: (url, config = {}) => api.delete(url, config),

  // Upload file
  upload: (url, file, onProgress = null) => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: onProgress
    })
  },

  // Download file
  download: (url, filename = null) => {
    return api.get(url, {
      responseType: 'blob'
    }).then(response => {
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename || 'download')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    })
  }
}

// Export the configured axios instance as default
export default api

// Export API configuration for external access
export { API_CONFIG }
