import { useMemo } from 'react'

function DiffViewer({ comparison }) {
  const items = useMemo(() => comparison?.changes || [], [comparison])
  if (!comparison) return (
    <div className="text-sm text-slate-500 dark:text-slate-400">No comparison data.</div>
  )
  const hasBaseline = Boolean(comparison.hasBaseline)
  return (
    <div className="space-y-3">
      {!hasBaseline && (
        <div className="text-sm text-slate-600 dark:text-slate-300">No baseline yet. A baseline has been created after this scan.</div>
      )}
      {typeof comparison.visualDiffPercent === 'number' && (
        <div className="text-sm">
          Visual change: <span className={comparison.visualDiffPercent > 1 ? 'text-red-500' : 'text-emerald-500'}>{comparison.visualDiffPercent}%</span>
        </div>
      )}
      {comparison.diffDesktopFileUrl && (
        <div>
          <img src={comparison.diffDesktopFileUrl} alt="Desktop visual diff" className="max-h-96 rounded-lg border border-slate-300 dark:border-slate-700" />
        </div>
      )}
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-green-600 dark:text-green-400">No defacement indicators detected vs baseline.</div>
        ) : items.map((c, i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{c.url}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{c.type}</div>
            </div>
            <div className="ml-3 text-xs text-slate-500 dark:text-slate-400">Changed</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default DiffViewer


