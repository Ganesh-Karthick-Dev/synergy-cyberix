function ThreatMonitor() {
  const threats = [
    {
      id: 1,
      type: 'Malware',
      severity: 'High',
      source: '192.168.1.105',
      target: 'Server-01',
      status: 'Blocked',
      timestamp: '2024-01-15 14:32:15',
      description: 'Trojan.Win32.Generic detected in email attachment'
    },
    {
      id: 2,
      type: 'Phishing',
      severity: 'Medium',
      source: 'external',
      target: 'user@company.com',
      status: 'Quarantined',
      timestamp: '2024-01-15 14:28:42',
      description: 'Suspicious email with fraudulent PayPal link'
    },
    {
      id: 3,
      type: 'Port Scan',
      severity: 'Low',
      source: '203.0.113.45',
      target: 'DMZ Network',
      status: 'Monitoring',
      timestamp: '2024-01-15 14:15:33',
      description: 'Systematic port scanning attempt detected'
    },
    {
      id: 4,
      type: 'Ransomware',
      severity: 'Critical',
      source: '192.168.1.87',
      target: 'File Server',
      status: 'Contained',
      timestamp: '2024-01-15 13:45:21',
      description: 'File encryption attempt blocked by behavioral analysis'
    },
    {
      id: 5,
      type: 'SQL Injection',
      severity: 'High',
      source: '198.51.100.23',
      target: 'Web Server',
      status: 'Blocked',
      timestamp: '2024-01-15 13:22:18',
      description: 'Malicious SQL query in user input field'
    }
  ]

  const threatStats = [
    { type: 'Malware', count: 234, trend: '+12%' },
    { type: 'Phishing', count: 156, trend: '+8%' },
    { type: 'Intrusion', count: 89, trend: '-3%' },
    { type: 'Ransomware', count: 23, trend: '+45%' }
  ]

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'blocked':
        return 'bg-green-100 text-green-800'
      case 'quarantined':
        return 'bg-yellow-100 text-yellow-800'
      case 'contained':
        return 'bg-blue-100 text-blue-800'
      case 'monitoring':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Threat Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {threatStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.type}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.count}</p>
                <div className="flex items-center mt-2">
                  <span className={`text-xs font-medium ${
                    stat.trend.startsWith('+') ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {stat.trend}
                  </span>
                  <span className="text-xs text-gray-500 ml-1">vs last week</span>
                </div>
              </div>
              <div className="p-3 bg-red-100 rounded-lg">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.081 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Real-time Threats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Real-time Threat Feed</h2>
          <div className="flex items-center space-x-3">
            <div className="flex items-center text-sm text-gray-500">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
              Live monitoring
            </div>
            <select className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>All Threats</option>
              <option>Critical Only</option>
              <option>High Priority</option>
              <option>Blocked</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Threat Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {threats.map((threat) => (
                <tr key={threat.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{threat.type}</div>
                      <div className="text-xs text-gray-500 truncate max-w-xs">{threat.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getSeverityColor(threat.severity)}`}>
                      {threat.severity}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {threat.source}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {threat.target}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(threat.status)}`}>
                      {threat.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {threat.timestamp}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-900 mr-3">Details</button>
                    <button className="text-red-600 hover:text-red-900">Block</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Threat Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Threat Intelligence</h3>
          <div className="space-y-4">
            <div className="border-l-4 border-red-500 pl-4">
              <p className="text-sm font-medium text-gray-900">New Ransomware Campaign</p>
              <p className="text-xs text-gray-600 mt-1">
                Active ransomware family targeting healthcare organizations. 
                Updated IOCs available.
              </p>
              <p className="text-xs text-gray-500 mt-2">2 hours ago</p>
            </div>
            <div className="border-l-4 border-yellow-500 pl-4">
              <p className="text-sm font-medium text-gray-900">CVE-2024-1234 Alert</p>
              <p className="text-xs text-gray-600 mt-1">
                Critical vulnerability in Apache software. Patch available.
              </p>
              <p className="text-xs text-gray-500 mt-2">4 hours ago</p>
            </div>
            <div className="border-l-4 border-blue-500 pl-4">
              <p className="text-sm font-medium text-gray-900">Phishing Campaign Update</p>
              <p className="text-xs text-gray-600 mt-1">
                New email templates mimicking Microsoft Office 365 login pages.
              </p>
              <p className="text-xs text-gray-500 mt-2">6 hours ago</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Attack Sources</h3>
          <div className="space-y-4">
            {[
              { country: 'Russia', attacks: 1247, percentage: 34 },
              { country: 'China', attacks: 892, percentage: 24 },
              { country: 'North Korea', attacks: 634, percentage: 17 },
              { country: 'Iran', attacks: 423, percentage: 12 },
              { country: 'Other', attacks: 489, percentage: 13 }
            ].map((source, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center flex-1">
                  <div className="w-8 h-5 bg-gray-300 rounded mr-3 flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-600">
                      {source.country.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 mr-2">{source.country}</span>
                  <span className="text-sm text-gray-500">({source.attacks} attacks)</span>
                </div>
                <div className="flex items-center">
                  <div className="w-20 bg-gray-200 rounded-full h-2 mr-3">
                    <div 
                      className="bg-red-500 h-2 rounded-full" 
                      style={{ width: `${source.percentage}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900 w-8">{source.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ThreatMonitor