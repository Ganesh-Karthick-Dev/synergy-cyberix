import React, { useState, useEffect, useRef } from 'react';

// Component for expandable endpoint details
function EndpointCard({ endpoint, index }) {
  const [expanded, setExpanded] = useState(false);
  
  return (
    <div className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border border-gray-200 dark:border-slate-600">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-3">
          <span className={`px-2 py-1 rounded text-xs font-medium ${
            endpoint.method === 'GET' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
            endpoint.method === 'POST' ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200' :
            endpoint.method === 'PUT' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
            endpoint.method === 'DELETE' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
            'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
          }`}>
            {endpoint.method}
          </span>
          <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{endpoint.path}</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {endpoint.request_count} requests
            {endpoint.avg_response_time > 0 && (
              <span className="ml-2 text-orange-600 dark:text-orange-400">
                • {(endpoint.avg_response_time * 1000).toFixed(2)} ms avg
              </span>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm"
          >
            {expanded ? '▼ Less' : '▶ More'}
          </button>
        </div>
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        <div>URL: <code className="text-orange-600 dark:text-orange-400">{endpoint.url}</code></div>
        {endpoint.status_code_distribution && Object.keys(endpoint.status_code_distribution).length > 0 && (
          <div className="mt-1">
            Status Codes: {Object.entries(endpoint.status_code_distribution).map(([code, count]) => (
              <span key={code} className="ml-2">
                <span className="font-semibold">{code}</span> ({count})
              </span>
            ))}
          </div>
        )}
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-300 dark:border-slate-600 space-y-2">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            {endpoint.avg_response_time > 0 && (
              <div>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Avg Response Time:</span>
                <span className="ml-2 text-orange-600 dark:text-orange-400">{(endpoint.avg_response_time * 1000).toFixed(2)} ms</span>
              </div>
            )}
            {endpoint.avg_request_size > 0 && (
              <div>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Avg Request Size:</span>
                <span className="ml-2">{(endpoint.avg_request_size / 1024).toFixed(2)} KB</span>
              </div>
            )}
            {endpoint.avg_response_size > 0 && (
              <div>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Avg Response Size:</span>
                <span className="ml-2">{(endpoint.avg_response_size / 1024).toFixed(2)} KB</span>
              </div>
            )}
            {endpoint.response_count > 0 && (
              <div>
                <span className="font-semibold text-gray-700 dark:text-gray-300">Responses:</span>
                <span className="ml-2">{endpoint.response_count}</span>
              </div>
            )}
            {endpoint.content_types && endpoint.content_types.length > 0 && (
              <div className="md:col-span-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Content Types:</span>
                <span className="ml-2">{endpoint.content_types.join(', ')}</span>
              </div>
            )}
            {endpoint.query_params && endpoint.query_params.length > 0 && (
              <div className="md:col-span-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Query Parameters:</span>
                <code className="ml-2 text-orange-600 dark:text-orange-400">{endpoint.query_params.join(', ')}</code>
              </div>
            )}
            {endpoint.headers_analysis && (
              <div className="md:col-span-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Headers Analysis:</span>
                <div className="ml-4 mt-1 space-y-1">
                  {endpoint.headers_analysis.has_authentication && (
                    <span className="inline-block px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs mr-2">✓ Authentication</span>
                  )}
                  {endpoint.headers_analysis.has_cookies && (
                    <span className="inline-block px-2 py-1 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded text-xs mr-2">✓ Cookies</span>
                  )}
                  {endpoint.headers_analysis.user_agent && (
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      User-Agent: {endpoint.headers_analysis.user_agent.substring(0, 80)}...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function APIScanner() {
  // State management
  const [url, setUrl] = useState('https://example.com');
  const [scanResults, setScanResults] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(true);
  const consoleEndRef = useRef(null);
  
  // Auto-scroll console to bottom when new logs arrive
  useEffect(() => {
    if (consoleEndRef.current && showConsole) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, showConsole]);

  // Validate URL and start API scan
  const handleStartScan = async () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      alert('❌ Invalid URL format. Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    // Check if website is accessible
    setIsScanning(true);
    setProgress(3);
    setProgressMessage('Validating URL and checking website accessibility...');

    try {
      const response = await fetch(url, { 
        method: 'HEAD', 
        mode: 'no-cors',
        cache: 'no-cache'
      });
      
      // If we get here, the URL is accessible
      setProgress(8);
      setProgressMessage('URL validation successful. Starting API discovery...');
      
      setScanResults(null);
      await startAPIScan();
    } catch (error) {
      // URL is not accessible
      setIsScanning(false);
      setProgress(0);
      setProgressMessage('');
      alert('❌ Website not accessible. Please check the URL and try again.');
      return;
    }
  };

  // Real API scan implementation using WSL/Kali tools
  const startAPIScan = async () => {
    try {
      setIsScanning(true);
      setProgress(0);
      setProgressMessage('Initializing API scanner...');
      setScanResults(null);
      setConsoleLogs([]); // Clear previous logs

      // Check if cyberGuard API is available
      if (!window.cyberGuard || !window.cyberGuard.startAPIScan) {
        throw new Error('API scanner not available. Please ensure WSL and tools are installed.');
      }

      // Set up progress listener
      const progressCleanup = window.cyberGuard.onAPIScanProgress?.((update) => {
        if (update.progress !== undefined) {
          setProgress(update.progress);
        }
        if (update.message) {
          setProgressMessage(update.message);
          
          // Add to console logs
          setConsoleLogs(prev => {
            const newLog = {
              timestamp: new Date().toISOString(),
              message: update.message,
              command: update.command || null,
              type: update.type || 'info'
            };
            return [...prev, newLog];
          });
        }
        
        // Add command separately if present
        if (update.command) {
          setConsoleLogs(prev => {
            const newLog = {
              timestamp: new Date().toISOString(),
              message: 'Executing command...',
              command: update.command,
              type: 'command'
            };
            return [...prev, newLog];
          });
        }
      });

      // Set up completion listener
      const completeCleanup = window.cyberGuard.onAPIScanComplete?.((result) => {
        if (result.success && result.results) {
          setScanResults(result.results);
        } else {
          throw new Error(result.error || 'API scan failed');
        }
        setIsScanning(false);
        setProgress(0);
        setProgressMessage('');
        
        // Cleanup listeners
        if (progressCleanup) progressCleanup();
        if (completeCleanup) completeCleanup();
      });

      // Add initial log
      setConsoleLogs([{
        timestamp: new Date().toISOString(),
        message: '🚀 Starting API security scan...',
        command: null,
        type: 'info'
      }]);
      
      // Start the scan with fixed duration (120 seconds)
      await window.cyberGuard.startAPIScan(url, 120);

    } catch (error) {
      console.error('API scan error:', error);
      setIsScanning(false);
      setProgress(0);
      setProgressMessage('');
      alert(`❌ API scan failed: ${error.message || 'Unknown error'}`);
      
      // Cleanup listeners on error
      if (window.cyberGuard?.onAPIScanProgress) {
        try {
          const cleanup = window.cyberGuard.onAPIScanProgress(() => {});
          if (cleanup) cleanup();
        } catch {}
      }
      if (window.cyberGuard?.onAPIScanComplete) {
        try {
          const cleanup = window.cyberGuard.onAPIScanComplete(() => {});
          if (cleanup) cleanup();
        } catch {}
      }
    }
  };

  // Export PDF report using Wireshark data
  const exportPDF = async () => {
    if (!scanResults || !scanResults.capture_data) {
      alert('❌ No scan results available to export');
      return;
    }

    try {
      const result = await window.cyberGuard.exportAPIPDF(scanResults.capture_data);
      if (result.success) {
        alert(`✅ PDF report exported successfully: ${result.pdfPath}`);
      } else if (result.canceled) {
        // User cancelled the save dialog
        return;
      } else {
        alert(`❌ Failed to export PDF: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert(`❌ Error exporting PDF: ${error.message || 'Unknown error'}`);
    }
  };

  // Download PDF report (legacy - kept for compatibility)
  const downloadPDF = async () => {
    try {
      // Use new export function if available
      if (scanResults && scanResults.capture_data) {
        await exportPDF();
        return;
      }

      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;

      // Header with company branding
      doc.setFillColor(59, 130, 246); // Blue background
      doc.rect(0, 0, pageWidth, 30, 'F');
      
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('API & Endpoint Exposure Analysis Report', pageWidth / 2, 20, { align: 'center' });
      
      // Reset text color
      doc.setTextColor(0, 0, 0);
      yPosition = 45;

      // Executive Summary Box
      doc.setFillColor(240, 240, 240);
      doc.rect(15, yPosition, pageWidth - 30, 25, 'F');
      doc.setFontSize(14);
      doc.setFont(undefined, 'bold');
      doc.text('EXECUTIVE SUMMARY', 20, yPosition + 8);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const riskLevel = scanResults.threat_score <= 30 ? 'LOW RISK' : 
                       scanResults.threat_score <= 60 ? 'MEDIUM RISK' : 'HIGH RISK';
      doc.text(`Risk Assessment: ${riskLevel} (${scanResults.threat_score}/100)`, 20, yPosition + 15);
      doc.text(`Target: ${scanResults.target_url}`, 20, yPosition + 20);
      yPosition += 35;

      // Scan Summary
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('SCAN SUMMARY', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`Total Endpoints Discovered: ${scanResults.scan_summary.total_endpoints}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Authenticated Endpoints: ${scanResults.scan_summary.authenticated_endpoints}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Public Endpoints: ${scanResults.scan_summary.public_endpoints}`, 20, yPosition);
      yPosition += 6;
      doc.text(`High Risk Endpoints: ${scanResults.scan_summary.high_risk_endpoints}`, 20, yPosition);
      yPosition += 6;
      doc.text(`Security Issues Found: ${scanResults.scan_summary.security_issues_found}`, 20, yPosition);
      yPosition += 15;

      // API Endpoints
      if (scanResults.endpoints && scanResults.endpoints.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('DISCOVERED API ENDPOINTS', 20, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        scanResults.endpoints.forEach((endpoint, index) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = 20;
          }
          
          doc.setFont(undefined, 'bold');
          doc.text(`${index + 1}. ${endpoint.method} ${endpoint.url}`, 20, yPosition);
          yPosition += 6;
          
          doc.setFont(undefined, 'normal');
          doc.text(`Status: ${endpoint.status} | Auth: ${endpoint.authentication} | Risk: ${endpoint.risk_level}`, 20, yPosition);
          yPosition += 6;
          
          if (endpoint.security_issues.length > 0) {
            doc.text(`Issues: ${endpoint.security_issues.join(', ')}`, 20, yPosition);
            yPosition += 6;
          }
          yPosition += 8;
        });
      }

      // Security Findings
      if (scanResults.findings && scanResults.findings.length > 0) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('SECURITY FINDINGS', 20, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        scanResults.findings.forEach((finding, index) => {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFont(undefined, 'bold');
          doc.text(`${index + 1}. ${finding.type}`, 20, yPosition);
          yPosition += 6;
          doc.setFont(undefined, 'normal');
          const evidenceLines = doc.splitTextToSize(finding.evidence, pageWidth - 40);
          doc.text(evidenceLines, 20, yPosition);
          yPosition += evidenceLines.length * 4 + 5;
        });
      }

      // Recommendations
      if (scanResults.recommendations && scanResults.recommendations.length > 0) {
        if (yPosition > pageHeight - 50) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('SECURITY RECOMMENDATIONS', 20, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        scanResults.recommendations.forEach((rec, index) => {
          if (yPosition > pageHeight - 20) {
            doc.addPage();
            yPosition = 20;
          }
          doc.setFont(undefined, 'bold');
          doc.text(`${index + 1}.`, 20, yPosition);
          doc.setFont(undefined, 'normal');
          const recLines = doc.splitTextToSize(rec, pageWidth - 40);
          doc.text(recLines, 30, yPosition);
          yPosition += recLines.length * 4 + 5;
        });
      }

      // Footer
      const footerY = pageHeight - 20;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('API & Endpoint Exposure Scanner', pageWidth / 2, footerY, { align: 'center' });
      doc.text('Professional API Security Assessment Report', pageWidth / 2, footerY + 5, { align: 'center' });
      doc.text('© 2024 API Security Scanner. All rights reserved.', pageWidth / 2, footerY + 10, { align: 'center' });

      // Save the PDF
      const filename = `api-exposure-analysis-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      alert(`✅ Professional API security report downloaded: ${filename}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('❌ Error generating PDF. Please try again.');
    }
  };

  // Get risk level color
  const getRiskColor = (level) => {
    switch (level) {
      case 'Critical': return 'text-red-600';
      case 'High': return 'text-red-500';
      case 'Medium': return 'text-yellow-500';
      case 'Low': return 'text-green-500';
      default: return 'text-gray-500';
    }
  };

  // Get severity color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'High': return 'bg-red-100 text-red-800 border border-red-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border border-green-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">API & Endpoint Exposure Scanner</h1>
        <p className="text-orange-100">Advanced discovery and security analysis for API endpoints</p>
      </div>



      {/* Input Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h2 className="text-xl font-semibold mb-4">API Scan Configuration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Target Website URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isScanning}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter the website URL to discover and analyze API endpoints
            </p>
          </div>

          <button
            onClick={handleStartScan}
            disabled={isScanning || !url.trim()}
            className={`px-8 py-3 rounded-lg font-medium flex items-center space-x-2 transition-all ${
              isScanning
                ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-wait'
                : 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
            } ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isScanning ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Scanning APIs...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Start API Discovery</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Console Viewer - Always Visible */}
      <div className="bg-gray-900 dark:bg-black rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Live Console Output
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => setConsoleLogs([])}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Clear Console
            </button>
            <button
              onClick={() => setShowConsole(!showConsole)}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              {showConsole ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        
        {showConsole && (
          <div className="bg-black rounded-lg border border-gray-800 p-4 max-h-96 overflow-y-auto font-mono">
            <div className="space-y-1">
              {consoleLogs.length === 0 ? (
                <div className="text-gray-500 text-sm">No console output yet. Start a scan to see commands...</div>
              ) : (
                consoleLogs.map((log, index) => (
                  <div key={index} className="text-xs">
                    {/* Timestamp and message */}
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-[10px] flex-shrink-0 font-mono">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <div className="flex-1 min-w-0">
                        {log.type === 'command' ? (
                          <div>
                            <div className="text-yellow-400 mb-1 font-semibold">📝 Executing Command:</div>
                            <code className="text-green-400 block whitespace-pre-wrap break-all bg-gray-900 dark:bg-black p-2 rounded mb-2 border border-gray-800">
                              {log.command}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(log.command || '');
                                alert('Command copied to clipboard!');
                              }}
                              className="text-[10px] text-orange-400 hover:text-orange-300 mb-2"
                            >
                              Copy Command
                            </button>
                          </div>
                        ) : (
                          <div className={`${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Command display if present in message */}
                    {log.command && log.type !== 'command' && (
                      <div className="ml-8 mt-1 mb-2">
                        <code className="text-green-400 block whitespace-pre-wrap break-all bg-gray-900 dark:bg-black p-2 rounded text-[10px] border border-gray-800">
                          {log.command}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(log.command || '');
                            alert('Command copied to clipboard!');
                          }}
                          className="text-[10px] text-orange-400 hover:text-orange-300 mt-1"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    
                    {index < consoleLogs.length - 1 && (
                      <div className="border-b border-gray-800 my-1"></div>
                    )}
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Progress Section */}
      {isScanning && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">API Discovery in Progress</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 whitespace-pre-wrap">{progressMessage}</p>
            </div>
          </div>
          
          {/* Enhanced Progress Bar with Percentage */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">Scan Progress</span>
              <div className="flex items-center space-x-2">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{progress}%</div>
                <span className="text-xs text-orange-600 dark:text-orange-400">Complete</span>
              </div>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-4 relative overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-orange-600 h-4 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-semibold text-orange-900 dark:text-orange-100">{progress}%</span>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-orange-700 dark:text-orange-300">
              <span>Capturing network traffic...</span>
              <span>{progress >= 100 ? 'Completed!' : 'Processing...'}</span>
            </div>
          </div>

          {/* Abort Button */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => {
                setIsScanning(false);
                setProgress(0);
                setProgressMessage('');
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center space-x-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Abort Scan</span>
            </button>
          </div>
        </div>
      )}

      {/* Results Section */}
      {scanResults && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">API Discovery Results</h2>
            <div className="flex justify-center">
              <button
                onClick={downloadPDF}
                className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all text-lg font-semibold flex items-center space-x-2 shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download API Security Report (PDF)</span>
              </button>
            </div>
          </div>

          {/* Scan Summary - Wireshark Data */}
          {scanResults.capture_data && scanResults.capture_data.summary ? (
            <>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{scanResults.capture_data.summary.total_packets || 0}</div>
                  <div className="text-sm text-orange-800 dark:text-orange-200">Total Packets</div>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{scanResults.capture_data.summary.total_requests || 0}</div>
                  <div className="text-sm text-green-800 dark:text-green-200">Total Requests</div>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{scanResults.capture_data.summary.total_responses || 0}</div>
                  <div className="text-sm text-yellow-800 dark:text-yellow-200">Total Responses</div>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{scanResults.capture_data.summary.unique_endpoints || 0}</div>
                  <div className="text-sm text-purple-800 dark:text-purple-200">Unique Endpoints</div>
                </div>
              </div>
              
              {/* Enhanced Summary Stats */}
              {scanResults.capture_data.summary && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Performance Metrics</h3>
                  <div className="grid md:grid-cols-4 gap-4 mb-4">
                    {scanResults.capture_data.summary.avg_response_time > 0 && (
                      <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                          {(scanResults.capture_data.summary.avg_response_time * 1000).toFixed(2)} ms
                        </div>
                        <div className="text-sm text-indigo-800 dark:text-indigo-200">Avg Response Time</div>
                      </div>
                    )}
                    {scanResults.capture_data.summary.avg_request_size > 0 && (
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                          {(scanResults.capture_data.summary.avg_request_size / 1024).toFixed(2)} KB
                        </div>
                        <div className="text-sm text-purple-800 dark:text-purple-200">Avg Request Size</div>
                      </div>
                    )}
                    {scanResults.capture_data.summary.avg_response_size > 0 && (
                      <div className="p-4 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">
                          {(scanResults.capture_data.summary.avg_response_size / 1024).toFixed(2)} KB
                        </div>
                        <div className="text-sm text-pink-800 dark:text-pink-200">Avg Response Size</div>
                      </div>
                    )}
                    {scanResults.capture_data.summary.matched_pairs > 0 && (
                      <div className="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                        <div className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                          {scanResults.capture_data.summary.matched_pairs}
                        </div>
                        <div className="text-sm text-teal-800 dark:text-teal-200">Matched Pairs</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Status Code Distribution */}
              {scanResults.capture_data.summary.status_codes && Object.keys(scanResults.capture_data.summary.status_codes).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Status Code Distribution</h3>
                  <div className="grid md:grid-cols-5 gap-2">
                    {Object.entries(scanResults.capture_data.summary.status_codes).map(([code, count]) => (
                      <div key={code} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg text-center">
                        <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{code}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{count} responses</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Request Methods */}
              {scanResults.capture_data.summary.methods && Object.keys(scanResults.capture_data.summary.methods).length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Request Methods</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(scanResults.capture_data.summary.methods).map(([method, count]) => (
                      <div key={method} className="px-4 py-2 bg-gray-50 dark:bg-slate-700 rounded-lg">
                        <span className="font-bold text-gray-900 dark:text-gray-100">{method}</span>
                        <span className="text-sm text-gray-600 dark:text-gray-400 ml-2">({count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Fallback for old data structure
            <>
              <div className="grid md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{scanResults.scan_summary?.total_endpoints || 0}</div>
                  <div className="text-sm text-orange-800 dark:text-orange-200">Total Endpoints</div>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">{scanResults.scan_summary?.authenticated_endpoints || 0}</div>
                  <div className="text-sm text-green-800 dark:text-green-200">Authenticated</div>
                </div>
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{scanResults.scan_summary?.public_endpoints || 0}</div>
                  <div className="text-sm text-yellow-800 dark:text-yellow-200">Public</div>
                </div>
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">{scanResults.scan_summary?.high_risk_endpoints || 0}</div>
                  <div className="text-sm text-red-800 dark:text-red-200">High Risk</div>
                </div>
              </div>
            </>
          )}

          {/* Discovered Endpoints - Wireshark Data */}
          {scanResults.capture_data && scanResults.capture_data.endpoints && scanResults.capture_data.endpoints.length > 0 ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Discovered API Endpoints</h3>
              <div className="space-y-3">
                {scanResults.capture_data.endpoints.map((endpoint, index) => (
                  <EndpointCard key={index} endpoint={endpoint} index={index} />
                ))}
              </div>
            </div>
          ) : scanResults.endpoints && scanResults.endpoints.length > 0 ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Discovered API Endpoints</h3>
              <div className="space-y-3">
                {scanResults.endpoints.map((endpoint, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          endpoint.method === 'GET' ? 'bg-green-100 text-green-800' :
                          endpoint.method === 'POST' ? 'bg-orange-100 text-orange-800' :
                          endpoint.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                          endpoint.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {endpoint.method}
                        </span>
                        <span className="font-mono text-sm text-gray-900 dark:text-gray-100">{endpoint.url}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(endpoint.risk_level)}`}>
                          {endpoint.risk_level}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">Status: {endpoint.status}</span>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <div className="grid md:grid-cols-2 gap-2">
                        <div>Authentication: {endpoint.authentication}</div>
                        <div>Data Sensitivity: <span className={`font-medium ${
                          endpoint.data_sensitivity === 'Critical' ? 'text-red-600' :
                          endpoint.data_sensitivity === 'High' ? 'text-orange-600' :
                          endpoint.data_sensitivity === 'Medium' ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>{endpoint.data_sensitivity}</span></div>
                      </div>
                      <div className="mt-2">
                        <div className="text-gray-500 dark:text-gray-400">Business Impact: {endpoint.business_impact}</div>
                      </div>
                      {endpoint.security_issues && endpoint.security_issues.length > 0 && (
                        <div className="mt-2">
                          <span className="text-red-600 dark:text-red-400 font-medium">Security Issues: </span>
                          <span className="text-red-600 dark:text-red-400">{endpoint.security_issues.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Security Findings */}
          {(scanResults.findings && scanResults.findings.length > 0) || 
           (scanResults.capture_data && scanResults.capture_data.summary && 
            scanResults.capture_data.summary.security_findings && 
            scanResults.capture_data.summary.security_findings.length > 0) ? (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Security Findings</h3>
              <div className="space-y-3">
                {(scanResults.capture_data?.summary?.security_findings || scanResults.findings || []).map((finding, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg border-l-4 border-red-500">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{finding.type}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        finding.severity === 'High' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
                        finding.severity === 'Medium' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                        'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                      }`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <strong>Endpoint:</strong> <code className="text-orange-600 dark:text-orange-400">{finding.endpoint}</code>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      <strong>Finding:</strong> {finding.finding || finding.evidence}
                    </p>
                    {finding.recommendation && (
                      <p className="text-sm text-gray-700 dark:text-gray-300 bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                        <strong>Recommendation:</strong> {finding.recommendation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recommendations */}
          {scanResults.recommendations && scanResults.recommendations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Security Recommendations</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                {scanResults.recommendations.map((rec, index) => (
                  <li key={index}>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* JSON Results Display */}
          {scanResults && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Raw JSON Results</h3>
              <div className="bg-gray-900 dark:bg-black rounded-lg border border-gray-700 dark:border-slate-600 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">Complete scan results in JSON format</span>
                  <button
                    onClick={() => {
                      const jsonString = JSON.stringify(scanResults, null, 2);
                      navigator.clipboard.writeText(jsonString);
                      alert('JSON copied to clipboard!');
                    }}
                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm transition-colors"
                  >
                    Copy JSON
                  </button>
                </div>
                <pre className="text-xs text-gray-300 overflow-auto max-h-96 font-mono p-4 bg-black rounded border border-gray-800">
                  {JSON.stringify(scanResults, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default APIScanner;
