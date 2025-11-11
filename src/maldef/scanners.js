// Modular scanner functions for malware and defacement monitoring
// All commands are exact and reproducible in WSL terminal
// Uses child_process.spawn() for real-time stdout/stderr streaming

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * Execute WSL command with real-time streaming
 * @param {string} distro - WSL distribution name (e.g., 'kali-linux', 'Ubuntu')
 * @param {string} command - Exact command to run (must be reproducible in terminal)
 * @param {Function} onOutput - Callback for stdout data (data: string)
 * @param {Function} onError - Callback for stderr data (data: string)
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
function runWslCommandStreaming(distro, command, onOutput = null, onError = null) {
  return new Promise((resolve) => {
    const args = ['-d', distro, '--', 'sh', '-lc', command]
    const child = spawn('wsl.exe', args, { 
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      if (onOutput) onOutput(text)
    })
    
    child.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      if (onError) onError(text)
    })
    
    child.on('close', (code) => {
      resolve({ code, stdout, stderr })
    })
    
    child.on('error', (err) => {
      const errorMsg = String(err?.message || err)
      stderr += errorMsg
      if (onError) onError(errorMsg)
      resolve({ code: -1, stdout, stderr })
    })
  })
}

/**
 * Module 1: Remote URL Scanners (No server access needed)
 */

/**
 * Nikto web vulnerability scanner
 * Command: nikto -h <URL> -output <output_file> -Format json
 */
async function scanWithNikto(distro, targetUrl, outputDir, onProgress) {
  const outputFile = path.join(outputDir, 'nikto_report.json')
  const linuxOutputFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/nikto_report.json`
  
  // Exact command as run in terminal
  const command = `nikto -h "${targetUrl}" -output "${linuxOutputFile}" -Format json || echo '{"error":"nikto_failed"}' > "${linuxOutputFile}"`
  
  onProgress?.({ tool: 'nikto', stage: 'starting', message: `Running nikto scan on ${targetUrl}...` })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'nikto', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'nikto', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse JSON output
  let jsonResult = null
  try {
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf8')
      jsonResult = JSON.parse(content)
    }
  } catch (e) {
    onProgress?.({ tool: 'nikto', stage: 'warning', message: `Failed to parse nikto JSON: ${e.message}` })
  }
  
  return {
    tool: 'nikto',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    json: jsonResult,
    outputFile
  }
}

/**
 * Wapiti web vulnerability scanner
 * Command: wapiti -u <URL> --format json -o <output_dir>
 */
async function scanWithWapiti(distro, targetUrl, outputDir, onProgress) {
  const outputPath = path.join(outputDir, 'wapiti_report')
  const linuxOutputPath = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/wapiti_report`
  
  // Exact command as run in terminal
  const command = `wapiti -u "${targetUrl}" --format json -o "${linuxOutputPath}" || echo '{"error":"wapiti_failed"}'`
  
  onProgress?.({ tool: 'wapiti', stage: 'starting', message: `Running wapiti scan on ${targetUrl}...` })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'wapiti', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'wapiti', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Try to find JSON report
  let jsonResult = null
  try {
    const jsonFile = path.join(outputPath, 'wapiti.json')
    if (fs.existsSync(jsonFile)) {
      const content = fs.readFileSync(jsonFile, 'utf8')
      jsonResult = JSON.parse(content)
    }
  } catch (e) {
    onProgress?.({ tool: 'wapiti', stage: 'warning', message: `Failed to parse wapiti JSON: ${e.message}` })
  }
  
  return {
    tool: 'wapiti',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    json: jsonResult,
    outputPath
  }
}

/**
 * WPScan WordPress vulnerability scanner
 * Command: wpscan --url <URL> --format json --output <output_file>
 */
