import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const GlobalScanContext = createContext()

export const useGlobalScanState = () => {
  const context = useContext(GlobalScanContext)
  if (!context) {
    throw new Error('useGlobalScanState must be used within a GlobalScanProvider')
  }
  return context
}

export const GlobalScanProvider = ({ children }) => {
  const [activeScans, setActiveScans] = useState([])
  const [completedScans, setCompletedScans] = useState([])
  const [notificationCount, setNotificationCount] = useState(0)
  const scanIdMapRef = useRef(new Map()) // Map viewId -> scanId for reconnection

  // Register an active scan
  const registerScan = useCallback((scanData) => {
    const scanId = scanData.id || `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const newScan = {
      id: scanId,
      scanType: scanData.scanType || 'Unknown Scan',
      target: scanData.target || '',
      progress: scanData.progress || 0,
      message: scanData.message || 'Scanning in progress...',
      startTime: scanData.startTime || new Date().toISOString(),
      onStop: scanData.onStop,
      onView: scanData.onView,
      viewId: scanData.viewId // The view/tab ID to navigate to
    }

    setActiveScans(prev => {
      // Remove any existing scan with the same viewId (only one scan per view)
      const filtered = prev.filter(s => s.viewId !== scanData.viewId)
      return [...filtered, newScan]
    })

    // Store mapping for reconnection
    if (scanData.viewId) {
      scanIdMapRef.current.set(scanData.viewId, scanId)
    }

    return scanId
  }, [])

  // Get scan ID for a view (for reconnection)
  const getScanIdForView = useCallback((viewId) => {
    return scanIdMapRef.current.get(viewId)
  }, [])

  // Reconnect to an existing scan (when component remounts)
  const reconnectToScan = useCallback((viewId, scanData) => {
    const existingScanId = scanIdMapRef.current.get(viewId)
    if (existingScanId) {
      // Update existing scan with new handlers
      setActiveScans(prev => 
        prev.map(scan => 
          scan.id === existingScanId 
            ? { ...scan, ...scanData }
            : scan
        )
      )
      return existingScanId
    }
    return null
  }, [])

  // Update scan progress
  const updateScan = useCallback((scanId, updates) => {
    setActiveScans(prev => 
      prev.map(scan => 
        scan.id === scanId 
          ? { ...scan, ...updates }
          : scan
      )
    )
  }, [])

  // Complete a scan
  const completeScan = useCallback((scanId, result = null) => {
    setActiveScans(prev => {
      const completedScan = prev.find(s => s.id === scanId)
      if (completedScan) {
        setCompletedScans(prevCompleted => [...prevCompleted, {
          ...completedScan,
          completedAt: new Date().toISOString(),
          result
        }])
        
        // Increment notification count
        setNotificationCount(prev => prev + 1)
        
        // Send notification (notification count is handled in main.js)
        if (window.cyberGuard?.showNotification) {
          try {
            window.cyberGuard.showNotification({
              title: `${completedScan.scanType} Completed`,
              body: `Scan for ${completedScan.target || 'target'} has been completed successfully.`,
              scanId,
              viewId: completedScan.viewId
            }).catch(err => {
              // Silently handle notification errors - it's not critical
              console.log('Notification not available:', err?.message || 'Unknown error')
            })
          } catch (err) {
            // Silently handle notification errors - it's not critical
            console.log('Notification not available:', err?.message || 'Unknown error')
          }
        }
      }
      return prev.filter(s => s.id !== scanId)
    })
  }, [])

  // Stop a scan
  const stopScan = useCallback((scanId) => {
    setActiveScans(prev => {
      const scan = prev.find(s => s.id === scanId)
      if (scan && scan.viewId) {
        scanIdMapRef.current.delete(scan.viewId)
      }
      return prev.filter(s => s.id !== scanId)
    })
  }, [])

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotificationCount(0)
    setCompletedScans([])
  }, [])

  // Mark notification as read
  const markNotificationRead = useCallback(() => {
    setNotificationCount(0)
  }, [])

  // Set up global IPC listeners that persist across component mounts
  useEffect(() => {
    if (!window.cyberGuard) return

    // Network scan progress listener
    const networkProgressHandler = (update) => {
      // Find active network scan and update it
      setActiveScans(prev => 
        prev.map(scan => {
          if (scan.scanType === 'Network Scan' && scan.viewId === 'network-scan') {
            // Calculate progress from stage if not provided
            let progress = update.progress;
            if (!progress && update.message) {
              // Extract progress from message like "[1/7]", "[2/7]", etc.
              const stageMatch = update.message.match(/\[(\d+)\/(\d+)\]/);
              if (stageMatch) {
                const current = parseInt(stageMatch[1]);
                const total = parseInt(stageMatch[2]);
                progress = Math.round((current / total) * 100);
              }
            }
            
            return {
              ...scan,
              progress: progress !== undefined ? progress : scan.progress,
              message: update.message || update.consoleLog || scan.message
            }
          }
          return scan
        })
      )
    }

    // Network scan done listener
    const networkDoneHandler = (result) => {
      setActiveScans(prev => {
        const networkScan = prev.find(s => s.scanType === 'Network Scan' && s.viewId === 'network-scan')
        if (networkScan) {
          // Complete the scan
          setCompletedScans(prevCompleted => [...prevCompleted, {
            ...networkScan,
            completedAt: new Date().toISOString(),
            result
          }])
          
          // Increment notification count
          setNotificationCount(prev => prev + 1)
          
          // Send notification
          if (window.cyberGuard?.showNotification) {
            try {
              window.cyberGuard.showNotification({
                title: `${networkScan.scanType} Completed`,
                body: `Scan for ${networkScan.target || 'target'} has been completed successfully.`,
                scanId: networkScan.id,
                viewId: networkScan.viewId
              }).catch(err => {
                // Silently handle notification errors - it's not critical
                console.log('Notification not available:', err?.message || 'Unknown error')
              })
            } catch (err) {
              // Silently handle notification errors - it's not critical
              console.log('Notification not available:', err?.message || 'Unknown error')
            }
          }
          
          // Remove from map
          if (networkScan.viewId) {
            scanIdMapRef.current.delete(networkScan.viewId)
          }
          
          return prev.filter(s => s.id !== networkScan.id)
        }
        return prev
      })
    }

    // Register listeners
    window.cyberGuard.onNetworkScanProgress(networkProgressHandler)
    window.cyberGuard.onNetworkScanDone(networkDoneHandler)

    // Cleanup (but these should persist, so we don't remove them)
    return () => {
      // Note: We intentionally don't remove these listeners
      // so they persist across component mounts/unmounts
    }
  }, [])

  const value = {
    activeScans,
    completedScans,
    notificationCount,
    registerScan,
    updateScan,
    completeScan,
    stopScan,
    clearNotifications,
    markNotificationRead,
    getScanIdForView,
    reconnectToScan
  }

  return (
    <GlobalScanContext.Provider value={value}>
      {children}
    </GlobalScanContext.Provider>
  )
}

