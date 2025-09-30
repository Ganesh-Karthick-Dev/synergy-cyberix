# Cyberix Desktop App Troubleshooting Guide

## 🚨 White Screen Issues - SOLVED!

### ✅ **What I Fixed:**

1. **Port Mismatch Issue**: 
   - **Problem**: Electron was hardcoded to load from port 6969, but Vite was running on port 6977
   - **Solution**: Made Electron dynamically try multiple ports (6969, 6970, 6971, 6972, 6973, 6974, 6975, 6976, 6977, 5173, 3000)

2. **WSL Error Handling**:
   - **Problem**: Unhandled promise rejections were causing script execution failures
   - **Solution**: Added proper try-catch blocks around all WSL-related operations

3. **JavaScript Execution Errors**:
   - **Problem**: Electron was trying to execute JavaScript before the page was fully loaded
   - **Solution**: Added error handling for all `executeJavaScript` calls

## 🚀 **How to Run the Desktop App:**

### Method 1: Using the Batch Script (Recommended)
```bash
# Double-click the batch file
run-desktop.bat
```

### Method 2: Manual Steps
```bash
# Terminal 1: Start development server
npm run dev

# Terminal 2: Start Electron app
npm run electron
```

### Method 3: Combined Command
```bash
npm run electron:dev
```

## 🔧 **Current Status:**

- ✅ **Vite Dev Server**: Running on port 6977
- ✅ **Electron App**: Running and should now load properly
- ✅ **Framework Detection**: Fully functional
- ⚠️ **WSL**: Not configured (optional for advanced features)

## 🖥️ **What You Should See:**

1. **Electron Window Opens**: A desktop application window should appear
2. **Login Screen**: Cyberix login interface
3. **Dashboard**: After login with `admin` / `admin@123`
4. **Framework Detection**: Real website analysis (no more static data!)

## 🐛 **If You Still See White Screen:**

### Quick Fixes:

1. **Check Console Logs**:
   - Press `F12` or `Ctrl+Shift+I` to open DevTools
   - Look for error messages in the Console tab

2. **Verify Ports**:
   ```bash
   netstat -an | findstr :6977
   ```
   Should show: `TCP [::1]:6977 [::]:0 LISTENING`

3. **Restart Everything**:
   ```bash
   # Kill all Electron processes
   taskkill /f /im electron.exe
   
   # Restart
   npm run electron:dev
   ```

4. **Check Vite Server**:
   - Open browser to `http://localhost:6977`
   - Should show the Cyberix web app

## 🔍 **Debugging Steps:**

### Step 1: Check if Vite is Running
```bash
# Should show port 6977 listening
netstat -an | findstr :6977
```

### Step 2: Test Web Version
- Open browser to `http://localhost:6977`
- If this works, the issue is with Electron
- If this doesn't work, the issue is with Vite

### Step 3: Check Electron Logs
- Look at the terminal where you ran `npm run electron`
- Should see: `✅ Successfully loaded from port 6977`

### Step 4: Check DevTools
- In Electron app, press `F12`
- Look for errors in Console tab
- Check Network tab for failed requests

## 🚀 **Advanced Features:**

### Framework Detection (Now Working!)
- **Real Detection**: No more static data
- **Multiple Methods**: HTTP headers, HTML content, URL patterns, etc.
- **Confidence Scoring**: Shows how reliable the detection is
- **WSL Integration**: Optional advanced tools when available

### Test URLs:
- `https://reactjs.org` - React framework
- `https://vuejs.org` - Vue.js framework  
- `https://wordpress.org` - WordPress CMS
- `https://shopify.com` - Shopify platform
- `https://nextjs.org` - Next.js framework

## 🔧 **WSL Setup (Optional):**

If you want advanced security tools:

```bash
# Install WSL
wsl --install

# Install Kali Linux
wsl --install kali-linux

# After reboot, install tools
wsl -d kali-linux
sudo apt update && sudo apt upgrade -y
sudo apt install whatweb nmap nikto dirb gobuster nuclei subfinder httpx -y
```

## 📞 **Still Having Issues?**

1. **Check the terminal output** for specific error messages
2. **Try the web version** at `http://localhost:6977`
3. **Use the batch script** `run-desktop.bat`
4. **Restart your computer** if WSL issues persist

## 🎉 **Success Indicators:**

- ✅ Electron window opens without white screen
- ✅ Login screen appears
- ✅ Dashboard loads after login
- ✅ Framework detection works with real websites
- ✅ No unhandled promise rejection errors in terminal

The desktop app should now work perfectly with real framework detection instead of static data!
