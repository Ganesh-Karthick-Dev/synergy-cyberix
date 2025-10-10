import { useEffect, useState } from 'react'

function WebsiteSecurityAudit() {
  const [url, setUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [progress, setProgress] = useState([])
  const [result, setResult] = useState(null)
  const [creds, setCreds] = useState({ username: '', password: '' })
  const [useCreds, setUseCreds] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.cyberGuard) return
    const onP = (u) => setProgress(prev => [...prev, u])
    const onD = (r) => setResult(r?.result || r)
    window.cyberGuard.onWebsiteAuditProgress?.(onP)
    window.cyberGuard.onWebsiteAuditDone?.(onD)
    return () => {}
  }, [])

  const start = async () => {
    if (!authorized) { alert('Please confirm you have written authorization.'); return }
    if (!url.trim()) { alert('Enter a valid website URL'); return }
    setProgress([]); setResult(null)
    // Proactively open the site; also backend will attempt to open
    try { await window.cyberGuard.openExternal(url.trim()) } catch {}
    await window.cyberGuard.startWebsiteAudit({ url: url.trim(), credentials: useCreds ? creds : null })
  }

  return (
    <div className="mb-10">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Website Security Audit</h2>
      <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">Authorized, read‑only assessment. Generates identical HTML/PDF reports.</p>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
        <input className="px-3 py-2 border rounded w-full" placeholder="https://example.com" value={url} onChange={(e)=>setUrl(e.target.value)} />
        <button onClick={start} className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">Start Audit</button>
      </div>
      <label className="inline-flex items-center gap-2 mt-3 text-sm">
        <input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)} />
        <span>I have written authorization to test this website.</span>
      </label>
      <div className="mt-3 p-3 border rounded">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useCreds} onChange={e=>setUseCreds(e.target.checked)} />
          <span>Use provided login credentials (optional, read‑only verification)</span>
        </label>
        {useCreds && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <input className="px-3 py-2 border rounded" placeholder="Username/email" value={creds.username} onChange={e=>setCreds(v=>({ ...v, username: e.target.value }))} />
            <input className="px-3 py-2 border rounded" placeholder="Password" type="password" value={creds.password} onChange={e=>setCreds(v=>({ ...v, password: e.target.value }))} />
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">Credentials are used only for passive, read‑only verification (e.g., HTTP 200 after login page POST) and are never stored or reused.</p>
      </div>
      {progress.length>0 && (
        <div className="mt-4 bg-gray-900 text-green-300 font-mono text-sm rounded p-3 max-h-40 overflow-auto">
          {progress.map((l,i)=>(<div key={i}>[{new Date().toLocaleTimeString()}] {l.message||l}</div>))}
        </div>
      )}
      {result && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">Target: <span className="font-mono text-gray-800 dark:text-gray-200">{result.reportData?.target || result.target}</span></div>
            <div className="flex gap-2">
              {result.htmlReport && (<button onClick={()=>window.cyberGuard.saveReportAs(result.htmlReport,'website-audit.html')} className="px-3 py-2 bg-green-600 text-white rounded">Download HTML</button>)}
              {result.pdfReport && (<button onClick={()=>window.cyberGuard.saveReportAs(result.pdfReport,'website-audit.pdf')} className="px-3 py-2 bg-red-600 text-white rounded">Download PDF</button>)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded"><div className="text-xs text-gray-500">Info</div><div className="text-xl font-semibold">{result.reportData?.summary?.severityCount?.info ?? 0}</div></div>
            <div className="p-3 bg-gray-50 rounded"><div className="text-xs text-gray-500">Low</div><div className="text-xl font-semibold">{result.reportData?.summary?.severityCount?.low ?? 0}</div></div>
            <div className="p-3 bg-gray-50 rounded"><div className="text-xs text-gray-500">Medium</div><div className="text-xl font-semibold">{result.reportData?.summary?.severityCount?.medium ?? 0}</div></div>
            <div className="p-3 bg-gray-50 rounded"><div className="text-xs text-gray-500">High</div><div className="text-xl font-semibold">{result.reportData?.summary?.severityCount?.high ?? 0}</div></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.reportData?.results?.headers && (
              <div className="border rounded p-4">
                <h4 className="font-medium mb-2">Security Headers</h4>
                <table className="w-full text-sm">
                  <thead><tr><th className="text-left py-1">Name</th><th className="text-left py-1">Status</th><th className="text-left py-1">Severity</th></tr></thead>
                  <tbody>
                    {result.reportData.results.headers.map((h,i)=>(
                      <tr key={i}><td className="py-1 pr-2">{h.name}</td><td className="py-1 pr-2">{h.status}</td><td className="py-1"><span className="px-2 py-0.5 text-xs rounded bg-gray-100">{h.severity}</span></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.reportData?.results?.tls && (
              <div className="border rounded p-4">
                <h4 className="font-medium mb-2">SSL/TLS</h4>
                <div className="text-sm text-gray-700">Issuer: {result.reportData.results.tls.issuer} • Protocols: {result.reportData.results.tls.protocols?.join(', ')}</div>
              </div>
            )}
            {result.reportData?.results?.dependencies && (
              <div className="border rounded p-4">
                <h4 className="font-medium mb-2">Dependency Issues</h4>
                <ul className="text-sm text-gray-700 list-disc ml-5">
                  {result.reportData.results.dependencies.map((d,i)=>(
                    <li key={i}>{d.library} {d.version} → {d.latest} • {d.severity} • {d.recommendation}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.reportData?.results?.quality && (
              <div className="border rounded p-4">
                <h4 className="font-medium mb-2">Accessibility & Performance</h4>
                <div className="text-sm text-gray-700">Perf {result.reportData.results.quality.performance} • A11y {result.reportData.results.quality.accessibility} • BP {result.reportData.results.quality.bestPractices} • SEO {result.reportData.results.quality.seo}</div>
              </div>
            )}
          </div>
          <div className="text-xs text-gray-500">Disclaimer: For authorized use only. Read‑only assessment; no exploit activity was performed.</div>
        </div>
      )}
    </div>
  )
}

export default WebsiteSecurityAudit


