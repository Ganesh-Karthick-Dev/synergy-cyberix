import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'
import DashboardOverview from './components/DashboardOverview.jsx'
import SecurityCenter from './components/SecurityCenter'
import SystemLogs from './components/SystemLogs'
import UserManagement from './components/UserManagement'
import SettingsPanel from './components/SettingsPanel'
import NetworkScanning from './components/NetworkScanning'
import PortScanning from './components/PortScanning'
import { 
  LayoutDashboard, 
  ScanSearch, 
  Network, 
  Server, 
  Shield, 
  ShoppingBag, 
  FileSearch, 
  AlertTriangle, 
  Code, 
  Bug, 
  FileText, 
  Settings,
  Activity,
  Globe,
  Store,
  ShieldCheck,
  AlertCircle,
  List,
  Sliders,
  Layers,
  ShoppingCart,
  Ban,
  FileCheck,
  ShieldX
} from 'lucide-react'
import ServerScanning from './components/ServerScanning'
import ScanningIndicator from './components/ScanningIndicator'
import FloatingProgressCard from './components/FloatingProgressCard'
import WordPressCloudShield from './components/WordPressCloudShield'
import ShopifyCloudShield from './components/ShopifyCloudShield'
import ChatBot from './components/ChatBot'


import PhishingDetection from './components/PhishingDetection'
import APIScanner from './components/APIScanner'
import WebsiteSecurityAudit from './components/WebsiteSecurityAudit'
import MalwareDefacementMonitor from './components/MalwareDefacementMonitor'
import QuickCheckScreen from './components/QuickCheckScreen'

function Dashboard({ onLogout }) {
  const [activeView, setActiveView] = useState('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showQuickCheck, setShowQuickCheck] = useState(true)

  // Listen for notification clicks to navigate to scan view
  useEffect(() => {
    if (window.cyberGuard) {
      const handler = window.cyberGuard.onNotificationClicked?.((data) => {
        if (data && data.viewId) {
          setActiveView(data.viewId)
        }
      })
      
      return () => {
        if (handler && window.cyberGuard?.removeNotificationClickedListener) {
          window.cyberGuard.removeNotificationClickedListener(handler)
        }
      }
    }
  }, [])

  const menuItems = [
    { 
      id: 'overview', 
      name: 'Overview', 
      icon: <LayoutDashboard className="w-5 h-5" />
    },
    { 
      id: 'scan', 
      name: 'Scan', 
      icon: <ScanSearch className="w-5 h-5" />,
      subItems: [
        {
          id: 'port-scan',
          name: 'Port Scanning',
          icon: <Activity className="w-4 h-4" />
        },
        {
          id: 'network-scan',
          name: 'Network Scanning',
          icon: <Network className="w-4 h-4" />
        },
        {
          id: 'server-scan',
          name: 'Server-level Scanning',
          icon: <Server className="w-4 h-4" />
        },
      ]
    },
    { 
      id: 'wordpress-shield', 
      name: 'WordPress Cloud Shield', 
      icon: <Layers className="w-5 h-5" strokeWidth={2.5} />
    },
    { 
      id: 'shopify-shield', 
      name: 'Shopify Cloud Shield', 
      icon: <ShoppingCart className="w-5 h-5" strokeWidth={2.5} />
    },
    {
      id: 'website-audit',
      name: 'Website Security Audit',
      icon: <FileSearch className="w-5 h-5" strokeWidth={2.5} />
    },
    {
      id: 'phishing-scan',
      name: 'Phishing & Brand Abuse Detection',
      icon: <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
    },
    // {
    //   id: 'api-scan',
    //   name: 'API Scanner',
    //   icon: <Code className="w-5 h-5" />
    // },
    { 
      id: 'malware-defacement', 
      name: 'Malware & Defacement Monitor', 
      icon: <Bug className="w-5 h-5" />
    },
    { 
      id: 'logs', 
      name: 'System Logs', 
      icon: <List className="w-5 h-5" />
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: <Sliders className="w-5 h-5" />
    }
  ]

  const renderContent = () => {
    switch (activeView) {
      case 'overview':
        return <DashboardOverview />
      case 'network-scan':
        return <NetworkScanning />
      case 'port-scan':
        return <PortScanning />
      case 'server-scan':
        return <ServerScanning />
      case 'phishing-scan':
        return <PhishingDetection />
      // case 'api-scan':
      //   return <APIScanner />
      // case 'security':
      //   return <SecurityCenter />
      case 'malware-defacement':
        return <MalwareDefacementMonitor />
      // Threat Monitor removed
      case 'logs':
        return <SystemLogs />
      // case 'users':
      //   return <UserManagement />
      case 'wordpress-shield':
        return <WordPressCloudShield />
      case 'shopify-shield':
        return <ShopifyCloudShield />
      case 'website-audit':
        return <WebsiteSecurityAudit />
      case 'settings':
        return <SettingsPanel />
      default:
        return <DashboardOverview />
    }
  }

  // Show Quick Check Screen first
  if (showQuickCheck) {
    return (
      <QuickCheckScreen
        onComplete={() => {
          console.log('✅ [DASHBOARD] Quick check complete')
          setShowQuickCheck(false)
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex">
      {/* Fixed Sidebar */}
      <Sidebar
        menuItems={menuItems}
        activeView={activeView}
        onViewChange={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${
        sidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        {/* Top Navbar */}
        <Navbar
          onLogout={onLogout}
          currentView={menuItems.find(item => item.id === activeView)?.name || 'Dashboard'}
        />

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6 bg-gray-50 dark:bg-slate-900 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Global Scanning Indicator */}
      <ScanningIndicator />
      
      {/* Floating Progress Card */}
      <FloatingProgressCard />

      {/* ChatBot */}
      <ChatBot />
    </div>
  )
}

export default Dashboard