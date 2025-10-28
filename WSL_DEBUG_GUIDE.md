# WSL Root Password Verification - Debug Guide

## 📍 Code Locations

### 1. **WSL Root Password Verification** 
**File:** `src/main/main.js`  
**Lines:** 748-825  
**Handler:** `wsl:testRootCredentials`

```javascript
// The exact command executed for root password verification:
const testCommand = `echo "${password}" | wsl -d kali-linux su - root -c "whoami"`;
```

### 2. **WSL User Password Verification** (for comparison)
**File:** `src/main/main.js`  
**Lines:** 670-746  
**Handler:** `wsl:testCredentials`

```javascript
// The exact command executed for user password verification:
const testCommand = `echo "${password}" | wsl -d kali-linux sudo whoami`;
```

### 3. **WSL Root Command Execution**
**File:** `src/main/main.js`  
**Lines:** 2147-2596  
**Handler:** `wsl-run-as-root`

```javascript
// When using stored password:
const bashCommand = `echo "${rootPassword}" | su - root -c "${sanitizedCommand}"`;

// When not using stored password:
wslArgs.push('-u', 'root', '--', 'bash', '-lc', sanitizedCommand);
```

## 🔍 Debug Log Tags

All debug logs use specific tags to make them easy to find:

- **`[WSL-ROOT-AUTH]`** - Root password verification
- **`[WSL-USER-AUTH]`** - User password verification  
- **`[WSL-ROOT-EXEC]`** - Root command execution
- **`[WSL-ROOT]`** - General WSL root operations

## 📊 Debug Log Examples

### Root Password Verification Success:
```
🔐 [WSL-ROOT-AUTH] Starting root credential verification...
🔐 [WSL-ROOT-AUTH] Timestamp: 2024-01-15T10:30:45.123Z
🔐 [WSL-ROOT-AUTH] Password length: 8
🔐 [WSL-ROOT-AUTH] Command to execute: echo "***" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] Full command (DEBUG): echo "mypassword" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] WSL distribution: kali-linux
🔐 [WSL-ROOT-AUTH] Target user: root
🔐 [WSL-ROOT-AUTH] Test command: whoami
🔐 [WSL-ROOT-AUTH] Executing command...
🔐 [WSL-ROOT-AUTH] Command execution completed in 1250 ms
🔐 [WSL-ROOT-AUTH] STDOUT: "root\n"
🔐 [WSL-ROOT-AUTH] STDERR: ""
🔐 [WSL-ROOT-AUTH] STDOUT (trimmed): "root"
🔐 [WSL-ROOT-AUTH] Checking if output equals "root"...
🔐 [WSL-ROOT-AUTH] Output === "root": true
✅ [WSL-ROOT-AUTH] WSL root credentials VALID
✅ [WSL-ROOT-AUTH] Authentication successful
```

### Root Password Verification Failure:
```
🔐 [WSL-ROOT-AUTH] Starting root credential verification...
🔐 [WSL-ROOT-AUTH] Timestamp: 2024-01-15T10:30:45.123Z
🔐 [WSL-ROOT-AUTH] Password length: 8
🔐 [WSL-ROOT-AUTH] Command to execute: echo "***" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] Full command (DEBUG): echo "wrongpass" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] WSL distribution: kali-linux
🔐 [WSL-ROOT-AUTH] Target user: root
🔐 [WSL-ROOT-AUTH] Test command: whoami
🔐 [WSL-ROOT-AUTH] Executing command...
🔐 [WSL-ROOT-AUTH] Command execution completed in 800 ms
🔐 [WSL-ROOT-AUTH] STDOUT: ""
🔐 [WSL-ROOT-AUTH] STDERR: "su: Authentication failure\n"
🔐 [WSL-ROOT-AUTH] STDOUT (trimmed): ""
🔐 [WSL-ROOT-AUTH] Checking if output equals "root"...
🔐 [WSL-ROOT-AUTH] Output === "root": false
❌ [WSL-ROOT-AUTH] WSL root credentials INVALID
❌ [WSL-ROOT-AUTH] Expected output: "root"
❌ [WSL-ROOT-AUTH] Actual output: ""
❌ [WSL-ROOT-AUTH] Authentication failed
```

### Root Command Execution with Stored Password:
```
[WSL-ROOT-EXEC] useStoredPassword: true
[WSL-ROOT-EXEC] Using stored root password (length: 8)
[WSL-ROOT-EXEC] Using WSL distribution: kali-linux
[WSL-ROOT-EXEC] Using password authentication
[WSL-ROOT-EXEC] Bash command (DEBUG): echo "***" | su - root -c "whoami && id"
[WSL-ROOT-EXEC] Full bash command (DEBUG): echo "mypassword" | su - root -c "whoami && id"
[WSL-ROOT-EXEC] Final WSL args: ["-d", "kali-linux", "--", "bash", "-lc", "echo \"mypassword\" | su - root -c \"whoami && id\""]
[WSL-ROOT-EXEC] Full WSL command: wsl -d kali-linux -- bash -lc echo "mypassword" | su - root -c "whoami && id"
```

## 🛠️ How to Debug

### 1. **Enable Debug Logging**
The debug logs are automatically enabled. Look for them in:
- **Main Process Console** (Electron DevTools)
- **Terminal/Command Prompt** where you started the app

### 2. **Test Root Password Verification**
```javascript
// In your component or test:
const result = await window.cyberGuard.testWslRootCredentials('your_password');
console.log('Result:', result);
```

### 3. **Test Root Command Execution**
```javascript
// In your component or test:
const result = await window.cyberGuard.runAsRoot({
  distro: 'kali-linux',
  command: 'whoami && id',
  requireConfirm: false,
  useStoredPassword: true
});
console.log('Result:', result);
```

### 4. **Check WSL Distribution**
Make sure your WSL distribution is named `kali-linux`. If it's different, you'll see errors like:
```
❌ [WSL-ROOT-AUTH] Error code: 1
❌ [WSL-ROOT-AUTH] Error message: Command failed: wsl -d kali-linux su - root -c "whoami"
```

## 🔧 Common Issues & Solutions

### Issue 1: "WSL not found"
**Debug Log:**
```
❌ [WSL-ROOT-AUTH] Error code: ENOENT
❌ [WSL-ROOT-AUTH] Error message: spawn wsl ENOENT
```
**Solution:** Ensure WSL is installed and in PATH

### Issue 2: "Distribution not found"
**Debug Log:**
```
❌ [WSL-ROOT-AUTH] Error code: 1
❌ [WSL-ROOT-AUTH] STDERR: "The distribution 'kali-linux' could not be found."
```
**Solution:** Check your WSL distribution name with `wsl --list`

### Issue 3: "Authentication failure"
**Debug Log:**
```
❌ [WSL-ROOT-AUTH] STDERR: "su: Authentication failure"
❌ [WSL-ROOT-AUTH] STDOUT: ""
```
**Solution:** Verify your root password is correct

### Issue 4: "Permission denied"
**Debug Log:**
```
❌ [WSL-ROOT-AUTH] STDERR: "su: must be run from a terminal"
```
**Solution:** This is a WSL limitation. The `su` command needs a proper terminal.

## 🧪 Manual Testing

You can test the exact commands manually in your terminal:

### Test Root Password:
```bash
echo "your_password" | wsl -d kali-linux su - root -c "whoami"
```

### Test User Password:
```bash
echo "your_password" | wsl -d kali-linux sudo whoami
```

### Test Root Command Execution:
```bash
wsl -d kali-linux -- bash -lc 'echo "your_password" | su - root -c "whoami && id"'
```

## 📝 Debug Output Structure

Each debug log includes:
- **Timestamp**: When the operation started
- **Password Length**: Length of the password (for verification)
- **Command**: The exact command being executed
- **WSL Distribution**: Which WSL distro is being used
- **Execution Time**: How long the command took
- **STDOUT/STDERR**: Complete output from the command
- **Result**: Whether the operation succeeded or failed
- **Error Details**: Full error information if it failed

## 🎯 Key Debug Points

1. **Password Length**: Should match your actual password length
2. **WSL Distribution**: Should be `kali-linux` or your actual distro name
3. **Command Structure**: Should match the expected format
4. **Output**: Should be exactly `"root"` for successful authentication
5. **Error Codes**: Check for specific error codes (ENOENT, 1, etc.)

This debug system will help you identify exactly where the WSL root password verification is failing and provide detailed information to troubleshoot the issue.
