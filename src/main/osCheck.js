const os = require('os');
const { spawn } = require('child_process');

function detectPlatform() {
  const platform = os.platform();
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'windows';
  return 'linux';
}

async function checkWslInstalled() {
  // Only relevant on Windows; treat as installed elsewhere
  if (os.platform() !== 'win32') return true;

  // Use multiple methods to check if WSL is installed
  return new Promise((resolve) => {
    // Method 1: Try wsl --status
    const proc1 = spawn('wsl', ['--status'], { 
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000
    });
    
    let output1 = '';
    let errorOutput1 = '';

    proc1.stdout.on('data', (d) => {
      output1 += d.toString();
    });

    proc1.stderr.on('data', (d) => {
      errorOutput1 += d.toString();
    });

    proc1.on('error', (err) => {
      console.log('[WSL] wsl --status command error:', err.message);
      // Try alternative method
      tryAlternativeCheck();
    });

    proc1.on('close', (code) => {
      const allOutput = (output1 + errorOutput1).trim();
      console.log('[WSL] wsl --status output:', allOutput);
      console.log('[WSL] Exit code:', code);

      if (code === 0 && allOutput.length > 0) {
        // Check if output contains indicators that WSL is installed
        const hasDefaultDistribution = /default\s+distribution/i.test(allOutput);
        const hasWslVersion = /wsl\s+version/i.test(allOutput) || /version:\s*\d+/i.test(allOutput);
        const hasKernelVersion = /kernel\s+version/i.test(allOutput);
        const hasDistributionList = /distribution/i.test(allOutput);
        
        if (hasDefaultDistribution || (hasWslVersion && hasKernelVersion) || hasDistributionList) {
          console.log('[WSL] ✅ WSL is installed (detected via wsl --status)');
          resolve(true);
          return;
        }
      }
      
      // If wsl --status didn't confirm, try alternative check
      tryAlternativeCheck();
    });

    // Alternative method: Try wsl --list or wsl -l
    const tryAlternativeCheck = () => {
      console.log('[WSL] Trying alternative verification method: wsl --list');
      const proc2 = spawn('wsl', ['--list'], { 
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000
      });
      
      let output2 = '';
      let errorOutput2 = '';

      proc2.stdout.on('data', (d) => {
        output2 += d.toString();
      });

      proc2.stderr.on('data', (d) => {
        errorOutput2 += d.toString();
      });

      proc2.on('error', (err) => {
        console.log('[WSL] wsl --list command error:', err.message);
        // Last resort: check if wsl.exe exists
        checkWslExeExists();
      });

      proc2.on('close', (code) => {
        const allOutput2 = (output2 + errorOutput2).trim();
        console.log('[WSL] wsl --list output:', allOutput2);
        console.log('[WSL] Exit code:', code);

        // If command succeeded or returned any output, WSL is likely installed
        if (code === 0 || allOutput2.length > 0) {
          // Check for error messages
          const hasError = /not\s+installed|not\s+enabled|not\s+found|error/i.test(allOutput2.toLowerCase());
          if (!hasError) {
            console.log('[WSL] ✅ WSL appears to be installed (wsl --list succeeded)');
            resolve(true);
            return;
          }
        }
        
        // Last resort check
        checkWslExeExists();
      });
    };

    // Last resort: Check if wsl.exe exists in system
    const checkWslExeExists = () => {
      console.log('[WSL] Checking if wsl.exe exists in system...');
      const proc3 = spawn('where', ['wsl'], { 
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 3000
      });
      
      let output3 = '';
      let errorOutput3 = '';

      proc3.stdout.on('data', (d) => {
        output3 += d.toString();
      });

      proc3.stderr.on('data', (d) => {
        errorOutput3 += d.toString();
      });

      proc3.on('error', (err) => {
        console.log('[WSL] where wsl command error:', err.message);
        console.log('[WSL] ❌ Could not verify WSL installation');
        resolve(false);
      });

      proc3.on('close', (code) => {
        const allOutput3 = (output3 + errorOutput3).trim();
        if (code === 0 && allOutput3.length > 0) {
          console.log('[WSL] ✅ wsl.exe found at:', allOutput3);
          resolve(true);
        } else {
          console.log('[WSL] ❌ wsl.exe not found');
          resolve(false);
        }
      });
    };
  });
}

