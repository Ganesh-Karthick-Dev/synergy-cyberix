import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar
} from 'recharts'
import { 
  Shield, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  Users, 
  Globe, 
  Lock,
  Eye,
  Zap,
  Server,
  Cpu
} from 'lucide-react'
import ComprehensiveSecurityScanner from './ComprehensiveSecurityScanner'

function DashboardOverview() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate loading
    const loadingTimer = setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => {
      clearTimeout(loadingTimer)
    }
  }, [])

  // Sample data for charts
  const threatData = [
    { name: 'Mon', threats: 12, blocked: 8 },
    { name: 'Tue', threats: 19, blocked: 15 },
    { name: 'Wed', threats: 8, blocked: 6 },
    { name: 'Thu', threats: 15, blocked: 12 },
    { name: 'Fri', threats: 22, blocked: 18 },
    { name: 'Sat', threats: 6, blocked: 4 },
    { name: 'Sun', threats: 14, blocked: 11 }
  ]

  const securityMetrics = [
    { name: 'Firewall', value: 95, color: '#10B981' },
    { name: 'Antivirus', value: 88, color: '#F59E0B' },
    { name: 'Network', value: 92, color: '#3B82F6' },
    { name: 'Updates', value: 76, color: '#EF4444' }
  ]

  const systemStats = [
    { name: 'Active Users', value: '2,847', change: '+12%', icon: Users, color: 'text-blue-600' },
    { name: 'Threats Blocked', value: '1,234', change: '+8%', icon: Shield, color: 'text-green-600' },
    { name: 'Network Scans', value: '456', change: '+23%', icon: Globe, color: 'text-orange-600' },
    { name: 'System Uptime', value: '99.9%', change: '+0.1%', icon: Server, color: 'text-purple-600' }
  ]

  const recentActivities = [
    { id: 1, type: 'threat', message: 'Malicious IP blocked', time: '2 min ago', severity: 'high' },
    { id: 2, type: 'scan', message: 'Network scan completed', time: '5 min ago', severity: 'info' },
    { id: 3, type: 'update', message: 'Security patch applied', time: '12 min ago', severity: 'medium' },
    { id: 4, type: 'user', message: 'New user registered', time: '18 min ago', severity: 'low' }
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Comprehensive Security Scanner Section - Moved to Top */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <ComprehensiveSecurityScanner />
      </motion.div>


      {/* Key Metrics Cards */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {systemStats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 + index * 0.1 }}
            className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg bg-orange-50 dark:bg-orange-900/20`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                {stat.change}
              </span>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                {stat.value}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {stat.name}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Threat Activity Chart */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Threat Activity
            </h3>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Threats</span>
              <div className="w-3 h-3 bg-green-500 rounded-full ml-4"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Blocked</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={threatData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f9fafb'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="threats" 
                stackId="1"
                stroke="#f97316" 
                fill="#f97316" 
                fillOpacity={0.6}
              />
              <Area 
                type="monotone" 
                dataKey="blocked" 
                stackId="1"
                stroke="#10b981" 
                fill="#10b981" 
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Security Metrics Pie Chart */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Security Metrics
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={securityMetrics}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {securityMetrics.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#f9fafb'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {securityMetrics.map((metric, index) => (
              <div key={metric.name} className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: metric.color }}
                ></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {metric.name}: {metric.value}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* System Status and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
            System Status
          </h3>
          <div className="space-y-4">
            {[
              { name: 'Firewall', status: 'active', icon: Shield, color: 'green' },
              { name: 'Antivirus', status: 'protected', icon: Lock, color: 'green' },
              { name: 'Network Monitor', status: 'scanning', icon: Activity, color: 'blue' },
              { name: 'Updates', status: '3 pending', icon: AlertTriangle, color: 'yellow' }
            ].map((item, index) => (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg bg-${item.color}-100 dark:bg-${item.color}-900/20`}>
                    <item.icon className={`w-5 h-5 text-${item.color}-600 dark:text-${item.color}-400`} />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                    <p className={`text-sm text-${item.color}-600 dark:text-${item.color}-400`}>
                      {item.status}
                    </p>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivities.map((activity, index) => (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 + index * 0.1 }}
                className="flex items-center space-x-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg"
              >
                <div className={`w-2 h-2 rounded-full ${
                  activity.severity === 'high' ? 'bg-red-500' :
                  activity.severity === 'medium' ? 'bg-yellow-500' :
                  activity.severity === 'low' ? 'bg-green-500' : 'bg-blue-500'
                }`}></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {activity.message}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {activity.time}
                  </p>
                </div>
                <Eye className="w-4 h-4 text-gray-400" />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

    </div>
  )
}

export default DashboardOverview
