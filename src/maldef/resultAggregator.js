<<<<<<< HEAD
// JSON result aggregator for unified output from all scanners
// Consolidates results from multiple tools into a single JSON report

const path = require('path')
const fs = require('fs')

/**
 * Aggregate all scan results into unified JSON format
 * @param {Object} results - Object containing results from all scanners
 * @param {string} targetUrl - Target URL or path
 * @param {string} outputDir - Output directory for report
 * @returns {Object} Unified JSON report
 */
function aggregateResults(results, targetUrl, outputDir) {
  const timestamp = new Date().toISOString()
  
  // Calculate overall risk score
  const riskScore = calculateRiskScore(results)
  
  // Determine overall status
  const status = determineOverallStatus(results, riskScore)
  
  // Aggregate findings by category (simplified: only malware and defacement)
  const findings = {
    malware: aggregateMalwareFindings(results),
    defacement: results.defacement || null
  }
  
  // Extract executed commands from results
  const executedCommands = []
  if (results.malware?.clamav?.command) {
    executedCommands.push({
      tool: 'clamav',
      command: results.malware.clamav.command,
      exitCode: results.malware.clamav.exitCode,
      description: 'ClamAV signature-based malware scan'
    })
  }
  if (results.malware?.yara?.command) {
    executedCommands.push({
      tool: 'yara',
      command: results.malware.yara.command,
      exitCode: results.malware.yara.exitCode,
      description: 'YARA pattern-based malware detection'
    })
  }
  
  // Build unified report
  const report = {
    metadata: {
      target: targetUrl,
      timestamp,
      scanDuration: results.scanDuration || null,
      toolsUsed: Object.keys(results).filter(k => k !== 'scanDuration' && k !== 'defacement'),
      executedCommands: executedCommands
    },
    summary: {
      status, // 'clean' | 'warning' | 'infected' | 'critical'
      riskScore, // 0-100
      severity: getSeverity(riskScore),
      totalFindings: countTotalFindings(findings),
      // Add status fields for UI compatibility
      malwareStatus: results.malware?.clamav?.infectedCount > 0 || results.malware?.yara?.matchCount > 0 ? 'infected' : 'clean',
      defacementStatus: results.defacement?.changed ? 'changed' : 'normal'
    },
    findings,
    detailed: {
      malware: results.malware || {},
      defacement: results.defacement || null
    },
    recommendations: generateRecommendations(findings, riskScore)
  }
  
  // Save report to file
  const reportFile = path.join(outputDir, 'unified_report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  
  return {
    report,
    reportFile
  }
}

/**
 * Calculate overall risk score (0-100)
 * Simplified: Only malware and defacement
 */
function calculateRiskScore(results) {
  let score = 0
  
  // Malware detections (0-50 points)
  if (results.malware) {
    if (results.malware.clamav?.infectedCount > 0) {
      score += Math.min(30, results.malware.clamav.infectedCount * 5)
    }
    if (results.malware.yara?.matchCount > 0) {
      score += Math.min(20, results.malware.yara.matchCount * 3)
    }
  }
  
  // Defacement detection (0-30 points)
  if (results.defacement?.changed) {
    const changeCount = results.defacement.changes?.length || 0
    score += Math.min(30, 20 + (changeCount * 2))
  }
  
  return Math.min(100, score)
}

/**
 * Determine overall status
 */
function determineOverallStatus(results, riskScore) {
  if (riskScore >= 70) return 'critical'
  if (riskScore >= 40) return 'infected'
  if (riskScore >= 20) return 'warning'
  return 'clean'
}

/**
 * Get severity label
 */
function getSeverity(riskScore) {
  if (riskScore >= 70) return 'CRITICAL'
  if (riskScore >= 40) return 'HIGH'
  if (riskScore >= 20) return 'MEDIUM'
  return 'LOW'
}

/**
 * Aggregate web vulnerability findings
 */
function aggregateWebFindings(results) {
  const findings = []
  
  if (results.web?.nikto) {
    if (results.web.nikto.json?.vulnerabilities) {
      findings.push(...results.web.nikto.json.vulnerabilities.map(v => ({
        tool: 'nikto',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  if (results.web?.wapiti) {
    if (results.web.wapiti.json?.vulnerabilities) {
      findings.push(...results.web.wapiti.json.vulnerabilities.map(v => ({
        tool: 'wapiti',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  if (results.web?.wpscan) {
    if (results.web.wpscan.json?.vulnerabilities) {
      findings.push(...results.web.wpscan.json.vulnerabilities.map(v => ({
        tool: 'wpscan',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      nikto: results.web?.nikto ? 'completed' : 'not_run',
      wapiti: results.web?.wapiti ? 'completed' : 'not_run',
      wpscan: results.web?.wpscan ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate malware findings
 */
function aggregateMalwareFindings(results) {
  const findings = []
  
  if (results.malware?.clamav) {
    if (results.malware.clamav.infectedFiles?.length > 0) {
      findings.push(...results.malware.clamav.infectedFiles.map(f => ({
        tool: 'clamav',
        type: 'malware',
        file: f.file,
        signature: f.signature
      })))
    }
  }
  
  if (results.malware?.yara) {
    if (results.malware.yara.matches?.length > 0) {
      findings.push(...results.malware.yara.matches.map(m => ({
        tool: 'yara',
        type: 'suspicious_pattern',
        file: m.file,
        rule: m.rule
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      clamav: results.malware?.clamav ? 'completed' : 'not_run',
      yara: results.malware?.yara ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate rootkit findings
 */
function aggregateRootkitFindings(results) {
  const findings = []
  
  if (results.rootkit?.rkhunter) {
    if (results.rootkit.rkhunter.warnings?.length > 0) {
      findings.push(...results.rootkit.rkhunter.warnings.map(w => ({
        tool: 'rkhunter',
        type: 'rootkit_warning',
        message: w
      })))
    }
  }
  
  if (results.rootkit?.chkrootkit) {
    if (results.rootkit.chkrootkit.findings?.length > 0) {
      findings.push(...results.rootkit.chkrootkit.findings.map(f => ({
        tool: 'chkrootkit',
        type: 'rootkit_finding',
        message: f
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      rkhunter: results.rootkit?.rkhunter ? 'completed' : 'not_run',
      chkrootkit: results.rootkit?.chkrootkit ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate system audit findings
 */
function aggregateSystemFindings(results) {
  const findings = []
  
  if (results.system?.lynis) {
    if (results.system.lynis.warnings?.length > 0) {
      findings.push(...results.system.lynis.warnings.map(w => ({
        tool: 'lynis',
        type: 'system_warning',
        message: w
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    score: results.system?.lynis?.score || null,
    tools: {
      lynis: results.system?.lynis ? 'completed' : 'not_run'
    }
  }
}

/**
 * Count total findings (simplified: only malware and defacement)
 */
function countTotalFindings(findings) {
  return (
    (findings.malware?.count || 0) +
    (findings.defacement?.changed ? (findings.defacement.changes?.length || 1) : 0)
  )
}

/**
 * Generate recommendations based on findings (simplified: only malware and defacement)
 */
function generateRecommendations(findings, riskScore) {
  const recommendations = []
  
  if (findings.malware?.count > 0) {
    recommendations.push({
      priority: 'high',
      category: 'malware',
      action: 'Immediately quarantine and remove infected files',
      details: `${findings.malware.count} malware signatures detected`
    })
  }
  
  if (findings.defacement?.changed) {
    const changeCount = findings.defacement.changes?.length || 0
    recommendations.push({
      priority: 'high',
      category: 'defacement',
      action: 'Website content has changed. Investigate unauthorized modifications',
      details: `${changeCount} file(s) changed - possible defacement detected`
    })
  }
  
  if (riskScore < 20) {
    recommendations.push({
      priority: 'low',
      category: 'maintenance',
      action: 'System appears clean. Continue regular monitoring',
      details: 'No significant threats detected'
    })
  }
  
  return recommendations
}

module.exports = {
  aggregateResults,
  calculateRiskScore,
  determineOverallStatus,
  getSeverity
}

=======
// JSON result aggregator for unified output from all scanners
// Consolidates results from multiple tools into a single JSON report

const path = require('path')
const fs = require('fs')

/**
 * Aggregate all scan results into unified JSON format
 * @param {Object} results - Object containing results from all scanners
 * @param {string} targetUrl - Target URL or path
 * @param {string} outputDir - Output directory for report
 * @returns {Object} Unified JSON report
 */
function aggregateResults(results, targetUrl, outputDir) {
  const timestamp = new Date().toISOString()
  
  // Calculate overall risk score
  const riskScore = calculateRiskScore(results)
  
  // Determine overall status
  const status = determineOverallStatus(results, riskScore)
  
  // Aggregate findings by category (simplified: only malware and defacement)
  const findings = {
    malware: aggregateMalwareFindings(results),
    defacement: results.defacement || null
  }
  
  // Extract executed commands from results
  const executedCommands = []
  if (results.malware?.clamav?.command) {
    executedCommands.push({
      tool: 'clamav',
      command: results.malware.clamav.command,
      exitCode: results.malware.clamav.exitCode,
      description: 'ClamAV signature-based malware scan'
    })
  }
  if (results.malware?.yara?.command) {
    executedCommands.push({
      tool: 'yara',
      command: results.malware.yara.command,
      exitCode: results.malware.yara.exitCode,
      description: 'YARA pattern-based malware detection'
    })
  }
  
  // Build unified report
  const report = {
    metadata: {
      target: targetUrl,
      timestamp,
      scanDuration: results.scanDuration || null,
      toolsUsed: Object.keys(results).filter(k => k !== 'scanDuration' && k !== 'defacement'),
      executedCommands: executedCommands
    },
    summary: {
      status, // 'clean' | 'warning' | 'infected' | 'critical'
      riskScore, // 0-100
      severity: getSeverity(riskScore),
      totalFindings: countTotalFindings(findings),
      // Add status fields for UI compatibility
      malwareStatus: results.malware?.clamav?.infectedCount > 0 || results.malware?.yara?.matchCount > 0 ? 'infected' : 'clean',
      defacementStatus: results.defacement?.changed ? 'changed' : 'normal'
    },
    findings,
    detailed: {
      malware: results.malware || {},
      defacement: results.defacement || null
    },
    recommendations: generateRecommendations(findings, riskScore)
  }
  
  // Save report to file
  const reportFile = path.join(outputDir, 'unified_report.json')
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2))
  
  return {
    report,
    reportFile
  }
}

/**
 * Calculate overall risk score (0-100)
 * Simplified: Only malware and defacement
 */
function calculateRiskScore(results) {
  let score = 0
  
  // Malware detections (0-50 points)
  if (results.malware) {
    if (results.malware.clamav?.infectedCount > 0) {
      score += Math.min(30, results.malware.clamav.infectedCount * 5)
    }
    if (results.malware.yara?.matchCount > 0) {
      score += Math.min(20, results.malware.yara.matchCount * 3)
    }
  }
  
  // Defacement detection (0-30 points)
  if (results.defacement?.changed) {
    const changeCount = results.defacement.changes?.length || 0
    score += Math.min(30, 20 + (changeCount * 2))
  }
  
  return Math.min(100, score)
}

/**
 * Determine overall status
 */
function determineOverallStatus(results, riskScore) {
  if (riskScore >= 70) return 'critical'
  if (riskScore >= 40) return 'infected'
  if (riskScore >= 20) return 'warning'
  return 'clean'
}

/**
 * Get severity label
 */
function getSeverity(riskScore) {
  if (riskScore >= 70) return 'CRITICAL'
  if (riskScore >= 40) return 'HIGH'
  if (riskScore >= 20) return 'MEDIUM'
  return 'LOW'
}

/**
 * Aggregate web vulnerability findings
 */
function aggregateWebFindings(results) {
  const findings = []
  
  if (results.web?.nikto) {
    if (results.web.nikto.json?.vulnerabilities) {
      findings.push(...results.web.nikto.json.vulnerabilities.map(v => ({
        tool: 'nikto',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  if (results.web?.wapiti) {
    if (results.web.wapiti.json?.vulnerabilities) {
      findings.push(...results.web.wapiti.json.vulnerabilities.map(v => ({
        tool: 'wapiti',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  if (results.web?.wpscan) {
    if (results.web.wpscan.json?.vulnerabilities) {
      findings.push(...results.web.wpscan.json.vulnerabilities.map(v => ({
        tool: 'wpscan',
        type: 'vulnerability',
        ...v
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      nikto: results.web?.nikto ? 'completed' : 'not_run',
      wapiti: results.web?.wapiti ? 'completed' : 'not_run',
      wpscan: results.web?.wpscan ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate malware findings
 */
function aggregateMalwareFindings(results) {
  const findings = []
  
  if (results.malware?.clamav) {
    if (results.malware.clamav.infectedFiles?.length > 0) {
      findings.push(...results.malware.clamav.infectedFiles.map(f => ({
        tool: 'clamav',
        type: 'malware',
        file: f.file,
        signature: f.signature
      })))
    }
  }
  
  if (results.malware?.yara) {
    if (results.malware.yara.matches?.length > 0) {
      findings.push(...results.malware.yara.matches.map(m => ({
        tool: 'yara',
        type: 'suspicious_pattern',
        file: m.file,
        rule: m.rule
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      clamav: results.malware?.clamav ? 'completed' : 'not_run',
      yara: results.malware?.yara ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate rootkit findings
 */
function aggregateRootkitFindings(results) {
  const findings = []
  
  if (results.rootkit?.rkhunter) {
    if (results.rootkit.rkhunter.warnings?.length > 0) {
      findings.push(...results.rootkit.rkhunter.warnings.map(w => ({
        tool: 'rkhunter',
        type: 'rootkit_warning',
        message: w
      })))
    }
  }
  
  if (results.rootkit?.chkrootkit) {
    if (results.rootkit.chkrootkit.findings?.length > 0) {
      findings.push(...results.rootkit.chkrootkit.findings.map(f => ({
        tool: 'chkrootkit',
        type: 'rootkit_finding',
        message: f
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    tools: {
      rkhunter: results.rootkit?.rkhunter ? 'completed' : 'not_run',
      chkrootkit: results.rootkit?.chkrootkit ? 'completed' : 'not_run'
    }
  }
}

/**
 * Aggregate system audit findings
 */
function aggregateSystemFindings(results) {
  const findings = []
  
  if (results.system?.lynis) {
    if (results.system.lynis.warnings?.length > 0) {
      findings.push(...results.system.lynis.warnings.map(w => ({
        tool: 'lynis',
        type: 'system_warning',
        message: w
      })))
    }
  }
  
  return {
    count: findings.length,
    findings,
    score: results.system?.lynis?.score || null,
    tools: {
      lynis: results.system?.lynis ? 'completed' : 'not_run'
    }
  }
}

/**
 * Count total findings (simplified: only malware and defacement)
 */
function countTotalFindings(findings) {
  return (
    (findings.malware?.count || 0) +
    (findings.defacement?.changed ? (findings.defacement.changes?.length || 1) : 0)
  )
}

/**
 * Generate recommendations based on findings (simplified: only malware and defacement)
 */
function generateRecommendations(findings, riskScore) {
  const recommendations = []
  
  if (findings.malware?.count > 0) {
    recommendations.push({
      priority: 'high',
      category: 'malware',
      action: 'Immediately quarantine and remove infected files',
      details: `${findings.malware.count} malware signatures detected`
    })
  }
  
  if (findings.defacement?.changed) {
    const changeCount = findings.defacement.changes?.length || 0
    recommendations.push({
      priority: 'high',
      category: 'defacement',
      action: 'Website content has changed. Investigate unauthorized modifications',
      details: `${changeCount} file(s) changed - possible defacement detected`
    })
  }
  
  if (riskScore < 20) {
    recommendations.push({
      priority: 'low',
      category: 'maintenance',
      action: 'System appears clean. Continue regular monitoring',
      details: 'No significant threats detected'
    })
  }
  
  return recommendations
}

module.exports = {
  aggregateResults,
  calculateRiskScore,
  determineOverallStatus,
  getSeverity
}

>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
