/**
 * Command Executor Utility
 * Executes WSL commands with proper error handling and logging
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class CommandExecutor {
  constructor(onLog = null) {
    this.onLog = onLog || (() => {});
  }

  /**
   * Execute a WSL command
   * @param {string} command - Command to execute
   * @param {string} password - WSL password (if needed for sudo)
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<{success: boolean, stdout: string, stderr: string, error?: string}>}
   */
  async executeWslCommand(command, password = null, timeout = 30000) {
    try {
      this.onLog(`Executing: ${command.replace(password || '', '***')}`, 'info');
      
      const { stdout, stderr } = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024, // 10MB
        timeout: timeout,
        windowsHide: true
      });

      this.onLog(`Command completed successfully`, 'success');
      
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        error: null
      };
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      this.onLog(`Command failed: ${errorMsg}`, 'error');
      
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        error: errorMsg,
        code: error.code
      };
    }
  }

  /**
   * Execute a WSL command as root
   * @param {string} command - Command to execute
   * @param {string} password - WSL password
   * @param {string} username - WSL username (default: root)
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<{success: boolean, stdout: string, stderr: string, error?: string}>}
   */
  async executeWslAsRoot(command, password, username = 'root', timeout = 30000) {
    try {
      // Escape command for bash
      const escapedCommand = command.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      
      // Use sudo with password
      const fullCommand = `wsl -u ${username} bash -c "echo '${password}' | sudo -S ${escapedCommand}"`;
      
      this.onLog(`Executing as root: ${command}`, 'info');
      
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: timeout,
        windowsHide: true
      });

      this.onLog(`Root command completed`, 'success');
      
      return {
        success: true,
        stdout: stdout || '',
        stderr: stderr || '',
        error: null
      };
    } catch (error) {
      const errorMsg = error.message || 'Unknown error';
      this.onLog(`Root command failed: ${errorMsg}`, 'error');
      
      return {
        success: false,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        error: errorMsg,
        code: error.code
      };
    }
  }

  /**
   * Execute multiple commands sequentially
   * @param {Array<{command: string, description: string}>} commands - Array of commands
   * @param {string} password - WSL password
   * @param {string} username - WSL username
   * @returns {Promise<{success: boolean, results: Array, failedCommands: Array}>}
   */
  async executeCommandsSequentially(commands, password, username = 'root') {
    const results = [];
    const failedCommands = [];

    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      this.onLog(`[${i + 1}/${commands.length}] ${cmd.description}`, 'info');
      
      const result = await this.executeWslAsRoot(cmd.command, password, username);
      results.push({ ...cmd, result });

      if (!result.success) {
        failedCommands.push(cmd);
        this.onLog(`Failed: ${cmd.description}`, 'error');
      } else {
        this.onLog(`Success: ${cmd.description}`, 'success');
      }

      // Small delay between commands
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
      success: failedCommands.length === 0,
      results,
      failedCommands
    };
  }

  /**
   * Retry a command multiple times
   * @param {Function} commandFn - Function that returns a promise
   * @param {number} maxRetries - Maximum number of retries
   * @param {string} description - Description for logging
   * @returns {Promise<{success: boolean, result?: any, attempts: number}>}
   */
  async retryCommand(commandFn, maxRetries = 5, description = 'Command') {
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.onLog(`${description} - Attempt ${attempt}/${maxRetries}`, 'info');
        const result = await commandFn();
        
        if (result.success !== false) {
          this.onLog(`${description} - Success on attempt ${attempt}`, 'success');
          return { success: true, result, attempts: attempt };
        }
        
        lastError = result.error || 'Command failed';
      } catch (error) {
        lastError = error.message || 'Unknown error';
        this.onLog(`${description} - Attempt ${attempt} failed: ${lastError}`, 'error');
      }

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.onLog(`${description} - Failed after ${maxRetries} attempts`, 'error');
    return { success: false, error: lastError, attempts: maxRetries };
  }
}

module.exports = CommandExecutor;

