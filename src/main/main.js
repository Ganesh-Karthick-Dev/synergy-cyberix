const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const { spawn } = require('child_process');
const { detectPlatform, checkWslInstalled, installWsl, installUbuntu, verifyUbuntuInstalled } = require('./osCheck');
require('dotenv').config();
const wslHelper = require(path.join(__dirname, '..', 'utils', 'wslHelper'));

// Load toolInstaller with error handling for packaged app
let toolInstaller;
try {
  toolInstaller = require(path.join(__dirname, '..', 'setup', 'toolInstaller'));
} catch (error) {
  console.error('[MAIN] Failed to load toolInstaller:', error.message);
  console.error('[MAIN] __dirname:', __dirname);
  console.error('[MAIN] Attempted path:', path.join(__dirname, '..', 'setup', 'toolInstaller'));
  // Try alternative paths as fallback
  try {
    toolInstaller = require('./setup/toolInstaller');
  } catch (e2) {
    try {
      toolInstaller = require('../setup/toolInstaller');
    } catch (e3) {
      console.error('[MAIN] All attempts to load toolInstaller failed');
      throw new Error(`Cannot find toolInstaller module. Please ensure src/setup/toolInstaller.js is included in the build. Original error: ${error.message}`);
    }
  }
}

// Properly detect production mode - use app.isPackaged for Electron apps
// app.isPackaged is true when the app is packaged/distributed
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// File-based logging for debugging (works even when console isn't visible)
const logFile = path.join(app.getPath('userData'), 'cyberix-debug.log');
function logToFile(message) {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage, 'utf8');
  } catch (err) {
    // Silently fail if logging fails
  }
}

// Log startup info
logToFile(`=== Cyberix Startup ===`);
logToFile(`isDev: ${isDev}`);
logToFile(`app.isPackaged: ${app.isPackaged}`);
logToFile(`NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
logToFile(`__dirname: ${__dirname}`);
logToFile(`app.getAppPath(): ${app.getAppPath()}`);
logToFile(`process.resourcesPath: ${process.resourcesPath || 'undefined'}`);

console.log('[MAIN] Debug log file:', logFile);
console.log('[MAIN] isDev:', isDev, 'app.isPackaged:', app.isPackaged);

// Secure password storage functions
function getPasswordFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'wsl_password.enc');
}

function encryptPassword(password) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync('synergy-cyberix-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAAD(Buffer.from('synergy-cyberix', 'utf8'));
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Failed to encrypt password:', error);
    throw error;
  }
}

function decryptPassword(encryptedData) {
  try {
    if (!encryptedData || !encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
      console.error('Invalid encrypted data structure:', Object.keys(encryptedData || {}));
      return null;
    }
    
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync('synergy-cyberix-key', 'salt', 32);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAAD(Buffer.from('synergy-cyberix', 'utf8'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt password:', error.message);
    console.error('Error stack:', error.stack);
    return null;
  }
}

function storePasswordSecurely(password) {
  try {
    // Use async scrypt for better performance (non-blocking)
    const encryptedData = encryptPassword(password);
    const passwordFile = getPasswordFilePath();
    
    // Ensure directory exists
    const passwordDir = path.dirname(passwordFile);
    if (!fs.existsSync(passwordDir)) {
      fs.mkdirSync(passwordDir, { recursive: true });
    }
    
    fs.writeFileSync(passwordFile, JSON.stringify(encryptedData), 'utf8');
    console.log('🔐 Password stored securely');
    return true;
  } catch (error) {
    console.error('Failed to store password:', error);
    return false;
  }
}

function loadStoredPassword() {
  try {
    const passwordFile = getPasswordFilePath();
    console.log('[PASSWORD] Checking password file at:', passwordFile);
    
    if (!fs.existsSync(passwordFile)) {
      console.log('[PASSWORD] ⚠️ Password file does not exist');
      return null;
    }
    
    console.log('[PASSWORD] ✅ Password file exists, reading...');
    const fileContent = fs.readFileSync(passwordFile, 'utf8');
    console.log('[PASSWORD] File content length:', fileContent.length);
    
    const encryptedData = JSON.parse(fileContent);
    console.log('[PASSWORD] Encrypted data keys:', Object.keys(encryptedData));
    
    const password = decryptPassword(encryptedData);
    if (password) {
      console.log('[PASSWORD] ✅ Password successfully decrypted (length:', password.length, ')');
      return password;
    } else {
      console.log('[PASSWORD] ❌ Password decryption returned null');
      return null;
    }
  } catch (error) {
    console.error('[PASSWORD] ❌ Failed to load password:', error.message);
    console.error('[PASSWORD] Error stack:', error.stack);
    return null;
  }
}

function clearStoredPassword() {
  try {
    const passwordFile = getPasswordFilePath();
    if (fs.existsSync(passwordFile)) {
      fs.unlinkSync(passwordFile);
      console.log('🔐 Stored password cleared');
    }
    return true;
  } catch (error) {
    console.error('Failed to clear password:', error);
    return false;
  }
}

// Helper: check if Kali Linux is installed in WSL
function checkKaliInstalled() {
  // Method 1: Check with wsl --status (most reliable)
  try {
    const sp = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['--status'], { 
      encoding: 'utf8',
      timeout: 5000 // Reduced timeout
    });
    
    if (sp.status === 0) {
      const rawOutput = (sp.stdout || '').trim();
      // Clean up Unicode null characters that Windows PowerShell sometimes adds
      const output = rawOutput.replace(/\u0000/g, '');
      console.log('WSL status output:', output); // Debug logging
      
      // Check if Kali Linux is mentioned in the status
      const lowerOutput = output.toLowerCase();
      const hasKali = lowerOutput.includes('kali-linux') || 
                     lowerOutput.includes('kali_linux') ||
                     lowerOutput.includes('kali');
      
      if (hasKali) {
        console.log('✅ Kali detected via wsl --status'); // Debug logging
        return true;
      }
    } else {
      console.log('WSL --status command failed with status:', sp.status);
      console.log('WSL stderr:', sp.stderr);
      // If WSL is not properly configured, don't try other methods
      if (sp.stderr && sp.stderr.includes('not supported with your current machine configuration')) {
        console.log('WSL not properly configured - skipping further checks');
        return false;
      }
    }
  } catch (e) {
    console.log('Kali check error (method 1 - wsl --status):', e.message);
  }

  // Method 2: Check with wsl -l -v (detailed list)
  try {
    const sp2 = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-l', '-v'], { 
      encoding: 'utf8',
      timeout: 10000
    });
    
    if (sp2.status === 0) {
      const output = (sp2.stdout || '').trim();
      console.log('WSL detailed output:', output); // Debug logging
      
      // Check for various Kali Linux distribution names
      const lowerOutput = output.toLowerCase();
      const hasKali = lowerOutput.includes('kali') || 
                     lowerOutput.includes('kali-linux') ||
                     lowerOutput.includes('kali_linux');
      
      if (hasKali) {
        console.log('✅ Kali detected via wsl -l -v'); // Debug logging
        return true;
      }
    } else {
      console.log('WSL -l -v command failed with status:', sp2.status);
      console.log('WSL stderr:', sp2.stderr);
    }
  } catch (e) {
    console.log('Kali check error (method 2):', e.message);
  }

  // Method 3: Check with wsl -l (simple list)
  try {
    const sp3 = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-l'], { 
      encoding: 'utf8',
      timeout: 10000
    });
    
    if (sp3.status === 0) {
      const output = (sp3.stdout || '').trim();
      console.log('WSL simple output:', output); // Debug logging
      
      const lowerOutput = output.toLowerCase();
      const hasKali = lowerOutput.includes('kali') || 
                     lowerOutput.includes('kali-linux') ||
                     lowerOutput.includes('kali_linux');
      
      if (hasKali) {
        console.log('✅ Kali detected via wsl -l'); // Debug logging
        return true;
      }
    }
  } catch (e) {
    console.log('Kali check error (method 3):', e.message);
  }

  // Method 4: Try to run a command in Kali directly
  try {
    const sp4 = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'echo', 'kali-detected'], { 
      encoding: 'utf8',
      timeout: 5000
    });
    
    if (sp4.status === 0 && (sp4.stdout || '').includes('kali-detected')) {
      console.log('✅ Kali detected via direct command execution'); // Debug logging
      return true;
    }
  } catch (e) {
    console.log('Kali check error (method 4):', e.message);
  }

  console.log('❌ Kali not detected by any method'); // Debug logging
  return false;
}

// Helper: automatically install Kali Linux with real-time progress and percentage
async function installKaliLinux(event = null) {
  console.log('🚀 [KALI-INSTALL] Starting automatic Kali Linux installation...');
  
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    
    // Progress tracking
    let currentProgress = 0;
    let installationStage = 'initializing';
    const startTime = Date.now();
    let lastProgressUpdate = Date.now();
    
    // Send initial progress update
    const sendProgress = (percentage, message, stage = null) => {
      if (event && event.sender && !event.sender.isDestroyed()) {
        const progressData = {
          percentage: percentage,
          message: message,
          stage: stage || installationStage,
          elapsed: Math.floor((Date.now() - startTime) / 1000) // seconds
        };
        event.sender.send('kali:installProgress', progressData);
        console.log(`📊 [KALI-INSTALL] Progress: ${percentage}% - ${message}`);
      }
    };
    
    sendProgress(0, 'Starting Kali Linux installation...', 'initializing');
    
    // Use wsl --install -d kali-linux for automatic installation
    const installProcess = spawn('C:\\Windows\\System32\\wsl.exe', ['--install', '-d', 'kali-linux'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });
    
    let output = '';
    let errorOutput = '';
    let lineBuffer = '';
    
    // Progress estimation based on stages
    const progressStages = {
      'initializing': { min: 0, max: 5 },
      'checking': { min: 5, max: 10 },
      'downloading': { min: 10, max: 70 },  // Longest stage
      'extracting': { min: 70, max: 85 },
      'installing': { min: 85, max: 95 },
      'configuring': { min: 95, max: 99 },
      'completing': { min: 99, max: 100 }
    };
    
    // Update progress based on elapsed time (fallback if no output)
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const elapsedMinutes = Math.floor(elapsed / 60000);
      
      // If no output for a while, estimate progress based on time
      if (Date.now() - lastProgressUpdate > 30000) { // 30 seconds
        if (installationStage === 'downloading') {
          // Estimate download progress (typically 10-30 minutes)
          const estimatedProgress = Math.min(70, 10 + (elapsedMinutes * 2));
          if (estimatedProgress > currentProgress) {
            currentProgress = estimatedProgress;
            sendProgress(currentProgress, `Downloading Kali Linux... (${elapsedMinutes} minutes elapsed)`, 'downloading');
          }
        } else if (installationStage === 'installing') {
          // Estimate install progress (typically 2-5 minutes)
          const estimatedProgress = Math.min(95, 85 + (elapsedMinutes * 2));
          if (estimatedProgress > currentProgress) {
            currentProgress = estimatedProgress;
            sendProgress(currentProgress, `Installing Kali Linux... (${elapsedMinutes} minutes elapsed)`, 'installing');
          }
        }
      }
    }, 5000); // Update every 5 seconds
    
    // Parse output line by line for progress indicators
    installProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      lineBuffer += text;
      
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      lastProgressUpdate = Date.now();
      
      for (const line of lines) {
        const lineLower = line.toLowerCase().trim();
        console.log('📥 [KALI-INSTALL] stdout:', line);
        
        // Detect installation stages from output
        if (lineLower.includes('downloading') || lineLower.includes('download')) {
          installationStage = 'downloading';
          currentProgress = Math.max(currentProgress, 15);
          sendProgress(currentProgress, 'Downloading Kali Linux (~1-2GB)... This may take 10-30 minutes.', 'downloading');
        } else if (lineLower.includes('extracting') || lineLower.includes('extract')) {
          installationStage = 'extracting';
          currentProgress = Math.max(currentProgress, 70);
          sendProgress(currentProgress, 'Extracting Kali Linux files...', 'extracting');
        } else if (lineLower.includes('installing') || lineLower.includes('install') || lineLower.includes('setting up')) {
          installationStage = 'installing';
          currentProgress = Math.max(currentProgress, 85);
          sendProgress(currentProgress, 'Installing Kali Linux...', 'installing');
        } else if (lineLower.includes('configuring') || lineLower.includes('configure') || lineLower.includes('setting')) {
          installationStage = 'configuring';
          currentProgress = Math.max(currentProgress, 95);
          sendProgress(currentProgress, 'Configuring Kali Linux...', 'configuring');
        } else if (lineLower.includes('complete') || lineLower.includes('finished') || lineLower.includes('done')) {
          installationStage = 'completing';
          currentProgress = 100;
          sendProgress(100, 'Kali Linux installation completed!', 'completing');
        } else if (lineLower.includes('error') || lineLower.includes('failed') || lineLower.includes('failure')) {
          // Error detected in output
          const errorMsg = `Error during ${installationStage}: ${line}`;
          console.error('❌ [KALI-INSTALL]', errorMsg);
          sendProgress(currentProgress, `⚠️ ${errorMsg}`, 'error');
        } else if (lineLower.includes('percent') || lineLower.includes('%')) {
          // Try to extract percentage from output
          const percentMatch = lineLower.match(/(\d+)%/);
          if (percentMatch) {
            const extractedPercent = parseInt(percentMatch[1], 10);
            const stageProgress = progressStages[installationStage];
            if (stageProgress) {
              // Map percentage to current stage range
              const stageRange = stageProgress.max - stageProgress.min;
              currentProgress = Math.max(currentProgress, 
                stageProgress.min + Math.floor((extractedPercent / 100) * stageRange)
              );
              sendProgress(currentProgress, `Installing Kali Linux... ${extractedPercent}%`, installationStage);
            }
          }
        }
      }
    });
    
    installProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('⚠️ [KALI-INSTALL] stderr:', text);
      
      // Check for errors in stderr
      const textLower = text.toLowerCase();
      if (textLower.includes('error') && !textLower.includes('information')) {
        const errorMsg = `Installation error: ${text.trim()}`;
        console.error('❌ [KALI-INSTALL]', errorMsg);
        sendProgress(currentProgress, `❌ ${errorMsg}`, 'error');
      }
    });
    
    installProcess.on('close', (code) => {
      clearInterval(progressTimer);
      
      console.log(`📋 [KALI-INSTALL] Process exited with code ${code}`);
      console.log(`📋 [KALI-INSTALL] STDOUT length: ${output.length}`);
      console.log(`📋 [KALI-INSTALL] STDERR length: ${errorOutput.length}`);
      
      const combinedOutput = (output + errorOutput).toLowerCase();
      const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
      
      if (code === 0) {
        console.log('✅ [KALI-INSTALL] Kali Linux installation completed successfully');
        sendProgress(100, 'Kali Linux installation completed successfully!', 'completed');
        
        // Wait a moment for system to register the installation
        setTimeout(() => {
          resolve(true);
        }, 2000);
      } else {
        // Check if installation was actually initiated despite non-zero exit code
        const hasInstallationIndicators = 
          combinedOutput.includes('kali') ||
          combinedOutput.includes('download') ||
          combinedOutput.includes('install') ||
          combinedOutput.includes('extract') ||
          combinedOutput.includes('complete') ||
          combinedOutput.includes('success');
        
        const hasClearErrors = 
          combinedOutput.includes('error: invalid') ||
          combinedOutput.includes('not found') ||
          combinedOutput.includes('unable to') ||
          combinedOutput.includes('cannot') ||
          combinedOutput.includes('failed');
        
        if (hasInstallationIndicators && !hasClearErrors) {
          // Installation likely started but didn't complete within our timeout
          console.log('⚠️ [KALI-INSTALL] Installation appears to have been initiated');
          sendProgress(95, 'Kali Linux installation initiated. It may still be downloading/installing in the background. Please wait a few more minutes.', 'installing');
          resolve(true); // Treat as success - installation continues in background
        } else if (hasClearErrors) {
          // Clear error - provide detailed error message
          let errorMessage = 'Kali Linux installation failed. ';
          
          if (combinedOutput.includes('error: invalid') || combinedOutput.includes('invalid distribution')) {
            errorMessage += 'ERROR LOCATION: Distribution name validation failed. ';
            errorMessage += 'PROBLEM: "kali-linux" distribution not recognized. ';
            errorMessage += 'SOLUTION: Try installing manually: wsl --install -d Kali-Linux';
          } else if (combinedOutput.includes('not found') || combinedOutput.includes('does not exist')) {
            errorMessage += 'ERROR LOCATION: WSL distribution repository. ';
            errorMessage += 'PROBLEM: Kali Linux distribution not available in your region/repository. ';
            errorMessage += 'SOLUTION: Update WSL first: wsl --update, then try: wsl --install -d kali-linux';
          } else if (combinedOutput.includes('network') || combinedOutput.includes('connection')) {
            errorMessage += 'ERROR LOCATION: Network download. ';
            errorMessage += 'PROBLEM: Unable to download Kali Linux due to network issues. ';
            errorMessage += 'SOLUTION: Check your internet connection and try again later.';
          } else if (combinedOutput.includes('access') || combinedOutput.includes('permission')) {
            errorMessage += 'ERROR LOCATION: System permissions. ';
            errorMessage += 'PROBLEM: Insufficient permissions to install WSL distribution. ';
            errorMessage += 'SOLUTION: Run PowerShell as Administrator and execute: wsl --install -d kali-linux';
          } else {
            errorMessage += `PROBLEM: Exit code ${code}. See console logs for details. `;
            errorMessage += `SOLUTION: Try manual installation: wsl --install -d kali-linux`;
          }
          
          console.error('❌ [KALI-INSTALL]', errorMessage);
          console.error('❌ [KALI-INSTALL] STDOUT:', output.substring(0, 1000));
          console.error('❌ [KALI-INSTALL] STDERR:', errorOutput.substring(0, 1000));
          
          sendProgress(currentProgress, errorMessage, 'error');
          resolve(false);
        } else {
          // Unknown status - likely installation is running in background
          console.log('⚠️ [KALI-INSTALL] Installation status unclear - may be in progress');
          sendProgress(90, `Installation process completed with exit code ${code}. Installation may still be in progress. Please wait ${Math.max(0, 30 - elapsedMinutes)} more minutes.`, 'installing');
          resolve(true); // Give benefit of doubt
        }
      }
    });
    
    installProcess.on('error', (err) => {
      clearInterval(progressTimer);
      
      console.error('❌ [KALI-INSTALL] Process error:', err.message);
      
      let errorMessage = 'Kali Linux installation failed. ';
      
      if (err.message.includes('ENOENT') || err.message.includes('not found')) {
        errorMessage += 'ERROR LOCATION: Command execution. ';
        errorMessage += 'PROBLEM: WSL command not found. WSL may not be installed. ';
        errorMessage += 'SOLUTION: Install WSL first, then try installing Kali Linux.';
      } else if (err.message.includes('spawn')) {
        errorMessage += 'ERROR LOCATION: Process spawn. ';
        errorMessage += 'PROBLEM: Unable to start WSL installation process. ';
        errorMessage += 'SOLUTION: Check WSL installation and permissions.';
      } else {
        errorMessage += `PROBLEM: ${err.message} `;
        errorMessage += 'SOLUTION: Try manual installation: wsl --install -d kali-linux';
      }
      
      sendProgress(currentProgress, errorMessage, 'error');
      resolve(false);
    });
  });
}

// Global icon path for notifications
const iconPath = path.join(__dirname, '..', 'assets', 'logo', 'icons8-security-shield-64.png');

async function createMainWindow() {
  // Resolve preload script path - handle both dev and production
  let preloadPath = path.join(__dirname, 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    // Try alternative paths for packaged app
    const altPreloadPaths = [
      path.join(app.getAppPath(), 'src', 'main', 'preload.js'),
      path.join(__dirname, '..', 'main', 'preload.js'),
      path.join(process.resourcesPath, 'app', 'src', 'main', 'preload.js')
    ];
    for (const altPath of altPreloadPaths) {
      if (fs.existsSync(altPath)) {
        preloadPath = altPath;
        console.log('[MAIN] Using preload path:', preloadPath);
        break;
      }
    }
  }
  
  if (!fs.existsSync(preloadPath)) {
    console.warn('[MAIN] ⚠️ Preload script not found, continuing without it');
  }

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    icon: iconPath,
    title: 'Cyberix',
    show: false,
    webPreferences: {
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      enableRemoteModule: false
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Log all console messages for debugging
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    // Filter out harmless DevTools Autofill warnings
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      return; // Suppress these warnings
    }
    // Log important messages
    if (level >= 2) { // Error or warning
      console.log(`[RENDERER ${level === 3 ? 'ERROR' : 'WARN'}]`, message);
    }
  });
  
  // Open DevTools automatically in production for debugging (remove in final release)
  if (!isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // In development, load from Vite dev server
  if (isDev) {
    // Try multiple ports that Vite might use
    const ports = [3000, 5173, 6977, 6969, 6970, 6971, 6972, 6973, 6974, 6975, 6976, 6978];
    let loaded = false;
    
    for (const port of ports) {
      try {
        const url = `http://localhost:${port}/`;
        console.log(`Trying to load from: ${url}`);
        await mainWindow.loadURL(url);
        loaded = true;
        console.log(`✅ Successfully loaded from port ${port}`);
        break;
      } catch (error) {
        console.log(`❌ Failed to load from port ${port}:`, error.message);
        continue;
      }
    }
    
    if (!loaded) {
      console.log('❌ Failed to load from any port, showing error page');
      mainWindow.loadURL(`data:text/html,
        <html>
          <head><title>Cyberix - Loading Error</title></head>
          <body style="font-family: 'Poppins', sans-serif; padding: 20px; background: #1a1a1a; color: white;">
            <h1>🚨 Cyberix Loading Error</h1>
            <p>The development server could not be found. Please ensure:</p>
            <ul>
              <li>Run <code>npm run dev</code> in a separate terminal</li>
              <li>The Vite server is running on one of these ports: ${ports.join(', ')}</li>
              <li>Check the terminal for the correct port number</li>
            </ul>
            <p><strong>Current time:</strong> ${new Date().toLocaleString()}</p>
            <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">🔄 Retry</button>
          </body>
        </html>
      `);
    }
    
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    // Force reload to see any console errors
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('Page loaded, checking for errors...');
    });
  } else {
    // In production, load from dist directory (Vite build output)
    // __dirname points to src/main in the packaged app, so we go up to app root then into dist
    const appPath = app.getAppPath();
    const indexFile = path.join(appPath, 'dist', 'index.html');
    
    console.log('[MAIN] Production mode - Loading index.html');
    logToFile('[MAIN] Production mode - Loading index.html');
    console.log('[MAIN] App path:', appPath);
    logToFile(`[MAIN] App path: ${appPath}`);
    console.log('[MAIN] __dirname:', __dirname);
    logToFile(`[MAIN] __dirname: ${__dirname}`);
    console.log('[MAIN] Index file path:', indexFile);
    logToFile(`[MAIN] Index file path: ${indexFile}`);
    console.log('[MAIN] Index file exists:', fs.existsSync(indexFile));
    logToFile(`[MAIN] Index file exists: ${fs.existsSync(indexFile)}`);
    
    // Try multiple paths in order of likelihood
    const possiblePaths = [
      path.join(appPath, 'dist', 'index.html'), // Standard packaged location
      path.join(__dirname, '..', '..', 'dist', 'index.html'), // If __dirname is src/main
      path.join(__dirname, '..', 'dist', 'index.html'), // Alternative
      path.join(appPath, 'index.html'), // Root level
    ];
    
    let loaded = false;
    for (const filePath of possiblePaths) {
      console.log('[MAIN] Checking path:', filePath);
      logToFile(`[MAIN] Checking path: ${filePath}`);
      if (fs.existsSync(filePath)) {
        console.log('[MAIN] ✅ Found index.html at:', filePath);
        logToFile(`[MAIN] ✅ Found index.html at: ${filePath}`);
        try {
          // Use loadFile which handles path resolution correctly
          mainWindow.loadFile(filePath);
          loaded = true;
          console.log('[MAIN] ✅ Successfully loaded index.html');
          logToFile('[MAIN] ✅ Successfully loaded index.html');
          break;
        } catch (error) {
          console.error('[MAIN] Failed to load file:', error);
          logToFile(`[MAIN] Failed to load file: ${error.message} ${error.stack}`);
          // Try loadURL as fallback
          try {
            // Convert Windows path to file:// URL format
            let fileUrl = filePath.replace(/\\/g, '/');
            // Ensure proper file:// URL format (file:/// for absolute paths)
            if (!fileUrl.startsWith('file://')) {
              if (process.platform === 'win32') {
                fileUrl = `file:///${fileUrl}`;
              } else {
                fileUrl = `file://${fileUrl}`;
              }
            }
            console.log('[MAIN] Trying loadURL with:', fileUrl);
            logToFile(`[MAIN] Trying loadURL with: ${fileUrl}`);
            await mainWindow.loadURL(fileUrl);
            loaded = true;
            logToFile('[MAIN] ✅ Successfully loaded via loadURL');
            break;
          } catch (error2) {
            console.error('[MAIN] loadURL also failed:', error2);
            logToFile(`[MAIN] loadURL also failed: ${error2.message} ${error2.stack}`);
            continue;
          }
        }
      } else {
        logToFile(`[MAIN] Path does not exist: ${filePath}`);
      }
    }
    
    if (!loaded) {
      console.error('[MAIN] ❌ index.html not found in any expected location');
      logToFile('[MAIN] ❌ index.html not found in any expected location');
      logToFile(`[MAIN] Tried paths: ${possiblePaths.join(', ')}`);
      
      // List files in app path for debugging
      try {
        const appPathFiles = fs.readdirSync(appPath);
        logToFile(`[MAIN] Files in app path: ${appPathFiles.join(', ')}`);
        console.log('[MAIN] Files in app path:', appPathFiles);
        
        // Check if dist folder exists
        const distPath = path.join(appPath, 'dist');
        if (fs.existsSync(distPath)) {
          const distFiles = fs.readdirSync(distPath);
          logToFile(`[MAIN] Files in dist folder: ${distFiles.join(', ')}`);
          console.log('[MAIN] Files in dist folder:', distFiles);
        } else {
          logToFile('[MAIN] dist folder does not exist in app path');
          console.log('[MAIN] dist folder does not exist');
        }
      } catch (err) {
        logToFile(`[MAIN] Error listing files: ${err.message}`);
      }
      
      // Show detailed error page with log file location
      const errorHtml = `
        <html>
          <head><title>Cyberix - Loading Error</title></head>
          <body style="font-family: 'Poppins', sans-serif; padding: 20px; background: #1a1a1a; color: white;">
            <h1>🚨 Cyberix Loading Error</h1>
            <p>The application files could not be found. This indicates a build configuration issue.</p>
            <p><strong>App path:</strong> ${appPath}</p>
            <p><strong>__dirname:</strong> ${__dirname}</p>
            <p><strong>Tried paths:</strong></p>
            <ul>
              ${possiblePaths.map(p => `<li>${p}</li>`).join('')}
            </ul>
            <p>Please rebuild the application using <code>npm run build:exe</code></p>
            <p><strong>Debug log file:</strong> <code>${logFile}</code></p>
            <p>Check this file for detailed error information.</p>
          </body>
        </html>
      `;
      mainWindow.loadURL(`data:text/html,${encodeURIComponent(errorHtml)}`);
    }
  }

  // Comprehensive error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[MAIN] ❌ Failed to load:', errorDescription)
    logToFile(`[MAIN] ❌ Failed to load: ${errorDescription}`);
    console.error('[MAIN] Error code:', errorCode)
    logToFile(`[MAIN] Error code: ${errorCode}`);
    console.error('[MAIN] URL:', validatedURL)
    logToFile(`[MAIN] URL: ${validatedURL}`);
    console.error('[MAIN] Is main frame:', isMainFrame)
    logToFile(`[MAIN] Is main frame: ${isMainFrame}`);
    
    if (!isMainFrame) {
      return; // Ignore sub-frame failures
    }
    
    if (isDev) {
      setTimeout(() => {
        console.log('Attempting to reload from current Vite port...')
        mainWindow.loadURL('http://localhost:3000/')
      }, 1000)
    } else {
      // Show error in window
      mainWindow.loadURL(`data:text/html,
        <!DOCTYPE html>
        <html>
          <head>
            <title>Cyberix - Load Error</title>
            <meta charset="UTF-8">
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
              h1 { color: #ff4444; }
              .error-box { background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0; }
              code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; }
            </style>
          </head>
          <body>
            <h1>🚨 Failed to Load Application</h1>
            <div class="error-box">
              <p><strong>Error:</strong> ${errorDescription}</p>
              <p><strong>Error Code:</strong> ${errorCode}</p>
              <p><strong>URL:</strong> <code>${validatedURL}</code></p>
            </div>
            <p>Check the console (DevTools) for more details.</p>
            <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px;">🔄 Retry</button>
          </body>
        </html>
      `);
    }
  });
  
  // Handle page load completion
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] ✅ Page finished loading');
    logToFile('[MAIN] ✅ Page finished loading');
    // Inject error handler to catch React errors
    mainWindow.webContents.executeJavaScript(`
      (function() {
        window.addEventListener('error', function(e) {
          console.error('[RENDERER] Global error:', e.error, e.message, e.filename, e.lineno);
        });
        window.addEventListener('unhandledrejection', function(e) {
          console.error('[RENDERER] Unhandled promise rejection:', e.reason);
        });
        console.log('[RENDERER] Error handlers installed');
      })();
    `).catch(err => console.error('[MAIN] Failed to inject error handlers:', err));
  });
  
  // Handle renderer process crashes
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('[MAIN] ❌ Renderer process crashed:', details);
    logToFile(`[MAIN] ❌ Renderer process crashed: ${JSON.stringify(details)}`);
    mainWindow.loadURL(`data:text/html,
      <!DOCTYPE html>
      <html>
        <head><title>Cyberix - Crash</title></head>
        <body style="font-family: sans-serif; padding: 40px; background: #1a1a1a; color: #fff;">
          <h1>🚨 Application Crashed</h1>
          <p>Reason: ${details.reason}</p>
          <p>Exit Code: ${details.exitCode}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">🔄 Reload</button>
        </body>
      </html>
    `);
  });

  return mainWindow;
}

