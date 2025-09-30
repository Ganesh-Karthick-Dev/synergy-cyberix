/**
 * WSL Integration for Advanced Framework Detection
 * This module provides integration with WSL and Kali Linux tools
 * for comprehensive framework and security analysis
 */

import { spawn } from 'child_process';
import { promisify } from 'util';

class WSLFrameworkDetector {
  constructor() {
    this.wslAvailable = false;
    this.kaliAvailable = false;
    this.tools = {
      whatweb: false,
      nmap: false,
      nikto: false,
      dirb: false,
      gobuster: false,
      nuclei: false,
      subfinder: false,
      httpx: false
    };
  }

  /**
   * Check if WSL is available and working
   */
  async checkWSLAvailability() {
    try {
      const result = await this.executeWSLCommand('echo "WSL is working"');
      this.wslAvailable = result.success;
      return this.wslAvailable;
    } catch (error) {
      console.warn('WSL not available:', error.message);
      this.wslAvailable = false;
      return false;
    }
  }

  /**
   * Check if Kali Linux is available in WSL
   */
  async checkKaliAvailability() {
    try {
      const result = await this.executeWSLCommand('cat /etc/os-release | grep -i kali');
      this.kaliAvailable = result.success && result.output.includes('Kali');
      return this.kaliAvailable;
    } catch (error) {
      console.warn('Kali Linux not available:', error.message);
      this.kaliAvailable = false;
      return false;
    }
  }

  /**
   * Check which security tools are available
   */
  async checkAvailableTools() {
    if (!this.wslAvailable || !this.kaliAvailable) {
      return this.tools;
    }

    const toolChecks = [
      { name: 'whatweb', command: 'whatweb --version' },
      { name: 'nmap', command: 'nmap --version' },
      { name: 'nikto', command: 'nikto -Version' },
      { name: 'dirb', command: 'dirb' },
      { name: 'gobuster', command: 'gobuster version' },
      { name: 'nuclei', command: 'nuclei -version' },
      { name: 'subfinder', command: 'subfinder -version' },
      { name: 'httpx', command: 'httpx -version' }
    ];

    for (const tool of toolChecks) {
      try {
        const result = await this.executeWSLCommand(tool.command);
        this.tools[tool.name] = result.success;
      } catch (error) {
        this.tools[tool.name] = false;
      }
    }

    return this.tools;
  }

  /**
   * Execute a command in WSL
   */
  async executeWSLCommand(command, timeout = 30000) {
    return new Promise((resolve) => {
      const wslProcess = spawn('wsl', ['-e', 'bash', '-c', command], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      wslProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      wslProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeoutId = setTimeout(() => {
        wslProcess.kill();
        resolve({
          success: false,
          output: '',
          error: 'Command timeout',
          exitCode: -1
        });
      }, timeout);

      wslProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          success: code === 0,
          output: output.trim(),
          error: errorOutput.trim(),
          exitCode: code
        });
      });

      wslProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          output: '',
          error: error.message,
          exitCode: -1
        });
      });
    });
  }

  /**
   * Use WhatWeb for comprehensive web technology detection
   */
  async detectWithWhatWeb(url) {
    if (!this.tools.whatweb) {
      throw new Error('WhatWeb tool not available');
    }

    try {
      const command = `whatweb --no-errors --log-json=- "${url}"`;
      const result = await this.executeWSLCommand(command, 60000);
      
      if (!result.success) {
        throw new Error(`WhatWeb failed: ${result.error}`);
      }

      // Parse WhatWeb JSON output
      const lines = result.output.split('\n').filter(line => line.trim());
      const detections = [];

      for (const line of lines) {
        try {
          const detection = JSON.parse(line);
          detections.push(detection);
        } catch (parseError) {
          // Skip invalid JSON lines
        }
      }

      return this.parseWhatWebResults(detections);
    } catch (error) {
      throw new Error(`WhatWeb detection failed: ${error.message}`);
    }
  }

  /**
   * Parse WhatWeb results into our format
   */
  parseWhatWebResults(detections) {
    const result = {
      framework: 'Unknown',
      cms: 'Unknown',
      hosting: 'Unknown',
      technologies: [],
      confidence: 0,
      details: {}
    };

    if (detections.length === 0) {
      return result;
    }

    const detection = detections[0];
    const plugins = detection.plugins || {};

    // Extract framework information
    const frameworkPlugins = [
      'WordPress', 'Drupal', 'Joomla', 'Shopify', 'Magento',
      'React', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js',
      'Laravel', 'Django', 'Express', 'Flask', 'Rails'
    ];

    for (const plugin of frameworkPlugins) {
      if (plugins[plugin]) {
        result.framework = plugin;
        result.cms = plugin;
        result.confidence = 95;
        result.details.whatweb = plugins[plugin];
        break;
      }
    }

    // Extract hosting information
    const hostingPlugins = [
      'Netlify', 'Vercel', 'Firebase', 'Heroku', 'AWS',
      'Cloudflare', 'GitHub', 'GitLab'
    ];

    for (const plugin of hostingPlugins) {
      if (plugins[plugin]) {
        result.hosting = plugin;
        result.details.hosting = plugins[plugin];
        break;
      }
    }

    // Extract technologies
    const allPlugins = Object.keys(plugins);
    result.technologies = allPlugins.filter(plugin => 
      !frameworkPlugins.includes(plugin) && !hostingPlugins.includes(plugin)
    );

    return result;
  }

  /**
   * Use Nmap for service and port detection
   */
  async detectWithNmap(url) {
    if (!this.tools.nmap) {
      throw new Error('Nmap tool not available');
    }

    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');

      const command = `nmap -sV -sC -p ${port} "${hostname}"`;
      const result = await this.executeWSLCommand(command, 120000);

      if (!result.success) {
        throw new Error(`Nmap failed: ${result.error}`);
      }

      return this.parseNmapResults(result.output);
    } catch (error) {
      throw new Error(`Nmap detection failed: ${error.message}`);
    }
  }

  /**
   * Parse Nmap results
   */
  parseNmapResults(output) {
    const result = {
      services: [],
      versions: [],
      scripts: []
    };

    const lines = output.split('\n');
    let currentService = null;

    for (const line of lines) {
      if (line.includes('open')) {
        const match = line.match(/(\d+)\/(\w+)\s+open\s+(.+)/);
        if (match) {
          currentService = {
            port: match[1],
            protocol: match[2],
            service: match[3]
          };
          result.services.push(currentService);
        }
      } else if (line.includes('Service Info:') && currentService) {
        currentService.info = line.replace('Service Info:', '').trim();
      } else if (line.includes('|') && currentService) {
        result.scripts.push(line.trim());
      }
    }

    return result;
  }

  /**
   * Use Nuclei for vulnerability scanning
   */
  async detectWithNuclei(url) {
    if (!this.tools.nuclei) {
      throw new Error('Nuclei tool not available');
    }

    try {
      const command = `nuclei -u "${url}" -silent -json`;
      const result = await this.executeWSLCommand(command, 180000);

      if (!result.success) {
        throw new Error(`Nuclei failed: ${result.error}`);
      }

      return this.parseNucleiResults(result.output);
    } catch (error) {
      throw new Error(`Nuclei detection failed: ${error.message}`);
    }
  }

  /**
   * Parse Nuclei results
   */
  parseNucleiResults(output) {
    const vulnerabilities = [];
    const lines = output.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const vuln = JSON.parse(line);
        vulnerabilities.push({
          template: vuln.template_id,
          severity: vuln.info?.severity || 'unknown',
          description: vuln.info?.description || '',
          reference: vuln.info?.reference || [],
          url: vuln.matched_at
        });
      } catch (parseError) {
        // Skip invalid JSON lines
      }
    }

    return {
      vulnerabilities,
      total: vulnerabilities.length,
      critical: vulnerabilities.filter(v => v.severity === 'critical').length,
      high: vulnerabilities.filter(v => v.severity === 'high').length,
      medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      low: vulnerabilities.filter(v => v.severity === 'low').length
    };
  }

  /**
   * Use Subfinder for subdomain enumeration
   */
  async detectWithSubfinder(url) {
    if (!this.tools.subfinder) {
      throw new Error('Subfinder tool not available');
    }

    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      const command = `subfinder -d "${domain}" -silent`;
      const result = await this.executeWSLCommand(command, 120000);

      if (!result.success) {
        throw new Error(`Subfinder failed: ${result.error}`);
      }

      const subdomains = result.output.split('\n')
        .filter(line => line.trim())
        .map(line => line.trim());

      return {
        subdomains,
        total: subdomains.length
      };
    } catch (error) {
      throw new Error(`Subfinder detection failed: ${error.message}`);
    }
  }

  /**
   * Use HTTPx for HTTP probing
   */
  async detectWithHTTPx(urls) {
    if (!this.tools.httpx) {
      throw new Error('HTTPx tool not available');
    }

    try {
      const urlList = Array.isArray(urls) ? urls.join('\n') : urls;
      const command = `echo "${urlList}" | httpx -silent -json`;
      const result = await this.executeWSLCommand(command, 60000);

      if (!result.success) {
        throw new Error(`HTTPx failed: ${result.error}`);
      }

      const responses = [];
      const lines = result.output.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);
          responses.push({
            url: response.url,
            status: response.status_code,
            title: response.title,
            server: response.server,
            technologies: response.technologies || []
          });
        } catch (parseError) {
          // Skip invalid JSON lines
        }
      }

      return responses;
    } catch (error) {
      throw new Error(`HTTPx detection failed: ${error.message}`);
    }
  }

  /**
   * Comprehensive framework detection using all available tools
   */
  async comprehensiveDetection(url) {
    try {
      console.log('🔍 Starting comprehensive WSL-based framework detection...');

      // Check WSL and tool availability
      await this.checkWSLAvailability();
      if (!this.wslAvailable) {
        throw new Error('WSL is not available. Please install WSL and Kali Linux.');
      }

      await this.checkKaliAvailability();
      if (!this.kaliAvailable) {
        throw new Error('Kali Linux is not available in WSL. Please install Kali Linux.');
      }

      await this.checkAvailableTools();
      console.log('Available tools:', this.tools);

      const results = {
        url: url,
        timestamp: new Date().toISOString(),
        wslAvailable: this.wslAvailable,
        kaliAvailable: this.kaliAvailable,
        toolsAvailable: this.tools,
        detections: {}
      };

      // Run WhatWeb detection
      if (this.tools.whatweb) {
        try {
          console.log('Running WhatWeb detection...');
          results.detections.whatweb = await this.detectWithWhatWeb(url);
        } catch (error) {
          results.detections.whatweb = { error: error.message };
        }
      }

      // Run Nmap detection
      if (this.tools.nmap) {
        try {
          console.log('Running Nmap detection...');
          results.detections.nmap = await this.detectWithNmap(url);
        } catch (error) {
          results.detections.nmap = { error: error.message };
        }
      }

      // Run Nuclei vulnerability scan
      if (this.tools.nuclei) {
        try {
          console.log('Running Nuclei vulnerability scan...');
          results.detections.nuclei = await this.detectWithNuclei(url);
        } catch (error) {
          results.detections.nuclei = { error: error.message };
        }
      }

      // Run Subfinder for subdomain enumeration
      if (this.tools.subfinder) {
        try {
          console.log('Running Subfinder subdomain enumeration...');
          results.detections.subfinder = await this.detectWithSubfinder(url);
        } catch (error) {
          results.detections.subfinder = { error: error.message };
        }
      }

      // Analyze and combine results
      const analysis = this.analyzeComprehensiveResults(results.detections);
      results.framework = analysis.framework;
      results.cms = analysis.cms;
      results.hosting = analysis.hosting;
      results.technologies = analysis.technologies;
      results.confidence = analysis.confidence;
      results.vulnerabilities = analysis.vulnerabilities;

      console.log('✅ Comprehensive WSL-based detection completed');
      return results;

    } catch (error) {
      console.error('Comprehensive WSL detection failed:', error);
      return {
        url: url,
        timestamp: new Date().toISOString(),
        error: error.message,
        wslAvailable: this.wslAvailable,
        kaliAvailable: this.kaliAvailable,
        toolsAvailable: this.tools
      };
    }
  }

  /**
   * Analyze comprehensive detection results
   */
  analyzeComprehensiveResults(detections) {
    const analysis = {
      framework: 'Unknown',
      cms: 'Unknown',
      hosting: 'Unknown',
      technologies: [],
      confidence: 0,
      vulnerabilities: {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };

    // Process WhatWeb results
    if (detections.whatweb && !detections.whatweb.error) {
      analysis.framework = detections.whatweb.framework;
      analysis.cms = detections.whatweb.cms;
      analysis.hosting = detections.whatweb.hosting;
      analysis.technologies = [...new Set([...analysis.technologies, ...detections.whatweb.technologies])];
      analysis.confidence = Math.max(analysis.confidence, detections.whatweb.confidence);
    }

    // Process Nuclei results
    if (detections.nuclei && !detections.nuclei.error) {
      analysis.vulnerabilities = detections.nuclei;
    }

    // Process Nmap results
    if (detections.nmap && !detections.nmap.error) {
      const services = detections.nmap.services || [];
      services.forEach(service => {
        if (service.service && !analysis.technologies.includes(service.service)) {
          analysis.technologies.push(service.service);
        }
      });
    }

    return analysis;
  }
}

export default WSLFrameworkDetector;
