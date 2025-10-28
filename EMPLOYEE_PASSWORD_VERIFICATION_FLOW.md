# Employee WSL Password Verification Flow & Debug Logs

## 🔄 Complete Flow When Employee Provides Password

### Step 1: Employee Enters Password in UI
**Component:** `WslPasswordPrompt.jsx` (line 51)
```javascript
// Employee types password and clicks "Test & Save"
isValid = await testWslRootCredentials(password);
```

### Step 2: Password Manager Calls Main Process
**File:** `src/utils/wslPasswordManager.js` (line 140)
```javascript
// Calls Electron API to test credentials
const result = await window.cyberGuard.testWslRootCredentials(password);
```

### Step 3: Main Process Executes WSL Command
**File:** `src/main/main.js` (line 712)
```javascript
// The exact Linux command executed in WSL:
const testCommand = `echo "${password}" | wsl -d kali-linux su - root -c "whoami"`;
```

## 📊 Complete Debug Log Example

Here's what you'll see in the console when an employee provides their password:

### **Scenario 1: Valid Password (Success)**

```
🔐 [WSL-ROOT-AUTH] Starting root credential verification...
🔐 [WSL-ROOT-AUTH] Timestamp: 2024-01-15T14:30:25.456Z
🔐 [WSL-ROOT-AUTH] Password length: 12
🔐 [WSL-ROOT-AUTH] Command to execute: echo "***" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] Full command (DEBUG): echo "employee123" | wsl -d kali-linux su - root -c "whoami"
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

**What happens next:**
```
🔐 Storing root password...
🔐 [WSL-ROOT-AUTH] Password stored successfully
✅ WSL root password verified and saved!
```

### **Scenario 2: Invalid Password (Failure)**

```
🔐 [WSL-ROOT-AUTH] Starting root credential verification...
🔐 [WSL-ROOT-AUTH] Timestamp: 2024-01-15T14:30:25.456Z
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

**What happens next:**
```
❌ Invalid WSL root password. Please check your password.
```

### **Scenario 3: WSL Not Available (Error)**

```
🔐 [WSL-ROOT-AUTH] Starting root credential verification...
🔐 [WSL-ROOT-AUTH] Timestamp: 2024-01-15T14:30:25.456Z
🔐 [WSL-ROOT-AUTH] Password length: 10
🔐 [WSL-ROOT-AUTH] Command to execute: echo "***" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] Full command (DEBUG): echo "mypassword" | wsl -d kali-linux su - root -c "whoami"
🔐 [WSL-ROOT-AUTH] WSL distribution: kali-linux
🔐 [WSL-ROOT-AUTH] Target user: root
🔐 [WSL-ROOT-AUTH] Test command: whoami
🔐 [WSL-ROOT-AUTH] Executing command...
❌ [WSL-ROOT-AUTH] WSL root credential test FAILED
❌ [WSL-ROOT-AUTH] Error type: Error
❌ [WSL-ROOT-AUTH] Error message: Command failed: wsl -d kali-linux su - root -c "whoami"
❌ [WSL-ROOT-AUTH] Error code: 1
❌ [WSL-ROOT-AUTH] Error signal: null
❌ [WSL-ROOT-AUTH] Error stack: Error: Command failed: wsl -d kali-linux su - root -c "whoami"
    at ChildProcess.exithandler (child_process.js:308:12)
    at ChildProcess.emit (events.js:200:13)
    at maybeClose (internal/child_process.js:1021:16)
    at Process.ChildProcess._handle.onexit (internal/child_process.js:283:5)
❌ [WSL-ROOT-AUTH] Duration before error: 500 ms
```

## 🔍 What Each Log Line Means

| Log Line | Meaning |
|----------|---------|
| `Password length: X` | Length of password employee entered |
| `Command to execute: echo "***"` | Safe version (password hidden) |
| `Full command (DEBUG): echo "actualpass"` | **ACTUAL COMMAND** with real password |
| `WSL distribution: kali-linux` | Which WSL distro is being tested |
| `Target user: root` | We're testing root access |
| `Test command: whoami` | The Linux command to verify identity |
| `Command execution completed in X ms` | How long the WSL command took |
| `STDOUT: "root\n"` | **SUCCESS**: Command returned "root" |
| `STDOUT: ""` | **FAILURE**: No output (wrong password) |
| `STDERR: "su: Authentication failure"` | **FAILURE**: WSL rejected the password |
| `Output === "root": true/false` | **FINAL RESULT**: Password valid or not |

## 🧪 Manual Testing Commands

You can test the exact same commands manually in your terminal:

### Test Employee's Root Password:
```bash
# Replace "employee123" with actual password
echo "employee123" | wsl -d kali-linux su - root -c "whoami"
```

**Expected Output:**
- **Success:** `root`
- **Failure:** (empty output + error message)

### Test Employee's User Password (sudo):
```bash
# Replace "employee123" with actual password  
echo "employee123" | wsl -d kali-linux sudo whoami
```

**Expected Output:**
- **Success:** `root`
- **Failure:** (empty output + error message)

## 🎯 Key Debug Points for Employee Password Verification

1. **Password Length**: Should match what employee typed
2. **WSL Distribution**: Must be `kali-linux` (or your actual distro name)
3. **Command Structure**: `echo "password" | wsl -d kali-linux su - root -c "whoami"`
4. **Success Criteria**: STDOUT must be exactly `"root"`
5. **Failure Indicators**: Empty STDOUT + STDERR with "Authentication failure"

## 🔧 Troubleshooting Employee Password Issues

### Issue: "Authentication failure"
**Debug Log Shows:**
```
STDERR: "su: Authentication failure"
STDOUT: ""
```
**Solution:** Employee entered wrong password

### Issue: "Distribution not found"
**Debug Log Shows:**
```
Error message: The distribution 'kali-linux' could not be found
```
**Solution:** Check WSL distribution name with `wsl --list`

### Issue: "WSL not found"
**Debug Log Shows:**
```
Error code: ENOENT
Error message: spawn wsl ENOENT
```
**Solution:** WSL not installed or not in PATH

### Issue: "Permission denied"
**Debug Log Shows:**
```
STDERR: "su: must be run from a terminal"
```
**Solution:** WSL terminal limitation - this is expected behavior

## 📝 Security Notes

- **Password Logging**: The actual password is logged in debug mode (line with "Full command (DEBUG)")
- **Production**: Remove debug logging in production to avoid password exposure
- **Storage**: Password is stored in localStorage (obfuscated) and main process memory
- **Verification**: Password is tested in real-time against actual WSL system

This debug system gives you complete visibility into how employee passwords are verified against the WSL system.
