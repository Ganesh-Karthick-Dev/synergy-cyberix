import { useState, useEffect, useRef, useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import { useGlobalScanState } from '../context/GlobalScanContext'
import { getSecurePassword } from '../utils/securePasswordStorage'
import HelpDialog from './dialogs/HelpDialog'
import { getAISuggestions } from '../utils/grokApi'

// Component to format and display parsed tgpt JSON results
const ParsedResultsDisplay = ({ jsonData, title, icon }) => {
  // Handle string data (raw output)
  if (typeof jsonData === 'string') {
    // Format raw output into structured display
    const formattedData = {
      whatWeDid: `Analysis performed for ${title || 'scan'}`,
      whatWeGot: 'Raw output from security scan',
      summary: {
        outputLength: jsonData.length,
        lines: jsonData.split('\n').length
      },
      findings: jsonData.split('\n')
        .filter(line => line.trim().length > 0)
        .map((line, idx) => ({
          type: 'info',
          finding: line.trim(),
          description: `Line ${idx + 1}`,
          id: `line-${idx + 1}`,
          severity: 'INFO',
          ip: '',
          port: ''
        })),
      recommendations: []
    }
    return <ParsedResultsDisplayContent jsonData={formattedData} title={title} icon={icon} rawData={jsonData} />
  }
  
  if (!jsonData || typeof jsonData !== 'object') {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400">
        No data available to display
      </div>
    )
  }

  // Check if this is a tgpt parsed result structure
  const hasTgptStructure = jsonData.whatWeDid || jsonData.whatWeGot || jsonData.summary || jsonData.findings || jsonData.recommendations

  // If not tgpt structure, check if it's testssl.sh JSON structure (array of scanResult items)
  if (!hasTgptStructure) {
    // Check if it's testssl.sh structure with scanResult array
    if (Array.isArray(jsonData.scanResult) && jsonData.scanResult.length > 0) {
      // Format testssl.sh results into structured display
      const formattedData = {
        whatWeDid: `SSL/TLS security analysis performed using testssl.sh`,
        whatWeGot: `Analyzed ${jsonData.scanResult.length} security checks and configurations`,
        summary: {
          totalChecks: jsonData.scanResult.length,
          target: jsonData.scanResult[0]?.ip || jsonData.target || 'Unknown',
          port: jsonData.scanResult[0]?.port || '443'
        },
        findings: jsonData.scanResult.map((item, idx) => {
          // Debug: Log the actual item structure to understand what we're working with
          if (idx === 0) {
            console.log('[ParsedResultsDisplay] First item structure:', item)
            console.log('[ParsedResultsDisplay] Item keys:', Object.keys(item || {}))
          }
          
          // Extract actual values from the item object - handle both direct properties and nested structures
          let itemId = ''
          let itemFinding = ''
          let itemSeverity = 'INFO'
          let itemIp = ''
          let itemPort = '443'
          
          // Handle item as object with properties
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            // Extract ID - get the actual string value
            // testssl.sh typically uses 'id' as the property name
            const rawId = item.id || item.ID || item.Id || item.testId || item.test_id || item.name || item.Name
            if (rawId !== undefined && rawId !== null) {
              // If it's a string, use it directly; if it's an object, try to extract a meaningful value
              if (typeof rawId === 'string') {
                itemId = rawId.trim()
              } else if (typeof rawId === 'object') {
                // If ID is an object, try to find a string property
                itemId = rawId.value || rawId.name || rawId.id || String(rawId)
              } else {
                itemId = String(rawId).trim()
              }
            } else {
              // If no ID found, try to use the first string property as ID
              for (const [key, value] of Object.entries(item)) {
                if (typeof value === 'string' && value.length > 0 && 
                    !key.toLowerCase().includes('ip') && 
                    !key.toLowerCase().includes('port') && 
                    !key.toLowerCase().includes('severity') &&
                    !key.toLowerCase().includes('finding') &&
                    !key.toLowerCase().includes('result')) {
                  itemId = value
                  break
                }
              }
              if (!itemId) {
                itemId = `item-${idx}`
              }
            }
            
            // Ensure itemId is a clean string, not a JSON string
            if (itemId && (itemId.startsWith('{') || itemId.startsWith('['))) {
              try {
                const parsed = JSON.parse(itemId)
                itemId = parsed.id || parsed.ID || parsed.name || String(parsed)
              } catch (e) {
                // If parsing fails, try to extract ID from string
                const idMatch = itemId.match(/"id"\s*:\s*"([^"]+)"/)
                if (idMatch) {
                  itemId = idMatch[1]
                }
              }
            }
            
            // Extract Finding - prioritize string values, handle objects intelligently
            // First, try to get finding from common property names
            let rawFinding = item.finding || item.Finding || item.message || item.Message || 
                            item.result || item.Result || item.description || item.Description || 
                            item.value || item.Value || item.status || item.Status || 
                            item.text || item.Text || item.output || item.Output
            
            // If no finding property found, look for other string properties in the item
            if (!rawFinding && item && typeof item === 'object') {
              // Look for any string property that might be the finding
              for (const [key, value] of Object.entries(item)) {
                if (typeof value === 'string' && value.length > 0 && 
                    key !== 'id' && key !== 'ip' && key !== 'port' && key !== 'severity' &&
                    !key.toLowerCase().includes('object') && !key.toLowerCase().includes('property') &&
                    !key.toLowerCase().includes('target') && !key.toLowerCase().includes('host') &&
                    !key.toLowerCase().includes('server') && !key.toLowerCase().includes('scan')) {
                  rawFinding = value
                  break
                }
              }
            }
            
            if (rawFinding !== undefined && rawFinding !== null) {
              if (typeof rawFinding === 'string') {
                itemFinding = rawFinding.trim()
              } else if (typeof rawFinding === 'object' && !Array.isArray(rawFinding)) {
                // If finding is an object, try to extract meaningful string values
                const findingObj = rawFinding
                // Try common property names first
                itemFinding = findingObj.message || findingObj.text || findingObj.value || 
                             findingObj.description || findingObj.result || findingObj.status ||
                             findingObj.finding || findingObj.output || findingObj.name ||
                             findingObj.title || findingObj.summary || findingObj.details ||
                             findingObj.info || findingObj.note || findingObj.comment
                
                // If still no string found, look for any string property in the object
                if (!itemFinding || itemFinding === '') {
                  for (const [key, value] of Object.entries(findingObj)) {
                    if (typeof value === 'string' && value.length > 0 && 
                        !key.toLowerCase().includes('id') && 
                        !key.toLowerCase().includes('ip') && 
                        !key.toLowerCase().includes('port') &&
                        !key.toLowerCase().includes('severity')) {
                      itemFinding = value
                      break
                    }
                  }
                }
                
                // If still no string found, create a readable summary from the object
                if (!itemFinding || itemFinding === '') {
                  const stringEntries = Object.entries(findingObj)
                    .filter(([k, v]) => typeof v === 'string' && v.length > 0 && 
                            !k.toLowerCase().includes('id') && 
                            !k.toLowerCase().includes('ip') && 
                            !k.toLowerCase().includes('port'))
                  
                  if (stringEntries.length > 0) {
                    itemFinding = stringEntries.map(([k, v]) => `${k}: ${v}`).join(', ')
                  } else {
                    // Last resort: use the ID as the finding if available
                    itemFinding = itemId && itemId !== `item-${idx}` ? `Check: ${itemId}` : 'No finding available'
                  }
                }
              } else if (Array.isArray(rawFinding)) {
                itemFinding = rawFinding
                  .filter(v => typeof v === 'string' && v.length > 0)
                  .map(v => v.trim())
                  .join(', ') || 'No finding available'
              } else {
                itemFinding = String(rawFinding).trim()
              }
            } else {
              // If no finding property found, use the ID as a fallback
              itemFinding = itemId && itemId !== `item-${idx}` ? `Check: ${itemId}` : 'No finding available'
            }
            
            // Extract Severity - get the actual string value
            const rawSeverity = item.severity || item.Severity || item.severityLevel || 
                               item.SeverityLevel || item.level || item.Level || 
                               item.risk || item.Risk || item.status || item.Status
            if (rawSeverity !== undefined && rawSeverity !== null) {
              itemSeverity = typeof rawSeverity === 'string' ? rawSeverity.trim() : String(rawSeverity).trim()
            } else {
              itemSeverity = 'INFO'
            }
            
            // Extract IP - get the actual string value
            const rawIp = item.ip || item.IP || item.target || item.Target || 
                         item.host || item.Host || item.server || item.Server ||
                         item.ipAddress || item.ip_address || item.ipAddr
            if (rawIp !== undefined && rawIp !== null) {
              itemIp = typeof rawIp === 'string' ? rawIp.trim() : String(rawIp).trim()
            } else {
              itemIp = ''
            }
            
            // Extract Port - get the actual string value
            const rawPort = item.port || item.Port || item.portNumber || item.PortNumber || 
                           item.port_number || item.portNum
            if (rawPort !== undefined && rawPort !== null) {
              itemPort = typeof rawPort === 'string' ? rawPort.trim() : String(rawPort).trim()
            } else {
              itemPort = '443'
            }
          } else if (typeof item === 'string') {
            // If item is a string, use it as the finding
            itemFinding = item.trim()
            itemId = `item-${idx}`
          }
          
          // Final cleanup - ensure all values are clean strings
          itemId = String(itemId).trim()
          itemFinding = String(itemFinding).trim()
          itemSeverity = String(itemSeverity).trim().toUpperCase()
          itemIp = String(itemIp).trim()
          itemPort = String(itemPort).trim()
          
          // Remove quotes from ID if it's wrapped in quotes
          if (itemId.startsWith('"') && itemId.endsWith('"')) {
            itemId = itemId.slice(1, -1)
          }
          
          // Remove quotes from Finding if it's wrapped in quotes
          if (itemFinding.startsWith('"') && itemFinding.endsWith('"')) {
            itemFinding = itemFinding.slice(1, -1)
          }
          
          // If finding is still empty or looks like an object description, try one more extraction
          if (!itemFinding || itemFinding === 'No finding available' || 
              itemFinding.includes('Object with') || itemFinding.includes('properties')) {
            if (item && typeof item === 'object') {
              // Look for any string property that might be the finding
              const stringProps = Object.entries(item)
                .filter(([k, v]) => typeof v === 'string' && v.length > 0 && 
                        !k.toLowerCase().includes('id') && 
                        !k.toLowerCase().includes('ip') && 
                        !k.toLowerCase().includes('port') && 
                        !k.toLowerCase().includes('severity') &&
                        !k.toLowerCase().includes('object') && 
                        !k.toLowerCase().includes('property'))
                .map(([k, v]) => v)
              
              if (stringProps.length > 0) {
                itemFinding = stringProps[0] // Use the first meaningful string property
              }
            }
          }
          
          // Determine finding type based on severity
          const severity = itemSeverity.toLowerCase()
          const findingType = severity === 'ok' || severity === 'pass' || severity === 'yes' ? 'info' : 
                             severity === 'warn' || severity === 'warning' || severity === 'medium' ? 'medium' :
                             severity === 'critical' || severity === 'high' || severity === 'fail' || severity === 'no' ? 'high' : 'info'
          
          // Final validation - ensure all values are clean strings, not objects
          const cleanId = typeof itemId === 'string' ? itemId : 
                         itemId && typeof itemId === 'object' ? (itemId.id || itemId.value || itemId.name || String(itemId)) :
                         String(itemId || `item-${idx}`)
          
          const cleanFinding = typeof itemFinding === 'string' ? itemFinding : 
                              itemFinding && typeof itemFinding === 'object' ? (itemFinding.message || itemFinding.text || itemFinding.value || String(itemFinding)) :
                              String(itemFinding || 'No finding available')
          
          const cleanSeverity = typeof itemSeverity === 'string' ? itemSeverity : String(itemSeverity || 'INFO')
          const cleanIp = typeof itemIp === 'string' ? itemIp : String(itemIp || '')
          const cleanPort = typeof itemPort === 'string' ? itemPort : String(itemPort || '443')
          
          // Remove any JSON-like prefixes from cleanId
          let finalId = cleanId.trim()
          if (finalId.startsWith('{') || finalId.startsWith('[')) {
            try {
              const parsed = JSON.parse(finalId)
              finalId = parsed.id || parsed.ID || parsed.name || String(parsed)
            } catch (e) {
              const idMatch = finalId.match(/"id"\s*:\s*"([^"]+)"/)
              if (idMatch) {
                finalId = idMatch[1]
              } else {
                const stringMatch = finalId.match(/"([^"]+)"/)
                if (stringMatch) {
                  finalId = stringMatch[1]
                }
              }
            }
          }
          
          // Remove any JSON-like prefixes from cleanFinding
          let finalFinding = cleanFinding.trim()
          if (finalFinding.startsWith('{') || finalFinding.startsWith('[')) {
            try {
              const parsed = JSON.parse(finalFinding)
              finalFinding = parsed.finding || parsed.message || parsed.text || String(parsed)
            } catch (e) {
              const findingMatch = finalFinding.match(/"finding"\s*:\s*"([^"]+)"/)
              if (findingMatch) {
                finalFinding = findingMatch[1]
              }
            }
          }
          
          // If finding still looks like "Object with X properties", try to extract from item directly
          if (finalFinding.includes('Object with') || finalFinding.includes('properties')) {
            if (item && typeof item === 'object') {
              for (const [key, value] of Object.entries(item)) {
                if (typeof value === 'string' && value.length > 0 && 
                    key !== 'id' && key !== 'ip' && key !== 'port' && key !== 'severity' &&
                    !key.toLowerCase().includes('object') && !key.toLowerCase().includes('property')) {
                  finalFinding = value
                  break
                }
              }
            }
          }
          
          return {
            type: findingType,
            finding: finalFinding || 'No finding available',
            description: finalId,
            severity: cleanSeverity.trim().toUpperCase(),
            id: finalId,
            ip: cleanIp.trim(),
            port: cleanPort.trim()
          }
        }),
        recommendations: []
      }

      // Extract certificate info, protocols, vulnerabilities
      const certificateInfo = jsonData.scanResult.find(item => 
        item.id && (item.id.toLowerCase().includes('certificate') || item.id.toLowerCase().includes('cert'))
      )
      const protocols = jsonData.scanResult.filter(item => 
        item.id && (item.id.toLowerCase().includes('tls') || item.id.toLowerCase().includes('ssl') || item.id.toLowerCase().includes('protocol'))
      )
      const vulnerabilities = jsonData.scanResult.filter(item => 
        item.severity && (item.severity === 'WARN' || item.severity === 'CRITICAL' || item.severity === 'HIGH')
      )

      if (certificateInfo) {
        formattedData.summary.certificate = certificateInfo.finding || 'Certificate information available'
      }
      if (protocols.length > 0) {
        formattedData.summary.protocols = protocols.length
      }
      if (vulnerabilities.length > 0) {
        formattedData.summary.vulnerabilities = vulnerabilities.length
      }

      // Use the formatted data
      return <ParsedResultsDisplayContent jsonData={formattedData} title={title} icon={icon} rawData={jsonData} />
    }

    // Format other JSON structures into a structured display
    const formattedData = {
      whatWeDid: `Analyzed ${title || 'scan results'}`,
      whatWeGot: 'Raw scan data has been processed and displayed below',
      summary: {},
      findings: [],
      recommendations: []
    }

    // Extract summary from top-level properties
    if (jsonData.target || jsonData.scanTarget || jsonData.ip) {
      formattedData.summary.target = jsonData.target || jsonData.scanTarget || jsonData.ip
    }
    if (jsonData.scanTime || jsonData.timestamp) {
      formattedData.summary.scanTime = jsonData.scanTime || jsonData.timestamp
    }

    // Convert all properties to findings
    Object.entries(jsonData).forEach(([key, value]) => {
      if (key === 'target' || key === 'scanTarget' || key === 'ip' || key === 'scanTime' || key === 'timestamp') {
        return // Skip these as they're in summary
      }
      
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          formattedData.findings.push({
            type: 'info',
            finding: `${key}: ${String(value)}`,
            description: `Property: ${key}`
          })
        } else if (Array.isArray(value)) {
          formattedData.findings.push({
            type: 'info',
            finding: `${key}: Array with ${value.length} items`,
            description: JSON.stringify(value, null, 2)
          })
        } else if (typeof value === 'object') {
          formattedData.findings.push({
            type: 'info',
            finding: `${key}: Object with ${Object.keys(value).length} properties`,
            description: JSON.stringify(value, null, 2)
          })
        }
      }
    })

    // Use the formatted data
    return <ParsedResultsDisplayContent jsonData={formattedData} title={title} icon={icon} rawData={jsonData} />
  }

  return <ParsedResultsDisplayContent jsonData={jsonData} title={title} icon={icon} rawData={jsonData} />
}

