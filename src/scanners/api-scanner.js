const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { runWSLRaw, runWSLAsRoot, runWSL } = require('../utils/wslHelper');

class APIScanner {
  constructor(targetUrl, outputDir = './temp-api-scans', duration = 120) {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
    this.duration = duration;
    this.progressCallback = null;
    this.captureProcess = null;
    this.captureData = {
      endpoints: [],
      requests: [],
      responses: [],
      summary: {}
    };
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  log(message, progress = 0, command = null) {
    // Extract raw command from bash -c wrapper for display
    let rawCommand = command;
    if (command) {
      // Remove bash -c wrapper and extract inner command
      if (command.startsWith("bash -c '")) {
        const startIdx = 9;
        const lastQuoteIdx = command.lastIndexOf("'");
        if (lastQuoteIdx > startIdx) {
          rawCommand = command.substring(startIdx, lastQuoteIdx)
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\');
        }
      } else if (command.startsWith("bash -c \"")) {
        const startIdx = 9;
        const lastQuoteIdx = command.lastIndexOf('"');
        if (lastQuoteIdx > startIdx) {
          rawCommand = command.substring(startIdx, lastQuoteIdx)
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\\\/g, '\\');
        }
      }
    }
    
    const logMessage = command ? `${message}\n\n📝 Command: ${rawCommand}` : message;
    
    // Always log to console with clear formatting
    console.log(`\n[API-Scanner] ${message}`);
    if (command) {
      console.log(`\n[API-Scanner] ========== COMMAND ==========`);
      console.log(`[API-Scanner] ${rawCommand}`);
      console.log(`[API-Scanner] =============================\n`);
    }
    
    if (this.progressCallback) {
      this.progressCallback({
        progress,
        message: logMessage,
        command: rawCommand,
        type: 'info'
      });
    }
  }

