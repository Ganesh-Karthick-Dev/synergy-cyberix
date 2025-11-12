const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberGuard', {
  getPlatform: () => ipcRenderer.invoke('os:getPlatform'),
  checkWsl: () => ipcRenderer.invoke('os:checkWsl'),
  installUbuntu: () => ipcRenderer.invoke('os:installUbuntu'),
  verifyUbuntu: () => ipcRenderer.invoke('os:verifyUbuntu'),
  onUbuntuInstallLog: (listener) => ipcRenderer.on('os:ubuntuInstallLog', (_e, line) => listener(line)),
  onUbuntuInstallDone: (listener) => ipcRenderer.on('os:ubuntuInstallDone', (_e, ok) => listener(ok)),
  installKaliLinux: () => ipcRenderer.invoke('os:installKaliLinux'),
  onKaliInstallLog: (listener) => ipcRenderer.on('os:kaliInstallLog', (_e, line) => listener(line)),
  onKaliInstallDone: (listener) => ipcRenderer.on('os:kaliInstallDone', (_e, ok) => listener(ok)),
  installWsl: () => ipcRenderer.invoke('os:installWsl'),
  onWslInstallLog: (listener) => ipcRenderer.on('os:wslInstallLog', (_e, data) => listener(data)),
  onWslInstallDone: (listener) => ipcRenderer.once('os:wslInstallDone', (_e, ok) => listener(ok)),
  // WSL Installation and User Management
  installWslDirect: () => ipcRenderer.invoke('wsl:install'),
  createWslUser: (username, password) => ipcRenderer.invoke('wsl:createUser', username, password),
  validateWslCredentials: (username, password) => ipcRenderer.invoke('wsl:validateCredentials', username, password),
  onWslInstallProgress: (listener) => ipcRenderer.on('wsl:installProgress', (_e, message) => listener(message)),
  onWslUserCreateProgress: (listener) => ipcRenderer.on('wsl:userCreateProgress', (_e, message) => listener(message)),
  startScan: (target) => ipcRenderer.invoke('scan:start', target),
  onScanProgress: (listener) => ipcRenderer.on('scan:progress', (_e, upd) => listener(upd)),
  onScanDone: (listener) => ipcRenderer.on('scan:done', (_e, data) => listener(data)),
  onScanAutoStart: (listener) => ipcRenderer.on('scan:autoStart', (_e) => listener()),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  // Comprehensive scan
  startComprehensiveScan: (target, outDir) => ipcRenderer.invoke('cscan:start', target, outDir),
  onComprehensiveProgress: (listener) => ipcRenderer.on('cscan:progress', (_e, upd) => listener(upd)),
  onComprehensiveDone: (listener) => ipcRenderer.on('cscan:done', (_e, data) => listener(data)),
  // Port scan
  startPortScan: (target) => ipcRenderer.invoke('portscan:start', target),
  onPortScanProgress: (listener) => ipcRenderer.on('portscan:progress', (_e, upd) => listener(upd)),
  onPortScanDone: (listener) => ipcRenderer.on('portscan:done', (_e, data) => listener(data)),
  // Network scan
  startNetworkScan: (target) => ipcRenderer.invoke('networkscan:start', target),
  onNetworkScanProgress: (listener) => ipcRenderer.on('networkscan:progress', (_e, upd) => listener(upd)),
  onNetworkScanDone: (listener) => ipcRenderer.on('networkscan:done', (_e, data) => listener(data)),
  abortNetworkScan: () => ipcRenderer.invoke('networkscan:abort'),
  // Server scan
  startServerScan: (target) => ipcRenderer.invoke('serverscan:start', target),
  onServerScanProgress: (listener) => ipcRenderer.on('serverscan:progress', (_e, upd) => listener(upd)),
  onServerScanDone: (listener) => ipcRenderer.on('serverscan:done', (_e, data) => listener(data)),
  abortServerScan: () => ipcRenderer.invoke('serverscan:abort'),
  // Save report
  saveReportAs: (sourcePath, defaultName) => ipcRenderer.invoke('report:saveAs', sourcePath, defaultName),
  // Website Security Audit (authorized, read-only)
  startWebsiteAudit: (payload) => ipcRenderer.invoke('websiteAudit:start', payload),
  onWebsiteAuditProgress: (listener) => ipcRenderer.on('websiteAudit:progress', (_e, upd) => listener(upd)),
  onWebsiteAuditDone: (listener) => ipcRenderer.on('websiteAudit:done', (_e, data) => listener(data)),
  // Website Security Audit - Enhanced Scan
  startWebsiteSecurityAudit: (payload) => ipcRenderer.invoke('websiteSecurityAudit:start', payload),
  onWebsiteSecurityAuditProgress: (listener) => ipcRenderer.on('websiteSecurityAudit:progress', (_e, upd) => listener(upd)),
  onWebsiteSecurityAuditDone: (listener) => ipcRenderer.on('websiteSecurityAudit:done', (_e, data) => listener(data)),
  // Security Analyzer (comprehensive defensive analysis)
  startSecurityAnalysis: (payload) => ipcRenderer.invoke('securityAnalysis:start', payload),
  onSecurityAnalyzerProgress: (listener) => ipcRenderer.on('securityAnalysis:progress', (_e, upd) => listener(upd)),
  onSecurityAnalyzerComplete: (listener) => ipcRenderer.on('securityAnalysis:complete', (_e, data) => listener(data)),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  checkKali: () => ipcRenderer.invoke('kali:check'),
  installKali: () => ipcRenderer.invoke('kali:install'),
  onKaliInstallProgress: (listener) => ipcRenderer.on('kali:installProgress', (_e, message) => listener(message)),
  onKaliInstallComplete: (listener) => ipcRenderer.once('kali:installComplete', (_e, success) => listener(success)),
  // Kali Security Scanner for Overview tab
  testKaliHandlers: () => ipcRenderer.invoke('kali:test'),
  startKaliScan: (targetUrl) => ipcRenderer.invoke('kali:startScan', targetUrl),
  onKaliProgress: (listener) => ipcRenderer.on('kali:progress', (_e, progress) => listener(progress)),
  onKaliComplete: (listener) => ipcRenderer.on('kali:complete', (_e, results) => listener(results)),
  // Additional Security Scans
  startAdditionalScans: (targetDomain) => ipcRenderer.invoke('kali:startAdditionalScans', targetDomain),
  onAdditionalProgress: (listener) => ipcRenderer.on('kali:additionalProgress', (_e, progress) => listener(progress)),
  onAdditionalComplete: (listener) => ipcRenderer.on('kali:additionalComplete', (_e, results) => listener(results)),
  saveReport: (data, fileName) => ipcRenderer.invoke('report:saveAs', data, fileName),
  // Tool Installer
  testToolsIPC: () => ipcRenderer.invoke('tools:test'),
  checkMissingTools: () => ipcRenderer.invoke('tools:checkMissing'),
  installMissingTools: (selectedTools) => ipcRenderer.invoke('tools:installMissing', selectedTools),
  onToolsInstallProgress: (listener) => ipcRenderer.on('tools:installProgress', (_e, progress) => listener(progress)),
  // New tool checker functions
  checkTool: (toolName, password) => ipcRenderer.invoke('tools:checkTool', toolName, password),
  installTools: (aptCommand, goCommands, password) => ipcRenderer.invoke('tools:installTools', aptCommand, goCommands, password),
  // WSL Password Management
  testWslCredentials: (password) => ipcRenderer.invoke('wsl:testCredentials', password),
  testWslRootCredentials: (password) => {
    console.log('🔐 [PRELOAD] testWslRootCredentials called with password length:', password ? password.length : 0);
    console.log('🔐 [PRELOAD] About to invoke wsl:testRootCredentials IPC...');
    return ipcRenderer.invoke('wsl:testRootCredentials', password);
  },
  testWslConnectivity: () => {
    console.log('🔍 [PRELOAD] testWslConnectivity called');
    return ipcRenderer.invoke('wsl:testConnectivity');
  },
  getWslUsername: () => ipcRenderer.invoke('wsl:getUsername'),
  runWslCommand: (command, password) => ipcRenderer.invoke('wsl:runCommand', command, password),
  // Auto-install all tools
  autoInstallAllTools: () => ipcRenderer.invoke('tools:autoInstallAll'),
  onAutoInstallProgress: (listener) => ipcRenderer.on('tools:autoInstallProgress', (_e, progress) => listener(progress)),
  // Malware & Defacement
  startMaldefScan: (url) => ipcRenderer.invoke('maldef:start', url),
  onMaldefProgress: (listener) => ipcRenderer.on('maldef:progress', (_e, upd) => listener(upd)),
  onMaldefDone: (listener) => ipcRenderer.on('maldef:done', (_e, data) => listener(data)),
  cancelMaldefScan: () => ipcRenderer.invoke('maldef:cancel'),
  // Malware & Defacement Tools
  checkMaldefTools: () => ipcRenderer.invoke('maldef:checkTools'),
  installMaldefTools: (password) => ipcRenderer.invoke('maldef:installTools', password),
  onMaldefToolsProgress: (listener) => ipcRenderer.on('maldef:toolsProgress', (_e, upd) => listener(upd)),
  // Setup
  selectDirectory: () => ipcRenderer.invoke('setup:selectDirectory'),
  createDirectory: (path) => ipcRenderer.invoke('setup:createDirectory', path),
  checkSetupComplete: () => ipcRenderer.invoke('setup:checkComplete'),
  markSetupComplete: (installPath) => ipcRenderer.invoke('setup:markComplete', installPath),
  // File system operations for logging
  getUserDataPath: () => ipcRenderer.invoke('fs:getUserDataPath'),
  getInstallPath: () => ipcRenderer.invoke('fs:getInstallPath'),
  getDownloadsPath: () => ipcRenderer.invoke('fs:getDownloadsPath'),
  ensureDirectoryExists: (path) => ipcRenderer.invoke('fs:ensureDirectoryExists', path),
  writeFile: (path, data) => ipcRenderer.invoke('fs:writeFile', path, data),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  listFiles: (dir) => ipcRenderer.invoke('fs:listFiles', dir),
  // WSL Root Execution API - SECURITY CRITICAL
  runAsRoot: ({ distro, command, requireConfirm = true, useStoredPassword = true }) => 
    ipcRenderer.invoke('wsl-run-as-root', { distro, command, requireConfirm, useStoredPassword }),
      // WSL Cyberix setup
      setupCyberixFolder: () => ipcRenderer.invoke('wsl:setupCyberixFolder'),
      cloneRepository: (repoName) => ipcRenderer.invoke('wsl:cloneRepository', repoName),
      setupPythonVenv: () => ipcRenderer.invoke('wsl:setupPythonVenv'),
      // WSL distribution management
      getWSLDistro: () => ipcRenderer.invoke('wsl:getDistro'),
      listWSLDistributions: () => ipcRenderer.invoke('wsl:listDistributions'),
      setDefaultWSLDistro: (distroName) => ipcRenderer.invoke('wsl:setDefaultDistro', distroName),
  // Get stored root password for main process
  getStoredRootPassword: () => ipcRenderer.invoke('wsl:getStoredRootPassword'),
  storeRootPassword: (password) => ipcRenderer.invoke('wsl:storeRootPassword', password),
  clearRootPassword: () => ipcRenderer.invoke('wsl:clearRootPassword'),
  // Auto-scan trigger
  triggerAutoScan: () => ipcRenderer.invoke('scan:triggerAutoScan'),
  // Install missing tools
  installMissingTools: (missingTools) => ipcRenderer.invoke('tools:installMissing', missingTools),
  // Install single tool
  installSingleTool: (toolName, password) => ipcRenderer.invoke('tools:installSingle', toolName, password),
  // Check required tools only (without installing)
  checkRequiredToolsOnly: (password) => ipcRenderer.invoke('tools:checkRequiredToolsOnly', password),
  // Check and install tgpt
  checkAndInstallTgpt: (password) => ipcRenderer.invoke('tools:checkAndInstallTgpt', password),
  // Convert text using tgpt
  convertWithTgpt: (prompt, password) => ipcRenderer.invoke('tgpt:convert', prompt, password),
  // Wapiti scan
  startWapitiScan: (url) => ipcRenderer.invoke('wapiti:start', url),
  stopWapitiScan: () => ipcRenderer.invoke('wapiti:stop'),
  onWapitiProgress: (listener) => {
    const handler = (_e, data) => listener(data)
    ipcRenderer.on('wapiti:progress', handler)
    return handler
  },
  removeWapitiProgressListener: (handler) => {
    if (handler) {
      ipcRenderer.removeListener('wapiti:progress', handler)
    }
  },
  onWapitiDone: (listener) => {
    const handler = (_e, data) => listener(data)
    ipcRenderer.on('wapiti:done', handler)
    return handler
  },
  removeWapitiDoneListener: (handler) => {
    if (handler) {
      ipcRenderer.removeListener('wapiti:done', handler)
    }
  },
  // Notifications
  showNotification: (notificationData) => ipcRenderer.invoke('notification:show', notificationData),
  clearNotificationBadge: () => ipcRenderer.invoke('notification:clearBadge'),
  getNotificationCount: () => ipcRenderer.invoke('notification:getCount'),
  onNotificationClicked: (listener) => {
    const handler = (_e, data) => listener(data)
    ipcRenderer.on('notification:clicked', handler)
    return handler
  },
  removeNotificationClickedListener: (handler) => {
    if (handler) {
      ipcRenderer.removeListener('notification:clicked', handler)
    }
  },
  onNotificationSent: (listener) => {
    const handler = (_e, data) => listener(data)
    ipcRenderer.on('notification:sent', handler)
    return handler
  },
  removeNotificationSentListener: (handler) => {
    if (handler) {
      ipcRenderer.removeListener('notification:sent', handler)
    }
  },
  // Phishing detection with dnstwist
  runDnstwist: (domain, password) => ipcRenderer.invoke('phishing:runDnstwist', domain, password),
  onPhishingLog: (listener) => {
    const handler = (_e, line) => listener(line);
    ipcRenderer.on('phishing:log', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('phishing:log', handler);
    };
  },
  // Convert JSON to readable text using tgpt
  convertPhishingJsonToText: (jsonData) => ipcRenderer.invoke('phishing:convertJsonToText', jsonData),
  // Convert malware/defacement JSON to readable text using tgpt
  convertMaldefJsonToText: (jsonData) => ipcRenderer.invoke('maldef:convertJsonToText', jsonData),
  // Setup/installer (rootless with -u root inside WSL)
  checkWSLRootless: () => ipcRenderer.invoke('check-wsl'),
  checkAllToolsRootless: () => ipcRenderer.invoke('check-tools'),
  installAllToolsRootless: () => ipcRenderer.invoke('install-tools'),
  onInstallProgress: (listener) => ipcRenderer.on('install-progress', (_e, progress) => listener(progress)),
  // GitHub OAuth and Repository Scanner
  initiateGitHubAuth: () => ipcRenderer.invoke('github:initiate-auth'),
  pollGitHubToken: (deviceCode, userCode) => ipcRenderer.invoke('github:poll-token', deviceCode, userCode),
  onGitHubAuthProgress: (listener) => {
    const handler = (_e, progress) => listener(progress);
    ipcRenderer.on('github:auth-progress', handler);
    return () => ipcRenderer.removeListener('github:auth-progress', handler);
  },
  getGitHubRepositories: (accessToken) => ipcRenderer.invoke('github:get-repositories', accessToken),
  onGitHubReposProgress: (listener) => {
    const handler = (_e, progress) => listener(progress);
    ipcRenderer.on('github:repos-progress', handler);
    return () => ipcRenderer.removeListener('github:repos-progress', handler);
  },
  // GitHub Repository Scanner (replaces old API scanner)
  startAPIScan: (repositories, accessToken) => ipcRenderer.invoke('apiscan:start', repositories, accessToken),
  onAPIScanProgress: (listener) => {
    const handler = (_e, progress) => listener(progress);
    ipcRenderer.on('apiscan:progress', handler);
    return () => ipcRenderer.removeListener('apiscan:progress', handler);
  },
  onAPIScanComplete: (listener) => {
    const handler = (_e, results) => listener(results);
    ipcRenderer.on('apiscan:complete', handler);
    return () => ipcRenderer.removeListener('apiscan:complete', handler);
  }
});


