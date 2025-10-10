import { useState, useEffect } from 'react'

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isChecking, setIsChecking] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check network status periodically
    const checkNetworkStatus = async () => {
      try {
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

    const interval = setInterval(checkNetworkStatus, 30000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  const checkConnection = async () => {
    setIsChecking(true)
    try {
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      })
      setIsOnline(true)
    } catch (error) {
      setIsOnline(false)
    } finally {
      setIsChecking(false)
    }
  }

  return {
    isOnline,
    isChecking,
    checkConnection
  }
}
