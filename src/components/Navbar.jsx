import { useState, useEffect } from 'react'

function Navbar({ onLogout, currentView }) {
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [systemStatus, setSystemStatus] = useState({
    wsl: 'Checking...',
    kali: 'Checking...',
    platform: 'Unknown'
  })
  const [networkSignal, setNetworkSignal] = useState({
    strength: 0,
    status: 'Checking...',
    speed: '0 Mbps'
  })

  useEffect(() => {
    checkSystemStatus()
    checkNetworkSignal()
    
    // Update network signal every 5 seconds
    const interval = setInterval(checkNetworkSignal, 5000)
    return () => clearInterval(interval)
  }, [])

  const checkSystemStatus = async () => {
    try {
      if (window.cyberGuard) {
        const platform = await window.cyberGuard.getPlatform()
        const hasWsl = await window.cyberGuard.checkWsl()
        const hasKali = await window.cyberGuard.checkKali()
        
        setSystemStatus({
          platform,
          wsl: hasWsl ? 'WSL Ready' : 'WSL Missing',
          kali: hasKali ? 'Kali Ready' : 'Kali Missing'
        })
      } else {
        setSystemStatus({
          platform: 'Dev Mode',
          wsl: 'N/A',
          kali: 'N/A'
        })
      }
    } catch (error) {
      console.error('System status check error:', error)
    }
  }

  const checkNetworkSignal = async () => {
    try {
      // Simulate network signal check
      const startTime = performance.now()
      
      // Try to fetch a small resource to test connectivity
      const response = await fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-cache'
      })
      
      const endTime = performance.now()
      const latency = Math.round(endTime - startTime)
      
      // Calculate signal strength based on latency
      let strength = 0
      let status = 'Connected'
      
      if (latency < 100) {
        strength = 4
        status = 'Excellent'
      } else if (latency < 200) {
        strength = 3
        status = 'Good'
      } else if (latency < 500) {
        strength = 2
        status = 'Fair'
      } else if (latency < 1000) {
        strength = 1
        status = 'Poor'
      } else {
        strength = 0
        status = 'Disconnected'
      }
      
      // Simulate speed based on signal strength
      const speeds = ['0 Mbps', '25 Mbps', '50 Mbps', '100 Mbps', '200+ Mbps']
      const speed = speeds[strength]
      
      setNetworkSignal({
        strength,
        status,
        speed
      })
    } catch (error) {
      // Network is down
      setNetworkSignal({
        strength: 0,
        status: 'Disconnected',
        speed: '0 Mbps'
      })
    }
  }

  const notifications = [
    {
      id: 1,
      title: 'Security Alert',
      message: 'Suspicious login attempt detected',
      time: '2 min ago',
      type: 'warning'
    },
    {
      id: 2,
      title: 'System Update',
      message: 'Security patches available',
      time: '1 hour ago',
      type: 'info'
    },
    {
      id: 3,
      title: 'Threat Blocked',
      message: 'Malware attempt successfully blocked',
      time: '3 hours ago',
      type: 'success'
    }
  ]

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left Section - Network Signal Indicator */}
          <div className="flex items-center space-x-4">
            {/* Network Signal Indicator */}
            <div className="flex items-center space-x-3 px-4 py-2 bg-gray-50 rounded-lg border">
              {/* Signal Bars */}
              <div className="flex items-end space-x-1">
                {[1, 2, 3, 4].map((bar) => (
                  <div
                    key={bar}
                    className={`w-1 transition-all duration-300 ${
                      bar <= networkSignal.strength
                        ? networkSignal.strength === 4
                          ? 'bg-green-500'
                          : networkSignal.strength === 3
                          ? 'bg-blue-500'
                          : networkSignal.strength === 2
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                        : 'bg-gray-300'
                    }`}
                    style={{
                      height: `${bar * 4 + 4}px`
                    }}
                  />
                ))}
              </div>
              
              {/* Signal Info */}
              <div className="flex flex-col">
                <div className="flex items-center space-x-2">
                  <span className={`text-sm font-medium ${
                    networkSignal.strength === 4
                      ? 'text-green-600'
                      : networkSignal.strength === 3
                      ? 'text-blue-600'
                      : networkSignal.strength === 2
                      ? 'text-yellow-600'
                      : networkSignal.strength === 1
                      ? 'text-red-600'
                      : 'text-gray-500'
                  }`}>
                    {networkSignal.status}
                  </span>
                  {/* <span className="text-xs text-gray-500">{networkSignal.speed}</span> */}
                </div>
                <div className="text-xs text-gray-400">
                  Network Signal
                </div>
              </div>
            </div>

            {/* Date */}
            <div className="flex items-center text-sm text-gray-500">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</span>
            </div>
          </div>

          {/* Center Section - System Status */}
          <div className="flex items-center space-x-4">
            {/* Platform Status */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-lg">
              <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">{systemStatus.platform}</span>
            </div>

            {/* WSL Status */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
              systemStatus.wsl.includes('Ready') ? 'bg-green-100 text-green-700' :
              systemStatus.wsl.includes('Missing') ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">WSL</span>
            </div>

            {/* Kali Status */}
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg ${
              systemStatus.kali.includes('Ready') ? 'bg-green-100 text-green-700' :
              systemStatus.kali.includes('Missing') ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">Linux</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={checkSystemStatus}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Refresh System Status"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Right Section - Actions & User Menu */}
          <div className="flex items-center space-x-4">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-xs text-white font-medium">{notifications.length}</span>
                </div>
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.map((notification) => (
                      <div key={notification.id} className="p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start">
                          <div className={`p-1 rounded-full mr-3 mt-1 ${
                            notification.type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                            notification.type === 'info' ? 'bg-blue-100 text-blue-600' :
                            'bg-green-100 text-green-600'
                          }`}>
                            {notification.type === 'warning' ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            ) : notification.type === 'info' ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                            <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                            <p className="text-xs text-gray-400 mt-2">{notification.time}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="p-4 border-t border-gray-200">
                    <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                      View all notifications
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">A</span>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">Admin User</p>
                  <p className="text-xs text-gray-500">Administrator</p>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                  <div className="py-2">
                    <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Your Profile
                    </button>
                    <button className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors">
                      <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Settings
                    </button>
                    <div className="border-t border-gray-100 mt-2 pt-2">
                      <button 
                        onClick={onLogout}
                        className="flex items-center w-full px-4 py-2 text-sm text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar