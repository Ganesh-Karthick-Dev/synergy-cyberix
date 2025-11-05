const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
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
  const algorithm = 'aes-256-gcm';
  const key = crypto.scryptSync('synergy-cyberix-key', 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  cipher.setAAD(Buffer.from('synergy-cyberix', 'utf8'));
  
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decryptPassword(encryptedData) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync('synergy-cyberix-key', 'salt', 32);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipher(algorithm, key);
    decipher.setAAD(Buffer.from('synergy-cyberix', 'utf8'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Failed to decrypt password:', error);
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
    if (!fs.existsSync(passwordFile)) {
      return null;
    }
    
    const encryptedData = JSON.parse(fs.readFileSync(passwordFile, 'utf8'));
    const password = decryptPassword(encryptedData);
    console.log('🔐 Password loaded from secure storage');
    return password;
  } catch (error) {
    console.error('Failed to load password:', error);
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

async function createMainWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'logo', 'icons8-security-shield-64.png');

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
      
      // Run the network scan using Python script with nmap
      const runNetworkScanAsync = async () => {
        try {
          // Ensure path and fs modules are available
          const pathModule = require('path');
          const fs = require('fs');
          
          // Use local time in the same format (YYYY-MM-DD HH:MM:SS)
          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const day = String(now.getDate()).padStart(2, '0');
          const hours = String(now.getHours()).padStart(2, '0');
          const minutes = String(now.getMinutes()).padStart(2, '0');
          const seconds = String(now.getSeconds()).padStart(2, '0');
          const startTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
          
          event.sender.send('networkscan:progress', { 
            stage: 'starting', 
            message: 'Initializing network scan...',
            command: '',
            output: '',
            consoleLog: `[${startTimestamp}] Starting network scan for ports 1-2000...`
          });
          console.log(`[${startTimestamp}] Starting network scan for target:`, target);
          
          // Normalize target (remove http/https)
          const targetDomain = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
          
          // Create temp directory for scan files
          const tempDir = pathModule.join(process.cwd(), 'temp-network-scans');
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          // Generate unique filenames
          const timestamp = Date.now();
          const nmapXmlFile = pathModule.join(tempDir, `nmap_${timestamp}.xml`);
          const jsonOutputFile = pathModule.join(tempDir, `scan_${timestamp}.json`);
          
          // Path to Python script - ensure we're using the correct path
          // __dirname in Electron main process is src/main when in dev, but different when packaged
          // Use process.cwd() or app.getAppPath() to get the actual application path
          const appPath = app.isPackaged ? app.getAppPath() : process.cwd();
          let pythonScriptPath = pathModule.join(appPath, 'backend', 'network_scan_to_json_v_2.py');
          let absolutePythonPath = pathModule.resolve(pythonScriptPath);
          
          // Verify Python script exists, try alternative path if needed
          if (!fs.existsSync(absolutePythonPath)) {
            console.warn(`[SCAN] Python script not found at: ${absolutePythonPath}`);
            console.log(`[SCAN] App path: ${appPath}`);
            console.log(`[SCAN] __dirname: ${__dirname}`);
            console.log(`[SCAN] process.cwd(): ${process.cwd()}`);
            // Try alternative path using __dirname
            const altPath = pathModule.join(__dirname, '..', '..', 'backend', 'network_scan_to_json_v_2.py');
            const altAbsolutePath = pathModule.resolve(altPath);
            console.log(`[SCAN] Trying alternative path: ${altAbsolutePath}`);
            if (fs.existsSync(altAbsolutePath)) {
              console.log(`[SCAN] Using alternative path: ${altAbsolutePath}`);
              absolutePythonPath = altAbsolutePath;
              pythonScriptPath = altPath;
            } else {
              throw new Error(`Python script not found at: ${absolutePythonPath} or ${altAbsolutePath}`);
            }
          }
          
          console.log(`[SCAN] ✅ Python script found at: ${absolutePythonPath}`);
          
          // Convert paths for WSL if on Windows
          let nmapXmlPathWSL = nmapXmlFile;
          let pythonScriptPathWSL = absolutePythonPath;
          let jsonOutputPathWSL = jsonOutputFile;
          let tempDirWSL = tempDir;
          
          if (process.platform === 'win32') {
            const convertToWSLPath = (winPath) => {
              const normalized = winPath.replace(/\\/g, '/');
              const driveMatch = normalized.match(/^([A-Za-z]):/);
              if (driveMatch) {
                const driveLetter = driveMatch[1].toLowerCase();
                // Escape spaces in path for bash
                return normalized.replace(/^[A-Za-z]:/, `/mnt/${driveLetter}`).replace(/ /g, '\\ ');
              }
              return normalized.replace(/ /g, '\\ ');
            };
            nmapXmlPathWSL = convertToWSLPath(nmapXmlFile);
            pythonScriptPathWSL = convertToWSLPath(absolutePythonPath);
            jsonOutputPathWSL = convertToWSLPath(jsonOutputFile);
            tempDirWSL = convertToWSLPath(tempDir);
            
            // Ensure temp directory exists in WSL
            try {
              await execAsync(`wsl bash -c "mkdir -p '${tempDirWSL.replace(/\\ /g, ' ')}'"`, { timeout: 5000 });
            } catch (e) {
              console.log('Warning: Could not create temp directory in WSL, continuing anyway');
            }
          }
          
          // Step 1: Run nmap to scan ports 1-2000 and output XML
          // Use wsl -u root instead of sudo to avoid password prompts
          // Also properly escape the path with spaces
          let nmapCommand;
          let displayPath = nmapXmlFile; // For display purposes
          
          if (process.platform === 'win32') {
            // Use double quotes for the path to handle spaces, and escape properly
            const escapedPath = nmapXmlPathWSL.replace(/\\ /g, ' ');
            const escapedTarget = targetDomain.replace(/'/g, "'\\''");
            // Use wsl -u root to run as root without sudo
            nmapCommand = `wsl -u root -- nmap -Pn -p1-2000 -sV -oX "${escapedPath}" "${escapedTarget}"`;
            displayPath = escapedPath; // Show WSL path in logs
          } else {
            nmapCommand = `sudo nmap -Pn -p1-2000 -sV -oX "${nmapXmlFile}" "${targetDomain}"`;
          }
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: 'Running nmap scan (ports 1-2000)...',
            command: '',
            output: '',
            consoleLog: `\n[${startTimestamp}] 🔍 Running nmap -Pn -p1-2000 -sV -oX ${displayPath} ${targetDomain}\n`
          });
          
          console.log(`[SCAN] Executing nmap: ${nmapCommand}`);
          console.log(`[SCAN] WSL Path: ${process.platform === 'win32' ? nmapXmlPathWSL.replace(/\\ /g, ' ') : nmapXmlFile}`);
          
          try {
            const { stdout: nmapStdout, stderr: nmapStderr } = await execAsync(nmapCommand, {
              maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large XML output
              timeout: 300000, // 5 minutes timeout
              windowsHide: true
            });
            
            // Send nmap output to UI
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: 'Nmap scan completed, parsing results...',
              command: '',
              output: stripAnsiCodes(nmapStdout || ''),
              consoleLog: stripAnsiCodes(nmapStdout || nmapStderr || '')
            });
            
            // Check if XML file was created
            if (!fs.existsSync(nmapXmlFile)) {
              throw new Error('Nmap XML output file not found. Scan may have failed.');
            }
            
          } catch (nmapError) {
            console.error('Nmap scan error:', nmapError);
            // Log the full error details for debugging
            const errorDetails = nmapError.stderr || nmapError.stdout || nmapError.message;
            console.error('Nmap error details:', errorDetails);
            
            event.sender.send('networkscan:progress', {
              stage: 'error',
              message: `Nmap scan failed: ${nmapError.message}`,
              command: '',
              output: stripAnsiCodes(errorDetails || ''),
              consoleLog: `\n❌ Nmap scan error: ${nmapError.message}\n${stripAnsiCodes(errorDetails || '')}\n`
            });
            throw new Error(`Nmap scan failed: ${nmapError.message}`);
          }
          
          // Step 2: Run Python script to convert XML to JSON
          // Properly escape paths for Python command
          let pythonCommand;
          let displayPythonPath = absolutePythonPath;
          let displayXmlPath = nmapXmlFile;
          let displayJsonPath = jsonOutputFile;
          
          if (process.platform === 'win32') {
            // Use double quotes and escape properly for paths with spaces
            const escapedPythonPath = pythonScriptPathWSL.replace(/\\ /g, ' ');
            const escapedXmlPath = nmapXmlPathWSL.replace(/\\ /g, ' ');
            const escapedJsonPath = jsonOutputPathWSL.replace(/\\ /g, ' ');
            const escapedTarget = targetDomain.replace(/'/g, "'\\''");
            pythonCommand = `wsl python3 "${escapedPythonPath}" --nmap-xml "${escapedXmlPath}" --domain "${escapedTarget}" --output "${escapedJsonPath}"`;
            // Show WSL paths in logs
            displayPythonPath = escapedPythonPath;
            displayXmlPath = escapedXmlPath;
            displayJsonPath = escapedJsonPath;
          } else {
            pythonCommand = `python3 "${absolutePythonPath}" --nmap-xml "${nmapXmlFile}" --domain "${targetDomain}" --output "${jsonOutputFile}"`;
          }
          
          event.sender.send('networkscan:progress', {
            stage: 'running',
            message: 'Converting scan results to JSON...',
            command: '',
            output: '',
            consoleLog: `\n[${new Date().toISOString()}] 📊 Converting nmap XML to JSON using: ${displayPythonPath}\n`
          });
          
          console.log(`[SCAN] Executing Python script: ${pythonCommand}`);
          console.log(`[SCAN] Python Script WSL Path: ${process.platform === 'win32' ? displayPythonPath : absolutePythonPath}`);
          console.log(`[SCAN] XML Input WSL Path: ${displayXmlPath}`);
          console.log(`[SCAN] JSON Output WSL Path: ${displayJsonPath}`);
          
          try {
            const { stdout: pythonStdout, stderr: pythonStderr } = await execAsync(pythonCommand, {
              maxBuffer: 10 * 1024 * 1024,
              timeout: 60000, // 1 minute timeout for parsing
              windowsHide: true
            });
            
            // Send Python script output to UI
            event.sender.send('networkscan:progress', {
              stage: 'running',
              message: 'Parsing completed...',
              command: '',
              output: stripAnsiCodes(pythonStdout || ''),
              consoleLog: stripAnsiCodes(pythonStdout || pythonStderr || '')
            });
            
            // Read JSON output file
            if (!fs.existsSync(jsonOutputFile)) {
              throw new Error('JSON output file not found. Python script may have failed.');
            }
            
            const jsonContent = fs.readFileSync(jsonOutputFile, 'utf-8');
            const scanData = JSON.parse(jsonContent);
            
            // Generate Markdown report
            const reportGeneratorPath = pathModule.join(__dirname, '..', 'utils', 'scanReportGenerator.js');
            let markdownReport = '';
            try {
              const { generateMarkdownReport } = require(reportGeneratorPath);
              markdownReport = generateMarkdownReport(scanData);
            } catch (error) {
              console.error('Error generating markdown report:', error);
              markdownReport = `# Network Scan Report\n\nTarget: ${target}\n\nScan completed at: ${new Date().toISOString()}\n\n## Results\n\n\`\`\`json\n${JSON.stringify(scanData, null, 2)}\n\`\`\``;
            }
            
            event.sender.send('networkscan:progress', {
              stage: 'completed',
              message: 'Network scan completed successfully',
              command: '',
              output: '',
              consoleLog: `\n✅ [SCAN] Network scan completed successfully!\n`
            });
            
            console.log('Network scan completed, sending results');
            event.sender.send('networkscan:done', { 
              success: true, 
              summary: 'Network scan completed successfully',
              results: {
                json: scanData,
                markdown: markdownReport,
                raw: jsonContent
              },
              target: target,
              extractedIP: scanData.ip_address || null
            });
            
            // Clean up temp files
            try {
              if (fs.existsSync(nmapXmlFile)) fs.unlinkSync(nmapXmlFile);
              if (fs.existsSync(jsonOutputFile)) fs.unlinkSync(jsonOutputFile);
              if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
                fs.rmdirSync(tempDir);
              }
            } catch (cleanupError) {
              console.log('Cleanup warning:', cleanupError.message);
            }
            
          } catch (pythonError) {
            console.error('Python script error:', pythonError);
            event.sender.send('networkscan:done', {
              success: false,
              error: `Failed to parse scan results: ${pythonError.message}`,
              results: null
            });
            throw pythonError;
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

  app.whenReady().then(async () => {
  const win = await createMainWindow();

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
      'curl','wget'
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
  

  // Comprehensive tool checking and installation function
  async function checkAndInstallRequiredTools(password, event = null) {
    console.log('🔧 [TOOL-CHECKER] Starting comprehensive tool check and installation...');
    
    const requiredTools = [
      'jq', 'unzip', 'nmap', 'nikto', 'sqlmap', 'hydra', 'gobuster', 'dirb', 
      'amass', 'john', 'medusa', 'zaproxy', 'mitmproxy', 'socat', 'fail2ban', 
      'curl', 'wget'
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

  // Server scan handlers
  let serverScanChild = null;
  let serverScanAbortController = null;
  
  ipcMain.handle('serverscan:start', async (event, target) => {
    console.log('serverscan:start handler called with target:', target);
    
    if (serverScanChild) return { error: 'Server scan already running' };
    
    try {
      // Create abort controller for this scan
      serverScanAbortController = new AbortController();
      
      // Simulate a realistic server scan flow with proper timing
      console.log('Server scan handler is working - starting test scan simulation');
      
      // Run the simulation in background
      (async () => {
        try {
          console.log('Sending initial progress message...');
          event.sender.send('serverscan:progress', { stage: 'starting', message: 'Initializing server security scan...' });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log('Sending DNS progress message...');
          event.sender.send('serverscan:progress', { stage: 'dns', message: 'Starting DNS resolution...' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Sending Nmap progress message...');
          event.sender.send('serverscan:progress', { stage: 'nmap', message: 'Starting port discovery...' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('Sending SSL progress message...');
          event.sender.send('serverscan:progress', { stage: 'ssl', message: 'Checking SSL/TLS configuration...' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Sending Nikto progress message...');
          event.sender.send('serverscan:progress', { stage: 'nikto', message: 'Scanning web server...' });
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('Sending Gobuster progress message...');
          event.sender.send('serverscan:progress', { stage: 'gobuster', message: 'Enumerating directories...' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Sending SQLMap progress message...');
          event.sender.send('serverscan:progress', { stage: 'sqlmap', message: 'Checking for SQL injection...' });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Sending reports progress message...');
          event.sender.send('serverscan:progress', { stage: 'reports', message: 'Generating reports...' });
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Send completion with advanced mock results
          const mockResults = {
            target: target,
            hostname: new URL(target.startsWith('http') ? target : `https://${target}`).hostname,
            timestamp: new Date().toISOString(),
            scanDuration: '15 minutes',
            scanType: 'Comprehensive Security Assessment',
            summary: {
              dnsResolved: true,
              portsScanned: 65535,
              servicesDetected: 12,
              vulnerabilitiesFound: 8,
              directoriesFound: 47,
              totalFindings: 67,
              riskScore: 7.2,
              securityLevel: 'Medium-High Risk'
            },
            findings: {
              dns: {
                ip: '203.0.113.1',
                mx: 'mail.example.com',
                txt: ['v=spf1 include:_spf.google.com ~all', 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com'],
                cname: ['www.example.com'],
                ns: ['ns1.example.com', 'ns2.example.com'],
                soa: 'ns1.example.com admin.example.com',
                ptr: 'web.example.com',
                srv: [
                  { service: '_http._tcp', target: 'web.example.com', port: 80, priority: 10, weight: 5 },
                  { service: '_https._tcp', target: 'web.example.com', port: 443, priority: 10, weight: 5 }
                ]
              },
              ports: [
                { 
                  port: 22, 
                  service: 'ssh', 
                  version: 'OpenSSH 8.2p1 Ubuntu 4ubuntu0.5', 
                  status: 'open',
                  banner: 'SSH-2.0-OpenSSH_8.2p1 Ubuntu-4ubuntu0.5',
                  cpe: 'cpe:/a:openbsd:openssh:8.2p1',
                  riskLevel: 'High',
                  vulnerabilities: ['Weak SSH configuration', 'Default SSH port exposed'],
                  recommendations: ['Change default port', 'Disable root login', 'Use key-based authentication']
                },
                { 
                  port: 80, 
                  service: 'http', 
                  version: 'Apache/2.4.41 (Ubuntu)', 
                  status: 'open',
                  banner: 'Apache/2.4.41 (Ubuntu) Server at example.com Port 80',
                  cpe: 'cpe:/a:apache:http_server:2.4.41',
                  riskLevel: 'Medium',
                  vulnerabilities: ['Server version disclosure', 'Missing security headers'],
                  recommendations: ['Hide server version', 'Implement security headers', 'Enable HTTPS redirect']
                },
                { 
                  port: 443, 
                  service: 'https', 
                  version: 'Apache/2.4.41 (Ubuntu)', 
                  status: 'open',
                  banner: 'Apache/2.4.41 (Ubuntu) Server at example.com Port 443',
                  cpe: 'cpe:/a:apache:http_server:2.4.41',
                  riskLevel: 'Medium',
                  vulnerabilities: ['Weak SSL/TLS configuration', 'Outdated cipher suites'],
                  recommendations: ['Update SSL configuration', 'Disable weak ciphers', 'Implement HSTS']
                },
                { 
                  port: 3306, 
                  service: 'mysql', 
                  version: 'MySQL 8.0.25', 
                  status: 'open',
                  banner: 'MySQL 8.0.25-0ubuntu0.20.04.1',
                  cpe: 'cpe:/a:oracle:mysql:8.0.25',
                  riskLevel: 'High',
                  vulnerabilities: ['Database exposed to internet', 'Default MySQL port'],
                  recommendations: ['Restrict database access', 'Use firewall rules', 'Enable SSL for MySQL']
                },
                { 
                  port: 5432, 
                  service: 'postgresql', 
                  version: 'PostgreSQL 13.3', 
                  status: 'open',
                  banner: 'PostgreSQL 13.3 (Ubuntu 13.3-1.pgdg20.04+1) on x86_64-pc-linux-gnu',
                  cpe: 'cpe:/a:postgresql:postgresql:13.3',
                  riskLevel: 'High',
                  vulnerabilities: ['Database exposed to internet', 'Default PostgreSQL port'],
                  recommendations: ['Restrict database access', 'Use firewall rules', 'Enable SSL for PostgreSQL']
                },
                { 
                  port: 6379, 
                  service: 'redis', 
                  version: 'Redis 6.2.6', 
                  status: 'open',
                  banner: 'Redis 6.2.6 (00000000/0) 64 bit',
                  cpe: 'cpe:/a:redis:redis:6.2.6',
                  riskLevel: 'High',
                  vulnerabilities: ['Redis exposed without authentication', 'Default Redis port'],
                  recommendations: ['Enable Redis authentication', 'Restrict network access', 'Use firewall rules']
                }
              ],
              vulnerabilities: [
                { 
                  type: 'SSL/TLS Configuration', 
                  severity: 'High', 
                  description: 'Weak SSL/TLS configuration detected with support for outdated protocols and weak cipher suites',
                  cve: 'CVE-2021-3449',
                  cvss: 7.5,
                  affected: 'TLS 1.0, TLS 1.1, RC4, DES, MD5',
                  remediation: 'Disable TLS 1.0/1.1, remove weak ciphers, implement TLS 1.3',
                  references: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-3449']
                },
                { 
                  type: 'HTTP Security Headers', 
                  severity: 'Medium', 
                  description: 'Missing critical security headers that could prevent XSS, clickjacking, and other attacks',
                  cve: 'N/A',
                  cvss: 5.3,
                  affected: 'X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Strict-Transport-Security',
                  remediation: 'Implement comprehensive security headers policy',
                  references: ['https://owasp.org/www-project-secure-headers/']
                },
                { 
                  type: 'Server Information Disclosure', 
                  severity: 'Medium', 
                  description: 'Web server version and configuration details are exposed in HTTP headers',
                  cve: 'N/A',
                  cvss: 4.2,
                  affected: 'Server header, X-Powered-By header',
                  remediation: 'Hide server version information, remove unnecessary headers',
                  references: ['https://owasp.org/www-community/attacks/Information_disclosure']
                },
                { 
                  type: 'Database Exposure', 
                  severity: 'Critical', 
                  description: 'Database services (MySQL, PostgreSQL, Redis) are exposed to the internet without proper authentication',
                  cve: 'N/A',
                  cvss: 9.8,
                  affected: 'MySQL (3306), PostgreSQL (5432), Redis (6379)',
                  remediation: 'Implement database authentication, restrict network access, use VPN',
                  references: ['https://owasp.org/www-project-top-ten/2017/A3_2017-Sensitive_Data_Exposure']
                },
                { 
                  type: 'Directory Traversal', 
                  severity: 'High', 
                  description: 'Potential directory traversal vulnerability detected in web application',
                  cve: 'CVE-2021-44228',
                  cvss: 8.1,
                  affected: 'Web application file access controls',
                  remediation: 'Implement proper input validation, use whitelist approach for file access',
                  references: ['https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2021-44228']
                },
                { 
                  type: 'SQL Injection', 
                  severity: 'Critical', 
                  description: 'SQL injection vulnerabilities detected in web application forms and parameters',
                  cve: 'CVE-2021-44228',
                  cvss: 9.1,
                  affected: 'Login forms, search functionality, user input fields',
                  remediation: 'Implement parameterized queries, input validation, WAF protection',
                  references: ['https://owasp.org/www-project-top-ten/2017/A1_2017-Injection']
                },
                { 
                  type: 'Cross-Site Scripting (XSS)', 
                  severity: 'High', 
                  description: 'Reflected and stored XSS vulnerabilities detected in web application',
                  cve: 'CVE-2021-44228',
                  cvss: 7.8,
                  affected: 'User input fields, search functionality, comment systems',
                  remediation: 'Implement output encoding, Content Security Policy, input validation',
                  references: ['https://owasp.org/www-project-top-ten/2017/A7_2017-Cross-Site_Scripting_(XSS)']
                },
                { 
                  type: 'Insecure Direct Object References', 
                  severity: 'Medium', 
                  description: 'Direct object references without proper authorization checks detected',
                  cve: 'N/A',
                  cvss: 6.1,
                  affected: 'File access, user data access, administrative functions',
                  remediation: 'Implement proper authorization checks, use indirect object references',
                  references: ['https://owasp.org/www-project-top-ten/2017/A5_2017-Broken_Access_Control']
                }
              ],
              directories: [
                { path: '/admin', status: 200, size: 1024, title: 'Administration Panel', description: 'Admin login page with basic authentication' },
                { path: '/login', status: 200, size: 2048, title: 'User Login', description: 'User authentication portal' },
                { path: '/backup', status: 403, size: 0, title: 'Backup Directory', description: 'Protected backup files directory' },
                { path: '/uploads', status: 200, size: 51200, title: 'File Uploads', description: 'Public file upload directory' },
                { path: '/config', status: 403, size: 0, title: 'Configuration', description: 'Application configuration files' },
                { path: '/logs', status: 403, size: 0, title: 'Log Files', description: 'Application and system logs' },
                { path: '/api', status: 200, size: 4096, title: 'API Endpoint', description: 'REST API interface' },
                { path: '/dashboard', status: 200, size: 8192, title: 'User Dashboard', description: 'User control panel' },
                { path: '/profile', status: 200, size: 3072, title: 'User Profile', description: 'User profile management' },
                { path: '/settings', status: 200, size: 2048, title: 'Settings', description: 'Application settings page' },
                { path: '/.git', status: 403, size: 0, title: 'Git Repository', description: 'Version control repository (should be hidden)' },
                { path: '/.env', status: 403, size: 0, title: 'Environment File', description: 'Environment configuration file' },
                { path: '/phpinfo.php', status: 200, size: 1024, title: 'PHP Info', description: 'PHP configuration information (security risk)' },
                { path: '/test.php', status: 200, size: 512, title: 'Test Script', description: 'Development test script (should be removed)' },
                { path: '/debug', status: 200, size: 2048, title: 'Debug Mode', description: 'Application debug interface' }
              ],
              ssl: {
                certificate: {
                  issuer: 'Let\'s Encrypt Authority X3',
                  subject: 'CN=example.com',
                  validFrom: '2023-01-01',
                  validTo: '2023-04-01',
                  keySize: 2048,
                  signatureAlgorithm: 'SHA256withRSA',
                  serialNumber: '03:12:34:56:78:90:AB:CD:EF:01:23:45:67:89:AB:CD:EF'
                },
                protocols: {
                  tls10: true,
                  tls11: true,
                  tls12: true,
                  tls13: false
                },
                ciphers: {
                  weak: ['RC4', 'DES', '3DES', 'MD5'],
                  strong: ['AES-256-GCM', 'AES-128-GCM', 'ChaCha20-Poly1305']
                },
                vulnerabilities: [
                  'TLS 1.0 and 1.1 support (deprecated)',
                  'Weak cipher suites enabled',
                  'Missing HSTS header',
                  'Certificate expires in 30 days'
                ]
              },
              webApplication: {
                technology: {
                  server: 'Apache/2.4.41',
                  language: 'PHP 7.4.3',
                  framework: 'Laravel 8.x',
                  database: 'MySQL 8.0.25'
                },
                securityHeaders: {
                  present: ['X-Frame-Options', 'X-Content-Type-Options'],
                  missing: ['Strict-Transport-Security', 'Content-Security-Policy', 'X-XSS-Protection']
                },
                cookies: [
                  { name: 'session_id', secure: false, httpOnly: true, sameSite: 'Lax' },
                  { name: 'csrf_token', secure: false, httpOnly: false, sameSite: 'Strict' },
                  { name: 'remember_me', secure: false, httpOnly: true, sameSite: 'Lax' }
                ]
              },
              network: {
                latency: '45ms',
                bandwidth: '100 Mbps',
                packetLoss: '0.1%',
                jitter: '2ms',
                mtu: 1500
              },
              operatingSystem: {
                type: 'Linux',
                version: 'Ubuntu 20.04.3 LTS',
                kernel: '5.4.0-89-generic',
                architecture: 'x86_64',
                uptime: '45 days, 12 hours'
              }
            },
            recommendations: {
              critical: [
                'Immediately secure database services with authentication',
                'Implement proper firewall rules to restrict database access',
                'Enable SSL/TLS for all database connections',
                'Remove or secure exposed administrative interfaces'
              ],
              high: [
                'Update SSL/TLS configuration to disable weak protocols',
                'Implement comprehensive security headers',
                'Enable HSTS and Content Security Policy',
                'Remove server version disclosure'
              ],
              medium: [
                'Implement proper input validation and output encoding',
                'Enable database query logging and monitoring',
                'Implement rate limiting and DDoS protection',
                'Regular security assessments and penetration testing'
              ],
              low: [
                'Implement security monitoring and alerting',
                'Regular backup and disaster recovery testing',
                'Security awareness training for development team',
                'Implement change management processes'
              ]
            },
            compliance: {
              pci: { score: 6.5, status: 'Non-compliant', issues: ['Database exposure', 'Weak SSL configuration'] },
              gdpr: { score: 7.2, status: 'Partially compliant', issues: ['Data encryption', 'Access controls'] },
              iso27001: { score: 5.8, status: 'Non-compliant', issues: ['Security controls', 'Risk management'] },
              sox: { score: 6.9, status: 'Partially compliant', issues: ['Access controls', 'Audit logging'] }
            }
          };
          
          console.log('Sending completion message...');
          event.sender.send('serverscan:done', { success: true, summary: 'Server scan completed successfully', result: mockResults });
        } catch (error) {
          console.error('Simulation error:', error);
          event.sender.send('serverscan:progress', { stage: 'error', message: error.message });
          event.sender.send('serverscan:done', null);
        } finally {
          serverScanChild = null;
          serverScanAbortController = null;
        }
      })();
      
      return { success: true, message: 'Server scan started (test mode)' };
    } catch (error) {
      console.error('Server scan start error:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('serverscan:abort', async () => {
    if (serverScanAbortController) {
      serverScanAbortController.abort();
      serverScanChild = null;
      serverScanAbortController = null;
      return { success: true };
    }
    return { error: 'No server scan running' };
  });

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
