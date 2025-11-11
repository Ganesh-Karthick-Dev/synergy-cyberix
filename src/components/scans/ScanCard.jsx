import React from 'react'

const formatDateTime = (date) => {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date)
}

const ScanCard = ({
  test,
  isSelected,
  isRunning,
  progress,
  result,
  isExpanded,
  isCompleted,
  isNotScanned,
  canOpen,
  isExporting,
  onToggleExpansion,
  onOpenDetail,
  onGeneratePDF
}) => {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all duration-200 overflow-hidden ${
        canOpen
          ? 'border-green-200 dark:border-green-800'
          : isRunning
          ? 'border-orange-200 dark:border-orange-800'
          : 'border-gray-200 dark:border-slate-700'
      } hover:shadow-md ${canOpen ? 'cursor-pointer' : ''}`}
      style={{ boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0 }}
      onClick={canOpen ? () => {
        console.log('Card clicked:', test.id)
        console.log('isCompleted:', isCompleted)
        console.log('result exists:', !!result)
        console.log('result:', result)
        onOpenDetail(test.id, result)
      } : undefined}
    >
      <div className="p-6 overflow-hidden" style={{ boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>
        <div className="flex items-center justify-between mb-4" style={{ minWidth: 0, width: '100%' }}>
          <div className="flex items-center space-x-3 flex-shrink" style={{ minWidth: 0, flex: '1 1 0%' }}>
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isCompleted
                ? 'bg-green-100 dark:bg-green-900/20'
                : isRunning
                ? 'bg-orange-100 dark:bg-orange-900/20'
                : isNotScanned
                ? 'bg-gray-200 dark:bg-slate-600'
                : 'bg-gray-100 dark:bg-slate-700'
            }`}>
              {isCompleted ? (
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : isRunning ? (
                <div className="w-5 h-5 border-2 border-orange-600 border-t-transparent rounded-full animate-spin"></div>
              ) : isNotScanned ? (
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            <div className="flex-1" style={{ minWidth: 0, overflow: 'hidden' }}>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 break-words" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>{test.category}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              test.severity === 'critical' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
              test.severity === 'high' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
              test.severity === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
              'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
            }`}>
              {test.severity}
            </span>
            {/* View Detail and Export PDF Icon Buttons for Completed Scans */}
            {isCompleted && canOpen && result && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenDetail(test.id, result)
                  }}
                  className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                  title="View Details"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onGeneratePDF(test.id, result)
                  }}
                  disabled={isExporting}
                  className="w-8 h-8 flex items-center justify-center bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export PDF"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 break-words">{test.description}</p>
        
        {/* About Section */}
        <div className="mb-4">
          <button
            onClick={() => onToggleExpansion(test.id)}
            className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <span>About this test</span>
            <svg 
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExpanded && (
            <div className="mt-2 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{test.detailedDescription}</p>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p><strong>Estimated time:</strong> {test.estimatedTime} seconds</p>
                <p><strong>Category:</strong> {test.category}</p>
                <p><strong>Severity:</strong> {test.severity}</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Expanded Content - Only show when card is expanded */}
        {isExpanded && (
          <>
        {/* Progress Bar */}
        {(isRunning || isCompleted) && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${
                  isCompleted ? 'bg-green-500' : 'bg-orange-500'
                }`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* PDF Export Button for Individual Scan */}
        {canOpen && result && (
          <div className="mb-4">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onGeneratePDF(test.id, result)
              }}
              disabled={isExporting}
              className="w-full px-3 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={`Export ${test.name} results to PDF`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export PDF</span>
            </button>
          </div>
        )}

        {/* Test Results */}
        {(() => {
          if (!result) {
            return (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings:</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400">No results yet</p>
              </div>
            )
          }

          const criticalFindings = result.findings?.filter(f => f.type === 'critical') || []
          const highFindings = result.findings?.filter(f => f.type === 'high') || []
          const mediumFindings = result.findings?.filter(f => f.type === 'medium') || []
          const lowFindings = result.findings?.filter(f => f.type === 'warning') || []
          const infoFindings = result.findings?.filter(f => f.type === 'info' || f.type === 'success') || []

          return (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Findings:</h4>
              
              {/* Findings Summary */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {criticalFindings.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-red-600 dark:text-red-400">{criticalFindings.length} Critical</span>
                  </div>
                )}
                {highFindings.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span className="text-orange-600 dark:text-orange-400">{highFindings.length} High</span>
                  </div>
                )}
                {mediumFindings.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-yellow-600 dark:text-yellow-400">{mediumFindings.length} Medium</span>
                  </div>
                )}
                {lowFindings.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-blue-600 dark:text-blue-400">{lowFindings.length} Low</span>
                  </div>
                )}
                {infoFindings.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-green-600 dark:text-green-400">{infoFindings.length} Info</span>
                  </div>
                )}
              </div>

              {/* Result Preview Summary */}
              <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Result Summary:</h5>
                <div className="space-y-1">
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Status:</span> 
                    <span className={`ml-1 ${
                      result.status === 'completed' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}>
                      {result.status}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Findings:</span> {result.findings?.length || 0}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Recommendations:</span> {result.recommendations?.length || 0}
                  </div>
                  {result.timestamp && (
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Completed:</span> {formatDateTime(new Date(result.timestamp))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
          </>
        )}
      </div>
    </div>
  )
}

export default ScanCard

