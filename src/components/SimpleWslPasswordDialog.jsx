<<<<<<< HEAD
import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { storeSecurePassword } from '../utils/securePasswordStorage';

const SimpleWslPasswordDialog = ({ isOpen, onClose, onSuccess }) => {
  const { showError } = useToast();
  const [adminName, setAdminName] = useState('root');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestPassword = async () => {
    if (!password.trim()) {
      setErrorMessage('Please enter your WSL root password');
      return;
    }

    setIsTesting(true);
    setErrorMessage('');

    try {
      // Test the password
      if (window.cyberGuard && window.cyberGuard.testWslRootCredentials) {
        const result = await window.cyberGuard.testWslRootCredentials(password);
        
        if (result && result.success) {
          // Password is valid, store it securely
          const stored = storeSecurePassword(password);
          if (stored) {
            console.log('✅ [SIMPLE-DIALOG] Password validated and stored');
            onSuccess(password);
            onClose();
          } else {
            setErrorMessage('Failed to save password. Please try again.');
          }
        } else {
          setErrorMessage('Invalid WSL root password. Please check your password.');
        }
      } else {
        setErrorMessage('WSL testing service not available. Please try again.');
      }
    } catch (error) {
      console.error('Error testing password:', error);
      setErrorMessage('Failed to test password. Please try again.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setErrorMessage('');
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isTesting) {
      handleTestPassword();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            WSL Root Access Required
          </h3>
          <button
            onClick={handleCancel}
            disabled={isTesting}
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
              <span className="font-medium text-blue-800 dark:text-blue-200">Why do I need this?</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              We need your WSL root access credentials to install security tools and run privileged commands. Your password will be stored securely and used only for system operations.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Admin Username
            </label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Enter admin username"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 border-gray-300 dark:border-slate-600 mb-4"
              disabled={isTesting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              WSL Root Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your WSL root password"
                className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 ${
                  errorMessage 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-gray-300 dark:border-slate-600'
                }`}
                disabled={isTesting}
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
            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleCancel}
              disabled={isTesting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleTestPassword}
              disabled={isTesting || !password.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test & Save</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleWslPasswordDialog;
=======
import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { storeSecurePassword } from '../utils/securePasswordStorage';

const SimpleWslPasswordDialog = ({ isOpen, onClose, onSuccess }) => {
  const { showError } = useToast();
  const [adminName, setAdminName] = useState('root');
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleTestPassword = async () => {
    if (!password.trim()) {
      setErrorMessage('Please enter your WSL root password');
      return;
    }

    setIsTesting(true);
    setErrorMessage('');

    try {
      // Test the password
      if (window.cyberGuard && window.cyberGuard.testWslRootCredentials) {
        const result = await window.cyberGuard.testWslRootCredentials(password);
        
        if (result && result.success) {
          // Password is valid, store it securely
          const stored = storeSecurePassword(password);
          if (stored) {
            console.log('✅ [SIMPLE-DIALOG] Password validated and stored');
            onSuccess(password);
            onClose();
          } else {
            setErrorMessage('Failed to save password. Please try again.');
          }
        } else {
          setErrorMessage('Invalid WSL root password. Please check your password.');
        }
      } else {
        setErrorMessage('WSL testing service not available. Please try again.');
      }
    } catch (error) {
      console.error('Error testing password:', error);
      setErrorMessage('Failed to test password. Please try again.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    setErrorMessage('');
    onClose();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isTesting) {
      handleTestPassword();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            WSL Root Access Required
          </h3>
          <button
            onClick={handleCancel}
            disabled={isTesting}
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
              <span className="font-medium text-blue-800 dark:text-blue-200">Why do I need this?</span>
            </div>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              We need your WSL root access credentials to install security tools and run privileged commands. Your password will be stored securely and used only for system operations.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Admin Username
            </label>
            <input
              type="text"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Enter admin username"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 border-gray-300 dark:border-slate-600 mb-4"
              disabled={isTesting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              WSL Root Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your WSL root password"
                className={`w-full px-3 py-2 pr-10 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100 ${
                  errorMessage 
                    ? 'border-red-300 dark:border-red-600' 
                    : 'border-gray-300 dark:border-slate-600'
                }`}
                disabled={isTesting}
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
            {errorMessage && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              onClick={handleCancel}
              disabled={isTesting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleTestPassword}
              disabled={isTesting || !password.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test & Save</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleWslPasswordDialog;
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
