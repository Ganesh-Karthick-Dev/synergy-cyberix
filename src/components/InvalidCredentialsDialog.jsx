import { useState } from 'react';
import { AlertTriangle, Key, UserPlus } from 'lucide-react';

const InvalidCredentialsDialog = ({ 
  isOpen, 
  onClose, 
  onTryAgain, 
  onCreateNewUser,
  username = 'root'
}) => {
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleCreateNewUser = async () => {
    setIsCreating(true);
    try {
      await onCreateNewUser();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            Invalid Credentials
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              The credentials you provided are invalid. The username "{username}" or password is incorrect.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              What would you like to do?
            </p>

            <button
              onClick={onTryAgain}
              disabled={isCreating}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Key className="w-5 h-5" />
              <span>Try Another Password</span>
            </button>

            <button
              onClick={handleCreateNewUser}
              disabled={isCreating}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating New User...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>Create New WSL User</span>
                </>
              )}
            </button>
          </div>

          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Creating a new user will set up a new WSL user account in Ubuntu with the username and password you provide. This is useful if you've forgotten your existing credentials.
            </p>
          </div>

          <button
            onClick={onClose}
            disabled={isCreating}
            className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvalidCredentialsDialog;