// Allow renderer to request opening a URL explicitly (register early)
ipcMain.handle('app:openExternal', async (_e, u) => {
  try {
    const nu = new URL(u.startsWith('http') ? u : `https://${u}`)
    if (nu.protocol === 'http:' || nu.protocol === 'https:') {
      await shell.openExternal(nu.toString())
      return { ok: true }
    }
    return { error: 'Invalid URL' }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
})

// Kali Security Scanner handlers (registered early)
let kaliScanChild = null;

// Test handler to verify registration
ipcMain.handle('kali:test', async () => {
    console.log('🔍 [KALI-TEST] Test handler called successfully');
    return { success: true, message: 'Kali handlers are working' };
  });
  
  ipcMain.handle('kali:startScan', async (event, targetUrl) => {
    console.log('🔍 [KALI-SCAN-HANDLER] ===== STARTING KALI SCAN =====');
    console.log('🔍 [KALI-SCAN-HANDLER] Target URL:', targetUrl);
    console.log('🔍 [KALI-SCAN-HANDLER] Timestamp:', new Date().toISOString());
    
    if (kaliScanChild) {
      console.log('🔍 [KALI-SCAN-HANDLER] Scan already running, returning error');
      return { error: 'Kali scan already running' };
    }
    
    try {
      // Import the Kali security scanner module
      // Try multiple possible paths for the scanner
      const possiblePaths = [
        path.join(__dirname, '..', 'scanners', 'kali-security-scanner.js'),
        path.join(process.cwd(), 'src', 'scanners', 'kali-security-scanner.js'),
        path.join(__dirname, 'scanners', 'kali-security-scanner.js')
      ];
      
      console.log('🔍 [KALI-SCAN-HANDLER] Searching for scanner in paths:', possiblePaths);
      
      let scannerPath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          scannerPath = testPath;
          console.log('🔍 [KALI-SCAN-HANDLER] Found scanner at:', testPath);
          break;
        }
      }
      
      if (!scannerPath) {
        console.log('🔍 [KALI-SCAN-HANDLER] Scanner not found in any expected location');
        throw new Error('KaliSecurityScanner file not found in any expected location');
      }
      
      console.log('🔍 [KALI-SCAN-HANDLER] Loading KaliSecurityScanner from:', scannerPath);
      console.log('🔍 [KALI-SCAN-HANDLER] File exists:', fs.existsSync(scannerPath));
      
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(scannerPath)];
      
      const KaliSecurityScanner = require(scannerPath);
      console.log('🔍 [KALI-SCAN-HANDLER] KaliSecurityScanner loaded:', typeof KaliSecurityScanner);
      console.log('🔍 [KALI-SCAN-HANDLER] Is constructor:', typeof KaliSecurityScanner === 'function');
      
      if (typeof KaliSecurityScanner !== 'function') {
        console.log('🔍 [KALI-SCAN-HANDLER] ERROR: KaliSecurityScanner is not a constructor');
        throw new Error(`KaliSecurityScanner is not a constructor. Got: ${typeof KaliSecurityScanner}`);
      }
      
      // Create output directory
      const outputDir = path.join(process.cwd(), 'temp-scans', `kali-scan-${Date.now()}`);
      console.log('🔍 [KALI-SCAN-HANDLER] Creating output directory:', outputDir);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log('🔍 [KALI-SCAN-HANDLER] Output directory created successfully');
      }
      
      // Extract domain from URL for DNS scanning
      let domain = targetUrl;
      try {
        // If it's a full URL, extract the domain
        if (targetUrl.includes('://')) {
          const url = new URL(targetUrl);
          domain = url.hostname;
        } else if (targetUrl.includes('/')) {
          // Handle cases like "webnox.in/path"
          domain = targetUrl.split('/')[0];
        }
        console.log('🔍 [KALI-SCAN-HANDLER] Extracted domain:', domain, 'from URL:', targetUrl);
      } catch (error) {
        console.log('🔍 [KALI-SCAN-HANDLER] Failed to parse URL, using as-is:', targetUrl);
        domain = targetUrl;
      }
      
      // Create scanner instance
      console.log('🔍 [KALI-SCAN-HANDLER] Creating scanner instance...');
      const scanner = new KaliSecurityScanner(domain, outputDir);
      console.log('🔍 [KALI-SCAN-HANDLER] Scanner instance created successfully');
      
      // Set up progress tracking
      console.log('🔍 [KALI-SCAN-HANDLER] Setting up progress callback...');
      scanner.setProgressCallback((progress) => {
        console.log('🔍 [KALI-SCAN-HANDLER] Progress received:', progress);
        event.sender.send('kali:progress', progress);
      });
      
      // Set up completion callback
      console.log('🔍 [KALI-SCAN-HANDLER] Setting up completion callback...');
      scanner.setCompleteCallback((results) => {
        console.log('🔍 [KALI-SCAN-HANDLER] ===== SCAN COMPLETED =====');
        console.log('🔍 [KALI-SCAN-HANDLER] Results received:', !!results);
        console.log('🔍 [KALI-SCAN-HANDLER] Results keys:', results ? Object.keys(results) : 'null');
        event.sender.send('kali:complete', results);
        kaliScanChild = null;
      });
      
      // Start the scan asynchronously
      console.log('🔍 [KALI-SCAN-HANDLER] Starting scan asynchronously...');
      scanner.runAllTests().catch((error) => {
        console.log('🔍 [KALI-SCAN-HANDLER] ===== SCAN ERROR =====');
        console.log('🔍 [KALI-SCAN-HANDLER] Error:', error.message);
        event.sender.send('kali:progress', { 
          stage: 'error', 
          message: `Scan error: ${error.message}`,
          testId: 'error'
        });
        event.sender.send('kali:complete', null);
        kaliScanChild = null;
      });
      
      console.log('🔍 [KALI-SCAN-HANDLER] Scan started successfully, returning OK');
      return { ok: true };
    } catch (error) {
      console.log('🔍 [KALI-SCAN-HANDLER] ===== SCAN START FAILED =====');
      console.log('🔍 [KALI-SCAN-HANDLER] Error:', error.message);
      console.log('🔍 [KALI-SCAN-HANDLER] Stack:', error.stack);
      event.sender.send('kali:progress', { 
        stage: 'error', 
        message: `Failed to start scan: ${error.message}`,
        testId: 'error'
      });
      return { error: error.message };
    }
  });

  // Additional Security Scans Handler
  let additionalScanChild = null;
  ipcMain.handle('kali:startAdditionalScans', async (event, targetDomain) => {
    console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ===== STARTING ADDITIONAL SCANS =====');
    console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Target Domain:', targetDomain);
    console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Timestamp:', new Date().toISOString());
    
    if (additionalScanChild) {
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Additional scans already running, returning error');
      return { error: 'Additional scans already running' };
    }
    
    try {
      // Import the Additional Security Scanner module
      const possiblePaths = [
        path.join(__dirname, '..', 'scanners', 'additional-security-scanner.js'),
        path.join(process.cwd(), 'src', 'scanners', 'additional-security-scanner.js'),
        path.join(__dirname, 'scanners', 'additional-security-scanner.js')
      ];
      
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Searching for scanner in paths:', possiblePaths);
      
      let scannerPath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          scannerPath = testPath;
          console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Found scanner at:', testPath);
          break;
        }
      }
      
      if (!scannerPath) {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Scanner not found in any expected location');
        throw new Error('AdditionalSecurityScanner file not found in any expected location');
      }
      
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Loading AdditionalSecurityScanner from:', scannerPath);
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] File exists:', fs.existsSync(scannerPath));
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] File size:', fs.statSync(scannerPath).size, 'bytes');
      
      // Clear require cache to ensure fresh load
      delete require.cache[require.resolve(scannerPath)];
      
      const AdditionalSecurityScanner = require(scannerPath);
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] AdditionalSecurityScanner loaded:', typeof AdditionalSecurityScanner);
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] AdditionalSecurityScanner constructor:', AdditionalSecurityScanner.toString().substring(0, 200) + '...');
      
      if (typeof AdditionalSecurityScanner !== 'function') {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ERROR: AdditionalSecurityScanner is not a constructor');
        throw new Error(`AdditionalSecurityScanner is not a constructor. Got: ${typeof AdditionalSecurityScanner}`);
      }
      
      // Create scanner instance
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Creating scanner instance...');
      const targetUrl = `https://${targetDomain}`;
      const scanner = new AdditionalSecurityScanner(targetUrl, targetDomain);
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Scanner instance created successfully');
      
      // Commands will run directly in WSL environment without prefix
      console.log('🔧 [ADDITIONAL-SCANS-HANDLER] Commands will run directly in WSL environment');
      
      // Set up progress tracking
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Setting up progress callback...');
      scanner.setProgressCallback((progress) => {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Progress received:', progress);
        event.sender.send('kali:additionalProgress', progress);
      });
      
      // Set up completion callback
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Setting up completion callback...');
      scanner.setCompleteCallback((results) => {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ===== ADDITIONAL SCANS COMPLETED =====');
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Results received:', !!results);
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Results keys:', results ? Object.keys(results) : 'null');
        event.sender.send('kali:additionalComplete', results);
        additionalScanChild = null;
      });
      
      // Start the scans asynchronously
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Starting additional scans asynchronously...');
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Scanner instance methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(scanner)));
      
      scanner.runAllScans().then((results) => {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ===== ADDITIONAL SCANS COMPLETED SUCCESSFULLY =====');
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Results:', results);
      }).catch((error) => {
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ===== ADDITIONAL SCANS FAILED =====');
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Error:', error.message);
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Stack:', error.stack);
        console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Error details:', error);
        event.sender.send('kali:additionalProgress', { 
          testId: 'error',
          message: `Additional scans failed: ${error.message}`,
          type: 'error'
        });
        additionalScanChild = null;
      });
      
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Additional scans started successfully, returning OK');
      return { ok: true };
    } catch (error) {
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] ===== ADDITIONAL SCANS START FAILED =====');
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Error:', error.message);
      console.log('🔍 [ADDITIONAL-SCANS-HANDLER] Stack:', error.stack);
      event.sender.send('kali:additionalProgress', { 
        testId: 'error',
        message: `Failed to start additional scans: ${error.message}`,
        type: 'error'
      });
      return { error: error.message };
    }
  });

  // Network scan handlers (register early, before app.whenReady)
  let networkScanChild = null;
  let networkScanAbortController = null;
  let currentNetworkScanTarget = null;
  
  console.log('[NETWORK-SCAN] Registering networkscan:start handler...');
  ipcMain.handle('networkscan:start', async (event, target) => {
    console.log('[NETWORK-SCAN] Handler called for target:', target);
    if (networkScanChild) return { error: 'Network scan already running' };
    
    try {
      // Create abort controller for this scan
      networkScanAbortController = new AbortController();
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Helper function to strip ANSI escape codes
      const stripAnsiCodes = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '').replace(/\[\d+[m[]?/g, '').trim();
      };
      
      // Helper function to execute command and parse output
      const executeCommand = async (command, timeout = 30000) => {
        try {
          const { stdout, stderr } = await execAsync(command, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: timeout,
            windowsHide: true
          });
          // Strip ANSI codes from output
          return { 
            success: true, 
            stdout: stripAnsiCodes(stdout || ''), 
            stderr: stripAnsiCodes(stderr || ''), 
            error: null 
          };
        } catch (error) {
          // Sanitize error message to remove "wsl" references
          let errorMessage = error.message || '';
          errorMessage = errorMessage.replace(/Command failed: wsl\s+/gi, 'Command failed: ');
          errorMessage = errorMessage.replace(/wsl\s+/gi, '');
          
          // Strip ANSI codes from output
          return { 
            success: false, 
            stdout: stripAnsiCodes(error.stdout || ''), 
            stderr: stripAnsiCodes(error.stderr || ''), 
            error: errorMessage,
            code: error.code
          };
        }
      };
      
      // Parser functions for different command outputs
      const parsePingOutput = (output) => {
        const result = {
          target: null,
          ip: null,
          packetsTransmitted: 0,
          packetsReceived: 0,
          packetLoss: 0,
          time: null,
          rtt: null,
          raw: output
        };
        
        // Extract target and IP
        const pingMatch = output.match(/PING\s+(\S+)\s+\(([^)]+)\)/);
        if (pingMatch) {
          result.target = pingMatch[1];
          result.ip = pingMatch[2];
        }
        
        // Extract statistics
        const statsMatch = output.match(/(\d+)\s+packets\s+transmitted[,\s]+(\d+)\s+received[,\s]+(\d+)%\s+packet\s+loss[,\s]+time\s+(\d+)ms/);
        if (statsMatch) {
          result.packetsTransmitted = parseInt(statsMatch[1]);
          result.packetsReceived = parseInt(statsMatch[2]);
          result.packetLoss = parseInt(statsMatch[3]);
          result.time = parseInt(statsMatch[4]);
        }
        
        // Extract RTT statistics
        const rttMatch = output.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
        if (rttMatch) {
          result.rtt = {
            min: parseFloat(rttMatch[1]),
            avg: parseFloat(rttMatch[2]),
            max: parseFloat(rttMatch[3]),
            mdev: parseFloat(rttMatch[4])
          };
        }
        
        return result;
      };
      
      const parseHostOutput = (output) => {
        const result = {
          domain: null,
          ip: null,
          mxRecords: [],
          txtRecords: [],
          raw: output
        };
        
        const lines = output.split('\n');
        for (const line of lines) {
          // Extract IP address
          const ipMatch = line.match(/has\s+address\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
          if (ipMatch) {
            result.ip = ipMatch[1];
          }
          
          // Extract MX records
          const mxMatch = line.match(/mail\s+is\s+handled\s+by\s+(\d+)\s+(\S+)/);
          if (mxMatch) {
            result.mxRecords.push({ priority: parseInt(mxMatch[1]), host: mxMatch[2] });
          }
        }
        
        return result;
      };
      
      const parseWhatwebOutput = (output) => {
        const result = {
          url: null,
          status: null,
          country: null,
          server: null,
          title: null,
          technologies: [],
          raw: output
        };
        
        // Parse whatweb output (format: URL [Status] [Country] [Server] [Title] [Technologies...])
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            // Extract URL
            const urlMatch = line.match(/^(\S+)/);
            if (urlMatch) result.url = urlMatch[1];
            
            // Extract status
            const statusMatch = line.match(/\[(\d{3})\s+(\w+)\]/);
            if (statusMatch) {
              result.status = { code: parseInt(statusMatch[1]), text: statusMatch[2] };
            }
            
            // Extract country
            const countryMatch = line.match(/Country\[([^\]]+)\]/);
            if (countryMatch) result.country = countryMatch[1];
            
            // Extract server
            const serverMatch = line.match(/HTTPServer\[([^\]]+)\]/);
            if (serverMatch) result.server = serverMatch[1];
            
            // Extract title
            const titleMatch = line.match(/Title\[([^\]]+)\]/);
            if (titleMatch) result.title = titleMatch[1];
            
            // Extract technologies
            const techMatches = line.matchAll(/(\w+)\[([^\]]+)\]/g);
            for (const match of techMatches) {
              if (!['Country', 'HTTPServer', 'Title', 'IP'].includes(match[1])) {
                result.technologies.push({ name: match[1], value: match[2] });
              }
            }
          }
        }
        
        return result;
      };
      
      const parseNmapOutput = (output) => {
        const result = {
          host: null,
          hostState: null,
          ports: [],
          services: [],
          os: null,
          raw: output
        };
        
        const lines = output.split('\n');
        let currentHost = null;
        
        for (const line of lines) {
          // Extract host
          const hostMatch = line.match(/Nmap scan report for\s+(.+)/);
          if (hostMatch) {
            currentHost = hostMatch[1].trim();
            result.host = currentHost;
          }
          
          // Extract host state
          const hostStateMatch = line.match(/Host is\s+(\w+)/);
          if (hostStateMatch) {
            result.hostState = hostStateMatch[1];
          }
          
          // Extract ports
          const portMatch = line.match(/(\d+)\/(\w+)\s+(\w+)\s+(\S+)\s+(.+)/);
          if (portMatch) {
            result.ports.push({
              port: parseInt(portMatch[1]),
              protocol: portMatch[2],
              state: portMatch[3],
              service: portMatch[4],
              version: portMatch[5] || null
            });
          }
        }
        
        return result;
      };
      
      // Note: We use wsl -u root for ALL commands (including tgpt), so password is NOT required
      // tgpt now runs as root user (same as Kali commands), so no password needed
      
      // Helper function to convert Windows path to WSL path
      const convertToWSLPath = (winPath) => {
        if (process.platform !== 'win32') return winPath;
        const normalized = winPath.replace(/\\/g, '/');
        const driveMatch = normalized.match(/^([A-Za-z]):/);
        if (driveMatch) {
          const driveLetter = driveMatch[1].toLowerCase();
          return normalized.replace(/^[A-Za-z]:/, `/mnt/${driveLetter}`).replace(/ /g, '\\ ');
        }
        return normalized.replace(/ /g, '\\ ');
      };
      
      // Helper function to extract IP from host output
      const extractIPFromHost = (output) => {
        const ipMatch = output.match(/has\s+address\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return ipMatch ? ipMatch[1] : null;
      };
      
      // Helper function to analyze result with tgpt
      // Note: tempDir and convertToWSLPath are defined in the parent scope (runNetworkScanAsync)
      // Note: event, stepNumber, totalSteps, and wslPrefix are passed as parameters
      const analyzeWithTgpt = async (commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix) => {
        console.log(`[TGPT] analyzeWithTgpt called for ${commandName}`);
        console.log(`[TGPT] Raw result length: ${rawResult ? rawResult.length : 0}`);
        
        const prompt = `You are an expert security analyst. I have executed a network security scan using Kali Linux tools and received raw output. Your task is to analyze this raw output and convert it into a comprehensive, detailed, and user-understandable JSON report with advanced details, recommendations, key findings, vulnerabilities (if any), and solutions to fix those vulnerabilities.

SCAN TYPE: ${commandName}

RAW KALI SCAN OUTPUT:
${rawResult}

CONTEXT:
I have performed this network security scan and received the raw result from Kali Linux tools as shown above. I need you to convert this raw Kali result into a user-understandable JSON format with:
- Advanced details about what was discovered
- Key findings from the scan
- Security vulnerabilities (if any were found)
- Recommendations for security improvements
- Solutions to fix any vulnerabilities found
- Exact counts for findings, recommendations, and vulnerabilities
- A final security status assessment (safe, moderate, or high risk)

INSTRUCTIONS (Section-wise):
1. WHAT WE DID: Describe what security scan was performed and what it was trying to discover or test. Make it clear and understandable for the user. DO NOT include the Kali Linux command or command syntax.

2. WHAT WE GOT: Analyze the raw output above thoroughly and explain what the results mean in simple, user-friendly terms. Help the user understand what the scan discovered.

3. SUMMARY: Create a summary section that includes:
   - Total Findings: Exact count of all findings discovered
   - Total Recommendations: Exact count of all recommendations provided
   - Total Vulnerabilities: Exact count of all vulnerabilities found (0 if none)
   - Status: Overall security status - must be one of: "safe", "moderate", or "high risk"
     * "safe" - if no significant security issues found
     * "moderate" - if some security concerns exist but not critical
     * "high risk" - if critical vulnerabilities or serious security issues are found

4. FINDINGS: List all findings with detailed descriptions. Each finding should include:
   - Type/Name of the finding
   - Detailed description
   - Severity level (if applicable)
   - Any relevant technical details

5. VULNERABILITIES: Identify any security vulnerabilities or concerns found in the scan. For each vulnerability, include:
   - Vulnerability name/type
   - Description
   - Severity (critical, high, medium, low)
   - Location/affected component
   - Solution: Step-by-step solution to fix the vulnerability

6. RECOMMENDATIONS: Provide actionable recommendations for security improvement. Each recommendation should be clear and actionable.

7. TECHNICAL DETAILS: Include all technical details from the scan in a user-friendly format:
   - IPs, ports, services, versions
   - Any other relevant data found in the scan
   - For port scans: include a "ports" array with port details (number, state, service, version, etc.)

REQUIREMENTS:
- The JSON must be valid and parseable
- Include ALL details found in the raw output - nothing should be omitted
- Provide EXACT counts (numbers) for:
  * Total Findings
  * Total Recommendations  
  * Total Vulnerabilities
- Status must be exactly one of: "safe", "moderate", or "high risk"
- DO NOT include the Kali Linux command or command syntax in your output
- DO NOT include generic responses - base everything on the actual scan results
- Use clear, non-technical language where possible, but maintain accuracy
- Structure the JSON logically with all required sections

REQUIRED JSON STRUCTURE:
{
  "whatWeDid": "Clear explanation of what the scan does",
  "whatWeGot": "Clear explanation of what the results mean",
  "summary": {
    "totalFindings": <exact number>,
    "totalRecommendations": <exact number>,
    "totalVulnerabilities": <exact number>,
    "status": "safe" | "moderate" | "high risk"
  },
  "findings": [
    {
      "type": "Finding type/name",
      "description": "Detailed description",
      "severity": "severity level if applicable",
      ...other relevant fields
    }
  ],
  "vulnerabilities": [
    {
      "name": "Vulnerability name",
      "description": "Detailed description",
      "severity": "critical" | "high" | "medium" | "low",
      "location": "Where the vulnerability exists",
      "solution": {
        "description": "Solution description",
        "steps": ["step 1", "step 2", ...]
      }
    }
  ],
  "recommendations": [
    "Recommendation 1",
    "Recommendation 2",
    ...
  ],
  "ports": [ /* for port scans only */
    {
      "port": <port number>,
      "state": "open" | "closed" | "filtered",
      "service": "service name",
      "version": "version if available"
    }
  ],
  ...any other relevant sections
}

Output ONLY valid JSON. No additional text, no markdown formatting, no explanations outside the JSON - just the JSON object.`;
        
        try {
          // Use the same execution pattern as Kali commands
          // wslPrefix is already defined: 'wsl -u root --' on Windows
          // Write prompt to temp file and pipe to tgpt (safer than echo with special chars)
          // Use 'path' module (imported at top) instead of pathModule
          const promptFile = path.join(tempDir, `tgpt_prompt_${Date.now()}.txt`);
          const promptFileWSL = convertToWSLPath(promptFile);
          
          console.log(`[TGPT] Writing prompt to file: ${promptFile}`);
          console.log(`[TGPT] WSL path: ${promptFileWSL}`);
          
          // Write prompt to file
          fs.writeFileSync(promptFile, prompt, 'utf8');
          console.log(`[TGPT] Prompt file written, size: ${fs.statSync(promptFile).size} bytes`);
          
          // Execute tgpt using the same pattern as Kali commands
          const tgptCommand = `${wslPrefix} bash -c "cat ${promptFileWSL} | tgpt"`;
          console.log(`[TGPT] Executing command: ${tgptCommand}`);
          
          // Log the TGPT command like Kali commands (only if event and stepNumber are provided)
          if (event && stepNumber && totalSteps) {
            event.sender.send('networkscan:progress', {
              stage: 'analyzing',
              message: `Executing TGPT command...`,
              command: 'tgpt',
              output: '',
              progress: Math.round((stepNumber / totalSteps) * 100),
              consoleLog: `\n[TGPT] Command: ${tgptCommand}\n`
            });
          }
          
          const result = await executeCommand(tgptCommand, 300000);
          console.log(`[TGPT] Command executed, stdout length: ${result.stdout ? result.stdout.length : 0}, stderr length: ${result.stderr ? result.stderr.length : 0}`);
          
          // Log the TGPT result (only if event and stepNumber are provided)
          if (event && stepNumber && totalSteps) {
            if (result && result.success && result.stdout) {
              event.sender.send('networkscan:progress', {
                stage: 'analyzing',
                message: `TGPT analysis result received`,
                command: 'tgpt',
                output: result.stdout.substring(0, 2000) + (result.stdout.length > 2000 ? '...' : ''),
                progress: Math.round((stepNumber / totalSteps) * 100),
                  consoleLog: `\n[TGPT] Result received (${result.stdout.length} characters):\n${result.stdout.substring(0, 1000)}${result.stdout.length > 1000 ? '...' : ''}\n`
              });
            } else if (result && !result.success) {
              event.sender.send('networkscan:progress', {
                stage: 'analyzing',
                message: `TGPT command failed`,
                command: 'tgpt',
                output: result.stderr || result.error || '',
                progress: Math.round((stepNumber / totalSteps) * 100),
                  consoleLog: `\n[TGPT] Command failed: ${result.error || 'Unknown error'}\nstderr: ${(result.stderr || '').substring(0, 500)}\n`
              });
            }
          }
          
          // Clean up temp file
          try {
            if (fs.existsSync(promptFile)) {
              fs.unlinkSync(promptFile);
              console.log(`[TGPT] Prompt file cleaned up`);
            }
          } catch (cleanupError) {
            console.warn(`[TGPT] Cleanup error:`, cleanupError);
          }
          
          // Check if command was successful
          if (result && result.success) {
            const output = (result.stdout || '').trim();
            console.log(`[TGPT] Output received, length: ${output.length}`);
            
            if (!output || output.length === 0) {
              console.error(`[TGPT] Empty output from tgpt command`);
              return { error: 'TGPT returned empty output', raw: result.stderr || '' };
            }
            
            let cleanedOutput = output;
            // Remove markdown code blocks if present
            cleanedOutput = cleanedOutput.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');
            
            // Try to parse JSON
            try {
              const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`[TGPT] Successfully parsed JSON for ${commandName}`);
                return parsed;
              }
              const parsed = JSON.parse(cleanedOutput);
              console.log(`[TGPT] Successfully parsed JSON for ${commandName} (direct)`);
              return parsed;
            } catch (parseError) {
              console.error(`[TGPT] Failed to parse JSON for ${commandName}:`, parseError);
              console.error(`[TGPT] Output (first 500 chars):`, cleanedOutput.substring(0, 500));
              return { error: 'Failed to parse TGPT response', raw: cleanedOutput };
            }
          } else {
            const errorMsg = result?.error || 'TGPT command failed';
            const stderr = result?.stderr || '';
            const stdout = result?.stdout || '';
            console.error(`[TGPT] Command failed: ${errorMsg}`);
            console.error(`[TGPT] stderr: ${stderr.substring(0, 500)}`);
            console.error(`[TGPT] stdout: ${stdout.substring(0, 500)}`);
            return { error: errorMsg, raw: stdout || stderr || '' };
          }
        } catch (error) {
          console.error(`[TGPT] Exception in analyzeWithTgpt for ${commandName}:`, error);
          console.error(`[TGPT] Error analyzing ${commandName}:`, error);
          return { error: error.message, raw: rawResult };
        }
      };
      
      // Run the network scan sequentially
      const runNetworkScanAsync = async () => {
        try {
          // Use local time in the same format (YYYY-MM-DD HH:MM:SS)
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const startTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          
          // Normalize target (remove http/https, ensure it starts with http:// or https://)
          let targetUrl = target;
          if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://${targetUrl}`;
          }
          const targetDomain = targetUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          
          // Create temp directory for scan files (use 'path' imported at top)
          const tempDir = path.join(process.cwd(), 'temp-network-scans');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          // Storage for all results
          const scanResults = {};
          let extractedIP = null;
          
          // Determine WSL prefix
          const wslPrefix = process.platform === 'win32' ? 'wsl -u root --' : '';
          const sudoPrefix = process.platform === 'win32' ? '' : 'sudo';
          
          event.sender.send('networkscan:progress', { 
            stage: 'starting', 
            message: 'Initializing network scan...',
            command: '',
            output: '',
            progress: 0,
            consoleLog: `[${startTimestamp}] Starting network scan for ${targetDomain}\n`
          });
          
          // Storage for analyzed results (TGPT analysis for each command)
          const analyzedResults = {};
          
          // Total steps: 7 commands + 7 AI analysis = 14 steps (interleaved)
          const totalSteps = 14;
          let currentStep = 0;
          
          // Helper function to run TGPT analysis immediately after each command
          // Note: wslPrefix will be defined later in this function, so we'll pass it when calling
          const runTgptAnalysis = async (commandKey, commandName, command, rawResult, stepNumber, wslPrefixParam) => {
            try {
              currentStep = stepNumber;
              const progressPercent = Math.round((currentStep / totalSteps) * 100);
              
              console.log(`[TGPT] Starting analysis for ${commandKey} (step ${stepNumber}/${totalSteps})`);
              
              event.sender.send('networkscan:progress', {
                stage: 'analyzing',
                message: `[${stepNumber}/${totalSteps}] Analyzing ${commandName} with AI...`,
                command: 'tgpt',
                output: '',
                progress: progressPercent,
                consoleLog: `\n[${stepNumber}/${totalSteps}] Analyzing ${commandName} with AI...\nCommand: tgpt (analyzing ${commandName} results)\nRaw Result Being Analyzed:\n${rawResult.substring(0, 500)}${rawResult.length > 500 ? '...' : ''}\n`
              });
              
              // Ensure we have raw result
              if (!rawResult || rawResult.trim().length === 0) {
                console.warn(`[TGPT] No raw result for ${commandKey}, skipping analysis`);
                analyzedResults[commandKey] = { error: 'No raw result available', raw: '' };
                event.sender.send('networkscan:progress', {
                  stage: 'analyzing',
                  message: `[${stepNumber}/${totalSteps}] ${commandName} analysis skipped (no data)`,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: `[WARNING] [${stepNumber}/${totalSteps}] ${commandName} analysis skipped - no raw result available\n`
                });
                return analyzedResults[commandKey];
              }
              
              console.log(`[TGPT] Calling analyzeWithTgpt for ${commandKey}...`);
              const analyzed = await analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefixParam);
              
              console.log(`[TGPT] Analysis result for ${commandKey}:`, analyzed ? 'Success' : 'Failed', analyzed?.error ? `Error: ${analyzed.error}` : '');
              
              analyzedResults[commandKey] = analyzed;
              
              if (analyzed && !analyzed.error) {
                event.sender.send('networkscan:progress', {
                  stage: 'analyzing',
                  message: `[${stepNumber}/${totalSteps}] ${commandName} analysis completed`,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: `[SUCCESS] [${stepNumber}/${totalSteps}] ${commandName} analysis completed\nAnalysis Result:\n${JSON.stringify(analyzed, null, 2).substring(0, 1000)}${JSON.stringify(analyzed).length > 1000 ? '...' : ''}\n`
                });
              } else {
                event.sender.send('networkscan:progress', {
                  stage: 'analyzing',
                  message: `[${stepNumber}/${totalSteps}] ${commandName} analysis failed`,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: `[ERROR] [${stepNumber}/${totalSteps}] ${commandName} analysis failed: ${analyzed?.error || 'Unknown error'}\n`
                });
              }
              
              return analyzed;
            } catch (error) {
              console.error(`[TGPT] Error in runTgptAnalysis for ${commandKey}:`, error);
              analyzedResults[commandKey] = { error: error.message || 'TGPT analysis error', raw: '' };
              event.sender.send('networkscan:progress', {
                stage: 'analyzing',
                message: `[${stepNumber}/${totalSteps}] ${commandName} analysis error`,
                command: 'tgpt',
                output: '',
                progress: Math.round((stepNumber / totalSteps) * 100),
                consoleLog: `[ERROR] [${stepNumber}/${totalSteps}] ${commandName} analysis error: ${error.message}\n`
              });
              return analyzedResults[commandKey];
            }
          };
          
          // 1. WhatWeb Scan
          currentStep = 1;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running WhatWeb scan...`,
            command: 'whatweb',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running WhatWeb scan...\nCommand: whatweb --log-json=whatweb_output.json ${targetUrl}\n`
          });
          
          const whatwebOutputFile = path.join(tempDir, 'whatweb_output.json');
          const whatwebOutputFileWSL = convertToWSLPath(whatwebOutputFile);
          const whatwebCommand = `${wslPrefix} whatweb --log-json="${whatwebOutputFileWSL.replace(/\\ /g, ' ')}" "${targetUrl}"`;
          
          const whatwebResult = await executeCommand(whatwebCommand, 60000);
          scanResults.whatweb = { command: whatwebCommand, raw: whatwebResult.stdout || whatwebResult.stderr || '' };
          
          // Read whatweb JSON output
          if (fs.existsSync(whatwebOutputFile)) {
            try {
              const whatwebJson = fs.readFileSync(whatwebOutputFile, 'utf-8');
              scanResults.whatweb.json = JSON.parse(whatwebJson);
              scanResults.whatweb.raw = whatwebJson;
            } catch (e) {
              console.error('Failed to read whatweb JSON:', e);
            }
          }
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] WhatWeb scan completed`,
            command: 'whatweb',
            output: scanResults.whatweb.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] WhatWeb scan completed\nRaw Result:\n${scanResults.whatweb.raw.substring(0, 1000)}${scanResults.whatweb.raw.length > 1000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for WhatWeb
          currentStep = 2;
          await runTgptAnalysis('whatweb', 'WhatWeb Scan', whatwebCommand, scanResults.whatweb.raw, currentStep, wslPrefix);
          
          // 2. Ping Test
          currentStep = 3;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Ping test...`,
            command: 'ping',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Ping test...\nCommand: ping -c 4 ${targetDomain}\n`
          });
          
          const pingCommand = `${wslPrefix} ping -c 4 "${targetDomain}"`;
          const pingResult = await executeCommand(pingCommand, 30000);
          scanResults.ping = { command: pingCommand, raw: pingResult.stdout || pingResult.stderr || '' };
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Ping test completed`,
            command: 'ping',
            output: scanResults.ping.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Ping test completed\nRaw Result:\n${scanResults.ping.raw}\n`
          });
          
          // Immediately run TGPT analysis for Ping
          currentStep = 4;
          await runTgptAnalysis('ping', 'Ping Test', pingCommand, scanResults.ping.raw, currentStep, wslPrefix);
          
          // 3. Hping3 Scan
          currentStep = 5;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Hping3 scan...`,
            command: 'hping3',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Hping3 scan...\nCommand: hping3 -S ${targetDomain} -p 80 -c 3\n`
          });
          
          const hpingCommand = `${wslPrefix} hping3 -S "${targetDomain}" -p 80 -c 3`;
          const hpingResult = await executeCommand(hpingCommand, 30000);
          scanResults.hping = { command: hpingCommand, raw: hpingResult.stdout || hpingResult.stderr || '' };
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Hping3 scan completed`,
            command: 'hping3',
            output: scanResults.hping.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Hping3 scan completed\nRaw Result:\n${scanResults.hping.raw}\n`
          });
          
          // Immediately run TGPT analysis for Hping3
          currentStep = 6;
          await runTgptAnalysis('hping', 'Hping3 Scan', hpingCommand, scanResults.hping.raw, currentStep, wslPrefix);
          
          // 4. Host Command (DNS Resolution)
          currentStep = 7;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running DNS resolution (host)...`,
            command: 'host',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running DNS resolution (host)...\nCommand: host ${targetDomain}\n`
          });
          
          const hostCommand = `${wslPrefix} host "${targetDomain}"`;
          const hostResult = await executeCommand(hostCommand, 30000);
          scanResults.host = { command: hostCommand, raw: hostResult.stdout || hostResult.stderr || '' };
          
          // Extract IP from host output
          extractedIP = extractIPFromHost(scanResults.host.raw);
          if (extractedIP) {
            scanResults.host.extractedIP = extractedIP;
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] DNS resolution completed - IP: ${extractedIP}`,
              command: 'host',
              output: scanResults.host.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] DNS resolution completed - IP: ${extractedIP}\nRaw Result:\n${scanResults.host.raw}\nExtracted IP: ${extractedIP}\n`
            });
          } else {
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] DNS resolution completed (IP not found)`,
              command: 'host',
              output: scanResults.host.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[WARNING] [${currentStep}/${totalSteps}] DNS resolution completed (IP not found)\nRaw Result:\n${scanResults.host.raw}\n`
            });
          }
          
          // Immediately run TGPT analysis for Host
          currentStep = 8;
          await runTgptAnalysis('host', 'DNS Resolution', hostCommand, scanResults.host.raw, currentStep, wslPrefix);
          
          // 5. Nmap Host Discovery (using extracted IP)
          currentStep = 9;
          if (extractedIP) {
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Running Nmap host discovery on ${extractedIP}...`,
              command: 'nmap -sn',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap host discovery on ${extractedIP}...\nCommand: sudo nmap -sn ${extractedIP}\n`
            });
            
            const nmapSnCommand = `${wslPrefix} ${sudoPrefix} nmap -sn "${extractedIP}"`;
            const nmapSnResult = await executeCommand(nmapSnCommand, 300000);
            scanResults.nmapSn = { command: nmapSnCommand, raw: nmapSnResult.stdout || nmapSnResult.stderr || '' };
            
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Nmap host discovery completed`,
              command: 'nmap -sn',
              output: scanResults.nmapSn.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap host discovery completed\nRaw Result:\n${scanResults.nmapSn.raw.substring(0, 2000)}${scanResults.nmapSn.raw.length > 2000 ? '...' : ''}\n`
            });
            
            // Immediately run TGPT analysis for Nmap Host Discovery
            currentStep = 10;
            await runTgptAnalysis('nmapSn', 'Nmap Host Discovery', nmapSnCommand, scanResults.nmapSn.raw, currentStep, wslPrefix);
          } else {
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Skipping Nmap host discovery (no IP found)`,
              command: 'nmap -sn',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[WARNING] [${currentStep}/${totalSteps}] Skipping Nmap host discovery (no IP found)\n`
            });
            scanResults.nmapSn = { command: 'skipped', raw: 'IP address not found from host command' };
            
            // Still run TGPT analysis even if skipped
            currentStep = 10;
            await runTgptAnalysis('nmapSn', 'Nmap Host Discovery', 'skipped', scanResults.nmapSn.raw, currentStep, wslPrefix);
          }
          
          // 6. Nmap Fast Scan
          currentStep = 11;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Nmap fast scan (top 100 ports)...`,
            command: 'nmap -F',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap fast scan (top 100 ports)...\nCommand: sudo nmap -T4 -Pn -F ${targetDomain}\n`
          });
          
          const nmapFastCommand = `${wslPrefix} ${sudoPrefix} nmap -T4 -Pn -F "${targetDomain}"`;
          const nmapFastResult = await executeCommand(nmapFastCommand, 300000);
          scanResults.nmapFast = { command: nmapFastCommand, raw: nmapFastResult.stdout || nmapFastResult.stderr || '' };
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Nmap fast scan completed`,
            command: 'nmap -F',
            output: scanResults.nmapFast.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap fast scan completed\nRaw Result:\n${scanResults.nmapFast.raw.substring(0, 2000)}${scanResults.nmapFast.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for Nmap Fast Scan
          currentStep = 12;
          await runTgptAnalysis('nmapFast', 'Nmap Fast Scan', nmapFastCommand, scanResults.nmapFast.raw, currentStep, wslPrefix);
          
          // 7. Nmap Full Scan
          currentStep = 13;
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Nmap full scan (all 65535 ports)...`,
            command: 'nmap -p1-65535',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap full scan (all 65535 ports)...\nCommand: sudo nmap -Pn -p1-65535 -sS -sV ${targetDomain}\n`
          });
          
          const nmapFullCommand = `${wslPrefix} ${sudoPrefix} nmap -Pn -p1-65535 -sS -sV "${targetDomain}"`;
          const nmapFullResult = await executeCommand(nmapFullCommand, 300000);
          scanResults.nmapFull = { command: nmapFullCommand, raw: nmapFullResult.stdout || nmapFullResult.stderr || '' };
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Nmap full scan completed`,
            command: 'nmap -p1-65535',
            output: scanResults.nmapFull.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap full scan completed\nRaw Result:\n${scanResults.nmapFull.raw.substring(0, 2000)}${scanResults.nmapFull.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for Nmap Full Scan
          currentStep = 14;
          await runTgptAnalysis('nmapFull', 'Nmap Full Scan', nmapFullCommand, scanResults.nmapFull.raw, currentStep, wslPrefix);
          
          // Send final results
          event.sender.send('networkscan:progress', {
            stage: 'completed',
            message: 'Network scan and analysis completed successfully',
            command: '',
            output: '',
            progress: 100,
            consoleLog: `\n✅ Network scan and analysis completed successfully!\n`
          });
          
          const finalResults = {
            target: target,
            targetDomain: targetDomain,
            extractedIP: extractedIP,
            rawResults: scanResults,
            analyzedResults: analyzedResults,
            timestamp: startTimestamp
          };
          
          console.log(`[NETWORK-SCAN] Sending final results with ${Object.keys(analyzedResults).length} analyzed commands:`, Object.keys(analyzedResults));
          
          event.sender.send('networkscan:done', { 
            success: true, 
            summary: 'Network scan completed successfully',
            results: {
              json: finalResults,
              raw: JSON.stringify(finalResults, null, 2)
            },
            target: target,
            extractedIP: extractedIP
          });
          
          // Notification will be sent by GlobalScanContext after scan completion
          // No need to send notification here to avoid duplicates
          
          // Clean up temp files
          try {
            if (fs.existsSync(whatwebOutputFile)) fs.unlinkSync(whatwebOutputFile);
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
              fs.rmdirSync(tempDir);
            }
          } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError.message);
          }
          
        } catch (error) {
          if (error.name === 'AbortError') {
            event.sender.send('networkscan:progress', { 
              stage: 'aborted', 
              message: 'Network scan aborted by user',
              command: '',
              output: '',
              consoleLog: '\n⚠️ Network scan aborted by user\n'
            });
            event.sender.send('networkscan:done', { aborted: true });
          } else {
            event.sender.send('networkscan:progress', { 
              stage: 'error', 
              message: error.message,
              command: '',
              output: '',
              consoleLog: `\n❌ Network scan error: ${error.message}\n`
            });
            console.error('Network scan error:', error);
            event.sender.send('networkscan:done', { 
              success: false, 
              error: error.message,
              results: null
            });
          }
        } finally {
          networkScanChild = null;
          currentNetworkScanTarget = null;
          networkScanAbortController = null;
        }
      };
      
      // Run in background
      runNetworkScanAsync();
      
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('networkscan:abort', async (event) => {
    console.log('[NETWORK-SCAN] Abort requested, networkScanChild:', networkScanChild ? 'exists' : 'null');
    
    if (networkScanChild || currentNetworkScanTarget) {
      try {
        // Send abort message to UI immediately
        event.sender.send('networkscan:progress', {
          stage: 'aborting',
          message: 'Aborting scan...',
          command: '',
          output: '',
          consoleLog: '\n⚠️ [ABORT] Stopping network scan...\n'
        });
        
        // Kill the child process if it exists (spawn process)
        if (networkScanChild) {
          try {
            networkScanChild.kill('SIGTERM');
            setTimeout(() => {
              if (networkScanChild && !networkScanChild.killed) {
                networkScanChild.kill('SIGKILL');
              }
            }, 500);
          } catch (e) {
            console.log('[NETWORK-SCAN] Kill failed:', e.message);
          }
        }
        
        // Kill nmap and Python processes in WSL
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);
        
        if (process.platform === 'win32') {
          try {
            // Kill nmap processes
            if (currentNetworkScanTarget) {
              await execAsync(`wsl -- bash -c "pkill -f 'nmap.*${currentNetworkScanTarget}' || true"`, { timeout: 3000 });
              await execAsync(`wsl -- bash -c "pkill -9 -f 'nmap.*${currentNetworkScanTarget}' || true"`, { timeout: 3000 });
            }
            // Kill all nmap processes
            await execAsync(`wsl -- bash -c "pkill -f nmap || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f nmap || true"`, { timeout: 3000 });
            // Kill Python script processes
            await execAsync(`wsl -- bash -c "pkill -f 'network_scan_to_json_v_2.py' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f 'network_scan_to_json_v_2.py' || true"`, { timeout: 3000 });
          } catch (e) {
            console.log('[NETWORK-SCAN] Some cleanup commands failed:', e.message);
          }
        } else {
          // On Linux/Mac
          try {
            if (currentNetworkScanTarget) {
              await execAsync(`pkill -f 'nmap.*${currentNetworkScanTarget}' || true`, { timeout: 3000 });
              await execAsync(`pkill -9 -f 'nmap.*${currentNetworkScanTarget}' || true`, { timeout: 3000 });
            }
            await execAsync(`pkill -f 'network_scan_to_json_v_2.py' || true`, { timeout: 3000 });
            await execAsync(`pkill -9 -f 'network_scan_to_json_v_2.py' || true`, { timeout: 3000 });
          } catch (e) {
            console.log('[NETWORK-SCAN] Some cleanup commands failed:', e.message);
          }
        }

        // Send completion message
        event.sender.send('networkscan:progress', {
          stage: 'aborted',
          message: 'Scan aborted',
          command: '',
          output: '',
          consoleLog: '\n✅ [ABORT] Network scan stopped successfully\n'
        });

        // Send done event with aborted status
        event.sender.send('networkscan:done', { aborted: true });

        networkScanChild = null;
        currentNetworkScanTarget = null;
        if (networkScanAbortController) {
          networkScanAbortController.abort();
          networkScanAbortController = null;
        }

        console.log('[NETWORK-SCAN] Abort completed');
        return { success: true };
      } catch (error) {
        console.error('[NETWORK-SCAN] Error during abort:', error);
        event.sender.send('networkscan:done', { aborted: true, error: error.message });
        networkScanChild = null;
        currentNetworkScanTarget = null;
        networkScanAbortController = null;
        return { success: false, error: error.message };
      }
    }

    return { error: 'No network scan running' };
  });

  // Server scan handlers (register before app.whenReady)
  let serverScanChild = null;
  let serverScanAbortController = null;
  let currentServerScanTarget = null;
  
  console.log('[SERVER-SCAN] Registering serverscan:start handler...');
  ipcMain.handle('serverscan:start', async (event, target) => {
    console.log('[SERVER-SCAN] Handler called for target:', target);
    if (serverScanChild) return { error: 'Server scan already running' };
    
    try {
      // Create abort controller for this scan
      serverScanAbortController = new AbortController();
      currentServerScanTarget = target;
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Helper function to strip ANSI escape codes
      const stripAnsiCodes = (text) => {
        if (!text || typeof text !== 'string') return text;
        return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\[[0-9;]*m/g, '').replace(/\[\d+[m[]?/g, '').trim();
      };
      
      // Helper function to execute command and parse output
      const executeCommand = async (command, timeout = 30000) => {
        try {
          const { stdout, stderr } = await execAsync(command, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: timeout,
            windowsHide: true,
            signal: serverScanAbortController.signal
          });
          // Strip ANSI codes from output
          return { 
            success: true, 
            stdout: stripAnsiCodes(stdout || ''), 
            stderr: stripAnsiCodes(stderr || ''), 
            error: null 
          };
        } catch (error) {
          if (error.name === 'AbortError') {
            throw error;
          }
          // Sanitize error message to remove "wsl" references
          let errorMessage = error.message || '';
          errorMessage = errorMessage.replace(/Command failed: wsl\s+/gi, 'Command failed: ');
          errorMessage = errorMessage.replace(/wsl\s+/gi, '');
          
          // Strip ANSI codes from output
          return { 
            success: false, 
            stdout: stripAnsiCodes(error.stdout || ''), 
            stderr: stripAnsiCodes(error.stderr || ''), 
            error: errorMessage,
            code: error.code
          };
        }
      };
      
      // Helper function to convert Windows path to WSL path
      const convertToWSLPath = (winPath) => {
        if (process.platform !== 'win32') return winPath;
        return winPath.replace(/^([A-Z]):/, '/mnt/$1').replace(/\\/g, '/').toLowerCase();
      };
      
      // Helper function to extract IP from host command output
      const extractIPFromHost = (output) => {
        if (!output) return null;
        const ipMatch = output.match(/(?:has address|has IPv4 address)\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i);
        return ipMatch ? ipMatch[1] : null;
      };
      
      // Helper function to detect if TGPT returned a generic response
      const isGenericTgptResponse = (output) => {
        if (!output || typeof output !== 'string') return false;
        const lowerOutput = output.toLowerCase();
        const genericPatterns = [
          'hello! i\'m an ai assistant',
          'i\'m an ai assistant',
          'how can i assist you',
          'what would you like help with',
          'created by phind',
          'i\'m ready to assist'
        ];
        return genericPatterns.some(pattern => lowerOutput.includes(pattern));
      };

      // Helper function to manually convert raw results to JSON
      const convertRawToJson = (commandName, command, rawResult) => {
        try {
          const result = {
            whatWeDid: `Executed ${commandName} security scan`,
            whatWeGot: `Raw scan output received and analyzed`,
            summary: {
              scanType: commandName,
              command: command,
              status: 'completed',
              findingsCount: 0
            },
            findings: [],
            rawOutput: rawResult,
            timestamp: new Date().toISOString()
          };

          // Parse based on command type
          if (commandName.toLowerCase().includes('nikto')) {
            const lines = rawResult.split('\n').filter(l => l.trim());
            const findings = [];
            lines.forEach(line => {
              if (line.includes('Target Host:') || line.includes('Target Port:')) {
                const match = line.match(/Target (Host|Port):\s*(.+)/);
                if (match) {
                  result.summary[match[1].toLowerCase()] = match[2].trim();
                }
              } else if (line.trim().startsWith('+') || line.trim().startsWith('-')) {
                findings.push({
                  type: line.trim().startsWith('+') ? 'vulnerability' : 'info',
                  description: line.trim().substring(1).trim(),
                  severity: line.trim().startsWith('+') ? 'medium' : 'info'
                });
              }
            });
            result.findings = findings;
            result.summary.findingsCount = findings.length;
          } else if (commandName.toLowerCase().includes('sqlmap')) {
            const lines = rawResult.split('\n').filter(l => l.trim());
            const findings = [];
            let hasInjection = false;
            lines.forEach(line => {
              if (line.includes('injectable')) {
                hasInjection = true;
                findings.push({
                  type: 'vulnerability',
                  description: 'SQL injection vulnerability detected',
                  severity: 'high'
                });
              } else if (line.includes('ERROR') || line.includes('WARNING')) {
                findings.push({
                  type: 'warning',
                  description: line.trim(),
                  severity: 'medium'
                });
              }
            });
            result.findings = findings;
            result.summary.findingsCount = findings.length;
            result.summary.hasInjection = hasInjection;
          } else {
            // Generic conversion for other commands
            const lines = rawResult.split('\n').filter(l => l.trim());
            result.findings = lines.slice(0, 50).map(line => ({
              type: 'info',
              description: line.trim(),
              severity: 'info'
            }));
            result.summary.findingsCount = result.findings.length;
          }

          return result;
        } catch (error) {
          console.error(`[MANUAL] Failed to convert raw to JSON:`, error);
          return {
            whatWeDid: `Executed ${commandName} security scan`,
            whatWeGot: `Raw scan output received`,
            summary: { scanType: commandName, status: 'completed' },
            findings: [],
            rawOutput: rawResult,
            error: 'Failed to parse raw output',
            timestamp: new Date().toISOString()
          };
        }
      };

      // TGPT analysis function with retry logic
      const analyzeWithTgpt = async (commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount = 0) => {
        const maxRetries = 3;
        console.log(`[TGPT] analyzeWithTgpt called for ${commandName} (attempt ${retryCount + 1}/${maxRetries + 1})`);
        console.log(`[TGPT] Raw result length: ${rawResult ? rawResult.length : 0}`);
        
        // Store raw result in a separate variable (as requested)
        const scanRawResult = rawResult || '';
        
        // Different prompts for retries - embed raw result directly in prompt string
        // Server scan prompt - matching network scan format
        const basePrompt = `You are an expert security analyst. I have executed a server security scan using Nikto and received raw output. Your task is to analyze this raw output and create a comprehensive, detailed, and user-friendly security report in JSON format.

