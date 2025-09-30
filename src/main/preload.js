const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cyberGuard', {
  getPlatform: () => ipcRenderer.invoke('os:getPlatform'),
  checkWsl: () => ipcRenderer.invoke('os:checkWsl'),
  installWsl: () => ipcRenderer.invoke('os:installWsl'),
  onWslInstallLog: (listener) => ipcRenderer.on('os:wslInstallLog', (_e, data) => listener(data)),
  onWslInstallDone: (listener) => ipcRenderer.once('os:wslInstallDone', (_e, ok) => listener(ok)),
  startScan: (target) => ipcRenderer.invoke('scan:start', target),
  onScanProgress: (listener) => ipcRenderer.on('scan:progress', (_e, upd) => listener(upd)),
  onScanDone: (listener) => ipcRenderer.once('scan:done', (_e, data) => listener(data)),
  cancelScan: () => ipcRenderer.invoke('scan:cancel'),
  // Comprehensive scan
  startComprehensiveScan: (target, outDir) => ipcRenderer.invoke('cscan:start', target, outDir),
  onComprehensiveProgress: (listener) => ipcRenderer.on('cscan:progress', (_e, upd) => listener(upd)),
  onComprehensiveDone: (listener) => ipcRenderer.once('cscan:done', (_e, data) => listener(data)),
  // Port scan
  startPortScan: (target) => ipcRenderer.invoke('portscan:start', target),
  onPortScanProgress: (listener) => ipcRenderer.on('portscan:progress', (_e, upd) => listener(upd)),
  onPortScanDone: (listener) => ipcRenderer.once('portscan:done', (_e, data) => listener(data)),
  // Network scan
  startNetworkScan: (target) => ipcRenderer.invoke('networkscan:start', target),
  onNetworkScanProgress: (listener) => ipcRenderer.on('networkscan:progress', (_e, upd) => listener(upd)),
  onNetworkScanDone: (listener) => ipcRenderer.once('networkscan:done', (_e, data) => listener(data)),
  abortNetworkScan: () => ipcRenderer.invoke('networkscan:abort'),
  // Save report
  saveReportAs: (sourcePath, defaultName) => ipcRenderer.invoke('report:saveAs', sourcePath, defaultName),
  checkKali: () => ipcRenderer.invoke('kali:check'),
  installKali: () => ipcRenderer.invoke('kali:install'),
  onKaliInstallProgress: (listener) => ipcRenderer.on('kali:installProgress', (_e, message) => listener(message)),
  onKaliInstallComplete: (listener) => ipcRenderer.once('kali:installComplete', (_e, success) => listener(success))
});


