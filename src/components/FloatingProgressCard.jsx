import { useState, useEffect } from 'react'
import { useGlobalScanState } from '../context/GlobalScanContext'

const FloatingProgressCard = () => {
  const { activeScans } = useGlobalScanState()
  const [isMinimized, setIsMinimized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

<<<<<<< HEAD
  // Get the most recent active scan, prioritizing Overview Scan
  const overviewScan = activeScans.find(s => s.scanType === 'Overview Scan' && s.viewId === 'overview')
  const activeScan = overviewScan || (activeScans.length > 0 ? activeScans[activeScans.length - 1] : null)
=======
  // Get the most recent active scan
  const activeScan = activeScans.length > 0 ? activeScans[activeScans.length - 1] : null
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9

  // Update elapsed time every second
  useEffect(() => {
    if (!activeScan || !activeScan.startTime) {
      setElapsedTime(0)
      return
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - new Date(activeScan.startTime).getTime()) / 1000)
      setElapsedTime(elapsed)
    }

    updateTimer() // Initial update
    const interval = setInterval(updateTimer, 1000) // Update every second

    return () => clearInterval(interval)
  }, [activeScan?.startTime])

  if (!activeScan) return null

  const formatElapsedTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`
    } else if (mins > 0) {
      return `${mins}m ${secs}s`
    }
    return `${secs}s`
  }

  const getScanIcon = (scanType) => {
    switch (scanType) {
      case 'Network Scan':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
          </svg>
        )
      case 'Port Scan':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )
      case 'Server Scan':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        )
      case 'WordPress Scan':
      case 'Shopify Scan':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        )
<<<<<<< HEAD
      case 'Overview Scan':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )
=======
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  return (
<<<<<<< HEAD
    <div className="fixed bottom-24 right-6 z-50 transition-all duration-300">
=======
    <div className="fixed bottom-6 right-6 z-50 transition-all duration-300">
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-2xl border-2 border-blue-500 dark:border-blue-600 overflow-hidden transition-all duration-300 ${
        isMinimized ? 'w-16 h-16' : 'w-80'
      }`}>
        {isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-colors"
            title="Expand scan progress"
          >
            <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </button>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="flex-shrink-0 text-white">
                  {getScanIcon(activeScan.scanType)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold text-sm truncate">{activeScan.scanType}</h3>
                  <p className="text-blue-100 text-xs truncate">{activeScan.target || 'Scanning...'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 text-white hover:bg-white/20 rounded transition-colors"
                  title="Minimize"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                {activeScan.onStop && (
                  <button
                    onClick={activeScan.onStop}
                    className="p-1 text-white hover:bg-red-500/50 rounded transition-colors"
                    title="Stop Scan"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Progress Content */}
            <div className="p-4 space-y-3">
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Progress</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{activeScan.progress || 0}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${activeScan.progress || 0}%` }}
                  ></div>
                </div>
              </div>

              {/* Status Message */}
              {activeScan.message && (
                <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                  {activeScan.message}
                </div>
              )}

              {/* Timing Info */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{formatElapsedTime(elapsedTime)}</span>
                </div>
                {activeScan.onView && (
                  <button
                    onClick={activeScan.onView}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold transition-colors"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default FloatingProgressCard

