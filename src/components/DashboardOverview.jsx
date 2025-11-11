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
    <div className="space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Comprehensive Security Scanner Section - Moved to Top */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-full overflow-x-hidden"
        style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <ComprehensiveSecurityScanner />
      </motion.div>

    </div>
  )
}

export default DashboardOverview
