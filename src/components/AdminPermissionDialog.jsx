import React, { useState } from 'react';
import { Shield, AlertTriangle, Loader2 } from 'lucide-react';

const AdminPermissionDialog = ({ onGrant, onSkip }) => {
  const [requesting, setRequesting] = useState(false);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      // Request admin permissions
      // This will trigger Windows UAC prompt
      await onGrant();
    } catch (error) {
      console.error('Error requesting admin permission:', error);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Administrator Access Required
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Setup needs elevated permissions
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-medium mb-1">Why do we need this?</p>
                <p className="leading-relaxed">
                  Cyberix needs administrator privileges to:
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
                  <li>Install Windows Subsystem for Linux (WSL)</li>
                  <li>Install Kali Linux distribution</li>
                  <li>Configure system components</li>
                  <li>Set up required security tools</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>
              When you click "Grant Permission", Windows will show a User Account Control (UAC) dialog.
              Please click "Yes" to allow the installation to proceed.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex gap-3">
            <button
              onClick={onSkip}
              disabled={requesting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            >
              Skip for Now
            </button>
            <button
              onClick={handleRequest}
              disabled={requesting}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {requesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Requesting...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Grant Permission
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPermissionDialog;

