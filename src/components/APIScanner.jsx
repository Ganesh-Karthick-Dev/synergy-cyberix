import React, { useState, useEffect, useRef } from 'react';
import { githubApi, githubHelpers, githubScanIntegration } from '../services';
import { authApi } from '../services/authApi';
import { apiHelpers } from '../services/api';
import { getSecurePassword } from '../utils/securePasswordStorage';

function APIScanner({ onNavigate }) {
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

  // Initiate GitHub OAuth using the backend API
  const handleInitiateAuth = async () => {
    try {
      setAuthStep('authenticating');
      addLog('🔐 Initiating GitHub OAuth login...', null, 'info');
      
      // Use backend API for GitHub OAuth login
      // This will redirect to GitHub OAuth page
      // Include view parameter to return to API Scanner after login
      // For Electron apps, use current window location
      const isElectron = window.cyberGuard !== undefined;
      const redirectUrl = isElectron 
        ? `${window.location.origin}/?view=api-scan`
        : '/?view=api-scan';
      
      await authApi.loginWithGitHub({
        redirect: redirectUrl // Return to API Scanner page after login
      });
      
      // Note: The redirect will happen, so code below won't execute
      // The callback will be handled by the backend and user will be redirected back
    } catch (error) {
      console.error('Auth initiation error:', error);
      addLog(`❌ Authentication error: ${error.message}`, null, 'error');
      setAuthStep('not-authenticated');
      alert(`❌ Authentication failed: ${error.message}`);
    }
  };

  // Check authentication function - can be called from multiple places
  const checkAuth = async () => {
    try {
      // Check if user is authenticated via backend (cookies)
      // This will work even after app restart if cookies are still valid
      const profile = await authApi.checkGitHubAuth();
      
      if (profile && profile.data) {
        // User is authenticated - session persisted!
        setUser(profile.data);
        setAuthStep('authenticated');
        addLog(`✅ Session restored! Welcome back, ${profile.data.email || profile.data.username}`, null, 'success');
        
        // Check if user has GitHub access token
        if (profile.data.githubAccessToken) {
          // Store token locally for future use (if needed for direct GitHub API calls)
          githubApi.setGitHubToken(profile.data.githubAccessToken, true);
          setAccessToken(profile.data.githubAccessToken);
          
          // Automatically fetch and display repositories using backend API
          addLog('📦 Loading your repositories...', null, 'info');
          await handleFetchRepositories();
        } else {
          // User is logged in but doesn't have GitHub API token yet
          // They need to authenticate for GitHub API access
          setAuthStep('not-authenticated');
          addLog('ℹ️ Please authenticate with GitHub to access repositories', null, 'info');
        }
      } else {
        // User is not authenticated - show login button
        setAuthStep('not-authenticated');
        addLog('ℹ️ Please sign in with GitHub to scan repositories', null, 'info');
      }
    } catch (error) {
      // Handle errors gracefully - don't redirect, just show login screen
      console.log('Not authenticated or error checking auth:', error);
      setAuthStep('not-authenticated');
      addLog('ℹ️ Please sign in with GitHub to scan repositories', null, 'info');
    }
  };

  // Check for OAuth callback with token in URL (silent OAuth)
  useEffect(() => {
    // Check URL parameters for token-based OAuth (silent redirect)
    const oauthUrlParams = new URLSearchParams(window.location.search);
    const token = oauthUrlParams.get('token');
    const autoAuth = oauthUrlParams.get('autoAuth');
    const githubToken = oauthUrlParams.get('githubToken');
    
    if (token && autoAuth === 'true') {
      console.log('🔐 [Silent OAuth] Token detected in URL, processing auto-login...');
      addLog('🔐 Processing silent OAuth login...', null, 'info');
      
      // Store token in localStorage for API requests (CRITICAL: Must be done first)
      apiHelpers.setAuthToken(token);
      console.log('🔐 [Silent OAuth] Token stored in localStorage');
      
      // Verify token was stored
      const storedToken = localStorage.getItem('auth_token');
      if (storedToken) {
        console.log('✅ [Silent OAuth] Token verified in localStorage:', {
          length: storedToken.length,
          preview: storedToken.substring(0, 20) + '...',
          matches: storedToken === token
        });
      } else {
        console.error('❌ [Silent OAuth] Token NOT found in localStorage after storage!');
      }
      
      // Store GitHub token if provided (for GitHub API calls)
      if (githubToken) {
        githubApi.setGitHubToken(githubToken, true);
        setAccessToken(githubToken);
        console.log('🔐 [Silent OAuth] GitHub token stored');
      } else {
        setAccessToken(token);
      }
      
      // Clear URL parameters to avoid re-processing
      const newUrl = window.location.pathname + (window.location.search.replace(/[?&]token=[^&]*|[?&]autoAuth=[^&]*|[?&]githubToken=[^&]*/g, '').replace(/^&/, '?').replace(/&$/, '') || '');
      window.history.replaceState({}, '', newUrl);
      
      // Set auth step to authenticated immediately
      setAuthStep('authenticated');
      
      // Fetch user profile and repositories (with token in Authorization header)
      setTimeout(async () => {
        try {
          // First, try to get user profile with token
          addLog('📥 Fetching user profile...', null, 'info');
          const profile = await authApi.checkGitHubAuth();
          
          if (profile && profile.data) {
            setUser(profile.data);
            addLog(`✅ Silent login successful! Welcome, ${profile.data.email || profile.data.username}!`, null, 'success');
            
            // Check if user has GitHub access token
            if (profile.data.githubAccessToken) {
              githubApi.setGitHubToken(profile.data.githubAccessToken, true);
              setAccessToken(profile.data.githubAccessToken);
            }
          } else {
            // Profile fetch failed, but we have token - continue anyway
            addLog('⚠️ Profile fetch failed, but continuing with token...', null, 'warning');
            // Set a minimal user object
            setUser({ id: 'unknown', email: 'user', username: 'user' });
          }
          
          // Automatically fetch and display repositories (token should be in Authorization header)
          // Verify token is still available before making request
          const tokenBeforeRequest = localStorage.getItem('auth_token');
          if (!tokenBeforeRequest) {
            console.error('❌ [Silent OAuth] Token missing before repository fetch! Re-storing...');
            apiHelpers.setAuthToken(token); // Re-store token
          } else {
            console.log('✅ [Silent OAuth] Token verified before repository fetch:', {
              length: tokenBeforeRequest.length,
              preview: tokenBeforeRequest.substring(0, 20) + '...'
            });
          }
          
          addLog('📦 Loading your repositories...', null, 'info');
          
          // Ensure token is available before calling handleFetchRepositories
          // Pass token directly if localStorage check fails
          const finalToken = localStorage.getItem('auth_token') || token;
          if (finalToken) {
            // Ensure token is stored
            if (!localStorage.getItem('auth_token')) {
              apiHelpers.setAuthToken(finalToken);
              console.log('🔐 [Silent OAuth] Re-stored token before repository fetch');
            }
            await handleFetchRepositories();
          } else {
            console.error('❌ [Silent OAuth] No token available for repository fetch!');
            addLog('❌ No authentication token available. Please try logging in again.', null, 'error');
          }
          
        } catch (error) {
          console.error('Failed to fetch profile/repositories after silent login:', error);
          addLog(`❌ Error: ${error.message || 'Failed to load repositories'}`, null, 'error');
          
          // Show helpful error message
          if (error.response?.status === 401) {
            addLog('⚠️ Authentication failed. Token might be invalid. Please try logging in again.', null, 'warning');
            setAuthStep('not-authenticated');
          } else {
            addLog('⚠️ Could not fetch repositories. Please try again.', null, 'warning');
          }
        }
      }, 200); // Small delay to ensure token is stored
      
      return; // Don't process other OAuth methods if silent OAuth succeeded
    }
    
    // Aggressive JSON clearing that runs continuously (fallback for old method)
    const clearVisibleJson = () => {
      try {
        // Check body text
        const bodyText = document.body?.innerText || document.body?.textContent || '';
        const root = document.getElementById('root');
        const rootText = root?.innerText || root?.textContent || '';
        
        // Check if we see JSON
        const hasJson = (bodyText.trim().startsWith('{') && bodyText.includes('"success"')) ||
                        (rootText.trim().startsWith('{') && rootText.includes('"success"'));
        
        if (hasJson) {
          // Check if React has rendered
          const rootHasContent = root && root.children.length > 0;
          
          if (!rootHasContent) {
            // No React content, this is raw JSON
            const jsonText = bodyText.trim().startsWith('{') ? bodyText.trim() : rootText.trim();
            try {
              const jsonData = JSON.parse(jsonText);
              if (jsonData.success && jsonData.data) {
                console.log('📥 [APIScanner] Found raw JSON, storing and clearing...');
                sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
                document.body.innerHTML = '<div id="root"></div>';
                // Reload to let React mount properly
                window.location.reload();
                return true;
              }
            } catch (e) {
              // Not valid JSON, just clear it
              document.body.innerHTML = '<div id="root"></div>';
            }
          } else {
            // React has rendered, but JSON might be in text nodes
            // Find and remove any text nodes containing JSON
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
              null,
              false
            );
            
            let node;
            let foundJson = false;
            while (node = walker.nextNode()) {
              const text = node.textContent || '';
              if (text.trim().startsWith('{') && text.includes('"success"') && text.length < 10000) {
                try {
                  const jsonData = JSON.parse(text.trim());
                  if (jsonData.success && jsonData.data) {
                    console.log('📥 [APIScanner] Found JSON in text node, storing and removing...');
                    sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
                    foundJson = true;
                  }
                } catch (e) {
                  // Not valid JSON
                }
                // Remove the text node
                if (node.parentNode) {
                  node.parentNode.removeChild(node);
                }
              }
            }
            
            if (foundJson) {
              // Reload to process the stored data
              window.location.reload();
              return true;
            }
          }
        }
      } catch (error) {
        console.error('Error clearing visible JSON:', error);
      }
      return false;
    };
    
    // Run immediately and multiple times
    if (clearVisibleJson()) return;
    setTimeout(() => { if (clearVisibleJson()) return; }, 100);
    setTimeout(() => { if (clearVisibleJson()) return; }, 300);
    setTimeout(() => { if (clearVisibleJson()) return; }, 500);
    
    // Set up interval to continuously check
    const intervalId = setInterval(() => {
      if (clearVisibleJson()) {
        clearInterval(intervalId);
      }
    }, 200);
    
    // Stop after 5 seconds
    setTimeout(() => clearInterval(intervalId), 5000);
    
    // Also try to extract JSON from page if not in sessionStorage
    const tryExtractJsonFromPage = () => {
      try {
        const bodyText = document.body?.innerText || document.body?.textContent || '';
        const root = document.getElementById('root');
        const rootText = root?.innerText || root?.textContent || '';
        
        const hasJson = (bodyText.trim().startsWith('{') && bodyText.includes('"success"')) ||
                        (rootText.trim().startsWith('{') && rootText.includes('"success"'));
        
        if (hasJson) {
          const jsonText = bodyText.trim().startsWith('{') ? bodyText.trim() : rootText.trim();
          try {
            const jsonData = JSON.parse(jsonText);
            if (jsonData.success && jsonData.data) {
              console.log('📥 [APIScanner] Extracted JSON from page, storing...');
              sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
              // Clear the visible JSON
              if (root && root.children.length === 0) {
                document.body.innerHTML = '<div id="root"></div>';
              }
              return true;
            }
          } catch (e) {
            // Not valid JSON
          }
        }
      } catch (error) {
        console.error('Error extracting JSON from page:', error);
      }
      return false;
    };
    
    // Try to extract JSON from page first
    tryExtractJsonFromPage();
    
    // Check if OAuth callback data was stored in sessionStorage (by main.jsx or extracted above)
    const oauthDataStr = sessionStorage.getItem('oauth_callback_data');
    
    if (oauthDataStr) {
      try {
        const jsonData = JSON.parse(oauthDataStr);
        if (jsonData.success && jsonData.data) {
          console.log('📥 [OAuth Callback] Processing stored OAuth response:', jsonData);
          addLog('📥 Processing OAuth callback...', null, 'info');
          
          // Clear the stored data (only process once)
          sessionStorage.removeItem('oauth_callback_data');
          
          // Handle the OAuth callback response
          if (jsonData.data.user) {
            setUser(jsonData.data.user);
            setAuthStep('authenticated');
            addLog(`✅ Authentication successful! Welcome, ${jsonData.data.user.email || jsonData.data.user.username}!`, null, 'success');
            
            // Store token if provided
            if (jsonData.data.token) {
              // Token is stored in cookies by backend, but we can store it locally too
              githubApi.setGitHubToken(jsonData.data.token, true);
            }
            
            // Check if user has GitHub access token
            if (jsonData.data.user.githubAccessToken) {
              githubApi.setGitHubToken(jsonData.data.user.githubAccessToken, true);
              setAccessToken(jsonData.data.user.githubAccessToken);
              
              // Automatically fetch and display repositories
              addLog('📦 Fetching repositories automatically...', null, 'info');
              // Use setTimeout to ensure state is updated before fetching
              setTimeout(() => {
                handleFetchRepositories();
              }, 200);
            } else {
              // Wait a bit and check profile for GitHub token
              setTimeout(async () => {
                try {
                  const profile = await authApi.checkGitHubAuth();
                  if (profile?.data?.githubAccessToken) {
                    githubApi.setGitHubToken(profile.data.githubAccessToken, true);
                    setAccessToken(profile.data.githubAccessToken);
                    await handleFetchRepositories();
                  } else {
                    addLog('⚠️ GitHub access token not found. Please authenticate again.', null, 'warning');
                    setAuthStep('not-authenticated');
                  }
                } catch (error) {
                  console.error('Failed to get GitHub token from profile:', error);
                  addLog('⚠️ Failed to get GitHub token. Please authenticate again.', null, 'warning');
                  setAuthStep('not-authenticated');
                }
              }, 1000);
            }
          }
        }
      } catch (error) {
        console.error('Failed to parse stored OAuth data:', error);
        sessionStorage.removeItem('oauth_callback_data');
      }
      return; // Don't check for URL params if we already handled stored data
    }
    
    // Also check URL parameters for web-based OAuth redirects
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('github_auth') === 'success' || window.location.hash.includes('github_auth=success')) {
      // Small delay to ensure cookies are set
      setTimeout(() => {
        checkAuth();
      }, 500);
    }
  }, []);

  // Check GitHub authentication status after page load - runs on every mount
  useEffect(() => {
    // Check authentication on component mount (this runs every time the component loads)
    // If cookies are valid, user will be automatically logged in
    // Only check if we haven't already handled OAuth callback data
    const oauthDataStr = sessionStorage.getItem('oauth_callback_data');
    if (!oauthDataStr) {
      checkAuth();
    }
  }, []);

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

  // Fetch GitHub repositories using the backend API
  const handleFetchRepositories = async (token = null) => {
    try {
      setAuthStep('selecting-repos');
      addLog('📦 Fetching repositories from GitHub...', null, 'info');
      
      // Use backend API to fetch repositories (uses stored GitHub access token)
      const reposResponse = await authApi.getGitHubRepositories();
      
      if (!reposResponse.success || !reposResponse.data) {
        throw new Error(reposResponse.error?.message || 'Failed to fetch repositories');
      }

      const allRepos = reposResponse.data || [];
      
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
        owner: repo.owner?.login || (typeof repo.owner === 'object' ? repo.owner.login : repo.owner) || 'user',
        defaultBranch: repo.defaultBranch || repo.default_branch || 'main'
      }));

      setRepositories(formattedRepos);
      addLog(`✅ Found ${formattedRepos.length} total repositories`, null, 'success');
      
      if (formattedRepos.length === 0) {
        addLog('ℹ️ No repositories found. Make sure you have access to at least one repository.', null, 'info');
      } else {
        addLog(`📋 Displaying ${formattedRepos.length} repositories`, null, 'info');
      }
    } catch (error) {
      console.error('Repository fetch error:', error);
      addLog(`❌ Repository fetch error: ${error.message || error.response?.data?.error?.message || 'Unknown error'}`, null, 'error');
      setAuthStep('authenticated');
      alert(`❌ Failed to fetch repositories: ${error.message || error.response?.data?.error?.message || 'Unknown error'}`);
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

  // Start scanning selected repositories using WSL Kali Linux tools
  const handleStartScan = async () => {
    if (selectedRepos.length === 0) {
      alert('Please select at least one repository to scan');
      return;
    }

    // Check if WSL password is available
    const password = getSecurePassword();
    if (!password) {
      alert('WSL password not found. Please set up WSL credentials first.');
      return;
    }

    // Check if Electron API is available
    if (!window.cyberGuard || !window.cyberGuard.runWslCommand) {
      alert('WSL commands not available. Please ensure the application is running in Electron.');
      return;
    }

    try {
      setIsScanning(true);
      setProgress(0);
      setProgressMessage('Initializing scan...');
      setScanResults(null);
      setConsoleLogs([]);
      setAuthStep('scanning');
      
      addLog(`🚀 Starting API scan for ${selectedRepos.length} repository/repositories...`, null, 'info');
      addLog(`📦 Cloning repositories to WSL Kali Linux...`, null, 'info');
      
      const results = [];
      const token = accessToken || githubApi.getGitHubToken();
      
      // Create scan directory in WSL
      const scanBaseDir = '/tmp/github-api-scans';
      const createDirCmd = `mkdir -p ${scanBaseDir}`;
      addLog(`📁 Creating scan directory...`, createDirCmd, 'command', 'WSL');
      
      try {
        await window.cyberGuard.runWslCommand(createDirCmd, password);
        addLog(`✅ Scan directory created`, null, 'success');
      } catch (error) {
        addLog(`⚠️ Directory creation warning: ${error.message}`, null, 'warning');
      }
      
      // Scan each selected repository
      for (let i = 0; i < selectedRepos.length; i++) {
        const repo = selectedRepos[i];
        const repoDir = `${scanBaseDir}/${repo.name}`;
        const repoUrl = `https://${token}@github.com/${repo.fullName}.git`;
        
        try {
          const progressPercent = Math.round((i / selectedRepos.length) * 100);
          setProgress(progressPercent);
          setProgressMessage(`Scanning ${repo.fullName} (${i + 1}/${selectedRepos.length})...`);
          
          addLog(`🔍 Processing ${repo.fullName}...`, null, 'info');
          
          // Step 1: Clone repository
          addLog(`📥 Cloning repository...`, null, 'info');
          const cloneCmd = `cd ${scanBaseDir} && rm -rf ${repo.name} && git clone ${repoUrl} ${repo.name} 2>&1`;
          addLog(`📥 Cloning ${repo.fullName}...`, cloneCmd, 'command', 'git');
          
          let cloneOutput = '';
          try {
            const cloneResult = await window.cyberGuard.runWslCommand(cloneCmd, password);
            cloneOutput = cloneResult.stdout || cloneResult.stderr || '';
            addLog(`✅ Repository cloned successfully`, cloneOutput, 'success', 'git');
          } catch (error) {
            addLog(`❌ Failed to clone repository: ${error.message}`, error.message, 'error', 'git');
            results.push({
              repository: repo.fullName,
              success: false,
              error: `Clone failed: ${error.message}`
            });
            continue;
          }
          
          // Step 2: Install required tools if not present
          addLog(`🔧 Checking required tools (nikto, w3af, sqlmap, zap)...`, null, 'info');
          const checkToolsCmd = `which nikto w3af sqlmap zap-cli 2>&1 || echo "Some tools missing"`;
          addLog(`🔧 Checking tools...`, checkToolsCmd, 'command', 'WSL');
          
          try {
            const toolsCheck = await window.cyberGuard.runWslCommand(checkToolsCmd, password);
            addLog(`📋 Tools status:`, toolsCheck.stdout || toolsCheck.stderr || '', 'info', 'WSL');
          } catch (error) {
            addLog(`⚠️ Tool check warning: ${error.message}`, null, 'warning');
          }
          
          // Step 3: Discover API endpoints in code
          addLog(`📡 Discovering API endpoints in code...`, null, 'info');
          const findApiEndpointsCmd = `cd ${repoDir} && find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.java" -o -name "*.php" -o -name "*.rb" -o -name "*.go" \\) -exec grep -lE "(api|endpoint|route|controller|/api/|/v[0-9]+/)" {} \\; 2>&1 | head -20`;
          addLog(`📡 Finding API-related files...`, findApiEndpointsCmd, 'command', 'grep');
          
          let apiFiles = [];
          try {
            const apiFilesResult = await window.cyberGuard.runWslCommand(findApiEndpointsCmd, password);
            const files = (apiFilesResult.stdout || '').trim().split('\n').filter(f => f);
            apiFiles = files;
            addLog(`📄 Found ${files.length} API-related files`, files.join('\n'), 'info', 'grep');
          } catch (error) {
            addLog(`⚠️ API file discovery warning: ${error.message}`, null, 'warning');
          }
          
          // Step 4: Extract API endpoints from files
          addLog(`🔍 Extracting API endpoints...`, null, 'info');
          const extractEndpointsCmd = `cd ${repoDir} && grep -rE "(app\\.(get|post|put|delete|patch)|router\\.(get|post|put|delete|patch)|@(GET|POST|PUT|DELETE|PATCH)|/api/|/v[0-9]+/)" --include="*.js" --include="*.ts" --include="*.py" --include="*.java" --include="*.php" . 2>&1 | head -50`;
          addLog(`🔍 Extracting endpoints...`, extractEndpointsCmd, 'command', 'grep');
          
          let endpoints = [];
          try {
            const endpointsResult = await window.cyberGuard.runWslCommand(extractEndpointsCmd, password);
            const endpointLines = (endpointsResult.stdout || '').trim().split('\n').filter(l => l);
            endpoints = endpointLines;
            addLog(`✅ Found ${endpointLines.length} potential API endpoints`, endpointLines.slice(0, 10).join('\n'), 'success', 'grep');
          } catch (error) {
            addLog(`⚠️ Endpoint extraction warning: ${error.message}`, null, 'warning');
          }
          
          // Step 5: Run nikto scan if there's a web server config
          addLog(`🛡️ Running security scans...`, null, 'info');
          const hasWebConfig = apiFiles.some(f => f.includes('server') || f.includes('app') || f.includes('index'));
          
          if (hasWebConfig) {
            // Try to find potential URLs or run nikto on localhost
            const niktoCmd = `cd ${repoDir} && nikto -h localhost -Format txt 2>&1 | head -30 || echo "Nikto scan completed (or not available)"`;
            addLog(`🛡️ Running Nikto scan...`, niktoCmd, 'command', 'nikto');
            
            try {
              const niktoResult = await window.cyberGuard.runWslCommand(niktoCmd, password);
              addLog(`📊 Nikto scan results:`, niktoResult.stdout || niktoResult.stderr || '', 'info', 'nikto');
            } catch (error) {
              addLog(`⚠️ Nikto scan warning: ${error.message}`, null, 'warning');
            }
          }
          
          // Step 6: Look for SQL injection vulnerabilities
          addLog(`💉 Checking for SQL injection vulnerabilities...`, null, 'info');
          const sqlCheckCmd = `cd ${repoDir} && grep -rE "(SELECT|INSERT|UPDATE|DELETE|query|executeQuery|prepareStatement)" --include="*.js" --include="*.ts" --include="*.py" --include="*.java" --include="*.php" . 2>&1 | head -20`;
          addLog(`💉 Checking SQL queries...`, sqlCheckCmd, 'command', 'grep');
          
          let sqlVulns = [];
          try {
            const sqlResult = await window.cyberGuard.runWslCommand(sqlCheckCmd, password);
            const sqlLines = (sqlResult.stdout || '').trim().split('\n').filter(l => l);
            sqlVulns = sqlLines;
            addLog(`📊 Found ${sqlLines.length} SQL-related code sections`, sqlLines.slice(0, 5).join('\n'), 'info', 'grep');
          } catch (error) {
            addLog(`⚠️ SQL check warning: ${error.message}`, null, 'warning');
          }
          
          // Step 7: Look for exposed secrets/API keys
          addLog(`🔐 Scanning for exposed secrets...`, null, 'info');
          const secretsCmd = `cd ${repoDir} && grep -rE "(api[_-]?key|secret|password|token|apikey|apisecret)" --include="*.js" --include="*.ts" --include="*.py" --include="*.java" --include="*.php" --include="*.env*" . 2>&1 | grep -v node_modules | grep -v ".git" | head -20`;
          addLog(`🔐 Scanning for secrets...`, secretsCmd, 'command', 'grep');
          
          let secrets = [];
          try {
            const secretsResult = await window.cyberGuard.runWslCommand(secretsCmd, password);
            const secretLines = (secretsResult.stdout || '').trim().split('\n').filter(l => l);
            secrets = secretLines;
            addLog(`⚠️ Found ${secretLines.length} potential secret exposures`, secretLines.slice(0, 5).join('\n'), 'warning', 'grep');
          } catch (error) {
            addLog(`⚠️ Secret scan warning: ${error.message}`, null, 'warning');
          }
          
          // Compile results
          const scanResult = {
            repository: repo.fullName,
            success: true,
            apiFiles: apiFiles,
            endpoints: endpoints,
            sqlVulnerabilities: sqlVulns,
            exposedSecrets: secrets,
            scanDate: new Date().toISOString()
          };
          
          results.push(scanResult);
          
          addLog(`✅ Completed scan for ${repo.fullName}`, null, 'success');
          addLog(`📊 Summary: ${apiFiles.length} API files, ${endpoints.length} endpoints, ${sqlVulns.length} SQL sections, ${secrets.length} potential secrets`, null, 'info');
          
          setProgress(Math.round(((i + 1) / selectedRepos.length) * 100));
          
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
  const handleLogout = async () => {
    try {
      // Logout from backend (clears cookies)
      await authApi.logout();
      
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
      addLog('👋 Logged out successfully', null, 'info');
    } catch (error) {
      console.error('Logout error:', error);
      // Still clear local state even if logout request fails
      githubApi.logout();
      setAccessToken(null);
      setUser(null);
      setRepositories([]);
      setSelectedRepos([]);
      setSelectAll(false);
      setScanResults(null);
      setAuthStep('not-authenticated');
      setConsoleLogs([]);
    }
  };

  // Manual trigger to process OAuth response if JSON is visible
  const handleManualProcessOAuth = () => {
    try {
      // First, try to extract JSON from the page
      const bodyText = document.body?.innerText || document.body?.textContent || '';
      const root = document.getElementById('root');
      const rootText = root?.innerText || root?.textContent || '';
      
      // Check if we see JSON
      const hasJson = (bodyText.trim().startsWith('{') && bodyText.includes('"success"')) ||
                      (rootText.trim().startsWith('{') && rootText.includes('"success"'));
      
      if (hasJson) {
        const jsonText = bodyText.trim().startsWith('{') ? bodyText.trim() : rootText.trim();
        try {
          const jsonData = JSON.parse(jsonText);
          if (jsonData.success && jsonData.data) {
            addLog('📥 Manually processing OAuth response...', null, 'info');
            sessionStorage.setItem('oauth_callback_data', JSON.stringify(jsonData));
            // Clear the visible JSON
            document.body.innerHTML = '<div id="root"></div>';
            // Reload to process
            window.location.reload();
            return;
          }
        } catch (e) {
          console.error('Failed to parse JSON:', e);
        }
      }
      
      // Check sessionStorage
      const oauthDataStr = sessionStorage.getItem('oauth_callback_data');
      if (oauthDataStr) {
        try {
          const jsonData = JSON.parse(oauthDataStr);
          if (jsonData.success && jsonData.data) {
            addLog('📥 Processing OAuth data from storage...', null, 'info');
            
            // Process the OAuth data
            if (jsonData.data.user) {
              setUser(jsonData.data.user);
              setAuthStep('authenticated');
              addLog(`✅ Authentication successful! Welcome, ${jsonData.data.user.email || jsonData.data.user.username}!`, null, 'success');
              
              if (jsonData.data.token) {
                githubApi.setGitHubToken(jsonData.data.token, true);
              }
              
              if (jsonData.data.user.githubAccessToken) {
                githubApi.setGitHubToken(jsonData.data.user.githubAccessToken, true);
                setAccessToken(jsonData.data.user.githubAccessToken);
                setTimeout(() => {
                  handleFetchRepositories();
                }, 200);
              } else {
                // Try to get from profile
                setTimeout(async () => {
                  try {
                    const profile = await authApi.checkGitHubAuth();
                    if (profile?.data?.githubAccessToken) {
                      githubApi.setGitHubToken(profile.data.githubAccessToken, true);
                      setAccessToken(profile.data.githubAccessToken);
                      await handleFetchRepositories();
                    } else {
                      addLog('⚠️ GitHub access token not found. Please authenticate again.', null, 'warning');
                    }
                  } catch (error) {
                    console.error('Failed to get GitHub token:', error);
                    addLog('⚠️ Failed to get GitHub token. Please authenticate again.', null, 'warning');
                  }
                }, 500);
              }
            }
            return;
          }
        } catch (e) {
          console.error('Failed to parse stored OAuth data:', e);
        }
      }
      
      // If no OAuth data found, try checking auth status
      addLog('📥 Checking authentication status...', null, 'info');
      checkAuth();
    } catch (error) {
      console.error('Error manually processing OAuth:', error);
      addLog(`❌ Error: ${error.message}`, null, 'error');
    }
  };

  // Handle navigation back to dashboard
  const handleGoBack = () => {
    if (onNavigate) {
      onNavigate('overview');
    } else {
      // Fallback: use URL parameter
      window.location.href = '/?view=overview';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">GitHub Repository API Scanner</h1>
          <button
            onClick={handleGoBack}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium flex items-center space-x-2 transition-all shadow-md hover:shadow-lg whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Go Back to Software</span>
          </button>
        </div>
      </div>

      {/* Authentication Section */}
      {authStep === 'not-authenticated' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
          <div className="text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full mb-4">
                <svg className="w-8 h-8 text-gray-600 dark:text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">GitHub Authentication Required</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                Connect your GitHub account to scan repositories for API endpoints, security vulnerabilities, and exposed endpoints.
              </p>
            </div>
            
            <button
              onClick={handleInitiateAuth}
              className="px-8 py-4 bg-gray-900 hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700 text-white rounded-lg font-semibold flex items-center justify-center space-x-3 transition-all shadow-lg hover:shadow-xl transform hover:scale-105 mx-auto"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
              </svg>
              <span className="text-lg">Sign in with GitHub</span>
            </button>
            
            <div className="mt-6 text-sm text-gray-500 dark:text-gray-400">
              <p className="mb-2">🔒 Secure OAuth authentication</p>
              <p>We'll only access your repositories for scanning purposes</p>
            </div>
            
            {/* Manual OAuth processing button */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                ⚠️ If you see a JSON response but are stuck here, click below:
              </p>
              <button
                onClick={handleManualProcessOAuth}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🔄 Process OAuth Response Manually
              </button>
            </div>
          </div>
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
              <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-3">
                💡 Make sure you authorize the application in the browser window that opens. The app will automatically detect when authorization is complete.
              </p>
              <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-3">
                ⚠️ If you see a JSON response on the screen but nothing happens, click the button below to manually process it.
              </p>
              <button
                onClick={handleManualProcessOAuth}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🔄 Process OAuth Response Manually
              </button>
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
                Logged in as <strong>{user.username || user.email || user.login || 'User'}</strong> ({repositories.length} repositories)
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
