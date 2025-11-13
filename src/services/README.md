<<<<<<< HEAD
# API Services

This directory contains the centralized API services for the Cyberix application, built with axios and comprehensive error handling.

## Overview

The API services are structured into several modules:

- **`api.js`** - Core axios instance with interceptors and error handling
- **`apiConfig.js`** - Configuration, endpoints, and environment variables
- **`authApi.js`** - Authentication and user management
- **`scansApi.js`** - Security scanning operations
- **`aiApi.js`** - AI-powered analysis and recommendations
- **`githubApi.js`** - GitHub OAuth and repository access
- **`githubHelpers.js`** - GitHub OAuth helpers for Electron integration
- **`githubScanIntegration.js`** - GitHub repository scanning integration
- **`index.js`** - Centralized exports

## Quick Start

```javascript
import { authApi, scansApi, aiApi } from '../services'

// Login user
const loginResponse = await authApi.login({
  username: 'admin',
  password: 'password123',
  rememberMe: true
})

// Start a security scan
const scanResponse = await scansApi.startWebsiteScan({
  target: 'https://example.com',
  scanTypes: ['vulnerability', 'malware']
})

// Get AI analysis
const aiSuggestions = await aiApi.analyzeScanResults({
  scanType: 'website',
  scanName: 'Website Security Scan',
  scanResults: scanData,
  rawOutput: rawCommandOutput,
  target: 'https://example.com'
})

// GitHub OAuth and repository scanning
import { githubApi, githubHelpers, githubScanIntegration } from '../services'

// Authenticate with GitHub
const githubAuth = await githubHelpers.completeOAuthFlow({
  redirect: 'myapp://github-callback'
})

// Scan a GitHub repository
const repoScan = await githubScanIntegration.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets']
})
```

## Core API Service (`api.js`)

The core API service provides:

- **Request/Response Interceptors**: Automatic authentication, logging, and error handling
- **Error Handling**: Comprehensive error types with user-friendly messages
- **Retry Logic**: Automatic retries for server errors and network issues
- **Authentication**: Automatic token management and refresh

### Features

- Automatic retry on 5xx errors
- Rate limiting detection and handling
- Network connectivity monitoring
- Request/response logging in development
- Timeout handling with configurable limits

## API Modules

### Authentication API (`authApi.js`)

```javascript
// Login
await authApi.login({ username, password, rememberMe })

// Logout
await authApi.logout()

// Get user profile
const profile = await authApi.getProfile()

// Check auth status
const isLoggedIn = authApi.isAuthenticated()
```

### Scans API (`scansApi.js`)

```javascript
// Start different types of scans
await scansApi.startWebsiteScan({ target: 'https://example.com' })
await scansApi.startNetworkScan({ target: '192.168.1.0/24' })
await scansApi.startPortScan({ target: 'example.com', ports: '1-1000' })

// Monitor scan progress
const status = await scansApi.getScanStatus(scanId)
const results = await scansApi.getScanResults(scanId)

// Manage scans
await scansApi.cancelScan(scanId)
await scansApi.deleteScan(scanId)
```

### AI API (`aiApi.js`)

```javascript
// Analyze scan results
const analysis = await aiApi.analyzeScanResults({
  scanType: 'website',
  scanName: 'Security Audit',
  scanResults: results,
  rawOutput: commandOutput,
  target: 'example.com'
})

// Generate reports
const report = await aiApi.generateSecurityReport({
  scans: [scan1, scan2],
  target: 'example.com',
  format: 'executive'
})

// Get security advice
const advice = await aiApi.getSecurityAdvice({
  context: 'web application',
  threat: 'SQL injection',
  severity: 'high'
})
```

### GitHub API (`githubApi.js`)

```javascript
// Initiate GitHub OAuth
const authUrl = await githubApi.initiateOAuth({
  redirect: 'myapp://github-callback'
})

// Get user info
const userInfo = await githubApi.getUserInfo()

// Get organizations
const orgs = await githubApi.getOrganizations()

// Get organization repositories
const repos = await githubApi.getOrganizationRepos('org-name')

// Get repository contents
const contents = await githubApi.getRepositoryContents('owner', 'repo-name', {
  path: '',
  branch: 'main'
})

// Get repository branches
const branches = await githubApi.getRepositoryBranches('owner', 'repo-name')

// Scan repository
const scanResult = await githubApi.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets'],
  branch: 'main'
})
```

