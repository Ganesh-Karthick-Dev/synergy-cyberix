<<<<<<< HEAD
/**
 * API Configuration - Environment variables and API endpoints
 */

// Environment-based configuration
export const API_ENV = {
  // Base URLs
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  GROK_API_URL: import.meta.env.VITE_GROK_API_URL || 'https://api.x.ai/v1/chat/completions',

  // API Keys (securely stored)
  GROK_API_KEY: import.meta.env.VITE_GROK_API_KEY || import.meta.env.GROK_API_KEY,
  GITHUB_CLIENT_ID: import.meta.env.VITE_GITHUB_CLIENT_ID || import.meta.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: import.meta.env.VITE_GITHUB_CLIENT_SECRET || import.meta.env.GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL: import.meta.env.VITE_GITHUB_CALLBACK_URL || import.meta.env.GITHUB_CALLBACK_URL || 'http://localhost:4005/api/github/callback',

  // Environment flags
  IS_DEVELOPMENT: import.meta.env.DEV,
  IS_PRODUCTION: import.meta.env.PROD,

  // Feature flags
  ENABLE_API_LOGGING: import.meta.env.VITE_ENABLE_API_LOGGING !== 'false',
  ENABLE_REQUEST_CACHING: import.meta.env.VITE_ENABLE_REQUEST_CACHING === 'true',
  ENABLE_AUTO_RETRY: import.meta.env.VITE_ENABLE_AUTO_RETRY !== 'false'
}

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
    REGISTER: '/auth/register'
  },

  // Security Scans
  SCANS: {
    WEBSITE: '/scans/website',
    NETWORK: '/scans/network',
    PORT: '/scans/port',
    MALWARE: '/scans/malware',
    PHISHING: '/scans/phishing',
    VULNERABILITY: '/scans/vulnerability',
    COMPREHENSIVE: '/scans/comprehensive',
    API_ENDPOINTS: '/scans/api-endpoints',
    API_DISCOVERY: '/scans/api-discovery',
    API_MISMATCH: '/scans/api-mismatch',
    API_EXPOSED: '/scans/api-exposed'
  },

  // Reports and Results
  REPORTS: {
    LIST: '/reports',
    GET: (id) => `/reports/${id}`,
    CREATE: '/reports',
    UPDATE: (id) => `/reports/${id}`,
    DELETE: (id) => `/reports/${id}`,
    EXPORT: (id, format) => `/reports/${id}/export/${format}`
  },

  // Tools and Utilities
  TOOLS: {
    CHECK: '/tools/check',
    INSTALL: '/tools/install',
    UPDATE: '/tools/update',
    STATUS: '/tools/status'
  },

  // System and WSL
  SYSTEM: {
    STATUS: '/system/status',
    LOGS: '/system/logs',
    WSL_CHECK: '/system/wsl/check',
    WSL_INSTALL: '/system/wsl/install',
    WSL_CREDENTIALS: '/system/wsl/credentials'
  },

  // AI Services
  AI: {
    ANALYZE_SCAN: '/ai/analyze-scan',
    GENERATE_REPORT: '/ai/generate-report',
    SECURITY_ADVICE: '/ai/security-advice'
  },

  // GitHub OAuth and Repository Services
  GITHUB: {
    AUTH: '/github/auth',
    CALLBACK: '/github/callback',
    USER: '/github/user',
    ORGANIZATIONS: '/github/organizations',
    REPOS: (org) => `/github/repos/${org}`,
    REPO_CONTENTS: (owner, repo) => `/github/repo/${owner}/${repo}/contents`,
    REPO_BRANCHES: (owner, repo) => `/github/repo/${owner}/${repo}/branches`,
    REPO_SCAN: (owner, repo) => `/github/repo/${owner}/${repo}/scan`,
    REPO_API_SCAN: (owner, repo) => `/github/repo/${owner}/${repo}/api-scan`,
    REPO_API_ENDPOINTS: (owner, repo) => `/github/repo/${owner}/${repo}/api-endpoints`
  }
}

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
}

// Request/Response Configuration
export const REQUEST_CONFIG = {
  TIMEOUT: {
    DEFAULT: 30000, // 30 seconds
    LONG_RUNNING: 120000, // 2 minutes
    UPLOAD: 300000 // 5 minutes
  },

  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000, // 1 second
    BACKOFF_MULTIPLIER: 2
  },

  CACHE: {
    DEFAULT_TTL: 300000, // 5 minutes
    LONG_TTL: 1800000, // 30 minutes
    SHORT_TTL: 60000 // 1 minute
  }
}

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Authentication required. Please log in again.',
  FORBIDDEN: 'Access denied. You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment before trying again.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.'
}

