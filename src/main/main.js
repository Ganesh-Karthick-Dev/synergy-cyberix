const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const { spawn } = require('child_process');
const { detectPlatform, checkWslInstalled, installWsl } = require('./osCheck');
require('dotenv').config();

const isDev = process.env.NODE_ENV !== 'production';

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
    const encryptedData = encryptPassword(password);
    const passwordFile = getPasswordFilePath();
    fs.writeFileSync(passwordFile, JSON.stringify(encryptedData));
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
    const sp = require('child_process').spawnSync('wsl', ['--status'], { 
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
    const sp2 = require('child_process').spawnSync('wsl', ['-l', '-v'], { 
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
    const sp3 = require('child_process').spawnSync('wsl', ['-l'], { 
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
    const sp4 = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'echo', 'kali-detected'], { 
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

// Helper: automatically install Kali Linux
async function installKaliLinux() {
  return new Promise((resolve) => {
    console.log('🚀 Starting automatic Kali Linux installation...');
    
    // Use wsl --install -d kali-linux for automatic installation
    const installProcess = require('child_process').spawn('wsl', ['--install', '-d', 'kali-linux'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let errorOutput = '';
    
    installProcess.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('Kali install stdout:', text);
    });
    
    installProcess.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.log('Kali install stderr:', text);
    });
    
    installProcess.on('close', (code) => {
      console.log(`Kali installation process exited with code ${code}`);
      if (code === 0) {
        console.log('✅ Kali Linux installation completed successfully');
        resolve(true);
      } else {
        console.log('❌ Kali Linux installation failed');
        console.log('Error output:', errorOutput);
        resolve(false);
      }
    });
    
    installProcess.on('error', (err) => {
      console.log('❌ Kali Linux installation error:', err.message);
      resolve(false);
    });
  });
}

// Global icon path for notifications
const iconPath = path.join(__dirname, '..', 'assets', 'logo', 'icons8-security-shield-64.png');

async function createMainWindow() {

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // In development, load from Vite dev server
  if (isDev) {
    // Try multiple ports that Vite might use
    const ports = [6977, 6969, 6970, 6971, 6972, 6973, 6974, 6975, 6976, 6978, 5173, 3000];
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
    const indexFile = path.join(__dirname, '..', 'renderer', 'index.html');
    mainWindow.loadFile(indexFile);
  }

  // For debugging
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorDescription)
    if (isDev) {
      setTimeout(() => {
        console.log('Attempting to reload from current Vite port...')
        // Try to reload from the current Vite port (6977 based on terminal output)
        mainWindow.loadURL('http://localhost:6977/')
      }, 1000)
    }
  })

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
        
        const prompt = `You are an expert security analyst. I have executed a security scan command and received raw output. Your task is to analyze this raw output and create a comprehensive, detailed, and user-friendly security report in JSON format.

SCAN TYPE: ${commandName}

COMMAND EXECUTED: ${command}

RAW SCAN OUTPUT:
${rawResult}

INSTRUCTIONS:
1. First, explain WHAT WE DID: Describe the security scan command that was executed and what it was trying to discover or test. Make it clear and understandable for the user.
2. Then, explain WHAT WE GOT: Analyze the raw output above thoroughly and explain what the results mean in simple terms. Help the user understand what the scan discovered.
3. Create a detailed JSON report that is comprehensive, user-friendly, and easy to understand
4. DO NOT include the Kali Linux command or command syntax in your output
5. Focus on translating technical scan results into clear, understandable information
6. Include ALL details found in the raw output - nothing should be omitted
7. Structure the JSON in a logical way that makes sense for this type of scan
8. Use clear, non-technical language where possible, but maintain accuracy
9. Provide detailed explanations, findings, vulnerabilities, and recommendations
10. Include specific values, IPs, ports, services, versions, and any other data found in the scan
11. Make the report actionable with clear recommendations
12. For port scans, extract all port information (port number, state, service, version) in a structured format

REQUIREMENTS:
- The JSON must be valid and parseable
- Include a "whatWeDid" field explaining the scan purpose in user-friendly terms
- Include a "whatWeGot" field explaining the results meaning in simple terms
- Include a summary section with key findings
- List all findings with detailed descriptions
- Identify any security vulnerabilities or concerns
- Provide actionable recommendations
- Include all technical details from the scan in a user-friendly format
- For port scans, include a "ports" array with port details (number, state, service, version, etc.)
- Do NOT include generic responses - base everything on the actual scan results
- Do NOT include the command itself in the output

Create a comprehensive JSON report that covers all aspects of the scan results. Structure it however makes the most sense for this type of scan, but ensure it includes:
- whatWeDid: Explanation of what the scan command does
- whatWeGot: Explanation of what the results mean
- Summary of findings
- Detailed findings with all relevant information
- Security vulnerabilities or concerns (if any)
- Recommendations for improvement
- For port scans: ports array with detailed port information
- Any other relevant sections that would help a user understand the scan results

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
          
          // Send notification after scan completion
          try {
            if (Notification.isSupported()) {
              const notification = new Notification({
                title: 'Network Scan Completed',
                body: `Network scan for ${target} has been completed successfully.`,
                icon: iconPath,
                urgency: 'normal',
                timeoutType: 'default'
              });
              
              notification.on('click', () => {
                if (mainWindowInstance) {
                  mainWindowInstance.show();
                  mainWindowInstance.focus();
                }
              });
              
              notification.show();
              notificationCount++;
              updateBadgeCount(notificationCount);
              console.log('[SUCCESS] [NOTIFICATION] Network scan completion notification shown');
            }
          } catch (notifError) {
            console.log('[WARNING] [NOTIFICATION] Failed to show scan completion notification:', notifError.message);
          }
          
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
        // Special prompt for SQLMap
        const isSQLMap = commandName.toLowerCase().includes('sqlmap') || commandName.toLowerCase().includes('sql map');
        const basePrompt = isSQLMap ? 
          `You are an expert security analyst. We have initiated a SQL injection attack test on a server for defensive security purposes. Your task is to analyze the raw output and create a comprehensive security report in JSON format.

SCAN TYPE: ${commandName}

RAW SCAN OUTPUT:
${scanRawResult}

CRITICAL QUESTIONS TO ANSWER:
1. Was a SQL injection attack initiated? (Yes/No)
2. Did the SQL injection attack succeed? (Yes/No - based on whether vulnerabilities were found)
3. Is the server weak/vulnerable to SQL injection? (Yes/No - based on the scan results)

INSTRUCTIONS:
1. First, explain WHAT WE DID: State that we initiated a SQL injection attack test for defensive security purposes to check if the server is vulnerable.
2. Then, explain WHAT WE GOT: Analyze the raw output and clearly state:
   - Whether a SQL injection attack was initiated (Yes/No)
   - Whether the attack succeeded in finding vulnerabilities (Yes/No)
   - Whether the server is weak/vulnerable to SQL injection (Yes/No)
   - Provide clear explanation of the findings
3. Create a detailed JSON report that is comprehensive, user-friendly, and easy to understand
4. DO NOT include the Kali Linux command or command syntax in your output
5. Focus on clearly stating if the server is vulnerable or not
6. Include ALL details found in the raw output - nothing should be omitted
7. Structure the JSON in a logical way that makes sense for SQL injection testing
8. Use clear, non-technical language where possible, but maintain accuracy
9. Provide detailed explanations, findings, vulnerabilities, and recommendations
10. Make the report actionable with clear recommendations

REQUIREMENTS:
- The JSON must be valid and parseable
- Include a "whatWeDid" field: "We initiated a SQL injection attack test for defensive security purposes to check if your server is vulnerable to SQL injection attacks."
- Include a "whatWeGot" field that clearly states:
  * Whether a SQL injection attack was initiated (Yes/No)
  * Whether the attack succeeded in finding vulnerabilities (Yes/No)
  * Whether the server is weak/vulnerable to SQL injection (Yes/No)
  * Clear explanation of the findings
- Include a summary section with key findings including attack status and server vulnerability status
- List all findings with detailed descriptions
- Identify any security vulnerabilities or concerns
- Provide actionable recommendations
- Include all technical details from the scan in a user-friendly format
- Do NOT include generic responses - base everything on the actual scan results
- Do NOT include the command itself in the output

Create a comprehensive JSON report that covers all aspects of the SQL injection test results. Structure it however makes the most sense, but ensure it includes:
- whatWeDid: Explanation that we initiated a SQL injection attack test for defensive purposes
- whatWeGot: Clear statement about whether attack was initiated, succeeded, and if server is weak
- Summary of findings including attack status and server vulnerability
- Detailed findings with all relevant information
- Security vulnerabilities or concerns (if any)
- Recommendations for improvement

Output ONLY valid JSON. No additional text, no markdown formatting, no explanations outside the JSON - just the JSON object.` :
          `You are an expert security analyst. I have executed a security scan command and received raw output. Your task is to analyze this raw output and create a comprehensive, detailed, and user-friendly security report in JSON format.

SCAN TYPE: ${commandName}

COMMAND EXECUTED: ${command}

RAW SCAN OUTPUT:
${scanRawResult}

INSTRUCTIONS:
1. First, explain WHAT WE DID: Describe the security scan command that was executed and what it was trying to discover or test. Make it clear and understandable for the user.
2. Then, explain WHAT WE GOT: Analyze the raw output above thoroughly and explain what the results mean in simple terms. Help the user understand what the scan discovered.
3. Create a detailed JSON report that is comprehensive, user-friendly, and easy to understand
4. DO NOT include the Kali Linux command or command syntax in your output
5. Focus on translating technical scan results into clear, understandable information
6. Include ALL details found in the raw output - nothing should be omitted
7. Structure the JSON in a logical way that makes sense for this type of scan
8. Use clear, non-technical language where possible, but maintain accuracy
9. Provide detailed explanations, findings, vulnerabilities, and recommendations
10. Include specific values, IPs, ports, services, versions, and any other data found in the scan
11. Make the report actionable with clear recommendations
12. For port scans, extract all port information (port number, state, service, version) in a structured format

REQUIREMENTS:
- The JSON must be valid and parseable
- Include a "whatWeDid" field explaining the scan purpose in user-friendly terms
- Include a "whatWeGot" field explaining the results meaning in simple terms
- Include a summary section with key findings
- List all findings with detailed descriptions
- Identify any security vulnerabilities or concerns
- Provide actionable recommendations
- Include all technical details from the scan in a user-friendly format
- For port scans, include a "ports" array with port details (number, state, service, version, etc.)
- Do NOT include generic responses - base everything on the actual scan results
- Do NOT include the command itself in the output

Create a comprehensive JSON report that covers all aspects of the scan results. Structure it however makes the most sense for this type of scan, but ensure it includes:
- whatWeDid: Explanation of what the scan command does
- whatWeGot: Explanation of what the results mean
- Summary of findings
- Detailed findings with all relevant information
- Security vulnerabilities or concerns (if any)
- Recommendations for improvement
- For port scans: ports array with detailed port information
- Any other relevant sections that would help a user understand the scan results

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
          
          // 1. Nikto Scan
          currentStep = 1;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Nikto scan...`,
            command: 'nikto',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nikto scan...\n`
          });
          
          const niktoReportFile = path.join(tempDir, 'nikto_report.txt');
          const niktoReportFileWSL = convertToWSLPath(niktoReportFile);
          // Optimize nikto command: use -nointeractive to avoid waiting for user input, and -Format txt for faster output
          const niktoCommand = `${wslPrefix} nikto -h ${targetDomain} -e -nointeractive -Format txt -output "${niktoReportFileWSL}"`;
          
          const niktoResult = await executeCommand(niktoCommand, 300000);
          scanResults.nikto = { command: niktoCommand, raw: niktoResult.stdout || niktoResult.stderr || '' };
          
          // Read nikto report file if it exists (optimize: read asynchronously)
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
          
          // Run TGPT analysis (blocking) - wait for it to complete before moving to next command
          currentStep = 2;
          await runTgptAnalysis('nikto', 'Nikto Web Server Scan', niktoCommand, scanResults.nikto.raw, currentStep, wslPrefix);
          
          // 2. SQLMap Scan
          currentStep = 3;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running SQLMap scan...`,
            command: 'sqlmap',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running SQLMap scan...\n`
          });
          
          const sqlmapCommand = `${wslPrefix} sqlmap -u "${targetUrl}" --dbs --batch`;
          const sqlmapResult = await executeCommand(sqlmapCommand, 300000);
          scanResults.sqlmap = { command: sqlmapCommand, raw: sqlmapResult.stdout || sqlmapResult.stderr || '' };
          
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] SQLMap scan completed`,
            command: 'sqlmap',
            output: scanResults.sqlmap.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] SQLMap scan completed\nRaw Result:\n${scanResults.sqlmap.raw.substring(0, 2000)}${scanResults.sqlmap.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for SQLMap
          currentStep = 4;
          await runTgptAnalysis('sqlmap', 'SQLMap Database Scan', sqlmapCommand, scanResults.sqlmap.raw, currentStep, wslPrefix);
          
          // 3. Nmap Version Scan (all ports)
          currentStep = 5;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running Nmap version scan (all ports)...`,
            command: 'nmap -sV -p-',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap version scan (all ports)...\n`
          });
          
          const nmapScanFile = path.join(tempDir, 'nmap_scan.txt');
          const nmapScanFileWSL = convertToWSLPath(nmapScanFile);
          const nmapSVCommand = `${wslPrefix} ${sudoPrefix} nmap -sV -p- -oN "${nmapScanFileWSL}" ${targetDomain}`;
          
          const nmapSVResult = await executeCommand(nmapSVCommand, 300000);
          scanResults.nmapSV = { command: nmapSVCommand, raw: nmapSVResult.stdout || nmapSVResult.stderr || '' };
          
          // Read nmap scan file if it exists
          if (fs.existsSync(nmapScanFile)) {
            try {
              const nmapScan = fs.readFileSync(nmapScanFile, 'utf-8');
              scanResults.nmapSV.raw = nmapScan;
            } catch (e) {
              console.error('Failed to read nmap scan file:', e);
            }
          }
          
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Nmap version scan completed`,
            command: 'nmap -sV -p-',
            output: scanResults.nmapSV.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap version scan completed\nRaw Result:\n${scanResults.nmapSV.raw.substring(0, 2000)}${scanResults.nmapSV.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for Nmap Version Scan
          currentStep = 6;
          await runTgptAnalysis('nmapSV', 'Nmap Version Scan', nmapSVCommand, scanResults.nmapSV.raw, currentStep, wslPrefix);
          
          // 4. SSLScan
          currentStep = 7;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running SSLScan...`,
            command: 'sslscan',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running SSLScan...\n`
          });
          
          const sslscanCommand = `${wslPrefix} sslscan ${targetDomain}`;
          const sslscanResult = await executeCommand(sslscanCommand, 300000);
          scanResults.sslscan = { command: sslscanCommand, raw: sslscanResult.stdout || sslscanResult.stderr || '' };
          
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] SSLScan completed`,
            command: 'sslscan',
            output: scanResults.sslscan.raw,
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] SSLScan completed\nRaw Result:\n${scanResults.sslscan.raw.substring(0, 2000)}${scanResults.sslscan.raw.length > 2000 ? '...' : ''}\n`
          });
          
          // Immediately run TGPT analysis for SSLScan
          currentStep = 8;
          await runTgptAnalysis('sslscan', 'SSL/TLS Scan', sslscanCommand, scanResults.sslscan.raw, currentStep, wslPrefix);
          
          // 5. Host Command (DNS Resolution) - to get IP
          currentStep = 9;
          event.sender.send('serverscan:progress', {
            stage: 'running',
            message: `[${currentStep}/${totalSteps}] Running DNS resolution (host)...`,
            command: 'host',
            output: '',
            progress: Math.round((currentStep / totalSteps) * 100),
            consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running DNS resolution (host)...\n`
          });
          
          const hostCommand = `${wslPrefix} host "${targetDomain}"`;
          const hostResult = await executeCommand(hostCommand, 30000);
          scanResults.host = { command: hostCommand, raw: hostResult.stdout || hostResult.stderr || '' };
          
          // Extract IP from host output
          extractedIP = extractIPFromHost(scanResults.host.raw);
          if (extractedIP) {
            scanResults.host.extractedIP = extractedIP;
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] DNS resolution completed - IP: ${extractedIP}`,
              command: 'host',
              output: scanResults.host.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] DNS resolution completed - IP: ${extractedIP}\nRaw Result:\n${scanResults.host.raw}\nExtracted IP: ${extractedIP}\n`
            });
          } else {
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] DNS resolution completed (IP not found)`,
              command: 'host',
              output: scanResults.host.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[WARNING] [${currentStep}/${totalSteps}] DNS resolution completed (IP not found)\nRaw Result:\n${scanResults.host.raw}\n`
            });
          }
          
          // Immediately run TGPT analysis for Host
          currentStep = 10;
          await runTgptAnalysis('host', 'DNS Resolution', hostCommand, scanResults.host.raw, currentStep, wslPrefix);
          
          // 6. Nmap Version Scan on IP (using extracted IP)
          currentStep = 11;
          if (extractedIP) {
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Running Nmap version scan on IP ${extractedIP}...`,
              command: 'nmap -sV',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap version scan on IP ${extractedIP}...\n`
            });
            
            const nmapSVIPCommand = `${wslPrefix} ${sudoPrefix} nmap -sV "${extractedIP}"`;
            const nmapSVIPResult = await executeCommand(nmapSVIPCommand, 300000);
            scanResults.nmapSVIP = { command: nmapSVIPCommand, raw: nmapSVIPResult.stdout || nmapSVIPResult.stderr || '' };
            
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Nmap version scan on IP completed`,
              command: 'nmap -sV',
              output: scanResults.nmapSVIP.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap version scan on IP completed\nRaw Result:\n${scanResults.nmapSVIP.raw.substring(0, 2000)}${scanResults.nmapSVIP.raw.length > 2000 ? '...' : ''}\n`
            });
            
            // Immediately run TGPT analysis for Nmap Version Scan on IP
            currentStep = 12;
            await runTgptAnalysis('nmapSVIP', 'Nmap Version Scan (IP)', nmapSVIPCommand, scanResults.nmapSVIP.raw, currentStep, wslPrefix);
          } else {
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Skipping Nmap version scan on IP (no IP found)`,
              command: 'nmap -sV',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[WARNING] [${currentStep}/${totalSteps}] Skipping Nmap version scan on IP (no IP found)\n`
            });
            scanResults.nmapSVIP = { command: 'skipped', raw: 'IP address not found from host command' };
            
            // Still run TGPT analysis even if skipped
            currentStep = 12;
            await runTgptAnalysis('nmapSVIP', 'Nmap Version Scan (IP)', 'skipped', scanResults.nmapSVIP.raw, currentStep, wslPrefix);
          }
          
          // 7. Nmap Script Scan on IP (using extracted IP)
          currentStep = 13;
          if (extractedIP) {
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Running Nmap script scan on IP ${extractedIP}...`,
              command: 'nmap -sC',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `\n[${startTimestamp}] [${currentStep}/${totalSteps}] Running Nmap script scan on IP ${extractedIP}...\n`
            });
            
            const nmapSCIPCommand = `${wslPrefix} ${sudoPrefix} nmap -sC "${extractedIP}"`;
            const nmapSCIPResult = await executeCommand(nmapSCIPCommand, 300000);
            scanResults.nmapSCIP = { command: nmapSCIPCommand, raw: nmapSCIPResult.stdout || nmapSCIPResult.stderr || '' };
            
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Nmap script scan on IP completed`,
              command: 'nmap -sC',
              output: scanResults.nmapSCIP.raw,
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[SUCCESS] [${currentStep}/${totalSteps}] Nmap script scan on IP completed\nRaw Result:\n${scanResults.nmapSCIP.raw.substring(0, 2000)}${scanResults.nmapSCIP.raw.length > 2000 ? '...' : ''}\n`
            });
            
            // Immediately run TGPT analysis for Nmap Script Scan on IP
            currentStep = 14;
            await runTgptAnalysis('nmapSCIP', 'Nmap Script Scan (IP)', nmapSCIPCommand, scanResults.nmapSCIP.raw, currentStep, wslPrefix);
          } else {
            event.sender.send('serverscan:progress', {
              stage: 'running',
              message: `[${currentStep}/${totalSteps}] Skipping Nmap script scan on IP (no IP found)`,
              command: 'nmap -sC',
              output: '',
              progress: Math.round((currentStep / totalSteps) * 100),
              consoleLog: `[WARNING] [${currentStep}/${totalSteps}] Skipping Nmap script scan on IP (no IP found)\n`
            });
            scanResults.nmapSCIP = { command: 'skipped', raw: 'IP address not found from host command' };
            
            // Still run TGPT analysis even if skipped
            currentStep = 14;
            await runTgptAnalysis('nmapSCIP', 'Nmap Script Scan (IP)', 'skipped', scanResults.nmapSCIP.raw, currentStep, wslPrefix);
          }
          
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
          
          // Send notification after scan completion
          try {
            if (Notification.isSupported()) {
              const notification = new Notification({
                title: 'Server Scan Completed',
                body: `Server scan for ${target} has been completed successfully.`,
                icon: iconPath,
                urgency: 'normal',
                timeoutType: 'default'
              });
              
              notification.on('click', () => {
                if (mainWindowInstance) {
                  mainWindowInstance.show();
                  mainWindowInstance.focus();
                }
              });
              
              notification.show();
              notificationCount++;
              updateBadgeCount(notificationCount);
              console.log('[SUCCESS] [NOTIFICATION] Server scan completion notification shown');
            }
          } catch (notifError) {
            console.log('[WARNING] [NOTIFICATION] Failed to show scan completion notification:', notifError.message);
          }
          
          // Clean up temp files
          try {
            if (fs.existsSync(niktoReportFile)) fs.unlinkSync(niktoReportFile);
            if (fs.existsSync(nmapScanFile)) fs.unlinkSync(nmapScanFile);
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
      const tempDir = path.join(process.cwd(), 'temp-scans')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      const scanFile = path.join(tempDir, 'local_scan.json')
      const wslPath = tempDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`)
      const wapitiCmd = `wapiti -u "${url}" -d 3 -m xss,sql -f json -o local_scan.json --max-scan-time 300 --skip .jpg --skip .jpeg --skip .png --skip .webp`
      event.sender.send('wapiti:progress', { stage: 'starting', message: `Starting Wapiti scan for ${url}...` })
      event.sender.send('wapiti:progress', { stage: 'info', message: `Command: ${wapitiCmd}` })
      const wslCommand = `cd "${wslPath}" && ${wapitiCmd}`
      wapitiScanChild = spawn('wsl', ['bash', '-c', wslCommand], {
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let interruptionTimeout = null
      let autoInterruptTimeout = null
      const maxScanTime = 5 * 60 * 1000 // 5 minutes
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
      
      // Auto-interrupt after 5 minutes
      autoInterruptTimeout = setTimeout(() => {
        if (wapitiScanChild && !wapitiInterrupted && !wapitiReportGenerated) {
          event.sender.send('wapiti:progress', { stage: 'warning', message: 'Scan has been running for 5 minutes. Interrupting to generate report...' })
          
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
        
        if (code === 0 || wapitiReportGenerated) {
          if (fs.existsSync(scanFile)) {
            event.sender.send('wapiti:progress', { stage: 'info', message: 'Reading scan results from file...' })
            setTimeout(async () => {
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
            }, 1000)
          } else {
            event.sender.send('wapiti:done', { error: 'Scan completed but report file not found' })
          }
        } else {
          event.sender.send('wapiti:done', { error: `Scan process exited with code ${code}` })
        }
        wapitiScanChild = null
      })
      wapitiScanChild.on('error', (error) => {
        // Clear all timeouts
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
        
        event.sender.send('wapiti:progress', { stage: 'error', message: `Process error: ${error.message}` })
        event.sender.send('wapiti:done', { error: error.message })
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

  // Security Analyzer (comprehensive defensive analysis)
  ipcMain.handle('securityAnalysis:start', async (event, payload) => {
    console.log('[SECURITY-ANALYZER] Handler called with payload:', payload);
    try {
      const { url, credentials, options } = payload || {}
      
      if (!url) {
        throw new Error('URL is required')
      }
      
      console.log('[SECURITY-ANALYZER] Loading security-analyzer module...');
      const securityAnalyzerModule = require(path.join(__dirname, '..', 'scanners', 'security-analyzer.js'))
      console.log('[SECURITY-ANALYZER] Module loaded successfully');
      
      const outDir = path.join(process.cwd(), 'temp-scans', `security-analysis-${Date.now()}`)
      fs.mkdirSync(outDir, { recursive: true })
      console.log('[SECURITY-ANALYZER] Output directory created:', outDir);
      
      // Launch target site in default browser for transparency
      try {
        const safeUrl = (() => {
          try {
            const u = new URL(url.startsWith('http') ? url : `https://${url}`)
            if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString()
          } catch {}
          return null
        })()
        if (safeUrl) {
          console.log('[SECURITY-ANALYZER] Opening URL in browser:', safeUrl);
          shell.openExternal(safeUrl)
        }
      } catch (openError) {
        console.warn('[SECURITY-ANALYZER] Failed to open URL in browser:', openError);
      }
      
      const scanOptions = {
        outputDir: outDir,
        onProgress: (update) => {
          console.log('[SECURITY-ANALYZER] Progress update:', update);
          event.sender.send('securityAnalysis:progress', update)
        },
        ...options
      }
      
      console.log('[SECURITY-ANALYZER] Starting security analysis...');
      const result = await securityAnalyzerModule.runSecurityAnalysis(url, { ...scanOptions, credentials })
      console.log('[SECURITY-ANALYZER] Analysis completed successfully');
      
      event.sender.send('securityAnalysis:complete', { success: true, result })
      return { success: true }
    } catch (e) {
      console.error('[SECURITY-ANALYZER] Error:', e);
      event.sender.send('securityAnalysis:complete', { error: e?.message || String(e) })
      return { error: e?.message || String(e) }
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

app.whenReady().then(async () => {
  const win = await createMainWindow();
  mainWindowInstance = win;

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
        console.log('Selected directory:', result.filePaths[0]);
        return result.filePaths;
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

  // File system operations for logging
  ipcMain.handle('fs:getInstallPath', async () => {
    try {
      const setupConfigPath = path.join(app.getPath('userData'), 'setup-config.json');
      if (fs.existsSync(setupConfigPath)) {
        const config = JSON.parse(fs.readFileSync(setupConfigPath, 'utf8'));
        return config.installPath || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting install path:', error);
      return null;
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

  ipcMain.handle('fs:ensureDirectoryExists', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      return { success: true };
    } catch (error) {
      console.error('Error ensuring directory exists:', error);
      throw error;
    }
  });

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

  // IPC: expose OS helpers
  ipcMain.handle('os:getPlatform', async () => detectPlatform());
  ipcMain.handle('os:checkWsl', async () => {
    try { return await checkWslInstalled(); } catch { return false; }
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

  // Kali Linux management
  ipcMain.handle('kali:check', () => {
    return checkKaliInstalled();
  });

  ipcMain.handle('kali:install', async (event) => {
    console.log('🚀 Starting Kali Linux installation via IPC...');
    
    // Update UI to show installation in progress
    event.sender.send('kali:installProgress', 'Starting Kali Linux installation...');
    
    try {
      const result = await installKaliLinux();
      
      if (result) {
        // Installation successful - update UI
        event.sender.send('kali:installComplete', true);
        console.log('✅ Kali Linux installation completed successfully');
      } else {
        // Installation failed - update UI
        event.sender.send('kali:installComplete', false);
        console.log('❌ Kali Linux installation failed');
      }
      
      return result;
    } catch (error) {
      console.log('❌ Kali Linux installation error:', error.message);
      event.sender.send('kali:installComplete', false);
      return false;
    }
  });



  // Helper: install nmap in WSL if missing
  async function installNmapInWsl() {
    return new Promise((resolve) => {
      const child = spawn('wsl', ['sudo', 'apt', 'update'], { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (d) => output += d.toString());
      child.stderr.on('data', (d) => output += d.toString());
      child.on('close', (code) => {
        if (code !== 0) {
          resolve(false);
          return;
        }
        const installChild = spawn('wsl', ['sudo', 'apt', 'install', '-y', 'nmap'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
      const updateChild = spawn('wsl', ['-d', 'kali-linux', 'sudo', 'apt', 'update'], { stdio: ['ignore', 'pipe', 'pipe'] });
      updateChild.on('close', (updateCode) => {
        if (updateCode !== 0) {
          resolve(false);
          return;
        }

        // Install all security tools
        const installChild = spawn('wsl', ['-d', 'kali-linux', 'sudo', 'apt', 'install', '-y',
          'nmap', 'dnsutils', 'dnsrecon', 'dnsenum', 'nikto', 'sqlmap', 'gobuster'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });

        installChild.on('close', (installCode) => {
          resolve(installCode === 0);
        });
      });
    });
  }

  // Tool checking only (no installation)
  async function checkRequiredToolsOnly(password) {
    console.log('🔧 [TOOL-CHECKER] Starting tool check (no installation)...');
    console.log('🔧 [TOOL-CHECKER] Password provided:', password ? 'EXISTS' : 'NULL');
    console.log('🔧 [TOOL-CHECKER] Password length:', password ? password.length : 0);
  
    const requiredTools = [
      'jq','unzip','nmap','nikto','sqlmap','hydra','gobuster','dirb',
      'amass','john','medusa','zaproxy','mitmproxy','socat','fail2ban',
      'curl','wget','wapiti'
    ];
  
    const goTools = ['ffuf','nuclei','dalfox','go'];
  
    const allTools = [...requiredTools, ...goTools];
  
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
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    console.log('🔧 [TOOL-CHECKER] Parsed lines:', lines);
  
    for (const line of lines) {
      if (line.startsWith('❌')) {
        // Extract word-like tool name (letters, digits, hyphen, underscore)
        const m = line.match(/❌\s+([A-Za-z0-9_\-]+)\s+is NOT installed/);
        if (m && m[1]) {
          missingTools.push(m[1]);
        } else {
          console.log('🔧 [TOOL-CHECKER] Could not extract tool name from line:', line);
        }
      } else if (line.startsWith('✅')) {
        // installed line — you can parse path if needed
      } else {
        console.log('🔧 [TOOL-CHECKER] Unrecognized line format (ignored):', line);
      }
    }
  
    const success = missingTools.length === 0;
    console.log('🔧 [TOOL-CHECKER] Missing tools:', missingTools);
  
    return {
      success,
      missingTools,
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
      // Check if tgpt is installed
      const checkCommand = `wsl -d kali-linux -u root -- bash -lc "command -v tgpt && echo 'tgpt is INSTALLED → '$(tgpt --version) || echo 'tgpt NOT installed'"`;
      
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

      const installCommand = `wsl -d kali-linux -u root -- bash -lc "echo '${password}' | sudo -S bash -c 'curl -sSL https://raw.githubusercontent.com/aandrew-me/tgpt/main/install | bash'"`;
      
      console.log('🔧 [TGPT-CHECKER] Running install command...');
      try {
        const installResult = await execAsync(installCommand, { maxBuffer: 10 * 1024 * 1024 });
        console.log('✅ [TGPT-CHECKER] tgpt installation completed');
        console.log('🔧 [TGPT-CHECKER] Install output:', installResult.stdout);
        
        // Verify installation
        const verifyCommand = `wsl -d kali-linux -u root -- bash -lc "command -v tgpt && echo 'tgpt is INSTALLED → '$(tgpt --version) || echo 'tgpt NOT installed'"`;
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
      'amass', 'john', 'medusa', 'zaproxy', 'mitmproxy', 'socat', 'fail2ban', 
      'curl', 'wget', 'wapiti', 'sslscan'
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
          } else if (tool === 'zaproxy') {
            // Install zaproxy via snap with classic flag
            installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${password}' | sudo -S snap install zaproxy --classic"`;
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
      const sp = require('child_process').spawnSync('wsl', ['-l', '-q'], { encoding: 'utf8' });
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
        const digCheck = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'sh', '-lc', 'which dig || echo __NO_DIG__'], { encoding: 'utf8' });
        const dnsreconCheck = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'sh', '-lc', 'which dnsrecon || echo __NO_DNSRECON__'], { encoding: 'utf8' });
        const dnsenumCheck = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'sh', '-lc', 'which dnsenum || echo __NO_DNSENUM__'], { encoding: 'utf8' });
        const nmapCheck = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'sh', '-lc', 'which nmap || echo __NO_NMAP__'], { encoding: 'utf8' });

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
        const kaliInstalled = await installKaliInWsl(event);
        if (kaliInstalled) {
          pre.hasKali = true;
          // Re-check nmap after Kali installation
          const nmapCheck = require('child_process').spawnSync('wsl', ['sh', '-lc', 'which nmap || echo __NO_NMAP__'], { encoding: 'utf8' });
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
    console.log('🔐 [WSL-ROOT-AUTH] Event sender:', event.sender);
    console.log('🔐 [WSL-ROOT-AUTH] Password parameter:', password);
    
    const startTime = Date.now();
    console.log('🔐 [WSL-ROOT-AUTH] Starting root credential verification...');
    console.log('🔐 [WSL-ROOT-AUTH] Timestamp:', new Date().toISOString());
    console.log('🔐 [WSL-ROOT-AUTH] Password length:', password ? password.length : 0);
    
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Step 1: Execute wsl command
      console.log('🔐 [WSL-ROOT-AUTH] Step 1: Executing wsl command...');
      const wslCommand = 'wsl';
      console.log('🔐 [WSL-ROOT-AUTH] WSL command:', wslCommand);
      
      // Step 2: Run sudo su command
      console.log('🔐 [WSL-ROOT-AUTH] Step 2: Running sudo su command...');
      const sudoSuCommand = 'sudo su';
      console.log('🔐 [WSL-ROOT-AUTH] Sudo su command:', sudoSuCommand);
      
      // Step 3: Provide user password
      console.log('🔐 [WSL-ROOT-AUTH] Step 3: Providing user password...');
      console.log('🔐 [WSL-ROOT-AUTH] Password length:', password.length);
      console.log('🔐 [WSL-ROOT-AUTH] Password (DEBUG):', password.replace(/./g, '*'));
      
      // Use interactive approach: wsl with expect-like behavior
      // This approach simulates the manual process: wsl -> sudo su -> password -> whoami
      const testCommand = `wsl -e bash -c "echo '${password}' | sudo -S whoami"`;
      console.log('🔐 [WSL-ROOT-AUTH] Final command (DEBUG):', testCommand.replace(password, '***'));
      console.log('🔐 [WSL-ROOT-AUTH] Full final command (DEBUG):', testCommand);
      console.log('🔐 [WSL-ROOT-AUTH] Using: wsl -e bash -c with sudo -S whoami');
      
      // First, test if WSL is working at all
      console.log('🔐 [WSL-ROOT-AUTH] Testing basic WSL connectivity...');
      try {
        const basicTest = await execAsync('wsl echo "WSL is working"');
        console.log('🔐 [WSL-ROOT-AUTH] Basic WSL test result:', basicTest.stdout.trim());
      } catch (basicError) {
        console.log('🔐 [WSL-ROOT-AUTH] Basic WSL test failed:', basicError.message);
        return { 
          success: false, 
          error: 'WSL is not working properly: ' + basicError.message,
          debug: { basicError: basicError.message }
        };
      }
      
      console.log('🔐 [WSL-ROOT-AUTH] Executing final command...');
      console.log('🔐 [WSL-ROOT-AUTH] Command timeout: 10000ms');
      
      // Add timeout to prevent hanging
      const { stdout, stderr } = await Promise.race([
        execAsync(testCommand),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Command timeout after 10 seconds')), 10000)
        )
      ]);
      const duration = Date.now() - startTime;
      
      console.log('🔐 [WSL-ROOT-AUTH] Command execution completed in', duration, 'ms');
      console.log('🔐 [WSL-ROOT-AUTH] ===== EXECUTION RESULTS =====');
      console.log('🔐 [WSL-ROOT-AUTH] STDOUT:', JSON.stringify(stdout));
      console.log('🔐 [WSL-ROOT-AUTH] STDERR:', JSON.stringify(stderr));
      console.log('🔐 [WSL-ROOT-AUTH] STDOUT (trimmed):', JSON.stringify(stdout.trim()));
      console.log('🔐 [WSL-ROOT-AUTH] STDERR (trimmed):', JSON.stringify(stderr.trim()));
      
      const output = stdout.trim();
      const errorOutput = stderr.trim();
      
      console.log('🔐 [WSL-ROOT-AUTH] ===== ANALYSIS =====');
      console.log('🔐 [WSL-ROOT-AUTH] Raw output length:', output.length);
      console.log('🔐 [WSL-ROOT-AUTH] Raw error length:', errorOutput.length);
      console.log('🔐 [WSL-ROOT-AUTH] Output contains "root":', output.includes('root'));
      console.log('🔐 [WSL-ROOT-AUTH] Error contains "Authentication failure":', errorOutput.includes('Authentication failure'));
      console.log('🔐 [WSL-ROOT-AUTH] Error contains "sudo":', errorOutput.includes('sudo'));
      console.log('🔐 [WSL-ROOT-AUTH] Error contains "su":', errorOutput.includes('su'));
      
      console.log('🔐 [WSL-ROOT-AUTH] Checking if output equals "root"...');
      console.log('🔐 [WSL-ROOT-AUTH] Output === "root":', output === 'root');
      
      if (output === 'root') {
        console.log('✅ [WSL-ROOT-AUTH] WSL root credentials VALID');
        console.log('✅ [WSL-ROOT-AUTH] Authentication successful');
        return { success: true, debug: { duration, stdout, stderr } };
      } else {
        console.log('❌ [WSL-ROOT-AUTH] First method failed, trying alternative approach...');
        
        // Alternative approach: Try with expect-like behavior using printf
        console.log('🔐 [WSL-ROOT-AUTH] Alternative: Trying printf approach...');
        const altCommand = `wsl -e bash -c "printf '${password}\\n' | sudo -S whoami"`;
        console.log('🔐 [WSL-ROOT-AUTH] Alternative command (DEBUG):', altCommand.replace(password, '***'));
        console.log('🔐 [WSL-ROOT-AUTH] Full alternative command (DEBUG):', altCommand);
        
        try {
          console.log('🔐 [WSL-ROOT-AUTH] Executing alternative command with timeout...');
          const { stdout: altStdout, stderr: altStderr } = await Promise.race([
            execAsync(altCommand),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Alternative command timeout after 10 seconds')), 10000)
            )
          ]);
          const altOutput = altStdout.trim();
          
          console.log('🔐 [WSL-ROOT-AUTH] Alternative STDOUT:', JSON.stringify(altStdout));
          console.log('🔐 [WSL-ROOT-AUTH] Alternative STDERR:', JSON.stringify(altStderr));
          console.log('🔐 [WSL-ROOT-AUTH] Alternative output (trimmed):', JSON.stringify(altOutput));
          
          if (altOutput === 'root') {
            console.log('✅ [WSL-ROOT-AUTH] Alternative method SUCCESS - WSL root credentials VALID');
            return { success: true, debug: { duration, stdout: altStdout, stderr: altStderr, method: 'alternative' } };
          } else {
            console.log('❌ [WSL-ROOT-AUTH] Both methods failed');
            console.log('❌ [WSL-ROOT-AUTH] Expected output: "root"');
            console.log('❌ [WSL-ROOT-AUTH] Method 1 output:', JSON.stringify(output));
            console.log('❌ [WSL-ROOT-AUTH] Method 2 output:', JSON.stringify(altOutput));
            console.log('❌ [WSL-ROOT-AUTH] Authentication failed');
            return { 
              success: false, 
              error: 'Invalid root password', 
              debug: { 
                duration, 
                method1: { stdout, stderr, output },
                method2: { stdout: altStdout, stderr: altStderr, output: altOutput },
                expected: 'root'
              } 
            };
          }
        } catch (altError) {
          console.log('❌ [WSL-ROOT-AUTH] Alternative method also failed:', altError.message);
          console.log('❌ [WSL-ROOT-AUTH] Trying third method: direct sudo su approach...');
          
          // Third approach: Try to simulate the exact manual process
          try {
            const thirdCommand = `wsl -e bash -c "echo '${password}' | sudo -S su -c 'whoami'"`;
            console.log('🔐 [WSL-ROOT-AUTH] Third command (DEBUG):', thirdCommand.replace(password, '***'));
            
            const { stdout: thirdStdout, stderr: thirdStderr } = await Promise.race([
              execAsync(thirdCommand),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Third method timeout after 10 seconds')), 10000)
              )
            ]);
            
            const thirdOutput = thirdStdout.trim();
            console.log('🔐 [WSL-ROOT-AUTH] Third method STDOUT:', JSON.stringify(thirdStdout));
            console.log('🔐 [WSL-ROOT-AUTH] Third method STDERR:', JSON.stringify(thirdStderr));
            console.log('🔐 [WSL-ROOT-AUTH] Third method output (trimmed):', JSON.stringify(thirdOutput));
            
            if (thirdOutput === 'root') {
              console.log('✅ [WSL-ROOT-AUTH] Third method SUCCESS - WSL root credentials VALID');
              return { success: true, debug: { duration, stdout: thirdStdout, stderr: thirdStderr, method: 'third' } };
            } else {
              console.log('❌ [WSL-ROOT-AUTH] All three methods failed');
              return { 
                success: false, 
                error: 'Invalid root password - all authentication methods failed', 
                debug: { 
                  duration, 
                  method1: { stdout, stderr, output },
                  method2: { error: altError.message },
                  method3: { stdout: thirdStdout, stderr: thirdStderr, output: thirdOutput },
                  expected: 'root'
                } 
              };
            }
          } catch (thirdError) {
            console.log('❌ [WSL-ROOT-AUTH] All three methods failed');
            return { 
              success: false, 
              error: 'Invalid root password - all authentication methods failed', 
              debug: { 
                duration, 
                method1: { stdout, stderr, output },
                method2: { error: altError.message },
                method3: { error: thirdError.message },
                expected: 'root'
              } 
            };
          }
        }
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
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Get the default WSL username (this is what shows up when you run 'wsl')
      const command = 'wsl whoami';
      console.log('👤 Getting WSL username...');
      console.log('📝 Command:', command);
      
      const { stdout } = await execAsync(command);
      const username = stdout.trim();
      console.log('📤 Username:', username);
      
      return { username };
    } catch (error) {
      console.log('❌ Failed to get WSL username:', error.message);
      return { username: 'WSL User' };
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
      
      // Store password securely in encrypted file
      const stored = storePasswordSecurely(password);
      if (!stored) {
        return { success: false, error: 'Failed to store password securely' };
      }
      
      // Store in memory for current session
      storedWslRootPassword = password;
      
      // After storing password, check which tools are missing (but don't install yet)
      console.log('🔧 Auto-checking required security tools...');
      event.sender.send('scan:progress', { 
        stage: 'checking', 
        message: 'Password saved securely! Now checking which security tools are available...' 
      });
      
      const toolResult = await checkRequiredToolsOnly(password);
      
      // Check and install tgpt
      console.log('🔧 Checking tgpt...');
      const tgptResult = await checkAndInstallTgpt(password, event);
      console.log('🔧 tgpt check result:', tgptResult);
      
      if (toolResult.success) {
        console.log('✅ All required tools are available');
        event.sender.send('scan:progress', { 
          stage: 'complete', 
          message: `All required security tools are ready! (${toolResult.installedCount}/${toolResult.totalChecked} tools)` 
        });
      } else {
        console.log('⚠️ Some tools are missing');
        event.sender.send('scan:progress', { 
          stage: 'warning', 
          message: `Tool check completed: ${toolResult.installedCount}/${toolResult.totalChecked} tools available. Missing: ${toolResult.missingTools?.join(', ') || 'Unknown'}` 
        });
      }
      
      return { 
        success: true, 
        toolCheck: toolResult 
      };
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
        const wslProcess = spawn('wsl', ['bash', '-c', 'tgpt'], {
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
        'zaproxy': 'zaproxy'
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
          const goInstallCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y golang-go"`;
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
          installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y metasploit-framework"`;
        } else if (toolName === 'zaproxy') {
          // Install zaproxy via snap
          installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S snap install zaproxy"`;
        }
        
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Special command: ${installCommand.replace(usePassword, '***')}`);
      } else {
        // Install regular apt package
        installCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt install -y ${toolName}"`;
        console.log(`🔧 [SINGLE-TOOL-INSTALL] APT package detected: ${toolName}`);
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Apt command: ${installCommand.replace(usePassword, '***')}`);
      }
      
      console.log(`🔧 [SINGLE-TOOL-INSTALL] About to execute command...`);
      
      // First test if WSL is working
      console.log(`🔧 [SINGLE-TOOL-INSTALL] Testing WSL connectivity...`);
      try {
        const testCommand = `wsl -e bash -c "echo 'WSL test successful'"`;
        const testResult = await execAsync(testCommand);
        console.log(`🔧 [SINGLE-TOOL-INSTALL] WSL test result: ${testResult.stdout.trim()}`);
      } catch (testError) {
        console.log(`❌ [SINGLE-TOOL-INSTALL] WSL test failed: ${testError.message}`);
        return { 
          success: false, 
          tool: toolName,
          error: `WSL connectivity test failed: ${testError.message}`,
          errorType: 'WSL_CONNECTIVITY_ERROR'
        };
      }

      // Update package lists before installation (only for APT packages)
      if (!goTools[toolName]) {
        console.log(`🔧 [SINGLE-TOOL-INSTALL] Updating package lists...`);
        try {
          const updateCommand = `wsl -e bash -c "export DEBIAN_FRONTEND=noninteractive && echo '${usePassword}' | sudo -S apt update"`;
          await execAsync(updateCommand);
          console.log(`🔧 [SINGLE-TOOL-INSTALL] Package lists updated successfully`);
        } catch (updateError) {
          console.log(`⚠️ [SINGLE-TOOL-INSTALL] Package list update failed, continuing anyway: ${updateError.message}`);
        }
      }
      
      // Execute installation with timeout
      const { stdout, stderr } = await Promise.race([
        execAsync(installCommand),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Command timeout after 60 seconds')), 60000)
        )
      ]);
      
      console.log(`✅ [SINGLE-TOOL-INSTALL] ${toolName} installed successfully`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] STDOUT length: ${stdout ? stdout.length : 0}`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] STDOUT: ${stdout}`);
      console.log(`🔧 [SINGLE-TOOL-INSTALL] STDERR length: ${stderr ? stderr.length : 0}`);
      if (stderr) console.log(`🔧 [SINGLE-TOOL-INSTALL] STDERR: ${stderr}`);
      
      return { 
        success: true, 
        tool: toolName,
        stdout: stdout,
        stderr: stderr
      };
      
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
        const { stdout, stderr } = await execAsync(fullCommand, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
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
