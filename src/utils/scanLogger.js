/**
 * Centralized logging system for all scanning activities
 * Logs scan start, progress, completion, and results to cyberix_system_logs folder
 */

class ScanLogger {
  constructor() {
    this.logs = []
    this.isElectron = typeof window !== 'undefined' && window.cyberGuard
    this.logsDir = null
    // Proactively resolve and create the logs directory (best-effort)
    try { this.initialize() } catch (_) {}
  }

  async initialize() {
    try {
      // Debug: Check what IPC methods are available
      console.log('[scanLogger] Available IPC methods:', Object.keys(window.cyberGuard || {}))
      console.log('[scanLogger] Has ensureDirectoryExists:', !!window.cyberGuard?.ensureDirectoryExists)
      console.log('[scanLogger] Has writeFile:', !!window.cyberGuard?.writeFile)
      
      const dir = await this.resolveLogsDirectory()
      if (this.isElectron && window.cyberGuard?.ensureDirectoryExists) {
        await window.cyberGuard.ensureDirectoryExists(dir)
        // Helpful debug for field validation
        console.info('[scanLogger] Logs directory ready:', dir)
      } else {
        console.warn('[scanLogger] IPC handlers not available, logs will be saved to memory only')
      }
    } catch (e) {
      console.error('[scanLogger] Failed to initialize logs directory:', e)
    }
  }

  /**
   * Log a scan activity
   * @param {Object} logData - The log data object
   * @param {string} logData.scanType - Type of scan (wordpress, shopify, network, port, server, malware, website-audit, security-analyzer)
   * @param {string} logData.scanName - Name of the scan
   * @param {string} logData.target - Target URL/IP/hostname
   * @param {string} logData.status - Status (started, completed, failed, aborted)
   * @param {string} logData.result - Short result description
   * @param {Date} logData.startTime - When scan started
   * @param {Date} logData.endTime - When scan ended
   * @param {number} logData.duration - Duration in milliseconds
   * @param {Object} logData.metadata - Additional metadata
   */
  async logScanActivity(logData) {
    const logEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      scanType: logData.scanType,
      scanName: logData.scanName,
      target: logData.target,
      status: logData.status,
      result: logData.result,
      startTime: logData.startTime?.toISOString(),
      endTime: logData.endTime?.toISOString(),
      duration: logData.duration,
      metadata: logData.metadata || {},
      userAgent: navigator.userAgent,
      sessionId: this.getSessionId()
    }

    // Add to memory
    this.logs.push(logEntry)

    // Save to file if in Electron environment
    if (this.isElectron) {
      try {
        await this.saveLogToFile(logEntry)
      } catch (error) {
        console.error('Failed to save log to file:', error)
      }
    }

    // Persist only to designated folder (no localStorage)

