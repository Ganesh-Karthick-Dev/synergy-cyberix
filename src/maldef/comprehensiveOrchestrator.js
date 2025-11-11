// Comprehensive orchestrator for malware and defacement monitoring
// Integrates all scanner modules with real-time console output streaming
// All commands are exact and reproducible in WSL terminal

const path = require('path')
const fs = require('fs')
const {
  scanWithClamav,
  scanWithYara
} = require('./scanners')
// Tool installation is disabled - tools should be installed manually from Settings
// const {
//   checkAllTools,
//   installAllMissingTools,
//   updateClamavDefinitions
// } = require('./toolInstaller')
const {
  createBaseline,
  compareAgainstBaseline,
  monitorMultipleTargets
} = require('./defacementMonitor')
const { aggregateResults } = require('./resultAggregator')
const { crawlWithPuppeteer } = require('./pwScanner')

/**
 * Simplified 3-Step Malware & Defacement Monitoring System
 * 
 * Step 1: Crawl website (download files)
 * Step 2: Malware Detection (ClamAV + YARA)
 * Step 3: Defacement Detection (baseline comparison)
 * Step 4: Report Generation
 * 
 * @param {string} targetUrl - Target URL to scan
 * @param {Object} options - Scan options
 * @returns {Promise<Object>} Comprehensive scan report
 */
async function runComprehensiveScan(targetUrl, options = {}) {
  const {
    outRoot = path.join(process.cwd(), 'temp-scans'),
    distro = 'kali-linux',
    maxDepth = 1,
    scanTypes = {
      malware: true,
      defacement: true
    },
    yaraRulesPath = null, // Will use default rules if not provided
    baselineDir = path.join(process.cwd(), 'maldef-baselines'),
    autoInstallTools = false, // Disabled - tools should be installed manually from Settings
    updateClamav = false, // Disabled - updates should be done manually
    onProgress = () => {}
  } = options

  const startTime = Date.now()
  const ts = Date.now()
  const outDir = path.join(outRoot, `maldef-${ts}`)
  fs.mkdirSync(outDir, { recursive: true })

  onProgress({ stage: 'initializing', message: `Starting comprehensive scan of ${targetUrl}`, percentage: 0 })

  const results = {
    target: targetUrl,
    timestamp: new Date().toISOString(),
    malware: {},
    defacement: null
  }

  try {
    // Step 1: Crawl with Puppeteer (download website files)
    onProgress({ stage: 'crawl', message: 'Downloading website files...', percentage: 10 })
    
    const crawlReport = await crawlWithPuppeteer(targetUrl, {
      outDir,
      maxDepth,
      onProgress: (data) => {
        onProgress({
          ...data,
          stage: 'crawl',
          percentage: 10 + (data.percentage || 0) * 0.2
        })
      }
    })

    const crawledDir = path.join(outDir, new URL(targetUrl).hostname)

    // Step 2: Malware Detection (ClamAV + YARA)
    if (scanTypes.malware && crawlReport.crawledPages.length > 0) {
      onProgress({ stage: 'malware', message: 'Scanning for malware...', percentage: 30 })

      // ClamAV scan (signature-based detection)
      try {
        onProgress({ stage: 'malware', message: 'Running ClamAV scan (signature-based)...', percentage: 30 })
        results.malware.clamav = await scanWithClamav(distro, crawledDir, outDir, (update) => {
          onProgress({
            ...update,
            stage: 'malware',
            percentage: 30 + (update.percentage || 0) * 0.25,
            command: update.command,
            tool: update.tool || 'clamav'
          })
        })
      } catch (e) {
        onProgress({ stage: 'malware', message: `ClamAV scan failed: ${e.message}`, severity: 'error' })
        results.malware.clamav = { error: e.message }
      }

      // YARA scan (pattern-based detection)
      // Use default rules if not provided
      const defaultRulesPath = path.join(__dirname, 'rules', 'web_malware.yar')
      const rulesPath = yaraRulesPath || defaultRulesPath
      
      if (fs.existsSync(rulesPath)) {
        try {
          onProgress({ stage: 'malware', message: 'Running YARA scan (pattern-based)...', percentage: 55 })
          results.malware.yara = await scanWithYara(distro, rulesPath, crawledDir, outDir, (update) => {
            onProgress({
              ...update,
              stage: 'malware',
              percentage: 55 + (update.percentage || 0) * 0.25,
              command: update.command,
              tool: update.tool || 'yara'
            })
          })
        } catch (e) {
          onProgress({ stage: 'malware', message: `YARA scan failed: ${e.message}`, severity: 'error' })
          results.malware.yara = { error: e.message }
        }
      } else {
        onProgress({ stage: 'malware', message: `YARA rules file not found at ${rulesPath}, skipping pattern-based scan`, percentage: 80 })
      }
    } else if (scanTypes.malware) {
      onProgress({ stage: 'malware', message: 'No files crawled, skipping malware scan', percentage: 30 })
    }

    // Step 3: Defacement Detection (baseline comparison)
    if (scanTypes.defacement) {
      onProgress({ stage: 'defacement', message: 'Checking for defacement...', percentage: 60 })

      try {
        const baselineKey = new URL(targetUrl).hostname
        const baselineFile = path.join(baselineDir, `${baselineKey}_baseline.json`)

        // Create or compare baseline
        if (!fs.existsSync(baselineFile)) {
          onProgress({ stage: 'defacement', message: 'Creating baseline (first scan)...', percentage: 60 })
          await createBaseline(distro, targetUrl, baselineDir, (update) => {
            onProgress({ 
              ...update, 
              stage: 'defacement', 
              percentage: 60 + (update.percentage || 0) * 0.2,
              command: update.command,
              tool: update.tool || 'baseline'
            })
          })
          results.defacement = { changed: false, message: 'New baseline created' }
        } else {
          onProgress({ stage: 'defacement', message: 'Comparing against baseline...', percentage: 60 })
          const comparison = await compareAgainstBaseline(distro, targetUrl, baselineFile, (update) => {
            onProgress({ 
              ...update, 
              stage: 'defacement', 
              percentage: 60 + (update.percentage || 0) * 0.2,
              command: update.command,
              tool: update.tool || 'defacement'
            })
          })
          results.defacement = comparison
        }
      } catch (e) {
        onProgress({ stage: 'defacement', message: `Defacement check failed: ${e.message}`, severity: 'error' })
        results.defacement = { error: e.message }
      }
    }

    // Step 4: Report Generation
    onProgress({ stage: 'reporting', message: 'Generating report...', percentage: 85 })

    const scanDuration = Date.now() - startTime
    results.scanDuration = scanDuration

    const { report, reportFile } = aggregateResults(results, targetUrl, outDir)

    onProgress({ 
      stage: 'complete', 
      message: `Scan completed in ${(scanDuration / 1000).toFixed(2)}s`,
      percentage: 100,
      reportFile
    })

    // Return report with all necessary data for UI
    return {
      success: true,
      report: {
        ...report,
        // Include comparison data for defacement UI
        comparison: results.defacement || null,
        // Include report file paths
        reportFile,
        reportPdfPath: reportFile,
        reportHtmlPath: reportFile
      },
      reportFile,
      results,
      outDir,
      scanDuration
    }

  } catch (e) {
    onProgress({ 
      stage: 'error', 
      message: `Scan failed: ${e.message}`,
      severity: 'error',
      percentage: 100
    })

    return {
      success: false,
      error: e.message,
      results,
      outDir
    }
  }
}

module.exports = {
  runComprehensiveScan
}

