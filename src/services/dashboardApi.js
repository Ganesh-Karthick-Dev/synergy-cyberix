/**
 * Dashboard API Service
 * Handles dashboard-related API calls for login details and profile management
 */

import api from './api.js'

/**
 * Get user login details for dashboard
 * GET /api/dashboard/login-details
 */
export const getLoginDetails = async () => {
  try {
    const response = await api.get('/dashboard/login-details')
    return response.data
  } catch (error) {
    console.error('Error fetching login details:', error)
    throw error
  }
}

/**
 * Update user profile (name/email)
 * PUT /api/dashboard/update-profile
 */
export const updateProfile = async (profileData) => {
  try {
    const response = await api.put('/dashboard/update-profile', profileData)
    return response.data
  } catch (error) {
    console.error('Error updating profile:', error)
    throw error
  }
}

/**
 * Dashboard API object for organized exports
 */
export const dashboardApi = {
  getLoginDetails,
  updateProfile
}

export default dashboardApi
