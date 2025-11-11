/**
 * Scans API - Handles security scanning operations
 */

import api from './api.js'
import { API_ENDPOINTS } from './apiConfig.js'

/**
 * Scans API methods
 */
export const scansApi = {
  /**
   * Start a website security scan
   * @param {Object} scanConfig - Scan configuration
   * @param {string} scanConfig.target - Target URL or domain
   * @param {Array} scanConfig.scanTypes - Types of scans to perform
   * @param {Object} scanConfig.options - Additional scan options
   * @returns {Promise<Object>} Scan initiation response
   */
  async startWebsiteScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.WEBSITE, {
        target: scanConfig.target,
        scanTypes: scanConfig.scanTypes || ['basic'],
        options: scanConfig.options || {},
        priority: scanConfig.priority || 'normal'
      })
      return response.data
    } catch (error) {
      console.error('Failed to start website scan:', error)
      throw error
    }
  },

  /**
   * Start a network scan
   * @param {Object} scanConfig - Network scan configuration
   * @param {string} scanConfig.target - Target network/IP range
   * @param {Array} scanConfig.scanTypes - Network scan types
   * @param {Object} scanConfig.options - Scan options
   * @returns {Promise<Object>} Network scan response
   */
  async startNetworkScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.NETWORK, {
        target: scanConfig.target,
        scanTypes: scanConfig.scanTypes || ['ping', 'port'],
        options: scanConfig.options || {},
        priority: scanConfig.priority || 'normal'
      })
      return response.data
    } catch (error) {
      console.error('Failed to start network scan:', error)
      throw error
    }
  },

  /**
   * Start a port scan
   * @param {Object} scanConfig - Port scan configuration
   * @param {string} scanConfig.target - Target host
   * @param {Array} scanConfig.ports - Port range or specific ports
   * @param {string} scanConfig.scanType - Scan type (tcp, udp, etc.)
   * @returns {Promise<Object>} Port scan response
   */
  async startPortScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.PORT, {
        target: scanConfig.target,
        ports: scanConfig.ports || '1-65535',
        scanType: scanConfig.scanType || 'tcp',
        options: scanConfig.options || {}
      })
      return response.data
    } catch (error) {
      console.error('Failed to start port scan:', error)
      throw error
    }
  },

  /**
   * Start a malware scan
   * @param {Object} scanConfig - Malware scan configuration
   * @param {string} scanConfig.target - Target URL or file path
   * @param {boolean} scanConfig.deepScan - Enable deep scanning
   * @param {Array} scanConfig.signatures - Malware signatures to check
   * @returns {Promise<Object>} Malware scan response
   */
  async startMalwareScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.MALWARE, {
        target: scanConfig.target,
        deepScan: scanConfig.deepScan || false,
        signatures: scanConfig.signatures || [],
        options: scanConfig.options || {}
      })
      return response.data
    } catch (error) {
      console.error('Failed to start malware scan:', error)
      throw error
    }
  },

  /**
   * Start a phishing detection scan
   * @param {Object} scanConfig - Phishing scan configuration
   * @param {string} scanConfig.target - Target URL
   * @param {boolean} scanConfig.checkRedirects - Check redirect chains
   * @param {boolean} scanConfig.analyzeContent - Analyze page content
   * @returns {Promise<Object>} Phishing scan response
   */
  async startPhishingScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.PHISHING, {
        target: scanConfig.target,
        checkRedirects: scanConfig.checkRedirects !== false,
        analyzeContent: scanConfig.analyzeContent !== false,
        options: scanConfig.options || {}
      })
      return response.data
    } catch (error) {
      console.error('Failed to start phishing scan:', error)
      throw error
    }
  },

  /**
   * Start a comprehensive security scan
   * @param {Object} scanConfig - Comprehensive scan configuration
   * @param {string} scanConfig.target - Target to scan
   * @param {Array} scanConfig.modules - Scan modules to include
   * @param {Object} scanConfig.options - Scan options
   * @returns {Promise<Object>} Comprehensive scan response
   */
  async startComprehensiveScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.COMPREHENSIVE, {
        target: scanConfig.target,
        modules: scanConfig.modules || ['website', 'network', 'malware'],
        options: scanConfig.options || {},
        priority: scanConfig.priority || 'normal'
      })
      return response.data
    } catch (error) {
      console.error('Failed to start comprehensive scan:', error)
      throw error
    }
  },

  /**
   * Get scan status by ID
   * @param {string} scanId - Scan ID
   * @returns {Promise<Object>} Scan status
   */
  async getScanStatus(scanId) {
    try {
      const response = await api.get(`/scans/status/${scanId}`)
      return response.data
    } catch (error) {
      console.error('Failed to get scan status:', error)
      throw error
    }
  },

  /**
   * Get scan results by ID
   * @param {string} scanId - Scan ID
   * @returns {Promise<Object>} Scan results
   */
  async getScanResults(scanId) {
    try {
      const response = await api.get(`/scans/results/${scanId}`)
      return response.data
    } catch (error) {
      console.error('Failed to get scan results:', error)
      throw error
    }
  },

  /**
   * Cancel a running scan
   * @param {string} scanId - Scan ID to cancel
   * @returns {Promise<Object>} Cancellation response
   */
  async cancelScan(scanId) {
    try {
      const response = await api.post(`/scans/cancel/${scanId}`)
      return response.data
    } catch (error) {
      console.error('Failed to cancel scan:', error)
      throw error
    }
  },

  /**
   * Get list of user's scans
   * @param {Object} filters - Filter options
   * @param {number} filters.page - Page number
   * @param {number} filters.limit - Results per page
   * @param {string} filters.status - Filter by status
   * @param {string} filters.type - Filter by scan type
   * @returns {Promise<Object>} Scans list with pagination
   */
  async getScansList(filters = {}) {
    try {
      const params = {
        page: filters.page || 1,
        limit: filters.limit || 20,
        status: filters.status,
        type: filters.type,
        sortBy: filters.sortBy || 'createdAt',
        sortOrder: filters.sortOrder || 'desc'
      }

      const response = await api.get('/scans', { params })
      return response.data
    } catch (error) {
      console.error('Failed to get scans list:', error)
      throw error
    }
  },

  /**
   * Delete a scan and its results
   * @param {string} scanId - Scan ID to delete
   * @returns {Promise<Object>} Deletion response
   */
  async deleteScan(scanId) {
    try {
      const response = await api.delete(`/scans/${scanId}`)
      return response.data
    } catch (error) {
      console.error('Failed to delete scan:', error)
      throw error
    }
  },

  /**
   * Get scan statistics
   * @param {Object} options - Statistics options
   * @param {string} options.period - Time period (day, week, month)
   * @param {string} options.type - Scan type filter
   * @returns {Promise<Object>} Scan statistics
   */
  async getScanStatistics(options = {}) {
    try {
      const params = {
        period: options.period || 'month',
        type: options.type
      }

      const response = await api.get('/scans/statistics', { params })
      return response.data
    } catch (error) {
      console.error('Failed to get scan statistics:', error)
      throw error
    }
  },

  /**
   * Start an API endpoint discovery scan
   * @param {Object} scanConfig - API endpoint scan configuration
   * @param {string} scanConfig.target - Target URL or repository path
   * @param {Array} scanConfig.scanTypes - Types of API scans (discovery, mismatch, exposed)
   * @param {Object} scanConfig.options - Additional scan options
   * @returns {Promise<Object>} API endpoint scan response
   */
  async startAPIEndpointScan(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.API_ENDPOINTS, {
        target: scanConfig.target,
        scanTypes: scanConfig.scanTypes || ['discovery', 'mismatch', 'exposed'],
        options: scanConfig.options || {},
        priority: scanConfig.priority || 'normal'
      })
      return response.data
    } catch (error) {
      console.error('Failed to start API endpoint scan:', error)
      throw error
    }
  },

  /**
   * Discover API endpoints from codebase or running service
   * @param {Object} scanConfig - Discovery configuration
   * @param {string} scanConfig.target - Target URL or codebase path
   * @param {string} scanConfig.source - Source type ('codebase' or 'live')
   * @param {Object} scanConfig.options - Discovery options
   * @returns {Promise<Object>} Discovered API endpoints
   */
  async discoverAPIEndpoints(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.API_DISCOVERY, {
        target: scanConfig.target,
        source: scanConfig.source || 'codebase',
        options: scanConfig.options || {},
        includeDocumentation: scanConfig.includeDocumentation !== false,
        includeSwagger: scanConfig.includeSwagger !== false,
        includeOpenAPI: scanConfig.includeOpenAPI !== false
      })
      return response.data
    } catch (error) {
      console.error('Failed to discover API endpoints:', error)
      throw error
    }
  },

  /**
   * Detect API endpoint mismatches (version conflicts, deprecated endpoints, etc.)
   * @param {Object} scanConfig - Mismatch detection configuration
   * @param {string} scanConfig.target - Target URL or codebase path
   * @param {Object} scanConfig.options - Detection options
   * @returns {Promise<Object>} API mismatch detection results
   */
  async detectAPIMismatches(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.API_MISMATCH, {
        target: scanConfig.target,
        options: scanConfig.options || {},
        checkVersions: scanConfig.checkVersions !== false,
        checkDeprecated: scanConfig.checkDeprecated !== false,
        checkDocumentation: scanConfig.checkDocumentation !== false
      })
      return response.data
    } catch (error) {
      console.error('Failed to detect API mismatches:', error)
      throw error
    }
  },

  /**
   * Scan for exposed/open API endpoints
   * @param {Object} scanConfig - Exposed endpoint scan configuration
   * @param {string} scanConfig.target - Target URL
   * @param {Object} scanConfig.options - Scan options
   * @returns {Promise<Object>} Exposed API endpoints results
   */
  async scanExposedAPIEndpoints(scanConfig) {
    try {
      const response = await api.post(API_ENDPOINTS.SCANS.API_EXPOSED, {
        target: scanConfig.target,
        options: scanConfig.options || {},
        checkAuthentication: scanConfig.checkAuthentication !== false,
        checkAuthorization: scanConfig.checkAuthorization !== false,
        checkRateLimiting: scanConfig.checkRateLimiting !== false,
        checkCORS: scanConfig.checkCORS !== false
      })
      return response.data
    } catch (error) {
      console.error('Failed to scan exposed API endpoints:', error)
      throw error
    }
  },

  /**
   * Get API endpoint scan results
   * @param {string} scanId - Scan ID
   * @returns {Promise<Object>} API endpoint scan results
   */
  async getAPIEndpointScanResults(scanId) {
    try {
      const response = await api.get(`/scans/api-endpoints/${scanId}/results`)
      return response.data
    } catch (error) {
      console.error('Failed to get API endpoint scan results:', error)
      throw error
    }
  },

  /**
   * Export scan results
   * @param {string} scanId - Scan ID
   * @param {string} format - Export format (pdf, json, csv, xml)
   * @returns {Promise<Blob>} Exported file blob
   */
  async exportScanResults(scanId, format = 'pdf') {
    try {
      const response = await api.get(`/scans/${scanId}/export/${format}`, {
        responseType: 'blob'
      })
      return response.data
    } catch (error) {
      console.error('Failed to export scan results:', error)
      throw error
    }
  }
}

export default scansApi