    return logEntry
  }

  /**
   * Log scan start
   */
  async logScanStart(scanType, scanName, target, metadata = {}) {
    const startTime = new Date()
    return await this.logScanActivity({
      scanType,
      scanName,
      target,
      status: 'started',
      result: 'Scan initiated',
      startTime,
      endTime: null,
      duration: 0,
      metadata: {
        ...metadata,
        action: 'scan_started'
      }
    })
  }

  /**
   * Log scan completion
   */
  async logScanComplete(scanType, scanName, target, result, startTime, metadata = {}) {
    const endTime = new Date()
    const duration = startTime ? endTime - startTime : 0
    
    return await this.logScanActivity({
      scanType,
      scanName,
      target,
      status: 'completed',
      result: result || 'Scan completed successfully',
      startTime,
      endTime,
      duration,
      metadata: {
        ...metadata,
        action: 'scan_completed'
      }
    })
  }

  /**
   * Log scan failure
   */
  async logScanFailed(scanType, scanName, target, error, startTime, metadata = {}) {
    const endTime = new Date()
    const duration = startTime ? endTime - startTime : 0
    
    return await this.logScanActivity({
      scanType,
      scanName,
      target,
      status: 'failed',
      result: `Scan failed: ${error}`,
      startTime,
      endTime,
      duration,
      metadata: {
        ...metadata,
        action: 'scan_failed',
        error: error.toString()
      }
    })
  }

  /**
   * Log scan abort
   */
  async logScanAborted(scanType, scanName, target, startTime, metadata = {}) {
    const endTime = new Date()
    const duration = startTime ? endTime - startTime : 0
    
    return await this.logScanActivity({
      scanType,
      scanName,
      target,
      status: 'aborted',
      result: 'Scan aborted by user',
      startTime,
      endTime,
      duration,
      metadata: {
        ...metadata,
        action: 'scan_aborted'
      }
    })
  }

  /**
   * Simple logScan method for compatibility with components
   * @param {Object} scanDetails - The scan details object
   */
  async logScan(scanDetails) {
    const logEntry = {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      ...scanDetails,
    }

    // Add to memory
    this.logs.push(logEntry)

    // Persist only to designated folder (no localStorage)

    // Save to file if in Electron environment
    if (this.isElectron) {
      try {
        await this.saveLogToFile(logEntry)
      } catch (error) {
        console.error('Failed to save log to file:', error)
      }
    }

    return logEntry
  }

  /**
   * Save log entry to file via Electron
   * Saves to both user-picked path (PRIORITY 1) and backup path (PRIORITY 2)
   */
  async saveLogToFile(logEntry) {
    if (!this.isElectron) return
    
    // Check if IPC methods are available
    if (!window.cyberGuard.ensureDirectoryExists || !window.cyberGuard.writeFile) {
      console.warn('[scanLogger] IPC file methods not available, skipping file save')
      return
    }

    try {
      // Get user-picked path (PRIORITY 1)
      let userPickedPath = null
      if (window.cyberGuard?.getSystemPath) {
        try {
          const result = await window.cyberGuard.getSystemPath()
          if (result?.success && result?.path) {
            userPickedPath = result.path
            console.log('[scanLogger] User-picked path found:', userPickedPath)
          }
        } catch (err) {
          console.warn('[scanLogger] Error getting user-picked path:', err)
        }
      }

      // Get backup path (PRIORITY 2)
      let backupPath = null
      if (window.cyberGuard?.getUserDataPath) {
        try {
          backupPath = await window.cyberGuard.getUserDataPath()
          console.log('[scanLogger] Backup path found:', backupPath)
        } catch (err) {
          console.warn('[scanLogger] Error getting backup path:', err)
        }
      }

      // Determine paths for both locations
      const userPickedLogsDir = userPickedPath 
        ? `${userPickedPath}/Cyberix-Logs/System Logs`.replace(/\\/g, '/')
        : null
      
      const backupLogsDir = backupPath
        ? `${backupPath}/Cyberix-Logs/System Logs`.replace(/\\/g, '/')
        : null

      // Get primary directory (user-picked if available, otherwise backup)
      const primaryDir = userPickedLogsDir || backupLogsDir || await this.resolveLogsDirectory()

      // Compatibility: if the host provides a consolidated saver, use it as well
      if (window.cyberGuard.saveLogToFile) {
        const dateKey = new Date().toISOString().split('T')[0]
        try { await window.cyberGuard.saveLogToFile(dateKey, logEntry) } catch {}
      }

      // Helper function to save logs to a specific directory
      const saveToDirectory = async (dir, priority) => {
        if (!dir) return

        try {
          // Create logs directory if it doesn't exist
          await window.cyberGuard.ensureDirectoryExists(dir)
          
          // Save individual log entry
          const logFileName = `scan_log_${logEntry.id}.json`
          const entryPath = `${dir}/${logFileName}`
          console.log(`[scanLogger] [${priority}] Writing entry file:`, entryPath)
          try {
            await window.cyberGuard.writeFile(entryPath, JSON.stringify(logEntry, null, 2))
            console.log(`[scanLogger] [${priority}] Entry file written OK:`, entryPath)
          } catch (e) {
            // Retry once after ensuring directory exists
            console.error(`[scanLogger] [${priority}] writeFile failed for entry, retrying:`, e)
            try { await window.cyberGuard.ensureDirectoryExists(dir) } catch {}
            await window.cyberGuard.writeFile(entryPath, JSON.stringify(logEntry, null, 2))
            console.log(`[scanLogger] [${priority}] Entry file written on retry:`, entryPath)
          }

          // Also append to daily log file
          const today = new Date().toISOString().split('T')[0]
          const dailyLogFile = `${dir}/daily_log_${today}.json`
          
          // Read existing daily log or create new one
          let dailyLogs = []
          try {
            const existingContent = await window.cyberGuard.readFile(dailyLogFile)
            dailyLogs = JSON.parse(existingContent)
            console.log(`[scanLogger] [${priority}] Existing daily log entries:`, dailyLogs.length)
          } catch (error) {
            // File doesn't exist, start with empty array
            dailyLogs = []
            console.log(`[scanLogger] [${priority}] Daily log not found, will create:`, dailyLogFile)
          }

          // Add new log entry (avoid duplicates by checking ID)
          const existingIndex = dailyLogs.findIndex(log => log.id === logEntry.id)
          if (existingIndex >= 0) {
            dailyLogs[existingIndex] = logEntry // Update existing
          } else {
            dailyLogs.push(logEntry) // Add new
          }

          // Write back to daily log file
          console.log(`[scanLogger] [${priority}] Writing daily log file:`, dailyLogFile, 'entries:', dailyLogs.length)
          await window.cyberGuard.writeFile(dailyLogFile, JSON.stringify(dailyLogs, null, 2))
          console.log(`[scanLogger] [${priority}] Daily log file written OK:`, dailyLogFile)
        } catch (error) {
          console.error(`[scanLogger] [${priority}] Error saving to directory ${dir}:`, error)
          // Don't throw, continue to next directory
        }
      }

      // PRIORITY 1: Save to user-picked path first
      if (userPickedLogsDir) {
        await saveToDirectory(userPickedLogsDir, 'PRIORITY 1 (User-Picked)')
      }

      // PRIORITY 2: Save to backup path
      if (backupLogsDir && backupLogsDir !== userPickedLogsDir) {
        await saveToDirectory(backupLogsDir, 'PRIORITY 2 (Backup)')
      }

      // Also save to primary directory if it's different from both above
      if (primaryDir && primaryDir !== userPickedLogsDir && primaryDir !== backupLogsDir) {
        await saveToDirectory(primaryDir, 'Fallback')
      }

    } catch (error) {
      console.error('Error saving log to file:', error)
      throw error
    }
  }

  // LocalStorage no longer used
  saveToLocalStorage() {}

  /**
   * Get all logs from localStorage
   */
  getLogsFromStorage() { return [] }

  /**
   * Get logs from file (simplified for SystemLogs component)
   */
  async getLogsFromFile(dateKey) {
    if (this.isElectron) {
      try {
        const baseDir = await this.resolveLogsDirectory()
        const dailyLogFile = `${baseDir}/daily_log_${dateKey}.json`
        console.log('[SystemLogs] Reading specific date file:', dailyLogFile)
        const content = await window.cyberGuard.readFile(dailyLogFile)
        const logs = JSON.parse(content)
        console.log('[SystemLogs] Found', logs.length, 'logs for date', dateKey)
        return logs
      } catch (error) {
        console.error('[SystemLogs] Error reading logs from file:', error)
        return []
      }
    }
    // No Electron: return empty (UI should rely on file logs only)
    console.log('[SystemLogs] Not in Electron, returning empty array')
    return []
  }

  /**
   * Get available log dates (simplified for SystemLogs component)
   */
  async getAvailableLogDates() {
    if (this.isElectron) {
      try {
        const baseDir = await this.resolveLogsDirectory()
        const files = await window.cyberGuard.listFiles(baseDir)
        const logFiles = files.filter(file => file.startsWith('daily_log_') && file.endsWith('.json'))
        
        return logFiles.map(file => {
          const dateMatch = file.match(/daily_log_(\d{4}-\d{2}-\d{2})\.json/)
          return dateMatch ? dateMatch[1] : null
        }).filter(Boolean).sort().reverse()
      } catch (error) {
        console.error('Error getting available log dates:', error)
        return []
      }
    }
    // No Electron: return empty
    return []
  }

  /**
   * Get logs from file system (Electron only)
   */
  async getLogsFromFile(date = null) {
    if (!this.isElectron) return []

    try {
      // Compatibility path
      if (window.cyberGuard.readLogFile) {
        const key = date || new Date().toISOString().split('T')[0]
        const logs = await window.cyberGuard.readLogFile(key)
        return Array.isArray(logs) ? logs : []
      }

      const targetDate = date || new Date().toISOString().split('T')[0]
      const baseDir = await this.resolveLogsDirectory()
      const dailyLogFile = `${baseDir}/daily_log_${targetDate}.json`

      const content = await window.cyberGuard.readFile(dailyLogFile)
      return JSON.parse(content)
    } catch (error) {
      console.error('Error reading logs from file:', error)
      return []
    }
  }

  /**
   * Get all available log dates
   */
  async getAvailableLogDates() {
    if (!this.isElectron) return []

    try {
      // Compatibility: use getLogDates if available
      if (window.cyberGuard.getLogDates) {
        const dates = await window.cyberGuard.getLogDates()
        return Array.isArray(dates) ? dates : []
      }

      const baseDir = await this.resolveLogsDirectory()
      const files = await window.cyberGuard.listFiles(baseDir)
      const logFiles = files.filter(file => file.startsWith('daily_log_') && file.endsWith('.json'))

      return logFiles.map(file => {
        const dateMatch = file.match(/daily_log_(\d{4}-\d{2}-\d{2})\.json/)
        return dateMatch ? dateMatch[1] : null
      }).filter(Boolean).sort().reverse()
    } catch (error) {
      console.error('Error getting available log dates:', error)
      return []
    }
  }

  /**
   * Resolve the absolute logs directory under the software install path
   * Falls back to a relative folder if install path is unavailable.
   */
  async resolveLogsDirectory() {
    if (!this.isElectron) {
      console.log('[SystemLogs] Not in Electron, using relative path: cyberix_scan_logs')
      return 'cyberix_scan_logs'
    }
    if (this.logsDir) {
      console.log('[SystemLogs] Using cached logs directory:', this.logsDir)
      return this.logsDir
    }

    try {
      console.log('[SystemLogs] Resolving logs directory...')
      
      // First, try to get the user's selected system path
      let systemPath = null
      if (window.cyberGuard?.getSystemPath) {
        try {
          const result = await window.cyberGuard.getSystemPath()
          if (result?.success && result?.path) {
            systemPath = result.path
            console.log('[SystemLogs] Found user selected system path:', systemPath)
          }
        } catch (err) {
          console.warn('[SystemLogs] Error getting system path:', err)
        }
      }

      if (systemPath) {
        // Use user's selected path + "Cyberix-Logs/System Logs"
        // New structure: [User Selected Path]/Cyberix-Logs/System Logs/
        const systemLogsPath = `${systemPath}/Cyberix-Logs/System Logs`.replace(/\\/g, '/')
        this.logsDir = systemLogsPath
        console.log('[SystemLogs] Using user selected path for logs:', this.logsDir)
        console.log('[SystemLogs] Full path structure: [User Selected Path]/Cyberix-Logs/System Logs')
      } else {
        // Fallback: use userData path for logs (writable location)
        let userDataPath = null
        if (window.cyberGuard?.getUserDataPath) {
          userDataPath = await window.cyberGuard.getUserDataPath()
          console.log('[SystemLogs] UserData path:', userDataPath)
        }

        if (userDataPath) {
          // Use userData/cyberix_scan_logs as fallback
          this.logsDir = `${userDataPath}/cyberix_scan_logs`.replace(/\\/g, '/')
          console.log('[SystemLogs] Using userData path for logs (fallback):', this.logsDir)
        } else {
          // Fallback to Downloads for first-time use
          if (window.cyberGuard?.getDownloadsPath) {
            const downloads = await window.cyberGuard.getDownloadsPath()
            const base = (downloads || '').replace(/[\\/]+$/, '')
            this.logsDir = base ? `${base}/cyberix_scan_logs` : 'cyberix_scan_logs'
            console.log('[SystemLogs] Using Downloads path for logs (fallback):', this.logsDir)
          } else {
            this.logsDir = 'cyberix_scan_logs'
            console.log('[SystemLogs] Using fallback path for logs:', this.logsDir)
          }
        }
      }

      // Ensure directory exists
      try { 
        await window.cyberGuard.ensureDirectoryExists(this.logsDir)
        console.log('[SystemLogs] Directory ensured:', this.logsDir)
      } catch (err) {
        console.error('[SystemLogs] Failed to ensure directory:', err)
      }
      return this.logsDir
    } catch (err) {
      this.logsDir = 'cyberix_scan_logs'
      console.error('[SystemLogs] Error resolving logs directory, using fallback:', err)
      return this.logsDir
    }
  }

  /**
   * Get all logs across all daily files (for "All Dates")
   */
  async getAllLogsFromFiles() {
    if (!this.isElectron) {
      console.log('[SystemLogs] Not in Electron, returning empty array')
      return []
    }
    try {
      const baseDir = await this.resolveLogsDirectory()
      console.log('[SystemLogs] Fetching logs from directory:', baseDir)
      
      const files = await window.cyberGuard.listFiles(baseDir)
      console.log('[SystemLogs] Files found in directory:', files)
      
      const daily = files.filter(f => f.startsWith('daily_log_') && f.endsWith('.json'))
      console.log('[SystemLogs] Daily log files:', daily)
      
      const all = []
      for (const f of daily) {
        try {
          const filePath = `${baseDir}/${f}`
          console.log('[SystemLogs] Reading file:', filePath)
          const content = await window.cyberGuard.readFile(filePath)
          const arr = JSON.parse(content)
          if (Array.isArray(arr)) {
            console.log('[SystemLogs] Found', arr.length, 'logs in', f)
            all.push(...arr)
          }
        } catch (err) {
          console.error('[SystemLogs] Error reading file', f, ':', err)
        }
      }
      console.log('[SystemLogs] Total logs loaded:', all.length)
      return all
    } catch (e) {
      console.error('[SystemLogs] Error reading all logs from files:', e)
      return []
    }
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get or create session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('cyberix_session_id')
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      sessionStorage.setItem('cyberix_session_id', sessionId)
    }
    return sessionId
  }

  /**
   * Format duration for display
   */
  formatDuration(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  /**
   * Get scan statistics
   */
  getScanStatistics(logs = null) {
    const logsToAnalyze = logs || this.logs
    
    const stats = {
      total: logsToAnalyze.length,
      byType: {},
      byStatus: {},
      byDate: {},
      totalDuration: 0,
      averageDuration: 0
    }

    logsToAnalyze.forEach(log => {
      // By type
      stats.byType[log.scanType] = (stats.byType[log.scanType] || 0) + 1
      
      // By status
      stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1
      
      // By date
      const date = log.timestamp.split('T')[0]
      stats.byDate[date] = (stats.byDate[date] || 0) + 1
      
      // Duration
      if (log.duration) {
        stats.totalDuration += log.duration
      }
    })

    stats.averageDuration = stats.total > 0 ? stats.totalDuration / stats.total : 0

    return stats
  }

  /**
   * Filter logs by criteria
   */
  filterLogs(logs, filters = {}) {
    return logs.filter(log => {
      if (filters.scanType && filters.scanType !== 'all' && log.scanType !== filters.scanType) return false
      if (filters.status && filters.status !== 'all' && log.status !== filters.status) return false
      if (filters.date && filters.date !== 'all' && !log.timestamp.startsWith(filters.date)) return false
      if (filters.target && !log.target.toLowerCase().includes(filters.target.toLowerCase())) return false
      return true
    })
  }

  /**
   * Get scan statistics (for SystemLogs component)
   */
  getScanStatistics(logs) {
    const stats = {
      total: logs.length,
      byStatus: {
        started: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
      },
      byScanType: {},
      averageDuration: 0,
      totalDuration: 0,
    }

    let totalDurationMs = 0
    let completedScansCount = 0

    logs.forEach(log => {
      stats.byStatus[log.status] = (stats.byStatus[log.status] || 0) + 1
      stats.byScanType[log.scanType] = (stats.byScanType[log.scanType] || 0) + 1

      if (log.status === 'completed' && log.startTime && log.endTime) {
        const duration = new Date(log.endTime).getTime() - new Date(log.startTime).getTime()
        totalDurationMs += duration
        completedScansCount++
      }
    })

    if (completedScansCount > 0) {
      stats.averageDuration = totalDurationMs / completedScansCount
    }

    stats.totalDuration = totalDurationMs

    return stats
  }

  /**
   * Format duration from milliseconds to HH:MM:SS
   */
  formatDuration(ms) {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return 'N/A'
    const seconds = Math.floor(ms / 1000)
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  /**
   * Export logs to JSON or CSV
   */
  exportLogs(logs, format) {
    if (format === 'json') {
      return JSON.stringify(logs, null, 2)
    } else if (format === 'csv') {
      if (logs.length === 0) return ''
      const headers = Object.keys(logs[0]).join(',')
      const rows = logs.map(log =>
        Object.values(log).map(value => {
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value.replace(/"/g, '""')}"`
          }
          return value
        }).join(',')
      )
      return [headers, ...rows].join('\n')
    }
    return ''
  }

}

// Create singleton instance
const scanLogger = new ScanLogger()

export default scanLogger