### GitHub Helpers (`githubHelpers.js`)

```javascript
// Complete OAuth flow in Electron
const result = await githubHelpers.completeOAuthFlow({
  redirect: 'myapp://github-callback',
  timeout: 300000
})

// Check configuration
const isConfigured = githubHelpers.isConfigured()
const configStatus = githubHelpers.getConfigurationStatus()
```

### GitHub Scan Integration (`githubScanIntegration.js`)

```javascript
// Scan a GitHub repository
const result = await githubScanIntegration.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets'],
  branch: 'main',
  includeCode: true,
  includeDependencies: true,
  includeSecrets: true
})

// Scan all repositories in an organization
const orgScan = await githubScanIntegration.scanOrganizationRepos('org-name', {
  scanTypes: ['code', 'dependencies'],
  onProgress: (repo, status, current, total) => {
    console.log(`Scanning ${repo}: ${status} (${current}/${total})`)
  }
})

// Get scan results
const results = await githubScanIntegration.getScanResults('owner', 'repo-name', scanId)
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001/api
VITE_GROK_API_KEY=your_grok_api_key_here

# GitHub OAuth Configuration
VITE_GITHUB_CLIENT_ID=your_github_client_id
VITE_GITHUB_CLIENT_SECRET=your_github_client_secret
VITE_GITHUB_CALLBACK_URL=http://localhost:4005/api/github/callback

# Optional settings
VITE_ENABLE_API_LOGGING=true
VITE_ENABLE_REQUEST_CACHING=true
VITE_ENABLE_AUTO_RETRY=true
```

### API Endpoints

Endpoints are defined in `apiConfig.js` and can be easily extended:

```javascript
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    // ... more auth endpoints
  },
  SCANS: {
    WEBSITE: '/scans/website',
    NETWORK: '/scans/network',
    // ... more scan endpoints
  }
  // ... more endpoint groups
}
```

## Error Handling

The API services provide comprehensive error handling:

- **Network Errors**: Automatic retry with exponential backoff
- **Authentication Errors**: Automatic token refresh and logout
- **Validation Errors**: Detailed field-level error messages
- **Rate Limiting**: Automatic retry after cooldown period
- **Server Errors**: Retry logic with user notifications

### Error Types

```javascript
try {
  const result = await scansApi.startWebsiteScan(config)
} catch (error) {
  // Error is automatically handled by interceptors
  // User-friendly toast notifications are shown
  console.error('Scan failed:', error.message)
}
```

## Best Practices

1. **Import Services**: Always import from the index file for consistency
2. **Error Handling**: Let the interceptors handle common errors, catch specific ones
3. **Authentication**: Check `authApi.isAuthenticated()` before making protected requests
4. **Loading States**: Use the built-in loading states in your UI components
5. **Caching**: Leverage the built-in request caching for better performance

## Integration with Existing Code

The API services are designed to integrate seamlessly with your existing Electron + React application:

- **Toast Notifications**: Integrates with your existing toast system
- **Authentication**: Works with your current login/logout flow
- **WSL Integration**: Compatible with your backend Kali Linux integration
- **Error Display**: Provides user-friendly error messages through your UI
- **GitHub OAuth**: Full GitHub OAuth integration with Electron protocol handlers
- **Repository Scanning**: Integrates GitHub repositories with existing scanning services

## GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Your app name
   - **Homepage URL**: Your app URL
   - **Authorization callback URL**: `http://localhost:4005/api/github/callback`
4. Click "Register application"
5. Copy the **Client ID** and **Client Secret** to your `.env` file

### 2. Electron Integration

In your Electron main process (`main.js`):

```javascript
import { app, protocol } from 'electron'

// Set custom protocol
app.setAsDefaultProtocolClient('myapp')

// Handle protocol URL (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault()
  mainWindow.webContents.send('github-oauth-callback', url)
})

// Handle protocol URL (Windows/Linux)
app.on('ready', () => {
  protocol.registerHttpProtocol('myapp', (request, callback) => {
    mainWindow.webContents.send('github-oauth-callback', request.url)
  })
})
```

