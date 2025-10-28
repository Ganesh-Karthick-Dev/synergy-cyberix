const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

class KaliSecurityScanner {
  constructor(domain, outputDir = './scan-results') {
    this.domain = domain;
    this.outputDir = outputDir;
    this.progressCallback = null;
    this.completeCallback = null;
    this.wslAvailable = false;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  setCompleteCallback(callback) {
    this.completeCallback = callback;
  }

  log(message, testId = 'system') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
    
    if (this.progressCallback) {
      this.progressCallback({
        testId,
        testName: 'System',
        progress: 0,
        message: `[${timestamp}] ${message}`,
        type: 'info'
      });
    }
  }

  async runCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const { timeout = 60000, cwd = this.outputDir } = options;
      const child = exec(command, { timeout, cwd }, (error, stdout, stderr) => {
        if (error) {
          reject({ error: error.message, stderr, stdout });
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
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

  async executeAllTests() {
    const results = {};

    // 1. CSRF Test (FIRST TEST ENABLED)
    this.log('🔧 Executing CSRF Test...', 'csrf-test');
    console.log('🔍 [CSRF-EXECUTION] ===== STARTING CSRF TEST =====');
    console.log('🔍 [CSRF-EXECUTION] Target domain:', this.domain);
    console.log('🔍 [CSRF-EXECUTION] Timestamp:', new Date().toISOString());
    console.log('🔍 [CSRF-EXECUTION] NOTE: Only CSRF test is enabled - other tests are temporarily disabled');
    
    try {
      // Use the new comprehensive CSRF test method
      const csrfResult = await this.runCSRFTest();
      
      console.log('🔍 [CSRF-EXECUTION] ===== CSRF TEST COMPLETE =====');
      console.log('🔍 [CSRF-EXECUTION] CSRF result:', csrfResult);
      
      results['csrf-test'] = csrfResult;
      
      // Return results in the format expected by the frontend
      const formattedResults = {
        tests: results
      };
      
      console.log('🔍 [CSRF-EXECUTION] Formatted results:', formattedResults);
      return formattedResults;
    } catch (error) {
      console.log('🔍 [CSRF-EXECUTION] ===== CSRF TEST FAILED =====');
      console.log('🔍 [CSRF-EXECUTION] Error:', error.message);
      
      // Create fallback result
      const fallbackResult = {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          { 
            type: 'critical', 
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
          target: this.domain,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          error: error.message,
          summary: 'CSRF test failed due to technical issues'
        }
      };
      
      results['csrf-test'] = fallbackResult;
      
      // Return results in the format expected by the frontend
      const formattedResults = {
        tests: results
      };
      
      console.log('🔍 [CSRF-EXECUTION] Formatted error results:', formattedResults);
      return formattedResults;
    }
  }

  async runDNSScan() {
    try {
      console.log('🔍 Starting comprehensive DNS analysis...');
      
      // Execute all DNS commands in a single batch with proper formatting
      const batchCommand = `echo "=== DNS Analysis for ${this.domain} ===" && echo "1. Basic DNS lookup:" && dig +short ${this.domain} A 2>/dev/null || echo "DNS lookup failed" && echo "" && echo "2. Detailed DNS records:" && dig +noall +answer ${this.domain} A 2>/dev/null || echo "A record lookup failed" && dig +noall +answer ${this.domain} MX 2>/dev/null || echo "MX record lookup failed" && dig +noall +answer ${this.domain} TXT 2>/dev/null || echo "TXT record lookup failed" && dig +noall +answer ${this.domain} NS 2>/dev/null || echo "NS record lookup failed" && dig +noall +answer ${this.domain} SOA 2>/dev/null || echo "SOA record lookup failed" && echo "" && echo "3. Reverse DNS lookup:" && IP=\\$(dig +short ${this.domain} A 2>/dev/null | head -1) && if [ ! -z "\\$IP" ]; then dig -x \\$IP +short 2>/dev/null || echo "Reverse DNS lookup failed"; else echo "No IP found for reverse lookup"; fi && echo "" && echo "4. DNS reconnaissance:" && timeout 30 dnsrecon -d ${this.domain} 2>/dev/null || echo "DNS reconnaissance timeout/failed" && echo "" && echo "5. DNS enumeration:" && timeout 30 dnsenum ${this.domain} 2>/dev/null || echo "DNS enumeration timeout/failed" && echo "" && echo "=== DNS Analysis Complete ==="`;

      console.log('🔍 Executing comprehensive DNS analysis commands...');
      const result = await this.executeKaliTool('DNS Analysis Batch', batchCommand, 'dns-resolution');
      
      console.log('🔍 [DNS-DEBUG] Raw result from executeKaliTool:', {
        stdoutLength: result.stdout ? result.stdout.length : 0,
        stderrLength: result.stderr ? result.stderr.length : 0,
        stdoutPreview: result.stdout ? result.stdout.substring(0, 200) + '...' : 'No stdout',
        stderrPreview: result.stderr ? result.stderr.substring(0, 200) + '...' : 'No stderr'
      });
      
      const results = [{
        command: 'DNS Analysis Batch',
        output: result.stdout,
        stderr: result.stderr
      }];

      // Parse results and create comprehensive report
      console.log('🔍 [DNS-DEBUG] Parsing DNS results...');
      const structuredData = this.parseDNSResults(results);
      console.log('🔍 [DNS-DEBUG] Structured data:', structuredData);
      
      // Generate comprehensive DNS report
      const dnsReport = {
        domain: this.domain,
        risk_summary: {
          overall_risk: this.calculateOverallRisk(structuredData),
          total_issues: this.countIssues(structuredData),
          critical_issues: this.countIssuesBySeverity(structuredData, 'critical'),
          high_issues: this.countIssuesBySeverity(structuredData, 'high'),
          medium_issues: this.countIssuesBySeverity(structuredData, 'medium'),
          low_issues: this.countIssuesBySeverity(structuredData, 'low'),
          summary: this.generateRiskSummary(structuredData)
        },
        records: {
          A: structuredData.records.A,
          NS: structuredData.records.NS,
          MX: structuredData.records.MX,
          SPF: structuredData.records.SPF,
          DMARC: structuredData.records.DMARC
        },
        dnssec: {
          enabled: structuredData.dnssec.enabled,
          recommendation: structuredData.dnssec.enabled 
            ? 'DNSSEC is properly configured.' 
            : 'Enable DNSSEC in Cloudflare or registrar settings to prevent DNS spoofing.'
        },
        zone_transfer: {
          allowed: structuredData.zone_transfer.allowed
        },
        subdomains: structuredData.subdomains,
        findings: this.generateFindings(structuredData),
        security_score: this.calculateSecurityScore(structuredData),
        reverse_dns: this.extractReverseDNS(structuredData),
        scan_health: this.generateScanHealth(structuredData)
      };

      const finalResult = {
        testId: 'dns-resolution',
        testName: 'DNS Resolution & Analysis',
        category: 'Infrastructure',
        severity: dnsReport.security_score.score < 50 ? 'critical' : dnsReport.security_score.score < 70 ? 'high' : dnsReport.security_score.score < 85 ? 'medium' : 'low',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: dnsReport.findings,
        recommendations: this.generateRecommendations(structuredData),
        report: dnsReport
      };
      
      console.log('🔍 [DNS-DEBUG] Final DNS result:', finalResult);
      return finalResult;
    } catch (error) {
      console.error('❌ DNS analysis failed:', error);
      return {
        testId: 'dns-resolution',
        testName: 'DNS Resolution & Analysis',
        category: 'Infrastructure',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'DNS analysis failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify DNS server settings',
          'Ensure target domain is accessible'
        ],
        report: {
          target: this.domain,
          scanType: 'DNS Resolution & Analysis',
          error: error.message,
          summary: 'DNS analysis failed due to technical issues'
        }
      };
    }
  }

  async runDirectoryEnumeration() {
    try {
      console.log('🔍 Starting directory and file enumeration...');
      
      // Execute dirb command for directory enumeration (ffuf not available)
      const dirbCommand = `dirb https://${this.domain} /usr/share/dirb/wordlists/common.txt -S -w`;
      
      console.log('🔍 Executing directory enumeration command...');
      const result = await this.executeKaliTool('Directory Enumeration', dirbCommand, 'directory-enumeration');
      
      console.log('🔍 [DIRECTORY-DEBUG] Raw result from executeKaliTool:', {
        stdoutLength: result.stdout ? result.stdout.length : 0,
        stderrLength: result.stderr ? result.stderr.length : 0,
        stdoutPreview: result.stdout ? result.stdout.substring(0, 200) + '...' : 'No stdout',
        stderrPreview: result.stderr ? result.stderr.substring(0, 200) + '...' : 'No stderr'
      });
      
      // Parse results and create comprehensive report
      console.log('🔍 [DIRECTORY-DEBUG] Parsing directory enumeration results...');
      const structuredData = this.parseDirectoryResults(result.stdout, '');
      console.log('🔍 [DIRECTORY-DEBUG] Structured data:', structuredData);
      
      // Generate comprehensive directory enumeration report
      const directoryReport = {
        domain: this.domain,
        totalFindings: structuredData.findings.length,
        accessiblePaths: structuredData.findings.filter(f => f.status === 200).length,
        forbiddenPaths: structuredData.findings.filter(f => f.status === 403).length,
        redirectPaths: structuredData.findings.filter(f => f.status >= 300 && f.status < 400).length,
        findings: structuredData.findings,
        summary: this.generateDirectorySummary(structuredData),
        scanDetails: {
          tool: 'dirb',
          wordlist: '/usr/share/dirb/wordlists/common.txt',
          options: '-S -w',
          timestamp: new Date().toISOString()
        }
      };

      const finalResult = {
        testId: 'directory-enumeration',
        testName: 'Directory and File Enumeration',
        category: 'Reconnaissance',
        severity: directoryReport.accessiblePaths > 0 ? 'medium' : 'low',
        status: 'completed',
        timestamp: new Date().toISOString(),
        findings: this.generateDirectoryFindings(structuredData),
        recommendations: this.generateDirectoryRecommendations(structuredData),
        report: directoryReport
      };
      
      console.log('🔍 [DIRECTORY-DEBUG] Final directory enumeration result:', finalResult);
      return finalResult;
    } catch (error) {
      console.error('❌ Directory enumeration failed:', error);
      return {
        testId: 'directory-enumeration',
        testName: 'Directory and File Enumeration',
        category: 'Reconnaissance',
        severity: 'medium',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'Directory enumeration failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure dirb tool is installed'
        ],
        report: {
          target: this.domain,
          scanType: 'Directory and File Enumeration',
          error: error.message,
          summary: 'Directory enumeration failed due to technical issues'
        }
      };
    }
  }

  async runXSSTest() {
    try {
      console.log('🔍 Starting XSS test...');
      
      // Import and use the new XSS scanner
      const XSSScanner = require('./xss-scanner');
      const xssScanner = new XSSScanner(`https://${this.domain}`, this.outputDir);
      
      // Set up progress callback
      xssScanner.setProgressCallback((progress) => {
        if (this.progressCallback) {
          this.progressCallback(progress);
        }
      });
      
      // Run the scan
      const result = await xssScanner.runScan();
      
      console.log('🔍 [XSS-DEBUG] XSS test completed with new scanner');
      return result.tests['xss-scan'];
    } catch (error) {
      console.error('❌ XSS test failed:', error);
      return {
        testId: 'xss-test',
        testName: 'Cross-Site Scripting (XSS) Testing',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'XSS test failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure dalfox tool is installed'
        ],
        report: {
          target: this.domain,
          scanType: 'Cross-Site Scripting (XSS) Testing',
          error: error.message,
          summary: 'XSS test failed due to technical issues'
        }
      };
    }
  }

