const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class SQLInjectionScanner {
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

  log(message, testId = 'sql-injection') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${testId}] ${message}`);
    
    if (this.progressCallback) {
      this.progressCallback({
        testId,
        testName: 'SQL Injection Scanner',
        progress: 0,
        message: `[${timestamp}] ${message}`,
        type: 'info'
      });
    }
  }

  async runWslCommand(command, options = {}) {
    // Use specific Kali Linux distribution if available, otherwise default WSL
    // For sqlmap commands, we need to handle quotes properly
    let kaliCommand;
    if (command.includes('sqlmap')) {
      // For sqlmap, use single quotes to avoid quote escaping issues
      kaliCommand = `wsl bash -c '${command}'`;
    } else {
      // For other commands, use double quotes with proper escaping
      kaliCommand = `wsl bash -c "${command.replace(/"/g, '\\"')}"`;
    }
    console.log(`🔧 [WSL] Executing: ${kaliCommand}`);
    
    return new Promise((resolve, reject) => {
      const { timeout = 300000, cwd = this.outputDir } = options;
      const child = exec(kaliCommand, { timeout, cwd }, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ [WSL] Command failed:`, error.message);
          reject({ error: error.message, stderr, stdout });
        } else {
          console.log(`✅ [WSL] Command completed successfully`);
          resolve({ stdout, stderr });
        }
      });
    });
  }

  async executeKaliTool(toolName, command, testId, maxRetries = 2) {
    this.log(`🔧 Executing ${toolName}: ${command}`, testId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.runWslCommand(command);
        this.log(`✅ ${toolName} completed successfully`, testId);
        return result;
      } catch (error) {
        this.log(`⚠️ ${toolName} attempt ${attempt} failed: ${error.error}`, testId);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async runSQLInjectionScan() {
    try {
      this.log('🔍 Starting SQL injection scan...', 'sql-injection-scan');
      
      // Use the specific sqlmap command format as requested
      const sqlmapCommand = `sqlmap -u "${this.targetUrl}" --data="id=1&submit=Submit" --batch --level=1 --risk=1 --timeout=3 --threads=10 --technique=B --smart --flush-session -o`;
      
      this.log(`🔍 Executing SQL injection scan command...`, 'sql-injection-scan');
      this.log(`🔍 [SQL-DEBUG] Raw command: ${sqlmapCommand}`, 'sql-injection-scan');
      
      const result = await this.executeKaliTool('SQL Injection Scan', sqlmapCommand, 'sql-injection-scan');
      
      this.log(`🔍 [SQL-DEBUG] Raw result from executeKaliTool:`, 'sql-injection-scan');
      this.log(`🔍 [SQL-DEBUG] stdout length: ${result.stdout ? result.stdout.length : 0}`, 'sql-injection-scan');
      this.log(`🔍 [SQL-DEBUG] stderr length: ${result.stderr ? result.stderr.length : 0}`, 'sql-injection-scan');
      
      // Parse results and create comprehensive report
      this.log('🔍 [SQL-DEBUG] Parsing SQL injection scan results...', 'sql-injection-scan');
      const structuredData = this.parseSQLMapOutput(result.stdout, result.stderr);
      this.log(`🔍 [SQL-DEBUG] Structured data: ${JSON.stringify(structuredData, null, 2)}`, 'sql-injection-scan');
      
      // Generate comprehensive SQL injection scan report
      const sqlReport = this.generateSQLReport(structuredData);
      
      const finalResult = {
        testId: 'sql-injection-scan',
        testName: 'SQL Injection Quick POST Parameter Check',
        category: 'Web Security',
        severity: this.determineSeverity(structuredData),
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: this.generateSQLFindings(structuredData),
        recommendations: this.generateSQLRecommendations(structuredData),
        report: sqlReport
      };
      
      this.log(`🔍 [SQL-DEBUG] Final SQL injection scan result: ${JSON.stringify(finalResult, null, 2)}`, 'sql-injection-scan');
      return finalResult;
    } catch (error) {
      this.log(`❌ SQL injection scan failed: ${error.message}`, 'sql-injection-scan');
      return {
        testId: 'sql-injection-scan',
        testName: 'SQL Injection Quick POST Parameter Check',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'SQL injection scan failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure sqlmap tool is installed'
        ],
        report: {
          target: this.targetUrl,
          scanType: 'SQL Injection Quick POST Parameter Check',
          error: error.message,
          summary: 'SQL injection scan failed due to technical issues'
        }
      };
    }
  }

  parseSQLMapOutput(stdout, stderr) {
    const result = {
      scan_name: "SQL Injection Quick POST Parameter Check",
      target_url: this.targetUrl,
      parameters_tested: [],
      vulnerability_found: false,
      http_errors: [],
      recommendations: [],
      summary: "",
      raw_output: stdout,
      raw_stderr: stderr,
      sqlmap_version: null,
      test_details: {
        level: 1,
        risk: 1,
        technique: "B",
        timeout: 3,
        threads: 10
      },
      protection_detected: false,
      waf_detected: false,
      dynamic_parameters: [],
      non_dynamic_parameters: [],
      injection_points: [],
      database_info: {
        dbms: null,
        version: null,
        databases: [],
        tables: [],
        columns: []
      }
    };

    if (!stdout) {
      result.summary = "No output received from sqlmap";
      return result;
    }

    const lines = stdout.split('\n');
    let currentSection = '';
    let currentParameter = null;
    let isTestingParameter = false;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      // Extract sqlmap version
      if (trimmedLine.includes('sqlmap.org') && !result.sqlmap_version) {
        const versionMatch = trimmedLine.match(/(\d+\.\d+\.\d+)/);
        if (versionMatch) {
          result.sqlmap_version = versionMatch[1];
        }
      }

      // Check for legal disclaimer
      if (trimmedLine.includes('legal disclaimer')) {
        currentSection = 'disclaimer';
      }

      // Check for starting timestamp
      if (trimmedLine.includes('starting @')) {
        currentSection = 'execution';
        const timeMatch = trimmedLine.match(/starting @ ([\d:]+) \/([\d-]+)\//);
        if (timeMatch) {
          result.test_details.start_time = timeMatch[1];
          result.test_details.start_date = timeMatch[2];
        }
      }

      // Check for session flushing
      if (trimmedLine.includes('flushing session file')) {
        result.test_details.session_flushed = true;
      }

      // Check for connection testing
      if (trimmedLine.includes('testing connection to the target URL')) {
        currentSection = 'connection';
      }

      // Check for HTTP error codes
      if (trimmedLine.includes('HTTP error codes detected during run:')) {
        currentSection = 'http_errors';
      }

      // Parse HTTP error codes
      if (currentSection === 'http_errors' && trimmedLine.includes('(Forbidden)')) {
        const errorMatch = trimmedLine.match(/(\d+) \(Forbidden\) - (\d+) times/);
        if (errorMatch) {
          result.http_errors.push({
            code: parseInt(errorMatch[1]),
            description: 'Forbidden',
            count: parseInt(errorMatch[2])
          });
        }
      }

      // Check for WAF/IPS protection
      if (trimmedLine.includes('protected by some kind of WAF/IPS')) {
        result.protection_detected = true;
        result.waf_detected = true;
      }

      // Check for target URL content stability
      if (trimmedLine.includes('target URL content is stable')) {
        result.test_details.content_stable = true;
      }

      // Check for parameter testing
      if (trimmedLine.includes('testing if POST parameter')) {
        const paramMatch = trimmedLine.match(/testing if POST parameter '([^']+)' is dynamic/);
        if (paramMatch) {
          currentParameter = paramMatch[1];
          isTestingParameter = true;
          result.parameters_tested.push(currentParameter);
        }
      }

      // Check for dynamic parameter results
      if (isTestingParameter && trimmedLine.includes('does not appear to be dynamic')) {
        if (currentParameter) {
          result.non_dynamic_parameters.push(currentParameter);
        }
        isTestingParameter = false;
        currentParameter = null;
      }

      // Check for heuristic test results
      if (trimmedLine.includes('heuristic (basic) test shows that POST parameter')) {
        const paramMatch = trimmedLine.match(/POST parameter '([^']+)' might not be injectable/);
        if (paramMatch) {
          result.non_dynamic_parameters.push(paramMatch[1]);
        }
      }

      // Check for parameter skipping
      if (trimmedLine.includes('skipping POST parameter')) {
        const paramMatch = trimmedLine.match(/skipping POST parameter '([^']+)'/);
        if (paramMatch) {
          result.non_dynamic_parameters.push(paramMatch[1]);
        }
      }

      // Check for critical findings
      if (trimmedLine.includes('all tested parameters do not appear to be injectable')) {
        result.vulnerability_found = false;
        currentSection = 'conclusion';
      }

      // Check for ending timestamp
      if (trimmedLine.includes('ending @')) {
        const timeMatch = trimmedLine.match(/ending @ ([\d:]+) \/([\d-]+)\//);
        if (timeMatch) {
          result.test_details.end_time = timeMatch[1];
          result.test_details.end_date = timeMatch[2];
        }
      }

      // Check for outdated version warning
      if (trimmedLine.includes('your sqlmap version is outdated')) {
        result.test_details.version_outdated = true;
      }
    });

    // Generate recommendations based on findings
    this.generateDynamicRecommendations(result);

    // Generate summary
    this.generateDynamicSummary(result);

    return result;
  }

  generateDynamicRecommendations(result) {
    result.recommendations = [];

    // Recommendations based on HTTP errors
    if (result.http_errors.length > 0) {
      result.recommendations.push('Server is responding with HTTP 403 errors - likely protected by WAF or similar mechanisms');
    }

    // Recommendations based on parameter testing
    if (result.non_dynamic_parameters.length > 0) {
      result.recommendations.push('Try increasing --level and --risk parameters for more thorough testing');
    }

    // Recommendations based on protection detection
    if (result.protection_detected) {
      result.recommendations.push('Use --tamper scripts like space2comment to bypass WAF');
      result.recommendations.push('Use --random-agent to avoid detection');
    }

    // Recommendations based on version
    if (result.test_details.version_outdated) {
      result.recommendations.push('Update sqlmap to latest version for better detection and bypass techniques');
    }

    // General recommendations
    if (result.parameters_tested.length === 0) {
      result.recommendations.push('Try running without --technique parameter to test all techniques');
      result.recommendations.push('Use --text-only option for low textual content scenarios');
    }

    // Add manual verification recommendation
    result.recommendations.push('Manual verification and traffic analysis (e.g., with Burp Suite) can complement automated testing');
  }

  generateDynamicSummary(result) {
    if (result.vulnerability_found) {
      result.summary = `SQL injection vulnerabilities found in ${result.injection_points.length} parameter(s). Immediate remediation required.`;
    } else if (result.http_errors.length > 0) {
      result.summary = `No injectable parameters found. The scan was blocked by HTTP ${result.http_errors.map(e => e.code).join(', ')} errors indicating the server is likely protected by WAF or similar mechanisms.`;
    } else if (result.non_dynamic_parameters.length > 0) {
      result.summary = `No injectable parameters found. ${result.non_dynamic_parameters.length} parameter(s) tested but did not appear to be dynamic or injectable.`;
    } else {
      result.summary = `SQL injection scan completed. No vulnerable parameters found in ${result.parameters_tested.length} tested parameter(s).`;
    }
  }

  generateSQLReport(structuredData) {
    return {
      scan_name: structuredData.scan_name,
      target_url: structuredData.target_url,
      parameters_tested: structuredData.parameters_tested,
      vulnerability_found: structuredData.vulnerability_found,
      http_errors: structuredData.http_errors,
      recommendations: structuredData.recommendations,
      summary: structuredData.summary,
      test_details: structuredData.test_details,
      protection_detected: structuredData.protection_detected,
      waf_detected: structuredData.waf_detected,
      dynamic_parameters: structuredData.dynamic_parameters,
      non_dynamic_parameters: structuredData.non_dynamic_parameters,
      injection_points: structuredData.injection_points,
      database_info: structuredData.database_info,
      sqlmap_version: structuredData.sqlmap_version,
      scan_timestamp: new Date().toISOString()
    };
  }

  determineSeverity(structuredData) {
    if (structuredData.vulnerability_found) {
      return 'critical';
    } else if (structuredData.http_errors.length > 0) {
      return 'medium';
    } else if (structuredData.protection_detected) {
      return 'low';
    } else {
      return 'low';
    }
  }

  generateSQLFindings(structuredData) {
    const findings = [];

    // Critical findings for vulnerabilities
    if (structuredData.vulnerability_found) {
      findings.push({
        type: 'critical',
        message: 'SQL injection vulnerabilities detected',
        details: `Found vulnerabilities in ${structuredData.injection_points.length} parameter(s)`
      });
    }

    // High findings for HTTP errors
    if (structuredData.http_errors.length > 0) {
      findings.push({
        type: 'high',
        message: 'HTTP errors detected during scan',
        details: `Server responded with HTTP ${structuredData.http_errors.map(e => e.code).join(', ')} errors, indicating potential protection mechanisms`
      });
    }

    // Medium findings for protection detection
    if (structuredData.protection_detected) {
      findings.push({
        type: 'medium',
        message: 'Protection mechanisms detected',
        details: 'Server appears to be protected by WAF or similar security mechanisms'
      });
    }

    // Low findings for non-dynamic parameters
    if (structuredData.non_dynamic_parameters.length > 0) {
      findings.push({
        type: 'low',
        message: 'Non-dynamic parameters detected',
        details: `Parameters ${structuredData.non_dynamic_parameters.join(', ')} do not appear to be dynamic or injectable`
      });
    }

    // Info findings for general scan completion
    findings.push({
      type: 'info',
      message: 'SQL injection scan completed',
      details: `Tested ${structuredData.parameters_tested.length} parameter(s) using sqlmap with level ${structuredData.test_details.level} and risk ${structuredData.test_details.risk}`
    });

    return findings;
  }

  generateSQLRecommendations(structuredData) {
    return structuredData.recommendations || [
      'Implement parameterized queries (prepared statements)',
      'Use input validation and sanitization',
      'Implement Web Application Firewall (WAF)',
      'Conduct regular security testing',
      'Monitor application logs for suspicious activity'
    ];
  }

  async runScan() {
    this.log('Starting SQL injection scan...', 'sql-injection-scan');
    this.log(`Target: ${this.targetUrl}`, 'sql-injection-scan');

    try {
      const result = await this.runSQLInjectionScan();
      
      this.log('SQL injection scan completed!', 'sql-injection-scan');
      
      // Call complete callback if set
      if (this.completeCallback) {
        this.completeCallback({ tests: { 'sql-injection-scan': result } });
      }
      
      return { tests: { 'sql-injection-scan': result } };
    } catch (error) {
      this.log(`SQL injection scan failed: ${error.message}`, 'sql-injection-scan');
      
      // Call complete callback with error if set
      if (this.completeCallback) {
        this.completeCallback(null, error);
      }
      
      throw error;
    }
  }
}

module.exports = SQLInjectionScanner;