### 3. React Component Integration

```javascript
import { githubApi, githubHelpers, githubScanIntegration } from '../services'

const GitHubScanComponent = () => {
  const [authenticated, setAuthenticated] = useState(false)
  const [scanning, setScanning] = useState(false)

  const handleGitHubLogin = async () => {
    try {
      const result = await githubHelpers.completeOAuthFlow({
        redirect: 'myapp://github-callback'
      })
      setAuthenticated(true)
      console.log('GitHub authenticated:', result.user)
    } catch (error) {
      console.error('GitHub authentication failed:', error)
    }
  }

  const handleScanRepository = async (owner, repo) => {
    try {
      setScanning(true)
      const result = await githubScanIntegration.scanRepository(owner, repo, {
        scanTypes: ['code', 'dependencies', 'secrets']
      })
      console.log('Scan results:', result)
    } catch (error) {
      console.error('Scan failed:', error)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      {!authenticated ? (
        <button onClick={handleGitHubLogin}>Connect GitHub</button>
      ) : (
        <button onClick={() => handleScanRepository('owner', 'repo')}>
          Scan Repository
        </button>
      )}
    </div>
  )
}
```

## Development

### Adding New API Endpoints

1. Add endpoint to `API_ENDPOINTS` in `apiConfig.js`
2. Create method in appropriate API module
3. Export from `index.js`

### Testing

```javascript
// Mock API responses for testing
import { api } from '../services'
jest.mock('../services/api')

// Test your API calls
test('should login user', async () => {
  api.post.mockResolvedValue({ data: mockUser })
  const result = await authApi.login(credentials)
  expect(result).toEqual(mockUser)
})
```

## Migration from Direct Fetch

If you're migrating from direct `fetch` calls:

**Before:**
```javascript
const response = await fetch('/api/scans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
const result = await response.json()
```

**After:**
```javascript
import { scansApi } from '../services'
const result = await scansApi.startWebsiteScan(data)
```

The new API services handle headers, authentication, error handling, and logging automatically.
=======
# API Services

This directory contains the centralized API services for the Cyberix application, built with axios and comprehensive error handling.

## Overview

The API services are structured into several modules:

- **`api.js`** - Core axios instance with interceptors and error handling
- **`apiConfig.js`** - Configuration, endpoints, and environment variables
- **`authApi.js`** - Authentication and user management
- **`scansApi.js`** - Security scanning operations
- **`aiApi.js`** - AI-powered analysis and recommendations
- **`githubApi.js`** - GitHub OAuth and repository access
- **`githubHelpers.js`** - GitHub OAuth helpers for Electron integration
- **`githubScanIntegration.js`** - GitHub repository scanning integration
- **`index.js`** - Centralized exports

## Quick Start

```javascript
import { authApi, scansApi, aiApi } from '../services'

// Login user
const loginResponse = await authApi.login({
  username: 'admin',
  password: 'password123',
  rememberMe: true
})

// Start a security scan
const scanResponse = await scansApi.startWebsiteScan({
  target: 'https://example.com',
  scanTypes: ['vulnerability', 'malware']
})

// Get AI analysis
const aiSuggestions = await aiApi.analyzeScanResults({
  scanType: 'website',
  scanName: 'Website Security Scan',
  scanResults: scanData,
  rawOutput: rawCommandOutput,
  target: 'https://example.com'
})

// GitHub OAuth and repository scanning
import { githubApi, githubHelpers, githubScanIntegration } from '../services'

// Authenticate with GitHub
const githubAuth = await githubHelpers.completeOAuthFlow({
  redirect: 'myapp://github-callback'
})

// Scan a GitHub repository
const repoScan = await githubScanIntegration.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets']
})
```

## Core API Service (`api.js`)

The core API service provides:

- **Request/Response Interceptors**: Automatic authentication, logging, and error handling
- **Error Handling**: Comprehensive error types with user-friendly messages
- **Retry Logic**: Automatic retries for server errors and network issues
- **Authentication**: Automatic token management and refresh

### Features

- Automatic retry on 5xx errors
- Rate limiting detection and handling
- Network connectivity monitoring
- Request/response logging in development
- Timeout handling with configurable limits

## API Modules

