import { useState, useEffect } from 'react'
import { useTheme } from '../context/ThemeContext'
import scanLogger from '../utils/scanLogger'

function SystemLogs() {
  const { theme, toggleTheme } = useTheme()
  const [logs, setLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    scanType: 'all',
    status: 'all',
    date: 'all',
    target: ''
  })
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('all')
  const [stats, setStats] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [logsPerPage] = useState(50)

  // Load logs on component mount
  useEffect(() => {
    loadLogs()
  }, [selectedDate])

  // Theme handled globally by ThemeContext

  // Filter logs when filters change
  useEffect(() => {
    applyFilters()
  }, [logs, filters])

  const loadLogs = async () => {
    setLoading(true)
    try {
      let loadedLogs = []
      
      if (selectedDate === 'all') {
        // Load all logs from all daily files
        loadedLogs = await scanLogger.getAllLogsFromFiles()
      } else {
        // Load specific date from file system
        loadedLogs = await scanLogger.getLogsFromFile(selectedDate)
      }
      
      // Sort by timestamp (newest first)
      loadedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      
      setLogs(loadedLogs)
      
      // Load available dates
      const dates = await scanLogger.getAvailableLogDates()
      setAvailableDates(dates)
      
      // Calculate statistics
      const statistics = scanLogger.getScanStatistics(loadedLogs)
      setStats(statistics)
      
    } catch (error) {
      console.error('Error loading logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    const filtered = scanLogger.filterLogs(logs, filters)
    setFilteredLogs(filtered)
    setCurrentPage(1) // Reset to first page when filters change
  }

  const handleFilterChange = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }))
  }

  const clearFilters = () => {
    setFilters({
      scanType: 'all',
      status: 'all',
      date: 'all',
      target: ''
    })
  }

  const exportLogs = (format = 'json') => {
    const logsToExport = filteredLogs.length > 0 ? filteredLogs : logs
    const exportData = scanLogger.exportLogs(logsToExport, format)

    const blob = new Blob([exportData], {
      type: format === 'json' ? 'application/json' : 'text/csv'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `cyberix_scan_logs_${new Date().toISOString().split('T')[0]}.${format}`
    link.click()
    URL.revokeObjectURL(url)
  }

  const createTestLog = async () => {
    try {
      await scanLogger.logScan({
        scanType: 'test',
        scanName: 'Test Scan',
        target: 'example.com',
        status: 'completed',
        startTime: new Date(Date.now() - 30000).toISOString(),
        endTime: new Date().toISOString(),
        duration: 30000,
        result: 'Test scan completed successfully'
      })
      alert('Test log created! Refresh the page to see it.')
    } catch (error) {
      console.error('Error creating test log:', error)
      alert('Error creating test log: ' + error.message)
    }
  }

  // Pagination
  const indexOfLastLog = currentPage * logsPerPage
  const indexOfFirstLog = indexOfLastLog - logsPerPage
  const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog)
  const totalPages = Math.ceil(filteredLogs.length / logsPerPage)

  const paginate = (pageNumber) => setCurrentPage(pageNumber)

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'aborted':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'started':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getScanTypeColor = (scanType) => {
    switch (scanType) {
      case 'wordpress':
        return 'bg-blue-50 text-blue-700'
      case 'shopify':
        return 'bg-green-50 text-green-700'
      case 'network':
        return 'bg-purple-50 text-purple-700'
      case 'port':
        return 'bg-orange-50 text-orange-700'
      case 'server':
        return 'bg-red-50 text-red-700'
      case 'malware':
        return 'bg-red-50 text-red-700'
      case 'website-audit':
        return 'bg-yellow-50 text-yellow-700'
      case 'security-analyzer':
        return 'bg-indigo-50 text-indigo-700'
      default:
        return 'bg-gray-50 text-gray-700'
    }
  }

  const formatScanType = (scanType) => {
    switch (scanType) {
      case 'wordpress': return 'WordPress Audit'
      case 'shopify': return 'Shopify Security'
      case 'network': return 'Network Scan'
      case 'port': return 'Port Scan'
      case 'server': return 'Server Scan'
      case 'malware': return 'Malware Detection'
      case 'website-audit': return 'Website Audit'
      case 'security-analyzer': return 'Security Analyzer'
      default: return scanType
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
        <span className="ml-3 text-gray-600">Loading scan logs...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">System Logs</h1>
            <p className="text-orange-100">Comprehensive logging of all scanning activities and user actions</p>
          </div>
                <div className="flex space-x-3">
                  <button
                    onClick={toggleTheme}
                    className="px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center space-x-2"
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  >
                    {theme === 'dark' ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 118.646 3.646 7 7 0 0020.354 15.354z" />
                      </svg>
                    )}
                    <span className="text-sm">{theme === 'dark' ? 'Light' : 'Dark'}</span>
                  </button>
                   <button
                     onClick={createTestLog}
                     className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center space-x-2"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                     </svg>
                     <span>Test Log</span>
                   </button>
                   <button
                     onClick={() => exportLogs('json')}
                     className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center space-x-2"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                     </svg>
                     <span>Export JSON</span>
                   </button>
                   <button
                     onClick={() => exportLogs('csv')}
                     className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors flex items-center space-x-2"
                   >
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                     </svg>
                     <span>Export CSV</span>
                   </button>
                 </div>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center">
              <div className="p-2 rounded-lg mr-3 bg-blue-100">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Scans</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center">
              <div className="p-2 rounded-lg mr-3 bg-green-100">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Completed</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.byStatus.completed || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center">
              <div className="p-2 rounded-lg mr-3 bg-red-100">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Failed</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.byStatus.failed || 0}</p>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center">
              <div className="p-2 rounded-lg mr-3 bg-orange-100">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Duration</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{scanLogger.formatDuration(stats.averageDuration)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filters</h3>
          <button
            onClick={clearFilters}
            className="text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            Clear All Filters
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Dates</option>
              {availableDates.map(date => (
                <option key={date} value={date}>{new Date(date).toLocaleDateString()}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scan Type</label>
            <select
              value={filters.scanType}
              onChange={(e) => handleFilterChange('scanType', e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Types</option>
              <option value="wordpress">WordPress Audit</option>
              <option value="shopify">Shopify Security</option>
              <option value="network">Network Scan</option>
              <option value="port">Port Scan</option>
              <option value="server">Server Scan</option>
              <option value="malware">Malware Detection</option>
              <option value="website-audit">Website Audit</option>
              <option value="security-analyzer">Security Analyzer</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All Status</option>
              <option value="started">Started</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="aborted">Aborted</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target</label>
            <input
              type="text"
              value={filters.target}
              onChange={(e) => handleFilterChange('target', e.target.value)}
              placeholder="Search target..."
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={loadLogs}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Log Viewer */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Scan Activity Logs
            {filteredLogs.length !== logs.length && (
              <span className="ml-2 text-sm text-gray-500">
                ({filteredLogs.length} of {logs.length} logs)
              </span>
            )}
          </h2>
        </div>

        {currentLogs.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">No scan logs found</h3>
            <p className="text-gray-500 dark:text-gray-400">
              {logs.length === 0 
                ? "No scanning activities have been logged yet. Start a scan to see activity logs here."
                : "No logs match your current filters. Try adjusting your filter criteria."
              }
            </p>
          </div>
        ) : (
          <>
        <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Scan Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Target
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Result
                </th>
              </tr>
            </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {currentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getScanTypeColor(log.scanType)}`}>
                          {formatScanType(log.scanType)}
                    </span>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                        <div className="max-w-xs truncate" title={log.target}>
                          {log.target}
                        </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getStatusColor(log.status)}`}>
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                    </span>
                  </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {log.duration ? scanLogger.formatDuration(log.duration) : '-'}
                      </td>
                  <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-md">
                        <div className="truncate" title={log.result}>
                          {log.result}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
            {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-medium">{indexOfFirstLog + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(indexOfLastLog, filteredLogs.length)}</span> of{' '}
                  <span className="font-medium">{filteredLogs.length}</span> results
          </div>
          <div className="flex items-center space-x-2">
                  <button
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
              Previous
            </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNumber = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i
                    if (pageNumber > totalPages) return null
                    
                    return (
                      <button
                        key={pageNumber}
                        onClick={() => paginate(pageNumber)}
                        className={`px-3 py-1 text-sm border rounded-md transition-colors ${
                          currentPage === pageNumber
                            ? 'bg-orange-600 text-white border-orange-600'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pageNumber}
            </button>
                    )
                  })}
                  
                  <button
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
              Next
            </button>
          </div>
        </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}

export default SystemLogs