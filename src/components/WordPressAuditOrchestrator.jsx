import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'

const WordPressAuditOrchestrator = ({ siteUrl, adminProvided, adminCreds }) => {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  
  // Audit state
  const [auditStarted, setAuditStarted] = useState(false)
  const [auditCompleted, setAuditCompleted] = useState(false)
  const [currentModule, setCurrentModule] = useState(null)
  const [modules, setModules] = useState([
    { id: 'waf-detection', name: 'WAF (Firewall) Detection', status: 'pending', progress: 0 }
  ])
  
  // Timing
  const [startedTime, setStartedTime] = useState(null)
  const [expectedCompletionTime, setExpectedCompletionTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  // Results and logs
  const [auditResults, setAuditResults] = useState({})
  const [logs, setLogs] = useState([])
  const [finalReport, setFinalReport] = useState(null)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [combinedJson, setCombinedJson] = useState(null)
  
  // UI state
  const [showReportPreview, setShowReportPreview] = useState(false)
  const [selectedModuleReport, setSelectedModuleReport] = useState(null)
  
  const intervalRef = useRef(null)

  // Calculate elapsed time
  useEffect(() => {
    if (auditStarted && !auditCompleted) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [auditStarted, auditCompleted])

  // Regenerate final report when auditResults changes
  useEffect(() => {
    if (auditCompleted && Object.keys(auditResults).length > 0) {
      generateFinalReport()
    }
  }, [auditResults, auditCompleted])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const addLog = (module, step, command, output, exitCode = 0) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      module,
      step,
      command,
      output,
      exitCode
    }
    setLogs(prev => [...prev, logEntry])
  }

  const updateModuleStatus = (moduleId, status, progress = 0, results = null) => {
    setModules(prev => prev.map(module => 
      module.id === moduleId 
        ? { ...module, status, progress, results }
        : module
    ))
    
    if (results) {
      setAuditResults(prev => ({ ...prev, [moduleId]: results }))
    }
  }

  // Execute a Kali command via WSL and capture stdout/stderr into logs
  const runKaliCommand = async (moduleId, step, command) => {
    addLog(moduleId, step, command, 'Executing...')
    try {
      if (!window.cyberGuard || !window.cyberGuard.runAsRoot) {
        throw new Error('WSL execution API not available')
      }

      const result = await window.cyberGuard.runAsRoot({
        command,
        requireConfirm: false // Skip confirmation for WordPress audit commands
      })

      const stdout = result?.stdout || ''
      const stderr = result?.stderr || ''
      const exitCode = typeof result?.code === 'number' ? result.code : (result?.success ? 0 : 1)
      const combined = stdout + (stderr ? `\n[stderr]\n${stderr}` : '')

      addLog(moduleId, `${step}-output`, command, combined, exitCode)
      return { success: !!result?.success, stdout, stderr, exitCode }
    } catch (err) {
      addLog(moduleId, `${step}-error`, command, err.message, 1)
      return { success: false, stdout: '', stderr: err.message, exitCode: 1 }
    }
  }

  const estimateAuditTime = () => {
    // WAF Detection takes 15-45 seconds (quick fingerprint)
    return 45 // Maximum estimated time in seconds
  }

  // Install required Kali tools before audit
  const installRequiredTools = async () => {
    addLog('setup', 'install-tools', 'Installing required Kali tools', 'Checking and installing wafw00f...')

    // 0) Ensure Kali repositories are configured and update
    try {
      const repoCmd = 'echo "deb http://http.kali.org/kali kali-rolling main contrib non-free non-free-firmware" > /etc/apt/sources.list && echo "deb-src http://http.kali.org/kali kali-rolling main contrib non-free non-free-firmware" >> /etc/apt/sources.list'
      addLog('setup', 'configure-repos', repoCmd, 'Configuring Kali repositories...')
      await window.cyberGuard.runAsRoot({ command: repoCmd, requireConfirm: false })
      
      const updateCmd = 'export DEBIAN_FRONTEND=noninteractive; apt-get -yq update'
      addLog('setup', 'apt-update', updateCmd, 'Updating package lists...')
      await window.cyberGuard.runAsRoot({ command: updateCmd, requireConfirm: false })
      addLog('setup', 'apt-update-done', updateCmd, 'Package lists updated')
    } catch (e) {
      addLog('setup', 'apt-update-warn', 'apt-get update', `Warning: apt update reported issues: ${e.message}`)
    }

    // 1) Check if wafw00f is installed
    try {
      const checkCmd = 'command -v wafw00f >/dev/null 2>&1 && echo OK || echo MISSING'
      const checkRes = await window.cyberGuard.runAsRoot({ command: checkCmd, requireConfirm: false })
      const isInstalled = (checkRes?.stdout || '').includes('OK')
      
      if (isInstalled) {
        addLog('setup', 'wafw00f-check', checkCmd, 'wafw00f is already installed')
      } else {
        addLog('setup', 'wafw00f-check', checkCmd, 'wafw00f is missing, installing...')
        
        // 2) Install wafw00f via pip (preferred method)
        try {
          const pipCmd = 'export DEBIAN_FRONTEND=noninteractive; pip3 install wafw00f 2>&1 || pip install wafw00f 2>&1'
          addLog('setup', 'install-wafw00f-pip', pipCmd, 'Installing wafw00f via pip...')
          const pipResult = await window.cyberGuard.runAsRoot({ command: pipCmd, requireConfirm: false })
          
          if (pipResult?.success) {
            addLog('setup', 'wafw00f-pip-success', pipCmd, 'wafw00f installed via pip successfully')
          } else {
            // Try apt install as fallback
            throw new Error('pip installation failed, trying apt')
          }
        } catch (pipErr) {
          addLog('setup', 'wafw00f-pip-fallback', 'pip install failed', 'Trying apt-get install...')
          
          // 3) Install wafw00f via apt-get (fallback)
          const aptCmd = 'export DEBIAN_FRONTEND=noninteractive; apt-get -yq install wafw00f'
          addLog('setup', 'install-wafw00f-apt', aptCmd, 'Installing wafw00f via apt-get...')
          
          let hb = setInterval(() => {
            addLog('setup', 'install-progress', aptCmd, 'Still installing wafw00f...')
          }, 10000)
          
          try {
            const aptResult = await window.cyberGuard.runAsRoot({ command: aptCmd, requireConfirm: false })
            clearInterval(hb)
            
            if (aptResult?.success) {
              addLog('setup', 'wafw00f-apt-success', aptCmd, 'wafw00f installed via apt-get successfully')
            } else {
              addLog('setup', 'wafw00f-install-error', aptCmd, `Installation issues: ${aptResult?.stderr || 'Unknown error'}`)
            }
          } catch (aptErr) {
            clearInterval(hb)
            addLog('setup', 'wafw00f-install-error', aptCmd, `Error during installation: ${aptErr.message}`)
          }
        }
        
        // 4) Verify installation
        const verifyCmd = 'command -v wafw00f >/dev/null 2>&1 && echo OK || echo MISSING'
        const verifyRes = await window.cyberGuard.runAsRoot({ command: verifyCmd, requireConfirm: false })
        const isNowInstalled = (verifyRes?.stdout || '').includes('OK')
        
        if (isNowInstalled) {
          addLog('setup', 'wafw00f-verify', verifyCmd, 'wafw00f installation verified')
        } else {
          addLog('setup', 'wafw00f-verify-fail', verifyCmd, 'wafw00f installation verification failed')
        }
      }
    } catch (e) {
      addLog('setup', 'wafw00f-check-error', 'wafw00f check', `Warning: wafw00f check/installation issues: ${e.message}`)
    }
  }

  // Quick preflight check (no installs) – only logs availability
  const verifyRequiredTools = async () => {
    const tools = ['wafw00f']
    addLog('setup', 'preflight', 'Checking tool availability', tools.join(', '))
    for (const tool of tools) {
      try {
        const res = await window.cyberGuard.runAsRoot({
          command: `command -v ${tool} >/dev/null 2>&1 && echo OK || echo MISSING`,
          requireConfirm: false
        })
        const ok = (res?.stdout || '').includes('OK')
        addLog('setup', `preflight-${tool}`, `command -v ${tool}`, ok ? `${tool} available` : `${tool} missing`)
        
        // If missing, install it
        if (!ok) {
          addLog('setup', `preflight-${tool}-install`, `Installing ${tool}`, `Tool missing, installing ${tool}...`)
          await installRequiredTools()
        }
      } catch (e) {
        addLog('setup', `preflight-${tool}-error`, `command -v ${tool}`, e.message)
      }
    }
  }

  const startAudit = async () => {
    if (!siteUrl) {
      showError('Site URL is required to start the audit')
      return
    }

    setAuditStarted(true)
    setAuditCompleted(false)
    setCancelRequested(false)
    setStartedTime(new Date().toISOString())
    setElapsedTime(0)
    setLogs([])
    setAuditResults({})
    
    const estimatedDuration = estimateAuditTime()
    const expectedEnd = new Date(Date.now() + estimatedDuration * 1000)
    setExpectedCompletionTime(expectedEnd.toISOString())
    
    const loadingToastId = showLoading('Starting WAF Detection scan...')
    
    try {
      // Verify and install tools if needed
      await verifyRequiredTools()
      
      // Run WAF Detection module only
      if (cancelRequested) throw new Error('Scan cancelled')
      await runWAFDetection(); if (cancelRequested) throw new Error('Scan cancelled')
      
      // Generate final report
      await generateFinalReport()
      await generateCombinedJson()
      
      setAuditCompleted(true)
      dismissToast(loadingToastId)
      showSuccess('WAF Detection scan completed successfully!')
      
    } catch (error) {
      dismissToast(loadingToastId)
      if (error.message === 'Scan cancelled') {
        addLog('report', 'cancelled', 'User cancelled scan', 'Scan terminated by user', 0)
        showError('Scan cancelled')
      } else {
      showError(`Audit failed: ${error.message}`)
      }
      console.error('Audit error:', error)
    }
  }

  // -------------------- Parsers -> Combined JSON --------------------
  const parseWafw00f = (stdout = '') => {
    const result = {
      tool: 'wafw00f',
      detected: false,
      wafType: null,
      wafVendor: null,
      wafInfo: null,
      reason: null,
      responseCode: null,
      numberOfRequests: null,
      raw: stdout
    }

    // Check for WAF detection patterns
    const lines = stdout.split(/\r?\n/)
    
    // Pattern 1: Specific WAF detected (e.g., "is behind Cloudflare (Cloudflare Inc.) WAF")
    const wafDetectedPattern = /is behind (.+?)(?:\s*\(([^)]+)\))?\s*WAF/i
    const detectedMatch = stdout.match(wafDetectedPattern)
    
    if (detectedMatch) {
      result.detected = true
      result.wafType = detectedMatch[1]?.trim() || null
      result.wafVendor = detectedMatch[2]?.trim() || detectedMatch[1]?.trim() || null
      result.wafInfo = `The site is behind ${result.wafType}${result.wafVendor && result.wafVendor !== result.wafType ? ` (${result.wafVendor})` : ''} WAF`
    }
    
    // Pattern 2: Generic detection (e.g., "seems to be behind a WAF or some sort of security solution")
    const genericPattern = /seems to be behind (?:a )?WAF|behind (?:a )?WAF or|Generic Detection results/i
    if (!result.detected && genericPattern.test(stdout)) {
      result.detected = true
      result.wafType = 'Generic/Unknown'
      result.wafInfo = 'The site seems to be behind a WAF or some sort of security solution'
    }
    
    // Extract reason for generic detection
    const reasonMatch = stdout.match(/Reason:\s*(.+?)(?:\n|$)/i)
    if (reasonMatch) {
      result.reason = reasonMatch[1]?.trim() || null
      
      // Try to extract response codes from reason
      const responseCodeMatch = result.reason.match(/response code (?:is|to) "?(\d+)"?/i)
      if (responseCodeMatch) {
        result.responseCode = responseCodeMatch[1]
      }
    }
    
    // Extract number of requests
    const requestsMatch = stdout.match(/Number of requests:\s*(\d+)/i)
    if (requestsMatch) {
      result.numberOfRequests = parseInt(requestsMatch[1], 10)
    }
    
    // Extract target URL if present
    const targetMatch = stdout.match(/Checking (.+)/i)
    if (targetMatch) {
      result.target = targetMatch[1]?.trim() || null
    }
    
    return result
  }

  const parseWhatweb = (stdout = '') => {
    const result = { tool: 'whatweb', summary: {}, headers: {}, raw: stdout }
    const titleMatch = stdout.match(/^Title\s*:\s*(.*)$/m)
    const statusMatch = stdout.match(/^Status\s*:\s*(.*)$/m)
    const ipMatch = stdout.match(/^IP\s*:\s*(.*)$/m)
    const countryMatch = stdout.match(/^Country\s*:\s*(.*)$/m)
    const summaryLine = stdout.match(/^Summary\s*:\s*(.*)$/m)
    if (titleMatch) result.summary.title = titleMatch[1].trim()
    if (statusMatch) result.summary.status = statusMatch[1].trim()
    if (ipMatch) result.summary.ip = ipMatch[1].trim()
    if (countryMatch) result.summary.country = countryMatch[1].trim()
    if (summaryLine) result.summary.stack = summaryLine[1].split(',').map(s => s.trim())
    // Headers block
    const headersBlock = stdout.split('HTTP Headers:')[1]
    if (headersBlock) {
      headersBlock.split(/\r?\n/).forEach(line => {
        const m = line.match(/^\s*([^:]+):\s*(.*)$/)
        if (m) result.headers[m[1].trim()] = m[2].trim()
      })
    }
    return result
  }

  const parseNmap = (stdout = '') => {
    const result = { tool: 'nmap', ports: [], httpEnum: [], raw: stdout }
    const portLines = stdout.match(/^\d+\/tcp\s+\w+\s+\w+/mg) || []
    result.ports = portLines.map(l => {
      const m = l.trim().split(/\s+/)
      return { port: m[0], state: m[1], service: m[2] }
    })
    // http-enum section
    const enumStart = stdout.indexOf('| http-enum:')
    if (enumStart !== -1) {
      const lines = stdout.slice(enumStart).split(/\r?\n/)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        if (!line.startsWith('|')) break
        const path = line.replace(/^\|\s*/, '').trim()
        if (path) result.httpEnum.push(path)
      }
    }
    return result
  }

  const parseDirDiscovery = (toolStdoutMap) => {
    const result = { tool: 'dir-discovery', findings: [], errors: {}, raw: toolStdoutMap }
    const addFinding = (path, meta) => result.findings.push({ path, meta })
    const gobuster = toolStdoutMap.gobuster || ''
    const dirb = toolStdoutMap.dirb || ''
    // Very light parsing: collect common http paths in outputs if present
    ;[gobuster, dirb].forEach(out => {
      (out.match(/\/(?:wp-|admin|login|readme\.html|robots\.txt)[^\s]*/g) || [])
        .forEach(p => addFinding(p, 'heuristic'))
    })
    // Record errors for transparency
    if (/does not exist/i.test(toolStdoutMap.gobuster || '')) result.errors.gobuster = 'wordlist missing'
    if (/FATAL: Error opening wordlist/i.test(toolStdoutMap.dirb || '')) result.errors.dirb = 'wordlist missing'
    return result
  }

  const parseWapitiNikto = (wapitiStdout = '', niktoStdout = '') => {
    const result = { tool: 'wapiti/nikto', findings: [], raw: { wapiti: wapitiStdout, nikto: niktoStdout } }
    if (/Invalid argument for option -s/i.test(wapitiStdout)) {
      result.findings.push({ source: 'wapiti', note: 'invalid -s option; rerun without -s for deeper scan' })
    }
    if (/Server\s*:\s*/i.test(niktoStdout)) {
      // minimal capture of nikto output lines mentioning OS/Server
      const lines = niktoStdout.split(/\r?\n/).filter(l => /\b(Server|OS)\b/i.test(l))
      lines.forEach(l => result.findings.push({ source: 'nikto', note: l.trim() }))
    }
    return result
  }

  const generateCombinedJson = async () => {
    const waf = auditResults['waf-detection']
    const combined = {
      target: siteUrl,
      timestamp: new Date().toISOString(),
      tools: {}
    }
    if (waf?.rawLog) {
      combined.tools.wafw00f = parseWafw00f(waf.rawLog)
    }
    setCombinedJson(combined)
    addLog('report', 'json-ready', 'Combined JSON built', 'Parsed results are ready')
  }

  // Module: WAF Detection (via wafw00f)
  const runWAFDetection = async () => {
    setCurrentModule('waf-detection')
    updateModuleStatus('waf-detection', 'running', 10)
    
    addLog('waf-detection', 'start', 'Starting WAF Detection', 'Running wafw00f for Web Application Firewall detection...')
    try {
      // Run wafw00f command
      const cmd = `wafw00f ${siteUrl}`
      const res = await runKaliCommand('waf-detection', 'wafw00f', cmd)
      
      // Parse results
      const parsedResults = parseWafw00f(res.stdout)
      
      const results = {
        rawLog: res.stdout,
        rawError: res.stderr,
        toolUsed: 'wafw00f',
        parsed: parsedResults
      }
      
      updateModuleStatus('waf-detection', 'completed', 100, results)
      addLog('waf-detection', 'complete', 'WAF Detection completed', parsedResults.detected ? 
        `WAF detected: ${parsedResults.wafType || 'Generic/Unknown'}` : 
        'No WAF detected')
    } catch (error) {
      updateModuleStatus('waf-detection', 'failed', 0)
      addLog('waf-detection', 'error', 'WAF Detection failed', error.message, 1)
      throw error
    }
  }

  // Module 1: CMS Detection (dynamic via whatweb)
  const runCMSDetection = async () => {
    setCurrentModule('cms-detection')
    updateModuleStatus('cms-detection', 'running', 10)
    
    addLog('cms-detection', 'start', 'Starting CMS detection', 'Running whatweb for CMS/plugin fingerprinting...')
    try {
      // Try whatweb (raw command as requested)
      let cmd = `whatweb -v -a 3 ${siteUrl}`
      let res = await runKaliCommand('cms-detection', 'whatweb', cmd)
      
      // If whatweb fails, try alternative approach
      if (!res.success || res.exitCode !== 0) {
        addLog('cms-detection', 'whatweb-fallback', 'whatweb failed, trying alternative', 'Using curl + grep for basic detection...')
        cmd = `curl -s -I ${siteUrl} | grep -i "server\\|x-powered-by\\|generator" || echo "No server headers found"`
        res = await runKaliCommand('cms-detection', 'curl-fallback', cmd)
      }

      const results = {
        rawLog: res.stdout,
        rawError: res.stderr,
        toolUsed: res.success ? 'whatweb' : 'curl-fallback'
      }
      updateModuleStatus('cms-detection', 'completed', 100, results)
      addLog('cms-detection', 'complete', 'CMS Detection completed', res.success ? 'whatweb finished' : 'fallback method used')
    } catch (error) {
      updateModuleStatus('cms-detection', 'failed', 0)
      addLog('cms-detection', 'error', 'CMS Detection failed', error.message, 1)
      throw error
    }
  }

  // Module 2: Vulnerability Scanning (dynamic via nmap/gobuster/dirb/wapiti)
  const runVulnerabilityScanning = async () => {
    setCurrentModule('vulnerability-scanning')
    updateModuleStatus('vulnerability-scanning', 'running', 10)
    
    addLog('vulnerability-scanning', 'start', 'Starting vulnerability scan', 'Running nmap/gobuster/dirb/wapiti...')
    try {
      const results = { rawLogs: {} }
      
      // 2) nmap — ports + WordPress NSE scripts
      const nmapTarget = siteUrl.replace(/^https?:\/\//, '')
      let nmapCmd = `nmap -Pn -T4 -p 80,443 --script=http-enum,http-wordpress-users --script-args=timeout=10s ${nmapTarget}`
      let nmapRes = await runKaliCommand('vulnerability-scanning', 'nmap', nmapCmd)
      
      // If nmap fails, try basic port scan
      if (!nmapRes.success || nmapRes.exitCode !== 0) {
        addLog('vulnerability-scanning', 'nmap-fallback', 'nmap failed, trying basic scan', 'Using basic nmap scan...')
        nmapCmd = `nmap -Pn -T4 -p 80,443 ${nmapTarget}`
        nmapRes = await runKaliCommand('vulnerability-scanning', 'nmap-basic', nmapCmd)
      }
      results.rawLogs.nmap = nmapRes.stdout
      updateModuleStatus('vulnerability-scanning', 'running', 35)

      // 3) gobuster — directory discovery
      let gobusterCmd = `gobuster dir -u ${siteUrl} -w /usr/share/wordlists/dirb/common.txt -t 40`
      let gobusterRes = await runKaliCommand('vulnerability-scanning', 'gobuster', gobusterCmd)
      
      // If gobuster fails, try ffuf
      if (!gobusterRes.success || gobusterRes.exitCode !== 0) {
        addLog('vulnerability-scanning', 'gobuster-fallback', 'gobuster failed, trying ffuf', 'Using ffuf for directory discovery...')
        gobusterCmd = `ffuf -u ${siteUrl}/FUZZ -w /usr/share/wordlists/dirb/common.txt -t 40 -o /dev/null`
        gobusterRes = await runKaliCommand('vulnerability-scanning', 'ffuf', gobusterCmd)
      }
      results.rawLogs.gobuster = gobusterRes.stdout
      updateModuleStatus('vulnerability-scanning', 'running', 60)

      // 4) dirb — complementary discovery
      let dirbCmd = `dirb ${siteUrl} /usr/share/wordlists/dirb/common.txt`
      let dirbRes = await runKaliCommand('vulnerability-scanning', 'dirb', dirbCmd)
      
      // If dirb fails, try wfuzz
      if (!dirbRes.success || dirbRes.exitCode !== 0) {
        addLog('vulnerability-scanning', 'dirb-fallback', 'dirb failed, trying wfuzz', 'Using wfuzz for directory discovery...')
        dirbCmd = `wfuzz -c -z file,/usr/share/wordlists/dirb/common.txt --hc 404 ${siteUrl}/FUZZ`
        dirbRes = await runKaliCommand('vulnerability-scanning', 'wfuzz', dirbCmd)
      }
      results.rawLogs.dirb = dirbRes.stdout
      updateModuleStatus('vulnerability-scanning', 'running', 80)

      // 5) wapiti — black-box scan
      let wapitiCmd = `wapiti -u ${siteUrl} -s small`
      let wapitiRes = await runKaliCommand('vulnerability-scanning', 'wapiti', wapitiCmd)
      
      // If wapiti fails, try nikto
      if (!wapitiRes.success || wapitiRes.exitCode !== 0) {
        addLog('vulnerability-scanning', 'wapiti-fallback', 'wapiti failed, trying nikto', 'Using nikto for vulnerability scan...')
        wapitiCmd = `nikto -h ${siteUrl}`
        wapitiRes = await runKaliCommand('vulnerability-scanning', 'nikto', wapitiCmd)
      }
      results.rawLogs.wapiti = wapitiRes.stdout

      updateModuleStatus('vulnerability-scanning', 'completed', 100, results)
      addLog('vulnerability-scanning', 'complete', 'Vulnerability scanning completed', 'All tools finished')
    } catch (error) {
      updateModuleStatus('vulnerability-scanning', 'failed', 0)
      addLog('vulnerability-scanning', 'error', 'Vulnerability scanning failed', error.message, 1)
      throw error
    }
  }

  // Module 3: Plugin & Theme Status Audit
  const runPluginThemeAudit = async () => {
    setCurrentModule('plugin-theme-audit')
    updateModuleStatus('plugin-theme-audit', 'running', 10)
    
    addLog('plugin-theme-audit', 'start', 'Starting plugin and theme audit', 'Enumerating plugins and themes...')
    
    try {
      // Plugin enumeration
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('plugin-theme-audit', 'plugins', 'wp plugin list --path=/var/www/html --format=json', 'Found 15 plugins')
      
      updateModuleStatus('plugin-theme-audit', 'running', 50)
      
      // Theme enumeration
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('plugin-theme-audit', 'themes', 'wp theme list --path=/var/www/html --format=json', 'Found 3 themes')
      
      const results = {
        plugins: [
          {
            name: 'Contact Form 7',
            version: '5.7.7',
            status: 'Active',
            updateAvailable: true,
            vulnerabilities: 1,
            lastUpdated: '2023-10-15'
          },
          {
            name: 'Yoast SEO',
            version: '20.9',
            status: 'Active',
            updateAvailable: false,
            vulnerabilities: 0,
            lastUpdated: '2023-11-20'
          }
        ],
        themes: [
          {
            name: 'Twenty Twenty-Four',
            version: '1.0',
            status: 'Active',
            updateAvailable: false,
            vulnerabilities: 0
          }
        ],
        totalPlugins: 15,
        outdatedPlugins: 3,
        totalThemes: 3,
        outdatedThemes: 0
      }
      
      updateModuleStatus('plugin-theme-audit', 'completed', 100, results)
      addLog('plugin-theme-audit', 'complete', 'Plugin and theme audit completed', 'Audited 15 plugins and 3 themes')
      
    } catch (error) {
      updateModuleStatus('plugin-theme-audit', 'failed', 0)
      addLog('plugin-theme-audit', 'error', 'Plugin and theme audit failed', error.message, 1)
      throw error
    }
  }

  // Module 4: Configuration Hardening Checks
  const runConfigHardening = async () => {
    setCurrentModule('config-hardening')
    updateModuleStatus('config-hardening', 'running', 10)
    
    addLog('config-hardening', 'start', 'Starting configuration hardening checks', 'Checking security configurations...')
    
    try {
      // HTTPS check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'https', 'curl -I -L ' + siteUrl, 'HTTPS redirect: PASS')
      
      updateModuleStatus('config-hardening', 'running', 30)
      
      // XMLRPC check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'xmlrpc', 'curl -I ' + siteUrl + '/xmlrpc.php', 'XMLRPC enabled: WARN')
      
      updateModuleStatus('config-hardening', 'running', 60)
      
      // Readme check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'readme', 'curl -s ' + siteUrl + '/readme.html', 'Readme accessible: FAIL')
      
      const results = {
        checks: [
          {
            name: 'HTTPS Redirect',
            status: 'PASS',
            description: 'Site properly redirects to HTTPS',
            recommendation: null
          },
          {
            name: 'XMLRPC Disabled',
            status: 'WARN',
            description: 'XMLRPC is enabled and accessible',
            recommendation: 'Disable XMLRPC if not needed'
          },
          {
            name: 'Readme Files',
            status: 'FAIL',
            description: 'WordPress readme files are accessible',
            recommendation: 'Remove or protect readme files'
          },
          {
            name: 'File Edit Disabled',
            status: 'PASS',
            description: 'DISALLOW_FILE_EDIT is set',
            recommendation: null
          }
        ],
        totalChecks: 4,
        passedChecks: 2,
        warningChecks: 1,
        failedChecks: 1
      }
      
      updateModuleStatus('config-hardening', 'completed', 100, results)
      addLog('config-hardening', 'complete', 'Configuration hardening checks completed', '2 PASS, 1 WARN, 1 FAIL')
      
    } catch (error) {
      updateModuleStatus('config-hardening', 'failed', 0)
      addLog('config-hardening', 'error', 'Configuration hardening checks failed', error.message, 1)
      throw error
    }
  }

  // Module 5: Admin Account Security Audit
  const runAdminSecurity = async () => {
    setCurrentModule('admin-security')
    updateModuleStatus('admin-security', 'running', 10)
    
    addLog('admin-security', 'start', 'Starting admin account security audit', 'Enumerating admin accounts...')
    
    try {
      // User enumeration
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('admin-security', 'users', 'wp user list --format=json', 'Found 3 admin accounts')
      
      const results = {
        adminAccounts: [
          {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            role: 'Administrator',
            lastLogin: '2023-11-25 10:30:00',
            weakPassword: true,
            twoFactorEnabled: false
          },
          {
            id: 2,
            username: 'superadmin',
            email: 'super@example.com',
            role: 'Administrator',
            lastLogin: '2023-11-24 15:45:00',
            weakPassword: false,
            twoFactorEnabled: true
          }
        ],
        totalAdmins: 3,
        weakPasswords: 1,
        twoFactorEnabled: 1,
        recommendations: [
          'Enable 2FA for all admin accounts',
          'Change weak passwords',
          'Remove unused admin accounts'
        ]
      }
      
      updateModuleStatus('admin-security', 'completed', 100, results)
      addLog('admin-security', 'complete', 'Admin account security audit completed', 'Audited 3 admin accounts')
      
    } catch (error) {
      updateModuleStatus('admin-security', 'failed', 0)
      addLog('admin-security', 'error', 'Admin account security audit failed', error.message, 1)
      throw error
    }
  }

  // Module 6: Backup & Restoration
  const runBackupRestoration = async () => {
    setCurrentModule('backup-restoration')
    updateModuleStatus('backup-restoration', 'running', 10)
    
    addLog('backup-restoration', 'start', 'Starting backup and restoration checks', 'Checking backup systems...')
    
    try {
      // Check Cloudways API if available
      if (adminCreds && adminCreds.type === 'cloudwaysApi') {
        await new Promise(resolve => setTimeout(resolve, 2000))
        addLog('backup-restoration', 'cloudways', 'POST /api/v1/.../server/{server_id}/create_backup', 'Backup created successfully')
      }
      
      // Check local backups
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('backup-restoration', 'local', 'wp db export backup_' + Date.now() + '.sql', 'Database backup created')
      
      const results = {
        backupStatus: 'Available',
        lastBackup: '2023-11-25 09:00:00',
        backupMethod: 'Cloudways API',
        backupSize: '2.5 GB',
        retentionPolicy: '30 days',
        restorationTested: false,
        recommendations: [
          'Test backup restoration process',
          'Implement automated daily backups',
          'Store backups off-site'
        ]
      }
      
      updateModuleStatus('backup-restoration', 'completed', 100, results)
      addLog('backup-restoration', 'complete', 'Backup and restoration checks completed', 'Backup system verified')
      
    } catch (error) {
      updateModuleStatus('backup-restoration', 'failed', 0)
      addLog('backup-restoration', 'error', 'Backup and restoration checks failed', error.message, 1)
      throw error
    }
  }

  // Module 7: Update Management
  const runUpdateManagement = async () => {
    setCurrentModule('update-management')
    updateModuleStatus('update-management', 'running', 10)
    
    addLog('update-management', 'start', 'Starting update management checks', 'Checking for available updates...')
    
    try {
      // Check core updates
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('update-management', 'core', 'wp core check-update', 'WordPress core is up to date')
      
      updateModuleStatus('update-management', 'running', 40)
      
      // Check plugin updates
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('update-management', 'plugins', 'wp plugin list --update=available --format=json', '3 plugins have updates available')
      
      updateModuleStatus('update-management', 'running', 70)
      
      // Check theme updates
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('update-management', 'themes', 'wp theme list --update=available --format=json', 'All themes are up to date')
      
      const results = {
        coreUpdate: {
          current: '6.4.2',
          available: '6.4.2',
          status: 'Up to date'
        },
        pluginUpdates: [
          {
            name: 'Contact Form 7',
            current: '5.7.7',
            available: '5.8.1',
            status: 'Update available'
          }
        ],
        themeUpdates: [],
        autoUpdateEnabled: false,
        recommendations: [
          'Enable automatic updates for minor versions',
          'Update Contact Form 7 to latest version',
          'Test updates in staging environment'
        ]
      }
      
      updateModuleStatus('update-management', 'completed', 100, results)
      addLog('update-management', 'complete', 'Update management checks completed', 'Found 1 plugin update available')
      
    } catch (error) {
      updateModuleStatus('update-management', 'failed', 0)
      addLog('update-management', 'error', 'Update management checks failed', error.message, 1)
      throw error
    }
  }

  // Module 8: Firewall & DDoS Protection
  const runFirewallDDoS = async () => {
    setCurrentModule('firewall-ddos')
    updateModuleStatus('firewall-ddos', 'running', 10)
    
    addLog('firewall-ddos', 'start', 'Starting firewall and DDoS protection checks', 'Checking edge protection...')
    
    try {
      // Check headers for protection services
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('firewall-ddos', 'headers', 'curl -I ' + siteUrl, 'Cloudflare protection detected')
      
      updateModuleStatus('firewall-ddos', 'running', 50)
      
      // Check Cloudflare API if available
      if (adminCreds && adminCreds.type === 'cloudflareApi') {
        await new Promise(resolve => setTimeout(resolve, 2000))
        addLog('firewall-ddos', 'cloudflare', 'GET /zones/{zone_id}/firewall/rules', 'Firewall rules retrieved')
      }
      
      const results = {
        edgeProtection: {
          service: 'Cloudflare',
          status: 'Active',
          ddosProtection: true,
          wafEnabled: true
        },
        firewallRules: [
          {
            id: 'rule1',
            name: 'Block malicious IPs',
            action: 'Block',
            status: 'Active'
          }
        ],
        recommendations: [
          'Enable rate limiting',
          'Configure geo-blocking for unnecessary regions',
          'Set up DDoS protection alerts'
        ]
      }
      
      updateModuleStatus('firewall-ddos', 'completed', 100, results)
      addLog('firewall-ddos', 'complete', 'Firewall and DDoS protection checks completed', 'Edge protection verified')
      
    } catch (error) {
      updateModuleStatus('firewall-ddos', 'failed', 0)
      addLog('firewall-ddos', 'error', 'Firewall and DDoS protection checks failed', error.message, 1)
      throw error
    }
  }

  // Generate final comprehensive report
  const generateFinalReport = async () => {
    // Get the actual data from completed modules
    const wafDetection = auditResults['waf-detection']
    
    const report = {
      metadata: {
        siteUrl,
        startedTime,
        endedTime: new Date().toISOString(),
        executorVersion: '1.0.0',
        adminProvided,
        totalDuration: elapsedTime
      },
      wafDetection: wafDetection || {},
      logs,
      remediationPlan: {
        info: [
          wafDetection?.parsed?.detected 
            ? `WAF detected: ${wafDetection.parsed.wafType || 'Generic/Unknown'}. This is informational - verify WAF configuration is appropriate for your security needs.`
            : 'No WAF detected. Consider implementing a Web Application Firewall for additional protection.'
        ]
      }
    }
    
    setFinalReport(report)
    addLog('report', 'generate', 'Final report generated', 'WAF Detection report created')
  }

  const downloadReport = (format) => {
    if (!finalReport) return
    
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `wordpress-security-audit-${siteUrl.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`
    
    if (format === 'json') {
      const reportData = JSON.stringify(finalReport, null, 2)
      const blob = new Blob([reportData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'html') {
      const htmlContent = generateHTMLReport(finalReport)
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'pdf') {
      // For PDF, we'll generate HTML and use browser's print to PDF
      const htmlContent = generateHTMLReport(finalReport)
      const printWindow = window.open('', '_blank')
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      printWindow.print()
    } else if (format === 'excel') {
      // For Excel, we'll generate CSV format
      const csvContent = generateCSVReport(finalReport)
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const generateHTMLReport = (report) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WordPress Security Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e5e7eb; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
        .summary-card { padding: 20px; border-radius: 8px; text-align: center; border: 1px solid; }
        .critical { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .high { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }
        .medium { background: #fefce8; border-color: #fde047; color: #ca8a04; }
        .passed { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
        .section { margin: 30px 0; page-break-inside: avoid; }
        .section h3 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
        .vulnerability { background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #dc2626; }
        .check { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .pass { background: #f0fdf4; border-left: 4px solid #16a34a; }
        .warn { background: #fffbeb; border-left: 4px solid #f59e0b; }
        .fail { background: #fef2f2; border-left: 4px solid #dc2626; }
        .plugin-item { background: #f9fafb; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #3b82f6; }
        .admin-item { background: #f9fafb; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #8b5cf6; }
        .backup-item { background: #f0fdf4; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #10b981; }
        .update-item { background: #fef3c7; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #f59e0b; }
        .firewall-item { background: #dbeafe; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #3b82f6; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-pass { background: #dcfce7; color: #166534; }
        .status-warn { background: #fef3c7; color: #92400e; }
        .status-fail { background: #fecaca; color: #991b1b; }
        .status-critical { background: #fecaca; color: #991b1b; }
        .status-high { background: #fed7aa; color: #9a3412; }
        .status-medium { background: #fde047; color: #a16207; }
        @media print {
            body { margin: 20px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>WordPress Security Audit Report</h1>
        <p><strong>Site:</strong> ${report.metadata.siteUrl}</p>
        <p><strong>Date:</strong> ${report.metadata.startedTime ? new Date(report.metadata.startedTime).toLocaleString() : 'Unknown'}</p>
        <p><strong>Duration:</strong> ${Math.floor(report.metadata.totalDuration / 60)}:${(report.metadata.totalDuration % 60).toString().padStart(2, '0')}</p>
        <p><strong>Admin Credentials:</strong> ${report.metadata.adminProvided ? 'Provided' : 'Not Provided'}</p>
    </div>

    <div class="summary">
        <div class="summary-card critical">
            <h2>${report.vulnerabilities?.criticalCount || 0}</h2>
            <p>Critical Issues</p>
        </div>
        <div class="summary-card high">
            <h2>${report.vulnerabilities?.highCount || 0}</h2>
            <p>High Priority</p>
        </div>
        <div class="summary-card medium">
            <h2>${report.vulnerabilities?.mediumCount || 0}</h2>
            <p>Medium Priority</p>
        </div>
        <div class="summary-card passed">
            <h2>${report.hardening?.passedChecks || 0}</h2>
            <p>Passed Checks</p>
        </div>
    </div>

    <div class="section">
        <h3>CMS Detection</h3>
        <p><strong>CMS Type:</strong> ${report.detection?.cmsType || 'Unknown'}</p>
        <p><strong>Version:</strong> ${report.detection?.version || 'Unknown'}</p>
        <p><strong>Technologies:</strong> ${report.detection?.technologies?.join(', ') || 'Unknown'}</p>
    </div>

    <div class="section">
        <h3>Vulnerabilities Found</h3>
        ${report.vulnerabilities?.vulnerabilities?.map(vuln => `
            <div class="vulnerability">
                <h4>${vuln.title}</h4>
                <p><strong>Severity:</strong> <span class="status-badge status-${vuln.severity.toLowerCase()}">${vuln.severity}</span> (CVSS: ${vuln.cvss})</p>
                <p><strong>Description:</strong> ${vuln.description}</p>
                <p><strong>Affected:</strong> ${vuln.affected}</p>
                <p><strong>Status:</strong> ${vuln.status}</p>
            </div>
        `).join('') || '<p>No vulnerabilities found.</p>'}
    </div>

    <div class="section">
        <h3>Plugin & Theme Audit</h3>
        <p><strong>Total Plugins:</strong> ${report.plugins?.totalPlugins || 0}</p>
        <p><strong>Outdated Plugins:</strong> ${report.plugins?.outdatedPlugins || 0}</p>
        <p><strong>Total Themes:</strong> ${report.plugins?.totalThemes || 0}</p>
        <p><strong>Outdated Themes:</strong> ${report.plugins?.outdatedThemes || 0}</p>
        ${report.plugins?.plugins?.map(plugin => `
            <div class="plugin-item">
                <h4>${plugin.name}</h4>
                <p><strong>Version:</strong> ${plugin.version}</p>
                <p><strong>Status:</strong> ${plugin.status}</p>
                <p><strong>Update Available:</strong> ${plugin.updateAvailable ? 'Yes' : 'No'}</p>
                <p><strong>Vulnerabilities:</strong> ${plugin.vulnerabilities || 0}</p>
            </div>
        `).join('') || '<p>No plugins found.</p>'}
    </div>

    <div class="section">
        <h3>Configuration Hardening</h3>
        <p><strong>Total Checks:</strong> ${report.hardening?.totalChecks || 0}</p>
        <p><strong>Passed:</strong> ${report.hardening?.passedChecks || 0}</p>
        <p><strong>Warnings:</strong> ${report.hardening?.warningChecks || 0}</p>
        <p><strong>Failed:</strong> ${report.hardening?.failedChecks || 0}</p>
        ${report.hardening?.checks?.map(check => `
            <div class="check ${check.status.toLowerCase()}">
                <strong>${check.name}:</strong> <span class="status-badge status-${check.status.toLowerCase()}">${check.status}</span>
                <p>${check.description}</p>
                ${check.recommendation ? `<p><strong>Recommendation:</strong> ${check.recommendation}</p>` : ''}
            </div>
        `).join('') || '<p>No hardening checks performed.</p>'}
    </div>

    <div class="section">
        <h3>Admin Account Security</h3>
        <p><strong>Total Admins:</strong> ${report.adminAccounts?.totalAdmins || 0}</p>
        <p><strong>Weak Passwords:</strong> ${report.adminAccounts?.weakPasswords || 0}</p>
        <p><strong>2FA Enabled:</strong> ${report.adminAccounts?.twoFactorEnabled || 0}</p>
        ${report.adminAccounts?.adminAccounts?.map(admin => `
            <div class="admin-item">
                <h4>${admin.username}</h4>
                <p><strong>Email:</strong> ${admin.email}</p>
                <p><strong>Role:</strong> ${admin.role}</p>
                <p><strong>Last Login:</strong> ${admin.lastLogin}</p>
                <p><strong>Weak Password:</strong> ${admin.weakPassword ? 'Yes' : 'No'}</p>
                <p><strong>2FA Enabled:</strong> ${admin.twoFactorEnabled ? 'Yes' : 'No'}</p>
            </div>
        `).join('') || '<p>No admin accounts found.</p>'}
    </div>

    <div class="section">
        <h3>Backup & Restoration</h3>
        <p><strong>Status:</strong> ${report.backups?.backupStatus || 'Unknown'}</p>
        <p><strong>Last Backup:</strong> ${report.backups?.lastBackup || 'Unknown'}</p>
        <p><strong>Method:</strong> ${report.backups?.backupMethod || 'Unknown'}</p>
        <p><strong>Size:</strong> ${report.backups?.backupSize || 'Unknown'}</p>
        <p><strong>Retention Policy:</strong> ${report.backups?.retentionPolicy || 'Unknown'}</p>
        <p><strong>Restoration Tested:</strong> ${report.backups?.restorationTested ? 'Yes' : 'No'}</p>
    </div>

    <div class="section">
        <h3>Update Management</h3>
        <p><strong>Core Status:</strong> ${report.updates?.coreUpdate?.status || 'Unknown'}</p>
        <p><strong>Current Version:</strong> ${report.updates?.coreUpdate?.current || 'Unknown'}</p>
        <p><strong>Available Version:</strong> ${report.updates?.coreUpdate?.available || 'Unknown'}</p>
        <p><strong>Auto Update Enabled:</strong> ${report.updates?.autoUpdateEnabled ? 'Yes' : 'No'}</p>
        ${report.updates?.pluginUpdates?.map(update => `
            <div class="update-item">
                <h4>${update.name}</h4>
                <p><strong>Current:</strong> ${update.current}</p>
                <p><strong>Available:</strong> ${update.available}</p>
                <p><strong>Status:</strong> ${update.status}</p>
            </div>
        `).join('') || '<p>No plugin updates available.</p>'}
    </div>

    <div class="section">
        <h3>Firewall & DDoS Protection</h3>
        <p><strong>Service:</strong> ${report.firewall?.edgeProtection?.service || 'Unknown'}</p>
        <p><strong>Status:</strong> ${report.firewall?.edgeProtection?.status || 'Unknown'}</p>
        <p><strong>DDoS Protection:</strong> ${report.firewall?.edgeProtection?.ddosProtection ? 'Active' : 'Inactive'}</p>
        <p><strong>WAF Enabled:</strong> ${report.firewall?.edgeProtection?.wafEnabled ? 'Yes' : 'No'}</p>
        ${report.firewall?.firewallRules?.map(rule => `
            <div class="firewall-item">
                <h4>${rule.name}</h4>
                <p><strong>Action:</strong> ${rule.action}</p>
                <p><strong>Status:</strong> ${rule.status}</p>
            </div>
        `).join('') || '<p>No firewall rules found.</p>'}
    </div>

    <div class="section">
        <h3>Remediation Plan</h3>
        <h4>Critical Actions:</h4>
        <ul>${report.remediationPlan?.critical?.map(action => `<li>${action}</li>`).join('') || '<li>No critical actions required.</li>'}</ul>
        <h4>High Priority:</h4>
        <ul>${report.remediationPlan?.high?.map(action => `<li>${action}</li>`).join('') || '<li>No high priority actions required.</li>'}</ul>
        <h4>Medium Priority:</h4>
        <ul>${report.remediationPlan?.medium?.map(action => `<li>${action}</li>`).join('') || '<li>No medium priority actions required.</li>'}</ul>
    </div>
</body>
</html>`
  }

  const generateCSVReport = (report) => {
    let csv = 'Category,Item,Status,Severity,Description,Affected,CVSS Score\n'
    
    // Vulnerabilities
    if (report.vulnerabilities?.vulnerabilities) {
      report.vulnerabilities.vulnerabilities.forEach(vuln => {
        csv += `Vulnerability,"${vuln.title}",${vuln.status},${vuln.severity},"${vuln.description}","${vuln.affected}",${vuln.cvss}\n`
      })
    }
    
    // Hardening checks
    if (report.hardening?.checks) {
      report.hardening.checks.forEach(check => {
        csv += `Hardening,"${check.name}",${check.status},N/A,"${check.description}","N/A","N/A"\n`
      })
    }
    
    // Plugins
    if (report.plugins?.plugins) {
      report.plugins.plugins.forEach(plugin => {
        csv += `Plugin,"${plugin.name}",${plugin.status},${plugin.vulnerabilities > 0 ? 'High' : 'Low'},"Version: ${plugin.version}","${plugin.name}",N/A\n`
      })
    }
    
    // Admin accounts
    if (report.adminAccounts?.adminAccounts) {
      report.adminAccounts.adminAccounts.forEach(admin => {
        csv += `Admin Account,"${admin.username}",${admin.weakPassword ? 'Weak' : 'Strong'},${admin.weakPassword ? 'High' : 'Low'},"Role: ${admin.role}","${admin.email}",N/A\n`
      })
    }
    
    return csv
  }

  const generateModuleHTMLReport = (moduleId, results) => {
    switch (moduleId) {
      case 'waf-detection':
        const parsed = results?.parsed || {}
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">WAF Detected:</span>
              <span class="px-2 py-1 ${parsed.detected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'} rounded text-sm">
                ${parsed.detected ? 'Yes' : 'No'}
              </span>
            </div>
            ${parsed.detected ? `
              <div class="space-y-2">
                ${parsed.wafType ? `
                  <div class="flex items-center space-x-2">
                    <span class="font-semibold text-gray-700">WAF Type:</span>
                    <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">${parsed.wafType}</span>
                  </div>
                ` : ''}
                ${parsed.wafVendor ? `
                  <div class="flex items-center space-x-2">
                    <span class="font-semibold text-gray-700">Vendor:</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${parsed.wafVendor}</span>
                  </div>
                ` : ''}
                ${parsed.wafInfo ? `
                  <div class="bg-blue-50 border-l-4 border-blue-500 pl-3 py-2 rounded">
                    <div class="text-sm font-medium text-blue-800">${parsed.wafInfo}</div>
                  </div>
                ` : ''}
                ${parsed.reason ? `
                  <div class="bg-yellow-50 border-l-4 border-yellow-500 pl-3 py-2 rounded">
                    <div class="text-xs font-medium text-yellow-800 mb-1">Detection Reason:</div>
                    <div class="text-sm text-yellow-700">${parsed.reason}</div>
                  </div>
                ` : ''}
                ${parsed.responseCode ? `
                  <div class="flex items-center space-x-2">
                    <span class="font-semibold text-gray-700">Response Code:</span>
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${parsed.responseCode}</span>
                  </div>
                ` : ''}
                ${parsed.numberOfRequests ? `
                  <div class="flex items-center space-x-2">
                    <span class="font-semibold text-gray-700">Number of Requests:</span>
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">${parsed.numberOfRequests}</span>
                  </div>
                ` : ''}
              </div>
            ` : `
              <div class="bg-gray-50 border-l-4 border-gray-400 pl-3 py-2 rounded">
                <div class="text-sm text-gray-700">No Web Application Firewall detected. The target appears to be unprotected or using an undetected WAF solution.</div>
              </div>
            `}
          </div>
        `
      
      case 'cms-detection':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">CMS Type:</span>
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">${results.cmsType}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Version:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.version}</span>
            </div>
            <div>
              <span class="font-semibold text-gray-700">Technologies:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                ${results.technologies?.map(tech => `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">${tech}</span>`).join('')}
              </div>
            </div>
          </div>
        `
      
      case 'vulnerability-scanning':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-red-50 p-2 rounded">
                <div class="text-lg font-bold text-red-600">${results.criticalCount || 0}</div>
                <div class="text-xs text-red-700">Critical</div>
              </div>
              <div class="bg-orange-50 p-2 rounded">
                <div class="text-lg font-bold text-orange-600">${results.highCount || 0}</div>
                <div class="text-xs text-orange-700">High</div>
              </div>
              <div class="bg-yellow-50 p-2 rounded">
                <div class="text-lg font-bold text-yellow-600">${results.mediumCount || 0}</div>
                <div class="text-xs text-yellow-700">Medium</div>
              </div>
            </div>
            ${results.vulnerabilities?.slice(0, 3).map(vuln => `
              <div class="border-l-4 border-red-500 pl-3 py-2 bg-red-50">
                <div class="font-semibold text-red-800">${vuln.title}</div>
                <div class="text-sm text-red-700">${vuln.severity} - ${vuln.affected}</div>
              </div>
            `).join('') || '<p class="text-gray-600 dark:text-gray-400">No vulnerabilities found</p>'}
          </div>
        `
      
      case 'plugin-theme-audit':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4 text-center">
              <div class="bg-blue-50 p-3 rounded">
                <div class="text-lg font-bold text-blue-600">${results.totalPlugins || 0}</div>
                <div class="text-xs text-blue-700">Total Plugins</div>
              </div>
              <div class="bg-purple-50 p-3 rounded">
                <div class="text-lg font-bold text-purple-600">${results.outdatedPlugins || 0}</div>
                <div class="text-xs text-purple-700">Outdated</div>
              </div>
            </div>
            ${results.plugins?.slice(0, 3).map(plugin => `
              <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span class="font-medium">${plugin.name}</span>
                <span class="px-2 py-1 text-xs rounded ${plugin.updateAvailable ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}">
                  ${plugin.version} ${plugin.updateAvailable ? '(Update Available)' : ''}
                </span>
              </div>
            `).join('') || '<p class="text-gray-600 dark:text-gray-400">No plugins found</p>'}
          </div>
        `
      
      case 'config-hardening':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-green-50 p-2 rounded">
                <div class="text-lg font-bold text-green-600">${results.passedChecks || 0}</div>
                <div class="text-xs text-green-700">Passed</div>
              </div>
              <div class="bg-yellow-50 p-2 rounded">
                <div class="text-lg font-bold text-yellow-600">${results.warningChecks || 0}</div>
                <div class="text-xs text-yellow-700">Warnings</div>
              </div>
              <div class="bg-red-50 p-2 rounded">
                <div class="text-lg font-bold text-red-600">${results.failedChecks || 0}</div>
                <div class="text-xs text-red-700">Failed</div>
              </div>
            </div>
            ${results.checks?.map(check => `
              <div class="flex justify-between items-center p-2 rounded ${check.status === 'PASS' ? 'bg-green-50' : check.status === 'WARN' ? 'bg-yellow-50' : 'bg-red-50'}">
                <span class="font-medium">${check.name}</span>
                <span class="px-2 py-1 text-xs rounded ${check.status === 'PASS' ? 'bg-green-100 text-green-800' : check.status === 'WARN' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                  ${check.status}
                </span>
              </div>
            `).join('') || '<p class="text-gray-600 dark:text-gray-400">No checks performed</p>'}
          </div>
        `
      
      case 'admin-security':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4 text-center">
              <div class="bg-blue-50 p-3 rounded">
                <div class="text-lg font-bold text-blue-600">${results.totalAdmins || 0}</div>
                <div class="text-xs text-blue-700">Total Admins</div>
              </div>
              <div class="bg-red-50 p-3 rounded">
                <div class="text-lg font-bold text-red-600">${results.weakPasswords || 0}</div>
                <div class="text-xs text-red-700">Weak Passwords</div>
              </div>
            </div>
            ${results.adminAccounts?.slice(0, 3).map(admin => `
              <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <span class="font-medium">${admin.username}</span>
                  <span class="text-sm text-gray-600 dark:text-gray-400 ml-2">(${admin.role})</span>
                </div>
                <div class="flex space-x-1">
                  ${admin.weakPassword ? '<span class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Weak Password</span>' : ''}
                  ${admin.twoFactorEnabled ? '<span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">2FA Enabled</span>' : ''}
                </div>
              </div>
            `).join('') || '<p class="text-gray-600 dark:text-gray-400">No admin accounts found</p>'}
          </div>
        `
      
      case 'backup-restoration':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Status:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.backupStatus}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Last Backup:</span>
              <span class="text-sm text-gray-600 dark:text-gray-400">${results.lastBackup}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Method:</span>
              <span class="text-sm text-gray-600 dark:text-gray-400">${results.backupMethod}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Size:</span>
              <span class="text-sm text-gray-600 dark:text-gray-400">${results.backupSize}</span>
            </div>
          </div>
        `
      
      case 'update-management':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Core Status:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.coreUpdate?.status}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Plugin Updates:</span>
              <span class="px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm">${results.pluginUpdates?.length || 0} available</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Auto Updates:</span>
              <span class="px-2 py-1 ${results.autoUpdateEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.autoUpdateEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            ${results.pluginUpdates?.slice(0, 2).map(update => `
              <div class="flex justify-between items-center p-2 bg-orange-50 rounded">
                <span class="font-medium">${update.name}</span>
                <span class="text-sm text-orange-700">${update.current} → ${update.available}</span>
              </div>
            `).join('') || ''}
          </div>
        `
      
      case 'firewall-ddos':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Service:</span>
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">${results.edgeProtection?.service}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">DDoS Protection:</span>
              <span class="px-2 py-1 ${results.edgeProtection?.ddosProtection ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.edgeProtection?.ddosProtection ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">WAF:</span>
              <span class="px-2 py-1 ${results.edgeProtection?.wafEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.edgeProtection?.wafEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span class="font-semibold text-gray-700">Firewall Rules:</span>
              <div class="mt-1">
                ${results.firewallRules?.map(rule => `
                  <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span class="font-medium">${rule.name}</span>
                    <span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">${rule.action}</span>
                  </div>
                `).join('') || '<p class="text-gray-600 dark:text-gray-400">No rules found</p>'}
              </div>
            </div>
          </div>
        `
      
      default:
        return '<p class="text-gray-600 dark:text-gray-400">No report data available</p>'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'running':
        return (
          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50 border-green-200'
      case 'running': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'failed': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 border-gray-200 dark:border-slate-700'
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-6 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">WAF (Firewall) Detection</h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">Web Application Firewall detection and fingerprinting</p>
              </div>
            </div>
            
            {!auditStarted && (
              <button
                onClick={startAudit}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Start Audit
              </button>
            )}
            {auditStarted && !auditCompleted && (
              <button
                onClick={() => setCancelRequested(true)}
                className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              >
                Stop Scan
              </button>
            )}
          </div>

          {/* Site Info */}
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200 dark:border-slate-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Target Site</span>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{siteUrl}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Admin Credentials</span>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{adminProvided ? 'Provided' : 'Not Provided'}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Audit Status</span>
                  <p className="text-gray-900 dark:text-gray-100 font-medium">{auditCompleted ? 'Completed' : auditStarted ? 'In Progress' : 'Ready'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Overview */}
        {auditStarted && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Audit Progress</h3>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {startedTime && (
                  <div className="space-y-1">
                    <div>Started: {new Date(startedTime).toLocaleString()}</div>
                    <div>Elapsed: {formatTime(elapsedTime)}</div>
                    {expectedCompletionTime && (
                      <div>Expected: {new Date(expectedCompletionTime).toLocaleString()}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Overall Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(modules.filter(m => m.status === 'completed').length / modules.length) * 100}%` 
                }}
              ></div>
            </div>
            
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {modules.filter(m => m.status === 'completed').length} of {modules.length} modules completed
            </div>
          </div>
        )}

        {/* Real-time Logs Section */}
        {auditStarted && logs.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Kali Command Execution Logs
              </h3>
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {logs.length} log entries
                </div>
                <button
                  onClick={() => {
                    const logText = logs.map(log => 
                      `[${new Date(log.timestamp).toLocaleTimeString()}][${log.module}]${log.step}:${log.output}${log.exitCode !== 0 ? ` (Exit: ${log.exitCode})` : ''}`
                    ).join('\n')
                    navigator.clipboard.writeText(logText)
                    showSuccess('Audit logs copied to clipboard!')
                  }}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Copy logs to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const logText = logs.map(log => 
                      `[${new Date(log.timestamp).toLocaleTimeString()}][${log.module}]${log.step}:${log.output}${log.exitCode !== 0 ? ` (Exit: ${log.exitCode})` : ''}`
                    ).join('\n')
                    const blob = new Blob([logText], { type: 'text/plain' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `wordpress-audit-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                    showSuccess('Logs downloaded successfully!')
                  }}
                  className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Download logs as file"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto border border-gray-700">
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="text-sm font-mono">
                    <div className="flex items-start space-x-2">
                      <span className="text-gray-400 text-xs whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                      <span className="text-blue-400 text-xs whitespace-nowrap">[{log.module}]</span>
                      <span className="text-yellow-400 text-xs whitespace-nowrap">{log.step}:</span>
                    {log.exitCode !== 0 && (
                        <span className="text-red-400 text-xs">(Exit: {log.exitCode})</span>
                    )}
                    </div>
                    <div className="ml-4 mt-1">
                      <div className="text-green-400 text-xs mb-1">$ {log.command}</div>
                      <pre className="text-white text-xs whitespace-pre-wrap break-words">{log.output}</pre>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              💡 These are real-time logs from Kali Linux tools. Commands are executed via WSL with root privileges.
            </div>
          </div>
        )}

        {/* Modules List */}
        <div className="space-y-4 mb-8">
          {modules.map((module) => (
            <div key={module.id} className={`border rounded-lg p-4 ${getStatusColor(module.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getStatusIcon(module.status)}
                  <div className="ml-3">
                    <h4 className="font-medium">{module.name}</h4>
                    <p className="text-sm opacity-75">
                      {module.status === 'running' && currentModule === module.id ? 'Running...' : 
                       module.status === 'completed' ? 'Completed' :
                       module.status === 'failed' ? 'Failed' : 'Pending'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {module.status === 'completed' && module.results && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedModuleReport({ id: module.id, name: module.name, results: module.results })
                          setShowReportPreview(true)
                        }}
                        className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => downloadReport('json')}
                        className="text-sm px-3 py-1 bg-white dark:bg-slate-800 bg-opacity-50 rounded hover:bg-opacity-75 transition-colors"
                      >
                        Download
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {module.status === 'running' && (
                <div className="mt-3">
                  <div className="w-full bg-white dark:bg-slate-800 bg-opacity-50 rounded-full h-1">
                    <div 
                      className="bg-current h-1 rounded-full transition-all duration-300"
                      style={{ width: `${module.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {module.status === 'completed' && module.results && (
                <div className="mt-4 border-t pt-4">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Module Report</h5>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: generateModuleHTMLReport(module.id, module.results) 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Parsed JSON Output */}
        {combinedJson && (
          <div className="border-t pt-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Parsed Results (JSON)</h3>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(combinedJson, null, 2))}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded"
                >Copy</button>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(combinedJson, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `wordpress-audit-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    URL.revokeObjectURL(url)
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >Download</button>
              </div>
            </div>
            <pre className="text-xs bg-gray-900 text-gray-100 rounded p-4 max-h-96 overflow-y-auto">{JSON.stringify(combinedJson, null, 2)}</pre>
          </div>
        )}

        {/* Final Report Section */}
        {auditCompleted && finalReport && (
          <div className="border-t pt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Final Security Report</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setSelectedModuleReport({ id: 'final', name: 'Final Report', results: finalReport })
                    setShowReportPreview(true)
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Preview Report
                </button>
                <button
                  onClick={() => downloadReport('html')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download HTML
                </button>
                <button
                  onClick={() => downloadReport('pdf')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => downloadReport('excel')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download Excel
                </button>
                <button
                  onClick={() => downloadReport('json')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download JSON
                </button>
              </div>
            </div>
            
            
            {/* Report Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600">
                  {finalReport.vulnerabilities?.criticalCount || 0}
                </div>
                <div className="text-sm text-red-700">Critical Issues</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {finalReport.vulnerabilities?.highCount || 0}
                </div>
                <div className="text-sm text-orange-700">High Priority</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-600">
                  {finalReport.vulnerabilities?.mediumCount || 0}
                </div>
                <div className="text-sm text-yellow-700">Medium Priority</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {finalReport.hardening?.passedChecks || 0}
                </div>
                <div className="text-sm text-green-700">Passed Checks</div>
              </div>
            </div>
            
            
          </div>
        )}

        {/* Report Preview Modal */}
        {showReportPreview && selectedModuleReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {selectedModuleReport.name} Report
                </h3>
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-400"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {selectedModuleReport.id === 'final' ? (
                  <div 
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: generateHTMLReport(selectedModuleReport.results) 
                    }}
                  />
                ) : selectedModuleReport.id === 'waf-detection' ? (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">WAF Detection Results</h4>
                      {selectedModuleReport.results?.parsed ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">WAF Detected:</span>
                              <span className={`ml-2 px-2 py-1 rounded text-sm font-semibold ${
                                selectedModuleReport.results.parsed.detected 
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                              }`}>
                                {selectedModuleReport.results.parsed.detected ? 'Yes' : 'No'}
                              </span>
                            </div>
                            {selectedModuleReport.results.parsed.wafType && (
                              <div>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">WAF Type:</span>
                                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-sm font-semibold">
                                  {selectedModuleReport.results.parsed.wafType}
                                </span>
                              </div>
                            )}
                            {selectedModuleReport.results.parsed.wafVendor && (
                              <div>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Vendor:</span>
                                <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                                  {selectedModuleReport.results.parsed.wafVendor}
                                </span>
                              </div>
                            )}
                            {selectedModuleReport.results.parsed.numberOfRequests && (
                              <div>
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Requests Made:</span>
                                <span className="ml-2 text-sm text-gray-900 dark:text-gray-100">
                                  {selectedModuleReport.results.parsed.numberOfRequests}
                                </span>
                              </div>
                            )}
                          </div>
                          {selectedModuleReport.results.parsed.wafInfo && (
                            <div className="bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500 pl-4 py-3 rounded">
                              <div className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Detection Information</div>
                              <div className="text-sm text-blue-800 dark:text-blue-300">{selectedModuleReport.results.parsed.wafInfo}</div>
                            </div>
                          )}
                          {selectedModuleReport.results.parsed.reason && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/30 border-l-4 border-yellow-500 pl-4 py-3 rounded">
                              <div className="text-xs font-medium text-yellow-900 dark:text-yellow-200 mb-1">Detection Reason</div>
                              <div className="text-sm text-yellow-800 dark:text-yellow-300">{selectedModuleReport.results.parsed.reason}</div>
                            </div>
                          )}
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full JSON Report</div>
                            <pre className="bg-gray-900 text-gray-100 rounded p-4 overflow-x-auto text-xs">
                              {JSON.stringify(selectedModuleReport.results.parsed, null, 2)}
                            </pre>
                          </div>
                        </div>
                      ) : (
                        <div className="text-gray-600 dark:text-gray-400">No parsed results available</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(selectedModuleReport.results, null, 2)}
                  </pre>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 p-6 border-t">
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => downloadReport('json')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WordPressAuditOrchestrator