SCAN TYPE: Server Security Scan (Nikto)

I have executed this server scan and received this raw Kali result:
${scanRawResult}

I need to convert this raw Kali result to a user understandable JSON with advanced details with recommendations, key findings, vulnerabilities if any, and the solution to fix that vulnerabilities.

And provide the exact count for that also and a final status whether this is safe or moderate or in risk or in high risk in a proper JSON to show that to the user.

Ask with section wise:

INSTRUCTIONS:
1. First, provide a "scanName" field: A clear, descriptive name for this server security scan (e.g., "Web Server Security Assessment", "Server Vulnerability Scan")
2. Then, provide a "scanDescription" field: A detailed description of what this scan does and what it tests
3. Then, explain WHAT WE DID: Describe the server security scan that was executed and what it was trying to discover or test. Make it clear and understandable for the user.
4. Then, explain WHAT WE GOT: Analyze the raw output above thoroughly and explain what the results mean in simple terms. Help the user understand what the scan discovered.
5. Create a detailed JSON report that is comprehensive, user-friendly, and easy to understand
6. DO NOT include the Kali Linux command or command syntax in your output
7. Focus on translating technical scan results into clear, understandable information
8. Include ALL details found in the raw output - nothing should be omitted
9. Structure the JSON in a logical way that makes sense for server security scanning
10. Use clear, non-technical language where possible, but maintain accuracy
11. Provide detailed explanations, findings, vulnerabilities, and recommendations
12. Include specific values, IPs, ports, services, versions, and any other data found in the scan
13. Make the report actionable with clear recommendations
14. For each vulnerability found, provide a detailed "solution" field with step-by-step instructions to fix it

REQUIREMENTS:
- The JSON must be valid and parseable
- Include a "scanName" field: Clear name for the scan
- Include a "scanDescription" field: Detailed description of the scan
- Include a "whatWeDid" field explaining the scan purpose in user-friendly terms
- Include a "whatWeGot" field explaining the results meaning in simple terms
- Include a "summary" section with:
  * totalFindings: Exact count of all findings
  * totalRecommendations: Exact count of all recommendations
  * totalVulnerabilities: Exact count of all vulnerabilities (if any)
  * status: Final status - must be one of: "safe", "moderate", "risk", or "high risk"
- Include a "findings" array with all key findings and detailed descriptions
- Include a "recommendations" array with actionable recommendations
- Include a "vulnerabilities" array (if any) with:
  * name: Vulnerability name
  * description: Detailed description
  * severity: Severity level (low, medium, high, critical)
  * location: Where the vulnerability was found
  * solution: Step-by-step solution to fix the vulnerability (with steps array if applicable)
- Include all technical details from the scan in a user-friendly format
- Do NOT include generic responses - base everything on the actual scan results
- Do NOT include the command itself in the output

Create a comprehensive JSON report that covers all aspects of the server scan results. Structure it as follows:
{
  "scanName": "Clear scan name",
  "scanDescription": "Detailed description of what this scan does",
  "whatWeDid": "Explanation of what the scan command does",
  "whatWeGot": "Explanation of what the results mean",
  "summary": {
    "totalFindings": <exact number>,
    "totalRecommendations": <exact number>,
    "totalVulnerabilities": <exact number>,
    "status": "safe" | "moderate" | "risk" | "high risk"
  },
  "findings": [
    {
      "type": "finding type",
      "name": "finding name",
      "description": "detailed description",
      ...
    }
  ],
  "recommendations": [
    {
      "description": "recommendation text",
      ...
    }
  ],
  "vulnerabilities": [
    {
      "name": "vulnerability name",
      "description": "detailed description",
      "severity": "low" | "medium" | "high" | "critical",
      "location": "where found",
      "solution": {
        "description": "solution description",
        "steps": ["step 1", "step 2", ...]
      }
    }
  ]
}

Output ONLY valid JSON. No additional text, no markdown formatting, no explanations outside the JSON - just the JSON object.`;
        
        const prompts = [
          basePrompt,
          `Analyze this security scan output and convert it to JSON format. Scan type: ${commandName}. Command: ${command}. Output: ${scanRawResult.substring(0, 2000)}. Return ONLY valid JSON with fields: whatWeDid, whatWeGot, summary, findings.`,
          `Convert this security scan result to JSON: ${commandName} scan output: ${scanRawResult.substring(0, 1500)}. Return valid JSON only.`
        ];
        
        const prompt = prompts[Math.min(retryCount, prompts.length - 1)];
        
        try {
          // Store raw result in variable and embed directly in prompt - no files needed
          // Use base64 encoding to safely pass prompt without escaping issues
          const promptBase64 = Buffer.from(prompt, 'utf8').toString('base64');
          
          // Decode base64 and pipe directly to tgpt (no file needed, handles all special characters)
          const tgptCommand = `${wslPrefix} bash -c "echo '${promptBase64}' | base64 -d | tgpt"`;
          console.log(`[TGPT] Executing command (prompt length: ${prompt.length} chars, using base64, no file)`);
          
          if (event && stepNumber && totalSteps) {
            event.sender.send('serverscan:progress', {
              stage: 'analyzing',
              message: `Executing TGPT command... (attempt ${retryCount + 1}/${maxRetries + 1})`,
              command: 'tgpt',
              output: '',
              progress: Math.round((stepNumber / totalSteps) * 100),
              consoleLog: `\n[TGPT] Executing AI analysis... (attempt ${retryCount + 1}/${maxRetries + 1})\n`
            });
          }
          
          const result = await executeCommand(tgptCommand, 300000);
          console.log(`[TGPT] Command executed, stdout length: ${result.stdout ? result.stdout.length : 0}, stderr length: ${result.stderr ? result.stderr.length : 0}`);
          
          if (event && stepNumber && totalSteps) {
            if (result && result.success && result.stdout) {
              event.sender.send('serverscan:progress', {
                stage: 'analyzing',
                message: `TGPT analysis result received`,
                command: 'tgpt',
                output: result.stdout.substring(0, 2000) + (result.stdout.length > 2000 ? '...' : ''),
                progress: Math.round((stepNumber / totalSteps) * 100),
                consoleLog: `\n[TGPT] Result received (${result.stdout.length} characters):\n${result.stdout.substring(0, 1000)}${result.stdout.length > 1000 ? '...' : ''}\n`
              });
            } else if (result && !result.success) {
              event.sender.send('serverscan:progress', {
                stage: 'analyzing',
                message: `TGPT command failed`,
                command: 'tgpt',
                output: result.stderr || result.error || '',
                progress: Math.round((stepNumber / totalSteps) * 100),
                consoleLog: `\n[TGPT] Command failed: ${result.error || 'Unknown error'}\nstderr: ${(result.stderr || '').substring(0, 500)}\n`
              });
            }
          }
          
          // No file cleanup needed - using direct pipe instead of files
          
          // Check if command was successful
          if (result && result.success) {
            const output = (result.stdout || '').trim();
            console.log(`[TGPT] Output received, length: ${output.length}`);
            
            if (!output || output.length === 0) {
              console.error(`[TGPT] Empty output from tgpt command`);
              if (retryCount < maxRetries) {
                console.log(`[TGPT] Retrying... (${retryCount + 1}/${maxRetries})`);
                return analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount + 1);
              }
              return { error: 'TGPT returned empty output', raw: result.stderr || '' };
            }
            
            // Check for generic response
            if (isGenericTgptResponse(output)) {
              console.warn(`[TGPT] Detected generic TGPT response, treating as failure`);
              if (retryCount < maxRetries) {
                console.log(`[TGPT] Retrying with different prompt... (${retryCount + 1}/${maxRetries})`);
                return analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount + 1);
              }
              console.log(`[TGPT] Max retries reached, using manual conversion`);
              return convertRawToJson(commandName, command, rawResult);
            }
            
            let cleanedOutput = output;
            // Remove markdown code blocks if present
            cleanedOutput = cleanedOutput.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '');
            
            // Try to parse JSON
            try {
              const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`[TGPT] Successfully parsed JSON for ${commandName}`);
                return parsed;
              }
              const parsed = JSON.parse(cleanedOutput);
              console.log(`[TGPT] Successfully parsed JSON for ${commandName} (direct)`);
              return parsed;
            } catch (parseError) {
              console.error(`[TGPT] Failed to parse JSON for ${commandName}:`, parseError);
              console.error(`[TGPT] Output (first 500 chars):`, cleanedOutput.substring(0, 500));
              if (retryCount < maxRetries) {
                console.log(`[TGPT] Retrying... (${retryCount + 1}/${maxRetries})`);
                return analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount + 1);
              }
              console.log(`[TGPT] Max retries reached, using manual conversion`);
              return convertRawToJson(commandName, command, rawResult);
            }
          } else {
            const errorMsg = result?.error || 'TGPT command failed';
            const stderr = result?.stderr || '';
            const stdout = result?.stdout || '';
            console.error(`[TGPT] Command failed: ${errorMsg}`);
            console.error(`[TGPT] stderr: ${stderr.substring(0, 500)}`);
            console.error(`[TGPT] stdout: ${stdout.substring(0, 500)}`);
            if (retryCount < maxRetries) {
              console.log(`[TGPT] Retrying... (${retryCount + 1}/${maxRetries})`);
              return analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount + 1);
            }
            console.log(`[TGPT] Max retries reached, using manual conversion`);
            return convertRawToJson(commandName, command, rawResult);
          }
        } catch (error) {
          console.error(`[TGPT] Exception in analyzeWithTgpt for ${commandName}:`, error);
          console.error(`[TGPT] Error analyzing ${commandName}:`, error);
          if (retryCount < maxRetries) {
            console.log(`[TGPT] Retrying... (${retryCount + 1}/${maxRetries})`);
            return analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefix, retryCount + 1);
          }
          console.log(`[TGPT] Max retries reached, using manual conversion`);
          return convertRawToJson(commandName, command, rawResult);
        }
      };
      
      // Run the server scan sequentially
      const runServerScanAsync = async () => {
        try {
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const startTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          
          // Normalize target
          let targetUrl = target;
          if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            targetUrl = `https://${targetUrl}`;
          }
          const targetDomain = targetUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          
          // Create temp directory for scan files
          const tempDir = path.join(process.cwd(), 'temp-server-scans');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          // Storage for all results
          const scanResults = {};
          let extractedIP = null;
          
          // Determine WSL prefix
          const wslPrefix = process.platform === 'win32' ? 'wsl -u root --' : '';
          const sudoPrefix = process.platform === 'win32' ? '' : 'sudo';
          
          event.sender.send('serverscan:progress', { 
            stage: 'starting', 
            message: 'Initializing server scan...',
            command: '',
            output: '',
            progress: 0,
            consoleLog: `[${startTimestamp}] Starting server scan for ${targetDomain}\n`
          });
          
          // Storage for analyzed results (TGPT analysis for each command)
          const analyzedResults = {};
          
          // Total steps: 7 commands + 7 AI analysis = 14 steps (interleaved)
          const totalSteps = 14;
          let currentStep = 0;
          
          // Helper function to run TGPT analysis immediately after each command
          const runTgptAnalysis = async (commandKey, commandName, command, rawResult, stepNumber, wslPrefixParam) => {
            try {
              currentStep = stepNumber;
              const progressPercent = Math.round((currentStep / totalSteps) * 100);
              
              console.log(`[TGPT] Starting analysis for ${commandKey} (step ${stepNumber}/${totalSteps})`);
              
              event.sender.send('serverscan:progress', {
                stage: 'analyzing',
                message: `[${stepNumber}/${totalSteps}] Analyzing ${commandName} with AI...`,
                command: 'tgpt',
                output: '',
                progress: progressPercent,
                consoleLog: `\n[${stepNumber}/${totalSteps}] Analyzing ${commandName} with AI...\n`
              });
              
              if (!rawResult || rawResult.trim().length === 0) {
                console.warn(`[TGPT] No raw result for ${commandKey}, skipping analysis`);
                analyzedResults[commandKey] = { error: 'No raw result available', raw: '' };
                event.sender.send('serverscan:progress', {
                  stage: 'analyzing',
                  message: `[${stepNumber}/${totalSteps}] ${commandName} analysis skipped (no data)`,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: `[WARNING] [${stepNumber}/${totalSteps}] ${commandName} analysis skipped - no raw result available\n`
                });
                return analyzedResults[commandKey];
              }
              
              console.log(`[TGPT] Calling analyzeWithTgpt for ${commandKey}...`);
              const analyzed = await analyzeWithTgpt(commandName, command, rawResult, tempDir, convertToWSLPath, event, stepNumber, totalSteps, wslPrefixParam);
              
              console.log(`[TGPT] Analysis result for ${commandKey}:`, analyzed ? 'Success' : 'Failed', analyzed?.error ? `Error: ${analyzed.error}` : '');
              
              analyzedResults[commandKey] = analyzed;
              
              // Check if manual conversion was used (has rawOutput field)
              const isManualConversion = analyzed && !analyzed.error && analyzed.rawOutput;
              
              if (analyzed && !analyzed.error) {
                const message = isManualConversion 
                  ? `[${stepNumber}/${totalSteps}] ${commandName} analysis completed (manual conversion used)`
                  : `[${stepNumber}/${totalSteps}] ${commandName} analysis completed`;
                const logMessage = isManualConversion
                  ? `[SUCCESS] [${stepNumber}/${totalSteps}] ${commandName} analysis completed (TGPT failed, used manual conversion)\nAnalysis Result:\n${JSON.stringify(analyzed, null, 2).substring(0, 1000)}${JSON.stringify(analyzed).length > 1000 ? '...' : ''}\n`
                  : `[SUCCESS] [${stepNumber}/${totalSteps}] ${commandName} analysis completed\nAnalysis Result:\n${JSON.stringify(analyzed, null, 2).substring(0, 1000)}${JSON.stringify(analyzed).length > 1000 ? '...' : ''}\n`;
                
                event.sender.send('serverscan:progress', {
                  stage: 'analyzing',
                  message: message,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: logMessage
                });
              } else {
                event.sender.send('serverscan:progress', {
                  stage: 'analyzing',
                  message: `[${stepNumber}/${totalSteps}] ${commandName} analysis failed`,
                  command: 'tgpt',
                  output: '',
                  progress: progressPercent,
                  consoleLog: `[ERROR] [${stepNumber}/${totalSteps}] ${commandName} analysis failed: ${analyzed?.error || 'Unknown error'}\n`
                });
              }
              
              return analyzed;
            } catch (error) {
              console.error(`[TGPT] Error in runTgptAnalysis for ${commandKey}:`, error);
              analyzedResults[commandKey] = { error: error.message || 'TGPT analysis error', raw: '' };
              event.sender.send('serverscan:progress', {
                stage: 'analyzing',
                message: `[${stepNumber}/${totalSteps}] ${commandName} analysis error`,
                command: 'tgpt',
                output: '',
                progress: Math.round((stepNumber / totalSteps) * 100),
                consoleLog: `[ERROR] [${stepNumber}/${totalSteps}] ${commandName} analysis error: ${error.message}\n`
              });
              return analyzedResults[commandKey];
            }
          };
          
          // 1. Nikto Scan (ONLY COMMAND)
          currentStep = 1;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Nikto server scan...`,
            command: 'nikto',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nikto server scan...\n`
          });
          
          const niktoReportFile = path.join(tempDir, 'nikto_report.txt');
          const niktoReportFileWSL = convertToWSLPath(niktoReportFile);
          // Nikto command: nikto -h domain -e -output nikto_report.txt
          const niktoCommand = `${wslPrefix} nikto -h ${targetDomain} -e -output "${niktoReportFileWSL}"`;
          
          const niktoResult = await executeCommand(niktoCommand, 300000);
          scanResults.nikto = { command: niktoCommand, raw: niktoResult.stdout || niktoResult.stderr || '' };
          
          // Read nikto report file if it exists
          if (fs.existsSync(niktoReportFile)) {
            try {
              const niktoReport = fs.readFileSync(niktoReportFile, 'utf-8');
              scanResults.nikto.raw = niktoReport;
            } catch (e) {
              console.error('Failed to read nikto report:', e);
            }
          }
          
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Nikto scan completed`,
            command: 'nikto',
            output: scanResults.nikto.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nikto scan completed\nRaw Result:\n${scanResults.nikto.raw.substring(0, 2000)}${scanResults.nikto.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Run TGPT analysis (blocking) - wait for it to complete
          currentStep = 2;
          await runTgptAnalysis('nikto', 'Server Security Scan', niktoCommand, scanResults.nikto.raw, currentStep, wslPrefix);
          
          // Send final results
          event.sender.send('serverscan:progress', {
            stage: 'completed',
            message: 'Server scan and analysis completed successfully',
            command: '',
            output: '',
            progress: 100,
            consoleLog: `\n✅ Server scan and analysis completed successfully!\n`
          });
          
          const finalResults = {
            target: target,
            targetDomain: targetDomain,
            extractedIP: extractedIP,
            rawResults: scanResults,
            analyzedResults: analyzedResults,
            timestamp: startTimestamp
          };
          
          console.log(`[SERVER-SCAN] Sending final results with ${Object.keys(analyzedResults).length} analyzed commands:`, Object.keys(analyzedResults));
          
          event.sender.send('serverscan:done', { 
            success: true, 
            summary: 'Server scan completed successfully',
            results: {
              json: finalResults,
              raw: JSON.stringify(finalResults, null, 2)
            },
            target: target,
            extractedIP: extractedIP
          });
          
          // Note: Notifications are handled by GlobalScanContext.jsx to avoid duplicates
          
          // Clean up temp files
          try {
            if (fs.existsSync(niktoReportFile)) fs.unlinkSync(niktoReportFile);
            if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
              fs.rmdirSync(tempDir);
            }
          } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError.message);
          }
          
        } catch (error) {
          if (error.name === 'AbortError') {
            event.sender.send('serverscan:progress', { 
              stage: 'aborted', 
              message: 'Server scan aborted by user',
              command: '',
              output: '',
              consoleLog: '\n⚠️ Server scan aborted by user\n'
            });
            event.sender.send('serverscan:done', { aborted: true });
          } else {
            event.sender.send('serverscan:progress', { 
              stage: 'error', 
              message: error.message,
              command: '',
              output: '',
              consoleLog: `\n❌ Server scan error: ${error.message}\n`
            });
            console.error('Server scan error:', error);
            event.sender.send('serverscan:done', { 
              success: false, 
              error: error.message,
              results: null
            });
          }
        } finally {
          serverScanChild = null;
          currentServerScanTarget = null;
          serverScanAbortController = null;
        }
      };
      
      // Run in background
      runServerScanAsync();
      
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  ipcMain.handle('serverscan:abort', async (event) => {
    console.log('[SERVER-SCAN] Abort requested, serverScanChild:', serverScanChild ? 'exists' : 'null');
    
    if (serverScanChild || currentServerScanTarget) {
      try {
        // Send abort message to UI immediately
        event.sender.send('serverscan:progress', {
          stage: 'aborting',
          message: 'Aborting scan...',
          command: '',
          output: '',
          consoleLog: '\n⚠️ [ABORT] Stopping server scan...\n'
        });
        
        // Kill the child process if it exists
        if (serverScanChild) {
          try {
            serverScanChild.kill('SIGTERM');
            setTimeout(() => {
              if (serverScanChild && !serverScanChild.killed) {
                serverScanChild.kill('SIGKILL');
              }
            }, 500);
            console.log('[SERVER-SCAN] Child process killed');
          } catch (e) {
            console.log('[SERVER-SCAN] Kill failed:', e.message);
          }
        }
        
        // Abort the abort controller
        if (serverScanAbortController) {
          serverScanAbortController.abort();
        }
        
        // Kill any running processes in WSL
        if (currentServerScanTarget) {
          try {
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);
            
            // Kill nikto, sqlmap, nmap, sslscan processes
            await execAsync(`wsl -- bash -c "pkill -f 'nikto.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f 'nikto.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -f 'sqlmap.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f 'sqlmap.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -f 'nmap.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f 'nmap.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -f 'sslscan.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
            await execAsync(`wsl -- bash -c "pkill -9 -f 'sslscan.*${currentServerScanTarget}' || true"`, { timeout: 3000 });
          } catch (e) {
            console.log('[SERVER-SCAN] Some cleanup commands failed:', e.message);
          }
        }
        
        // Clean up
        serverScanChild = null;
        currentServerScanTarget = null;
        serverScanAbortController = null;
        
        event.sender.send('serverscan:done', { aborted: true });
        return { success: true };
      } catch (error) {
        console.error('[SERVER-SCAN] Abort error:', error);
        return { error: error.message };
      }
    }
    return { error: 'No server scan running' };
  });

  // Wapiti scan handlers (register before app.whenReady)
  let wapitiScanChild = null
  let wapitiInterrupted = false
  let wapitiReportGenerated = false
  
  // Test handler to verify registration
  ipcMain.handle('wapiti:test', async () => {
    console.log('[WAPITI-TEST] Test handler called successfully')
    return { success: true, message: 'Wapiti handlers are working' }
  })
  
  // Helper function to test WSL connection with retry
  const testWslConnection = async (maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[WSL] Testing WSL connection (attempt ${attempt}/${maxRetries})...`)
        const { exec } = require('child_process')
        const { promisify } = require('util')
        const execAsync = promisify(exec)
        
        // Test with a simple command that has a short timeout
        await execAsync('wsl echo "WSL connection test"', { 
          timeout: 10000, // 10 second timeout
          maxBuffer: 1024 
        })
        console.log('[WSL] ✅ WSL connection test successful')
        return true
      } catch (error) {
        console.log(`[WSL] ❌ WSL connection test failed (attempt ${attempt}/${maxRetries}):`, error.message)
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000 // Exponential backoff: 2s, 4s, 6s
          console.log(`[WSL] ⏳ Waiting ${waitTime}ms before retry...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        } else {
          console.log('[WSL] ❌ All WSL connection tests failed')
          return false
        }
      }
    }
    return false
  }

  console.log('[WAPITI] Registering wapiti:start handler...')
  ipcMain.handle('wapiti:start', async (event, url) => {
    console.log('[WAPITI] wapiti:start handler called with url:', url)
    if (wapitiScanChild) return { error: 'Wapiti scan already running' }
    wapitiInterrupted = false
    wapitiReportGenerated = false
    try {
      const useWsl = await checkWslInstalled()
      if (!useWsl) {
        event.sender.send('wapiti:progress', { stage: 'error', message: 'WSL is required for Wapiti scans' })
        return { error: 'WSL is required for Wapiti scans' }
      }
      
      // Test WSL connection before starting scan
      event.sender.send('wapiti:progress', { stage: 'info', message: 'Testing WSL connection...' })
      const wslConnected = await testWslConnection(3)
      if (!wslConnected) {
        const errorMsg = 'WSL connection timeout. Please ensure WSL is running. Try restarting WSL or your computer if the issue persists.'
        event.sender.send('wapiti:progress', { stage: 'error', message: errorMsg })
        return { error: errorMsg }
      }
      
      const tempDir = path.join(process.cwd(), 'temp-scans')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const scanFile = path.join(tempDir, 'local_scan.json')
      const wslPath = tempDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`)
      const wapitiCmd = `wapiti -u "${url}" -d 3 -m xss,sql -f json -o local_scan.json --max-scan-time 1800 --skip .jpg --skip .jpeg --skip .png --skip .webp`
      event.sender.send('wapiti:progress', { stage: 'starting', message: `Starting Wapiti scan for ${url}...` })
      event.sender.send('wapiti:progress', { stage: 'info', message: `Command: ${wapitiCmd}` })
      const wslCommand = `cd "${wslPath}" && ${wapitiCmd}`
      
      // Spawn with error handling for WSL connection issues
      let spawnTimeout = null
      let spawnStarted = false
      
      try {
        wapitiScanChild = spawn('C:\\Windows\\System32\\wsl.exe', ['bash', '-c', wslCommand], {
          stdio: ['pipe', 'pipe', 'pipe']
        })
        
        // Set a timeout to detect if spawn fails to start
        spawnTimeout = setTimeout(() => {
          if (!spawnStarted && wapitiScanChild) {
            console.log('[WAPITI] Spawn timeout - process may not have started')
            event.sender.send('wapiti:progress', { stage: 'warning', message: 'WSL process is taking longer than expected to start...' })
          }
        }, 15000) // 15 second warning
        
        // Mark as started when we get first data or process starts
        wapitiScanChild.stdout.once('data', () => {
          spawnStarted = true
          if (spawnTimeout) {
            clearTimeout(spawnTimeout)
            spawnTimeout = null
          }
        })
        
        wapitiScanChild.stderr.once('data', () => {
          spawnStarted = true
          if (spawnTimeout) {
            clearTimeout(spawnTimeout)
            spawnTimeout = null
          }
        })
        
      } catch (spawnError) {
        if (spawnTimeout) {
          clearTimeout(spawnTimeout)
          spawnTimeout = null
        }
        if (spawnError.message && spawnError.message.includes('HCS_E_CONNECTION_TIMEOUT')) {
          const errorMsg = 'WSL connection timeout when starting scan. Please ensure WSL is running properly. Try: wsl --shutdown then wsl in PowerShell to restart WSL.'
          event.sender.send('wapiti:progress', { stage: 'error', message: errorMsg })
          return { error: errorMsg }
        }
        throw spawnError
      }
      
      let interruptionTimeout = null
      let autoInterruptTimeout = null
      const maxScanTime = 30 * 60 * 1000 // 30 minutes (1800000ms) - WordPress/Shopify scans can take 20-30 minutes
      let reportRetryTimeout = null
      
      const checkForInterruption = (data) => {
        const text = data.toString()
        if (text.includes('Attack process was interrupted') || 
            text.includes('Do you want to:') ||
            text.includes('r) stop everything here and generate the (R)eport')) {
          wapitiInterrupted = true
          event.sender.send('wapiti:progress', { stage: 'warning', message: 'Scan interrupted. Generating report...' })
          
          // Clear auto-interrupt timeout since we're already interrupted
          if (autoInterruptTimeout) {
            clearTimeout(autoInterruptTimeout)
            autoInterruptTimeout = null
          }
          
          // Send 'R' to generate report
          if (wapitiScanChild && wapitiScanChild.stdin) {
            wapitiScanChild.stdin.write('R\n')
            event.sender.send('wapiti:progress', { stage: 'info', message: 'Sent report generation command (R)' })
          }
          
          // Wait 2 minutes for report generation, then send R again if needed
          if (reportRetryTimeout) {
            clearTimeout(reportRetryTimeout)
          }
          reportRetryTimeout = setTimeout(() => {
            if (!wapitiReportGenerated && wapitiScanChild) {
              event.sender.send('wapiti:progress', { stage: 'warning', message: 'Report generation taking longer than expected. Sending R again...' })
              if (wapitiScanChild.stdin) {
                wapitiScanChild.stdin.write('R\n')
              }
            }
          }, 2 * 60 * 1000) // 2 minutes
        }
        if (text.includes('A report has been generated in the file local_scan.json') ||
            text.includes('Report has been generated')) {
          wapitiReportGenerated = true
          
          // Clear all timeouts
          if (autoInterruptTimeout) {
            clearTimeout(autoInterruptTimeout)
            autoInterruptTimeout = null
          }
          if (reportRetryTimeout) {
            clearTimeout(reportRetryTimeout)
            reportRetryTimeout = null
          }
          
          event.sender.send('wapiti:progress', { stage: 'success', message: 'Report generated! Reading scan results...' })
          setTimeout(async () => {
            try {
              const { exec } = require('child_process')
              const { promisify } = require('util')
              const execAsync = promisify(exec)
              const wslPathForCat = tempDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`)
              const catWslCmd = `wsl bash -c "cd \\"${wslPathForCat}\\" && cat local_scan.json"`
              const { stdout } = await execAsync(catWslCmd, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30000
              })
              let scanResults = null
              try {
                scanResults = JSON.parse(stdout)
                event.sender.send('wapiti:progress', { stage: 'success', message: 'Scan results parsed successfully!' })
              } catch (parseError) {
                scanResults = { raw: stdout }
              }
              event.sender.send('wapiti:done', { 
                success: true, 
                results: scanResults,
                rawJson: stdout
              })
            } catch (catError) {
              event.sender.send('wapiti:progress', { stage: 'error', message: `Failed to read report: ${catError.message}` })
              event.sender.send('wapiti:done', { error: `Failed to read report: ${catError.message}` })
            }
          }, 1000)
        }
      }
      
      // Auto-interrupt after 30 minutes (WordPress/Shopify scans can take 20-30 minutes)
      autoInterruptTimeout = setTimeout(() => {
        if (wapitiScanChild && !wapitiInterrupted && !wapitiReportGenerated) {
          event.sender.send('wapiti:progress', { stage: 'warning', message: 'Scan has been running for 30 minutes. Interrupting to generate report...' })
          
          // Send Ctrl+C (SIGINT) to interrupt the scan
          try {
            if (wapitiScanChild && !wapitiScanChild.killed) {
              wapitiScanChild.kill('SIGINT')
              event.sender.send('wapiti:progress', { stage: 'info', message: 'Sent interrupt signal (Ctrl+C) to Wapiti...' })
            }
          } catch (killError) {
            event.sender.send('wapiti:progress', { stage: 'error', message: `Failed to interrupt scan: ${killError.message}` })
          }
        }
      }, maxScanTime)
      wapitiScanChild.stdout.on('data', (data) => {
        const lines = data.toString().split(/\r?\n/)
        for (const line of lines) {
          if (line.trim()) {
            event.sender.send('wapiti:progress', { stage: 'log', message: line })
          }
        }
        checkForInterruption(data)
      })
      wapitiScanChild.stderr.on('data', (data) => {
        const lines = data.toString().split(/\r?\n/)
        for (const line of lines) {
          if (line.trim()) {
            const stage = line.toLowerCase().includes('error') ? 'error' : 
                         line.toLowerCase().includes('warning') ? 'warning' : 'log'
            event.sender.send('wapiti:progress', { stage, message: line })
          }
        }
        checkForInterruption(data)
      })
      // This timeout is now handled by autoInterruptTimeout above
      wapitiScanChild.on('close', (code) => {
        // Clear all timeouts
        if (spawnTimeout) {
          clearTimeout(spawnTimeout)
          spawnTimeout = null
        }
        if (interruptionTimeout) {
          clearTimeout(interruptionTimeout)
          interruptionTimeout = null
        }
        if (autoInterruptTimeout) {
          clearTimeout(autoInterruptTimeout)
          autoInterruptTimeout = null
        }
        if (reportRetryTimeout) {
          clearTimeout(reportRetryTimeout)
          reportRetryTimeout = null
        }
        
        // Always try to read the report file if it exists, even if exit code is not 0
        // This handles cases where scan was interrupted but report was still generated
        const checkForReport = async () => {
          // Wait a bit longer for report generation if it was interrupted
          if (wapitiInterrupted && !wapitiReportGenerated) {
            await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds for report generation
          }
          
          if (fs.existsSync(scanFile)) {
            event.sender.send('wapiti:progress', { stage: 'info', message: 'Reading scan results from file...' })
            try {
              const reportContent = fs.readFileSync(scanFile, 'utf8')
              let scanResults = null
              try {
                scanResults = JSON.parse(reportContent)
                event.sender.send('wapiti:progress', { stage: 'success', message: 'Scan results parsed successfully!' })
              } catch (parseError) {
                scanResults = { raw: reportContent }
              }
              event.sender.send('wapiti:done', { 
                success: true, 
                results: scanResults,
                rawJson: reportContent
              })
            } catch (readError) {
              event.sender.send('wapiti:progress', { stage: 'error', message: `Failed to read report: ${readError.message}` })
              event.sender.send('wapiti:done', { error: `Failed to read report: ${readError.message}` })
            }
          } else {
            // If report doesn't exist and scan was interrupted, it might still be generating
            if (wapitiInterrupted) {
              // Wait a bit more and check again
              setTimeout(async () => {
                if (fs.existsSync(scanFile)) {
                  await checkForReport()
                } else {
                  event.sender.send('wapiti:done', { error: 'Scan was interrupted but report file was not generated. The scan may have been stopped before completion.' })
                }
              }, 5000) // Wait 5 more seconds
            } else {
              event.sender.send('wapiti:done', { error: 'Scan completed but report file not found' })
            }
          }
        }
        
        // Start checking for report
        setTimeout(checkForReport, 1000)
        wapitiScanChild = null
      })
      wapitiScanChild.on('error', (error) => {
        // Clear all timeouts
        if (spawnTimeout) {
          clearTimeout(spawnTimeout)
          spawnTimeout = null
        }
        if (interruptionTimeout) {
          clearTimeout(interruptionTimeout)
          interruptionTimeout = null
        }
        if (autoInterruptTimeout) {
          clearTimeout(autoInterruptTimeout)
          autoInterruptTimeout = null
        }
        if (reportRetryTimeout) {
          clearTimeout(reportRetryTimeout)
          reportRetryTimeout = null
        }
        
        let errorMessage = error.message
        // Provide helpful error messages for common WSL errors
        if (error.message && (error.message.includes('HCS_E_CONNECTION_TIMEOUT') || error.message.includes('connection timeout'))) {
          errorMessage = 'WSL connection timeout. The WSL service may not be running. Please try:\n1. Open PowerShell as Administrator\n2. Run: wsl --shutdown\n3. Run: wsl\n4. Then try the scan again'
        } else if (error.message && error.message.includes('ENOENT')) {
          errorMessage = 'WSL command not found. Please ensure WSL is installed and available in your PATH.'
        } else if (error.message && error.message.includes('timeout')) {
          errorMessage = 'WSL operation timed out. The WSL service may be unresponsive. Try restarting WSL or your computer.'
        }
        
        console.log('[WAPITI] Process error:', errorMessage)
        event.sender.send('wapiti:progress', { stage: 'error', message: `Process error: ${errorMessage}` })
        event.sender.send('wapiti:done', { error: errorMessage })
        wapitiScanChild = null
      })
      return { ok: true }
    } catch (error) {
      event.sender.send('wapiti:progress', { stage: 'error', message: `Failed to start scan: ${error.message}` })
      event.sender.send('wapiti:done', { error: error.message })
      wapitiScanChild = null
      return { error: error.message }
    }
  })
  
  console.log('[WAPITI] Registering wapiti:stop handler...')
  ipcMain.handle('wapiti:stop', async () => {
    console.log('[WAPITI] wapiti:stop handler called')
    if (wapitiScanChild) {
      try {
        wapitiScanChild.kill('SIGINT')
        setTimeout(() => {
          if (wapitiScanChild) {
            try {
              wapitiScanChild.kill('SIGKILL')
            } catch {}
          }
        }, 2000)
        wapitiScanChild = null
        return { ok: true }
      } catch (error) {
        return { error: error.message }
      }
    }
    return { error: 'No scan running' }
  })

  // Website Security Audit (authorized, read-only)
  ipcMain.handle('websiteAudit:start', async (event, payload) => {
    try {
      const { url, credentials } = typeof payload === 'object' ? payload : { url: payload, credentials: null }
      const websiteAuditModule = require(path.join(__dirname, '..', 'scanners', 'website-audit.js'))
      const outDir = path.join(process.cwd(), 'temp-scans', `website-audit-${Date.now()}`)
      fs.mkdirSync(outDir, { recursive: true })
      // Launch target site in default browser (read-only view) for user context
      try {
        const safeUrl = (() => {
          try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`)
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
          } catch {}
          return null
        })()
        if (safeUrl) shell.openExternal(safeUrl)
      } catch {}
      const options = {
        outputDir: outDir,
        onProgress: (u) => event.sender.send('websiteAudit:progress', u)
      }
      const result = await websiteAuditModule.runWebsiteAudit(url, { ...options, credentials })
      event.sender.send('websiteAudit:done', { success: true, result })
      return { success: true }
    } catch (e) {
      event.sender.send('websiteAudit:done', { error: e?.message || String(e) })
      return { error: e?.message || String(e) }
    }
  })

  // Website Security Audit - Enhanced Scan with 5 Commands
  ipcMain.handle('websiteSecurityAudit:start', async (event, payload) => {
    try {
      const { url, credentials, password } = typeof payload === 'object' ? payload : { url: payload, credentials: null, password: null }
      const { exec } = require('child_process')
      const { promisify } = require('util')
      const execAsync = promisify(exec)
      
      if (!password) {
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'error',
          message: 'WSL password is required',
          type: 'error'
        })
        return { success: false, error: 'WSL password is required' }
      }

      const targetUrl = url.startsWith('http') ? url : `https://${url}`
      const wslPrefix = 'wsl -u root'
      
      // Helper function to execute WSL commands
      const executeCommand = async (command, timeout = 300000) => {
        try {
          const fullCommand = `${wslPrefix} bash -c "${command.replace(/"/g, '\\"')}"`
          const { stdout, stderr } = await execAsync(fullCommand, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: timeout,
            windowsHide: true
          })
          return { 
            success: true, 
            stdout: stdout || '', 
            stderr: stderr || '', 
            error: null 
          }
        } catch (error) {
          return { 
            success: false, 
            stdout: error.stdout || '', 
            stderr: error.stderr || '', 
            error: error.message
          }
        }
      }

      // Helper function to call tgpt for parsing
      const parseWithTgpt = async (rawOutput, commandName) => {
        try {
          const prompt = `We executed a security scan command and got the following raw result:

${rawOutput}

Please decode this raw result to a user understandable form and return as JSON. The JSON should include:
- whatWeDid: Explanation of what the scan command does
- whatWeGot: Explanation of what the results mean
- summary: Summary of findings
- findings: Array of detailed findings
- recommendations: Array of recommendations

Return ONLY valid JSON. No additional text, no markdown formatting - just the JSON object.`

          event.sender.send('websiteSecurityAudit:progress', {
            stage: 'analyzing',
            message: `Analyzing ${commandName} results...`,
            type: 'info',
            command: 'Analysis',
            output: ''
          })

          const { spawn } = require('child_process')
          return new Promise((resolve, reject) => {
            const wslProcess = spawn('C:\\Windows\\System32\\wsl.exe', ['bash', '-c', 'tgpt'], {
              stdio: ['pipe', 'pipe', 'pipe'],
              maxBuffer: 10 * 1024 * 1024,
              shell: false
            })
            
            let stdout = ''
            let stderr = ''
            
            wslProcess.stdin.write(prompt, 'utf8')
            wslProcess.stdin.end()
            
            wslProcess.stdout.on('data', (data) => {
              stdout += data.toString()
            })
            
            wslProcess.stderr.on('data', (data) => {
              stderr += data.toString()
            })
            
            const timeout = setTimeout(() => {
              wslProcess.kill()
              reject(new Error('Analysis timeout after 5 minutes'))
            }, 300000)
            
            wslProcess.on('close', (code) => {
              clearTimeout(timeout)
              
              if (stdout || code === 0) {
                // Try to parse JSON from output
                try {
                  let cleanedOutput = stdout.replace(/^```(?:json)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '')
                  const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/)
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0])
                    resolve({ success: true, parsed })
                  } else {
                    resolve({ success: true, parsed: JSON.parse(cleanedOutput) })
                  }
                } catch (parseError) {
                  resolve({ success: false, error: 'Failed to parse analysis result', raw: stdout })
                }
              } else {
                resolve({ success: false, error: `Process exited with code ${code}`, raw: stderr })
              }
            })
            
            wslProcess.on('error', (error) => {
              clearTimeout(timeout)
              reject(error)
            })
          })
        } catch (error) {
          return { success: false, error: error.message }
        }
      }

      const results = {
        command1: null,
        command2: null,
        command3: null,
        command4: null,
        command5: null,
        screenshots: []
      }

      // Helper function to capture screenshots using Puppeteer
      const captureScreenshots = async (url, credentials = null) => {
        try {
          const puppeteer = require('puppeteer')
          const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          })
          const page = await browser.newPage()
          await page.setViewport({ width: 1920, height: 1080 })
          
          // Navigate to the URL
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
          
          // Handle authentication if credentials provided
          if (credentials && credentials.username && credentials.password) {
            try {
              // Try to find login form elements
              await page.waitForSelector('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"], input[id*="user"], input[id*="login"]', { timeout: 5000 })
              
              // Fill username
              await page.type('input[type="text"], input[type="email"], input[name*="user"], input[name*="login"], input[id*="user"], input[id*="login"]', credentials.username, { delay: 100 })
              
              // Fill password
              await page.waitForSelector('input[type="password"]', { timeout: 5000 })
              await page.type('input[type="password"]', credentials.password, { delay: 100 })
              
              // Submit form
              await page.click('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")').catch(() => {
                // If click doesn't work, try pressing Enter
                page.keyboard.press('Enter')
              })
              
              // Wait for navigation after login
              await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {})
            } catch (authError) {
              console.log('Authentication attempt failed or not needed:', authError.message)
            }
          }
          
          // Wait a bit for page to fully load
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Capture screenshot
          const screenshot = await page.screenshot({ 
            fullPage: true,
            encoding: 'base64'
          })
          
          await browser.close()
          
          const screenshotData = {
            url: url,
            timestamp: Date.now(),
            base64: screenshot.toString('base64')
          }
          
          results.screenshots.push(screenshotData)
          
          // Send screenshot to frontend
          event.sender.send('websiteSecurityAudit:progress', {
            stage: 'screenshot',
            message: 'Screenshot captured successfully',
            type: 'success',
            command: 'Screenshot Capture',
            screenshot: screenshotData,
            progress: 0
          })
          
          return screenshotData
        } catch (error) {
          console.error('Screenshot capture error:', error)
          event.sender.send('websiteSecurityAudit:progress', {
            stage: 'screenshot',
            message: `Screenshot capture failed: ${error.message}`,
            type: 'warning',
            command: 'Screenshot Capture',
            progress: 0
          })
          return null
        }
      }

      // Capture screenshots before starting the scan
      if (credentials && credentials.username && credentials.password) {
        await captureScreenshots(targetUrl, credentials)
      } else {
        await captureScreenshots(targetUrl)
      }

      // Command 1: testssl.sh
      try {
        // Generate unique filename with full timestamp
        const timestamp = Date.now()
        const dateStr = new Date(timestamp).toISOString().replace(/[:.]/g, '-').replace('T', '_')
        const uniqueFileName = `ssl-tls-scan-${dateStr}.json`
        const jsonFilePath = `/tmp/${uniqueFileName}`
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Running SSL/TLS analysis...',
          type: 'info',
          command: 'SSL/TLS Analysis',
          commandText: `./testssl.sh -oj ${jsonFilePath} ${targetUrl}`,
          output: '',
          progress: 0
        })

        // Execute command from /cybrix/testssl.sh directory with unique filename
        const testsslCommand = `cd /cybrix/testssl.sh && ./testssl.sh -oj ${jsonFilePath} ${targetUrl}`
        const testsslResult = await executeCommand(testsslCommand, 600000)
        
        // Log command execution
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'SSL/TLS analysis command executed',
          type: 'info',
          command: 'SSL/TLS Analysis',
          commandText: `./testssl.sh -oj ${jsonFilePath} ${targetUrl}`,
          output: testsslResult.stdout + testsslResult.stderr,
          progress: 0
        })
        
        if (testsslResult.success) {
          // Read the JSON file using the saved unique filename
          const readJsonCommand = `cat ${jsonFilePath}`
          const jsonResult = await executeCommand(readJsonCommand, 30000)
          
          if (jsonResult.success && jsonResult.stdout) {
            try {
              const jsonData = JSON.parse(jsonResult.stdout)
              results.command1 = {
                success: true,
                raw: jsonResult.stdout,
                parsed: jsonData
              }
              
              event.sender.send('websiteSecurityAudit:progress', {
                stage: 'completed',
                message: 'SSL/TLS analysis completed',
                type: 'success',
                command: 'SSL/TLS Analysis',
                commandText: `./testssl.sh -oj ${jsonFilePath} ${targetUrl}`,
                output: jsonResult.stdout.substring(0, 5000), // Limit output size
                progress: 20,
                result: results.command1
              })
            } catch (parseError) {
              results.command1 = {
                success: false,
                error: 'Failed to parse JSON',
                raw: jsonResult.stdout
              }
            }
          } else {
            results.command1 = {
              success: false,
              error: 'Failed to read JSON file',
              raw: testsslResult.stdout
            }
          }
        } else {
          results.command1 = {
            success: false,
            error: testsslResult.error || 'Command failed',
            raw: testsslResult.stdout + testsslResult.stderr
          }
        }
      } catch (error) {
        results.command1 = {
          success: false,
          error: error.message,
          raw: ''
        }
      }

      // Command 2: nikto
      try {
        const niktoCommand = `cd // && nikto -h ${targetUrl} -o /tmp/nikto-webnox.xml -Format xml`
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Running web server analysis...',
          type: 'info',
          command: 'Web Server Analysis',
          commandText: `nikto -h ${targetUrl} -o /tmp/nikto-webnox.xml -Format xml`,
          output: '',
          progress: 20
        })

        const niktoResult = await executeCommand(niktoCommand, 600000)
        const rawOutput = niktoResult.stdout + niktoResult.stderr
        
        // Log command execution result
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Web server analysis command executed',
          type: 'info',
          command: 'Web Server Analysis',
          commandText: `nikto -h ${targetUrl} -o /tmp/nikto-webnox.xml -Format xml`,
          output: rawOutput.substring(0, 10000), // Limit output size
          progress: 20
        })
        
        if (niktoResult.success) {
          const parsed = await parseWithTgpt(rawOutput, 'Web Server Analysis')
          results.command2 = {
            success: true,
            raw: rawOutput,
            parsed: parsed.success ? parsed.parsed : { error: parsed.error, raw: parsed.raw }
          }
        } else {
          const parsed = await parseWithTgpt(rawOutput, 'Web Server Analysis')
          results.command2 = {
            success: false,
            error: niktoResult.error || 'Command failed',
            raw: rawOutput,
            parsed: parsed.success ? parsed.parsed : { error: parsed.error, raw: parsed.raw }
          }
        }
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'completed',
          message: 'Web server analysis completed',
          type: 'success',
          command: 'Web Server Analysis',
          commandText: `nikto -h ${targetUrl} -o /tmp/nikto-webnox.xml -Format xml`,
          output: '',
          progress: 40,
          result: results.command2
        })
      } catch (error) {
        results.command2 = {
          success: false,
          error: error.message,
          raw: ''
        }
      }

      // Command 3: curl -I
      try {
        const curlCommand = `cd // && curl -I ${targetUrl}`
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Analyzing HTTP headers...',
          type: 'info',
          command: 'HTTP Headers Analysis',
          commandText: `curl -I ${targetUrl}`,
          output: '',
          progress: 40
        })

        const curlResult = await executeCommand(curlCommand, 60000)
        const rawOutput = curlResult.stdout + curlResult.stderr
        
        // Log command execution result
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'HTTP headers analysis command executed',
          type: 'info',
          command: 'HTTP Headers Analysis',
          commandText: `curl -I ${targetUrl}`,
          output: rawOutput,
          progress: 40
        })
        
        const parsed = await parseWithTgpt(rawOutput, 'HTTP Headers Analysis')
        
        results.command3 = {
          success: curlResult.success,
          raw: rawOutput,
          parsed: parsed.success ? parsed.parsed : { error: parsed.error, raw: parsed.raw }
        }
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'completed',
          message: 'HTTP headers analysis completed',
          type: 'success',
          command: 'HTTP Headers Analysis',
          commandText: `curl -I ${targetUrl}`,
          output: '',
          progress: 60,
          result: results.command3
        })
      } catch (error) {
        results.command3 = {
          success: false,
          error: error.message,
          raw: ''
        }
      }

      // Command 4: host + geoiplookup
      try {
        const domainName = url.replace(/^https?:\/\//, '').split('/')[0]
        const hostCommand = `cd // && host ${domainName}`
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Resolving domain and analyzing location...',
          type: 'info',
          command: 'Domain & Location Analysis',
          commandText: `host ${domainName}`,
          output: '',
          progress: 60
        })

        const hostResult = await executeCommand(hostCommand, 30000)
        
        // Log host command result
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Domain resolution command executed',
          type: 'info',
          command: 'Domain & Location Analysis',
          commandText: `host ${domainName}`,
          output: hostResult.stdout + hostResult.stderr,
          progress: 60
        })
        
        let ipAddress = null
        if (hostResult.success) {
          const ipMatch = hostResult.stdout.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
          if (ipMatch) {
            ipAddress = ipMatch[1]
          }
        }
        
        let geoResult = { success: false, stdout: '', stderr: '' }
        if (ipAddress) {
          const geoCommand = `cd // && geoiplookup ${ipAddress}`
          
          event.sender.send('websiteSecurityAudit:progress', {
            stage: 'running',
            message: 'Running geolocation lookup...',
            type: 'info',
            command: 'Domain & Location Analysis',
            commandText: `geoiplookup ${ipAddress}`,
            output: '',
            progress: 60
          })
          
          geoResult = await executeCommand(geoCommand, 30000)
          
          // Log geo command result
          event.sender.send('websiteSecurityAudit:progress', {
            stage: 'running',
            message: 'Geolocation lookup command executed',
            type: 'info',
            command: 'Domain & Location Analysis',
            commandText: `geoiplookup ${ipAddress}`,
            output: geoResult.stdout + geoResult.stderr,
            progress: 60
          })
        }
        
        const combinedOutput = `Host Resolution:\n${hostResult.stdout}\n\nGeoIP Lookup:\n${geoResult.stdout || geoResult.stderr}`
        const parsed = await parseWithTgpt(combinedOutput, 'Domain & Location Analysis')
        
        results.command4 = {
          success: hostResult.success && geoResult.success,
          ipAddress: ipAddress,
          raw: combinedOutput,
          parsed: parsed.success ? parsed.parsed : { error: parsed.error, raw: parsed.raw }
        }
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'completed',
          message: 'Domain & location analysis completed',
          type: 'success',
          command: 'Domain & Location Analysis',
          commandText: `host ${domainName} && geoiplookup ${ipAddress || 'N/A'}`,
          output: '',
          progress: 80,
          result: results.command4
        })
      } catch (error) {
        results.command4 = {
          success: false,
          error: error.message,
          raw: ''
        }
      }

      // Command 5: traceroute
      try {
        const domainName = url.replace(/^https?:\/\//, '').split('/')[0]
        const tracerouteCommand = `cd // && traceroute ${domainName}`
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Tracing network path...',
          type: 'info',
          command: 'Network Path Analysis',
          commandText: `traceroute ${domainName}`,
          output: '',
          progress: 80
        })

        const tracerouteResult = await executeCommand(tracerouteCommand, 300000)
        const rawOutput = tracerouteResult.stdout + tracerouteResult.stderr
        
        // Log command execution result
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'running',
          message: 'Network path analysis command executed',
          type: 'info',
          command: 'Network Path Analysis',
          commandText: `traceroute ${domainName}`,
          output: rawOutput.substring(0, 10000), // Limit output size
          progress: 80
        })
        
        const parsed = await parseWithTgpt(rawOutput, 'Network Path Analysis')
        
        results.command5 = {
          success: tracerouteResult.success,
          raw: rawOutput,
          parsed: parsed.success ? parsed.parsed : { error: parsed.error, raw: parsed.raw }
        }
        
        event.sender.send('websiteSecurityAudit:progress', {
          stage: 'completed',
          message: 'Network path analysis completed',
          type: 'success',
          command: 'Network Path Analysis',
          commandText: `traceroute ${domainName}`,
          output: '',
          progress: 100,
          result: results.command5
        })
      } catch (error) {
        results.command5 = {
          success: false,
          error: error.message,
          raw: ''
        }
      }

      // Send completion
      event.sender.send('websiteSecurityAudit:done', {
        success: true,
        results: results
      })

      return { success: true, results: results }
    } catch (error) {
      event.sender.send('websiteSecurityAudit:done', {
        success: false,
        error: error.message
      })
      return { success: false, error: error.message }
    }
  })