  async runCSRFTest() {
    try {
      console.log('🔍 Starting CSRF test...');
      
      // Import and use the new CSRF scanner
      const CSRFScanner = require('./csrf-scanner');
      const csrfScanner = new CSRFScanner(`https://${this.domain}`, this.outputDir);
      
      // Set up progress callback
      csrfScanner.setProgressCallback((progress) => {
        if (this.progressCallback) {
          this.progressCallback(progress);
        }
      });
      
      // Run the scan
      const result = await csrfScanner.runScan();
      
      console.log('🔍 [CSRF-DEBUG] CSRF test completed with new scanner');
      return result.tests['csrf-test'];
    } catch (error) {
      console.error('❌ CSRF test failed:', error);
      return {
        testId: 'csrf-test',
        testName: 'Cross-Site Request Forgery (CSRF) Testing',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
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
          target: this.domain,
          scanType: 'Cross-Site Request Forgery (CSRF) Testing',
          error: error.message,
          summary: 'CSRF test failed due to technical issues'
        }
      };
    }
  }

  async runSQLInjectionTest() {
    try {
      console.log('🔍 Starting SQL injection test...');
      
      // Import and use the new SQL injection scanner
      const SQLInjectionScanner = require('./sql-injection-scanner');
      const sqlScanner = new SQLInjectionScanner(`https://${this.domain}`, this.outputDir);
      
      // Set up progress callback
      sqlScanner.setProgressCallback((progress) => {
        if (this.progressCallback) {
          this.progressCallback(progress);
        }
      });
      
      // Run the scan
      const result = await sqlScanner.runScan();
      
      console.log('🔍 [SQL-DEBUG] SQL injection test completed with new scanner');
      return result.tests['sql-injection-scan'];
    } catch (error) {
      console.error('❌ SQL injection test failed:', error);
      return {
        testId: 'sql-injection-test',
        testName: 'SQL Injection Test',
        category: 'Web Security',
        severity: 'high',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: error.message,
        findings: [
          {
            type: 'critical',
            message: 'SQL injection test failed',
            details: error.message
          }
        ],
        recommendations: [
          'Check network connectivity',
          'Verify target URL accessibility',
          'Ensure sqlmap tool is installed'
        ],
        report: {
          target: this.domain,
          scanType: 'SQL Injection Test',
          error: error.message,
          summary: 'SQL injection test failed due to technical issues'
        }
      };
    }
  }

  parseSQLResults(stdout, stderr) {
    const findings = [];
    
    // Parse sqlmap output format
    if (stdout) {
      const lines = stdout.split('\n');
      let currentParameter = null;
      let currentUrl = null;
      let isVulnerable = false;
      let dbms = null;
      let databases = [];
      let tables = [];
      let columns = [];
      let extractedData = [];
      
      lines.forEach(line => {
        // Check for parameter being tested
        const paramMatch = line.match(/testing parameter '([^']+)'/);
        if (paramMatch) {
          currentParameter = paramMatch[1];
          currentUrl = `https://${this.domain}`;
        }
        
        // Check for vulnerability detection
        if (line.includes('is vulnerable') || line.includes('injection found')) {
          isVulnerable = true;
        }
        
        // Check for database type
        const dbmsMatch = line.match(/back-end DBMS: ([^,]+)/);
        if (dbmsMatch) {
          dbms = dbmsMatch[1].trim();
        }
        
        // Check for databases
        const dbMatch = line.match(/available databases \[(\d+)\]:/);
        if (dbMatch) {
          // Look for database names in subsequent lines
          const dbListMatch = line.match(/\[(\d+)\]: (.+)/);
          if (dbListMatch) {
            databases.push(dbListMatch[2].trim());
          }
        }
        
        // Check for tables
        const tableMatch = line.match(/Database: ([^,]+).*Table: ([^,]+)/);
        if (tableMatch) {
          tables.push(tableMatch[2].trim());
        }
        
        // Check for columns
        const columnMatch = line.match(/Table: ([^,]+).*Column: ([^,]+)/);
        if (columnMatch) {
          columns.push(columnMatch[2].trim());
        }
        
        // Check for extracted data
        if (line.includes('extracted:') || line.includes('dumped:')) {
          extractedData.push(line.trim());
        }
        
        // If we have a complete parameter test, add it to findings
        if (currentParameter && line.includes('testing completed')) {
          findings.push({
            url: currentUrl,
            parameter: currentParameter,
            vulnerable: isVulnerable,
            dbms: dbms,
            dbs: [...new Set(databases)],
            tables: [...new Set(tables)],
            columns: [...new Set(columns)],
            extracted_data: extractedData,
            description: this.getSQLDescription(isVulnerable, dbms, databases.length)
          });
          
          // Reset for next parameter
          currentParameter = null;
          currentUrl = null;
          isVulnerable = false;
          dbms = null;
          databases = [];
          tables = [];
          columns = [];
          extractedData = [];
        }
      });
      
      // If no specific parameters were found, create a general result
      if (findings.length === 0) {
        const hasVulnerability = stdout.includes('is vulnerable') || stdout.includes('injection found');
        const detectedDbms = stdout.match(/back-end DBMS: ([^,]+)/)?.[1]?.trim();
        
        findings.push({
          url: `https://${this.domain}`,
          parameter: 'general',
          vulnerable: hasVulnerability,
          dbms: detectedDbms || null,
          dbs: [],
          tables: [],
          columns: [],
          extracted_data: [],
          description: this.getSQLDescription(hasVulnerability, detectedDbms, 0)
        });
      }
    }
    
    return { findings };
  }

  getSQLDescription(vulnerable, dbms, dbCount) {
    if (vulnerable) {
      let desc = 'Vulnerable to SQL injection';
      if (dbms) {
        desc += ` (${dbms} database detected)`;
      }
      if (dbCount > 0) {
        desc += ` - ${dbCount} database(s) accessible`;
      }
      return desc;
    } else {
      return 'No vulnerable parameters found';
    }
  }

  generateSQLSummary(structuredData) {
    const total = structuredData.findings.length;
    const vulnerable = structuredData.findings.filter(f => f.vulnerable).length;
    const safe = structuredData.findings.filter(f => !f.vulnerable).length;
    
    if (vulnerable > 0) {
      return `SQL injection test discovered ${vulnerable} vulnerable parameter(s) out of ${total} tested. Immediate remediation required.`;
    } else {
      return `SQL injection test completed successfully. No vulnerable parameters found in ${total} tested parameter(s).`;
    }
  }

  generateSQLFindings(structuredData) {
    const findings = [];
    
    // Critical findings for vulnerable parameters
    const vulnerableParams = structuredData.findings.filter(f => f.vulnerable);
    
    if (vulnerableParams.length > 0) {
      findings.push({
        type: 'critical',
        message: 'SQL injection vulnerabilities detected',
        details: `Found ${vulnerableParams.length} vulnerable parameter(s): ${vulnerableParams.map(f => f.parameter).join(', ')}`
      });
      
      // Add specific findings for each vulnerable parameter
      vulnerableParams.forEach(param => {
        findings.push({
          type: 'critical',
          message: `Parameter '${param.parameter}' is vulnerable`,
          details: `URL: ${param.url}, Database: ${param.dbms || 'Unknown'}, Description: ${param.description}`
        });
      });
    }
    
    // High findings for database access
    const dbAccess = structuredData.findings.filter(f => f.dbs && f.dbs.length > 0);
    if (dbAccess.length > 0) {
      findings.push({
        type: 'high',
        message: 'Database access achieved',
        details: `Successfully accessed ${dbAccess.length} database(s) through SQL injection`
      });
    }
    
    // Medium findings for general test completion
    if (structuredData.findings.length > 0) {
      findings.push({
        type: 'medium',
        message: 'SQL injection test completed',
        details: `Tested ${structuredData.findings.length} parameter(s) for SQL injection vulnerabilities`
      });
    }
    
    return findings;
  }

  generateSQLRecommendations(structuredData) {
    const recommendations = [];
    
    const vulnerableParams = structuredData.findings.filter(f => f.vulnerable);
    
    if (vulnerableParams.length > 0) {
      recommendations.push('Immediately patch all vulnerable parameters');
      recommendations.push('Implement parameterized queries (prepared statements)');
      recommendations.push('Use input validation and sanitization');
      recommendations.push('Implement Web Application Firewall (WAF)');
      recommendations.push('Conduct code review for SQL injection vulnerabilities');
    }
    
    recommendations.push('Regularly test for SQL injection vulnerabilities');
    recommendations.push('Implement least privilege database access');
    recommendations.push('Monitor database access logs');
    recommendations.push('Keep database software updated');
    
    return recommendations;
  }

  parseDirectoryResults(stdout, jsonOutput) {
    const findings = [];
    
    // Parse dirb output format
    if (stdout) {
      const lines = stdout.split('\n');
      lines.forEach(line => {
        // Parse dirb output format: + https://domain.com/path (CODE:200|SIZE:1234)
        const match = line.match(/\+ https?:\/\/[^\/]+\/([^\s]+) \(CODE:(\d+)\|SIZE:(\d+)\)/);
        if (match) {
          const path = '/' + match[1];
          const status = parseInt(match[2]);
          const size = parseInt(match[3]);
          
          findings.push({
            path: path,
            status: status,
            size: size,
            description: this.getDirectoryDescription(status, path)
          });
        }
        
        // Also parse lines that just show the path without full URL
        const simpleMatch = line.match(/\+ \/([^\s]+) \(CODE:(\d+)\|SIZE:(\d+)\)/);
        if (simpleMatch) {
          const path = '/' + simpleMatch[1];
          const status = parseInt(simpleMatch[2]);
          const size = parseInt(simpleMatch[3]);
          
          findings.push({
            path: path,
            status: status,
            size: size,
            description: this.getDirectoryDescription(status, path)
          });
        }
      });
    }
    
    return { findings };
  }

  getDirectoryDescription(status, path) {
    const pathLower = path.toLowerCase();
    
    if (status === 200) {
      if (pathLower.includes('admin')) return 'Admin panel - publicly accessible';
      if (pathLower.includes('login')) return 'Login page - publicly accessible';
      if (pathLower.includes('config')) return 'Configuration file - publicly accessible';
      if (pathLower.includes('backup')) return 'Backup file - publicly accessible';
      if (pathLower.includes('test')) return 'Test page - publicly accessible';
      if (pathLower.includes('dev')) return 'Development page - publicly accessible';
      return 'Publicly accessible resource';
    } else if (status === 403) {
      if (pathLower.includes('admin')) return 'Admin panel - access forbidden';
      if (pathLower.includes('config')) return 'Configuration file - access forbidden';
      if (pathLower.includes('backup')) return 'Backup file - access forbidden';
      if (pathLower.includes('.htaccess')) return 'Apache configuration file - access forbidden';
      if (pathLower.includes('.env')) return 'Environment file - access forbidden';
      return 'Resource exists but access is forbidden';
    } else if (status >= 300 && status < 400) {
      return 'Resource redirects to another location';
    } else if (status === 404) {
      return 'Resource not found';
    } else {
      return `HTTP ${status} response`;
    }
  }

  generateDirectorySummary(structuredData) {
    const total = structuredData.findings.length;
    const accessible = structuredData.findings.filter(f => f.status === 200).length;
    const forbidden = structuredData.findings.filter(f => f.status === 403).length;
    const redirects = structuredData.findings.filter(f => f.status >= 300 && f.status < 400).length;
    
    return `Directory enumeration discovered ${total} paths. ${accessible} are publicly accessible, ${forbidden} are forbidden, and ${redirects} redirect to other locations.`;
  }

  generateDirectoryFindings(structuredData) {
    const findings = [];
    
    // Critical findings for accessible sensitive paths
    const accessibleSensitive = structuredData.findings.filter(f => 
      f.status === 200 && (
        f.path.toLowerCase().includes('admin') ||
        f.path.toLowerCase().includes('config') ||
        f.path.toLowerCase().includes('backup') ||
        f.path.toLowerCase().includes('test') ||
        f.path.toLowerCase().includes('dev')
      )
    );
    
    if (accessibleSensitive.length > 0) {
      findings.push({
        type: 'critical',
        message: 'Sensitive directories are publicly accessible',
        details: `Found ${accessibleSensitive.length} sensitive paths that are publicly accessible: ${accessibleSensitive.map(f => f.path).join(', ')}`
      });
    }
    
    // High findings for forbidden sensitive paths
    const forbiddenSensitive = structuredData.findings.filter(f => 
      f.status === 403 && (
        f.path.toLowerCase().includes('admin') ||
        f.path.toLowerCase().includes('config') ||
        f.path.toLowerCase().includes('backup') ||
        f.path.toLowerCase().includes('.htaccess') ||
        f.path.toLowerCase().includes('.env')
      )
    );
    
    if (forbiddenSensitive.length > 0) {
      findings.push({
        type: 'high',
        message: 'Sensitive directories exist but are protected',
        details: `Found ${forbiddenSensitive.length} sensitive paths that exist but are protected: ${forbiddenSensitive.map(f => f.path).join(', ')}`
      });
    }
    
    // Medium findings for general enumeration results
    if (structuredData.findings.length > 0) {
      findings.push({
        type: 'medium',
        message: 'Directory enumeration completed',
        details: `Discovered ${structuredData.findings.length} total paths during enumeration`
      });
    }
    
    return findings;
  }

  generateDirectoryRecommendations(structuredData) {
    const recommendations = [];
    
    const accessibleSensitive = structuredData.findings.filter(f => 
      f.status === 200 && (
        f.path.toLowerCase().includes('admin') ||
        f.path.toLowerCase().includes('config') ||
        f.path.toLowerCase().includes('backup')
      )
    );
    
    if (accessibleSensitive.length > 0) {
      recommendations.push('Secure or remove publicly accessible sensitive directories');
      recommendations.push('Implement proper access controls for admin panels');
      recommendations.push('Remove or secure configuration and backup files');
    }
    
    recommendations.push('Review all discovered paths for security implications');
    recommendations.push('Implement proper directory listing restrictions');
    recommendations.push('Use robots.txt to control crawler access');
    recommendations.push('Regularly audit web application directory structure');
    
    return recommendations;
  }

  parseDNSResults(results) {
    const structuredData = {
      records: {
        A: [],
        NS: [],
        MX: [],
        SPF: [],
        DMARC: [],
        SOA: []
      },
      dnssec: {
        enabled: false
      },
      zone_transfer: {
        allowed: false
      },
      subdomains: [],
      reverse_dns: {
        available: false,
        hostname: null
      },
      rawOutput: results
    };

    // Parse the batch output from the single command
    if (results.length > 0) {
      const output = results[0].output || '';
      this.parseBatchDNSOutput(output, structuredData);
    }

    return structuredData;
  }

  parseBatchDNSOutput(output, structuredData) {
    const lines = output.split('\n');
    let currentSection = '';
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      // Identify sections
      if (trimmedLine.includes('1. Basic DNS lookup:')) {
        currentSection = 'basic';
        return;
      } else if (trimmedLine.includes('2. Detailed DNS records:')) {
        currentSection = 'detailed';
        return;
      } else if (trimmedLine.includes('3. Reverse DNS lookup:')) {
        currentSection = 'reverse';
        return;
      } else if (trimmedLine.includes('4. DNS reconnaissance:')) {
        currentSection = 'recon';
        return;
      } else if (trimmedLine.includes('5. DNS enumeration:')) {
        currentSection = 'enum';
        return;
      }
      
      // Parse based on current section
      switch (currentSection) {
        case 'basic':
          this.parseBasicDNS(trimmedLine, structuredData);
          break;
        case 'detailed':
          this.parseDetailedDNS(trimmedLine, structuredData);
          break;
        case 'reverse':
          this.parseReverseDNS(trimmedLine, structuredData);
          break;
        case 'recon':
          this.parseDnsreconOutput(trimmedLine, structuredData);
          break;
        case 'enum':
          this.parseDnsenumOutput(trimmedLine, structuredData);
          break;
      }
    });
  }

  parseBasicDNS(line, structuredData) {
    // Parse ANY record output
    if (line && !line.startsWith(';;') && !line.includes('communications error')) {
      // Extract IP addresses
      const ipMatch = line.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
      if (ipMatch && !structuredData.records.A.includes(ipMatch[1])) {
        structuredData.records.A.push(ipMatch[1]);
      }
    }
  }

  parseDetailedDNS(line, structuredData) {
    if (!line || line.startsWith(';;') || line.includes('lookup failed')) return;
    
    // Parse A records
    if (line.includes('\tIN\tA\t')) {
      const parts = line.split('\t');
      const ip = parts[parts.length - 1];
      if (ip && !structuredData.records.A.includes(ip)) {
        structuredData.records.A.push(ip);
      }
    }
    // Parse MX records
    else if (line.includes('\tIN\tMX\t')) {
      const parts = line.split('\t');
      const mx = parts[parts.length - 1];
      if (mx && !structuredData.records.MX.includes(mx)) {
        structuredData.records.MX.push(mx);
      }
    }
    // Parse TXT records
    else if (line.includes('\tIN\tTXT\t')) {
      const txtMatch = line.match(/"([^"]+)"/);
      if (txtMatch) {
        const txt = txtMatch[1];
        if (txt.includes('v=spf1') && !structuredData.records.SPF.includes(txt)) {
          structuredData.records.SPF.push(txt);
        } else if (txt.includes('v=DMARC1') && !structuredData.records.DMARC.includes(txt)) {
          structuredData.records.DMARC.push(txt);
        }
      }
    }
    // Parse NS records
    else if (line.includes('\tIN\tNS\t')) {
      const parts = line.split('\t');
      const ns = parts[parts.length - 1];
      if (ns && !structuredData.records.NS.includes(ns)) {
        structuredData.records.NS.push(ns);
      }
    }
    // Parse SOA records
    else if (line.includes('\tIN\tSOA\t')) {
      const parts = line.split('\t');
      const soa = parts.slice(4).join(' '); // SOA has multiple parts
      if (soa && !structuredData.records.SOA.includes(soa)) {
        structuredData.records.SOA.push(soa);
      }
    }
  }

  parseReverseDNS(line, structuredData) {
    if (line && !line.includes('lookup failed') && !line.includes('No IP found')) {
      // Extract hostname from reverse DNS result
      const hostnameMatch = line.match(/([a-zA-Z0-9.-]+\.?)$/);
      if (hostnameMatch) {
        structuredData.reverse_dns = {
          available: true,
          hostname: hostnameMatch[1]
        };
      }
    }
  }

  parseDnsreconOutput(line, structuredData) {
    if (line && !line.includes('timeout/failed')) {
      if (line.includes('DNSSEC is not configured')) {
        structuredData.dnssec.enabled = false;
      } else if (line.includes('DNSSEC is configured')) {
        structuredData.dnssec.enabled = true;
      } else if (line.includes('AXFR record query failed')) {
        structuredData.zone_transfer.allowed = false;
      } else if (line.includes('AXFR record query succeeded')) {
        structuredData.zone_transfer.allowed = true;
      }
    }
  }

  parseDnsenumOutput(line, structuredData) {
    if (line && !line.includes('timeout/failed')) {
      if (line.includes('AXFR record query failed')) {
        structuredData.zone_transfer.allowed = false;
      } else if (line.includes('AXFR record query succeeded')) {
        structuredData.zone_transfer.allowed = true;
      }
    }
  }

  calculateOverallRisk(structuredData) {
    const issues = this.countIssues(structuredData);
    if (issues === 0) return 'Low';
    if (issues <= 2) return 'Medium';
    if (issues <= 5) return 'High';
    return 'Critical';
  }

  countIssues(structuredData) {
    let count = 0;
    if (!structuredData.dnssec.enabled) count++;
    if (structuredData.records.DMARC.length === 0) count++;
    if (structuredData.records.SPF.length === 0) count++;
    if (structuredData.records.SPF.length > 1) count++;
    if (structuredData.zone_transfer.allowed) count++;
    return count;
  }

  countIssuesBySeverity(structuredData, severity) {
    const findings = this.generateFindings(structuredData);
    return findings.filter(f => f.severity === severity).length;
  }

  generateRiskSummary(structuredData) {
    const issues = this.countIssues(structuredData);
    if (issues === 0) {
      return 'Your DNS configuration is excellent with all security measures in place.';
    } else if (issues <= 2) {
      return 'Your DNS configuration is mostly stable, but DNSSEC and DMARC settings could be improved.';
    } else if (issues <= 5) {
      return 'Your DNS configuration has several security issues that need attention.';
    } else {
      return 'Your DNS configuration has critical security issues requiring immediate action.';
    }
  }

  generateFindings(structuredData) {
    const findings = [];

    // DNSSEC check
    if (!structuredData.dnssec.enabled) {
      findings.push({
        issue: 'DNSSEC not configured',
        severity: 'Medium',
        explanation: 'DNSSEC protects against DNS spoofing by verifying DNS record integrity.',
        recommendation: 'Enable DNSSEC to secure your DNS infrastructure.'
      });
    }

    // DMARC check
    if (structuredData.records.DMARC.length === 0) {
      findings.push({
        issue: 'DMARC record missing',
        severity: 'Medium',
        explanation: 'DMARC helps prevent email spoofing and phishing attacks.',
        recommendation: 'Add a DMARC record to protect against email spoofing.'
      });
    } else {
      const dmarcRecord = structuredData.records.DMARC[0];
      if (dmarcRecord && dmarcRecord.includes('p=none')) {
        findings.push({
          issue: 'DMARC policy set to \'none\'',
          severity: 'Medium',
          explanation: 'The DMARC policy \'none\' does not protect against email spoofing.',
          recommendation: 'Change the DMARC policy to \'quarantine\' or \'reject\'.'
        });
      }
    }

    // SPF check
    if (structuredData.records.SPF.length === 0) {
      findings.push({
        issue: 'SPF record missing',
        severity: 'Medium',
        explanation: 'SPF helps prevent email spoofing by specifying authorized mail servers.',
        recommendation: 'Add an SPF record to prevent email spoofing.'
      });
    } else if (structuredData.records.SPF.length > 1) {
      findings.push({
        issue: 'Duplicate SPF records',
        severity: 'Medium',
        explanation: 'Multiple SPF records cause mail delivery issues and authentication failures.',
        recommendation: 'Merge all SPF records into a single entry.'
      });
    }

    // Zone transfer check
    if (structuredData.zone_transfer.allowed) {
      findings.push({
        issue: 'Zone transfer allowed',
        severity: 'High',
        explanation: 'Zone transfer allows attackers to enumerate all DNS records.',
        recommendation: 'Disable zone transfer to prevent DNS enumeration attacks.'
      });
    }

    return findings;
  }

  generateRecommendations(structuredData) {
    const recommendations = [];

    if (!structuredData.dnssec.enabled) {
      recommendations.push('Enable DNSSEC in Cloudflare or registrar settings to prevent DNS spoofing.');
    }

    if (structuredData.records.DMARC.length === 0) {
      recommendations.push('Add a DMARC record to protect against email spoofing.');
    } else {
      const dmarcRecord = structuredData.records.DMARC[0];
      if (dmarcRecord && dmarcRecord.includes('p=none')) {
        recommendations.push('Change the DMARC policy to \'quarantine\' or \'reject\'.');
      }
    }

    if (structuredData.records.SPF.length === 0) {
      recommendations.push('Add an SPF record to prevent email spoofing.');
    } else if (structuredData.records.SPF.length > 1) {
      recommendations.push('Merge all SPF records into a single entry.');
    }

    if (structuredData.zone_transfer.allowed) {
      recommendations.push('Disable zone transfer to prevent DNS enumeration attacks.');
    }

    return recommendations;
  }

  calculateSecurityScore(structuredData) {
    let score = 100;

    // DNSSEC (10 points deduction)
    if (!structuredData.dnssec.enabled) {
      score -= 10;
    }

    // DMARC policy "none" (10 points deduction)
    if (structuredData.records.DMARC.length > 0) {
      const dmarcRecord = structuredData.records.DMARC[0];
      if (dmarcRecord && dmarcRecord.includes('p=none')) {
        score -= 10;
      }
    } else {
      // No DMARC record at all
      score -= 10;
    }

    // Duplicate SPF records (10 points deduction)
    if (structuredData.records.SPF.length > 1) {
      score -= 10;
    } else if (structuredData.records.SPF.length === 0) {
      // No SPF record at all
      score -= 10;
    }

    // Zone Transfer (10 points deduction)
    if (structuredData.zone_transfer.allowed) {
      score -= 10;
    }

    // Ensure score doesn't go below 0
    score = Math.max(0, score);

    // Improved grading system as per user specifications
    let grade = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 65) grade = 'C';
    else if (score >= 50) grade = 'D';

    let description = 'Excellent DNS security configuration.';
    if (score >= 80) description = 'Good configuration overall, but important protections like DNSSEC are missing.';
    else if (score >= 65) description = 'Moderate security configuration with several areas for improvement.';
    else if (score >= 50) description = 'Poor security configuration requiring immediate attention.';
    else description = 'Critical security issues detected - immediate action required.';

    return {
      score: score,
      grade: grade,
      description: description
    };
  }

  extractReverseDNS(structuredData) {
    // This method should extract reverse DNS information from the scan results
    // For now, return a placeholder
    return {
      available: false,
      note: 'Reverse DNS lookup failed or timed out.'
    };
  }

  generateScanHealth(structuredData) {
    // This method should generate scan health information
    // For now, return a placeholder
    return {
      status: 'Partial',
      notes: [
        'Some DNS servers did not respond (10.255.255.254)',
        'Fallback tools (dnsrecon, dnsenum) were used to collect partial data.'
      ]
    };
  }

  // Check if WSL is available
  async checkWslAvailability() {
    try {
      await this.runWslCommand('echo "WSL is available"');
      return true;
    } catch (error) {
      this.log('WSL is not available, using fallback mode', 'system');
      return false;
    }
  }

  async runAllTests() {
    this.log('Starting XSS test Kali security scan...', 'system');
    this.log(`Target: ${this.domain}`, 'system');
    this.log('Domain: ' + this.domain, 'system');
    this.log('NOTE: Only XSS test is enabled - other tests are temporarily disabled', 'system');

    try {
      // Check WSL availability
      this.wslAvailable = await this.checkWslAvailability();
      
      if (this.wslAvailable) {
        this.log('WSL available, executing Kali tools directly...', 'system');
      } else {
        this.log('WSL not available, using fallback mode...', 'system');
      }

      // Execute XSS test
      this.log('🔧 Executing XSS Test...', 'xss-test');
      const results = await this.executeAllTests();
      
      this.log('XSS test security analysis completed!', 'system');
      
      // Call complete callback if set
      if (this.completeCallback) {
        this.completeCallback(results);
      }
      
      return results;
    } catch (error) {
      this.log(`XSS test failed: ${error.message}`, 'system');
      
      // Call complete callback with error if set
      if (this.completeCallback) {
        this.completeCallback(null, error);
      }
      
      throw error;
    }
  }
}

module.exports = KaliSecurityScanner;