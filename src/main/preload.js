const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberGuard', {
  getPlatform: () => ipcRenderer.invoke('os:getPlatform'),
  checkWsl: () => ipcRenderer.invoke('os:checkWsl'),
  installWsl: () => ipcRenderer.invoke('os:installWsl'),
  onWslInstallLog: (listener) => ipcRenderer.on('os:wslInstallLog', (_e, data) => listener(data)),
  onWslInstallDone: (listener) => ipcRenderer.once('os:wslInstallDone', (_e, ok) => listener(ok)),
  startScan: (target) => ipcRenderer.invoke('scan:start', target),
  onScanProgress: (listener) => ipcRenderer.on('scan:progress', (_e, upd) => listener(upd)),
  onScanDone: (listener) => ipcRenderer.on('scan:done', (_e, data) => listener(data)),
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
  // Security Analyzer (comprehensive defensive analysis)
  startSecurityAnalysis: (payload) => ipcRenderer.invoke('securityAnalysis:start', payload),
  onSecurityAnalyzerProgress: (listener) => ipcRenderer.on('securityAnalysis:progress', (_e, upd) => listener(upd)),
  onSecurityAnalyzerComplete: (listener) => ipcRenderer.on('securityAnalysis:complete', (_e, data) => listener(data)),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  checkKali: () => ipcRenderer.invoke('kali:check'),
  installKali: () => ipcRenderer.invoke('kali:install'),
  onKaliInstallProgress: (listener) => ipcRenderer.on('kali:installProgress', (_e, message) => listener(message)),
  onKaliInstallComplete: (listener) => ipcRenderer.once('kali:installComplete', (_e, success) => listener(success)),
  // Malware & Defacement
  startMaldefScan: (url) => ipcRenderer.invoke('maldef:start', url),
  onMaldefProgress: (listener) => ipcRenderer.on('maldef:progress', (_e, upd) => listener(upd)),
  onMaldefDone: (listener) => ipcRenderer.on('maldef:done', (_e, data) => listener(data)),
  // Setup
  selectDirectory: () => ipcRenderer.invoke('setup:selectDirectory'),
  createDirectory: (path) => ipcRenderer.invoke('setup:createDirectory', path),
  checkSetupComplete: () => ipcRenderer.invoke('setup:checkComplete'),
  markSetupComplete: (installPath) => ipcRenderer.invoke('setup:markComplete', installPath),
  // File system operations for logging
  getInstallPath: () => ipcRenderer.invoke('fs:getInstallPath'),
  getDownloadsPath: () => ipcRenderer.invoke('fs:getDownloadsPath'),
  ensureDirectoryExists: (path) => ipcRenderer.invoke('fs:ensureDirectoryExists', path),
  writeFile: (path, data) => ipcRenderer.invoke('fs:writeFile', path, data),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  listFiles: (dir) => ipcRenderer.invoke('fs:listFiles', dir)
});


