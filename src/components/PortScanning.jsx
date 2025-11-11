import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'
import { getAISuggestions } from '../utils/grokApi'

function PortScanning() {
  const { showSuccess, showError } = useToast()
  const [targetUrl, setTargetUrl] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [logs, setLogs] = useState([])
  const [scanResult, setScanResult] = useState(null)
  const [ipAddress, setIpAddress] = useState(null)
  
  // Timing
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  // Filters
  const [portFilter, setPortFilter] = useState('open') // default to Open
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [pageInput, setPageInput] = useState('1')
  const [showHelp, setShowHelp] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState(null)
  const [aiError, setAiError] = useState(null)
  
  const logContainerRef = useRef(null)
  const timerRef = useRef(null)
  const aiSuggestionRef = useRef(null)

  // Timer for elapsed time
  useEffect(() => {
    if (isScanning && startTime) {
      timerRef.current = setInterval(() => {
        setElapsedTime(Date.now() - startTime)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isScanning, startTime])

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Reset pagination when filter or results change
  useEffect(() => {
    setCurrentPage(1)
    setPageInput('1')
  }, [portFilter, scanResult])

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, {
      timestamp,
      message,
      type,
      id: Date.now() + Math.random()
    }])
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${message}`)
  }

  const copyLogs = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}`
    ).join('\n')
    navigator.clipboard.writeText(logText)
    showSuccess('Logs copied to clipboard!')
  }

  const clearLogs = () => {
    setLogs([])
  }

  const fetchAISuggestions = async () => {
    if (!scanResult) {
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
      const rawOutput = JSON.stringify(scanResult, null, 2)

      // Call Grok API
      const suggestions = await getAISuggestions(
        'port-scanning',
        'Port Scanning',
        scanResult,
        rawOutput,
        targetUrl || ipAddress || 'Unknown'
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

  const generatePDFReport = async () => {
    if (!scanResult) {
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
        doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
      }
      
      // Helper to update all page footers
      const updateAllFooters = () => {
        const totalPages = doc.internal.getNumberOfPages()
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i)
          drawPageBorder()
          const currentPage = i
          
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
          doc.text(`Page ${currentPage} of ${totalPages}`, pageWidth - margin - 5, pageHeight - footerHeight + 12, { align: 'right' })
        }
      }
      
      // Draw border and footer on first page
      drawPageBorder()
      addFooter()
      
      const addText = (text, x, y, fontSize = 12, fontStyle = 'normal', align = 'left', color = [0, 0, 0]) => {
        doc.setFontSize(fontSize)
        doc.setFont('helvetica', fontStyle)
        doc.setTextColor(color[0], color[1], color[2])
        const lines = doc.splitTextToSize(text || '', pageWidth - 2 * x - margin - 10)
        doc.text(lines, x, y, { align })
        return y + (lines.length * fontSize * 0.4) + 5
      }
      
      const checkNewPage = (requiredSpace = 20) => {
        if (yPos + requiredSpace > pageHeight - footerHeight - margin) {
          doc.addPage()
          drawPageBorder()
          addFooter()
          yPos = margin + 10
        }
      }
      
      // Title
      yPos = addText('Port Scan Security Report', margin, yPos, 20, 'bold', 'left', [0, 0, 0])
      yPos += 5
      
      // Target URL
      yPos = addText(`Target: ${targetUrl || ipAddress || 'Unknown'}`, margin, yPos, 12, 'normal', 'left', [50, 50, 50])
      yPos += 3
      
      // Scan Date
      if (startTime) {
        yPos = addText(`Scan Date: ${new Date(startTime).toLocaleString()}`, margin, yPos, 10, 'normal', 'left', [100, 100, 100])
        yPos += 5
      }
      
      // Summary Section
      checkNewPage(15)
      yPos = addText('Executive Summary', margin, yPos, 16, 'bold', 'left', [0, 0, 0])
      yPos += 5
      
      const host = scanResult?.nmap_scan?.hosts?.[0]
      if (host) {
        const openPorts = host.ports?.filter(p => p.state === 'open').length || 0
        const closedPorts = host.ports?.filter(p => p.state === 'closed').length || 0
        const filteredPorts = host.ports?.filter(p => p.state === 'filtered').length || 0
        
        yPos = addText(`This port scan identified ${openPorts} open ports, ${closedPorts} closed ports, and ${filteredPorts} filtered ports on the target system.`, margin, yPos, 10, 'normal', 'left', [50, 50, 50])
        yPos += 10
      }
      
      // Port Details Section
      if (host && host.ports && Array.isArray(host.ports) && host.ports.length > 0) {
        checkNewPage(20)
        yPos = addText('Port Details', margin, yPos, 14, 'bold', 'left', [0, 0, 0])
        yPos += 5
        
        // Filter to show only open ports in PDF (or all if user wants)
        const portsToShow = host.ports.filter(p => portFilter === 'all' || p.state === portFilter)
        
        portsToShow.slice(0, 100).forEach((port, idx) => {
          checkNewPage(15)
          
          // Port header
          let portHeader = `Port ${port.port || idx + 1}`
          if (port.protocol) {
            portHeader += `/${port.protocol.toUpperCase()}`
          }
          if (port.state) {
            portHeader += ` [${port.state.toUpperCase()}]`
          }
          
          yPos = addText(portHeader, margin + 5, yPos, 11, 'bold', 'left', [0, 0, 0])
          yPos += 3
          
          // Service information
          if (port.service) {
            if (port.service.name) {
              checkNewPage(5)
              yPos = addText(`Service: ${port.service.name}`, margin + 10, yPos, 9, 'normal', 'left', [50, 50, 50])
              yPos += 4
            }
            if (port.service.product) {
              checkNewPage(5)
              yPos = addText(`Product: ${port.service.product}`, margin + 10, yPos, 9, 'normal', 'left', [50, 50, 50])
              yPos += 4
            }
            if (port.service.version) {
              checkNewPage(5)
              yPos = addText(`Version: ${port.service.version}`, margin + 10, yPos, 9, 'normal', 'left', [50, 50, 50])
              yPos += 4
            }
          }
          
          // HTTP Title
          if (port.http_title) {
            checkNewPage(5)
            yPos = addText(`HTTP Title: ${port.http_title}`, margin + 10, yPos, 9, 'normal', 'left', [50, 50, 50])
            yPos += 4
          }
          
          // SSL Certificate
          if (port.ssl_cert) {
            checkNewPage(5)
            yPos = addText('SSL Certificate:', margin + 10, yPos, 9, 'bold', 'left', [50, 50, 50])
            yPos += 3
            if (port.ssl_cert.subject) {
              checkNewPage(5)
              yPos = addText(`  Subject: ${port.ssl_cert.subject}`, margin + 15, yPos, 8, 'normal', 'left', [80, 80, 80])
              yPos += 3
            }
            if (port.ssl_cert.valid_from) {
              checkNewPage(5)
              yPos = addText(`  Valid From: ${port.ssl_cert.valid_from}`, margin + 15, yPos, 8, 'normal', 'left', [80, 80, 80])
              yPos += 3
            }
            if (port.ssl_cert.valid_until) {
              checkNewPage(5)
              yPos = addText(`  Valid Until: ${port.ssl_cert.valid_until}`, margin + 15, yPos, 8, 'normal', 'left', [80, 80, 80])
              yPos += 3
            }
          }
          
          // Reason
          if (port.reason) {
            checkNewPage(5)
            yPos = addText(`Reason: ${port.reason}`, margin + 10, yPos, 9, 'normal', 'left', [80, 80, 80])
            yPos += 4
          }
          
          yPos += 2
        })
        
        if (portsToShow.length > 100) {
          checkNewPage(5)
          yPos = addText(`... and ${portsToShow.length - 100} more ports`, margin + 5, yPos, 9, 'italic', 'left', [100, 100, 100])
          yPos += 4
        }
        yPos += 5
      }
      
      // Recommendations Section
      checkNewPage(15)
      yPos = addText('Recommendations', margin, yPos, 14, 'bold', 'left', [0, 0, 0])
      yPos += 5
      yPos = addText('1. Restrict management ports (SSH/RDP) to trusted IPs or VPN', margin, yPos, 10, 'normal', 'left', [50, 50, 50])
      yPos += 4
      yPos = addText('2. Patch and harden exposed services; disable weak ciphers and protocols', margin, yPos, 10, 'normal', 'left', [50, 50, 50])
      yPos += 4
      yPos = addText('3. Adopt "deny by default" at the perimeter; allow only necessary services', margin, yPos, 10, 'normal', 'left', [50, 50, 50])
      yPos += 4
      yPos = addText('4. Monitor for unexpected changes in exposed ports', margin, yPos, 10, 'normal', 'left', [50, 50, 50])
      yPos += 10
      
      // Update all footers
      updateAllFooters()
      
      // Save PDF
      const fileName = `port-scan-${(targetUrl || ipAddress || 'unknown').replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.pdf`
      doc.save(fileName)
    } catch (error) {
      console.error('PDF generation error:', error)
      showError(`Failed to generate PDF: ${error.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const formatElapsedTime = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  // Extract domain from URL
  const extractDomain = (url) => {
    try {
      let urlStr = url.trim()
      if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
        urlStr = `https://${urlStr}`
      }
      const urlObj = new URL(urlStr)
      return urlObj.hostname
    } catch {
      // If URL parsing fails, try to extract domain manually
      const cleaned = url.trim().replace(/^https?:\/\//, '').split('/')[0]
      return cleaned
    }
  }

  // Execute host command to get IP address
  const executeHostCommand = async (domain) => {
    addLog(`Executing: host ${domain}`, 'info')
    
    const cmd = `host ${domain}`
    
    if (!window.cyberGuard || !window.cyberGuard.runAsRoot) {
      throw new Error('Electron API not available')
    }

    try {
      const result = await window.cyberGuard.runAsRoot({ 
        command: 'bash -lc ' + JSON.stringify(cmd), 
        requireConfirm: false 
      })
      
      const output = result.stdout || ''
      const error = result.stderr || ''
      
      addLog(`Command output:`, 'info')
      if (output) {
        output.split('\n').forEach(line => {
          if (line.trim()) {
            addLog(line, 'info')
          }
        })
      }
      if (error) {
        error.split('\n').forEach(line => {
          if (line.trim()) {
            addLog(line, 'warning')
          }
        })
      }

      // Extract IP address from output
      // Look for pattern: "domain has address IP"
      const ipMatch = output.match(/has address\s+([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/i)
      
      if (ipMatch && ipMatch[1]) {
        const ip = ipMatch[1]
        setIpAddress(ip)
        addLog(`Extracted IP address: ${ip}`, 'success')
        return ip
      } else {
        throw new Error('Could not extract IP address from host command output')
      }
    } catch (error) {
      addLog(`Error executing host command: ${error.message}`, 'error')
      throw error
    }
  }

  // Execute nmap command with Python script
  const executeNmapCommand = async (ip) => {
    addLog(`Executing nmap scan on IP: ${ip}`, 'info')
    
    // Ensure parser file exists in /tmp and is executable
    const parserContent = `#!/usr/bin/env python3

"""
parse_nmap_by_state.py - compact nmap XML -> JSON grouped by open/closed/filtered

Usage:
  sudo nmap -Pn -p1-1024 -sS --script=http-title,ssl-cert -oX - TARGET \
    | ./parse_nmap_by_state.py         # parse explicit ports only
  sudo nmap -Pn -p- -sS --script=http-title,ssl-cert -oX - TARGET \
    | ./parse_nmap_by_state.py --expand-all   # expand to 1..65535 (large)
"""
from __future__ import annotations
import sys, json, xml.etree.ElementTree as ET
from typing import Dict, Any, Optional

def scripthash(port_elem):
    out={}
    for s in port_elem.findall('script'):
        out[s.get('id')]=s.get('output')
    return out or None

def ssl_from_scripts(scripts: Optional[Dict[str,str]]):
    if not scripts or 'ssl-cert' not in scripts: return None
    ssl={}
    for line in scripts['ssl-cert'].splitlines():
        line=line.strip()
        if line.lower().startswith('subject:'): ssl['subject']=line.split(':',1)[1].strip()
        if line.lower().startswith('not valid after:'): ssl['valid_until']=line.split(':',1)[1].strip()
        if line.lower().startswith('not valid before:'): ssl['valid_from']=line.split(':',1)[1].strip()
    return ssl or None

def parse(data:str, expand_all=False):
    if not data.strip(): sys.exit("No XML input from nmap")
    root=ET.fromstring(data)
    hosts=[]
    for host in root.findall('host'):
        addr=host.find('address'); ip=addr.get('addr') if addr is not None else None
        hn=host.find('hostnames/hostname'); hostname=hn.get('name') if hn is not None else None
        status_el=host.find('status'); status=status_el.get('state') if status_el is not None else None
        ports_el=host.find('ports')
        ports_map:Dict[int,Dict[str,Any]]={}
        extraports_state=None
        if ports_el is not None:
            for p in ports_el.findall('port'):
                try: portid=int(p.get('portid'))
                except: continue
                proto=p.get('protocol')
                st_el=p.find('state'); st=st_el.get('state') if st_el is not None else None
                reason=st_el.get('reason') if st_el is not None else None
                svc_el=p.find('service'); svc=None
                if svc_el is not None:
                    svc={"name":svc_el.get('name'), "product":svc_el.get('product'), "version":svc_el.get('version')}
                scripts=scripthash(p)
                ports_map[portid]={
                    "port":portid, "protocol":proto, "state":st, "reason":reason,
                    "service":svc, "http_title": (scripts.get('http-title') if scripts else None),
                    "ssl_cert": ssl_from_scripts(scripts), "scripts": scripts
                }
            ex=ports_el.find('extraports')
            if ex is not None:
                extraports_state=ex.get('state')
        if expand_all:
            default = extraports_state or "unknown"
            for pn in range(1,65536):
                if pn not in ports_map:
                    ports_map[pn]={
                        "port":pn,"protocol":"tcp","state":default,"reason":None,
                        "service":None,"http_title":None,"ssl_cert":None,"scripts":None
                    }
        groups={"open":[], "closed":[], "filtered":[]}
        for k in sorted(ports_map.keys()):
            p=ports_map[k]
            st=(p.get('state') or "").lower()
            if st=="open": groups["open"].append(p)
            elif st in ("filtered","open|filtered","closed|filtered"): groups["filtered"].append(p)
            elif st=="closed": groups["closed"].append(p)
            else:
                if extraports_state:
                    es=extraports_state.lower()
                    if es=="closed": groups["closed"].append(p)
                    elif es=="filtered": groups["filtered"].append(p)
                    else: groups["closed"].append(p)
                else:
                    groups["closed"].append(p)
        hosts.append({"ip":ip,"hostname":hostname,"status":status,"ports_by_state":groups})
    return {"nmap_scan":{"hosts":hosts}}

def main():
    argv=sys.argv[1:]; expand='--expand-all' in argv
    data=sys.stdin.read()
    out=parse(data, expand_all=expand)
    json.dump(out, sys.stdout, indent=2)

if __name__=='__main__':
    main()
`;

    // Write the parser file using base64 encoding to avoid escaping issues
    const parserBase64 = btoa(unescape(encodeURIComponent(parserContent)))
    
    if (!window.cyberGuard || !window.cyberGuard.runAsRoot) {
      throw new Error('Electron API not available')
    }

    try {
      // Step 1: Create the parser file (separate command to avoid command line length issues)
      addLog('Creating parser file at /tmp/parse_nmap.py', 'info')
      const createParserCmd = `echo '${parserBase64}' | base64 -d > /tmp/parse_nmap.py && chmod +x /tmp/parse_nmap.py`
      await window.cyberGuard.runAsRoot({ 
        command: 'bash -lc ' + JSON.stringify(createParserCmd), 
        requireConfirm: false 
      })
      addLog('Parser file created and made executable', 'success')
      
      // Step 2: Run the nmap scan (separate command)
      addLog(`Running: sudo nmap -Pn -p1-1024 -sS -sV --script=http-title,ssl-cert -T4 ${ip} -oX - | python3 /tmp/parse_nmap.py`, 'info')
      const nmapCmd = `sudo nmap -Pn -p1-1024 -sS -sV --script=http-title,ssl-cert -T4 ${ip} -oX - | python3 /tmp/parse_nmap.py`
      const result = await window.cyberGuard.runAsRoot({ 
        command: 'bash -lc ' + JSON.stringify(nmapCmd), 
        requireConfirm: false 
      })
      
      const output = result.stdout || ''
      const error = result.stderr || ''
      
      // Log output
      if (output) {
        addLog('Nmap scan completed', 'success')
        // Try to parse JSON output
        try {
          const jsonOutput = JSON.parse(output)
          // Normalize output: if ports_by_state provided, flatten to a single ports array for UI
          try {
            const cloned = JSON.parse(JSON.stringify(jsonOutput))
            const host = cloned?.nmap_scan?.hosts?.[0]
            if (host) {
              let ports = []
              if (host.ports_by_state) {
                const groups = host.ports_by_state
                ;['open','closed','filtered'].forEach(state => {
                  const arr = Array.isArray(groups[state]) ? groups[state] : []
                  arr.forEach(p => {
                    if (!p.state) p.state = state
                  })
                  ports = ports.concat(arr)
                })
              } else {
                ports = Array.isArray(host.ports) ? host.ports : []
              }
              const existingSet = new Set(ports.map(p => Number(p.port)))
              // Determine default state from extraports if available
              const extra = Array.isArray(host.extraports) && host.extraports.length > 0 ? host.extraports[0] : null
              // Prefer nmap's aggregated state; otherwise assume closed for non-listed ports
              const defaultState = extra?.state || 'closed'
              // Expand up to full TCP range for user filtering
              const maxPort = 65535
              let added = 0
              if (defaultState) {
                for (let n = 1; n <= maxPort; n++) {
                  if (!existingSet.has(n)) {
                    ports.push({
                      port: n,
                      protocol: 'tcp',
                      state: defaultState,
                      reason: null,
                      reason_ttl: null,
                      service: null,
                      http_title: null,
                      ssl_cert: null,
                      scripts: null
                    })
                    added++
                  }
                }
                // Sort ports ascending
                ports.sort((a, b) => (Number(a.port) || 0) - (Number(b.port) || 0))
              }
              cloned.nmap_scan.hosts[0].ports = ports
              setScanResult(cloned)
              // Recompute summary after expansion
              try {
                const openCount = ports.filter(p => p.state === 'open').length
                const closedCount = ports.filter(p => p.state === 'closed').length
                const filteredCount = ports.filter(p => p.state === 'filtered').length
                addLog(`JSON results parsed successfully (expanded ${added} ports as ${defaultState}). Summary: open=${openCount}, closed=${closedCount}, filtered=${filteredCount}`, 'success')
              } catch {
                addLog(`JSON results parsed successfully (expanded ${added} ports as ${defaultState})`, 'success')
              }
            } else {
              setScanResult(jsonOutput)
              addLog('JSON results parsed successfully', 'success')
            }
          } catch (e) {
            // Fallback to original result if expansion fails
            setScanResult(jsonOutput)
            addLog('JSON results parsed successfully', 'success')
          }
          
          // Log summary
          if (jsonOutput.nmap_scan && jsonOutput.nmap_scan.hosts && jsonOutput.nmap_scan.hosts.length > 0) {
            const host = jsonOutput.nmap_scan.hosts[0]
            const openPorts = host.ports?.filter(p => p.state === 'open').length || 0
            const closedPorts = host.ports?.filter(p => p.state === 'closed').length || 0
            const filteredPorts = host.ports?.filter(p => p.state === 'filtered').length || 0
            addLog(`Found ${openPorts} open, ${closedPorts} closed, ${filteredPorts} filtered ports`, 'info')
          }
        } catch (parseError) {
          addLog(`Error parsing JSON: ${parseError.message}`, 'error')
          addLog(`Raw output (first 500 chars): ${output.substring(0, 500)}`, 'warning')
        }
      }
      
      if (error) {
        error.split('\n').forEach(line => {
          if (line.trim()) {
            addLog(line, 'warning')
          }
        })
      }
      
      return output
    } catch (error) {
      addLog(`Error executing nmap command: ${error.message}`, 'error')
      throw error
    }
  }

  const handleStartScan = async () => {
    if (!targetUrl.trim()) {
      showError('Please enter a target URL')
      return
    }

    // Reset state
    setIsScanning(true)
    setLogs([])
    setScanResult(null)
    setIpAddress(null)
    setStartTime(Date.now())
    setEndTime(null)
    setElapsedTime(0)

    const startDateTime = new Date()
    addLog(`=== Port Scan Started ===`, 'info')
    addLog(`Start Date & Time: ${startDateTime.toLocaleString()}`, 'info')
    addLog(`Target URL: ${targetUrl}`, 'info')

    try {
      // Step 1: Extract domain and execute host command
      const domain = extractDomain(targetUrl)
      addLog(`Extracted domain: ${domain}`, 'info')
      
      const ip = await executeHostCommand(domain)
      
      if (!ip) {
        throw new Error('Failed to get IP address from host command')
      }

      // Step 2: Execute nmap command
      await executeNmapCommand(ip)

      // Scan completed
      const endDateTime = new Date()
      setEndTime(endDateTime.getTime())
      const finalElapsed = endDateTime.getTime() - startDateTime.getTime()
      setElapsedTime(finalElapsed)
      
      addLog(`=== Port Scan Completed ===`, 'success')
      addLog(`End Date & Time: ${endDateTime.toLocaleString()}`, 'info')
      addLog(`Total Elapsed Time: ${formatElapsedTime(finalElapsed)}`, 'info')
      
      showSuccess('Port scan completed successfully!')
      
      // Send notification
      if (window.cyberGuard?.showNotification) {
        try {
          window.cyberGuard.showNotification({
            title: 'Port Scan Completed',
            body: `Port scan for ${targetUrl || ipAddress || 'target'} has been completed successfully.`,
            viewId: 'port-scan'
          }).catch(err => {
            console.log('Notification not available:', err?.message || 'Unknown error')
          })
        } catch (err) {
          console.log('Notification not available:', err?.message || 'Unknown error')
        }
      }
    } catch (error) {
      const endDateTime = new Date()
      setEndTime(endDateTime.getTime())
      const finalElapsed = endDateTime.getTime() - startDateTime.getTime()
      setElapsedTime(finalElapsed)
      
      addLog(`=== Port Scan Failed ===`, 'error')
      addLog(`Error: ${error.message}`, 'error')
      addLog(`End Date & Time: ${endDateTime.toLocaleString()}`, 'info')
      addLog(`Total Elapsed Time: ${formatElapsedTime(finalElapsed)}`, 'info')
      
      showError(`Port scan failed: ${error.message}`)
    } finally {
      setIsScanning(false)
    }
  }

  // Get filtered ports
  const getFilteredPorts = () => {
    if (!scanResult || !scanResult.nmap_scan || !scanResult.nmap_scan.hosts || scanResult.nmap_scan.hosts.length === 0) {
      return []
    }

    const host = scanResult.nmap_scan.hosts[0]
    const ports = host.ports || []

    if (portFilter === 'all') {
      return ports
    } else {
      return ports.filter(p => p.state === portFilter)
    }
  }

  const filteredPorts = getFilteredPorts()
  const totalPages = Math.max(1, Math.ceil(filteredPorts.length / pageSize))
  const pageStart = (currentPage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginatedPorts = filteredPorts.slice(pageStart, pageEnd)

  const goPrev = () => setCurrentPage(p => {
    const next = Math.max(1, p - 1)
    setPageInput(String(next))
    return next
  })
  const goNext = () => setCurrentPage(p => {
    const next = Math.min(totalPages, p + 1)
    setPageInput(String(next))
    return next
  })
  const applyPageInput = () => {
    const n = parseInt(pageInput, 10)
    if (!Number.isNaN(n)) {
      const clamped = Math.min(Math.max(1, n), totalPages)
      setCurrentPage(clamped)
      setPageInput(String(clamped))
    } else {
      setPageInput(String(currentPage))
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-6 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Port Scanning</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">Identify open ports and running services on target hosts</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Filters aligned right & only visible when results exist */}
            {scanResult?.nmap_scan?.hosts?.length > 0 && (
              <div className="hidden sm:flex space-x-2 mr-2 bg-white/50 dark:bg-gray-800/50 rounded-lg p-1 backdrop-blur-sm">
                <button
                  onClick={() => setPortFilter('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm ${
                    portFilter === 'all'
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/50 scale-105'
                      : 'bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:scale-105'
                  }`}
                >
                  All Ports
                </button>
                <button
                  onClick={() => setPortFilter('open')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm ${
                    portFilter === 'open'
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/50 scale-105'
                      : 'bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:scale-105'
                  }`}
                >
                  Open
                </button>
                <button
                  onClick={() => setPortFilter('closed')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm ${
                    portFilter === 'closed'
                      ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/50 scale-105'
                      : 'bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:scale-105'
                  }`}
                >
                  Closed
                </button>
                <button
                  onClick={() => setPortFilter('filtered')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-sm ${
                    portFilter === 'filtered'
                      ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-lg shadow-yellow-500/50 scale-105'
                      : 'bg-white/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 hover:scale-105'
                  }`}
                >
                  Filtered
                </button>
              </div>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200"
              title="About this scan"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Input and Start Button */}
        <div className="flex items-center space-x-4">
          <input
            type="text"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="Enter target URL (e.g., https://webnox.in)"
            disabled={isScanning}
            className="flex-1 px-5 py-3 border-2 border-gray-300/50 dark:border-gray-600/50 rounded-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:focus:border-orange-400 transition-all shadow-sm hover:shadow-md disabled:opacity-50"
          />
          <button
            onClick={handleStartScan}
            disabled={isScanning || !targetUrl.trim()}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:via-amber-600 hover:to-orange-700 text-white rounded-xl font-bold transition-all duration-200 shadow-xl hover:shadow-2xl hover:shadow-orange-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-xl flex items-center space-x-2 transform hover:scale-105 disabled:hover:scale-100"
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Scanning...</span>
              </>
            ) : (
              <span>Start Scan</span>
            )}
          </button>
        </div>

        {/* Timing Information */}
        {startTime && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Start Date & Time</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {new Date(startTime).toLocaleString()}
              </div>
            </div>
            {isScanning && (
              <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Elapsed Time</div>
                <div className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                  {formatElapsedTime(elapsedTime)}
                </div>
              </div>
            )}
            {endTime && (
              <>
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">End Date & Time</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Date(endTime).toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Elapsed Time</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {formatElapsedTime(elapsedTime)}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-4xl bg-gradient-to-br from-white/95 via-white/90 to-gray-50/95 dark:from-gray-900/95 dark:via-gray-800/90 dark:to-gray-900/95 rounded-2xl shadow-2xl border-2 border-white/30 dark:border-gray-700/50 p-8 max-h-[85vh] overflow-y-auto backdrop-blur-xl animate-slideUp">
            <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-gray-200 dark:border-gray-700">
              <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">About Port Scanning</h3>
              <button 
                onClick={() => setShowHelp(false)} 
                className="w-10 h-10 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 hover:from-red-100 hover:to-red-200 dark:hover:from-red-900 dark:hover:to-red-800 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 flex items-center justify-center font-bold"
              >
                ×
              </button>
            </div>
            <div className="prose prose-lg dark:prose-invert max-w-none space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-5 rounded-xl border border-blue-200 dark:border-blue-800">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed mb-0">
                  Port scanning identifies which network services are reachable on a machine. Each TCP port maps to a protocol or application 
                  <span className="font-mono bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded mx-1">(for example: 22/ssh, 80/http, 443/https)</span>. 
                  Understanding exposure helps you reduce risk and validate firewall policies.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Why it matters
                </h4>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="font-bold text-orange-600 dark:text-orange-400">Attack surface:</span>
                    <span>Open ports are entry points. Keep only what you need.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-bold text-blue-600 dark:text-blue-400">Validation:</span>
                    <span>Confirm firewall rules and service hardening are effective.</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="font-bold text-purple-600 dark:text-purple-400">Troubleshooting:</span>
                    <span>Distinguish service issues from network filtering.</span>
                  </li>
                </ul>
              </div>
              
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  States explained
                </h4>
                <div className="space-y-3">
                  <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border-l-4 border-green-500">
                    <p className="mb-0"><strong className="text-green-700 dark:text-green-300">Open:</strong> A service is listening. Review product/version and apply patches, strong TLS, and authentication.</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border-l-4 border-red-500">
                    <p className="mb-0"><strong className="text-red-700 dark:text-red-300">Closed:</strong> No service is listening, but the host answered. A good default for unused ports.</p>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border-l-4 border-yellow-500">
                    <p className="mb-0"><strong className="text-yellow-700 dark:text-yellow-300">Filtered:</strong> A firewall dropped the probe. The service may be hidden or blocked by policy.</p>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  How this tool works
                </h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  We run <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-mono">nmap</code>, parse the XML results, and render a paginated table. 
                  When nmap summarizes unlisted ports via <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded font-mono">extraports</code>, we conservatively expand them 
                  for filtering and pagination without freezing the UI.
                </p>
              </div>
              
              <div>
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Recommendations
                </h4>
                <ul className="space-y-2 text-gray-700 dark:text-gray-300 list-disc list-inside marker:text-orange-500">
                  <li>Restrict management ports <span className="font-mono">(SSH/RDP)</span> to trusted IPs or VPN.</li>
                  <li>Patch and harden exposed services; disable weak ciphers and protocols.</li>
                  <li>Adopt <span className="font-semibold">"deny by default"</span> at the perimeter; allow only necessary services.</li>
                  <li>Monitor for unexpected changes in exposed ports.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Logs Section */}
      {logs.length > 0 && (
        <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-6 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scan Logs</h3>
            <div className="flex space-x-2">
              <button
                onClick={copyLogs}
                className="w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-sm hover:shadow-md"
                title="Copy Logs"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={clearLogs}
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
            className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto"
          >
            {logs.map(log => (
              <div key={log.id} className="mb-1">
                <span className="text-gray-500">[{log.timestamp}]</span>
                <span className={`ml-2 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  'text-blue-400'
                }`}>
                  [{log.type.toUpperCase()}]
                </span>
                <span className="ml-2">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results Section */}
      {scanResult && (
        <div className="rounded-2xl shadow-2xl border border-gray-200/80 dark:border-white/20 p-6 bg-gradient-to-br from-gray-50/90 via-white/85 to-gray-50/90 dark:from-slate-800/60 dark:via-slate-800/50 dark:to-slate-900/40 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Scan Results</h3>
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
            
            {/* Filter Buttons */}
            <div className="flex space-x-2">
              <button
                onClick={() => setPortFilter('all')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  portFilter === 'all'
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                All Ports
              </button>
              <button
                onClick={() => setPortFilter('open')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  portFilter === 'open'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Open
              </button>
              <button
                onClick={() => setPortFilter('closed')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  portFilter === 'closed'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Closed
              </button>
              <button
                onClick={() => setPortFilter('filtered')}
                className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                  portFilter === 'filtered'
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                Filtered
              </button>
            </div>
          </div>

          {/* Extraports Summary (if available) */}
          {scanResult?.nmap_scan?.hosts?.[0]?.extraports && scanResult.nmap_scan.hosts[0].extraports.length > 0 && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Extraports Summary</h4>
              <div className="space-y-1">
                {scanResult.nmap_scan.hosts[0].extraports.map((extra, idx) => (
                  <div key={idx} className="text-sm text-gray-700 dark:text-gray-300">
                    <span className="font-medium">{extra.count || 0} ports</span> in <span className="font-medium">{extra.state || 'unknown'}</span> state
                    {extra.reasons && extra.reasons.length > 0 && (
                      <span className="text-gray-500 dark:text-gray-400"> ({extra.reasons.join(', ')})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results Table */}
          <div className="overflow-x-auto rounded-xl shadow-inner bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-gray-100/80 to-gray-50/80 dark:from-gray-800/80 dark:to-gray-900/80 backdrop-blur-sm">
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Port</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Protocol</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">State</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Reason</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Service</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">Version</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">HTTP Title</th>
                  <th className="px-4 py-3 text-left border-b border-gray-300/50 dark:border-gray-700/50 text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">SSL Cert</th>
                </tr>
              </thead>
              <tbody>
                {filteredPorts.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-4 py-12 text-center text-gray-500 dark:text-gray-400 text-lg">
                      No ports found with selected filter
                    </td>
                  </tr>
                ) : (
                  paginatedPorts.map((port, index) => (
                    <tr key={index} className="hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-purple-50/50 dark:hover:from-blue-900/20 dark:hover:to-purple-900/20 transition-all duration-200 border-b border-gray-200/30 dark:border-gray-700/30">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 font-mono font-semibold">
                        {port.port}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs">{port.protocol || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold shadow-sm transition-all ${
                          port.state === 'open' ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-green-500/50' :
                          port.state === 'closed' ? 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-red-500/50' :
                          port.state === 'filtered' ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-yellow-500/50' :
                          'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {port.state || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="flex items-center gap-1">
                          {port.reason || '-'}
                          {port.reason_ttl && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">TTL: {port.reason_ttl}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded font-medium">{port.service?.name || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div>
                          <span className="font-medium">{port.service?.product || '-'}</span>
                          {port.service?.extrainfo && (
                            <span className="text-xs text-gray-600 dark:text-gray-400 block mt-1">{port.service.extrainfo}</span>
                          )}
                          {port.service?.ostype && (
                            <span className="text-xs text-gray-600 dark:text-gray-400 block mt-1">OS: {port.service.ostype}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {port.service?.version || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        <div className="max-w-xs truncate font-medium" title={port.http_title || ''}>
                          {port.http_title || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {port.ssl_cert ? (
                          <details className="cursor-pointer">
                            <summary className="text-blue-600 dark:text-blue-400 hover:underline">Yes</summary>
                            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                              <div><strong>Subject:</strong> {port.ssl_cert.subject || 'N/A'}</div>
                              <div><strong>Valid From:</strong> {port.ssl_cert.valid_from || 'N/A'}</div>
                              <div><strong>Valid Until:</strong> {port.ssl_cert.valid_until || 'N/A'}</div>
                            </div>
                          </details>
                        ) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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

        {/* Bottom Pagination */}
        <div className="mt-6 flex items-center justify-end gap-4 bg-gradient-to-r from-gray-50/50 to-transparent dark:from-gray-800/50 dark:to-transparent p-4 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-2 bg-white/70 dark:bg-gray-800/70 px-3 py-2 rounded-lg shadow-sm">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Rows:</span>
            <select
              className="px-3 py-1.5 rounded-lg border-2 border-gray-300/50 dark:border-gray-600/50 bg-white dark:bg-gray-700 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all cursor-pointer"
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); setPageInput('1') }}
            >
              {[10,25,50,75,100].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white/70 dark:bg-gray-800/70 px-4 py-2 rounded-lg shadow-sm">
            <button
              onClick={goPrev}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-xs shadow-sm hover:shadow-md hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 px-2">
              <input
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={applyPageInput}
                onKeyDown={(e) => { if (e.key === 'Enter') applyPageInput() }}
                className="w-14 px-2 py-1.5 rounded-lg border-2 border-gray-300/50 dark:border-gray-600/50 bg-white dark:bg-gray-700 text-center font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
              />
              <span className="text-gray-500 dark:text-gray-400">/</span>
              <span>{totalPages}</span>
            </div>
            <button
              onClick={goNext}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-300 font-semibold text-xs shadow-sm hover:shadow-md hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
            >
              Next →
            </button>
          </div>
        </div>

          {/* Raw JSON view removed per requirements */}
        </div>
      )}
    </div>
  )
}

export default PortScanning
