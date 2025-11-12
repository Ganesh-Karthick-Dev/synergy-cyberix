import { useState, useEffect } from 'react';

const ToolInstallationProgress = ({ isOpen, onClose, onComplete, missingTools, totalTools }) => {
  const [installationProgress, setInstallationProgress] = useState('');
  const [installedCount, setInstalledCount] = useState(0);
  const [isInstalling, setIsInstalling] = useState(false);
  const [currentTool, setCurrentTool] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (isOpen && missingTools && missingTools.length > 0) {
      console.log('🔧 [TOOL-PROGRESS] Starting tool installation...');
      console.log('🔧 [TOOL-PROGRESS] Missing tools:', missingTools);
      startToolInstallation();
    }
  }, [isOpen, missingTools]);

  const startToolInstallation = async () => {
    setIsInstalling(true);
    setLogs([]);
    setInstalledCount(0);
    
    addLog('🚀 Getting things ready for you...', 'info');
    addLog(`📦 Installing ${missingTools.length} missing security tools`, 'info');
    
    try {
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
          const result = await installSingleTool(tool);
          
          if (result.success) {
            addLog(`✅ ${progress} ${tool} installed successfully`, 'success');
            successCount++;
            setInstalledCount(successCount);
          } else {
            addLog(`❌ ${progress} ${tool} failed: ${result.error}`, 'error');
            failedTools.push(tool);
          }
        } catch (error) {
          console.error(`❌ [TOOL-PROGRESS] Exception installing ${tool}:`, error);
          addLog(`❌ ${progress} ${tool} failed with exception: ${error.message}`, 'error');
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
        addLog(`✅ We are ready, launching Cyberix!`, 'success');
        
        // Show completion message for a moment before closing
        setTimeout(() => {
          onComplete({ success: true, installedCount: successCount, totalTools: missingTools.length });
        }, 2000);
      } else {
        addLog(`⚠️ Installation completed: ${successCount}/${missingTools.length} tools installed`, 'warning');
        addLog(`❌ Failed tools: ${failedTools.join(', ')}`, 'error');
        addLog(`ℹ️ You can still use the system with available tools`, 'info');
        
        // Show completion message for a moment before closing
        setTimeout(() => {
          onComplete({ success: false, installedCount: successCount, totalTools: missingTools.length, failedTools });
        }, 2000);
      }
      
    } catch (error) {
      console.error('❌ [TOOL-PROGRESS] Installation failed:', error);
      addLog(`❌ Installation failed: ${error.message}`, 'error');
      onComplete({ success: false, error: error.message });
    } finally {
      setIsInstalling(false);
    }
  };

  const installSingleTool = async (toolName) => {
    try {
      if (window.cyberGuard && window.cyberGuard.installSingleTool) {
        // Get the stored password to pass to the installation function
        const { getSecurePassword } = await import('../utils/securePasswordStorage');
        const password = getSecurePassword();
        
        console.log(`🔧 [TOOL-PROGRESS] Installing ${toolName} with password: ${password ? 'EXISTS' : 'NULL'}`);
        const result = await window.cyberGuard.installSingleTool(toolName, password);
        return result;
      } else {
        throw new Error('Single tool installation API not available');
      }
    } catch (error) {
      console.error(`❌ [TOOL-PROGRESS] Error in installSingleTool:`, error);
      return { success: false, error: error.message };
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Getting Things Ready
          </h3>
        </div>

        <div className="space-y-4">
          {/* Progress Summary */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-blue-800 dark:text-blue-200">
                {isInstalling ? 'Getting Things Ready' : 'We are Ready, launching Cyberix'}
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

export default ToolInstallationProgress;
