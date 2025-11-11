/**
 * API Services Index - Centralized export of all API services
 */

// Core API service with interceptors
export { default as api, apiHelpers, API_CONFIG } from './api.js'

// API configuration
export * from './apiConfig.js'

// Authentication API
export { default as authApi } from './authApi.js'

// Scans API
export { default as scansApi } from './scansApi.js'

// AI API
export { default as aiApi } from './aiApi.js'

// GitHub API
export { default as githubApi } from './githubApi.js'
export { default as githubHelpers } from './githubHelpers.js'
export { default as githubScanIntegration } from './githubScanIntegration.js'

// Re-export everything for convenience
export * from './authApi.js'
export * from './scansApi.js'
export * from './aiApi.js'
export * from './githubApi.js'
export * from './githubHelpers.js'
export * from './githubScanIntegration.js'