// API Response structure helpers
export const createSuccessResponse = (data, message = 'Success') => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString()
})

export const createErrorResponse = (error, message = 'Error') => ({
  success: false,
  error,
  message,
  timestamp: new Date().toISOString()
})

// Validation helpers
export const validateApiResponse = (response) => {
  if (!response) {
    throw new Error('Empty response received')
  }

  if (response.status < 200 || response.status >= 300) {
    const error = response.data?.error || response.data?.message || 'API request failed'
    throw new Error(error)
  }

  return response.data
}

// Environment validation
export const validateEnvironment = () => {
  const issues = []

  if (!API_ENV.GROK_API_KEY) {
    issues.push('VITE_GROK_API_KEY is not set - AI features will not work')
  }

  if (!API_ENV.GITHUB_CLIENT_ID) {
    issues.push('VITE_GITHUB_CLIENT_ID is not set - GitHub OAuth will not work')
  }

  if (!API_ENV.BASE_URL || API_ENV.BASE_URL === 'http://localhost:3001/api') {
    issues.push('VITE_API_BASE_URL is not set - using default localhost API')
  }

  if (issues.length > 0) {
    console.warn('⚠️ [API Config] Environment configuration issues:', issues)
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

// Initialize environment validation
if (API_ENV.IS_DEVELOPMENT) {
  validateEnvironment()
}
=======
/**
 * API Configuration - Environment variables and API endpoints
 */

// Environment-based configuration
export const API_ENV = {
  // Base URLs
  BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4005/api',
  GROK_API_URL: import.meta.env.VITE_GROK_API_URL || 'https://api.x.ai/v1/chat/completions',

  // API Keys (securely stored)
  GROK_API_KEY: import.meta.env.VITE_GROK_API_KEY || import.meta.env.GROK_API_KEY,
  GITHUB_CLIENT_ID: import.meta.env.VITE_GITHUB_CLIENT_ID || import.meta.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: import.meta.env.VITE_GITHUB_CLIENT_SECRET || import.meta.env.GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL: import.meta.env.VITE_GITHUB_CALLBACK_URL || import.meta.env.GITHUB_CALLBACK_URL || 'http://localhost:9000/api/auth/github/callback',

  // Environment flags
  IS_DEVELOPMENT: import.meta.env.DEV,
  IS_PRODUCTION: import.meta.env.PROD,

  // Feature flags
  ENABLE_API_LOGGING: import.meta.env.VITE_ENABLE_API_LOGGING !== 'false',
  ENABLE_REQUEST_CACHING: import.meta.env.VITE_ENABLE_REQUEST_CACHING === 'true',
  ENABLE_AUTO_RETRY: import.meta.env.VITE_ENABLE_AUTO_RETRY !== 'false'
}

// API Endpoints
export const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
    REGISTER: '/auth/register'
  },

  // Security Scans
  SCANS: {
    WEBSITE: '/scans/website',
    NETWORK: '/scans/network',
    PORT: '/scans/port',
    MALWARE: '/scans/malware',
    PHISHING: '/scans/phishing',
    VULNERABILITY: '/scans/vulnerability',
    COMPREHENSIVE: '/scans/comprehensive',
    API_ENDPOINTS: '/scans/api-endpoints',
    API_DISCOVERY: '/scans/api-discovery',
    API_MISMATCH: '/scans/api-mismatch',
    API_EXPOSED: '/scans/api-exposed'
  },

  // Projects
  PROJECTS: {
    LIST: '/projects',
    GET: (id) => `/projects/${id}`,
    CREATE: '/projects',
    UPDATE: (id) => `/projects/${id}`,
    DELETE: (id) => `/projects/${id}`,
    STATS: (id) => `/projects/${id}/stats`,
    PLAN_INFO: '/projects/plan/info'
  },

  // Security Reports
  SECURITY_REPORTS: {
    LIST: '/security-reports',
    GET: (id) => `/security-reports/${id}`,
    CREATE: '/security-reports',
    UPDATE_STATUS: (id) => `/security-reports/${id}/status`,
    DELETE: (id) => `/security-reports/${id}`,
    BY_PROJECT: (projectId) => `/security-reports/project/${projectId}`
  },

  // Reports and Results
  REPORTS: {
    LIST: '/reports',
    GET: (id) => `/reports/${id}`,
    CREATE: '/reports',
    UPDATE: (id) => `/reports/${id}`,
    DELETE: (id) => `/reports/${id}`,
    EXPORT: (id, format) => `/reports/${id}/export/${format}`
  },

  // Tools and Utilities
  TOOLS: {
    CHECK: '/tools/check',
    INSTALL: '/tools/install',
    UPDATE: '/tools/update',
    STATUS: '/tools/status'
  },

  // System and WSL
  SYSTEM: {
    STATUS: '/system/status',
    LOGS: '/system/logs',
    WSL_CHECK: '/system/wsl/check',
    WSL_INSTALL: '/system/wsl/install',
    WSL_CREDENTIALS: '/system/wsl/credentials'
  },

  // AI Services
  AI: {
    ANALYZE_SCAN: '/ai/analyze-scan',
    GENERATE_REPORT: '/ai/generate-report',
    SECURITY_ADVICE: '/ai/security-advice'
  },

  // GitHub OAuth and Repository Services
  GITHUB: {
    // OAuth Login endpoints (for user authentication)
    AUTH_LOGIN: '/auth/github',
    AUTH_CALLBACK: '/auth/github/callback',
    // GitHub API endpoints (for repository access after login)
    AUTH: '/github/auth',
    CALLBACK: '/github/callback',
    USER: '/github/user',
    ORGANIZATIONS: '/github/organizations',
    REPOS: (org) => `/github/repos/${org}`,
    REPO_CONTENTS: (owner, repo) => `/github/repo/${owner}/${repo}/contents`,
    REPO_BRANCHES: (owner, repo) => `/github/repo/${owner}/${repo}/branches`,
    REPO_SCAN: (owner, repo) => `/github/repo/${owner}/${repo}/scan`,
    REPO_API_SCAN: (owner, repo) => `/github/repo/${owner}/${repo}/api-scan`,
    REPO_API_ENDPOINTS: (owner, repo) => `/github/repo/${owner}/${repo}/api-endpoints`
  }
}

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
}

