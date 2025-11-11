import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';

const ToolInstallationDialog = ({ isOpen, onClose, onComplete, missingTools, totalTools }) => {
  const { showSuccess, showError, dismissToast } = useToast();
  const [installationProgress, setInstallationProgress] = useState('');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [installedCount, setInstalledCount] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [logs, setLogs] = useState([]);
  const [currentTool, setCurrentTool] = useState('');

  useEffect(() => {
    if (isOpen && missingTools && missingTools.length > 0) {
      console.log('🔧 [TOOL-INSTALL-DIALOG] Starting tool installation...');
      console.log('🔧 [TOOL-INSTALL-DIALOG] Missing tools:', missingTools);
      startToolInstallation();
    }
  }, [isOpen, missingTools]);

  const startToolInstallation = async () => {
    setIsInstalling(true);
    setLogs([]);
    setInstalledCount(0);
    
    addLog('🚀 Getting things ready for you...', 'info');
    addLog(`📦 Installing ${missingTools.length} missing security tools`, 'info');
    addLog(`📋 Tools to install: ${missingTools.join(', ')}`, 'info');
    
    try {
      // Install tools one by one for better control and logging
      let successCount = 0;
      let failedTools = [];
      
      for (let i = 0; i < missingTools.length; i++) {
        const tool = missingTools[i];
        const progress = `(${i + 1}/${missingTools.length})`;
        
        setCurrentTool(tool);
        addLog(`🔧 ${progress} Installing ${tool}...`, 'info');
        setInstallationProgress(`Installing ${tool} (${i + 1}/${missingTools.length})`);
        
        try {
          // Install single tool
          console.log(`🔧 [TOOL-INSTALL-DIALOG] Installing tool: ${tool}`);
          const result = await installSingleTool(tool);
          console.log(`🔧 [TOOL-INSTALL-DIALOG] Tool ${tool} result:`, result);
          
          if (result.success) {
            addLog(`✅ ${progress} ${tool} installed successfully`, 'success');
            if (result.stdout) {
              addLog(`📝 ${tool} output: ${result.stdout.substring(0, 200)}${result.stdout.length > 200 ? '...' : ''}`, 'info');
            }
            successCount++;
            setInstalledCount(successCount);
          } else {
            addLog(`❌ ${progress} ${tool} failed: ${result.error}`, 'error');
            console.error(`❌ [TOOL-INSTALL-DIALOG] Tool ${tool} failed:`, result);
            
            if (result.stdout) {
              addLog(`📝 ${tool} stdout: ${result.stdout.substring(0, 300)}${result.stdout.length > 300 ? '...' : ''}`, 'error');
            }
            if (result.stderr) {
              addLog(`📝 ${tool} stderr: ${result.stderr.substring(0, 300)}${result.stderr.length > 300 ? '...' : ''}`, 'error');
            }
            failedTools.push(tool);
          }
        } catch (error) {
          console.error(`❌ [TOOL-INSTALL-DIALOG] Exception installing ${tool}:`, error);
          addLog(`❌ ${progress} ${tool} failed with exception: ${error.message}`, 'error');
          addLog(`📝 ${tool} stack: ${error.stack ? error.stack.substring(0, 200) : 'No stack trace'}`, 'error');
          failedTools.push(tool);
        }
        
        // Small delay between installations for better visibility
        if (i < missingTools.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Final summary
            setCurrentTool('');
            setInstallationProgress('Installation completed!');
            
            if (failedTools.length === 0) {
              addLog(`🎉 All ${missingTools.length} security tools installed successfully!`, 'success');
              addLog(`✅ System is now ready for scanning!`, 'success');
              showSuccess('All security tools have been installed successfully! System is ready.');
              onComplete({ success: true, installedCount: successCount, totalTools: missingTools.length });
            } else {
              addLog(`⚠️ Installation completed: ${successCount}/${missingTools.length} tools installed`, 'warning');
              addLog(`❌ Failed tools: ${failedTools.join(', ')}`, 'error');
              addLog(`ℹ️ You can still use the system with available tools`, 'info');
              showError(`Tool installation completed: ${successCount}/${missingTools.length} tools installed. Failed: ${failedTools.join(', ')}`);
              onComplete({ success: false, installedCount: successCount, totalTools: missingTools.length, failedTools });
            }
      
    } catch (error) {
      console.error('❌ [TOOL-INSTALL-DIALOG] Installation failed:', error);
      addLog(`❌ Installation failed: ${error.message}`, 'error');
      showError(`Tool installation failed: ${error.message}`);
      onComplete({ success: false, error: error.message });
    } finally {
      setIsInstalling(false);
    }
  };

  const installSingleTool = async (toolName) => {
    try {
      console.log(`🔧 [TOOL-INSTALL-DIALOG] Calling installSingleTool for: ${toolName}`);
      console.log(`🔧 [TOOL-INSTALL-DIALOG] cyberGuard available: ${!!window.cyberGuard}`);
      console.log(`🔧 [TOOL-INSTALL-DIALOG] installSingleTool method available: ${!!(window.cyberGuard && window.cyberGuard.installSingleTool)}`);
      
      // Use the main process to install a single tool
      if (window.cyberGuard && window.cyberGuard.installSingleTool) {
        // Get the stored password to pass to the installation function
        const { getSecurePassword } = await import('../utils/securePasswordStorage');
        const password = getSecurePassword();
        
        console.log(`🔧 [TOOL-INSTALL-DIALOG] About to call window.cyberGuard.installSingleTool(${toolName}) with password: ${password ? 'EXISTS' : 'NULL'}`);
        const result = await window.cyberGuard.installSingleTool(toolName, password);
        console.log(`🔧 [TOOL-INSTALL-DIALOG] Received result from installSingleTool:`, result);
        return result;
      } else {
        throw new Error('Single tool installation API not available');
      }
    } catch (error) {
      console.error(`❌ [TOOL-INSTALL-DIALOG] Error in installSingleTool:`, error);
      return { success: false, error: error.message };
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const handleClose = () => {
    if (!isInstalling) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Getting Things Ready
          </h3>
          <button
            onClick={handleClose}
            disabled={isInstalling}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* Progress Summary */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-blue-800 dark:text-blue-200">
                Getting Things Ready
              </span>
              <span className="text-sm text-blue-600 dark:text-blue-400">
                {installedCount}/{totalTools} tools ready
              </span>
            </div>
            <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${(installedCount / totalTools) * 100}%` }}
              ></div>
            </div>
            {currentTool && (
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
                Installing: <span className="font-semibold">{currentTool}</span>
              </p>
            )}
            {installationProgress && (
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                {installationProgress}
              </p>
            )}
          </div>

          {/* Installation Logs */}
          <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-4 max-h-64 overflow-y-auto">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Installation Log</h4>
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex items-start space-x-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400 font-mono">
                    {log.timestamp}
                  </span>
                  <span className={`flex-1 ${
                    log.type === 'error' ? 'text-red-600 dark:text-red-400' :
                    log.type === 'success' ? 'text-green-600 dark:text-green-400' :
                    log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-gray-700 dark:text-gray-300'
                  }`}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center justify-center">
            {isInstalling ? (
              <div className="flex items-center space-x-2 text-blue-600 dark:text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Installing tools...</span>
              </div>
            ) : (
              <div className="text-green-600 dark:text-green-400">
                ✅ Installation completed
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolInstallationDialog;
