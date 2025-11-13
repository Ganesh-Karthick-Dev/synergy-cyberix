/**
 * Platform Detection Utility
 * Detects the operating system platform and provides platform-specific utilities
 */

const os = require('os');

/**
 * Detect the current platform
 * @returns {Promise<'windows'|'linux'|'mac'>}
 */
async function detectPlatform() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return 'windows';
  } else if (platform === 'darwin') {
    return 'mac';
  } else if (platform === 'linux') {
    return 'linux';
  } else {
    // Default to linux for other Unix-like systems
    return 'linux';
  }
}

/**
 * Get user home directory path
 * @returns {string}
 */
function getUserHomePath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    // On Windows, return C:/Users/Admin or actual username
    return homeDir;
  } else {
    return homeDir;
  }
}

/**
 * Get installation logs directory path
 * @returns {string}
 */
function getInstallationLogsPath() {
  const platform = os.platform();
  const homeDir = os.homedir();
  
  if (platform === 'win32') {
    return `${homeDir}\\Cyberix Installation Process Logs`;
  } else {
    return `${homeDir}/Cyberix Installation Process Logs`;
  }
}

/**
 * Get installation log file path
 * @returns {string}
 */
function getInstallationLogFilePath() {
  const logsDir = getInstallationLogsPath();
  const platform = os.platform();
  const separator = platform === 'win32' ? '\\' : '/';
  
  return `${logsDir}${separator}installation-process.log`;
}

module.exports = {
  detectPlatform,
  getUserHomePath,
  getInstallationLogsPath,
  getInstallationLogFilePath
};

