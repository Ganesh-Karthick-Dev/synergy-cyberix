const fs = require('fs')
const path = require('path')

const BASELINE_DIR = path.join(process.cwd(), 'maldef-baselines')

async function ensureDir(dir) { await fs.promises.mkdir(dir, { recursive: true }) }

async function baselinePath(key) {
  await ensureDir(BASELINE_DIR)
  return path.join(BASELINE_DIR, `${key}.json`)
}

async function loadBaseline(key) {
  try {
    const p = await baselinePath(key)
    const data = await fs.promises.readFile(p, 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function saveBaseline(key, crawlReport) {
  const p = await baselinePath(key)
  const minimal = {
    target: crawlReport.target,
    capturedAt: crawlReport.createdAt,
    pages: crawlReport.crawledPages.map(p => ({ url: p.url, htmlHash: p.htmlHash, desktopHash: p.desktopHash, mobileHash: p.mobileHash }))
  }
  await fs.promises.writeFile(p, JSON.stringify(minimal, null, 2))

  // Best-effort: persist primary page assets for visual comparison
  try {
    const primary = crawlReport.crawledPages.find(pg => pg.url && new URL(pg.url).origin === new URL(crawlReport.target).origin)
    if (primary) {
      const u = new URL(primary.url)
      const currentAssetDir = path.join(
        path.dirname(path.join(process.cwd(), 'temp-scans')),
        'temp-scans' // ensure relative consistency if CWD changes
      ) // no-op placeholder to keep structure consistent
      // Resolve current scan asset folder from outDir on report
      const scanHostDir = path.join(crawlReport.outDir || '', u.hostname, encodeURIComponent(u.pathname || '/'))
      const baseDir = path.join(BASELINE_DIR, key)
      await fs.promises.mkdir(baseDir, { recursive: true })
      const files = ['desktop.png', 'mobile.png', 'rendered.html']
      for (const f of files) {
        const src = path.join(scanHostDir, f)
        const dst = path.join(baseDir, f)
        try {
          await fs.promises.copyFile(src, dst)
        } catch {}
      }
    }
  } catch {}
}

function compareAgainstBaseline(baseline, crawlReport) {
  if (!baseline) return { hasBaseline: false, changes: [] }
  const oldByUrl = new Map(baseline.pages.map(p => [p.url, p]))
  const changes = []
  for (const page of crawlReport.crawledPages) {
    const prior = oldByUrl.get(page.url)
    if (!prior) {
      changes.push({ url: page.url, type: 'new-page' })
      continue
    }
    if (prior.htmlHash && page.htmlHash && prior.htmlHash !== page.htmlHash) {
      changes.push({ url: page.url, type: 'html-changed' })
    }
    if (prior.desktopHash && page.desktopHash && prior.desktopHash !== page.desktopHash) {
      changes.push({ url: page.url, type: 'screenshot-changed-desktop' })
    }
    if (prior.mobileHash && page.mobileHash && prior.mobileHash !== page.mobileHash) {
      changes.push({ url: page.url, type: 'screenshot-changed-mobile' })
    }
  }
  return { hasBaseline: true, changes }
}

module.exports = { loadBaseline, saveBaseline, compareAgainstBaseline }


