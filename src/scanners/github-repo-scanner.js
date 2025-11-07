const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { runWSLRaw, runWSLAsRoot, runWSL } = require('../utils/wslHelper');

/**
 * GitHub Repository Scanner
 * Clones repositories and scans them with OWASP ZAP, sqlmap, Nikto, and w3af
 */
class GitHubRepoScanner {
  constructor(repoUrl, repoName, accessToken, outputDir = './temp-github-scans') {
    this.repoUrl = repoUrl;
    this.repoName = repoName;
    this.accessToken = accessToken;
    this.outputDir = outputDir;
    this.repoDir = null;
    this.progressCallback = null;
    this.scanResults = {
      zap: null,
      sqlmap: null,
      nikto: null,
      w3af: null,
      summary: {
        total_vulnerabilities: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0
      }
    };
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  log(message, progress = 0, command = null, type = 'info', tool = null, output = null) {
    const logMessage = command ? `${message}\n\n📝 Command: ${command}` : message;
    
    console.log(`\n[GitHub-Repo-Scanner] ${message}`);
    if (command) {
      console.log(`\n[GitHub-Repo-Scanner] ========== COMMAND ==========`);
      console.log(`[GitHub-Repo-Scanner] ${command}`);
      console.log(`[GitHub-Repo-Scanner] =============================\n`);
    }
    if (output) {
      console.log(`[GitHub-Repo-Scanner] Output:\n${output}`);
    }
    
    if (this.progressCallback) {
      this.progressCallback({
        progress,
        message: logMessage,
        command: command,
        type: type,
        tool: tool,
        output: output
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

  /**
   * Clone repository to temporary directory in WSL
   */
  async cloneRepository() {
    this.log(`📥 Cloning repository: ${this.repoName}...`, 5);
    
    // Create temporary directory in WSL
    const tempDir = `/tmp/github-scan-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.repoDir = tempDir;
    
    // Clone with authentication
    const cloneUrl = this.repoUrl.replace('https://', `https://${this.accessToken}@`);
    const cloneCommand = `bash -c "mkdir -p ${tempDir} && cd ${tempDir} && git clone ${cloneUrl} . 2>&1"`;
    
    this.log(`🔧 Cloning repository...`, 10, `git clone ${this.repoUrl}`);
    
    const result = await runWSLRaw(cloneCommand);
    
    if (!result.success) {
      throw new Error(`Failed to clone repository: ${result.stderr || result.error}`);
    }
    
    this.log(`✅ Repository cloned successfully to ${tempDir}`, 15);
    return tempDir;
  }

  /**
   * Find API endpoints in the repository
   */
  async findAPIEndpoints() {
    this.log(`🔍 Searching for API endpoints in repository...`, 20);
    
    const findCommand = `bash -c "cd ${this.repoDir} && find . -type f \\( -name '*.js' -o -name '*.ts' -o -name '*.py' -o -name '*.java' -o -name '*.go' -o -name '*.php' -o -name '*.rb' \\) -exec grep -lE '(app\\.(get|post|put|delete|patch)|router\\.(get|post|put|delete|patch)|@(GET|POST|PUT|DELETE|PATCH)|api|endpoint|route)' {} \\; 2>/dev/null | head -20"`;
    
    this.log(`🔧 Finding API endpoints...`, 25, `find . -type f -name '*.js' -exec grep -lE 'app\\.(get|post|put|delete)' {} \\;`);
    
    const result = await runWSLRaw(findCommand);
    
    if (result.success && result.stdout) {
      const files = result.stdout.trim().split('\n').filter(f => f);
      this.log(`✅ Found ${files.length} potential API files`, 30);
      return files;
    }
    
    return [];
  }

  /**
   * Extract base URL from repository files
   */
  async extractBaseURL() {
    this.log(`🔍 Extracting base URL from repository...`, 35);
    
    const urlCommand = `bash -c "cd ${this.repoDir} && grep -rE '(https?://[^\\s\"']+|localhost:[0-9]+|127\\.0\\.0\\.1:[0-9]+)' --include='*.js' --include='*.ts' --include='*.py' --include='*.json' --include='*.env*' --include='*.config.*' 2>/dev/null | head -5 | grep -oE '(https?://[^\\s\"']+|localhost:[0-9]+|127\\.0\\.0\\.1:[0-9]+)' | head -1"`;
    
    const result = await runWSLRaw(urlCommand);
    
    if (result.success && result.stdout) {
      const url = result.stdout.trim();
      if (url) {
        this.log(`✅ Found base URL: ${url}`, 40);
        return url;
      }
    }
    
    // Default to localhost if no URL found
    this.log(`⚠️ No base URL found, using localhost:3000`, 40);
    return 'http://localhost:3000';
  }

  /**
   * Run OWASP ZAP scan
   */
  async runZAPScan(targetUrl) {
    this.log(`🛡️ Starting OWASP ZAP scan on ${targetUrl}...`, 45);
    
    const zapOutputFile = `${this.repoDir}/zap-results.json`;
    const zapCommand = `bash -c "cd ${this.repoDir} && zap-baseline.py -t ${targetUrl} -J -j -r zap-report.html -I 2>&1 || echo 'ZAP scan completed with warnings'"`;
    
    this.log(`🔧 Running OWASP ZAP...`, 50, `zap-baseline.py -t ${targetUrl} -J -j`);
    
    const result = await runWSLRaw(zapCommand);
    
    // Log output to console
    if (result.stdout) {
      this.log(`📊 ZAP Output:`, 55, null, 'info', 'ZAP', result.stdout.substring(0, 5000)); // Limit output to 5000 chars
    }
    if (result.stderr) {
      this.log(`⚠️ ZAP Errors:`, 56, null, 'warning', 'ZAP', result.stderr.substring(0, 2000));
    }
    
    // Try to parse ZAP results
    let zapResults = null;
    try {
      const zapJsonFile = `${this.repoDir}/zap-results.json`;
      const zapJsonCommand = `bash -c "cat ${zapJsonFile} 2>/dev/null || echo '{}'"`;
      const zapJsonResult = await runWSLRaw(zapJsonCommand);
      
      if (zapJsonResult.success && zapJsonResult.stdout) {
        zapResults = JSON.parse(zapJsonResult.stdout);
      }
    } catch (error) {
      console.error('Failed to parse ZAP JSON results:', error);
    }
    
    // Parse ZAP output for vulnerabilities
    const vulnerabilities = [];
    if (result.stdout) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes('PASS') || line.includes('WARN') || line.includes('FAIL')) {
          const match = line.match(/(PASS|WARN|FAIL):\s*(.+)/);
          if (match) {
            const severity = match[1] === 'FAIL' ? 'high' : match[1] === 'WARN' ? 'medium' : 'low';
            vulnerabilities.push({
              tool: 'ZAP',
              severity: severity,
              finding: match[2].trim(),
              url: targetUrl
            });
          }
        }
      }
    }
    
    this.scanResults.zap = {
      success: result.success,
      output: result.stdout,
      errors: result.stderr,
      vulnerabilities: vulnerabilities,
      parsedResults: zapResults
    };
    
    this.log(`✅ OWASP ZAP scan completed. Found ${vulnerabilities.length} issues`, 60);
    return this.scanResults.zap;
  }

  /**
   * Run sqlmap scan
   */
  async runSQLMapScan(targetUrl) {
    this.log(`🗄️ Starting sqlmap scan on ${targetUrl}...`, 65);
    
    const sqlmapOutputFile = `${this.repoDir}/sqlmap-results.json`;
    const sqlmapCommand = `bash -c "cd ${this.repoDir} && sqlmap -u '${targetUrl}' --batch --crawl=2 --level=2 --risk=2 --output-dir=. --dump-all --forms --batch --answers='quit=Y' 2>&1 | head -100"`;
    
    this.log(`🔧 Running sqlmap...`, 70, `sqlmap -u '${targetUrl}' --batch --crawl=2`);
    
    const result = await runWSLRaw(sqlmapCommand);
    
    // Log output to console
    if (result.stdout) {
      this.log(`📊 sqlmap Output:`, 70, null, 'info', 'sqlmap', result.stdout.substring(0, 5000));
    }
    if (result.stderr) {
      this.log(`⚠️ sqlmap Errors:`, 71, null, 'warning', 'sqlmap', result.stderr.substring(0, 2000));
    }
    
    // Parse sqlmap output for vulnerabilities
    const vulnerabilities = [];
    if (result.stdout) {
      const lines = result.stdout.split('\n');
      let currentVuln = null;
      
      for (const line of lines) {
        if (line.includes('sqlmap identified the following injection point')) {
          currentVuln = { tool: 'sqlmap', severity: 'high', finding: 'SQL Injection detected', details: [] };
        } else if (line.includes('Parameter:') && currentVuln) {
          currentVuln.details.push(line.trim());
        } else if (line.includes('Type:') && currentVuln) {
          currentVuln.details.push(line.trim());
          vulnerabilities.push(currentVuln);
          currentVuln = null;
        }
      }
    }
    
    this.scanResults.sqlmap = {
      success: result.success,
      output: result.stdout,
      errors: result.stderr,
      vulnerabilities: vulnerabilities
    };
    
    this.log(`✅ sqlmap scan completed. Found ${vulnerabilities.length} SQL injection issues`, 75);
    return this.scanResults.sqlmap;
  }

  /**
   * Run Nikto scan
   */
  async runNiktoScan(targetUrl) {
    this.log(`🔍 Starting Nikto scan on ${targetUrl}...`, 80);
    
    const niktoOutputFile = `${this.repoDir}/nikto-results.txt`;
    const niktoCommand = `bash -c "cd ${this.repoDir} && nikto -h ${targetUrl} -Format txt -output ${niktoOutputFile} 2>&1 || cat ${niktoOutputFile} 2>/dev/null || echo 'Nikto scan completed'"`;
    
    this.log(`🔧 Running Nikto...`, 85, `nikto -h ${targetUrl} -Format txt`);
    
    const result = await runWSLRaw(niktoCommand);
    
    // Log output to console
    if (result.stdout) {
      this.log(`📊 Nikto Output:`, 85, null, 'info', 'Nikto', result.stdout.substring(0, 5000));
    }
    if (result.stderr) {
      this.log(`⚠️ Nikto Errors:`, 86, null, 'warning', 'Nikto', result.stderr.substring(0, 2000));
    }
    
    // Parse Nikto output for vulnerabilities
    const vulnerabilities = [];
    if (result.stdout) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes('+') && (line.includes('OSVDB') || line.includes('may be vulnerable') || line.includes('potentially dangerous'))) {
          const severity = line.includes('potentially dangerous') ? 'high' : 
                          line.includes('may be vulnerable') ? 'medium' : 'low';
          vulnerabilities.push({
            tool: 'Nikto',
            severity: severity,
            finding: line.replace(/^\+\s*/, '').trim(),
            url: targetUrl
          });
        }
      }
    }
    
