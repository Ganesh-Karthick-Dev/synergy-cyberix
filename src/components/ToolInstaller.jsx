<<<<<<< HEAD
import React, { useState, useEffect } from 'react';

const ToolInstaller = ({ onClose }) => {
  const [missingTools, setMissingTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState([]);
  const [installResults, setInstallResults] = useState(null);
  const [isAutoInstalling, setIsAutoInstalling] = useState(false);
  const [autoInstallProgress, setAutoInstallProgress] = useState([]);

  useEffect(() => {
    checkMissingTools();
  }, []);

  const checkMissingTools = async () => {
    try {
      setIsLoading(true);
      const result = await window.cyberGuard.checkMissingTools();
      
      if (result.error) {
        console.error('Error checking tools:', result.error);
        return;
      }
      
      setMissingTools(result.missingTools || []);
      setSelectedTools(result.missingTools?.map(tool => tool.name) || []);
    } catch (error) {
      console.error('Error checking missing tools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolToggle = (toolName) => {
    setSelectedTools(prev => 
      prev.includes(toolName) 
        ? prev.filter(name => name !== toolName)
        : [...prev, toolName]
    );
  };

  const handleInstall = async () => {
    if (selectedTools.length === 0) return;
    
    setIsInstalling(true);
    setInstallProgress([]);
    setInstallResults(null);

    // Set up progress listener
    const progressHandler = (progress) => {
      setInstallProgress(prev => [...prev, progress]);
    };

    window.cyberGuard.onToolsInstallProgress(progressHandler);

    try {
      const result = await window.cyberGuard.installMissingTools(selectedTools);
      setInstallResults(result);
      
      if (result.results) {
        const successCount = result.results.filter(r => r.success).length;
        const totalCount = result.results.length;
        
        if (successCount === totalCount) {
          // All tools installed successfully, refresh the list
          setTimeout(() => {
            checkMissingTools();
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error installing tools:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleTestIPC = async () => {
    try {
      console.log('Testing IPC...');
      const result = await window.cyberGuard.testToolsIPC();
      console.log('IPC test result:', result);
      alert(`IPC Test: ${result.message}`);
    } catch (error) {
      console.error('IPC test failed:', error);
      alert(`IPC Test Failed: ${error.message}`);
    }
  };

  const handleAutoInstallAll = async () => {
    console.log('Starting auto-install...');
    setIsAutoInstalling(true);
    setAutoInstallProgress([]);

    // Set up progress listener
    const progressHandler = (progress) => {
      console.log('Auto-install progress:', progress);
      setAutoInstallProgress(prev => [...prev, progress]);
    };

    window.cyberGuard.onAutoInstallProgress(progressHandler);

    try {
      console.log('Calling autoInstallAllTools...');
      const result = await window.cyberGuard.autoInstallAllTools();
      console.log('Auto-install result:', result);
      
      if (result.success) {
        // Installation successful, refresh the list
        setTimeout(() => {
          checkMissingTools();
        }, 2000);
      }
    } catch (error) {
      console.error('Error in auto-install:', error);
    } finally {
      setIsAutoInstalling(false);
    }
  };

  const getToolCategory = (toolName) => {
    const categories = {
      'git': 'Development',
      'curl': 'Network',
      'wget': 'Network',
      'jq': 'Utilities',
      'unzip': 'Utilities',
      'nmap': 'Security',
      'nikto': 'Security',
      'sqlmap': 'Security',
      'hydra': 'Security',
      'gobuster': 'Security',
      'dirb': 'Security',
      'theHarvester': 'Reconnaissance',
      'amass': 'Reconnaissance',
      'john': 'Password Cracking',
      'medusa': 'Password Cracking',
      'metasploit-framework': 'Exploitation',
      'geoiplookup': 'Network',
      'mitmproxy': 'Web Security',
      'socat': 'Network',
      'netcat': 'Network',
      'fail2ban': 'Security',
      'go': 'Development',
      'ffuf': 'Web Security',
      'nuclei': 'Vulnerability Scanner',
      'dalfox': 'Web Security',
      'openssl': 'Cryptography'
    };
    return categories[toolName] || 'Other';
  };

  const getToolDescription = (toolName) => {
    const descriptions = {
      'git': 'Version control system',
      'curl': 'Command-line tool for transferring data',
      'wget': 'Command-line utility for downloading files',
      'jq': 'Command-line JSON processor',
      'unzip': 'Archive extraction utility',
      'nmap': 'Network mapper and port scanner',
      'nikto': 'Web server vulnerability scanner (WSL recommended)',
      'sqlmap': 'SQL injection testing tool (WSL recommended)',
      'hydra': 'Password cracking tool (WSL recommended)',
      'gobuster': 'Directory/file brute-forcer (WSL recommended)',
      'dirb': 'Web content scanner (WSL recommended)',
      'theHarvester': 'Email, subdomain, and people harvester (WSL recommended)',
      'amass': 'Subdomain enumeration tool (WSL recommended)',
      'john': 'Password cracking tool (WSL recommended)',
      'medusa': 'Parallel login brute-forcer (WSL recommended)',
      'metasploit-framework': 'Penetration testing framework (WSL recommended)',
      'geoiplookup': 'GeoIP location lookup tool (WSL recommended)',
      'mitmproxy': 'Interactive HTTPS proxy (WSL recommended)',
      'socat': 'Multipurpose relay tool (WSL recommended)',
      'netcat': 'Network utility for reading/writing network connections (WSL recommended)',
      'fail2ban': 'Intrusion prevention system (WSL recommended)',
      'go': 'Go programming language',
      'ffuf': 'Web fuzzer (requires Go)',
      'nuclei': 'Vulnerability scanner (requires Go)',
      'dalfox': 'XSS parameter analyzer (requires Go)',
      'openssl': 'Cryptography library and SSL/TLS toolkit'
    };
    return descriptions[toolName] || 'Security tool';
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-700 dark:text-gray-300">Checking for missing tools...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kali Tools Installer
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {missingTools.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-green-500 text-6xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              All Tools Installed!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              All required Kali Linux tools are installed and ready to use.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                The following security tools are missing from your system. Select the tools you want to install:
              </p>
              
              {/* Windows-specific help message */}
              {navigator.platform.toLowerCase().includes('win') && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Windows Installation Tips
                      </h3>
                      <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Basic tools (git, curl, wget) will install via Windows Package Manager</li>
                          <li>Security tools (nikto, sqlmap, etc.) require WSL with Kali Linux</li>
                          <li>Make sure WSL is installed: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">wsl --install -d kali-linux</code></li>
                          <li>Run as Administrator for best results</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {missingTools.map((tool) => (
                  <div key={tool.name} className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <input
                      type="checkbox"
                      id={tool.name}
                      checked={selectedTools.includes(tool.name)}
                      onChange={() => handleToolToggle(tool.name)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <label htmlFor={tool.name} className="block text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                        {tool.name}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {getToolDescription(tool.name)}
                      </p>
                      <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        {getToolCategory(tool.name)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedTools.length} of {missingTools.length} tools selected
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestIPC}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                >
                  🧪 Test IPC
                </button>
                <button
                  onClick={handleAutoInstallAll}
                  disabled={isAutoInstalling || isInstalling}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAutoInstalling ? 'Auto-Installing...' : '🚀 Install All Tools'}
                </button>
                <button
                  onClick={handleInstall}
                  disabled={selectedTools.length === 0 || isInstalling || isAutoInstalling}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInstalling ? 'Installing...' : `Install ${selectedTools.length} Tools`}
                </button>
              </div>
            </div>

            {/* Installation Progress */}
            {isInstalling && installProgress.length > 0 && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Installation Progress</h4>
                <div className="space-y-2">
                  {installProgress.map((progress, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      {progress.status === 'installing' && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                      {progress.status === 'success' && (
                        <div className="text-green-500">✅</div>
                      )}
                      {progress.status === 'error' && (
                        <div className="text-red-500">❌</div>
                      )}
                      <span className="text-gray-700 dark:text-gray-300">{progress.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-Install Progress */}
            {isAutoInstalling && autoInstallProgress.length > 0 && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h4 className="text-sm font-medium text-green-900 dark:text-green-200 mb-3">🚀 Auto-Installation Progress</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {autoInstallProgress.map((progress, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      {progress.stage === 'starting' && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      )}
                      {progress.stage === 'progress' && (
                        <div className="text-green-500">🔄</div>
                      )}
                      {progress.stage === 'complete' && (
                        <div className="text-green-500">✅</div>
                      )}
                      {progress.stage === 'error' && (
                        <div className="text-red-500">❌</div>
                      )}
                      <span className="text-green-800 dark:text-green-300">{progress.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Installation Results */}
            {installResults && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Installation Results</h4>
                {installResults.results && (
                  <div className="space-y-2">
                    {installResults.results.map((result, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        {result.success ? (
                          <div className="text-green-500">✅</div>
                        ) : (
                          <div className="text-red-500">❌</div>
                        )}
                        <span className="text-gray-700 dark:text-gray-300">
                          {result.tool} - {result.success ? 'Installed successfully' : 'Installation failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ToolInstaller;
=======
import React, { useState, useEffect } from 'react';

const ToolInstaller = ({ onClose }) => {
  const [missingTools, setMissingTools] = useState([]);
  const [selectedTools, setSelectedTools] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState([]);
  const [installResults, setInstallResults] = useState(null);
  const [isAutoInstalling, setIsAutoInstalling] = useState(false);
  const [autoInstallProgress, setAutoInstallProgress] = useState([]);

  useEffect(() => {
    checkMissingTools();
  }, []);

  const checkMissingTools = async () => {
    try {
      setIsLoading(true);
      const result = await window.cyberGuard.checkMissingTools();
      
      if (result.error) {
        console.error('Error checking tools:', result.error);
        return;
      }
      
      setMissingTools(result.missingTools || []);
      setSelectedTools(result.missingTools?.map(tool => tool.name) || []);
    } catch (error) {
      console.error('Error checking missing tools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToolToggle = (toolName) => {
    setSelectedTools(prev => 
      prev.includes(toolName) 
        ? prev.filter(name => name !== toolName)
        : [...prev, toolName]
    );
  };

  const handleInstall = async () => {
    if (selectedTools.length === 0) return;
    
    setIsInstalling(true);
    setInstallProgress([]);
    setInstallResults(null);

    // Set up progress listener
    const progressHandler = (progress) => {
      setInstallProgress(prev => [...prev, progress]);
    };

    window.cyberGuard.onToolsInstallProgress(progressHandler);

    try {
      const result = await window.cyberGuard.installMissingTools(selectedTools);
      setInstallResults(result);
      
      if (result.results) {
        const successCount = result.results.filter(r => r.success).length;
        const totalCount = result.results.length;
        
        if (successCount === totalCount) {
          // All tools installed successfully, refresh the list
          setTimeout(() => {
            checkMissingTools();
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Error installing tools:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleTestIPC = async () => {
    try {
      console.log('Testing IPC...');
      const result = await window.cyberGuard.testToolsIPC();
      console.log('IPC test result:', result);
      alert(`IPC Test: ${result.message}`);
    } catch (error) {
      console.error('IPC test failed:', error);
      alert(`IPC Test Failed: ${error.message}`);
    }
  };

  const handleAutoInstallAll = async () => {
    console.log('Starting auto-install...');
    setIsAutoInstalling(true);
    setAutoInstallProgress([]);

    // Set up progress listener
    const progressHandler = (progress) => {
      console.log('Auto-install progress:', progress);
      setAutoInstallProgress(prev => [...prev, progress]);
    };

    window.cyberGuard.onAutoInstallProgress(progressHandler);

    try {
      console.log('Calling autoInstallAllTools...');
      const result = await window.cyberGuard.autoInstallAllTools();
      console.log('Auto-install result:', result);
      
      if (result.success) {
        // Installation successful, refresh the list
        setTimeout(() => {
          checkMissingTools();
        }, 2000);
      }
    } catch (error) {
      console.error('Error in auto-install:', error);
    } finally {
      setIsAutoInstalling(false);
    }
  };

  const getToolCategory = (toolName) => {
    const categories = {
      'git': 'Development',
      'curl': 'Network',
      'wget': 'Network',
      'jq': 'Utilities',
      'unzip': 'Utilities',
      'nmap': 'Security',
      'nikto': 'Security',
      'sqlmap': 'Security',
      'hydra': 'Security',
      'gobuster': 'Security',
      'dirb': 'Security',
      'theHarvester': 'Reconnaissance',
      'amass': 'Reconnaissance',
      'john': 'Password Cracking',
      'medusa': 'Password Cracking',
      'metasploit-framework': 'Exploitation',
      'zaproxy': 'Web Security',
      'mitmproxy': 'Web Security',
      'socat': 'Network',
      'netcat': 'Network',
      'fail2ban': 'Security',
      'go': 'Development',
      'ffuf': 'Web Security',
      'nuclei': 'Vulnerability Scanner',
      'dalfox': 'Web Security',
      'openssl': 'Cryptography'
    };
    return categories[toolName] || 'Other';
  };

  const getToolDescription = (toolName) => {
    const descriptions = {
      'git': 'Version control system',
      'curl': 'Command-line tool for transferring data',
      'wget': 'Command-line utility for downloading files',
      'jq': 'Command-line JSON processor',
      'unzip': 'Archive extraction utility',
      'nmap': 'Network mapper and port scanner',
      'nikto': 'Web server vulnerability scanner (WSL recommended)',
      'sqlmap': 'SQL injection testing tool (WSL recommended)',
      'hydra': 'Password cracking tool (WSL recommended)',
      'gobuster': 'Directory/file brute-forcer (WSL recommended)',
      'dirb': 'Web content scanner (WSL recommended)',
      'theHarvester': 'Email, subdomain, and people harvester (WSL recommended)',
      'amass': 'Subdomain enumeration tool (WSL recommended)',
      'john': 'Password cracking tool (WSL recommended)',
      'medusa': 'Parallel login brute-forcer (WSL recommended)',
      'metasploit-framework': 'Penetration testing framework (WSL recommended)',
      'zaproxy': 'Web application security scanner (WSL recommended)',
      'mitmproxy': 'Interactive HTTPS proxy (WSL recommended)',
      'socat': 'Multipurpose relay tool (WSL recommended)',
      'netcat': 'Network utility for reading/writing network connections (WSL recommended)',
      'fail2ban': 'Intrusion prevention system (WSL recommended)',
      'go': 'Go programming language',
      'ffuf': 'Web fuzzer (requires Go)',
      'nuclei': 'Vulnerability scanner (requires Go)',
      'dalfox': 'XSS parameter analyzer (requires Go)',
      'openssl': 'Cryptography library and SSL/TLS toolkit'
    };
    return descriptions[toolName] || 'Security tool';
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-700 dark:text-gray-300">Checking for missing tools...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kali Tools Installer
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {missingTools.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-green-500 text-6xl mb-4">✅</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              All Tools Installed!
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              All required Kali Linux tools are installed and ready to use.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                The following security tools are missing from your system. Select the tools you want to install:
              </p>
              
              {/* Windows-specific help message */}
              {navigator.platform.toLowerCase().includes('win') && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Windows Installation Tips
                      </h3>
                      <div className="mt-2 text-sm text-blue-700 dark:text-blue-300">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Basic tools (git, curl, wget) will install via Windows Package Manager</li>
                          <li>Security tools (nikto, sqlmap, etc.) require WSL with Kali Linux</li>
                          <li>Make sure WSL is installed: <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">wsl --install -d kali-linux</code></li>
                          <li>Run as Administrator for best results</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {missingTools.map((tool) => (
                  <div key={tool.name} className="flex items-start space-x-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                    <input
                      type="checkbox"
                      id={tool.name}
                      checked={selectedTools.includes(tool.name)}
                      onChange={() => handleToolToggle(tool.name)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1">
                      <label htmlFor={tool.name} className="block text-sm font-medium text-gray-900 dark:text-white cursor-pointer">
                        {tool.name}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {getToolDescription(tool.name)}
                      </p>
                      <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                        {getToolCategory(tool.name)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {selectedTools.length} of {missingTools.length} tools selected
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTestIPC}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
                >
                  🧪 Test IPC
                </button>
                <button
                  onClick={handleAutoInstallAll}
                  disabled={isAutoInstalling || isInstalling}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAutoInstalling ? 'Auto-Installing...' : '🚀 Install All Tools'}
                </button>
                <button
                  onClick={handleInstall}
                  disabled={selectedTools.length === 0 || isInstalling || isAutoInstalling}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInstalling ? 'Installing...' : `Install ${selectedTools.length} Tools`}
                </button>
              </div>
            </div>

            {/* Installation Progress */}
            {isInstalling && installProgress.length > 0 && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Installation Progress</h4>
                <div className="space-y-2">
                  {installProgress.map((progress, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      {progress.status === 'installing' && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                      )}
                      {progress.status === 'success' && (
                        <div className="text-green-500">✅</div>
                      )}
                      {progress.status === 'error' && (
                        <div className="text-red-500">❌</div>
                      )}
                      <span className="text-gray-700 dark:text-gray-300">{progress.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-Install Progress */}
            {isAutoInstalling && autoInstallProgress.length > 0 && (
              <div className="mt-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <h4 className="text-sm font-medium text-green-900 dark:text-green-200 mb-3">🚀 Auto-Installation Progress</h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {autoInstallProgress.map((progress, index) => (
                    <div key={index} className="flex items-center space-x-2 text-sm">
                      {progress.stage === 'starting' && (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                      )}
                      {progress.stage === 'progress' && (
                        <div className="text-green-500">🔄</div>
                      )}
                      {progress.stage === 'complete' && (
                        <div className="text-green-500">✅</div>
                      )}
                      {progress.stage === 'error' && (
                        <div className="text-red-500">❌</div>
                      )}
                      <span className="text-green-800 dark:text-green-300">{progress.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Installation Results */}
            {installResults && (
              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Installation Results</h4>
                {installResults.results && (
                  <div className="space-y-2">
                    {installResults.results.map((result, index) => (
                      <div key={index} className="flex items-center space-x-2 text-sm">
                        {result.success ? (
                          <div className="text-green-500">✅</div>
                        ) : (
                          <div className="text-red-500">❌</div>
                        )}
                        <span className="text-gray-700 dark:text-gray-300">
                          {result.tool} - {result.success ? 'Installed successfully' : 'Installation failed'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ToolInstaller;
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
