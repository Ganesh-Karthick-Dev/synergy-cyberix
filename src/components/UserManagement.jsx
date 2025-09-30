function UserManagement() {
  const users = [
    {
      id: 1,
      name: 'John Doe',
      email: 'john.doe@company.com',
      role: 'Administrator',
      status: 'Active',
      lastLogin: '2024-01-15 14:30:22',
      failedLogins: 0,
      department: 'IT Security'
    },
    {
      id: 2,
      name: 'Sarah Johnson',
      email: 'sarah.johnson@company.com',
      role: 'Security Analyst',
      status: 'Active',
      lastLogin: '2024-01-15 13:45:18',
      failedLogins: 1,
      department: 'IT Security'
    },
    {
      id: 3,
      name: 'Mike Chen',
      email: 'mike.chen@company.com',
      role: 'User',
      status: 'Suspended',
      lastLogin: '2024-01-10 09:22:45',
      failedLogins: 5,
      department: 'Marketing'
    },
    {
      id: 4,
      name: 'Emily Davis',
      email: 'emily.davis@company.com',
      role: 'Manager',
      status: 'Active',
      lastLogin: '2024-01-15 11:15:33',
      failedLogins: 0,
      department: 'HR'
    },
    {
      id: 5,
      name: 'Alex Rodriguez',
      email: 'alex.rodriguez@company.com',
      role: 'User',
      status: 'Inactive',
      lastLogin: '2024-01-05 16:42:11',
      failedLogins: 2,
      department: 'Sales'
    }
  ]

  const userStats = [
    { label: 'Total Users', value: 247, color: 'blue' },
    { label: 'Active Users', value: 189, color: 'green' },
    { label: 'Suspended', value: 12, color: 'yellow' },
    { label: 'Failed Logins', value: 23, color: 'red' }
  ]

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'suspended':
        return 'bg-red-100 text-red-800'
      case 'inactive':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleColor = (role) => {
    switch (role.toLowerCase()) {
      case 'administrator':
        return 'bg-purple-100 text-purple-800'
      case 'security analyst':
        return 'bg-blue-100 text-blue-800'
      case 'manager':
        return 'bg-indigo-100 text-indigo-800'
      case 'user':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* User Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {userStats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg mr-4 ${
                stat.color === 'blue' ? 'bg-blue-100' :
                stat.color === 'green' ? 'bg-green-100' :
                stat.color === 'yellow' ? 'bg-yellow-100' :
                'bg-red-100'
              }`}>
                <svg className={`w-6 h-6 ${
                  stat.color === 'blue' ? 'text-blue-600' :
                  stat.color === 'green' ? 'text-green-600' :
                  stat.color === 'yellow' ? 'text-yellow-600' :
                  'text-red-600'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* User Management Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">User Management</h2>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search users..."
                className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <select className="text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>All Roles</option>
              <option>Administrator</option>
              <option>Security Analyst</option>
              <option>Manager</option>
              <option>User</option>
            </select>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              Add User
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Failed Logins
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(user.role)}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.department}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {user.lastLogin}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${
                      user.failedLogins > 3 ? 'text-red-600' : 
                      user.failedLogins > 0 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {user.failedLogins}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <button className="text-blue-600 hover:text-blue-900">Edit</button>
                      <button className="text-yellow-600 hover:text-yellow-900">Reset</button>
                      <button className="text-red-600 hover:text-red-900">Suspend</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Password Policies</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Minimum Length</span>
              <span className="text-sm text-gray-900">12 characters</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Password Expiry</span>
              <span className="text-sm text-gray-900">90 days</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Failed Login Lockout</span>
              <span className="text-sm text-gray-900">5 attempts</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Two-Factor Authentication</span>
              <span className="text-sm text-green-600">Required</span>
            </div>
          </div>
          <button className="mt-4 w-full bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Update Policies
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Role Permissions</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700">Administrator</span>
              <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Full Access</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700">Security Analyst</span>
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full">Security Only</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700">Manager</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Department</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-700">User</span>
              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Basic Access</span>
            </div>
          </div>
          <button className="mt-4 w-full bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Manage Roles
          </button>
        </div>
      </div>
    </div>
  )
}

export default UserManagement
