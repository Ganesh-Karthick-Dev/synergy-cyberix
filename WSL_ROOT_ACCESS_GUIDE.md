# WSL Root Access Implementation Guide

## Overview

This implementation provides secure direct access to WSL's root user by getting the password from the user and verifying it. The system includes password storage, verification, and secure execution of root commands.

## Features

### 🔐 Password Management
- **Root Password Storage**: Secure storage of WSL root passwords in both localStorage and main process memory
- **Password Verification**: Real-time testing of root credentials before storage
- **Credential Persistence**: Passwords persist across app sessions
- **Secure Clearing**: Ability to clear stored credentials

### 🛡️ Security Features
- **Input Validation**: All inputs are validated and sanitized
- **Command Sanitization**: Prevents command injection attacks
- **Timeout Protection**: Commands have default 120-second timeout
- **Comprehensive Logging**: All root execution attempts are logged
- **User Confirmation**: Optional confirmation dialogs for root commands

### 🚀 Root Execution
- **Direct Root Access**: Execute commands directly as root user
- **Password Authentication**: Uses stored credentials for seamless execution
- **Error Handling**: Graceful handling of authentication failures
- **Output Capture**: Full stdout/stderr capture and return

## Implementation Details

### 1. Password Manager (`src/utils/wslPasswordManager.js`)

```javascript
// Store root password
await storeWslRootPassword(password);

// Test root credentials
const isValid = await testWslRootCredentials(password);

// Check if password is stored
const hasPassword = hasWslRootPassword();

// Clear stored password
await clearWslRootPassword();
```

### 2. Password Prompt Component (`src/components/WslPasswordPrompt.jsx`)

The password prompt now supports both regular user and root access modes:

```jsx
<WslPasswordPrompt 
  isOpen={showPrompt}
  onClose={() => setShowPrompt(false)}
  onSuccess={(username, password) => {
    console.log('Credentials saved:', username);
  }}
/>
```

**Features:**
- Toggle between regular user and root access modes
- Real-time password verification
- Secure password storage
- Visual feedback for different access levels

### 3. Main Process Handlers (`src/main/main.js`)

#### Root Credential Testing
```javascript
ipcMain.handle('wsl:testRootCredentials', async (event, password) => {
  // Tests root password using: echo "password" | wsl -d kali-linux su - root -c "whoami"
});
```

#### Root Command Execution
```javascript
ipcMain.handle('wsl-run-as-root', async (event, { distro, command, requireConfirm, useStoredPassword }) => {
  // Executes commands as root with stored password authentication
});
```

### 4. Preload API (`src/main/preload.js`)

```javascript
// Test root credentials
window.cyberGuard.testWslRootCredentials(password);

// Execute as root
window.cyberGuard.runAsRoot({
  distro: 'kali-linux',
  command: 'whoami && id',
  requireConfirm: true,
  useStoredPassword: true
});

// Manage stored passwords
window.cyberGuard.storeRootPassword(password);
window.cyberGuard.clearRootPassword();
```

## Usage Examples

### 1. Setting Up Root Access

```javascript
import { WslPasswordPrompt } from './components/WslPasswordPrompt';

function MyComponent() {
  const [showPrompt, setShowPrompt] = useState(false);

  const handleSetupRoot = () => {
    setShowPrompt(true);
  };

  return (
    <div>
      <button onClick={handleSetupRoot}>
        Setup WSL Root Access
      </button>
      
      <WslPasswordPrompt 
        isOpen={showPrompt}
        onClose={() => setShowPrompt(false)}
        onSuccess={(username, password) => {
          console.log('Root access configured for:', username);
          setShowPrompt(false);
        }}
      />
    </div>
  );
}
```

### 2. Testing Root Access

```javascript
import WslRootAccessTest from './components/WslRootAccessTest';

function SecurityDashboard() {
  return (
    <div>
      <h1>Security Tools</h1>
      <WslRootAccessTest />
    </div>
  );
}
```

### 3. Executing Root Commands

```javascript
const executeRootCommand = async () => {
  try {
    const result = await window.cyberGuard.runAsRoot({
      distro: 'kali-linux',
      command: 'apt update && apt upgrade -y',
      requireConfirm: true,
      useStoredPassword: true
    });

    if (result.success) {
      console.log('Command output:', result.stdout);
    } else {
      console.error('Command failed:', result.error);
    }
  } catch (error) {
    console.error('Execution error:', error);
  }
};
```

## Security Considerations

### 🔒 Password Storage
- Passwords are obfuscated using base64 encoding (not true encryption)
- Stored in both localStorage (persistence) and main process memory (immediate access)
- Main process memory is cleared on app restart

### 🛡️ Command Execution
- All commands are validated and sanitized
- User confirmation is required by default
- Comprehensive logging of all execution attempts
- Timeout protection prevents hanging processes

### 📝 Logging
- All root execution attempts are logged with timestamps
- Command hashes are logged (not plaintext commands)
- Security logs are stored in `userData/security-logs/`

## File Structure

```
src/
├── components/
│   ├── WslPasswordPrompt.jsx      # Password input dialog
│   └── WslRootAccessTest.jsx      # Test component
├── utils/
│   └── wslPasswordManager.js      # Password management utilities
├── main/
│   ├── main.js                    # Main process handlers
│   └── preload.js                 # Renderer API exposure
└── WSL_ROOT_ACCESS_GUIDE.md       # This documentation
```

## Testing

Use the `WslRootAccessTest` component to verify your root access setup:

1. **Setup**: Enter your WSL root password using the password prompt
2. **Test**: Click "Test Root Access" to verify credentials
3. **Verify**: Check the output to ensure root access is working
4. **Cleanup**: Use "Clear Password" to remove stored credentials

## Troubleshooting

### Common Issues

1. **"Invalid root password"**
   - Verify your WSL root password is correct
   - Ensure WSL is properly configured
   - Check that the kali-linux distribution is installed

2. **"WSL not found"**
   - Ensure WSL is installed and available in PATH
   - Verify the kali-linux distribution is installed
   - Check WSL service is running

3. **"No stored root password found"**
   - Use the password prompt to set up root access first
   - Ensure the password was successfully stored
   - Check browser localStorage permissions

### Debug Information

Enable debug logging by checking the browser console and main process logs for detailed information about:
- Password verification attempts
- Command execution details
- Error messages and stack traces
- Security log entries

## Future Enhancements

- **True Encryption**: Implement proper encryption for password storage
- **Keychain Integration**: Use OS keychain for secure credential storage
- **Multi-Distro Support**: Support for multiple WSL distributions
- **Credential Rotation**: Automatic password expiration and rotation
- **Audit Trail**: Enhanced logging and audit capabilities