async function scanWithWpscan(distro, targetUrl, outputDir, onProgress) {
  const outputFile = path.join(outputDir, 'wpscan_report.json')
  const linuxOutputFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/wpscan_report.json`
  
  // Exact command as run in terminal
  const command = `wpscan --url "${targetUrl}" --format json --output "${linuxOutputFile}" --no-update || echo '{"error":"wpscan_failed"}' > "${linuxOutputFile}"`
  
  onProgress?.({ tool: 'wpscan', stage: 'starting', message: `Running wpscan on ${targetUrl}...` })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'wpscan', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'wpscan', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse JSON output
  let jsonResult = null
  try {
    if (fs.existsSync(outputFile)) {
      const content = fs.readFileSync(outputFile, 'utf8')
      jsonResult = JSON.parse(content)
    }
  } catch (e) {
    onProgress?.({ tool: 'wpscan', stage: 'warning', message: `Failed to parse wpscan JSON: ${e.message}` })
  }
  
  return {
    tool: 'wpscan',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    json: jsonResult,
    outputFile
  }
}

/**
 * Module 2: Malware & File Scanners
 */

/**
 * ClamAV antivirus scanner
 * Command: clamscan -r -i <target_dir> --log=<log_file>
 */
async function scanWithClamav(distro, targetDir, outputDir, onProgress) {
  const logFile = path.join(outputDir, 'clamav_scan.log')
  const linuxTargetDir = `/mnt/${targetDir.charAt(0).toLowerCase()}${targetDir.slice(2).replace(/\\/g, '/')}`
  const linuxLogFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/clamav_scan.log`
  
  // Exact command as run in terminal
  const command = `clamscan -r -i "${linuxTargetDir}" --log="${linuxLogFile}" || true`
  
  onProgress?.({ tool: 'clamav', stage: 'starting', message: `Running ClamAV scan on ${targetDir}...` })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'clamav', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'clamav', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse ClamAV output
  const infectedFiles = []
  const infectedCount = (result.stdout.match(/Infected files:\s*(\d+)/i) || [])[1] || '0'
  const lines = result.stdout.split('\n')
  
  for (const line of lines) {
    const match = line.match(/^(.+?):\s*(.+?)\s+FOUND$/i)
    if (match) {
      infectedFiles.push({
        file: match[1].trim(),
        signature: match[2].trim()
      })
    }
  }
  
  return {
    tool: 'clamav',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    infectedCount: parseInt(infectedCount, 10),
    infectedFiles,
    logFile: fs.existsSync(logFile) ? logFile : null
  }
}

/**
 * YARA pattern matching scanner
 * Command: yara -r <rule_file> <target_dir>
 */
async function scanWithYara(distro, ruleFile, targetDir, outputDir, onProgress) {
  const linuxRuleFile = ruleFile.startsWith('/') ? ruleFile : `/mnt/${ruleFile.charAt(0).toLowerCase()}${ruleFile.slice(2).replace(/\\/g, '/')}`
  const linuxTargetDir = `/mnt/${targetDir.charAt(0).toLowerCase()}${targetDir.slice(2).replace(/\\/g, '/')}`
  
  // Exact command as run in terminal
  const command = `yara -r "${linuxRuleFile}" "${linuxTargetDir}" || echo "yara_not_installed"`
  
  onProgress?.({ tool: 'yara', stage: 'starting', message: `Running YARA scan with rules ${ruleFile}...`, command })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'yara', stage: 'running', message: data.trim(), raw: data, command }),
    (data) => onProgress?.({ tool: 'yara', stage: 'error', message: data.trim(), raw: data, command })
  )
  
  // Parse YARA matches
  const matches = []
  const lines = result.stdout.split('\n').filter(l => l.trim() && !l.includes('yara_not_installed'))
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const file = line.slice(0, colonIndex).trim()
      const rule = line.slice(colonIndex + 1).trim()
      matches.push({ file, rule })
    } else {
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 2) {
        matches.push({ rule: parts[0], file: parts.slice(1).join(' ') })
      } else if (parts.length === 1 && parts[0]) {
        matches.push({ rule: parts[0], file: '' })
      }
    }
  }
  
  return {
    tool: 'yara',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    matches,
    matchCount: matches.length
  }
}

/**
 * RKHunter rootkit scanner
 * Command: rkhunter --check --skip-keypress --report-warnings-only
 */
