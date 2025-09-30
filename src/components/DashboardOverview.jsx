import ToastDemo from './ToastDemo'

function DashboardOverview() {
  const statsCards = [
    {
      title: 'Security Status',
      value: 'Secure',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      color: 'green',
      trend: '+2.5%',
      trendUp: true
    },
    {
      title: 'Active Sessions',
      value: '2,847',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
        </svg>
      ),
      color: 'blue',
      trend: '+12.3%',
      trendUp: true
    },
    {
      title: 'Threats Blocked',
      value: '1,429',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
      ),
      color: 'red',
      trend: '+8.7%',
      trendUp: true
    },
    {
      title: 'System Uptime',
      value: '99.9%',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      color: 'purple',
      trend: '+0.1%',
      trendUp: true
    }
  ]

  const recentAlerts = [
    {
      id: 1,
      type: 'warning',
      title: 'Suspicious Login Attempt',
      description: 'Multiple failed login attempts from IP 192.168.1.100',
      time: '2 minutes ago',
      severity: 'medium'
    },
    {
      id: 2,
      type: 'success',
      title: 'Malware Blocked',
      description: 'Trojan.Win32.Generic successfully quarantined',
      time: '15 minutes ago',
      severity: 'high'
    },
    {
      id: 3,
      type: 'info',
      title: 'System Update Available',
      description: 'Security patches ready for installation',
      time: '1 hour ago',
      severity: 'low'
    },
    {
      id: 4,
      type: 'error',
      title: 'Port Scan Detected',
      description: 'Unauthorized port scanning from external source',
      time: '2 hours ago',
      severity: 'high'
    }
  ]

  const topThreats = [
    { name: 'Malware', count: 524, percentage: 45 },
    { name: 'Phishing', count: 312, percentage: 27 },
    { name: 'Ransomware', count: 189, percentage: 16 },
    { name: 'Adware', count: 145, percentage: 12 }
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                <p className={`text-2xl font-bold ${
                  stat.color === 'green' ? 'text-green-600' :
                  stat.color === 'blue' ? 'text-blue-600' :
                  stat.color === 'red' ? 'text-red-600' :
                  'text-purple-600'
                }`}>
                  {stat.value}
                </p>
                <div className="flex items-center mt-2">
                  <span className={`text-xs font-medium ${
                    stat.trendUp ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {stat.trend} 
                  </span>
                  <span className="text-xs text-gray-500 ml-1">vs last month</span>
                </div>
              </div>
              <div className={`p-3 rounded-lg ${
                stat.color === 'green' ? 'bg-green-100 text-green-600' :
                stat.color === 'blue' ? 'bg-blue-100 text-blue-600' :
                stat.color === 'red' ? 'bg-red-100 text-red-600' :
                'bg-purple-100 text-purple-600'
              }`}>
                {stat.icon}
              </div>
            </div> 
          </div>
        ))}
      </div>

      {/* Charts and Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Threat Distribution Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">Threat Distribution</h3>
            <div className="flex items-center space-x-2">
              <select className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Last 7 days</option>
                <option>Last 30 days</option>
                <option>Last 90 days</option>
              </select>
            </div>
          </div>
          
          <div className="space-y-4">
            {topThreats.map((threat, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <div className="w-3 h-3 rounded-full bg-blue-500 mr-3"></div>
                  <span className="text-sm font-medium text-gray-900 mr-2">{threat.name}</span>
                  <span className="text-sm text-gray-500">({threat.count} incidents)</span>
                </div>
                <div className="flex items-center">
                  <div className="w-32 bg-gray-200 rounded-full h-2 mr-3">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${threat.percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8">{threat.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">View All</button>
          </div>
          
          <div className="space-y-4">
            {recentAlerts.map((alert) => (
              <div key={alert.id} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className={`p-1 rounded-full mt-1 ${
                  alert.type === 'warning' ? 'bg-yellow-100 text-yellow-600' :
                  alert.type === 'success' ? 'bg-green-100 text-green-600' :
                  alert.type === 'info' ? 'bg-blue-100 text-blue-600' :
                  'bg-red-100 text-red-600'
                }`}>
                  {alert.type === 'warning' ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z\" clipRule="evenodd\" />
                    </svg>
                  ) : alert.type === 'success' ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z\" clipRule="evenodd\" />
                    </svg>
                  ) : alert.type === 'info' ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z\" clipRule="evenodd\" />
                    </svg>
                  ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z\" clipRule="evenodd\" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                  <p className="text-xs text-gray-600 mt-1">{alert.description}</p>
                  <p className="text-xs text-gray-400 mt-1">{alert.time}</p>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  alert.severity === 'high' ? 'bg-red-100 text-red-800' :
                  alert.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {alert.severity}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toast Demo */}
      {/* <ToastDemo /> */}

      {/* System Status */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">System Status</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z\" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Firewall</p>
            <p className="text-xs text-green-600 mt-1">Active</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z\" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Antivirus</p>
            <p className="text-xs text-green-600 mt-1">Protected</p>
          </div>
          
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z\" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Updates</p>
            <p className="text-xs text-yellow-600 mt-1">3 Pending</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardOverview
