import { useState, useEffect } from 'react'

function SystemStatus() {
  const [platform, setPlatform] = useState('Unknown')
  const [wslStatus, setWslStatus] = useState('Checking...')
  const [kaliStatus, setKaliStatus] = useState('Checking...')
  const [scanningCapabilities, setScanningCapabilities] = useState([])
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    checkSystemStatus()
  }, [])

  const checkSystemStatus = async () => {
    try {
      if (window.cyberGuard) {
        const detectedPlatform = await window.cyberGuard.getPlatform()
        setPlatform(detectedPlatform)
        
        const hasWsl = await window.cyberGuard.checkWsl()
        setWslStatus(hasWsl ? 'WSL is installed' : 'WSL is not installed')
        
        const hasKali = await window.cyberGuard.checkKali()
        setKaliStatus(hasKali ? 'Kali Linux is installed' : 'Kali Linux is not installed')
        
        const capabilities = []
        if (hasWsl) {
          capabilities.push('WSL-based scanning')
        }
        if (hasKali) {
          capabilities.push('Professional security tools (nmap, nikto, etc.)')
          capabilities.push('Advanced penetration testing')
        }
        if (detectedPlatform === 'windows') {
          capabilities.push('Windows-specific security analysis')
        }
        if (capabilities.length === 0) {
          capabilities.push('Basic network scanning (limited)')
        }
        setScanningCapabilities(capabilities)
      } else {
        setPlatform('Development Mode')
        setWslStatus('Not available in development')
        setKaliStatus('Not available in development')
        setScanningCapabilities(['Demo mode - limited functionality'])
      }
    } catch (error) {
      console.error('System status check error:', error)
      setWslStatus('Error checking WSL status')
      setKaliStatus('Error checking Kali status')
    }
  }

  const refreshStatus = async () => {
    setIsRefreshing(true)
    await checkSystemStatus()
    setIsRefreshing(false)
  }

  const installWsl = async () => {
    if (!window.cyberGuard) return
    
    try {
      setWslStatus('Installing WSL...')
      await window.cyberGuard.installWsl()
      setTimeout(checkSystemStatus, 2000)
    } catch (error) {
      setWslStatus('WSL installation failed')
    }
  }

  const installKali = async () => {
    if (!window.cyberGuard) return
    
    try {
      setKaliStatus('Installing Kali Linux...')
      await window.cyberGuard.installKali()
      setTimeout(checkSystemStatus, 2000)
    } catch (error) {
      setKaliStatus('Kali Linux installation failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl shadow-lg border border-gray-200 p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold">System Status</h2>
              <p className="text-purple-100">Comprehensive system health monitoring and diagnostics</p>
            </div>
          </div>
          <button
            onClick={refreshStatus}
            disabled={isRefreshing}
            className="px-4 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* System Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center space-x-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
          </svg>
          <span>System Overview</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <h4 className="font-medium text-blue-900">Platform</h4>
            </div>
            <p className="text-blue-800 font-medium">{platform}</p>
          </div>
          
          <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-medium text-green-900">WSL Status</h4>
              </div>
              {wslStatus.includes('not installed') && (
                <button
                  onClick={installWsl}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                >
                  Install
                </button>
              )}
            </div>
            <p className={`font-medium ${
              wslStatus.includes('installed') ? 'text-green-800' :
              wslStatus.includes('not installed') ? 'text-red-600' :
              'text-yellow-600'
            }`}>
              {wslStatus}
            </p>
          </div>
          
          <div className="p-6 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-medium text-purple-900">Kali Linux</h4>
              </div>
              {kaliStatus.includes('not installed') && (
                <button
                  onClick={installKali}
                  className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
                >
                  Install
                </button>
              )}
            </div>
            <p className={`font-medium ${
              kaliStatus.includes('installed') ? 'text-green-800' :
              kaliStatus.includes('not installed') ? 'text-red-600' :
              'text-yellow-600'
            }`}>
              {kaliStatus}
            </p>
          </div>
        </div>
      </div>

      {/* Scanning Capabilities */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Available Scanning Capabilities</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scanningCapabilities.map((capability, index) => (
            <div key={index} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-gray-700">{capability}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>Quick Actions</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={refreshStatus}
            disabled={isRefreshing}
            className="p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors text-left disabled:opacity-50"
          >
            <div className="flex items-center space-x-3 mb-2">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <h4 className="font-medium text-blue-900">Refresh Status</h4>
            </div>
            <p className="text-sm text-blue-700">Re-check system components and capabilities</p>
          </button>
          
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-3 mb-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h4 className="font-medium text-gray-900">System Information</h4>
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Platform: {platform}</div>
              <div>WSL: {wslStatus}</div>
              <div>Kali: {kaliStatus}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center space-x-2">
          <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>Troubleshooting</span>
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-900 mb-2 flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>WSL Installation Issues</span>
            </h4>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Ensure Windows 10 version 2004 or later</li>
              <li>• Enable Virtual Machine Platform in Windows Features</li>
              <li>• Run as Administrator if installation fails</li>
              <li>• Check Windows Update for latest WSL updates</li>
            </ul>
          </div>
          
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="font-medium text-red-900 mb-2 flex items-center space-x-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Kali Linux Issues</span>
            </h4>
            <ul className="text-sm text-red-800 space-y-1">
              <li>• WSL must be installed before Kali Linux</li>
              <li>• Ensure sufficient disk space (2GB+ recommended)</li>
              <li>• Check internet connection for download</li>
              <li>• Verify Windows Subsystem for Linux is enabled</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SystemStatus