  async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }


  async getNetworkInterface() {
    this.log('🔍 Detecting network interface...', 18);
    
    try {
      // Method 1: Try tshark -D first
      const listIfacesCmd1 = `bash -c 'tshark -D 2>&1'`;
      const listResult1 = await runWSLRaw(listIfacesCmd1);
      let interfaces = [];
      
      if (listResult1.success && listResult1.stdout) {
        // Parse tshark -D output (format: "1. eth0")
        const lines = listResult1.stdout.trim().split('\n');
        interfaces = lines
          .map(line => {
            // Extract interface name from lines like "1. eth0" or "1    eth0"
            const match = line.match(/^\s*\d+[.\s]+(\S+)/);
            return match ? match[1] : null;
          })
          .filter(iface => iface && iface !== 'any' && iface !== 'lo');
        
        if (interfaces.length > 0) {
          this.log(`📋 Available interfaces (from tshark): ${interfaces.join(', ')}`, 18);
        }
      }
      
      // Method 2: Fallback to ip link show if tshark -D failed or returned no interfaces
      if (interfaces.length === 0) {
        const listIfacesCmd2 = `bash -c 'ip -o link show 2>&1 | awk "{print \\$2}" | sed "s/://"'`;
        const listResult2 = await runWSLRaw(listIfacesCmd2);
        
        if (listResult2.success && listResult2.stdout) {
          const allInterfaces = listResult2.stdout.trim().split('\n').filter(iface => iface.trim());
          interfaces = allInterfaces.filter(iface => iface !== 'any' && iface !== 'lo');
          if (interfaces.length > 0) {
            this.log(`📋 Available interfaces (from ip): ${interfaces.join(', ')}`, 18);
          }
        }
      }
      
      if (interfaces.length > 0) {
        // For WSL, prefer eth0 (as per runbook - avoid 'any' to prevent promiscuous mode warnings)
        // Order of preference: eth0 > ens33 > enp0s3 > wlan0 (WSL network interfaces)
        const preferredInterfaces = ['eth0', 'ens33', 'enp0s3', 'wlan0'];
        for (const prefIface of preferredInterfaces) {
          if (interfaces.includes(prefIface)) {
            this.log(`✅ Using network interface: ${prefIface} (WSL interface)`, 18);
            return prefIface;
          }
        }
        
        // Try to get the default interface as fallback
        const ifaceCmd = `bash -c 'ip route | grep default | awk "{print \\$5}" | head -1'`;
        const result = await runWSLRaw(ifaceCmd);
        
        if (result.success && result.stdout.trim()) {
          const iface = result.stdout.trim();
          // Validate that the interface exists in the list
          if (interfaces.includes(iface)) {
            this.log(`✅ Using default network interface: ${iface}`, 18);
            return iface;
          } else {
            this.log(`⚠️ Default interface ${iface} not found in available interfaces`, 18);
          }
        }
        
        // If no preferred interface found, use first available
        this.log(`⚠️ Using first available interface: ${interfaces[0]}`, 18);
        return interfaces[0];
      } else {
        // Fallback to eth0 (most common for WSL)
        this.log('⚠️ Could not list interfaces, using default: eth0', 18);
        
        // Show detailed error information
        if (listResult1.stderr) {
          this.log(`❌ tshark -D error: ${listResult1.stderr.substring(0, 500)}`, 18);
        }
        if (listResult1.stdout && !listResult1.stdout.includes('eth0')) {
          this.log(`📋 tshark -D output: ${listResult1.stdout.substring(0, 300)}`, 18);
        }
        
        if (listResult2 && listResult2.stderr) {
          this.log(`❌ ip link show error: ${listResult2.stderr.substring(0, 500)}`, 18);
        }
        
        // Try a simple fallback method
        this.log(`🔍 Trying simple interface detection...`, 18);
        const simpleCheckCmd = `bash -c 'ls /sys/class/net/ 2>&1 | grep -v lo | head -1'`;
        const simpleCheckResult = await runWSLRaw(simpleCheckCmd);
        if (simpleCheckResult.success && simpleCheckResult.stdout && simpleCheckResult.stdout.trim()) {
          const simpleIface = simpleCheckResult.stdout.trim();
          this.log(`✅ Found interface via /sys/class/net/: ${simpleIface}`, 18);
          return simpleIface;
        }
        
        this.log(`💡 Interface detection failed - possible issues:`, 18);
        this.log(`   1. Network interface commands may not be available`, 18);
        this.log(`   2. WSL networking may not be properly configured`, 18);
        this.log(`   3. Try manually: Run 'ip link show' in WSL terminal`, 18);
        return 'eth0';
      }
    } catch (error) {
      this.log(`⚠️ Interface detection failed: ${error.message}, using default: eth0`, 18);
      return 'eth0';
    }
  }

  async resolveDomainToIPs(domain) {
    this.log(`🔍 Resolving ${domain} to IP addresses...`, 18);
    
    try {
      // Try multiple resolution methods with error output
      const resolveCommands = [
        { 
          label: 'dig', 
          cmd: `bash -c 'dig +short ${domain} A ${domain} AAAA 2>&1'`,
          parser: (output) => output.trim().split('\n').filter(ip => {
            const trimmed = ip.trim();
            return trimmed && (
              /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
              /^[0-9a-fA-F:]+$/.test(trimmed)
            );
          })
        },
        { 
          label: 'getent', 
          cmd: `bash -c 'getent hosts ${domain} 2>&1 | awk "{print \\$1}"'`,
          parser: (output) => output.trim().split('\n').filter(ip => {
            const trimmed = ip.trim();
            return trimmed && (
              /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
              /^[0-9a-fA-F:]+$/.test(trimmed)
            );
          })
        },
        { 
          label: 'nslookup', 
          cmd: `bash -c 'nslookup ${domain} 2>&1 | grep -A1 "Name:" | tail -1 | awk "{print \\$2}"'`,
          parser: (output) => output.trim().split('\n').filter(ip => {
            const trimmed = ip.trim();
            return trimmed && (
              /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
              /^[0-9a-fA-F:]+$/.test(trimmed)
            );
          })
        }
      ];
      
      const ipAddresses = [];
      
      for (const resolver of resolveCommands) {
        const result = await runWSLRaw(resolver.cmd);
        if (result.success && result.stdout && result.stdout.trim()) {
          const ips = resolver.parser(result.stdout);
          if (ips.length > 0) {
            this.log(`✅ ${resolver.label} resolved ${domain} to: ${ips.join(', ')}`, 18);
            ipAddresses.push(...ips);
          } else if (result.stderr) {
            this.log(`⚠️ ${resolver.label} error: ${result.stderr.substring(0, 100)}`, 18);
          }
        } else if (result.stderr) {
          this.log(`⚠️ ${resolver.label} failed: ${result.stderr.substring(0, 100)}`, 18);
        }
      }
      
      // Remove duplicates
      const uniqueIPs = [...new Set(ipAddresses)];
      
      if (uniqueIPs.length > 0) {
        this.log(`✅ Resolved ${domain} to IPs: ${uniqueIPs.join(', ')}`, 18);
        return uniqueIPs;
      } else {
        this.log(`❌ Could not resolve ${domain} to IP addresses (tried dig, getent, nslookup)`, 18);
        
        // Show detailed error information for each resolver
        this.log(`💡 DNS resolution diagnostic:`, 18);
        for (const resolver of resolveCommands) {
          const result = await runWSLRaw(resolver.cmd);
          if (!result.success) {
            this.log(`   ❌ ${resolver.label}: ${result.stderr ? result.stderr.substring(0, 200) : result.error || 'Command failed'}`, 18);
          } else if (result.stdout && !resolver.parser(result.stdout).length) {
            this.log(`   ⚠️ ${resolver.label}: No IP found in output: ${result.stdout.substring(0, 100)}`, 18);
          }
        }
        
        // Try ping as a connectivity test
        this.log(`🔍 Testing network connectivity with ping...`, 18);
        const pingCmd = `bash -c 'ping -c 1 8.8.8.8 2>&1 | head -2 || echo "ping failed"'`;
        const pingResult = await runWSLRaw(pingCmd);
        if (pingResult.success && pingResult.stdout) {
          if (pingResult.stdout.includes('1 received') || pingResult.stdout.includes('bytes from')) {
            this.log(`✅ Network connectivity OK (ping 8.8.8.8 succeeded)`, 18);
            this.log(`💡 DNS server may be the issue, trying to fix...`, 18);
            
            // Try using Google DNS to resolve
            const googleDnsCmd = `bash -c 'dig @8.8.8.8 +short ${domain} A 2>&1'`;
            const googleDnsResult = await runWSLRaw(googleDnsCmd);
            if (googleDnsResult.success && googleDnsResult.stdout) {
              const googleIps = googleDnsResult.stdout.trim().split('\n').filter(ip => 
                /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip.trim())
              );
              if (googleIps.length > 0) {
                this.log(`✅ Resolved via Google DNS (8.8.8.8): ${googleIps.join(', ')}`, 18);
                return googleIps;
              }
            }
          } else {
            this.log(`❌ Network connectivity test failed: ${pingResult.stdout.substring(0, 200)}`, 18);
          }
        }
        
        this.log(`💡 DNS resolution failed - possible issues:`, 18);
        this.log(`   1. DNS server not configured or unreachable`, 18);
        this.log(`   2. Domain ${domain} may not exist or be unreachable`, 18);
        this.log(`   3. WSL DNS configuration may be incorrect`, 18);
        this.log(`   4. Try manually: Run 'dig ${domain}' or 'nslookup ${domain}' in WSL terminal`, 18);
        this.log(`   5. Check /etc/resolv.conf for DNS server settings`, 18);
        
        return [];
      }
    } catch (error) {
      this.log(`⚠️ DNS resolution failed: ${error.message}`, 18);
      return [];
    }
  }

  async extractDomain(targetUrl) {
    try {
      const urlObj = new URL(targetUrl);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return targetUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    }
  }

  async runWslCommand(command) {
    try {
      // Extract raw command for display
      let displayCommand = command;
      if (command && command.startsWith("bash -c '")) {
        const startIdx = 9;
        const lastQuoteIdx = command.lastIndexOf("'");
        if (lastQuoteIdx > startIdx) {
          displayCommand = command.substring(startIdx, lastQuoteIdx)
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\n/g, '\n');
        }
      } else if (command && command.startsWith("bash -c \"")) {
        const startIdx = 9;
        const lastQuoteIdx = command.lastIndexOf('"');
        if (lastQuoteIdx > startIdx) {
          displayCommand = command.substring(startIdx, lastQuoteIdx)
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n');
        }
      }
      
      // Log the actual command being executed
      console.log(`\n[API-Scanner] ========== EXECUTING WSL COMMAND ==========`);
      console.log(`[API-Scanner] Raw Command: ${displayCommand}`);
      console.log(`[API-Scanner] =============================================\n`);
      
      // Log command to UI
      this.log(`🔧 Executing command...`, 0, displayCommand);
      
      // Use runWSLRaw for direct WSL execution
      const result = await runWSLRaw(command);
      
      // Log the result with full output
      let resultOutput = '';
      if (result.success) {
        console.log(`[API-Scanner] ✅ Command executed successfully`);
        resultOutput = `✅ Command executed successfully\n`;
        
        if (result.stdout) {
          const stdoutPreview = result.stdout.length > 2000 ? result.stdout.substring(0, 2000) + '\n... (truncated)' : result.stdout;
          console.log(`[API-Scanner] STDOUT:\n${result.stdout}`);
          resultOutput += `\n📤 STDOUT:\n${result.stdout}\n`;
          
          // Log to UI
          this.log(`📤 STDOUT:\n${stdoutPreview}`, 0);
        }
        
        if (result.stderr) {
          const stderrPreview = result.stderr.length > 2000 ? result.stderr.substring(0, 2000) + '\n... (truncated)' : result.stderr;
          console.log(`[API-Scanner] STDERR:\n${result.stderr}`);
          resultOutput += `\n⚠️ STDERR:\n${result.stderr}\n`;
          
          // Log to UI
          this.log(`⚠️ STDERR:\n${stderrPreview}`, 0);
        }
      } else {
        console.log(`[API-Scanner] ❌ Command failed`);
        resultOutput = `❌ Command failed\n`;
        
        if (result.error) {
          console.log(`[API-Scanner] Error: ${result.error}`);
          resultOutput += `Error: ${result.error}\n`;
          this.log(`❌ Error: ${result.error}`, 0);
        }
        
        if (result.stderr) {
          const stderrPreview = result.stderr.length > 2000 ? result.stderr.substring(0, 2000) + '\n... (truncated)' : result.stderr;
          console.log(`[API-Scanner] STDERR:\n${result.stderr}`);
          resultOutput += `\n⚠️ STDERR:\n${result.stderr}\n`;
          this.log(`⚠️ STDERR:\n${stderrPreview}`, 0);
        }
        
        if (result.stdout) {
          const stdoutPreview = result.stdout.length > 2000 ? result.stdout.substring(0, 2000) + '\n... (truncated)' : result.stdout;
          console.log(`[API-Scanner] STDOUT:\n${result.stdout}`);
          resultOutput += `\n📤 STDOUT:\n${result.stdout}\n`;
          this.log(`📤 STDOUT:\n${stdoutPreview}`, 0);
        }
      }
      
      // Log complete result to UI
      this.log(`📋 Command Result:\n${resultOutput}`, 0);
      
      return result;
    } catch (error) {
      console.error(`\n[API-Scanner] ❌❌❌ WSL COMMAND EXCEPTION ❌❌❌`);
      console.error(`[API-Scanner] Command: ${command}`);
      console.error(`[API-Scanner] Error:`, error);
      console.error(`[API-Scanner] ===========================================\n`);
      
      // Log error to UI
      this.log(`❌❌❌ Command Exception:\n${error.message}\n${error.stack}`, 0);
      
      return { success: false, error: error.message, stdout: '', stderr: '' };
    }
  }

  async startCapture(targetUrl, duration = 120) {
    this.log(`🚀 Starting network traffic capture for ${targetUrl}...`, 20);
    
    try {
      const domain = await this.extractDomain(targetUrl);
      const networkInterface = await this.getNetworkInterface();
      const timestamp = Date.now();
      
      // Use pcap-based workflow (recommended): capture to pcap first, then convert to JSON
      const pcapFile = `/tmp/api_capture_${timestamp}.pcap`;
      const jsonFile = `/tmp/api_capture_${timestamp}.json`;
      const errorFile = `/tmp/api_capture_${timestamp}_errors.txt`;
      
      // Resolve domain to IP addresses (use resolved IP for reliability)
      const ipAddresses = await this.resolveDomainToIPs(domain);
      
      // Build capture filter - use resolved IP if available (more reliable), otherwise use domain
      // BPF filter: "host webnox.in" or "host 103.XX.YY.ZZ" (use IP for reliability)
      let captureFilter = '';
      if (ipAddresses.length > 0 && ipAddresses[0]) {
        // Use first resolved IP address (BPF filters work better with IPs)
        captureFilter = `host ${ipAddresses[0]}`;
        this.log(`📡 Using resolved IP for filter: ${ipAddresses[0]}`, 22);
      } else {
        // Fallback to domain-based filter
        captureFilter = `host ${domain}`;
        this.log(`📡 Using domain for filter: ${domain}`, 22);
      }
      
      this.log(`💡 Tip: Make requests to ${targetUrl} during capture to generate traffic!`, 22);
      this.log(`💡 Tip: For HTTPS decryption, set SSLKEYLOGFILE before running client`, 22);
      
      // Step 1: Verify interface exists before capture
      this.log(`🔍 Verifying interface ${networkInterface} exists...`, 25);
      const verifyIfaceCmd = `bash -c 'ip link show ${networkInterface} 2>&1 | head -1'`;
      const verifyIfaceResult = await runWSLAsRoot(verifyIfaceCmd);
      if (!verifyIfaceResult.success || verifyIfaceResult.stdout.includes('not found')) {
        this.log(`❌ Interface ${networkInterface} not found!`, 25);
        this.log(`💡 Finding alternative interface...`, 25);
        const altIface = await this.findAlternativeInterface();
        if (altIface) {
          networkInterface = altIface;
          this.log(`✅ Using alternative interface: ${networkInterface}`, 25);
        } else {
          this.log(`❌ No suitable interface found`, 25);
        }
      } else {
        this.log(`✅ Interface ${networkInterface} verified`, 25);
      }
      
      // Step 1: Capture to pcap file (following runbook approach)
      // For WSL: use -i eth0 (or detected interface) with -p flag to disable promiscuous mode
      // Note: runWSLAsRoot already runs as root, so no need for sudo
      // This avoids "promiscuous mode not supported" warnings and ensures proper capture
      const captureCmd = `bash -c 'tshark -i ${networkInterface} -p -f "${captureFilter}" -a duration:${duration} -w ${pcapFile} 2>&1 | tee ${errorFile} || echo "CAPTURE_FAILED:\$?" > ${errorFile}'`;
      this.log(`🔧 [TSHARK] Step 1: Starting capture on ${networkInterface} (WSL interface with -p flag)...`, 25, `tshark -i ${networkInterface} -p -f "${captureFilter}" -a duration:${duration} -w ${pcapFile}`);
      
      // Start capture in background (non-blocking)
      const capturePromise = runWSLAsRoot(captureCmd);
      
      // Step 1.5: Verify capture process started
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for process to start
      this.log(`🔍 Verifying capture process is running...`, 27);
      const checkProcessCmd = `bash -c 'ps aux | grep -E "tshark.*${pcapFile}" | grep -v grep | head -1'`;
      const processCheck = await runWSLAsRoot(checkProcessCmd);
      if (processCheck.success && processCheck.stdout && processCheck.stdout.trim()) {
        this.log(`✅ Capture process is running: ${processCheck.stdout.substring(0, 100)}`, 27);
      } else {
        this.log(`⚠️ Capture process not found in process list`, 27);
        this.log(`💡 This may indicate the capture failed to start`, 27);
      }
      
      // Step 1.6: Trigger requests during capture (as per runbook)
      this.log(`📡 Triggering test requests to ${targetUrl} during capture...`, 27);
      
      // Trigger multiple requests to generate traffic (as per runbook)
      const triggerRequests = async () => {
        try {
          // Request 1: Root endpoint
          this.log(`📡 Triggering request 1: ${targetUrl}`, 27);
          const curlCmd1 = `bash -c 'curl -v -s --max-time 10 ${targetUrl} >/dev/null 2>&1 || true'`;
          await runWSLRaw(curlCmd1);
          
          // Request 2: Common API endpoints (if applicable)
          this.log(`📡 Triggering request 2: ${targetUrl}/api/v1/status`, 27);
          const curlCmd2 = `bash -c 'curl -v -s --max-time 10 ${targetUrl}/api/v1/status >/dev/null 2>&1 || true'`;
          await runWSLRaw(curlCmd2);
          
          // Request 3: Another common endpoint
          this.log(`📡 Triggering request 3: ${targetUrl}/api`, 27);
          const curlCmd3 = `bash -c 'curl -v -s --max-time 10 ${targetUrl}/api >/dev/null 2>&1 || true'`;
          await runWSLRaw(curlCmd3);
          
          this.log(`✅ Test requests triggered during capture`, 28);
        } catch (error) {
          this.log(`⚠️ Error triggering requests: ${error.message}`, 28);
        }
      };
      
      // Store triggerRequests function for retry
      const triggerRequestsFn = triggerRequests;
      
      // Trigger requests while capture is running
      await triggerRequestsFn();
      
      // Wait for capture to complete
      const result = await capturePromise;
      
      // Check capture result immediately
      let errorOutput = '';
      
      // First, check stderr directly from the result
      if (result.stderr) {
        errorOutput = result.stderr;
        this.log(`⚠️ [TSHARK] STDERR from command:\n${result.stderr.substring(0, 2000)}`, 30);
      }
      
      // Check stdout for errors (tshark sometimes outputs to stdout)
      if (result.stdout) {
        const stdoutErrors = result.stdout;
        if (stdoutErrors.includes('error') || stdoutErrors.includes('Error') || stdoutErrors.includes('failed') || stdoutErrors.includes('Failed')) {
          if (!errorOutput) errorOutput = stdoutErrors;
          this.log(`⚠️ [TSHARK] STDOUT (may contain errors):\n${stdoutErrors.substring(0, 2000)}`, 30);
        }
      }
      
      if (!result.success) {
        this.log(`❌ [TSHARK] Capture command failed!`, 30);
        if (result.error) {
          this.log(`❌ Error: ${result.error}`, 30);
          if (!errorOutput) errorOutput = result.error;
        }
      }
      
      // Check for errors in stderr file (try as root first, then regular user)
      this.log(`🔍 Checking error log file...`, 30);
      const errorCheckCmdRoot = `bash -c 'cat ${errorFile} 2>/dev/null || echo ""'`;
      const errorCheckResultRoot = await runWSLAsRoot(errorCheckCmdRoot);
      
      if (errorCheckResultRoot.success && errorCheckResultRoot.stdout && errorCheckResultRoot.stdout.trim()) {
        const fileError = errorCheckResultRoot.stdout.trim();
        if (fileError && !fileError.includes('CAPTURE_FAILED')) {
          if (!errorOutput) errorOutput = fileError;
          else errorOutput += '\n' + fileError;
        }
        if (fileError.includes('CAPTURE_FAILED')) {
          this.log(`❌ Capture failed with exit code: ${fileError}`, 30);
        }
      }
      
      // If no errors found yet, check if pcap file exists
      if (!errorOutput) {
        const checkPcapCmd = `bash -c 'test -f ${pcapFile} && echo "exists" || echo "not found"'`;
        const pcapCheck = await runWSLAsRoot(checkPcapCmd);
        if (pcapCheck.success && pcapCheck.stdout.includes('not found')) {
          errorOutput = 'Pcap file was not created - capture process may have failed silently';
          this.log(`❌ Pcap file not created - capture likely failed`, 30);
        }
      }
      
      if (errorOutput) {
        this.log(`⚠️ [TSHARK] Warnings/Errors from error file:\n${errorOutput.substring(0, 2000)}`, 30);
        
        // Check for common errors and provide solutions
        let shouldRetry = false;
        let retryPcapFile = pcapFile;
        let retryNetworkInterface = networkInterface;
        let retryCaptureFilter = captureFilter;
        
        if (errorOutput.includes('permission denied') || errorOutput.includes('Permission denied') || errorOutput.includes("don't have permission")) {
          this.log(`❌ Permission error detected`, 30);
          this.log(`💡 Solution: Adding user to wireshark group or setting capabilities...`, 30);
          const fixed = await this.fixPermissions();
          if (fixed) {
            shouldRetry = true;
            this.log(`✅ Permissions fixed, will retry capture`, 30);
          }
        }
        if (errorOutput.includes('No such device') || errorOutput.includes('interface')) {
          this.log(`❌ Interface error: ${networkInterface} may not exist or be accessible`, 30);
          this.log(`💡 Solution: Trying alternative interfaces...`, 30);
          const altInterface = await this.findAlternativeInterface();
          if (altInterface) {
            this.log(`✅ Found alternative interface: ${altInterface}`, 30);
            retryNetworkInterface = altInterface;
            shouldRetry = true;
          }
        }
        if (errorOutput.includes('syntax error') || errorOutput.includes('invalid filter')) {
          this.log(`❌ Filter syntax error detected`, 30);
          this.log(`💡 Solution: Using simpler filter...`, 30);
          // Use simpler filter
          retryCaptureFilter = ipAddresses.length > 0 ? `host ${ipAddresses[0]}` : `host ${domain}`;
          shouldRetry = true;
        }
        if (errorOutput.includes('tshark: command not found')) {
          this.log(`❌ tshark not found: Please install tshark`, 30);
          this.log(`💡 Solution: Installing tshark...`, 30);
          const installed = await this.installTshark();
          if (installed) {
            shouldRetry = true;
          }
        }
        if (errorOutput.includes('capabilities') || errorOutput.includes('dumpcap')) {
          this.log(`❌ Capabilities error detected`, 30);
          this.log(`💡 Solution: Setting capabilities for dumpcap...`, 30);
          const fixed = await this.setDumpcapCapabilities();
          if (fixed) {
            shouldRetry = true;
          }
        }
        
        // Retry capture if fixes were applied
        if (shouldRetry) {
          this.log(`🔄 Retrying capture after error fixes...`, 30);
          const retryTimestamp = Date.now();
          retryPcapFile = `/tmp/api_capture_${retryTimestamp}.pcap`;
          const retryErrorFile = `/tmp/api_capture_${retryTimestamp}_errors.txt`;
          
          // Retry capture with fixed parameters (no sudo needed - runWSLAsRoot already runs as root)
          const retryCaptureCmd = `bash -c 'tshark -i ${retryNetworkInterface} -p -f "${retryCaptureFilter}" -a duration:${duration} -w ${retryPcapFile} 2>&1 | tee ${retryErrorFile} || echo "CAPTURE_FAILED:\$?" > ${retryErrorFile}'`;
          this.log(`🔧 Retrying with interface: ${retryNetworkInterface}, filter: ${retryCaptureFilter}`, 30);
          
          const retryPromise = runWSLAsRoot(retryCaptureCmd);
          
          // Trigger requests again during retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          await triggerRequestsFn();
          
          // Wait for retry capture to complete
          const retryResult = await retryPromise;
          
          if (retryResult.success) {
            this.log(`✅ Retry capture completed`, 30);
            // Update file paths for further processing
            pcapFile = retryPcapFile;
            errorFile = retryErrorFile;
            networkInterface = retryNetworkInterface;
            captureFilter = retryCaptureFilter;
          } else {
            this.log(`❌ Retry capture also failed`, 30);
            if (retryResult.stderr) {
              this.log(`❌ Retry STDERR: ${retryResult.stderr.substring(0, 500)}`, 30);
            }
          }
        }
      } else if (!result.success) {
        this.log(`⚠️ No error log file found, but capture command failed`, 30);
        this.log(`💡 Checking if tshark is installed and accessible...`, 30);
        await this.verifyTsharkInstallation();
      }
      
      // Step 2: Verify pcap file was created and check packet count (improved verification)
      this.log(`🔍 Verifying captured packets...`, 40);
      
      // First check if file exists (try as root first)
      const fileExistsRootCmd = `bash -c 'sudo test -f ${pcapFile} && echo "exists" || echo "not found"'`;
      const fileExistsRootResult = await runWSLAsRoot(fileExistsRootCmd);
      let fileExists = false;
      
      if (fileExistsRootResult.success && fileExistsRootResult.stdout && fileExistsRootResult.stdout.trim() === 'exists') {
        fileExists = true;
      } else {
        // Try as regular user
        const fileExistsCmd = `bash -c 'test -f ${pcapFile} && echo "exists" || echo "not found"'`;
        const fileExistsResult = await runWSLRaw(fileExistsCmd);
        if (fileExistsResult.success && fileExistsResult.stdout && fileExistsResult.stdout.trim() === 'exists') {
          fileExists = true;
        }
      }
      
      if (!fileExists) {
        this.log(`❌ Pcap file not found: ${pcapFile}`, 40);
        this.log(`❌ This means the capture command failed or was interrupted`, 40);
      }
      
      let packetCount = 0;
      
      if (fileExists) {
        // Method 1: Check packet count using tshark (try as root if needed)
        const pcapCountCmd = `bash -c 'tshark -r ${pcapFile} -T fields -e frame.number 2>/dev/null | tail -1 || echo "0"'`;
        const pcapCountResult = await runWSLRaw(pcapCountCmd);
        
        if (pcapCountResult.success && pcapCountResult.stdout) {
          const countStr = pcapCountResult.stdout.trim();
          packetCount = parseInt(countStr) || 0;
        }
        
        // Check pcap file size (try as root first)
        const fileSizeRootCmd = `bash -c 'sudo ls -lh ${pcapFile} 2>/dev/null || echo "Cannot access file"'`;
        const fileSizeRootResult = await runWSLAsRoot(fileSizeRootCmd);
        let fileInfo = 'Unknown';
        
        if (fileSizeRootResult.success && fileSizeRootResult.stdout) {
          fileInfo = fileSizeRootResult.stdout.trim();
        } else {
          // Try as regular user
          const fileSizeCmd = `bash -c 'ls -lh ${pcapFile} 2>/dev/null || echo "Cannot access file"'`;
          const fileSizeResult = await runWSLRaw(fileSizeCmd);
          if (fileSizeResult.success && fileSizeResult.stdout) {
            fileInfo = fileSizeResult.stdout.trim();
          }
        }
        
        this.log(`📦 Captured ${packetCount} packets to pcap file`, 40);
        this.log(`📄 Pcap file info: ${fileInfo}`, 40);
      } else {
        this.log(`📦 Captured 0 packets (file not found)`, 40);
      }
      
      if (packetCount === 0) {
        this.log(`⚠️ No packets captured in pcap file!`, 40);
        this.log(`💡 This means the filter "${captureFilter}" didn't match any traffic`, 40);
        this.log(`💡 Possible reasons:`, 40);
        this.log(`   1. Traffic to ${targetUrl} is not going through ${networkInterface}`, 40);
        this.log(`   2. Requests were made before capture started or after it ended`, 40);
        this.log(`   3. Traffic is encrypted (HTTPS) and filter can't match encrypted packets`, 40);
        this.log(`   4. WSL network routing may be different from expected`, 40);
        this.log(`💡 Running diagnostic commands...`, 40);
        
        // Try capturing without filter to see if interface is working
        this.log(`🔍 Testing capture without filter (to verify interface works)...`, 40);
        const testPcapFile = `/tmp/test_capture_${Date.now()}.pcap`;
        const testCaptureCmd = `bash -c 'timeout 5 tshark -i ${networkInterface} -p -w ${testPcapFile} 2>&1 || echo "TEST_FAILED"'`;
        const testResult = await runWSLAsRoot(testCaptureCmd);
        
        if (testResult.success) {
          const testCountCmd = `bash -c 'tshark -r ${testPcapFile} -T fields -e frame.number 2>/dev/null | tail -1 || echo "0"'`;
          const testCountResult = await runWSLAsRoot(testCountCmd);
          const testCount = parseInt(testCountResult.stdout?.trim() || '0') || 0;
          
          if (testCount > 0) {
            this.log(`✅ Interface ${networkInterface} is working - captured ${testCount} packets without filter`, 40);
            this.log(`💡 The filter "${captureFilter}" is too restrictive or traffic doesn't match`, 40);
            this.log(`💡 Suggestion: Try capturing all traffic and filtering in post-processing`, 40);
          } else {
            this.log(`⚠️ Interface ${networkInterface} captured 0 packets even without filter`, 40);
            this.log(`💡 This suggests the interface may not be receiving traffic`, 40);
          }
          
          // Clean up test file
          await runWSLAsRoot(`bash -c 'rm -f ${testPcapFile}'`);
        }
        
        // Run comprehensive diagnostics as per runbook (all commands run in WSL)
        // Note: Commands are passed directly to WSL - no bash -c wrapper needed
        const diagnostics = [
          { label: 'List interfaces', cmd: `tshark -D 2>&1 | head -10 || echo "Cannot list interfaces"`, useRoot: false },
          { label: 'List IP addresses', cmd: `ip a 2>&1 | head -20 || echo "Cannot list IP addresses"`, useRoot: false },
          { label: 'Resolve domain', cmd: `dig +short ${domain} 2>&1 || getent hosts ${domain} 2>&1 | head -3 || echo "Cannot resolve domain"`, useRoot: false },
          { label: 'Check pcap file', cmd: `ls -la ${pcapFile} 2>&1 || echo "File not found"`, useRoot: true },
          { label: 'Check tshark version', cmd: `tshark --version 2>&1 | head -3 || echo "tshark not found"`, useRoot: false },
          { label: 'Check interface exists', cmd: `ip link show ${networkInterface} 2>&1 || echo "Interface ${networkInterface} not found"`, useRoot: false },
          { label: 'Check traffic on interface', cmd: `timeout 3 tcpdump -i ${networkInterface} -c 5 -n 2>&1 || echo "Cannot capture on interface"`, useRoot: true }
        ];
        
        for (const diag of diagnostics) {
          this.log(`📋 Running diagnostic: ${diag.label}...`, 40);
          // Use runWSLAsRoot or runWSL (which properly wrap in bash -lc) instead of runWSLRaw
          // This ensures commands with pipes are executed in WSL bash, not Windows PowerShell
          const diagResult = diag.useRoot ? await runWSLAsRoot(diag.cmd) : await runWSL(diag.cmd);
          if (diagResult.success && diagResult.stdout) {
            const output = diagResult.stdout.trim();
            if (output && !output.includes('Cannot') && !output.includes('not found') && !output.includes('not recognized')) {
              this.log(`📋 ${diag.label}:\n${output.substring(0, 500)}${output.length > 500 ? '...' : ''}`, 40);
            } else {
              this.log(`⚠️ ${diag.label}: ${output || 'No output'}`, 40);
            }
          } else if (diagResult.stderr) {
            const stderr = diagResult.stderr.trim();
            // Filter out Windows PowerShell errors
            if (!stderr.includes('not recognized') && !stderr.includes('operable program')) {
              this.log(`⚠️ ${diag.label} error: ${stderr.substring(0, 200)}`, 40);
            }
          }
        }
        
        this.log(`💡 Suggestions (as per runbook):`, 40);
        this.log(`   1. Verify interface ${networkInterface} is correct (run: tshark -D)`, 40);
        this.log(`   2. Requests were automatically triggered during capture`, 40);
        this.log(`   3. Check if domain resolves: dig +short ${domain}`, 40);
        this.log(`   4. Verify interface ${networkInterface} is the WSL network adapter (not Windows host)`, 40);
        this.log(`   5. Verify tshark has proper permissions (sudo required)`, 40);
        this.log(`   6. Check error log: ${errorFile}`, 40);
        this.log(`   7. Try running: sudo tshark -i ${networkInterface} -p -f "host ${domain}" -a duration:10 -w /tmp/test.pcap`, 40);
      } else {
        // Quick verification: show first few packets
        const verifyCmd = `bash -c 'tshark -r ${pcapFile} -c 5 -V 2>/dev/null | head -30 || echo "Cannot read packets"'`;
        const verifyResult = await runWSLRaw(verifyCmd);
        if (verifyResult.success && verifyResult.stdout) {
          this.log(`✅ Packet verification (first 5 packets):\n${verifyResult.stdout.substring(0, 500)}...`, 42);
        }
      }
      
      // Step 3: Convert pcap to JSON (machine readable)
      // Following runbook: tshark -r file.pcap -T json > file.json
      this.log(`🔧 [TSHARK] Step 3: Converting pcap to JSON (machine readable)...`, 45);
      
      // Check if TLS keylog file exists (for HTTPS decryption)
      // If SSLKEYLOGFILE was set before running the client, tshark can decrypt TLS
      // Following runbook: tshark -r file.pcap -o tls.keylog_file:$HOME/.sslkeys -T json
      const keylogFileCmd = `bash -c 'echo $SSLKEYLOGFILE || echo ""'`;
      const keylogFileResult = await runWSLRaw(keylogFileCmd);
      const keylogFile = (keylogFileResult.success && keylogFileResult.stdout.trim()) || null;
      
      if (keylogFile && keylogFile.length > 0) {
        // Verify keylog file exists
        const keylogCheckCmd = `bash -c 'test -f "${keylogFile}" && echo "exists" || echo "missing"'`;
        const keylogCheckResult = await runWSLRaw(keylogCheckCmd);
        
        if (keylogCheckResult.success && keylogCheckResult.stdout.trim() === 'exists') {
          this.log(`🔐 Using TLS keylog file for decryption: ${keylogFile}`, 45);
          // Convert with TLS decryption (as per runbook)
          const convertCmdWithKeylog = `bash -c 'tshark -r ${pcapFile} -o tls.keylog_file:"${keylogFile}" -T json 2>/dev/null > ${jsonFile} || echo "[]"'`;
          this.log(`📄 Converting pcap to JSON with TLS decryption...`, 45, `tshark -r ${pcapFile} -o tls.keylog_file:"${keylogFile}" -T json > ${jsonFile}`);
          const convertResult = await runWSLRaw(convertCmdWithKeylog);
          
          if (!convertResult.success || (convertResult.stderr && convertResult.stderr.includes('error'))) {
            this.log(`⚠️ Failed to convert with TLS keylog, trying without...`, 45);
            // Fallback: convert without TLS keylog
            const fallbackConvertCmd = `bash -c 'tshark -r ${pcapFile} -T json 2>/dev/null > ${jsonFile} || echo "[]"'`;
            await runWSLRaw(fallbackConvertCmd);
          }
        } else {
          this.log(`⚠️ TLS keylog file not found: ${keylogFile}, converting without decryption...`, 45);
          const convertCmd = `bash -c 'tshark -r ${pcapFile} -T json 2>/dev/null > ${jsonFile} || echo "[]"'`;
          this.log(`📄 Converting pcap to JSON...`, 45, `tshark -r ${pcapFile} -T json > ${jsonFile}`);
          await runWSLRaw(convertCmd);
        }
      } else {
        // Convert pcap to JSON (as per runbook - no display filters, just all packets)
        const convertCmd = `bash -c 'tshark -r ${pcapFile} -T json 2>/dev/null > ${jsonFile} || echo "[]"'`;
        this.log(`📄 Converting pcap to JSON...`, 45, `tshark -r ${pcapFile} -T json > ${jsonFile}`);
        await runWSLRaw(convertCmd);
      }
      
      // Read the converted JSON file
      const readCmd = `bash -c 'cat ${jsonFile} 2>/dev/null || echo "[]"'`;
      const readResult = await runWSLRaw(readCmd);
      
      if (readResult.success && readResult.stdout) {
        try {
          // Clean the output - remove any non-JSON content
          let cleanedOutput = readResult.stdout.trim();
          
          // Remove any leading/trailing whitespace or non-JSON content
          // Try to find JSON array start '['
          const jsonStartIndex = cleanedOutput.indexOf('[');
          if (jsonStartIndex > 0) {
            cleanedOutput = cleanedOutput.substring(jsonStartIndex);
          }
          
          // Try to find JSON array end ']' (last occurrence)
          const jsonEndIndex = cleanedOutput.lastIndexOf(']');
          if (jsonEndIndex > 0 && jsonEndIndex < cleanedOutput.length - 1) {
            cleanedOutput = cleanedOutput.substring(0, jsonEndIndex + 1);
          }
          
          // If still no valid JSON structure, try to extract JSON from the output
          if (!cleanedOutput.startsWith('[') && !cleanedOutput.startsWith('{')) {
            // Try to find and extract JSON array
            const jsonMatch = cleanedOutput.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              cleanedOutput = jsonMatch[0];
            } else {
              // If no array found, try empty array
              cleanedOutput = '[]';
            }
          }
          
          // Parse JSON output
          const jsonData = JSON.parse(cleanedOutput);
          const jsonPacketCount = Array.isArray(jsonData) ? jsonData.length : 0;
          this.log(`📦 Converted ${jsonPacketCount} packets to JSON`, 50);
          
          // If we have packets in pcap but fewer in JSON, it might be due to display filter
          if (packetCount > 0 && jsonPacketCount === 0) {
            this.log(`⚠️ No HTTP/TLS packets found in JSON (may be encrypted or non-HTTP traffic)`, 50);
            this.log(`💡 Tip: Set SSLKEYLOGFILE before making requests to decrypt HTTPS traffic`, 50);
          }
          
          if (!Array.isArray(jsonData)) {
            this.log(`⚠️ JSON is not an array, got: ${typeof jsonData}`, 50);
            return { endpoints: [], requests: [], responses: [], summary: {}, error: 'Tshark output is not a valid JSON array' };
          }
          
          // Parse captured data
          const parsedData = this.parseTsharkOutput(jsonData, targetUrl);
          this.captureData = parsedData;
          
          // Add capture metadata
          parsedData.capture_metadata = {
            pcap_file: pcapFile,
            json_file: jsonFile,
            total_packets_in_pcap: packetCount,
            total_packets_in_json: jsonPacketCount,
            interface: networkInterface,
            filter: captureFilter,
            duration: duration
          };
          
          // Log JSON results (only if packets were captured)
          if (jsonPacketCount > 0) {
            console.log(`\n[API-Scanner] 📄 [TSHARK] JSON Results:`);
            console.log(JSON.stringify(parsedData, null, 2));
            this.log(`📄 [TSHARK] JSON Results:\n${JSON.stringify(parsedData, null, 2)}`, 60);
          } else if (packetCount > 0) {
            // If we have packets but no HTTP/TLS in JSON, show summary
            this.log(`📊 Pcap file contains ${packetCount} packets but no HTTP/TLS data in filtered output`, 50);
            this.log(`💡 This may indicate encrypted traffic (HTTPS) or non-HTTP protocols`, 50);
            
            // Try to get TCP conversation summary
            const convCmd = `bash -c 'tshark -r ${pcapFile} -q -z conv,tcp 2>/dev/null | head -20 || echo ""'`;
            const convResult = await runWSLRaw(convCmd);
            if (convResult.success && convResult.stdout && convResult.stdout.trim()) {
              this.log(`📊 TCP Conversations:\n${convResult.stdout.trim()}`, 50);
            }
          }
          
          return parsedData;
        } catch (parseError) {
          this.log(`⚠️ Failed to parse JSON output: ${parseError.message}`, 50);
          this.log(`📤 Raw output (first 2000 chars):\n${readResult.stdout.substring(0, 2000)}`, 50);
          this.log(`📤 Raw output length: ${readResult.stdout.length}`, 50);
          
          // Try to extract more information about the error
          const errorDetails = {
            message: parseError.message,
            outputLength: readResult.stdout.length,
            outputPreview: readResult.stdout.substring(0, 500),
            firstChar: readResult.stdout.charAt(0),
            firstChars: readResult.stdout.substring(0, 20)
          };
          
          return { 
            endpoints: [], 
            requests: [], 
            responses: [], 
            summary: {}, 
            error: parseError.message,
            errorDetails: errorDetails
          };
        }
      } else {
        this.log(`⚠️ No capture data found`, 50);
        return { endpoints: [], requests: [], responses: [], summary: {} };
      }
    } catch (error) {
      this.log(`❌ Capture error: ${error.message}`, 50);
      return { endpoints: [], requests: [], responses: [], summary: {}, error: error.message };
    }
  }

  // Error fixing methods
  async attemptErrorFix(errorOutput, networkInterface, captureFilter, pcapFile, errorFile, duration) {
    // Generic error fix attempt - returns true if fix was attempted
    if (errorOutput.includes('permission') || errorOutput.includes('Permission') || errorOutput.includes('capabilities')) {
      return await this.fixPermissions();
    }
    return false;
  }

  async fixPermissions() {
    this.log(`🔧 Attempting to fix permissions...`, 30);
    
    try {
      // Method 1: Add user to wireshark group
      const getCurrentUserCmd = `bash -c 'whoami 2>&1'`;
      const userResult = await runWSLRaw(getCurrentUserCmd);
      const currentUser = userResult.success && userResult.stdout ? userResult.stdout.trim() : null;
      
      if (currentUser) {
        this.log(`📋 Current user: ${currentUser}`, 30);
        
        // Check if user is in wireshark group
        const checkGroupCmd = `bash -c 'groups ${currentUser} 2>&1 | grep -q wireshark && echo "yes" || echo "no"'`;
        const groupCheckResult = await runWSLRaw(checkGroupCmd);
        const inGroup = groupCheckResult.success && groupCheckResult.stdout && groupCheckResult.stdout.trim() === 'yes';
        
        if (!inGroup) {
          this.log(`📋 User not in wireshark group, adding...`, 30);
          const addToGroupCmd = `bash -c 'sudo usermod -aG wireshark ${currentUser} 2>&1'`;
          const addResult = await runWSLAsRoot(addToGroupCmd);
          
          if (addResult.success) {
            this.log(`✅ User added to wireshark group`, 30);
            this.log(`⚠️ Note: You may need to restart WSL or log out/in for changes to take effect`, 30);
          } else {
            this.log(`⚠️ Failed to add user to wireshark group: ${addResult.stderr || addResult.error}`, 30);
          }
        } else {
          this.log(`✅ User is already in wireshark group`, 30);
        }
      }
      
      // Method 2: Set capabilities for dumpcap (more reliable)
      this.log(`🔧 Setting capabilities for dumpcap...`, 30);
      const setCapCmd = `bash -c 'sudo setcap cap_net_raw,cap_net_admin+eip $(which dumpcap) 2>&1 || sudo setcap cap_net_raw,cap_net_admin+eip /usr/bin/dumpcap 2>&1 || echo "dumpcap not found"'`;
      const capResult = await runWSLAsRoot(setCapCmd);
      
      if (capResult.success && !capResult.stdout.includes('not found')) {
        this.log(`✅ Capabilities set for dumpcap`, 30);
        return true;
      } else {
        this.log(`⚠️ Could not set capabilities: ${capResult.stdout || capResult.stderr}`, 30);
        this.log(`💡 Manual fix: Run 'sudo setcap cap_net_raw,cap_net_admin+eip /usr/bin/dumpcap'`, 30);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error fixing permissions: ${error.message}`, 30);
      return false;
    }
  }

  async findAlternativeInterface() {
    this.log(`🔍 Searching for alternative interfaces...`, 30);
    
    try {
      // List all interfaces
      const listCmd = `bash -c 'ip -o link show 2>&1 | awk "{print \\$2}" | sed "s/://"'`;
      const result = await runWSLRaw(listCmd);
      
      if (result.success && result.stdout) {
        const interfaces = result.stdout.trim().split('\n')
          .filter(iface => iface.trim() && iface !== 'lo' && iface !== 'any');
        
        // Try each interface to see if it's accessible
        for (const iface of interfaces) {
          this.log(`🔍 Testing interface: ${iface}`, 30);
          const testCmd = `bash -c 'sudo ip link show ${iface} 2>&1 | head -1'`;
          const testResult = await runWSLRaw(testCmd);
          
          if (testResult.success && testResult.stdout && !testResult.stdout.includes('not found')) {
            this.log(`✅ Found working interface: ${iface}`, 30);
            return iface;
          }
        }
      }
      
      this.log(`⚠️ No alternative interfaces found`, 30);
      return null;
    } catch (error) {
      this.log(`❌ Error finding alternative interface: ${error.message}`, 30);
      return null;
    }
  }

  async installTshark() {
    this.log(`🔧 Installing tshark...`, 30);
    
    try {
      // Check if tshark is already installed
      const checkCmd = `bash -c 'command -v tshark 2>&1'`;
      const checkResult = await runWSLRaw(checkCmd);
      
      if (checkResult.success && checkResult.stdout) {
        this.log(`✅ tshark is already installed at: ${checkResult.stdout.trim()}`, 30);
        return true;
      }
      
      // Install tshark
      this.log(`📦 Installing tshark package...`, 30);
      const installCmd = `bash -c 'sudo apt-get update && sudo apt-get install -y tshark 2>&1'`;
      const installResult = await runWSLAsRoot(installCmd);
      
      if (installResult.success) {
        this.log(`✅ tshark installed successfully`, 30);
        return true;
      } else {
        this.log(`❌ Failed to install tshark: ${installResult.stderr || installResult.error}`, 30);
        this.log(`💡 Manual fix: Run 'sudo apt-get install -y tshark'`, 30);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error installing tshark: ${error.message}`, 30);
      return false;
    }
  }

  async setDumpcapCapabilities() {
    this.log(`🔧 Setting dumpcap capabilities...`, 30);
    
    try {
      // Find dumpcap location
      const findDumpcapCmd = `bash -c 'which dumpcap 2>&1 || echo "/usr/bin/dumpcap"'`;
      const findResult = await runWSLRaw(findDumpcapCmd);
      const dumpcapPath = findResult.success && findResult.stdout ? findResult.stdout.trim() : '/usr/bin/dumpcap';
      
      // Set capabilities
      const setCapCmd = `bash -c 'sudo setcap cap_net_raw,cap_net_admin+eip ${dumpcapPath} 2>&1'`;
      const capResult = await runWSLAsRoot(setCapCmd);
      
      if (capResult.success && !capResult.stderr) {
        this.log(`✅ Capabilities set for dumpcap at ${dumpcapPath}`, 30);
        return true;
      } else {
        this.log(`⚠️ Failed to set capabilities: ${capResult.stderr || capResult.stdout}`, 30);
        this.log(`💡 Manual fix: Run 'sudo setcap cap_net_raw,cap_net_admin+eip ${dumpcapPath}'`, 30);
        return false;
      }
    } catch (error) {
      this.log(`❌ Error setting capabilities: ${error.message}`, 30);
      return false;
    }
  }

  async verifyTsharkInstallation() {
    this.log(`🔍 Verifying tshark installation...`, 30);
    
    try {
      // Check if tshark exists
      const checkCmd = `bash -c 'command -v tshark 2>&1 || echo "not found"'`;
      const checkResult = await runWSLRaw(checkCmd);
      
      if (checkResult.success && checkResult.stdout && !checkResult.stdout.includes('not found')) {
        this.log(`✅ tshark found at: ${checkResult.stdout.trim()}`, 30);
        
        // Check version
        const versionCmd = `bash -c 'tshark --version 2>&1 | head -1'`;
        const versionResult = await runWSLRaw(versionCmd);
        if (versionResult.success && versionResult.stdout) {
          this.log(`📋 ${versionResult.stdout.trim()}`, 30);
        }
        
        return true;
      } else {
        this.log(`❌ tshark not found`, 30);
        this.log(`💡 Installing tshark...`, 30);
        return await this.installTshark();
      }
    } catch (error) {
      this.log(`❌ Error verifying tshark: ${error.message}`, 30);
      return false;
    }
  }

  parseTsharkOutput(jsonData, targetUrl) {
    const endpoints = [];
    const requests = [];
    const responses = [];
    const endpointMap = new Map();
    const requestResponseMap = new Map(); // Map request frame numbers to responses
    const frameTimes = new Map(); // Track frame times for response time calculation
    
    if (!Array.isArray(jsonData)) {
      return { endpoints: [], requests: [], responses: [], summary: {} };
    }
    
    // First pass: collect all requests and responses with frame numbers
    for (const packet of jsonData) {
      try {
        const layers = packet?._source?.layers || {};
        const http = layers.http || {};
        const tls = layers.tls || {};
        const ip = layers.ip || {};
        const tcp = layers.tcp || {};
        const frame = layers.frame || {};
        const frameNumber = frame['frame.number']?.[0];
        const frameTime = parseFloat(frame['frame.time_epoch']?.[0] || frame['frame.time_relative']?.[0] || 0);
        
        if (frameNumber) {
          frameTimes.set(frameNumber, frameTime);
        }
        
        // Extract TLS handshake information (for HTTPS connections)
        // TLS handshake type 1 = Client Hello, type 2 = Server Hello
        if (tls['tls.handshake.type']) {
          const handshakeType = tls['tls.handshake.type'][0];
          const tlsVersion = tls['tls.version']?.[0] || '';
          const serverName = tls['tls.handshake.extensions_server_name']?.[0] || '';
          
          // Client Hello - extract SNI (Server Name Indication)
          if (handshakeType === '1' && serverName) {
            // Create a pseudo-request for TLS connection
            const tlsRequest = {
              frame_number: frameNumber,
              timestamp: frame['frame.time']?.[0] || new Date().toISOString(),
              timestamp_epoch: frameTime,
              method: 'TLS',
              uri: '/',
              url: `https://${serverName}/`,
              query_params: {},
              src_ip: ip['ip.src']?.[0] || '',
              dst_ip: ip['ip.dst']?.[0] || '',
              src_port: tcp['tcp.srcport']?.[0] || '',
              dst_port: tcp['tcp.dstport']?.[0] || '',
              headers: {},
              request_body: '',
              request_size: parseInt(frame['frame.len']?.[0] || 0),
              user_agent: '',
              cookies: {},
              content_type: '',
              referer: '',
              is_tls: true,
              tls_version: tlsVersion,
              tls_sni: serverName,
              tls_handshake_type: 'Client Hello'
            };
            
            requests.push(tlsRequest);
            
            // Track TLS endpoints
            const endpointKey = `TLS ${serverName}`;
            if (!endpointMap.has(endpointKey)) {
              endpoints.push({
                method: 'TLS',
                path: '/',
                url: `https://${serverName}/`,
                request_count: 1,
                status_codes: [],
                avg_response_time: 0,
                total_response_time: 0,
                response_count: 0,
                query_params: [],
                request_sizes: [tlsRequest.request_size],
                response_sizes: [],
                content_types: ['application/tls'],
                headers_analysis: {},
                is_tls: true,
                tls_sni: serverName
              });
              endpointMap.set(endpointKey, endpoints.length - 1);
            } else {
              const idx = endpointMap.get(endpointKey);
              endpoints[idx].request_count++;
              endpoints[idx].request_sizes.push(tlsRequest.request_size);
            }
          }
          
          // Server Hello - create pseudo-response
          if (handshakeType === '2') {
            const tlsResponse = {
              frame_number: frameNumber,
              timestamp: frame['frame.time']?.[0] || new Date().toISOString(),
              timestamp_epoch: frameTime,
              status_code: 200,
              status_text: 'TLS Handshake',
              uri: '/',
              src_ip: ip['ip.src']?.[0] || '',
              dst_ip: ip['ip.dst']?.[0] || '',
              headers: {},
              response_body: '',
              content_type: 'application/tls',
              content_length: 0,
              response_size: parseInt(frame['frame.len']?.[0] || 0),
              server: '',
              set_cookies: [],
              security_headers: {},
              is_tls: true,
              tls_version: tlsVersion,
              tls_handshake_type: 'Server Hello'
            };
            
            responses.push(tlsResponse);
          }
        }
        
        // Extract HTTP request with enhanced details
        if (http['http.request.method']) {
          const method = http['http.request.method'][0];
          const uri = http['http.request.uri']?.[0] || '/';
          const fullUrl = `${targetUrl}${uri.startsWith('/') ? '' : '/'}${uri}`;
          
          // Extract query parameters
          const queryParams = this.extractQueryParams(uri);
          
          // Extract full headers
          const fullHeaders = this.extractFullHeaders(http, 'request');
          
          // Extract request body if available
          const requestBody = http['http.file_data']?.[0] || http['http.request.body']?.[0] || '';
          
          const request = {
            frame_number: frameNumber,
            timestamp: frame['frame.time']?.[0] || new Date().toISOString(),
            timestamp_epoch: frameTime,
            method: method,
            uri: uri,
            url: fullUrl,
            query_params: queryParams,
            src_ip: ip['ip.src']?.[0] || '',
            dst_ip: ip['ip.dst']?.[0] || '',
            src_port: tcp['tcp.srcport']?.[0] || '',
            dst_port: tcp['tcp.dstport']?.[0] || '',
            headers: fullHeaders,
            request_body: requestBody,
            request_size: parseInt(frame['frame.len']?.[0] || 0),
            user_agent: fullHeaders['user-agent'] || fullHeaders['User-Agent'] || '',
            cookies: this.extractCookies(fullHeaders),
            content_type: fullHeaders['content-type'] || fullHeaders['Content-Type'] || '',
            referer: fullHeaders['referer'] || fullHeaders['Referer'] || ''
          };
          
          requests.push(request);
          
          // Track unique endpoints with enhanced info
          const endpointKey = `${method} ${uri.split('?')[0]}`; // Remove query params for grouping
          if (!endpointMap.has(endpointKey)) {
            endpoints.push({
              method: method,
              path: uri.split('?')[0],
              url: fullUrl.split('?')[0],
              request_count: 1,
              status_codes: [],
              avg_response_time: 0,
              total_response_time: 0,
              response_count: 0,
              query_params: Object.keys(queryParams),
              request_sizes: [request.request_size],
              response_sizes: [],
              content_types: [],
              headers_analysis: this.analyzeHeaders(fullHeaders, 'request')
            });
            endpointMap.set(endpointKey, endpoints.length - 1);
          } else {
            const idx = endpointMap.get(endpointKey);
            endpoints[idx].request_count++;
            endpoints[idx].request_sizes.push(request.request_size);
            if (!endpoints[idx].query_params.includes(...Object.keys(queryParams))) {
              endpoints[idx].query_params.push(...Object.keys(queryParams));
            }
          }
        }
        
        // Extract HTTP response with enhanced details
        if (http['http.response.code']) {
          const statusCode = parseInt(http['http.response.code'][0]) || 0;
          const uri = http['http.request.uri']?.[0] || http['http.response.uri']?.[0] || '/';
          
          // Extract full headers
          const fullHeaders = this.extractFullHeaders(http, 'response');
          
          // Extract response body if available
          const responseBody = http['http.file_data']?.[0] || http['http.response.body']?.[0] || '';
          
          const response = {
            frame_number: frameNumber,
            timestamp: frame['frame.time']?.[0] || new Date().toISOString(),
            timestamp_epoch: frameTime,
            status_code: statusCode,
            status_text: http['http.response.phrase']?.[0] || '',
            uri: uri,
            src_ip: ip['ip.src']?.[0] || '',
            dst_ip: ip['ip.dst']?.[0] || '',
            headers: fullHeaders,
            response_body: responseBody,
            content_type: http['http.content_type']?.[0] || fullHeaders['content-type'] || fullHeaders['Content-Type'] || '',
            content_length: parseInt(http['http.content_length']?.[0] || fullHeaders['content-length'] || fullHeaders['Content-Length'] || 0),
            response_size: parseInt(frame['frame.len']?.[0] || 0),
            server: fullHeaders['server'] || fullHeaders['Server'] || '',
            set_cookies: this.extractSetCookies(fullHeaders),
            security_headers: this.extractSecurityHeaders(fullHeaders)
          };
          
          responses.push(response);
          
          // Try to match response to request
          const requestKey = `${uri}::${frameNumber}`;
          requestResponseMap.set(requestKey, response);
        }
      } catch (error) {
        // Skip malformed packets
        continue;
      }
    }
    
    // Match requests to responses and calculate response times
    const matchedPairs = [];
    for (const request of requests) {
      // Find matching response (same URI, within reasonable time window)
      const matchingResponse = this.findMatchingResponse(request, responses, frameTimes);
      
      if (matchingResponse) {
        const responseTime = matchingResponse.timestamp_epoch - request.timestamp_epoch;
        request.response_time = responseTime;
        request.matched_response = matchingResponse;
        matchedPairs.push({ request, response: matchingResponse, response_time: responseTime });
        
        // Update endpoint stats
        const endpointKey = `${request.method} ${request.uri.split('?')[0]}`;
        if (endpointMap.has(endpointKey)) {
          const idx = endpointMap.get(endpointKey);
          endpoints[idx].status_codes.push(matchingResponse.status_code);
          endpoints[idx].total_response_time += responseTime;
          endpoints[idx].response_count++;
          endpoints[idx].avg_response_time = endpoints[idx].total_response_time / endpoints[idx].response_count;
          endpoints[idx].response_sizes.push(matchingResponse.response_size);
          if (matchingResponse.content_type && !endpoints[idx].content_types.includes(matchingResponse.content_type)) {
            endpoints[idx].content_types.push(matchingResponse.content_type);
          }
        }
      }
    }
    
    // Calculate endpoint statistics
    for (const endpoint of endpoints) {
      endpoint.avg_request_size = endpoint.request_sizes.reduce((a, b) => a + b, 0) / endpoint.request_sizes.length;
      endpoint.avg_response_size = endpoint.response_sizes.length > 0 
        ? endpoint.response_sizes.reduce((a, b) => a + b, 0) / endpoint.response_sizes.length 
        : 0;
      endpoint.status_code_distribution = this.calculateStatusCodes(endpoint.status_codes);
      endpoint.avg_response_time = endpoint.avg_response_time || 0;
    }
    
    // Calculate summary with enhanced metrics
    const summary = {
      total_packets: jsonData.length,
      total_requests: requests.length,
      total_responses: responses.length,
      unique_endpoints: endpoints.length,
      matched_pairs: matchedPairs.length,
      status_codes: this.calculateStatusCodes(responses),
      methods: this.calculateMethods(requests),
      avg_response_time: this.calculateAvgResponseTimeFromPairs(matchedPairs),
      min_response_time: matchedPairs.length > 0 ? Math.min(...matchedPairs.map(p => p.response_time)) : 0,
      max_response_time: matchedPairs.length > 0 ? Math.max(...matchedPairs.map(p => p.response_time)) : 0,
      total_request_size: requests.reduce((sum, r) => sum + (r.request_size || 0), 0),
      total_response_size: responses.reduce((sum, r) => sum + (r.response_size || 0), 0),
      avg_request_size: requests.length > 0 ? requests.reduce((sum, r) => sum + (r.request_size || 0), 0) / requests.length : 0,
      avg_response_size: responses.length > 0 ? responses.reduce((sum, r) => sum + (r.response_size || 0), 0) / responses.length : 0,
      security_findings: this.analyzeSecurityFindings(endpoints, requests, responses)
    };
    
    return {
      endpoints,
      requests,
      responses,
      matched_pairs: matchedPairs,
      summary
    };
  }

  extractHeaders(http, type) {
    const headers = {};
    
    // Extract common headers
    const headerFields = http['http.request'] || http['http.response'] || [];
    for (const field of headerFields) {
      if (field.includes(':')) {
        const [key, ...valueParts] = field.split(':');
        headers[key.toLowerCase().trim()] = valueParts.join(':').trim();
      }
    }
    
    return headers;
  }

  extractFullHeaders(http, type) {
    const headers = {};
    
    // Extract all HTTP header fields
    const headerFields = http['http.request'] || http['http.response'] || [];
    for (const field of headerFields) {
      if (typeof field === 'string' && field.includes(':')) {
        const [key, ...valueParts] = field.split(':');
        const headerKey = key.toLowerCase().trim();
        headers[headerKey] = valueParts.join(':').trim();
      }
    }
    
    // Extract specific known headers from tshark JSON structure
    const headerMap = {
      'host': http['http.host']?.[0],
      'user-agent': http['http.user_agent']?.[0],
      'accept': http['http.accept']?.[0],
      'accept-language': http['http.accept_language']?.[0],
      'accept-encoding': http['http.accept_encoding']?.[0],
      'content-type': http['http.content_type']?.[0],
      'content-length': http['http.content_length']?.[0],
      'authorization': http['http.authorization']?.[0],
      'cookie': http['http.cookie']?.[0],
      'set-cookie': http['http.set_cookie']?.[0],
      'referer': http['http.referer']?.[0],
      'server': http['http.server']?.[0],
      'x-powered-by': http['http.x_powered_by']?.[0],
      'x-frame-options': http['http.x_frame_options']?.[0],
      'x-content-type-options': http['http.x_content_type_options']?.[0],
      'strict-transport-security': http['http.strict_transport_security']?.[0],
      'content-security-policy': http['http.content_security_policy']?.[0]
    };
    
    for (const [key, value] of Object.entries(headerMap)) {
      if (value) {
        headers[key] = value;
      }
    }
    
    return headers;
  }

  extractQueryParams(uri) {
    const params = {};
    try {
      const url = new URL(uri.startsWith('http') ? uri : `http://example.com${uri}`);
      url.searchParams.forEach((value, key) => {
        params[key] = value;
      });
    } catch {
      // If URL parsing fails, try manual extraction
      const queryString = uri.split('?')[1];
      if (queryString) {
        queryString.split('&').forEach(param => {
          const [key, value] = param.split('=');
          if (key) {
            params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
          }
        });
      }
    }
    return params;
  }

  extractCookies(headers) {
    const cookieHeader = headers['cookie'] || headers['Cookie'] || '';
    const cookies = {};
    if (cookieHeader) {
      cookieHeader.split(';').forEach(cookie => {
        const [key, value] = cookie.trim().split('=');
        if (key) {
          cookies[key.trim()] = value ? value.trim() : '';
        }
      });
    }
    return cookies;
  }

  extractSetCookies(headers) {
    const setCookieHeader = headers['set-cookie'] || headers['Set-Cookie'] || '';
    if (Array.isArray(setCookieHeader)) {
      return setCookieHeader;
    }
    return setCookieHeader ? [setCookieHeader] : [];
  }

  extractSecurityHeaders(headers) {
    return {
      'x-frame-options': headers['x-frame-options'] || headers['X-Frame-Options'] || null,
      'x-content-type-options': headers['x-content-type-options'] || headers['X-Content-Type-Options'] || null,
      'strict-transport-security': headers['strict-transport-security'] || headers['Strict-Transport-Security'] || null,
      'content-security-policy': headers['content-security-policy'] || headers['Content-Security-Policy'] || null,
      'x-xss-protection': headers['x-xss-protection'] || headers['X-XSS-Protection'] || null,
      'referrer-policy': headers['referrer-policy'] || headers['Referrer-Policy'] || null,
      'permissions-policy': headers['permissions-policy'] || headers['Permissions-Policy'] || null
    };
  }

  analyzeHeaders(headers, type) {
    const analysis = {
      has_authentication: !!(headers['authorization'] || headers['Authorization']),
      has_cookies: !!(headers['cookie'] || headers['Cookie']),
      content_type: headers['content-type'] || headers['Content-Type'] || '',
      user_agent: headers['user-agent'] || headers['User-Agent'] || '',
      referer: headers['referer'] || headers['Referer'] || ''
    };
    
    if (type === 'response') {
      analysis.security_headers = this.extractSecurityHeaders(headers);
      analysis.server_info = headers['server'] || headers['Server'] || '';
      analysis.has_csp = !!(headers['content-security-policy'] || headers['Content-Security-Policy']);
      analysis.has_hsts = !!(headers['strict-transport-security'] || headers['Strict-Transport-Security']);
    }
    
    return analysis;
  }

  findMatchingResponse(request, responses, frameTimes) {
    // Find response with matching URI and closest timestamp
    let bestMatch = null;
    let minTimeDiff = Infinity;
    
    for (const response of responses) {
      if (response.uri === request.uri || response.uri === request.uri.split('?')[0]) {
        const timeDiff = Math.abs(response.timestamp_epoch - request.timestamp_epoch);
        // Match within 5 seconds
        if (timeDiff < 5 && timeDiff < minTimeDiff && response.timestamp_epoch > request.timestamp_epoch) {
          minTimeDiff = timeDiff;
          bestMatch = response;
        }
      }
    }
    
    return bestMatch;
  }

  calculateStatusCodes(statusCodesArray) {
    // Handle both array of status codes and array of response objects
    if (statusCodesArray.length > 0 && typeof statusCodesArray[0] === 'object') {
      // Array of response objects
      const codes = {};
      for (const response of statusCodesArray) {
        const code = response.status_code || 0;
        codes[code] = (codes[code] || 0) + 1;
      }
      return codes;
    } else {
      // Array of status code numbers
      const codes = {};
      for (const code of statusCodesArray) {
        codes[code] = (codes[code] || 0) + 1;
      }
      return codes;
    }
  }

  calculateAvgResponseTimeFromPairs(matchedPairs) {
    if (matchedPairs.length === 0) return 0;
    const totalTime = matchedPairs.reduce((sum, pair) => sum + pair.response_time, 0);
    return totalTime / matchedPairs.length;
  }

  analyzeSecurityFindings(endpoints, requests, responses) {
    const findings = [];
    
    // Check for missing security headers
    for (const response of responses) {
      const securityHeaders = response.security_headers || {};
      if (!securityHeaders['x-frame-options']) {
        findings.push({
          type: 'Missing Security Header',
          severity: 'Medium',
          endpoint: response.uri,
          finding: 'X-Frame-Options header is missing (Clickjacking protection)',
          recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN header'
        });
      }
      if (!securityHeaders['x-content-type-options']) {
        findings.push({
          type: 'Missing Security Header',
          severity: 'Low',
          endpoint: response.uri,
          finding: 'X-Content-Type-Options header is missing (MIME-sniffing protection)',
          recommendation: 'Add X-Content-Type-Options: nosniff header'
        });
      }
      if (!securityHeaders['strict-transport-security']) {
        findings.push({
          type: 'Missing Security Header',
          severity: 'High',
          endpoint: response.uri,
          finding: 'Strict-Transport-Security header is missing (HTTPS enforcement)',
          recommendation: 'Add Strict-Transport-Security header for HTTPS endpoints'
        });
      }
    }
    
    // Check for exposed server information
    for (const response of responses) {
      if (response.server && response.server.length > 0) {
        findings.push({
          type: 'Information Disclosure',
          severity: 'Low',
          endpoint: response.uri,
          finding: `Server information exposed: ${response.server}`,
          recommendation: 'Consider removing or obfuscating Server header'
        });
      }
      if (response.headers && response.headers['x-powered-by']) {
        findings.push({
          type: 'Information Disclosure',
          severity: 'Low',
          endpoint: response.uri,
          finding: `Technology stack exposed: ${response.headers['x-powered-by']}`,
          recommendation: 'Remove X-Powered-By header'
        });
      }
    }
    
    // Check for sensitive data in query parameters
    for (const request of requests) {
      if (request.query_params) {
        const sensitiveParams = ['password', 'token', 'key', 'secret', 'api_key', 'auth'];
        for (const param of Object.keys(request.query_params)) {
          if (sensitiveParams.some(s => param.toLowerCase().includes(s))) {
            findings.push({
              type: 'Sensitive Data in URL',
              severity: 'High',
              endpoint: request.uri,
              finding: `Sensitive parameter found in URL: ${param}`,
              recommendation: 'Move sensitive parameters to request body or headers'
            });
          }
        }
      }
    }
    
    // Check for HTTP endpoints (should use HTTPS)
    for (const request of requests) {
      if (request.url && request.url.startsWith('http://') && !request.url.startsWith('https://')) {
        findings.push({
          type: 'Insecure Protocol',
          severity: 'High',
          endpoint: request.url,
          finding: 'HTTP endpoint detected (not using HTTPS)',
          recommendation: 'Use HTTPS for all API endpoints'
        });
      }
    }
    
    return findings;
  }

  calculateMethods(requests) {
    const methods = {};
    for (const request of requests) {
      const method = request.method || 'UNKNOWN';
      methods[method] = (methods[method] || 0) + 1;
    }
    return methods;
  }

  calculateAvgResponseTime(requests, responses) {
    // This method is now replaced by calculateAvgResponseTimeFromPairs
    // Keeping for backward compatibility
    return 0;
  }

  async performScan() {
    try {
      await this.ensureOutputDir();
      
      this.log('🚀 Starting API endpoint scan with Wireshark/tshark...', 5);
      
      // Start capture (tshark should already be installed at app startup)
      this.log('📡 Starting network traffic capture...', 20);
      const captureData = await this.startCapture(this.targetUrl, this.duration);
      
      // Step 3: Generate report
      this.log('📊 Generating scan report...', 90);
      const scanResults = {
        target_url: this.targetUrl,
        timestamp: new Date().toISOString(),
        capture_data: captureData,
        summary: captureData.summary
      };
      
      // Log final results
      console.log(`\n[API-Scanner] 📄 ========== FINAL SCAN RESULTS (JSON) ==========`);
      console.log(JSON.stringify(scanResults, null, 2));
      console.log(`[API-Scanner] 📄 ================================================\n`);
      this.log(`📄 ========== FINAL SCAN RESULTS (JSON) ==========\n${JSON.stringify(scanResults, null, 2)}\n================================================`, 95);
      
      this.log('✅ API endpoint scan completed!', 100);
      
      return scanResults;
    } catch (error) {
      this.log(`❌ Scan error: ${error.message}`, 0);
      throw error;
    }
  }

  async generatePDFReport(captureData, outputPath) {
    try {
      const puppeteer = require('puppeteer');
      
      this.log('📄 Generating PDF report...', 95);
      
      const htmlReport = this.generateHTMLReport(captureData);
      // Save HTML file in the same directory as the PDF (selected folder)
      const outputDir = path.dirname(outputPath);
      const htmlPath = path.join(outputDir, 'api-scan-report.html');
      await fs.writeFile(htmlPath, htmlReport);
      
      const browser = await puppeteer.launch({ 
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();
      await page.setContent(htmlReport, { waitUntil: 'networkidle0' });
      
      await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();
      
      this.log(`✅ PDF report generated: ${outputPath}`, 100);
      return outputPath;
    } catch (error) {
      this.log(`❌ PDF generation failed: ${error.message}`, 95);
      console.error('PDF generation error:', error);
      return null;
    }
  }

  generateHTMLReport(captureData) {
    const summary = captureData.summary || {};
    const endpoints = captureData.endpoints || [];
    const requests = captureData.requests || [];
    const responses = captureData.responses || [];
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>API Endpoint Scan Report - ${this.targetUrl}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 24px;
      background: #0b1020;
      color: #e6e6e6;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #1e293b, #334155);
      padding: 32px;
      border-radius: 12px;
      margin-bottom: 24px;
      text-align: center;
    }
    .header h1 {
      color: #f8fafc;
      margin: 0;
      font-size: 2.5rem;
      font-weight: 700;
    }
    .header .subtitle {
      color: #cbd5e1;
      margin-top: 8px;
      font-size: 1.1rem;
    }
    .card {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 20px;
    }
    .card h2 {
      color: #f1f5f9;
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 1.5rem;
      border-bottom: 2px solid #334155;
      padding-bottom: 8px;
    }
    .summary-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin: 16px 0;
    }
    .stat-item {
      background: #1e293b;
      padding: 16px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: #3b82f6;
    }
    .stat-label {
      font-size: 0.875rem;
      color: #94a3b8;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    th, td {
      border: 1px solid #334155;
      padding: 12px;
      text-align: left;
    }
    th {
      background: #1e293b;
      color: #f1f5f9;
      font-weight: 600;
    }
    tr:nth-child(even) {
      background: #0f172a;
    }
    tr:hover {
      background: #1e293b;
    }
    .footer {
      text-align: center;
      margin-top: 40px;
      padding: 20px;
      border-top: 1px solid #334155;
      color: #94a3b8;
    }
    .timestamp {
      color: #64748b;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 API Endpoint Scan Report</h1>
    <div class="subtitle">Network Traffic Analysis with Wireshark/tshark</div>
  </div>
  
  <div class="card">
    <h2>📋 Executive Summary</h2>
    <div class="summary-stats">
      <div class="stat-item">
        <div class="stat-value">${summary.total_packets || 0}</div>
        <div class="stat-label">Total Packets</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${summary.total_requests || 0}</div>
        <div class="stat-label">Total Requests</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${summary.total_responses || 0}</div>
        <div class="stat-label">Total Responses</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${summary.unique_endpoints || 0}</div>
        <div class="stat-label">Unique Endpoints</div>
      </div>
    </div>
    
    <h3>Target URL</h3>
    <p><strong>${this.targetUrl}</strong></p>
    
    <h3>Scan Information</h3>
    <p><strong>Scan Date:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Duration:</strong> ${this.duration} seconds</p>
    ${summary.avg_response_time ? `<p><strong>Average Response Time:</strong> ${(summary.avg_response_time * 1000).toFixed(2)} ms</p>` : ''}
    ${summary.min_response_time ? `<p><strong>Min Response Time:</strong> ${(summary.min_response_time * 1000).toFixed(2)} ms</p>` : ''}
    ${summary.max_response_time ? `<p><strong>Max Response Time:</strong> ${(summary.max_response_time * 1000).toFixed(2)} ms</p>` : ''}
    ${summary.total_request_size ? `<p><strong>Total Request Size:</strong> ${(summary.total_request_size / 1024).toFixed(2)} KB</p>` : ''}
    ${summary.total_response_size ? `<p><strong>Total Response Size:</strong> ${(summary.total_response_size / 1024).toFixed(2)} KB</p>` : ''}
    ${summary.matched_pairs ? `<p><strong>Matched Request-Response Pairs:</strong> ${summary.matched_pairs}</p>` : ''}
  </div>
  
  <div class="card">
    <h2>🌐 Discovered Endpoints</h2>
    ${endpoints.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>Request Count</th>
            <th>Avg Response Time</th>
            <th>Status Codes</th>
            <th>Content Types</th>
            <th>Query Params</th>
          </tr>
        </thead>
        <tbody>
          ${endpoints.map(ep => `
            <tr>
              <td><strong>${ep.method}</strong></td>
              <td><code>${ep.path}</code></td>
              <td>${ep.request_count}</td>
              <td>${ep.avg_response_time ? (ep.avg_response_time * 1000).toFixed(2) + ' ms' : 'N/A'}</td>
              <td>${Object.keys(ep.status_code_distribution || {}).length > 0 ? Object.entries(ep.status_code_distribution).map(([code, count]) => `${code}(${count})`).join(', ') : 'N/A'}</td>
              <td>${ep.content_types && ep.content_types.length > 0 ? ep.content_types.join(', ') : 'N/A'}</td>
              <td>${ep.query_params && ep.query_params.length > 0 ? ep.query_params.join(', ') : 'None'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No endpoints discovered during capture period.</p>'}
  </div>
  
  <div class="card">
    <h2>📊 Status Code Distribution</h2>
    ${summary.status_codes && Object.keys(summary.status_codes).length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Status Code</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(summary.status_codes).map(([code, count]) => `
            <tr>
              <td><strong>${code}</strong></td>
              <td>${count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No status codes found.</p>'}
  </div>
  
  <div class="card">
    <h2>📡 Request Methods</h2>
    ${summary.methods && Object.keys(summary.methods).length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(summary.methods).map(([method, count]) => `
            <tr>
              <td><strong>${method}</strong></td>
              <td>${count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No request methods found.</p>'}
  </div>
  
  <div class="card">
    <h2>📋 Detailed Requests (First 50)</h2>
    ${requests.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Method</th>
            <th>URI</th>
            <th>Response Time</th>
            <th>Status Code</th>
            <th>Request Size</th>
            <th>Response Size</th>
            <th>User Agent</th>
          </tr>
        </thead>
        <tbody>
          ${requests.slice(0, 50).map(req => `
            <tr>
              <td>${req.timestamp ? req.timestamp.substring(0, 19) : 'N/A'}</td>
              <td><strong>${req.method}</strong></td>
              <td><code>${req.uri}</code></td>
              <td>${req.response_time ? (req.response_time * 1000).toFixed(2) + ' ms' : 'N/A'}</td>
              <td>${req.matched_response ? req.matched_response.status_code : 'N/A'}</td>
              <td>${req.request_size ? (req.request_size / 1024).toFixed(2) + ' KB' : 'N/A'}</td>
              <td>${req.matched_response && req.matched_response.response_size ? (req.matched_response.response_size / 1024).toFixed(2) + ' KB' : 'N/A'}</td>
              <td>${req.user_agent ? req.user_agent.substring(0, 50) + (req.user_agent.length > 50 ? '...' : '') : 'N/A'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No requests captured.</p>'}
  </div>
  
  ${summary.security_findings && summary.security_findings.length > 0 ? `
  <div class="card">
    <h2>🔒 Security Findings</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Severity</th>
          <th>Endpoint</th>
          <th>Finding</th>
          <th>Recommendation</th>
        </tr>
      </thead>
      <tbody>
        ${summary.security_findings.map(finding => `
          <tr>
            <td>${finding.type}</td>
            <td><strong style="color: ${finding.severity === 'High' ? '#ef4444' : finding.severity === 'Medium' ? '#f59e0b' : '#10b981'}">${finding.severity}</strong></td>
            <td><code>${finding.endpoint}</code></td>
            <td>${finding.finding}</td>
            <td>${finding.recommendation}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
  
  <div class="card">
    <h2>📊 Performance Metrics</h2>
    <div class="summary-stats">
      ${summary.avg_response_time ? `
      <div class="stat-item">
        <div class="stat-value">${(summary.avg_response_time * 1000).toFixed(2)} ms</div>
        <div class="stat-label">Avg Response Time</div>
      </div>
      ` : ''}
      ${summary.avg_request_size ? `
      <div class="stat-item">
        <div class="stat-value">${(summary.avg_request_size / 1024).toFixed(2)} KB</div>
        <div class="stat-label">Avg Request Size</div>
      </div>
      ` : ''}
      ${summary.avg_response_size ? `
      <div class="stat-item">
        <div class="stat-value">${(summary.avg_response_size / 1024).toFixed(2)} KB</div>
        <div class="stat-label">Avg Response Size</div>
      </div>
      ` : ''}
      ${summary.matched_pairs ? `
      <div class="stat-item">
        <div class="stat-value">${summary.matched_pairs}</div>
        <div class="stat-label">Matched Pairs</div>
      </div>
      ` : ''}
    </div>
  </div>
  
  <div class="footer">
    <div>Report generated by Synergy Cyberix API Endpoint Scanner</div>
    <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
    <div class="timestamp">Scan ID: ${Date.now()}</div>
  </div>
</body>
</html>`;
  }

  stopCapture() {
    if (this.captureProcess) {
      this.captureProcess.kill();
      this.captureProcess = null;
      this.log('🛑 Capture stopped', 0);
    }
  }
}

module.exports = APIScanner;