    // Also read from output file if available
    try {
      const readFileCommand = `bash -c "cat ${niktoOutputFile} 2>/dev/null || echo ''"`;
      const fileResult = await runWSLRaw(readFileCommand);
      if (fileResult.success && fileResult.stdout) {
        const fileLines = fileResult.stdout.split('\n');
        for (const line of fileLines) {
          if (line.includes('+') && (line.includes('OSVDB') || line.includes('may be vulnerable'))) {
            const severity = line.includes('potentially dangerous') ? 'high' : 'medium';
            vulnerabilities.push({
              tool: 'Nikto',
              severity: severity,
              finding: line.replace(/^\+\s*/, '').trim(),
              url: targetUrl
            });
          }
        }
      }
    } catch (error) {
      console.error('Failed to read Nikto output file:', error);
    }
    
    this.scanResults.nikto = {
      success: result.success,
      output: result.stdout,
      errors: result.stderr,
      vulnerabilities: vulnerabilities
    };
    
    this.log(`✅ Nikto scan completed. Found ${vulnerabilities.length} issues`, 90);
    return this.scanResults.nikto;
  }

  /**
   * Run w3af scan
   */
  async runW3afScan(targetUrl) {
    this.log(`🕷️ Starting w3af scan on ${targetUrl}...`, 92);
    
    const w3afOutputFile = `${this.repoDir}/w3af-results.json`;
    const w3afCommand = `bash -c "cd ${this.repoDir} && w3af_console -s <<EOF
profiles
use fast_scan
back
target
set target ${targetUrl}
back
start
exit
EOF
2>&1 | tee w3af-output.txt"`;
    
    this.log(`🔧 Running w3af...`, 95, `w3af_console -s (fast_scan profile)`);
    
    const result = await runWSLRaw(w3afCommand);
    
    // Log output to console
    if (result.stdout) {
      this.log(`📊 w3af Output:`, 95, null, 'info', 'w3af', result.stdout.substring(0, 5000));
    }
    if (result.stderr) {
      this.log(`⚠️ w3af Errors:`, 96, null, 'warning', 'w3af', result.stderr.substring(0, 2000));
    }
    
    // Parse w3af output for vulnerabilities
    const vulnerabilities = [];
    if (result.stdout) {
      const lines = result.stdout.split('\n');
      for (const line of lines) {
        if (line.includes('Vulnerability found') || line.includes('Found vulnerability')) {
          const match = line.match(/(high|medium|low|info)/i);
          const severity = match ? match[1].toLowerCase() : 'medium';
          vulnerabilities.push({
            tool: 'w3af',
            severity: severity,
            finding: line.trim(),
            url: targetUrl
          });
        }
      }
    }
    
    this.scanResults.w3af = {
      success: result.success,
      output: result.stdout,
      errors: result.stderr,
      vulnerabilities: vulnerabilities
    };
    
    this.log(`✅ w3af scan completed. Found ${vulnerabilities.length} issues`, 98);
    return this.scanResults.w3af;
  }

  /**
   * Aggregate all scan results
   */
  aggregateResults() {
    const allVulnerabilities = [];
    
    // Collect all vulnerabilities
    if (this.scanResults.zap && this.scanResults.zap.vulnerabilities) {
      allVulnerabilities.push(...this.scanResults.zap.vulnerabilities);
    }
    if (this.scanResults.sqlmap && this.scanResults.sqlmap.vulnerabilities) {
      allVulnerabilities.push(...this.scanResults.sqlmap.vulnerabilities);
    }
    if (this.scanResults.nikto && this.scanResults.nikto.vulnerabilities) {
      allVulnerabilities.push(...this.scanResults.nikto.vulnerabilities);
    }
    if (this.scanResults.w3af && this.scanResults.w3af.vulnerabilities) {
      allVulnerabilities.push(...this.scanResults.w3af.vulnerabilities);
    }
    
    // Count by severity
    this.scanResults.summary.total_vulnerabilities = allVulnerabilities.length;
    this.scanResults.summary.critical = allVulnerabilities.filter(v => v.severity === 'critical').length;
    this.scanResults.summary.high = allVulnerabilities.filter(v => v.severity === 'high').length;
    this.scanResults.summary.medium = allVulnerabilities.filter(v => v.severity === 'medium').length;
    this.scanResults.summary.low = allVulnerabilities.filter(v => v.severity === 'low').length;
    this.scanResults.summary.info = allVulnerabilities.filter(v => v.severity === 'info').length;
    
    this.scanResults.allVulnerabilities = allVulnerabilities;
    
    return this.scanResults;
  }

  /**
   * Clean up temporary repository directory
   */
  async cleanup() {
    if (this.repoDir) {
      this.log(`🧹 Cleaning up temporary directory...`, 99);
      const cleanupCommand = `bash -c "rm -rf ${this.repoDir}"`;
      await runWSLRaw(cleanupCommand);
      this.log(`✅ Cleanup completed`, 100);
    }
  }

  /**
   * Perform complete scan
   */
  async performScan() {
    try {
      await this.ensureOutputDir();
      
      this.log(`🚀 Starting GitHub repository scan for: ${this.repoName}`, 0);
      
      // Step 1: Clone repository
      await this.cloneRepository();
      
      // Step 2: Find API endpoints
      const apiFiles = await this.findAPIEndpoints();
      
      // Step 3: Extract base URL
      const targetUrl = await this.extractBaseURL();
      
      // Step 4: Run scanning tools sequentially
      await this.runZAPScan(targetUrl);
      await this.runSQLMapScan(targetUrl);
      await this.runNiktoScan(targetUrl);
      await this.runW3afScan(targetUrl);
      
      // Step 5: Aggregate results
      const results = this.aggregateResults();
      
      // Step 6: Cleanup
      await this.cleanup();
      
      this.log(`✅ GitHub repository scan completed!`, 100);
      
      return {
        repository: this.repoName,
        repositoryUrl: this.repoUrl,
        targetUrl: targetUrl,
        timestamp: new Date().toISOString(),
        scanResults: results,
        summary: results.summary
      };
    } catch (error) {
      this.log(`❌ Scan error: ${error.message}`, 0, null, 'error');
      await this.cleanup();
      throw error;
    }
  }
}

module.exports = GitHubRepoScanner;

