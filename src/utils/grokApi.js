/**
 * Grok API Service for AI Suggestions
 * Handles API calls to Grok (xAI) for generating security scan suggestions
 */

// Get API key from environment variable (Vite uses import.meta.env in renderer process)
// Note: process.env is not available in browser/Vite renderer context
const GROK_API_KEY = import.meta.env.VITE_GROK_API_KEY || import.meta.env.GROK_API_KEY
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions'

// Validate API key is present
if (!GROK_API_KEY) {
  console.warn('⚠️ GROK_API_KEY is not set. AI suggestions will not work. Please set VITE_GROK_API_KEY in your .env file.')
}

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
    // Check if API key is available
    if (!GROK_API_KEY) {
      throw new Error('GROK_API_KEY is not configured. Please set VITE_GROK_API_KEY in your .env file.')
    }
    
    // Extract relevant information from scan results
    const findings = scanResults?.findings || []
    const recommendations = scanResults?.recommendations || []
    const severity = scanResults?.severity || 'unknown'
    const status = scanResults?.status || 'unknown'
    
    // Build brief context from scan results
    let contextData = ''
    
    // Add findings if available (brief)
    if (findings.length > 0) {
      contextData += `Findings: ${findings.map(f => `${f.type || 'info'}: ${f.message || ''}`).join('; ')}\n`
    }
    
    // Add severity and status
    contextData += `Severity: ${severity}, Status: ${status}\n`
    
    // Add raw output (truncate if too long, focus on key parts)
    const rawOutputText = rawOutput || ''
    // Extract key parts from raw output (remove command details, keep results)
    let relevantOutput = rawOutputText
      .replace(/Command:.*?\n/g, '') // Remove command lines
      .replace(/Running:.*?\n/g, '') // Remove running lines
      .replace(/#.*?\n/g, '') // Remove comments
      .trim()
    
    // Truncate to most relevant 2000 characters (end is usually more important)
    if (relevantOutput.length > 2000) {
      relevantOutput = relevantOutput.substring(relevantOutput.length - 2000)
    }
    
    // Build concise prompt for Grok
    const prompt = `Analyze this ${scanName} scan result for ${target}:

Status: ${status}
Severity: ${severity}
${findings.length > 0 ? `Issues Found: ${findings.length}` : 'No issues found'}

Scan Output:
${relevantOutput || 'No output available'}

Provide a SHORT, SMART response (max 150 words) with:
1. Result: Success/Failure/Issues Found
2. Vulnerabilities: Yes/No - brief list if any
3. Key Fixes: 2-3 actionable points
4. Summary: One-line overall assessment

Be concise, user-friendly, and actionable. No technical jargon or command details.`

    // Make API call to Grok
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-3', // Updated to use grok-3 as grok-beta was deprecated
        messages: [
          {
            role: 'system',
            content: 'You are a helpful cybersecurity expert who provides clear, actionable security advice. Explain technical concepts in simple terms that non-technical users can understand, while still providing enough detail for security professionals.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`Grok API error: ${response.status} - ${errorData.error?.message || JSON.stringify(errorData)}`)
    }

    const data = await response.json()
    
    // Extract the AI response
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content
    }
    
    throw new Error('Invalid response format from Grok API')
    
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

