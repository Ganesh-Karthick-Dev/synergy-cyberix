import { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { 
  storeWslCredentials, 
  testWslCredentials, 
  testWslRootCredentials,
  storeWslRootPassword,
  getDefaultWslUsername,
  hasWslCredentials 
} from '../utils/wslPasswordManager';

const WslPasswordPrompt = ({ isOpen, onClose, onSuccess }) => {
  const { showSuccess, showError, dismissToast } = useToast();
  const [password, setPassword] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [detectedUsername, setDetectedUsername] = useState('root');
  const [isRootMode, setIsRootMode] = useState(true);

  useEffect(() => {
    if (isOpen) {
      // Auto-detect WSL username when dialog opens
      loadDefaultUsername();
    }
  }, [isOpen]);


  const loadDefaultUsername = async () => {
    try {
      const defaultUsername = await getDefaultWslUsername();
      setDetectedUsername(defaultUsername || 'root');
    } catch (error) {
      console.error('Failed to load default username:', error);
      setDetectedUsername('root');
    }
  };

  const handleTestCredentials = async () => {
    if (!password.trim()) {
      showError('Please enter your WSL password');
      return;
    }

    setIsTesting(true);

    try {
      let isValid = false;
      
      if (isRootMode) {
        // Test root password specifically
        console.log('🔐 [WSL-PROMPT] ===== TEST & SAVE CLICKED =====');
        console.log('🔐 [WSL-PROMPT] Testing root password in root mode');
        console.log('🔐 [WSL-PROMPT] Password length:', password.length);
        console.log('🔐 [WSL-PROMPT] Password (masked):', password.replace(/./g, '*'));
        console.log('🔐 [WSL-PROMPT] Timestamp:', new Date().toISOString());
        console.log('🔐 [WSL-PROMPT] About to call testWslRootCredentials...');
        console.log('🔐 [WSL-PROMPT] Commands that will be executed:');
        console.log('🔐 [WSL-PROMPT] 1. wsl');
        console.log('🔐 [WSL-PROMPT] 2. sudo -S whoami');
        console.log('🔐 [WSL-PROMPT] 3. User password: [PROVIDED]');
        console.log('🔐 [WSL-PROMPT] 4. whoami (to verify root access)');
        console.log('🔐 [WSL-PROMPT] Full command: echo "[PASSWORD]" | wsl sudo -S whoami');
        
        // Skip connectivity test - go directly to password testing
        console.log('🔐 [WSL-PROMPT] Proceeding directly to password test...');
        
        console.log('🔐 [WSL-PROMPT] Calling testWslRootCredentials with timeout...');
        const startTime = Date.now();
        
        // Add timeout to prevent hanging
        isValid = await Promise.race([
          testWslRootCredentials(password),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Password test timeout after 15 seconds')), 15000)
          )
        ]);
        
        const duration = Date.now() - startTime;
        console.log('🔐 [WSL-PROMPT] Password test completed in', duration, 'ms');
        
        console.log('🔐 [WSL-PROMPT] ===== TEST RESULT =====');
        console.log('🔐 [WSL-PROMPT] testWslRootCredentials returned:', isValid);
        console.log('🔐 [WSL-PROMPT] isValid type:', typeof isValid);
        console.log('🔐 [WSL-PROMPT] Test completed at:', new Date().toISOString());
        
        if (isValid) {
          console.log('🔐 [WSL-PROMPT] ===== PASSWORD VALID - STORING =====');
          console.log('🔐 [WSL-PROMPT] Root password is valid, storing...');
          
          // Store root password (this will now trigger automatic tool checking)
          const stored = await storeWslRootPassword(password);
          console.log('🔐 [WSL-PROMPT] Store result:', stored);
          
          if (stored && stored.success) {
            console.log('🔐 [WSL-PROMPT] ✅ Password stored successfully');
            console.log('🔐 [WSL-PROMPT] ✅ Tool check result:', stored.toolCheck);
            
            if (stored.toolCheck && stored.toolCheck.success) {
              console.log('🔐 [WSL-PROMPT] ✅ All tools are ready');
              showSuccess('WSL root password verified and all security tools are ready!');
            } else if (stored.toolCheck && stored.toolCheck.missingTools && stored.toolCheck.missingTools.length > 0) {
              console.log('🔐 [WSL-PROMPT] ⚠️ Some tools are missing:', stored.toolCheck.missingTools);
              showSuccess(`WSL root password verified! ${stored.toolCheck.installedCount}/${stored.toolCheck.totalChecked} tools are ready.`);
            } else {
              console.log('🔐 [WSL-PROMPT] ✅ Password stored, tool check completed');
              showSuccess('WSL root password verified and saved!');
            }
            
            // Close dialog immediately and pass tool check result to parent
            onSuccess('root', password, stored.toolCheck);
            onClose();
          } else {
            console.log('🔐 [WSL-PROMPT] ❌ Failed to store password');
            const errorMsg = stored?.error || 'Failed to save root password';
            showError(errorMsg);
          }
        } else {
          console.log('🔐 [WSL-PROMPT] ===== PASSWORD INVALID =====');
          console.log('🔐 [WSL-PROMPT] ❌ Root password is invalid');
          console.log('🔐 [WSL-PROMPT] ❌ Showing error message to user');
          showError('Invalid WSL root password. Please check your password.');
        }
      } else {
        // Test regular user password
        console.log('🔐 [WSL-PROMPT] ===== TEST & SAVE CLICKED (USER MODE) =====');
        console.log('🔐 [WSL-PROMPT] Testing regular user password');
        console.log('🔐 [WSL-PROMPT] Password length:', password.length);
        console.log('🔐 [WSL-PROMPT] Password (masked):', password.replace(/./g, '*'));
        console.log('🔐 [WSL-PROMPT] Timestamp:', new Date().toISOString());
        console.log('🔐 [WSL-PROMPT] About to call testWslCredentials...');
        console.log('🔐 [WSL-PROMPT] Commands that will be executed:');
        console.log('🔐 [WSL-PROMPT] 1. wsl');
        console.log('🔐 [WSL-PROMPT] 2. sudo whoami (using user password)');
        console.log('🔐 [WSL-PROMPT] 3. User password: [PROVIDED]');
        console.log('🔐 [WSL-PROMPT] Full command: echo "[PASSWORD]" | wsl sudo whoami');
        
        isValid = await testWslCredentials(password);
        
        console.log('🔐 [WSL-PROMPT] ===== TEST RESULT (USER MODE) =====');
        console.log('🔐 [WSL-PROMPT] testWslCredentials returned:', isValid);
        console.log('🔐 [WSL-PROMPT] isValid type:', typeof isValid);
        console.log('🔐 [WSL-PROMPT] Test completed at:', new Date().toISOString());
        
        if (isValid) {
          console.log('🔐 [WSL-PROMPT] ===== PASSWORD VALID - STORING (USER MODE) =====');
          console.log('🔐 [WSL-PROMPT] User password is valid, storing...');
          
          // Get username for storage
          const username = await getDefaultWslUsername();
          if (!username) {
            console.log('🔐 [WSL-PROMPT] ❌ Could not detect WSL username');
            showError('Could not detect WSL username. Please check your WSL installation.');
            setIsTesting(false);
            return;
          }

          console.log('🔐 [WSL-PROMPT] Detected username:', username);
          
          // Store credentials
          const stored = storeWslCredentials(username, password);
          if (stored) {
            console.log('🔐 [WSL-PROMPT] ✅ User credentials stored successfully');
            console.log('🔐 [WSL-PROMPT] ✅ Showing success message to user');
            showSuccess('WSL password verified and saved!');
            onSuccess(username, password);
            onClose();
          } else {
            console.log('🔐 [WSL-PROMPT] ❌ Failed to store user credentials');
            showError('Failed to save password');
          }
        } else {
          console.log('🔐 [WSL-PROMPT] ===== PASSWORD INVALID (USER MODE) =====');
          console.log('🔐 [WSL-PROMPT] ❌ User password is invalid');
          console.log('🔐 [WSL-PROMPT] ❌ Showing error message to user');
          showError('Invalid WSL password. Please check your password.');
        }
      }
    } catch (error) {
      console.log('🔐 [WSL-PROMPT] ===== ERROR OCCURRED =====');
      console.log('🔐 [WSL-PROMPT] Error type:', error.constructor.name);
      console.log('🔐 [WSL-PROMPT] Error message:', error.message);
      console.log('🔐 [WSL-PROMPT] Error stack:', error.stack);
      
      if (error.message.includes('timeout')) {
        showError('Password test timed out. Please check if WSL is running and try again.');
      } else {
        showError(`Failed to test password: ${error.message}`);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleCancel = () => {
    setPassword('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isRootMode ? 'WSL Root Password Required' : 'WSL Password Required'}
          </h3>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
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
              {isRootMode 
                ? 'To install security tools and run privileged commands in WSL, we need your WSL root password. After validation, we\'ll automatically check and install all required security tools. Your password is stored securely in your browser\'s local storage.'
                : 'To install security tools in WSL, we need your WSL password. After validation, we\'ll automatically check and install all required security tools. Your password is stored securely in your browser\'s local storage.'
              }
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              WSL User
            </label>
            <div className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-gray-50 dark:bg-slate-700 text-gray-600 dark:text-gray-400">
              {isRootMode ? 'root' : detectedUsername}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {isRootMode ? 'Root user for privileged access' : 'Auto-detected WSL username'}
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isRootMode}
                onChange={(e) => setIsRootMode(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Root Access Mode
              </span>
            </label>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {isRootMode ? 'Privileged commands' : 'Regular user access'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              WSL Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRootMode ? "Enter your WSL root password" : "Enter your WSL password"}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100"
                disabled={isTesting}
                onKeyPress={(e) => e.key === 'Enter' && handleTestCredentials()}
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
              onClick={handleTestCredentials}
              disabled={isTesting || !password.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Testing & Installing Tools...</span>
                </>
              ) : (
                <span>Test, Save & Install Tools</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WslPasswordPrompt;
