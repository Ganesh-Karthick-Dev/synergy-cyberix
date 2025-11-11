import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'

const NetworkStatus = ({ children }) => {
  const { showError, showSuccess } = useToast()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isChecking, setIsChecking] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      setRetryCount(0)
      showSuccess('🌐 Internet connection restored!')
    }

    const handleOffline = () => {
      setIsOnline(false)
      showError('📡 No internet connection detected')
    }

    // Listen for online/offline events
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Also check network status periodically
    const checkNetworkStatus = async () => {
      try {
        // Try to fetch a small resource to test connectivity
        const response = await fetch('https://www.google.com/favicon.ico', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache'
        })
        setIsOnline(true)
      } catch (error) {
        setIsOnline(false)
      }
    }

    // Check network status every 30 seconds
    const interval = setInterval(checkNetworkStatus, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [showError, showSuccess])

  const handleRefresh = async () => {
    setIsChecking(true)
    setRetryCount(prev => prev + 1)

    try {
      // Test connectivity with multiple endpoints
      const endpoints = [
        'https://www.google.com/favicon.ico',
        'https://www.cloudflare.com/favicon.ico',
        'https://httpbin.org/status/200'
      ]

      let connected = false
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-cache',
            timeout: 5000
          })
          connected = true
          break
        } catch (error) {
          continue
        }
      }

      if (connected) {
        setIsOnline(true)
        setRetryCount(0)
        showSuccess('🌐 Internet connection restored!')
      } else {
        setIsOnline(false)
        showError(`📡 Still no internet connection (Attempt ${retryCount})`)
      }
    } catch (error) {
      setIsOnline(false)
      showError(`📡 Network check failed (Attempt ${retryCount})`)
    } finally {
      setIsChecking(false)
    }
  }

  const handleRetry = () => {
    handleRefresh()
  }

  // Show offline screen if no internet
  if (!isOnline) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 2.25a9.75 9.75 0 100 19.5 9.75 9.75 0 000-19.5z" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              No Internet Connection
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Please check your internet connection and try again
            </p>
          </div>

          {/* Error Details */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-6">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="font-medium">Network Error</span>
              </div>
              
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                <p>• Check your internet connection</p>
                <p>• Verify your network settings</p>
                <p>• Try refreshing the connection</p>
                {retryCount > 0 && (
                  <p className="text-orange-600 dark:text-orange-400">
                    • Retry attempts: {retryCount}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-4">
                <button
                  onClick={handleRetry}
                  disabled={isChecking}
                  className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isChecking ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Checking Connection...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Refresh Connection
                    </>
                  )}
                </button>

                <button
                  onClick={() => window.location.reload()}
                  className="w-full flex justify-center items-center py-2 px-4 border border-gray-300 dark:border-slate-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reload Application
                </button>
              </div>
            </div>
          </div>

          {/* Network Status Indicator */}
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 rounded-lg text-sm">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <span>Offline</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Cyberix Security Analyzer - Network Status
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show children (main app) if online
  return children
}

export default NetworkStatus
