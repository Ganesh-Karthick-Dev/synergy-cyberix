<<<<<<< HEAD
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class XSSScanner {
  constructor(targetUrl, outputDir = './temp-scans') {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
    this.progressCallback = null;
    this.completeCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  setCompleteCallback(callback) {
    this.completeCallback = callback;
  }

  log(message, testId = 'xss-scan') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${testId}] ${message}`);
    
    if (this.progressCallback) {
      this.progressCallback({
        testId,
        testName: 'XSS Scanner',
        progress: 0,
        message: `[${timestamp}] ${message}`,
        type: 'info'
      });
    }
  }

  async runWslCommand(command, options = {}) {
    // Execute command in WSL without bash wrapper - just wsl + command
    console.log(`🔧 [WSL-RAW-DEBUG] ===== COMMAND EXECUTION START =====`);
    console.log(`🔧 [WSL-RAW-DEBUG] Raw command: ${command}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Command type: ${typeof command}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Command length: ${command.length}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Options:`, options);
    console.log(`🔧 [WSL-RAW-DEBUG] Working directory: ${this.outputDir}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Timeout: ${options.timeout || 300000}ms`);
    
    // Use wsl directly with the command (no bash -c wrapper)
    const wslCommand = `wsl ${command}`;
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command: ${wslCommand}`);
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command length: ${wslCommand.length}`);
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command starts with 'wsl': ${wslCommand.startsWith('wsl')}`);
    
    return new Promise((resolve, reject) => {
      const { timeout = 300000, cwd = this.outputDir } = options;
      
      console.log(`🔧 [WSL-RAW-DEBUG] About to execute WSL command with exec()...`);
      console.log(`🔧 [WSL-RAW-DEBUG] Process will run in directory: ${cwd}`);
      
      const child = exec(wslCommand, { timeout, cwd }, (error, stdout, stderr) => {
        console.log(`🔧 [WSL-RAW-DEBUG] ===== COMMAND EXECUTION COMPLETE =====`);
        console.log(`🔧 [WSL-RAW-DEBUG] Error object:`, error);
        console.log(`🔧 [WSL-RAW-DEBUG] Error code:`, error ? error.code : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Error signal:`, error ? error.signal : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Error killed:`, error ? error.killed : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Stdout length:`, stdout ? stdout.length : 0);
        console.log(`🔧 [WSL-RAW-DEBUG] Stderr length:`, stderr ? stderr.length : 0);
        console.log(`🔧 [WSL-RAW-DEBUG] Stdout preview:`, stdout ? stdout.substring(0, 200) + '...' : 'No stdout');
        console.log(`🔧 [WSL-RAW-DEBUG] Stderr preview:`, stderr ? stderr.substring(0, 200) + '...' : 'No stderr');
        
        if (error) {
          console.error(`❌ [WSL-RAW-DEBUG] Command failed with error:`, error.message);
          console.error(`❌ [WSL-RAW-DEBUG] Full error object:`, JSON.stringify(error, null, 2));
          reject({ error: error.message, stderr, stdout, fullError: error });
        } else {
          console.log(`✅ [WSL-RAW-DEBUG] Command completed successfully`);
          console.log(`✅ [WSL-RAW-DEBUG] Full stdout:`, stdout);
          console.log(`✅ [WSL-RAW-DEBUG] Full stderr:`, stderr);
          resolve({ stdout, stderr });
        }
      });
      
      console.log(`🔧 [WSL-RAW-DEBUG] Child process created with PID: ${child.pid}`);
      console.log(`🔧 [WSL-RAW-DEBUG] Child process spawned: ${child.spawned}`);
      
      // Add event listeners for more debugging
      child.on('error', (err) => {
        console.error(`🔧 [WSL-RAW-DEBUG] Child process error event:`, err);
      });
      
      child.on('exit', (code, signal) => {
        console.log(`🔧 [WSL-RAW-DEBUG] Child process exit - Code: ${code}, Signal: ${signal}`);
      });
      
      child.on('close', (code, signal) => {
        console.log(`🔧 [WSL-RAW-DEBUG] Child process close - Code: ${code}, Signal: ${signal}`);
      });
    });
  }

  async executeKaliTool(toolName, command, testId, maxRetries = 2) {
    this.log(`🔧 [EXECUTE-DEBUG] ===== EXECUTE KALI TOOL START =====`);
    this.log(`🔧 [EXECUTE-DEBUG] Tool name: ${toolName}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Command: ${command}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Test ID: ${testId}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Max retries: ${maxRetries}`, testId);
    this.log(`🔧 Executing ${toolName}: ${command}`, testId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.log(`🔧 [EXECUTE-DEBUG] ===== ATTEMPT ${attempt} of ${maxRetries} =====`, testId);
      try {
        this.log(`🔧 [EXECUTE-DEBUG] Calling runWslCommand with: ${command}`, testId);
        const result = await this.runWslCommand(command);
        this.log(`🔧 [EXECUTE-DEBUG] runWslCommand returned successfully`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Result stdout length: ${result.stdout ? result.stdout.length : 0}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Result stderr length: ${result.stderr ? result.stderr.length : 0}`, testId);
        this.log(`✅ ${toolName} completed successfully`, testId);
        return result;
      } catch (error) {
        this.log(`🔧 [EXECUTE-DEBUG] runWslCommand threw error:`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error message: ${error.error}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error stderr: ${error.stderr}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error stdout: ${error.stdout}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Full error object:`, testId);
        console.log(JSON.stringify(error, null, 2));
        
        this.log(`⚠️ ${toolName} attempt ${attempt} failed: ${error.error}`, testId);
        if (attempt === maxRetries) {
          this.log(`🔧 [EXECUTE-DEBUG] Max retries reached, throwing error`, testId);
          throw error;
        }
        // Wait before retry
        this.log(`🔧 [EXECUTE-DEBUG] Waiting 2 seconds before retry...`, testId);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async runXSSScan() {
    try {
      this.log('🔍 Starting XSS scan...', 'xss-scan');
      
      // Use the specific dalfox command format as requested
      const dalfoxCommand = `dalfox url "${this.targetUrl}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json`;
      
      this.log(`🔍 Executing XSS scan command...`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] Raw command: ${dalfoxCommand}`, 'xss-scan');
      
      const result = await this.executeKaliTool('XSS Scan', dalfoxCommand, 'xss-scan');
      
      this.log(`🔍 [XSS-DEBUG] Raw result from executeKaliTool:`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] stdout length: ${result.stdout ? result.stdout.length : 0}`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] stderr length: ${result.stderr ? result.stderr.length : 0}`, 'xss-scan');
      
      // Parse results and create comprehensive report
      this.log('🔍 [XSS-DEBUG] Parsing XSS scan results...', 'xss-scan');
      const structuredData = this.parseDalfoxOutput(result.stdout, result.stderr);
      this.log(`🔍 [XSS-DEBUG] Structured data: ${JSON.stringify(structuredData, null, 2)}`, 'xss-scan');
      
      // Generate comprehensive XSS scan report
      const xssReport = this.generateXSSReport(structuredData);
      
      const finalResult = {
        testId: 'xss-scan',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: this.determineSeverity(structuredData),
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: this.generateXSSFindings(structuredData),
        recommendations: this.generateXSSRecommendations(structuredData),
        report: xssReport
      };
      
      this.log(`🔍 [XSS-DEBUG] Final XSS scan result: ${JSON.stringify(finalResult, null, 2)}`, 'xss-scan');
      return finalResult;
    } catch (error) {
      this.log(`❌ XSS scan failed: ${error.message}`, 'xss-scan');
      return {
        testId: 'xss-scan',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'XSS scan failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure dalfox tool is installed'
        ],
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Scripting (XSS) Testing',
          error: error.message,
          summary: 'XSS scan failed due to technical issues'
        }
      };
    }
  }

  parseDalfoxOutput(stdout, stderr) {
    const result = {
      scan_name: "Cross-Site Scripting (XSS) Testing",
      target_url: this.targetUrl,
      scan_duration: null,
      parameters_tested: 0,
      total_testing_points_found: 0,
      vulnerabilities_found: 0,
      vulnerability_details: [],
      summary: "",
      raw_output: stdout,
      raw_stderr: stderr,
      dalfox_version: null,
      scan_details: {
        method: "GET",
        performance: "50 worker / 1 cpu",
        mining: true,
        timeout: 5,
        follow_redirect: false,
        fast_scan: true,
        skip_headless: true
      },
      reflected_parameters: [],
      content_type: null,
      scan_metadata: {
        started_at: null,
        finished_at: null,
        duration_seconds: 0
      }
    };

    if (!stdout) {
      result.summary = "No output received from dalfox";
      return result;
    }

    const lines = stdout.split('\n');
    let jsonOutput = '';
    let inJsonBlock = false;
    let scanStarted = false;
    let scanFinished = false;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Extract dalfox version
      if (trimmedLine.includes('Dalfox v') && !result.dalfox_version) {
        const versionMatch = trimmedLine.match(/Dalfox v([\d.]+)/);
        if (versionMatch) {
          result.dalfox_version = versionMatch[1];
        }
      }

      // Extract target URL
      if (trimmedLine.includes('🎯  Target')) {
        const targetMatch = trimmedLine.match(/🎯\s+Target\s+(.+)/);
        if (targetMatch) {
          result.target_url = targetMatch[1].trim();
        }
      }

      // Extract method
      if (trimmedLine.includes('🏁  Method')) {
        const methodMatch = trimmedLine.match(/🏁\s+Method\s+(.+)/);
        if (methodMatch) {
          result.scan_details.method = methodMatch[1].trim();
        }
      }

      // Extract performance info
      if (trimmedLine.includes('🖥   Performance')) {
        const perfMatch = trimmedLine.match(/🖥\s+Performance\s+(.+)/);
        if (perfMatch) {
          result.scan_details.performance = perfMatch[1].trim();
        }
      }

      // Extract timeout
      if (trimmedLine.includes('⏱   Timeout')) {
        const timeoutMatch = trimmedLine.match(/⏱\s+Timeout\s+(\d+)/);
        if (timeoutMatch) {
          result.scan_details.timeout = parseInt(timeoutMatch[1]);
        }
      }

      // Extract start time
      if (trimmedLine.includes('🕰   Started at')) {
        const startMatch = trimmedLine.match(/🕰\s+Started at\s+(.+)/);
        if (startMatch) {
          result.scan_metadata.started_at = startMatch[1].trim();
        }
      }

      // Extract testing points
      if (trimmedLine.includes('Found') && trimmedLine.includes('testing points')) {
        const pointsMatch = trimmedLine.match(/Found (\d+) testing points/);
        if (pointsMatch) {
          result.total_testing_points_found = parseInt(pointsMatch[1]);
        }
      }

      // Extract fast scan mode info
      if (trimmedLine.includes('Fast scan mode')) {
        const paramsMatch = trimmedLine.match(/limiting parameter analysis to first (\d+) parameters/);
        if (paramsMatch) {
          result.parameters_tested = parseInt(paramsMatch[1]);
        }
      }

      // Extract content type
      if (trimmedLine.includes('Content-Type is')) {
        const contentTypeMatch = trimmedLine.match(/Content-Type is (.+)/);
        if (contentTypeMatch) {
          result.content_type = contentTypeMatch[1].trim();
        }
      }

      // Extract reflected parameters
      if (trimmedLine.includes('Reflected') && trimmedLine.includes('param =>')) {
        const paramMatch = trimmedLine.match(/Reflected (.+?) param =>/);
        if (paramMatch) {
          result.reflected_parameters.push(paramMatch[1].trim());
        }
      }

      // Extract scan duration
      if (trimmedLine.includes('[duration:') && trimmedLine.includes('][issues:') && trimmedLine.includes('] Finish Scan!')) {
        const durationMatch = trimmedLine.match(/\[duration: ([^\]]+)\]\[issues: (\d+)\]/);
        if (durationMatch) {
          result.scan_duration = durationMatch[1];
          result.vulnerabilities_found = parseInt(durationMatch[2]);
          result.scan_metadata.finished_at = new Date().toISOString();
        }
      }

      // Look for JSON output block
      if (trimmedLine.startsWith('[') && trimmedLine.includes('{')) {
        inJsonBlock = true;
        jsonOutput = trimmedLine;
      } else if (inJsonBlock) {
        if (trimmedLine.startsWith(']')) {
          jsonOutput += '\n' + trimmedLine;
          inJsonBlock = false;
        } else {
          jsonOutput += '\n' + trimmedLine;
        }
      }
    });

    // Parse JSON output if found
    if (jsonOutput) {
      try {
        const jsonData = JSON.parse(jsonOutput);
        if (Array.isArray(jsonData)) {
          result.vulnerability_details = jsonData.map(vuln => ({
            type: vuln.type || 'V',
            inject_type: vuln.inject_type || 'unknown',
            poc_type: vuln.poc_type || 'plain',
            method: vuln.method || 'GET',
            data: vuln.data || '',
            param: vuln.param || '',
            payload: vuln.payload || '',
            evidence: vuln.evidence || '',
            cwe: vuln.cwe || 'CWE-79',
            severity: vuln.severity || 'High',
            message_id: vuln.message_id || 0,
            message_str: vuln.message_str || 'XSS vulnerability detected',
            raw_request: vuln.raw_request || '',
            raw_response: vuln.raw_response || ''
          }));
          result.vulnerabilities_found = jsonData.length;
        }
      } catch (error) {
        this.log(`⚠️ Failed to parse JSON output: ${error.message}`, 'xss-scan');
      }
    }

    // Generate summary and recommendations
    this.generateDynamicSummary(result);
    this.generateDynamicRecommendations(result);

    return result;
  }

  generateDynamicSummary(result) {
    if (result.vulnerabilities_found > 0) {
      result.summary = `XSS scan detected ${result.vulnerabilities_found} vulnerability(ies) in ${result.parameters_tested} tested parameter(s). Immediate remediation required.`;
    } else if (result.reflected_parameters.length > 0) {
      result.summary = `XSS scan completed. No vulnerabilities found in ${result.parameters_tested} tested parameter(s), but ${result.reflected_parameters.length} parameter(s) were found to be reflected in responses.`;
    } else {
      result.summary = `XSS scan completed successfully. No XSS vulnerabilities detected during fast scan of the target.`;
    }
  }

  generateDynamicRecommendations(result) {
    const recommendations = [];

    if (result.vulnerabilities_found > 0) {
      recommendations.push('Immediately patch all XSS vulnerabilities found');
      recommendations.push('Sanitize user inputs to escape HTML special characters');
      recommendations.push('Implement Content Security Policy (CSP) headers');
      recommendations.push('Use HTTP-only cookies to protect session data');
      recommendations.push('Validate and encode all data dynamically on server side');
      
      // Add specific recommendations based on vulnerability types
      const vulnerabilityTypes = [...new Set(result.vulnerability_details.map(v => v.inject_type))];
      if (vulnerabilityTypes.includes('inHTML')) {
        recommendations.push('Implement proper HTML encoding for user inputs');
      }
      if (vulnerabilityTypes.includes('inJS')) {
        recommendations.push('Implement proper JavaScript encoding for user inputs');
      }
      if (vulnerabilityTypes.includes('inURL')) {
        recommendations.push('Implement proper URL encoding for user inputs');
      }
    } else if (result.reflected_parameters.length > 0) {
      recommendations.push('Monitor reflected parameters for potential XSS vulnerabilities');
      recommendations.push('Implement input validation for all reflected parameters');
      recommendations.push('Consider implementing Content Security Policy (CSP) as a defense-in-depth measure');
    } else {
      recommendations.push('Continue regular XSS testing to maintain security posture');
      recommendations.push('Implement Content Security Policy (CSP) headers as a preventive measure');
      recommendations.push('Ensure all user inputs are properly validated and sanitized');
    }

    return recommendations;
  }

  generateXSSReport(structuredData) {
    return {
      scan_name: structuredData.scan_name,
      target_url: structuredData.target_url,
      scan_duration: structuredData.scan_duration,
      parameters_tested: structuredData.parameters_tested,
      total_testing_points_found: structuredData.total_testing_points_found,
      vulnerabilities_found: structuredData.vulnerabilities_found,
      vulnerability_details: structuredData.vulnerability_details,
      summary: structuredData.summary,
      scan_details: structuredData.scan_details,
      reflected_parameters: structuredData.reflected_parameters,
      content_type: structuredData.content_type,
      scan_metadata: structuredData.scan_metadata,
      dalfox_version: structuredData.dalfox_version,
      scan_timestamp: new Date().toISOString()
    };
  }

  determineSeverity(structuredData) {
    if (structuredData.vulnerabilities_found > 0) {
      // Check if any vulnerabilities are high severity
      const hasHighSeverity = structuredData.vulnerability_details.some(v => 
        v.severity && v.severity.toLowerCase() === 'high'
      );
      return hasHighSeverity ? 'critical' : 'high';
    } else if (structuredData.reflected_parameters.length > 0) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  generateXSSFindings(structuredData) {
    const findings = [];

    // Critical findings for vulnerabilities
    if (structuredData.vulnerabilities_found > 0) {
      findings.push({
        type: 'critical',
        message: 'XSS vulnerabilities detected',
        details: `Found ${structuredData.vulnerabilities_found} XSS vulnerability(ies) in ${structuredData.parameters_tested} tested parameter(s)`
      });

      // Add specific findings for each vulnerability
      structuredData.vulnerability_details.forEach((vuln, index) => {
        findings.push({
          type: 'critical',
          message: `XSS vulnerability in parameter '${vuln.param}'`,
          details: `Payload: ${vuln.payload}, Severity: ${vuln.severity}, CWE: ${vuln.cwe}, Evidence: ${vuln.evidence}`
        });
      });
    }

    // High findings for reflected parameters
    if (structuredData.reflected_parameters.length > 0) {
      findings.push({
        type: 'high',
        message: 'Reflected parameters detected',
        details: `Found ${structuredData.reflected_parameters.length} parameter(s) that are reflected in responses: ${structuredData.reflected_parameters.join(', ')}`
      });
    }

    // Medium findings for scan completion
    findings.push({
      type: 'medium',
      message: 'XSS scan completed',
      details: `Tested ${structuredData.parameters_tested} parameter(s) using dalfox with fast scan mode`
    });

    return findings;
  }

  generateXSSRecommendations(structuredData) {
    return this.generateDynamicRecommendations(structuredData);
  }

  async runScan() {
    this.log('Starting XSS scan...', 'xss-scan');
    this.log(`Target: ${this.targetUrl}`, 'xss-scan');

    try {
      const result = await this.runXSSScan();
      
      this.log('XSS scan completed!', 'xss-scan');
      
      // Call complete callback if set
      if (this.completeCallback) {
        this.completeCallback({ tests: { 'xss-scan': result } });
      }
      
      return { tests: { 'xss-scan': result } };
    } catch (error) {
      this.log(`XSS scan failed: ${error.message}`, 'xss-scan');
      
      // Call complete callback with error if set
      if (this.completeCallback) {
        this.completeCallback(null, error);
      }
      
      throw error;
    }
  }
}

module.exports = XSSScanner;
=======
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class XSSScanner {
  constructor(targetUrl, outputDir = './temp-scans') {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
    this.progressCallback = null;
    this.completeCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  setCompleteCallback(callback) {
    this.completeCallback = callback;
  }

  log(message, testId = 'xss-scan') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${testId}] ${message}`);
    
    if (this.progressCallback) {
      this.progressCallback({
        testId,
        testName: 'XSS Scanner',
        progress: 0,
        message: `[${timestamp}] ${message}`,
        type: 'info'
      });
    }
  }

  async runWslCommand(command, options = {}) {
    // Execute command in WSL without bash wrapper - just wsl + command
    console.log(`🔧 [WSL-RAW-DEBUG] ===== COMMAND EXECUTION START =====`);
    console.log(`🔧 [WSL-RAW-DEBUG] Raw command: ${command}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Command type: ${typeof command}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Command length: ${command.length}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Options:`, options);
    console.log(`🔧 [WSL-RAW-DEBUG] Working directory: ${this.outputDir}`);
    console.log(`🔧 [WSL-RAW-DEBUG] Timeout: ${options.timeout || 300000}ms`);
    
    // Use wsl directly with the command (no bash -c wrapper)
    const wslCommand = `wsl ${command}`;
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command: ${wslCommand}`);
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command length: ${wslCommand.length}`);
    console.log(`🔧 [WSL-RAW-DEBUG] WSL command starts with 'wsl': ${wslCommand.startsWith('wsl')}`);
    
    return new Promise((resolve, reject) => {
      const { timeout = 300000, cwd = this.outputDir } = options;
      
      console.log(`🔧 [WSL-RAW-DEBUG] About to execute WSL command with exec()...`);
      console.log(`🔧 [WSL-RAW-DEBUG] Process will run in directory: ${cwd}`);
      
      const child = exec(wslCommand, { timeout, cwd }, (error, stdout, stderr) => {
        console.log(`🔧 [WSL-RAW-DEBUG] ===== COMMAND EXECUTION COMPLETE =====`);
        console.log(`🔧 [WSL-RAW-DEBUG] Error object:`, error);
        console.log(`🔧 [WSL-RAW-DEBUG] Error code:`, error ? error.code : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Error signal:`, error ? error.signal : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Error killed:`, error ? error.killed : 'none');
        console.log(`🔧 [WSL-RAW-DEBUG] Stdout length:`, stdout ? stdout.length : 0);
        console.log(`🔧 [WSL-RAW-DEBUG] Stderr length:`, stderr ? stderr.length : 0);
        console.log(`🔧 [WSL-RAW-DEBUG] Stdout preview:`, stdout ? stdout.substring(0, 200) + '...' : 'No stdout');
        console.log(`🔧 [WSL-RAW-DEBUG] Stderr preview:`, stderr ? stderr.substring(0, 200) + '...' : 'No stderr');
        
        if (error) {
          console.error(`❌ [WSL-RAW-DEBUG] Command failed with error:`, error.message);
          console.error(`❌ [WSL-RAW-DEBUG] Full error object:`, JSON.stringify(error, null, 2));
          reject({ error: error.message, stderr, stdout, fullError: error });
        } else {
          console.log(`✅ [WSL-RAW-DEBUG] Command completed successfully`);
          console.log(`✅ [WSL-RAW-DEBUG] Full stdout:`, stdout);
          console.log(`✅ [WSL-RAW-DEBUG] Full stderr:`, stderr);
          resolve({ stdout, stderr });
        }
      });
      
      console.log(`🔧 [WSL-RAW-DEBUG] Child process created with PID: ${child.pid}`);
      console.log(`🔧 [WSL-RAW-DEBUG] Child process spawned: ${child.spawned}`);
      
      // Add event listeners for more debugging
      child.on('error', (err) => {
        console.error(`🔧 [WSL-RAW-DEBUG] Child process error event:`, err);
      });
      
      child.on('exit', (code, signal) => {
        console.log(`🔧 [WSL-RAW-DEBUG] Child process exit - Code: ${code}, Signal: ${signal}`);
      });
      
      child.on('close', (code, signal) => {
        console.log(`🔧 [WSL-RAW-DEBUG] Child process close - Code: ${code}, Signal: ${signal}`);
      });
    });
  }

  async executeKaliTool(toolName, command, testId, maxRetries = 2) {
    this.log(`🔧 [EXECUTE-DEBUG] ===== EXECUTE KALI TOOL START =====`);
    this.log(`🔧 [EXECUTE-DEBUG] Tool name: ${toolName}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Command: ${command}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Test ID: ${testId}`, testId);
    this.log(`🔧 [EXECUTE-DEBUG] Max retries: ${maxRetries}`, testId);
    this.log(`🔧 Executing ${toolName}: ${command}`, testId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.log(`🔧 [EXECUTE-DEBUG] ===== ATTEMPT ${attempt} of ${maxRetries} =====`, testId);
      try {
        this.log(`🔧 [EXECUTE-DEBUG] Calling runWslCommand with: ${command}`, testId);
        const result = await this.runWslCommand(command);
        this.log(`🔧 [EXECUTE-DEBUG] runWslCommand returned successfully`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Result stdout length: ${result.stdout ? result.stdout.length : 0}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Result stderr length: ${result.stderr ? result.stderr.length : 0}`, testId);
        this.log(`✅ ${toolName} completed successfully`, testId);
        return result;
      } catch (error) {
        this.log(`🔧 [EXECUTE-DEBUG] runWslCommand threw error:`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error message: ${error.error}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error stderr: ${error.stderr}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Error stdout: ${error.stdout}`, testId);
        this.log(`🔧 [EXECUTE-DEBUG] Full error object:`, testId);
        console.log(JSON.stringify(error, null, 2));
        
        this.log(`⚠️ ${toolName} attempt ${attempt} failed: ${error.error}`, testId);
        if (attempt === maxRetries) {
          this.log(`🔧 [EXECUTE-DEBUG] Max retries reached, throwing error`, testId);
          throw error;
        }
        // Wait before retry
        this.log(`🔧 [EXECUTE-DEBUG] Waiting 2 seconds before retry...`, testId);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async runXSSScan() {
    try {
      this.log('🔍 Starting XSS scan...', 'xss-scan');
      
      // Use the specific dalfox command format as requested
      const dalfoxCommand = `dalfox url "${this.targetUrl}" --fast-scan --skip-headless --timeout 5 --worker 50 --format json`;
      
      this.log(`🔍 Executing XSS scan command...`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] Raw command: ${dalfoxCommand}`, 'xss-scan');
      
      const result = await this.executeKaliTool('XSS Scan', dalfoxCommand, 'xss-scan');
      
      this.log(`🔍 [XSS-DEBUG] Raw result from executeKaliTool:`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] stdout length: ${result.stdout ? result.stdout.length : 0}`, 'xss-scan');
      this.log(`🔍 [XSS-DEBUG] stderr length: ${result.stderr ? result.stderr.length : 0}`, 'xss-scan');
      
      // Parse results and create comprehensive report
      this.log('🔍 [XSS-DEBUG] Parsing XSS scan results...', 'xss-scan');
      const structuredData = this.parseDalfoxOutput(result.stdout, result.stderr);
      this.log(`🔍 [XSS-DEBUG] Structured data: ${JSON.stringify(structuredData, null, 2)}`, 'xss-scan');
      
      // Generate comprehensive XSS scan report
      const xssReport = this.generateXSSReport(structuredData);
      
      const finalResult = {
        testId: 'xss-scan',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: this.determineSeverity(structuredData),
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: this.generateXSSFindings(structuredData),
        recommendations: this.generateXSSRecommendations(structuredData),
        report: xssReport
      };
      
      this.log(`🔍 [XSS-DEBUG] Final XSS scan result: ${JSON.stringify(finalResult, null, 2)}`, 'xss-scan');
      return finalResult;
    } catch (error) {
      this.log(`❌ XSS scan failed: ${error.message}`, 'xss-scan');
      return {
        testId: 'xss-scan',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'XSS scan failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure dalfox tool is installed'
        ],
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Scripting (XSS) Testing',
          error: error.message,
          summary: 'XSS scan failed due to technical issues'
        }
      };
    }
  }

  parseDalfoxOutput(stdout, stderr) {
    const result = {
      scan_name: "Cross-Site Scripting (XSS) Testing",
      target_url: this.targetUrl,
      scan_duration: null,
      parameters_tested: 0,
      total_testing_points_found: 0,
      vulnerabilities_found: 0,
      vulnerability_details: [],
      summary: "",
      raw_output: stdout,
      raw_stderr: stderr,
      dalfox_version: null,
      scan_details: {
        method: "GET",
        performance: "50 worker / 1 cpu",
        mining: true,
        timeout: 5,
        follow_redirect: false,
        fast_scan: true,
        skip_headless: true
      },
      reflected_parameters: [],
      content_type: null,
      scan_metadata: {
        started_at: null,
        finished_at: null,
        duration_seconds: 0
      }
    };

    if (!stdout) {
      result.summary = "No output received from dalfox";
      return result;
    }

    const lines = stdout.split('\n');
    let jsonOutput = '';
    let inJsonBlock = false;
    let scanStarted = false;
    let scanFinished = false;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Extract dalfox version
      if (trimmedLine.includes('Dalfox v') && !result.dalfox_version) {
        const versionMatch = trimmedLine.match(/Dalfox v([\d.]+)/);
        if (versionMatch) {
          result.dalfox_version = versionMatch[1];
        }
      }

      // Extract target URL
      if (trimmedLine.includes('🎯  Target')) {
        const targetMatch = trimmedLine.match(/🎯\s+Target\s+(.+)/);
        if (targetMatch) {
          result.target_url = targetMatch[1].trim();
        }
      }

      // Extract method
      if (trimmedLine.includes('🏁  Method')) {
        const methodMatch = trimmedLine.match(/🏁\s+Method\s+(.+)/);
        if (methodMatch) {
          result.scan_details.method = methodMatch[1].trim();
        }
      }

      // Extract performance info
      if (trimmedLine.includes('🖥   Performance')) {
        const perfMatch = trimmedLine.match(/🖥\s+Performance\s+(.+)/);
        if (perfMatch) {
          result.scan_details.performance = perfMatch[1].trim();
        }
      }

      // Extract timeout
      if (trimmedLine.includes('⏱   Timeout')) {
        const timeoutMatch = trimmedLine.match(/⏱\s+Timeout\s+(\d+)/);
        if (timeoutMatch) {
          result.scan_details.timeout = parseInt(timeoutMatch[1]);
        }
      }

      // Extract start time
      if (trimmedLine.includes('🕰   Started at')) {
        const startMatch = trimmedLine.match(/🕰\s+Started at\s+(.+)/);
        if (startMatch) {
          result.scan_metadata.started_at = startMatch[1].trim();
        }
      }

      // Extract testing points
      if (trimmedLine.includes('Found') && trimmedLine.includes('testing points')) {
        const pointsMatch = trimmedLine.match(/Found (\d+) testing points/);
        if (pointsMatch) {
          result.total_testing_points_found = parseInt(pointsMatch[1]);
        }
      }

      // Extract fast scan mode info
      if (trimmedLine.includes('Fast scan mode')) {
        const paramsMatch = trimmedLine.match(/limiting parameter analysis to first (\d+) parameters/);
        if (paramsMatch) {
          result.parameters_tested = parseInt(paramsMatch[1]);
        }
      }

      // Extract content type
      if (trimmedLine.includes('Content-Type is')) {
        const contentTypeMatch = trimmedLine.match(/Content-Type is (.+)/);
        if (contentTypeMatch) {
          result.content_type = contentTypeMatch[1].trim();
        }
      }

      // Extract reflected parameters
      if (trimmedLine.includes('Reflected') && trimmedLine.includes('param =>')) {
        const paramMatch = trimmedLine.match(/Reflected (.+?) param =>/);
        if (paramMatch) {
          result.reflected_parameters.push(paramMatch[1].trim());
        }
      }

      // Extract scan duration
      if (trimmedLine.includes('[duration:') && trimmedLine.includes('][issues:') && trimmedLine.includes('] Finish Scan!')) {
        const durationMatch = trimmedLine.match(/\[duration: ([^\]]+)\]\[issues: (\d+)\]/);
        if (durationMatch) {
          result.scan_duration = durationMatch[1];
          result.vulnerabilities_found = parseInt(durationMatch[2]);
          result.scan_metadata.finished_at = new Date().toISOString();
        }
      }

      // Look for JSON output block
      if (trimmedLine.startsWith('[') && trimmedLine.includes('{')) {
        inJsonBlock = true;
        jsonOutput = trimmedLine;
      } else if (inJsonBlock) {
        if (trimmedLine.startsWith(']')) {
          jsonOutput += '\n' + trimmedLine;
          inJsonBlock = false;
        } else {
          jsonOutput += '\n' + trimmedLine;
        }
      }
    });

    // Parse JSON output if found
    if (jsonOutput) {
      try {
        const jsonData = JSON.parse(jsonOutput);
        if (Array.isArray(jsonData)) {
          result.vulnerability_details = jsonData.map(vuln => ({
            type: vuln.type || 'V',
            inject_type: vuln.inject_type || 'unknown',
            poc_type: vuln.poc_type || 'plain',
            method: vuln.method || 'GET',
            data: vuln.data || '',
            param: vuln.param || '',
            payload: vuln.payload || '',
            evidence: vuln.evidence || '',
            cwe: vuln.cwe || 'CWE-79',
            severity: vuln.severity || 'High',
            message_id: vuln.message_id || 0,
            message_str: vuln.message_str || 'XSS vulnerability detected',
            raw_request: vuln.raw_request || '',
            raw_response: vuln.raw_response || ''
          }));
          result.vulnerabilities_found = jsonData.length;
        }
      } catch (error) {
        this.log(`⚠️ Failed to parse JSON output: ${error.message}`, 'xss-scan');
      }
    }

    // Generate summary and recommendations
    this.generateDynamicSummary(result);
    this.generateDynamicRecommendations(result);

    return result;
  }

  generateDynamicSummary(result) {
    if (result.vulnerabilities_found > 0) {
      result.summary = `XSS scan detected ${result.vulnerabilities_found} vulnerability(ies) in ${result.parameters_tested} tested parameter(s). Immediate remediation required.`;
    } else if (result.reflected_parameters.length > 0) {
      result.summary = `XSS scan completed. No vulnerabilities found in ${result.parameters_tested} tested parameter(s), but ${result.reflected_parameters.length} parameter(s) were found to be reflected in responses.`;
    } else {
      result.summary = `XSS scan completed successfully. No XSS vulnerabilities detected during fast scan of the target.`;
    }
  }

  generateDynamicRecommendations(result) {
    const recommendations = [];

    if (result.vulnerabilities_found > 0) {
      recommendations.push('Immediately patch all XSS vulnerabilities found');
      recommendations.push('Sanitize user inputs to escape HTML special characters');
      recommendations.push('Implement Content Security Policy (CSP) headers');
      recommendations.push('Use HTTP-only cookies to protect session data');
      recommendations.push('Validate and encode all data dynamically on server side');
      
      // Add specific recommendations based on vulnerability types
      const vulnerabilityTypes = [...new Set(result.vulnerability_details.map(v => v.inject_type))];
      if (vulnerabilityTypes.includes('inHTML')) {
        recommendations.push('Implement proper HTML encoding for user inputs');
      }
      if (vulnerabilityTypes.includes('inJS')) {
        recommendations.push('Implement proper JavaScript encoding for user inputs');
      }
      if (vulnerabilityTypes.includes('inURL')) {
        recommendations.push('Implement proper URL encoding for user inputs');
      }
    } else if (result.reflected_parameters.length > 0) {
      recommendations.push('Monitor reflected parameters for potential XSS vulnerabilities');
      recommendations.push('Implement input validation for all reflected parameters');
      recommendations.push('Consider implementing Content Security Policy (CSP) as a defense-in-depth measure');
    } else {
      recommendations.push('Continue regular XSS testing to maintain security posture');
      recommendations.push('Implement Content Security Policy (CSP) headers as a preventive measure');
      recommendations.push('Ensure all user inputs are properly validated and sanitized');
    }

    return recommendations;
  }

  generateXSSReport(structuredData) {
    return {
      scan_name: structuredData.scan_name,
      target_url: structuredData.target_url,
      scan_duration: structuredData.scan_duration,
      parameters_tested: structuredData.parameters_tested,
      total_testing_points_found: structuredData.total_testing_points_found,
      vulnerabilities_found: structuredData.vulnerabilities_found,
      vulnerability_details: structuredData.vulnerability_details,
      summary: structuredData.summary,
      scan_details: structuredData.scan_details,
      reflected_parameters: structuredData.reflected_parameters,
      content_type: structuredData.content_type,
      scan_metadata: structuredData.scan_metadata,
      dalfox_version: structuredData.dalfox_version,
      scan_timestamp: new Date().toISOString()
    };
  }

  determineSeverity(structuredData) {
    if (structuredData.vulnerabilities_found > 0) {
      // Check if any vulnerabilities are high severity
      const hasHighSeverity = structuredData.vulnerability_details.some(v => 
        v.severity && v.severity.toLowerCase() === 'high'
      );
      return hasHighSeverity ? 'critical' : 'high';
    } else if (structuredData.reflected_parameters.length > 0) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  generateXSSFindings(structuredData) {
    const findings = [];

    // Critical findings for vulnerabilities
    if (structuredData.vulnerabilities_found > 0) {
      findings.push({
        type: 'critical',
        message: 'XSS vulnerabilities detected',
        details: `Found ${structuredData.vulnerabilities_found} XSS vulnerability(ies) in ${structuredData.parameters_tested} tested parameter(s)`
      });

      // Add specific findings for each vulnerability
      structuredData.vulnerability_details.forEach((vuln, index) => {
        findings.push({
          type: 'critical',
          message: `XSS vulnerability in parameter '${vuln.param}'`,
          details: `Payload: ${vuln.payload}, Severity: ${vuln.severity}, CWE: ${vuln.cwe}, Evidence: ${vuln.evidence}`
        });
      });
    }

    // High findings for reflected parameters
    if (structuredData.reflected_parameters.length > 0) {
      findings.push({
        type: 'high',
        message: 'Reflected parameters detected',
        details: `Found ${structuredData.reflected_parameters.length} parameter(s) that are reflected in responses: ${structuredData.reflected_parameters.join(', ')}`
      });
    }

    // Medium findings for scan completion
    findings.push({
      type: 'medium',
      message: 'XSS scan completed',
      details: `Tested ${structuredData.parameters_tested} parameter(s) using dalfox with fast scan mode`
    });

    return findings;
  }

  generateXSSRecommendations(structuredData) {
    return this.generateDynamicRecommendations(structuredData);
  }

  async runScan() {
    this.log('Starting XSS scan...', 'xss-scan');
    this.log(`Target: ${this.targetUrl}`, 'xss-scan');

    try {
      const result = await this.runXSSScan();
      
      this.log('XSS scan completed!', 'xss-scan');
      
      // Call complete callback if set
      if (this.completeCallback) {
        this.completeCallback({ tests: { 'xss-scan': result } });
      }
      
      return { tests: { 'xss-scan': result } };
    } catch (error) {
      this.log(`XSS scan failed: ${error.message}`, 'xss-scan');
      
      // Call complete callback with error if set
      if (this.completeCallback) {
        this.completeCallback(null, error);
      }
      
      throw error;
    }
  }
}

module.exports = XSSScanner;
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