async function scanWithRkhunter(distro, outputDir, onProgress) {
  const reportFile = path.join(outputDir, 'rkhunter_report.log')
  const linuxReportFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/rkhunter_report.log`
  
  // Exact command as run in terminal
  const command = `rkhunter --check --skip-keypress --report-warnings-only --logfile "${linuxReportFile}" || true`
  
  onProgress?.({ tool: 'rkhunter', stage: 'starting', message: 'Running RKHunter rootkit scan...' })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'rkhunter', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'rkhunter', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse warnings
  const warnings = []
  const lines = result.stdout.split('\n')
  for (const line of lines) {
    if (line.includes('Warning:') || line.includes('Found:')) {
      warnings.push(line.trim())
    }
  }
  
  return {
    tool: 'rkhunter',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    warnings,
    warningCount: warnings.length,
    reportFile: fs.existsSync(reportFile) ? reportFile : null
  }
}

/**
 * Chkrootkit rootkit scanner
 * Command: chkrootkit
 */
async function scanWithChkrootkit(distro, outputDir, onProgress) {
  const reportFile = path.join(outputDir, 'chkrootkit_report.log')
  const linuxReportFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/chkrootkit_report.log`
  
  // Exact command as run in terminal
  const command = `chkrootkit > "${linuxReportFile}" 2>&1 || true`
  
  onProgress?.({ tool: 'chkrootkit', stage: 'starting', message: 'Running chkrootkit scan...' })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'chkrootkit', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'chkrootkit', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse suspicious findings
  const findings = []
  const lines = result.stdout.split('\n')
  for (const line of lines) {
    if (line.includes('INFECTED') || line.includes('Warning:') || line.includes('ROOTDIR')) {
      findings.push(line.trim())
    }
  }
  
  return {
    tool: 'chkrootkit',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    findings,
    findingCount: findings.length,
    reportFile: fs.existsSync(reportFile) ? reportFile : null
  }
}

/**
 * Module 3: System Auditing
 */

/**
 * Lynis system audit
 * Command: lynis audit system --quick
 */
async function scanWithLynis(distro, outputDir, onProgress) {
  const reportFile = path.join(outputDir, 'lynis_report.log')
  const linuxReportFile = `/mnt/${outputDir.charAt(0).toLowerCase()}${outputDir.slice(2).replace(/\\/g, '/')}/lynis_report.log`
  
  // Exact command as run in terminal
  const command = `lynis audit system --quick > "${linuxReportFile}" 2>&1 || true`
  
  onProgress?.({ tool: 'lynis', stage: 'starting', message: 'Running Lynis system audit...' })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'lynis', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'lynis', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse score and warnings
  const scoreMatch = result.stdout.match(/Lynis security score:\s*(\d+)/i)
  const score = scoreMatch ? parseInt(scoreMatch[1], 10) : null
  
  const warnings = []
  const lines = result.stdout.split('\n')
  for (const line of lines) {
    if (line.includes('Warning') || line.includes('Suggestion')) {
      warnings.push(line.trim())
    }
  }
  
  return {
    tool: 'lynis',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    score,
    warnings,
    warningCount: warnings.length,
    reportFile: fs.existsSync(reportFile) ? reportFile : null
  }
}

/**
 * Module 4: Network Capture (optional, for advanced monitoring)
 */

/**
 * Get HTTP headers for analysis
 * Command: curl -I <URL>
 */
async function getHttpHeaders(distro, targetUrl, onProgress) {
  // Exact command as run in terminal
  const command = `curl -I "${targetUrl}" 2>&1 || echo "curl_failed"`
  
  onProgress?.({ tool: 'curl', stage: 'starting', message: `Fetching headers from ${targetUrl}...` })
  
  const result = await runWslCommandStreaming(
    distro,
    command,
    (data) => onProgress?.({ tool: 'curl', stage: 'running', message: data.trim(), raw: data }),
    (data) => onProgress?.({ tool: 'curl', stage: 'error', message: data.trim(), raw: data })
  )
  
  // Parse headers
  const headers = {}
  const lines = result.stdout.split('\n')
  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 1).trim()
      headers[key.toLowerCase()] = value
    }
  }
  
  return {
    tool: 'curl',
    command,
    exitCode: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    headers
  }
}

module.exports = {
  runWslCommandStreaming,
  // Remote URL scanners
  scanWithNikto,
  scanWithWapiti,
  scanWithWpscan,
  // Malware scanners
  scanWithClamav,
  scanWithYara,
  scanWithRkhunter,
  scanWithChkrootkit,
  // System auditing
  scanWithLynis,
  // Network tools
  getHttpHeaders
}

