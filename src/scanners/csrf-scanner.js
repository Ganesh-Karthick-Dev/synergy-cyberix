<<<<<<< HEAD
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class CSRFScanner {
  constructor(targetUrl, outputDir) {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
    this.progressCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  async runScan() {
    console.log('🔍 Starting CSRF scan...');
    
    try {
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: 'Executing CSRF test with curl...',
          progress: 10
        });
      }

      // Execute CSRF test
      const result = await this.executeCSRFTest();
      
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'completed',
          message: 'CSRF test completed successfully',
          progress: 100
        });
      }

      return {
        tests: {
          'csrf-test': result
        }
      };
    } catch (error) {
      console.error('❌ CSRF scan failed:', error);
      
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'failed',
          message: `CSRF test failed: ${error.message}`,
          progress: 0
        });
      }

      // Return fallback result
      return {
        tests: {
          'csrf-test': {
            testId: 'csrf-test',
            testName: 'Cross-Site Request Forgery (CSRF) Testing',
            category: 'Web Security',
            severity: 'high',
            status: 'failed',
            timestamp: new Date().toISOString(),
            error: error.message,
            findings: [
              {
                type: 'error',
                message: 'CSRF test failed',
                details: error.message
              }
            ],
            recommendations: [
              'Check network connectivity',
              'Verify target URL accessibility',
              'Ensure curl is available in WSL'
            ],
            report: {
              target: this.targetUrl,
              scanType: 'Cross-Site Request Forgery (CSRF) Testing',
              error: error.message,
              summary: 'CSRF test failed due to technical issues'
            }
          }
        }
      };
    }
  }

  async executeCSRFTest() {
    console.log('🔍 Executing CSRF test command...');
    
    // Construct curl command for CSRF testing (single-line; no backslashes/pipes)
    const curlCommand = `curl -s -S -X POST "${this.targetUrl}" -H "Cookie: sessionid=xyz" -H "Content-Type: application/x-www-form-urlencoded" --data "param1=value1&param2=value2" -D - -o /dev/null`;

    console.log(`🔍 [CSRF-DEBUG] Raw command: ${curlCommand}`);
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'csrf-test',
        status: 'running',
        message: `[CSRF] Raw command: ${curlCommand}`,
        progress: 15,
        type: 'info'
      });
    }

    try {
      // Execute the curl command via WSL
      const { stdout, stderr } = await this.runWslCommand(curlCommand);
      
      console.log('🔍 [CSRF-DEBUG] Curl command completed');
      console.log('🔍 [CSRF-DEBUG] Stdout:', stdout);
      console.log('🔍 [CSRF-DEBUG] Stderr:', stderr);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: `[CSRF] Command completed. Stdout preview: ${(stdout || '').substring(0, 200)}... | Stderr preview: ${(stderr || '').substring(0, 200)}...`,
          progress: 60,
          type: 'info'
        });
      }

      // Parse the curl output
      const parsedResult = this.parseCurlOutput(stdout, stderr);
      
      return parsedResult;
    } catch (error) {
      console.error('❌ CSRF test execution failed:', error);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'failed',
          message: `[CSRF] Execution failed. ${error.message || error.error || 'Unknown error'} | code: ${error.code || 'n/a'}, signal: ${error.signal || 'n/a'} | Stdout preview: ${(error.stdout || '').substring(0, 200)}... | Stderr preview: ${(error.stderr || '').substring(0, 200)}...`,
          progress: 0,
          type: 'error'
        });
      }
      throw error;
    }
  }

  async runWslCommand(command, options = {}) {
    console.log(`🔧 [CSRF-EXEC-DEBUG] ===== COMMAND EXECUTION START =====`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Raw command: ${command}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Command type: ${typeof command}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Command length: ${command.length}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Options:`, options);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Working directory: ${this.outputDir}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Timeout: ${options.timeout || 300000}ms`);
    
    // Execute command in WSL (like your manual test)
    const wslCommand = `wsl ${command}`;
    console.log(`🔧 [CSRF-EXEC-DEBUG] WSL command to exec(): ${wslCommand}`);
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'csrf-test',
        status: 'running',
        message: `[CSRF] Executing in WSL: ${wslCommand} | cwd: ${this.outputDir} | timeout: ${options.timeout || 300000}ms`,
        progress: 25,
        type: 'info'
      });
    }
    
    return new Promise((resolve, reject) => {
      const { timeout = 300000, cwd = this.outputDir } = options;
      
      console.log(`🔧 [CSRF-EXEC-DEBUG] About to execute WSL command with exec()...`);
      console.log(`🔧 [CSRF-EXEC-DEBUG] Process will run in directory: ${cwd}`);
      
      const child = exec(wslCommand, { timeout, cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] ===== COMMAND EXECUTION COMPLETE =====`);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error object:`, error);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error code:`, error ? error.code : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error signal:`, error ? error.signal : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error killed:`, error ? error.killed : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stdout length:`, stdout ? stdout.length : 0);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stderr length:`, stderr ? stderr.length : 0);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stdout preview:`, stdout ? stdout.substring(0, 200) + '...' : 'No stdout');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stderr preview:`, stderr ? stderr.substring(0, 200) + '...' : 'No stderr');
        
        if (error) {
          console.error(`❌ [CSRF-EXEC-DEBUG] Command failed with error:`, error.message);
          console.error(`❌ [CSRF-EXEC-DEBUG] Full error object:`, JSON.stringify(error, null, 2));
          if (this.progressCallback) {
            this.progressCallback({
              testId: 'csrf-test',
              status: 'failed',
              message: `[CSRF] Command failed. ${error.message} | code: ${error.code || 'n/a'}, signal: ${error.signal || 'n/a'} | Stdout preview: ${(stdout || '').substring(0, 200)}... | Stderr preview: ${(stderr || '').substring(0, 200)}...`,
              progress: 0,
              type: 'error'
            });
          }
          const err = new Error(error.message || 'CSRF command failed');
          err.code = error.code;
          err.signal = error.signal;
          err.killed = error.killed;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          console.log(`✅ [CSRF-EXEC-DEBUG] Command completed successfully`);
          console.log(`✅ [CSRF-EXEC-DEBUG] Full stdout:`, stdout);
          console.log(`✅ [CSRF-EXEC-DEBUG] Full stderr:`, stderr);
          if (this.progressCallback) {
            this.progressCallback({
              testId: 'csrf-test',
              status: 'running',
              message: `[CSRF] Command succeeded. Stdout length: ${(stdout || '').length}, Stderr length: ${(stderr || '').length}`,
              progress: 55,
              type: 'info'
            });
          }
          resolve({ stdout, stderr });
        }
      });
      
      console.log(`🔧 [CSRF-EXEC-DEBUG] Child process created with PID: ${child.pid}`);
      console.log(`🔧 [CSRF-EXEC-DEBUG] Child process spawned: ${child.spawned}`);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: `[CSRF] Spawned PID: ${child.pid}`,
          progress: 30,
          type: 'info'
        });
      }
      
      // Add event listeners for more debugging
      child.on('error', (err) => {
        console.error(`🔧 [CSRF-EXEC-DEBUG] Child process error event:`, err);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: 'failed',
            message: `[CSRF] Child process error event: ${err.message}`,
            progress: 0,
            type: 'error'
          });
        }
      });
      
      child.on('exit', (code, signal) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] Child process exit - Code: ${code}, Signal: ${signal}`);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: 'running',
            message: `[CSRF] Child exit - Code: ${code}, Signal: ${signal}`,
            progress: code === 0 ? 60 : 0,
            type: code === 0 ? 'info' : 'warning'
          });
        }
      });
      
      child.on('close', (code, signal) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] Child process close - Code: ${code}, Signal: ${signal}`);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: code === 0 ? 'running' : 'failed',
            message: `[CSRF] Child close - Code: ${code}, Signal: ${signal}`,
            progress: code === 0 ? 65 : 0,
            type: code === 0 ? 'info' : 'error'
          });
        }
      });
    });
  }

  parseCurlOutput(stdout, stderr) {
    console.log('🔍 [CSRF-PARSE] Parsing curl output...');
    console.log('🔍 [CSRF-PARSE] Raw stdout:', stdout);
    console.log('🔍 [CSRF-PARSE] Raw stderr:', stderr);

    try {
      // Parse HTTP status code - handle both HTTP/1.1 and HTTP/2
      const statusMatch = stdout.match(/HTTP\/[\d.]+ (\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
      
      console.log('🔍 [CSRF-PARSE] Extracted status code:', statusCode);

      // Parse headers
      const headers = {};
      const headerLines = stdout.split('\n').filter(line => line.includes(':'));
      
      headerLines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      });

      console.log('🔍 [CSRF-PARSE] Extracted headers:', headers);

      // Determine CSRF vulnerability status
      let vulnerabilityStatus = 'Unknown';
      let summary = '';
      let recommendations = [];

      if (statusCode === 200) {
        // Check for CSRF protection headers
        const hasCSRFToken = headers['x-csrf-token'] || headers['csrf-token'];
        const hasSameSite = headers['set-cookie'] && headers['set-cookie'].includes('SameSite');
        const hasOriginValidation = headers['access-control-allow-origin'];
        
        if (!hasCSRFToken && !hasSameSite) {
          vulnerabilityStatus = 'Potential Vulnerability';
          summary = `HTTP ${statusCode} OK received indicating server processed POST request. No CSRF protection headers detected. Site may be vulnerable to CSRF attacks.`;
          recommendations = [
            'Implement CSRF tokens in forms and AJAX requests',
            'Set SameSite attribute for cookies',
            'Validate Origin and Referer headers on the server side',
            'Implement double-submit cookie pattern',
            'Use state-changing operations only with CSRF protection'
          ];
        } else {
          vulnerabilityStatus = 'Protected';
          summary = `HTTP ${statusCode} OK received. CSRF protection mechanisms detected. Site appears to have CSRF protection in place.`;
          recommendations = [
            'Maintain current CSRF protection mechanisms',
            'Regularly test CSRF protection effectiveness',
            'Monitor for new CSRF attack vectors',
            'Keep CSRF protection up to date'
          ];
        }
      } else if (statusCode === 403) {
        vulnerabilityStatus = 'Protected';
        summary = `HTTP ${statusCode} Forbidden received. Server rejected the POST request, indicating potential CSRF protection.`;
        recommendations = [
          'Server appears to have CSRF protection',
          'Verify protection covers all state-changing operations',
          'Test protection with different attack vectors'
        ];
      } else if (statusCode === 405) {
        vulnerabilityStatus = 'Protected';
        summary = `HTTP ${statusCode} Method Not Allowed received. Server rejected POST method, indicating potential CSRF protection.`;
        recommendations = [
          'Server appears to restrict POST methods',
          'Verify all state-changing operations are properly protected',
          'Test with different HTTP methods'
        ];
      } else if (statusCode === 302 || statusCode === 301) {
        vulnerabilityStatus = 'Potential Vulnerability';
        summary = `HTTP ${statusCode} Redirect received. Server processed POST request and redirected, which may indicate lack of CSRF protection. Redirects can be exploited for CSRF attacks.`;
        recommendations = [
          'Implement CSRF tokens in forms and AJAX requests',
          'Set SameSite attribute for cookies',
          'Validate Origin and Referer headers on the server side',
          'Implement double-submit cookie pattern',
          'Use state-changing operations only with proper CSRF protection'
        ];
      } else {
        vulnerabilityStatus = 'Unknown';
        summary = `HTTP ${statusCode} received. Unable to determine CSRF protection status.`;
        recommendations = [
          'Investigate server response further',
          'Test with different parameters and headers',
          'Verify server configuration'
        ];
      }

      // Generate findings
      const findings = [];
      
      if (vulnerabilityStatus === 'Potential Vulnerability') {
        findings.push({
          type: 'high',
          message: 'Potential CSRF vulnerability detected',
          details: 'Server processed POST request without apparent CSRF protection'
        });
      } else if (vulnerabilityStatus === 'Protected') {
        findings.push({
          type: 'info',
          message: 'CSRF protection detected',
          details: 'Server appears to have CSRF protection mechanisms in place'
        });
      } else {
        findings.push({
          type: 'warning',
          message: 'Unable to determine CSRF protection status',
          details: 'Server response unclear or unexpected'
        });
      }

      // Add header analysis findings
      if (headers['server']) {
        findings.push({
          type: 'info',
          message: `Server identified: ${headers['server']}`,
          details: 'Server information extracted from response headers'
        });
      }

      if (headers['content-type']) {
        findings.push({
          type: 'info',
          message: `Content type: ${headers['content-type']}`,
          details: 'Response content type identified'
        });
      }

      const result = {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: vulnerabilityStatus === 'Potential Vulnerability' ? 'high' : 'medium',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: findings,
        recommendations: recommendations,
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          httpStatusCode: statusCode,
          responseHeaders: headers,
          csrfVulnerability: vulnerabilityStatus,
          summary: summary,
          recommendations: recommendations
        }
      };

      console.log('🔍 [CSRF-PARSE] Parsed result:', result);
      return result;

    } catch (error) {
      console.error('❌ Error parsing curl output:', error);
      
      return {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'error',
            message: 'Failed to parse curl output',
            details: error.message
          }
        ],
        recommendations: [
          'Check curl command execution',
          'Verify output format',
          'Review parsing logic'
        ],
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          error: error.message,
          summary: 'CSRF test completed but failed to parse results'
        }
      };
    }
  }
}

module.exports = CSRFScanner;
=======
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class CSRFScanner {
  constructor(targetUrl, outputDir) {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
    this.progressCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  async runScan() {
    console.log('🔍 Starting CSRF scan...');
    
    try {
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: 'Executing CSRF test with curl...',
          progress: 10
        });
      }

      // Execute CSRF test
      const result = await this.executeCSRFTest();
      
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'completed',
          message: 'CSRF test completed successfully',
          progress: 100
        });
      }

      return {
        tests: {
          'csrf-test': result
        }
      };
    } catch (error) {
      console.error('❌ CSRF scan failed:', error);
      
      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'failed',
          message: `CSRF test failed: ${error.message}`,
          progress: 0
        });
      }

      // Return fallback result
      return {
        tests: {
          'csrf-test': {
            testId: 'csrf-test',
            testName: 'Cross-Site Request Forgery (CSRF) Testing',
            category: 'Web Security',
            severity: 'high',
            status: 'failed',
            timestamp: new Date().toISOString(),
            error: error.message,
            findings: [
              {
                type: 'error',
                message: 'CSRF test failed',
                details: error.message
              }
            ],
            recommendations: [
              'Check network connectivity',
              'Verify target URL accessibility',
              'Ensure curl is available in WSL'
            ],
            report: {
              target: this.targetUrl,
              scanType: 'Cross-Site Request Forgery (CSRF) Testing',
              error: error.message,
              summary: 'CSRF test failed due to technical issues'
            }
          }
        }
      };
    }
  }

  async executeCSRFTest() {
    console.log('🔍 Executing CSRF test command...');
    
    // Construct curl command for CSRF testing (single-line; no backslashes/pipes)
    const curlCommand = `curl -s -S -X POST "${this.targetUrl}" -H "Cookie: sessionid=xyz" -H "Content-Type: application/x-www-form-urlencoded" --data "param1=value1&param2=value2" -D - -o /dev/null`;

    console.log(`🔍 [CSRF-DEBUG] Raw command: ${curlCommand}`);
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'csrf-test',
        status: 'running',
        message: `[CSRF] Raw command: ${curlCommand}`,
        progress: 15,
        type: 'info'
      });
    }

    try {
      // Execute the curl command via WSL
      const { stdout, stderr } = await this.runWslCommand(curlCommand);
      
      console.log('🔍 [CSRF-DEBUG] Curl command completed');
      console.log('🔍 [CSRF-DEBUG] Stdout:', stdout);
      console.log('🔍 [CSRF-DEBUG] Stderr:', stderr);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: `[CSRF] Command completed. Stdout preview: ${(stdout || '').substring(0, 200)}... | Stderr preview: ${(stderr || '').substring(0, 200)}...`,
          progress: 60,
          type: 'info'
        });
      }

      // Parse the curl output
      const parsedResult = this.parseCurlOutput(stdout, stderr);
      
      return parsedResult;
    } catch (error) {
      console.error('❌ CSRF test execution failed:', error);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'failed',
          message: `[CSRF] Execution failed. ${error.message || error.error || 'Unknown error'} | code: ${error.code || 'n/a'}, signal: ${error.signal || 'n/a'} | Stdout preview: ${(error.stdout || '').substring(0, 200)}... | Stderr preview: ${(error.stderr || '').substring(0, 200)}...`,
          progress: 0,
          type: 'error'
        });
      }
      throw error;
    }
  }

  async runWslCommand(command, options = {}) {
    console.log(`🔧 [CSRF-EXEC-DEBUG] ===== COMMAND EXECUTION START =====`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Raw command: ${command}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Command type: ${typeof command}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Command length: ${command.length}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Options:`, options);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Working directory: ${this.outputDir}`);
    console.log(`🔧 [CSRF-EXEC-DEBUG] Timeout: ${options.timeout || 300000}ms`);
    
    // Execute command in WSL (like your manual test)
    const wslCommand = `wsl ${command}`;
    console.log(`🔧 [CSRF-EXEC-DEBUG] WSL command to exec(): ${wslCommand}`);
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'csrf-test',
        status: 'running',
        message: `[CSRF] Executing in WSL: ${wslCommand} | cwd: ${this.outputDir} | timeout: ${options.timeout || 300000}ms`,
        progress: 25,
        type: 'info'
      });
    }
    
    return new Promise((resolve, reject) => {
      const { timeout = 300000, cwd = this.outputDir } = options;
      
      console.log(`🔧 [CSRF-EXEC-DEBUG] About to execute WSL command with exec()...`);
      console.log(`🔧 [CSRF-EXEC-DEBUG] Process will run in directory: ${cwd}`);
      
      const child = exec(wslCommand, { timeout, cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] ===== COMMAND EXECUTION COMPLETE =====`);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error object:`, error);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error code:`, error ? error.code : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error signal:`, error ? error.signal : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Error killed:`, error ? error.killed : 'none');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stdout length:`, stdout ? stdout.length : 0);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stderr length:`, stderr ? stderr.length : 0);
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stdout preview:`, stdout ? stdout.substring(0, 200) + '...' : 'No stdout');
        console.log(`🔧 [CSRF-EXEC-DEBUG] Stderr preview:`, stderr ? stderr.substring(0, 200) + '...' : 'No stderr');
        
        if (error) {
          console.error(`❌ [CSRF-EXEC-DEBUG] Command failed with error:`, error.message);
          console.error(`❌ [CSRF-EXEC-DEBUG] Full error object:`, JSON.stringify(error, null, 2));
          if (this.progressCallback) {
            this.progressCallback({
              testId: 'csrf-test',
              status: 'failed',
              message: `[CSRF] Command failed. ${error.message} | code: ${error.code || 'n/a'}, signal: ${error.signal || 'n/a'} | Stdout preview: ${(stdout || '').substring(0, 200)}... | Stderr preview: ${(stderr || '').substring(0, 200)}...`,
              progress: 0,
              type: 'error'
            });
          }
          const err = new Error(error.message || 'CSRF command failed');
          err.code = error.code;
          err.signal = error.signal;
          err.killed = error.killed;
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
        } else {
          console.log(`✅ [CSRF-EXEC-DEBUG] Command completed successfully`);
          console.log(`✅ [CSRF-EXEC-DEBUG] Full stdout:`, stdout);
          console.log(`✅ [CSRF-EXEC-DEBUG] Full stderr:`, stderr);
          if (this.progressCallback) {
            this.progressCallback({
              testId: 'csrf-test',
              status: 'running',
              message: `[CSRF] Command succeeded. Stdout length: ${(stdout || '').length}, Stderr length: ${(stderr || '').length}`,
              progress: 55,
              type: 'info'
            });
          }
          resolve({ stdout, stderr });
        }
      });
      
      console.log(`🔧 [CSRF-EXEC-DEBUG] Child process created with PID: ${child.pid}`);
      console.log(`🔧 [CSRF-EXEC-DEBUG] Child process spawned: ${child.spawned}`);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'csrf-test',
          status: 'running',
          message: `[CSRF] Spawned PID: ${child.pid}`,
          progress: 30,
          type: 'info'
        });
      }
      
      // Add event listeners for more debugging
      child.on('error', (err) => {
        console.error(`🔧 [CSRF-EXEC-DEBUG] Child process error event:`, err);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: 'failed',
            message: `[CSRF] Child process error event: ${err.message}`,
            progress: 0,
            type: 'error'
          });
        }
      });
      
      child.on('exit', (code, signal) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] Child process exit - Code: ${code}, Signal: ${signal}`);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: 'running',
            message: `[CSRF] Child exit - Code: ${code}, Signal: ${signal}`,
            progress: code === 0 ? 60 : 0,
            type: code === 0 ? 'info' : 'warning'
          });
        }
      });
      
      child.on('close', (code, signal) => {
        console.log(`🔧 [CSRF-EXEC-DEBUG] Child process close - Code: ${code}, Signal: ${signal}`);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'csrf-test',
            status: code === 0 ? 'running' : 'failed',
            message: `[CSRF] Child close - Code: ${code}, Signal: ${signal}`,
            progress: code === 0 ? 65 : 0,
            type: code === 0 ? 'info' : 'error'
          });
        }
      });
    });
  }

  parseCurlOutput(stdout, stderr) {
    console.log('🔍 [CSRF-PARSE] Parsing curl output...');
    console.log('🔍 [CSRF-PARSE] Raw stdout:', stdout);
    console.log('🔍 [CSRF-PARSE] Raw stderr:', stderr);

    try {
      // Parse HTTP status code - handle both HTTP/1.1 and HTTP/2
      const statusMatch = stdout.match(/HTTP\/[\d.]+ (\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1]) : null;
      
      console.log('🔍 [CSRF-PARSE] Extracted status code:', statusCode);

      // Parse headers
      const headers = {};
      const headerLines = stdout.split('\n').filter(line => line.includes(':'));
      
      headerLines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim().toLowerCase();
          const value = line.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      });

      console.log('🔍 [CSRF-PARSE] Extracted headers:', headers);

      // Determine CSRF vulnerability status
      let vulnerabilityStatus = 'Unknown';
      let summary = '';
      let recommendations = [];

      if (statusCode === 200) {
        // Check for CSRF protection headers
        const hasCSRFToken = headers['x-csrf-token'] || headers['csrf-token'];
        const hasSameSite = headers['set-cookie'] && headers['set-cookie'].includes('SameSite');
        const hasOriginValidation = headers['access-control-allow-origin'];
        
        if (!hasCSRFToken && !hasSameSite) {
          vulnerabilityStatus = 'Potential Vulnerability';
          summary = `HTTP ${statusCode} OK received indicating server processed POST request. No CSRF protection headers detected. Site may be vulnerable to CSRF attacks.`;
          recommendations = [
            'Implement CSRF tokens in forms and AJAX requests',
            'Set SameSite attribute for cookies',
            'Validate Origin and Referer headers on the server side',
            'Implement double-submit cookie pattern',
            'Use state-changing operations only with CSRF protection'
          ];
        } else {
          vulnerabilityStatus = 'Protected';
          summary = `HTTP ${statusCode} OK received. CSRF protection mechanisms detected. Site appears to have CSRF protection in place.`;
          recommendations = [
            'Maintain current CSRF protection mechanisms',
            'Regularly test CSRF protection effectiveness',
            'Monitor for new CSRF attack vectors',
            'Keep CSRF protection up to date'
          ];
        }
      } else if (statusCode === 403) {
        vulnerabilityStatus = 'Protected';
        summary = `HTTP ${statusCode} Forbidden received. Server rejected the POST request, indicating potential CSRF protection.`;
        recommendations = [
          'Server appears to have CSRF protection',
          'Verify protection covers all state-changing operations',
          'Test protection with different attack vectors'
        ];
      } else if (statusCode === 405) {
        vulnerabilityStatus = 'Protected';
        summary = `HTTP ${statusCode} Method Not Allowed received. Server rejected POST method, indicating potential CSRF protection.`;
        recommendations = [
          'Server appears to restrict POST methods',
          'Verify all state-changing operations are properly protected',
          'Test with different HTTP methods'
        ];
      } else if (statusCode === 302 || statusCode === 301) {
        vulnerabilityStatus = 'Potential Vulnerability';
        summary = `HTTP ${statusCode} Redirect received. Server processed POST request and redirected, which may indicate lack of CSRF protection. Redirects can be exploited for CSRF attacks.`;
        recommendations = [
          'Implement CSRF tokens in forms and AJAX requests',
          'Set SameSite attribute for cookies',
          'Validate Origin and Referer headers on the server side',
          'Implement double-submit cookie pattern',
          'Use state-changing operations only with proper CSRF protection'
        ];
      } else {
        vulnerabilityStatus = 'Unknown';
        summary = `HTTP ${statusCode} received. Unable to determine CSRF protection status.`;
        recommendations = [
          'Investigate server response further',
          'Test with different parameters and headers',
          'Verify server configuration'
        ];
      }

      // Generate findings
      const findings = [];
      
      if (vulnerabilityStatus === 'Potential Vulnerability') {
        findings.push({
          type: 'high',
          message: 'Potential CSRF vulnerability detected',
          details: 'Server processed POST request without apparent CSRF protection'
        });
      } else if (vulnerabilityStatus === 'Protected') {
        findings.push({
          type: 'info',
          message: 'CSRF protection detected',
          details: 'Server appears to have CSRF protection mechanisms in place'
        });
      } else {
        findings.push({
          type: 'warning',
          message: 'Unable to determine CSRF protection status',
          details: 'Server response unclear or unexpected'
        });
      }

      // Add header analysis findings
      if (headers['server']) {
        findings.push({
          type: 'info',
          message: `Server identified: ${headers['server']}`,
          details: 'Server information extracted from response headers'
        });
      }

      if (headers['content-type']) {
        findings.push({
          type: 'info',
          message: `Content type: ${headers['content-type']}`,
          details: 'Response content type identified'
        });
      }

      const result = {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: vulnerabilityStatus === 'Potential Vulnerability' ? 'high' : 'medium',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: findings,
        recommendations: recommendations,
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          httpStatusCode: statusCode,
          responseHeaders: headers,
          csrfVulnerability: vulnerabilityStatus,
          summary: summary,
          recommendations: recommendations
        }
      };

      console.log('🔍 [CSRF-PARSE] Parsed result:', result);
      return result;

    } catch (error) {
      console.error('❌ Error parsing curl output:', error);
      
      return {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'error',
            message: 'Failed to parse curl output',
            details: error.message
          }
        ],
        recommendations: [
          'Check curl command execution',
          'Verify output format',
          'Review parsing logic'
        ],
        report: {
          target: this.targetUrl,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          error: error.message,
          summary: 'CSRF test completed but failed to parse results'
        }
      };
    }
  }
}

module.exports = CSRFScanner;
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
