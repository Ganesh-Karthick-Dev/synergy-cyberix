import React, { useState, useEffect, useRef } from 'react';
import { githubApi, githubHelpers, githubScanIntegration } from '../services';

function APIScanner() {
  // State management
  const [authStep, setAuthStep] = useState('not-authenticated'); // 'not-authenticated', 'authenticating', 'authenticated', 'selecting-repos', 'scanning'
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [repositories, setRepositories] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(true);
  const consoleEndRef = useRef(null);
  
  // Auto-scroll console to bottom when new logs arrive
  useEffect(() => {
    if (consoleEndRef.current && showConsole) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, showConsole]);

  // Add log to console
  const addLog = (message, command = null, type = 'info', tool = null, output = null) => {
    setConsoleLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      message,
      command,
      type,
      tool,
      output
    }]);
  };

  // Initiate GitHub OAuth using the API service
  const handleInitiateAuth = async () => {
    try {
      setAuthStep('authenticating');
      addLog('🔐 Initiating GitHub OAuth...', null, 'info');
      
      // Check if GitHub OAuth is configured
      if (!githubHelpers.isConfigured()) {
        const configStatus = githubHelpers.getConfigurationStatus();
        const missing = [];
        if (!configStatus.clientId) missing.push('GITHUB_CLIENT_ID');
        if (!configStatus.clientSecret) missing.push('GITHUB_CLIENT_SECRET');
        if (!configStatus.callbackUrl) missing.push('GITHUB_CALLBACK_URL');
        
        throw new Error(`GitHub OAuth is not configured. Please set the following environment variables: ${missing.join(', ')}`);
      }

      addLog('🌐 Opening GitHub OAuth in browser...', null, 'info');
      
      // Use the GitHub helpers to complete OAuth flow
      const result = await githubHelpers.completeOAuthFlow({
        redirect: 'myapp://github-callback',
        timeout: 300000 // 5 minutes
      });
      
      if (result.success && result.token) {
        // Store token
        githubApi.setGitHubToken(result.token, true);
        setAccessToken(result.token);
        setUser(result.user);
        setAuthStep('authenticated');
        addLog(`✅ Authentication successful! Welcome, ${result.user.login || result.user.name}!`, null, 'success');
        
        // Automatically fetch repositories
        await handleFetchRepositories(result.token);
      } else {
        throw new Error('Authentication failed: No token received');
      }
    } catch (error) {
      console.error('Auth initiation error:', error);
      addLog(`❌ Authentication error: ${error.message}`, null, 'error');
      setAuthStep('not-authenticated');
      
      // Show user-friendly error message
      if (error.message.includes('not configured')) {
        alert(`❌ GitHub OAuth Configuration Error\n\n${error.message}\n\nPlease add these to your .env file and restart the application.`);
      } else if (error.message.includes('timed out')) {
        alert('❌ Authentication timed out. Please try again.');
      } else {
        alert(`❌ Authentication failed: ${error.message}`);
      }
    }
  };

  // Listen for OAuth callback from Electron (if using protocol handler)
  useEffect(() => {
    if (window.cyberGuard && window.cyberGuard.onProtocolUrl) {
      const handleCallback = (url) => {
        if (url && url.includes('github-callback')) {
          addLog('📥 Received OAuth callback...', null, 'info');
          githubHelpers.handleElectronCallback(url)
            .then((result) => {
              if (result.success && result.token) {
                githubApi.setGitHubToken(result.token, true);
                setAccessToken(result.token);
                setUser(result.user);
                setAuthStep('authenticated');
                addLog(`✅ Authentication successful! Welcome, ${result.user.login || result.user.name}!`, null, 'success');
                handleFetchRepositories(result.token);
              }
            })
            .catch((error) => {
              console.error('Callback handling error:', error);
              addLog(`❌ Callback error: ${error.message}`, null, 'error');
              setAuthStep('not-authenticated');
            });
        }
      };

      window.cyberGuard.onProtocolUrl(handleCallback);
      
      // Cleanup
      return () => {
        if (window.cyberGuard && window.cyberGuard.offProtocolUrl) {
          window.cyberGuard.offProtocolUrl(handleCallback);
        }
      };
    }
  }, []);

  // Fetch GitHub repositories using the API service
  const handleFetchRepositories = async (token = null) => {
    try {
      const githubToken = token || githubApi.getGitHubToken() || accessToken;
      if (!githubToken) {
        throw new Error('No access token available. Please authenticate first.');
      }

      setAuthStep('selecting-repos');
      addLog('📦 Fetching repositories...', null, 'info');
      
      // Get user info first
      try {
        const userInfo = await githubApi.getUserInfo(githubToken);
        if (userInfo.data) {
          setUser(userInfo.data);
        } else if (userInfo) {
          setUser(userInfo);
        }
        addLog(`✅ Authenticated as ${userInfo.data?.login || userInfo.login || 'user'}`, null, 'success');
      } catch (error) {
        console.warn('Failed to get user info:', error);
      }

      // Get organizations
      let allRepos = [];
      try {
        const orgsResponse = await githubApi.getOrganizations(githubToken);
        const orgs = orgsResponse.data || orgsResponse;
        
        if (Array.isArray(orgs) && orgs.length > 0) {
          addLog(`📂 Found ${orgs.length} organization(s)`, null, 'info');
          
          // Get repositories from each organization
          for (const org of orgs) {
            try {
              addLog(`📦 Fetching repositories from ${org.login}...`, null, 'info');
              const reposResponse = await githubApi.getOrganizationRepos(org.login, githubToken);
              const repos = reposResponse.data || reposResponse;
              
              if (Array.isArray(repos)) {
                allRepos = [...allRepos, ...repos];
                addLog(`✅ Found ${repos.length} repositories in ${org.login}`, null, 'success');
              }
            } catch (error) {
              console.warn(`Failed to fetch repos from ${org.login}:`, error);
              addLog(`⚠️ Failed to fetch repos from ${org.login}: ${error.message}`, null, 'warning');
            }
          }
        }
      } catch (error) {
        console.warn('Failed to get organizations:', error);
        addLog(`⚠️ Could not fetch organizations: ${error.message}`, null, 'warning');
      }

      // If no repos found from orgs, try to get user's own repos
      if (allRepos.length === 0) {
        try {
          addLog('📦 Fetching user repositories...', null, 'info');
          // Note: You may need to add a getUserRepos method to githubApi
          // For now, we'll use the organizations endpoint or handle it differently
        } catch (error) {
          console.warn('Failed to get user repos:', error);
        }
      }

      // Format repositories for display
      const formattedRepos = allRepos.map(repo => ({
        id: repo.id || Math.random(),
        name: repo.name,
        fullName: repo.fullName || repo.full_name || `${repo.owner?.login || 'user'}/${repo.name}`,
        description: repo.description || '',
        private: repo.private || false,
        language: repo.language || '',
        stars: repo.stars || repo.stargazers_count || 0,
        forks: repo.forks || repo.forks_count || 0,
        updatedAt: repo.updatedAt || repo.updated_at || new Date().toISOString(),
        owner: repo.owner?.login || repo.owner || 'user',
        defaultBranch: repo.defaultBranch || repo.default_branch || 'main'
      }));

      setRepositories(formattedRepos);
      addLog(`✅ Found ${formattedRepos.length} total repositories`, null, 'success');
      
      if (formattedRepos.length === 0) {
        addLog('ℹ️ No repositories found. Make sure you have access to at least one repository.', null, 'info');
      }
    } catch (error) {
      console.error('Repository fetch error:', error);
      addLog(`❌ Repository fetch error: ${error.message}`, null, 'error');
      alert(`❌ Failed to fetch repositories: ${error.message}`);
    }
  };

  // Handle repository selection
  const handleToggleRepo = (repo) => {
    setSelectedRepos(prev => {
      if (prev.find(r => r.id === repo.id)) {
        return prev.filter(r => r.id !== repo.id);
      } else {
        return [...prev, repo];
      }
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedRepos([]);
      setSelectAll(false);
    } else {
      setSelectedRepos([...repositories]);
      setSelectAll(true);
    }
  };

  // Start scanning selected repositories using API service
  const handleStartScan = async () => {
    if (selectedRepos.length === 0) {
      alert('Please select at least one repository to scan');
      return;
    }

    try {
      setIsScanning(true);
      setProgress(0);
      setProgressMessage('Initializing scan...');
      setScanResults(null);
      setConsoleLogs([]);
      setAuthStep('scanning');
      
      addLog(`🚀 Starting scan for ${selectedRepos.length} repository/repositories...`, null, 'info');
      
      const results = [];
      let completedScans = 0;
      const token = accessToken || githubApi.getGitHubToken();
      
      // Scan each selected repository
      for (let i = 0; i < selectedRepos.length; i++) {
        const repo = selectedRepos[i];
        const [owner, repoName] = repo.fullName.split('/');
        
        try {
          const progressPercent = Math.round((i / selectedRepos.length) * 100);
          setProgress(progressPercent);
          setProgressMessage(`Scanning ${repo.fullName} (${i + 1}/${selectedRepos.length})...`);
          addLog(`🔍 Scanning ${repo.fullName}...`, null, 'info');
          addLog(`📡 Discovering API endpoints...`, null, 'info');
          
          // Use githubScanIntegration to scan the repository (includes API endpoint scanning)
          const scanResult = await githubScanIntegration.scanRepository(owner, repoName, {
            scanTypes: ['code', 'dependencies', 'secrets', 'api-endpoints'], // OWASP ZAP, sqlmap, Nikto, w3af, API endpoints
            branch: repo.defaultBranch || 'main',
            includeCode: true,
            includeDependencies: true,
            includeSecrets: true,
            includeAPIEndpoints: true, // Include API endpoint scanning
            options: {
              tools: ['zap', 'sqlmap', 'nikto', 'w3af'], // Specify tools
              apiScanTypes: ['discovery', 'mismatch', 'exposed'] // API endpoint scan types
            }
          });
          
          completedScans++;
          results.push({
            repository: repo.fullName,
            success: true,
            scanResults: scanResult.scan || scanResult,
            apiEndpoints: scanResult.apiEndpoints, // Include API endpoint results
            aiAnalysis: scanResult.aiAnalysis
          });
          
          addLog(`✅ Completed scan for ${repo.fullName}`, null, 'success');
          if (scanResult.apiEndpoints) {
            const epCount = scanResult.apiEndpoints.discovered?.endpoints?.length || 0;
            const mismatchCount = scanResult.apiEndpoints.mismatches?.length || 0;
            const exposedCount = scanResult.apiEndpoints.exposed?.endpoints?.length || 0;
            addLog(`📊 API Endpoints: ${epCount} discovered, ${mismatchCount} mismatches, ${exposedCount} exposed`, null, 'info');
          }
          setProgress(Math.round((completedScans / selectedRepos.length) * 100));
          
        } catch (error) {
          console.error(`Failed to scan ${repo.fullName}:`, error);
          addLog(`❌ Failed to scan ${repo.fullName}: ${error.message}`, null, 'error');
          results.push({
            repository: repo.fullName,
            success: false,
            error: error.message
          });
        }
      }
      
      // Set final results
      setScanResults({
        repositories: results,
        totalScanned: selectedRepos.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
      
      setIsScanning(false);
      setProgress(100);
      setProgressMessage('Scan completed!');
      setAuthStep('selecting-repos');
      addLog(`✅ All scans completed! ${results.filter(r => r.success).length}/${selectedRepos.length} successful`, null, 'success');
      
    } catch (error) {
      console.error('Scan error:', error);
      addLog(`❌ Scan error: ${error.message}`, null, 'error');
      setIsScanning(false);
      setProgress(0);
      setProgressMessage('');
      setAuthStep('selecting-repos');
      alert(`❌ Scan failed: ${error.message || 'Unknown error'}`);
    }
  };

  // Logout
  const handleLogout = () => {
    // Clear GitHub token
    githubApi.logout();
    
    setAccessToken(null);
    setUser(null);
    setRepositories([]);
    setSelectedRepos([]);
    setSelectAll(false);
    setScanResults(null);
    setAuthStep('not-authenticated');
    setConsoleLogs([]);
    addLog('👋 Logged out from GitHub', null, 'info');
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white">
        <h1 className="text-3xl font-bold mb-2">GitHub Repository API Scanner</h1>
          </div>

      {/* Authentication Section */}
      {authStep === 'not-authenticated' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold mb-4">GitHub Authentication</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Authenticate with GitHub using OAuth Device Flow to access your repositories.
          </p>
          <button
            onClick={handleInitiateAuth}
            className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-medium flex items-center space-x-2 transition-all"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
            </svg>
            <span>Authenticate with GitHub</span>
          </button>
        </div>
      )}

      {/* Authenticating Section */}
      {authStep === 'authenticating' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <h2 className="text-xl font-semibold mb-4">GitHub Authentication</h2>
          <div className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                GitHub OAuth in progress...
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                A browser window should open automatically. If not, check your browser for the GitHub authorization page.
              </p>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Waiting for authorization...</span>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                💡 Make sure you authorize the application in the browser window that opens. The app will automatically detect when authorization is complete.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Repository Selection Section */}
      {authStep === 'selecting-repos' && user && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">Select Repositories to Scan</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Logged in as <strong>{user.login}</strong> ({repositories.length} repositories)
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm"
            >
              Logout
            </button>
          </div>
          
          <div className="mb-4">
            <button
              onClick={handleSelectAll}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 rounded text-sm"
            >
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
            <span className="ml-4 text-sm text-gray-600 dark:text-gray-400">
              {selectedRepos.length} of {repositories.length} selected
            </span>
          </div>

          <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-slate-600 rounded-lg">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                className={`p-4 border-b border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer ${
                  selectedRepos.find(r => r.id === repo.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => handleToggleRepo(repo)}
              >
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    checked={!!selectedRepos.find(r => r.id === repo.id)}
                    onChange={() => handleToggleRepo(repo)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{repo.fullName}</h3>
                      {repo.private && (
                        <span className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                          Private
                        </span>
                      )}
                      {repo.language && (
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs">
                          {repo.language}
                        </span>
                      )}
                    </div>
                    {repo.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{repo.description}</p>
                    )}
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>⭐ {repo.stars}</span>
                      <span>🍴 {repo.forks}</span>
                      <span>Updated: {new Date(repo.updatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={handleStartScan}
              disabled={selectedRepos.length === 0 || isScanning}
              className={`px-6 py-3 rounded-lg font-medium flex items-center space-x-2 transition-all ${
                selectedRepos.length === 0 || isScanning
                  ? 'bg-gray-400 cursor-not-allowed text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Start Scan ({selectedRepos.length} repositories)</span>
            </button>
          </div>
        </div>
      )}

      {/* Live Console Viewer */}
      <div className="bg-gray-900 dark:bg-black rounded-xl border border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Live Console Output
          </h4>
          <div className="flex gap-2">
            <button
              onClick={() => setConsoleLogs([])}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Clear Console
            </button>
            <button
              onClick={() => setShowConsole(!showConsole)}
              className="text-xs px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              {showConsole ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        
        {showConsole && (
          <div className="bg-black rounded-lg border border-gray-800 p-4 max-h-96 overflow-y-auto font-mono">
            <div className="space-y-1">
              {consoleLogs.length === 0 ? (
                <div className="text-gray-500 text-sm">No console output yet. Start authentication to see logs...</div>
              ) : (
                consoleLogs.map((log, index) => (
                  <div key={index} className="text-xs">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-500 text-[10px] flex-shrink-0 font-mono">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      <div className="flex-1 min-w-0">
                        {log.type === 'command' || log.command ? (
                          <div>
                            <div className="text-yellow-400 mb-1 font-semibold">📝 {log.tool || 'Command'}:</div>
                            <code className="text-green-400 block whitespace-pre-wrap break-all bg-gray-900 dark:bg-black p-2 rounded mb-2 border border-gray-800">
                              {log.command}
                            </code>
                            {log.output && (
                              <div className="text-gray-300 bg-gray-900 p-2 rounded mb-2 border border-gray-800 whitespace-pre-wrap break-all">
                                {log.output}
                              </div>
                            )}
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(log.command || '');
                                alert('Command copied to clipboard!');
                              }}
                              className="text-[10px] text-orange-400 hover:text-orange-300 mb-2"
                            >
                              Copy Command
                            </button>
                          </div>
                        ) : (
                          <div className={`${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            log.type === 'success' ? 'text-green-400' :
                            'text-gray-300'
                          }`}>
                            {log.message}
                          </div>
                        )}
                      </div>
                    </div>
                    {index < consoleLogs.length - 1 && (
                      <div className="border-b border-gray-800 my-1"></div>
                    )}
                  </div>
                ))
              )}
              <div ref={consoleEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Progress Section */}
      {isScanning && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-orange-100 dark:bg-orange-800 rounded-lg">
              <svg className="w-6 h-6 text-orange-600 dark:text-orange-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100">Scanning in Progress</h3>
              <p className="text-sm text-orange-700 dark:text-orange-300 whitespace-pre-wrap">{progressMessage}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">Scan Progress</span>
              <div className="flex items-center space-x-2">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{progress}%</div>
                <span className="text-xs text-orange-600 dark:text-orange-400">Complete</span>
              </div>
            </div>
            <div className="w-full bg-orange-200 dark:bg-orange-800 rounded-full h-4 relative overflow-hidden">
              <div
                className="bg-gradient-to-r from-orange-500 to-orange-600 h-4 rounded-full transition-all duration-500 ease-out relative"
                style={{ width: `${progress}%` }}
              >
                <div className="absolute inset-0 bg-white opacity-20 animate-pulse"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-semibold text-orange-900 dark:text-orange-100">{progress}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Section */}
      {scanResults && scanResults.repositories && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Scan Results</h2>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Scanned {scanResults.totalScanned} repositories
            </div>
          </div>

          {scanResults.repositories.map((repoResult, index) => (
            <div key={index} className="mb-6 border-b border-gray-200 dark:border-slate-600 pb-6 last:border-b-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                {repoResult.repository}
              </h3>
              
              {repoResult.scanResults && repoResult.scanResults.summary && (
                <div className="grid md:grid-cols-5 gap-4 mb-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {repoResult.scanResults.summary.critical || 0}
                    </div>
                    <div className="text-sm text-red-800 dark:text-red-200">Critical</div>
                  </div>
                  <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {repoResult.scanResults.summary.high || 0}
                    </div>
                    <div className="text-sm text-orange-800 dark:text-orange-200">High</div>
                  </div>
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {repoResult.scanResults.summary.medium || 0}
                    </div>
                    <div className="text-sm text-yellow-800 dark:text-yellow-200">Medium</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {repoResult.scanResults.summary.low || 0}
                    </div>
                    <div className="text-sm text-green-800 dark:text-green-200">Low</div>
                  </div>
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {repoResult.scanResults.summary.total_vulnerabilities || 0}
                    </div>
                    <div className="text-sm text-blue-800 dark:text-blue-200">Total</div>
                  </div>
                </div>
              )}

              {/* API Endpoint Results */}
              {repoResult.apiEndpoints && (
                <div className="space-y-4 mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    API Endpoint Scan Results
                  </h4>

                  {/* Discovered Endpoints */}
                  {repoResult.apiEndpoints.discovered && repoResult.apiEndpoints.discovered.endpoints && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-semibold text-blue-900 dark:text-blue-100">
                          Discovered API Endpoints ({repoResult.apiEndpoints.discovered.endpoints.length})
                        </h5>
                        <span className="px-2 py-1 bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200 rounded text-xs font-medium">
                          Discovery
                        </span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {repoResult.apiEndpoints.discovered.endpoints.slice(0, 20).map((endpoint, epIndex) => (
                          <div key={epIndex} className="p-2 bg-white dark:bg-slate-800 rounded border border-blue-200 dark:border-blue-700">
                            <div className="flex items-center justify-between">
                              <code className="text-sm font-mono text-blue-900 dark:text-blue-100">
                                {endpoint.method || 'GET'} {endpoint.path || endpoint.url || endpoint.endpoint}
                              </code>
                              {endpoint.status && (
                                <span className={`px-2 py-1 rounded text-xs ${
                                  endpoint.status >= 200 && endpoint.status < 300 ? 'bg-green-100 text-green-800' :
                                  endpoint.status >= 400 ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {endpoint.status}
                                </span>
                              )}
                            </div>
                            {endpoint.description && (
                              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{endpoint.description}</p>
                            )}
                            {endpoint.parameters && endpoint.parameters.length > 0 && (
                              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Parameters: {endpoint.parameters.map(p => p.name).join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                        {repoResult.apiEndpoints.discovered.endpoints.length > 20 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            ... and {repoResult.apiEndpoints.discovered.endpoints.length - 20} more endpoints
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* API Mismatches */}
                  {repoResult.apiEndpoints.mismatches && repoResult.apiEndpoints.mismatches.length > 0 && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-semibold text-yellow-900 dark:text-yellow-100">
                          API Mismatches Found ({repoResult.apiEndpoints.mismatches.length})
                        </h5>
                        <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded text-xs font-medium">
                          Mismatch
                        </span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {repoResult.apiEndpoints.mismatches.map((mismatch, mmIndex) => (
                          <div key={mmIndex} className="p-3 bg-white dark:bg-slate-800 rounded border-l-4 border-yellow-500">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-yellow-900 dark:text-yellow-100">
                                {mismatch.type || 'Version Mismatch'}
                              </span>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                mismatch.severity === 'high' ? 'bg-red-100 text-red-800' :
                                mismatch.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {mismatch.severity || 'medium'}
                              </span>
                            </div>
                            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-1">
                              {mismatch.endpoint || mismatch.path || 'Unknown endpoint'}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {mismatch.description || mismatch.message || 'Mismatch detected between code and documentation'}
                            </p>
                            {mismatch.expected && mismatch.actual && (
                              <div className="mt-2 text-xs">
                                <span className="text-green-600 dark:text-green-400">Expected: {mismatch.expected}</span>
                                <span className="mx-2">→</span>
                                <span className="text-red-600 dark:text-red-400">Actual: {mismatch.actual}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Exposed/Open Endpoints */}
                  {repoResult.apiEndpoints.exposed && repoResult.apiEndpoints.exposed.endpoints && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-semibold text-red-900 dark:text-red-100">
                          Exposed/Open API Endpoints ({repoResult.apiEndpoints.exposed.endpoints.length})
                        </h5>
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 rounded text-xs font-medium">
                          Exposed
                        </span>
                      </div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {repoResult.apiEndpoints.exposed.endpoints.map((endpoint, expIndex) => (
                          <div key={expIndex} className="p-3 bg-white dark:bg-slate-800 rounded border-l-4 border-red-500">
                            <div className="flex items-center justify-between mb-1">
                              <code className="text-sm font-mono text-red-900 dark:text-red-100">
                                {endpoint.method || 'GET'} {endpoint.path || endpoint.url || endpoint.endpoint}
                              </code>
                              <span className="px-2 py-1 bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-200 rounded text-xs font-medium">
                                {endpoint.risk || 'High Risk'}
                              </span>
                            </div>
                            <div className="mt-2 space-y-1">
                              {endpoint.issues && endpoint.issues.map((issue, issueIndex) => (
                                <div key={issueIndex} className="flex items-start gap-2 text-xs">
                                  <span className="text-red-600 dark:text-red-400">⚠️</span>
                                  <span className="text-gray-700 dark:text-gray-300">
                                    {issue.type || issue}: {issue.description || issue.message || 'Security issue detected'}
                                  </span>
                                </div>
                              ))}
                              {!endpoint.issues && (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                  No authentication required • No rate limiting • CORS misconfigured
                                </p>
                              )}
                            </div>
                            {endpoint.recommendation && (
                              <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-xs text-yellow-800 dark:text-yellow-200">
                                💡 Recommendation: {endpoint.recommendation}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* API Endpoint Summary */}
                  {repoResult.apiEndpoints.summary && (
                    <div className="grid md:grid-cols-4 gap-3 mt-4">
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                          {repoResult.apiEndpoints.summary.totalEndpoints || repoResult.apiEndpoints.discovered?.endpoints?.length || 0}
                        </div>
                        <div className="text-xs text-blue-800 dark:text-blue-200">Total Endpoints</div>
                      </div>
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                          {repoResult.apiEndpoints.summary.mismatches || repoResult.apiEndpoints.mismatches?.length || 0}
                        </div>
                        <div className="text-xs text-yellow-800 dark:text-yellow-200">Mismatches</div>
                      </div>
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <div className="text-xl font-bold text-red-600 dark:text-red-400">
                          {repoResult.apiEndpoints.summary.exposed || repoResult.apiEndpoints.exposed?.endpoints?.length || 0}
                        </div>
                        <div className="text-xs text-red-800 dark:text-red-200">Exposed</div>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <div className="text-xl font-bold text-green-600 dark:text-green-400">
                          {repoResult.apiEndpoints.summary.secure || 0}
                        </div>
                        <div className="text-xs text-green-800 dark:text-green-200">Secure</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {repoResult.scanResults && repoResult.scanResults.allVulnerabilities && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">Vulnerabilities Found:</h4>
                  {repoResult.scanResults.allVulnerabilities.slice(0, 10).map((vuln, vulnIndex) => (
                    <div key={vulnIndex} className="p-3 bg-gray-50 dark:bg-slate-700 rounded-lg border-l-4 border-red-500">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{vuln.tool}</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          vuln.severity === 'critical' || vuln.severity === 'high' ? 'bg-red-100 text-red-800' :
                          vuln.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {vuln.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{vuln.finding}</p>
                    </div>
                  ))}
                  {repoResult.scanResults.allVulnerabilities.length > 10 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      ... and {repoResult.scanResults.allVulnerabilities.length - 10} more vulnerabilities
                    </p>
                  )}
                </div>
              )}

              {repoResult.error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-800 dark:text-red-200">Error: {repoResult.error}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default APIScanner;