// Internal component to display the structured content
const ParsedResultsDisplayContent = ({ jsonData, title, icon, rawData }) => {

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3 mb-4">
          {icon && (
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              {icon}
            </div>
          )}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title || 'Analysis Results'}</h3>
            {jsonData.whatWeDid && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{jsonData.whatWeDid}</p>
            )}
          </div>
        </div>
        {jsonData.whatWeGot && (
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{jsonData.whatWeGot}</p>
        )}
        {/* Show summary properties if available */}
        {jsonData.summary && typeof jsonData.summary === 'object' && Object.keys(jsonData.summary).length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(jsonData.summary).map(([key, value]) => (
              <div key={key} className="p-2 bg-white dark:bg-slate-700 rounded-lg">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {typeof value === 'string' && (value.includes('T') || value.includes('-')) && value.length > 10
                    ? new Date(value).toLocaleString()
                    : String(value)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary Statistics */}
      {jsonData.summary && typeof jsonData.summary === 'object' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Summary
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(jsonData.summary).map(([key, value]) => (
              <div key={key} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{typeof value === 'number' ? value.toLocaleString() : String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Findings - Grid Card Format for SSL/TLS */}
      {jsonData.findings && Array.isArray(jsonData.findings) && jsonData.findings.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Findings ({jsonData.findings.length} items)
          </h4>
          
          {/* Grid Card Format */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jsonData.findings.map((finding, idx) => {
                  // Debug: Log the first finding to understand the structure
                  if (idx === 0) {
                    console.log('[ParsedResultsDisplay] First finding structure:', finding)
                    console.log('[ParsedResultsDisplay] Finding keys:', Object.keys(finding || {}))
                  }
                  
                  // Extract actual values - ensure they're strings, not objects
                  // Handle both direct properties and ensure we get the actual values
                  let findingType = 'info'
                  let findingMessage = ''
                  let severity = 'INFO'
                  let findingId = ''
                  let findingIp = ''
                  let findingPort = ''
                  
                  // Extract values from finding object
                  if (finding && typeof finding === 'object' && !Array.isArray(finding)) {
                    // Extract ID - get the actual string value, handle objects
                    const rawId = finding.id || finding.ID || finding.Id || finding.testId || finding.description
                    if (rawId !== undefined && rawId !== null) {
                      if (typeof rawId === 'string') {
                        findingId = rawId.trim()
                      } else if (typeof rawId === 'object') {
                        findingId = rawId.value || rawId.name || rawId.id || String(rawId)
                      } else {
                        findingId = String(rawId).trim()
                      }
                    } else {
                      findingId = `item-${idx}`
                    }
                    
                    // Extract Finding message - get the actual string value, handle objects
                    const rawFinding = finding.finding || finding.Finding || finding.message || finding.Message ||
                                     finding.result || finding.Result || finding.description || finding.Description ||
                                     finding.value || finding.Value || finding.status || finding.Status ||
                                     finding.text || finding.Text || finding.output || finding.Output
                    if (rawFinding !== undefined && rawFinding !== null) {
                      if (typeof rawFinding === 'string') {
                        findingMessage = rawFinding.trim()
                      } else if (typeof rawFinding === 'object' && !Array.isArray(rawFinding)) {
                        // If finding is an object, extract meaningful string values
                        findingMessage = rawFinding.message || rawFinding.text || rawFinding.value ||
                                       rawFinding.description || rawFinding.result || rawFinding.status ||
                                       rawFinding.finding || rawFinding.output || rawFinding.name ||
                                       Object.entries(rawFinding)
                                         .filter(([k, v]) => typeof v === 'string' && v.length > 0)
                                         .map(([k, v]) => v)[0] || 'No finding available'
                      } else if (Array.isArray(rawFinding)) {
                        findingMessage = rawFinding.filter(v => typeof v === 'string').join(', ') || 'No finding available'
                      } else {
                        findingMessage = String(rawFinding).trim()
                      }
                    } else {
                      findingMessage = 'No finding available'
                    }
                    
                    // Extract Severity - get the actual string value
                    const rawSeverity = finding.severity || finding.Severity || finding.type
                    if (rawSeverity !== undefined && rawSeverity !== null) {
                      severity = typeof rawSeverity === 'string' ? rawSeverity.trim().toUpperCase() : String(rawSeverity).trim().toUpperCase()
                    } else {
                      severity = 'INFO'
                    }
                    
                    // Extract IP - get the actual string value
                    const rawIp = finding.ip || finding.IP || finding.target || finding.Target || finding.host
                    if (rawIp !== undefined && rawIp !== null) {
                      findingIp = typeof rawIp === 'string' ? rawIp.trim() : String(rawIp).trim()
                    } else {
                      findingIp = ''
                    }
                    
                    // Extract Port - get the actual string value
                    const rawPort = finding.port || finding.Port || finding.portNumber
                    if (rawPort !== undefined && rawPort !== null) {
                      findingPort = typeof rawPort === 'string' ? rawPort.trim() : String(rawPort).trim()
                    } else {
                      findingPort = '443'
                    }
                  } else if (typeof finding === 'string') {
                    // If finding is a string, use it as the message
                    findingMessage = finding.trim()
                    findingId = `item-${idx}`
                  } else {
                    // If finding is not an object or string, convert to string
                    findingMessage = String(finding)
                    findingId = `item-${idx}`
                  }
                  
                  // Final cleanup - ensure all values are clean strings
                  findingId = String(findingId).trim()
                  findingMessage = String(findingMessage).trim()
                  severity = String(severity).trim().toUpperCase()
                  findingIp = String(findingIp).trim()
                  findingPort = String(findingPort).trim()
                  
                  // Remove quotes from ID if wrapped in quotes
                  if (findingId.startsWith('"') && findingId.endsWith('"')) {
                    findingId = findingId.slice(1, -1)
                  }
                  
                  // Remove JSON-like prefixes from ID if present
                  if (findingId.startsWith('{') || findingId.startsWith('[')) {
                    try {
                      const parsed = JSON.parse(findingId)
                      findingId = parsed.id || parsed.ID || parsed.name || String(parsed)
                    } catch (e) {
                      // If parsing fails, try to extract ID from string
                      const idMatch = findingId.match(/"id"\s*:\s*"([^"]+)"/)
                      if (idMatch) {
                        findingId = idMatch[1]
                      } else {
                        // If still looks like JSON, try to extract any string value
                        const stringMatch = findingId.match(/"([^"]+)"/)
                        if (stringMatch) {
                          findingId = stringMatch[1]
                        }
                      }
                    }
                  }
                  
                  // Remove JSON-like prefixes from Finding if present
                  if (findingMessage.startsWith('{') || findingMessage.startsWith('[')) {
                    try {
                      const parsed = JSON.parse(findingMessage)
                      findingMessage = parsed.finding || parsed.message || parsed.text || String(parsed)
                    } catch (e) {
                      // If parsing fails, try to extract finding from string
                      const findingMatch = findingMessage.match(/"finding"\s*:\s*"([^"]+)"/)
                      if (findingMatch) {
                        findingMessage = findingMatch[1]
                      }
                    }
                  }
                  
                  // If finding message still looks like "Object with X properties", try to extract from finding object
                  if (findingMessage.includes('Object with') || findingMessage.includes('properties')) {
                    if (finding && typeof finding === 'object') {
                      // Look for any string property that might be the finding
                      for (const [key, value] of Object.entries(finding)) {
                        if (typeof value === 'string' && value.length > 0 && 
                            key !== 'id' && key !== 'ip' && key !== 'port' && key !== 'severity' &&
                            !key.toLowerCase().includes('object') && !key.toLowerCase().includes('property')) {
                          findingMessage = value
                          break
                        }
                      }
                    }
                  }
                  
                  // Determine finding type from severity
                  const severityLower = severity.toLowerCase()
                  findingType = severityLower === 'critical' || severityLower === 'high' ? 'high' :
                               severityLower === 'warn' || severityLower === 'warning' || severityLower === 'medium' ? 'medium' :
                               severityLower === 'low' ? 'low' : 'info'
                  
                  // Format IP/Port
                  const ipPort = findingIp && findingPort && findingPort !== '443' ? `${findingIp}:${findingPort}` : 
                               findingIp ? findingIp : 
                               findingPort && findingPort !== '443' ? `:${findingPort}` : 
                               findingIp || findingPort ? `${findingIp || ''}:${findingPort || '443'}` : 
                               '-'
                  
                  const rowBgColor = findingType === 'critical' || findingType === 'high' ? 'bg-red-50 dark:bg-red-900/10' :
                                    findingType === 'medium' || findingType === 'warn' || findingType === 'warning' ? 'bg-yellow-50 dark:bg-yellow-900/10' :
                                    findingType === 'low' ? 'bg-blue-50 dark:bg-blue-900/10' :
                                    'bg-green-50 dark:bg-green-900/10'
                  
                  const severityColor = severity === 'CRITICAL' || severity === 'HIGH' ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400' :
                                       severity === 'WARN' || severity === 'WARNING' || severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                       severity === 'LOW' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                                       'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                  
                  return (
                    <div key={idx} className={`border rounded-lg p-4 ${rowBgColor} hover:shadow-md transition-all`}>
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">#{idx + 1}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${severityColor}`}>
                              {severity}
                            </span>
                          </div>
                          <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                            {findingId || `Finding ${idx + 1}`}
                          </h5>
                        </div>
                      </div>
                      
                      {/* Card Body */}
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Finding:</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100 break-words" title={findingMessage}>
                            {findingMessage}
                          </p>
                        </div>
                        
                        {ipPort && ipPort !== '-' && (
                          <div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IP/Port:</p>
                            <p className="text-xs font-mono text-gray-700 dark:text-gray-300" title={ipPort}>
                              {ipPort}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {jsonData.recommendations && Array.isArray(jsonData.recommendations) && jsonData.recommendations.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recommendations
          </h4>
          <ul className="space-y-2">
            {jsonData.recommendations.map((recommendation, idx) => (
              <li key={idx} className="flex items-start space-x-3 p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <span className="text-green-500 mt-1 flex-shrink-0">•</span>
                <span className="text-sm text-gray-900 dark:text-gray-100">{String(recommendation)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Raw JSON (Collapsible) */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
        <details>
          <summary className="text-md font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Raw JSON Data
          </summary>
          <div className="px-6 pb-6">
            <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(rawData || jsonData, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  )
}

// Component to format and display SSL/TLS JSON results
const SSLResultsDisplay = ({ jsonData }) => {
  if (!jsonData || typeof jsonData !== 'object') {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-400">
        No data available to display
      </div>
    )
  }

  // Helper function to get severity badge
  const getSeverityBadge = (severity) => {
    const severityLower = (severity || '').toLowerCase()
    if (severityLower.includes('critical') || severityLower.includes('high')) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">HIGH</span>
    } else if (severityLower.includes('medium') || severityLower.includes('moderate')) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">MEDIUM</span>
    } else if (severityLower.includes('low') || severityLower.includes('info')) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">LOW</span>
    } else {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">OK</span>
    }
  }

  // Helper function to get status badge
  const getStatusBadge = (status) => {
    const statusLower = (status || '').toLowerCase()
    if (statusLower === 'ok' || statusLower === 'yes' || statusLower === 'supported' || statusLower === 'enabled') {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">✓ OK</span>
    } else if (statusLower === 'not ok' || statusLower === 'no' || statusLower === 'not supported' || statusLower === 'disabled') {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">✗ NOT OK</span>
    } else {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">⚠ WARNING</span>
    }
  }

  // Extract key information from testssl.sh JSON structure
  const extractKeyInfo = (data) => {
    const info = {
      target: data.target || data.scanTarget || data.ip || '',
      scanTime: data.scanTime || data.timestamp || new Date().toISOString(),
      certificate: {},
      protocols: [],
      ciphers: [],
      vulnerabilities: [],
      features: {},
      findings: []
    }

    // Handle different JSON structures from testssl.sh
    // Structure 1: Array of scanResult items
    if (Array.isArray(data.scanResult)) {
      data.scanResult.forEach((item) => {
        if (!item || !item.id) return

        const id = item.id.toLowerCase()
        const finding = item.finding || item.severity || ''
        const severity = item.severity || 'info'

        // Certificate information
        if (id.includes('certificate') || id.includes('cert')) {
          if (id.includes('commonname') || id.includes('cn') || id.includes('common_name')) {
            info.certificate.commonName = finding || item.finding || ''
          } else if (id.includes('issuer')) {
            info.certificate.issuer = finding || item.finding || ''
          } else if (id.includes('validity') || id.includes('notafter') || id.includes('not_after')) {
            info.certificate.validity = finding || item.finding || ''
          } else if (id.includes('signature')) {
            info.certificate.signature = finding || item.finding || ''
          }
        }

        // Protocol support
        if (id.includes('protocol') || id.includes('tls') || id.includes('ssl')) {
          if (id.includes('tls1.3') || id.includes('tls_1_3') || id.includes('tls1_3')) {
            info.protocols.push({ name: 'TLS 1.3', status: finding, severity })
          } else if (id.includes('tls1.2') || id.includes('tls_1_2') || id.includes('tls1_2')) {
            info.protocols.push({ name: 'TLS 1.2', status: finding, severity })
          } else if (id.includes('tls1.1') || id.includes('tls_1_1') || id.includes('tls1_1')) {
            info.protocols.push({ name: 'TLS 1.1', status: finding, severity })
          } else if (id.includes('tls1.0') || id.includes('tls_1_0') || id.includes('tls1_0')) {
            info.protocols.push({ name: 'TLS 1.0', status: finding, severity })
          } else if (id.includes('ssl3') || id.includes('ssl_3') || id.includes('ssl3_0')) {
            info.protocols.push({ name: 'SSL 3.0', status: finding, severity })
          } else if (id.includes('ssl2') || id.includes('ssl_2') || id.includes('ssl2_0')) {
            info.protocols.push({ name: 'SSL 2.0', status: finding, severity })
          }
        }

        // Cipher suites
        if (id.includes('cipher') || id.includes('cipherlist') || id.includes('cipher_suite')) {
          info.ciphers.push({ name: item.id, finding, severity })
        }

        // Vulnerabilities
        if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM' || 
            id.includes('vulnerability') || id.includes('weak') || id.includes('deprecated') ||
            id.includes('vuln') || id.includes('issue')) {
          info.vulnerabilities.push({ id: item.id, finding, severity })
        }

        // Security features
        if (id.includes('hsts')) {
          info.features.hsts = { status: finding, severity }
        } else if (id.includes('hpkp') || id.includes('pinning')) {
          info.features.hpkp = { status: finding, severity }
        } else if (id.includes('ocsp')) {
          info.features.ocsp = { status: finding, severity }
        } else if (id.includes('cbc')) {
          info.features.cbc = { status: finding, severity }
        }

        // General findings - add all items as findings
        if (finding && finding.trim()) {
          info.findings.push({ id: item.id, finding, severity })
        } else if (item.finding) {
          info.findings.push({ id: item.id, finding: item.finding, severity })
        }
      })
    }

    // Structure 2: Direct properties (fallback)
    if (data.certificate) {
      if (typeof data.certificate === 'object') {
        info.certificate = { ...info.certificate, ...data.certificate }
      }
    }
    
    // If we have no findings from scanResult, try to extract from top-level
    // Also handle if scanResult is an object instead of array
    if (data.scanResult && typeof data.scanResult === 'object' && !Array.isArray(data.scanResult)) {
      // Handle object structure
      Object.entries(data.scanResult).forEach(([key, value]) => {
        if (value && typeof value === 'object' && value.id) {
          const item = value
          const id = item.id.toLowerCase()
          const finding = item.finding || item.severity || ''
          const severity = item.severity || 'info'
          
          // Process similar to array structure
          if (id.includes('certificate') || id.includes('cert')) {
            if (id.includes('commonname') || id.includes('cn') || id.includes('common_name')) {
              info.certificate.commonName = finding || item.finding || ''
            } else if (id.includes('issuer')) {
              info.certificate.issuer = finding || item.finding || ''
            } else if (id.includes('validity') || id.includes('notafter') || id.includes('not_after')) {
              info.certificate.validity = finding || item.finding || ''
            } else if (id.includes('signature')) {
              info.certificate.signature = finding || item.finding || ''
            }
          }
          
          if (finding && finding.trim()) {
            info.findings.push({ id: item.id, finding, severity })
          }
        }
      })
    }
    
    // If still no findings, try to extract from top-level properties
    if (info.findings.length === 0 && Object.keys(data).length > 0) {
      // Add all top-level properties as findings if they have meaningful values
      Object.entries(data).forEach(([key, value]) => {
        if (key !== 'scanResult' && key !== 'target' && key !== 'scanTime' && key !== 'timestamp' && 
            value !== null && value !== undefined && value !== '') {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            info.findings.push({ id: key, finding: String(value), severity: 'info' })
          } else if (typeof value === 'object' && !Array.isArray(value)) {
            // For nested objects, add them as findings with JSON string
            info.findings.push({ id: key, finding: JSON.stringify(value, null, 2), severity: 'info' })
          }
        }
      })
    }

    return info
  }

  const keyInfo = extractKeyInfo(jsonData)

  // Debug: Log the structure to help understand the data
  console.log('[SSLResultsDisplay] JSON Data:', jsonData)
  console.log('[SSLResultsDisplay] Extracted Info:', keyInfo)

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">SSL/TLS Security Analysis</h3>
            {keyInfo.target && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Target: {keyInfo.target}</p>
            )}
            {keyInfo.scanTime && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Scan Time: {new Date(keyInfo.scanTime).toLocaleString()}</p>
            )}
          </div>
        </div>
      </div>

      {/* Always show structured JSON display - no warning */}
      {/* If no structured data found, show all JSON properties in a structured way */}
      {keyInfo.findings.length === 0 && keyInfo.protocols.length === 0 && keyInfo.vulnerabilities.length === 0 && Object.keys(keyInfo.certificate).length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Scan Results
          </h4>
          <div className="space-y-4">
            {Object.entries(jsonData).map(([key, value]) => {
              if (key === 'scanResult' || key === 'target' || key === 'scanTime' || key === 'timestamp') return null
              if (value === null || value === undefined || value === '') return null
              
              return (
                <div key={key} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  {typeof value === 'object' && !Array.isArray(value) ? (
                    <div className="space-y-2">
                      {Object.entries(value).map(([subKey, subValue]) => (
                        <div key={subKey} className="pl-4 border-l-2 border-gray-300 dark:border-slate-600">
                          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 capitalize">
                            {subKey.replace(/([A-Z])/g, ' $1').trim()}
                          </p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {typeof subValue === 'object' ? JSON.stringify(subValue, null, 2) : String(subValue)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : Array.isArray(value) ? (
                    <div className="space-y-2">
                      {value.map((item, idx) => (
                        <div key={idx} className="pl-4 border-l-2 border-gray-300 dark:border-slate-600">
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {typeof item === 'object' ? JSON.stringify(item, null, 2) : String(item)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-gray-100">{String(value)}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Certificate Information */}
      {Object.keys(keyInfo.certificate).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Certificate Information
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keyInfo.certificate.commonName && (
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Common Name</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{keyInfo.certificate.commonName}</p>
              </div>
            )}
            {keyInfo.certificate.issuer && (
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Issuer</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{keyInfo.certificate.issuer}</p>
              </div>
            )}
            {keyInfo.certificate.validity && (
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Validity</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{keyInfo.certificate.validity}</p>
              </div>
            )}
            {keyInfo.certificate.signature && (
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Signature Algorithm</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{keyInfo.certificate.signature}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Protocol Support */}
      {keyInfo.protocols.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Protocol Support
          </h4>
          <div className="space-y-3">
            {keyInfo.protocols.map((protocol, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{protocol.name}</p>
                  {protocol.status && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{protocol.status}</p>
                  )}
                </div>
                <div className="ml-4">
                  {getStatusBadge(protocol.status)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vulnerabilities */}
      {keyInfo.vulnerabilities.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Vulnerabilities & Issues
          </h4>
          <div className="space-y-3">
            {keyInfo.vulnerabilities.slice(0, 20).map((vuln, idx) => (
              <div key={idx} className="p-4 rounded-lg border-l-4 bg-gray-50 dark:bg-slate-700 border-red-400">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{vuln.id}</p>
                    {vuln.finding && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{vuln.finding}</p>
                    )}
                  </div>
                  <div className="ml-4">
                    {getSeverityBadge(vuln.severity)}
                  </div>
                </div>
              </div>
            ))}
            {keyInfo.vulnerabilities.length > 20 && (
              <p className="text-xs text-gray-500 dark:text-gray-500 text-center mt-2">
                ... and {keyInfo.vulnerabilities.length - 20} more issues
              </p>
            )}
          </div>
        </div>
      )}

      {/* Security Features */}
      {Object.keys(keyInfo.features).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Security Features
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keyInfo.features.hsts && (
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">HSTS (HTTP Strict Transport Security)</p>
                  {getStatusBadge(keyInfo.features.hsts.status)}
                </div>
                {keyInfo.features.hsts.status && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{keyInfo.features.hsts.status}</p>
                )}
              </div>
            )}
            {keyInfo.features.hpkp && (
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">HPKP (HTTP Public Key Pinning)</p>
                  {getStatusBadge(keyInfo.features.hpkp.status)}
                </div>
                {keyInfo.features.hpkp.status && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{keyInfo.features.hpkp.status}</p>
                )}
              </div>
            )}
            {keyInfo.features.ocsp && (
              <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">OCSP Stapling</p>
                  {getStatusBadge(keyInfo.features.ocsp.status)}
                </div>
                {keyInfo.features.ocsp.status && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">{keyInfo.features.ocsp.status}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Findings */}
      {keyInfo.findings.length > 0 && keyInfo.findings.length <= 50 && (
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Key Findings
          </h4>
          <div className="space-y-2">
            {keyInfo.findings.slice(0, 30).map((finding, idx) => (
              <div key={idx} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{finding.id}</p>
                <p className="text-sm text-gray-900 dark:text-gray-100">{finding.finding}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON (Collapsible) */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600">
        <details>
          <summary className="text-md font-semibold text-gray-900 dark:text-gray-100 p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View Raw JSON Data
          </summary>
          <div className="px-6 pb-6">
            <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 p-4 rounded overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(jsonData, null, 2)}
            </pre>
          </div>
        </details>
      </div>
    </div>
  )
}

// Elapsed Timer Display Component
const ElapsedTimerDisplay = ({ startTime }) => {
  const [elapsed, setElapsed] = useState(0)
  
  useEffect(() => {
    if (!startTime) return
    
    const updateTimer = () => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      setElapsed(elapsedSeconds)
    }
    
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    
    return () => clearInterval(interval)
  }, [startTime])
  
  const hrs = Math.floor(elapsed / 3600)
  const mins = Math.floor((elapsed % 3600) / 60)
  const secs = elapsed % 60
  const display = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  
  return (
    <div>
      <span className="font-medium text-gray-700 dark:text-gray-300">Elapsed Time:</span>
      <div className="text-gray-900 dark:text-gray-100 mt-1">{display}</div>
    </div>
  )
}

function WebsiteSecurityAudit() {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  const { registerScan, updateScan, completeScan, stopScan } = useGlobalScanState()
  const [url, setUrl] = useState('')
  const [authorized, setAuthorized] = useState(false)
  const [useCreds, setUseCreds] = useState(false)
  const [creds, setCreds] = useState({ username: '', password: '' })
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState(null)
  const [logs, setLogs] = useState([])
  const [screenshots, setScreenshots] = useState([])
  const [currentCommand, setCurrentCommand] = useState(null)
  const [progress, setProgress] = useState(0)
  const [scanStartTime, setScanStartTime] = useState(null)
  const [scanEndTime, setScanEndTime] = useState(null)
  const [expectedEndTime, setExpectedEndTime] = useState(null)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiError, setAiError] = useState(null)
  const scanIdRef = useRef(null)
  const logContainerRef = useRef(null)
  const scanActiveRef = useRef(false)
  const notificationSentRef = useRef(false)
  const aiSuggestionRef = useRef(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Listen for scan progress and completion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.cyberGuard) return

    const onProgress = (update) => {
      console.log('[WEBSITE-AUDIT] Progress:', update)
      
      const logEntry = {
        timestamp: Date.now(),
        message: update.message || update.stage || 'Processing...',
        type: update.type || 'info',
        command: update.command,
        commandText: update.commandText,
        output: update.output,
        testId: update.stage || 'general'
      }
      
      setLogs(prev => [...prev, logEntry])
      
      // Also log to browser console
      if (update.commandText) {
        console.log(`[KALI COMMAND] ${update.commandText}`)
      }
      if (update.output) {
        console.log(`[KALI OUTPUT]`, update.output)
      }
      
      if (update.progress !== undefined) {
        setProgress(update.progress)
      }
      
      if (update.stage === 'running') {
        setCurrentCommand(update.command || 'Running analysis...')
      } else if (update.stage === 'analyzing') {
        setCurrentCommand('Analyzing results...')
      } else if (update.stage === 'completed') {
        setCurrentCommand(null)
        if (update.result) {
          setScanResults(prev => ({
            ...prev,
            [update.command]: update.result
          }))
        }
      } else if (update.stage === 'screenshot' && update.screenshot) {
        // Handle screenshot updates
        setScreenshots(prev => {
          // Check if screenshot already exists (avoid duplicates)
          const exists = prev.some(s => s.timestamp === update.screenshot.timestamp)
          if (exists) return prev
          return [update.screenshot, ...prev] // Add new screenshot at the beginning
        })
        setCurrentCommand('Screenshot captured')
      }
      
      // Update scan in GlobalScanContext
      if (scanIdRef.current) {
        updateScan(scanIdRef.current, {
          progress: update.progress || progress,
          message: update.message || update.stage || 'Scanning...'
        })
      }
    }

    const onDone = (data) => {
      console.log('[WEBSITE-AUDIT] Done:', data)
      
      if (data.success && data.results) {
        setScanResults(data.results)
        // Update screenshots from results if available
        if (data.results.screenshots && Array.isArray(data.results.screenshots)) {
          setScreenshots(data.results.screenshots)
        }
        setProgress(100)
        setCurrentCommand(null)
        setIsScanning(false)
        scanActiveRef.current = false
        setScanEndTime(Date.now())
        
        // Complete scan in GlobalScanContext
        if (scanIdRef.current) {
          completeScan(scanIdRef.current, {
            completedCount: 5,
            totalCount: 5
          })
          scanIdRef.current = null
        }
        
        // Send notification only once
        if (!notificationSentRef.current && window.cyberGuard?.showNotification) {
          notificationSentRef.current = true
          try {
            window.cyberGuard.showNotification({
              title: 'Website Security Scan Completed',
              body: 'Website Security Scan has been completed',
              viewId: 'website-audit'
            }).catch(err => {
              console.log('Notification error:', err?.message)
            })
          } catch (err) {
            console.log('Notification error:', err?.message)
          }
        }
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: '✅ Website Security Scan completed successfully!',
          type: 'success',
          testId: 'general'
        }])
      } else {
        setIsScanning(false)
        scanActiveRef.current = false
        setScanEndTime(Date.now())
        
        if (scanIdRef.current) {
          stopScan(scanIdRef.current)
          scanIdRef.current = null
        }
        
        setLogs(prev => [...prev, {
          timestamp: Date.now(),
          message: `❌ Scan failed: ${data.error || 'Unknown error'}`,
          type: 'error',
          testId: 'general'
        }])
        
        showError(data.error || 'Scan failed')
      }
    }

    window.cyberGuard.onWebsiteSecurityAuditProgress?.(onProgress)
    window.cyberGuard.onWebsiteSecurityAuditDone?.(onDone)

    return () => {
      // Cleanup listeners if needed
    }
  }, [url, progress, showSuccess, showError, updateScan, completeScan, stopScan])

  const startScan = async () => {
    if (!authorized) {
      showError('Please confirm you have written authorization to test this website.')
      return
    }
    
    if (!url.trim()) {
      showError('Please enter a valid website URL')
      return
    }

    const password = getSecurePassword()
    if (!password) {
      showError('WSL password is required. Please set it in settings.')
      return
    }

    // Reset state
    setIsScanning(true)
    scanActiveRef.current = true
    notificationSentRef.current = false // Reset notification flag
    setScanResults(null)
    setLogs([])
    setScreenshots([])
    setProgress(0)
    setCurrentCommand(null)
    const startTime = Date.now()
    setScanStartTime(startTime)
    setScanEndTime(null)
    
    // Estimate completion time (5 commands, ~2-3 minutes each)
    const estimatedTime = 15 * 60 * 1000 // 15 minutes
    setExpectedEndTime(startTime + estimatedTime)

    // Register scan with GlobalScanContext
    const scanId = registerScan({
      scanType: 'Website Security Audit',
      target: url.trim(),
      progress: 0,
      message: 'Starting scan...',
      startTime: new Date().toISOString(),
      viewId: 'website-audit',
      onStop: () => {
        stopScanHandler()
      },
      onView: () => {
        // Already on this view
      }
    })
    scanIdRef.current = scanId

    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: `🚀 Starting Website Security Scan for ${url.trim()}...`,
      type: 'info',
      testId: 'general'
    }])

    // Handle authentication if needed
    if (useCreds && creds.username && creds.password) {
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: '🔐 Authentication credentials provided, will attempt login...',
        type: 'info',
        testId: 'general'
      }])
      
      // TODO: Implement Puppeteer login and screenshot capture
      // For now, just log it
    }

    try {
      const result = await window.cyberGuard.startWebsiteSecurityAudit({
        url: url.trim(),
        credentials: useCreds && creds.username && creds.password ? creds : null,
        password: password
      })

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to start scan')
      }
    } catch (error) {
      console.error('Scan start error:', error)
      setIsScanning(false)
      scanActiveRef.current = false
      setScanEndTime(Date.now())
      
      if (scanIdRef.current) {
        stopScan(scanIdRef.current)
        scanIdRef.current = null
      }
      
      setLogs(prev => [...prev, {
        timestamp: Date.now(),
        message: `❌ Failed to start scan: ${error.message}`,
        type: 'error',
        testId: 'general'
      }])
      
      showError(`Failed to start scan: ${error.message}`)
    }
  }

  const stopScanHandler = () => {
    scanActiveRef.current = false
    setIsScanning(false)
    setCurrentCommand(null)
    setScanEndTime(Date.now())
    
    if (scanIdRef.current) {
      stopScan(scanIdRef.current)
      scanIdRef.current = null
    }
    
    setLogs(prev => [...prev, {
      timestamp: Date.now(),
      message: '⏹️ Scan stopped by user',
      type: 'warning',
      testId: 'general'
    }])
    
    showError('Scan stopped by user')
  }

  const generatePDFReport = async () => {
    if (!scanResults) {
      showError('No scan results available to export')
      return
    }

    setIsExporting(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const doc = new jsPDF()
      
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 15
      const borderMargin = 5 // Small border margin
      const footerY = pageHeight - 15
      let yPos = 20
      let isFirstPage = true
      
      // Function to draw page border - make it visible
      const drawPageBorder = () => {
        doc.setDrawColor(100, 100, 100) // Darker gray border for visibility
        doc.setLineWidth(1) // Thicker line for visibility
        doc.rect(borderMargin, borderMargin, pageWidth - 2 * borderMargin, pageHeight - 2 * borderMargin)
      }
      
      // Function to add footer - left: Cyberix text, right: page number
      const drawFooter = (pageNum, totalPages) => {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(128, 128, 128)
        // Left footer
        doc.text('Cyberix - A Webnox Product', margin, footerY, { align: 'left' })
        // Right footer - page number
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' })
      }
      
      // Helper to update all page footers
      const updateAllFooters = () => {
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          drawPageBorder()
          drawFooter(i, totalPages)
        }
      }
      
      // Draw border and footer on first page
      drawPageBorder()
      drawFooter(1, 1) // Will update total later
      
      // Helper function to add text with proper wrapping and overflow prevention
      const addText = (text, x, y, fontSize = 12, fontStyle = 'normal', align = 'left', color = [0, 0, 0], maxWidthOverride = null) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color[0], color[1], color[2])
        const textMaxWidth = maxWidthOverride || (pageWidth - 2 * margin - (x - margin))
        const lines = doc.splitTextToSize(text || '', textMaxWidth)
        doc.text(lines, x, y, { align })
        return y + (lines.length * fontSize * 0.4) + 5
      }
      
      // Helper function to check if new page is needed
      const checkNewPage = (requiredSpace = 20) => {
        if (yPos + requiredSpace > footerY - 10) {
          // Draw border and footer on current page before adding new one
          drawPageBorder()
          const currentPage = doc.internal.getNumberOfPages()
          drawFooter(currentPage, currentPage) // Will update total later
          
          doc.addPage()
          isFirstPage = false
          yPos = 20
          // Draw border and footer on new page
          drawPageBorder()
          drawFooter(doc.internal.getNumberOfPages(), doc.internal.getNumberOfPages())
        }
      }
      
      // Calculate scan metadata
      const scanName = 'Website Security Audit'
      const siteName = url || 'N/A'
      const startTime = scanStartTime ? new Date(scanStartTime) : new Date()
      const endTime = scanEndTime ? new Date(scanEndTime) : new Date()
      const duration = scanStartTime && scanEndTime ? 
        Math.floor((endTime - startTime) / 1000) : 0 // in seconds
      const durationMinutes = Math.floor(duration / 60)
      const durationSeconds = Math.floor(duration % 60)
      const durationText = duration > 0 ? `${durationMinutes}m ${durationSeconds}s` : 'N/A'
      
      // First Page Header - Scan Information
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text(scanName, margin, yPos, { align: 'left' })
      yPos += 8

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      
      // Scan Info Table with proper date/time formatting
      const infoItems = [
        { label: 'Scan Name:', value: scanName },
        { label: 'Site Name:', value: siteName },
        { label: 'Started Date & Time:', value: formatDateTime(scanStartTime) },
        { label: 'Ended Date & Time:', value: formatDateTime(scanEndTime) },
        { label: 'Total Time:', value: durationText }
      ]

      infoItems.forEach((item, idx) => {
        checkNewPage(7)
        doc.setFont('helvetica', 'bold')
        doc.text(item.label, margin, yPos)
        doc.setFont('helvetica', 'normal')
        const valueX = margin + 50
        const valueLines = doc.splitTextToSize(item.value, pageWidth - margin - valueX - 10)
        valueLines.forEach((line, lineIdx) => {
          doc.text(line, valueX, yPos + (lineIdx * 5))
        })
        yPos += Math.max(5, valueLines.length * 5) + 2
      })
      
      yPos += 5
      
      // Summary Section
      checkNewPage(15)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('Executive Summary', margin, yPos)
      yPos += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      const summaryText = 'This report contains the results of a comprehensive website security audit performed on the target website. The audit includes SSL/TLS analysis, web server vulnerability scanning, HTTP header inspection, IP geolocation lookup, and network path analysis.'
      const summaryLines = doc.splitTextToSize(summaryText, pageWidth - 2 * margin)
      summaryLines.forEach(line => {
        checkNewPage(5)
        doc.text(line, margin, yPos)
        yPos += 5
      })
      yPos += 5
      
      // Helper function to extract finding details (matching UI logic)
      const extractFindingDetails = (finding) => {
        if (!finding || typeof finding !== 'object') {
          return { id: '', severity: 'INFO', message: String(finding), ipPort: '' }
        }
        
        // Extract ID
        const findingId = finding.id || finding.findingId || finding.finding_id || finding.ID || ''
        
        // Extract severity
        const severity = finding.severity || finding.Severity || finding.severity_level || 'INFO'
        
        // Extract finding message
        let findingMessage = finding.finding || finding.message || finding.description || finding.Finding || finding.Message || ''
        if (typeof findingMessage === 'object') {
          findingMessage = JSON.stringify(findingMessage)
        }
        findingMessage = String(findingMessage)
        
        // Extract IP/Port
        let ipPort = ''
        if (finding.ip && finding.port) {
          ipPort = `${finding.ip}:${finding.port}`
        } else if (finding.ip) {
          ipPort = finding.ip
        } else if (finding.port) {
          ipPort = `Port: ${finding.port}`
        } else if (finding.ipPort) {
          ipPort = finding.ipPort
        } else if (finding.ip_port) {
          ipPort = finding.ip_port
        }
        
        return { id: String(findingId), severity: String(severity), message: findingMessage, ipPort: String(ipPort) }
      }
      
      // Helper function to add a command result to PDF (matching UI display)
      const addCommandResultToPDF = (commandData, commandTitle) => {
        if (!commandData) return
        
        checkNewPage(20)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(commandTitle, margin, yPos)
        yPos += 8
        
        // Check if we have parsed data (same logic as UI)
        let parsed = null
        if (commandData.parsed && !commandData.parsed.error && commandData.success !== false) {
          parsed = commandData.parsed
        } else if (commandData.parsed && typeof commandData.parsed === 'object') {
          parsed = commandData.parsed
        }
        
        if (parsed) {
          // What We Did
          if (parsed.whatWeDid) {
            checkNewPage(7)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Did:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            const whatWeDidText = String(parsed.whatWeDid)
            const whatWeDidLines = doc.splitTextToSize(whatWeDidText, pageWidth - 2 * margin - 10)
            whatWeDidLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin + 5, yPos)
              yPos += 5
            })
            yPos += 3
          }
          
          // What We Got
          if (parsed.whatWeGot) {
            checkNewPage(7)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Got:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            const whatWeGotText = String(parsed.whatWeGot)
            const whatWeGotLines = doc.splitTextToSize(whatWeGotText, pageWidth - 2 * margin - 10)
            whatWeGotLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin + 5, yPos)
              yPos += 5
            })
            yPos += 3
          }
          
          // Summary
          if (parsed.summary && typeof parsed.summary === 'object') {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text('Summary:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            Object.entries(parsed.summary).forEach(([key, value]) => {
              if (value !== null && value !== undefined && value !== '') {
                checkNewPage(6)
                const summaryLine = `${key}: ${String(value)}`
                const summaryLines = doc.splitTextToSize(summaryLine, pageWidth - 2 * margin - 10)
                summaryLines.forEach(line => {
                  checkNewPage(5)
                  doc.text(line, margin + 5, yPos)
                  yPos += 5
                })
              }
            })
            yPos += 3
          }
          
          // Findings
          if (parsed.findings && Array.isArray(parsed.findings) && parsed.findings.length > 0) {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text(`Findings (${parsed.findings.length} items):`, margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            
            parsed.findings.forEach((finding, idx) => {
              const details = extractFindingDetails(finding)
              checkNewPage(12)
              
              // Finding header with ID and Severity
              let findingHeader = `#${idx + 1}`
              if (details.id) {
                findingHeader += ` - ID: ${details.id}`
              }
              if (details.severity) {
                findingHeader += ` [Severity: ${details.severity}]`
              }
              
              doc.setFont('helvetica', 'bold')
              doc.text(findingHeader, margin + 5, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              
              // Finding message
              if (details.message) {
                checkNewPage(7)
                const findingText = `Finding: ${details.message}`
                const findingLines = doc.splitTextToSize(findingText, pageWidth - 2 * margin - 15)
                findingLines.forEach(line => {
                  checkNewPage(5)
                  doc.text(line, margin + 10, yPos)
                  yPos += 5
                })
              }
              
              // IP/Port if available
              if (details.ipPort && details.ipPort !== '-' && details.ipPort !== '') {
                checkNewPage(5)
                doc.text(`IP/Port: ${details.ipPort}`, margin + 10, yPos)
                yPos += 5
              }
              
              yPos += 2
            })
            yPos += 3
          }
          
          // Recommendations
          if (parsed.recommendations && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text('Recommendations:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            parsed.recommendations.forEach((rec, idx) => {
              checkNewPage(6)
              const recText = typeof rec === 'string' ? rec : (rec.recommendation || rec.description || rec.text || JSON.stringify(rec))
              const recLines = doc.splitTextToSize(`${idx + 1}. ${recText}`, pageWidth - 2 * margin - 10)
              recLines.forEach(line => {
                checkNewPage(5)
                doc.text(line, margin + 5, yPos)
                yPos += 5
              })
            })
            yPos += 3
          }
        } else if (commandData.raw) {
          // Fallback to raw output if no parsed data
          checkNewPage(10)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(50, 50, 50)
          doc.text('Raw Output:', margin, yPos)
          yPos += 6
          doc.setFontSize(8)
          doc.setTextColor(80, 80, 80)
          const rawLines = commandData.raw.split('\n').slice(0, 50)
          rawLines.forEach(line => {
            if (line.trim()) {
              checkNewPage(5)
              const rawText = line.substring(0, 120) // Increased from 100
              const rawTextLines = doc.splitTextToSize(rawText, pageWidth - 2 * margin - 10)
              rawTextLines.forEach(rawLine => {
                checkNewPage(4)
                doc.text(rawLine, margin + 5, yPos)
                yPos += 4
              })
            }
          })
        }
        
        yPos += 5
      }
      
      // Command 1: SSL/TLS Analysis
      if (scanResults.command1) {
        addCommandResultToPDF(scanResults.command1, '1. SSL/TLS Analysis')
      }
      
      // Command 2: Web Server Analysis
      if (scanResults.command2) {
        addCommandResultToPDF(scanResults.command2, '2. Web Server Vulnerability Scan')
      }
      
      // Command 3: HTTP Headers Analysis
      if (scanResults.command3) {
        addCommandResultToPDF(scanResults.command3, '3. HTTP Headers Analysis')
      }
      
      // Command 4: Domain & Location Analysis
      if (scanResults.command4) {
        checkNewPage(20)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('4. Domain & Location Analysis', margin, yPos)
        yPos += 8
        
        // Show IP Address if available (from host command)
        if (scanResults.command4.ipAddress) {
          checkNewPage(7)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.text(`IP Address: ${scanResults.command4.ipAddress}`, margin, yPos)
          yPos += 6
        }
        
        // Process parsed data manually to avoid duplicate title
        const command4Data = scanResults.command4
        let parsed = null
        if (command4Data.parsed && !command4Data.parsed.error && command4Data.success !== false) {
          parsed = command4Data.parsed
        } else if (command4Data.parsed && typeof command4Data.parsed === 'object') {
          parsed = command4Data.parsed
        }
        
        if (parsed) {
          // What We Did
          if (parsed.whatWeDid) {
            checkNewPage(7)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Did:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            const whatWeDidText = String(parsed.whatWeDid)
            const whatWeDidLines = doc.splitTextToSize(whatWeDidText, pageWidth - 2 * margin - 10)
            whatWeDidLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin + 5, yPos)
              yPos += 5
            })
            yPos += 3
          }
          
          // What We Got
          if (parsed.whatWeGot) {
            checkNewPage(7)
            doc.setFontSize(11)
            doc.setFont('helvetica', 'bold')
            doc.text('What We Got:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            const whatWeGotText = String(parsed.whatWeGot)
            const whatWeGotLines = doc.splitTextToSize(whatWeGotText, pageWidth - 2 * margin - 10)
            whatWeGotLines.forEach(line => {
              checkNewPage(5)
              doc.text(line, margin + 5, yPos)
              yPos += 5
            })
            yPos += 3
          }
          
          // Summary
          if (parsed.summary && typeof parsed.summary === 'object') {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text('Summary:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            Object.entries(parsed.summary).forEach(([key, value]) => {
              if (value !== null && value !== undefined && value !== '') {
                checkNewPage(6)
                const summaryLine = `${key}: ${String(value)}`
                const summaryLines = doc.splitTextToSize(summaryLine, pageWidth - 2 * margin - 10)
                summaryLines.forEach(line => {
                  checkNewPage(5)
                  doc.text(line, margin + 5, yPos)
                  yPos += 5
                })
              }
            })
            yPos += 3
          }
          
          // Findings
          if (parsed.findings && Array.isArray(parsed.findings) && parsed.findings.length > 0) {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text(`Findings (${parsed.findings.length} items):`, margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            
            parsed.findings.forEach((finding, idx) => {
              const details = extractFindingDetails(finding)
              checkNewPage(12)
              
              // Finding header with ID and Severity
              let findingHeader = `#${idx + 1}`
              if (details.id) {
                findingHeader += ` - ID: ${details.id}`
              }
              if (details.severity) {
                findingHeader += ` [Severity: ${details.severity}]`
              }
              
              doc.setFont('helvetica', 'bold')
              doc.text(findingHeader, margin + 5, yPos)
              yPos += 6
              doc.setFont('helvetica', 'normal')
              
              // Finding message
              if (details.message) {
                checkNewPage(7)
                const findingText = `Finding: ${details.message}`
                const findingLines = doc.splitTextToSize(findingText, pageWidth - 2 * margin - 15)
                findingLines.forEach(line => {
                  checkNewPage(5)
                  doc.text(line, margin + 10, yPos)
                  yPos += 5
                })
              }
              
              // IP/Port if available
              if (details.ipPort && details.ipPort !== '-' && details.ipPort !== '') {
                checkNewPage(5)
                doc.text(`IP/Port: ${details.ipPort}`, margin + 10, yPos)
                yPos += 5
              }
              
              yPos += 2
            })
            yPos += 3
          }
          
          // Recommendations
          if (parsed.recommendations && Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0) {
            checkNewPage(10)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            doc.text('Recommendations:', margin, yPos)
            yPos += 6
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            parsed.recommendations.forEach((rec, idx) => {
              checkNewPage(6)
              const recText = typeof rec === 'string' ? rec : (rec.recommendation || rec.description || rec.text || JSON.stringify(rec))
              const recLines = doc.splitTextToSize(`${idx + 1}. ${recText}`, pageWidth - 2 * margin - 10)
              recLines.forEach(line => {
                checkNewPage(5)
                doc.text(line, margin + 5, yPos)
                yPos += 5
              })
            })
            yPos += 3
          }
        } else if (command4Data.raw) {
          // Fallback to raw output if no parsed data
          checkNewPage(10)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(50, 50, 50)
          doc.text('Raw Output:', margin, yPos)
          yPos += 6
          doc.setFontSize(8)
          doc.setTextColor(80, 80, 80)
          const rawLines = command4Data.raw.split('\n').slice(0, 50)
          rawLines.forEach(line => {
            if (line.trim()) {
              checkNewPage(5)
              const rawText = line.substring(0, 120)
              const rawTextLines = doc.splitTextToSize(rawText, pageWidth - 2 * margin - 10)
              rawTextLines.forEach(rawLine => {
                checkNewPage(4)
                doc.text(rawLine, margin + 5, yPos)
                yPos += 4
              })
            }
          })
        }
        yPos += 5
      }
      
      // Command 5: Network Path Analysis
      if (scanResults.command5) {
        addCommandResultToPDF(scanResults.command5, '5. Network Path Analysis')
      }
      
      // Screenshots Section
      if (screenshots && screenshots.length > 0) {
        checkNewPage(15)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Screenshots', margin, yPos)
        yPos += 8
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.text(`${screenshots.length} screenshot(s) captured during the scan.`, margin, yPos)
        yPos += 6
      }
      
      // General Recommendations Section
      checkNewPage(15)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('General Recommendations', margin, yPos)
      yPos += 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      
      const generalRecs = [
        '1. Review SSL/TLS configuration and disable outdated protocols/weak ciphers',
        '2. Patch or remove vulnerable server components identified in the scan',
        '3. Implement security headers (CSP, X-Frame-Options, Referrer-Policy)',
        '4. Enable Secure/HttpOnly/SameSite flags on cookies',
        '5. Review network configuration and consider using CDN/WAF for additional protection'
      ]
      
      generalRecs.forEach(rec => {
        checkNewPage(6)
        const recLines = doc.splitTextToSize(rec, pageWidth - 2 * margin)
        recLines.forEach(line => {
          checkNewPage(5)
          doc.text(line, margin, yPos)
          yPos += 5
        })
      })
      yPos += 5
      
      // Update all footers with correct page numbers
      updateAllFooters()
      
      // Save PDF
      const fileName = `website-security-audit-${url.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error('PDF generation error:', error)
      showError(`Failed to generate PDF: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const fetchAISuggestions = async () => {
    if (!scanResults) {
      showError('No scan results available for AI suggestions')
      return
    }

    setIsLoadingAI(true)
    setAiError(null)
    setAiSuggestions(null)

    // Scroll to AI Suggestion section
    setTimeout(() => {
      if (aiSuggestionRef.current) {
        aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)

    try {
      // Combine all scan results for AI analysis
      const allResults = {
        command1: scanResults.command1,
        command2: scanResults.command2,
        command3: scanResults.command3,
        command4: scanResults.command4,
        command5: scanResults.command5
      }

      // Extract raw outputs
      const rawOutputs = []
      if (scanResults.command1?.raw) rawOutputs.push(`SSL/TLS Analysis:\n${scanResults.command1.raw}`)
      if (scanResults.command2?.raw) rawOutputs.push(`Web Server Scan:\n${scanResults.command2.raw}`)
      if (scanResults.command3?.raw) rawOutputs.push(`HTTP Headers:\n${scanResults.command3.raw}`)
      if (scanResults.command4?.raw) rawOutputs.push(`Domain & Location:\n${scanResults.command4.raw}`)
      if (scanResults.command5?.raw) rawOutputs.push(`Network Path:\n${scanResults.command5.raw}`)

      const combinedRawOutput = rawOutputs.join('\n\n---\n\n')

      // Call Grok API
      const suggestions = await getAISuggestions(
        'website-security-audit',
        'Website Security Audit',
        allResults,
        combinedRawOutput,
        url
      )

      setAiSuggestions(suggestions)

      // Scroll to AI Suggestion section after results are loaded
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 500)
    } catch (error) {
      console.error('Error fetching AI suggestions:', error)
      setAiError(error.message || 'Failed to fetch AI suggestions. Please try again.')
      showError(error.message || 'Failed to fetch AI suggestions. Please try again.')

      // Scroll to AI Suggestion section even on error
      setTimeout(() => {
        if (aiSuggestionRef.current) {
          aiSuggestionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    } finally {
      setIsLoadingAI(false)
    }
  }

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A'
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const helpContent = (
    <>
      <div className="space-y-6">
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
            This audit covers five complementary checks that together give a practical picture of your site's security posture and hosting footprint:
          </p>
        </div>

        <div className="space-y-4 mt-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-800">
            <h5 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              SSL/TLS & certificate analysis
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We verify the site's HTTPS configuration, certificate validity, cipher strength, protocol support and common TLS misconfigurations. The output shows whether the site uses modern, secure ciphers and TLS versions, whether certificate chains are correct, and if features like HSTS or weak renegotiation are present. This helps prevent eavesdropping, man-in-the-middle attacks and crypto downgrade issues.
            </p>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-5 border border-green-200 dark:border-green-800">
            <h5 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Web-application / server vulnerability scan
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We run a targeted web scan that probes for known server and application issues such as outdated server components, default files, misconfigured headers, directory listings, and common insecure endpoints. The scan identifies items with evidence (and severity) so you know what to fix first: critical exposures (remote code, SQL injection points) come first, then configuration and info-disclosure issues.
            </p>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-5 border border-purple-200 dark:border-purple-800">
            <h5 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              HTTP header inspection
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We retrieve and inspect HTTP response headers to check how the server advertises itself and to look for missing or weak security controls. Important headers include those that control transport security, cookie flags, content security policy, and clickjacking protection. Missing or incorrect headers often indicate straightforward mitigations that substantially improve security.
            </p>
          </div>

          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-5 border border-indigo-200 dark:border-indigo-800">
            <h5 className="font-semibold text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              IP & geolocation lookup
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We determine the site's public IP address and map that IP to a geographic location and hosting provider. This reveals where the origin server (or CDN/edge) is hosted and which organization controls the network. Knowing the hosting location and provider helps with compliance, incident response planning, and understanding whether a CDN or reverse-proxy is hiding the origin.
            </p>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-5 border border-orange-200 dark:border-orange-800">
            <h5 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Network path (traceroute) and routing information
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              We trace the network path from the scanner to the site to reveal intermediary hops (CDNs, transit providers) and latency points. This shows whether traffic goes through protective layers (WAFs/CDNs) or directly to the origin, and can highlight routing anomalies or points of failure that affect availability and performance.
            </p>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          <h4 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="w-1 h-8 bg-orange-500 rounded"></div>
            What the results tell you (and what to do next)
          </h4>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-5 border border-gray-200 dark:border-gray-700">
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>
                The TLS report tells you if you need to disable old protocols/weak ciphers, renew certificates, or enable HSTS to harden transport security.
              </p>
              <p>
                The vulnerability scan flags outdated server software, exposed admin paths, or dangerous defaults; patching or removing vulnerable components and hardening configuration should be prioritized.
              </p>
              <p>
                The headers check shows quick wins: enable Secure/HttpOnly/SameSite on cookies, set a strict Content-Security-Policy, add X-Frame-Options and Referrer-Policy headers.
              </p>
              <p>
                The IP/geolocation and traceroute results show whether a CDN or WAF is present (which can mask backend tech) and whether you should adjust DNS/proxy settings for better protection or compliance.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Main Section */}
      <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-2xl shadow-lg border border-orange-200 dark:border-slate-600 p-8 relative overflow-hidden mb-6" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Header */}
          <div className="relative">
            <button
              onClick={() => setShowHelpDialog(true)}
              className="absolute top-0 right-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200 z-20"
              title="View detailed audit information"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="flex items-start justify-between mb-6 pr-12">
              <div className="flex items-center space-x-4 flex-1">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Website Security Audit
                  </h1>
                  <p className="text-base text-gray-600 dark:text-gray-400 mb-2">
                    A website security audit inspects your site for SSL/TLS weaknesses, web-server and application vulnerabilities, and network/hosting exposure.
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    It finds misconfigurations and risks so you can prioritize fixes that protect users and maintain service availability.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Target URL Section */}
          <div className="space-y-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Target URL</h3>
            </div>
            
            <div className="flex space-x-4">
              <div className="flex-1">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter target URL (e.g., example.com or https://example.com)"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100"
                  disabled={isScanning}
                />
              </div>
              <button
                onClick={isScanning ? stopScanHandler : startScan}
                disabled={isScanning ? false : (!url.trim() || !authorized)}
                className={`px-8 py-3 rounded-xl font-semibold transition-all duration-200 ${
                  isScanning
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg hover:shadow-xl'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isScanning ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Stop Scan</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Start Scan</span>
                  </div>
                )}
              </button>
            </div>

            {/* Authorization Checkbox */}
            <label className="inline-flex items-center gap-2 mt-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                disabled={isScanning}
              />
              <span className="text-gray-700 dark:text-gray-300">I have written authorization to test this website.</span>
            </label>

            {/* Authentication Section */}
            <div className="mt-3 p-4 border border-gray-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCreds}
                  onChange={(e) => setUseCreds(e.target.checked)}
                  className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                  disabled={isScanning}
                />
                <span className="text-gray-700 dark:text-gray-300">This site requires authentication</span>
              </label>
              {useCreds && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <input
                    className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-gray-100"
                    placeholder="Username/email"
                    value={creds.username}
                    onChange={(e) => setCreds(v => ({ ...v, username: e.target.value }))}
                    disabled={isScanning}
                  />
                  <input
                    className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg dark:bg-slate-700 dark:text-gray-100"
                    placeholder="Password"
                    type="password"
                    value={creds.password}
                    onChange={(e) => setCreds(v => ({ ...v, password: e.target.value }))}
                    disabled={isScanning}
                  />
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Credentials are used only for read-only verification and are never stored or reused.
              </p>
            </div>
          </div>
          
          {/* Scan Completion Banner */}
          {!isScanning && scanResults && (
            <div className="rounded-xl p-6 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center space-x-4 mb-4">
                <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-green-900 dark:text-green-100">
                    Website Security Scan Completed
                  </h3>
                  <p className="text-sm mt-1 text-green-700 dark:text-green-300">
                    All 5 security scans have been completed. Review the comprehensive results below for detailed findings and recommendations.
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={fetchAISuggestions}
                    disabled={isLoadingAI}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg font-medium transition-all duration-200 ${
                      isLoadingAI
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white shadow-lg hover:shadow-xl'
                    }`}
                    title="Get AI Suggestions"
                  >
                    {isLoadingAI ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={generatePDFReport}
                    disabled={isExporting}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg font-medium transition-all duration-200 ${
                      isExporting
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl'
                    }`}
                    title="Export scan results to PDF"
                  >
                    {isExporting ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Scan Timing Information */}
              {(scanStartTime || scanEndTime) && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Start Date & Time</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDateTime(scanStartTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">End Date & Time</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatDateTime(scanEndTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Elapsed Time</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {scanStartTime && scanEndTime ? (
                        (() => {
                          const elapsedMs = scanEndTime - scanStartTime
                          const elapsedSeconds = Math.floor(elapsedMs / 1000)
                          const elapsedMinutes = Math.floor(elapsedSeconds / 60)
                          const elapsedHours = Math.floor(elapsedMinutes / 60)
                          return elapsedHours > 0 
                            ? `${elapsedHours}:${String(elapsedMinutes % 60).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`
                            : elapsedMinutes > 0
                            ? `${elapsedMinutes}:${String(elapsedSeconds % 60).padStart(2, '0')}`
                            : `0:${String(elapsedSeconds).padStart(2, '0')}`
                        })()
                      ) : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Scans Completed</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">5 / 5</p>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Scan Progress Overview */}
          {(isScanning || scanResults) && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan Progress</h3>
              
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Progress</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-4">
                  <div 
                    className="bg-gradient-to-r from-orange-500 to-amber-600 h-4 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {currentCommand || 'Ready to start scan...'}
                </p>
              </div>
              
              {/* Scan Timing Information - Below Progress */}
              {(isScanning || scanStartTime) && (
                <div className="mt-4 bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-600">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Scan Timing</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {scanStartTime && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Start Date & Time:</span>
                        <div className="text-gray-900 dark:text-gray-100 mt-1">
                          {formatDateTime(scanStartTime)}
                        </div>
                      </div>
                    )}
                    {isScanning && scanStartTime && (
                      <ElapsedTimerDisplay startTime={scanStartTime} />
                    )}
                    {expectedEndTime && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">Expected End Date & Time:</span>
                        <div className="text-gray-900 dark:text-gray-100 mt-1">
                          {formatDateTime(expectedEndTime)}
                        </div>
                      </div>
                    )}
                    {scanEndTime && (
                      <div>
                        <span className="font-medium text-gray-700 dark:text-gray-300">End Date & Time:</span>
                        <div className="text-gray-900 dark:text-gray-100 mt-1">
                          {formatDateTime(scanEndTime)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Screenshots Section */}
              {screenshots.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">Screenshots</h4>
                  <div className="flex space-x-4 overflow-x-auto pb-4" style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}>
                    {screenshots.map((screenshot, idx) => (
                      <div key={idx} className="border-2 border-gray-300 dark:border-slate-600 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow flex-shrink-0" style={{ minWidth: '350px', maxWidth: '400px' }}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={screenshot.url}>
                              {screenshot.url}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {new Date(screenshot.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        {screenshot.base64 ? (
                          <div className="relative group">
                            <img
                              src={`data:image/png;base64,${screenshot.base64}`}
                              alt={`Screenshot of ${screenshot.url}`}
                              className="w-full h-auto rounded-lg border-2 border-gray-200 dark:border-slate-700 cursor-pointer hover:border-orange-500 transition-all"
                              style={{ maxHeight: '300px', objectFit: 'contain', minHeight: '150px' }}
                              onClick={() => {
                                // Open image in new window for full view
                                const newWindow = window.open()
                                if (newWindow) {
                                  newWindow.document.write(`
                                    <html>
                                      <head><title>Screenshot - ${screenshot.url}</title></head>
                                      <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                                        <img src="data:image/png;base64,${screenshot.base64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                      </body>
                                    </html>
                                  `)
                                }
                              }}
                            />
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="bg-black/70 text-white text-xs px-2 py-1 rounded">
                                Click to view full size
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="w-full h-48 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">No screenshot available</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Logs Section */}
              {logs.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">Console Log</h4>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const logText = logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.message}`).join('\n')
                          navigator.clipboard.writeText(logText)
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                        title="Copy Logs"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setLogs([])}
                        className="w-8 h-8 flex items-center justify-center bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                        title="Clear Logs"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div 
                    ref={logContainerRef}
                    className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm border border-gray-700"
                  >
                    <div className="space-y-2">
                      {logs.map((log, index) => (
                        <div key={index} className="text-sm">
                          <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                          <span className={`ml-2 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            'text-orange-400'
                          }`}>
                            {log.message}
                          </span>
                          {log.commandText && (
                            <div className="ml-4 mt-1 text-cyan-400 text-xs font-mono">
                              <span className="text-gray-500">$ </span>{log.commandText}
                            </div>
                          )}
                          {log.command && !log.commandText && (
                            <div className="ml-4 mt-1 text-green-400 text-xs">
                              Analysis: {log.command}
                            </div>
                          )}
                          {log.output && (
                            <div className="ml-4 mt-1">
                              <pre className="text-white text-xs whitespace-pre-wrap break-words bg-gray-800 p-2 rounded border border-gray-700">
                                {log.output.length > 5000 
                                  ? log.output.substring(0, 5000) + '\n\n... (output truncated)'
                                  : log.output || '(no output)'
                                }
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Results Display */}
              {scanResults && (
                <div className="mt-6 space-y-4">
                  <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100">Scan Results</h4>
                  
                  {/* Command 1: SSL/TLS Analysis */}
                  {scanResults.command1 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">SSL/TLS Analysis</h5>
                      </div>
                      {scanResults.command1.success ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command1.parsed}
                          title="SSL/TLS Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          }
                        />
                      ) : (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">Error: {scanResults.command1.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Command 2: Web Server Analysis */}
                  {scanResults.command2 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Web Server Analysis</h5>
                      </div>
                      {scanResults.command2.parsed && !scanResults.command2.parsed.error ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command2.parsed}
                          title="Web Server Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          }
                        />
                      ) : (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">Error: {scanResults.command2.parsed?.error || scanResults.command2.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Command 3: HTTP Headers Analysis */}
                  {scanResults.command3 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">HTTP Headers Analysis</h5>
                      </div>
                      {scanResults.command3.parsed && !scanResults.command3.parsed.error ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command3.parsed}
                          title="HTTP Headers Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          }
                        />
                      ) : scanResults.command3.raw ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command3.parsed?.raw || scanResults.command3.raw}
                          title="HTTP Headers Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          }
                        />
                      ) : (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">Error: {scanResults.command3.parsed?.error || scanResults.command3.error || 'Failed to parse analysis result'}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Command 4: Domain & Location Analysis */}
                  {scanResults.command4 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Domain & Location Analysis</h5>
                      </div>
                      {scanResults.command4.parsed && !scanResults.command4.parsed.error ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command4.parsed}
                          title="Domain & Location Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          }
                        />
                      ) : (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">Error: {scanResults.command4.parsed?.error || scanResults.command4.error}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Command 5: Network Path Analysis */}
                  {scanResults.command5 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                      <div className="flex items-center space-x-3 mb-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                        </div>
                        <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Network Path Analysis</h5>
                      </div>
                      {scanResults.command5.parsed && !scanResults.command5.parsed.error ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command5.parsed}
                          title="Network Path Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          }
                        />
                      ) : scanResults.command5.raw ? (
                        <ParsedResultsDisplay 
                          jsonData={scanResults.command5.parsed?.raw || scanResults.command5.raw}
                          title="Network Path Analysis"
                          icon={
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                          }
                        />
                      ) : (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">Error: {scanResults.command5.parsed?.error || scanResults.command5.error || 'Failed to parse analysis result'}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* AI Suggestions Section */}
              <div ref={aiSuggestionRef} className="mt-6">
                {(aiSuggestions || aiError || isLoadingAI) && (
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-6 border border-gray-200 dark:border-slate-600">
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <h5 className="text-lg font-semibold text-gray-900 dark:text-gray-100">AI Suggestions</h5>
                    </div>
                    
                    {isLoadingAI ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="ml-3 text-gray-600 dark:text-gray-400">Generating AI suggestions...</span>
                      </div>
                    ) : aiError ? (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
                      </div>
                    ) : aiSuggestions ? (
                      <div className="space-y-4">
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                            {aiSuggestions}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Click the AI Suggestions button to get AI-powered recommendations based on your scan results.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Help Dialog */}
      <HelpDialog isOpen={showHelpDialog} onClose={() => setShowHelpDialog(false)} content={helpContent} />
    </div>
  )
}

export default WebsiteSecurityAudit
