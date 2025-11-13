import { useState, useEffect } from 'react'
import scanLogger from '../utils/scanLogger'
import { FileText, RefreshCw, Download, Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react'

function SystemLogs() {
  const [logs, setLogs] = useState([])
  const [filteredLogs, setFilteredLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
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
  const [logsPath, setLogsPath] = useState('')

  // Load logs on component mount
  useEffect(() => {
    loadLogs()
  }, [selectedDate])

  // Filter logs when filters change
  useEffect(() => {
    applyFilters()
  }, [logs, filters])

  const loadLogs = async () => {
    setLoading(true)
    try {
      // Clear cached logs directory to force re-resolution
      if (scanLogger.logsDir) {
        scanLogger.logsDir = null
      }
      
      // Get the current logs directory path
      const logsDir = await scanLogger.resolveLogsDirectory()
      setLogsPath(logsDir)
      
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
    setSelectedDate('all')
  }

  const generatePDFReport = async () => {
    if (filteredLogs.length === 0 && logs.length === 0) {
      alert('No logs available to export')
      return
    }

    setIsExporting(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const doc = new jsPDF()
      
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const borderMargin = 10
      const footerHeight = 20
      let yPos = margin + 10
      
      // Function to draw page border
      const drawPageBorder = () => {
        doc.setDrawColor(80, 80, 80)
        doc.setLineWidth(0.8)
        doc.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      }
      
      // Function to add footer
      const addFooter = () => {
        const currentPage = doc.internal.getCurrentPageInfo().pageNumber
        const totalPages = doc.internal.getNumberOfPages()
        
        // Footer line
        doc.setDrawColor(200, 200, 200)
        doc.setLineWidth(0.5)
        doc.line(margin, pageHeight - footerHeight, pageWidth - margin, pageHeight - footerHeight)
        
        // Footer text
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)
        doc.text('Cyberix - A Webnox Product', pageWidth / 2, pageHeight - footerHeight + 12, { align: 'center' })
        
        // Page number
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
      }
      
      // Helper to check if new page needed
      const checkNewPage = (requiredSpace = 10) => {
        if (yPos + requiredSpace > pageHeight - footerHeight - margin) {
          addFooter()
          doc.addPage()
          drawPageBorder()
          yPos = margin + 10
          return true
        }
        return false
      }
      
      // Draw border on first page
      drawPageBorder()
      
      // Title
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40, 40, 40)
      doc.text('System Logs Report', pageWidth / 2, yPos, { align: 'center' })
      yPos += 10
      
      // Report Info
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 100, 100)
      const reportDate = new Date().toLocaleString()
      doc.text(`Generated: ${reportDate}`, margin, yPos)
      yPos += 6
      
      const logsToExport = filteredLogs.length > 0 ? filteredLogs : logs
      doc.text(`Total Logs: ${logsToExport.length}`, margin, yPos)
      yPos += 6
      
      if (stats) {
        doc.text(`Total Scans: ${stats.total} | Completed: ${stats.byStatus.completed || 0} | Failed: ${stats.byStatus.failed || 0}`, margin, yPos)
        yPos += 10
      } else {
        yPos += 4
      }
      
      // Table Header
      checkNewPage(15)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(40, 40, 40)
      doc.text('Scan Activity Logs', margin, yPos)
      yPos += 8
      
      // Table Headers
      checkNewPage(10)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(60, 60, 60)
      const colWidths = [35, 30, 35, 25, 25, 40]
      const headers = ['Timestamp', 'Type', 'Target', 'Status', 'Duration', 'Result']
      let xPos = margin
      headers.forEach((header, idx) => {
        doc.text(header, xPos, yPos)
        xPos += colWidths[idx]
      })
      yPos += 5
      
      // Draw header line
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.3)
      doc.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 3
      
      // Table Rows
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      logsToExport.forEach((log, index) => {
        checkNewPage(8)
        
        xPos = margin
        const rowData = [
          new Date(log.timestamp).toLocaleString(),
          formatScanType(log.scanType),
          log.target.length > 20 ? log.target.substring(0, 20) + '...' : log.target,
          log.status.charAt(0).toUpperCase() + log.status.slice(1),
          log.duration ? scanLogger.formatDuration(log.duration) : '-',
          log.result ? (log.result.length > 25 ? log.result.substring(0, 25) + '...' : log.result) : '-'
        ]
        
        rowData.forEach((data, idx) => {
          doc.setTextColor(40, 40, 40)
          doc.text(String(data), xPos, yPos)
          xPos += colWidths[idx]
        })
        
        yPos += 6
        
        // Add subtle line between rows
        if (index < logsToExport.length - 1) {
          doc.setDrawColor(240, 240, 240)
          doc.setLineWidth(0.1)
          doc.line(margin, yPos - 1, pageWidth - margin, yPos - 1)
        }
      })
      
      // Add footer to last page
      addFooter()
      
      // Save PDF
      const fileName = `cyberix_system_logs_${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
      
      alert('PDF report exported successfully!')
    } catch (error) {
      console.error('Error generating PDF:', error)
      alert('Failed to export PDF: ' + error.message)
    } finally {
      setIsExporting(false)
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
        return 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-700'
      case 'failed':
        return 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-700'
      case 'aborted':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-700'
      case 'started':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-700'
      default:
        return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'
    }
  }

  const getScanTypeColor = (scanType) => {
    switch (scanType) {
      case 'wordpress':
        return 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
      case 'shopify':
        return 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
      case 'network':
        return 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
      case 'port':
        return 'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
      case 'server':
        return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
      case 'malware':
        return 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
      case 'website-audit':
        return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
      case 'security-analyzer':
        return 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
      default:
        return 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
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
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-orange-200 dark:border-orange-800 border-t-orange-500 dark:border-t-orange-400 rounded-full animate-spin"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading scan logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Combined Section: Header, Statistics, and Filters */}
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-8 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent mb-2">
                System Logs
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg mb-1">
                Comprehensive logging of all scanning activities and user actions
              </p>
              {logsPath && (
                <p className="text-sm text-gray-500 dark:text-gray-500 font-mono bg-gray-100 dark:bg-slate-700/50 px-3 py-1.5 rounded-md inline-block mt-2">
                  📁 {logsPath}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={generatePDFReport}
                disabled={isExporting || (filteredLogs.length === 0 && logs.length === 0)}
                className="px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="text-sm font-medium">Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span className="text-sm font-medium">Export PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Statistics Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-xl shadow-lg border border-blue-200/50 dark:border-blue-700/50 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">Total Scans</p>
                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100">{stats.total}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-blue-500"></div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-xl shadow-lg border border-green-200/50 dark:border-green-700/50 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400 mb-1">Completed</p>
                    <p className="text-3xl font-bold text-green-900 dark:text-green-100">{stats.byStatus.completed || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-green-500"></div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 rounded-xl shadow-lg border border-red-200/50 dark:border-red-700/50 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Failed</p>
                    <p className="text-3xl font-bold text-red-900 dark:text-red-100">{stats.byStatus.failed || 0}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-red-500"></div>
                  </div>
                </div>
              </div>
              
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-xl shadow-lg border border-orange-200/50 dark:border-orange-700/50 p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-600 dark:text-orange-400 mb-1">Avg Duration</p>
                    <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{scanLogger.formatDuration(stats.averageDuration)}</p>
                  </div>
                  <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full bg-orange-500"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Collapsible Filters Section */}
          <div className="border-t border-gray-200/50 dark:border-slate-700/50 pt-6">
            <button
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="w-full flex items-center justify-between p-4 rounded-lg hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <Filter className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filters</h3>
                {(filters.scanType !== 'all' || filters.status !== 'all' || filters.date !== 'all' || filters.target !== '' || selectedDate !== 'all') && (
                  <span className="px-2 py-0.5 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full font-medium">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3">
                {(filters.scanType !== 'all' || filters.status !== 'all' || filters.date !== 'all' || filters.target !== '' || selectedDate !== 'all') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearFilters()
                    }}
                    className="text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium flex items-center space-x-1 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span>Clear All</span>
                  </button>
                )}
                {filtersExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </div>
            </button>
            
            {filtersExpanded && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 animate-in slide-in-from-top-2 duration-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Date</label>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm"
                  >
                    <option value="all">All Dates</option>
                    {availableDates.map(date => (
                      <option key={date} value={date}>{new Date(date).toLocaleDateString()}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Scan Type</label>
                  <select
                    value={filters.scanType}
                    onChange={(e) => handleFilterChange('scanType', e.target.value)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm"
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="started">Started</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="aborted">Aborted</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Target</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={filters.target}
                      onChange={(e) => handleFilterChange('target', e.target.value)}
                      placeholder="Search target..."
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg pl-10 pr-4 py-2.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all shadow-sm"
                    />
                  </div>
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={loadLogs}
                    className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Log Viewer */}
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-6 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Scan Activity Logs
            </h2>
            {filteredLogs.length !== logs.length && (
              <span className="px-3 py-1 text-sm bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full font-medium">
                {filteredLogs.length} of {logs.length} logs
              </span>
            )}
          </div>
        </div>

        {currentLogs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
              <FileText className="w-10 h-10 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No scan logs found</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              {logs.length === 0 
                ? "No scanning activities have been logged yet. Start a scan to see activity logs here."
                : "No logs match your current filters. Try adjusting your filter criteria."
              }
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-700 dark:to-slate-800">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Scan Type
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Target
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-slate-700">
                  {currentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-3 py-1 text-xs font-medium rounded-full ${getScanTypeColor(log.scanType)}`}>
                          {formatScanType(log.scanType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-mono">
                        <div className="max-w-xs truncate" title={log.target}>
                          {log.target}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full border ${getStatusColor(log.status)}`}>
                          {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">
                        {log.duration ? scanLogger.formatDuration(log.duration) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 max-w-md">
                        <div className="truncate" title={log.result}>
                          {log.result || '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Enhanced Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing <span className="font-semibold">{indexOfFirstLog + 1}</span> to{' '}
                  <span className="font-semibold">{Math.min(indexOfLastLog, filteredLogs.length)}</span> of{' '}
                  <span className="font-semibold">{filteredLogs.length}</span> results
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => paginate(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
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
                        className={`px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${
                          currentPage === pageNumber
                            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white border-orange-600 shadow-lg'
                            : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    )
                  })}
                  
                  <button
                    onClick={() => paginate(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-gray-300"
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
