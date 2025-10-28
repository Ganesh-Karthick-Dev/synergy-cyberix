# WSL Root Execution Feature

## Overview

This feature provides secure execution of commands with root privileges in WSL (Windows Subsystem for Linux) distributions. It implements a comprehensive security model with user confirmation, input validation, timeout protection, and comprehensive logging.

## Security Features

### 🔒 Core Security Measures
- **User Confirmation**: Always shows a dialog with the exact command before execution
- **Input Validation**: Validates all inputs server-side in the main process
- **Command Sanitization**: Prevents command injection attacks
- **Timeout Protection**: 120-second default timeout to prevent hanging processes
- **Structured Commands**: Whitelisted actions and packages for script mode
- **Comprehensive Logging**: All execution attempts are logged with hashes (not plaintext)

### 🛡️ Security Architecture
- **Context Isolation**: Renderer runs with `contextIsolation: true` and `nodeIntegration: false`
- **IPC Security**: All communication goes through secure IPC channels
- **Process Isolation**: Commands run in separate WSL processes
- **Error Handling**: Graceful handling of ENOENT, timeouts, and other errors

## API Reference

### Main Process Handler
```javascript
ipcMain.handle('wsl-run-as-root', async (event, { distro, command, requireConfirm = true }) => {
  // Implementation in src/main/main.js
});
```

### Preload API
```javascript
window.cyberGuard.runAsRoot({
  distro: 'kali-linux',        // Optional: WSL distribution name
  command: 'whoami && id',     // Required: Command to execute
  requireConfirm: true         // Optional: Show confirmation dialog (default: true)
});
```

### Return Format
```javascript
{
  success: boolean,           // true if command executed successfully
  stdout: string,            // Standard output
  stderr: string,            // Standard error
  code: number,              // Exit code
  timedOut: boolean,         // true if command timed out
  duration: number,          // Execution time in milliseconds
  error?: string             // Error message if execution failed
}
```

## Usage Examples

### Basic Command Execution
```javascript
// Simple command with confirmation
const result = await window.cyberGuard.runAsRoot({
  command: 'whoami && id'
});

// Command without confirmation (use with caution)
const result = await window.cyberGuard.runAsRoot({
  command: 'apt update',
  requireConfirm: false
});

// Specific distribution
const result = await window.cyberGuard.runAsRoot({
  distro: 'kali-linux',
  command: 'nmap --version'
});
```

### Secure Script Mode
```javascript
// Install a package using the secure runner script
const result = await window.cyberGuard.runAsRoot({
  command: `echo '{"action":"install","package":"nmap"}' | /home/\${USER}/myapp/runner.sh`
});
```

## File Structure

```
├── src/main/main.js              # Main process with IPC handler
├── src/main/preload.js           # Preload script with contextBridge API
├── scripts/runner.sh             # Secure command runner script
├── wsl-root-demo.html            # Demo UI interface
├── wsl-root-demo.js              # Demo renderer script
└── WSL_ROOT_EXECUTION_README.md  # This documentation
```

## Security Logging

All WSL root execution attempts are logged to:
- **Console**: Real-time logging with structured JSON
- **File**: `%USERDATA%/security-logs/wsl-root-YYYY-MM-DD.log`

### Log Format
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "action": "wsl_root_execution_attempt",
  "distro": "kali-linux",
  "commandLength": 15,
  "commandHash": "a1b2c3d4e5f6g7h8",
  "userAgent": "Mozilla/5.0...",
  "processId": 12345
}
```

## Manual Acceptance Tests

### Test 1: Basic Command Execution
1. Launch the Cyberix application
2. Open the WSL Root Demo interface
3. Enter command: `whoami && id`
4. Click "Execute as Root"
5. **Expected**: Confirmation dialog appears
6. Click "Execute as Root" in dialog
7. **Expected**: Result shows `root` user and ID information

### Test 2: Non-existent Distribution
1. Select a non-existent distribution (e.g., "nonexistent-distro")
2. Enter command: `echo "test"`
3. Click "Execute as Root"
4. **Expected**: Helpful error message about distribution not found

### Test 3: Timeout Protection
1. Enter long-running command: `sleep 180`
2. Click "Execute as Root"
3. **Expected**: Command times out after 120 seconds and returns `timedOut: true`

### Test 4: No Confirmation Mode
1. Uncheck "Require confirmation dialog"
2. Enter command: `whoami`
3. Click "Execute as Root"
4. **Expected**: Command executes immediately without confirmation dialog

### Test 5: Secure Script Mode
1. Switch to "Secure Script Mode" panel
2. Select "Install Package" action
3. Select "nmap" package
4. Click "Run Secure Script"
5. **Expected**: nmap is installed using the secure runner script

## Security Considerations

### ⚠️ Important Security Notes

1. **Root Privileges**: This feature executes commands with full root privileges in WSL
2. **User Responsibility**: Users must understand the implications of running commands as root
3. **Command Validation**: Always validate commands before execution
4. **Network Security**: Commands can access network resources and modify system files
5. **Logging**: All execution attempts are logged for security auditing

### 🔐 Best Practices

1. **Use Confirmation**: Always require user confirmation for production use
2. **Validate Inputs**: Implement additional validation in your application
3. **Monitor Logs**: Regularly review security logs for suspicious activity
4. **Limit Access**: Restrict this feature to authorized users only
5. **Use Script Mode**: Prefer structured commands over raw shell commands

### 🚨 Security Warnings

- **Never** accept untrusted commands from remote sources
- **Always** validate and sanitize user inputs
- **Consider** implementing command whitelisting for production use
- **Monitor** execution logs for security incidents
- **Educate** users about the security implications

## Troubleshooting

### Common Issues

1. **WSL Not Found**
   - Ensure WSL is installed: `wsl --install`
   - Check WSL is in PATH: `where wsl`

2. **Permission Denied**
   - Ensure the user has permission to run WSL commands
   - Check if WSL distribution is properly configured

3. **Command Timeout**
   - Commands have a 120-second timeout by default
   - For longer operations, consider breaking into smaller commands

4. **Distribution Not Found**
   - Verify the distribution name: `wsl -l -v`
   - Use exact distribution name or leave empty for default

### Debug Mode

Enable debug logging by setting:
```javascript
// In main process
process.env.DEBUG_WSL_ROOT = 'true';
```

## Production Deployment

### Security Checklist

- [ ] Enable all security features (confirmation, validation, logging)
- [ ] Implement proper user authentication and authorization
- [ ] Set up log monitoring and alerting
- [ ] Configure command whitelisting if needed
- [ ] Test all security features thoroughly
- [ ] Document security procedures for users
- [ ] Implement rate limiting if necessary
- [ ] Set up regular security audits

### Configuration

```javascript
// Example production configuration
const WSL_ROOT_CONFIG = {
  timeout: 120000,           // 2 minutes
  requireConfirm: true,      // Always require confirmation
  logLevel: 'info',         // Logging level
  maxCommandLength: 1000,   // Maximum command length
  allowedDistros: [         // Whitelist of allowed distributions
    'kali-linux',
    'Ubuntu',
    'Debian'
  ]
};
```

## Support

For security issues or questions about this feature:
1. Review the security logs
2. Check the troubleshooting section
3. Contact the development team
4. Report security vulnerabilities responsibly

---

**⚠️ SECURITY WARNING**: This feature provides root-level access to WSL systems. Use with extreme caution and only for authorized security testing purposes.
