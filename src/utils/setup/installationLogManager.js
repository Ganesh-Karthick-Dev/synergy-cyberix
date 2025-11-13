/**
 * Installation Log Manager
 * Manages installation process logs in C:/Users/Admin/AppData/Roaming/Cyberix/installation_process
 */

const fs = require('fs');
const path = require('path');

class InstallationLogManager {
  constructor() {
    this.logsPath = null;
    this.logFilePath = null;
    this.initialized = false;
  }

  /**
   * Get default installation process path
   * @returns {string} Path to installation_process folder
   */
  getDefaultInstallationPath() {
    const os = require('os');
    const platform = os.platform();
    const homeDir = os.homedir();
    
    if (platform === 'win32') {
      // Use AppData\Roaming\Cyberix\installation_process
      return path.join(homeDir, 'AppData', 'Roaming', 'Cyberix', 'installation_process');
    } else {
      return path.join(homeDir, '.cyberix', 'installation_process');
    }
  }

  /**
   * Initialize the log manager
   * @param {string} customPath - Optional custom path (if user selected different location)
   */
  async initialize(customPath = null) {
    try {
      if (customPath) {
        // If custom path provided, use Cyberix-Logs/installation_process inside it
        this.logsPath = path.join(customPath, 'Cyberix-Logs', 'installation_process');
      } else {
        // Use default: C:/Users/Admin/AppData/Roaming/Cyberix/installation_process
        this.logsPath = this.getDefaultInstallationPath();
      }

      // Log file is inside installation_process folder
      this.logFilePath = path.join(this.logsPath, 'installation-process.log');

      // Ensure directory exists
      if (!fs.existsSync(this.logsPath)) {
        fs.mkdirSync(this.logsPath, { recursive: true });
      }

      this.initialized = true;
      return { success: true, path: this.logsPath };
    } catch (error) {
      console.error('[InstallationLogManager] Initialization error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log a step completion
   * @param {number} stepNumber - Step number (1-5)
   * @param {string} description - Step description
   * @param {string} status - Status: 'completed', 'failed', 'in_progress'
   * @param {string} details - Optional details
   * @param {string} userPickedPath - Optional user-picked path to save in log
   */
  async logStep(stepNumber, description, status = 'completed', details = '', userPickedPath = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const timestamp = new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
      let logEntry = `Step ${stepNumber}: ${description} - ${statusEmoji} ${status.toUpperCase()} on ${timestamp}${details ? ` - ${details}` : ''}\n`;
      
      // If Step 5 (System Path Selection) and path is provided, add it to the log
      if (stepNumber === 5 && userPickedPath && status === 'completed') {
        logEntry += `User Selected Path: ${userPickedPath}\n`;
      }

      // Append to log file (user-picked path if initialized with custom path)
      fs.appendFileSync(this.logFilePath, logEntry, 'utf8');
      
      // Also write to backup location (default path) if user picked a different path
      // Check if current path is different from default path
      const defaultPath = this.getDefaultInstallationPath();
      const currentPathNormalized = path.normalize(this.logsPath);
      const defaultPathNormalized = path.normalize(defaultPath);
      
      if (userPickedPath && currentPathNormalized !== defaultPathNormalized) {
        // User picked a custom path, also write to backup location
        const defaultLogFile = path.join(defaultPath, 'installation-process.log');
        
        // Ensure default directory exists
        if (!fs.existsSync(defaultPath)) {
          fs.mkdirSync(defaultPath, { recursive: true });
        }
        
        // Append to backup location
        fs.appendFileSync(defaultLogFile, logEntry, 'utf8');
        console.log('[InstallationLogManager] Also wrote to backup location:', defaultLogFile);
      } else if (userPickedPath && currentPathNormalized === defaultPathNormalized) {
        // User is using default path, but we still want to ensure it's in the new structure
        // The new structure is: C:\Users\Admin\AppData\Roaming\Cyberix\Cyberix-Logs\installation_process
        const os = require('os');
        const homeDir = os.homedir();
        const newDefaultPath = path.join(homeDir, 'AppData', 'Roaming', 'Cyberix', 'Cyberix-Logs', 'installation_process');
        const newDefaultLogFile = path.join(newDefaultPath, 'installation-process.log');
        
        // Only write if it's different from current path
        if (path.normalize(newDefaultPath) !== currentPathNormalized) {
          if (!fs.existsSync(newDefaultPath)) {
            fs.mkdirSync(newDefaultPath, { recursive: true });
          }
          fs.appendFileSync(newDefaultLogFile, logEntry, 'utf8');
          console.log('[InstallationLogManager] Also wrote to new default structure:', newDefaultLogFile);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('[InstallationLogManager] Log step error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Read installation log file
   * @returns {Promise<{success: boolean, logs?: string, error?: string}>}
   */
  async readLogs() {
    try {
      if (!fs.existsSync(this.logFilePath)) {
        return { success: true, logs: '' };
      }

      const logs = fs.readFileSync(this.logFilePath, 'utf8');
      return { success: true, logs };
    } catch (error) {
      console.error('[InstallationLogManager] Read logs error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get last completed step number from logs
   * @returns {Promise<{success: boolean, stepNumber?: number, error?: string}>}
   */
  async getLastCompletedStep() {
    try {
      const result = await this.readLogs();
      if (!result.success || !result.logs) {
        return { success: true, stepNumber: 0 };
      }

      const lines = result.logs.split('\n').filter(line => line.trim());
      let lastStep = 0;

      for (const line of lines) {
        // Match: Step X: ... - ✅ COMPLETED on ...
        const match = line.match(/Step (\d+):.*✅ COMPLETED/);
        if (match) {
          const stepNum = parseInt(match[1], 10);
          if (stepNum > lastStep) {
            lastStep = stepNum;
          }
        }
      }

      return { success: true, stepNumber: lastStep };
    } catch (error) {
      console.error('[InstallationLogManager] Get last step error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if installation log file exists
   * @returns {boolean}
   */
  logFileExists() {
    try {
      if (!this.initialized) {
        // Try to get default path
        const defaultPath = this.getDefaultInstallationPath();
        const logPath = path.join(defaultPath, 'installation-process.log');
        return fs.existsSync(logPath);
      }
      return fs.existsSync(this.logFilePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Move logs to new location (when user selects system path)
   * @param {string} newPath - New path to move logs to
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async moveLogsToPath(newPath) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // New structure: UserPath/Cyberix-Logs/installation_process/
      const cyberixLogsPath = path.join(newPath, 'Cyberix-Logs');
      const installationLogsPath = path.join(cyberixLogsPath, 'installation_process');
      const newLogFilePath = path.join(installationLogsPath, 'installation-process.log');

      // Delete old "Cyberix Installation Process Logs" folder if it exists directly in newPath or in Cyberix-Logs
      const oldLogsPath1 = path.join(newPath, 'Cyberix Installation Process Logs');
      if (fs.existsSync(oldLogsPath1)) {
        console.log('[InstallationLogManager] Deleting old logs folder:', oldLogsPath1);
        fs.rmSync(oldLogsPath1, { recursive: true, force: true });
      }
      
      const oldLogsPath2 = path.join(cyberixLogsPath, 'Cyberix Installation Process Logs');
      if (fs.existsSync(oldLogsPath2)) {
        console.log('[InstallationLogManager] Deleting old logs folder:', oldLogsPath2);
        fs.rmSync(oldLogsPath2, { recursive: true, force: true });
      }

      // Create new directory structure
      if (!fs.existsSync(installationLogsPath)) {
        fs.mkdirSync(installationLogsPath, { recursive: true });
      }

      // Copy log file if it exists
      if (fs.existsSync(this.logFilePath)) {
        const logs = fs.readFileSync(this.logFilePath, 'utf8');
        fs.writeFileSync(newLogFilePath, logs, 'utf8');
      } else {
        // Create empty log file
        fs.writeFileSync(newLogFilePath, '', 'utf8');
      }

      // Update paths
      this.logsPath = installationLogsPath;
      this.logFilePath = newLogFilePath;

      return { success: true, newPath: installationLogsPath };
    } catch (error) {
      console.error('[InstallationLogManager] Move logs error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create System Logs subfolder
   * @param {string} basePath - Base path (user selected path)
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  async createSystemLogsFolder(basePath) {
    try {
      // New structure: UserPath/Cyberix-Logs/System Logs/
      const cyberixLogsPath = path.join(basePath, 'Cyberix-Logs');
      const systemLogsPath = path.join(cyberixLogsPath, 'System Logs');
      
      // Delete old "System Logs" folder if it exists in wrong location
      const oldSystemLogsPath1 = path.join(basePath, 'Cyberix Installation Process Logs', 'System Logs');
      if (fs.existsSync(oldSystemLogsPath1)) {
        console.log('[InstallationLogManager] Deleting old system logs folder:', oldSystemLogsPath1);
        fs.rmSync(oldSystemLogsPath1, { recursive: true, force: true });
      }
      
      const oldSystemLogsPath2 = path.join(basePath, 'System Logs');
      if (fs.existsSync(oldSystemLogsPath2)) {
        console.log('[InstallationLogManager] Deleting old system logs folder:', oldSystemLogsPath2);
        fs.rmSync(oldSystemLogsPath2, { recursive: true, force: true });
      }
      
      if (!fs.existsSync(systemLogsPath)) {
        fs.mkdirSync(systemLogsPath, { recursive: true });
      }

      return { success: true, path: systemLogsPath };
    } catch (error) {
      console.error('[InstallationLogManager] Create system logs folder error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const installationLogManager = new InstallationLogManager();

module.exports = installationLogManager;

