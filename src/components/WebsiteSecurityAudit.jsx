import { useEffect, useState } from 'react'

function WebsiteSecurityAudit() {
  const [url, setUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [progress, setProgress] = useState([])
  const [result, setResult] = useState(null)
  const [creds, setCreds] = useState({ username: '', password: '' })
  const [useCreds, setUseCreds] = useState(false)
  const [showHelpDialog, setShowHelpDialog] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.cyberGuard) return
    const onP = (u) => setProgress(prev => [...prev, u])
    const onD = (r) => {
      setResult(r?.result || r)
      
      // Send notification when scan completes
      if (window.cyberGuard?.showNotification) {
        try {
          window.cyberGuard.showNotification({
            title: 'Website Security Audit Completed',
            body: `Website security audit for ${url.trim() || 'target'} has been completed successfully.`,
            viewId: 'website-audit'
          }).catch(err => {
            console.log('Notification not available:', err?.message || 'Unknown error')
          })
        } catch (err) {
          console.log('Notification not available:', err?.message || 'Unknown error')
        }
      }
    }
    window.cyberGuard.onWebsiteAuditProgress?.(onP)
    window.cyberGuard.onWebsiteAuditDone?.(onD)
    return () => {}
  }, [url])

  const start = async () => {
    if (!authorized) { alert('Please confirm you have written authorization.'); return }
    if (!url.trim()) { alert('Enter a valid website URL'); return }
    setProgress([]); setResult(null)
    // Proactively open the site; also backend will attempt to open
    try { await window.cyberGuard.openExternal(url.trim()) } catch {}
    await window.cyberGuard.startWebsiteAudit({ url: url.trim(), credentials: useCreds ? creds : null })
  }

  const helpContent = (
    <>
      {/* What is Website Security Audit */}
      <div className="space-y-4">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          What is Website Security Audit?
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
          Website Security Audit is a comprehensive, authorized, read-only security assessment that evaluates your website's security posture across multiple dimensions. It performs passive, non-intrusive checks to identify vulnerabilities, misconfigurations, and security weaknesses without exploiting or damaging your systems.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The audit generates detailed HTML and PDF reports that provide actionable insights into your website's security status, helping you prioritize fixes and improve your overall security posture.
        </p>
      </div>

      {/* What we check */}
      <div className="space-y-4 mt-8">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          What we check
        </h4>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg">
          Our comprehensive audit examines multiple security aspects of your website:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Security Headers
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Evaluates HTTP security headers (CSP, HSTS, X-Frame-Options, etc.) to ensure proper protection against common web vulnerabilities.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              SSL/TLS Configuration
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Analyzes SSL/TLS certificate validity, protocol versions, cipher suites, and encryption strength to ensure secure data transmission.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Dependency Vulnerabilities
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Identifies outdated or vulnerable JavaScript libraries, frameworks, and dependencies that may expose your site to known security issues.
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-5 border border-red-200 dark:border-red-800">
            <h5 className="font-semibold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Performance & Accessibility
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Assesses website performance metrics, accessibility compliance, best practices, and SEO factors that impact user experience and security.
            </p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-5 border border-yellow-200 dark:border-yellow-800">
            <h5 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Authentication & Authorization
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Verifies login mechanisms, session management, and access controls (optional credential verification for read-only testing).
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Content Security
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Checks for exposed sensitive information, misconfigured permissions, and content security policy implementation.
            </p>
          </div>
        </div>
      </div>

      {/* How the audit works */}
      <div className="space-y-4 mt-8">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          How the audit works
        </h4>
        <div className="space-y-3">
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              1
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Authorization & Setup</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">You provide written authorization and the target website URL. Optional credentials can be provided for read-only login verification.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              2
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Passive Scanning</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">The audit performs read-only checks: analyzing HTTP headers, SSL/TLS configuration, page content, and dependencies without any exploit activity.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              3
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Analysis & Categorization</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Findings are analyzed and categorized by severity (Info, Low, Medium, High) with detailed explanations and recommendations.</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="flex-shrink-0 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold">
              4
            </div>
            <div className="flex-1">
              <h5 className="font-semibold text-gray-900 dark:text-white mb-1">Report Generation</h5>
              <p className="text-sm text-gray-700 dark:text-gray-300">Comprehensive HTML and PDF reports are generated with all findings, severity levels, and actionable remediation steps.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Why you need Website Security Audit */}
      <div className="space-y-4 mt-8">
        <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
          <div className="w-1 h-8 bg-orange-500 rounded"></div>
          Why you need Website Security Audit
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Proactive Risk Management
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Identify and fix security issues before attackers can exploit them, reducing the risk of data breaches and security incidents.
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Compliance & Auditing
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Meet regulatory requirements and demonstrate due diligence with documented security assessments and remediation evidence.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Prioritized Remediation
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Focus your security resources on the highest-risk issues first, with clear severity classifications and actionable recommendations.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Customer Trust & Reputation
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Protect your brand reputation and customer trust by maintaining a secure website that safeguards user data and privacy.
            </p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="mb-10">
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-8 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl relative overflow-hidden w-full max-w-full box-border">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        <div className="relative z-10 space-y-6">
          {/* Header with Help Icon */}
          <div className="relative">
            <button
              onClick={() => setShowHelpDialog(true)}
              className="absolute top-0 right-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200 z-20"
              title="View detailed audit information"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
            <div className="flex items-center space-x-3 mb-6 pr-12">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Website Security Audit</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Authorized, read‑only assessment. Generates identical HTML/PDF reports.</p>
              </div>
            </div>
          </div>
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
      </div>
    </div>
  )
}

export default WebsiteSecurityAudit