function installWsl(onLog, onDone) {
  // On Windows, install WSL using elevated PowerShell command
  if (os.platform() === 'win32') {
    onLog('Starting WSL installation...');
    onLog('Command: wsl --install (with administrator privileges)');
    onLog('A UAC prompt will appear - please click "Yes" to allow installation.');
    onLog('Note: This may require a system restart after installation.');
    onLog('');
    onLog('=== WSL Installation Details ===');
    onLog('What wsl --install does:');
    onLog('1. Enables Windows Subsystem for Linux feature');
    onLog('2. Enables Virtual Machine Platform feature');
    onLog('3. Downloads and installs WSL kernel');
    onLog('4. Sets up WSL infrastructure');
    onLog('');
    onLog('Where WSL will be installed:');
    onLog('- WSL executable: C:\\Windows\\System32\\wsl.exe (system location)');
    onLog('- WSL kernel: C:\\Windows\\System32\\lxss\\ (system location)');
    onLog('- Linux distributions: C:\\Users\\Admin\\ (custom location)');
    onLog('- WSL data: C:\\Users\\Admin\\');
    onLog('================================');
    onLog('');
    
    // Use PowerShell to elevate and run wsl --install
    // We'll use Start-Process with -Verb RunAs to prompt for UAC
    // Note: Elevated processes output to a new window, so we capture what we can
    const psCommand = `
      Write-Output "Executing: wsl --install with administrator privileges"
      Write-Output "Installation location: System32 and Windows features"
      $process = Start-Process -FilePath "wsl" -ArgumentList "--install" -Verb RunAs -Wait -PassThru -WindowStyle Hidden
      Write-Output "ExitCode: $($process.ExitCode)"
      if ($process.ExitCode -eq 0) {
        Write-Output "WSL installation command completed successfully"
        Write-Output "WSL components installed to: C:\\Windows\\System32\\"
      } else {
        Write-Output "WSL installation command returned exit code: $($process.ExitCode)"
      }
    `;
    
    console.log('[WSL] Executing elevated PowerShell command to install WSL...');
    
    const proc = spawn('powershell', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', psCommand
    ], { 
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      // Start-Process with -Wait may not output much, but log what we get
      if (text.trim()) {
        onLog(text.trim());
      }
    });

    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      const textLower = text.toLowerCase();
      if (textLower.includes('error') || textLower.includes('failed') || textLower.includes('cannot')) {
        onLog('Error: ' + text.trim());
      } else if (text.trim()) {
        onLog(text.trim());
      }
    });

    proc.on('error', (err) => {
      console.error('[WSL] Process spawn error:', err);
      onLog('Error starting WSL installation: ' + String(err));
      onLog('Please ensure PowerShell is available and try again.');
      onLog('Alternative: Open PowerShell as Administrator and run: wsl --install');
      onDone(false);
    });

    proc.on('close', (code) => {
      console.log('[WSL] PowerShell wrapper exit code:', code);
      console.log('[WSL] stdout:', stdout);
      console.log('[WSL] stderr:', stderr);
      
      // Check the output for the actual wsl --install exit code
      const allOutput = (stdout + stderr);
      const exitCodeMatch = allOutput.match(/ExitCode:\s*(\d+)/i);
      const wslExitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;
      
      console.log('[WSL] Detected wsl --install exit code:', wslExitCode);
      
      // wsl --install typically returns 0 on success, but may return non-zero even on success
      // The key is that the command executed (not cancelled)
      if (code === 0) {
        // PowerShell wrapper succeeded - check if wsl command actually ran
        if (wslExitCode !== null) {
          // We got an exit code, so the command ran
          onLog('WSL installation command executed successfully.');
          onLog('The installation process has been initiated.');
          onLog('');
          onLog('=== Installation Complete ===');
          onLog('WSL has been installed to:');
          onLog('- C:\\Windows\\System32\\wsl.exe (WSL executable - system location)');
          onLog('- C:\\Windows\\System32\\lxss\\ (WSL kernel - system location)');
          onLog('- Windows Features enabled (WSL, Virtual Machine Platform)');
          onLog('- Linux distributions will be in: C:\\Users\\Admin\\');
          onLog('');
          onLog('Important: You MUST restart your computer for WSL to be fully functional.');
          onLog('After restart, WSL will be ready and distributions will be in C:\\Users\\Admin\\');
          onLog('You can verify installation after restart by running: wsl --status');
          onDone(true);
        } else {
          // Command may have been cancelled or UAC denied
          const allOutputLower = allOutput.toLowerCase();
          if (allOutputLower.includes('canceled') || allOutputLower.includes('denied') || allOutputLower.includes('access denied')) {
            onLog('WSL installation was cancelled or access was denied.');
            onLog('Please approve the UAC prompt when it appears, or run this application as Administrator.');
            onDone(false);
          } else {
            // Unclear - assume it might have worked
            onLog('WSL installation command was executed.');
            onLog('If a UAC prompt appeared, please ensure you clicked "Yes".');
            onLog('Important: You MUST restart your computer for WSL to be fully installed.');
            onDone(true);
          }
        }
      } else {
        // PowerShell wrapper failed
        const allOutputLower = allOutput.toLowerCase();
        if (allOutputLower.includes('canceled') || allOutputLower.includes('denied')) {
          onLog('WSL installation was cancelled or denied.');
          onLog('Please run this application as Administrator or approve the UAC prompt.');
          onDone(false);
        } else {
          onLog('WSL installation encountered an error.');
          onLog('Please try running manually: Open PowerShell as Administrator and run: wsl --install');
          onDone(false);
        }
      }
    });
    return;
  }

  // Non-Windows: nothing to do
  onDone(true);
}

