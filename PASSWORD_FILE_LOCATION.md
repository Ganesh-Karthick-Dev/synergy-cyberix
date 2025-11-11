# Password File Location

## Where is the password file located?

The password file is located at:
```
%APPDATA%\Cyberix\wsl_password.enc
```

On Windows, this typically resolves to:
```
C:\Users\<YourUsername>\AppData\Roaming\Cyberix\wsl_password.enc
```

## How to delete it:

1. Press `Win + R` to open Run dialog
2. Type: `%APPDATA%\Cyberix`
3. Press Enter
4. Look for `wsl_password.enc` file
5. Delete it

Or use PowerShell:
```powershell
Remove-Item "$env:APPDATA\Cyberix\wsl_password.enc" -ErrorAction SilentlyContinue
```

## Why Kali commands work without password but tgpt doesn't?

### Kali Commands (whatweb, ping, nmap, etc.):
- They use: `wsl -u root -- <command>`
- This directly runs as **root user** in WSL
- Root user has full permissions, so **no password needed**
- Example: `wsl -u root -- nmap -sn 192.168.1.1`

### tgpt Command:
- It uses: `wsl bash -c 'tgpt'`
- This runs as the **default WSL user** (not root)
- If tgpt needs sudo access or is installed in a system location, it might fail
- **Solution**: We should run tgpt as root: `wsl -u root -- bash -c 'tgpt'`

## The Fix Needed:

The tgpt command should be changed from:
```javascript
spawn('wsl', ['bash', '-c', 'tgpt'], ...)
```

To:
```javascript
spawn('wsl', ['-u', 'root', '--', 'bash', '-c', 'tgpt'], ...)
```

This way, tgpt will run as root user (just like other Kali commands) and won't need a password.

