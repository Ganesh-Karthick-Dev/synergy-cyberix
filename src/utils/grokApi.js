<<<<<<< HEAD
/**
 * Grok API Service for AI Suggestions
 * Handles API calls to Grok (xAI) for generating security scan suggestions
 */

// Get API key from environment variable (Vite uses import.meta.env, Node.js uses process.env)
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GROK_API_KEY : undefined)
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'

// Validate API key is present (only warn in development, not in production)
// This is an optional feature, so don't spam console warnings
if (!GROK_API_KEY && import.meta.env.DEV) {
  // Only show warning in development mode
  console.warn('⚠️ GROK_API_KEY is not set. AI suggestions will not work. Please set VITE_GROK_API_KEY in your .env file.')
}

/**
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

=======
/**
 * Grok API Service for AI Suggestions
 * Handles API calls to Grok (xAI) for generating security scan suggestions
 */

// Get API key from environment variable (Vite uses import.meta.env, Node.js uses process.env)
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || (typeof process !== 'undefined' && process.env ? process.env.GROK_API_KEY : undefined)
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'

// Validate API key is present (only warn in development, not in production)
// This is an optional feature, so don't spam console warnings
if (!GROK_API_KEY && import.meta.env.DEV) {
  // Only show warning in development mode
  console.warn('⚠️ GROK_API_KEY is not set. AI suggestions will not work. Please set VITE_GROK_API_KEY in your .env file.')
}

/**
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

>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