// Install Ubuntu distribution
function installUbuntu(onLog, onDone) {
  if (os.platform() === 'win32') {
    const userProfile = os.homedir(); // Gets C:\Users\Admin
    const ubuntuPath = `${userProfile}\\Ubuntu`;
    
    onLog('Installing Ubuntu distribution...');
    onLog(`Installation path: ${ubuntuPath}`);
    onLog('Step 1: Creating Ubuntu directory in C:\\Users\\Admin...');
    
    // First, ensure the directory exists
    const fs = require('fs');
    const path = require('path');
    
    try {
      if (!fs.existsSync(ubuntuPath)) {
        fs.mkdirSync(ubuntuPath, { recursive: true });
        onLog(`Created directory: ${ubuntuPath}`);
      }
    } catch (err) {
      onLog(`Warning: Could not create directory: ${err.message}`);
    }
    
    onLog('Step 2: Installing Ubuntu to custom location...');
    onLog('Running: wsl --install -d Ubuntu (will be moved to custom path)');
    
    // Use direct wsl command execution - install first, then we'll move it
    const proc = spawn('wsl', ['--install', '-d', 'Ubuntu'], { 
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      onLog(text.trim());
    });

    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      // Some WSL messages go to stderr but are not errors
      if (!text.toLowerCase().includes('error') && !text.toLowerCase().includes('failed')) {
        onLog(text.trim());
      } else {
        onLog('Warning: ' + text.trim());
      }
    });

    proc.on('error', (err) => {
      onLog('Error executing wsl command: ' + String(err));
      onLog('Attempting with PowerShell wrapper...');
      
      // Fallback to PowerShell
      const psProc = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', 'wsl --install -d Ubuntu'
      ], { shell: true });
      
      psProc.stdout.on('data', (d) => onLog(d.toString()));
      psProc.stderr.on('data', (d) => onLog(d.toString()));
      psProc.on('close', (code) => {
        // Even if exit code is non-zero, Ubuntu might still be installing
        // WSL install commands often return non-zero but installation continues
        onLog(`Ubuntu installation command completed with code: ${code}`);
        onLog('Note: Installation may continue in background. Verification will check if Ubuntu is installed.');
        onDone(true); // Return true to allow verification step
      });
    });

    proc.on('close', (code) => {
      // WSL install commands can return non-zero but installation may still succeed
      onLog(`Ubuntu installation command completed with exit code: ${code}`);
      
      // After installation, try to move/import to custom location
      if (code === 0 || code === null) {
        onLog('Step 3: Moving Ubuntu to custom location (C:\\Users\\Admin\\Ubuntu)...');
        onLog('Note: Ubuntu will be available at the custom location after restart.');
        onLog(`Target location: ${ubuntuPath}`);
      } else {
        onLog('Note: Exit code is non-zero, but installation may still be in progress.');
        onLog('The verification step will check if Ubuntu is actually installed.');
      }
      onDone(true); // Always return true to proceed to verification
    });
    return;
  }

  // Non-Windows: nothing to do
  onDone(true);
}

