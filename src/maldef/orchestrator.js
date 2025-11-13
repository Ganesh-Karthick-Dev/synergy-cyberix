<<<<<<< HEAD
// Orchestrator: runs Puppeteer crawl, then WSL YARA/ClamAV, then assembles a report
const path = require('path')
const fs = require('fs')
const os = require('os')
const { crawlWithPuppeteer } = require('./pwScanner')
const { scanFilesWithYara, scanFilesWithClamav, runJsonScanScript } = require('./wslRunner')
const { loadBaseline, saveBaseline, compareAgainstBaseline } = require('./baselineManager')

async function ensureDir(dir) { await fs.promises.mkdir(dir, { recursive: true }) }

async function runMaldefScan(targetUrl, options = {}) {
  const {
    outRoot = path.join(process.cwd(), 'temp-scans'),
    distro = 'kali-linux',
    rulesLinuxPath = '/opt/maldef/rules',
    scansLinuxPath = '/opt/maldef/scans',
    scanScriptLinux = null, // e.g., '/opt/maldef/scan_site.sh' or Windows-mounted path
    maxDepth = 1,
    onProgress = () => {},
  } = options

  const ts = Date.now()
  const outDir = path.join(outRoot, `maldef-${ts}`)
  await ensureDir(outDir)

  onProgress({ stage: 'starting', message: `Preparing output at ${outDir}`, percentage: 5 })

  // 1) Crawl with Puppeteer and save artifacts
  onProgress({ stage: 'crawl', message: 'Launching headless browser crawler', percentage: 10 })
  const crawlReport = await crawlWithPuppeteer(targetUrl, { 
    outDir, 
    maxDepth,
    onProgress: (data) => {
      // Forward crawl progress with adjusted percentage
      onProgress({ 
        ...data, 
        percentage: Math.min(40, 10 + (data.percentage || 0) * 0.3),
        stage: `crawl:${data.stage || 'progress'}`
      })
    }
  })
  onProgress({ stage: 'crawl', message: `Crawled ${crawlReport.crawledPages.length} page(s)`, percentage: 40 })

  // 2) Copy artifacts to WSL scans path (optional for ClamAV/YARA)
  // For minimal prototype, we skip copy and assume the operator will sync if needed.

  // 3) Run JSON-producing WSL scan script against captured artifacts
  // Map Windows outDir to WSL /mnt path
  const toLinuxPath = (winPath) => {
    const drive = winPath.slice(0, 2).toLowerCase() // e.g. 'd:'
    const rest = winPath.slice(2).replace(/\\/g, '/').replace(/^\//, '')
    const driveLetter = drive[0]
    return `/mnt/${driveLetter}/${rest}`
  }
  const linuxOutDir = toLinuxPath(outDir)
  // Resolve script path: prefer provided, else use project script via Windows mount
  const defaultScriptWin = path.join(process.cwd(), 'src', 'maldef', 'scan_site.sh')
  const linuxScriptPath = scanScriptLinux || toLinuxPath(defaultScriptWin)
  onProgress({ stage: 'wsl', message: `Running WSL scan script at ${linuxScriptPath}`, percentage: 45 })
  const wslRes = await runJsonScanScript(distro, linuxScriptPath, targetUrl, linuxOutDir, (t, m) => onProgress({ stage: `wsl:${t}`, message: m, percentage: 45 + Math.random() * 10 }))
  let wslJson = null
  try { wslJson = JSON.parse((wslRes.stdout || '').trim()) } catch {}

  // 4) Baseline compare (html hashes + screenshot hashes)
  onProgress({ stage: 'baseline', message: 'Loading baseline for comparison', percentage: 55 })
  const baselineKey = new URL(targetUrl).hostname
  const baseline = await loadBaseline(baselineKey)
  const comparison = compareAgainstBaseline(baseline, crawlReport)
  onProgress({ stage: 'baseline', message: 'Baseline comparison completed', percentage: 60 })

  // 4a) Local suspicious pattern scan over captured HTML (no WSL)
  onProgress({ stage: 'analyze', message: 'Scanning for suspicious patterns', percentage: 65 })
  const suspiciousRegexes = [
    { id: 'eval_call', label: 'eval(', re: /eval\s*\(/gi },
    { id: 'base64', label: 'base64_decode|atob(', re: /base64_decode|atob\s*\(/gi },
    { id: 'document_write', label: 'document.write(', re: /document\.write\s*\(/gi },
    { id: 'obf_unescape', label: 'unescape(', re: /unescape\s*\(/gi },
    { id: 'hacked_banner', label: 'hacked by/defaced by', re: /hacked by|defaced by|owned by/gi },
    { id: 'suspicious_iframe', label: 'hidden iframes', re: /<iframe[^>]+style=[^>]*display\s*:\s*none/gi },
    { id: 'javascript_obfuscation', label: 'obfuscated javascript', re: /[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*['"`][a-zA-Z0-9+/=]{50,}['"`]/gi },
    { id: 'suspicious_redirects', label: 'suspicious redirects', re: /window\.location\s*=\s*['"`][^'"`]*['"`]/gi },
    { id: 'crypto_mining', label: 'crypto mining patterns', re: /cryptonight|monero|bitcoin|mining|coinbase/gi },
    { id: 'malicious_scripts', label: 'malicious script patterns', re: /document\.createElement\s*\(\s*['"`]script['"`]\s*\)/gi }
  ]
  const perPageFindings = []
  try {
    for (let i = 0; i < crawlReport.crawledPages.length; i++) {
      const page = crawlReport.crawledPages[i]
      const urlObj = new URL(page.url)
      const pageDir = path.join(outDir, urlObj.hostname, encodeURIComponent(urlObj.pathname || '/'))
      const htmlPath = path.join(pageDir, 'rendered.html')
      let html = ''
      try { html = await fs.promises.readFile(htmlPath, 'utf8') } catch {}
      const hits = []
      for (const r of suspiciousRegexes) {
        const m = html.match(r.re)
        if (m && m.length > 0) hits.push({ id: r.id, label: r.label, count: m.length })
      }
      perPageFindings.push({ url: page.url, htmlPath, hits })
      
      // Update progress
      onProgress({ 
        stage: 'analyze', 
        message: `Analyzed page ${i + 1}/${crawlReport.crawledPages.length}: ${page.url}`,
        percentage: 65 + (i + 1) / crawlReport.crawledPages.length * 10
      })
    }
  } catch (e) {
    onProgress({ stage: 'analyze', message: `Suspicious pattern scan skipped: ${e.message}` })
  }

  // Optional visual pixel diff using pixelmatch when baseline assets exist
  onProgress({ stage: 'visual', message: 'Performing visual difference analysis', percentage: 75 })
  let visualDiffPercent = null
  let diffDesktopFilePath = null
  try {
    const primaryPage = crawlReport.crawledPages[0]
    if (primaryPage && baseline && baseline.pages && baseline.pages.length > 0) {
      const { PNG } = require('pngjs')
      const pixelmatch = require('pixelmatch')
      const u = new URL(primaryPage.url)
      const currentDesktopPng = path.join(outDir, u.hostname, encodeURIComponent(u.pathname || '/'), 'desktop.png')
      const baselineDesktopPng = path.join(process.cwd(), 'maldef-baselines', baselineKey, 'desktop.png')
      if (fs.existsSync(currentDesktopPng) && fs.existsSync(baselineDesktopPng)) {
        const img1 = PNG.sync.read(fs.readFileSync(baselineDesktopPng))
        const img2 = PNG.sync.read(fs.readFileSync(currentDesktopPng))
        const width = Math.min(img1.width, img2.width)
        const height = Math.min(img1.height, img2.height)
        const diffPng = new PNG({ width, height })
        const numDiff = pixelmatch(img1.data, img2.data, diffPng.data, width, height, { threshold: 0.1 })
        visualDiffPercent = Math.round((numDiff / (width * height)) * 10000) / 100 // two decimals
        diffDesktopFilePath = path.join(outDir, 'diff-desktop.png')
        fs.writeFileSync(diffDesktopFilePath, PNG.sync.write(diffPng))
        onProgress({ stage: 'visual', message: `Visual diff calculated: ${visualDiffPercent}%`, percentage: 80 })
      } else {
        onProgress({ stage: 'visual', message: 'No baseline images available for comparison', percentage: 80 })
      }
    } else {
      onProgress({ stage: 'visual', message: 'No baseline available for visual comparison', percentage: 80 })
    }
  } catch (e) {
    onProgress({ stage: 'visual', message: `Pixel diff skipped: ${e.message}`, percentage: 80 })
  }

  await saveBaseline(baselineKey, crawlReport)
  onProgress({ stage: 'baseline', message: 'Baseline updated', percentage: 85 })

  // 5) Assemble report
  onProgress({ stage: 'report', message: 'Generating comprehensive report', percentage: 90 })
  // Determine quick statuses
  // Use WSL scan results if available, otherwise use empty results
  const yaraRaw = (wslJson && wslJson.yara && wslJson.yara.raw) ? wslJson.yara.raw : ''
  const clamRaw = (wslJson && wslJson.clamav && wslJson.clamav.raw) ? wslJson.clamav.raw : ''
  const yaraRes = { code: 0, stdout: yaraRaw, stderr: '' }
  const clamRes = { code: 0, stdout: clamRaw, stderr: '' }
  const yaraLines = (yaraRes.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const yaraMatches = []
  for (const line of yaraLines) {
    if (!line || line === 'yara_not_installed') continue
    const colon = line.indexOf(':')
    if (colon > 0) {
      const file = line.slice(0, colon).trim()
      const rule = line.slice(colon + 1).trim()
      yaraMatches.push({ rule, file })
    } else {
      const parts = line.split(/\s+/)
      if (parts.length >= 2) {
        yaraMatches.push({ rule: parts[0], file: parts.slice(1).join(' ') })
      } else if (line) {
        yaraMatches.push({ rule: line, file: '' })
      }
    }
  }
  const yaraHits = yaraMatches.length > 0
  const clamInfected = (() => {
    // First check wslJson for infected count
    if (wslJson && wslJson.clamav && typeof wslJson.clamav.infectedCount === 'number') {
      return wslJson.clamav.infectedCount > 0
    }
    // Fallback to parsing stdout
    try {
      const m = (clamRes.stdout || '').match(/Infected files:\s*(\d+)/i)
      return m ? parseInt(m[1], 10) > 0 : false
    } catch { return false }
  })()
  const clamDetails = (() => {
    const infected = []
    try {
      const lines = (clamRes.stdout || '').split(/\r?\n/)
      for (const l of lines) {
        const mm = l.match(/^(.*?):\s*(.*)\s+FOUND$/)
        if (mm) infected.push({ file: mm[1], signature: mm[2] })
      }
    } catch {}
    return infected
  })()
  const malwareStatus = (() => {
    if (wslJson && wslJson.malware_status) return String(wslJson.malware_status).toLowerCase()
    return (yaraHits || clamInfected) ? 'infected' : 'clean'
  })()
  const defacementStatus = (() => {
    if (wslJson && wslJson.defacement_status) {
      const v = String(wslJson.defacement_status).toLowerCase()
      if (v === 'defaced' || v === 'changed') return 'changed'
      if (v === 'normal' || v === 'clean') return 'normal'
    }
    const anyChange = comparison && Array.isArray(comparison.changes) && comparison.changes.length > 0
    const visualFlag = typeof visualDiffPercent === 'number' ? visualDiffPercent > 1 : false
    return (anyChange || visualFlag) ? 'changed' : 'normal'
  })()

  // Compute a naive risk score
  const riskScore = (() => {
    let score = 0
    if (yaraHits) score += 40
    if (clamInfected) score += 50
    if (comparison && Array.isArray(comparison.changes)) score += Math.min(10, comparison.changes.length * 2)
    if (typeof visualDiffPercent === 'number') score += Math.min(20, Math.round(visualDiffPercent))
    const suspiciousHitCount = perPageFindings.reduce((a, p) => a + (p.hits ? p.hits.reduce((x, h) => x + h.count, 0) : 0), 0)
    score += Math.min(20, suspiciousHitCount)
    return Math.min(100, score)
  })()

  const report = {
    target: targetUrl,
    outDir,
    createdAt: new Date().toISOString(),
    crawl: crawlReport,
    yara: { code: yaraRes.code, stdout: yaraRes.stdout, stderr: yaraRes.stderr },
    clamav: { code: clamRes.code, stdout: clamRes.stdout, stderr: clamRes.stderr },
    comparison: {
      ...comparison,
      visualDiffPercent,
      diffDesktopFilePath,
      diffDesktopFileUrl: diffDesktopFilePath ? `file:///${diffDesktopFilePath.replace(/\\/g, '/')}` : null
    },
    summary: {
      malwareStatus, // 'clean' | 'infected'
      defacementStatus, // 'normal' | 'changed'
      riskScore,
      severity: (() => {
        if (wslJson && wslJson.malware_status) return String(wslJson.malware_status)
        return malwareStatus === 'infected' || defacementStatus === 'changed' ? 'Infected/Changed' : 'Clean'
      })()
    },
    findings: {
      yaraMatches,
      clamInfectedFiles: clamDetails,
      suspiciousContent: perPageFindings,
      wsl: wslJson || null
    }
  }
  await fs.promises.writeFile(path.join(outDir, 'maldef-report.json'), JSON.stringify(report, null, 2))

  // Create a comprehensive HTML summary and optional PDF
  try {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Malware & Defacement Report - ${report.target}</title>
    <style>
      body{font-family:'Poppins',system-ui,Segoe UI,sans-serif;padding:24px;background:#0b1020;color:#e6e6e6;line-height:1.6}
      .header{background:linear-gradient(135deg,#1e293b,#334155);padding:24px;border-radius:12px;margin-bottom:24px;text-align:center}
      .header h1{color:#f8fafc;margin:0;font-size:2.5rem;font-weight:700}
      .header .subtitle{color:#cbd5e1;margin-top:8px;font-size:1.1rem}
      .card{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
      .card h2{color:#f1f5f9;margin-top:0;margin-bottom:16px;font-size:1.5rem;border-bottom:2px solid #334155;padding-bottom:8px}
      .badge{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:600;font-size:0.875rem}
      .ok{background:#065f46;color:#a7f3d0;border:1px solid #10b981}
      .warn{background:#7c2d12;color:#fed7aa;border:1px solid #f59e0b}
      .critical{background:#991b1b;color:#fecaca;border:1px solid #ef4444}
      .info{background:#1e40af;color:#bfdbfe;border:1px solid #3b82f6}
      .status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
      .status-item{background:#1e293b;padding:16px;border-radius:8px;text-align:center;border:1px solid #475569}
      .status-item .icon{font-size:2rem;margin-bottom:8px}
      .status-item .label{font-weight:600;color:#e2e8f0;margin-bottom:4px}
      .status-item .value{font-size:1.25rem;font-weight:700}
      img{max-width:100%;height:auto;border:1px solid #334155;border-radius:8px;margin:8px 0}
      code{background:#111827;color:#e5e7eb;padding:4px 8px;border-radius:4px;font-family:monospace;word-break:break-all}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #334155;padding:12px;text-align:left}
      th{background:#1e293b;color:#f1f5f9;font-weight:600}
      tr:nth-child(even){background:#0f172a}
      tr:hover{background:#1e293b}
      .summary-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
      .stat-item{background:#1e293b;padding:12px;border-radius:8px;text-align:center}
      .stat-value{font-size:1.5rem;font-weight:700;color:#f1f5f9}
      .stat-label{font-size:0.875rem;color:#94a3b8;margin-top:4px}
      .findings-section{margin:20px 0}
      .finding-item{background:#1e293b;border:1px solid #475569;border-radius:8px;padding:16px;margin-bottom:12px}
      .finding-item.critical{border-color:#ef4444;background:#1f2937}
      .finding-item.warning{border-color:#f59e0b;background:#1f2937}
      .finding-item.info{border-color:#3b82f6;background:#1f2937}
      .finding-header{display:flex;justify-content:between;align-items:center;margin-bottom:8px}
      .finding-title{font-weight:600;color:#f1f5f9}
      .finding-count{background:#475569;color:#e2e8f0;padding:2px 8px;border-radius:12px;font-size:0.75rem}
      .footer{text-align:center;margin-top:40px;padding:20px;border-top:1px solid #334155;color:#94a3b8}
      .timestamp{color:#64748b;font-size:0.875rem}
    </style></head><body>
    <div class="header">
      <h1>🛡️ Malware & Defacement Report</h1>
      <div class="subtitle">Comprehensive Security Analysis</div>
    </div>
    
    <div class="card">
      <h2>📋 Executive Summary</h2>
      <div class="summary-stats">
        <div class="stat-item">
          <div class="stat-value">${report.crawl.crawledPages.length}</div>
          <div class="stat-label">Pages Scanned</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${riskScore}/100</div>
          <div class="stat-label">Risk Score</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${typeof visualDiffPercent === 'number' ? visualDiffPercent + '%' : 'N/A'}</div>
          <div class="stat-label">Visual Diff</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${report.findings.yaraMatches.length + report.findings.clamInfectedFiles.length}</div>
          <div class="stat-label">Threats Found</div>
        </div>
      </div>
      <div><strong>Target:</strong> <code>${report.target}</code></div>
      <div><strong>Generated:</strong> <span class="timestamp">${new Date(report.createdAt).toLocaleString()}</span></div>
    </div>
    
    <div class="card">
      <h2>🚨 Security Status</h2>
      <div class="status-grid">
        <div class="status-item">
          <div class="icon">${malwareStatus === 'clean' ? '✅' : '❌'}</div>
          <div class="label">Malware Status</div>
          <div class="value ${malwareStatus === 'clean' ? 'ok' : 'critical'}">${malwareStatus.toUpperCase()}</div>
        </div>
        <div class="status-item">
          <div class="icon">${defacementStatus === 'normal' ? '✅' : '⚠️'}</div>
          <div class="label">Defacement Status</div>
          <div class="value ${defacementStatus === 'normal' ? 'ok' : 'warn'}">${defacementStatus.toUpperCase()}</div>
        </div>
        <div class="status-item">
          <div class="icon">📊</div>
          <div class="label">Overall Severity</div>
          <div class="value info">${report.summary.severity || 'UNKNOWN'}</div>
        </div>
        <div class="status-item">
          <div class="icon">🎯</div>
          <div class="label">Risk Level</div>
          <div class="value ${riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warn' : 'ok'}">${riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW'}</div>
        </div>
      </div>
    </div>
    
    ${report.comparison.diffDesktopFileUrl ? `<div class="card"><h2>🖼️ Visual Difference Analysis</h2><img src="${report.comparison.diffDesktopFileUrl}" alt="Visual difference comparison"/></div>` : ''}
    
    <div class="card">
      <h2>🔍 Content Integrity Analysis</h2>
      <div><strong>Baseline Available:</strong> ${report.comparison.hasBaseline ? 'Yes' : 'No'}</div>
      <div><strong>Changes Detected:</strong> ${Array.isArray(report.comparison.changes) ? report.comparison.changes.length : 0}</div>
      ${Array.isArray(report.comparison.changes) && report.comparison.changes.length ? `
        <table>
          <thead><tr><th>URL</th><th>Change Type</th><th>Timestamp</th></tr></thead>
          <tbody>${report.comparison.changes.map(c=>`<tr><td><code>${c.url}</code></td><td><span class="badge warn">${c.type}</span></td><td>${new Date().toLocaleString()}</td></tr>`).join('')}</tbody>
        </table>
      ` : '<div class="ok badge">✅ No unauthorized changes detected</div>'}
    </div>
    
    <div class="findings-section">
      <div class="card">
        <h2>🔍 YARA Rule Matches</h2>
        ${report.findings && report.findings.yaraMatches && report.findings.yaraMatches.length ? `
          <table>
            <thead><tr><th>Rule Name</th><th>File Path</th><th>Severity</th></tr></thead>
            <tbody>${report.findings.yaraMatches.map(y=>`<tr><td><code>${y.rule}</code></td><td><code>${y.file}</code></td><td><span class="badge critical">HIGH</span></td></tr>`).join('')}</tbody>
          </table>
        ` : '<div class="ok badge">✅ No YARA rule matches found</div>'}
      </div>
      
      <div class="card">
        <h2>🦠 ClamAV Antivirus Results</h2>
        ${report.findings && report.findings.clamInfectedFiles && report.findings.clamInfectedFiles.length ? `
          <table>
            <thead><tr><th>Infected File</th><th>Virus Signature</th><th>Action Required</th></tr></thead>
            <tbody>${report.findings.clamInfectedFiles.map(c=>`<tr><td><code>${c.file}</code></td><td><span class="badge critical">${c.signature}</span></td><td><span class="badge critical">IMMEDIATE</span></td></tr>`).join('')}</tbody>
          </table>
        ` : '<div class="ok badge">✅ No infected files detected</div>'}
      </div>
      
      <div class="card">
        <h2>⚠️ Suspicious Content Patterns</h2>
        ${report.findings && report.findings.suspiciousContent && report.findings.suspiciousContent.some(p=>p.hits && p.hits.length) ? `
          ${report.findings.suspiciousContent.filter(p=>p.hits && p.hits.length).map(p=>`
            <div class="finding-item warning">
              <div class="finding-header">
                <div class="finding-title">${p.url}</div>
                <div class="finding-count">${p.hits.reduce((a,h)=>a+h.count,0)} patterns</div>
              </div>
              <ul>${p.hits.map(h=>`<li><strong>${h.label}:</strong> ${h.count} occurrences</li>`).join('')}</ul>
            </div>
          `).join('')}
        ` : '<div class="ok badge">✅ No suspicious patterns detected</div>'}
      </div>
    </div>
    
    <div class="card">
      <h2>📊 Technical Details</h2>
      <h3>Content Hashes (First Page)</h3>
      ${(() => { 
        try { 
          const p = report.crawl.crawledPages[0] || {}; 
          return `
            <div><strong>HTML Hash:</strong> <code>${p.htmlHash||'n/a'}</code></div>
            <div><strong>Desktop Screenshot Hash:</strong> <code>${p.desktopHash||'n/a'}</code></div>
            <div><strong>Mobile Screenshot Hash:</strong> <code>${p.mobileHash||'n/a'}</code></div>
          ` 
        } catch { return '<div>No hash data available</div>' } 
      })()}
      
      <h3>Network Activity</h3>
      <div><strong>Total Requests:</strong> ${report.crawl.networkLogs ? report.crawl.networkLogs.filter(l => l.type === 'request').length : 0}</div>
      <div><strong>Total Responses:</strong> ${report.crawl.networkLogs ? report.crawl.networkLogs.filter(l => l.type === 'response').length : 0}</div>
    </div>
    
    ${options.readableText ? `
    <div class="card">
      <h2>📄 Readable Report</h2>
      <div style="background:#1e293b;padding:16px;border-radius:8px;white-space:pre-wrap;font-family:monospace;font-size:0.875rem;line-height:1.6;max-height:600px;overflow:auto">
        ${options.readableText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    </div>
    ` : ''}
    
    <div class="footer">
      <div>Report generated by Synergy Cyberix Malware & Defacement Monitor</div>
      <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
      <div class="timestamp">Scan ID: ${ts}</div>
    </div>
    </body></html>`
    const htmlPath = path.join(outDir, 'maldef-report.html')
    await fs.promises.writeFile(htmlPath, html)
    report.reportHtmlPath = htmlPath
    // Try to generate PDF via puppeteer if available
    try {
      const puppeteer = require('puppeteer')
      const browser = await puppeteer.launch({ headless: 'new' })
      const page = await browser.newPage()
      await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })
      const pdfPath = path.join(outDir, 'maldef-report.pdf')
      await page.pdf({ path: pdfPath, printBackground: true, format: 'A4' })
      await browser.close()
      report.reportPdfPath = pdfPath
    } catch (e) {
      onProgress({ stage: 'report', message: `PDF generation skipped: ${e.message}` })
    }
  } catch (e) {
    onProgress({ stage: 'report', message: `HTML report skipped: ${e.message}` })
  }

  onProgress({ stage: 'done', message: 'Malware & defacement scan complete', percentage: 100 })
  return report
}

module.exports = { runMaldefScan }


=======
// Orchestrator: runs Puppeteer crawl, then WSL YARA/ClamAV, then assembles a report
const path = require('path')
const fs = require('fs')
const os = require('os')
const { crawlWithPuppeteer } = require('./pwScanner')
const { scanFilesWithYara, scanFilesWithClamav, runJsonScanScript } = require('./wslRunner')
const { loadBaseline, saveBaseline, compareAgainstBaseline } = require('./baselineManager')

async function ensureDir(dir) { await fs.promises.mkdir(dir, { recursive: true }) }

async function runMaldefScan(targetUrl, options = {}) {
  const {
    outRoot = path.join(process.cwd(), 'temp-scans'),
    distro = 'kali-linux',
    rulesLinuxPath = '/opt/maldef/rules',
    scansLinuxPath = '/opt/maldef/scans',
    scanScriptLinux = null, // e.g., '/opt/maldef/scan_site.sh' or Windows-mounted path
    maxDepth = 1,
    onProgress = () => {},
  } = options

  const ts = Date.now()
  const outDir = path.join(outRoot, `maldef-${ts}`)
  await ensureDir(outDir)

  onProgress({ stage: 'starting', message: `Preparing output at ${outDir}`, percentage: 5 })

  // 1) Crawl with Puppeteer and save artifacts
  onProgress({ stage: 'crawl', message: 'Launching headless browser crawler', percentage: 10 })
  const crawlReport = await crawlWithPuppeteer(targetUrl, { 
    outDir, 
    maxDepth,
    onProgress: (data) => {
      // Forward crawl progress with adjusted percentage
      onProgress({ 
        ...data, 
        percentage: Math.min(40, 10 + (data.percentage || 0) * 0.3),
        stage: `crawl:${data.stage || 'progress'}`
      })
    }
  })
  onProgress({ stage: 'crawl', message: `Crawled ${crawlReport.crawledPages.length} page(s)`, percentage: 40 })

  // 2) Copy artifacts to WSL scans path (optional for ClamAV/YARA)
  // For minimal prototype, we skip copy and assume the operator will sync if needed.

  // 3) Run JSON-producing WSL scan script against captured artifacts
  // Map Windows outDir to WSL /mnt path
  const toLinuxPath = (winPath) => {
    const drive = winPath.slice(0, 2).toLowerCase() // e.g. 'd:'
    const rest = winPath.slice(2).replace(/\\/g, '/').replace(/^\//, '')
    const driveLetter = drive[0]
    return `/mnt/${driveLetter}/${rest}`
  }
  const linuxOutDir = toLinuxPath(outDir)
  // Resolve script path: prefer provided, else use project script via Windows mount
  const defaultScriptWin = path.join(process.cwd(), 'src', 'maldef', 'scan_site.sh')
  const linuxScriptPath = scanScriptLinux || toLinuxPath(defaultScriptWin)
  onProgress({ stage: 'wsl', message: `Running WSL scan script at ${linuxScriptPath}`, percentage: 45 })
  const wslRes = await runJsonScanScript(distro, linuxScriptPath, targetUrl, linuxOutDir, (t, m) => onProgress({ stage: `wsl:${t}`, message: m, percentage: 45 + Math.random() * 10 }))
  let wslJson = null
  try { wslJson = JSON.parse((wslRes.stdout || '').trim()) } catch {}

  // 4) Baseline compare (html hashes + screenshot hashes)
  onProgress({ stage: 'baseline', message: 'Loading baseline for comparison', percentage: 55 })
  const baselineKey = new URL(targetUrl).hostname
  const baseline = await loadBaseline(baselineKey)
  const comparison = compareAgainstBaseline(baseline, crawlReport)
  onProgress({ stage: 'baseline', message: 'Baseline comparison completed', percentage: 60 })

  // 4a) Local suspicious pattern scan over captured HTML (no WSL)
  onProgress({ stage: 'analyze', message: 'Scanning for suspicious patterns', percentage: 65 })
  const suspiciousRegexes = [
    { id: 'eval_call', label: 'eval(', re: /eval\s*\(/gi },
    { id: 'base64', label: 'base64_decode|atob(', re: /base64_decode|atob\s*\(/gi },
    { id: 'document_write', label: 'document.write(', re: /document\.write\s*\(/gi },
    { id: 'obf_unescape', label: 'unescape(', re: /unescape\s*\(/gi },
    { id: 'hacked_banner', label: 'hacked by/defaced by', re: /hacked by|defaced by|owned by/gi },
    { id: 'suspicious_iframe', label: 'hidden iframes', re: /<iframe[^>]+style=[^>]*display\s*:\s*none/gi },
    { id: 'javascript_obfuscation', label: 'obfuscated javascript', re: /[a-zA-Z_$][a-zA-Z0-9_$]*\s*=\s*['"`][a-zA-Z0-9+/=]{50,}['"`]/gi },
    { id: 'suspicious_redirects', label: 'suspicious redirects', re: /window\.location\s*=\s*['"`][^'"`]*['"`]/gi },
    { id: 'crypto_mining', label: 'crypto mining patterns', re: /cryptonight|monero|bitcoin|mining|coinbase/gi },
    { id: 'malicious_scripts', label: 'malicious script patterns', re: /document\.createElement\s*\(\s*['"`]script['"`]\s*\)/gi }
  ]
  const perPageFindings = []
  try {
    for (let i = 0; i < crawlReport.crawledPages.length; i++) {
      const page = crawlReport.crawledPages[i]
      const urlObj = new URL(page.url)
      const pageDir = path.join(outDir, urlObj.hostname, encodeURIComponent(urlObj.pathname || '/'))
      const htmlPath = path.join(pageDir, 'rendered.html')
      let html = ''
      try { html = await fs.promises.readFile(htmlPath, 'utf8') } catch {}
      const hits = []
      for (const r of suspiciousRegexes) {
        const m = html.match(r.re)
        if (m && m.length > 0) hits.push({ id: r.id, label: r.label, count: m.length })
      }
      perPageFindings.push({ url: page.url, htmlPath, hits })
      
      // Update progress
      onProgress({ 
        stage: 'analyze', 
        message: `Analyzed page ${i + 1}/${crawlReport.crawledPages.length}: ${page.url}`,
        percentage: 65 + (i + 1) / crawlReport.crawledPages.length * 10
      })
    }
  } catch (e) {
    onProgress({ stage: 'analyze', message: `Suspicious pattern scan skipped: ${e.message}` })
  }

  // Optional visual pixel diff using pixelmatch when baseline assets exist
  onProgress({ stage: 'visual', message: 'Performing visual difference analysis', percentage: 75 })
  let visualDiffPercent = null
  let diffDesktopFilePath = null
  try {
    const primaryPage = crawlReport.crawledPages[0]
    if (primaryPage && baseline && baseline.pages && baseline.pages.length > 0) {
      const { PNG } = require('pngjs')
      const pixelmatch = require('pixelmatch')
      const u = new URL(primaryPage.url)
      const currentDesktopPng = path.join(outDir, u.hostname, encodeURIComponent(u.pathname || '/'), 'desktop.png')
      const baselineDesktopPng = path.join(process.cwd(), 'maldef-baselines', baselineKey, 'desktop.png')
      if (fs.existsSync(currentDesktopPng) && fs.existsSync(baselineDesktopPng)) {
        const img1 = PNG.sync.read(fs.readFileSync(baselineDesktopPng))
        const img2 = PNG.sync.read(fs.readFileSync(currentDesktopPng))
        const width = Math.min(img1.width, img2.width)
        const height = Math.min(img1.height, img2.height)
        const diffPng = new PNG({ width, height })
        const numDiff = pixelmatch(img1.data, img2.data, diffPng.data, width, height, { threshold: 0.1 })
        visualDiffPercent = Math.round((numDiff / (width * height)) * 10000) / 100 // two decimals
        diffDesktopFilePath = path.join(outDir, 'diff-desktop.png')
        fs.writeFileSync(diffDesktopFilePath, PNG.sync.write(diffPng))
        onProgress({ stage: 'visual', message: `Visual diff calculated: ${visualDiffPercent}%`, percentage: 80 })
      } else {
        onProgress({ stage: 'visual', message: 'No baseline images available for comparison', percentage: 80 })
      }
    } else {
      onProgress({ stage: 'visual', message: 'No baseline available for visual comparison', percentage: 80 })
    }
  } catch (e) {
    onProgress({ stage: 'visual', message: `Pixel diff skipped: ${e.message}`, percentage: 80 })
  }

  await saveBaseline(baselineKey, crawlReport)
  onProgress({ stage: 'baseline', message: 'Baseline updated', percentage: 85 })

  // 5) Assemble report
  onProgress({ stage: 'report', message: 'Generating comprehensive report', percentage: 90 })
  // Determine quick statuses
  // Use WSL scan results if available, otherwise use empty results
  const yaraRaw = (wslJson && wslJson.yara && wslJson.yara.raw) ? wslJson.yara.raw : ''
  const clamRaw = (wslJson && wslJson.clamav && wslJson.clamav.raw) ? wslJson.clamav.raw : ''
  const yaraRes = { code: 0, stdout: yaraRaw, stderr: '' }
  const clamRes = { code: 0, stdout: clamRaw, stderr: '' }
  const yaraLines = (yaraRes.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  const yaraMatches = []
  for (const line of yaraLines) {
    if (!line || line === 'yara_not_installed') continue
    const colon = line.indexOf(':')
    if (colon > 0) {
      const file = line.slice(0, colon).trim()
      const rule = line.slice(colon + 1).trim()
      yaraMatches.push({ rule, file })
    } else {
      const parts = line.split(/\s+/)
      if (parts.length >= 2) {
        yaraMatches.push({ rule: parts[0], file: parts.slice(1).join(' ') })
      } else if (line) {
        yaraMatches.push({ rule: line, file: '' })
      }
    }
  }
  const yaraHits = yaraMatches.length > 0
  const clamInfected = (() => {
    // First check wslJson for infected count
    if (wslJson && wslJson.clamav && typeof wslJson.clamav.infectedCount === 'number') {
      return wslJson.clamav.infectedCount > 0
    }
    // Fallback to parsing stdout
    try {
      const m = (clamRes.stdout || '').match(/Infected files:\s*(\d+)/i)
      return m ? parseInt(m[1], 10) > 0 : false
    } catch { return false }
  })()
  const clamDetails = (() => {
    const infected = []
    try {
      const lines = (clamRes.stdout || '').split(/\r?\n/)
      for (const l of lines) {
        const mm = l.match(/^(.*?):\s*(.*)\s+FOUND$/)
        if (mm) infected.push({ file: mm[1], signature: mm[2] })
      }
    } catch {}
    return infected
  })()
  const malwareStatus = (() => {
    if (wslJson && wslJson.malware_status) return String(wslJson.malware_status).toLowerCase()
    return (yaraHits || clamInfected) ? 'infected' : 'clean'
  })()
  const defacementStatus = (() => {
    if (wslJson && wslJson.defacement_status) {
      const v = String(wslJson.defacement_status).toLowerCase()
      if (v === 'defaced' || v === 'changed') return 'changed'
      if (v === 'normal' || v === 'clean') return 'normal'
    }
    const anyChange = comparison && Array.isArray(comparison.changes) && comparison.changes.length > 0
    const visualFlag = typeof visualDiffPercent === 'number' ? visualDiffPercent > 1 : false
    return (anyChange || visualFlag) ? 'changed' : 'normal'
  })()

  // Compute a naive risk score
  const riskScore = (() => {
    let score = 0
    if (yaraHits) score += 40
    if (clamInfected) score += 50
    if (comparison && Array.isArray(comparison.changes)) score += Math.min(10, comparison.changes.length * 2)
    if (typeof visualDiffPercent === 'number') score += Math.min(20, Math.round(visualDiffPercent))
    const suspiciousHitCount = perPageFindings.reduce((a, p) => a + (p.hits ? p.hits.reduce((x, h) => x + h.count, 0) : 0), 0)
    score += Math.min(20, suspiciousHitCount)
    return Math.min(100, score)
  })()

  const report = {
    target: targetUrl,
    outDir,
    createdAt: new Date().toISOString(),
    crawl: crawlReport,
    yara: { code: yaraRes.code, stdout: yaraRes.stdout, stderr: yaraRes.stderr },
    clamav: { code: clamRes.code, stdout: clamRes.stdout, stderr: clamRes.stderr },
    comparison: {
      ...comparison,
      visualDiffPercent,
      diffDesktopFilePath,
      diffDesktopFileUrl: diffDesktopFilePath ? `file:///${diffDesktopFilePath.replace(/\\/g, '/')}` : null
    },
    summary: {
      malwareStatus, // 'clean' | 'infected'
      defacementStatus, // 'normal' | 'changed'
      riskScore,
      severity: (() => {
        if (wslJson && wslJson.malware_status) return String(wslJson.malware_status)
        return malwareStatus === 'infected' || defacementStatus === 'changed' ? 'Infected/Changed' : 'Clean'
      })()
    },
    findings: {
      yaraMatches,
      clamInfectedFiles: clamDetails,
      suspiciousContent: perPageFindings,
      wsl: wslJson || null
    }
  }
  await fs.promises.writeFile(path.join(outDir, 'maldef-report.json'), JSON.stringify(report, null, 2))

  // Create a comprehensive HTML summary and optional PDF
  try {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Malware & Defacement Report - ${report.target}</title>
    <style>
      body{font-family:'Poppins',system-ui,Segoe UI,sans-serif;padding:24px;background:#0b1020;color:#e6e6e6;line-height:1.6}
      .header{background:linear-gradient(135deg,#1e293b,#334155);padding:24px;border-radius:12px;margin-bottom:24px;text-align:center}
      .header h1{color:#f8fafc;margin:0;font-size:2.5rem;font-weight:700}
      .header .subtitle{color:#cbd5e1;margin-top:8px;font-size:1.1rem}
      .card{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:20px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}
      .card h2{color:#f1f5f9;margin-top:0;margin-bottom:16px;font-size:1.5rem;border-bottom:2px solid #334155;padding-bottom:8px}
      .badge{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:600;font-size:0.875rem}
      .ok{background:#065f46;color:#a7f3d0;border:1px solid #10b981}
      .warn{background:#7c2d12;color:#fed7aa;border:1px solid #f59e0b}
      .critical{background:#991b1b;color:#fecaca;border:1px solid #ef4444}
      .info{background:#1e40af;color:#bfdbfe;border:1px solid #3b82f6}
      .status-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
      .status-item{background:#1e293b;padding:16px;border-radius:8px;text-align:center;border:1px solid #475569}
      .status-item .icon{font-size:2rem;margin-bottom:8px}
      .status-item .label{font-weight:600;color:#e2e8f0;margin-bottom:4px}
      .status-item .value{font-size:1.25rem;font-weight:700}
      img{max-width:100%;height:auto;border:1px solid #334155;border-radius:8px;margin:8px 0}
      code{background:#111827;color:#e5e7eb;padding:4px 8px;border-radius:4px;font-family:monospace;word-break:break-all}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #334155;padding:12px;text-align:left}
      th{background:#1e293b;color:#f1f5f9;font-weight:600}
      tr:nth-child(even){background:#0f172a}
      tr:hover{background:#1e293b}
      .summary-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
      .stat-item{background:#1e293b;padding:12px;border-radius:8px;text-align:center}
      .stat-value{font-size:1.5rem;font-weight:700;color:#f1f5f9}
      .stat-label{font-size:0.875rem;color:#94a3b8;margin-top:4px}
      .findings-section{margin:20px 0}
      .finding-item{background:#1e293b;border:1px solid #475569;border-radius:8px;padding:16px;margin-bottom:12px}
      .finding-item.critical{border-color:#ef4444;background:#1f2937}
      .finding-item.warning{border-color:#f59e0b;background:#1f2937}
      .finding-item.info{border-color:#3b82f6;background:#1f2937}
      .finding-header{display:flex;justify-content:between;align-items:center;margin-bottom:8px}
      .finding-title{font-weight:600;color:#f1f5f9}
      .finding-count{background:#475569;color:#e2e8f0;padding:2px 8px;border-radius:12px;font-size:0.75rem}
      .footer{text-align:center;margin-top:40px;padding:20px;border-top:1px solid #334155;color:#94a3b8}
      .timestamp{color:#64748b;font-size:0.875rem}
    </style></head><body>
    <div class="header">
      <h1>🛡️ Malware & Defacement Report</h1>
      <div class="subtitle">Comprehensive Security Analysis</div>
    </div>
    
    <div class="card">
      <h2>📋 Executive Summary</h2>
      <div class="summary-stats">
        <div class="stat-item">
          <div class="stat-value">${report.crawl.crawledPages.length}</div>
          <div class="stat-label">Pages Scanned</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${riskScore}/100</div>
          <div class="stat-label">Risk Score</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${typeof visualDiffPercent === 'number' ? visualDiffPercent + '%' : 'N/A'}</div>
          <div class="stat-label">Visual Diff</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${report.findings.yaraMatches.length + report.findings.clamInfectedFiles.length}</div>
          <div class="stat-label">Threats Found</div>
        </div>
      </div>
      <div><strong>Target:</strong> <code>${report.target}</code></div>
      <div><strong>Generated:</strong> <span class="timestamp">${new Date(report.createdAt).toLocaleString()}</span></div>
    </div>
    
    <div class="card">
      <h2>🚨 Security Status</h2>
      <div class="status-grid">
        <div class="status-item">
          <div class="icon">${malwareStatus === 'clean' ? '✅' : '❌'}</div>
          <div class="label">Malware Status</div>
          <div class="value ${malwareStatus === 'clean' ? 'ok' : 'critical'}">${malwareStatus.toUpperCase()}</div>
        </div>
        <div class="status-item">
          <div class="icon">${defacementStatus === 'normal' ? '✅' : '⚠️'}</div>
          <div class="label">Defacement Status</div>
          <div class="value ${defacementStatus === 'normal' ? 'ok' : 'warn'}">${defacementStatus.toUpperCase()}</div>
        </div>
        <div class="status-item">
          <div class="icon">📊</div>
          <div class="label">Overall Severity</div>
          <div class="value info">${report.summary.severity || 'UNKNOWN'}</div>
        </div>
        <div class="status-item">
          <div class="icon">🎯</div>
          <div class="label">Risk Level</div>
          <div class="value ${riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'warn' : 'ok'}">${riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW'}</div>
        </div>
      </div>
    </div>
    
    ${report.comparison.diffDesktopFileUrl ? `<div class="card"><h2>🖼️ Visual Difference Analysis</h2><img src="${report.comparison.diffDesktopFileUrl}" alt="Visual difference comparison"/></div>` : ''}
    
    <div class="card">
      <h2>🔍 Content Integrity Analysis</h2>
      <div><strong>Baseline Available:</strong> ${report.comparison.hasBaseline ? 'Yes' : 'No'}</div>
      <div><strong>Changes Detected:</strong> ${Array.isArray(report.comparison.changes) ? report.comparison.changes.length : 0}</div>
      ${Array.isArray(report.comparison.changes) && report.comparison.changes.length ? `
        <table>
          <thead><tr><th>URL</th><th>Change Type</th><th>Timestamp</th></tr></thead>
          <tbody>${report.comparison.changes.map(c=>`<tr><td><code>${c.url}</code></td><td><span class="badge warn">${c.type}</span></td><td>${new Date().toLocaleString()}</td></tr>`).join('')}</tbody>
        </table>
      ` : '<div class="ok badge">✅ No unauthorized changes detected</div>'}
    </div>
    
    <div class="findings-section">
      <div class="card">
        <h2>🔍 YARA Rule Matches</h2>
        ${report.findings && report.findings.yaraMatches && report.findings.yaraMatches.length ? `
          <table>
            <thead><tr><th>Rule Name</th><th>File Path</th><th>Severity</th></tr></thead>
            <tbody>${report.findings.yaraMatches.map(y=>`<tr><td><code>${y.rule}</code></td><td><code>${y.file}</code></td><td><span class="badge critical">HIGH</span></td></tr>`).join('')}</tbody>
          </table>
        ` : '<div class="ok badge">✅ No YARA rule matches found</div>'}
      </div>
      
      <div class="card">
        <h2>🦠 ClamAV Antivirus Results</h2>
        ${report.findings && report.findings.clamInfectedFiles && report.findings.clamInfectedFiles.length ? `
          <table>
            <thead><tr><th>Infected File</th><th>Virus Signature</th><th>Action Required</th></tr></thead>
            <tbody>${report.findings.clamInfectedFiles.map(c=>`<tr><td><code>${c.file}</code></td><td><span class="badge critical">${c.signature}</span></td><td><span class="badge critical">IMMEDIATE</span></td></tr>`).join('')}</tbody>
          </table>
        ` : '<div class="ok badge">✅ No infected files detected</div>'}
      </div>
      
      <div class="card">
        <h2>⚠️ Suspicious Content Patterns</h2>
        ${report.findings && report.findings.suspiciousContent && report.findings.suspiciousContent.some(p=>p.hits && p.hits.length) ? `
          ${report.findings.suspiciousContent.filter(p=>p.hits && p.hits.length).map(p=>`
            <div class="finding-item warning">
              <div class="finding-header">
                <div class="finding-title">${p.url}</div>
                <div class="finding-count">${p.hits.reduce((a,h)=>a+h.count,0)} patterns</div>
              </div>
              <ul>${p.hits.map(h=>`<li><strong>${h.label}:</strong> ${h.count} occurrences</li>`).join('')}</ul>
            </div>
          `).join('')}
        ` : '<div class="ok badge">✅ No suspicious patterns detected</div>'}
      </div>
    </div>
    
    <div class="card">
      <h2>📊 Technical Details</h2>
      <h3>Content Hashes (First Page)</h3>
      ${(() => { 
        try { 
          const p = report.crawl.crawledPages[0] || {}; 
          return `
            <div><strong>HTML Hash:</strong> <code>${p.htmlHash||'n/a'}</code></div>
            <div><strong>Desktop Screenshot Hash:</strong> <code>${p.desktopHash||'n/a'}</code></div>
            <div><strong>Mobile Screenshot Hash:</strong> <code>${p.mobileHash||'n/a'}</code></div>
          ` 
        } catch { return '<div>No hash data available</div>' } 
      })()}
      
      <h3>Network Activity</h3>
      <div><strong>Total Requests:</strong> ${report.crawl.networkLogs ? report.crawl.networkLogs.filter(l => l.type === 'request').length : 0}</div>
      <div><strong>Total Responses:</strong> ${report.crawl.networkLogs ? report.crawl.networkLogs.filter(l => l.type === 'response').length : 0}</div>
    </div>
    
    ${options.readableText ? `
    <div class="card">
      <h2>📄 Readable Report</h2>
      <div style="background:#1e293b;padding:16px;border-radius:8px;white-space:pre-wrap;font-family:monospace;font-size:0.875rem;line-height:1.6;max-height:600px;overflow:auto">
        ${options.readableText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
      </div>
    </div>
    ` : ''}
    
    <div class="footer">
      <div>Report generated by Synergy Cyberix Malware & Defacement Monitor</div>
      <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
      <div class="timestamp">Scan ID: ${ts}</div>
    </div>
    </body></html>`
    const htmlPath = path.join(outDir, 'maldef-report.html')
    await fs.promises.writeFile(htmlPath, html)
    report.reportHtmlPath = htmlPath
    // Try to generate PDF via puppeteer if available
    try {
      const puppeteer = require('puppeteer')
      const browser = await puppeteer.launch({ headless: 'new' })
      const page = await browser.newPage()
      await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' })
      const pdfPath = path.join(outDir, 'maldef-report.pdf')
      await page.pdf({ path: pdfPath, printBackground: true, format: 'A4' })
      await browser.close()
      report.reportPdfPath = pdfPath
    } catch (e) {
      onProgress({ stage: 'report', message: `PDF generation skipped: ${e.message}` })
    }
  } catch (e) {
    onProgress({ stage: 'report', message: `HTML report skipped: ${e.message}` })
  }

  onProgress({ stage: 'done', message: 'Malware & defacement scan complete', percentage: 100 })
  return report
}

module.exports = { runMaldefScan }


>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
