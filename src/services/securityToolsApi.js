/**
 * Security Tools API Service
 * Handles security tools and plan features API calls
 */

import api from './api.js'

/**
 * Get enabled security tools based on active plan features
 * GET /api/plans/security-tools/enabled
 * Returns only the enabled security tools for the software dashboard
 */
export const getEnabledSecurityTools = async () => {
  try {
    const response = await api.get('/plans/security-tools/enabled')
    return response.data
  } catch (error) {
    console.error('Error fetching enabled security tools:', error)
    throw error
  }
}

/**
 * Get all security plan features (for admin use)
 * GET /api/plans/security-features
 */
export const getSecurityPlanFeatures = async () => {
  try {
    const response = await api.get('/plans/security-features')
    return response.data
  } catch (error) {
    console.error('Error fetching security plan features:', error)
    throw error
  }
}

/**
 * Security Tools API object for organized exports
 */
export const securityToolsApi = {
  getEnabledSecurityTools,
  getSecurityPlanFeatures
}

export default securityToolsApi
