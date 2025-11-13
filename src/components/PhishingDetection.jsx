<<<<<<< HEAD
import React, { useState, useEffect, useRef } from 'react';
import { getSecurePassword } from '../utils/securePasswordStorage';
import { useGlobalScanState } from '../context/GlobalScanContext';

function PhishingDetection() {
  // State management
  const [url, setUrl] = useState('https://example.com');
  const [scanResults, setScanResults] = useState(null);
  const [readableText, setReadableText] = useState(null);
  const [kaliStatus, setKaliStatus] = useState('Checking...');

  // Local state for scanning
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [dnstwistInstall, setDnstwistInstall] = useState({ installing: false, progress: 0, error: null, done: false });
  const [askPassword, setAskPassword] = useState(false);
  const [rootPassword, setRootPassword] = useState('');
  const logContainerRef = React.useRef(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showOverview, setShowOverview] = useState(true);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  
  // Timing state
  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expectedCompletionTime, setExpectedCompletionTime] = useState(null);
  const timerRef = useRef(null);
  const scanIdRef = useRef(null);
  
  // Global scan state for notifications and floating window
  const { registerScan, updateScan, completeScan, stopScan } = useGlobalScanState();

  // Initialize component
  useEffect(() => {
    checkKaliStatus();
  }, []);

  // Timer - keep running during scan
  useEffect(() => {
    if (isScanning && startTime && !endTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setElapsedTime(elapsed);
        // Update expected completion time (phishing scans typically take 1-2 minutes)
        const expected = startTime + (2 * 60 * 1000); // 2 minutes from start
        setExpectedCompletionTime(expected);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isScanning, startTime, endTime]);

  // Format elapsed time
  const formatElapsedTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Format date/time
  const formatDateTime = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // Check Kali Linux status
  const checkKaliStatus = async () => {
    try {
      if (window.cyberGuard) {
        const isInstalled = await window.cyberGuard.checkKali();
        setKaliStatus(isInstalled ? 'Kali Linux is installed' : 'Kali Linux is not installed');
      } else {
        setKaliStatus('Scanning system not available (development mode)');
      }
    } catch (error) {
      setKaliStatus('Unable to check Kali status');
      console.error('Kali check error:', error);
    }
  };

  // Validate URL and start phishing scan with real dnstwist
  const handleStartScan = async () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      alert('Invalid URL format. Please enter a valid URL (e.g., https://example.com)');
      return;
    }

    // Resolve password: prefer stored root password in main; fallback to secure storage; otherwise prompt
    let password = null;
    try { password = await window.cyberGuard?.getStoredRootPassword?.(); } catch {}
    if (!password) password = getSecurePassword();
    if (!password) { setAskPassword(true); return; }

    // Start real phishing scan with dnstwist
    const scanStartTime = Date.now();
    setIsScanning(true);
    setStartTime(scanStartTime);
    setEndTime(null);
    setElapsedTime(0);
    setProgress(0);
    setProgressMessage('Initializing dnstwist phishing detection engine...');
    setLogs((l) => [...l, 'Starting phishing scan', 'Initializing dnstwist engine']);
    setScanResults(null);
    setReadableText(null);

    // Register scan in global state for floating window and notifications
    const scanId = registerScan({
      scanType: 'Phishing & Brand Abuse Detection',
      target: url.trim(),
      progress: 0,
      message: 'Initializing dnstwist phishing detection engine...',
      startTime: new Date(scanStartTime).toISOString(),
      viewId: 'phishing-scan',
      onStop: async () => {
        setIsScanning(false);
        setEndTime(Date.now());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        stopScan(scanId);
      },
      onView: () => {
        if (window.cyberGuard?.navigateToView) {
          window.cyberGuard.navigateToView('phishing-scan');
        }
      }
    });
    scanIdRef.current = scanId;

    await startRealPhishingScan(url, password, scanId);
  };

  // Real phishing scan implementation using dnstwist
  const startRealPhishingScan = async (targetUrl, password, scanId) => {
    let logListener = null;
    try {
      // Clear logs at start
      setLogs([]);
      
      // Subscribe to live log stream from main process
      const wrappedListener = (line) => {
        const cleanLine = String(line || '').trim();
        if (cleanLine) {
          setLogs((l) => {
            const newLogs = [...l, cleanLine];
            // Auto-scroll to bottom when new log arrives
            setTimeout(() => {
              if (logContainerRef.current) {
                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
              }
            }, 10);
            return newLogs;
          });
        }
      };
      logListener = window.cyberGuard?.onPhishingLog?.(wrappedListener);
      // Progress steps for real dnstwist scan
      const steps = [
        { progress: 5, message: 'Initializing dnstwist phishing detection engine...' },
        { progress: 10, message: 'Extracting domain from target URL...' },
        { progress: 20, message: 'Checking dnstwist installation...' },
        { progress: 30, message: 'Running dnstwist domain fuzzing analysis...' },
        { progress: 50, message: 'Generating typosquatting variations...' },
        { progress: 70, message: 'Checking DNS records for suspicious domains...' },
        { progress: 85, message: 'Analyzing active phishing threats...' },
        { progress: 95, message: 'Generating comprehensive phishing threat report...' }
      ];

      // Update progress
      for (const step of steps.slice(0, 3)) {
        setProgress(step.progress);
        setProgressMessage(step.message);
        setLogs((l) => [...l, `${step.message}`]);
        // Update global scan state
        if (scanId) {
          updateScan(scanId, {
            progress: step.progress,
            message: step.message
          });
        }
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Check if dnstwist API is available
      if (!window.cyberGuard || !window.cyberGuard.runDnstwist) {
        throw new Error('dnstwist API not available. Please ensure the application is running properly.');
      }

      setProgress(30);
      setProgressMessage('Running dnstwist domain fuzzing analysis...');
      setLogs((l) => [...l, 'Executing dnstwist via WSL']);
      if (scanId) {
        updateScan(scanId, {
          progress: 30,
          message: 'Running dnstwist domain fuzzing analysis...'
        });
      }

      // Call real dnstwist API
      const result = await window.cyberGuard.runDnstwist(targetUrl, password);

      setProgress(70);
      setProgressMessage('Analyzing results and generating threat assessment...');
      setLogs((l) => [...l, 'Parsing dnstwist output']);
      if (scanId) {
        updateScan(scanId, {
          progress: 70,
          message: 'Analyzing results and generating threat assessment...'
        });
      }

      // Wait a moment for progress update
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!result.success) {
        if (!result.installed) {
          throw new Error('dnstwist is not installed. Please install it via: sudo apt install dnstwist');
        }
        throw new Error(result.error || 'dnstwist scan failed');
      }

      setProgress(95);
      setProgressMessage('Generating comprehensive phishing threat report...');
      setLogs((l) => [...l, 'Building report']);
      if (scanId) {
        updateScan(scanId, {
          progress: 95,
          message: 'Generating comprehensive phishing threat report...'
        });
      }

      // Use real results from dnstwist
      const scanResults = result.results;

      // Add additional findings based on domain variations
      const additionalFindings = [];

      // Add visual similarity finding if many active domains
      if (scanResults.statistics.active_domains > 0) {
        additionalFindings.push({
          type: 'Phishing Threat Intelligence',
          severity: scanResults.statistics.active_domains > 5 ? 'High' : 'Medium',
          evidence: `Found ${scanResults.statistics.active_domains} active domain variations with DNS records. These could be used for phishing attacks targeting ${scanResults.target_domain}.`,
          suspicious_domains: scanResults.domain_variations
            .filter(v => v.active)
            .slice(0, 5)
            .map(v => v.domain)
        });
      }

      // Add typosquatting finding
      if (scanResults.statistics.total_variations > 0) {
        additionalFindings.push({
          type: 'Domain Typosquatting Detection',
          severity: scanResults.statistics.total_variations > 10 ? 'High' : scanResults.statistics.total_variations > 5 ? 'Medium' : 'Low',
          evidence: `Generated ${scanResults.statistics.total_variations} potential typosquatting variations. ${scanResults.statistics.active_domains} variations have active DNS records.`,
          count: scanResults.statistics.total_variations,
          active_count: scanResults.statistics.active_domains
        });
      }

      // Merge additional findings with existing findings
      const allFindings = [...scanResults.findings, ...additionalFindings];

      // Build final results object
      const finalResults = {
        target_url: scanResults.target_url,
        target_domain: scanResults.target_domain,
        timestamp: scanResults.timestamp,
        threat_score: scanResults.threat_score,
        findings: allFindings,
        domain_variations: scanResults.domain_variations,
        statistics: scanResults.statistics,
        recommendations: scanResults.recommendations,
        screenshots: scanResults.screenshots || [], // Preserve screenshots if available
        evidence: {
          scan_tool: 'dnstwist',
          scan_method: 'Comprehensive typosquatting detection with visual/content analysis',
          raw_data: scanResults
        }
      };

      setProgress(100);
      setProgressMessage('Phishing detection analysis complete!');
      setLogs((l) => [...l, 'Scan complete']);
      const scanEndTime = Date.now();
      
      // Update global scan state to 100%
      if (scanId) {
        updateScan(scanId, {
          progress: 100,
          message: 'Phishing detection analysis complete!'
        });
      }
      
      // Wait a moment before showing results
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete the scan
      setIsScanning(false);
      setEndTime(scanEndTime);
      setProgress(0);
      setProgressMessage('');
      setScanResults(finalResults);
      
      // Complete scan in global state (this triggers notification and floating window update)
      if (scanId) {
        completeScan(scanId, finalResults);
        scanIdRef.current = null;
      }
      
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Convert JSON to readable text using tgpt
      try {
        setLogs((l) => [...l, 'Converting results to readable format...']);
        if (window.cyberGuard && window.cyberGuard.convertPhishingJsonToText) {
          const conversionResult = await window.cyberGuard.convertPhishingJsonToText(finalResults);
          if (conversionResult && conversionResult.success) {
            setReadableText(conversionResult.readableText);
            setLogs((l) => [...l, 'Results converted to readable format']);
          } else {
            setLogs((l) => [...l, 'Could not convert results (using fallback format)']);
          }
        }
      } catch (conversionError) {
        console.log('Error converting JSON to text:', conversionError);
        setLogs((l) => [...l, 'Error converting results to readable format']);
      }
      
      // Clean up log listener
      if (logListener && typeof logListener === 'function') {
        try {
          logListener();
        } catch {}
      }

    } catch (error) {
      console.error('Phishing scan error:', error);
      setLogs((l) => [...l, `[ERROR] ${error.message}`]);
      setIsScanning(false);
      setEndTime(Date.now());
      setProgress(0);
      setProgressMessage('');
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // Stop scan in global state
      if (scanIdRef.current) {
        stopScan(scanIdRef.current);
        scanIdRef.current = null;
      }
      // Surface inline guidance for missing dnstwist
      if (/dnstwist\s+is\s+not\s+installed/i.test(error.message || '')) {
        setDnstwistInstall({ installing: false, progress: 0, error: null, done: false });
      }
      // Clean up log listener on error
      if (logListener && typeof logListener === 'function') {
        try {
          logListener();
        } catch {}
      }
      alert(`Phishing scan failed: ${error.message}`);
    }
  };

  // Install dnstwist on demand with progress logs
  const installDnstwist = async () => {
    try {
      setDnstwistInstall({ installing: true, progress: 0, error: null, done: false });
      setLogs((l) => [...l, 'Installing dnstwist via apt...']);
      const handler = (payload) => {
        if (!payload) return;
        // payload: { tool, progress, message }
        if (payload.tool !== 'dnstwist') return;
        setDnstwistInstall((s) => ({ ...s, progress: Math.max(s.progress, payload.progress ?? s.progress) }));
        if (payload.message) setLogs((l) => [...l, `dnstwist: ${payload.message}`]);
      };
      window.cyberGuard?.onToolsInstallProgress?.(handler);
      // Ensure password exists
      let pwd = null;
      try { pwd = await window.cyberGuard?.getStoredRootPassword?.(); } catch {}
      if (!pwd) pwd = getSecurePassword();
      if (!pwd) { setAskPassword(true); setDnstwistInstall((s)=>({ ...s, installing: false })); return; }
      await window.cyberGuard?.installSingleTool?.('dnstwist', pwd);
      setDnstwistInstall({ installing: false, progress: 100, error: null, done: true });
      setLogs((l) => [...l, 'dnstwist installed. You can re-run the scan.']);
    } catch (e) {
      setDnstwistInstall({ installing: false, progress: 0, error: e?.message || String(e), done: false });
      setLogs((l) => [...l, `dnstwist install failed: ${e?.message || e}`]);
    }
  };

  // Download PDF report
  const downloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;

      // Header with company branding
      doc.setFillColor(220, 38, 38); // Red background
      doc.rect(0, 0, pageWidth, 30, 'F');
      
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Advanced Phishing Detection Report', pageWidth / 2, 20, { align: 'center' });
      
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

      // Report Information Table
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('REPORT INFORMATION', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const reportData = [
        ['Report ID', `PH-${Date.now()}`],
        ['Scan Date', new Date().toLocaleString()],
        ['Target URL', scanResults.target_url],
        ['Scan Type', 'Phishing Detection Analysis'],
        ['Risk Level', riskLevel],
        ['Threat Score', `${scanResults.threat_score}/100`]
      ];

      reportData.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(`${label}:`, 20, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(value, 80, yPosition);
        yPosition += 6;
      });
      yPosition += 10;

      // Threat Assessment Section
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('THREAT ASSESSMENT', 20, yPosition);
      yPosition += 8;

      // Risk level indicator
      const riskColor = scanResults.threat_score <= 30 ? [34, 197, 94] : 
                       scanResults.threat_score <= 60 ? [234, 179, 8] : [239, 68, 68];
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.rect(20, yPosition, 30, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(riskLevel, 35, yPosition + 6, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.text(`Score: ${scanResults.threat_score}/100`, 60, yPosition + 6);
      yPosition += 15;

      // Security Findings
      if (scanResults.findings && scanResults.findings.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('SECURITY FINDINGS', 20, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        scanResults.findings.forEach((finding, index) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = 20;
          }
          
          // Finding header with severity indicator
          const severityColor = finding.severity === 'High' ? [239, 68, 68] :
                               finding.severity === 'Medium' ? [234, 179, 8] : [34, 197, 94];
          doc.setFillColor(severityColor[0], severityColor[1], severityColor[2]);
          doc.rect(20, yPosition - 2, 15, 6, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text(finding.severity.toUpperCase(), 27, yPosition + 2, { align: 'center' });
          
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(`${index + 1}. ${finding.type}`, 40, yPosition);
          yPosition += 6;
          
          doc.setFont(undefined, 'normal');
          const evidenceLines = doc.splitTextToSize(`Evidence: ${finding.evidence}`, pageWidth - 50);
          doc.text(evidenceLines, 40, yPosition);
          yPosition += evidenceLines.length * 4 + 8;
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

    // Domain Variations Table
    if (Array.isArray(scanResults.domain_variations) && scanResults.domain_variations.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`DOMAIN VARIATIONS (${scanResults.domain_variations.length})`, 20, yPosition);
      yPosition += 8;

      // Table headers
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Domain', 20, yPosition);
      doc.text('Active', 110, yPosition);
      doc.text('A/MX/NS', 140, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      const rowsPerPage = 30;
      let rowCounter = 0;
      for (const v of scanResults.domain_variations) {
        const aCnt = Array.isArray(v.dns_a) ? v.dns_a.length : (v.a?.length || 0);
        const mxCnt = Array.isArray(v.dns_mx) ? v.dns_mx.length : (v.mx?.length || 0);
        const nsCnt = Array.isArray(v.dns_ns) ? v.dns_ns.length : (v.ns?.length || 0);

        doc.text(String(v.domain || v.domain_name || ''), 20, yPosition, { maxWidth: 80 });
        doc.text(v.active ? 'Yes' : 'No', 110, yPosition);
        doc.text(`${aCnt}/${mxCnt}/${nsCnt}`, 140, yPosition);
        yPosition += 5;
        rowCounter += 1;

        if (rowCounter % rowsPerPage === 0 && yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 20;
        }
      }
    }

      // Screenshots Section
      if (scanResults.screenshots && Array.isArray(scanResults.screenshots) && scanResults.screenshots.length > 0) {
        if (yPosition > pageHeight - 80) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`VISUAL SIMILARITY ANALYSIS - SCREENSHOTS (${scanResults.screenshots.length})`, 20, yPosition);
        yPosition += 10;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text('These screenshots show visual similarity between suspicious domains and the original.', 20, yPosition);
        yPosition += 8;

        // Process screenshots
        const screenshotsPerRow = 2;
        const imageWidth = (pageWidth - 50) / screenshotsPerRow;
        const imageHeight = 60;
        let currentRow = 0;
        let currentCol = 0;

        scanResults.screenshots.forEach((screenshot, idx) => {
          // Check if we need a new page
          if (yPosition + imageHeight + 30 > pageHeight) {
            doc.addPage();
            yPosition = 20;
            currentRow = 0;
            currentCol = 0;
          }

          // Calculate position
          const xPos = 20 + (currentCol * (imageWidth + 10));
          
          // Find matching domain variation for info
          const matchingVar = scanResults.domain_variations?.find(
            v => (v.domain || v.domain_name) === screenshot.domain
          );
          const phashSim = matchingVar?.phash_similarity || matchingVar?.phash;
          const riskScore = matchingVar?.risk_score || 0;

          try {
            // Add screenshot image
            if (screenshot.base64) {
              // Convert base64 to image data
              const imgData = 'data:image/png;base64,' + screenshot.base64;
              
              // Add image with proper sizing
              doc.addImage(imgData, 'PNG', xPos, yPosition, imageWidth, imageHeight, undefined, 'FAST');
              
              // Add domain name and info below image
              doc.setFontSize(8);
              doc.setFont(undefined, 'bold');
              const domainName = (screenshot.domain || 'Unknown').substring(0, 25);
              doc.text(domainName, xPos, yPosition + imageHeight + 4, { maxWidth: imageWidth });
              
              // Add similarity and risk info
              doc.setFontSize(7);
              doc.setFont(undefined, 'normal');
              let infoY = yPosition + imageHeight + 8;
              
              if (phashSim) {
                const simText = `Visual: ${typeof phashSim === 'number' ? Math.round(phashSim) : phashSim}%`;
                doc.text(simText, xPos, infoY, { maxWidth: imageWidth });
                infoY += 4;
              }
              
              if (riskScore > 0) {
                doc.text(`Risk: ${riskScore}/100`, xPos, infoY, { maxWidth: imageWidth });
              }
            }
          } catch (error) {
            console.error(`Error adding screenshot ${idx}:`, error);
            // Add text placeholder if image fails
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text(`Screenshot ${idx + 1}: ${screenshot.domain || 'Unknown'}`, xPos, yPosition + 20);
            doc.text('(Image could not be loaded)', xPos, yPosition + 26);
          }

          // Move to next position
          currentCol++;
          if (currentCol >= screenshotsPerRow) {
            currentCol = 0;
            currentRow++;
            yPosition += imageHeight + 25; // Move down for next row
          }
        });

        // If we ended mid-row, move to next line
        if (currentCol > 0) {
          yPosition += imageHeight + 25;
        }
        
        yPosition += 10; // Add spacing after screenshots section
      }

      // Technical Details Section
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('TECHNICAL DETAILS', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('Analysis Method: Automated Phishing Detection', 20, yPosition);
      yPosition += 6;
      doc.text('Detection Engine: Advanced Phishing Detection System', 20, yPosition);
      yPosition += 6;
      doc.text('Scan Duration: ~30 seconds', 20, yPosition);
      yPosition += 6;
      doc.text('Report Version: 1.0', 20, yPosition);
      yPosition += 6;
      doc.text('Generated: ' + new Date().toISOString(), 20, yPosition);

      // Footer with company info
      const footerY = pageHeight - 20;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('Advanced Phishing Detection System', pageWidth / 2, footerY, { align: 'center' });
      doc.text('Specialized Phishing Threat Analysis Report', pageWidth / 2, footerY + 5, { align: 'center' });
      doc.text('© 2024 Phishing Detection System. All rights reserved.', pageWidth / 2, footerY + 10, { align: 'center' });

      // Save the PDF
      const filename = `security-analysis-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      alert(`Professional PDF report downloaded: ${filename}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  // Generate CSV report with all evidence
  const generateCSVReport = (data) => {
    if (!data) return 'No scan results available';
    
    const rows = [];
    
    // Header row
    rows.push([
      'Domain',
      'Fuzzer',
      'Attack Category',
      'Active',
      'Risk Score',
      'Visual Similarity %',
      'Content Similarity %',
      'SSL Valid',
      'SSL Self-Signed',
      'SSL Issuer',
      'SSL Subject',
      'SSL Expiry',
      'Country',
      'City',
      'ISP',
      'Registrar',
      'Registration Date',
      'Expiry Date',
      'DNS A Records',
      'DNS MX Records',
      'DNS NS Records',
      'WHOIS Info'
    ].join(','));
    
    // Data rows
    if (Array.isArray(data.domain_variations)) {
      data.domain_variations.forEach(v => {
        const escapeCSV = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        const aRecords = Array.isArray(v.dns_a) ? v.dns_a.join('; ') : '';
        const mxRecords = Array.isArray(v.dns_mx) ? v.dns_mx.join('; ') : '';
        const nsRecords = Array.isArray(v.dns_ns) ? v.dns_ns.join('; ') : '';
        const whoisInfo = v.whois_info ? JSON.stringify(v.whois_info).replace(/"/g, '""') : '';
        
        rows.push([
          escapeCSV(v.domain || v.domain_name),
          escapeCSV(v.fuzzer || 'unknown'),
          escapeCSV(v.attack_category || ''),
          escapeCSV(v.active ? 'Yes' : 'No'),
          escapeCSV(v.risk_score || 0),
          escapeCSV(v.phash_similarity || v.phash || ''),
          escapeCSV(v.lsh_similarity || v.lsh || ''),
          escapeCSV(v.ssl_info?.valid !== false ? 'Yes' : 'No'),
          escapeCSV(v.ssl_info?.self_signed ? 'Yes' : 'No'),
          escapeCSV(v.ssl_info?.issuer || ''),
          escapeCSV(v.ssl_info?.subject || ''),
          escapeCSV(v.ssl_info?.expiry || ''),
          escapeCSV(v.geo_info?.country || v.geo_info?.country_code || ''),
          escapeCSV(v.geo_info?.city || ''),
          escapeCSV(v.geo_info?.isp || ''),
          escapeCSV(v.geo_info?.registrar || ''),
          escapeCSV(v.registration_date || ''),
          escapeCSV(v.expiry_date || ''),
          escapeCSV(aRecords),
          escapeCSV(mxRecords),
          escapeCSV(nsRecords),
          escapeCSV(whoisInfo)
        ].join(','));
      });
    }
    
    return rows.join('\n');
  };

  // Download results in different formats
  const downloadResults = async (format = 'json') => {
    if (!scanResults) {
      alert('No scan results available to download');
      return;
    }

    try {
      let dataStr, mimeType, extension, filename;

      if (format === 'json') {
        dataStr = JSON.stringify(scanResults, null, 2);
        mimeType = 'application/json';
        extension = 'json';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      } else if (format === 'csv') {
        dataStr = generateCSVReport(scanResults);
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (format === 'txt') {
        // Use tgpt converted text if available, otherwise use fallback
        if (readableText) {
          dataStr = readableText;
        } else {
          dataStr = generateTextReport(scanResults);
        }
        mimeType = 'text/plain;charset=utf-8';
        extension = 'txt';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      } else if (format === 'readable') {
        // Download readable text format (tgpt converted)
        if (!readableText) {
          // Try to convert now if not already converted
          try {
            if (window.cyberGuard && window.cyberGuard.convertPhishingJsonToText) {
              const conversionResult = await window.cyberGuard.convertPhishingJsonToText(scanResults);
              if (conversionResult && conversionResult.success) {
                dataStr = conversionResult.readableText;
                setReadableText(conversionResult.readableText);
              } else {
                dataStr = generateTextReport(scanResults);
              }
            } else {
              dataStr = generateTextReport(scanResults);
            }
          } catch (error) {
            console.error('Error converting to readable format:', error);
            dataStr = generateTextReport(scanResults);
          }
        } else {
          dataStr = readableText;
        }
        mimeType = 'text/plain;charset=utf-8';
        extension = 'txt';
        filename = `phishing-detection-readable-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      } else if (format === 'html') {
        dataStr = generateHTMLReport(scanResults);
        mimeType = 'text/html;charset=utf-8';
        extension = 'html';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;
      } else if (format === 'pdf') {
        await downloadPDF();
        return;
      }

      const dataBlob = new Blob([dataStr], { type: mimeType });
      const downloadUrl = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      alert(`Download started: ${filename}`);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error.message}`);
    }
  };

  // View HTML report in new tab
  const viewHTMLReport = () => {
    if (!scanResults) {
      alert('No scan results available');
      return;
    }

    const htmlContent = generateHTMLReport(scanResults);
    const newWindow = window.open('', '_blank');
    newWindow.document.write(htmlContent);
    newWindow.document.close();
  };

  // Generate text report
  const generateTextReport = (data) => {
    if (!data) return 'No scan results available';

    let text = `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
    text += `║                        PHISHING DETECTION REPORT                              ║\n`;
    text += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;

    text += `SCAN OVERVIEW\n`;
    text += `═══════════════════════════════════════════════════════════════════════════════\n`;
    text += `Scan Date:     ${new Date().toLocaleString()}\n`;
    text += `Target URL:    ${data.target_url || url}\n`;
    text += `Scan Type:     Phishing Detection Analysis\n`;
    text += `Status:        ${data.summary || 'Completed'}\n\n`;

    if (data.threat_score !== undefined) {
      text += `THREAT ASSESSMENT\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      text += `Threat Score:  ${data.threat_score}/100\n`;
      text += `Risk Level:    ${data.threat_score <= 30 ? 'Low' : data.threat_score <= 60 ? 'Medium' : 'High'}\n\n`;
    }

    if (data.findings && data.findings.length > 0) {
      text += `SECURITY FINDINGS\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      data.findings.forEach((finding, index) => {
        text += `${index + 1}. ${finding.type}\n`;
        text += `   Severity: ${finding.severity}\n`;
        text += `   Evidence: ${finding.evidence}\n\n`;
      });
    }

    if (data.recommendations && data.recommendations.length > 0) {
      text += `RECOMMENDATIONS\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      data.recommendations.forEach((rec, index) => {
        text += `${index + 1}. ${rec}\n`;
      });
      text += `\n`;
    }

    text += `═══════════════════════════════════════════════════════════════════════════════\n`;
    text += `Report Generated by CyberGuard Phishing Detection System\n`;
    text += `Generated on: ${new Date().toLocaleString()}\n`;

    return text;
  };

  // Generate HTML report
  const generateHTMLReport = (data) => {
    if (!data) return '<html><body><h1>No scan data available</h1></body></html>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phishing Detection Report - ${data.target_url || url}</title>
    <style>
        body { font-family: 'Poppins', sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #dc2626; margin: 0; }
        .section { margin: 30px 0; }
        .section h2 { color: #333; border-left: 4px solid #dc2626; padding-left: 15px; }
        .threat-score { font-size: 32px; font-weight: bold; color: #dc2626; }
        .finding { background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #e5e7eb; }
        .severity-low { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .severity-medium { background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .severity-high { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .recommendations { background: #f0f9ff; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Phishing Detection Report</h1>
            <p><strong>Target URL:</strong> ${data.target_url || url}</p>
            <p><strong>Scan Date:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>Threat Assessment</h2>
            <p><strong>Threat Score:</strong> <span class="threat-score">${data.threat_score || 0}/100</span></p>
            <p><strong>Risk Level:</strong> ${data.threat_score <= 30 ? 'Low Risk' : data.threat_score <= 60 ? 'Medium Risk' : 'High Risk'}</p>
        </div>

        <div class="section">
            <h2>Security Findings</h2>
            ${data.findings ? data.findings.map(finding => `
                <div class="finding">
                    <h3>${finding.type}</h3>
                    <p>${finding.evidence}</p>
                    <span class="severity-${finding.severity.toLowerCase()}">${finding.severity} Risk</span>
                </div>
            `).join('') : '<p>No findings available</p>'}
        </div>

        <div class="section">
            <h2>Recommendations</h2>
            <div class="recommendations">
                <ul>
                    ${data.recommendations ? data.recommendations.map(rec => `<li>${rec}</li>`).join('') : '<li>No recommendations available</li>'}
                </ul>
            </div>
        </div>

        <div class="section">
            <h2>Report Information</h2>
            <p><strong>Report ID:</strong> ${Date.now()}</p>
            <p><strong>Generated by:</strong> CyberGuard Phishing Detection System</p>
            <p><strong>Report Version:</strong> 1.0</p>
        </div>
    </div>
</body>
</html>`;
  };

  // Get risk level color
  const getRiskColor = (score) => {
    if (score <= 30) return 'text-green-600';
    if (score <= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get severity badge color
  const getSeverityBadgeColor = (severity) => {
    switch (severity) {
      case 'High': return 'bg-red-100 text-red-800 border border-red-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border border-green-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Main Section - Enhanced UI */}
      <div className="bg-gradient-to-br from-orange-50 via-orange-100 to-amber-50 dark:from-slate-800 dark:via-slate-700 dark:to-slate-600 rounded-2xl shadow-lg border border-orange-200 dark:border-slate-600 p-8 relative overflow-hidden mb-6" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-amber-500 rounded-full translate-y-12 -translate-x-12"></div>
        </div>
        
        <div className="relative z-10 space-y-6 w-full max-w-full overflow-x-hidden" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          {/* Header Section with Help Button */}
          <div className="relative">
            {/* Help Icon Button - Top Right */}
            <button
              onClick={() => setShowHelpDialog(true)}
              className="absolute top-0 right-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 hover:scale-110 transition-all duration-200 z-20"
              title="View detailed scan information"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </button>
            
            <div className="flex items-start justify-between mb-6 pr-12">
              <div className="flex items-center space-x-4 flex-1">
                <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Phishing & Brand Abuse Detection
                  </h1>
                  <p className="text-base text-gray-600 dark:text-gray-400 mb-2">
                    Advanced analysis for phishing, typosquatting, and brand impersonation using domain fuzzing and visual similarity detection.
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">
                    Identifies suspicious domains that could be used for phishing attacks targeting your brand or website.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Target URL Section - Combined */}
          <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-gray-200/50 dark:border-slate-700/50">
            <div className="space-y-4">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Website URL</h3>
              </div>
              
              <div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 shadow-sm"
                  disabled={isScanning}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Enter the URL you want to analyze for phishing threats
                </p>
              </div>

              {/* Advanced Options */}
              <div className="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Advanced Detection Options</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Deep Content Analysis</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">SSL Certificate Check</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Visual Similarity Check</span>
                    </label>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Domain Typosquatting</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Malware Detection</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Social Engineering Analysis</span>
                    </label>
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartScan}
                disabled={isScanning || !url.trim()}
                className={`w-full px-8 py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 transition-all duration-200 shadow-lg ${
                  isScanning
                    ? 'bg-orange-600 hover:bg-orange-700 text-white cursor-wait'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:from-orange-600 hover:to-orange-700 hover:shadow-xl'
                } ${!url.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isScanning ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Scanning in Progress...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <span>Start Phishing Analysis</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar and Timing Info */}
      {startTime && (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-xl shadow-xl p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scan Timing</h3>
          </div>

          {/* Progress Bar */}
          {(isScanning || (startTime && progress > 0)) && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{progressMessage || (isScanning ? 'Scanning...' : 'Scan completed')}</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ease-out ${
                    progress === 100 
                      ? 'bg-gradient-to-r from-green-500 to-green-600' 
                      : 'bg-gradient-to-r from-orange-500 to-amber-600'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Timing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Start Date/Time</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{formatDateTime(startTime)}</div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Elapsed Time</div>
              <div className="text-lg font-bold text-orange-600 dark:text-orange-400">{formatElapsedTime(elapsedTime)}</div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Expected Completion</div>
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {expectedCompletionTime ? formatDateTime(expectedCompletionTime) : (endTime ? formatDateTime(endTime) : <span className="text-gray-500 dark:text-gray-400">Calculating...</span>)}
              </div>
            </div>
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">End Date/Time</div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{endTime ? formatDateTime(endTime) : <span className="text-green-600 dark:text-green-400">Running...</span>}</div>
            </div>
          </div>
        </div>
      )}

      {/* Help Dialog */}
      {showHelpDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowHelpDialog(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-600 text-white p-6 rounded-t-xl flex items-center justify-between">
              <h2 className="text-2xl font-bold">Phishing Detection Process Guide</h2>
              <button
                onClick={() => setShowHelpDialog(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100 mb-3">How It Works</h3>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 space-y-3 border border-orange-200 dark:border-orange-800">
                  <p className="text-orange-800 dark:text-orange-200">
                    This system uses <strong>dnstwist</strong>, an advanced domain name permutation engine that generates 
                    typosquatting variations of a target domain to identify potential phishing threats.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">1. Domain Fuzzing</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Generates domain variations using multiple algorithms: addition, bitsquatting, dictionary, 
                        homoglyph, transposition, and subdomain techniques.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">2. DNS Verification</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Checks which variations are actually registered and have active DNS records, filtering 
                        out unregistered domains.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">3. Visual Analysis</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Captures screenshots of suspicious domains and uses perceptual hashing (phash) to 
                        compare visual similarity with the original domain.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-orange-200 dark:border-orange-700">
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">4. Content Analysis</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Uses fuzzy hashing (LSH with ssdeep) to compare HTML content similarity and detect 
                        potential content copying or phishing attempts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100 mb-3">Command Used</h3>
                <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-orange-400 overflow-x-auto border border-orange-200 dark:border-orange-800">
                  <code>
                    dnstwist --fuzzers "*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain" --registered --geoip --phash --lsh ssdeep --screenshots /tmp/dnstwist_screenshots --format json webnox.in
                  </code>
                </div>
                <p className="text-sm text-orange-800 dark:text-orange-200 mt-2">
                  This command runs through WSL (Windows Subsystem for Linux) and uses the comprehensive Python wrapper 
                  to execute dnstwist with all advanced features enabled.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100 mb-3">Detection Features</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100">Domain Typosquatting</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Identifies domains that closely resemble legitimate ones (e.g., g00gle.com, googIe.com)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100">Visual Similarity (phash)</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Compares screenshots to detect visual spoofing attempts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100">Content Similarity (ssdeep)</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Analyzes HTML content to detect copied or similar pages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                    <svg className="w-5 h-5 text-orange-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-orange-900 dark:text-orange-100">Geolocation & WHOIS</h4>
                      <p className="text-sm text-orange-800 dark:text-orange-200">
                        Provides location and registration information for suspicious domains
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-orange-900 dark:text-orange-100 mb-3">Understanding Results</h3>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800 space-y-2 text-sm text-orange-800 dark:text-orange-200">
                  <p><strong>Threat Score:</strong> 0-100 rating indicating overall phishing risk</p>
                  <p><strong>Active Domains:</strong> Suspicious domains that are currently registered and accessible</p>
                  <p><strong>Visual Matches:</strong> Domains with high screenshot similarity scores</p>
                  <p><strong>Content Matches:</strong> Domains with similar HTML content (potential phishing pages)</p>
                  <p><strong>SSL Issues:</strong> Domains with invalid or suspicious certificates</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {/* {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-600 text-white p-6 rounded-t-xl flex items-center justify-between">
              <h2 className="text-2xl font-bold">📖 Phishing Detection Process Guide</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🔍 How It Works</h3>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 space-y-3">
                  <p className="text-gray-700 dark:text-gray-300">
                    This system uses <strong>dnstwist</strong>, an advanced domain name permutation engine that generates 
                    typosquatting variations of a target domain to identify potential phishing threats.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Domain Fuzzing</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Generates domain variations using multiple algorithms: addition, bitsquatting, dictionary, 
                        homoglyph, transposition, and subdomain techniques.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">2. DNS Verification</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Checks which variations are actually registered and have active DNS records, filtering 
                        out unregistered domains.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Visual Analysis</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Captures screenshots of suspicious domains and uses perceptual hashing (phash) to 
                        compare visual similarity with the original domain.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Content Analysis</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Uses fuzzy hashing (LSH with ssdeep) to compare HTML content similarity and detect 
                        potential content copying or phishing attempts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">⚙️ Command Used</h3>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                  <code>
                    dnstwist --fuzzers "*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain" --registered --geoip --phash --lsh ssdeep --screenshots /tmp/dnstwist_screenshots --format json webnox.in
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  This command runs through WSL (Windows Subsystem for Linux) and uses the comprehensive Python wrapper 
                  to execute dnstwist with all advanced features enabled.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🎯 Detection Features</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Domain Typosquatting</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Identifies domains that closely resemble legitimate ones (e.g., g00gle.com, googIe.com)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <span className="text-2xl">📸</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Visual Similarity (phash)</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Compares screenshots to detect visual spoofing attempts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <span className="text-2xl">🔍</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Content Similarity (ssdeep)</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Analyzes HTML content to detect copied or similar pages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <span className="text-2xl">🌍</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Geolocation & WHOIS</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Provides location and registration information for suspicious domains
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 Understanding Results</h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <p><strong>Threat Score:</strong> 0-100 rating indicating overall phishing risk</p>
                  <p><strong>Active Domains:</strong> Suspicious domains that are currently registered and accessible</p>
                  <p><strong>Visual Matches:</strong> Domains with high screenshot similarity scores</p>
                  <p><strong>Content Matches:</strong> Domains with similar HTML content (potential phishing pages)</p>
                  <p><strong>SSL Issues:</strong> Domains with invalid or suspicious certificates</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )} */}

{/*       
      {showOverview && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📊 Overview & Live Console</h2>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                {isScanning ? (
                  <>
                    <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">Scanning...</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ready</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gradient-to-br from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">🔍 Detection Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">System Status:</span>
                  <span className={`font-medium ${isScanning ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                    {isScanning ? 'Scanning' : 'Operational'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Kali Linux:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{kaliStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">dnstwist:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">Ready</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">⚡ Quick Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Scan:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scanResults ? 'Completed' : 'Not yet scanned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total Variations:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scanResults?.statistics?.total_variations || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Threat Score:</span>
                  <span className={`font-medium ${scanResults?.threat_score ? getRiskColor(scanResults.threat_score) : 'text-gray-900 dark:text-gray-100'}`}>
                    {scanResults?.threat_score || 'N/A'}/100
                  </span>
                </div>
              </div>
            </div>
          </div>

     
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
              <span className="mr-2">📟</span>
              Live Console Output
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                {isScanning ? '(Live logs streaming in real-time...)' : '(Real-time logs will appear here during scans)'}
              </span>
            </h3>
            <div
              ref={logContainerRef}
              className="max-h-96 overflow-y-auto bg-black border-2 border-gray-700 rounded-lg p-4 text-xs font-mono"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                color: '#00ff00',
                textShadow: '0 0 5px #00ff00',
                minHeight: '200px',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500">
                  <div className="mb-2">$ Waiting for scan to start...</div>
                  <div className="text-gray-600">Console output will appear here in real-time</div>
                  <div className="mt-4 text-green-400">Ready to scan. Enter a URL and click "Start Phishing Analysis"</div>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1 whitespace-pre-wrap break-words">
                    {log}
                  </div>
                ))
              )}
            </div>
            {logs.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Showing {logs.length} log entries
              </div>
            )}
          </div>

      
          <div className="mt-6 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">ℹ️ Current Process</h3>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p>
                <strong>Tool:</strong> dnstwist (Domain Name System Twist) - Advanced domain permutation engine
              </p>
              <p>
                <strong>Method:</strong> Typosquatting detection via domain fuzzing algorithms
              </p>
              <p>
                <strong>Features:</strong> DNS verification, visual similarity (phash), content analysis (ssdeep), geolocation (geoip)
              </p>
              <p>
                <strong>Execution:</strong> Runs via WSL using Python wrapper with comprehensive error handling
              </p>
            </div>
          </div>
        </div>
      )} */}



      {/* Progress Section */}
      {isScanning && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Scanning in Progress</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">{progressMessage}</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-orange-800 dark:text-orange-200">Progress</span>
              <span className="text-orange-600 dark:text-orange-400 font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          {/* Progress Messages */}
          <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-800 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              {progressMessage || 'Analyzing website...'}
            </p>
          </div>

          {/* Live Terminal Log Display */}
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-2">
              Kali Console Output (Live)
            </h4>
            <div
              ref={logContainerRef}
              className="max-h-96 overflow-y-auto bg-black border-2 border-orange-500 rounded-lg p-4 text-xs font-mono"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                color: '#00ff00',
                textShadow: '0 0 5px #00ff00',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-green-500 opacity-70">Waiting for console output...</div>
              ) : (
                logs.map((ln, i) => (
                  <div
                    key={i}
                    className="whitespace-pre-wrap mb-1 text-green-400"
                    style={{
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}
                  >
                    <span className="text-green-600 mr-2">$</span>
                    {ln}
                  </div>
                ))
              )}
              {isScanning && logs.length > 0 && (
                <div className="text-green-500 animate-pulse">_</div>
              )}
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
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex items-center space-x-2"
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
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Scan Results</h2>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => downloadResults('readable')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all text-base font-semibold flex items-center space-x-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Readable Report</span>
              </button>
              <button
                onClick={() => downloadResults('pdf')}
                className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all text-lg font-semibold flex items-center space-x-2 shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Advanced Phishing Report (PDF)</span>
              </button>
            </div>
          </div>

          {/* Executive Summary - User Friendly */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scan Summary
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Target Domain</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {scanResults.target_domain || scanResults.target_url || 'N/A'}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Scan Date</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.timestamp ? new Date(scanResults.timestamp).toLocaleString() : new Date().toLocaleString()}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Domain Variations Found</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.statistics?.total_variations || 0}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active/Registered Domains</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.statistics?.active_domains || 0} / {scanResults.statistics?.total_variations || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Educational Info - Enhanced */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Understanding Your Results
            </h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-green-800 dark:text-green-200">
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">Threat Score:</p>
                <p className="text-xs">0-30 = Low Risk (Safe)</p>
                <p className="text-xs">31-60 = Medium Risk (Caution)</p>
                <p className="text-xs">61-100 = High Risk (Dangerous)</p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">Visual Similarity:</p>
                <p className="text-xs">Shows how similar the website looks compared to the original. Higher percentage = more suspicious.</p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">SSL Certificate:</p>
                <p className="text-xs">Valid certificates ensure encrypted communication. Invalid certificates may indicate phishing sites.</p>
              </div>
            </div>
          </div>

          {/* Threat Score */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Threat Score</span>
              <span className={`text-lg font-bold ${getRiskColor(scanResults.threat_score)}`}>
                {scanResults.threat_score}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  scanResults.threat_score <= 30 ? 'bg-green-600' :
                  scanResults.threat_score <= 60 ? 'bg-yellow-600' :
                  'bg-orange-600'
                }`}
                style={{ width: `${scanResults.threat_score}%` }}
              ></div>
            </div>
          </div>

          {/* Findings */}
          {scanResults.findings && scanResults.findings.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Findings</h3>
              <div className="space-y-3">
                {scanResults.findings.map((finding, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{finding.type}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadgeColor(finding.severity)}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{finding.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {scanResults.recommendations && scanResults.recommendations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recommendations</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                {scanResults.recommendations.map((rec, index) => (
                  <li key={index}>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Screenshots Section - Enhanced */}
          {scanResults.screenshots && Array.isArray(scanResults.screenshots) && scanResults.screenshots.length > 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Visual Similarity Analysis - Captured Screenshots
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  These screenshots show visual similarity between suspicious domains and the original. 
                  High similarity may indicate phishing attempts. Total: <strong>{scanResults.screenshots.length} screenshots</strong>
                </p>
              </div>
              
              <div className="flex overflow-x-auto gap-6 pb-4" style={{ 
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch'
              }}>
                {scanResults.screenshots.map((screenshot, idx) => {
                  // Find matching domain variation for additional info
                  const matchingVar = scanResults.domain_variations?.find(
                    v => (v.domain || v.domain_name) === screenshot.domain
                  );
                  const phashSim = matchingVar?.phash_similarity || matchingVar?.phash;
                  const riskScore = matchingVar?.risk_score || 0;
                  
                  return (
                    <div key={idx} className="border-2 border-gray-300 dark:border-slate-600 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow flex-shrink-0" style={{ minWidth: '350px', maxWidth: '400px' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate mb-1">
                            {screenshot.domain || 'Unknown Domain'}
                          </div>
                          {phashSim && (
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-600 dark:text-gray-400">Visual Similarity:</span>
                              <span className={`text-xs font-bold ${
                                phashSim > 80 ? 'text-red-600' : 
                                phashSim > 60 ? 'text-orange-600' : 
                                'text-green-600'
                              }`}>
                                {typeof phashSim === 'number' ? `${Math.round(phashSim)}%` : phashSim}
                              </span>
                            </div>
                          )}
                          {riskScore > 0 && (
                            <div className="mt-1">
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                riskScore > 60 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                riskScore > 30 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              }`}>
                                Risk: {riskScore}/100
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {screenshot.base64 ? (
                        <div className="relative group">
                          <img
                            src={`data:image/png;base64,${screenshot.base64}`}
                            alt={`Screenshot of ${screenshot.domain}`}
                            className="w-full h-auto rounded-lg border-2 border-gray-200 dark:border-slate-700 cursor-pointer hover:border-orange-500 transition-all"
                            style={{ maxHeight: '300px', objectFit: 'contain', minHeight: '150px' }}
                            onClick={() => {
                              // Open image in new window for full view
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <html>
                                    <head><title>Screenshot - ${screenshot.domain}</title></head>
                                    <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                                      <img src="data:image/png;base64,${screenshot.base64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                    </body>
                                  </html>
                                `);
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
                        <div className="w-full h-48 bg-gray-200 dark:bg-slate-700 rounded-lg flex flex-col items-center justify-center text-gray-500">
                          <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm">No screenshot available</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Domain Variations Preview - Enhanced */}
          {Array.isArray(scanResults.domain_variations) && scanResults.domain_variations.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Domain Variations ({scanResults.domain_variations.length})
                </h3>
                <button
                  onClick={() => downloadResults('csv')}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg" style={{ maxHeight: '500px' }}>
                <table className="min-w-full text-sm" style={{ width: '100%', tableLayout: 'auto' }}>
                  <thead className="bg-gradient-to-r from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-800 text-gray-700 dark:text-gray-200 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Domain Name</th>
                      <th className="text-left px-4 py-3 font-semibold">Fuzzer Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Attack Category</th>
                      <th className="text-center px-4 py-3 font-semibold">Status</th>
                      <th className="text-center px-4 py-3 font-semibold">Risk Score</th>
                      <th className="text-center px-4 py-3 font-semibold">Visual Similarity</th>
                      <th className="text-center px-4 py-3 font-semibold">Content Similarity</th>
                      <th className="text-center px-4 py-3 font-semibold">SSL Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Location</th>
                      <th className="text-center px-4 py-3 font-semibold">Screenshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {scanResults.domain_variations.map((v, i) => {
                      const aCnt = Array.isArray(v.dns_a) ? v.dns_a.length : (v.a?.length || 0);
                      const mxCnt = Array.isArray(v.dns_mx) ? v.dns_mx.length : (v.mx?.length || 0);
                      const nsCnt = Array.isArray(v.dns_ns) ? v.dns_ns.length : (v.ns?.length || 0);
                      const riskScore = v.risk_score || 0;
                      const phashSim = v.phash_similarity || v.phash || null;
                      const lshSim = v.lsh_similarity || v.lsh || null;
                      const sslValid = v.ssl_info?.valid !== false;
                      const sslSelfSigned = v.ssl_info?.self_signed || false;
                      const country = v.geo_info?.country || v.geo_info?.country_code || '';
                      
                      // Find matching screenshot
                      const matchingScreenshot = scanResults.screenshots?.find(
                        s => s.domain === (v.domain || v.domain_name)
                      );
                      
                      return (
                        <tr key={`${v.domain || v.domain_name || i}-${i}`} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="px-4 py-3 font-mono text-xs font-medium">{v.domain || v.domain_name}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {v.fuzzer || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {v.attack_category ? (
                              <div className="flex flex-wrap gap-1">
                                {v.attack_category.split(',').map((cat, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                                  >
                                    {cat.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${v.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'}`}>
                              {v.active ? '✓ Active' : '✗ Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              riskScore >= 70 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                              riskScore >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            }`}>
                              {riskScore}/100
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {phashSim !== null && phashSim !== undefined ? (
                              <span className={`text-xs font-bold ${
                                phashSim > 80 ? 'text-red-600 dark:text-red-400' :
                                phashSim > 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-gray-600 dark:text-gray-400'
                              }`}>
                                {typeof phashSim === 'number' ? `${Math.round(phashSim)}%` : String(phashSim)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {lshSim !== null && lshSim !== undefined ? (
                              <span className={`text-xs font-bold ${
                                lshSim > 70 ? 'text-red-600 dark:text-red-400' :
                                lshSim > 50 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-gray-600 dark:text-gray-400'
                              }`}>
                                {typeof lshSim === 'number' ? `${Math.round(lshSim)}%` : String(lshSim)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {v.ssl_info ? (
                              <span className={`text-xs font-medium px-2 py-1 rounded ${
                                sslValid && !sslSelfSigned ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 
                                sslSelfSigned ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {sslValid && !sslSelfSigned ? '✓ Valid' : sslSelfSigned ? '⚠ Self-signed' : '✗ Invalid'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {country ? (
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300" title={v.geo_info?.city || ''}>
                                {country}
                                {v.geo_info?.city ? `, ${v.geo_info.city.substring(0, 10)}` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {matchingScreenshot?.base64 ? (
                              <div className="relative group">
                                <img
                                  src={`data:image/png;base64,${matchingScreenshot.base64}`}
                                  alt={`Screenshot of ${v.domain || v.domain_name}`}
                                  className="w-16 h-12 object-cover rounded border border-gray-300 dark:border-slate-600 cursor-pointer hover:border-orange-500 transition-all"
                                  onClick={() => {
                                    const newWindow = window.open();
                                    if (newWindow) {
                                      newWindow.document.write(`
                                        <html>
                                          <head><title>Screenshot - ${v.domain || v.domain_name}</title></head>
                                          <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                                            <img src="data:image/png;base64,${matchingScreenshot.base64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                          </body>
                                        </html>
                                      `);
                                    }
                                  }}
                                  title="Click to view full size screenshot"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Root Password Prompt (inline modal) */}
      {askPassword && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-md p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Root access required to continue</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Enter your WSL root password to run dnstwist and install missing tools.</p>
            <input
              type="password"
              value={rootPassword}
              onChange={(e)=>setRootPassword(e.target.value)}
              placeholder="Enter WSL root password"
              className="mt-3 w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setAskPassword(false)} className="px-3 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button
                onClick={async ()=>{
                  if (!rootPassword) return;
                  try {
                    await window.cyberGuard?.storeRootPassword?.(rootPassword);
                    setAskPassword(false);
                    setLogs((l)=>[...l,'Root password stored for this session']);
                  } catch {}
                }}
                className="px-3 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700"
              >Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Missing dnstwist helper */}
      {/* {!isScanning && !scanResults && dnstwistInstall.installing === false && dnstwistInstall.done === false && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-orange-900 dark:text-orange-100 font-semibold mb-1">dnstwist is required</h3>
              <p className="text-sm text-orange-800 dark:text-orange-200">If your last scan failed due to missing dnstwist, click install to add it inside WSL.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={installDnstwist} className="px-3 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700">Install dnstwist</button>
            </div>
          </div>
          {dnstwistInstall.error && (
            <div className="mt-2 text-sm text-red-700">{dnstwistInstall.error}</div>
          )}
          {dnstwistInstall.progress > 0 && (
            <div className="mt-3">
              <div className="w-full bg-orange-200 h-2 rounded">
                <div className="bg-orange-600 h-2 rounded" style={{ width: `${dnstwistInstall.progress}%` }} />
              </div>
              <div className="mt-1 text-xs text-orange-800">{Math.round(dnstwistInstall.progress)}%</div>
            </div>
          )}
        </div>
      )} */}

    </div>
  );
}

export default PhishingDetection;
=======
import React, { useState, useEffect } from 'react';
import { getSecurePassword } from '../utils/securePasswordStorage';

function PhishingDetection() {
  // State management
  const [url, setUrl] = useState('https://example.com');
  const [scanResults, setScanResults] = useState(null);
  const [readableText, setReadableText] = useState(null);
  const [kaliStatus, setKaliStatus] = useState('Checking...');

  // Local state for scanning
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [dnstwistInstall, setDnstwistInstall] = useState({ installing: false, progress: 0, error: null, done: false });
  const [askPassword, setAskPassword] = useState(false);
  const [rootPassword, setRootPassword] = useState('');
  const logContainerRef = React.useRef(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showOverview, setShowOverview] = useState(true);

  // Initialize component
  useEffect(() => {
    checkKaliStatus();
  }, []);

  // Check Kali Linux status
  const checkKaliStatus = async () => {
    try {
      if (window.cyberGuard) {
        const isInstalled = await window.cyberGuard.checkKali();
        setKaliStatus(isInstalled ? 'Kali Linux is installed' : 'Kali Linux is not installed');
      } else {
        setKaliStatus('Scanning system not available (development mode)');
      }
    } catch (error) {
      setKaliStatus('Unable to check Kali status');
      console.error('Kali check error:', error);
    }
  };

  // Validate URL and start phishing scan with real dnstwist
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

    // Resolve password: prefer stored root password in main; fallback to secure storage; otherwise prompt
    let password = null;
    try { password = await window.cyberGuard?.getStoredRootPassword?.(); } catch {}
    if (!password) password = getSecurePassword();
    if (!password) { setAskPassword(true); return; }

    // Start real phishing scan with dnstwist
    setIsScanning(true);
    setProgress(0);
    setProgressMessage('Initializing dnstwist phishing detection engine...');
    setLogs((l) => [...l, '⏳ Starting phishing scan', '• Initializing dnstwist engine']);
    setScanResults(null);
    setReadableText(null);

    await startRealPhishingScan(url, password);
  };

  // Real phishing scan implementation using dnstwist
  const startRealPhishingScan = async (targetUrl, password) => {
    let logListener = null;
    try {
      // Clear logs at start
      setLogs([]);
      
      // Subscribe to live log stream from main process
      const wrappedListener = (line) => {
        const cleanLine = String(line || '').trim();
        if (cleanLine) {
          setLogs((l) => {
            const newLogs = [...l, cleanLine];
            // Auto-scroll to bottom when new log arrives
            setTimeout(() => {
              if (logContainerRef.current) {
                logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
              }
            }, 10);
            return newLogs;
          });
        }
      };
      logListener = window.cyberGuard?.onPhishingLog?.(wrappedListener);
      // Progress steps for real dnstwist scan
      const steps = [
        { progress: 5, message: 'Initializing dnstwist phishing detection engine...' },
        { progress: 10, message: 'Extracting domain from target URL...' },
        { progress: 20, message: 'Checking dnstwist installation...' },
        { progress: 30, message: 'Running dnstwist domain fuzzing analysis...' },
        { progress: 50, message: 'Generating typosquatting variations...' },
        { progress: 70, message: 'Checking DNS records for suspicious domains...' },
        { progress: 85, message: 'Analyzing active phishing threats...' },
        { progress: 95, message: 'Generating comprehensive phishing threat report...' }
      ];

      // Update progress
      for (const step of steps.slice(0, 3)) {
        setProgress(step.progress);
        setProgressMessage(step.message);
        setLogs((l) => [...l, `• ${step.message}`]);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Check if dnstwist API is available
      if (!window.cyberGuard || !window.cyberGuard.runDnstwist) {
        throw new Error('dnstwist API not available. Please ensure the application is running properly.');
      }

      setProgress(30);
      setProgressMessage('Running dnstwist domain fuzzing analysis...');
      setLogs((l) => [...l, '• Executing dnstwist via WSL']);

      // Call real dnstwist API
      const result = await window.cyberGuard.runDnstwist(targetUrl, password);

      setProgress(70);
      setProgressMessage('Analyzing results and generating threat assessment...');
      setLogs((l) => [...l, '• Parsing dnstwist output']);

      // Wait a moment for progress update
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!result.success) {
        if (!result.installed) {
          throw new Error('dnstwist is not installed. Please install it via: sudo apt install dnstwist');
        }
        throw new Error(result.error || 'dnstwist scan failed');
      }

      setProgress(95);
      setProgressMessage('Generating comprehensive phishing threat report...');
      setLogs((l) => [...l, '• Building report']);

      // Use real results from dnstwist
      const scanResults = result.results;

      // Add additional findings based on domain variations
      const additionalFindings = [];

      // Add visual similarity finding if many active domains
      if (scanResults.statistics.active_domains > 0) {
        additionalFindings.push({
          type: 'Phishing Threat Intelligence',
          severity: scanResults.statistics.active_domains > 5 ? 'High' : 'Medium',
          evidence: `Found ${scanResults.statistics.active_domains} active domain variations with DNS records. These could be used for phishing attacks targeting ${scanResults.target_domain}.`,
          suspicious_domains: scanResults.domain_variations
            .filter(v => v.active)
            .slice(0, 5)
            .map(v => v.domain)
        });
      }

      // Add typosquatting finding
      if (scanResults.statistics.total_variations > 0) {
        additionalFindings.push({
          type: 'Domain Typosquatting Detection',
          severity: scanResults.statistics.total_variations > 10 ? 'High' : scanResults.statistics.total_variations > 5 ? 'Medium' : 'Low',
          evidence: `Generated ${scanResults.statistics.total_variations} potential typosquatting variations. ${scanResults.statistics.active_domains} variations have active DNS records.`,
          count: scanResults.statistics.total_variations,
          active_count: scanResults.statistics.active_domains
        });
      }

      // Merge additional findings with existing findings
      const allFindings = [...scanResults.findings, ...additionalFindings];

      // Build final results object
      const finalResults = {
        target_url: scanResults.target_url,
        target_domain: scanResults.target_domain,
        timestamp: scanResults.timestamp,
        threat_score: scanResults.threat_score,
        findings: allFindings,
        domain_variations: scanResults.domain_variations,
        statistics: scanResults.statistics,
        recommendations: scanResults.recommendations,
        screenshots: scanResults.screenshots || [], // Preserve screenshots if available
        evidence: {
          scan_tool: 'dnstwist',
          scan_method: 'Comprehensive typosquatting detection with visual/content analysis',
          raw_data: scanResults
        }
      };

      setProgress(100);
      setProgressMessage('Phishing detection analysis complete!');
      setLogs((l) => [...l, '✅ Scan complete']);

      // Wait a moment before showing results
      await new Promise(resolve => setTimeout(resolve, 300));

      // Complete the scan
      setIsScanning(false);
      setProgress(0);
      setProgressMessage('');
      setScanResults(finalResults);
      
      // Convert JSON to readable text using tgpt
      try {
        setLogs((l) => [...l, '📝 Converting results to readable format...']);
        if (window.cyberGuard && window.cyberGuard.convertPhishingJsonToText) {
          const conversionResult = await window.cyberGuard.convertPhishingJsonToText(finalResults);
          if (conversionResult && conversionResult.success) {
            setReadableText(conversionResult.readableText);
            setLogs((l) => [...l, '✅ Results converted to readable format']);
          } else {
            setLogs((l) => [...l, '⚠️ Could not convert results (using fallback format)']);
          }
        }
      } catch (conversionError) {
        console.log('Error converting JSON to text:', conversionError);
        setLogs((l) => [...l, '⚠️ Error converting results to readable format']);
      }
      
      // Clean up log listener
      if (logListener && typeof logListener === 'function') {
        try {
          logListener();
        } catch {}
      }

    } catch (error) {
      console.error('Phishing scan error:', error);
      setLogs((l) => [...l, `[ERROR] ${error.message}`]);
      setIsScanning(false);
      setProgress(0);
      setProgressMessage('');
      // Surface inline guidance for missing dnstwist
      if (/dnstwist\s+is\s+not\s+installed/i.test(error.message || '')) {
        setDnstwistInstall({ installing: false, progress: 0, error: null, done: false });
      }
      // Clean up log listener on error
      if (logListener && typeof logListener === 'function') {
        try {
          logListener();
        } catch {}
      }
      alert(`❌ Phishing scan failed: ${error.message}`);
    }
  };

  // Install dnstwist on demand with progress logs
  const installDnstwist = async () => {
    try {
      setDnstwistInstall({ installing: true, progress: 0, error: null, done: false });
      setLogs((l) => [...l, '⏳ Installing dnstwist via apt…']);
      const handler = (payload) => {
        if (!payload) return;
        // payload: { tool, progress, message }
        if (payload.tool !== 'dnstwist') return;
        setDnstwistInstall((s) => ({ ...s, progress: Math.max(s.progress, payload.progress ?? s.progress) }));
        if (payload.message) setLogs((l) => [...l, `dnstwist: ${payload.message}`]);
      };
      window.cyberGuard?.onToolsInstallProgress?.(handler);
      // Ensure password exists
      let pwd = null;
      try { pwd = await window.cyberGuard?.getStoredRootPassword?.(); } catch {}
      if (!pwd) pwd = getSecurePassword();
      if (!pwd) { setAskPassword(true); setDnstwistInstall((s)=>({ ...s, installing: false })); return; }
      await window.cyberGuard?.installSingleTool?.('dnstwist', pwd);
      setDnstwistInstall({ installing: false, progress: 100, error: null, done: true });
      setLogs((l) => [...l, '✅ dnstwist installed. You can re-run the scan.']);
    } catch (e) {
      setDnstwistInstall({ installing: false, progress: 0, error: e?.message || String(e), done: false });
      setLogs((l) => [...l, `✗ dnstwist install failed: ${e?.message || e}`]);
    }
  };

  // Download PDF report
  const downloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      let yPosition = 20;

      // Header with company branding
      doc.setFillColor(220, 38, 38); // Red background
      doc.rect(0, 0, pageWidth, 30, 'F');
      
      doc.setTextColor(255, 255, 255); // White text
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('Advanced Phishing Detection Report', pageWidth / 2, 20, { align: 'center' });
      
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

      // Report Information Table
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('REPORT INFORMATION', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const reportData = [
        ['Report ID', `PH-${Date.now()}`],
        ['Scan Date', new Date().toLocaleString()],
        ['Target URL', scanResults.target_url],
        ['Scan Type', 'Phishing Detection Analysis'],
        ['Risk Level', riskLevel],
        ['Threat Score', `${scanResults.threat_score}/100`]
      ];

      reportData.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(`${label}:`, 20, yPosition);
        doc.setFont(undefined, 'normal');
        doc.text(value, 80, yPosition);
        yPosition += 6;
      });
      yPosition += 10;

      // Threat Assessment Section
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('THREAT ASSESSMENT', 20, yPosition);
      yPosition += 8;

      // Risk level indicator
      const riskColor = scanResults.threat_score <= 30 ? [34, 197, 94] : 
                       scanResults.threat_score <= 60 ? [234, 179, 8] : [239, 68, 68];
      doc.setFillColor(riskColor[0], riskColor[1], riskColor[2]);
      doc.rect(20, yPosition, 30, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(riskLevel, 35, yPosition + 6, { align: 'center' });
      
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      doc.text(`Score: ${scanResults.threat_score}/100`, 60, yPosition + 6);
      yPosition += 15;

      // Security Findings
      if (scanResults.findings && scanResults.findings.length > 0) {
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('SECURITY FINDINGS', 20, yPosition);
        yPosition += 8;

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        scanResults.findings.forEach((finding, index) => {
          if (yPosition > pageHeight - 40) {
            doc.addPage();
            yPosition = 20;
          }
          
          // Finding header with severity indicator
          const severityColor = finding.severity === 'High' ? [239, 68, 68] :
                               finding.severity === 'Medium' ? [234, 179, 8] : [34, 197, 94];
          doc.setFillColor(severityColor[0], severityColor[1], severityColor[2]);
          doc.rect(20, yPosition - 2, 15, 6, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.setFont(undefined, 'bold');
          doc.text(finding.severity.toUpperCase(), 27, yPosition + 2, { align: 'center' });
          
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          doc.setFont(undefined, 'bold');
          doc.text(`${index + 1}. ${finding.type}`, 40, yPosition);
          yPosition += 6;
          
          doc.setFont(undefined, 'normal');
          const evidenceLines = doc.splitTextToSize(`Evidence: ${finding.evidence}`, pageWidth - 50);
          doc.text(evidenceLines, 40, yPosition);
          yPosition += evidenceLines.length * 4 + 8;
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

    // Domain Variations Table
    if (Array.isArray(scanResults.domain_variations) && scanResults.domain_variations.length > 0) {
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text(`DOMAIN VARIATIONS (${scanResults.domain_variations.length})`, 20, yPosition);
      yPosition += 8;

      // Table headers
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text('Domain', 20, yPosition);
      doc.text('Active', 110, yPosition);
      doc.text('A/MX/NS', 140, yPosition);
      yPosition += 6;

      doc.setFont(undefined, 'normal');
      const rowsPerPage = 30;
      let rowCounter = 0;
      for (const v of scanResults.domain_variations) {
        const aCnt = Array.isArray(v.dns_a) ? v.dns_a.length : (v.a?.length || 0);
        const mxCnt = Array.isArray(v.dns_mx) ? v.dns_mx.length : (v.mx?.length || 0);
        const nsCnt = Array.isArray(v.dns_ns) ? v.dns_ns.length : (v.ns?.length || 0);

        doc.text(String(v.domain || v.domain_name || ''), 20, yPosition, { maxWidth: 80 });
        doc.text(v.active ? 'Yes' : 'No', 110, yPosition);
        doc.text(`${aCnt}/${mxCnt}/${nsCnt}`, 140, yPosition);
        yPosition += 5;
        rowCounter += 1;

        if (rowCounter % rowsPerPage === 0 && yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 20;
        }
      }
    }

      // Screenshots Section
      if (scanResults.screenshots && Array.isArray(scanResults.screenshots) && scanResults.screenshots.length > 0) {
        if (yPosition > pageHeight - 80) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`VISUAL SIMILARITY ANALYSIS - SCREENSHOTS (${scanResults.screenshots.length})`, 20, yPosition);
        yPosition += 10;

        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.text('These screenshots show visual similarity between suspicious domains and the original.', 20, yPosition);
        yPosition += 8;

        // Process screenshots
        const screenshotsPerRow = 2;
        const imageWidth = (pageWidth - 50) / screenshotsPerRow;
        const imageHeight = 60;
        let currentRow = 0;
        let currentCol = 0;

        scanResults.screenshots.forEach((screenshot, idx) => {
          // Check if we need a new page
          if (yPosition + imageHeight + 30 > pageHeight) {
            doc.addPage();
            yPosition = 20;
            currentRow = 0;
            currentCol = 0;
          }

          // Calculate position
          const xPos = 20 + (currentCol * (imageWidth + 10));
          
          // Find matching domain variation for info
          const matchingVar = scanResults.domain_variations?.find(
            v => (v.domain || v.domain_name) === screenshot.domain
          );
          const phashSim = matchingVar?.phash_similarity || matchingVar?.phash;
          const riskScore = matchingVar?.risk_score || 0;

          try {
            // Add screenshot image
            if (screenshot.base64) {
              // Convert base64 to image data
              const imgData = 'data:image/png;base64,' + screenshot.base64;
              
              // Add image with proper sizing
              doc.addImage(imgData, 'PNG', xPos, yPosition, imageWidth, imageHeight, undefined, 'FAST');
              
              // Add domain name and info below image
              doc.setFontSize(8);
              doc.setFont(undefined, 'bold');
              const domainName = (screenshot.domain || 'Unknown').substring(0, 25);
              doc.text(domainName, xPos, yPosition + imageHeight + 4, { maxWidth: imageWidth });
              
              // Add similarity and risk info
              doc.setFontSize(7);
              doc.setFont(undefined, 'normal');
              let infoY = yPosition + imageHeight + 8;
              
              if (phashSim) {
                const simText = `Visual: ${typeof phashSim === 'number' ? Math.round(phashSim) : phashSim}%`;
                doc.text(simText, xPos, infoY, { maxWidth: imageWidth });
                infoY += 4;
              }
              
              if (riskScore > 0) {
                doc.text(`Risk: ${riskScore}/100`, xPos, infoY, { maxWidth: imageWidth });
              }
            }
          } catch (error) {
            console.error(`Error adding screenshot ${idx}:`, error);
            // Add text placeholder if image fails
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.text(`Screenshot ${idx + 1}: ${screenshot.domain || 'Unknown'}`, xPos, yPosition + 20);
            doc.text('(Image could not be loaded)', xPos, yPosition + 26);
          }

          // Move to next position
          currentCol++;
          if (currentCol >= screenshotsPerRow) {
            currentCol = 0;
            currentRow++;
            yPosition += imageHeight + 25; // Move down for next row
          }
        });

        // If we ended mid-row, move to next line
        if (currentCol > 0) {
          yPosition += imageHeight + 25;
        }
        
        yPosition += 10; // Add spacing after screenshots section
      }

      // Technical Details Section
      if (yPosition > pageHeight - 60) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('TECHNICAL DETAILS', 20, yPosition);
      yPosition += 8;

      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('Analysis Method: Automated Phishing Detection', 20, yPosition);
      yPosition += 6;
      doc.text('Detection Engine: Advanced Phishing Detection System', 20, yPosition);
      yPosition += 6;
      doc.text('Scan Duration: ~30 seconds', 20, yPosition);
      yPosition += 6;
      doc.text('Report Version: 1.0', 20, yPosition);
      yPosition += 6;
      doc.text('Generated: ' + new Date().toISOString(), 20, yPosition);

      // Footer with company info
      const footerY = pageHeight - 20;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.text('Advanced Phishing Detection System', pageWidth / 2, footerY, { align: 'center' });
      doc.text('Specialized Phishing Threat Analysis Report', pageWidth / 2, footerY + 5, { align: 'center' });
      doc.text('© 2024 Phishing Detection System. All rights reserved.', pageWidth / 2, footerY + 10, { align: 'center' });

      // Save the PDF
      const filename = `security-analysis-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(filename);
      
      alert(`✅ Professional PDF report downloaded: ${filename}`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('❌ Error generating PDF. Please try again.');
    }
  };

  // Generate CSV report with all evidence
  const generateCSVReport = (data) => {
    if (!data) return 'No scan results available';
    
    const rows = [];
    
    // Header row
    rows.push([
      'Domain',
      'Fuzzer',
      'Attack Category',
      'Active',
      'Risk Score',
      'Visual Similarity %',
      'Content Similarity %',
      'SSL Valid',
      'SSL Self-Signed',
      'SSL Issuer',
      'SSL Subject',
      'SSL Expiry',
      'Country',
      'City',
      'ISP',
      'Registrar',
      'Registration Date',
      'Expiry Date',
      'DNS A Records',
      'DNS MX Records',
      'DNS NS Records',
      'WHOIS Info'
    ].join(','));
    
    // Data rows
    if (Array.isArray(data.domain_variations)) {
      data.domain_variations.forEach(v => {
        const escapeCSV = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        
        const aRecords = Array.isArray(v.dns_a) ? v.dns_a.join('; ') : '';
        const mxRecords = Array.isArray(v.dns_mx) ? v.dns_mx.join('; ') : '';
        const nsRecords = Array.isArray(v.dns_ns) ? v.dns_ns.join('; ') : '';
        const whoisInfo = v.whois_info ? JSON.stringify(v.whois_info).replace(/"/g, '""') : '';
        
        rows.push([
          escapeCSV(v.domain || v.domain_name),
          escapeCSV(v.fuzzer || 'unknown'),
          escapeCSV(v.attack_category || ''),
          escapeCSV(v.active ? 'Yes' : 'No'),
          escapeCSV(v.risk_score || 0),
          escapeCSV(v.phash_similarity || v.phash || ''),
          escapeCSV(v.lsh_similarity || v.lsh || ''),
          escapeCSV(v.ssl_info?.valid !== false ? 'Yes' : 'No'),
          escapeCSV(v.ssl_info?.self_signed ? 'Yes' : 'No'),
          escapeCSV(v.ssl_info?.issuer || ''),
          escapeCSV(v.ssl_info?.subject || ''),
          escapeCSV(v.ssl_info?.expiry || ''),
          escapeCSV(v.geo_info?.country || v.geo_info?.country_code || ''),
          escapeCSV(v.geo_info?.city || ''),
          escapeCSV(v.geo_info?.isp || ''),
          escapeCSV(v.geo_info?.registrar || ''),
          escapeCSV(v.registration_date || ''),
          escapeCSV(v.expiry_date || ''),
          escapeCSV(aRecords),
          escapeCSV(mxRecords),
          escapeCSV(nsRecords),
          escapeCSV(whoisInfo)
        ].join(','));
      });
    }
    
    return rows.join('\n');
  };

  // Download results in different formats
  const downloadResults = async (format = 'json') => {
    if (!scanResults) {
      alert('No scan results available to download');
      return;
    }

    try {
      let dataStr, mimeType, extension, filename;

      if (format === 'json') {
        dataStr = JSON.stringify(scanResults, null, 2);
        mimeType = 'application/json';
        extension = 'json';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
      } else if (format === 'csv') {
        dataStr = generateCSVReport(scanResults);
        mimeType = 'text/csv;charset=utf-8';
        extension = 'csv';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
      } else if (format === 'txt') {
        // Use tgpt converted text if available, otherwise use fallback
        if (readableText) {
          dataStr = readableText;
        } else {
          dataStr = generateTextReport(scanResults);
        }
        mimeType = 'text/plain;charset=utf-8';
        extension = 'txt';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      } else if (format === 'readable') {
        // Download readable text format (tgpt converted)
        if (!readableText) {
          // Try to convert now if not already converted
          try {
            if (window.cyberGuard && window.cyberGuard.convertPhishingJsonToText) {
              const conversionResult = await window.cyberGuard.convertPhishingJsonToText(scanResults);
              if (conversionResult && conversionResult.success) {
                dataStr = conversionResult.readableText;
                setReadableText(conversionResult.readableText);
              } else {
                dataStr = generateTextReport(scanResults);
              }
            } else {
              dataStr = generateTextReport(scanResults);
            }
          } catch (error) {
            console.error('Error converting to readable format:', error);
            dataStr = generateTextReport(scanResults);
          }
        } else {
          dataStr = readableText;
        }
        mimeType = 'text/plain;charset=utf-8';
        extension = 'txt';
        filename = `phishing-detection-readable-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
      } else if (format === 'html') {
        dataStr = generateHTMLReport(scanResults);
        mimeType = 'text/html;charset=utf-8';
        extension = 'html';
        filename = `phishing-detection-${url.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.html`;
      } else if (format === 'pdf') {
        await downloadPDF();
        return;
      }

      const dataBlob = new Blob([dataStr], { type: mimeType });
      const downloadUrl = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.style.display = 'none';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 100);

      alert(`✅ Download started: ${filename}`);
    } catch (error) {
      console.error('Download error:', error);
      alert(`❌ Download failed: ${error.message}`);
    }
  };

  // View HTML report in new tab
  const viewHTMLReport = () => {
    if (!scanResults) {
      alert('No scan results available');
      return;
    }

    const htmlContent = generateHTMLReport(scanResults);
    const newWindow = window.open('', '_blank');
    newWindow.document.write(htmlContent);
    newWindow.document.close();
  };

  // Generate text report
  const generateTextReport = (data) => {
    if (!data) return 'No scan results available';

    let text = `╔══════════════════════════════════════════════════════════════════════════════╗\n`;
    text += `║                        PHISHING DETECTION REPORT                              ║\n`;
    text += `╚══════════════════════════════════════════════════════════════════════════════╝\n\n`;

    text += `📊 SCAN OVERVIEW\n`;
    text += `═══════════════════════════════════════════════════════════════════════════════\n`;
    text += `Scan Date:     ${new Date().toLocaleString()}\n`;
    text += `Target URL:    ${data.target_url || url}\n`;
    text += `Scan Type:     Phishing Detection Analysis\n`;
    text += `Status:        ${data.summary || 'Completed'}\n\n`;

    if (data.threat_score !== undefined) {
      text += `🛡️  THREAT ASSESSMENT\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      text += `Threat Score:  ${data.threat_score}/100\n`;
      text += `Risk Level:    ${data.threat_score <= 30 ? 'Low' : data.threat_score <= 60 ? 'Medium' : 'High'}\n\n`;
    }

    if (data.findings && data.findings.length > 0) {
      text += `🔍 SECURITY FINDINGS\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      data.findings.forEach((finding, index) => {
        text += `${index + 1}. ${finding.type}\n`;
        text += `   Severity: ${finding.severity}\n`;
        text += `   Evidence: ${finding.evidence}\n\n`;
      });
    }

    if (data.recommendations && data.recommendations.length > 0) {
      text += `💡 RECOMMENDATIONS\n`;
      text += `═══════════════════════════════════════════════════════════════════════════════\n`;
      data.recommendations.forEach((rec, index) => {
        text += `${index + 1}. ${rec}\n`;
      });
      text += `\n`;
    }

    text += `═══════════════════════════════════════════════════════════════════════════════\n`;
    text += `Report Generated by CyberGuard Phishing Detection System\n`;
    text += `Generated on: ${new Date().toLocaleString()}\n`;

    return text;
  };

  // Generate HTML report
  const generateHTMLReport = (data) => {
    if (!data) return '<html><body><h1>No scan data available</h1></body></html>';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Phishing Detection Report - ${data.target_url || url}</title>
    <style>
        body { font-family: 'Poppins', sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #dc2626; margin: 0; }
        .section { margin: 30px 0; }
        .section h2 { color: #333; border-left: 4px solid #dc2626; padding-left: 15px; }
        .threat-score { font-size: 32px; font-weight: bold; color: #dc2626; }
        .finding { background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #e5e7eb; }
        .severity-low { background: #dcfce7; color: #166534; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .severity-medium { background: #fef3c7; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .severity-high { background: #fee2e2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .recommendations { background: #f0f9ff; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🛡️ Phishing Detection Report</h1>
            <p><strong>Target URL:</strong> ${data.target_url || url}</p>
            <p><strong>Scan Date:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div class="section">
            <h2>Threat Assessment</h2>
            <p><strong>Threat Score:</strong> <span class="threat-score">${data.threat_score || 0}/100</span></p>
            <p><strong>Risk Level:</strong> ${data.threat_score <= 30 ? 'Low Risk' : data.threat_score <= 60 ? 'Medium Risk' : 'High Risk'}</p>
        </div>

        <div class="section">
            <h2>Security Findings</h2>
            ${data.findings ? data.findings.map(finding => `
                <div class="finding">
                    <h3>${finding.type}</h3>
                    <p>${finding.evidence}</p>
                    <span class="severity-${finding.severity.toLowerCase()}">${finding.severity} Risk</span>
                </div>
            `).join('') : '<p>No findings available</p>'}
        </div>

        <div class="section">
            <h2>Recommendations</h2>
            <div class="recommendations">
                <ul>
                    ${data.recommendations ? data.recommendations.map(rec => `<li>${rec}</li>`).join('') : '<li>No recommendations available</li>'}
                </ul>
            </div>
        </div>

        <div class="section">
            <h2>Report Information</h2>
            <p><strong>Report ID:</strong> ${Date.now()}</p>
            <p><strong>Generated by:</strong> CyberGuard Phishing Detection System</p>
            <p><strong>Report Version:</strong> 1.0</p>
        </div>
    </div>
</body>
</html>`;
  };

  // Get risk level color
  const getRiskColor = (score) => {
    if (score <= 30) return 'text-green-600';
    if (score <= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get severity badge color
  const getSeverityBadgeColor = (severity) => {
    switch (severity) {
      case 'High': return 'bg-red-100 text-red-800 border border-red-200';
      case 'Medium': return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      case 'Low': return 'bg-green-100 text-green-800 border border-green-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white relative">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Phishing & Brand Abuse Detection</h1>
            <p className="text-orange-100">Advanced analysis for phishing, typosquatting, and brand impersonation</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowOverview(!showOverview)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              {showOverview ? '📊 Hide Overview' : '📊 Show Overview'}
            </button>
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
            >
              ❓ Help
            </button>
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {/* {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-orange-600 to-orange-600 text-white p-6 rounded-t-xl flex items-center justify-between">
              <h2 className="text-2xl font-bold">📖 Phishing Detection Process Guide</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🔍 How It Works</h3>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 space-y-3">
                  <p className="text-gray-700 dark:text-gray-300">
                    This system uses <strong>dnstwist</strong>, an advanced domain name permutation engine that generates 
                    typosquatting variations of a target domain to identify potential phishing threats.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">1. Domain Fuzzing</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Generates domain variations using multiple algorithms: addition, bitsquatting, dictionary, 
                        homoglyph, transposition, and subdomain techniques.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">2. DNS Verification</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Checks which variations are actually registered and have active DNS records, filtering 
                        out unregistered domains.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">3. Visual Analysis</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Captures screenshots of suspicious domains and uses perceptual hashing (phash) to 
                        compare visual similarity with the original domain.
                      </p>
                    </div>
                    <div className="bg-white dark:bg-slate-700 rounded-lg p-3">
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">4. Content Analysis</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Uses fuzzy hashing (LSH with ssdeep) to compare HTML content similarity and detect 
                        potential content copying or phishing attempts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">⚙️ Command Used</h3>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 overflow-x-auto">
                  <code>
                    dnstwist --fuzzers "*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain" --registered --geoip --phash --lsh ssdeep --screenshots /tmp/dnstwist_screenshots --format json webnox.in
                  </code>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  This command runs through WSL (Windows Subsystem for Linux) and uses the comprehensive Python wrapper 
                  to execute dnstwist with all advanced features enabled.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">🎯 Detection Features</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Domain Typosquatting</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Identifies domains that closely resemble legitimate ones (e.g., g00gle.com, googIe.com)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <span className="text-2xl">📸</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Visual Similarity (phash)</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Compares screenshots to detect visual spoofing attempts
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                    <span className="text-2xl">🔍</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Content Similarity (ssdeep)</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Analyzes HTML content to detect copied or similar pages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <span className="text-2xl">🌍</span>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">Geolocation & WHOIS</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Provides location and registration information for suspicious domains
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">📊 Understanding Results</h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <p><strong>Threat Score:</strong> 0-100 rating indicating overall phishing risk</p>
                  <p><strong>Active Domains:</strong> Suspicious domains that are currently registered and accessible</p>
                  <p><strong>Visual Matches:</strong> Domains with high screenshot similarity scores</p>
                  <p><strong>Content Matches:</strong> Domains with similar HTML content (potential phishing pages)</p>
                  <p><strong>SSL Issues:</strong> Domains with invalid or suspicious certificates</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )} */}

{/*       
      {showOverview && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">📊 Overview & Live Console</h2>
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-2">
                {isScanning ? (
                  <>
                    <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-orange-600 dark:text-orange-400 font-medium">Scanning...</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-600 dark:text-gray-400">Ready</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gradient-to-br from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">🔍 Detection Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">System Status:</span>
                  <span className={`font-medium ${isScanning ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                    {isScanning ? 'Scanning' : 'Operational'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Kali Linux:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{kaliStatus}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">dnstwist:</span>
                  <span className="font-medium text-green-600 dark:text-green-400">Ready</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">⚡ Quick Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Last Scan:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scanResults ? 'Completed' : 'Not yet scanned'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Total Variations:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {scanResults?.statistics?.total_variations || 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Threat Score:</span>
                  <span className={`font-medium ${scanResults?.threat_score ? getRiskColor(scanResults.threat_score) : 'text-gray-900 dark:text-gray-100'}`}>
                    {scanResults?.threat_score || 'N/A'}/100
                  </span>
                </div>
              </div>
            </div>
          </div>

     
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center">
              <span className="mr-2">📟</span>
              Live Console Output
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                {isScanning ? '(Live logs streaming in real-time...)' : '(Real-time logs will appear here during scans)'}
              </span>
            </h3>
            <div
              ref={logContainerRef}
              className="max-h-96 overflow-y-auto bg-black border-2 border-gray-700 rounded-lg p-4 text-xs font-mono"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                color: '#00ff00',
                textShadow: '0 0 5px #00ff00',
                minHeight: '200px',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-gray-500">
                  <div className="mb-2">$ Waiting for scan to start...</div>
                  <div className="text-gray-600">Console output will appear here in real-time</div>
                  <div className="mt-4 text-green-400">Ready to scan. Enter a URL and click "Start Phishing Analysis"</div>
                </div>
              ) : (
                logs.map((log, index) => (
                  <div key={index} className="mb-1 whitespace-pre-wrap break-words">
                    {log}
                  </div>
                ))
              )}
            </div>
            {logs.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Showing {logs.length} log entries
              </div>
            )}
          </div>

      
          <div className="mt-6 bg-gray-50 dark:bg-slate-900/50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">ℹ️ Current Process</h3>
            <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p>
                <strong>Tool:</strong> dnstwist (Domain Name System Twist) - Advanced domain permutation engine
              </p>
              <p>
                <strong>Method:</strong> Typosquatting detection via domain fuzzing algorithms
              </p>
              <p>
                <strong>Features:</strong> DNS verification, visual similarity (phash), content analysis (ssdeep), geolocation (geoip)
              </p>
              <p>
                <strong>Execution:</strong> Runs via WSL using Python wrapper with comprehensive error handling
              </p>
            </div>
          </div>
        </div>
      )} */}


      {/* Input Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 w-full">
        <h2 className="text-xl font-semibold mb-4">Scan Configuration</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Website URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isScanning}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter the URL you want to analyze for phishing threats
            </p>
          </div>

          {/* Advanced Options */}
          <div className="border-t pt-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">🔧 Advanced Detection Options</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Deep Content Analysis</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">SSL Certificate Check</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Visual Similarity Check</span>
                </label>
              </div>
              <div className="space-y-3">
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Domain Typosquatting</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Malware Detection</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Social Engineering Analysis</span>
                </label>
              </div>
            </div>
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
                <span>Scanning in Progress...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>Start Phishing Analysis</span>
              </>
            )}
          </button>
        </div>
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
            <div>
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Scanning in Progress</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">{progressMessage}</p>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-orange-800 dark:text-orange-200">Progress</span>
              <span className="text-orange-600 dark:text-orange-400 font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-2">
              <div
                className="bg-orange-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          {/* Progress Messages */}
          <div className="mt-3 p-3 bg-orange-100 dark:bg-orange-800 rounded-lg">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              {progressMessage || 'Analyzing website...'}
            </p>
          </div>

          {/* Live Terminal Log Display */}
          <div className="mt-3">
            <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200 mb-2">
              📟 Kali Console Output (Live)
            </h4>
            <div
              ref={logContainerRef}
              className="max-h-96 overflow-y-auto bg-black border-2 border-orange-500 rounded-lg p-4 text-xs font-mono"
              style={{
                fontFamily: 'Consolas, "Courier New", monospace',
                color: '#00ff00',
                textShadow: '0 0 5px #00ff00',
              }}
            >
              {logs.length === 0 ? (
                <div className="text-green-500 opacity-70">Waiting for console output...</div>
              ) : (
                logs.map((ln, i) => (
                  <div
                    key={i}
                    className="whitespace-pre-wrap mb-1 text-green-400"
                    style={{
                      lineHeight: '1.5',
                      wordBreak: 'break-word',
                    }}
                  >
                    <span className="text-green-600 mr-2">$</span>
                    {ln}
                  </div>
                ))
              )}
              {isScanning && logs.length > 0 && (
                <div className="text-green-500 animate-pulse">_</div>
              )}
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
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm flex items-center space-x-2"
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
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Scan Results</h2>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => downloadResults('readable')}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all text-base font-semibold flex items-center space-x-2 shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Readable Report</span>
              </button>
              <button
                onClick={() => downloadResults('pdf')}
                className="px-8 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition-all text-lg font-semibold flex items-center space-x-2 shadow-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Download Advanced Phishing Report (PDF)</span>
              </button>
            </div>
          </div>

          {/* Executive Summary - User Friendly */}
          <div className="bg-gradient-to-r from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl p-6 mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <svg className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scan Summary
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Target Domain</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">
                  {scanResults.target_domain || scanResults.target_url || 'N/A'}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Scan Date</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.timestamp ? new Date(scanResults.timestamp).toLocaleString() : new Date().toLocaleString()}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Domain Variations Found</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.statistics?.total_variations || 0}
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Active/Registered Domains</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {scanResults.statistics?.active_domains || 0} / {scanResults.statistics?.total_variations || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Educational Info - Enhanced */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-green-900 dark:text-green-100 mb-3 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              💡 Understanding Your Results
            </h3>
            <div className="grid md:grid-cols-3 gap-4 text-sm text-green-800 dark:text-green-200">
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">Threat Score:</p>
                <p className="text-xs">0-30 = Low Risk (Safe)</p>
                <p className="text-xs">31-60 = Medium Risk (Caution)</p>
                <p className="text-xs">61-100 = High Risk (Dangerous)</p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">Visual Similarity:</p>
                <p className="text-xs">Shows how similar the website looks compared to the original. Higher percentage = more suspicious.</p>
              </div>
              <div className="bg-white/50 dark:bg-slate-800/50 rounded-lg p-3">
                <p className="font-semibold mb-1">SSL Certificate:</p>
                <p className="text-xs">Valid certificates ensure encrypted communication. Invalid certificates may indicate phishing sites.</p>
              </div>
            </div>
          </div>

          {/* Threat Score */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Threat Score</span>
              <span className={`text-lg font-bold ${getRiskColor(scanResults.threat_score)}`}>
                {scanResults.threat_score}/100
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  scanResults.threat_score <= 30 ? 'bg-green-600' :
                  scanResults.threat_score <= 60 ? 'bg-yellow-600' :
                  'bg-orange-600'
                }`}
                style={{ width: `${scanResults.threat_score}%` }}
              ></div>
            </div>
          </div>

          {/* Findings */}
          {scanResults.findings && scanResults.findings.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Findings</h3>
              <div className="space-y-3">
                {scanResults.findings.map((finding, index) => (
                  <div key={index} className="p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{finding.type}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityBadgeColor(finding.severity)}`}>
                        {finding.severity}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{finding.evidence}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {scanResults.recommendations && scanResults.recommendations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recommendations</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
                {scanResults.recommendations.map((rec, index) => (
                  <li key={index}>
                    <span className="text-sm text-gray-700 dark:text-gray-300">{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Screenshots Section - Enhanced */}
          {scanResults.screenshots && Array.isArray(scanResults.screenshots) && scanResults.screenshots.length > 0 && (
            <div className="mb-6">
              <div className="bg-gradient-to-r from-orange-50 to-orange-50 dark:from-orange-900/20 dark:to-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 flex items-center">
                  <svg className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Visual Similarity Analysis - Captured Screenshots
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  These screenshots show visual similarity between suspicious domains and the original. 
                  High similarity may indicate phishing attempts. Total: <strong>{scanResults.screenshots.length} screenshots</strong>
                </p>
              </div>
              
              <div className="flex overflow-x-auto gap-6 pb-4" style={{ 
                scrollbarWidth: 'thin',
                WebkitOverflowScrolling: 'touch'
              }}>
                {scanResults.screenshots.map((screenshot, idx) => {
                  // Find matching domain variation for additional info
                  const matchingVar = scanResults.domain_variations?.find(
                    v => (v.domain || v.domain_name) === screenshot.domain
                  );
                  const phashSim = matchingVar?.phash_similarity || matchingVar?.phash;
                  const riskScore = matchingVar?.risk_score || 0;
                  
                  return (
                    <div key={idx} className="border-2 border-gray-300 dark:border-slate-600 rounded-xl p-4 bg-white dark:bg-slate-800 shadow-lg hover:shadow-xl transition-shadow flex-shrink-0" style={{ minWidth: '350px', maxWidth: '400px' }}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate mb-1">
                            {screenshot.domain || 'Unknown Domain'}
                          </div>
                          {phashSim && (
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-600 dark:text-gray-400">Visual Similarity:</span>
                              <span className={`text-xs font-bold ${
                                phashSim > 80 ? 'text-red-600' : 
                                phashSim > 60 ? 'text-orange-600' : 
                                'text-green-600'
                              }`}>
                                {typeof phashSim === 'number' ? `${Math.round(phashSim)}%` : phashSim}
                              </span>
                            </div>
                          )}
                          {riskScore > 0 && (
                            <div className="mt-1">
                              <span className={`text-xs px-2 py-1 rounded font-medium ${
                                riskScore > 60 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                riskScore > 30 ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                                'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              }`}>
                                Risk: {riskScore}/100
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {screenshot.base64 ? (
                        <div className="relative group">
                          <img
                            src={`data:image/png;base64,${screenshot.base64}`}
                            alt={`Screenshot of ${screenshot.domain}`}
                            className="w-full h-auto rounded-lg border-2 border-gray-200 dark:border-slate-700 cursor-pointer hover:border-orange-500 transition-all"
                            style={{ maxHeight: '300px', objectFit: 'contain', minHeight: '150px' }}
                            onClick={() => {
                              // Open image in new window for full view
                              const newWindow = window.open();
                              if (newWindow) {
                                newWindow.document.write(`
                                  <html>
                                    <head><title>Screenshot - ${screenshot.domain}</title></head>
                                    <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                                      <img src="data:image/png;base64,${screenshot.base64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                    </body>
                                  </html>
                                `);
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
                        <div className="w-full h-48 bg-gray-200 dark:bg-slate-700 rounded-lg flex flex-col items-center justify-center text-gray-500">
                          <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-sm">No screenshot available</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Domain Variations Preview - Enhanced */}
          {Array.isArray(scanResults.domain_variations) && scanResults.domain_variations.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Domain Variations ({scanResults.domain_variations.length})
                </h3>
                <button
                  onClick={() => downloadResults('csv')}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export CSV</span>
                </button>
              </div>
              <div className="overflow-x-auto overflow-y-auto border border-gray-200 dark:border-slate-700 rounded-lg" style={{ maxHeight: '500px' }}>
                <table className="min-w-full text-sm" style={{ width: '100%', tableLayout: 'auto' }}>
                  <thead className="bg-gradient-to-r from-gray-100 to-gray-200 dark:from-slate-700 dark:to-slate-800 text-gray-700 dark:text-gray-200 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold">Domain Name</th>
                      <th className="text-left px-4 py-3 font-semibold">Fuzzer Type</th>
                      <th className="text-left px-4 py-3 font-semibold">Attack Category</th>
                      <th className="text-center px-4 py-3 font-semibold">Status</th>
                      <th className="text-center px-4 py-3 font-semibold">Risk Score</th>
                      <th className="text-center px-4 py-3 font-semibold">Visual Similarity</th>
                      <th className="text-center px-4 py-3 font-semibold">Content Similarity</th>
                      <th className="text-center px-4 py-3 font-semibold">SSL Status</th>
                      <th className="text-left px-4 py-3 font-semibold">Location</th>
                      <th className="text-center px-4 py-3 font-semibold">Screenshot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {scanResults.domain_variations.map((v, i) => {
                      const aCnt = Array.isArray(v.dns_a) ? v.dns_a.length : (v.a?.length || 0);
                      const mxCnt = Array.isArray(v.dns_mx) ? v.dns_mx.length : (v.mx?.length || 0);
                      const nsCnt = Array.isArray(v.dns_ns) ? v.dns_ns.length : (v.ns?.length || 0);
                      const riskScore = v.risk_score || 0;
                      const phashSim = v.phash_similarity || v.phash || null;
                      const lshSim = v.lsh_similarity || v.lsh || null;
                      const sslValid = v.ssl_info?.valid !== false;
                      const sslSelfSigned = v.ssl_info?.self_signed || false;
                      const country = v.geo_info?.country || v.geo_info?.country_code || '';
                      
                      // Find matching screenshot
                      const matchingScreenshot = scanResults.screenshots?.find(
                        s => s.domain === (v.domain || v.domain_name)
                      );
                      
                      return (
                        <tr key={`${v.domain || v.domain_name || i}-${i}`} className="hover:bg-gray-50 dark:hover:bg-slate-800">
                          <td className="px-4 py-3 font-mono text-xs font-medium">{v.domain || v.domain_name}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                              {v.fuzzer || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {v.attack_category ? (
                              <div className="flex flex-wrap gap-1">
                                {v.attack_category.split(',').map((cat, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                                  >
                                    {cat.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${v.active ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300'}`}>
                              {v.active ? '✓ Active' : '✗ Inactive'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              riskScore >= 70 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                              riskScore >= 40 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            }`}>
                              {riskScore}/100
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {phashSim !== null && phashSim !== undefined ? (
                              <span className={`text-xs font-bold ${
                                phashSim > 80 ? 'text-red-600 dark:text-red-400' :
                                phashSim > 60 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-gray-600 dark:text-gray-400'
                              }`}>
                                {typeof phashSim === 'number' ? `${Math.round(phashSim)}%` : String(phashSim)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {lshSim !== null && lshSim !== undefined ? (
                              <span className={`text-xs font-bold ${
                                lshSim > 70 ? 'text-red-600 dark:text-red-400' :
                                lshSim > 50 ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-gray-600 dark:text-gray-400'
                              }`}>
                                {typeof lshSim === 'number' ? `${Math.round(lshSim)}%` : String(lshSim)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {v.ssl_info ? (
                              <span className={`text-xs font-medium px-2 py-1 rounded ${
                                sslValid && !sslSelfSigned ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 
                                sslSelfSigned ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' : 
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {sslValid && !sslSelfSigned ? '✓ Valid' : sslSelfSigned ? '⚠ Self-signed' : '✗ Invalid'}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {country ? (
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300" title={v.geo_info?.city || ''}>
                                {country}
                                {v.geo_info?.city ? `, ${v.geo_info.city.substring(0, 10)}` : ''}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {matchingScreenshot?.base64 ? (
                              <div className="relative group">
                                <img
                                  src={`data:image/png;base64,${matchingScreenshot.base64}`}
                                  alt={`Screenshot of ${v.domain || v.domain_name}`}
                                  className="w-16 h-12 object-cover rounded border border-gray-300 dark:border-slate-600 cursor-pointer hover:border-orange-500 transition-all"
                                  onClick={() => {
                                    const newWindow = window.open();
                                    if (newWindow) {
                                      newWindow.document.write(`
                                        <html>
                                          <head><title>Screenshot - ${v.domain || v.domain_name}</title></head>
                                          <body style="margin:0;background:#000;display:flex;justify-content:center;align-items:center;height:100vh;">
                                            <img src="data:image/png;base64,${matchingScreenshot.base64}" style="max-width:100%;max-height:100%;object-fit:contain;" />
                                          </body>
                                        </html>
                                      `);
                                    }
                                  }}
                                  title="Click to view full size screenshot"
                                />
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Root Password Prompt (inline modal) */}
      {askPassword && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-md p-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Root access required to continue</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Enter your WSL root password to run dnstwist and install missing tools.</p>
            <input
              type="password"
              value={rootPassword}
              onChange={(e)=>setRootPassword(e.target.value)}
              placeholder="Enter WSL root password"
              className="mt-3 w-full border border-gray-300 dark:border-slate-600 rounded px-3 py-2 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={()=>setAskPassword(false)} className="px-3 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
              <button
                onClick={async ()=>{
                  if (!rootPassword) return;
                  try {
                    await window.cyberGuard?.storeRootPassword?.(rootPassword);
                    setAskPassword(false);
                    setLogs((l)=>[...l,'🔐 Root password stored for this session']);
                  } catch {}
                }}
                className="px-3 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700"
              >Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Missing dnstwist helper */}
      {!isScanning && !scanResults && dnstwistInstall.installing === false && dnstwistInstall.done === false && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-orange-900 dark:text-orange-100 font-semibold mb-1">dnstwist is required</h3>
              <p className="text-sm text-orange-800 dark:text-orange-200">If your last scan failed due to missing dnstwist, click install to add it inside WSL.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={installDnstwist} className="px-3 py-2 text-sm rounded bg-orange-600 text-white hover:bg-orange-700">Install dnstwist</button>
            </div>
          </div>
          {dnstwistInstall.error && (
            <div className="mt-2 text-sm text-red-700">{dnstwistInstall.error}</div>
          )}
          {dnstwistInstall.progress > 0 && (
            <div className="mt-3">
              <div className="w-full bg-orange-200 h-2 rounded">
                <div className="bg-orange-600 h-2 rounded" style={{ width: `${dnstwistInstall.progress}%` }} />
              </div>
              <div className="mt-1 text-xs text-orange-800">{Math.round(dnstwistInstall.progress)}%</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default PhishingDetection;
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
