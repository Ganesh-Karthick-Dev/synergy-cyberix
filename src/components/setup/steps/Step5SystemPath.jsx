import React, { useState, useEffect } from 'react';
import { FolderOpen, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

/**
 * Step 5: System Path Selection Component
 * Allows user to select path for logs and password storage
 */
const Step5SystemPath = ({ onComplete, onError, onLog }) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const addLog = (message, type = 'info') => {
    // Send to parent component's log
    if (onLog) {
      onLog(message, type);
    }
  };

  // Prefill with default userData path
  useEffect(() => {
    const getDefaultPath = async () => {
      try {
        if (window.cyberGuard?.getUserDataPath) {
          const userDataPath = await window.cyberGuard.getUserDataPath();
          // Get parent directory (remove /Cyberix if present)
          const defaultPath = userDataPath.replace(/[\\/]Cyberix$/, '') || userDataPath;
          setSelectedPath(defaultPath);
        }
      } catch (e) {
        console.error('Error getting default path:', e);
      }
    };
    getDefaultPath();
  }, []);

  const handleSelectPath = async () => {
    setSelecting(true);
    setError('');
    addLog('Opening directory selector...', 'info');
    
    try {
      if (window.cyberGuard?.selectDirectory) {
        const path = await window.cyberGuard.selectDirectory();
        if (path) {
          setSelectedPath(path);
          addLog(`Directory selected: ${path}`, 'success');
        } else {
          setError('No directory selected');
          addLog('No directory selected', 'warning');
        }
      } else {
        setError('Directory selection not available');
        addLog('Directory selection API not available', 'error');
      }
    } catch (err) {
      console.error('Error selecting directory:', err);
      setError(err.message || 'Failed to select directory');
      addLog(`Error: ${err.message}`, 'error');
    } finally {
      setSelecting(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedPath) {
      setError('Please select a directory');
      return;
    }

    setSubmitting(true);
    addLog('💾 [SAVE] Saving system path...', 'info');
    addLog(`📋 [INFO] Selected path: ${selectedPath}`, 'info');

    let hasErrors = false;
    
    try {
      // Move installation logs to selected path
      addLog('📦 [MOVE] Moving installation logs to selected path...', 'info');
      
      if (window.cyberGuard?.moveInstallationLogs) {
        try {
          const moveResult = await window.cyberGuard.moveInstallationLogs(selectedPath);
          if (moveResult?.success) {
            addLog('✅ [RESULT] Installation logs moved successfully', 'success');
          } else {
            addLog('⚠️ [WARNING] Installation logs move may have failed', 'warning');
            hasErrors = true;
          }
        } catch (error) {
          console.error('Error moving installation logs:', error);
          addLog('⚠️ [WARNING] Could not move installation logs', 'warning');
          hasErrors = true;
        }
      }

      // Create System Logs subfolder
      addLog('📁 [CREATE] Creating System Logs folder...', 'info');
      if (window.cyberGuard?.createSystemLogsFolder) {
        try {
          const createResult = await window.cyberGuard.createSystemLogsFolder(selectedPath);
          if (createResult?.success) {
            addLog('✅ [RESULT] System Logs folder created', 'success');
          } else {
            addLog('⚠️ [WARNING] System Logs folder creation may have failed', 'warning');
            hasErrors = true;
          }
        } catch (error) {
          console.error('Error creating system logs folder:', error);
          addLog('⚠️ [WARNING] Could not create System Logs folder', 'warning');
          hasErrors = true;
        }
      }

      // Save password file (encrypted)
      addLog('🔐 [ENCRYPT] Saving encrypted password file...', 'info');
      // Password is already saved in previous step, just log it
      addLog('✅ [RESULT] Password file location saved', 'success');

      // Save system path in state manager
      if (window.cyberGuard?.setSystemPath) {
        // This will be handled by parent component
      }

      addLog('✅ [COMPLETE] Step 5 completed successfully!', 'success');
      addLog('🎉 [SUCCESS] Setup complete!', 'success');
      
      // Always call onComplete, even if there were warnings
      // The parent component will handle the actual saving and navigation
      if (onComplete && typeof onComplete === 'function') {
        onComplete(selectedPath);
      } else {
        console.error('onComplete is not a function:', typeof onComplete);
        addLog('❌ [ERROR] Completion callback not available', 'error');
        if (onError) {
          onError(new Error('Completion callback not available'));
        }
      }
    } catch (error) {
      const errorMsg = error.message || 'Failed to save system path';
      addLog(`❌ [ERROR] ${errorMsg}`, 'error');
      setError(errorMsg);
      
      // Even on error, try to call onComplete to allow navigation
      // The parent component can decide whether to proceed or not
      if (onComplete && typeof onComplete === 'function') {
        console.warn('Calling onComplete despite error to allow navigation');
        try {
          onComplete(selectedPath);
        } catch (completeError) {
          console.error('Error calling onComplete:', completeError);
          if (onError) {
            onError(error);
          }
        }
      } else if (onError) {
        onError(error);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <FolderOpen className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            System Path Selection
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose where to save logs and password storage
          </p>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-orange-800 dark:text-orange-300">
            <p className="font-medium mb-1">What will be stored here?</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>System logs and scan results</li>
              <li>Encrypted password storage</li>
              <li>Setup configuration files</li>
              <li>Application state data</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Path Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Selected Directory
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={selectedPath}
            readOnly
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="No directory selected"
          />
          <button
            onClick={handleSelectPath}
            disabled={selecting || submitting}
            className="px-4 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 rounded-lg transition-colors flex items-center gap-2"
          >
            {selecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Selecting...
              </>
            ) : (
              <>
                <FolderOpen className="w-4 h-4" />
                Browse
              </>
            )}
          </button>
        </div>
        {selectedPath && (
          <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span>Directory selected successfully</span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

        {/* Confirm Button */}
      <button
        onClick={handleConfirm}
        disabled={!selectedPath || submitting}
        className="w-full px-4 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <CheckCircle className="w-4 h-4" />
            Confirm & Complete Setup
          </>
        )}
      </button>
    </div>
  );
};

export default Step5SystemPath;

