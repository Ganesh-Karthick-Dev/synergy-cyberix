const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class AdditionalSecurityScanner {
  constructor(targetUrl, targetDomain) {
    this.targetUrl = targetUrl;
    this.targetDomain = targetDomain;
    this.progressCallback = null;
    this.completeCallback = null;
  }

  setProgressCallback(callback) {
    this.progressCallback = callback;
  }

  setCompleteCallback(callback) {
    this.completeCallback = callback;
  }

  async runKaliCommand(label, cmd, timeout = 300000) {
    console.log(`🔧 [${label}] Executing command: ${cmd}`);
    
    // Use standard WSL execution method
    const wslCmd = `wsl bash -c "${cmd.replace(/"/g, '\\"')}"`;
    console.log(`🔧 [${label}] WSL command: ${wslCmd}`);
    
    // Log command to UI
    if (this.progressCallback) {
      this.progressCallback({
        testId: label.toLowerCase().replace(/\s+/g, '-'),
        testName: label,
        progress: 0,
        message: `🔧 Executing: ${cmd}`,
        type: 'info'
      });
    }
    
    return new Promise((resolve, reject) => {
      // Prepare exec options - only set timeout if it's defined and > 0
      const execOptions = { 
        maxBuffer: 1024 * 1024 * 10
      };
      if (timeout && timeout > 0) {
        execOptions.timeout = timeout;
      }
      
      const child = exec(wslCmd, execOptions, (error, stdout, stderr) => {
        console.log(`🔧 [${label}] Command completed`);
        console.log(`🔧 [${label}] stdout length:`, stdout ? stdout.length : 0);
        console.log(`🔧 [${label}] stderr length:`, stderr ? stderr.length : 0);
        console.log(`🔧 [${label}] error:`, error ? error.message : 'none');
        
        // Show partial output in UI for long-running commands
        if (stdout && stdout.length > 0) {
          const preview = stdout.length > 1000 ? stdout.substring(0, 1000) + '...' : stdout;
          if (this.progressCallback) {
            this.progressCallback({
              testId: label.toLowerCase().replace(/\s+/g, '-'),
              testName: label,
              progress: 50,
              message: `📋 Output preview: ${preview}`,
              type: 'info'
            });
          }
        }
        
        // Log result to UI
        if (this.progressCallback) {
          if (error) {
            this.progressCallback({
              testId: label.toLowerCase().replace(/\s+/g, '-'),
              testName: label,
              progress: 100,
              message: `❌ Command failed: ${error.message || error.toString()}`,
              type: 'error'
            });
          } else {
            this.progressCallback({
              testId: label.toLowerCase().replace(/\s+/g, '-'),
              testName: label,
              progress: 100,
              message: `✅ Command completed successfully`,
              type: 'success'
            });
          }
        }
        
        if (error) {
          console.error(`❌ [${label}] Command failed:`, error.message || error.toString());
          console.error(`❌ [${label}] Full error object:`, error);
          return reject({ 
            label, 
            error: error.message || error.toString(), 
            stderr, 
            stdout,
            fullError: error
          });
        }
        resolve({ label, output: stdout, stderr });
      });
      
      // Handle timeout - only set up timeout if timeout is defined and > 0
      if (timeout && timeout > 0) {
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGTERM');
            reject({
              label,
              error: `Command timeout after ${timeout / 1000} seconds`,
              stderr: '',
              stdout: '',
              fullError: new Error('Timeout')
            });
          }
        }, timeout);
      }
    });
  }

  async runSslTlsAnalysis() {
    console.log('🔐 Starting SSL/TLS Analysis...');
    
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'ssl-tls-analysis',
        testName: 'SSL/TLS Analysis',
        progress: 0,
        message: 'Starting SSL/TLS analysis...',
        type: 'info'
      });
    }

    try {
      // Use openssl for SSL/TLS analysis as it's more reliable than nmap scripts
      let cmd = `echo | openssl s_client -connect ${this.targetDomain}:443 -servername ${this.targetDomain} 2>/dev/null | openssl x509 -noout -text`;
      let result;
      
      try {
        result = await this.runKaliCommand('SSL/TLS Analysis', cmd);
      } catch (opensslError) {
        console.log('🔍 [SSL/TLS Analysis] openssl failed, trying nmap...');
        // Fallback to nmap if openssl fails
        cmd = `nmap --script ssl-enum-ciphers -p 443 ${this.targetDomain}`;
        result = await this.runKaliCommand('SSL/TLS Analysis (nmap fallback)', cmd);
      }
      
      // Parse SSL/TLS results
      const output = result.output;
      const lines = output.split('\n');
      
      const sslResult = {
        scanType: 'SSL/TLS Analysis',
        target: this.targetDomain,
        supportedProtocols: [],
        cipherStrength: 'Unknown',
        deprecatedProtocols: [],
        weakCiphers: [],
        certificateInfo: {
          issuer: 'Unknown',
          validFrom: null,
          validTo: null,
          status: 'Unknown'
        },
        serverPreference: 'unknown',
        riskLevel: 'Low',
        issues: [],
        recommendations: [],
        summary: 'SSL/TLS analysis completed',
        error: null
      };

      // Parse certificate information from openssl output
      if (output.includes('Issuer:')) {
        const issuerMatch = output.match(/Issuer: ([^\n]+)/);
        if (issuerMatch) {
          sslResult.certificateInfo.issuer = issuerMatch[1].trim();
        }
      }

      if (output.includes('Not Before:')) {
        const validFromMatch = output.match(/Not Before: ([^\n]+)/);
        if (validFromMatch) {
          sslResult.certificateInfo.validFrom = validFromMatch[1].trim();
        }
      }

      if (output.includes('Not After:')) {
        const validToMatch = output.match(/Not After: ([^\n]+)/);
        if (validToMatch) {
          sslResult.certificateInfo.validTo = validToMatch[1].trim();
        }
      }

      // Parse TLS versions
      const tlsVersions = [];
      const deprecatedVersions = [];
      if (output.includes('TLSv1.2')) tlsVersions.push('TLSv1.2');
      if (output.includes('TLSv1.3')) tlsVersions.push('TLSv1.3');
      if (output.includes('TLSv1.1')) {
        tlsVersions.push('TLSv1.1');
        deprecatedVersions.push('TLSv1.1');
      }
      if (output.includes('TLSv1.0')) {
        tlsVersions.push('TLSv1.0');
        deprecatedVersions.push('TLSv1.0');
      }
      if (output.includes('SSLv3')) {
        tlsVersions.push('SSLv3');
        deprecatedVersions.push('SSLv3');
      }
      
      sslResult.supportedProtocols = tlsVersions;
      sslResult.deprecatedProtocols = deprecatedVersions;

      // Parse cipher grades
      const gradeMatches = output.match(/Grade: ([A-F])/g);
      if (gradeMatches) {
        const grades = gradeMatches.map(match => match.replace('Grade: ', ''));
        sslResult.cipherStrength = grades.includes('A') ? 'A' : grades[0] || 'Unknown';
      }

      // Check for weak ciphers
      const weakCiphers = [];
      if (output.includes('Grade: C') || output.includes('Grade: D') || output.includes('Grade: F')) {
        weakCiphers.push('Weak ciphers detected');
      }
      sslResult.weakCiphers = weakCiphers;

      // Determine risk level
      let riskLevel = 'Low';
      const issues = [];
      const recommendations = [];

      if (deprecatedVersions.length > 0) {
        riskLevel = 'Medium';
        issues.push({
          description: `Deprecated protocols detected: ${deprecatedVersions.join(', ')}`,
          risk: 'Deprecated protocols are vulnerable to known attacks.'
        });
        recommendations.push('Disable older protocols like SSLv3 and TLS 1.0/1.1.');
      }

      if (weakCiphers.length > 0) {
        riskLevel = 'High';
        issues.push({
          description: 'Weak cipher suites detected',
          risk: 'Weak ciphers can be easily broken by attackers.'
        });
        recommendations.push('Remove weak cipher suites and use only strong encryption.');
      }

      if (sslResult.certificateInfo.issuer === 'Unknown') {
        riskLevel = 'Medium';
        issues.push({
          description: 'Certificate information could not be extracted',
          risk: 'Unable to verify certificate validity and issuer.'
        });
        recommendations.push('Verify SSL certificate configuration and validity.');
      }

      // Add general recommendations
      if (riskLevel === 'Low') {
        recommendations.push('Ensure older protocols like SSLv3 and TLS 1.0 are disabled.');
        recommendations.push('Renew SSL certificates before expiry.');
        recommendations.push('Enable HTTP Strict Transport Security (HSTS) for added SSL enforcement.');
      }

      sslResult.riskLevel = riskLevel;
      sslResult.issues = issues;
      sslResult.recommendations = recommendations;

      // Update summary based on findings
      if (riskLevel === 'Low') {
        sslResult.summary = 'Strong TLS configuration detected with only modern ciphers and protocols.';
      } else if (riskLevel === 'Medium') {
        sslResult.summary = 'Moderate TLS configuration with some deprecated protocols or weak ciphers.';
      } else {
        sslResult.summary = 'Weak TLS configuration with significant security vulnerabilities.';
      }

      if (this.progressCallback) {
        this.progressCallback({
          testId: 'ssl-tls-analysis',
          testName: 'SSL/TLS Analysis',
          progress: 100,
          message: 'SSL/TLS analysis completed',
          type: 'success'
        });
      }

      return sslResult;
    } catch (error) {
      console.error('❌ SSL/TLS Analysis failed:', error);
      console.error('❌ SSL/TLS Analysis error details:', {
        message: error.error || error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        label: error.label,
        fullError: error.fullError
      });
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'ssl-tls-analysis',
          testName: 'SSL/TLS Analysis',
          progress: 100,
          message: `SSL/TLS analysis failed: ${error.error || error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'SSL/TLS Analysis',
        target: this.targetDomain,
        error: error.error || error.message || 'SSL/TLS analysis failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `SSL/TLS analysis failed: ${error.error || error.message || 'Unknown error'}`
      };
    }
  }

  async runSecurityHeadersAnalysis() {
    console.log('🛡️ Starting Security Headers Analysis...');
    
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'security-headers',
        testName: 'Security Headers',
        progress: 0,
        message: 'Starting security headers analysis...',
        type: 'info'
      });
    }

    try {
      const cmd = `curl -I -L ${this.targetUrl}`;
      const result = await this.runKaliCommand('Security Headers', cmd);
      
      // Parse headers
      const output = result.output;
      const lines = output.split('\n');
      
      const headersResult = {
        scanType: 'Security Headers',
        target: this.targetUrl,
        headersFound: {},
        missingHeaders: [],
        riskLevel: 'Low',
        issues: [],
        recommendations: [],
        summary: 'Security headers analysis completed',
        error: null
      };

      // Parse headers
      lines.forEach(line => {
        if (line.includes(':')) {
          const [key, value] = line.split(':', 2);
          headersResult.headersFound[key.trim().toLowerCase()] = value.trim();
        }
      });

      // Check for missing security headers
      const requiredHeaders = [
        'strict-transport-security',
        'content-security-policy',
        'x-frame-options',
        'x-content-type-options',
        'x-xss-protection',
        'referrer-policy'
      ];

      headersResult.missingHeaders = requiredHeaders.filter(header => 
        !headersResult.headersFound[header]
      );

      // Determine risk level and generate issues/recommendations
      let riskLevel = 'Low';
      const issues = [];
      const recommendations = [];

      if (headersResult.missingHeaders.includes('content-security-policy')) {
        riskLevel = 'Medium';
        issues.push({
          header: 'Content-Security-Policy',
          risk: 'Without a CSP, the site is vulnerable to XSS and injection attacks.'
        });
        recommendations.push('Add `Content-Security-Policy` header to restrict allowed content sources.');
      }

      if (headersResult.missingHeaders.includes('strict-transport-security')) {
        riskLevel = 'Medium';
        issues.push({
          header: 'Strict-Transport-Security',
          risk: 'Users may connect over insecure HTTP before redirecting to HTTPS.'
        });
        recommendations.push('Add `Strict-Transport-Security` header to enforce HTTPS.');
      }

      if (headersResult.missingHeaders.includes('x-frame-options')) {
        riskLevel = 'Medium';
        issues.push({
          header: 'X-Frame-Options',
          risk: 'Site may be vulnerable to clickjacking attacks.'
        });
        recommendations.push('Add `X-Frame-Options` to protect against clickjacking attacks.');
      }

      if (headersResult.missingHeaders.includes('x-content-type-options')) {
        riskLevel = 'Low';
        issues.push({
          header: 'X-Content-Type-Options',
          risk: 'Browser may perform MIME-type sniffing, potentially leading to XSS.'
        });
        recommendations.push('Add `X-Content-Type-Options: nosniff` header.');
      }

      if (headersResult.missingHeaders.includes('x-xss-protection')) {
        riskLevel = 'Low';
        issues.push({
          header: 'X-XSS-Protection',
          risk: 'Browser XSS protection may not be enabled.'
        });
        recommendations.push('Add `X-XSS-Protection: 1; mode=block` header.');
      }

      if (headersResult.missingHeaders.includes('referrer-policy')) {
        riskLevel = 'Low';
        issues.push({
          header: 'Referrer-Policy',
          risk: 'Referrer information may be leaked to third parties.'
        });
        recommendations.push('Add `Referrer-Policy` header to control referrer information.');
      }

      // Update summary based on findings
      if (riskLevel === 'Low') {
        headersResult.summary = 'Good security headers configuration with minor improvements possible.';
      } else if (riskLevel === 'Medium') {
        headersResult.summary = 'Moderate risk — basic headers exist but major security protections are missing.';
      } else {
        headersResult.summary = 'High risk — critical security headers are missing.';
      }

      headersResult.riskLevel = riskLevel;
      headersResult.issues = issues;
      headersResult.recommendations = recommendations;

      if (this.progressCallback) {
        this.progressCallback({
          testId: 'security-headers',
          testName: 'Security Headers',
          progress: 100,
          message: 'Security headers analysis completed',
          type: 'success'
        });
      }

      return headersResult;
    } catch (error) {
      console.error('❌ Security Headers Analysis failed:', error);
      console.error('❌ Security Headers Analysis error details:', {
        message: error.error || error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        label: error.label,
        fullError: error.fullError
      });
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'security-headers',
          testName: 'Security Headers',
          progress: 100,
          message: `Security headers analysis failed: ${error.error || error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'Security Headers',
        target: this.targetUrl,
        error: error.error || error.message || 'Security headers analysis failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `Security headers analysis failed: ${error.error || error.message || 'Unknown error'}`
      };
    }
  }

  async runCmsDetection() {
    console.log('🔍 Starting CMS Detection...');
    
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'cms-detection',
        testName: 'CMS Detection',
        progress: 0,
        message: 'Starting CMS detection...',
        type: 'info'
      });
    }

    try {
      // Use whatweb -v as specified by user
      let cmd = `whatweb -v ${this.targetUrl}`;
      let result;
      
      try {
        result = await this.runKaliCommand('CMS Detection', cmd);
      } catch (whatwebError) {
        console.log('🔍 [CMS Detection] whatweb not found, trying curl fallback...');
        // Fallback to curl if whatweb is not available
        cmd = `curl -s -I ${this.targetUrl} | grep -i "server\|x-powered-by\|x-generator"`;
        result = await this.runKaliCommand('CMS Detection (curl fallback)', cmd);
      }
      
      // Parse whatweb or curl output for CMS information
      const output = result.output;
      
      const cmsResult = {
        scanType: 'CMS Detection',
        target: this.targetUrl,
        status: '200 OK',
        server: 'Unknown',
        cms: null,
        framework: null,
        riskLevel: 'Low',
        issues: [],
        recommendations: [],
        summary: 'CMS detection completed',
        error: null
      };

      // Check if this is whatweb output or curl output
      if (output.includes('[') && output.includes(']')) {
        // Parse whatweb output
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('Server[')) {
            const serverMatch = line.match(/Server\[([^\]]+)\]/i);
            if (serverMatch) {
              cmsResult.server = serverMatch[1];
            }
          }
          if (line.includes('WordPress')) {
            cmsResult.cms = 'WordPress';
            const versionMatch = line.match(/WordPress[^0-9]*([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
            if (versionMatch) {
              cmsResult.cms += ` ${versionMatch[1]}`;
            }
          }
          if (line.includes('Joomla')) {
            cmsResult.cms = 'Joomla';
          }
          if (line.includes('Drupal')) {
            cmsResult.cms = 'Drupal';
          }
        }
      } else {
        // Parse curl output
        const lines = output.split('\n');
        for (const line of lines) {
          const lowerLine = line.toLowerCase();
          if (lowerLine.includes('server:')) {
            cmsResult.server = line.split(/server:/i)[1]?.trim() || 'Unknown';
          }
          if (lowerLine.includes('x-powered-by:')) {
            cmsResult.framework = line.split(/x-powered-by:/i)[1]?.trim() || 'Unknown';
          }
          if (lowerLine.includes('x-generator:')) {
            cmsResult.cms = line.split(/x-generator:/i)[1]?.trim() || 'Unknown';
          }
        }
      }

      // Determine risk level and generate issues/recommendations
      let riskLevel = 'Low';
      const issues = [];
      const recommendations = [];

      // Check for 403 Forbidden or other access issues
      if (output.includes('403') || output.includes('Forbidden')) {
        riskLevel = 'Low';
        issues.push({
          description: '403 Forbidden response may indicate restricted or misconfigured access.'
        });
        recommendations.push('Ensure directory access rules are properly configured in nginx.');
      }

      // Check for CMS detection
      if (cmsResult.cms) {
        riskLevel = 'Medium';
        issues.push({
          description: `CMS detected: ${cmsResult.cms}`,
          risk: 'Known CMS may have known vulnerabilities and attack vectors.'
        });
        recommendations.push('If CMS is in use, hide its version from public headers to reduce fingerprinting.');
        recommendations.push('Keep CMS and plugins updated to latest versions.');
        recommendations.push('Implement additional security measures like WAF and regular security scans.');
      } else {
        recommendations.push('Monitor for any CMS installation in the future.');
        recommendations.push('Ensure proper access controls are in place for any admin interfaces.');
      }

      // Update summary based on findings
      if (cmsResult.cms) {
        cmsResult.summary = `CMS detected: ${cmsResult.cms} - additional security measures recommended.`;
      } else if (cmsResult.status.includes('403')) {
        cmsResult.summary = 'No CMS detected; access restricted; minimal information exposure.';
      } else {
        cmsResult.summary = 'No CMS detected; minimal information exposure.';
      }

      cmsResult.riskLevel = riskLevel;
      cmsResult.issues = issues;
      cmsResult.recommendations = recommendations;

      if (this.progressCallback) {
        this.progressCallback({
          testId: 'cms-detection',
          testName: 'CMS Detection',
          progress: 100,
          message: 'CMS detection completed',
          type: 'success'
        });
      }

      return cmsResult;
    } catch (error) {
      console.error('❌ CMS Detection failed:', error);
      console.error('❌ CMS Detection error details:', {
        message: error.error || error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        label: error.label,
        fullError: error.fullError
      });
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'cms-detection',
          testName: 'CMS Detection',
          progress: 100,
          message: `CMS detection failed: ${error.error || error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'CMS Detection',
        target: this.targetUrl,
        error: error.error || error.message || 'CMS detection failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `CMS detection failed: ${error.error || error.message || 'Unknown error'}`
      };
    }
  }

  async runSubdomainEnumeration() {
    console.log('🌐 Starting Subdomain Enumeration...');
    
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'subdomain-enumeration',
        testName: 'Subdomain Enumeration',
        progress: 0,
        message: 'Starting subdomain enumeration...',
        type: 'info'
      });
    }

    try {
      // Try amass first, fallback to dig if not available
      let cmd = `amass enum -d ${this.targetDomain}`;
      let result;
      
      try {
        // No timeout for amass - let it run until completion
        result = await this.runKaliCommand('Subdomain Enumeration', cmd, undefined);
      } catch (amassError) {
        console.log('🔍 [Subdomain Enumeration] amass not found or failed, trying alternative method...');
        // Fallback to using dig for subdomain enumeration
        cmd = `dig +short ${this.targetDomain} && dig +short www.${this.targetDomain} && dig +short mail.${this.targetDomain} && dig +short ftp.${this.targetDomain}`;
        result = await this.runKaliCommand('Subdomain Enumeration (fallback)', cmd);
      }
      
      // Parse amass output
      const output = result.output;
      const lines = output.split('\n');
      
      const subdomainResult = {
        scanType: 'Subdomain Enumeration',
        target: this.targetDomain,
        subdomainsFound: [],
        count: 0,
        asnInfo: [],
        riskLevel: 'Low',
        issues: [],
        recommendations: [],
        summary: 'Subdomain enumeration completed',
        error: null
      };

      // Extract subdomains from amass output
      const subdomains = new Set();
      lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes(this.targetDomain) && !trimmedLine.startsWith('[')) {
          // Extract subdomain from line
          const escapedDomain = this.targetDomain.replace(/\./g, '\\.');
          const subdomainRegex = new RegExp(`([a-zA-Z0-9.-]+\\.${escapedDomain})`);
          const subdomainMatch = trimmedLine.match(subdomainRegex);
          if (subdomainMatch) {
            subdomains.add(subdomainMatch[1]);
          }
        }
      });

      subdomainResult.subdomainsFound = Array.from(subdomains);
      subdomainResult.count = subdomainResult.subdomainsFound.length;

      // Determine risk level and generate issues/recommendations
      let riskLevel = 'Low';
      const issues = [];
      const recommendations = [];

      if (subdomains.size === 0) {
        riskLevel = 'Low';
        recommendations.push('Monitor DNS records for newly created subdomains.');
        recommendations.push('Regularly verify CNAME records to prevent subdomain takeover.');
      } else if (subdomains.size <= 5) {
        riskLevel = 'Low';
        issues.push({
          description: `${subdomains.size} subdomains discovered`,
          risk: 'Multiple subdomains increase attack surface but manageable.'
        });
        recommendations.push('Audit all discovered subdomains for ownership and active hosting.');
        recommendations.push('Remove unused DNS records.');
        recommendations.push('Enable DNSSEC for better integrity protection.');
      } else {
        riskLevel = 'Medium';
        issues.push({
          description: `${subdomains.size} subdomains discovered`,
          risk: 'Large number of subdomains may increase attack surface and management complexity.'
        });
        recommendations.push('Audit all discovered subdomains for ownership and active hosting.');
        recommendations.push('Remove unused DNS records.');
        recommendations.push('Implement subdomain monitoring and alerting.');
        recommendations.push('Enable DNSSEC for better integrity protection.');
      }

      // Update summary based on findings
      if (subdomains.size === 0) {
        subdomainResult.summary = 'No subdomains discovered. Minimal DNS exposure risk.';
      } else if (subdomains.size <= 5) {
        subdomainResult.summary = `${subdomains.size} subdomains identified; manageable exposure risk.`;
      } else {
        subdomainResult.summary = `${subdomains.size} subdomains identified; cross-provider hosting found.`;
      }

      subdomainResult.riskLevel = riskLevel;
      subdomainResult.issues = issues;
      subdomainResult.recommendations = recommendations;

      if (this.progressCallback) {
        this.progressCallback({
          testId: 'subdomain-enumeration',
          testName: 'Subdomain Enumeration',
          progress: 100,
          message: 'Subdomain enumeration completed',
          type: 'success'
        });
      }

      return subdomainResult;
    } catch (error) {
      console.error('❌ Subdomain Enumeration failed:', error);
      console.error('❌ Subdomain Enumeration error details:', {
        message: error.error || error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        label: error.label,
        fullError: error.fullError
      });
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'subdomain-enumeration',
          testName: 'Subdomain Enumeration',
          progress: 100,
          message: `Subdomain enumeration failed: ${error.error || error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'Subdomain Enumeration',
        target: this.targetDomain,
        error: error.error || error.message || 'Subdomain enumeration failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `Subdomain enumeration failed: ${error.error || error.message || 'Unknown error'}`
      };
    }
  }

  async runPortScanning() {
    console.log('🔌 Starting Port Scanning...');
    
    if (this.progressCallback) {
      this.progressCallback({
        testId: 'port-scanning',
        testName: 'Port Scanning',
        progress: 0,
        message: 'Starting port scanning...',
        type: 'info'
      });
    }

    try {
      // Use non-privileged scan options to avoid root requirement
      let cmd = `nmap -sT -sV -T4 -Pn ${this.targetDomain}`;
      let result;
      
      try {
        result = await this.runKaliCommand('Port Scanning', cmd);
      } catch (nmapError) {
        console.log('🔍 [Port Scanning] nmap failed, trying with sudo...');
        // Try with sudo if regular nmap fails
        cmd = `sudo nmap -sS -sV -T4 -Pn ${this.targetDomain}`;
        result = await this.runKaliCommand('Port Scanning (sudo)', cmd);
      }
      
      // Parse nmap output
      const output = result.output;
      const lines = output.split('\n');
      
      const portResult = {
        scanType: 'Port Scanning',
        target: this.targetDomain,
        openPorts: [],
        totalOpen: 0,
        os: 'Unknown',
        riskLevel: 'Low',
        issues: [],
        recommendations: [],
        summary: 'Port scanning completed',
        error: null
      };

      // Parse open ports
      lines.forEach(line => {
        if (line.includes('/tcp') && line.includes('open')) {
          const portMatch = line.match(/(\d+)\/tcp\s+open\s+(\w+)(?:\s+(.+))?/);
          if (portMatch) {
            const [, port, service, version] = portMatch;
            portResult.openPorts.push({
              port: parseInt(port),
              service: service,
              version: version || 'Unknown'
            });
          }
        }
      });

      portResult.totalOpen = portResult.openPorts.length;

      // Determine risk level and generate issues/recommendations
      let riskLevel = 'Low';
      const issues = [];
      const recommendations = [];

      // Check for risky ports
      const riskyPorts = {
        22: { service: 'SSH', risk: 'SSH exposed to the internet — potential brute-force vector.' },
        23: { service: 'Telnet', risk: 'Telnet is unencrypted and vulnerable to sniffing.' },
        21: { service: 'FTP', risk: 'FTP may transmit credentials in plaintext.' },
        25: { service: 'SMTP', risk: 'Open SMTP may be used for spam or unauthorized email.' },
        53: { service: 'DNS', risk: 'Open DNS server may be used for amplification attacks.' },
        135: { service: 'RPC', risk: 'RPC services may expose sensitive system information.' },
        139: { service: 'NetBIOS', risk: 'NetBIOS may expose system information and shares.' },
        445: { service: 'SMB', risk: 'SMB may expose file shares and system information.' },
        1433: { service: 'MSSQL', risk: 'MSSQL database exposed to the internet.' },
        3306: { service: 'MySQL', risk: 'MySQL database exposed to the internet.' },
        3389: { service: 'RDP', risk: 'RDP exposed to the internet — potential brute-force vector.' },
        5432: { service: 'PostgreSQL', risk: 'PostgreSQL database exposed to the internet.' },
        5900: { service: 'VNC', risk: 'VNC exposed to the internet — potential unauthorized access.' },
        6379: { service: 'Redis', risk: 'Redis database exposed to the internet.' },
        27017: { service: 'MongoDB', risk: 'MongoDB database exposed to the internet.' }
      };

      // Check for development/staging ports
      const devPorts = [3000, 3001, 8080, 8081, 8000, 8001, 9000, 9001];

      portResult.openPorts.forEach(port => {
        if (riskyPorts[port.port]) {
          riskLevel = 'High';
          issues.push({
            port: port.port,
            risk: riskyPorts[port.port].risk
          });
        } else if (devPorts.includes(port.port)) {
          if (riskLevel === 'Low') riskLevel = 'Medium';
          issues.push({
            port: port.port,
            risk: `Port ${port.port} may host development or staging app; often left unprotected.`
          });
        }
      });

      // Generate recommendations based on findings
      if (portResult.openPorts.some(p => riskyPorts[p.port])) {
        recommendations.push('Close or restrict access to risky ports (SSH, RDP, databases).');
        recommendations.push('Use VPN or IP whitelisting for administrative services.');
        recommendations.push('Implement strong authentication and monitoring for exposed services.');
      }

      if (portResult.openPorts.some(p => devPorts.includes(p.port))) {
        recommendations.push('Close or firewall development ports if not required for production.');
        recommendations.push('Ensure development environments are properly secured.');
      }

      if (portResult.totalOpen > 10) {
        if (riskLevel === 'Low') riskLevel = 'Medium';
        issues.push({
          description: 'High number of open ports',
          risk: 'Large number of open ports increases attack surface.'
        });
        recommendations.push('Review and close unnecessary open ports.');
        recommendations.push('Implement network segmentation and firewall rules.');
      }

      // General recommendations
      recommendations.push('Run periodic port scans to detect unexpected open services.');
      recommendations.push('Implement network monitoring and intrusion detection.');

      // Update summary based on findings
      if (riskLevel === 'Low') {
        portResult.summary = `${portResult.totalOpen} open ports detected — overall low exposure risk.`;
      } else if (riskLevel === 'Medium') {
        portResult.summary = `${portResult.totalOpen} open ports detected — overall medium exposure risk.`;
      } else {
        portResult.summary = `${portResult.totalOpen} open ports detected — high risk services exposed.`;
      }

      portResult.riskLevel = riskLevel;
      portResult.issues = issues;
      portResult.recommendations = recommendations;

      if (this.progressCallback) {
        this.progressCallback({
          testId: 'port-scanning',
          testName: 'Port Scanning',
          progress: 100,
          message: 'Port scanning completed',
          type: 'success'
        });
      }

      return portResult;
    } catch (error) {
      console.error('❌ Port Scanning failed:', error);
      console.error('❌ Port Scanning error details:', {
        message: error.error || error.message,
        stderr: error.stderr,
        stdout: error.stdout,
        label: error.label,
        fullError: error.fullError
      });
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'port-scanning',
          testName: 'Port Scanning',
          progress: 100,
          message: `Port scanning failed: ${error.error || error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'Port Scanning',
        target: this.targetDomain,
        error: error.error || error.message || 'Port scanning failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `Port scanning failed: ${error.error || error.message || 'Unknown error'}`
      };
    }
  }

  async runSQLInjectionScan() {
    try {
      console.log('🔍 Starting SQL injection scan...');
      
      // Import and use the new SQL injection scanner
      const SQLInjectionScanner = require('./sql-injection-scanner');
      const sqlScanner = new SQLInjectionScanner(this.targetUrl, './temp-scans');
      
      // Set up progress callback
      sqlScanner.setProgressCallback((progress) => {
        console.log(`[SQL-INJECTION] ${progress.message}`);
        if (this.progressCallback) {
          this.progressCallback({
            testId: 'sql-injection-scan',
            testName: 'SQL Injection Scan',
            progress: progress.progress || 50,
            message: progress.message,
            type: progress.type || 'info'
          });
        }
      });
      
      // Run the scan
      const result = await sqlScanner.runScan();
      
      // Extract the SQL injection scan result
      const sqlResult = result.tests['sql-injection-scan'];
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'sql-injection-scan',
          testName: 'SQL Injection Scan',
          progress: 100,
          message: 'SQL injection scan completed',
          type: 'success'
        });
      }

      return {
        scanType: 'SQL Injection Scan',
        summary: sqlResult.report.summary,
        vulnerability_found: sqlResult.report.vulnerability_found,
        parameters_tested: sqlResult.report.parameters_tested,
        http_errors: sqlResult.report.http_errors,
        protection_detected: sqlResult.report.protection_detected,
        scanTimestamp: new Date().toISOString(),
        findings: sqlResult.findings,
        recommendations: sqlResult.recommendations
      };
    } catch (error) {
      console.error('❌ SQL injection scan failed:', error);
      
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'sql-injection-scan',
          testName: 'SQL Injection Scan',
          progress: 100,
          message: `SQL injection scan failed: ${error.message || 'Unknown error'}`,
          type: 'error'
        });
      }

      return {
        scanType: 'SQL Injection Scan',
        target: this.targetDomain,
        error: error.message || 'SQL injection scan failed',
        summary: `SQL injection scan failed: ${error.message || 'Unknown error'}`
      };
    }
  }

  async runAllScans() {
    console.log('🚀 Starting all additional security scans...');
    
    // First, test WSL connectivity
    try {
      console.log('🔍 Testing WSL connectivity...');
      const testResult = await this.runKaliCommand('WSL Test', 'echo "WSL connection test"');
      console.log('✅ WSL connectivity test passed:', testResult.output);
    } catch (error) {
      console.error('❌ WSL connectivity test failed:', error);
      if (this.progressCallback) {
        this.progressCallback({
          testId: 'wsl-test',
          testName: 'WSL Connectivity Test',
          progress: 100,
          message: `WSL connectivity test failed: ${error.message || 'Unknown error'}`,
          type: 'error'
        });
      }
      
      // Return error results for all scans
      const errorResult = {
        scanType: 'WSL Connectivity Test',
        target: this.targetDomain,
        error: error.message || 'WSL connectivity test failed',
        stderr: error.stderr || '',
        stdout: error.stdout || '',
        summary: `WSL connectivity test failed: ${error.message || 'Unknown error'}`
      };
      
      const processedResults = {
        tests: {
          'ssl-tls-analysis': { ...errorResult, scanType: 'SSL/TLS Analysis' },
          'security-headers': { ...errorResult, scanType: 'Security Headers' },
          'cms-detection': { ...errorResult, scanType: 'CMS Detection' },
          'subdomain-enumeration': { ...errorResult, scanType: 'Subdomain Enumeration' },
          'port-scanning': { ...errorResult, scanType: 'Port Scanning' },
          'sql-injection-scan': { ...errorResult, scanType: 'SQL Injection Scan' }
        }
      };
      
      if (this.completeCallback) {
        this.completeCallback(processedResults);
      }
      
      return processedResults;
    }
    
    const results = {};
    
    // Run scans sequentially
    results.sslTls = await this.runSslTlsAnalysis();
    results.securityHeaders = await this.runSecurityHeadersAnalysis();
    results.cmsDetection = await this.runCmsDetection();
    results.subdomainEnumeration = await this.runSubdomainEnumeration();
    results.portScanning = await this.runPortScanning();
    results.sqlInjection = await this.runSQLInjectionScan();
    
    // Process results into the expected format
    const processedResults = {
      tests: {}
    };
    
    // Process each scan result
    Object.entries(results).forEach(([key, result]) => {
      const testId = key === 'sslTls' ? 'ssl-tls-analysis' :
                    key === 'securityHeaders' ? 'security-headers' :
                    key === 'cmsDetection' ? 'cms-detection' :
                    key === 'subdomainEnumeration' ? 'subdomain-enumeration' :
                    key === 'portScanning' ? 'port-scanning' :
                    key === 'sqlInjection' ? 'sql-injection-scan' : key;
      
      processedResults.tests[testId] = {
        testId: testId,
        testName: result.scanType,
        category: key === 'sslTls' || key === 'portScanning' ? 'Infrastructure' : 
                 key === 'securityHeaders' || key === 'sqlInjection' ? 'Web Security' : 'Reconnaissance',
        severity: key === 'sslTls' || key === 'portScanning' ? 'high' : 
                 key === 'sqlInjection' ? 'critical' : 'medium',
        status: result.error ? 'failed' : 'completed',
        timestamp: new Date().toISOString(),
        findings: result.error ? [
          { type: 'error', message: `${result.scanType} failed`, details: result.error }
        ] : [
          { type: 'info', message: `${result.scanType} completed`, details: result.summary }
        ],
        recommendations: result.error ? [] : [
          `Review ${result.scanType} results`,
          'Implement security recommendations',
          'Monitor for security updates'
        ],
        report: result
      };
    });
    
    if (this.completeCallback) {
      this.completeCallback(processedResults);
    }
    
    return processedResults;
  }
}

module.exports = AdditionalSecurityScanner;
