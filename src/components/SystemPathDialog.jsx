import React, { useState } from 'react';
import { FolderOpen, AlertCircle, Loader2, CheckCircle } from 'lucide-react';

const SystemPathDialog = ({ onConfirm, onCancel }) => {
  const [selectedPath, setSelectedPath] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState('');

  const handleSelectPath = async () => {
    setSelecting(true);
    setError('');
    
    try {
      if (window.cyberGuard?.selectDirectory) {
        const path = await window.cyberGuard.selectDirectory();
        if (path) {
          setSelectedPath(path);
        } else {
          setError('No directory selected');
        }
      } else {
        setError('Directory selection not available');
      }
    } catch (err) {
      console.error('Error selecting directory:', err);
      setError(err.message || 'Failed to select directory');
    } finally {
      setSelecting(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedPath) {
      setError('Please select a directory');
      return;
    }
    onConfirm(selectedPath);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center">
              <FolderOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Select System Path
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Choose where to save logs and passwords
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
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
                disabled={selecting}
                className="px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 rounded-lg transition-colors flex items-center gap-2"
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
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPath}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              Confirm & Complete Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemPathDialog;

