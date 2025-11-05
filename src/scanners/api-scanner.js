const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { runWSLRaw, runWSLAsRoot } = require('../utils/wslHelper');

class APIScanner {
  constructor(targetUrl, outputDir = './temp-api-scans') {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
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
      // Try to get the default interface
      const ifaceCmd = `bash -c 'ip route | grep default | awk "{print \\$5}" | head -1'`;
      const result = await runWSLRaw(ifaceCmd);
      
      if (result.success && result.stdout.trim()) {
        const iface = result.stdout.trim();
        this.log(`✅ Using network interface: ${iface}`, 18);
        return iface;
      } else {
        // Fallback to eth0
        this.log('⚠️ Using default interface: eth0', 18);
        return 'eth0';
      }
    } catch (error) {
      this.log('⚠️ Using default interface: eth0', 18);
      return 'eth0';
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

  async startCapture(targetUrl, duration = 30) {
    this.log(`🚀 Starting network traffic capture for ${targetUrl}...`, 20);
    
    try {
      const domain = await this.extractDomain(targetUrl);
      const networkInterface = await this.getNetworkInterface();
      const timestamp = Date.now();
      const outputFile = `/tmp/api_capture_${timestamp}.json`;
      
      // Command 1: Basic API Traffic Capture (JSON output)
      const captureCmd = `bash -c 'sudo tshark -i ${networkInterface} -T json -f "host ${domain}" -a duration:${duration} > ${outputFile} 2>&1'`;
      this.log(`🔧 [TSHARK] Starting traffic capture...`, 25, `sudo tshark -i ${networkInterface} -T json -f "host ${domain}" -a duration:${duration} > ${outputFile}`);
      
      const result = await runWSLAsRoot(captureCmd);
      
      if (result.success) {
        // Read the captured file
        const readCmd = `bash -c 'cat ${outputFile} 2>/dev/null || echo "[]"'`;
        const readResult = await runWSLRaw(readCmd);
        
        if (readResult.success && readResult.stdout) {
          try {
            // Parse JSON output
            const jsonData = JSON.parse(readResult.stdout);
            this.log(`📦 Captured ${Array.isArray(jsonData) ? jsonData.length : 0} packets`, 50);
            
            // Parse captured data
            const parsedData = this.parseTsharkOutput(jsonData, targetUrl);
            this.captureData = parsedData;
            
            // Log JSON results
            console.log(`\n[API-Scanner] 📄 [TSHARK] JSON Results:`);
            console.log(JSON.stringify(parsedData, null, 2));
            this.log(`📄 [TSHARK] JSON Results:\n${JSON.stringify(parsedData, null, 2)}`, 60);
            
            return parsedData;
          } catch (parseError) {
            this.log(`⚠️ Failed to parse JSON output: ${parseError.message}`, 50);
            this.log(`📤 Raw output:\n${readResult.stdout.substring(0, 1000)}`, 50);
            return { endpoints: [], requests: [], responses: [], summary: {}, error: parseError.message };
          }
        } else {
          this.log(`⚠️ No capture data found`, 50);
          return { endpoints: [], requests: [], responses: [], summary: {} };
        }
      } else {
        this.log(`❌ Capture failed: ${result.error || result.stderr}`, 50);
        return { endpoints: [], requests: [], responses: [], summary: {}, error: result.error || result.stderr };
      }
    } catch (error) {
      this.log(`❌ Capture error: ${error.message}`, 50);
      return { endpoints: [], requests: [], responses: [], summary: {}, error: error.message };
    }
  }

  parseTsharkOutput(jsonData, targetUrl) {
    const endpoints = [];
    const requests = [];
    const responses = [];
    const endpointMap = new Map();
    
    if (!Array.isArray(jsonData)) {
      return { endpoints: [], requests: [], responses: [], summary: {} };
    }
    
    for (const packet of jsonData) {
      try {
        const layers = packet?._source?.layers || {};
        const http = layers.http || {};
        const ip = layers.ip || {};
        const tcp = layers.tcp || {};
        
        // Extract HTTP request
        if (http['http.request.method']) {
          const method = http['http.request.method'][0];
          const uri = http['http.request.uri']?.[0] || '/';
          const fullUrl = `${targetUrl}${uri.startsWith('/') ? '' : '/'}${uri}`;
          
          const request = {
            timestamp: packet._source.layers.frame?.['frame.time']?.[0] || new Date().toISOString(),
            method: method,
            uri: uri,
            url: fullUrl,
            src_ip: ip['ip.src']?.[0] || '',
            dst_ip: ip['ip.dst']?.[0] || '',
            src_port: tcp['tcp.srcport']?.[0] || '',
            dst_port: tcp['tcp.dstport']?.[0] || '',
            headers: this.extractHeaders(http, 'request')
          };
          
          requests.push(request);
          
          // Track unique endpoints
          const endpointKey = `${method} ${uri}`;
          if (!endpointMap.has(endpointKey)) {
            endpoints.push({
              method: method,
              path: uri,
              url: fullUrl,
              request_count: 1
            });
            endpointMap.set(endpointKey, endpoints.length - 1);
          } else {
            const idx = endpointMap.get(endpointKey);
            endpoints[idx].request_count++;
          }
        }
        
        // Extract HTTP response
        if (http['http.response.code']) {
          const statusCode = parseInt(http['http.response.code'][0]) || 0;
          const uri = http['http.request.uri']?.[0] || http['http.response.uri']?.[0] || '/';
          
          const response = {
            timestamp: packet._source.layers.frame?.['frame.time']?.[0] || new Date().toISOString(),
            status_code: statusCode,
            uri: uri,
            src_ip: ip['ip.src']?.[0] || '',
            dst_ip: ip['ip.dst']?.[0] || '',
            headers: this.extractHeaders(http, 'response'),
            content_type: http['http.content_type']?.[0] || '',
            content_length: http['http.content_length']?.[0] || ''
          };
          
          responses.push(response);
        }
      } catch (error) {
        // Skip malformed packets
        continue;
      }
    }
    
    // Calculate summary
    const summary = {
      total_packets: jsonData.length,
      total_requests: requests.length,
      total_responses: responses.length,
      unique_endpoints: endpoints.length,
      status_codes: this.calculateStatusCodes(responses),
      methods: this.calculateMethods(requests),
      avg_response_time: this.calculateAvgResponseTime(requests, responses)
    };
    
    return {
      endpoints,
      requests,
      responses,
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

  calculateStatusCodes(responses) {
    const codes = {};
    for (const response of responses) {
      const code = response.status_code || 0;
      codes[code] = (codes[code] || 0) + 1;
    }
    return codes;
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
    // This is a simplified calculation
    // In real tshark output, you'd need to match request/response pairs
    if (responses.length === 0) return 0;
    
    // Placeholder - would need frame.time_relative from tshark
    return 0;
  }

  async performScan() {
    try {
      await this.ensureOutputDir();
      
      this.log('🚀 Starting API endpoint scan with Wireshark/tshark...', 5);
      
      // Start capture (tshark should already be installed at app startup)
      this.log('📡 Starting network traffic capture...', 20);
      const captureData = await this.startCapture(this.targetUrl, 30);
      
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
      const htmlPath = path.join(this.outputDir, 'api-scan-report.html');
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
    <p><strong>Duration:</strong> 30 seconds</p>
  </div>
  
  <div class="card">
    <h2>🌐 Discovered Endpoints</h2>
    ${endpoints.length > 0 ? `
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path</th>
            <th>URL</th>
            <th>Request Count</th>
          </tr>
        </thead>
        <tbody>
          ${endpoints.map(ep => `
            <tr>
              <td><strong>${ep.method}</strong></td>
              <td><code>${ep.path}</code></td>
              <td>${ep.url}</td>
              <td>${ep.request_count}</td>
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
            <th>Source IP</th>
            <th>Destination IP</th>
          </tr>
        </thead>
        <tbody>
          ${requests.slice(0, 50).map(req => `
            <tr>
              <td>${req.timestamp}</td>
              <td><strong>${req.method}</strong></td>
              <td><code>${req.uri}</code></td>
              <td>${req.src_ip}</td>
              <td>${req.dst_ip}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p>No requests captured.</p>'}
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