// Global notification count for badge
let notificationCount = 0;
let mainWindowInstance = null;

// Function to update badge count
const updateBadgeCount = (count) => {
  notificationCount = count;
  if (process.platform === 'win32') {
    // Windows: Set badge count on taskbar
    if (mainWindowInstance) {
      mainWindowInstance.setOverlayIcon(
        count > 0 ? null : null, // We'll use setBadgeCount if available
        count > 0 ? `${count} scan${count > 1 ? 's' : ''} completed` : ''
      );
    }
    // Try to use app.setBadgeCount if available (Electron 9+)
    if (app.setBadgeCount) {
      app.setBadgeCount(count);
    }
  } else if (process.platform === 'darwin') {
    // macOS: Set badge count on dock
    app.dock?.setBadge(count > 0 ? String(count) : '');
  } else {
    // Linux: Set badge count
    if (app.setBadgeCount) {
      app.setBadgeCount(count);
    }
  }
};

// Notification handlers (register early, before app.whenReady)
console.log('[NOTIFICATION] Registering notification handlers...');
ipcMain.handle('notification:show', async (event, notificationData) => {
  try {
    if (!Notification.isSupported()) {
      console.log('[WARNING] [NOTIFICATION] Notifications not supported on this platform');
      return { success: false, error: 'Notifications not supported' };
    }

    const { title, body, scanId, viewId } = notificationData;

    // Create and show notification
    const notification = new Notification({
      title: title || 'Scan Completed',
      body: body || 'A scan has been completed successfully.',
      icon: iconPath, // Use app icon
      urgency: 'normal',
      timeoutType: 'default'
    });

    // Handle notification click - navigate to the scan view
    notification.on('click', () => {
      if (mainWindowInstance) {
        mainWindowInstance.show();
        mainWindowInstance.focus();
        // Send message to renderer to navigate to the view
        if (viewId) {
          mainWindowInstance.webContents.send('notification:clicked', { scanId, viewId });
        }
      }
    });

    notification.show();
    notificationCount++;
    updateBadgeCount(notificationCount);
    console.log('[SUCCESS] [NOTIFICATION] Notification shown:', title);

    // Send notification data to renderer for in-app notification display
    // Note: The NotificationContext also intercepts showNotification calls directly,
    // so this is a backup method
    if (mainWindowInstance && mainWindowInstance.webContents) {
      try {
        mainWindowInstance.webContents.send('notification:sent', {
          title: title || 'Scan Completed',
          body: body || 'A scan has been completed successfully.',
          scanId,
          viewId,
          timestamp: Date.now()
        });
        console.log('[NOTIFICATION] Sent notification:sent IPC event to renderer');
      } catch (error) {
        console.error('[NOTIFICATION] Failed to send notification:sent IPC event:', error);
      }
    } else {
      console.warn('[NOTIFICATION] mainWindowInstance not available, skipping IPC event (interceptor will handle it)');
    }

    return { success: true };
  } catch (error) {
    console.error('[ERROR] [NOTIFICATION] Failed to show notification:', error);
    return { success: false, error: error.message };
  }
});

