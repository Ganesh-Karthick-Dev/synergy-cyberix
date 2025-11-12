import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const NotificationContext = createContext()

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Add a new notification
  const addNotification = useCallback((notification) => {
    const newNotification = {
      id: notification.id || `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: notification.title || 'Notification',
      message: notification.body || notification.message || '',
      time: notification.time || new Date().toLocaleTimeString(),
      timestamp: notification.timestamp || Date.now(),
      type: notification.type || 'success',
      scanId: notification.scanId || null,
      viewId: notification.viewId || null,
      read: false
    }

    setNotifications(prev => {
      const updated = [newNotification, ...prev]
      // Keep only the last 50 notifications
      const limited = updated.slice(0, 50)
      console.log('[NOTIFICATION-CONTEXT] Added notification:', newNotification.title, 'Total:', limited.length)
      return limited
    })
    setUnreadCount(prev => prev + 1)
  }, [])

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }, [])

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => 
      prev.map(notif => ({ ...notif, read: true }))
    )
    setUnreadCount(0)
  }, [])

  // Remove a notification
  const removeNotification = useCallback((notificationId) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === notificationId)
      if (notification && !notification.read) {
        setUnreadCount(count => Math.max(0, count - 1))
      }
      return prev.filter(n => n.id !== notificationId)
    })
  }, [])

  // Clear all notifications
  const clearAll = useCallback(() => {
    setNotifications([])
    setUnreadCount(0)
  }, [])

  // Listen for push notifications and add them to the in-app list via IPC
  useEffect(() => {
    let sentHandler = null
    let clickedHandler = null
    let retryTimeout = null

    // Wait for window.cyberGuard to be available
    const setupListener = () => {
      if (!window.cyberGuard) {
        // Retry after a short delay if not available
        retryTimeout = setTimeout(setupListener, 100)
        return
      }

      // Listen for notification:sent events from main process
      const handleNotificationSent = (data) => {
        console.log('[NOTIFICATION-CONTEXT] Received notification:sent event:', data)
        if (data && data.title) {
          addNotification({
            title: data.title,
            body: data.body,
            type: 'success',
            scanId: data.scanId,
            viewId: data.viewId,
            timestamp: data.timestamp || Date.now()
          })
        }
      }

      // Listen for IPC messages from main process
      if (window.cyberGuard.onNotificationSent) {
        sentHandler = window.cyberGuard.onNotificationSent(handleNotificationSent)
        console.log('[NOTIFICATION-CONTEXT] Registered notification:sent listener')
      } else {
        console.warn('[NOTIFICATION-CONTEXT] onNotificationSent not available, retrying...')
        retryTimeout = setTimeout(setupListener, 100)
        return
      }

      // Also listen for notification:clicked to mark notifications as read when clicked
      const handleNotificationClicked = (data) => {
        // Notification was clicked, mark it as read
        if (data && data.scanId) {
          setNotifications(prev =>
            prev.map(notif =>
              notif.scanId === data.scanId ? { ...notif, read: true } : notif
            )
          )
        }
      }

      if (window.cyberGuard.onNotificationClicked) {
        clickedHandler = window.cyberGuard.onNotificationClicked(handleNotificationClicked)
      }
    }

    // Start setup
    setupListener()
    
    return () => {
      // Clear retry timeout if still pending
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
      // Remove listeners
      if (sentHandler && window.cyberGuard?.removeNotificationSentListener) {
        window.cyberGuard.removeNotificationSentListener(sentHandler)
      }
      if (clickedHandler && window.cyberGuard?.removeNotificationClickedListener) {
        window.cyberGuard.removeNotificationClickedListener(clickedHandler)
      }
    }
  }, [addNotification])

  const value = {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

