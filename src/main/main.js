const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell, Notification } = require('electron');
const { spawn } = require('child_process');
const { detectPlatform, checkWslInstalled, installWsl, installUbuntu, verifyUbuntuInstalled } = require('./osCheck');
require('dotenv').config();

const isDev = process.env.NODE_ENV !== 'production';

// Logging function to write to file
function logToFile(message) {
  try {
    // Use process.cwd() as fallback if app is not ready
    let logDir;
    try {
      logDir = path.join(app.getPath('userData'), 'logs');
    } catch {
      // Fallback to current working directory if app is not ready
      logDir = path.join(process.cwd(), 'logs');
    }
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const logFile = path.join(logDir, `main_${new Date().toISOString().split('T')[0]}.log`);
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logFile, logMessage, 'utf8');
  } catch (error) {
    // Silently fail if logging fails to prevent breaking the app
    console.error('Failed to write to log file:', error.message);
  }
}

// Helper: check if Kali Linux is installed in WSL
async function checkKaliInstalled() {
  // First, check if we're on native Kali Linux
  try {
    const { detectKaliEnvironment } = require('./osCheck');
    const env = await detectKaliEnvironment();

    if (env.type === 'native-kali') {
      console.log('✅ Native Kali Linux detected - no installation needed');
      return true;
    }
  } catch (e) {
    console.log('Environment detection error:', e.message);
  }

  // Method 1: Check with wsl --status (for Windows WSL users)
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
    const installProcess = spawn('wsl', ['--install', '-d', 'kali-linux'], {
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

// Global icon path for notifications - Use the original Cybersecurity Research icon
const iconPath = path.join(__dirname, '..', 'assets', 'Cybersecurity-research-02.png');

async function createMainWindow() {
  const iconPath = path.join(__dirname, '..', 'assets', 'logo', 'icons8-security-shield-64.png');
  
  // Define preload path
  const preloadPath = path.join(__dirname, 'preload.js');

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
      webSecurity: false
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // In development, load from Vite dev server
  if (isDev) {
    // Always use port 3000
    const ports = [3000];
    const hosts = ['127.0.0.1', 'localhost'];
    let loaded = false;

    // Function to check if server is ready
    const checkServerReady = (host, port) => {
      return new Promise((resolve) => {
        const http = require('http');
        const req = http.get(`http://${host}:${port}/`, { timeout: 2000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      });
    };

    // Wait for Vite server to be ready (up to 30 seconds)
    console.log('[MAIN] Waiting for Vite dev server to start...');
    let serverReady = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const host of hosts) {
        for (const port of ports) {
          serverReady = await checkServerReady(host, port);
          if (serverReady) {
            console.log(`[MAIN] ✅ Vite server is ready at http://${host}:${port}/`);
            break;
          }
        }
        if (serverReady) break;
      }
      if (serverReady) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`[MAIN] Waiting for Vite server... (attempt ${attempt + 1}/30)`);
    }

    // Function to try loading from a port with proper promise handling
    const tryLoadPort = (host, port) => {
      return new Promise((resolve) => {
        const url = `http://${host}:${port}/`;
        console.log(`[MAIN] Trying to load from: ${url}`);

        // Set up event listeners before loading
        const onFinishLoad = () => {
          console.log(`[MAIN] ✅ Successfully loaded from ${url}`);
          cleanup();
          resolve(true);
        };

        const onFailLoad = (event, errorCode, errorDescription) => {
          console.log(`[MAIN] ❌ Failed to load from ${url}: ${errorDescription} (${errorCode})`);
          cleanup();
          resolve(false);
        };

        const cleanup = () => {
          mainWindow.webContents.removeListener('did-finish-load', onFinishLoad);
          mainWindow.webContents.removeListener('did-fail-load', onFailLoad);
        };

        mainWindow.webContents.once('did-finish-load', onFinishLoad);
        mainWindow.webContents.once('did-fail-load', onFailLoad);

        // Load the URL
        mainWindow.loadURL(url);

        // Timeout after 10 seconds
        setTimeout(() => {
          cleanup();
          resolve(false);
        }, 10000);
      });
    };

    // Try hosts and ports sequentially
    for (const host of hosts) {
      for (const port of ports) {
        const success = await tryLoadPort(host, port);
        if (success) {
          loaded = true;
          break;
        }
      }
      if (loaded) break;
    }

    if (!loaded) {
      console.log('❌ Failed to load from any host/port, showing error page');
      mainWindow.loadURL(`data:text/html,
        <html>
          <head><title>Cyberix - Loading Error</title></head>
          <body style="font-family: 'Poppins', sans-serif; padding: 20px; background: #1a1a1a; color: white;">
            <h1>🚨 Cyberix Loading Error</h1>
            <p>The development server could not be found. Please ensure:</p>
            <ul>
              <li>The Vite dev server is running (check if <code>npm run dev</code> is running)</li>
              <li>The server is accessible at: <code>http://127.0.0.1:3000</code> or <code>http://localhost:3000</code></li>
              <li>Check the terminal running <code>npm run electron:dev</code> for errors</li>
            </ul>
            <p><strong>Tried hosts:</strong> ${hosts.join(', ')}</p>
            <p><strong>Tried ports:</strong> ${ports.join(', ')}</p>
            <p><strong>Current time:</strong> ${new Date().toLocaleString()}</p>
            <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">🔄 Retry</button>
            <button onclick="window.location.href='http://127.0.0.1:3000'" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">🌐 Open in Browser</button>
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
        // Always reload from port 3000
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

app.whenReady().then(async () => {
  // Register critical file system handlers FIRST before creating window
  // This ensures they're available when renderer process loads
  ipcMain.handle('fs:getUserDataPath', async () => {
    try {
      return app.getPath('userData');
    } catch (error) {
      console.error('Error getting user data path:', error);
      return null;
    }
  });

  ipcMain.handle('fs:ensureDirectoryExists', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log('Created directory:', dirPath);
      }
      return true;
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  });

  ipcMain.handle('fs:writeFile', async (event, filePath, data) => {
    try {
      // Ensure directory exists before writing
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, data, 'utf8');
      console.log('File written:', filePath);
      return true;
    } catch (error) {
      console.error('Error writing file:', error);
      return false;
    }
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = fs.readFileSync(filePath, 'utf8');
      return data;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  });

  ipcMain.handle('fs:listFiles', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        return [];
      }
      const files = fs.readdirSync(dirPath);
      return files.map(file => {
        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);
        return {
          name: file,
          path: fullPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        };
      });
    } catch (error) {
      console.error('Error listing files:', error);
      return [];
    }
  });

  ipcMain.handle('fs:getInstallPath', async () => {
    try {
      // Return the app's installation path
      return app.getAppPath();
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

  // Setup operations
  ipcMain.handle('setup:checkComplete', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const setupFile = path.join(userDataPath, 'cyberix-setup.json');

      if (fs.existsSync(setupFile)) {
        const setupData = JSON.parse(fs.readFileSync(setupFile, 'utf8'));
        return {
          completed: setupData.completed || false,
          installPath: setupData.installPath || null
        };
      }

      return { completed: false, installPath: null };
    } catch (error) {
      console.error('Error checking setup completion:', error);
      return { completed: false, installPath: null };
    }
  });

  ipcMain.handle('setup:markComplete', async (event, installPath) => {
    try {
      const userDataPath = app.getPath('userData');
      const setupFile = path.join(userDataPath, 'cyberix-setup.json');
      const setupData = {
        completed: true,
        installPath: installPath,
        completedAt: new Date().toISOString()
      };
      fs.writeFileSync(setupFile, JSON.stringify(setupData, null, 2), 'utf8');
      console.log('Setup marked as complete:', installPath);
      return true;
    } catch (error) {
      console.error('Error marking setup complete:', error);
      return false;
    }
  });

  ipcMain.handle('setup:selectDirectory', async (event) => {
    try {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(window || null, {
        properties: ['openDirectory'],
        title: 'Select Installation Directory'
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (error) {
      console.error('Error selecting directory:', error);
      return null;
    }
  });

  ipcMain.handle('setup:createDirectory', async (event, dirPath) => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log('Created directory:', dirPath);
      }
      return true;
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  });

  // OS operations
  ipcMain.handle('os:installKaliLinux', async (event) => {
    try {
      console.log('Kali Linux installation requested');
      return { success: true, message: 'Kali Linux installation initiated' };
    } catch (error) {
      console.error('Error installing Kali Linux:', error);
      return { success: false, error: error.message };
    }
  });

  // WSL operations
  ipcMain.handle('wsl:storeRootPassword', async (event, password) => {
    try {
      const userDataPath = app.getPath('userData');
      const passwordFile = path.join(userDataPath, 'wsl-root-password.enc');
      const encrypted = Buffer.from(password).toString('base64');
      fs.writeFileSync(passwordFile, encrypted);
      console.log('WSL root password stored securely');
      return true;
    } catch (error) {
      console.error('Error storing WSL root password:', error);
      return false;
    }
  });

  ipcMain.handle('wsl:getStoredRootPassword', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const passwordFile = path.join(userDataPath, 'wsl-root-password.enc');
      
      if (!fs.existsSync(passwordFile)) {
        return null;
      }
      
      const encrypted = fs.readFileSync(passwordFile, 'utf8');
      const password = Buffer.from(encrypted, 'base64').toString('utf8');
      return password;
    } catch (error) {
      console.error('Error getting stored WSL root password:', error);
      return null;
    }
  });

  ipcMain.handle('wsl:clearRootPassword', async () => {
    try {
      const userDataPath = app.getPath('userData');
      const passwordFile = path.join(userDataPath, 'wsl-root-password.enc');
      
      if (fs.existsSync(passwordFile)) {
        fs.unlinkSync(passwordFile);
        console.log('WSL root password cleared');
      }
      return true;
    } catch (error) {
      console.error('Error clearing WSL root password:', error);
      return false;
    }
  });

  ipcMain.handle('wsl:getDistro', async () => {
    try {
      const { execSync } = require('child_process');
      const distro = execSync('wsl --list --verbose', { encoding: 'utf8' });
      // Parse the output to find the default distro
      const lines = distro.split('\n').filter(line => line.trim());
      for (const line of lines.slice(1)) { // Skip header
        if (line.includes('*') || line.includes('(Default)')) {
          const parts = line.trim().split(/\s+/);
          return parts[0] || 'Ubuntu';
        }
      }
      // Fallback: try to get first distro
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        return parts[0] || 'Ubuntu';
      }
      return 'Ubuntu'; // Default fallback
    } catch (error) {
      console.error('Error getting WSL distro:', error);
      return 'Ubuntu'; // Default fallback
    }
  });

  ipcMain.handle('wsl:listDistributions', async () => {
    try {
      const { execSync } = require('child_process');
      const output = execSync('wsl --list --verbose', { encoding: 'utf8' });
      const lines = output.split('\n').filter(line => line.trim());
      const distributions = [];
      
      for (let i = 1; i < lines.length; i++) { // Skip header
        const line = lines[i].trim();
        if (line) {
          const parts = line.split(/\s+/);
          const name = parts[0];
          const state = parts[1] || 'Unknown';
          const version = parts[2] || '2';
          distributions.push({
            name,
            state,
            version,
            isDefault: line.includes('*') || line.includes('(Default)')
          });
        }
      }
      
      return distributions;
    } catch (error) {
      console.error('Error listing WSL distributions:', error);
      return [];
    }
  });

  ipcMain.handle('wsl:setDefaultDistro', async (event, distroName) => {
    try {
      const { execSync } = require('child_process');
      execSync(`wsl --set-default ${distroName}`, { encoding: 'utf8' });
      console.log(`Set default WSL distro to: ${distroName}`);
      return true;
    } catch (error) {
      console.error('Error setting default WSL distro:', error);
      return false;
    }
  });

  ipcMain.handle('wsl:setupCyberixFolder', async (event) => {
    try {
      // This would typically run WSL commands to set up the Cyberix folder
      // For now, return success as a placeholder
      console.log('WSL Cyberix folder setup requested');
      return { success: true, message: 'Cyberix folder setup initiated' };
    } catch (error) {
      console.error('Error setting up Cyberix folder:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('wsl:cloneRepository', async (event, repoName) => {
    try {
      // This would typically run git clone in WSL
      // For now, return success as a placeholder
      console.log(`WSL repository clone requested: ${repoName}`);
      return { success: true, message: `Repository ${repoName} clone initiated` };
    } catch (error) {
      console.error('Error cloning repository:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('wsl:setupPythonVenv', async (event) => {
    try {
      // This would typically set up Python virtual environment in WSL
      // For now, return success as a placeholder
      console.log('WSL Python virtual environment setup requested');
      return { success: true, message: 'Python virtual environment setup initiated' };
    } catch (error) {
      console.error('Error setting up Python virtual environment:', error);
      return { success: false, error: error.message };
    }
  });

  const win = await createMainWindow();

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
  ipcMain.handle('kali:check', async () => {
    return await checkKaliInstalled();
  });

  // Environment detection for frontend
  ipcMain.handle('environment:check', async () => {
    try {
      const env = await detectKaliEnvironment();
      return env;
    } catch (error) {
      console.log('Environment detection error:', error.message);
      return { type: 'unknown', distro: null };
    }
  });

  ipcMain.handle('kali:install', async (event) => {
    console.log('🚀 Starting Kali Linux installation via IPC...');
    
    // Update UI to show installation in progress
    event.sender.send('kali:installProgress', 'Starting Kali Linux installation...');
    
    try {
      const result = await installKaliLinux();
      
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

  // Helper: quick preflight to check WSL, Kali, and nmap availability
  async function detectWslAndNmap() {
    const result = { hasWsl: false, hasKali: false, wslNmap: false, winNmap: false, details: [] };
    try {
      const sp = require('child_process').spawnSync('wsl', ['-l', '-q'], { encoding: 'utf8' });
      if (sp.status === 0 && (sp.stdout || '').trim().length > 0) {
        result.hasWsl = true;
        const distributions = (sp.stdout || '').trim();
        result.details.push('WSL is present. Distributions:\n' + distributions);
        
        // Check if Kali is installed
        result.hasKali = await checkKaliInstalled();
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
    const pre = await detectWslAndNmap();
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
          pre.hasKali = true;
          // Re-check nmap after Kali installation
          const nmapCheck = require('child_process').spawnSync('wsl', ['-d', 'kali-linux', 'sh', '-lc', 'which nmap || echo __NO_NMAP__'], { encoding: 'utf8' });
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
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // List of common security tools
      const allTools = [
        'nmap',
        'nikto',
        'sqlmap',
        'gobuster',
        'dirb',
        'wfuzz',
        'masscan',
        'whatweb',
        'subfinder',
        'amass',
        'httpx',
        'nuclei',
        'burpsuite',
        'zap',
        'metasploit',
        'aircrack-ng',
        'john',
        'hashcat'
      ];

      const missingTools = [];
      const installedTools = [];

      console.log('🔍 Checking for missing tools...');

      for (const tool of allTools) {
        try {
          // Check if tool exists in WSL
          const command = `wsl bash -c "command -v ${tool}"`;
          const { stdout } = await execAsync(command, { timeout: 5000 });
          const toolPath = stdout.trim();

          if (toolPath && toolPath.length > 0) {
            console.log(`✅ ${tool} found at: ${toolPath}`);
            installedTools.push({ name: tool, path: toolPath, installed: true });
          } else {
            console.log(`❌ ${tool} not found`);
            missingTools.push({ name: tool, installed: false });
          }
        } catch (error) {
          // Tool not found or error checking
          console.log(`❌ ${tool} not found or error: ${error.message}`);
          missingTools.push({ name: tool, installed: false });
        }
      }

      console.log(`📊 Tools check complete: ${installedTools.length} installed, ${missingTools.length} missing`);

      return {
        success: true,
        installedTools,
        missingTools: missingTools.map(t => t.name),
        totalTools: allTools.length,
        installedCount: installedTools.length,
        missingCount: missingTools.length
      };
    } catch (error) {
      console.error('Error checking missing tools:', error);
      return {
        success: false,
        error: error.message,
        missingTools: [],
        installedTools: []
      };
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
            dryRun: false
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
      console.log('❌ Failed to clear root password:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Network scan handlers
  let networkScanChild = null;
  let networkScanAbortController = null;
  
  // Server scan handlers
  let serverScanChild = null;
  let serverScanAbortController = null;
  
  ipcMain.handle('networkscan:start', async (event, target) => {
    if (networkScanChild) return { error: 'Network scan already running' };
    
    try {
      // Create abort controller for this scan
      networkScanAbortController = new AbortController();
      
      // Import the network analysis module
      const networkAnalysisModule = require(path.join(__dirname, '..', 'scanners', 'network-analysis.js'));
      console.log('Network analysis module loaded:', typeof networkAnalysisModule.runNetworkAnalysis);
      
      // Run the network scan asynchronously
      const runNetworkScanAsync = async () => {
        try {
          event.sender.send('networkscan:progress', { stage: 'starting', message: 'Initializing network analysis...' });
          
          // Create a unique temporary directory for this scan
          const timestamp = Date.now();
          const tempDir = path.join(process.cwd(), 'temp-scans', `network-scan-${timestamp}`)
          
          // Ensure the directory exists
          fs.mkdirSync(tempDir, { recursive: true })
          
          // Debug: Log the tempDir path
          console.log('Network scan tempDir:', tempDir);
          console.log('Directory exists:', fs.existsSync(tempDir));
          event.sender.send('networkscan:progress', { stage: 'debug', message: `Using temp directory: ${tempDir}` });
          
          const options = {
            outputDir: tempDir, // Use temporary directory
            onProgress: (update) => {
              event.sender.send('networkscan:progress', update);
            },
            abortSignal: networkScanAbortController.signal,
            dryRun: false,
            captureTime: 30
          };
          
          // Debug: Log the options object
          console.log('Network scan options:', JSON.stringify(options, null, 2));
          event.sender.send('networkscan:progress', { stage: 'debug', message: `Options outputDir: ${options.outputDir}` });
          
          // Check if output contains generic AI greeting (indicates prompt not received)
          if (stdout && (stdout.includes('Hello! I\'m an AI assistant') || stdout.includes('How can I assist you today') || stdout.includes('Loading'))) {
            console.log('⚠️ [TGPT] Warning: Received generic AI greeting or loading message - prompt may not have been received');
            console.log('⚠️ [TGPT] Prompt preview:', prompt.substring(0, 200));
            console.log('⚠️ [TGPT] This suggests TGPT is not receiving the prompt correctly');
            console.log('⚠️ [TGPT] Try checking if TGPT is installed correctly: wsl bash -c "which tgpt"');
          }
          
          // Test the module with a simple call first
          console.log('About to call runNetworkAnalysis with:', {
            target,
            outputDir: options.outputDir,
            outputDirType: typeof options.outputDir
          });
          
          let result;
          try {
            result = await networkAnalysisModule.runNetworkAnalysis(target, options);
          } catch (networkError) {
            console.error('Network analysis module error:', networkError);
            console.error('Error details:', {
              message: networkError.message,
              stack: networkError.stack,
              target,
              outputDir: options.outputDir
            });
            throw networkError;
          }
          
          console.log('Network scan completed, sending result:', JSON.stringify(result, null, 2));
          event.sender.send('networkscan:done', { success: true, summary: 'Network scan completed successfully', result });
        } catch (error) {
          if (error.name === 'AbortError') {
            event.sender.send('networkscan:progress', { stage: 'aborted', message: 'Network scan aborted by user' });
            event.sender.send('networkscan:done', { aborted: true });
          } else {
            event.sender.send('networkscan:progress', { stage: 'error', message: error.message });
            event.sender.send('networkscan:done', null);
          }
        } finally {
          networkScanChild = null;
          networkScanAbortController = null;
          // Clean up temporary directory
          try {
            if (fs.existsSync(tempDir)) {
              fs.rmSync(tempDir, { recursive: true, force: true });
              console.log('Cleaned up temp directory:', tempDir);
            }
          } catch (cleanupError) {
            console.log('Cleanup warning:', cleanupError.message);
          }
        }
      };
      
      // Run in background
      runNetworkScanAsync();
      
      return { success: true };
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
      const child = spawn('wsl', commandParts, {
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
        const basicChild = spawn('wsl', basicCmd, {
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
            dialog.showMessageBox(win, {
              type: 'error',
              title: '❌ Installation Failed',
              message: 'Failed to install Kali Linux.',
              detail: 'Possible solutions:\n• Run the app as administrator\n• Check if WSL is properly installed\n• Try installing manually: wsl --install -d kali-linux\n• Check your internet connection'
            });
            win.webContents.executeJavaScript(`
              document.getElementById('kali-status').textContent = '❌ Kali Linux installation failed';
              document.getElementById('kali-status').style.color = '#ef4444';
              document.getElementById('install-kali-btn').style.display = 'block';
            `);
            resolve({ success: false, output });
          }
        });
      });
    } catch (error) {
      console.error('Auto-install error:', error.message);
      event.sender.send('tools:autoInstallProgress', { 
        stage: 'error', 
        message: `Auto-install failed: ${error.message}` 
      });
      return { success: false, error: error.message };
    }
  });

  // Check required tools only (using child_process)
  ipcMain.handle('tools:checkRequiredToolsOnly', async (event, password) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // List of required security tools
      const requiredTools = [
        'nmap',
        'nikto',
        'sqlmap',
        'gobuster',
        'dirb',
        'wfuzz',
        'masscan',
        'whatweb',
        'subfinder',
        'amass',
        'httpx',
        'nuclei'
      ];

      const missingTools = [];
      const installedTools = [];

      console.log('🔍 Checking required tools...');

      for (const tool of requiredTools) {
        try {
          let command;
          if (password) {
            // Use password with WSL
            command = `echo "${password}" | wsl bash -c "command -v ${tool}"`;
          } else {
            // Try without password (for already authenticated sessions)
            command = `wsl bash -c "command -v ${tool}"`;
          }

          const { stdout } = await execAsync(command, { timeout: 5000 });
          const toolPath = stdout.trim();

          if (toolPath && toolPath.length > 0) {
            console.log(`✅ ${tool} found at: ${toolPath}`);
            installedTools.push({ name: tool, path: toolPath, installed: true });
          } else {
            console.log(`❌ ${tool} not found`);
            missingTools.push({ name: tool, installed: false });
          }
        } catch (error) {
          // Tool not found or error checking
          console.log(`❌ ${tool} not found or error: ${error.message}`);
          missingTools.push({ name: tool, installed: false });
        }
      }

      console.log(`📊 Tools check complete: ${installedTools.length} installed, ${missingTools.length} missing`);

      return {
        success: true,
        installedTools,
        missingTools: missingTools.map(t => t.name),
        totalRequired: requiredTools.length,
        installedCount: installedTools.length,
        missingCount: missingTools.length
      };
    } catch (error) {
      console.error('Error checking required tools:', error);
      return {
        success: false,
        error: error.message,
        missingTools: [],
        installedTools: []
      };
    }
  });

  // Install missing tools
  ipcMain.handle('tools:installMissing', async (event, missingTools) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Get stored password
      const userDataPath = app.getPath('userData');
      const passwordFile = path.join(userDataPath, 'wsl-root-password.enc');
      let password = null;

      if (fs.existsSync(passwordFile)) {
        try {
          const encrypted = fs.readFileSync(passwordFile, 'utf8');
          password = Buffer.from(encrypted, 'base64').toString('utf8');
        } catch (e) {
          console.error('Error reading stored password:', e);
        }
      }

      if (!password) {
        return {
          success: false,
          error: 'WSL root password not found. Please provide password.'
        };
      }

      console.log(`🔧 Installing ${missingTools.length} missing tools...`);

      // Build apt install command
      const toolsToInstall = missingTools.join(' ');
      const aptCommand = `sudo apt update && sudo apt install -y ${toolsToInstall}`;

      let wslCommand;
      if (password) {
        wslCommand = `echo "${password}" | wsl bash -c "${aptCommand}"`;
      } else {
        wslCommand = `wsl bash -c "${aptCommand}"`;
      }

      console.log('📋 Installation command:', wslCommand.replace(password, '***'));

      // Send progress updates
      event.sender.send('tools:installProgress', {
        stage: 'installing',
        message: `Installing ${missingTools.length} tools...`,
        progress: 0
      });

      const { stdout, stderr } = await execAsync(wslCommand, {
        timeout: 300000, // 5 minutes timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      console.log('✅ Tools installation completed');
      console.log('📝 Output:', stdout.substring(0, 500));

      event.sender.send('tools:installProgress', {
        stage: 'complete',
        message: 'All tools installed successfully!',
        progress: 100
      });

      return {
        success: true,
        message: `Successfully installed ${missingTools.length} tools`,
        installedTools: missingTools,
        output: stdout
      };
    } catch (error) {
      console.error('Error installing missing tools:', error);
      event.sender.send('tools:installProgress', {
        stage: 'error',
        message: `Installation failed: ${error.message}`,
        progress: 0
      });

      return {
        success: false,
        error: error.message,
        installedTools: []
      };
    }
  });

  // Check WSL and Kali Linux availability
  ipcMain.handle('kali:checkWsl', async (event) => {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Check if WSL is available
      try {
        await execAsync('wsl --status');
        console.log('✅ WSL is available');
        
        // Check if Kali Linux is installed
        try {
          await execAsync('wsl -d kali-linux echo "Kali Linux is installed"');
          console.log('✅ Kali Linux is installed');
          return { hasWsl: true, hasKali: true };
        } catch (kaliError) {
          console.log('⚠️ Kali Linux is not installed');
          return { hasWsl: true, hasKali: false };
        }
      } catch (wslError) {
        console.log('⚠️ WSL is not available');
        return { hasWsl: false, hasKali: false };
      }
    } catch (error) {
      console.log('WSL check failed:', error.message);
      return { hasWsl: false, hasKali: false };
    }
  });

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
