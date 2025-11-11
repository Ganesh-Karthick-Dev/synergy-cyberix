// Minimal Puppeteer-based crawler/scanner for malware & defacement monitoring
// Capabilities (prototype):
// - Crawl a target URL up to a configurable depth (default 1)
// - Respect robots.txt (best-effort)
// - Capture rendered HTML, network logs, screenshots (desktop + mobile)
// - Compute SHA256 of resources and save simple baseline
// - Emit a concise JSON report

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function sha256OfBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function sha256OfString(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

async function saveFile(filePath, data) {
  await ensureDir(path.dirname(filePath))
  await fs.promises.writeFile(filePath, data)
}

async function fetchRobotsWithPuppeteer(browser, url) {
  try {
    const u = new URL(url)
    const robotsUrl = `${u.origin}/robots.txt`
    const p = await browser.newPage()
    try {
      await p.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      // Read robots as plain text
      const text = await p.evaluate(() => document.body ? document.body.innerText : '')
      await p.close()
      return text || null
    } catch (e) {
      try { await p.close() } catch {}
      return null
    }
  } catch {
    return null
  }
}

function isAllowedByRobots(robotsText, urlPath) {
  if (!robotsText) return true
  // Very basic Disallow parser for User-agent: *
  const lines = robotsText.split(/\r?\n/)
  let applies = false
  const disallow = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/^user-agent:\s*\*/i.test(trimmed)) {
      applies = true
      continue
    }
    if (/^user-agent:/i.test(trimmed)) {
      applies = false
      continue
    }
    if (applies) {
      const m = trimmed.match(/^disallow:\s*(.*)$/i)
      if (m) disallow.push(m[1].trim())
    }
  }
  for (const rule of disallow) {
    if (!rule) continue
    if (urlPath.startsWith(rule)) return false
  }
  return true
}

async function crawlWithPuppeteer(targetUrl, opts = {}) {
  const {
    outDir,
    maxDepth = 1,
    headless = 'new',
    puppeteerModule = 'puppeteer',
    onProgress = () => {},
  } = opts

  const puppeteer = require(puppeteerModule)
  await ensureDir(outDir)

  onProgress({ stage: 'browser', message: 'Launching browser', percentage: 5 })
  const browser = await puppeteer.launch({ headless })
  onProgress({ stage: 'robots', message: 'Checking robots.txt', percentage: 10 })
  const robotsText = await fetchRobotsWithPuppeteer(browser, targetUrl)
  const workPage = await browser.newPage()

  const visited = new Set()
  const queue = [{ url: targetUrl, depth: 0 }]
  const networkLogs = []
  const results = []
  let totalPages = 0

  workPage.on('request', (req) => {
    networkLogs.push({ type: 'request', url: req.url(), method: req.method(), ts: Date.now() })
  })
  workPage.on('response', async (res) => {
    try {
      networkLogs.push({ type: 'response', url: res.url(), status: res.status(), ts: Date.now() })
    } catch {}
  })

  while (queue.length) {
    const { url, depth } = queue.shift()
    if (visited.has(url)) continue
    visited.add(url)
    totalPages++

    const u = new URL(url)
    if (!isAllowedByRobots(robotsText, u.pathname)) {
      results.push({ url, depth, skippedByRobots: true })
      continue
    }

    onProgress({ 
      stage: 'crawl', 
      message: `Crawling page ${totalPages}: ${url}`,
      percentage: 15 + (totalPages / Math.max(1, queue.length + totalPages)) * 70,
      pageUrl: url
    })

    await workPage.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari')
    await workPage.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 })

    // Robust navigation with small retry
    let navigated = false
    let navError = null
    for (let attempt = 0; attempt < 2 && !navigated; attempt++) {
      try {
        await workPage.goto(url, { waitUntil: 'networkidle2', timeout: 45000 })
        await workPage.waitForSelector('body', { timeout: 15000 }).catch(() => {})
        navigated = true
      } catch (e) {
        navError = e
        // If execution context destroyed, try once more
        if (attempt === 0) {
          await workPage.waitForTimeout(500)
        }
      }
    }
    if (!navigated) {
      results.push({ url, depth, error: navError ? navError.message : 'navigation failed' })
      continue
    }

    let html = ''
    try {
      html = await workPage.content()
    } catch (e) {
      // Fall back to page.evaluate if needed
      try { html = await workPage.evaluate(() => document.documentElement.outerHTML) } catch {}
    }
    const htmlHash = sha256OfString(html)
    const pageDir = path.join(outDir, u.hostname, encodeURIComponent(u.pathname || '/'))
    await saveFile(path.join(pageDir, 'rendered.html'), html)
    await saveFile(path.join(pageDir, 'rendered.sha256'), htmlHash)

    // Desktop screenshot
    onProgress({ 
      stage: 'screenshot', 
      message: `Capturing desktop screenshot for ${url}`,
      pageUrl: url
    })
    const desktopPng = await workPage.screenshot({ fullPage: true })
    const desktopHash = sha256OfBuffer(desktopPng)
    await saveFile(path.join(pageDir, 'desktop.png'), desktopPng)
    await saveFile(path.join(pageDir, 'desktop.sha256'), desktopHash)

    // Send screenshot preview to UI
    const desktopBase64 = `data:image/png;base64,${desktopPng.toString('base64')}`
    onProgress({ 
      stage: 'preview', 
      message: `Desktop screenshot captured`,
      image: desktopBase64,
      pageUrl: url,
      timestamp: Date.now()
    })

    // Mobile emulation screenshot
    await workPage.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 })
    const mobilePng = await workPage.screenshot({ fullPage: true })
    const mobileHash = sha256OfBuffer(mobilePng)
    await saveFile(path.join(pageDir, 'mobile.png'), mobilePng)
    await saveFile(path.join(pageDir, 'mobile.sha256'), mobileHash)

    // Extract links for shallow crawl
    if (depth < maxDepth) {
      let links = []
      try {
        links = await workPage.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href')))
      } catch {
        links = []
      }
      for (const link of links) {
        try {
          const nu = new URL(link, url)
          if (nu.origin === new URL(targetUrl).origin) {
            queue.push({ url: nu.toString(), depth: depth + 1 })
          }
        } catch {}
      }
    }

    results.push({ url, depth, htmlHash, desktopHash, mobileHash })
  }

  onProgress({ stage: 'complete', message: `Crawling completed. Processed ${totalPages} pages.`, percentage: 100 })
  await browser.close()

  const report = {
    target: targetUrl,
    crawledPages: results,
    networkLogs,
    createdAt: new Date().toISOString()
  }
  await saveFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  return report
}

module.exports = { crawlWithPuppeteer }


