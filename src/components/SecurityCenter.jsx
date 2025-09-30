function SecurityCenter() {
  const securityModules = [
    {
      name: 'Firewall',
      status: 'active',
      description: 'Network protection and traffic filtering',
      lastUpdate: '2 hours ago',
      details: 'Blocking 245 threats per hour'
    },
    {
      name: 'Antivirus',
      status: 'active', 
      description: 'Real-time malware detection and removal',
      lastUpdate: '30 minutes ago',
      details: 'Last scan: No threats found'
    },
    {
      name: 'Intrusion Detection',
      status: 'active',
      description: 'Advanced threat detection system',
      lastUpdate: '1 hour ago', 
      details: '3 suspicious activities detected'
    },
    {
      name: 'VPN Gateway',
      status: 'warning',
      description: 'Secure remote access tunnel',
      lastUpdate: '4 hours ago',
      details: 'Connection issues detected'
    },
    {
      name: 'Email Security',
      status: 'active',
      description: 'Anti-phishing and spam protection',
      lastUpdate: '15 minutes ago',
      details: 'Blocked 12 phishing attempts today'
    },
    {
      name: 'Web Filter',
      status: 'maintenance',
      description: 'Web content filtering and blocking',
      lastUpdate: '6 hours ago',
      details: 'Scheduled maintenance in progress'
    }
  ]

  const securityPolicies = [
    {
      name: 'Password Policy',
      compliance: 98,
      description: 'Enforces strong password requirements',
      violations: 2
    },
    {
      name: 'Access Control',
      compliance: 95,
      description: 'User permissions and role-based access',
      violations: 5  
    },
    {
      name: 'Data Encryption',
      compliance: 100,
      description: 'End-to-end data encryption standards',
      violations: 0
    },
    {
      name: 'Network Segmentation',
      compliance: 88,
      description: 'Network isolation and micro-segmentation',
      violations: 12
    }
  ]

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'maintenance':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return (
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        )
      case 'warning':
        return (
          <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      case 'maintenance':
        return (
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          </svg>
        )
      default:
        return (
          <svg className="w-4 h-4 text-red-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Security Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Security Modules</h2>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Run Security Scan
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityModules.map((module, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{module.name}</h3>
                <div className={`flex items-center px-2 py-1 rounded-full border text-xs font-medium ${getStatusColor(module.status)}`}>
                  {getStatusIcon(module.status)}
                  <span className="ml-1 capitalize">{module.status}</span>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 mb-3">{module.description}</p>
              
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Last Update:</span>
                  <span className="text-gray-700">{module.lastUpdate}</span>
                </div>
                <div className="text-xs text-gray-600">{module.details}</div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-100">
                <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                  Configure →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Policies Compliance */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Security Policies</h2>
          <div className="text-sm text-gray-500">Overall Compliance: 95.3%</div>
        </div>
        
        <div className="space-y-4">
          {securityPolicies.map((policy, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{policy.name}</h3>
                  <p className="text-sm text-gray-600">{policy.description}</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">{policy.compliance}%</div>
                  <div className="text-sm text-gray-500">{policy.violations} violations</div>
                </div>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className={`h-3 rounded-full ${
                    policy.compliance >= 95 ? 'bg-green-500' :
                    policy.compliance >= 80 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${policy.compliance}%` }}
                ></div>
              </div>
              
              {policy.violations > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button className="text-sm text-red-600 hover:text-red-800 font-medium">
                    View {policy.violations} Violations →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Quick Actions</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Full Scan</span>
          </button>
          
          <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Update Rules</span>
          </button>
          
          <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">View Reports</span>
          </button>
          
          <button className="flex flex-col items-center p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <svg className="w-8 h-8 text-orange-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            </svg>
            <span className="text-sm font-medium text-gray-900">Configure</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default SecurityCenter