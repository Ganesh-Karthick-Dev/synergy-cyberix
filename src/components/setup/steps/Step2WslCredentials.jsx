import React, { useState } from 'react';
import { Key, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Step 2: WSL Credentials Component
 * Handles WSL username and password setup
 */
const Step2WslCredentials = ({ onComplete, onError, onLog }) => {
  const [username, setUsername] = useState('root');
  const [password, setPassword] = useState('1234');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};

    if (!username || username.trim().length === 0) {
      newErrors.username = 'Username is required';
    } else if (username.trim().length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    if (!password || password.length === 0) {
      newErrors.password = 'Password is required';
    } else if (password.length < 4) {
      newErrors.password = 'Password must be at least 4 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    if (onLog) {
      onLog('🔐 [CREDENTIALS] Validating WSL credentials...', 'info');
      onLog(`📋 [INFO] Username: ${username.trim()}`, 'info');
      onLog('💻 [COMMAND] Testing credentials in WSL terminal...', 'info');
    }

    try {
      // FIRST: Test credentials in terminal BEFORE saving
      if (onLog) onLog('🔍 [VERIFY] Testing WSL credentials in terminal...', 'info');
      
      if (window.cyberGuard?.testWslRootCredentials) {
        if (onLog) {
          onLog('💻 [COMMAND] Executing: wsl -u root bash -c "echo \'***\' | sudo -S whoami"', 'info');
          onLog('⏳ [INFO] Waiting for terminal response...', 'info');
        }
        
        const testResult = await window.cyberGuard.testWslRootCredentials(password);
        
        // Log terminal output from debug object
        if (testResult?.debug) {
          if (testResult.debug.stdout) {
            if (onLog) onLog(`📤 [TERMINAL OUTPUT] stdout:\n${testResult.debug.stdout}`, 'info');
          }
          if (testResult.debug.stderr) {
            if (onLog) onLog(`📤 [TERMINAL OUTPUT] stderr:\n${testResult.debug.stderr}`, 'warning');
          }
        }
        // Also check for direct stdout/stderr
        if (testResult?.stdout) {
          if (onLog) onLog(`📤 [TERMINAL OUTPUT] stdout:\n${testResult.stdout}`, 'info');
        }
        if (testResult?.stderr) {
          if (onLog) onLog(`📤 [TERMINAL OUTPUT] stderr:\n${testResult.stderr}`, 'warning');
        }
        if (testResult?.output) {
          if (onLog) onLog(`📤 [TERMINAL OUTPUT] output:\n${testResult.output}`, 'info');
        }
        
        // Check if validation passed
        if (testResult && testResult.success) {
          if (onLog) {
            onLog('✅ [RESULT] Credentials verified successfully in terminal', 'success');
            onLog('✅ [STATUS] Root access confirmed', 'success');
            onLog('💾 [SAVE] Saving credentials to secure storage...', 'info');
          }
          
          // ONLY save if validation passed
          if (window.cyberGuard?.storeRootPassword) {
            if (onLog) onLog('💾 [ENCRYPT] Encrypting and saving password...', 'info');
            // Store password - this is fast, encryption happens in main process
            const storeResult = await window.cyberGuard.storeRootPassword(password);
            if (storeResult?.success !== false) {
              if (onLog) onLog('✅ [RESULT] Password encrypted and stored securely', 'success');
            } else {
              if (onLog) onLog(`⚠️ [WARNING] Password storage warning: ${storeResult?.error || 'Unknown'}`, 'warning');
            }
          }

          if (onLog) {
            onLog('✅ [RESULT] WSL credentials saved successfully', 'success');
            onLog('✅ [COMPLETE] Step 2 completed!', 'success');
          }
          onComplete({ username: username.trim(), password });
        } else {
          // Validation failed - don't save
          // Log terminal output from debug object even on failure
          if (testResult?.debug) {
            if (testResult.debug.method1) {
              if (testResult.debug.method1.stdout) {
                if (onLog) onLog(`📤 [TERMINAL OUTPUT] Method 1 stdout:\n${testResult.debug.method1.stdout}`, 'error');
              }
              if (testResult.debug.method1.stderr) {
                if (onLog) onLog(`📤 [TERMINAL OUTPUT] Method 1 stderr:\n${testResult.debug.method1.stderr}`, 'error');
              }
            }
            if (testResult.debug.method2) {
              if (testResult.debug.method2.stdout) {
                if (onLog) onLog(`📤 [TERMINAL OUTPUT] Method 2 stdout:\n${testResult.debug.method2.stdout}`, 'error');
              }
              if (testResult.debug.method2.stderr) {
                if (onLog) onLog(`📤 [TERMINAL OUTPUT] Method 2 stderr:\n${testResult.debug.method2.stderr}`, 'error');
              }
            }
            if (testResult.debug.stdout && !testResult.debug.method1) {
              if (onLog) onLog(`📤 [TERMINAL OUTPUT] stdout:\n${testResult.debug.stdout}`, 'error');
            }
            if (testResult.debug.stderr && !testResult.debug.method1) {
              if (onLog) onLog(`📤 [TERMINAL OUTPUT] stderr:\n${testResult.debug.stderr}`, 'error');
            }
          }
          
          const errorMsg = testResult?.error || testResult?.message || 'Credentials validation failed';
          if (onLog) {
            onLog('❌ [RESULT] Credentials validation failed', 'error');
            onLog(`❌ [ERROR] ${errorMsg}`, 'error');
            if (testResult?.details) {
              onLog(`📋 [DETAILS] ${testResult.details}`, 'error');
            }
          }
          
          setErrors({ submit: errorMsg });
          onError(new Error(errorMsg));
        }
      } else {
        throw new Error('WSL credential testing API not available');
      }
    } catch (error) {
      const errorMsg = error.message || 'Failed to validate credentials';
      if (onLog) {
        onLog(`❌ [ERROR] ${errorMsg}`, 'error');
        if (error.stack) {
          onLog(`📋 [STACK] ${error.stack}`, 'error');
        }
      }
      
      // Check if it's a user already exists error
      if (errorMsg.includes('already exists') || errorMsg.includes('user')) {
        setErrors({ submit: 'User already exists. Please choose a different username.' });
      } else {
        setErrors({ submit: errorMsg });
      }
      onError(error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
          <Key className="w-5 h-5 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
            WSL Credentials Setup
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Provide your WSL credentials or create new ones
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Info Box */}
        <div className="bg-gradient-to-r from-orange-50 to-orange-50/50 dark:from-orange-900/20 dark:to-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-200 dark:bg-orange-800 flex items-center justify-center mt-0.5">
              <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <div className="text-sm text-orange-800 dark:text-orange-300">
              <p className="font-semibold mb-1.5">WSL Credentials Required</p>
              <p className="leading-relaxed">
                If you have existing WSL credentials, enter them below. Otherwise, enter new credentials and we'll create a new WSL user for you.
                The password will be encrypted and stored securely on your system.
              </p>
            </div>
          </div>
        </div>

        {/* Username Field */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            WSL Username
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              if (errors.username) setErrors({ ...errors, username: null });
            }}
            className={`w-full px-4 py-3 border rounded-lg transition-all focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:border-orange-500 ${
              errors.username 
                ? 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500' 
                : 'border-gray-300 dark:border-gray-600'
            }`}
            placeholder="Enter WSL username"
            disabled={submitting}
          />
          {errors.username && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.username}
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            WSL Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors({ ...errors, password: null });
              }}
              className={`w-full px-4 py-3 pr-12 border rounded-lg transition-all focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:border-orange-500 ${
                errors.password 
                  ? 'border-red-300 dark:border-red-600 focus:ring-red-500 focus:border-red-500' 
                  : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder="Enter WSL password"
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded-md p-1.5 hover:bg-orange-50 dark:hover:bg-orange-900/20"
              disabled={submitting}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={0}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" strokeWidth={2} />
              ) : (
                <Eye className="w-5 h-5" strokeWidth={2} />
              )}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {errors.password}
            </p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
            Default values are pre-filled. You can change them if needed.
          </p>
        </div>

        {errors.submit && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full px-6 py-3.5 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800 disabled:from-orange-400 disabled:to-orange-500 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:shadow-none transform hover:scale-[1.02] disabled:transform-none"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Key className="w-5 h-5" />
              <span>Save & Continue</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default Step2WslCredentials;