### Authentication API (`authApi.js`)

```javascript
// Login
await authApi.login({ username, password, rememberMe })

// Logout
await authApi.logout()

// Get user profile
const profile = await authApi.getProfile()

// Check auth status
const isLoggedIn = authApi.isAuthenticated()
```

### Scans API (`scansApi.js`)

```javascript
// Start different types of scans
await scansApi.startWebsiteScan({ target: 'https://example.com' })
await scansApi.startNetworkScan({ target: '192.168.1.0/24' })
await scansApi.startPortScan({ target: 'example.com', ports: '1-1000' })

// Monitor scan progress
const status = await scansApi.getScanStatus(scanId)
const results = await scansApi.getScanResults(scanId)

// Manage scans
await scansApi.cancelScan(scanId)
await scansApi.deleteScan(scanId)
```

### AI API (`aiApi.js`)

```javascript
// Analyze scan results
const analysis = await aiApi.analyzeScanResults({
  scanType: 'website',
  scanName: 'Security Audit',
  scanResults: results,
  rawOutput: commandOutput,
  target: 'example.com'
})

// Generate reports
const report = await aiApi.generateSecurityReport({
  scans: [scan1, scan2],
  target: 'example.com',
  format: 'executive'
})

// Get security advice
const advice = await aiApi.getSecurityAdvice({
  context: 'web application',
  threat: 'SQL injection',
  severity: 'high'
})
```

### GitHub API (`githubApi.js`)

```javascript
// Initiate GitHub OAuth
const authUrl = await githubApi.initiateOAuth({
  redirect: 'myapp://github-callback'
})

// Get user info
const userInfo = await githubApi.getUserInfo()

// Get organizations
const orgs = await githubApi.getOrganizations()

// Get organization repositories
const repos = await githubApi.getOrganizationRepos('org-name')

// Get repository contents
const contents = await githubApi.getRepositoryContents('owner', 'repo-name', {
  path: '',
  branch: 'main'
})

// Get repository branches
const branches = await githubApi.getRepositoryBranches('owner', 'repo-name')

// Scan repository
const scanResult = await githubApi.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets'],
  branch: 'main'
})
```

### GitHub Helpers (`githubHelpers.js`)

```javascript
// Complete OAuth flow in Electron
const result = await githubHelpers.completeOAuthFlow({
  redirect: 'myapp://github-callback',
  timeout: 300000
})

// Check configuration
const isConfigured = githubHelpers.isConfigured()
const configStatus = githubHelpers.getConfigurationStatus()
```

### GitHub Scan Integration (`githubScanIntegration.js`)

```javascript
// Scan a GitHub repository
const result = await githubScanIntegration.scanRepository('owner', 'repo-name', {
  scanTypes: ['code', 'dependencies', 'secrets'],
  branch: 'main',
  includeCode: true,
  includeDependencies: true,
  includeSecrets: true
})

// Scan all repositories in an organization
const orgScan = await githubScanIntegration.scanOrganizationRepos('org-name', {
  scanTypes: ['code', 'dependencies'],
  onProgress: (repo, status, current, total) => {
    console.log(`Scanning ${repo}: ${status} (${current}/${total})`)
  }
})

// Get scan results
const results = await githubScanIntegration.getScanResults('owner', 'repo-name', scanId)
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001/api
VITE_GROK_API_KEY=your_grok_api_key_here

# GitHub OAuth Configuration
VITE_GITHUB_CLIENT_ID=your_github_client_id
VITE_GITHUB_CLIENT_SECRET=your_github_client_secret
VITE_GITHUB_CALLBACK_URL=http://localhost:4005/api/github/callback

# Optional settings
VITE_ENABLE_API_LOGGING=true
VITE_ENABLE_REQUEST_CACHING=true
VITE_ENABLE_AUTO_RETRY=true
```

### API Endpoints

Endpoints are defined in `apiConfig.js` and can be easily extended:

```javascript
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    // ... more auth endpoints
  },
  SCANS: {
    WEBSITE: '/scans/website',
    NETWORK: '/scans/network',
    // ... more scan endpoints
  }
  // ... more endpoint groups
}
```

## Error Handling

The API services provide comprehensive error handling:

