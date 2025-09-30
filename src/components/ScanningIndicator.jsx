import { useScanning } from '../context/ScanningContext'

function ScanningIndicator() {
  const { scanStatus, abortScan } = useScanning()

  if (!scanStatus.isScanning) return null

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4 max-w-sm">
        <div className="flex items-center space-x-3">
          {/* Scanning Icon */}
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>

          {/* Scan Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-sm font-medium text-gray-900">{scanStatus.scanType}</span>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
            <p className="text-xs text-gray-600 truncate">
              Target: {scanStatus.target}
            </p>
            {scanStatus.message && (
              <p className="text-xs text-gray-500 truncate mt-1">
                {scanStatus.message}
              </p>
            )}
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${scanStatus.progress}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Abort Button */}
          <button
            onClick={abortScan}
            className="flex-shrink-0 p-1 text-red-400 hover:text-red-600 transition-colors"
            title="Abort Scan"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default ScanningIndicator
