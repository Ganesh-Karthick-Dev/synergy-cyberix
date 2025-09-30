function SettingsPanel() {
  const securitySettings = [
    {
      category: 'Authentication',
      settings: [
        { name: 'Two-Factor Authentication', enabled: true, description: 'Require 2FA for all users' },
        { name: 'Session Timeout', enabled: true, description: 'Auto logout after 30 minutes of inactivity' },
        { name: 'Password Complexity', enabled: true, description: 'Enforce strong password requirements' },
        { name: 'Login Monitoring', enabled: true, description: 'Monitor and alert on suspicious logins' }
      ]
    },
    {
      category: 'Network Security',
      settings: [
        { name: 'Firewall', enabled: true, description: 'Block unauthorized network traffic' },
        { name: 'Intrusion Detection', enabled: true, description: 'Monitor for malicious network activity' },
        { name: 'VPN Access', enabled: false, description: 'Allow secure remote connections' },
        { name: 'Network Segmentation', enabled: true, description: 'Isolate critical network segments' }
      ]
    },
    {
      category: 'Data Protection',
      settings: [
        { name: 'Data Encryption', enabled: true, description: 'Encrypt sensitive data at rest and in transit' },
        { name: 'Backup Encryption', enabled: true, description: 'Encrypt all backup files' },
        { name: 'Data Loss Prevention', enabled: true, description: 'Prevent unauthorized data transfers' },
        { name: 'File Integrity Monitoring', enabled: false, description: 'Monitor critical files for changes' }
      ]
    },
    {
      category: 'Compliance',
      settings: [
        { name: 'Audit Logging', enabled: true, description: 'Log all security-related events' },
        { name: 'Compliance Reporting', enabled: true, description: 'Generate automated compliance reports' },
        { name: 'Data Retention', enabled: true, description: 'Automatically manage data lifecycle' },
        { name: 'Privacy Controls', enabled: true, description: 'Enforce data privacy regulations' }
      ]
    }
  ]

  const systemSettings = {
    notifications: {
      emailAlerts: true,
      smsAlerts: false,
      dashboardAlerts: true,
      criticalOnly: false
    },
    monitoring: {
      realTimeScanning: true,
      scheduledScans: true,
      behaviorAnalysis: true,
      threatIntelligence: true
    },
    performance: {
      autoUpdates: true,
      lowResourceMode: false,
      compressionEnabled: true,
      cacheOptimization: true
    }
  }

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">System Configuration</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Security Status</p>
            <p className="text-xs text-green-600 mt-1">Optimal</p>
          </div>
          
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">System Performance</p>
            <p className="text-xs text-blue-600 mt-1">Excellent</p>
          </div>
          
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">Last Updated</p>
            <p className="text-xs text-purple-600 mt-1">2 hours ago</p>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="space-y-6">
        {securitySettings.map((category, categoryIndex) => (
          <div key={categoryIndex} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{category.category}</h3>
            
            <div className="space-y-4">
              {category.settings.map((setting, settingIndex) => (
                <div key={settingIndex} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">{setting.name}</h4>
                    <p className="text-xs text-gray-600 mt-1">{setting.description}</p>
                  </div>
                  <div className="flex items-center ml-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        defaultChecked={setting.enabled}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <span className={`ml-3 text-xs font-medium ${
                      setting.enabled ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {setting.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* System Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Notification Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Notifications</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.notifications).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Monitoring Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monitoring</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.monitoring).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
          <div className="space-y-3">
            {Object.entries(systemSettings.performance).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={value}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
        <button className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
          Reset to Defaults
        </button>
        <button className="px-6 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-colors">
          Export Configuration
        </button>
        <button className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  )
}

export default SettingsPanel