// Clear notification badge
ipcMain.handle('notification:clearBadge', async () => {
  try {
    notificationCount = 0;
    if (mainWindowInstance) {
      mainWindowInstance.setBadgeCount(0);
    }
    updateBadgeCount(0);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get notification count
ipcMain.handle('notification:getCount', async () => {
  return { count: notificationCount };
});

  // GitHub OAuth and Repository Scanner - register early, before app.whenReady
  let githubScanChild = null;
  let storedAccessToken = null;
  
  console.log('[GITHUB-SCAN] Registering GitHub scanner handlers...');
  
  // GitHub OAuth Device Flow - Initiate
  ipcMain.handle('github:initiate-auth', async (event) => {
    try {
      const GitHubOAuth = require(path.join(__dirname, '..', 'scanners', 'github-oauth.js'));
      const oauth = new GitHubOAuth();
      
      const deviceFlow = await oauth.initiateDeviceFlow();
      
      return {
        success: true,
        userCode: deviceFlow.userCode,
        verificationUri: deviceFlow.verificationUri,
        verificationUriComplete: deviceFlow.verificationUriComplete,
        expiresIn: deviceFlow.expiresIn
      };
    } catch (error) {
      console.error('[GITHUB-AUTH] Failed to initiate auth:', error);
      return { success: false, error: error.message };
    }
  });

  // GitHub OAuth Device Flow - Poll for token
  ipcMain.handle('github:poll-token', async (event, deviceCode, userCode) => {
    try {
      const GitHubOAuth = require(path.join(__dirname, '..', 'scanners', 'github-oauth.js'));
      const oauth = new GitHubOAuth();
      oauth.deviceCode = deviceCode;
      oauth.userCode = userCode;
      
      const progressCallback = (progress) => {
        event.sender.send('github:auth-progress', progress);
      };
      
      const tokenResult = await oauth.pollForToken(deviceCode, userCode, progressCallback);
      
      if (tokenResult.access_token) {
        storedAccessToken = tokenResult.access_token;
        
        // Get user info
        const userInfo = await oauth.getUserInfo(tokenResult.access_token);
        
        return {
          success: true,
          accessToken: tokenResult.access_token,
          user: userInfo
        };
      }
      
      return { success: false, error: 'No access token received' };
    } catch (error) {
      console.error('[GITHUB-AUTH] Failed to poll for token:', error);
      return { success: false, error: error.message };
    }
  });

  // Get GitHub repositories
  ipcMain.handle('github:get-repositories', async (event, accessToken) => {
    try {
      const token = accessToken || storedAccessToken;
      if (!token) {
        return { success: false, error: 'No access token available' };
      }
      
      const GitHubOAuth = require(path.join(__dirname, '..', 'scanners', 'github-oauth.js'));
      const oauth = new GitHubOAuth();
      
      const progressCallback = (progress) => {
        event.sender.send('github:repos-progress', progress);
      };
      
      const repositories = await oauth.getAllRepositories(token, progressCallback);
      
      return {
        success: true,
        repositories: repositories.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          url: repo.html_url,
          cloneUrl: repo.clone_url,
          sshUrl: repo.ssh_url,
          description: repo.description,
          language: repo.language,
          private: repo.private,
          defaultBranch: repo.default_branch,
          updatedAt: repo.updated_at,
          stars: repo.stargazers_count,
          forks: repo.forks_count
        }))
      };
    } catch (error) {
      console.error('[GITHUB-REPOS] Failed to get repositories:', error);
      return { success: false, error: error.message };
    }
  });

  // Start GitHub repository scan
  ipcMain.handle('apiscan:start', async (event, repositories, accessToken) => {
    console.log('[GITHUB-SCAN] Starting GitHub repository scan for:', repositories.length, 'repositories');
    
    if (githubScanChild) {
      console.log('[GITHUB-SCAN] Scan already running');
      return { error: 'GitHub scan already running' };
    }

    try {
      const token = accessToken || storedAccessToken;
      if (!token) {
        return { error: 'No access token available. Please authenticate first.' };
      }

      const GitHubRepoScanner = require(path.join(__dirname, '..', 'scanners', 'github-repo-scanner.js'));
      
      // Create output directory
      const outputDir = path.join(process.cwd(), 'temp-github-scans');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Run scans for all selected repositories
      const runScansAsync = async () => {
        try {
          const allResults = [];
          
          for (let i = 0; i < repositories.length; i++) {
            const repo = repositories[i];
            const repoProgress = Math.floor((i / repositories.length) * 100);
            
            event.sender.send('apiscan:progress', {
              progress: repoProgress,
              message: `Scanning repository ${i + 1}/${repositories.length}: ${repo.name}`,
              type: 'info',
              repository: repo.name
            });
            
            const scanner = new GitHubRepoScanner(repo.cloneUrl, repo.fullName, token, outputDir);
            
            scanner.setProgressCallback((progress) => {
              // Calculate overall progress
              const overallProgress = repoProgress + Math.floor((progress.progress / 100) * (100 / repositories.length));
              event.sender.send('apiscan:progress', {
                ...progress,
                progress: overallProgress,
                repository: repo.name
              });
            });
            
            try {
              const results = await scanner.performScan();
              allResults.push(results);
            } catch (error) {
              console.error(`[GITHUB-SCAN] Error scanning ${repo.name}:`, error);
              allResults.push({
                repository: repo.name,
                error: error.message,
                success: false
              });
            }
          }
          
          console.log('[GITHUB-SCAN] All scans completed successfully');
          event.sender.send('apiscan:complete', { 
            success: true, 
            results: {
              repositories: allResults,
              totalScanned: allResults.length,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          console.error('[GITHUB-SCAN] Scan error:', error);
          event.sender.send('apiscan:progress', {
            progress: 0,
            message: `❌ GitHub scan error: ${error.message}`,
            type: 'error'
          });
          event.sender.send('apiscan:complete', {
            success: false,
            error: error.message
          });
        } finally {
          githubScanChild = null;
        }
      };

      // Start scans in background
      githubScanChild = true;
      runScansAsync();
      
      return { success: true };
    } catch (error) {
      console.error('[GITHUB-SCAN] Failed to start scan:', error);
      githubScanChild = null;
      return { error: error.message };
    }
  });

  // File system handlers (register early, before app.whenReady)
  // Helper function to get/create Admin Cyberix path
  function getAdminCyberixPath() {
    const path = require('path');
    const fs = require('fs');
    
    // Define the Admin path: C:\Users\Admin\AppData\Roaming\Cyberix
    const adminUsersPath = 'C:\\Users\\Admin';
    const adminAppDataPath = path.join(adminUsersPath, 'AppData', 'Roaming');
    const adminCyberixPath = path.join(adminAppDataPath, 'Cyberix');
    
    try {
      // Create C:\Users\Admin if it doesn't exist
      if (!fs.existsSync(adminUsersPath)) {
        console.log(`[PATH] Creating Admin folder: ${adminUsersPath}`);
        logToFile(`[PATH] Creating Admin folder: ${adminUsersPath}`);
        fs.mkdirSync(adminUsersPath, { recursive: true });
      }
      
      // Create C:\Users\Admin\AppData if it doesn't exist
      if (!fs.existsSync(adminAppDataPath)) {
        console.log(`[PATH] Creating AppData folder: ${adminAppDataPath}`);
        logToFile(`[PATH] Creating AppData folder: ${adminAppDataPath}`);
        fs.mkdirSync(adminAppDataPath, { recursive: true });
      }
      
      // Create C:\Users\Admin\AppData\Roaming if it doesn't exist
      const roamingPath = path.join(adminAppDataPath, 'Roaming');
      if (!fs.existsSync(roamingPath)) {
        console.log(`[PATH] Creating Roaming folder: ${roamingPath}`);
        logToFile(`[PATH] Creating Roaming folder: ${roamingPath}`);
        fs.mkdirSync(roamingPath, { recursive: true });
      }
      
      // Create C:\Users\Admin\AppData\Roaming\Cyberix if it doesn't exist
      if (!fs.existsSync(adminCyberixPath)) {
        console.log(`[PATH] Creating Cyberix folder: ${adminCyberixPath}`);
        logToFile(`[PATH] Creating Cyberix folder: ${adminCyberixPath}`);
        fs.mkdirSync(adminCyberixPath, { recursive: true });
      }
      
      console.log(`[PATH] Using Admin Cyberix path: ${adminCyberixPath}`);
      logToFile(`[PATH] Using Admin Cyberix path: ${adminCyberixPath}`);
      return adminCyberixPath;
    } catch (error) {
      console.error(`[PATH] Error creating Admin path: ${error.message}`);
      logToFile(`[PATH] Error creating Admin path: ${error.message}`);
      // Fallback to app.getPath('userData') if Admin path creation fails
      return app.getPath('userData');
    }
  }

  ipcMain.handle('fs:getUserDataPath', async () => {
    try {
      return getAdminCyberixPath();
    } catch (error) {
      console.error('Error getting userData path:', error);
      logToFile(`[PATH] Error getting userData path: ${error.message}`);
      // Fallback to app.getPath('userData')
      return app.getPath('userData');
    }
  });

  ipcMain.handle('fs:getInstallPath', async () => {
    try {
      // Check setup config for install path
      const setupConfigPath = path.join(app.getPath('userData'), 'setup-config.json');
      if (fs.existsSync(setupConfigPath)) {
        const config = JSON.parse(fs.readFileSync(setupConfigPath, 'utf8'));
        if (config.installPath) {
          return config.installPath;
        }
      }
      // Fallback to app directory if no setup config
      return app.getAppPath();
    } catch (error) {
      console.error('Error getting install path:', error);
      // Fallback to app directory
      return app.getAppPath();
    }
  });

  ipcMain.handle('fs:getDownloadsPath', async () => {
    try {
      return app.getPath('downloads');
    } catch (error) {
      console.error('Error getting downloads path:', error);
      return null;
    }
  });

  // Cleanup old installation files and folders
  ipcMain.handle('setup:cleanupOldInstallation', async (event) => {
    try {
      const userDataPath = app.getPath('userData');
      const deleted = [];
      
      logToFile('[CLEANUP] Starting cleanup of old installation files...');
      logToFile(`[CLEANUP] UserData path: ${userDataPath}`);
      
      // Files and folders to delete (keep only essential ones)
      const itemsToDelete = [
        'installation_process',
        'setup-config.json',
        'cyberix-debug.log',
        'cyberix_scan_logs', // Will be recreated if needed
      ];
      
      // Keep these files/folders:
      // - wsl_password.enc (encrypted password - keep for security)
      // - Cyberix folder structure (will be recreated)
      
      for (const item of itemsToDelete) {
        const itemPath = path.join(userDataPath, item);
        try {
          if (fs.existsSync(itemPath)) {
            const stats = fs.statSync(itemPath);
            if (stats.isDirectory()) {
              // Delete directory recursively
              fs.rmSync(itemPath, { recursive: true, force: true });
              deleted.push(item);
              logToFile(`[CLEANUP] Deleted directory: ${item}`);
            } else if (stats.isFile()) {
              // Delete file
              fs.unlinkSync(itemPath);
              deleted.push(item);
              logToFile(`[CLEANUP] Deleted file: ${item}`);
            }
          }
        } catch (err) {
          logToFile(`[CLEANUP] Warning: Could not delete ${item}: ${err.message}`);
        }
      }
      
      // Also check for Cyberix folder in userData and delete if exists
      const cyberixFolder = path.join(userDataPath, 'Cyberix');
      if (fs.existsSync(cyberixFolder)) {
        try {
          fs.rmSync(cyberixFolder, { recursive: true, force: true });
          deleted.push('Cyberix');
          logToFile(`[CLEANUP] Deleted Cyberix folder`);
        } catch (err) {
          logToFile(`[CLEANUP] Warning: Could not delete Cyberix folder: ${err.message}`);
        }
      }
      
      logToFile(`[CLEANUP] Cleanup completed. Deleted ${deleted.length} items.`);
      return { success: true, deleted };
    } catch (error) {
      logToFile(`[CLEANUP] Error during cleanup: ${error.message}`);
      console.error('Error cleaning up old installation:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('fs:ensureDirectoryExists', async (event, dirPath) => {
    try {
      // Ensure dirPath is a string
      if (!dirPath || typeof dirPath !== 'string') {
        const errorMsg = `Invalid dirPath: ${typeof dirPath} - ${JSON.stringify(dirPath)}`;
        logToFile(`[MAIN] ${errorMsg}`);
        console.error('[MAIN]', errorMsg);
        // If dirPath is invalid, use userData as fallback
        const userDataPath = app.getPath('userData');
        if (!fs.existsSync(userDataPath)) {
          fs.mkdirSync(userDataPath, { recursive: true });
        }
        return { success: true, created: false, path: userDataPath, warning: 'Invalid path provided, using userData' };
      }

      // Check if path is inside app.asar (read-only) and redirect to userData
      let safePath = dirPath;
      const appPath = app.getAppPath();
      const userDataPath = app.getPath('userData');
      
      // If path contains app.asar or is inside the app directory, redirect to userData
      if (dirPath.includes('app.asar') || (typeof dirPath === 'string' && dirPath.startsWith(appPath))) {
        // Extract the relative path and use it in userData
        const relativePath = dirPath.replace(/.*[\\/](?:app\.asar[\\/])?/, '');
        safePath = path.join(userDataPath, relativePath);
        logToFile(`[MAIN] Redirected path from ${dirPath} to ${safePath}`);
      }
      
      // Normalize path separators
      safePath = path.normalize(safePath);
      
      if (!fs.existsSync(safePath)) {
        fs.mkdirSync(safePath, { recursive: true });
        logToFile(`[MAIN] Created directory: ${safePath}`);
        return { success: true, created: true, path: safePath };
      }
      return { success: true, created: false, path: safePath };
    } catch (error) {
      console.error('Error ensuring directory exists:', error);
      logToFile(`[MAIN] Error ensuring directory: ${error.message}`);
      // Return error instead of throwing to prevent crashes
      return { success: false, error: error.message, path: null };
    }
  });

  // Security Analyzer (comprehensive defensive analysis) - register early, before app.whenReady
  console.log('[SECURITY-ANALYZER] Registering securityAnalysis:start handler...');
  ipcMain.handle('securityAnalysis:start', async (event, payload) => {
    console.log('[SECURITY-ANALYZER] Handler called with payload:', payload);
    try {
      const { url, credentials, options } = payload
      const securityAnalyzerModule = require(path.join(__dirname, '..', 'scanners', 'security-analyzer.js'))
      const outDir = path.join(process.cwd(), 'temp-scans', `security-analysis-${Date.now()}`)
      fs.mkdirSync(outDir, { recursive: true })
      
      // Launch target site in default browser for transparency
      try {
        const safeUrl = (() => {
          try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`)
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
          } catch {}
          return null
        })()
        if (safeUrl) shell.openExternal(safeUrl)
      } catch {}
      
      const scanOptions = {
        outputDir: outDir,
        onProgress: (update) => event.sender.send('securityAnalysis:progress', update),
        ...options
      }
      
      const result = await securityAnalyzerModule.runSecurityAnalysis(url, { ...scanOptions, credentials })
      event.sender.send('securityAnalysis:complete', { success: true, result })
      return { success: true }
    } catch (e) {
      event.sender.send('securityAnalysis:complete', { error: e?.message || String(e) })
      return { error: e?.message || String(e) }
    }
  })

  // Malware & Defacement orchestrated scan (comprehensive with real-time streaming)
  console.log('[MALDEF] ===== REGISTERING HANDLER =====')
  
  // Pre-load orchestrators to catch errors early
  let comprehensiveOrchestrator = null
  let oldOrchestrator = null
  
  // Track current maldef scan for cancellation
  let currentMaldefScan = null
  let maldefScanAbortController = null
  
  try {
    const orchestratorPath = path.join(__dirname, '..', 'maldef', 'comprehensiveOrchestrator.js')
    console.log('[MALDEF] Checking comprehensive orchestrator at:', orchestratorPath)
    if (fs.existsSync(orchestratorPath)) {
      try {
        console.log('[MALDEF] Attempting to pre-load comprehensive orchestrator...')
        comprehensiveOrchestrator = require(orchestratorPath)
        console.log('[MALDEF] ✓ Comprehensive orchestrator pre-loaded successfully')
      } catch (e) {
        console.error('[MALDEF] ✗ Failed to pre-load comprehensive orchestrator')
        console.error('[MALDEF] Error:', e.message)
        console.error('[MALDEF] Stack:', e.stack)
      }
    } else {
      console.log('[MALDEF] Comprehensive orchestrator file not found at:', orchestratorPath)
    }
  } catch (e) {
    console.error('[MALDEF] Error checking comprehensive orchestrator:', e.message)
  }
  
  try {
    const oldOrchestratorPath = path.join(__dirname, '..', 'maldef', 'orchestrator.js')
    console.log('[MALDEF] Checking old orchestrator at:', oldOrchestratorPath)
    if (fs.existsSync(oldOrchestratorPath)) {
      try {
        console.log('[MALDEF] Attempting to pre-load old orchestrator...')
        oldOrchestrator = require(oldOrchestratorPath)
        console.log('[MALDEF] ✓ Old orchestrator pre-loaded successfully')
      } catch (e) {
        console.error('[MALDEF] ✗ Failed to pre-load old orchestrator')
        console.error('[MALDEF] Error:', e.message)
      }
    } else {
      console.log('[MALDEF] Old orchestrator file not found at:', oldOrchestratorPath)
    }
  } catch (e) {
    console.error('[MALDEF] Error checking old orchestrator:', e.message)
  }
  
  // Register handler - this MUST succeed even if pre-loading failed
  // Malware & Defacement Tools Checker
  ipcMain.handle('maldef:checkTools', async (event) => {
    try {
      // Try multiple path resolutions
      let toolInstaller
      try {
        toolInstaller = require(path.join(__dirname, '..', 'maldef', 'toolInstaller'))
      } catch (e1) {
        try {
          toolInstaller = require(path.join(process.cwd(), 'src', 'maldef', 'toolInstaller'))
        } catch (e2) {
          toolInstaller = require('../maldef/toolInstaller')
        }
      }
      const { checkAllTools } = toolInstaller
      const distro = 'kali-linux'
      
      const result = await checkAllTools(distro, (update) => {
        event.sender.send('maldef:toolsProgress', update)
      })
      
      return {
        success: true,
        allInstalled: result.allInstalled,
        missingTools: result.missingTools,
        toolStatus: result.toolStatus
      }
    } catch (e) {
      console.error('[MALDEF] Failed to check tools:', e)
      return {
        success: false,
        error: e.message,
        allInstalled: false,
        missingTools: [],
        toolStatus: {}
      }
    }
  })

  // Malware & Defacement Tools Installer
  ipcMain.handle('maldef:installTools', async (event, password) => {
    try {
      // Try multiple path resolutions
      let toolInstaller
      try {
        toolInstaller = require(path.join(__dirname, '..', 'maldef', 'toolInstaller'))
      } catch (e1) {
        try {
          toolInstaller = require(path.join(process.cwd(), 'src', 'maldef', 'toolInstaller'))
        } catch (e2) {
          toolInstaller = require('../maldef/toolInstaller')
        }
      }
      const { installAllMissingTools } = toolInstaller
      const distro = 'kali-linux'
      
      const result = await installAllMissingTools(distro, password, (update) => {
        event.sender.send('maldef:toolsProgress', update)
      })
      
      return {
        success: result.success,
        installed: result.installed,
        failed: result.failed,
        stdout: result.stdout,
        stderr: result.stderr
      }
    } catch (e) {
      console.error('[MALDEF] Failed to install tools:', e)
      return {
        success: false,
        error: e.message,
        installed: [],
        failed: []
      }
    }
  })

  try {
    console.log('[MALDEF] Registering ipcMain.handle("maldef:start")...')
    ipcMain.handle('maldef:start', async (event, url, options = {}) => {
    console.log('[MALDEF] ===== HANDLER CALLED =====')
    console.log('[MALDEF] Handler called with URL:', url)
    console.log('[MALDEF] Options:', JSON.stringify(options))
    
    // Check if scan is already running
    if (currentMaldefScan) {
      return { error: 'Scan already running' }
    }
    
    // Create abort controller for this scan
    maldefScanAbortController = new AbortController()
    const abortSignal = maldefScanAbortController.signal
    
    try {
      let runScan = null
      let orchestratorType = 'unknown'
      
      // Try to use pre-loaded orchestrators first
      if (comprehensiveOrchestrator && comprehensiveOrchestrator.runComprehensiveScan) {
        runScan = comprehensiveOrchestrator.runComprehensiveScan
        orchestratorType = 'comprehensive (pre-loaded)'
        console.log('[MALDEF] Using comprehensive orchestrator (pre-loaded)')
      } else if (oldOrchestrator && oldOrchestrator.runMaldefScan) {
        runScan = oldOrchestrator.runMaldefScan
        orchestratorType = 'old (pre-loaded)'
        console.log('[MALDEF] Using old orchestrator as fallback (pre-loaded)')
      } else {
        // Try to load on-demand as last resort
        console.log('[MALDEF] No pre-loaded orchestrators, trying on-demand load...')
        const orchestratorPath = path.join(__dirname, '..', 'maldef', 'comprehensiveOrchestrator.js')
        const oldOrchestratorPath = path.join(__dirname, '..', 'maldef', 'orchestrator.js')
        
        if (fs.existsSync(orchestratorPath)) {
          try {
            console.log('[MALDEF] Attempting to load comprehensive orchestrator from:', orchestratorPath)
            const { runComprehensiveScan } = require(orchestratorPath)
            runScan = runComprehensiveScan
            orchestratorType = 'comprehensive (on-demand)'
            console.log('[MALDEF] Successfully loaded comprehensive orchestrator on-demand')
          } catch (e) {
            console.error('[MALDEF] Failed to load comprehensive orchestrator on-demand')
            console.error('[MALDEF] Error:', e.message)
            console.error('[MALDEF] Stack:', e.stack)
            
            if (fs.existsSync(oldOrchestratorPath)) {
              try {
                console.log('[MALDEF] Attempting to load old orchestrator from:', oldOrchestratorPath)
                const { runMaldefScan } = require(oldOrchestratorPath)
                runScan = runMaldefScan
                orchestratorType = 'old (on-demand)'
                console.log('[MALDEF] Successfully loaded old orchestrator on-demand')
              } catch (e2) {
                console.error('[MALDEF] Failed to load old orchestrator on-demand')
                console.error('[MALDEF] Error:', e2.message)
                throw new Error(`Failed to load any orchestrator. Comprehensive error: ${e.message}. Old error: ${e2.message}`)
              }
            } else {
              throw new Error(`Comprehensive orchestrator failed to load: ${e.message}. Old orchestrator file not found at ${oldOrchestratorPath}`)
            }
          }
        } else if (fs.existsSync(oldOrchestratorPath)) {
          try {
            console.log('[MALDEF] Loading old orchestrator from:', oldOrchestratorPath)
            const { runMaldefScan } = require(oldOrchestratorPath)
            runScan = runMaldefScan
            orchestratorType = 'old (on-demand)'
            console.log('[MALDEF] Successfully loaded old orchestrator on-demand')
          } catch (e) {
            console.error('[MALDEF] Failed to load old orchestrator')
            console.error('[MALDEF] Error:', e.message)
            throw new Error(`Failed to load old orchestrator: ${e.message}`)
          }
        } else {
          throw new Error(`No orchestrator files found. Checked: ${orchestratorPath} and ${oldOrchestratorPath}`)
        }
      }
      
      if (!runScan) {
        throw new Error('Failed to get a valid scan function')
      }
      
      console.log('[MALDEF] Using orchestrator type:', orchestratorType)
      
      const outRoot = path.join(process.cwd(), 'temp-scans')
      
      // Real-time progress streaming with console output
      // Build options compatible with both orchestrators
      const scanOptions = {
        outRoot,
        onProgress: (update) => {
          // Send real-time console output to frontend
          // All stdout/stderr from scanners is streamed here
          event.sender.send('maldef:progress', {
            ...update,
            // Include raw console output for terminal display
            console: update.raw || update.message,
            timestamp: new Date().toISOString()
          })
        }
      }
      
      // Add comprehensive orchestrator-specific options if using new orchestrator
      const isComprehensiveOrchestrator = comprehensiveOrchestrator && comprehensiveOrchestrator.runComprehensiveScan
      if (isComprehensiveOrchestrator || (runScan && runScan.name === 'runComprehensiveScan')) {
        scanOptions.distro = options.distro || 'kali-linux'
        // Simplified 3-step scan: Malware Detection, Defacement Detection, Report Generation
        scanOptions.scanTypes = options.scanTypes || {
          malware: true,
          defacement: true
        }
        // Disable auto-installation during scan - tools should be installed manually from Settings
        // Force disable to prevent any installation during scanning
        scanOptions.autoInstallTools = false
        scanOptions.updateClamav = false
        // Explicitly remove any installation-related options
        delete scanOptions.checkTools
        delete scanOptions.installTools
      } else {
        // Old orchestrator options
        scanOptions.maxDepth = options.maxDepth || 1
        scanOptions.distro = options.distro || 'kali-linux'
      }
      
      // Store scan reference
      currentMaldefScan = { url, event, startTime: Date.now() }
      
      // Check for abort signal before starting scan
      if (abortSignal.aborted) {
        throw new Error('Scan was cancelled before starting')
      }
      
      const report = await runScan(url, scanOptions)
      
      // Check if scan was aborted
      if (abortSignal.aborted) {
        event.sender.send('maldef:progress', { 
          stage: 'aborted', 
          message: 'Scan was cancelled',
          console: 'Scan was cancelled by user',
          timestamp: new Date().toISOString()
        })
        event.sender.send('maldef:done', { aborted: true })
        return { aborted: true }
      }
      
      // Send report to UI - ensure it includes all necessary data
      const reportData = {
        ...report,
        reportFile: report.reportFile || report.report?.reportFile,
        reportPdfPath: report.reportFile || report.report?.reportFile,
        reportHtmlPath: report.reportFile || report.report?.reportFile
      }
      event.sender.send('maldef:done', reportData)
      return { ok: true, reportFile: report.reportFile || report.report?.reportFile }
    } catch (e) {
      // Don't send error if scan was aborted
      if (abortSignal.aborted) {
        event.sender.send('maldef:progress', { 
          stage: 'aborted', 
          message: 'Scan was cancelled',
          console: 'Scan was cancelled by user',
          timestamp: new Date().toISOString()
        })
        event.sender.send('maldef:done', { aborted: true })
        return { aborted: true }
      }
      
      event.sender.send('maldef:progress', { 
        stage: 'error', 
        message: e?.message || String(e),
        console: `ERROR: ${e?.message || String(e)}`,
        timestamp: new Date().toISOString()
      })
      event.sender.send('maldef:done', null)
      return { error: e?.message || String(e) }
    } finally {
      // Clear scan reference
      currentMaldefScan = null
      maldefScanAbortController = null
    }
    })
    
    // Register cancel handler
    ipcMain.handle('maldef:cancel', async (event) => {
      console.log('[MALDEF] Cancel requested')
      
      if (!currentMaldefScan && !maldefScanAbortController) {
        return { error: 'No scan running' }
      }
      
      try {
        // Abort the scan
        if (maldefScanAbortController) {
          maldefScanAbortController.abort()
        }
        
        // Send abort message to UI
        if (currentMaldefScan && currentMaldefScan.event) {
          currentMaldefScan.event.sender.send('maldef:progress', {
            stage: 'aborting',
            message: 'Cancelling scan...',
            console: '⚠️ [ABORT] Stopping scan...',
            timestamp: new Date().toISOString()
          })
        }
        
        // Kill any running processes in WSL
        const { exec } = require('child_process')
        const { promisify } = require('util')
        const execAsync = promisify(exec)
        
        if (process.platform === 'win32') {
          try {
            // Kill scanner processes
            await execAsync(`wsl -- bash -c "pkill -f 'nikto\\|wapiti\\|wpscan\\|clamav\\|yara\\|rkhunter\\|chkrootkit\\|lynis' || true"`, { timeout: 3000 })
            await execAsync(`wsl -- bash -c "pkill -9 -f 'nikto\\|wapiti\\|wpscan\\|clamav\\|yara\\|rkhunter\\|chkrootkit\\|lynis' || true"`, { timeout: 3000 })
          } catch (e) {
            console.log('[MALDEF] Some cleanup commands failed:', e.message)
          }
        }
        
        // Send completion message
        if (currentMaldefScan && currentMaldefScan.event) {
          currentMaldefScan.event.sender.send('maldef:progress', {
            stage: 'aborted',
            message: 'Scan cancelled',
            console: 'Scan was cancelled by user',
            timestamp: new Date().toISOString()
          })
          currentMaldefScan.event.sender.send('maldef:done', { aborted: true })
        }
        
        // Clear references
        currentMaldefScan = null
        maldefScanAbortController = null
        
        console.log('[MALDEF] Cancel completed')
        return { success: true }
      } catch (error) {
        console.error('[MALDEF] Error during cancel:', error)
        currentMaldefScan = null
        maldefScanAbortController = null
        return { success: false, error: error.message }
      }
    })
    console.log('[MALDEF] ✓ Handler registered successfully!')
  } catch (e) {
    console.error('[MALDEF] ✗ CRITICAL: Failed to register handler!')
    console.error('[MALDEF] Error:', e.message)
    console.error('[MALDEF] Stack:', e.stack)
    // Still try to register a minimal handler to prevent "No handler registered" error
    ipcMain.handle('maldef:start', async (event, url, options = {}) => {
      return { error: `Handler registration failed: ${e.message}` }
    })
  }
  
  // Verify handler registration
  console.log('[MALDEF] Handler registration complete. Verifying...')
  console.log('[MALDEF] Handler should be registered now. Check console for errors above.')

app.whenReady().then(async () => {
  // Initialize Admin Cyberix path on startup
  try {
    getAdminCyberixPath();
    console.log('[MAIN] Admin Cyberix path initialized');
    logToFile('[MAIN] Admin Cyberix path initialized');
  } catch (error) {
    console.error('[MAIN] Failed to initialize Admin path:', error);
    logToFile(`[MAIN] Failed to initialize Admin path: ${error.message}`);
  }
  
  console.log('📱 [MAIN] app.whenReady() - Window created, registering window-dependent handlers...');
  logToFile('📱 [MAIN] app.whenReady() - Starting application...');
  const win = await createMainWindow();
  mainWindowInstance = win;
  logToFile('📱 [MAIN] Main window created successfully');

  // Auto-check and install Kali Linux if missing on Windows
  if (process.platform === 'win32') {
    setTimeout(async () => {
      try {
        console.log('🔍 [STARTUP] Checking for Kali Linux...');
        const hasWsl = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-l', '-q'], { encoding: 'utf8' }).status === 0;
        
        if (hasWsl) {
          const hasKali = checkKaliInstalled();
          if (!hasKali) {
            console.log('⚠️ [STARTUP] Kali Linux not detected. Starting auto-installation...');
            
            // Show notification to user
            const { dialog } = require('electron');
            const installKali = await dialog.showMessageBox(win, {
              type: 'question',
              title: 'Kali Linux Auto-Install',
              message: 'Kali Linux is not installed in WSL.',
              detail: 'Kali Linux provides the best security tools for penetration testing. Would you like to install it now? This will download and install Kali Linux in WSL automatically.',
              buttons: ['Install Kali Now', 'Install Later'],
              defaultId: 0,
              cancelId: 1
            });
            
            if (installKali.response === 0) {
              console.log('🚀 [STARTUP] User chose to install Kali Linux now');
              // Create a mock event object for progress updates
              const mockEvent = { sender: win.webContents };
              const result = await installKaliLinux(mockEvent);
              if (result) {
                console.log('✅ [STARTUP] Kali Linux installed successfully');
                // Show success message
                dialog.showMessageBox(win, {
                  type: 'info',
                  title: 'Installation Complete',
                  message: 'Kali Linux has been installed successfully!',
                  detail: 'You may need to restart WSL or the application for changes to take effect.'
                });
              } else {
                console.log('❌ [STARTUP] Kali Linux installation failed');
                dialog.showMessageBox(win, {
                  type: 'error',
                  title: 'Installation Failed',
                  message: 'Kali Linux installation failed.',
                  detail: 'Please try installing manually using: wsl --install -d kali-linux'
                });
              }
            } else {
              console.log('ℹ️ [STARTUP] User chose to install Kali Linux later');
            }
          } else {
            console.log('✅ [STARTUP] Kali Linux is already installed');
          }
        } else {
          console.log('⚠️ [STARTUP] WSL is not available');
        }
      } catch (error) {
        console.error('❌ [STARTUP] Error checking/installing Kali:', error);
      }
    }, 2000); // Wait 2 seconds after app ready for better UX
  }

  // Setup IPC handlers (moved here to access win variable)
  ipcMain.handle('setup:selectDirectory', async () => {
    try {
      console.log('setup:selectDirectory handler called');
      
      if (!win) {
        console.error('Main window not available');
        throw new Error('Main window not available');
      }

      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Installation Directory',
        defaultPath: 'C:\\Program Files'
      });
      
      console.log('Dialog result:', result);
      
      if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0];
        console.log('Selected directory:', selectedPath);
        return selectedPath; // Return the first path as a string, not the array
      }
      
      console.log('No directory selected or dialog cancelled');
      return null;
    } catch (error) {
      console.error('Error selecting directory:', error);
      throw error;
    }
  });

  ipcMain.handle('setup:createDirectory', async (event, dirPath) => {
    try {
      console.log('setup:createDirectory handler called with path:', dirPath);
      
      // Create the main directory if it doesn't exist
      if (!fs.existsSync(dirPath)) {
        console.log('Creating main directory:', dirPath);
        fs.mkdirSync(dirPath, { recursive: true });
      } else {
        console.log('Main directory already exists:', dirPath);
      }
      
      // Create the cyberix_system_logs subdirectory
      const logsPath = path.join(dirPath, 'cyberix_system_logs');
      if (!fs.existsSync(logsPath)) {
        console.log('Creating logs directory:', logsPath);
        fs.mkdirSync(logsPath, { recursive: true });
      } else {
        console.log('Logs directory already exists:', logsPath);
      }
      
      console.log('Directory creation successful');
      return { success: true, path: logsPath };
    } catch (error) {
      console.error('Error creating directory:', error);
      throw error;
    }
  });

  ipcMain.handle('setup:checkComplete', async () => {
    try {
      // Check if setup has been completed by looking for a setup config file
      const setupConfigPath = path.join(app.getPath('userData'), 'setup-config.json');
      if (fs.existsSync(setupConfigPath)) {
        const config = JSON.parse(fs.readFileSync(setupConfigPath, 'utf8'));
        return { completed: true, installPath: config.installPath };
      }
      return { completed: false };
    } catch (error) {
      console.error('Error checking setup status:', error);
      return { completed: false };
    }
  });

  ipcMain.handle('setup:markComplete', async (event, installPath) => {
    try {
      // Save setup completion status
      const setupConfigPath = path.join(app.getPath('userData'), 'setup-config.json');
      const config = {
        completed: true,
        installPath: installPath,
        completedAt: new Date().toISOString()
      };
      fs.writeFileSync(setupConfigPath, JSON.stringify(config, null, 2));
      return { success: true };
    } catch (error) {
      console.error('Error marking setup complete:', error);
      throw error;
    }
  });

  // File system operations for logging (already registered before app.whenReady())
  // These handlers are now registered earlier to be available when scanLogger initializes

  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, data, 'utf8');
      return { success: true };
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('File does not exist');
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('Error reading file:', error);
      throw error;
    }
  });

  ipcMain.handle('fs:listFiles', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }
      return fs.readdirSync(dirPath);
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  });

  // Installation Log Management IPC Handlers
  ipcMain.handle('setup:initializeInstallationLogs', async (event, customPath = null) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      const result = await installationLogManager.initialize(customPath);
      logToFile(`[SETUP] Installation logs initialized: ${result.path || 'failed'}`);
      return result;
    } catch (error) {
      logToFile(`[SETUP] Error initializing installation logs: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('setup:logStep', async (event, stepNumber, description, status, details = '') => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      
      // Extract user-picked path from details if Step 5
      let userPickedPath = null;
      if (stepNumber === 5 && details && details.includes('Path:')) {
        userPickedPath = details.replace('Path:', '').trim();
      }
      
      // Also try to get from system path reference file
      if (!userPickedPath && stepNumber === 5) {
        try {
          const userDataPath = app.getPath('userData');
          const referenceFile = path.join(userDataPath, 'step-system-path.json');
          if (fs.existsSync(referenceFile)) {
            const data = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
            userPickedPath = data.systemPath;
          }
        } catch (e) {
          // Ignore errors
        }
      }
      
      const result = await installationLogManager.logStep(stepNumber, description, status, details, userPickedPath);
      logToFile(`[SETUP] Logged step ${stepNumber}: ${description} - ${status}`);
      if (userPickedPath) {
        logToFile(`[SETUP] User picked path saved: ${userPickedPath}`);
      }
      return result;
    } catch (error) {
      logToFile(`[SETUP] Error logging step: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('setup:readInstallationLogs', async (event) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      return await installationLogManager.readLogs();
    } catch (error) {
      logToFile(`[SETUP] Error reading installation logs: ${error.message}`);
      return { success: false, error: error.message, logs: '' };
    }
  });

  ipcMain.handle('setup:getLastCompletedStep', async (event) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      return await installationLogManager.getLastCompletedStep();
    } catch (error) {
      logToFile(`[SETUP] Error getting last step: ${error.message}`);
      return { success: false, error: error.message, stepNumber: 0 };
    }
  });

  ipcMain.handle('setup:checkInstallationLogFile', async (event) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      const adminPath = getAdminCyberixPath(); // Use the new helper function
      
      let exists = false;
      let foundPath = null;
      
      // PRIORITY 1: Check in user selected path FIRST (if user picked a custom path)
      try {
        const referenceFile = path.join(adminPath, 'step-system-path.json');
        
        if (fs.existsSync(referenceFile)) {
          const data = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
          const systemPath = data.systemPath;
          
          if (systemPath && typeof systemPath === 'string') {
            // Check if user-picked path exists and has files
            if (fs.existsSync(systemPath)) {
              // Check in user selected path: [User Path]/Cyberix-Logs/installation_process/installation-process.log (NEW STRUCTURE)
              const userLogPath = path.join(systemPath, 'Cyberix-Logs', 'installation_process', 'installation-process.log');
              
              if (fs.existsSync(userLogPath)) {
                exists = true;
                foundPath = userLogPath;
                logToFile(`[SETUP] Installation log found in user selected path (PRIORITY 1): ${foundPath}`);
                return { success: true, exists: true, path: foundPath, location: 'user-selected' };
              }
              
              // Also check old location for backward compatibility: [User Path]/Cyberix-Logs/Cyberix Installation Process Logs/installation-process.log
              const oldUserLogPath = path.join(systemPath, 'Cyberix-Logs', 'Cyberix Installation Process Logs', 'installation-process.log');
              if (fs.existsSync(oldUserLogPath)) {
                exists = true;
                foundPath = oldUserLogPath;
                logToFile(`[SETUP] Installation log found in old user selected path (migrating): ${foundPath}`);
                return { success: true, exists: true, path: foundPath, location: 'user-selected-old' };
              }
            } else {
              logToFile(`[SETUP] User-picked path does not exist: ${systemPath}, checking backup path`);
            }
          }
        }
      } catch (err) {
        logToFile(`[SETUP] Error checking user selected path: ${err.message}`);
      }
      
      // PRIORITY 2: Check in Admin backup path: C:\Users\Admin\AppData\Roaming\Cyberix\Cyberix-Logs\installation_process\installation-process.log
      const newDefaultPath = path.join(adminPath, 'Cyberix-Logs', 'installation_process');
      const newDefaultLogFile = path.join(newDefaultPath, 'installation-process.log');
      
      if (fs.existsSync(newDefaultLogFile)) {
        exists = true;
        foundPath = newDefaultLogFile;
        logToFile(`[SETUP] Installation log found in NEW default path (PRIORITY 2 - backup): ${foundPath}`);
        return { success: true, exists: true, path: foundPath, location: 'default' };
      }
      
      // Check OLD default path for backward compatibility
      const oldDefaultPath = installationLogManager.getDefaultInstallationPath();
      const oldDefaultLogFile = path.join(oldDefaultPath, 'installation-process.log');
      if (fs.existsSync(oldDefaultLogFile)) {
        exists = true;
        foundPath = oldDefaultLogFile;
        logToFile(`[SETUP] Installation log found in OLD default path: ${foundPath}`);
        return { success: true, exists: true, path: foundPath, location: 'default-old' };
      }
      
      logToFile(`[SETUP] Installation log not found in either path`);
      return { success: true, exists: false, path: null, location: null };
    } catch (error) {
      logToFile(`[SETUP] Error checking installation log file: ${error.message}`);
      return { success: false, error: error.message, exists: false, path: null, location: null };
    }
  });

  ipcMain.handle('setup:moveInstallationLogs', async (event, newPath) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      const result = await installationLogManager.moveLogsToPath(newPath);
      logToFile(`[SETUP] Moved installation logs to: ${newPath}`);
      return result;
    } catch (error) {
      logToFile(`[SETUP] Error moving logs: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('setup:createSystemLogsFolder', async (event, basePath) => {
    try {
      const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
      const result = await installationLogManager.createSystemLogsFolder(basePath);
      logToFile(`[SETUP] Created system logs folder: ${result.path || 'failed'}`);
      return result;
    } catch (error) {
      logToFile(`[SETUP] Error creating system logs folder: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // Check if any files exist in C:\Users\Admin\AppData\Roaming\Cyberix
  ipcMain.handle('setup:checkCyberixFolderExists', async (event) => {
    try {
      const userDataPath = getAdminCyberixPath(); // Use the new helper function
      logToFile(`[SETUP] Checking if Cyberix folder exists: ${userDataPath}`);
      
      if (!fs.existsSync(userDataPath)) {
        logToFile(`[SETUP] Cyberix folder does not exist`);
        return { success: true, exists: false, path: userDataPath };
      }
      
      // Check if folder has any files or subdirectories
      const files = fs.readdirSync(userDataPath);
      const hasFiles = files.length > 0;
      
      logToFile(`[SETUP] Cyberix folder exists: ${hasFiles}, files count: ${files.length}`);
      return { success: true, exists: hasFiles, path: userDataPath, fileCount: files.length };
    } catch (error) {
      logToFile(`[SETUP] Error checking Cyberix folder: ${error.message}`);
      return { success: false, error: error.message, exists: false };
    }
  });

  // Sync files to both default and user-picked locations
  ipcMain.handle('setup:syncFilesToBothLocations', async (event, userPickedPath) => {
    try {
      const adminPath = getAdminCyberixPath(); // Use the new helper function
      const defaultPath = path.join(adminPath, 'Cyberix-Logs', 'installation_process');
      const defaultLogFile = path.join(defaultPath, 'installation-process.log');
      
      logToFile(`[SETUP] Syncing files to both locations`);
      logToFile(`[SETUP] Admin backup path: ${defaultPath}`);
      logToFile(`[SETUP] User picked path: ${userPickedPath || 'none'}`);
      
      // PRIORITY 1: Get installation log content from user-picked path if it exists
      let logContent = '';
      if (userPickedPath) {
        const userLogPath = path.join(userPickedPath, 'Cyberix-Logs', 'installation_process', 'installation-process.log');
        if (fs.existsSync(userLogPath)) {
          logContent = fs.readFileSync(userLogPath, 'utf8');
          logToFile(`[SETUP] Read log from user path (PRIORITY 1): ${userLogPath}`);
          
          // Ensure user-picked path has the path saved in the log
          if (!logContent.includes('User Selected Path:')) {
            logContent += `User Selected Path: ${userPickedPath}\n`;
            fs.writeFileSync(userLogPath, logContent, 'utf8');
            logToFile(`[SETUP] Added user path to log file: ${userLogPath}`);
          }
        }
      }
      
      // If no content from user path, try to read from old default location
      if (!logContent) {
        const installationLogManager = require(path.join(__dirname, '..', 'utils', 'setup', 'installationLogManager'));
        const oldDefaultPath = installationLogManager.getDefaultInstallationPath();
        const oldDefaultLogFile = path.join(oldDefaultPath, 'installation-process.log');
        if (fs.existsSync(oldDefaultLogFile)) {
          logContent = fs.readFileSync(oldDefaultLogFile, 'utf8');
          logToFile(`[SETUP] Read log from old default path: ${oldDefaultLogFile}`);
        }
      }
      
      // PRIORITY 2: Write to backup location (Admin path)
      // Ensure default path exists
      if (!fs.existsSync(defaultPath)) {
        fs.mkdirSync(defaultPath, { recursive: true });
      }
      
      if (logContent) {
        // Ensure backup location also has the path saved
        if (!logContent.includes('User Selected Path:') && userPickedPath) {
          logContent += `User Selected Path: ${userPickedPath}\n`;
        }
        fs.writeFileSync(defaultLogFile, logContent, 'utf8');
        logToFile(`[SETUP] Synced log to backup path (PRIORITY 2): ${defaultLogFile}`);
      }
      
      // PRIORITY 1: If user picked a different path, ensure it's synced there too
      if (userPickedPath && userPickedPath !== adminPath) {
        const userLogPath = path.join(userPickedPath, 'Cyberix-Logs', 'installation_process', 'installation-process.log');
        const userLogDir = path.dirname(userLogPath);
        
        if (!fs.existsSync(userLogDir)) {
          fs.mkdirSync(userLogDir, { recursive: true });
        }
        
        if (logContent) {
          // Ensure user path has the path saved
          if (!logContent.includes('User Selected Path:')) {
            logContent += `User Selected Path: ${userPickedPath}\n`;
          }
          fs.writeFileSync(userLogPath, logContent, 'utf8');
          logToFile(`[SETUP] Synced log to user path (PRIORITY 1): ${userLogPath}`);
        }
      }
      
      return { success: true, defaultPath, userPath: userPickedPath };
    } catch (error) {
      logToFile(`[SETUP] Error syncing files: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  // Get system path selected by user during setup
  ipcMain.handle('setup:getSystemPath', async (event) => {
    try {
      const userDataPath = app.getPath('userData');
      const referenceFile = path.join(userDataPath, 'step-system-path.json');
      
      if (fs.existsSync(referenceFile)) {
        const data = JSON.parse(fs.readFileSync(referenceFile, 'utf8'));
        const systemPath = data.systemPath;
        
        if (systemPath && typeof systemPath === 'string') {
          logToFile(`[SETUP] Retrieved system path: ${systemPath}`);
          return { success: true, path: systemPath };
        }
      }
      
      logToFile(`[SETUP] System path not found, returning null`);
      return { success: false, path: null };
    } catch (error) {
      logToFile(`[SETUP] Error getting system path: ${error.message}`);
      return { success: false, error: error.message, path: null };
    }
  });

  // WSL Cyberix folder setup handlers
  ipcMain.handle('wsl:setupCyberixFolder', async (event) => {
    try {
      logToFile('[WSL] Setting up Cyberix folder in /root/cyberix');
      
      // Create /root/cyberix folder - use wslHelper (no wsl prefix needed)
      const result = await wslHelper.runWSLAsRoot('mkdir -p /root/cyberix');
      
      if (result.success) {
        logToFile('[WSL] Cyberix folder created successfully');
        return { success: true, message: 'Cyberix folder created' };
      } else {
        logToFile(`[WSL] Folder creation failed: ${result.error || 'Unknown error'}`);
        // Return success anyway so setup can continue (folder might already exist)
        return { success: true, message: 'Folder creation attempted (may already exist)', warning: result.error };
      }
    } catch (error) {
      logToFile(`[WSL] Error setting up Cyberix folder: ${error.message}`);
      console.error('Error setting up Cyberix folder:', error);
      // Return success with warning instead of throwing
      return { success: true, message: 'Folder setup attempted', warning: error.message };
    }
  });

  ipcMain.handle('wsl:cloneRepository', async (event, repoName) => {
    try {
      logToFile(`[WSL] Cloning repository: ${repoName}`);
      
      // Repository URLs
      const repos = {
        fluxploider: 'https://github.com/almandin/fuxploider.git', // Note: repo name is fuxploider but we call it fluxploider
        testssl: 'https://github.com/drwetter/testssl.sh.git'
      };

      const repoUrl = repos[repoName];
      if (!repoUrl) {
        return { success: false, message: `Unknown repository: ${repoName}`, warning: true };
      }

      // For fluxploider, the actual repo folder is 'fuxploider' but we want to clone it as 'fluxploider'
      const targetDir = `/root/cyberix/${repoName}`;
      const actualRepoName = repoName === 'fluxploider' ? 'fuxploider' : repoName;
      
      // Check if already cloned (check both possible names) - use wslHelper (no wsl prefix)
      const checkResult = await wslHelper.runWSLAsRoot(`(test -d ${targetDir} || test -d /root/cyberix/${actualRepoName}) && echo exists || echo notexists`);
      
      if (checkResult.success && checkResult.stdout.trim() === 'exists') {
        logToFile(`[WSL] Repository ${repoName} already exists, skipping clone`);
        return { success: true, message: `${repoName} already cloned`, skipped: true };
      }

      // Clone repository - use wslHelper (no wsl prefix)
      const cloneResult = await wslHelper.runWSLAsRoot(`cd /root/cyberix && git clone ${repoUrl} ${repoName}`);
      
      if (cloneResult.success) {
        logToFile(`[WSL] Repository ${repoName} cloned successfully`);
        return { success: true, message: `${repoName} cloned successfully` };
      } else {
        logToFile(`[WSL] Clone failed: ${cloneResult.error || 'Unknown error'}`);
        // Return success with warning so setup can continue
        return { success: true, message: `${repoName} clone attempted`, warning: cloneResult.error || 'Clone failed' };
      }
    } catch (error) {
      logToFile(`[WSL] Error cloning repository ${repoName}: ${error.message}`);
      console.error(`Error cloning repository ${repoName}:`, error);
      // Return success with warning instead of throwing
      return { success: true, message: `${repoName} clone attempted`, warning: error.message };
    }
  });

  ipcMain.handle('wsl:setupPythonVenv', async (event) => {
    try {
      logToFile('[WSL] Setting up Python virtual environment');
      
      const venvPath = '/root/cyberix/.venv';
      
      // Check if venv already exists - use wslHelper (no wsl prefix)
      const checkResult = await wslHelper.runWSLAsRoot(`test -d ${venvPath} && echo exists || echo notexists`);
      
      if (checkResult.success && checkResult.stdout.trim() === 'exists') {
        logToFile('[WSL] Python venv already exists, skipping creation');
        return { success: true, message: 'Python venv already exists', skipped: true };
      }

      // Create virtual environment - use wslHelper (no wsl prefix)
      const venvResult = await wslHelper.runWSLAsRoot('cd /root/cyberix && python3 -m venv .venv');
      
      if (!venvResult.success) {
        logToFile(`[WSL] Venv creation failed: ${venvResult.error || 'Unknown error'}`);
        // Continue anyway - venv might already exist or can be created later
        return { success: true, message: 'Python venv setup attempted', warning: venvResult.error || 'Venv creation failed' };
      }

      // Upgrade pip in venv - use wslHelper (no wsl prefix)
      const pipResult = await wslHelper.runWSLAsRoot('cd /root/cyberix && source .venv/bin/activate && pip3 install --upgrade pip');
      
      if (!pipResult.success) {
        logToFile(`[WSL] Pip upgrade failed (non-critical): ${pipResult.error || 'Unknown error'}`);
        // This is non-critical, continue anyway
      }
      
      logToFile('[WSL] Python virtual environment setup complete');
      return { success: true, message: 'Python venv setup complete' };
    } catch (error) {
      logToFile(`[WSL] Error setting up Python venv: ${error.message}`);
      console.error('Error setting up Python venv:', error);
      // Return success with warning instead of throwing
      return { success: true, message: 'Python venv setup attempted', warning: error.message };
    }
  });

  // IPC: expose OS helpers
  ipcMain.handle('os:getPlatform', async () => detectPlatform());
  ipcMain.handle('os:checkWsl', async () => {
    try { return await checkWslInstalled(); } catch { return false; }
  });
  
  // WSL distribution management
  ipcMain.handle('wsl:getDistro', async () => {
    try {
      return await wslHelper.getWSLDistro();
    } catch (error) {
      logToFile(`[WSL] Error getting distro: ${error.message}`);
      return 'kali-linux'; // Fallback
    }
  });
  
  ipcMain.handle('wsl:listDistributions', async () => {
    try {
      return await wslHelper.listDistributions();
    } catch (error) {
      logToFile(`[WSL] Error listing distributions: ${error.message}`);
      return { success: false, distributions: [] };
    }
  });
  
  ipcMain.handle('wsl:setDefaultDistro', async (event, distroName) => {
    try {
      logToFile(`[WSL] Setting default distribution to: ${distroName}`);
      const result = await wslHelper.setDefaultDistro(distroName);
      if (result.success) {
        logToFile(`[WSL] Default distribution set successfully`);
      } else {
        logToFile(`[WSL] Failed to set default distribution: ${result.error}`);
      }
      return result;
    } catch (error) {
      logToFile(`[WSL] Error setting default distro: ${error.message}`);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('os:installWsl', async (event) => {
    return await new Promise((resolve) => {
      installWsl(
        (line) => event.sender.send('os:wslInstallLog', line),
        (ok) => {
          event.sender.send('os:wslInstallDone', ok);
          resolve(ok);
        }
      );
    });
  });

  ipcMain.handle('os:installUbuntu', async (event) => {
    logToFile('[WSL] Starting Ubuntu installation...');
    return await new Promise((resolve) => {
      installUbuntu(
        (line) => {
          logToFile(`[WSL] Ubuntu install log: ${line}`);
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('os:ubuntuInstallLog', line);
          }
        },
        (ok) => {
          logToFile(`[WSL] Ubuntu installation completed with result: ${ok}`);
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('os:ubuntuInstallDone', ok);
          }
          resolve(ok);
        }
      );
    });
  });

  ipcMain.handle('os:verifyUbuntu', async () => {
    try {
      logToFile('[WSL] Starting Ubuntu verification...');
      const result = await verifyUbuntuInstalled();
      logToFile(`[WSL] Ubuntu verification result: ${result}`);
      return result;
    } catch (error) {
      logToFile(`[WSL] Error verifying Ubuntu: ${error.message}`);
      console.error('[WSL] Verification error:', error);
      return false;
    }
  });

  ipcMain.handle('os:installKaliLinux', async (event) => {
    logToFile('[WSL] Starting Kali Linux installation...');
    try {
      // The local installKaliLinux function handles progress updates via event.sender
      const result = await installKaliLinux(event);
      logToFile(`[WSL] Kali Linux installation completed with result: ${result}`);
      if (event?.sender && !event.sender.isDestroyed()) {
        event.sender.send('os:kaliInstallDone', result);
      }
      return result;
    } catch (error) {
      logToFile(`[WSL] Kali Linux installation error: ${error.message}`);
      if (event?.sender && !event.sender.isDestroyed()) {
        event.sender.send('os:kaliInstallDone', false);
      }
      return false;
    }
  });

  // Note: WSL handlers (wsl:install, wsl:createUser, wsl:validateCredentials) 
  // are registered BEFORE app.whenReady() at lines 608-841

  // Kali Linux management
  ipcMain.handle('kali:check', () => {
    return checkKaliInstalled();
  });

  ipcMain.handle('kali:install', async (event) => {
    console.log('🚀 [KALI-INSTALL-HANDLER] Starting Kali Linux installation via IPC...');
    
    // Update UI to show installation in progress
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('kali:installProgress', 'Starting Kali Linux installation...');
    }
    
    try {
      // Pass event to installKaliLinux so it can send progress updates
      const result = await installKaliLinux(event);
      
      if (result) {
        // Installation successful - update UI
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('kali:installComplete', true);
        }
        console.log('✅ [KALI-INSTALL-HANDLER] Kali Linux installation completed successfully');
      } else {
        // Installation failed - update UI
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send('kali:installComplete', false);
        }
        console.log('❌ [KALI-INSTALL-HANDLER] Kali Linux installation failed');
      }
      
      return result;
    } catch (error) {
      console.log('❌ [KALI-INSTALL-HANDLER] Kali Linux installation error:', error.message);
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('kali:installComplete', false);
      }
      return false;
    }
  });



  // Helper: install nmap in WSL if missing
  async function installNmapInWsl() {
    return new Promise((resolve) => {
      const child = spawn('C:\\Windows\\System32\\wsl.exe', ['sudo', 'apt', 'update'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (d) => output += d.toString());
      child.stderr.on('data', (d) => output += d.toString());
      child.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        const installChild = spawn('C:\\Windows\\System32\\wsl.exe', ['sudo', 'apt', 'install', '-y', 'nmap'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let installOutput = '';
        installChild.stdout.on('data', (d) => installOutput += d.toString());
        installChild.stderr.on('data', (d) => installOutput += d.toString());
        installChild.on('close', (installCode) => {
          resolve(installCode === 0);
        });
      });
    });
  }

  // Helper: install security tools in WSL Kali Linux
  async function installSecurityToolsInWsl() {
    return new Promise((resolve) => {
      // First update package lists
      const updateChild = spawn('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sudo', 'apt', 'update'], { stdio: ['ignore', 'pipe', 'pipe'] });
      updateChild.on('close', (updateCode) => {
        if (updateCode !== 0) {
          resolve(false);
          return;
        }

        // Install all security tools
        const installChild = spawn('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sudo', 'apt', 'install', '-y',
          'nmap', 'dnsutils', 'dnsrecon', 'dnsenum', 'nikto', 'sqlmap', 'gobuster'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        installChild.on('close', (installCode) => {
          resolve(installCode === 0);
        });
      });
    });
  }

  // Tool checking only (no installation) - FIXED to use rootless WSL
  async function checkRequiredToolsOnly(password) {
    console.log('🔧 [TOOL-CHECKER] Starting tool check (no installation)...');
    // Password not needed anymore - we use wsl -u root directly
    
    const requiredTools = [
      'jq','unzip','nmap','nikto','sqlmap','hydra','gobuster','dirb',
      'amass','john','medusa','mitmproxy','socat','fail2ban',
      'curl','wget','wapiti','pip3','geoiplookup','whatweb'
    ];
  
    const goTools = ['ffuf','nuclei','dalfox','go'];
    const allTools = [...requiredTools, ...goTools];
    
    // Use new wslHelper to check each tool individually (no broken bash loops)
    const status = {};
    const missingTools = [];
    
    for (const tool of allTools) {
      const installed = await wslHelper.checkTool(tool);
      status[tool] = installed;
      if (!installed) missingTools.push(tool);
    }
  
    const success = missingTools.length === 0;
    console.log('🔧 [TOOL-CHECKER] Missing tools:', missingTools);
  
    return {
      success,
      missingTools,
      toolStatus: status,
      totalChecked: allTools.length,
      installedCount: allTools.length - missingTools.length
    };
  }

  // Check and install tgpt
  async function checkAndInstallTgpt(password, event = null) {
    console.log('🔧 [TGPT-CHECKER] Starting tgpt check...');
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
  
    // Build a safe single-quoted bash script so we don't have to escape $ inside JS
    // The bash script loops through tools and prints either ✅ or ❌ lines
    const bashScript = `for tool in ${allTools.join(' ')}; do
      if command -v "$tool" >/dev/null 2>&1; then
        echo "✅ $tool is installed -> $(command -v $tool)"
      else
        echo "❌ $tool is NOT installed"
      fi
    done`;
  
    // Wrap the bash script in single quotes so node doesn't expand $tool etc.
    // Use -u root if you need root PATH, otherwise remove -u root
    const toolCheckCommand = `wsl -d kali-linux -u root -- bash -lc '${bashScript.replace(/'/g, "'\"'\"'")}'`;
  
    console.log('🔧 [TOOL-CHECKER] Running tool check command:', toolCheckCommand);
  
    let stdout = '';
    let stderr = '';
    try {
      const result = await execAsync(toolCheckCommand, { maxBuffer: 10 * 1024 * 1024 });
      stdout = result.stdout || '';
      stderr = result.stderr || '';
      console.log('🔧 [TOOL-CHECKER] Command finished without throwing.');
    } catch (execError) {
      // execAsync throws on non-zero exit code; still attempt to capture output
      stdout = execError.stdout || '';
      stderr = execError.stderr || '';
      console.log('🔧 [TOOL-CHECKER] Command threw an error. exitCode:', execError.code);
      console.log('🔧 [TOOL-CHECKER] execError.message:', execError.message);
      // We do NOT immediately throw — we want to parse any partial stdout for results
    }
  
    console.log('🔧 [TOOL-CHECKER] Raw stdout length:', stdout.length);
    console.log('🔧 [TOOL-CHECKER] Raw stderr length:', stderr.length);
    if (stderr) console.log('🔧 [TOOL-CHECKER] Raw stderr (first 1000 chars):', stderr.slice(0, 1000));
  
    // Parse output
    const missingTools = [];
    
    for (const tool of allTools) {
      const installed = await wslHelper.checkTool(tool);
      status[tool] = installed;
      if (!installed) missingTools.push(tool);
    }
  
    const success = missingTools.length === 0;
    console.log('🔧 [TOOL-CHECKER] Missing tools:', missingTools);
  
    return {
      success,
      missingTools,
      toolStatus: status,
      totalChecked: allTools.length,
      installedCount: allTools.length - missingTools.length,
      raw: { stdout, stderr }
    };
  }

  // Check and install tgpt
  async function checkAndInstallTgpt(password, event = null) {
    console.log('🔧 [TGPT-CHECKER] Starting tgpt check...');
    
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // Get the default WSL distribution (should be Ubuntu)
      let wslDistro = 'Ubuntu'; // Default to Ubuntu
      try {
        const distro = await wslHelper.getWSLDistro();
        if (distro) {
          wslDistro = distro;
          console.log(`🔧 [TGPT-CHECKER] Using WSL distribution: ${wslDistro}`);
        }
      } catch (error) {
        console.log('🔧 [TGPT-CHECKER] Could not get WSL distro, using default: Ubuntu');
      }
      
      // Check if tgpt is installed - use detected distribution instead of kali-linux
      const checkCommand = `wsl -d ${wslDistro} -u root -- bash -lc "command -v tgpt && echo 'tgpt is INSTALLED → '$(tgpt --version) || echo 'tgpt NOT installed'"`;
      
      console.log('🔧 [TGPT-CHECKER] Running check command...');
      let stdout = '';
      let stderr = '';
      
      try {
        const result = await execAsync(checkCommand, { maxBuffer: 10 * 1024 * 1024 });
        stdout = result.stdout || '';
        stderr = result.stderr || '';
      } catch (execError) {
        stdout = execError.stdout || '';
        stderr = execError.stderr || '';
      }

      console.log('🔧 [TGPT-CHECKER] Check output:', stdout);
      
      const isInstalled = stdout.includes('tgpt is INSTALLED');
      
      if (isInstalled) {
        console.log('✅ [TGPT-CHECKER] tgpt is already installed');
        return { installed: true, version: stdout.match(/tgpt is INSTALLED → (.+)/)?.[1] || 'unknown' };
      }

      // Install tgpt if not installed
      console.log('🔧 [TGPT-CHECKER] tgpt is not installed. Installing...');
      
      if (event) {
        event.sender.send('scan:progress', {
          stage: 'installing',
          message: 'Installing tgpt...'
        });
      }

      // Use detected distribution instead of kali-linux, and use root user directly (no sudo needed)
      const installCommand = `wsl -d ${wslDistro} -u root -- bash -lc "curl -sSL https://raw.githubusercontent.com/aandrew-me/tgpt/main/install | bash"`;
      
      console.log('🔧 [TGPT-CHECKER] Running install command...');
      try {
        const installResult = await execAsync(installCommand, { maxBuffer: 10 * 1024 * 1024 });
        console.log('✅ [TGPT-CHECKER] tgpt installation completed');
        console.log('🔧 [TGPT-CHECKER] Install output:', installResult.stdout);
        
        // Verify installation
        const verifyCommand = `wsl -d ${wslDistro} -u root -- bash -lc "command -v tgpt && echo 'tgpt is INSTALLED → '$(tgpt --version) || echo 'tgpt NOT installed'"`;
        const verifyResult = await execAsync(verifyCommand, { maxBuffer: 10 * 1024 * 1024 });
        const verified = verifyResult.stdout.includes('tgpt is INSTALLED');
        
        if (verified) {
          console.log('✅ [TGPT-CHECKER] tgpt verified as installed');
          return { installed: true, version: verifyResult.stdout.match(/tgpt is INSTALLED → (.+)/)?.[1] || 'unknown' };
        } else {
          console.log('⚠️ [TGPT-CHECKER] tgpt installation may have failed');
          return { installed: false, error: 'Installation completed but verification failed' };
        }
      } catch (installError) {
        console.log('❌ [TGPT-CHECKER] tgpt installation failed:', installError.message);
        return { installed: false, error: installError.message };
      }
    } catch (error) {
      console.log('❌ [TGPT-CHECKER] tgpt check failed:', error.message);
      return { installed: false, error: error.message };
    }
  }

  // Comprehensive tool checking and installation function
  async function checkAndInstallRequiredTools(password, event = null) {
    console.log('🔧 [TOOL-CHECKER] Starting comprehensive tool check and installation...');
    
    const requiredTools = [
      'jq', 'unzip', 'nmap', 'nikto', 'sqlmap', 'hydra', 'gobuster', 'dirb', 
      'amass', 'john', 'medusa', 'mitmproxy', 'socat', 'fail2ban', 
      'curl', 'wget', 'wapiti', 'sslscan', 'dnstwist', 'geoiplookup', 'whatweb'
    ];

    const goTools = [
      'ffuf', 'nuclei', 'dalfox', 'go'
    ];

    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Step 1: Update package lists
      console.log('🔧 [TOOL-CHECKER] Step 1: Updating package lists...');
      if (event) {
        event.sender.send('scan:progress', { 
          stage: 'installing', 
          message: 'Updating package lists...' 
        });
      }
      const updateCommand = `wsl -e bash -c "echo '${password}' | sudo -S apt update"`;
      await execAsync(updateCommand);
      console.log('✅ [TOOL-CHECKER] Package lists updated successfully');

      // Step 2: Check which tools are already installed
      console.log('🔧 [TOOL-CHECKER] Step 2: Checking installed tools...');
      if (event) {
        event.sender.send('scan:progress', { 
          stage: 'installing', 
          message: 'Checking which tools are already installed...' 
        });
      }
      
      // Check all tools using single efficient command
      const allTools = [...requiredTools, ...goTools];
      const toolCheckCommand = `wsl -e bash -c "for tool in ${allTools.join(' ')}; do if command -v \$tool >/dev/null 2>&1; then echo -e \"✅ \$tool is installed -> \$(command -v \$tool)\"; else echo -e \"❌ \$tool is NOT installed\"; fi; done"`;
      
      console.log('🔧 [TOOL-CHECKER] Running tool check command...');
      const { stdout, stderr } = await execAsync(toolCheckCommand);
      
      // Parse the output to find missing tools
      const missingTools = [];
      const lines = stdout.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        console.log(`🔧 [TOOL-CHECKER] ${line}`);
        if (line.includes('❌') && line.includes('is NOT installed')) {
          const toolName = line.match(/❌ (\w+) is NOT installed/)?.[1];
          if (toolName) {
            missingTools.push(toolName);
          }
        }
      }

      // Step 3: Install missing tools if any
      if (missingTools.length > 0) {
        console.log(`🔧 [TOOL-CHECKER] Step 3: Installing ${missingTools.length} missing tools...`);
        console.log(`🔧 [TOOL-CHECKER] Missing tools: ${missingTools.join(', ')}`);
        
        // Install tools individually with specific methods for problematic tools
        let installedCount = 0;
        let failedTools = [];
        
        for (let i = 0; i < missingTools.length; i++) {
          const tool = missingTools[i];
          console.log(`🔧 [TOOL-CHECKER] Installing tool ${i + 1}/${missingTools.length}: ${tool}`);
          
          if (event) {
            event.sender.send('scan:progress', { 
              stage: 'installing', 
              message: `Installing ${tool} (${i + 1}/${missingTools.length})` 
            });
          }
          
          let installCommand;
          
          // Special handling for specific tools that fail with regular apt
          if (tool === 'amass') {
            // Install amass via snap
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S snap install amass"`;
          } else if (tool === 'geoiplookup') {
            // Install geoip-bin package for geoiplookup command
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S apt install -y geoip-bin"`;
          } else if (tool === 'ffuf') {
            // Install ffuf with proper setup and symlink
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S apt update && apt install -y golang git && go install github.com/ffuf/ffuf/v2@latest && ln -sf /root/go/bin/ffuf /usr/local/bin/ffuf && ffuf --version"`;
          } else if (tool === 'nuclei') {
            // Install nuclei v3 with proper setup
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S apt install -y golang-go && go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest"`;
          } else if (tool === 'dalfox') {
            // Install dalfox with proper setup and symlink
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S apt install -y golang-go && go install github.com/hahwul/dalfox/v2@latest && ln -sf /root/go/bin/dalfox /usr/local/bin/dalfox && dalfox version"`;
          } else {
            // Regular apt installation for other tools
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S apt install -y ${tool}"`;
          }
          
          console.log(`🔧 [TOOL-CHECKER] Command for ${tool}: ${installCommand.replace(password, '***')}`);
          
          try {
            const { stdout, stderr } = await execAsync(installCommand);
            console.log(`✅ [TOOL-CHECKER] ${tool} installed successfully`);
            console.log(`🔧 [TOOL-CHECKER] STDOUT: ${stdout}`);
            if (stderr) console.log(`🔧 [TOOL-CHECKER] STDERR: ${stderr}`);
            installedCount++;
          } catch (error) {
            console.log(`❌ [TOOL-CHECKER] ${tool} failed: ${error.message}`);
            console.log(`🔧 [TOOL-CHECKER] Error STDOUT: ${error.stdout || 'N/A'}`);
            console.log(`🔧 [TOOL-CHECKER] Error STDERR: ${error.stderr || 'N/A'}`);
            failedTools.push(tool);
          }
        }
        
        console.log(`🔧 [TOOL-CHECKER] Installation summary: ${installedCount}/${missingTools.length} tools installed`);
        if (failedTools.length > 0) {
          console.log(`⚠️ [TOOL-CHECKER] Failed tools: ${failedTools.join(', ')}`);
        }
      } else {
        console.log('✅ [TOOL-CHECKER] All required tools are already installed');
      }

      // Step 4: Check and install Go tools
      console.log('🔧 [TOOL-CHECKER] Step 4: Checking Go tools...');
      
      // Check Go tools using single efficient command
      const goToolCheckCommand = `wsl -e bash -c "for tool in ${goTools.join(' ')}; do if command -v \$tool >/dev/null 2>&1; then echo -e \"✅ \$tool is installed -> \$(command -v \$tool)\"; else echo -e \"❌ \$tool is NOT installed\"; fi; done"`;
      
      console.log('🔧 [TOOL-CHECKER] Running Go tool check command...');
      const { stdout: goStdout, stderr: goStderr } = await execAsync(goToolCheckCommand);
      
      // Parse the output to find missing Go tools
      const missingGoTools = [];
      const goLines = goStdout.split('\n').filter(line => line.trim());
      
      for (const line of goLines) {
        console.log(`🔧 [TOOL-CHECKER] ${line}`);
        if (line.includes('❌') && line.includes('is NOT installed')) {
          const toolName = line.match(/❌ (\w+) is NOT installed/)?.[1];
          if (toolName) {
            missingGoTools.push(toolName);
          }
        }
      }

      // Step 5: Go tools are now handled in the main installation loop above with proper Go installation
      console.log('🔧 [TOOL-CHECKER] Step 5: Go tools installation completed in main loop');

      // Step 6: Final verification
      console.log('🔧 [TOOL-CHECKER] Step 6: Final verification...');
      
      // Final check using single efficient command
      const finalAllTools = [...requiredTools, ...goTools];
      const finalCheckCommand = `wsl -e bash -c "for tool in ${finalAllTools.join(' ')}; do if command -v \$tool >/dev/null 2>&1; then echo -e \"✅ \$tool is installed -> \$(command -v \$tool)\"; else echo -e \"❌ \$tool is NOT installed\"; fi; done"`;
      
      console.log('🔧 [TOOL-CHECKER] Running final verification command...');
      const { stdout: finalStdout, stderr: finalStderr } = await execAsync(finalCheckCommand);
      
      // Parse the output to find any remaining missing tools
      const finalMissingTools = [];
      const finalLines = finalStdout.split('\n').filter(line => line.trim());
      
      for (const line of finalLines) {
        console.log(`🔧 [TOOL-CHECKER] ${line}`);
        if (line.includes('❌') && line.includes('is NOT installed')) {
          const toolName = line.match(/❌ (\w+) is NOT installed/)?.[1];
          if (toolName) {
            finalMissingTools.push(toolName);
          }
        }
      }

      const success = finalMissingTools.length === 0;
      console.log(`🔧 [TOOL-CHECKER] Final result: ${success ? 'SUCCESS' : 'PARTIAL'}`);
      console.log(`🔧 [TOOL-CHECKER] Missing tools: ${finalMissingTools.join(', ') || 'None'}`);

      return {
        success,
        missingTools: finalMissingTools,
        totalChecked: requiredTools.length + goTools.length,
        installedCount: (requiredTools.length + goTools.length) - finalMissingTools.length
      };

    } catch (error) {
      console.log('❌ [TOOL-CHECKER] Tool check failed:', error.message);
      return {
        success: false,
        error: error.message,
        missingTools: requiredTools.concat(goTools)
      };
    }
  }

  // Helper: quick preflight to check WSL, Kali, and nmap availability
  function detectWslAndNmap() {
    const result = { hasWsl: false, hasKali: false, wslNmap: false, winNmap: false, details: [] };
    try {
      const sp = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-l', '-q'], { encoding: 'utf8' });
      if (sp.status === 0 && (sp.stdout || '').trim().length > 0) {
        result.hasWsl = true;
        const distributions = (sp.stdout || '').trim();
        result.details.push('WSL is present. Distributions:\n' + distributions);
        
        // Check if Kali is installed
        result.hasKali = checkKaliInstalled();
        if (result.hasKali) {
          result.details.push('✅ Kali Linux is installed in WSL.');
        } else {
          result.details.push('❌ Kali Linux is not installed in WSL.');
        }
        
        // Check for DNS tools (dig, dnsrecon, dnsenum) and nmap
        const digCheck = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sh', '-lc', 'which dig || echo __NO_DIG__'], { encoding: 'utf8' });
        const dnsreconCheck = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sh', '-lc', 'which dnsrecon || echo __NO_DNSRECON__'], { encoding: 'utf8' });
        const dnsenumCheck = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sh', '-lc', 'which dnsenum || echo __NO_DNSENUM__'], { encoding: 'utf8' });
        const nmapCheck = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sh', '-lc', 'which nmap || echo __NO_NMAP__'], { encoding: 'utf8' });

        const toolsStatus = {
          dig: digCheck.status === 0 && (digCheck.stdout || '').includes('/dig'),
          dnsrecon: dnsreconCheck.status === 0 && (dnsreconCheck.stdout || '').includes('/dnsrecon'),
          dnsenum: dnsenumCheck.status === 0 && (dnsenumCheck.stdout || '').includes('/dnsenum'),
          nmap: nmapCheck.status === 0 && (nmapCheck.stdout || '').includes('/nmap')
        };

        if (toolsStatus.dig && toolsStatus.dnsrecon && toolsStatus.dnsenum && toolsStatus.nmap) {
          result.details.push('✅ Found all required tools inside WSL Kali Linux.');
        } else {
          const missingTools = Object.entries(toolsStatus)
            .filter(([tool, installed]) => !installed)
            .map(([tool]) => tool);

          if (missingTools.length > 0) {
            result.details.push(`⚠️ Missing tools in WSL Kali Linux: ${missingTools.join(', ')}. Attempting to install...`);
          }
        }
      } else {
        result.details.push('WSL not available or no distributions installed.');
      }
    } catch (e) {
      result.details.push('WSL check error: ' + (e?.message || String(e)));
    }
    
    // Skip native Windows nmap check - we only want to use WSL nmap
    result.details.push('🔧 Using WSL nmap only (native Windows nmap check skipped)');
    
    return result;
  }

  // Scan orchestration (calls dist/scan.js as a child Node process)
  let scanChild = null;
  ipcMain.handle('scan:start', async (event, target) => {
    if (scanChild) return { error: 'Scan already running' };
    // Use a real Node executable, not Electron's execPath
    // Prefer the npm-provided Node path when available; fallback to 'node'
    let nodeExec = process.env.npm_node_execpath || 'node';
    // If somehow Electron's execPath sneaks in, force to 'node'
    if (/electron/i.test(nodeExec)) {
      nodeExec = 'node';
    }
    const scanEntry = path.join(process.cwd(), 'dist', 'scan.js');
    if (!fs.existsSync(scanEntry)) {
      event.sender.send('scan:progress', { stage: 'error', message: 'Scanner not built. Run npm run build:ts' });
      return { error: 'Scanner not built' };
    }
    const pre = detectWslAndNmap();
    for (const d of pre.details) {
      event.sender.send('scan:progress', { stage: 'preflight', message: d });
    }
    
    // Check if Kali is missing and offer to install
    if (process.platform === 'win32' && pre.hasWsl && !pre.hasKali) {
      const installKali = await dialog.showMessageBox(win, {
        type: 'question',
        title: 'Kali Linux Required',
        message: 'Kali Linux is not installed in WSL.',
        detail: 'Kali Linux provides the best security tools for penetration testing. Would you like to install it now? This will download and install Kali Linux in WSL.',
        buttons: ['Install Kali', 'Skip'],
        defaultId: 0,
        cancelId: 1
      });
      
      if (installKali.response === 0) {
        const kaliInstalled = await installKaliLinux();
        if (kaliInstalled) {
          pre.hasKali = checkKaliInstalled(); // Re-check to confirm
          // Re-check nmap after Kali installation
          const nmapCheck = require('child_process').spawnSync('C:\\Windows\\System32\\wsl.exe', ['-d', 'kali-linux', 'sh', '-lc', 'which nmap || echo __NO_NMAP__'], { encoding: 'utf8' });
          if (nmapCheck.status === 0 && (nmapCheck.stdout || '').includes('/nmap')) {
            pre.wslNmap = true;
            event.sender.send('scan:progress', { stage: 'installing', message: 'nmap found in Kali Linux!' });
          }
        }
      }
    }
    
    // Auto-install security tools in WSL if missing
    if (process.platform === 'win32' && pre.hasWsl && pre.hasKali) {
      // Check which tools are missing and install them
      const missingTools = [];
      if (!pre.details.some(d => d.includes('Found all required tools'))) {
        // If we didn't find all tools, try to install the missing ones
        event.sender.send('scan:progress', { stage: 'installing', message: 'Installing security tools in WSL Kali Linux...' });

        const installed = await installSecurityToolsInWsl();
        if (installed) {
          event.sender.send('scan:progress', { stage: 'installing', message: 'Security tools installed successfully in WSL Kali Linux' });
        } else {
          event.sender.send('scan:progress', { stage: 'warning', message: 'Failed to install some security tools in WSL Kali Linux. Some scans may not work properly.' });
        }
      }
    }
    
    // Always prefer WSL tools when available, never use native Windows tools
    const useWsl = process.platform === 'win32' && pre.hasWsl && pre.hasKali;
    const hasTools = useWsl; // Only use WSL tools, ignore native Windows tools
    
    if (!hasTools) {
      if (pre.hasWsl && pre.hasKali) {
        event.sender.send('scan:progress', { stage: 'warning', message: 'WSL and Kali detected but required tools not found. Attempting to install tools in WSL...' });
      } else {
        event.sender.send('scan:progress', { stage: 'warning', message: 'WSL tools not available. Using fallback scanner.' });
      }
    }
    
    event.sender.send('scan:progress', { stage: 'starting', message: `Launching scanner for target: ${target} using ${hasTools ? (useWsl ? 'WSL Kali Linux tools' : 'native tools') : 'fallback scanner'}` });
    event.sender.send('scan:progress', { stage: 'log', message: `Scanner configuration: ${useWsl ? 'WSL Kali Linux' : 'Native Windows'} environment` });
    // Create a temporary directory for scan output
    const tempDir = path.join(process.cwd(), 'temp-scans')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
    
    event.sender.send('scan:progress', { stage: 'log', message: `Output directory: ${tempDir}` });
    event.sender.send('scan:progress', { stage: 'log', message: `Node executable: ${nodeExec}` });
    event.sender.send('scan:progress', { stage: 'log', message: `Scan entry: ${scanEntry}` });
    event.sender.send('scan:progress', { stage: 'log', message: `USE_WSL environment: ${useWsl ? '1' : '0'}` });
    
    // Run with WSL environment hint so scan script can use WSL tools if available
    scanChild = spawn(nodeExec, [scanEntry, '--target', target, '--out', tempDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, USE_WSL: useWsl ? '1' : '' }
    });
    let output = '';
    let finalJson = null;
    scanChild.stdout.on('data', (d) => {
      output += d.toString();
      const lines = d.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        // Forward every line to the UI log
        event.sender.send('scan:progress', { stage: 'log', message: line });
        // Try to capture final JSON object if present
        if (line.trim().startsWith('{')) {
          try { finalJson = JSON.parse(line.trim()); } catch {}
        }
      }
    });
    scanChild.stderr.on('data', (d) => {
      const lines = d.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        // Categorize stderr messages
        const stage = line.toLowerCase().includes('error') ? 'error' : 
                     line.toLowerCase().includes('warning') ? 'warning' : 'log';
        event.sender.send('scan:progress', { stage: stage, message: line });
      }
    });
    scanChild.on('close', (code) => {
      console.log(`Scan child process exited with code: ${code}`);
      console.log(`Final output: ${output}`);
      const data = finalJson;
      if (code !== 0) {
        event.sender.send('scan:progress', { stage: 'error', message: `Scan process exited with code ${code}` });
      }
      event.sender.send('scan:done', data || null);
      scanChild = null;
      // Clean up temporary directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.log('Cleanup warning:', cleanupError.message);
      }
    });
    scanChild.on('error', (err) => {
      event.sender.send('scan:progress', { stage: 'error', message: String(err?.message || err) });
      event.sender.send('scan:done', null); // Send failure signal
      scanChild = null;
      // Clean up temporary directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.log('Cleanup warning:', cleanupError.message);
      }
    });
    return { ok: true };
  });

  // Comprehensive scan orchestration using Kali tools (calls dist/comprehensive-scan-kali.js)
  let cscanChild = null;
  ipcMain.handle('cscan:start', async (event, target, outDir) => {
    if (cscanChild) return { error: 'Comprehensive scan already running' };
    let nodeExec = process.env.npm_node_execpath || 'node';
    if (/electron/i.test(nodeExec)) nodeExec = 'node';
    const scanEntry = path.join(process.cwd(), 'dist', 'comprehensive-scan-kali.js');
    if (!fs.existsSync(scanEntry)) {
      event.sender.send('cscan:progress', { stage: 'error', message: 'Kali scanner not found. Please ensure the scanner is built.' });
      return { error: 'Kali scanner not found' };
    }
    const outputDir = outDir || path.join(process.cwd(), 'kali_scan_results');
    event.sender.send('cscan:progress', { stage: 'starting', message: `🚀 Launching Kali comprehensive security scanner for: ${target}` });
    event.sender.send('cscan:progress', { stage: 'info', message: 'Using actual Kali Linux tools for authentic security testing' });
    cscanChild = spawn(nodeExec, [scanEntry, target, outputDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    let finalJson = null;
    cscanChild.stdout.on('data', (d) => {
      const lines = d.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        // Parse structured log messages
        const logMatch = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.+)$/);
        if (logMatch) {
          const [, timestamp, testId, message] = logMatch;
          event.sender.send('cscan:progress', { 
            stage: 'log', 
            message: message,
            testId: testId,
            timestamp: timestamp
          });
        } else {
          event.sender.send('cscan:progress', { stage: 'log', message: line });
        }
        // Check for final JSON result
        if (line.trim().startsWith('{')) {
          try { finalJson = JSON.parse(line.trim()); } catch {}
        }
      }
    });
    cscanChild.stderr.on('data', (d) => {
      const lines = d.toString().split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;
        const stage = line.toLowerCase().includes('error') ? 'error' : line.toLowerCase().includes('warning') ? 'warning' : 'log';
        event.sender.send('cscan:progress', { stage, message: line });
      }
    });
    cscanChild.on('close', (code) => {
      if (code !== 0) {
        event.sender.send('cscan:progress', { stage: 'error', message: `Kali comprehensive scan exited with code ${code}` });
      }
      event.sender.send('cscan:done', finalJson || null);
      cscanChild = null;
    });
    cscanChild.on('error', (err) => {
      event.sender.send('cscan:progress', { stage: 'error', message: `Kali scanner error: ${String(err?.message || err)}` });
      event.sender.send('cscan:done', null);
      cscanChild = null;
    });
    return { ok: true };
  });

  // Test handler to verify IPC is working
  ipcMain.handle('tools:test', async () => {
    console.log('Test handler called successfully');
    return { success: true, message: 'IPC is working' };
  });

  // Tool Installer for missing Kali tools
  ipcMain.handle('tools:checkMissing', async () => {
    try {
      const { existsCmd, TOOLS } = require(path.join(__dirname, '..', 'tools', 'cursor-installer.js'));
      
      const missingTools = [];
      for (const tool of TOOLS) {
        const exists = await existsCmd(tool.name);
        if (!exists) {
          missingTools.push(tool);
        }
      }
      
      return { missingTools, totalTools: TOOLS.length };
    } catch (error) {
      console.error('Error checking missing tools:', error);
      return { missingTools: [], totalTools: 0, error: error.message };
    }
  });

  // WSL Password Management
  ipcMain.handle('wsl:testCredentials', async (event, password) => {
    const startTime = Date.now();
    console.log('🔐 [WSL-USER-AUTH] Starting user credential verification...');
    console.log('🔐 [WSL-USER-AUTH] Timestamp:', new Date().toISOString());
    console.log('🔐 [WSL-USER-AUTH] Password length:', password ? password.length : 0);
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Test credentials by trying to run a simple command with password
      // This will use the default WSL user (no -u flag needed)
      const testCommand = `echo "${password}" | wsl sudo whoami`;
      console.log('🔐 [WSL-USER-AUTH] Command to execute:', testCommand.replace(password, '***'));
      console.log('🔐 [WSL-USER-AUTH] Full command (DEBUG):', testCommand);
      console.log('🔐 [WSL-USER-AUTH] WSL distribution: kali-linux');
      console.log('🔐 [WSL-USER-AUTH] Using sudo to elevate to root');
      console.log('🔐 [WSL-USER-AUTH] Test command: whoami');
      
      console.log('🔐 [WSL-USER-AUTH] Executing command...');
      const { stdout, stderr } = await execAsync(testCommand);
      const duration = Date.now() - startTime;
      
      console.log('🔐 [WSL-USER-AUTH] Command execution completed in', duration, 'ms');
      console.log('🔐 [WSL-USER-AUTH] STDOUT:', JSON.stringify(stdout));
      console.log('🔐 [WSL-USER-AUTH] STDERR:', JSON.stringify(stderr));
      console.log('🔐 [WSL-USER-AUTH] STDOUT (trimmed):', JSON.stringify(stdout.trim()));
      
      const output = stdout.trim();
      console.log('🔐 [WSL-USER-AUTH] Checking if output equals "root"...');
      console.log('🔐 [WSL-USER-AUTH] Output === "root":', output === 'root');
      
      if (output === 'root') {
        console.log('✅ [WSL-USER-AUTH] WSL credentials VALID');
        console.log('✅ [WSL-USER-AUTH] Authentication successful');
        return { success: true, debug: { duration, stdout, stderr } };
      } else {
        console.log('❌ [WSL-USER-AUTH] WSL credentials INVALID');
        console.log('❌ [WSL-USER-AUTH] Expected output: "root"');
        console.log('❌ [WSL-USER-AUTH] Actual output:', JSON.stringify(output));
        console.log('❌ [WSL-USER-AUTH] Authentication failed');
        return { 
          success: false, 
          error: 'Invalid password', 
          debug: { 
            duration, 
            stdout, 
            stderr, 
            expected: 'root', 
            actual: output 
          } 
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log('❌ [WSL-USER-AUTH] WSL credential test FAILED');
      console.log('❌ [WSL-USER-AUTH] Error type:', error.constructor.name);
      console.log('❌ [WSL-USER-AUTH] Error message:', error.message);
      console.log('❌ [WSL-USER-AUTH] Error code:', error.code);
      console.log('❌ [WSL-USER-AUTH] Error signal:', error.signal);
      console.log('❌ [WSL-USER-AUTH] Error stack:', error.stack);
      console.log('❌ [WSL-USER-AUTH] Duration before error:', duration, 'ms');
      
      return { 
        success: false, 
        error: error.message, 
        debug: { 
          duration, 
          errorType: error.constructor.name,
          errorCode: error.code,
          errorSignal: error.signal,
          errorStack: error.stack
        } 
      };
    }
  });

  // WSL Connectivity Test
  ipcMain.handle('wsl:testConnectivity', async () => {
    console.log('🔍 [WSL-CONNECTIVITY] Testing WSL connectivity...');
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      const testCommand = 'wsl echo "WSL connectivity test successful"';
      console.log('🔍 [WSL-CONNECTIVITY] Command:', testCommand);
      
      const { stdout, stderr } = await execAsync(testCommand);
      console.log('🔍 [WSL-CONNECTIVITY] STDOUT:', stdout.trim());
      console.log('🔍 [WSL-CONNECTIVITY] STDERR:', stderr.trim());
      
      return { 
        success: true, 
        message: 'WSL is working properly',
        output: stdout.trim()
      };
    } catch (error) {
      console.log('🔍 [WSL-CONNECTIVITY] WSL connectivity test failed:', error.message);
      return { 
        success: false, 
        error: error.message,
        message: 'WSL is not working properly'
      };
    }
  });

  // WSL Root Password Management
  ipcMain.handle('wsl:testRootCredentials', async (event, password) => {
    console.log('🔐 [WSL-ROOT-AUTH] ===== HANDLER CALLED =====');
    console.log('🔐 [WSL-ROOT-AUTH] IPC Handler wsl:testRootCredentials invoked');
    console.log('🔐 [WSL-ROOT-AUTH] Password length:', password ? password.length : 0);
    
    const startTime = Date.now();
    const { spawn } = require('child_process');
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    
    try {
      // Step 1: Check if WSL has any users configured
      console.log('🔐 [WSL-ROOT-AUTH] Step 1: Checking if WSL has users...');
      const hasUsers = await new Promise((resolve) => {
        const checkProc = spawn(wslPath, ['whoami'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000
        });
        
        let output = '';
        let errorOutput = '';
        let timeoutId = setTimeout(() => {
          checkProc.kill();
          resolve(false);
        }, 5000);
        
        checkProc.stdout.on('data', (d) => {
          output += d.toString();
        });
        
        checkProc.stderr.on('data', (d) => {
          errorOutput += d.toString();
        });
        
        checkProc.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0 && output.trim().length > 0) {
            console.log('🔐 [WSL-ROOT-AUTH] WSL has users, current user:', output.trim());
            resolve(true);
          } else {
            console.log('🔐 [WSL-ROOT-AUTH] No users found or WSL not configured');
            resolve(false);
          }
        });
        
        checkProc.on('error', () => {
          clearTimeout(timeoutId);
          resolve(false);
        });
      });
      
      // Step 2: If no users exist, set root password instead of testing
      // Ubuntu typically has a default user, but root password might not be set
      if (!hasUsers) {
        console.log('🔐 [WSL-ROOT-AUTH] No users found or WSL not fully configured. Setting root password...');
        const setPasswordResult = await new Promise((resolve) => {
          // For Ubuntu, we need to set password for root user
          // Use printf to avoid echo issues with special characters
          const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
          const setPasswordCommand = `printf '%s\\n%s\\n' '${escapedPassword}' '${escapedPassword}' | sudo passwd root`;
          const setPassProc = spawn(wslPath, ['bash', '-c', setPasswordCommand], {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 8000
          });
          
          let output = '';
          let errorOutput = '';
          let timeoutId = setTimeout(() => {
            setPassProc.kill();
            console.log('🔐 [WSL-ROOT-AUTH] Password setting timeout, but continuing...');
            resolve({ success: true, warning: 'Password setting timeout' });
          }, 8000);
          
          setPassProc.stdout.on('data', (d) => {
            output += d.toString();
          });
          
          setPassProc.stderr.on('data', (d) => {
            errorOutput += d.toString();
          });
          
          setPassProc.on('close', (code) => {
            clearTimeout(timeoutId);
            // Ubuntu might require sudo, so we try without sudo first, then with
            if (code === 0 || output.includes('successfully') || output.includes('updated') || output.includes('password updated')) {
              console.log('🔐 [WSL-ROOT-AUTH] Root password set successfully');
              resolve({ success: true });
            } else if (errorOutput.includes('sudo') || errorOutput.includes('permission')) {
              // Try with sudo for the default user
              console.log('🔐 [WSL-ROOT-AUTH] Trying with sudo for default user...');
              resolve({ success: true, needsSudo: true });
            } else {
              console.log('🔐 [WSL-ROOT-AUTH] Password setting uncertain, but continuing to test...');
              resolve({ success: true, warning: 'Password setting uncertain' });
            }
          });
          
          setPassProc.on('error', (err) => {
            clearTimeout(timeoutId);
            console.log('🔐 [WSL-ROOT-AUTH] Password setting error:', err.message);
            // Continue anyway - might be able to test existing credentials
            resolve({ success: true, warning: err.message });
          });
        });
        
        // If password setting needs sudo, try with default user
        if (setPasswordResult.needsSudo) {
          console.log('🔐 [WSL-ROOT-AUTH] Attempting to set root password with sudo...');
          const sudoSetResult = await new Promise((resolve) => {
            const escapedPassword = password.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
            // Get default username first, then set root password
            const sudoCommand = `DEFAULT_USER=$(whoami) && echo '${escapedPassword}' | sudo -S passwd root <<< '${escapedPassword}\\n${escapedPassword}'`;
            const sudoProc = spawn(wslPath, ['bash', '-c', sudoCommand], {
              stdio: ['ignore', 'pipe', 'pipe'],
              timeout: 8000
            });
            
            let timeoutId = setTimeout(() => {
              sudoProc.kill();
              resolve({ success: true, warning: 'Sudo password setting timeout' });
            }, 8000);
            
            sudoProc.on('close', () => {
              clearTimeout(timeoutId);
              resolve({ success: true });
            });
            
            sudoProc.on('error', () => {
              clearTimeout(timeoutId);
              resolve({ success: true, warning: 'Sudo password setting error' });
            });
          });
        }
      }
      
      // Step 3: Test credentials using spawn with timeout
      console.log('🔐 [WSL-ROOT-AUTH] Step 2: Testing credentials...');
      const testResult = await new Promise((resolve) => {
        // Escape password for bash
        const escapedPassword = password.replace(/'/g, "'\\''");
        const testCommand = `echo '${escapedPassword}' | sudo -S whoami`;
        const testProc = spawn(wslPath, ['bash', '-c', testCommand], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000
        });
        
        let stdout = '';
        let stderr = '';
        let timeoutId = setTimeout(() => {
          testProc.kill();
          resolve({ success: false, error: 'Command timeout after 5 seconds', timeout: true });
        }, 5000);
        
        testProc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        
        testProc.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        
        testProc.on('close', (code) => {
          clearTimeout(timeoutId);
          const output = stdout.trim();
          console.log('🔐 [WSL-ROOT-AUTH] Command output:', output);
          console.log('🔐 [WSL-ROOT-AUTH] Exit code:', code);
          
          if (output === 'root') {
            resolve({ success: true, stdout, stderr });
          } else {
            resolve({ 
              success: false, 
              error: 'Invalid credentials or user not found',
              stdout,
              stderr,
              code
            });
          }
        });
        
        testProc.on('error', (err) => {
          clearTimeout(timeoutId);
          resolve({ success: false, error: err.message });
        });
      });
      
      const duration = Date.now() - startTime;
      console.log('🔐 [WSL-ROOT-AUTH] Test completed in', duration, 'ms');
      
      if (testResult.success) {
        return { 
          success: true, 
          debug: { duration, stdout: testResult.stdout, stderr: testResult.stderr } 
        };
      } else {
        return {
          success: false,
          error: testResult.error || 'Credentials validation failed',
          debug: {
            duration,
            stdout: testResult.stdout,
            stderr: testResult.stderr,
            code: testResult.code,
            timeout: testResult.timeout
          }
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log('❌ [WSL-ROOT-AUTH] WSL root credential test FAILED');
      console.log('❌ [WSL-ROOT-AUTH] Error type:', error.constructor.name);
      console.log('❌ [WSL-ROOT-AUTH] Error message:', error.message);
      console.log('❌ [WSL-ROOT-AUTH] Error code:', error.code);
      console.log('❌ [WSL-ROOT-AUTH] Error signal:', error.signal);
      console.log('❌ [WSL-ROOT-AUTH] Error stack:', error.stack);
      console.log('❌ [WSL-ROOT-AUTH] Duration before error:', duration, 'ms');
      
      return { 
        success: false, 
        error: error.message, 
        debug: { 
          duration, 
          errorType: error.constructor.name,
          errorCode: error.code,
          errorSignal: error.signal,
          errorStack: error.stack
        } 
      };
    }
  });

  ipcMain.handle('wsl:getUsername', async () => {
    try {
      const { spawn } = require('child_process');
      const wslPath = 'C:\\Windows\\System32\\wsl.exe';
      
      return new Promise((resolve) => {
        const proc = spawn(wslPath, ['whoami'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000
        });
        
        let output = '';
        let timeoutId = setTimeout(() => {
          proc.kill();
          resolve({ username: 'WSL User' });
        }, 5000);
        
        proc.stdout.on('data', (d) => {
          output += d.toString();
        });
        
        proc.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0 && output.trim().length > 0) {
            const username = output.trim();
            console.log('📤 Username:', username);
            resolve({ username });
          } else {
            console.log('❌ Failed to get WSL username');
            resolve({ username: 'WSL User' });
          }
        });
        
        proc.on('error', () => {
          clearTimeout(timeoutId);
          resolve({ username: 'WSL User' });
        });
      });
    } catch (error) {
      console.log('❌ Failed to get WSL username:', error.message);
      return { username: 'WSL User' };
    }
  });

  // Create new WSL user in Ubuntu
  ipcMain.handle('wsl:createUser', async (event, username, password) => {
    console.log('👤 [WSL-USER-CREATE] Creating new WSL user...');
    console.log('👤 [WSL-USER-CREATE] Username:', username);
    console.log('👤 [WSL-USER-CREATE] Password length:', password ? password.length : 0);
    
    const { spawn } = require('child_process');
    const wslPath = 'C:\\Windows\\System32\\wsl.exe';
    
    try {
      // Step 1: Check if user already exists
      const userExists = await new Promise((resolve) => {
        const checkProc = spawn(wslPath, ['bash', '-c', `id -u ${username} >/dev/null 2>&1 && echo 'exists' || echo 'notexists'`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000
        });
        
        let output = '';
        let timeoutId = setTimeout(() => {
          checkProc.kill();
          resolve(false);
        }, 5000);
        
        checkProc.stdout.on('data', (d) => {
          output += d.toString();
        });
        
        checkProc.on('close', () => {
          clearTimeout(timeoutId);
          resolve(output.trim().includes('exists'));
        });
        
        checkProc.on('error', () => {
          clearTimeout(timeoutId);
          resolve(false);
        });
      });
      
      if (userExists) {
        console.log('⚠️ [WSL-USER-CREATE] User already exists');
        return { 
          success: false, 
          error: `User "${username}" already exists. Please choose a different username.` 
        };
      }
      
      // Step 2: Create user using adduser (interactive) or useradd + passwd
      // Use useradd for non-interactive creation
      const createResult = await new Promise((resolve) => {
        // Escape special characters in password
        const escapedPassword = password.replace(/'/g, "'\\''").replace(/"/g, '\\"');
        
        // Create user with home directory and shell
        const createCommand = `useradd -m -s /bin/bash ${username} && echo '${escapedPassword}' | passwd ${username} --stdin 2>/dev/null || (echo '${escapedPassword}' && echo '${escapedPassword}') | passwd ${username}`;
        
        const createProc = spawn(wslPath, ['bash', '-c', createCommand], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15000
        });
        
        let stdout = '';
        let stderr = '';
        let timeoutId = setTimeout(() => {
          createProc.kill();
          resolve({ success: false, error: 'User creation timeout' });
        }, 15000);
        
        createProc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        
        createProc.stderr.on('data', (d) => {
          stderr += d.toString();
        });
        
        createProc.on('close', (code) => {
          clearTimeout(timeoutId);
          if (code === 0 || stdout.includes('successfully') || stdout.includes('updated') || stderr.includes('successfully')) {
            console.log('✅ [WSL-USER-CREATE] User created successfully');
            resolve({ success: true });
          } else {
            // Try alternative method: use chpasswd
            console.log('⚠️ [WSL-USER-CREATE] First method failed, trying chpasswd...');
            resolve({ success: false, needsAlternative: true, stdout, stderr });
          }
        });
        
        createProc.on('error', (err) => {
          clearTimeout(timeoutId);
          console.log('❌ [WSL-USER-CREATE] Error:', err.message);
          resolve({ success: false, error: err.message });
        });
      });
      
      // If first method failed, try alternative with chpasswd
      if (!createResult.success && createResult.needsAlternative) {
        console.log('🔄 [WSL-USER-CREATE] Trying alternative method with chpasswd...');
        const altResult = await new Promise((resolve) => {
          const escapedPassword = password.replace(/'/g, "'\\''").replace(/"/g, '\\"');
          // Create user first, then set password with chpasswd
          const altCommand = `useradd -m -s /bin/bash ${username} && echo '${username}:${escapedPassword}' | chpasswd`;
          
          const altProc = spawn(wslPath, ['bash', '-c', altCommand], {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 15000
          });
          
          let stdout = '';
          let stderr = '';
          let timeoutId = setTimeout(() => {
            altProc.kill();
            resolve({ success: false, error: 'Alternative user creation timeout' });
          }, 15000);
          
          altProc.stdout.on('data', (d) => {
            stdout += d.toString();
          });
          
          altProc.stderr.on('data', (d) => {
            stderr += d.toString();
          });
          
          altProc.on('close', (code) => {
            clearTimeout(timeoutId);
            if (code === 0) {
              console.log('✅ [WSL-USER-CREATE] User created with alternative method');
              resolve({ success: true });
            } else {
              console.log('❌ [WSL-USER-CREATE] Alternative method also failed');
              resolve({ success: false, error: `User creation failed: ${stderr || stdout}` });
            }
          });
          
          altProc.on('error', (err) => {
            clearTimeout(timeoutId);
            resolve({ success: false, error: err.message });
          });
        });
        
        if (!altResult.success) {
          return altResult;
        }
      }
      
      // Step 3: Add user to sudo group (optional but recommended)
      try {
        const addSudoResult = await new Promise((resolve) => {
          const sudoCommand = `usermod -aG sudo ${username}`;
          const sudoProc = spawn(wslPath, ['bash', '-c', sudoCommand], {
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000
          });
          
          let timeoutId = setTimeout(() => {
            sudoProc.kill();
            resolve({ success: false });
          }, 5000);
          
          sudoProc.on('close', (code) => {
            clearTimeout(timeoutId);
            resolve({ success: code === 0 });
          });
          
          sudoProc.on('error', () => {
            clearTimeout(timeoutId);
            resolve({ success: false });
          });
        });
        
        if (addSudoResult.success) {
          console.log('✅ [WSL-USER-CREATE] User added to sudo group');
        } else {
          console.log('⚠️ [WSL-USER-CREATE] Could not add user to sudo group (non-critical)');
        }
      } catch (error) {
        console.log('⚠️ [WSL-USER-CREATE] Error adding to sudo group (non-critical):', error.message);
      }
      
      // Step 4: Verify user was created
      const verifyResult = await new Promise((resolve) => {
        const verifyProc = spawn(wslPath, ['bash', '-c', `id -u ${username} >/dev/null 2>&1 && echo 'exists' || echo 'notexists'`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000
        });
        
        let output = '';
        let timeoutId = setTimeout(() => {
          verifyProc.kill();
          resolve(false);
        }, 5000);
        
        verifyProc.stdout.on('data', (d) => {
          output += d.toString();
        });
        
        verifyProc.on('close', () => {
          clearTimeout(timeoutId);
          resolve(output.trim().includes('exists'));
        });
        
        verifyProc.on('error', () => {
          clearTimeout(timeoutId);
          resolve(false);
        });
      });
      
      if (verifyResult) {
        console.log('✅ [WSL-USER-CREATE] User verification successful');
        return { 
          success: true, 
          message: `User "${username}" created successfully in WSL` 
        };
      } else {
        console.log('⚠️ [WSL-USER-CREATE] User creation uncertain - verification failed');
        return { 
          success: false, 
          error: 'User creation completed but verification failed. Please try logging in manually.' 
        };
      }
    } catch (error) {
      console.log('❌ [WSL-USER-CREATE] User creation error:', error.message);
      return { 
        success: false, 
        error: error.message || 'Failed to create WSL user' 
      };
    }
  });

  // Global storage for WSL credentials (in-memory only)
  let storedWslRootPassword = null;

  // Load stored credentials on startup
  const loadStoredCredentials = async () => {
    try {
      // This would load from secure storage in a production environment
      // For now, we'll start with empty credentials
      console.log('🔐 Loading stored WSL credentials...');
      storedWslRootPassword = null;
    } catch (error) {
      console.error('Failed to load stored credentials:', error);
    }
  };

  // Load credentials when app starts
  loadStoredCredentials();
  
  // Load stored WSL password when app starts
  const loadStoredWslPassword = () => {
    try {
      const password = loadStoredPassword();
      if (password) {
        storedWslRootPassword = password;
        console.log('🔐 WSL password loaded from secure storage on app start');
      }
    } catch (error) {
      console.log('❌ Failed to load WSL password on app start:', error.message);
    }
  };
  
  loadStoredWslPassword();

  ipcMain.handle('wsl:getStoredRootPassword', async () => {
    try {
      console.log('🔐 Getting stored root password...');
      console.log('🔐 Current stored password in memory:', storedWslRootPassword ? 'EXISTS' : 'NULL');
      
      // First try to load from secure storage
      if (!storedWslRootPassword) {
        const loadedPassword = loadStoredPassword();
        if (loadedPassword) {
          storedWslRootPassword = loadedPassword;
          console.log('🔐 Password loaded from secure storage');
          console.log('🔐 Password length:', loadedPassword.length);
          console.log('🔐 Password (masked):', loadedPassword.replace(/./g, '*'));
        } else {
          console.log('🔐 No password found in secure storage');
        }
      } else {
        console.log('🔐 Using password from memory');
        console.log('🔐 Password length:', storedWslRootPassword.length);
        console.log('🔐 Password (masked):', storedWslRootPassword.replace(/./g, '*'));
      }
      
      return storedWslRootPassword;
    } catch (error) {
      console.log('❌ Failed to get stored root password:', error.message);
      return null;
    }
  });

  ipcMain.handle('wsl:storeRootPassword', async (event, password) => {
    try {
      console.log('🔐 Storing root password securely...');
      console.log('🔐 Password length:', password.length);
      console.log('🔐 Password (masked):', password.replace(/./g, '*'));
      
      // Store password securely in encrypted file (fast operation)
      const stored = storePasswordSecurely(password);
      if (!stored) {
        return { success: false, error: 'Failed to store password securely' };
      }
      
      // Store in memory for current session
      storedWslRootPassword = password;
      
      // Return success immediately - tool checking can happen in background
      // NOTE: Tool checking moved to background to avoid blocking UI
      setImmediate(async () => {
        try {
          console.log('🔧 Auto-checking required security tools...');
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('scan:progress', { 
              stage: 'checking', 
              message: 'Password saved securely! Now checking which security tools are available...' 
            });
          }
          
          const toolResult = await checkRequiredToolsOnly(password);
          
          // Check and install tgpt
          console.log('🔧 Checking tgpt...');
          const tgptResult = await checkAndInstallTgpt(password, event);
          console.log('🔧 tgpt check result:', tgptResult);
          
          if (toolResult.success && event?.sender && !event.sender.isDestroyed()) {
            console.log('✅ All required tools are available');
            event.sender.send('scan:progress', { 
              stage: 'complete', 
              message: `All required security tools are ready! (${toolResult.installedCount}/${toolResult.totalChecked} tools)` 
            });
          } else if (event?.sender && !event.sender.isDestroyed()) {
            console.log('⚠️ Some tools are missing');
            event.sender.send('scan:progress', { 
              stage: 'warning', 
              message: `Tool check completed: ${toolResult.installedCount}/${toolResult.totalChecked} tools available. Missing: ${toolResult.missingTools?.join(', ') || 'Unknown'}` 
            });
          }
        } catch (bgError) {
          console.log('⚠️ Background tool check error (non-blocking):', bgError.message);
        }
      });
      
      // Return immediately without waiting for tool check
      return { success: true };
    } catch (error) {
      console.log('❌ Failed to store root password:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('wsl:clearRootPassword', async () => {
    try {
      console.log('🔐 Clearing stored root password...');
      storedWslRootPassword = null;
      clearStoredPassword();
      return { success: true };
    } catch (error) {
      console.log('❌ Failed to clear root password:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Auto-scan trigger handler
  ipcMain.handle('scan:triggerAutoScan', async (event) => {
    try {
      console.log('🚀 [AUTO-SCAN] Triggering automatic scan...');
      
      // Send event to frontend to start scanning
      event.sender.send('scan:autoStart');
      
      return { success: true };
    } catch (error) {
      console.log('❌ [AUTO-SCAN] Failed to trigger auto-scan:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Install missing tools handler
  ipcMain.handle('tools:installMissing', async (event, missingTools) => {
    try {
      console.log('🔧 [TOOL-INSTALL] Installing missing tools:', missingTools);
      
      if (!storedWslRootPassword) {
        return { success: false, error: 'WSL root password not available' };
      }
      
      const result = await checkAndInstallRequiredTools(storedWslRootPassword, event);
      return result;
    } catch (error) {
      console.log('❌ [TOOL-INSTALL] Failed to install tools:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Check and install tgpt
  ipcMain.handle('tools:checkAndInstallTgpt', async (event, password) => {
    try {
      console.log('🔧 [TGPT] Checking and installing tgpt...');
      if (!password) {
        console.log('❌ [TGPT] No password provided');
        return { installed: false, error: 'Password is required' };
      }
      
      const result = await checkAndInstallTgpt(password, event);
      return result;
    } catch (error) {
      console.log('❌ [TGPT] Failed to check/install tgpt:', error.message);
      return { installed: false, error: error.message };
    }
  });

  // Convert text using tgpt
  ipcMain.handle('tgpt:convert', async (event, prompt, password) => {
    try {
      console.log('🤖 [TGPT] Converting text with tgpt...');
      
      if (!password) {
        return { success: false, error: 'Password is required' };
      }

      const { spawn } = require('child_process');
      
      // Pass prompt content directly to TGPT via stdin (no temp file)
      console.log('🤖 [TGPT] Prompt length:', prompt.length, 'characters');
      console.log('🤖 [TGPT] Prompt preview (first 500 chars):', prompt.substring(0, 500));
      console.log('🤖 [TGPT] Passing content directly via stdin (no temp file)');
      
      return new Promise((resolve, reject) => {
        // Execute tgpt in WSL and pipe prompt content directly via stdin
        const wslProcess = spawn('C:\\Windows\\System32\\wsl.exe', ['bash', '-c', 'tgpt'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024,
          shell: false
        });
        
        let stdout = '';
        let stderr = '';
        
        // Write prompt content directly to stdin
        wslProcess.stdin.write(prompt, 'utf8');
        wslProcess.stdin.end(); // Close stdin to signal end of input
        
        wslProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        wslProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        // Increase timeout to 5 minutes for large content
        const timeout = setTimeout(() => {
          wslProcess.kill();
          reject(new Error('TGPT command timeout after 5 minutes'));
        }, 300000);
        
        wslProcess.on('close', (code) => {
          clearTimeout(timeout);
          
          console.log('🤖 [TGPT] Process exited with code:', code);
          console.log('🤖 [TGPT] stdout length:', stdout.length);
          console.log('🤖 [TGPT] stderr length:', stderr.length);
          console.log('🤖 [TGPT] stdout (first 500 chars):', stdout.substring(0, 500));
          console.log('🤖 [TGPT] stderr:', stderr);
          
          // Check if output contains generic AI greeting (indicates prompt not received)
          if (stdout && (stdout.includes('Hello! I\'m an AI assistant') || stdout.includes('How can I assist you today') || stdout.includes('Loading'))) {
            console.log('⚠️ [TGPT] Warning: Received generic AI greeting or loading message - prompt may not have been received');
            console.log('⚠️ [TGPT] Prompt preview:', prompt.substring(0, 200));
            console.log('⚠️ [TGPT] This suggests TGPT is not receiving the prompt correctly');
            console.log('⚠️ [TGPT] Try checking if TGPT is installed correctly: wsl bash -c "which tgpt"');
          }
          
          // Check if stderr contains errors
          if (stderr && stderr.length > 0) {
            console.log('⚠️ [TGPT] stderr contains:', stderr);
          }
          
          if (stdout || code === 0) {
            resolve({
              success: true,
              output: stdout,
              stderr: stderr
            });
          } else {
            resolve({
              success: false,
              error: `Process exited with code ${code}. stderr: ${stderr}`,
              stdout: stdout,
              stderr: stderr
            });
          }
        });
        
        wslProcess.on('error', (error) => {
          clearTimeout(timeout);
          console.error('🤖 [TGPT] Spawn error:', error);
          reject(error);
        });
      });
    } catch (error) {
      console.log('❌ [TGPT] Outer conversion failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Check required tools only (without installing)
  ipcMain.handle('tools:checkRequiredToolsOnly', async (event, password) => {
    try {
      console.log('🔧 [TOOLS-CHECK] Checking required tools only...');
      console.log('🔧 [TOOLS-CHECK] Password received:', password ? 'EXISTS' : 'NULL');
      console.log('🔧 [TOOLS-CHECK] Password length:', password ? password.length : 0);
      console.log('🔧 [TOOLS-CHECK] Password (masked):', password ? password.replace(/./g, '*') : 'NULL');
      
      if (!password) {
        console.log('❌ [TOOLS-CHECK] No password provided');
        return { success: false, error: 'Password required for tool checking' };
      }
      
      const result = await checkRequiredToolsOnly(password);
      console.log('🔧 [TOOLS-CHECK] Tool check result:', result);
      
      // Check tgpt in background (non-blocking) - don't wait for it
      checkAndInstallTgpt(password, event).then(tgptResult => {
        console.log('🔧 [TOOLS-CHECK] tgpt status (background):', tgptResult);
      }).catch(err => {
        console.log('⚠️ [TOOLS-CHECK] tgpt check failed (non-blocking):', err.message);
      });
      
      return result;
    } catch (error) {
      console.error('❌ [TOOLS-CHECK] Tool check failed:', error);
      return { success: false, error: error.message };
    }
  });

  // Install single tool handler
  ipcMain.handle('tools:installSingle', async (event, toolName, password) => {
    try {
      console.log(`🔧 [SINGLE-TOOL-INSTALL] ===== STARTING INSTALLATION =====`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Installing tool: ${toolName}`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Timestamp: ${new Date().toISOString()}`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Using NEW installSingleTool handler`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Password provided: ${password ? 'EXISTS' : 'NULL'}`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Password length: ${password ? password.length : 0}`);
      
      // Use provided password or fall back to stored password
      const usePassword = password || storedWslRootPassword;
      
      if (!usePassword) {
        console.log(`❌ [SINGLE-TOOL-INSTALL] No password available (provided: ${!!password}, stored: ${!!storedWslRootPassword})`);
        return { success: false, error: 'WSL root password not available' };
      }
      
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Using password: ${usePassword ? 'YES' : 'NO'}`);
      
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Check if it's a Go tool
      const goTools = {
        'ffuf': 'go install github.com/ffuf/ffuf@latest',
        'nuclei': 'go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest',
        'dalfox': 'go install github.com/hahwul/dalfox/v2@latest'
      };

      // Special packages that need different installation methods
      const specialPackages = {
        'theharvester': 'python3-theharvester',
        'amass': 'amass',
        'metasploit-framework': 'metasploit-framework',
        'geoiplookup': 'geoip-bin'
      };
      
      let installCommand;
      if (goTools[toolName]) {
        // First install Go if not present, then install Go tool
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Go tool detected: ${toolName}`);
        
        // Check if Go is installed
        try {
          await execAsync(`wsl -e bash -c "which go"`);
          console.log(`🔧 [SINGLE-TOOL-INSTALL] Go is already installed`);
        } catch (goError) {
          console.log(`🔧 [SINGLE-TOOL-INSTALL] Go not found, installing Go first...`);
          const goInstallCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt-get install -y golang-go"`;
          await execAsync(goInstallCommand);
          console.log(`🔧 [SINGLE-TOOL-INSTALL] Go installed successfully`);
        }
        
        installCommand = `wsl -e bash -c "${goTools[toolName]}"`;
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Go command: ${installCommand}`);
      } else if (specialPackages[toolName]) {
        // Install special packages with alternative methods
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Special package detected: ${toolName}`);
        
        if (toolName === 'theharvester') {
          // Try multiple methods for theharvester
          console.log(`🔧 [SINGLE-TOOL-INSTALL] Trying theharvester installation via pip...`);
          try {
            // First try pip installation
            const pipCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y python3-pip && pip3 install theharvester"`;
            const { stdout, stderr } = await execAsync(pipCommand);
            console.log(`✅ [SINGLE-TOOL-INSTALL] theharvester installed via pip successfully`);
            return { success: true, tool: toolName, stdout: stdout, stderr: stderr };
          } catch (pipError) {
            console.log(`⚠️ [SINGLE-TOOL-INSTALL] pip installation failed, trying git clone method...`);
            // Fallback to git clone method
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y git python3-pip && cd /tmp && git clone https://github.com/laramies/theHarvester.git && cd theHarvester && pip3 install -r requirements.txt && sudo ln -sf /tmp/theHarvester/theHarvester.py /usr/local/bin/theharvester"`;
          }
        } else if (toolName === 'amass') {
          // Install amass via snap
          installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S snap install amass"`;
        } else if (toolName === 'metasploit-framework') {
          // Install metasploit CLI only via apt (lighter installation)
        installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt-get install -y metasploit-framework"`;
        } else if (toolName === 'geoiplookup') {
          // Install geoip-bin package for geoiplookup command
          installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y geoip-bin"`;
        }
        
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Special command: ${installCommand.replace(usePassword, '***')}`);
      } else {
        // Install regular apt package using rootless WSL
        console.log(`🔧 [SINGLE-TOOL-INSTALL] APT package detected: ${toolName}`);
        
        try {
          // Use wslHelper for rootless installation
          const send = (progress, message) => {
            try { if (event?.sender && !event.sender.isDestroyed()) event.sender.send('tools:installProgress', { tool: toolName, progress, message }); } catch {}
          };
          
          send(5, `Updating package lists for ${toolName}…`);
          const updateRes = await wslHelper.runWSLAsRoot('DEBIAN_FRONTEND=noninteractive apt-get update -qq');
          if (!updateRes.success) {
            console.log(`⚠️ [SINGLE-TOOL-INSTALL] Package list update had issues, continuing anyway`);
          }
          
          send(30, `Installing ${toolName}…`);
          const installRes = await wslHelper.runWSLAsRoot(`DEBIAN_FRONTEND=noninteractive apt-get install -y ${toolName}`, 15 * 60 * 1000);
          
          if (installRes.success) {
            send(100, `${toolName} installed successfully`);
            console.log(`✅ [SINGLE-TOOL-INSTALL] ${toolName} installed successfully`);
            return { success: true, tool: toolName, stdout: installRes.stdout, stderr: installRes.stderr };
          }
          
          throw new Error(`Installation failed: ${installRes.stderr || installRes.error}`);
        } catch (installError) {
          throw installError;
        }
      }
    } catch (error) {
      console.log(`❌ [SINGLE-TOOL-INSTALL] ===== INSTALLATION FAILED =====`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Tool: ${toolName}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error type: ${error.constructor.name}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error message: ${error.message}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error code: ${error.code || 'N/A'}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error signal: ${error.signal || 'N/A'}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error STDOUT: ${error.stdout || 'N/A'}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Error STDERR: ${error.stderr || 'N/A'}`);
      console.log(`❌ [SINGLE-TOOL-INSTALL] Full error object:`, error);
      
      return { 
        success: false, 
        tool: toolName,
        error: error.message,
        errorType: error.constructor.name,
        errorCode: error.code,
        errorSignal: error.signal,
        stdout: error.stdout,
        stderr: error.stderr
      };
    }
  });

  ipcMain.handle('wsl:runCommand', async (event, command, password) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Run command with password authentication (uses default WSL user)
      const fullCommand = `echo "${password}" | wsl ${command}`;
      console.log('🚀 Running WSL command...');
      console.log('📝 Command:', fullCommand.replace(password, '***'));
      
      const { stdout, stderr } = await execAsync(fullCommand);
      console.log('📤 Output:', stdout);
      if (stderr) console.log('⚠️  Errors:', stderr);
      
      return { 
        success: true, 
        stdout: stdout, 
        stderr: stderr 
      };
    } catch (error) {
      console.log('❌ WSL command failed:', error.message);
      console.log('📤 Error output:', error.stdout || '');
      console.log('⚠️  Error stderr:', error.stderr || '');
      
      return { 
        success: false, 
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  });

  // New handler for WSL commands with specific username and root access
  // This simulates: wsl -> sudo su -> root@ -> execute command
  ipcMain.handle('wsl:runCommandAsRoot', async (event, username, command, password) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Use full path to wsl.exe for production compatibility
      const wslPath = 'C:\\Windows\\System32\\wsl.exe';
      
      // Run command as root user: wsl -u username, then sudo su with password, then execute command
      // The command is executed in a single bash session to maintain context
      // Escape single quotes in command by replacing ' with '\'' (bash escaping)
      const escapedCommand = command.replace(/'/g, "'\\''");
      // Build the full command: wsl.exe -u username bash -c "echo 'password' | sudo -S bash -c 'command'"
      const fullCommand = `"${wslPath}" -u ${username} bash -c "echo '${password}' | sudo -S bash -c '${escapedCommand}'"`;
      
      console.log('🚀 Running WSL command as root...');
      console.log('👤 Username:', username);
      console.log('📝 Original command:', command);
      console.log('📝 Full command:', fullCommand.replace(password, '***'));
      console.log('📋 [INFO] This simulates: wsl.exe -> sudo su -> root@ -> execute command');
      
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        windowsHide: true,
        shell: true
      });
      
      console.log('📤 Output:', stdout);
      if (stderr) console.log('⚠️  Errors:', stderr);
      
      return { 
        success: true, 
        stdout: stdout || '', 
        stderr: stderr || '' 
      };
    } catch (error) {
      console.log('❌ WSL root command failed:', error.message);
      console.log('📤 Error output:', error.stdout || '');
      console.log('⚠️  Error stderr:', error.stderr || '');
      
      return { 
        success: false, 
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || ''
      };
    }
  });

  // Minimal new IPC for blocking setup flow using root user inside WSL
  ipcMain.handle('check-wsl', async () => {
    return await wslHelper.checkWSL();
  });

  ipcMain.handle('check-tools', async () => {
    return await toolInstaller.checkAllTools();
  });

  ipcMain.handle('install-tools', async (event) => {
    return await new Promise((resolve) => {
      toolInstaller.installAllTools((progress) => {
        try { if (event?.sender && !event.sender.isDestroyed()) event.sender.send('install-progress', progress); } catch {}
      }).then(resolve);
    });
  });

  // DNSTwist phishing detection handler - using comprehensive Python wrapper
  ipcMain.handle('phishing:runDnstwist', async (event, domain, password) => {
    console.log('🔍 [DNSTWIST] ===== STARTING COMPREHENSIVE PHISHING DETECTION =====');
    console.log('🔍 [DNSTWIST] Target domain:', domain);
    console.log('🔍 [DNSTWIST] Timestamp:', new Date().toISOString());
    
    try {
      // Extract domain from URL if needed
      let targetDomain = domain;
      try {
        const url = new URL(domain.startsWith('http') ? domain : `https://${domain}`);
        targetDomain = url.hostname.replace('www.', '');
      } catch (e) {
        // If URL parsing fails, use domain as-is
        targetDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      }
      
      console.log('🔍 [DNSTWIST] Processed domain:', targetDomain);
      
      // Send progress update to frontend
      if (event && event.sender) {
        event.sender.send('phishing:progress', { 
          stage: 'initializing', 
          message: 'Initializing comprehensive phishing detection...',
          progress: 5
        });
      }
      
      // Send progress update
      if (event && event.sender) {
        event.sender.send('phishing:progress', { 
          stage: 'checking', 
          message: 'Checking dnstwist and Python wrapper...',
          progress: 15
        });
      }
      
      // Check if dnstwist is installed using rootless WSL
      console.log('🔍 [DNSTWIST] Checking installation...');
      
      const isInstalled = await wslHelper.checkTool('dnstwist');
      
      if (!isInstalled) {
        console.log('❌ [DNSTWIST] dnstwist is not installed');
        console.log('🔍 [DNSTWIST] Attempting to install dnstwist using rootless WSL...');
        
        // Install dnstwist using rootless WSL (no password needed)
        {
          // Send progress update
          if (event && event.sender) {
            event.sender.send('phishing:progress', { 
              stage: 'installing', 
              message: 'Installing dnstwist...',
              progress: 20
            });
          }
          
          // Use rootless WSL installation
          console.log('🔍 [DNSTWIST] Installing dnstwist using rootless WSL...');
          
          try {
            // Update package lists first
            const updateRes = await wslHelper.runWSLAsRoot('DEBIAN_FRONTEND=noninteractive apt-get update -qq');
            if (!updateRes.success) {
              console.log('⚠️ [DNSTWIST] Package list update had issues, continuing anyway');
            }
            
            // Install dnstwist
            const installRes = await wslHelper.runWSLAsRoot('DEBIAN_FRONTEND=noninteractive apt-get install -y dnstwist', 120000);
            if (!installRes.success) {
              throw new Error(installRes.stderr || installRes.error || 'dnstwist installation failed');
            }
            
            console.log('✅ [DNSTWIST] dnstwist installation completed');
            
            // Wait a moment for installation to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Re-check installation using rootless WSL
            try {
              const recheckInstalled = await wslHelper.checkTool('dnstwist');
              if (!recheckInstalled) {
                throw new Error('dnstwist installation verification failed');
              }
              console.log('✅ [DNSTWIST] dnstwist verified after installation');
            } catch (recheckError) {
              console.log('⚠️ [DNSTWIST] Installation verification failed, proceeding anyway');
            }
          } catch (installError) {
            console.log('❌ [DNSTWIST] Installation failed:', installError.message);
            return { 
              success: false, 
              error: 'dnstwist is not installed and installation failed. Please install manually via: sudo apt install dnstwist',
              installed: false,
              details: installError.message || 'Installation failed'
            };
          }
        }
      } else {
        const pathResult = await wslHelper.runWSL('command -v dnstwist');
        console.log('✅ [DNSTWIST] dnstwist found at:', pathResult.stdout || 'installed');
      }
      
      // Send progress update
      if (event && event.sender) {
        event.sender.send('phishing:progress', { 
          stage: 'scanning', 
          message: 'Running comprehensive dnstwist analysis with all features...',
          progress: 30
        });
      }
      
      // Get Python wrapper path
      const wrapperPath = path.join(__dirname, '..', '..', 'backend', 'dnstwist_wrapper.py');
      const wrapperPathWSL = wrapperPath.replace(/\\/g, '/').replace(/^([A-Z]):/, (m, letter) => `/mnt/${letter.toLowerCase()}`);
      
      console.log('🔍 [DNSTWIST] Python wrapper path:', wrapperPath);
      console.log('🔍 [DNSTWIST] WSL wrapper path:', wrapperPathWSL);
      
      // Build command to run Python wrapper via WSL
      // FIXED: Use comma-separated fuzzers instead of 'all', and --ssdeep is handled by wrapper
      const commandParts = [
        'python3',
        wrapperPathWSL,
        '--fuzzers', '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain',
        '--registered',
        '--geoip',
        '--phash',
        '--screenshots',
        '--ssdeep',  // Wrapper converts this to --lsh ssdeep
        '--format', 'json',
        targetDomain
      ];
      
      console.log('🔍 [DNSTWIST] Executing Python wrapper via WSL');
      console.log('🔍 [DNSTWIST] Command:', commandParts.join(' '));
      
      // Execute using spawn - pass command parts directly to WSL
      const { spawn } = require('child_process');
      const child = spawn('C:\\Windows\\System32\\wsl.exe', commandParts, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: path.join(__dirname, '..', '..')
      });
      
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        try { 
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('phishing:log', output);
          }
        } catch {}
      });
      
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        try { 
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send('phishing:log', output);
          }
        } catch {}
      });
      
      const exitCode = await new Promise((resolve, reject) => {
        child.on('close', (code) => { resolve(code); });
        child.on('error', (error) => { reject(error); });
      });
      
      stdout = stdout.trim();
      stderr = stderr.trim();
      
      console.log('✅ [DNSTWIST] Python wrapper completed');
      console.log('📤 [DNSTWIST] STDOUT length:', stdout ? stdout.length : 0);
      if (stderr) console.log('⚠️ [DNSTWIST] STDERR:', stderr.substring(0, 500));
      
      // Send progress update
      if (event && event.sender) {
        event.sender.send('phishing:progress', { 
          stage: 'parsing', 
          message: 'Parsing comprehensive scan results...',
          progress: 70
        });
      }
      
      // Parse JSON output from Python wrapper
      let scanResults = null;
      try {
        // Find JSON in output (may have error messages before JSON)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scanResults = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON output found in Python wrapper response');
        }
        
        console.log(`✅ [DNSTWIST] Parsed comprehensive results`);
        console.log(`📊 [DNSTWIST] Found ${scanResults.statistics?.total_variations || 0} domain variations`);
        
        if (!scanResults.success) {
          throw new Error(scanResults.error || 'Python wrapper returned unsuccessful result');
        }
      } catch (parseError) {
        console.log('⚠️ [DNSTWIST] Failed to parse JSON output:', parseError.message);
        console.log('⚠️ [DNSTWIST] STDOUT:', stdout.substring(0, 1000));
        
        // Fallback: try basic dnstwist command
        console.log('⚠️ [DNSTWIST] Falling back to basic dnstwist command...');
        
        // Build basic command
        const basicCmd = ['dnstwist', '--format', 'json', '--registered', targetDomain];
        const basicChild = spawn('C:\\Windows\\System32\\wsl.exe', basicCmd, {
          stdio: ['ignore', 'pipe', 'pipe']
        });
        
        let basicStdout = '';
        let basicStderr = '';
        
        basicChild.stdout.on('data', (data) => {
          basicStdout += data.toString();
        });
        
        basicChild.stderr.on('data', (data) => {
          basicStderr += data.toString();
        });
        
        const basicExitCode = await new Promise((resolve, reject) => {
          basicChild.on('close', (code) => { resolve(code); });
          basicChild.on('error', (error) => { reject(error); });
        });
        
        if (basicExitCode === 0 && basicStdout.trim()) {
          try {
            const basicResults = JSON.parse(basicStdout.trim());
            // Build basic results structure
            scanResults = {
              success: true,
              target_url: domain,
              target_domain: targetDomain,
              timestamp: new Date().toISOString(),
              threat_score: 50,
              findings: [],
              domain_variations: Array.isArray(basicResults) ? basicResults.map(r => ({
                domain: r['domain-name'] || r.domain_name || r.domain || '',
                dns_a: r['dns-a'] || r.dns_a || r.a || [],
                dns_mx: r['dns-mx'] || r.dns_mx || r.mx || [],
                dns_ns: r['dns-ns'] || r.dns_ns || r.ns || [],
                fuzzer: r.fuzzer || 'unknown',
                active: ((r['dns-a'] || r.dns_a || r.a || []).length > 0 || 
                        (r['dns-mx'] || r.dns_mx || r.mx || []).length > 0 ||
                        (r['dns-ns'] || r.dns_ns || r.ns || []).length > 0)
              })) : [],
              statistics: {
                total_variations: Array.isArray(basicResults) ? basicResults.length : 0,
                active_domains: 0,
                inactive_domains: 0
              },
              recommendations: [],
              evidence: {
                scan_tool: 'dnstwist',
                scan_method: 'Basic typosquatting detection',
                raw_output_preview: basicStdout.substring(0, 1000)
              }
            };
          } catch (e) {
            throw new Error(`Failed to parse fallback output: ${parseError.message}`);
          }
        } else {
          throw new Error(`Python wrapper failed: ${parseError.message}. Fallback also failed.`);
        }
      }
      
      // Send progress update
      if (event && event.sender) {
        event.sender.send('phishing:progress', { 
          stage: 'complete', 
          message: 'Comprehensive scan completed successfully!',
          progress: 95
        });
      }
      
      console.log('✅ [DNSTWIST] Comprehensive scan completed successfully');
      console.log(`📊 [DNSTWIST] Threat score: ${scanResults.threat_score || 0}/100`);
      
      return {
        success: true,
        results: scanResults,
        installed: true
      };
      
    } catch (error) {
      console.log('❌ [DNSTWIST] Scan failed:', error.message);
      console.log('❌ [DNSTWIST] Error details:', error);
      
      return {
        success: false,
        error: error.message,
        installed: true,
        details: error.stdout || error.stderr || ''
      };
    }
  });

  // Convert JSON to user-readable text using tgpt
  ipcMain.handle('phishing:convertJsonToText', async (event, jsonData) => {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    try {
      console.log('📝 [TGPT] Converting JSON to user-readable text...');
      
      // Create a temporary JSON file
      const tempDir = os.tmpdir();
      const tempJsonFile = path.join(tempDir, `phishing-results-${Date.now()}.json`);
      fs.writeFileSync(tempJsonFile, JSON.stringify(jsonData, null, 2));
      
      // Try different ways to run tgpt
      let tgptCommand = null;
      let tgptArgs = [];
      
      // Try python -m tgpt first
      try {
        const { execSync } = require('child_process');
        execSync('python -m tgpt --version', { stdio: 'ignore', timeout: 3000 });
        tgptCommand = 'python';
        tgptArgs = ['-m', 'tgpt', '--json', tempJsonFile];
      } catch (e1) {
        try {
          execSync('python3 -m tgpt --version', { stdio: 'ignore', timeout: 3000 });
          tgptCommand = 'python3';
          tgptArgs = ['-m', 'tgpt', '--json', tempJsonFile];
        } catch (e2) {
          try {
            execSync('tgpt --version', { stdio: 'ignore', timeout: 3000 });
            tgptCommand = 'tgpt';
            tgptArgs = ['--json', tempJsonFile];
          } catch (e3) {
            throw new Error('tgpt tool not found. Please install it using: pip install tgpt');
          }
        }
      }
      
      console.log(`📝 [TGPT] Using command: ${tgptCommand} ${tgptArgs.join(' ')}`);
      
      // Run tgpt to convert JSON to readable text
      return new Promise((resolve, reject) => {
        const tgptProcess = spawn(tgptCommand, tgptArgs, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        tgptProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        tgptProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        tgptProcess.on('close', (code) => {
          // Clean up temp file
          try {
            if (fs.existsSync(tempJsonFile)) {
              fs.unlinkSync(tempJsonFile);
            }
          } catch (cleanupError) {
            console.log('⚠️ [TGPT] Failed to cleanup temp file:', cleanupError.message);
          }
          
          if (code === 0 && stdout.trim()) {
            console.log('✅ [TGPT] Successfully converted JSON to readable text');
            resolve({
              success: true,
              readableText: stdout.trim()
            });
          } else {
            // If tgpt doesn't work as expected, create a simple readable format
            console.log('⚠️ [TGPT] tgpt returned non-zero or empty output, creating fallback readable format');
            const fallbackText = createReadablePhishingReport(jsonData);
            resolve({
              success: true,
              readableText: fallbackText,
              fallback: true
            });
          }
        });
        
        tgptProcess.on('error', (error) => {
          // Clean up temp file
          try {
            if (fs.existsSync(tempJsonFile)) {
              fs.unlinkSync(tempJsonFile);
            }
          } catch (cleanupError) {
            console.log('⚠️ [TGPT] Failed to cleanup temp file:', cleanupError.message);
          }
          
          console.log('⚠️ [TGPT] Error running tgpt, using fallback:', error.message);
          const fallbackText = createReadablePhishingReport(jsonData);
          resolve({
            success: true,
            readableText: fallbackText,
            fallback: true
          });
        });
      });
      
    } catch (error) {
      console.log('❌ [TGPT] Error:', error.message);
      // Fallback: create a simple readable format
      const fallbackText = createReadablePhishingReport(jsonData);
      return {
        success: true,
        readableText: fallbackText,
        fallback: true,
        error: error.message
      };
    }
  });

  // Convert JSON to user-readable text using tgpt for malware/defacement scans
  ipcMain.handle('maldef:convertJsonToText', async (event, jsonData) => {
    const { spawn } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    try {
      console.log('📝 [TGPT] Converting malware/defacement JSON to user-readable text...');
      
      // Create a temporary JSON file
      const tempDir = os.tmpdir();
      const tempJsonFile = path.join(tempDir, `maldef-results-${Date.now()}.json`);
      fs.writeFileSync(tempJsonFile, JSON.stringify(jsonData, null, 2));
      
      // Try different ways to run tgpt
      let tgptCommand = null;
      let tgptArgs = [];
      
      // Try python -m tgpt first
      try {
        const { execSync } = require('child_process');
        execSync('python -m tgpt --version', { stdio: 'ignore', timeout: 3000 });
        tgptCommand = 'python';
        tgptArgs = ['-m', 'tgpt', '--json', tempJsonFile];
      } catch (e1) {
        try {
          execSync('python3 -m tgpt --version', { stdio: 'ignore', timeout: 3000 });
          tgptCommand = 'python3';
          tgptArgs = ['-m', 'tgpt', '--json', tempJsonFile];
        } catch (e2) {
          try {
            execSync('tgpt --version', { stdio: 'ignore', timeout: 3000 });
            tgptCommand = 'tgpt';
            tgptArgs = ['--json', tempJsonFile];
          } catch (e3) {
            throw new Error('tgpt tool not found. Please install it using: pip install tgpt');
          }
        }
      }
      
      console.log(`📝 [TGPT] Using command: ${tgptCommand} ${tgptArgs.join(' ')}`);
      
      // Run tgpt to convert JSON to readable text
      return new Promise((resolve, reject) => {
        const tgptProcess = spawn(tgptCommand, tgptArgs, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        });
        
        let stdout = '';
        let stderr = '';
        
        tgptProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        tgptProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        tgptProcess.on('close', (code) => {
          // Clean up temp file
          try {
            if (fs.existsSync(tempJsonFile)) {
              fs.unlinkSync(tempJsonFile);
            }
          } catch (cleanupError) {
            console.log('⚠️ [TGPT] Failed to cleanup temp file:', cleanupError.message);
          }
          
          if (code === 0 && stdout.trim()) {
            console.log('✅ [TGPT] Successfully converted JSON to readable text');
            resolve({
              success: true,
              readableText: stdout.trim()
            });
          } else {
            // If tgpt doesn't work as expected, create a simple readable format
            console.log('⚠️ [TGPT] tgpt returned non-zero or empty output, creating fallback readable format');
            const fallbackText = createReadableMaldefReport(jsonData);
            resolve({
              success: true,
              readableText: fallbackText,
              fallback: true
            });
          }
        });
        
        tgptProcess.on('error', (error) => {
          // Clean up temp file
          try {
            if (fs.existsSync(tempJsonFile)) {
              fs.unlinkSync(tempJsonFile);
            }
          } catch (cleanupError) {
            console.log('⚠️ [TGPT] Failed to cleanup temp file:', cleanupError.message);
          }
          
          console.log('⚠️ [TGPT] Error running tgpt, using fallback:', error.message);
          const fallbackText = createReadableMaldefReport(jsonData);
          resolve({
            success: true,
            readableText: fallbackText,
            fallback: true
          });
        });
      });
      
    } catch (error) {
      console.log('❌ [TGPT] Error:', error.message);
      // Fallback: create a simple readable format
      const fallbackText = createReadableMaldefReport(jsonData);
      return {
        success: true,
        readableText: fallbackText,
        fallback: true,
        error: error.message
      };
    }
  });

  // Helper function to create readable malware/defacement report from JSON
  function createReadableMaldefReport(jsonData) {
    let report = '═══════════════════════════════════════════════════════════════\n';
    report += '      MALWARE & DEFACEMENT DETECTION REPORT\n';
    report += '═══════════════════════════════════════════════════════════════\n\n';
    
    // Metadata
    if (jsonData.metadata) {
      const meta = jsonData.metadata;
      if (meta.target) {
        report += `Target URL: ${meta.target}\n`;
      }
      if (meta.timestamp) {
        report += `Scan Date: ${new Date(meta.timestamp).toLocaleString()}\n`;
      }
      if (meta.scanDuration) {
        report += `Scan Duration: ${(meta.scanDuration / 1000).toFixed(2)} seconds\n`;
      }
      if (meta.toolsUsed && meta.toolsUsed.length > 0) {
        report += `Tools Used: ${meta.toolsUsed.join(', ')}\n`;
      }
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'SUMMARY\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.summary) {
      const summary = jsonData.summary;
      report += `Overall Status: ${summary.status || 'Unknown'}\n`;
      report += `Risk Score: ${summary.riskScore || 0}/100\n`;
      report += `Severity: ${summary.severity || 'Unknown'}\n`;
      report += `Total Findings: ${summary.totalFindings || 0}\n`;
      if (summary.malwareStatus) {
        report += `Malware Status: ${summary.malwareStatus}\n`;
      }
      if (summary.defacementStatus) {
        report += `Defacement Status: ${summary.defacementStatus}\n`;
      }
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'MALWARE FINDINGS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.findings?.malware) {
      const malware = jsonData.findings.malware;
      report += `Total Malware Findings: ${malware.count || 0}\n\n`;
      
      // ClamAV findings
      if (jsonData.detailed?.malware?.clamav) {
        const clamav = jsonData.detailed.malware.clamav;
        report += `ClamAV Scan:\n`;
        report += `  Status: ${clamav.exitCode === 0 ? 'Completed' : 'Failed'}\n`;
        report += `  Infected Files: ${clamav.infectedCount || 0}\n`;
        if (clamav.infectedFiles && clamav.infectedFiles.length > 0) {
          report += `  Infected Files List:\n`;
          clamav.infectedFiles.forEach((file, idx) => {
            report += `    ${idx + 1}. ${file.file || file}\n`;
            if (file.signature) {
              report += `       Signature: ${file.signature}\n`;
            }
          });
        }
        report += '\n';
      }
      
      // YARA findings
      if (jsonData.detailed?.malware?.yara) {
        const yara = jsonData.detailed.malware.yara;
        report += `YARA Scan:\n`;
        report += `  Status: ${yara.exitCode === 0 ? 'Completed' : 'Failed'}\n`;
        report += `  Matches: ${yara.matchCount || 0}\n`;
        if (yara.matches && yara.matches.length > 0) {
          report += `  Pattern Matches:\n`;
          yara.matches.forEach((match, idx) => {
            report += `    ${idx + 1}. Rule: ${match.rule || 'Unknown'}\n`;
            if (match.file) {
              report += `       File: ${match.file}\n`;
            }
          });
        }
        report += '\n';
      }
    } else {
      report += 'No malware findings.\n\n';
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'DEFACEMENT FINDINGS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.findings?.defacement) {
      const defacement = jsonData.findings.defacement;
      report += `Status: ${defacement.changed ? 'CHANGED' : 'NORMAL'}\n`;
      report += `Message: ${defacement.message || 'No changes detected'}\n`;
      
      if (defacement.changes && defacement.changes.length > 0) {
        report += `\nChanges Detected:\n`;
        defacement.changes.forEach((change, idx) => {
          report += `  ${idx + 1}. ${change.type || 'Change'}\n`;
          if (change.file) {
            report += `     File: ${change.file}\n`;
          }
          if (change.description) {
            report += `     Description: ${change.description}\n`;
          }
        });
      }
    } else if (jsonData.comparison) {
      const comparison = jsonData.comparison;
      report += `Status: ${comparison.changed ? 'CHANGED' : 'NORMAL'}\n`;
      report += `Message: ${comparison.message || 'No changes detected'}\n`;
      
      if (comparison.changes && comparison.changes.length > 0) {
        report += `\nChanges Detected:\n`;
        comparison.changes.forEach((change, idx) => {
          report += `  ${idx + 1}. ${change.type || 'Change'}\n`;
          if (change.file) {
            report += `     File: ${change.file}\n`;
          }
          if (change.description) {
            report += `     Description: ${change.description}\n`;
          }
        });
      }
    } else {
      report += 'No defacement findings.\n';
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'RECOMMENDATIONS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.recommendations && Array.isArray(jsonData.recommendations) && jsonData.recommendations.length > 0) {
      jsonData.recommendations.forEach((rec, index) => {
        if (typeof rec === 'string') {
          report += `${index + 1}. ${rec}\n`;
        } else if (rec.action) {
          report += `${index + 1}. [${rec.priority || 'medium'}] ${rec.action}\n`;
          if (rec.details) {
            report += `   Details: ${rec.details}\n`;
          }
          if (rec.steps && Array.isArray(rec.steps)) {
            rec.steps.forEach(step => {
              report += `   ${step}\n`;
            });
          }
        }
      });
    } else {
      report += '• Continue regular monitoring\n';
      report += '• Keep security tools updated\n';
      report += '• Review file permissions regularly\n';
      report += '• Implement automated scanning\n';
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'EXECUTED COMMANDS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.metadata?.executedCommands && Array.isArray(jsonData.metadata.executedCommands)) {
      jsonData.metadata.executedCommands.forEach((cmd, idx) => {
        report += `${idx + 1}. Tool: ${cmd.tool || 'Unknown'}\n`;
        report += `   Command: ${cmd.command || 'N/A'}\n`;
        report += `   Exit Code: ${cmd.exitCode !== undefined ? cmd.exitCode : 'N/A'}\n`;
        if (cmd.description) {
          report += `   Description: ${cmd.description}\n`;
        }
        report += '\n';
      });
    } else {
      report += 'No command details available.\n';
    }
    
    report += '\n═══════════════════════════════════════════════════════════════\n';
    report += 'Report Generated by CyberGuard Malware & Defacement Monitor\n';
    report += '═══════════════════════════════════════════════════════════════\n';
    
    return report;
  }

  // Helper function to create readable phishing report from JSON
  function createReadablePhishingReport(jsonData) {
    let report = '═══════════════════════════════════════════════════════════════\n';
    report += '           PHISHING DETECTION REPORT\n';
    report += '═══════════════════════════════════════════════════════════════\n\n';
    
    if (jsonData.target_url) {
      report += `Target URL: ${jsonData.target_url}\n`;
    }
    if (jsonData.target_domain) {
      report += `Target Domain: ${jsonData.target_domain}\n`;
    }
    if (jsonData.timestamp) {
      report += `Scan Date: ${new Date(jsonData.timestamp).toLocaleString()}\n`;
    }
    if (jsonData.threat_score !== undefined) {
      report += `Threat Score: ${jsonData.threat_score}/100\n`;
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'SUMMARY\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.statistics) {
      const stats = jsonData.statistics;
      report += `Total Domain Variations Found: ${stats.total_variations || 0}\n`;
      report += `Active Domains: ${stats.active_domains || 0}\n`;
      report += `Inactive Domains: ${stats.inactive_domains || 0}\n`;
      if (stats.suspicious_domains) {
        report += `Suspicious Domains: ${stats.suspicious_domains}\n`;
      }
      if (stats.ssl_issues) {
        report += `SSL Issues Found: ${stats.ssl_issues}\n`;
      }
      if (stats.visual_matches) {
        report += `Visual Matches: ${stats.visual_matches}\n`;
      }
      if (stats.content_matches) {
        report += `Content Matches: ${stats.content_matches}\n`;
      }
    }
    
    report += '\n───────────────────────────────────────────────────────────────\n';
    report += 'FINDINGS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.findings && Array.isArray(jsonData.findings) && jsonData.findings.length > 0) {
      jsonData.findings.forEach((finding, index) => {
        report += `${index + 1}. ${finding.type || 'Finding'}\n`;
        report += `   Severity: ${finding.severity || 'Unknown'}\n`;
        if (finding.evidence) {
          report += `   Evidence: ${finding.evidence}\n`;
        }
        if (finding.count !== undefined) {
          report += `   Count: ${finding.count}\n`;
        }
        report += '\n';
      });
    } else {
      report += 'No specific findings reported.\n\n';
    }
    
    report += '───────────────────────────────────────────────────────────────\n';
    report += 'DOMAIN VARIATIONS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.domain_variations && Array.isArray(jsonData.domain_variations) && jsonData.domain_variations.length > 0) {
      jsonData.domain_variations.slice(0, 20).forEach((variation, index) => {
        report += `${index + 1}. ${variation.domain || variation.domain_name || 'Unknown'}\n`;
        report += `   Fuzzer: ${variation.fuzzer || 'Unknown'}\n`;
        report += `   Active: ${variation.active ? 'Yes' : 'No'}\n`;
        if (variation.risk_score !== undefined) {
          report += `   Risk Score: ${variation.risk_score}/100\n`;
        }
        if (variation.phash_similarity !== undefined) {
          report += `   Visual Similarity: ${variation.phash_similarity}%\n`;
        }
        if (variation.lsh_similarity !== undefined) {
          report += `   Content Similarity: ${variation.lsh_similarity}%\n`;
        }
        if (variation.attack_category) {
          report += `   Attack Category: ${variation.attack_category}\n`;
        }
        report += '\n';
      });
      
      if (jsonData.domain_variations.length > 20) {
        report += `... and ${jsonData.domain_variations.length - 20} more domain variations.\n\n`;
      }
    } else {
      report += 'No domain variations found.\n\n';
    }
    
    report += '───────────────────────────────────────────────────────────────\n';
    report += 'RECOMMENDATIONS\n';
    report += '───────────────────────────────────────────────────────────────\n\n';
    
    if (jsonData.recommendations && Array.isArray(jsonData.recommendations) && jsonData.recommendations.length > 0) {
      jsonData.recommendations.forEach((rec, index) => {
        report += `${index + 1}. ${rec}\n`;
      });
    } else {
      report += '• Monitor the identified domain variations regularly\n';
      report += '• Consider registering high-risk variations to prevent abuse\n';
      report += '• Implement email security measures to detect phishing attempts\n';
      report += '• Educate users about typosquatting and phishing threats\n';
    }
    
    report += '\n═══════════════════════════════════════════════════════════════\n';
    report += 'Report Generated by CyberGuard Phishing Detection System\n';
    report += '═══════════════════════════════════════════════════════════════\n';
    
    return report;
  }

  // Secure WSL root execution handler used by WordPress audit tools
  ipcMain.handle('wsl-run-as-root', async (event, { distro, command, requireConfirm = true }) => {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const { dialog, BrowserWindow } = require('electron');

    if (!command || typeof command !== 'string' || command.trim().length === 0) {
      return { success: false, error: 'Invalid command' };
    }

    // Optional confirmation dialog to show the exact command
    if (requireConfirm) {
      const win = BrowserWindow.getFocusedWindow();
      const { response } = await dialog.showMessageBox(win || null, {
        type: 'question',
        buttons: ['Run', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: 'Run command as root in WSL',
        message: 'You are about to run the following command as root in WSL:',
        detail: command
      });
      if (response !== 0) {
        return { success: false, error: 'User cancelled' };
      }
    }

    try {
      // Execute command directly in WSL root environment (like nmap)
      // Split command into executable and arguments
      const parts = command.trim().split(/\s+/);
      const executable = parts[0];
      const args = parts.slice(1);

      const runInDistro = async (targetDistro) => {
        const base = targetDistro ? `wsl -d ${targetDistro} -u root` : `wsl -u root`;
        const fullCommand = `${base} -- ${executable} ${args.join(' ')}`;
        const start = Date.now();
        
        // Check if this is a subdomain enumeration command (amass enum)
        // For subdomain enumeration, use no timeout to allow full completion
        const isSubdomainEnum = command.includes('amass enum') || command.includes('amass_subdomains');
        const execOptions = { 
          windowsHide: true, 
          maxBuffer: 10 * 1024 * 1024 
        };
        
        // For subdomain enumeration, don't set a timeout (let it run to completion)
        // For other commands, use default behavior (no explicit timeout means Node.js will wait)
        if (!isSubdomainEnum) {
          // For other commands, you can optionally set a timeout here if needed
          // execOptions.timeout = 300000; // 5 minutes default
        }
        
        const { stdout, stderr } = await execAsync(fullCommand, execOptions);
        const duration = Date.now() - start;
        return { success: true, stdout, stderr, code: 0, timedOut: false, duration };
      };

      // First try with provided distro (if any)
      try {
        return await runInDistro(distro);
      } catch (primaryError) {
        // If a specific distro was requested and failed, retry once in default distro (no -d)
        try {
          const fallback = await runInDistro(null);
          return fallback;
        } catch (fallbackError) {
          return {
            success: false,
            stdout: fallbackError.stdout,
            stderr: fallbackError.stderr,
            code: typeof fallbackError.code === 'number' ? fallbackError.code : 1,
            timedOut: false,
            duration: 0,
            error: fallbackError.message
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        stdout: error.stdout,
        stderr: error.stderr,
        code: typeof error.code === 'number' ? error.code : 1,
        timedOut: false,
        duration: 0,
        error: error.message
      };
    }
  });

  // Tool checking handlers for the new tool checker
  ipcMain.handle('tools:checkTool', async (event, toolName, password) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      let command;
      if (password) {
        // Use provided password with default WSL user
        command = `echo "${password}" | wsl command -v "${toolName}"`;
      } else {
        // Try without credentials (for already authenticated sessions)
        command = `wsl command -v "${toolName}"`;
      }
      
      console.log(`🔍 Checking tool: ${toolName}`);
      console.log('📝 Command:', command.replace(password || '', '***'));
      
      const { stdout } = await execAsync(command);
      const toolPath = stdout.trim();
      
      if (toolPath) {
        console.log(`✅ ${toolName} found at: ${toolPath}`);
        return { installed: true, path: toolPath };
      } else {
        console.log(`❌ ${toolName} not found`);
        return { installed: false };
      }
    } catch (error) {
      console.log(`❌ Error checking ${toolName}:`, error.message);
      return { installed: false };
    }
  });

  ipcMain.handle('tools:installTools', async (event, aptCommand, goCommands, password) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      console.log('🔧 Installing security tools...');
      console.log('📋 APT Command:', aptCommand);
      
      let wslAptCommand;
      if (password) {
        // Use provided password with default WSL user
        wslAptCommand = `echo "${password}" | wsl ${aptCommand}`;
      } else {
        // Try without credentials (for already authenticated sessions)
        wslAptCommand = `wsl ${aptCommand}`;
      }
      
      console.log('📝 Full Command:', wslAptCommand.replace(password || '', '***'));
      console.log('⏳ Executing APT installation...');
      
      const { stdout, stderr } = await execAsync(wslAptCommand);
      
      console.log('📤 APT Output:', stdout);
      if (stderr && !stderr.includes('already installed')) {
        console.log('⚠️  APT Warnings:', stderr);
      }
      
      console.log('✅ Basic tools installation completed');
      
      // Install Go-based tools if Go is available
      try {
        let goCheckCommand;
        if (password) {
          goCheckCommand = `echo "${password}" | wsl command -v go`;
        } else {
          goCheckCommand = `wsl command -v go`;
        }
        
        console.log('🔍 Checking for Go...');
        console.log('📝 Command:', goCheckCommand.replace(password || '', '***'));
        
        await execAsync(goCheckCommand);
        console.log('✅ Go is available, installing Go-based tools...');
        
        for (const cmd of goCommands) {
          try {
            let goInstallCommand;
            if (password) {
              goInstallCommand = `echo "${password}" | wsl ${cmd}`;
            } else {
              goInstallCommand = `wsl ${cmd}`;
            }
            
            console.log(`🔧 Installing Go tool: ${cmd}`);
            console.log('📝 Command:', goInstallCommand.replace(password || '', '***'));
            
            const { stdout: goStdout, stderr: goStderr } = await execAsync(goInstallCommand);
            console.log('📤 Go Output:', goStdout);
            if (goStderr) console.log('⚠️  Go Warnings:', goStderr);
            console.log('✅ Go tool installed successfully');
          } catch (error) {
            console.log(`❌ Failed to install Go tool ${cmd}:`, error.message);
          }
        }
      } catch (goError) {
        console.log('⚠️  Go not available, skipping Go-based tools installation');
      }
      
      console.log('🎉 All tool installations completed');
      return { success: true };
    } catch (error) {
      console.error('❌ Tool installation failed:', error.message);
      console.error('📤 Error output:', error.stdout || '');
      console.error('⚠️  Error stderr:', error.stderr || '');
      
      // Check if it's an authentication error
      if (error.message.includes('sudo is disabled') || error.message.includes('authentication')) {
        return { 
          success: false, 
          error: error.message,
          requiresAuth: true,
          message: 'WSL authentication required. Please provide credentials.'
        };
      }
      
      return { success: false, error: error.message };
    }
  });

  // Auto-install all tools
  ipcMain.handle('tools:autoInstallAll', async (event) => {
    try {
      const autoInstallerPath = path.join(process.cwd(), 'auto-install-tools.js');
      const { spawn } = require('child_process');
      
      console.log('Auto-install: Starting installer at', autoInstallerPath);
      
      event.sender.send('tools:autoInstallProgress', { 
        stage: 'starting', 
        message: 'Starting automatic installation of all tools...' 
      });
      
      return new Promise((resolve) => {
        const child = spawn('node', [autoInstallerPath], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        });
        
        let output = '';
        
        child.stdout.on('data', (data) => {
          const text = data.toString();
          output += text;
          console.log('Auto-install stdout:', text);
          
          // Split by lines and send each line as a separate progress message
          const lines = text.split('\n').filter(line => line.trim());
          lines.forEach(line => {
            console.log('Sending progress message:', line.trim());
            event.sender.send('tools:autoInstallProgress', { 
              stage: 'progress', 
              message: line.trim() 
            });
          });
        });
        
        child.stderr.on('data', (data) => {
          const text = data.toString();
          console.log('Auto-install stderr:', text);
          
          // Split by lines and send each line as a separate error message
          const lines = text.split('\n').filter(line => line.trim());
          lines.forEach(line => {
            event.sender.send('tools:autoInstallProgress', { 
              stage: 'error', 
              message: line.trim() 
            });
          });
        });
        
        child.on('close', (code) => {
          console.log('Auto-install process closed with code:', code);
          if (code === 0) {
            event.sender.send('tools:autoInstallProgress', { 
              stage: 'complete', 
              message: 'All tools installed successfully!' 
            });
            resolve({ success: true, output });
          } else {
            event.sender.send('tools:autoInstallProgress', { 
              stage: 'error', 
              message: `Installation failed with code ${code}` 
            });
            resolve({ success: false, output, error: `Process exited with code ${code}` });
          }
        });
        
        child.on('error', (error) => {
          console.log('Auto-install process error:', error);
          event.sender.send('tools:autoInstallProgress', { 
            stage: 'error', 
            message: `Failed to start installer: ${error.message}` 
          });
          resolve({ success: false, error: error.message });
        });
      });
    } catch (error) {
      console.error('Error in auto-install:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('tools:installMissing', async (event, selectedTools) => {
    try {
      const { runShell, TOOLS } = require(path.join(__dirname, '..', 'tools', 'cursor-installer.js'));
      const os = require('os');
      const isWindows = os.platform() === 'win32';
      
      const results = [];
      
      // Check if WSL is available for Windows users
      let wslAvailable = false;
      if (isWindows) {
        try {
          await runShell('wsl --status', false);
          wslAvailable = true;
        } catch (e) {
          console.log('WSL not available for tool installation');
        }
      }
      
      for (const toolName of selectedTools) {
        const tool = TOOLS.find(t => t.name === toolName);
        if (!tool) continue;
        
        event.sender.send('tools:installProgress', { 
          tool: toolName, 
          status: 'installing', 
          message: `Installing ${toolName}...` 
        });
        
        // Choose the right installation command based on platform and tool type
        let installCmd = tool.install;
        if (isWindows) {
          if (tool.type === 'wsl' && wslAvailable) {
            installCmd = tool.install; // Use WSL command
          } else if (tool.type === 'winget') {
            installCmd = tool.install; // Use winget command
          } else if (tool.wslInstall && wslAvailable) {
            installCmd = tool.wslInstall; // Fallback to WSL
          }
        }
        
        const result = await runShell(installCmd, false);
        
        if (result.ok) {
          event.sender.send('tools:installProgress', { 
            tool: toolName, 
            status: 'success', 
            message: `${toolName} installed successfully` 
          });
          results.push({ tool: toolName, success: true });
        } else {
          let errorMessage = `${toolName} installation failed`;
          if (isWindows && !wslAvailable && tool.type === 'wsl') {
            errorMessage += ' - WSL not available. Please install WSL and Kali Linux first.';
          } else {
            errorMessage += `: ${result.out}`;
          }
          
          event.sender.send('tools:installProgress', { 
            tool: toolName, 
            status: 'error', 
            message: errorMessage
          });
          results.push({ tool: toolName, success: false, error: result.out });
        }
      }
      
      return { results, wslAvailable };
    } catch (error) {
      console.error('Error installing tools:', error);
      return { error: error.message };
    }
  });


  // Save-as for report files
  ipcMain.handle('report:saveAs', async (event, sourcePath, defaultName) => {
    try {
      // Determine file type from extension
      const ext = path.extname(sourcePath).toLowerCase();
      let filters = [{ name: 'All Files', extensions: ['*'] }];
      
      if (ext === '.pdf') {
        filters = [{ name: 'PDF Files', extensions: ['pdf'] }, { name: 'All Files', extensions: ['*'] }];
      } else if (ext === '.html') {
        filters = [{ name: 'HTML Files', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }];
      } else if (ext === '.json') {
        filters = [{ name: 'JSON Files', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }];
      } else if (ext === '.txt') {
        filters = [{ name: 'Text Files', extensions: ['txt'] }, { name: 'All Files', extensions: ['*'] }];
      }
      
      const { canceled, filePath } = await dialog.showSaveDialog({
        defaultPath: defaultName || path.basename(sourcePath),
        filters: filters
      });
      
      if (canceled || !filePath) return { canceled: true };
      
      // Check if source file exists
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file not found: ${sourcePath}`);
      }
      
      await fs.promises.copyFile(sourcePath, filePath);
      console.log(`Report saved: ${sourcePath} -> ${filePath}`);
      return { ok: true, filePath };
    } catch (e) {
      console.error('Error saving report:', e);
      return { error: e?.message || String(e) };
    }
  });

  ipcMain.handle('scan:cancel', () => {
    if (scanChild) {
      try { scanChild.kill('SIGINT'); } catch {}
      scanChild = null;
      return true;
    }
    return false;
  });

  // Port scan handlers
  let portScanChild = null;
  ipcMain.handle('portscan:start', async (event, target) => {
    if (portScanChild) return { error: 'Port scan already running' };
    
    try {
      // Import the port scan module
      const portScanModule = require(path.join(__dirname, '..', 'scanners', 'port-scan.js'));
      
      // Run the port scan asynchronously
      const runPortScanAsync = async () => {
        try {
          event.sender.send('portscan:progress', { stage: 'starting', message: 'Initializing port scan...' });
          
          // Create a temporary directory for port scan
          const tempDir = path.join(process.cwd(), 'temp-scans')
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true })
          }
          
          const result = await portScanModule.runPortScan(target, {
            outputDir: tempDir, // Use temporary directory
            onProgress: (update) => {
              event.sender.send('portscan:progress', update);
            },
            dryRun: false,
            // Ensure full-range scan when fallback is used
            fullPortScan: true,
            // Tuneables: keep reasonable to avoid overwhelming network/OS
            concurrency: 300,
            timeout: 1000,
            startPort: 1,
            endPort: 65535,
            runVulnScripts: false
          });
          
          event.sender.send('portscan:done', { success: true, summary: 'Port scan completed successfully', result });
        } catch (error) {
          event.sender.send('portscan:progress', { stage: 'error', message: error.message });
          event.sender.send('portscan:done', null);
        } finally {
          // Clean up temporary directory
          try {
            if (fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError.message);
          }
        }
      };
      
      // Run in background
      runPortScanAsync();
      
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  });

  // Malware & Defacement orchestrated scan
  ipcMain.handle('maldef:start', async (event, url) => {
    try {
      const { runMaldefScan } = require(path.join(__dirname, '..', 'maldef', 'orchestrator.js'))
      const outRoot = path.join(process.cwd(), 'temp-scans')
      const report = await runMaldefScan(url, {
        outRoot,
        onProgress: (u) => event.sender.send('maldef:progress', u)
      })
      event.sender.send('maldef:done', report)
      return { ok: true }
    } catch (e) {
      event.sender.send('maldef:progress', { stage: 'error', message: e?.message || String(e) })
      event.sender.send('maldef:done', null)
      return { error: e?.message || String(e) }
    }
  })


  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
