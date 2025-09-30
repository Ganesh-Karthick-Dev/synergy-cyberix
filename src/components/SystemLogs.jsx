function SystemLogs() {
  const logs = [
    {
      id: 1,
      timestamp: '2024-01-15 14:35:22',
      level: 'INFO',
      source: 'Authentication Service',
      message: 'User admin logged in successfully from 192.168.1.100',
      category: 'auth'
    },
    {
      id: 2,
      timestamp: '2024-01-15 14:34:18',
      level: 'WARNING',
      source: 'Firewall',
      message: 'Blocked connection attempt from suspicious IP 203.0.113.45',
      category: 'security'
    },
    {
      id: 3,
      timestamp: '2024-01-15 14:33:45',
      level: 'ERROR',
      source: 'Database',
      message: 'Connection timeout to primary database server',
      category: 'system'
    },
    {
      id: 4,
      timestamp: '2024-01-15 14:32:12',
      level: 'INFO',
      source: 'Email Scanner',
      message: 'Quarantined suspicious email with subject "Urgent: Verify Account"',
      category: 'security'
    },
    {
      id: 5,
      timestamp: '2024-01-15 14:31:33',
      level: 'DEBUG',
      source: 'System Monitor',
      message: 'CPU usage: 45%, Memory usage: 62%, Disk usage: 78%',
      category: 'performance'
    },
    {
      id: 6,
      timestamp: '2024-01-15 14:30:55',
      level: 'CRITICAL',
      source: 'Intrusion Detection',
      message: 'Multiple failed login attempts detected for user admin',
      category: 'security'
    },
    {
      id: 7,
      timestamp: '2024-01-15 14:29:41',
      level: 'INFO',
      source: 'Backup Service',
      message: 'Daily backup completed successfully - 2.3GB archived',
      category: 'system'
    },
    {
      id: 8,
      timestamp: '2024-01-15 14:28:17',
      level: 'WARNING',
      source: 'VPN Gateway',
      message: 'VPN connection dropped for user john.doe@company.com',
      category: 'network'
    }
  ]

  const logStats = [
    { level: 'INFO', count: 1247, color: 'blue' },
    { level: 'WARNING', count: 89, color: 'yellow' },
    { level: 'ERROR', count: 23, color: 'red' },
    { level: 'CRITICAL', count: 7, color: 'red' }
  ]

  const getLevelColor = (level) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'ERROR':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'INFO':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'DEBUG':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getCategoryColor = (category) => {
    switch (category) {
      case 'security':
        return 'bg-red-50 text-red-700'
      case 'auth':
        return 'bg-green-50 text-green-700'
      case 'system':
        return 'bg-blue-50 text-blue-700'
      case 'network':
        return 'bg-purple-50 text-purple-700'
      case 'performance':
        return 'bg-orange-50 text-orange-700'
      default:
        return 'bg-gray-50 text-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* Log Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {logStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center">
              <div className={`p-2 rounded-lg mr-3 ${
                stat.color === 'blue' ? 'bg-blue-100' :
                stat.color === 'yellow' ? 'bg-yellow-100' :
                'bg-red-100'
              }`}>
                <div className={`w-3 h-3 rounded-full ${
                  stat.color === 'blue' ? 'bg-blue-500' :
                  stat.color === 'yellow' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.level}</p>
                <p className="text-xl font-bold text-gray-900">{stat.count}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Log Viewer */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">System Logs</h2>
          <div className="flex items-center space-x-3">
            <select className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>All Categories</option>
              <option>Security</option>
              <option>Authentication</option>
              <option>System</option>
              <option>Network</option>
              <option>Performance</option>
            </select>
            <select className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>All Levels</option>
              <option>Critical</option>
              <option>Error</option>
              <option>Warning</option>
              <option>Info</option>
              <option>Debug</option>
            </select>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Export Logs
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Message
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                    {log.timestamp}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getLevelColor(log.level)}`}>
                      {log.level}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.source}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getCategoryColor(log.category)}`}>
                      {log.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                    <div className="truncate" title={log.message}>
                      {log.message}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <div className="text-sm text-gray-700">
            Showing <span className="font-medium">1</span> to <span className="font-medium">10</span> of{' '}
            <span className="font-medium">1,366</span> results
          </div>
          <div className="flex items-center space-x-2">
            <button className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              Previous
            </button>
            <button className="px-3 py-1 text-sm bg-blue-600 text-white border border-blue-600 rounded-md">
              1
            </button>
            <button className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              2
            </button>
            <button className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              3
            </button>
            <button className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Log Stream */}
      <div className="bg-black rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Live Log Stream</h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-green-400">Live</span>
          </div>
        </div>
        
        <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm">
          <div className="space-y-1">
            <div className="text-green-400">[14:35:22] INFO: User session started for admin</div>
            <div className="text-blue-400">[14:35:18] DEBUG: Database connection pool: 5/20 active</div>
            <div className="text-yellow-400">[14:35:15] WARNING: High memory usage detected: 85%</div>
            <div className="text-green-400">[14:35:12] INFO: Backup process initiated</div>
            <div className="text-red-400">[14:35:08] ERROR: Failed to connect to external API</div>
            <div className="text-blue-400">[14:35:05] DEBUG: Cache cleared successfully</div>
            <div className="text-green-400">[14:35:02] INFO: System health check completed</div>
            <div className="text-yellow-400">[14:34:58] WARNING: Disk space low on /var partition</div>
            <div className="text-green-400 animate-pulse">[14:34:55] INFO: New log entry...</div>
          </div>
        </div>
        
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            <button className="text-sm text-gray-400 hover:text-white transition-colors">
              Pause Stream
            </button>
            <button className="text-sm text-gray-400 hover:text-white transition-colors">
              Clear
            </button>
          </div>
          <div className="text-xs text-gray-500">
            Showing last 100 entries
          </div>
        </div>
      </div>
    </div>
  )
}

export default SystemLogs