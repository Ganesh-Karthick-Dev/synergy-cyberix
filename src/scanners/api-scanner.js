const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { runWSLRaw, runWSLAsRoot } = require('../utils/wslHelper');

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

  async startCapture(targetUrl, duration = 120) {
    this.log(`🚀 Starting network traffic capture for ${targetUrl}...`, 20);
    
    try {
      const domain = await this.extractDomain(targetUrl);
      const networkInterface = await this.getNetworkInterface();
      const timestamp = Date.now();
      const outputFile = `/tmp/api_capture_${timestamp}.json`;
      
      // Command 1: Basic API Traffic Capture (JSON output)
      // Separate stdout and stderr - send JSON to file, errors to separate file
      const errorFile = `/tmp/api_capture_${timestamp}_errors.txt`;
      const captureCmd = `bash -c 'sudo tshark -i ${networkInterface} -T json -f "host ${domain}" -a duration:${duration} > ${outputFile} 2> ${errorFile} || true'`;
      this.log(`🔧 [TSHARK] Starting traffic capture...`, 25, `sudo tshark -i ${networkInterface} -T json -f "host ${domain}" -a duration:${duration} > ${outputFile} 2> ${errorFile}`);
      
      const result = await runWSLAsRoot(captureCmd);
      
      // Check for errors in stderr file
      const errorCheckCmd = `bash -c 'cat ${errorFile} 2>/dev/null || echo ""'`;
      const errorCheckResult = await runWSLRaw(errorCheckCmd);
      if (errorCheckResult.success && errorCheckResult.stdout && errorCheckResult.stdout.trim()) {
        this.log(`⚠️ [TSHARK] Warnings/Errors:\n${errorCheckResult.stdout.substring(0, 500)}`, 30);
      }
      
      // Read the captured JSON file
      const readCmd = `bash -c 'cat ${outputFile} 2>/dev/null || echo "[]"'`;
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
          this.log(`📦 Captured ${Array.isArray(jsonData) ? jsonData.length : 0} packets`, 50);
          
          if (!Array.isArray(jsonData)) {
            this.log(`⚠️ JSON is not an array, got: ${typeof jsonData}`, 50);
            return { endpoints: [], requests: [], responses: [], summary: {}, error: 'Tshark output is not a valid JSON array' };
          }
          
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
        const ip = layers.ip || {};
        const tcp = layers.tcp || {};
        const frame = layers.frame || {};
        const frameNumber = frame['frame.number']?.[0];
        const frameTime = parseFloat(frame['frame.time_epoch']?.[0] || frame['frame.time_relative']?.[0] || 0);
        
        if (frameNumber) {
          frameTimes.set(frameNumber, frameTime);
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
