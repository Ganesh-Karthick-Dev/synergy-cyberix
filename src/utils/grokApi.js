/**
 * Grok API Service for AI Suggestions
 * Handles API calls to Grok (xAI) for generating security scan suggestions
 * Now uses the centralized API service with axios interceptors
 */

import { aiApi } from '../services/index.js'

/**
 * Get AI suggestions from Grok API based on scan results
 * @param {string} scanType - The type of scan (e.g., 'quick-fingerprint', 'dns-resolution')
 * @param {string} scanName - The display name of the scan
 * @param {object} scanResults - The raw scan results object
 * @param {string} rawOutput - The raw Kali command output
 * @param {string} target - The target URL/domain
 * @returns {Promise<string>} - AI-generated suggestions
 */
export async function getAISuggestions(scanType, scanName, scanResults, rawOutput, target) {
  try {
    // Use the centralized AI API service
    return await aiApi.analyzeScanResults({
      scanType,
      scanName,
      scanResults,
      rawOutput,
      target
    })

  } catch (error) {
    console.error('Error getting AI suggestions:', error)
    throw error
  }
}

/**
 * Format AI suggestions for display in the UI
 * @param {string} suggestions - Raw AI suggestions text
 * @returns {string} - Formatted suggestions (can be enhanced with markdown parsing)
 */
export function formatAISuggestions(suggestions) {
  // For now, return as-is. Can be enhanced with markdown parsing later
  return suggestions
}

