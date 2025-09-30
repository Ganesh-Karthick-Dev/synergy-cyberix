import { createContext, useContext, useState, useEffect } from 'react'
import { useToast } from './ToastContext'

const ScanningContext = createContext()

export const useScanning = () => {
  const context = useContext(ScanningContext)
  if (!context) {
    throw new Error('useScanning must be used within a ScanningProvider')
  }
  return context
}

export const ScanningProvider = ({ children }) => {
  const { showSuccess } = useToast()
  const [scanStatus, setScanStatus] = useState({
    isScanning: false,
    scanType: '',
    target: '',
    progress: 0,
    message: '',
    startTime: null
  })

  const [scanProgress, setScanProgress] = useState([])

  useEffect(() => {
    if (window.cyberGuard) {
      // Network scan listeners
      window.cyberGuard.onNetworkScanProgress((update) => {
        setScanStatus(prev => ({
          isScanning: true,
          scanType: 'Network Scan',
          target: update.target || prev.target,
          progress: update.progress || prev.progress,
          message: update.message || 'Scanning in progress...',
          startTime: prev.startTime || new Date()
        }))
        setScanProgress(prev => [...prev, update])
      })
      
      window.cyberGuard.onNetworkScanDone((result) => {
        try {
          // Show completion toast
          showSuccess('✅ Network scan completed successfully!', { duration: 3000 })
          
          setScanStatus({
            isScanning: false,
            scanType: '',
            target: '',
            progress: 0,
            message: '',
            startTime: null
          })
          setScanProgress([])
        } catch (error) {
          console.error('Error in network scan done handler:', error)
        }
      })

      // Port scan listeners
      window.cyberGuard.onPortScanProgress((update) => {
        setScanStatus(prev => ({
          isScanning: true,
          scanType: 'Port Scan',
          target: update.target || prev.target,
          progress: update.progress || prev.progress,
          message: update.message || 'Scanning in progress...',
          startTime: prev.startTime || new Date()
        }))
        setScanProgress(prev => [...prev, update])
      })

      window.cyberGuard.onPortScanDone((result) => {
        try {
          // Show completion toast
          showSuccess('✅ Port scan completed successfully!', { duration: 3000 })
          
          setScanStatus({
            isScanning: false,
            scanType: '',
            target: '',
            progress: 0,
            message: '',
            startTime: null
          })
          setScanProgress([])
        } catch (error) {
          console.error('Error in port scan done handler:', error)
        }
      })
    }
  }, [])

  const startNetworkScan = async (target) => {
    try {
      if (window.cyberGuard) {
        // Show brief scan start toast
        showSuccess('🔍 Network scan started!', { duration: 2000 })
        
        setScanStatus({
          isScanning: true,
          scanType: 'Network Scan',
          target: target,
          progress: 0,
          message: 'Initializing network scan...',
          startTime: new Date()
        })
        setScanProgress([])
        await window.cyberGuard.startNetworkScan(target)
      }
    } catch (error) {
      console.error('Error starting network scan:', error)
      setScanStatus({
        isScanning: false,
        scanType: '',
        target: '',
        progress: 0,
        message: '',
        startTime: null
      })
    }
  }

  const startPortScan = async (target) => {
    try {
      if (window.cyberGuard) {
        // Show brief scan start toast
        showSuccess('🔍 Port scan started!', { duration: 2000 })
        
        setScanStatus({
          isScanning: true,
          scanType: 'Port Scan',
          target: target,
          progress: 0,
          message: 'Initializing port scan...',
          startTime: new Date()
        })
        setScanProgress([])
        await window.cyberGuard.startPortScan(target)
      }
    } catch (error) {
      console.error('Error starting port scan:', error)
      setScanStatus({
        isScanning: false,
        scanType: '',
        target: '',
        progress: 0,
        message: '',
        startTime: null
      })
    }
  }

  const abortScan = async () => {
    try {
      if (window.cyberGuard) {
        if (scanStatus.scanType === 'Network Scan') {
          await window.cyberGuard.abortNetworkScan()
        }
        // Add port scan abort if available
        setScanStatus({
          isScanning: false,
          scanType: '',
          target: '',
          progress: 0,
          message: '',
          startTime: null
        })
        setScanProgress([])
      }
    } catch (error) {
      console.error('Error aborting scan:', error)
    }
  }

  const value = {
    scanStatus,
    scanProgress,
    startNetworkScan,
    startPortScan,
    abortScan
  }

  return (
    <ScanningContext.Provider value={value}>
      {children}
    </ScanningContext.Provider>
  )
}
