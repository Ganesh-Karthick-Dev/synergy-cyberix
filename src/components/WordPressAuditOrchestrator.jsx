import { useState, useEffect, useRef } from 'react'
import { useToast } from '../context/ToastContext'

const WordPressAuditOrchestrator = ({ siteUrl, adminProvided, adminCreds }) => {
  const { showSuccess, showError, showLoading, dismissToast } = useToast()
  
  // Audit state
  const [auditStarted, setAuditStarted] = useState(false)
  const [auditCompleted, setAuditCompleted] = useState(false)
  const [currentModule, setCurrentModule] = useState(null)
  const [modules, setModules] = useState([
    { id: 'cms-detection', name: 'CMS Detection', status: 'pending', progress: 0 },
    { id: 'vulnerability-scanning', name: 'Vulnerability Scanning', status: 'pending', progress: 0 },
    { id: 'plugin-theme-audit', name: 'Plugin & Theme Status Audit', status: 'pending', progress: 0 },
    { id: 'config-hardening', name: 'Configuration Hardening Checks', status: 'pending', progress: 0 },
    { id: 'admin-security', name: 'Admin Account Security Audit', status: 'pending', progress: 0 },
    { id: 'backup-restoration', name: 'Backup & Restoration', status: 'pending', progress: 0 },
    { id: 'update-management', name: 'Update Management', status: 'pending', progress: 0 },
    { id: 'firewall-ddos', name: 'Firewall & DDoS Protection', status: 'pending', progress: 0 }
  ])
  
  // Timing
  const [startedTime, setStartedTime] = useState(null)
  const [expectedCompletionTime, setExpectedCompletionTime] = useState(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  // Results and logs
  const [auditResults, setAuditResults] = useState({})
  const [logs, setLogs] = useState([])
  const [finalReport, setFinalReport] = useState(null)
  
  // UI state
  const [showReportPreview, setShowReportPreview] = useState(false)
  const [selectedModuleReport, setSelectedModuleReport] = useState(null)
  
  const intervalRef = useRef(null)

  // Calculate elapsed time
  useEffect(() => {
    if (auditStarted && !auditCompleted) {
      intervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [auditStarted, auditCompleted])

  // Regenerate final report when auditResults changes
  useEffect(() => {
    if (auditCompleted && Object.keys(auditResults).length > 0) {
      generateFinalReport()
    }
  }, [auditResults, auditCompleted])

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const addLog = (module, step, command, output, exitCode = 0) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      module,
      step,
      command,
      output,
      exitCode
    }
    setLogs(prev => [...prev, logEntry])
  }

  const updateModuleStatus = (moduleId, status, progress = 0, results = null) => {
    setModules(prev => prev.map(module => 
      module.id === moduleId 
        ? { ...module, status, progress, results }
        : module
    ))
    
    if (results) {
      setAuditResults(prev => ({ ...prev, [moduleId]: results }))
    }
  }

  const estimateAuditTime = () => {
    // Base time estimation based on site complexity
    let baseMinutes = 5 // Small site default
    
    // Add time for authenticated scans
    if (adminProvided) {
      baseMinutes += 10
    }
    
    return baseMinutes * 60 // Convert to seconds
  }

  const startAudit = async () => {
    if (!siteUrl) {
      showError('Site URL is required to start the audit')
      return
    }

    setAuditStarted(true)
    setAuditCompleted(false)
    setStartedTime(new Date().toISOString())
    setElapsedTime(0)
    setLogs([])
    setAuditResults({})
    
    const estimatedDuration = estimateAuditTime()
    const expectedEnd = new Date(Date.now() + estimatedDuration * 1000)
    setExpectedCompletionTime(expectedEnd.toISOString())
    
    const loadingToastId = showLoading('Starting WordPress Security Audit...')
    
    try {
      // Run all modules sequentially
      await runCMSDetection()
      await runVulnerabilityScanning()
      await runPluginThemeAudit()
      await runConfigHardening()
      await runAdminSecurity()
      await runBackupRestoration()
      await runUpdateManagement()
      await runFirewallDDoS()
      
      // Generate final report
      await generateFinalReport()
      
      setAuditCompleted(true)
      dismissToast(loadingToastId)
      showSuccess('WordPress Security Audit completed successfully!')
      
    } catch (error) {
      dismissToast(loadingToastId)
      showError(`Audit failed: ${error.message}`)
      console.error('Audit error:', error)
    }
  }

  // Module 1: CMS Detection
  const runCMSDetection = async () => {
    setCurrentModule('cms-detection')
    updateModuleStatus('cms-detection', 'running', 10)
    
    addLog('cms-detection', 'start', 'Starting CMS detection', 'Initializing detection tools...')
    
    try {
      // Simulate whatweb command
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('cms-detection', 'whatweb', 'whatweb --no-errors --color=never ' + siteUrl, 'WordPress detected')
      
      updateModuleStatus('cms-detection', 'running', 50)
      
      // Simulate cmseek command
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('cms-detection', 'cmseek', 'cmseek -u ' + siteUrl + ' --no-plugins', 'CMS: WordPress 6.4.2')
      
      updateModuleStatus('cms-detection', 'running', 80)
      
      // Simulate wpscan detection
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('cms-detection', 'wpscan', 'wpscan --url ' + siteUrl + ' --no-update', 'WordPress version: 6.4.2')
      
      const results = {
        cmsType: 'WordPress',
        version: '6.4.2',
        serverHeaders: {
          'Server': 'Apache/2.4.41',
          'X-Powered-By': 'PHP/8.1.2'
        },
        technologies: ['WordPress', 'PHP', 'Apache', 'MySQL']
      }
      
      updateModuleStatus('cms-detection', 'completed', 100, results)
      addLog('cms-detection', 'complete', 'CMS Detection completed', 'WordPress 6.4.2 detected successfully')
      
    } catch (error) {
      updateModuleStatus('cms-detection', 'failed', 0)
      addLog('cms-detection', 'error', 'CMS Detection failed', error.message, 1)
      throw error
    }
  }

  // Module 2: Vulnerability Scanning
  const runVulnerabilityScanning = async () => {
    setCurrentModule('vulnerability-scanning')
    updateModuleStatus('vulnerability-scanning', 'running', 10)
    
    addLog('vulnerability-scanning', 'start', 'Starting vulnerability scan', 'Initializing WPScan...')
    
    try {
      // Unauthenticated scan
      await new Promise(resolve => setTimeout(resolve, 3000))
      addLog('vulnerability-scanning', 'wpscan', 'wpscan --url ' + siteUrl + ' --enumerate p,t,u --format json --no-update', 'Found 3 vulnerabilities')
      
      updateModuleStatus('vulnerability-scanning', 'running', 40)
      
      // Authenticated scan if credentials provided
      if (adminProvided && adminCreds) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        addLog('vulnerability-scanning', 'wpscan-auth', 'wpscan --url ' + siteUrl + ' --username ' + adminCreds.username + ' --enumerate ap,at,tt --format json', 'Authenticated scan completed')
        updateModuleStatus('vulnerability-scanning', 'running', 70)
      }
      
      // Simulate wapiti scan
      await new Promise(resolve => setTimeout(resolve, 2500))
      addLog('vulnerability-scanning', 'wapiti', 'wapiti -u ' + siteUrl + ' -f json -o wapiti_report.json', 'Deep scan completed')
      
      const results = {
        vulnerabilities: [
          {
            id: 'CVE-2023-1234',
            title: 'WordPress Plugin XSS Vulnerability',
            severity: 'High',
            cvss: 7.5,
            description: 'Cross-site scripting vulnerability in plugin',
            affected: 'Plugin: Contact Form 7 v5.7.7',
            status: 'Vulnerable'
          },
          {
            id: 'CVE-2023-5678',
            title: 'WordPress Core SQL Injection',
            severity: 'Critical',
            cvss: 9.1,
            description: 'SQL injection in core functionality',
            affected: 'WordPress Core 6.4.2',
            status: 'Vulnerable'
          }
        ],
        totalVulnerabilities: 3,
        criticalCount: 1,
        highCount: 1,
        mediumCount: 1
      }
      
      updateModuleStatus('vulnerability-scanning', 'completed', 100, results)
      addLog('vulnerability-scanning', 'complete', 'Vulnerability scanning completed', 'Found 3 vulnerabilities (1 Critical, 1 High, 1 Medium)')
      
    } catch (error) {
      updateModuleStatus('vulnerability-scanning', 'failed', 0)
      addLog('vulnerability-scanning', 'error', 'Vulnerability scanning failed', error.message, 1)
      throw error
    }
  }

  // Module 3: Plugin & Theme Status Audit
  const runPluginThemeAudit = async () => {
    setCurrentModule('plugin-theme-audit')
    updateModuleStatus('plugin-theme-audit', 'running', 10)
    
    addLog('plugin-theme-audit', 'start', 'Starting plugin and theme audit', 'Enumerating plugins and themes...')
    
    try {
      // Plugin enumeration
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('plugin-theme-audit', 'plugins', 'wp plugin list --path=/var/www/html --format=json', 'Found 15 plugins')
      
      updateModuleStatus('plugin-theme-audit', 'running', 50)
      
      // Theme enumeration
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('plugin-theme-audit', 'themes', 'wp theme list --path=/var/www/html --format=json', 'Found 3 themes')
      
      const results = {
        plugins: [
          {
            name: 'Contact Form 7',
            version: '5.7.7',
            status: 'Active',
            updateAvailable: true,
            vulnerabilities: 1,
            lastUpdated: '2023-10-15'
          },
          {
            name: 'Yoast SEO',
            version: '20.9',
            status: 'Active',
            updateAvailable: false,
            vulnerabilities: 0,
            lastUpdated: '2023-11-20'
          }
        ],
        themes: [
          {
            name: 'Twenty Twenty-Four',
            version: '1.0',
            status: 'Active',
            updateAvailable: false,
            vulnerabilities: 0
          }
        ],
        totalPlugins: 15,
        outdatedPlugins: 3,
        totalThemes: 3,
        outdatedThemes: 0
      }
      
      updateModuleStatus('plugin-theme-audit', 'completed', 100, results)
      addLog('plugin-theme-audit', 'complete', 'Plugin and theme audit completed', 'Audited 15 plugins and 3 themes')
      
    } catch (error) {
      updateModuleStatus('plugin-theme-audit', 'failed', 0)
      addLog('plugin-theme-audit', 'error', 'Plugin and theme audit failed', error.message, 1)
      throw error
    }
  }

  // Module 4: Configuration Hardening Checks
  const runConfigHardening = async () => {
    setCurrentModule('config-hardening')
    updateModuleStatus('config-hardening', 'running', 10)
    
    addLog('config-hardening', 'start', 'Starting configuration hardening checks', 'Checking security configurations...')
    
    try {
      // HTTPS check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'https', 'curl -I -L ' + siteUrl, 'HTTPS redirect: PASS')
      
      updateModuleStatus('config-hardening', 'running', 30)
      
      // XMLRPC check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'xmlrpc', 'curl -I ' + siteUrl + '/xmlrpc.php', 'XMLRPC enabled: WARN')
      
      updateModuleStatus('config-hardening', 'running', 60)
      
      // Readme check
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('config-hardening', 'readme', 'curl -s ' + siteUrl + '/readme.html', 'Readme accessible: FAIL')
      
      const results = {
        checks: [
          {
            name: 'HTTPS Redirect',
            status: 'PASS',
            description: 'Site properly redirects to HTTPS',
            recommendation: null
          },
          {
            name: 'XMLRPC Disabled',
            status: 'WARN',
            description: 'XMLRPC is enabled and accessible',
            recommendation: 'Disable XMLRPC if not needed'
          },
          {
            name: 'Readme Files',
            status: 'FAIL',
            description: 'WordPress readme files are accessible',
            recommendation: 'Remove or protect readme files'
          },
          {
            name: 'File Edit Disabled',
            status: 'PASS',
            description: 'DISALLOW_FILE_EDIT is set',
            recommendation: null
          }
        ],
        totalChecks: 4,
        passedChecks: 2,
        warningChecks: 1,
        failedChecks: 1
      }
      
      updateModuleStatus('config-hardening', 'completed', 100, results)
      addLog('config-hardening', 'complete', 'Configuration hardening checks completed', '2 PASS, 1 WARN, 1 FAIL')
      
    } catch (error) {
      updateModuleStatus('config-hardening', 'failed', 0)
      addLog('config-hardening', 'error', 'Configuration hardening checks failed', error.message, 1)
      throw error
    }
  }

  // Module 5: Admin Account Security Audit
  const runAdminSecurity = async () => {
    setCurrentModule('admin-security')
    updateModuleStatus('admin-security', 'running', 10)
    
    addLog('admin-security', 'start', 'Starting admin account security audit', 'Enumerating admin accounts...')
    
    try {
      // User enumeration
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('admin-security', 'users', 'wp user list --format=json', 'Found 3 admin accounts')
      
      const results = {
        adminAccounts: [
          {
            id: 1,
            username: 'admin',
            email: 'admin@example.com',
            role: 'Administrator',
            lastLogin: '2023-11-25 10:30:00',
            weakPassword: true,
            twoFactorEnabled: false
          },
          {
            id: 2,
            username: 'superadmin',
            email: 'super@example.com',
            role: 'Administrator',
            lastLogin: '2023-11-24 15:45:00',
            weakPassword: false,
            twoFactorEnabled: true
          }
        ],
        totalAdmins: 3,
        weakPasswords: 1,
        twoFactorEnabled: 1,
        recommendations: [
          'Enable 2FA for all admin accounts',
          'Change weak passwords',
          'Remove unused admin accounts'
        ]
      }
      
      updateModuleStatus('admin-security', 'completed', 100, results)
      addLog('admin-security', 'complete', 'Admin account security audit completed', 'Audited 3 admin accounts')
      
    } catch (error) {
      updateModuleStatus('admin-security', 'failed', 0)
      addLog('admin-security', 'error', 'Admin account security audit failed', error.message, 1)
      throw error
    }
  }

  // Module 6: Backup & Restoration
  const runBackupRestoration = async () => {
    setCurrentModule('backup-restoration')
    updateModuleStatus('backup-restoration', 'running', 10)
    
    addLog('backup-restoration', 'start', 'Starting backup and restoration checks', 'Checking backup systems...')
    
    try {
      // Check Cloudways API if available
      if (adminCreds && adminCreds.type === 'cloudwaysApi') {
        await new Promise(resolve => setTimeout(resolve, 2000))
        addLog('backup-restoration', 'cloudways', 'POST /api/v1/.../server/{server_id}/create_backup', 'Backup created successfully')
      }
      
      // Check local backups
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('backup-restoration', 'local', 'wp db export backup_' + Date.now() + '.sql', 'Database backup created')
      
      const results = {
        backupStatus: 'Available',
        lastBackup: '2023-11-25 09:00:00',
        backupMethod: 'Cloudways API',
        backupSize: '2.5 GB',
        retentionPolicy: '30 days',
        restorationTested: false,
        recommendations: [
          'Test backup restoration process',
          'Implement automated daily backups',
          'Store backups off-site'
        ]
      }
      
      updateModuleStatus('backup-restoration', 'completed', 100, results)
      addLog('backup-restoration', 'complete', 'Backup and restoration checks completed', 'Backup system verified')
      
    } catch (error) {
      updateModuleStatus('backup-restoration', 'failed', 0)
      addLog('backup-restoration', 'error', 'Backup and restoration checks failed', error.message, 1)
      throw error
    }
  }

  // Module 7: Update Management
  const runUpdateManagement = async () => {
    setCurrentModule('update-management')
    updateModuleStatus('update-management', 'running', 10)
    
    addLog('update-management', 'start', 'Starting update management checks', 'Checking for available updates...')
    
    try {
      // Check core updates
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('update-management', 'core', 'wp core check-update', 'WordPress core is up to date')
      
      updateModuleStatus('update-management', 'running', 40)
      
      // Check plugin updates
      await new Promise(resolve => setTimeout(resolve, 2000))
      addLog('update-management', 'plugins', 'wp plugin list --update=available --format=json', '3 plugins have updates available')
      
      updateModuleStatus('update-management', 'running', 70)
      
      // Check theme updates
      await new Promise(resolve => setTimeout(resolve, 1000))
      addLog('update-management', 'themes', 'wp theme list --update=available --format=json', 'All themes are up to date')
      
      const results = {
        coreUpdate: {
          current: '6.4.2',
          available: '6.4.2',
          status: 'Up to date'
        },
        pluginUpdates: [
          {
            name: 'Contact Form 7',
            current: '5.7.7',
            available: '5.8.1',
            status: 'Update available'
          }
        ],
        themeUpdates: [],
        autoUpdateEnabled: false,
        recommendations: [
          'Enable automatic updates for minor versions',
          'Update Contact Form 7 to latest version',
          'Test updates in staging environment'
        ]
      }
      
      updateModuleStatus('update-management', 'completed', 100, results)
      addLog('update-management', 'complete', 'Update management checks completed', 'Found 1 plugin update available')
      
    } catch (error) {
      updateModuleStatus('update-management', 'failed', 0)
      addLog('update-management', 'error', 'Update management checks failed', error.message, 1)
      throw error
    }
  }

  // Module 8: Firewall & DDoS Protection
  const runFirewallDDoS = async () => {
    setCurrentModule('firewall-ddos')
    updateModuleStatus('firewall-ddos', 'running', 10)
    
    addLog('firewall-ddos', 'start', 'Starting firewall and DDoS protection checks', 'Checking edge protection...')
    
    try {
      // Check headers for protection services
      await new Promise(resolve => setTimeout(resolve, 1500))
      addLog('firewall-ddos', 'headers', 'curl -I ' + siteUrl, 'Cloudflare protection detected')
      
      updateModuleStatus('firewall-ddos', 'running', 50)
      
      // Check Cloudflare API if available
      if (adminCreds && adminCreds.type === 'cloudflareApi') {
        await new Promise(resolve => setTimeout(resolve, 2000))
        addLog('firewall-ddos', 'cloudflare', 'GET /zones/{zone_id}/firewall/rules', 'Firewall rules retrieved')
      }
      
      const results = {
        edgeProtection: {
          service: 'Cloudflare',
          status: 'Active',
          ddosProtection: true,
          wafEnabled: true
        },
        firewallRules: [
          {
            id: 'rule1',
            name: 'Block malicious IPs',
            action: 'Block',
            status: 'Active'
          }
        ],
        recommendations: [
          'Enable rate limiting',
          'Configure geo-blocking for unnecessary regions',
          'Set up DDoS protection alerts'
        ]
      }
      
      updateModuleStatus('firewall-ddos', 'completed', 100, results)
      addLog('firewall-ddos', 'complete', 'Firewall and DDoS protection checks completed', 'Edge protection verified')
      
    } catch (error) {
      updateModuleStatus('firewall-ddos', 'failed', 0)
      addLog('firewall-ddos', 'error', 'Firewall and DDoS protection checks failed', error.message, 1)
      throw error
    }
  }

  // Generate final comprehensive report
  const generateFinalReport = async () => {
    // Get the actual data from completed modules
    const cmsDetection = auditResults['cms-detection']
    const vulnerabilityScanning = auditResults['vulnerability-scanning']
    const pluginThemeAudit = auditResults['plugin-theme-audit']
    const configHardening = auditResults['config-hardening']
    const adminSecurity = auditResults['admin-security']
    const backupRestoration = auditResults['backup-restoration']
    const updateManagement = auditResults['update-management']
    const firewallDdos = auditResults['firewall-ddos']
    

    const report = {
      metadata: {
        siteUrl,
        startedTime,
        endedTime: new Date().toISOString(),
        executorVersion: '1.0.0',
        adminProvided,
        totalDuration: elapsedTime
      },
      detection: cmsDetection || {},
      vulnerabilities: vulnerabilityScanning || {},
      plugins: pluginThemeAudit || {},
      hardening: configHardening || {},
      adminAccounts: adminSecurity || {},
      backups: backupRestoration || {},
      updates: updateManagement || {},
      firewall: firewallDdos || {},
      logs,
      remediationPlan: {
        critical: [
          'Update Contact Form 7 plugin immediately',
          'Remove accessible readme files',
          'Enable 2FA for admin accounts'
        ],
        high: [
          'Disable XMLRPC if not needed',
          'Update WordPress core if available',
          'Implement automated backups'
        ],
        medium: [
          'Review firewall rules',
          'Enable auto-updates for minor versions',
          'Test backup restoration process'
        ]
      }
    }
    
    
    
    
    setFinalReport(report)
    addLog('report', 'generate', 'Final report generated', 'Comprehensive security audit report created')
  }

  const downloadReport = (format) => {
    if (!finalReport) return
    
    const timestamp = new Date().toISOString().split('T')[0]
    const filename = `wordpress-security-audit-${siteUrl.replace(/[^a-zA-Z0-9]/g, '-')}-${timestamp}`
    
    if (format === 'json') {
      const reportData = JSON.stringify(finalReport, null, 2)
      const blob = new Blob([reportData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'html') {
      const htmlContent = generateHTMLReport(finalReport)
      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.html`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else if (format === 'pdf') {
      // For PDF, we'll generate HTML and use browser's print to PDF
      const htmlContent = generateHTMLReport(finalReport)
      const printWindow = window.open('', '_blank')
      printWindow.document.write(htmlContent)
      printWindow.document.close()
      printWindow.print()
    } else if (format === 'excel') {
      // For Excel, we'll generate CSV format
      const csvContent = generateCSVReport(finalReport)
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const generateHTMLReport = (report) => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WordPress Security Audit Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
        .header { background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e5e7eb; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
        .summary-card { padding: 20px; border-radius: 8px; text-align: center; border: 1px solid; }
        .critical { background: #fef2f2; border-color: #fecaca; color: #dc2626; }
        .high { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }
        .medium { background: #fefce8; border-color: #fde047; color: #ca8a04; }
        .passed { background: #f0fdf4; border-color: #bbf7d0; color: #16a34a; }
        .section { margin: 30px 0; page-break-inside: avoid; }
        .section h3 { color: #374151; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
        .vulnerability { background: #f9fafb; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #dc2626; }
        .check { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .pass { background: #f0fdf4; border-left: 4px solid #16a34a; }
        .warn { background: #fffbeb; border-left: 4px solid #f59e0b; }
        .fail { background: #fef2f2; border-left: 4px solid #dc2626; }
        .plugin-item { background: #f9fafb; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #3b82f6; }
        .admin-item { background: #f9fafb; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #8b5cf6; }
        .backup-item { background: #f0fdf4; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #10b981; }
        .update-item { background: #fef3c7; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #f59e0b; }
        .firewall-item { background: #dbeafe; padding: 10px; margin: 5px 0; border-radius: 4px; border-left: 4px solid #3b82f6; }
        .status-badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .status-pass { background: #dcfce7; color: #166534; }
        .status-warn { background: #fef3c7; color: #92400e; }
        .status-fail { background: #fecaca; color: #991b1b; }
        .status-critical { background: #fecaca; color: #991b1b; }
        .status-high { background: #fed7aa; color: #9a3412; }
        .status-medium { background: #fde047; color: #a16207; }
        @media print {
            body { margin: 20px; }
            .section { page-break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>WordPress Security Audit Report</h1>
        <p><strong>Site:</strong> ${report.metadata.siteUrl}</p>
        <p><strong>Date:</strong> ${report.metadata.startedTime ? new Date(report.metadata.startedTime).toLocaleString() : 'Unknown'}</p>
        <p><strong>Duration:</strong> ${Math.floor(report.metadata.totalDuration / 60)}:${(report.metadata.totalDuration % 60).toString().padStart(2, '0')}</p>
        <p><strong>Admin Credentials:</strong> ${report.metadata.adminProvided ? 'Provided' : 'Not Provided'}</p>
    </div>

    <div class="summary">
        <div class="summary-card critical">
            <h2>${report.vulnerabilities?.criticalCount || 0}</h2>
            <p>Critical Issues</p>
        </div>
        <div class="summary-card high">
            <h2>${report.vulnerabilities?.highCount || 0}</h2>
            <p>High Priority</p>
        </div>
        <div class="summary-card medium">
            <h2>${report.vulnerabilities?.mediumCount || 0}</h2>
            <p>Medium Priority</p>
        </div>
        <div class="summary-card passed">
            <h2>${report.hardening?.passedChecks || 0}</h2>
            <p>Passed Checks</p>
        </div>
    </div>

    <div class="section">
        <h3>CMS Detection</h3>
        <p><strong>CMS Type:</strong> ${report.detection?.cmsType || 'Unknown'}</p>
        <p><strong>Version:</strong> ${report.detection?.version || 'Unknown'}</p>
        <p><strong>Technologies:</strong> ${report.detection?.technologies?.join(', ') || 'Unknown'}</p>
    </div>

    <div class="section">
        <h3>Vulnerabilities Found</h3>
        ${report.vulnerabilities?.vulnerabilities?.map(vuln => `
            <div class="vulnerability">
                <h4>${vuln.title}</h4>
                <p><strong>Severity:</strong> <span class="status-badge status-${vuln.severity.toLowerCase()}">${vuln.severity}</span> (CVSS: ${vuln.cvss})</p>
                <p><strong>Description:</strong> ${vuln.description}</p>
                <p><strong>Affected:</strong> ${vuln.affected}</p>
                <p><strong>Status:</strong> ${vuln.status}</p>
            </div>
        `).join('') || '<p>No vulnerabilities found.</p>'}
    </div>

    <div class="section">
        <h3>Plugin & Theme Audit</h3>
        <p><strong>Total Plugins:</strong> ${report.plugins?.totalPlugins || 0}</p>
        <p><strong>Outdated Plugins:</strong> ${report.plugins?.outdatedPlugins || 0}</p>
        <p><strong>Total Themes:</strong> ${report.plugins?.totalThemes || 0}</p>
        <p><strong>Outdated Themes:</strong> ${report.plugins?.outdatedThemes || 0}</p>
        ${report.plugins?.plugins?.map(plugin => `
            <div class="plugin-item">
                <h4>${plugin.name}</h4>
                <p><strong>Version:</strong> ${plugin.version}</p>
                <p><strong>Status:</strong> ${plugin.status}</p>
                <p><strong>Update Available:</strong> ${plugin.updateAvailable ? 'Yes' : 'No'}</p>
                <p><strong>Vulnerabilities:</strong> ${plugin.vulnerabilities || 0}</p>
            </div>
        `).join('') || '<p>No plugins found.</p>'}
    </div>

    <div class="section">
        <h3>Configuration Hardening</h3>
        <p><strong>Total Checks:</strong> ${report.hardening?.totalChecks || 0}</p>
        <p><strong>Passed:</strong> ${report.hardening?.passedChecks || 0}</p>
        <p><strong>Warnings:</strong> ${report.hardening?.warningChecks || 0}</p>
        <p><strong>Failed:</strong> ${report.hardening?.failedChecks || 0}</p>
        ${report.hardening?.checks?.map(check => `
            <div class="check ${check.status.toLowerCase()}">
                <strong>${check.name}:</strong> <span class="status-badge status-${check.status.toLowerCase()}">${check.status}</span>
                <p>${check.description}</p>
                ${check.recommendation ? `<p><strong>Recommendation:</strong> ${check.recommendation}</p>` : ''}
            </div>
        `).join('') || '<p>No hardening checks performed.</p>'}
    </div>

    <div class="section">
        <h3>Admin Account Security</h3>
        <p><strong>Total Admins:</strong> ${report.adminAccounts?.totalAdmins || 0}</p>
        <p><strong>Weak Passwords:</strong> ${report.adminAccounts?.weakPasswords || 0}</p>
        <p><strong>2FA Enabled:</strong> ${report.adminAccounts?.twoFactorEnabled || 0}</p>
        ${report.adminAccounts?.adminAccounts?.map(admin => `
            <div class="admin-item">
                <h4>${admin.username}</h4>
                <p><strong>Email:</strong> ${admin.email}</p>
                <p><strong>Role:</strong> ${admin.role}</p>
                <p><strong>Last Login:</strong> ${admin.lastLogin}</p>
                <p><strong>Weak Password:</strong> ${admin.weakPassword ? 'Yes' : 'No'}</p>
                <p><strong>2FA Enabled:</strong> ${admin.twoFactorEnabled ? 'Yes' : 'No'}</p>
            </div>
        `).join('') || '<p>No admin accounts found.</p>'}
    </div>

    <div class="section">
        <h3>Backup & Restoration</h3>
        <p><strong>Status:</strong> ${report.backups?.backupStatus || 'Unknown'}</p>
        <p><strong>Last Backup:</strong> ${report.backups?.lastBackup || 'Unknown'}</p>
        <p><strong>Method:</strong> ${report.backups?.backupMethod || 'Unknown'}</p>
        <p><strong>Size:</strong> ${report.backups?.backupSize || 'Unknown'}</p>
        <p><strong>Retention Policy:</strong> ${report.backups?.retentionPolicy || 'Unknown'}</p>
        <p><strong>Restoration Tested:</strong> ${report.backups?.restorationTested ? 'Yes' : 'No'}</p>
    </div>

    <div class="section">
        <h3>Update Management</h3>
        <p><strong>Core Status:</strong> ${report.updates?.coreUpdate?.status || 'Unknown'}</p>
        <p><strong>Current Version:</strong> ${report.updates?.coreUpdate?.current || 'Unknown'}</p>
        <p><strong>Available Version:</strong> ${report.updates?.coreUpdate?.available || 'Unknown'}</p>
        <p><strong>Auto Update Enabled:</strong> ${report.updates?.autoUpdateEnabled ? 'Yes' : 'No'}</p>
        ${report.updates?.pluginUpdates?.map(update => `
            <div class="update-item">
                <h4>${update.name}</h4>
                <p><strong>Current:</strong> ${update.current}</p>
                <p><strong>Available:</strong> ${update.available}</p>
                <p><strong>Status:</strong> ${update.status}</p>
            </div>
        `).join('') || '<p>No plugin updates available.</p>'}
    </div>

    <div class="section">
        <h3>Firewall & DDoS Protection</h3>
        <p><strong>Service:</strong> ${report.firewall?.edgeProtection?.service || 'Unknown'}</p>
        <p><strong>Status:</strong> ${report.firewall?.edgeProtection?.status || 'Unknown'}</p>
        <p><strong>DDoS Protection:</strong> ${report.firewall?.edgeProtection?.ddosProtection ? 'Active' : 'Inactive'}</p>
        <p><strong>WAF Enabled:</strong> ${report.firewall?.edgeProtection?.wafEnabled ? 'Yes' : 'No'}</p>
        ${report.firewall?.firewallRules?.map(rule => `
            <div class="firewall-item">
                <h4>${rule.name}</h4>
                <p><strong>Action:</strong> ${rule.action}</p>
                <p><strong>Status:</strong> ${rule.status}</p>
            </div>
        `).join('') || '<p>No firewall rules found.</p>'}
    </div>

    <div class="section">
        <h3>Remediation Plan</h3>
        <h4>Critical Actions:</h4>
        <ul>${report.remediationPlan?.critical?.map(action => `<li>${action}</li>`).join('') || '<li>No critical actions required.</li>'}</ul>
        <h4>High Priority:</h4>
        <ul>${report.remediationPlan?.high?.map(action => `<li>${action}</li>`).join('') || '<li>No high priority actions required.</li>'}</ul>
        <h4>Medium Priority:</h4>
        <ul>${report.remediationPlan?.medium?.map(action => `<li>${action}</li>`).join('') || '<li>No medium priority actions required.</li>'}</ul>
    </div>
</body>
</html>`
  }

  const generateCSVReport = (report) => {
    let csv = 'Category,Item,Status,Severity,Description,Affected,CVSS Score\n'
    
    // Vulnerabilities
    if (report.vulnerabilities?.vulnerabilities) {
      report.vulnerabilities.vulnerabilities.forEach(vuln => {
        csv += `Vulnerability,"${vuln.title}",${vuln.status},${vuln.severity},"${vuln.description}","${vuln.affected}",${vuln.cvss}\n`
      })
    }
    
    // Hardening checks
    if (report.hardening?.checks) {
      report.hardening.checks.forEach(check => {
        csv += `Hardening,"${check.name}",${check.status},N/A,"${check.description}","N/A","N/A"\n`
      })
    }
    
    // Plugins
    if (report.plugins?.plugins) {
      report.plugins.plugins.forEach(plugin => {
        csv += `Plugin,"${plugin.name}",${plugin.status},${plugin.vulnerabilities > 0 ? 'High' : 'Low'},"Version: ${plugin.version}","${plugin.name}",N/A\n`
      })
    }
    
    // Admin accounts
    if (report.adminAccounts?.adminAccounts) {
      report.adminAccounts.adminAccounts.forEach(admin => {
        csv += `Admin Account,"${admin.username}",${admin.weakPassword ? 'Weak' : 'Strong'},${admin.weakPassword ? 'High' : 'Low'},"Role: ${admin.role}","${admin.email}",N/A\n`
      })
    }
    
    return csv
  }

  const generateModuleHTMLReport = (moduleId, results) => {
    switch (moduleId) {
      case 'cms-detection':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">CMS Type:</span>
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">${results.cmsType}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Version:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.version}</span>
            </div>
            <div>
              <span class="font-semibold text-gray-700">Technologies:</span>
              <div class="flex flex-wrap gap-1 mt-1">
                ${results.technologies?.map(tech => `<span class="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">${tech}</span>`).join('')}
              </div>
            </div>
          </div>
        `
      
      case 'vulnerability-scanning':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-red-50 p-2 rounded">
                <div class="text-lg font-bold text-red-600">${results.criticalCount || 0}</div>
                <div class="text-xs text-red-700">Critical</div>
              </div>
              <div class="bg-orange-50 p-2 rounded">
                <div class="text-lg font-bold text-orange-600">${results.highCount || 0}</div>
                <div class="text-xs text-orange-700">High</div>
              </div>
              <div class="bg-yellow-50 p-2 rounded">
                <div class="text-lg font-bold text-yellow-600">${results.mediumCount || 0}</div>
                <div class="text-xs text-yellow-700">Medium</div>
              </div>
            </div>
            ${results.vulnerabilities?.slice(0, 3).map(vuln => `
              <div class="border-l-4 border-red-500 pl-3 py-2 bg-red-50">
                <div class="font-semibold text-red-800">${vuln.title}</div>
                <div class="text-sm text-red-700">${vuln.severity} - ${vuln.affected}</div>
              </div>
            `).join('') || '<p class="text-gray-600">No vulnerabilities found</p>'}
          </div>
        `
      
      case 'plugin-theme-audit':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4 text-center">
              <div class="bg-blue-50 p-3 rounded">
                <div class="text-lg font-bold text-blue-600">${results.totalPlugins || 0}</div>
                <div class="text-xs text-blue-700">Total Plugins</div>
              </div>
              <div class="bg-purple-50 p-3 rounded">
                <div class="text-lg font-bold text-purple-600">${results.outdatedPlugins || 0}</div>
                <div class="text-xs text-purple-700">Outdated</div>
              </div>
            </div>
            ${results.plugins?.slice(0, 3).map(plugin => `
              <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span class="font-medium">${plugin.name}</span>
                <span class="px-2 py-1 text-xs rounded ${plugin.updateAvailable ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}">
                  ${plugin.version} ${plugin.updateAvailable ? '(Update Available)' : ''}
                </span>
              </div>
            `).join('') || '<p class="text-gray-600">No plugins found</p>'}
          </div>
        `
      
      case 'config-hardening':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="bg-green-50 p-2 rounded">
                <div class="text-lg font-bold text-green-600">${results.passedChecks || 0}</div>
                <div class="text-xs text-green-700">Passed</div>
              </div>
              <div class="bg-yellow-50 p-2 rounded">
                <div class="text-lg font-bold text-yellow-600">${results.warningChecks || 0}</div>
                <div class="text-xs text-yellow-700">Warnings</div>
              </div>
              <div class="bg-red-50 p-2 rounded">
                <div class="text-lg font-bold text-red-600">${results.failedChecks || 0}</div>
                <div class="text-xs text-red-700">Failed</div>
              </div>
            </div>
            ${results.checks?.map(check => `
              <div class="flex justify-between items-center p-2 rounded ${check.status === 'PASS' ? 'bg-green-50' : check.status === 'WARN' ? 'bg-yellow-50' : 'bg-red-50'}">
                <span class="font-medium">${check.name}</span>
                <span class="px-2 py-1 text-xs rounded ${check.status === 'PASS' ? 'bg-green-100 text-green-800' : check.status === 'WARN' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                  ${check.status}
                </span>
              </div>
            `).join('') || '<p class="text-gray-600">No checks performed</p>'}
          </div>
        `
      
      case 'admin-security':
        return `
          <div class="space-y-3">
            <div class="grid grid-cols-2 gap-4 text-center">
              <div class="bg-blue-50 p-3 rounded">
                <div class="text-lg font-bold text-blue-600">${results.totalAdmins || 0}</div>
                <div class="text-xs text-blue-700">Total Admins</div>
              </div>
              <div class="bg-red-50 p-3 rounded">
                <div class="text-lg font-bold text-red-600">${results.weakPasswords || 0}</div>
                <div class="text-xs text-red-700">Weak Passwords</div>
              </div>
            </div>
            ${results.adminAccounts?.slice(0, 3).map(admin => `
              <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div>
                  <span class="font-medium">${admin.username}</span>
                  <span class="text-sm text-gray-600 ml-2">(${admin.role})</span>
                </div>
                <div class="flex space-x-1">
                  ${admin.weakPassword ? '<span class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded">Weak Password</span>' : ''}
                  ${admin.twoFactorEnabled ? '<span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">2FA Enabled</span>' : ''}
                </div>
              </div>
            `).join('') || '<p class="text-gray-600">No admin accounts found</p>'}
          </div>
        `
      
      case 'backup-restoration':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Status:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.backupStatus}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Last Backup:</span>
              <span class="text-sm text-gray-600">${results.lastBackup}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Method:</span>
              <span class="text-sm text-gray-600">${results.backupMethod}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Size:</span>
              <span class="text-sm text-gray-600">${results.backupSize}</span>
            </div>
          </div>
        `
      
      case 'update-management':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Core Status:</span>
              <span class="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">${results.coreUpdate?.status}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Plugin Updates:</span>
              <span class="px-2 py-1 bg-orange-100 text-orange-800 rounded text-sm">${results.pluginUpdates?.length || 0} available</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Auto Updates:</span>
              <span class="px-2 py-1 ${results.autoUpdateEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.autoUpdateEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            ${results.pluginUpdates?.slice(0, 2).map(update => `
              <div class="flex justify-between items-center p-2 bg-orange-50 rounded">
                <span class="font-medium">${update.name}</span>
                <span class="text-sm text-orange-700">${update.current} → ${update.available}</span>
              </div>
            `).join('') || ''}
          </div>
        `
      
      case 'firewall-ddos':
        return `
          <div class="space-y-3">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">Service:</span>
              <span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">${results.edgeProtection?.service}</span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">DDoS Protection:</span>
              <span class="px-2 py-1 ${results.edgeProtection?.ddosProtection ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.edgeProtection?.ddosProtection ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-gray-700">WAF:</span>
              <span class="px-2 py-1 ${results.edgeProtection?.wafEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded text-sm">
                ${results.edgeProtection?.wafEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div>
              <span class="font-semibold text-gray-700">Firewall Rules:</span>
              <div class="mt-1">
                ${results.firewallRules?.map(rule => `
                  <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                    <span class="font-medium">${rule.name}</span>
                    <span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">${rule.action}</span>
                  </div>
                `).join('') || '<p class="text-gray-600">No rules found</p>'}
              </div>
            </div>
          </div>
        `
      
      default:
        return '<p class="text-gray-600">No report data available</p>'
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )
      case 'running':
        return (
          <svg className="w-5 h-5 text-blue-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        )
      case 'failed':
        return (
          <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50 border-green-200'
      case 'running': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'failed': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-6 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">WordPress Security Audit</h1>
                <p className="text-lg text-gray-600">Comprehensive security analysis and management audit</p>
              </div>
            </div>
            
            {!auditStarted && (
              <button
                onClick={startAudit}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
              >
                Start Audit
              </button>
            )}
          </div>

          {/* Site Info */}
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Target Site</span>
                  <p className="text-gray-900 font-medium">{siteUrl}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Admin Credentials</span>
                  <p className="text-gray-900 font-medium">{adminProvided ? 'Provided' : 'Not Provided'}</p>
                </div>
              </div>
              <div className="flex items-center">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Audit Status</span>
                  <p className="text-gray-900 font-medium">{auditCompleted ? 'Completed' : auditStarted ? 'In Progress' : 'Ready'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Overview */}
        {auditStarted && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Audit Progress</h3>
              <div className="text-sm text-gray-600">
                {startedTime && (
                  <div className="space-y-1">
                    <div>Started: {new Date(startedTime).toLocaleString()}</div>
                    <div>Elapsed: {formatTime(elapsedTime)}</div>
                    {expectedCompletionTime && (
                      <div>Expected: {new Date(expectedCompletionTime).toLocaleString()}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Overall Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ 
                  width: `${(modules.filter(m => m.status === 'completed').length / modules.length) * 100}%` 
                }}
              ></div>
            </div>
            
            <div className="text-sm text-gray-600">
              {modules.filter(m => m.status === 'completed').length} of {modules.length} modules completed
            </div>
          </div>
        )}

        {/* Real-time Logs Section */}
        {auditStarted && logs.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Audit Logs</h3>
              <div className="flex items-center space-x-3">
                <div className="text-sm text-gray-500">
                  {logs.length} log entries
                </div>
                <button
                  onClick={() => {
                    const logText = logs.map(log => 
                      `[${new Date(log.timestamp).toLocaleTimeString()}][${log.module}]${log.step}:${log.output}${log.exitCode !== 0 ? ` (Exit: ${log.exitCode})` : ''}`
                    ).join('\n')
                    navigator.clipboard.writeText(logText)
                    showSuccess('Audit logs copied to clipboard!')
                  }}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Copy logs to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
              <div className="space-y-2">
                {logs.slice(-10).map((log, index) => (
                  <div key={index} className="text-sm font-mono">
                    <span className="text-gray-400">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="text-blue-400 ml-2">[{log.module}]</span>
                    <span className="text-yellow-400 ml-2">{log.step}:</span>
                    <span className="text-white ml-2">{log.output}</span>
                    {log.exitCode !== 0 && (
                      <span className="text-red-400 ml-2">(Exit: {log.exitCode})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modules List */}
        <div className="space-y-4 mb-8">
          {modules.map((module) => (
            <div key={module.id} className={`border rounded-lg p-4 ${getStatusColor(module.status)}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {getStatusIcon(module.status)}
                  <div className="ml-3">
                    <h4 className="font-medium">{module.name}</h4>
                    <p className="text-sm opacity-75">
                      {module.status === 'running' && currentModule === module.id ? 'Running...' : 
                       module.status === 'completed' ? 'Completed' :
                       module.status === 'failed' ? 'Failed' : 'Pending'}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  {module.status === 'completed' && module.results && (
                    <button
                      onClick={() => downloadReport('json')}
                      className="text-sm px-3 py-1 bg-white bg-opacity-50 rounded hover:bg-opacity-75 transition-colors"
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
              
              {module.status === 'running' && (
                <div className="mt-3">
                  <div className="w-full bg-white bg-opacity-50 rounded-full h-1">
                    <div 
                      className="bg-current h-1 rounded-full transition-all duration-300"
                      style={{ width: `${module.progress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              {module.status === 'completed' && module.results && (
                <div className="mt-4 border-t pt-4">
                  <h5 className="text-sm font-semibold text-gray-700 mb-3">Module Report</h5>
                  <div className="bg-white rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ 
                        __html: generateModuleHTMLReport(module.id, module.results) 
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Final Report Section */}
        {auditCompleted && finalReport && (
          <div className="border-t pt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Final Security Report</h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    setSelectedModuleReport({ id: 'final', name: 'Final Report', results: finalReport })
                    setShowReportPreview(true)
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Preview Report
                </button>
                <button
                  onClick={() => downloadReport('html')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download HTML
                </button>
                <button
                  onClick={() => downloadReport('pdf')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download PDF
                </button>
                <button
                  onClick={() => downloadReport('excel')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download Excel
                </button>
                <button
                  onClick={() => downloadReport('json')}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Download JSON
                </button>
              </div>
            </div>
            
            
            {/* Report Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600">
                  {finalReport.vulnerabilities?.criticalCount || 0}
                </div>
                <div className="text-sm text-red-700">Critical Issues</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-orange-600">
                  {finalReport.vulnerabilities?.highCount || 0}
                </div>
                <div className="text-sm text-orange-700">High Priority</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-600">
                  {finalReport.vulnerabilities?.mediumCount || 0}
                </div>
                <div className="text-sm text-yellow-700">Medium Priority</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-600">
                  {finalReport.hardening?.passedChecks || 0}
                </div>
                <div className="text-sm text-green-700">Passed Checks</div>
              </div>
            </div>
            
            
          </div>
        )}

        {/* Report Preview Modal */}
        {showReportPreview && selectedModuleReport && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  {selectedModuleReport.name} Report
                </h3>
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1">
                {selectedModuleReport.id === 'final' ? (
                  <div 
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ 
                      __html: generateHTMLReport(selectedModuleReport.results) 
                    }}
                  />
                ) : (
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                    {JSON.stringify(selectedModuleReport.results, null, 2)}
                  </pre>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 p-6 border-t">
                <button
                  onClick={() => setShowReportPreview(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => downloadReport('json')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default WordPressAuditOrchestrator
