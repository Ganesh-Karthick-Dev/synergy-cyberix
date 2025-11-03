import { useState } from 'react';
import { useToast } from '../context/ToastContext';

const WslUserCreationDialog = ({ isOpen, onClose, onSuccess }) => {
  const { showError, showSuccess, showLoading, dismissToast } = useToast();
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('1234');
  const [confirmPassword, setConfirmPassword] = useState('1234');
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleCreateUser = async () => {
    // Validation
    if (!username.trim()) {
      setErrorMessage('Please enter a username');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Please enter a password');
      return;
    }

    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setIsCreating(true);
    setErrorMessage('');

    try {
      const loadingToast = showLoading('Creating WSL user...');
      
      if (window.cyberGuard && window.cyberGuard.createWslUser) {
        const result = await window.cyberGuard.createWslUser(username, password);
        dismissToast(loadingToast);
        
        if (result && result.success) {
          console.log('✅ [WSL-USER-CREATION] User created successfully');
          showSuccess(`WSL user "${username}" created successfully!`);
          onSuccess(username, password);
          onClose();
        } else {
          const errorMsg = result?.error || 'Failed to create user';
          console.error('❌ [WSL-USER-CREATION] User creation failed:', errorMsg);
          
          // Check if root already exists
          if (errorMsg.toLowerCase().includes('already exists') || 
              errorMsg.toLowerCase().includes('user exists') ||
              errorMsg.toLowerCase().includes('user already')) {
            setErrorMessage(`User "${username}" already exists. Please choose a different username.`);
          } else {
            setErrorMessage(`Failed to create user: ${errorMsg}`);
          }
        }
      } else {
        dismissToast(loadingToast);
        setErrorMessage('WSL user creation service not available. Please try again.');
      }
    } catch (error) {
      console.error('❌ [WSL-USER-CREATION] Error creating user:', error);
      setErrorMessage(`Failed to create user: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setUsername('root');
    setPassword('1234');
    setConfirmPassword('1234');
    setErrorMessage('');
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isCreating) {
      handleCreateUser();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Create WSL User Account
          </h3>
          <button
            onClick={handleCancel}
            disabled={isCreating}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium text-blue-800 dark:text-blue-200">First Time Setup</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              WSL is installed but no user account has been configured. Please create a user account with a username and password. These credentials will be stored securely.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100"
              disabled={isCreating}
              onKeyPress={handleKeyPress}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Default: root
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 ${
                  errorMessage 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-gray-300 dark:border-slate-600'
                }`}
                disabled={isCreating}
                onKeyPress={handleKeyPress}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Default: 1234
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 ${
                errorMessage 
                  ? 'border-red-300 dark:border-red-600' 
                  : 'border-gray-300 dark:border-slate-600'
              }`}
              disabled={isCreating}
              onKeyPress={handleKeyPress}
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">
                {errorMessage}
              </p>
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleCancel}
              disabled={isCreating}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateUser}
              disabled={isCreating || !username.trim() || !password.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isCreating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create User</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WslUserCreationDialog;

