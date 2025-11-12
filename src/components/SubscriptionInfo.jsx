import { useState, useEffect } from 'react'
import { Crown, AlertCircle, RefreshCw } from 'lucide-react'
import subscriptionService from '../services/subscriptionService'

function SubscriptionInfo() {
  const [planInfo, setPlanInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    fetchPlanInfo()
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPlanInfo, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchPlanInfo = async (forceRefresh = false) => {
    try {
      setLoading(true)
      setError(null)
      const info = forceRefresh 
        ? await subscriptionService.refreshPlanInfo()
        : await subscriptionService.getUserPlanInfo()
      console.log('📊 [SubscriptionInfo] Plan info received:', info)
      console.log('📊 [SubscriptionInfo] Plan name:', info.planName)
      console.log('📊 [SubscriptionInfo] Limits:', info.limits)
      console.log('📊 [SubscriptionInfo] Usage:', info.usage)
      setPlanInfo(info)
    } catch (err) {
      console.error('Error fetching plan info:', err)
      setError(err.message)
      // Set default FREE plan on error
      setPlanInfo({
        planName: 'FREE',
        limits: { maxProjects: 1, maxScansPerProject: 1, maxScans: 1 },
        usage: { projects: 0, totalScans: 0 }
      })
    } finally {
      setLoading(false)
    }
  }

  const formatPlanName = (name) => {
    const planMap = {
      'FREE': 'Free',
      'PRO': 'Pro',
      'PRO_PLUS': 'Pro Plus'
    }
    return planMap[name] || name
  }

  const formatLimit = (limit) => {
    if (limit === -1) return 'Unlimited'
    return limit
  }

  const getPlanColor = (planName) => {
    switch (planName) {
      case 'PRO_PLUS':
        return 'from-purple-500 to-purple-600'
      case 'PRO':
        return 'from-blue-500 to-blue-600'
      default:
        return 'from-gray-500 to-gray-600'
    }
  }

  const getPlanBadgeColor = (planName) => {
    switch (planName) {
      case 'PRO_PLUS':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800'
      case 'PRO':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
    }
  }

  if (loading && !planInfo) {
    return (
      <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-lg">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin"></div>
        <span className="text-sm text-gray-600 dark:text-gray-400">Loading...</span>
      </div>
    )
  }

  if (!planInfo) {
    return null
  }

  const { planName, limits, usage } = planInfo
  const projectsRemaining = limits.maxProjects === -1 
    ? 'Unlimited' 
    : Math.max(0, limits.maxProjects - usage.projects)
  const isProjectsLimitReached = limits.maxProjects !== -1 && usage.projects >= limits.maxProjects

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-all hover:shadow-md ${
          getPlanBadgeColor(planName)
        }`}
      >
        {planName !== 'FREE' && (
          <Crown className={`w-4 h-4 ${
            planName === 'PRO_PLUS' ? 'text-purple-600 dark:text-purple-400' :
            planName === 'PRO' ? 'text-blue-600 dark:text-blue-400' : ''
          }`} />
        )}
        <span className="text-sm font-semibold">
          {formatPlanName(planName)}
        </span>
        <div className="flex items-center space-x-1">
          <span className="text-xs font-medium">
            {usage.projects}/{formatLimit(limits.maxProjects)}
          </span>
          <span className="text-xs opacity-75">Projects</span>
        </div>
        {isProjectsLimitReached && (
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
        )}
      </button>

      {showDetails && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDetails(false)}
          />
          
          {/* Details Panel */}
          <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 z-50">
            <div className={`p-4 bg-gradient-to-r ${getPlanColor(planName)} rounded-t-lg`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {planName !== 'FREE' && (
                    <Crown className="w-5 h-5 text-white" />
                  )}
                  <h3 className="text-lg font-bold text-white">
                    {formatPlanName(planName)} Plan
                  </h3>
                </div>
                <button
                  onClick={() => fetchPlanInfo(true)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                  title="Refresh Plan Info"
                >
                  <RefreshCw className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Projects Usage */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Projects
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {usage.projects} / {formatLimit(limits.maxProjects)}
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      isProjectsLimitReached
                        ? 'bg-red-500'
                        : planName === 'PRO_PLUS'
                        ? 'bg-purple-500'
                        : planName === 'PRO'
                        ? 'bg-blue-500'
                        : 'bg-gray-500'
                    }`}
                    style={{
                      width: limits.maxProjects === -1 
                        ? '100%' 
                        : `${Math.min(100, (usage.projects / limits.maxProjects) * 100)}%`
                    }}
                  />
                </div>
                {isProjectsLimitReached && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1 flex items-center">
                    <AlertCircle className="w-3 h-3 mr-1" />
                    Limit reached. Upgrade to create more projects.
                  </p>
                )}
              </div>

              {/* Scans Per Project */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Scans per Project
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatLimit(limits.maxScansPerProject)}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {limits.maxScansPerProject === -1
                    ? 'Unlimited scans allowed per project'
                    : `Maximum ${limits.maxScansPerProject} scan(s) per project`}
                </p>
              </div>

              {/* Total Scans */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Total Scans
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {usage.totalScans}
                  </span>
                </div>
              </div>

              {/* Upgrade CTA for FREE/PRO */}
              {planName !== 'PRO_PLUS' && (
                <div className="pt-3 border-t border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => {
                      // Open upgrade page in browser
                      window.open('http://localhost:4006/pricing', '_blank')
                    }}
                    className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition-all shadow-sm"
                  >
                    {planName === 'FREE' ? 'Upgrade to Pro' : 'Upgrade to Pro Plus'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default SubscriptionInfo