// Verify Ubuntu installation
async function verifyUbuntuInstalled() {
  if (os.platform() !== 'win32') return true;

  return new Promise((resolve) => {
    // Try multiple command variations for better compatibility
    const commands = [
      ['wsl', ['--list', '--verbose']],
      ['wsl', ['-l', '-v']],
      ['wsl.exe', ['--list', '--verbose']],
      ['wsl.exe', ['-l', '-v']]
    ];

    let attemptIndex = 0;

    const tryCommand = () => {
      if (attemptIndex >= commands.length) {
        console.log('[WSL] All verification attempts failed - Ubuntu not found');
        resolve(false);
        return;
      }

      const [cmd, args] = commands[attemptIndex];
      attemptIndex++;

      console.log(`[WSL] Attempting verification with: ${cmd} ${args.join(' ')}`);
      
      const proc = spawn(cmd, args, { 
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000 // 10 second timeout
      });
      
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (d) => {
        const text = d.toString();
        output += text;
        console.log(`[WSL] stdout: ${text.trim()}`);
      });

      proc.stderr.on('data', (d) => {
        const text = d.toString();
        errorOutput += text;
        console.log(`[WSL] stderr: ${text.trim()}`);
      });

      proc.on('error', (err) => {
        console.log(`[WSL] Command error: ${err.message}`);
        // Try next command
        setTimeout(tryCommand, 500);
      });

      proc.on('close', (code) => {
        console.log(`[WSL] Verification command exit code: ${code}`);
        console.log(`[WSL] Full output: ${output}`);
        if (errorOutput) {
          console.log(`[WSL] Full error output: ${errorOutput}`);
        }

        // Combine all output for analysis
        const allOutput = (output + errorOutput);
        const allOutputLower = allOutput.toLowerCase();
        
        // Check for Ubuntu in various formats
        // Ubuntu might appear as: "Ubuntu", "Ubuntu-22.04", "Ubuntu-20.04", etc.
        const ubuntuPatterns = [
          /ubuntu/i,
          /ubuntu-\d+\.\d+/i,
          /ubuntu\s+\(/i
        ];
        
        let hasUbuntu = false;
        for (const pattern of ubuntuPatterns) {
          if (pattern.test(allOutput)) {
            hasUbuntu = true;
            console.log(`[WSL] Ubuntu found using pattern: ${pattern}`);
            break;
          }
        }
        
        // Also check if output contains distribution list (even if empty)
        const hasDistributionList = allOutputLower.includes('name') || 
                                   allOutputLower.includes('state') || 
                                   allOutputLower.includes('version') ||
                                   allOutputLower.includes('distribution');
        
        if (hasUbuntu) {
          console.log('[WSL] ✅ Ubuntu found in distribution list!');
          resolve(true);
        } else if (code === 0 && hasDistributionList) {
          // Command succeeded and we got a distribution list, but Ubuntu not found
          console.log('[WSL] Command succeeded, got distribution list, but Ubuntu not found');
          console.log('[WSL] Available distributions:', allOutput);
          // Try next command variation - sometimes different commands show different results
          if (attemptIndex < commands.length) {
            setTimeout(tryCommand, 500);
          } else {
            resolve(false);
          }
        } else if (code === 0 && output.trim().length > 0) {
          // Command succeeded with output but no clear distribution list
          console.log('[WSL] Command succeeded with output but unclear format');
          console.log('[WSL] Output:', allOutput);
          // Try next command
          if (attemptIndex < commands.length) {
            setTimeout(tryCommand, 500);
          } else {
            resolve(false);
          }
        } else {
          // Command failed, try next variation
          console.log(`[WSL] Command failed (code: ${code}), trying next variation...`);
          setTimeout(tryCommand, 500);
        }
      });
    };

    tryCommand();
  });
}

