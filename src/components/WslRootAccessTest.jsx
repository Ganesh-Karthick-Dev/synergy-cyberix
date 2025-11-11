import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { 
  hasWslRootPassword, 
  getWslRootPassword, 
  clearWslRootPassword 
} from '../utils/wslPasswordManager';

const WslRootAccessTest = () => {
  const { showSuccess, showError, showLoading } = useToast();
  const [testResult, setTestResult] = useState(null);
  const [isTesting, setIsTesting] = useState(false);

  const testRootAccess = async () => {
    setIsTesting(true);
    showLoading('Testing WSL root access...');

    try {
      // Test 1: Check if root password is stored
      const hasPassword = hasWslRootPassword();
      console.log('Has stored root password:', hasPassword);

      if (!hasPassword) {
        showError('No root password stored. Please set up root access first.');
        setIsTesting(false);
        return;
      }

      // Test 2: Try to run a simple root command
      const testCommand = 'whoami && id';
      console.log('Testing root command:', testCommand);

      const result = await window.cyberGuard.runAsRoot({
        distro: 'kali-linux',
        command: testCommand,
        requireConfirm: false, // Skip confirmation for testing
        useStoredPassword: true
      });

      console.log('Root access test result:', result);

      if (result.success) {
        setTestResult({
          success: true,
          output: result.stdout,
          error: result.stderr,
          duration: result.duration
        });
        showSuccess('WSL root access test successful!');
      } else {
        setTestResult({
          success: false,
          output: result.stdout,
          error: result.stderr || result.error,
          duration: result.duration
        });
        showError(`WSL root access test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Root access test error:', error);
      setTestResult({
        success: false,
        output: '',
        error: error.message,
        duration: 0
      });
      showError(`Test failed: ${error.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const clearStoredPassword = async () => {
    try {
      await clearWslRootPassword();
      setTestResult(null);
      showSuccess('Stored root password cleared');
    } catch (error) {
      showError(`Failed to clear password: ${error.message}`);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          WSL Root Access Test
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={testRootAccess}
            disabled={isTesting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isTesting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Testing...</span>
              </>
            ) : (
              <span>Test Root Access</span>
            )}
          </button>
          <button
            onClick={clearStoredPassword}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Clear Password
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
            Test Information
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            This test will verify that your WSL root password is working correctly by running a simple command as root.
            Make sure you have set up your root password using the WSL Password Prompt first.
          </p>
        </div>

        {testResult && (
          <div className={`p-4 rounded-lg border ${
            testResult.success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center space-x-2 mb-3">
              {testResult.success ? (
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <h3 className={`font-medium ${
                testResult.success 
                  ? 'text-green-800 dark:text-green-200' 
                  : 'text-red-800 dark:text-red-200'
              }`}>
                Test {testResult.success ? 'Successful' : 'Failed'}
              </h3>
            </div>

            {testResult.duration && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Duration: {testResult.duration}ms
              </p>
            )}

            {testResult.output && (
              <div className="mb-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Output:</h4>
                <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded border overflow-x-auto">
                  {testResult.output}
                </pre>
              </div>
            )}

            {testResult.error && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Error:</h4>
                <pre className="text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded border overflow-x-auto text-red-600 dark:text-red-400">
                  {testResult.error}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <h3 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">
            Security Note
          </h3>
          <p className="text-sm text-yellow-700 dark:text-yellow-300">
            Root access provides full administrative privileges in your WSL environment. 
            Only use this feature when necessary and ensure your WSL system is properly secured.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WslRootAccessTest;
