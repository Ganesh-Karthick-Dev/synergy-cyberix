/**
 * AI API - Handles AI-powered security analysis and recommendations
 */

import api from './api.js'
import { API_ENDPOINTS, API_ENV } from './apiConfig.js'

/**
 * AI API methods for security analysis and recommendations
 */
export const aiApi = {
  /**
   * Analyze scan results using AI
   * @param {Object} analysisData - Analysis request data
   * @param {string} analysisData.scanType - Type of scan performed
   * @param {string} analysisData.scanName - Display name of the scan
   * @param {Object} analysisData.scanResults - Raw scan results
   * @param {string} analysisData.rawOutput - Raw command output
   * @param {string} analysisData.target - Target URL/domain
   * @returns {Promise<string>} AI-generated analysis and recommendations
   */
  async analyzeScanResults(analysisData) {
    try {
      // Use the backend API if available, fallback to direct Grok API call
      if (API_ENDPOINTS.AI.ANALYZE_SCAN) {
        const response = await api.post(API_ENDPOINTS.AI.ANALYZE_SCAN, {
          scanType: analysisData.scanType,
          scanName: analysisData.scanName,
          scanResults: analysisData.scanResults,
          rawOutput: analysisData.rawOutput,
          target: analysisData.target
        })
        return response.data.analysis
      } else {
        // Fallback to direct Grok API call
        return await this.callGrokApi(analysisData)
      }
    } catch (error) {
      console.error('AI scan analysis failed:', error)
      throw error
    }
  },

  /**
   * Generate security report using AI
   * @param {Object} reportData - Report generation data
   * @param {Array} reportData.scans - Array of scan results
   * @param {string} reportData.target - Target system/domain
   * @param {string} reportData.format - Report format (summary, detailed, executive)
   * @returns {Promise<Object>} AI-generated security report
   */
  async generateSecurityReport(reportData) {
    try {
      const response = await api.post(API_ENDPOINTS.AI.GENERATE_REPORT, {
        scans: reportData.scans,
        target: reportData.target,
        format: reportData.format || 'summary',
        includeRecommendations: reportData.includeRecommendations !== false
      })
      return response.data
    } catch (error) {
      console.error('AI report generation failed:', error)
      throw error
    }
  },

  /**
   * Get AI-powered security advice
   * @param {Object} adviceData - Advice request data
   * @param {string} adviceData.context - Security context or scenario
   * @param {string} adviceData.threat - Specific threat or vulnerability
   * @param {string} adviceData.severity - Severity level
   * @returns {Promise<Object>} AI-generated security advice
   */
  async getSecurityAdvice(adviceData) {
    try {
      const response = await api.post(API_ENDPOINTS.AI.SECURITY_ADVICE, {
        context: adviceData.context,
        threat: adviceData.threat,
        severity: adviceData.severity || 'medium',
        includeExamples: adviceData.includeExamples !== false
      })
      return response.data
    } catch (error) {
      console.error('AI security advice failed:', error)
      throw error
    }
  },

  /**
   * Direct call to Grok API for backward compatibility
   * @param {Object} analysisData - Analysis data for Grok API
   * @returns {Promise<string>} AI response from Grok
   */
  async callGrokApi(analysisData) {
    try {
      if (!API_ENV.GROK_API_KEY) {
        throw new Error('GROK_API_KEY is not configured. Please set VITE_GROK_API_KEY in your .env file.')
      }

      // Extract relevant information from scan results
      const findings = analysisData.scanResults?.findings || []
      const recommendations = analysisData.scanResults?.recommendations || []
      const severity = analysisData.scanResults?.severity || 'unknown'
      const status = analysisData.scanResults?.status || 'unknown'

      // Build brief context from scan results
      let contextData = ''

      // Add findings if available (brief)
      if (findings.length > 0) {
        contextData += `Findings: ${findings.map(f => `${f.type || 'info'}: ${f.message || ''}`).join('; ')}\n`
      }

      // Add severity and status
      contextData += `Severity: ${severity}, Status: ${status}\n`

      // Add raw output (truncate if too long, focus on key parts)
      const rawOutputText = analysisData.rawOutput || ''
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
      const prompt = `Analyze this ${analysisData.scanName} scan result for ${analysisData.target}:

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
      const response = await fetch(API_ENV.GROK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_ENV.GROK_API_KEY}`
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
      console.error('Error calling Grok API:', error)
      throw error
    }
  },

  /**
   * Analyze multiple scans for patterns and trends
   * @param {Array} scans - Array of scan results
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Pattern analysis results
   */
  async analyzeScanPatterns(scans, options = {}) {
    try {
      const response = await api.post('/ai/analyze-patterns', {
        scans,
        timeRange: options.timeRange || '30d',
        includeTrends: options.includeTrends !== false,
        focusAreas: options.focusAreas || ['vulnerabilities', 'threats', 'compliance']
      })
      return response.data
    } catch (error) {
      console.error('AI pattern analysis failed:', error)
      throw error
    }
  },

  /**
   * Get AI-powered remediation suggestions
   * @param {Object} vulnerabilityData - Vulnerability information
   * @param {string} vulnerabilityData.type - Vulnerability type
   * @param {string} vulnerabilityData.severity - Severity level
   * @param {string} vulnerabilityData.description - Vulnerability description
   * @param {Object} vulnerabilityData.affectedSystem - Affected system details
   * @returns {Promise<Object>} Remediation suggestions
   */
  async getRemediationSuggestions(vulnerabilityData) {
    try {
      const response = await api.post('/ai/remediation', {
        vulnerability: vulnerabilityData,
        includeStepByStep: true,
        includePrevention: true,
        riskAssessment: true
      })
      return response.data
    } catch (error) {
      console.error('AI remediation suggestions failed:', error)
      throw error
    }
  },

  /**
   * Generate compliance report for specific standards
   * @param {Array} scanResults - Security scan results
   * @param {Array} standards - Compliance standards to check (e.g., ['PCI-DSS', 'HIPAA'])
   * @returns {Promise<Object>} Compliance report
   */
  async generateComplianceReport(scanResults, standards) {
    try {
      const response = await api.post('/ai/compliance-report', {
        scanResults,
        standards: standards || ['OWASP', 'PCI-DSS'],
        includeGapAnalysis: true,
        includeRemediation: true
      })
      return response.data
    } catch (error) {
      console.error('AI compliance report generation failed:', error)
      throw error
    }
  }
}

export default aiApi