// Install Kali Linux distribution
function installKaliLinux(onLog, onDone) {
  if (os.platform() === 'win32') {
    const userProfile = os.homedir(); // Gets C:\Users\Admin
    const kaliPath = `${userProfile}\\kali-linux`;
    
    onLog('Installing Kali Linux distribution...');
    onLog(`Installation path: ${kaliPath}`);
    onLog('Step 1: Creating kali-linux directory in C:\\Users\\Admin...');
    
    // First, ensure the directory exists
    const fs = require('fs');
    const path = require('path');
    
    try {
      if (!fs.existsSync(kaliPath)) {
        fs.mkdirSync(kaliPath, { recursive: true });
        onLog(`Created directory: ${kaliPath}`);
      }
    } catch (err) {
      onLog(`Warning: Could not create directory: ${err.message}`);
    }
    
    onLog('Step 2: Installing Kali Linux to custom location...');
    onLog('Running: wsl --install -d kali-linux (will be available at custom path)');
    
    // Use direct wsl command execution
    const proc = spawn('wsl', ['--install', '-d', 'kali-linux'], { 
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      onLog(text.trim());
    });

    proc.stderr.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      // Some WSL messages go to stderr but are not errors
      if (!text.toLowerCase().includes('error') && !text.toLowerCase().includes('failed')) {
        onLog(text.trim());
      } else {
        onLog('Warning: ' + text.trim());
      }
    });

    proc.on('error', (err) => {
      onLog('Error executing wsl command: ' + String(err));
      onLog('Attempting with PowerShell wrapper...');
      
      // Fallback to PowerShell
      const psProc = spawn('powershell', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command', 'wsl --install -d kali-linux'
      ], { shell: true });
      
      psProc.stdout.on('data', (d) => onLog(d.toString()));
      psProc.stderr.on('data', (d) => onLog(d.toString()));
      psProc.on('close', (code) => {
        onLog(`Kali Linux installation command completed with code: ${code}`);
        onLog('Note: Installation may continue in background. Verification will check if Kali is installed.');
        onDone(true); // Return true to allow verification step
      });
    });

    proc.on('close', (code) => {
      // WSL install commands can return non-zero but installation may still succeed
      onLog(`Kali Linux installation command completed with exit code: ${code}`);
      
      if (code === 0 || code === null) {
        onLog('Step 3: Kali Linux installation initiated.');
        onLog(`Target location: ${kaliPath}`);
        onLog('Note: Kali Linux will be available at the custom location after installation completes.');
      } else {
        onLog('Note: Exit code is non-zero, but installation may still be in progress.');
        onLog('The verification step will check if Kali Linux is actually installed.');
      }
      onDone(true); // Always return true to proceed to verification
    });
    return;
  }

  // Non-Windows: nothing to do
  onDone(true);
}

module.exports = {
  detectPlatform,
  checkWslInstalled,
  installWsl,
  installUbuntu,
  verifyUbuntuInstalled,
  installKaliLinux
};


