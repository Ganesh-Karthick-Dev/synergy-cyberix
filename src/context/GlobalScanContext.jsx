import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'

const GlobalScanContext = createContext()

// Export the context for direct use if needed
export { GlobalScanContext }

export const useGlobalScanState = () => {
  const context = useContext(GlobalScanContext)
  if (!context) {
    // Return default values instead of throwing error to prevent crashes
    console.warn('useGlobalScanState must be used within a GlobalScanProvider, returning default values')
    return {
      activeScans: [],
      completedScans: [],
      notificationCount: 0,
      registerScan: () => {},
      updateScan: () => {},
      completeScan: () => {},
      stopScan: () => {},
      clearNotifications: () => {},
      markNotificationRead: () => {},
      getScanIdForView: () => null,
      reconnectToScan: () => {}
    }
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
        
        // Send notification (skip for website-audit as it handles its own notifications)
        if (completedScan.viewId !== 'website-audit' && window.cyberGuard?.showNotification) {
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
          
          // Send notification (skip for website-audit as it handles its own notifications)
          if (networkScan.viewId !== 'website-audit' && window.cyberGuard?.showNotification) {
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

    // Server scan progress handler
    const serverProgressHandler = (update) => {
      // Find active server scan and update it
      setActiveScans(prev => 
        prev.map(scan => {
          if (scan.scanType === 'Server Scan' && scan.viewId === 'server-scan') {
            // Calculate progress from update.progress if provided, or from message like "[1/14]", "[2/14]", etc.
            let progress = update.progress;
            if (!progress && update.message) {
              // Extract progress from message like "[1/14]", "[2/14]", etc.
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

    // Server scan done handler
    const serverDoneHandler = (result) => {
      setActiveScans(prev => {
        const serverScan = prev.find(s => s.scanType === 'Server Scan' && s.viewId === 'server-scan')
        if (serverScan) {
          // Complete the scan
          setCompletedScans(prevCompleted => [...prevCompleted, {
            ...serverScan,
            completedAt: new Date().toISOString(),
            result
          }])
          
          // Increment notification count
          setNotificationCount(prev => prev + 1)
          
          // Send notification (skip for website-audit as it handles its own notifications)
          if (serverScan.viewId !== 'website-audit' && window.cyberGuard?.showNotification) {
            try {
              window.cyberGuard.showNotification({
                title: `${serverScan.scanType} Completed`,
                body: `Scan for ${serverScan.target || 'target'} has been completed successfully.`,
                scanId: serverScan.id,
                viewId: serverScan.viewId
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
          if (serverScan.viewId) {
            scanIdMapRef.current.delete(serverScan.viewId)
          }
          
          return prev.filter(s => s.id !== serverScan.id)
        }
        return prev
      })
    }

    // Register listeners
    window.cyberGuard.onNetworkScanProgress(networkProgressHandler)
    window.cyberGuard.onNetworkScanDone(networkDoneHandler)
    window.cyberGuard.onServerScanProgress(serverProgressHandler)
    window.cyberGuard.onServerScanDone(serverDoneHandler)

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