- **Network Errors**: Automatic retry with exponential backoff
- **Authentication Errors**: Automatic token refresh and logout
- **Validation Errors**: Detailed field-level error messages
- **Rate Limiting**: Automatic retry after cooldown period
- **Server Errors**: Retry logic with user notifications

### Error Types

```javascript
try {
  const result = await scansApi.startWebsiteScan(config)
} catch (error) {
  // Error is automatically handled by interceptors
  // User-friendly toast notifications are shown
  console.error('Scan failed:', error.message)
}
```

## Best Practices

1. **Import Services**: Always import from the index file for consistency
2. **Error Handling**: Let the interceptors handle common errors, catch specific ones
3. **Authentication**: Check `authApi.isAuthenticated()` before making protected requests
4. **Loading States**: Use the built-in loading states in your UI components
5. **Caching**: Leverage the built-in request caching for better performance

## Integration with Existing Code

The API services are designed to integrate seamlessly with your existing Electron + React application:

- **Toast Notifications**: Integrates with your existing toast system
- **Authentication**: Works with your current login/logout flow
- **WSL Integration**: Compatible with your backend Kali Linux integration
- **Error Display**: Provides user-friendly error messages through your UI
- **GitHub OAuth**: Full GitHub OAuth integration with Electron protocol handlers
- **Repository Scanning**: Integrates GitHub repositories with existing scanning services

## GitHub OAuth Setup

### 1. Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Your app name
   - **Homepage URL**: Your app URL
   - **Authorization callback URL**: `http://localhost:4005/api/github/callback`
4. Click "Register application"
5. Copy the **Client ID** and **Client Secret** to your `.env` file

### 2. Electron Integration

In your Electron main process (`main.js`):

```javascript
import { app, protocol } from 'electron'

// Set custom protocol
app.setAsDefaultProtocolClient('myapp')

// Handle protocol URL (macOS)
app.on('open-url', (event, url) => {
  event.preventDefault()
  mainWindow.webContents.send('github-oauth-callback', url)
})

// Handle protocol URL (Windows/Linux)
app.on('ready', () => {
  protocol.registerHttpProtocol('myapp', (request, callback) => {
    mainWindow.webContents.send('github-oauth-callback', request.url)
  })
})
```

### 3. React Component Integration

```javascript
import { githubApi, githubHelpers, githubScanIntegration } from '../services'

const GitHubScanComponent = () => {
  const [authenticated, setAuthenticated] = useState(false)
  const [scanning, setScanning] = useState(false)

  const handleGitHubLogin = async () => {
    try {
      const result = await githubHelpers.completeOAuthFlow({
        redirect: 'myapp://github-callback'
      })
      setAuthenticated(true)
      console.log('GitHub authenticated:', result.user)
    } catch (error) {
      console.error('GitHub authentication failed:', error)
    }
  }

  const handleScanRepository = async (owner, repo) => {
    try {
      setScanning(true)
      const result = await githubScanIntegration.scanRepository(owner, repo, {
        scanTypes: ['code', 'dependencies', 'secrets']
      })
      console.log('Scan results:', result)
    } catch (error) {
      console.error('Scan failed:', error)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div>
      {!authenticated ? (
        <button onClick={handleGitHubLogin}>Connect GitHub</button>
      ) : (
        <button onClick={() => handleScanRepository('owner', 'repo')}>
          Scan Repository
        </button>
      )}
    </div>
  )
}
```

## Development

### Adding New API Endpoints

1. Add endpoint to `API_ENDPOINTS` in `apiConfig.js`
2. Create method in appropriate API module
3. Export from `index.js`

### Testing

```javascript
// Mock API responses for testing
import { api } from '../services'
jest.mock('../services/api')

// Test your API calls
test('should login user', async () => {
  api.post.mockResolvedValue({ data: mockUser })
  const result = await authApi.login(credentials)
  expect(result).toEqual(mockUser)
})
```

## Migration from Direct Fetch

If you're migrating from direct `fetch` calls:

**Before:**
```javascript
const response = await fetch('/api/scans', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
const result = await response.json()
```

**After:**
```javascript
import { scansApi } from '../services'
const result = await scansApi.startWebsiteScan(data)
```

The new API services handle headers, authentication, error handling, and logging automatically.
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