// Request/Response Configuration
export const REQUEST_CONFIG = {
  TIMEOUT: {
    DEFAULT: 30000, // 30 seconds
    LONG_RUNNING: 120000, // 2 minutes
    UPLOAD: 300000 // 5 minutes
  },

  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY: 1000, // 1 second
    BACKOFF_MULTIPLIER: 2
  },

  CACHE: {
    DEFAULT_TTL: 300000, // 5 minutes
    LONG_TTL: 1800000, // 30 minutes
    SHORT_TTL: 60000 // 1 minute
  }
}

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network connection error. Please check your internet connection.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  UNAUTHORIZED: 'Authentication required. Please log in again.',
  FORBIDDEN: 'Access denied. You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment before trying again.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.'
}

// API Response structure helpers
export const createSuccessResponse = (data, message = 'Success') => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString()
})

export const createErrorResponse = (error, message = 'Error') => ({
  success: false,
  error,
  message,
  timestamp: new Date().toISOString()
})

// Validation helpers
export const validateApiResponse = (response) => {
  if (!response) {
    throw new Error('Empty response received')
  }

  if (response.status < 200 || response.status >= 300) {
    const error = response.data?.error || response.data?.message || 'API request failed'
    throw new Error(error)
  }

  return response.data
}

// Environment validation
export const validateEnvironment = () => {
  const issues = []

  if (!API_ENV.GROK_API_KEY) {
    issues.push('VITE_GROK_API_KEY is not set - AI features will not work')
  }

  if (!API_ENV.GITHUB_CLIENT_ID) {
    issues.push('VITE_GITHUB_CLIENT_ID is not set - GitHub OAuth will not work')
  }

  if (!API_ENV.BASE_URL || API_ENV.BASE_URL === 'http://localhost:9000/api') {
    issues.push('VITE_API_BASE_URL is not set - using default localhost:9000 API')
  }

  if (issues.length > 0) {
    console.warn('⚠️ [API Config] Environment configuration issues:', issues)
  }

  return {
    valid: issues.length === 0,
    issues
  }
}

// Initialize environment validation
if (API_ENV.IS_DEVELOPMENT) {
  validateEnvironment()
}
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
