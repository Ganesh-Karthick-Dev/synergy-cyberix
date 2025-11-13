# Scan Restrictions Integration Guide

This guide explains how to integrate plan-wise restrictions into scan components.

## Overview

The restriction system enforces:
- **FREE Plan**: 1 project, 1 scan per project
- **PRO Plan**: 10 projects, unlimited scans per project
- **PRO_PLUS Plan**: Unlimited projects, unlimited scans per project

## Components Created

1. **`subscriptionService.js`** - Service for fetching plan info, projects, and checking limits
2. **`SubscriptionInfo.jsx`** - UI component showing plan info in Navbar
3. **`ProjectSelector.jsx`** - Modal for selecting/creating projects
4. **`useScanRestrictions.js`** - Custom hook for managing scan restrictions

## Integration Steps

### Step 1: Import Required Dependencies

```jsx
import { useState } from 'react'
import useScanRestrictions from '../hooks/useScanRestrictions'
import ProjectSelector from '../components/ProjectSelector'
import { AlertCircle } from 'lucide-react'
```

### Step 2: Initialize the Hook

In your scan component:

```jsx
function YourScanComponent() {
  const {
    selectedProject,
    showProjectSelector,
    scanLimit,
    checkingLimit,
    openProjectSelector,
    closeProjectSelector,
    handleProjectSelect,
    checkScanLimit,
    createScanReport,
    clearProject
  } = useScanRestrictions()

  // ... rest of your component
}
```

### Step 3: Add Project Selection Before Scan

Modify your scan start handler:

```jsx
const handleStartScan = async () => {
  // If no project selected, show project selector
  if (!selectedProject) {
    openProjectSelector()
    return
  }

  // Check scan limit before starting
  const limitCheck = await checkScanLimit(selectedProject.id)
  
  if (!limitCheck.allowed) {
    // Show error message
    showError(limitCheck.reason || 'Scan limit reached')
    return
  }

  // Proceed with scan...
  setIsScanning(true)
  // ... your scan logic
}
```

### Step 4: Create Scan Report After Successful Scan

After your scan completes successfully:

```jsx
try {
  // ... your scan execution code
  
  // After scan completes successfully
  const scanResults = {
    // ... your scan results
  }

  // Create scan report
  await createScanReport(
    'tool-id-here', // e.g., 'port-scanner', 'network-scanner', etc.
    `Scan Report for ${targetUrl}`,
    JSON.stringify(scanResults), // or formatted report content
    'MEDIUM', // or 'LOW', 'HIGH', 'CRITICAL'
    {
      target: targetUrl,
      scanType: 'port-scan',
      // ... any additional metadata
    }
  )

  // Show success message
  showSuccess('Scan completed and saved!')
  
} catch (error) {
  console.error('Scan error:', error)
  showError(error.message)
}
```

### Step 5: Add Project Selector UI

Add the ProjectSelector component to your JSX:

```jsx
return (
  <div>
    {/* Your existing scan UI */}
    
    {/* Project Selector Modal */}
    {showProjectSelector && (
      <ProjectSelector
        onSelect={handleProjectSelect}
        onCancel={closeProjectSelector}
        required={true}
      />
    )}

    {/* Show selected project info */}
    {selectedProject && (
      <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Selected Project: {selectedProject.name}
            </p>
            {scanLimit && !scanLimit.unlimited && (
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Scans remaining: {scanLimit.remaining} / {scanLimit.limit}
              </p>
            )}
          </div>
          <button
            onClick={clearProject}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Change
          </button>
        </div>
      </div>
    )}

    {/* Show limit warning */}
    {scanLimit && !scanLimit.allowed && (
      <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 flex items-start space-x-2">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-red-900 dark:text-red-100">
            Scan Limit Reached
          </p>
          <p className="text-xs text-red-700 dark:text-red-300 mt-1">
            {scanLimit.reason}
          </p>
        </div>
      </div>
    )}
  </div>
)
```

## Example: Complete Integration

Here's a complete example for a Port Scanning component:

```jsx
import { useState } from 'react'
import useScanRestrictions from '../hooks/useScanRestrictions'
import ProjectSelector from '../components/ProjectSelector'
import { AlertCircle } from 'lucide-react'

function PortScanning() {
  const [targetUrl, setTargetUrl] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [scanResults, setScanResults] = useState(null)

  const {
    selectedProject,
    showProjectSelector,
    scanLimit,
    openProjectSelector,
    closeProjectSelector,
    handleProjectSelect,
    checkScanLimit,
    createScanReport,
    clearProject
  } = useScanRestrictions()

  const handleStartScan = async () => {
    // Validate input
    if (!targetUrl.trim()) {
      showError('Please enter a target URL')
      return
    }

    // Check project selection
    if (!selectedProject) {
      openProjectSelector()
      return
    }

    // Check scan limit
    const limitCheck = await checkScanLimit(selectedProject.id)
    if (!limitCheck.allowed) {
      showError(limitCheck.reason || 'Scan limit reached')
      return
    }

    // Start scan
    setIsScanning(true)
    try {
      // ... your scan logic here
      const results = await performPortScan(targetUrl)

      // Create scan report
      await createScanReport(
        'port-scanner',
        `Port Scan Report for ${targetUrl}`,
        JSON.stringify(results),
        'MEDIUM',
        {
          target: targetUrl,
          scanType: 'port-scan',
          openPorts: results.openPorts?.length || 0
        }
      )

      setScanResults(results)
      showSuccess('Scan completed and saved!')
    } catch (error) {
      showError(error.message)
    } finally {
      setIsScanning(false)
    }
  }

  return (
    <div className="p-6">
      {/* Project Selector */}
      {showProjectSelector && (
        <ProjectSelector
          onSelect={handleProjectSelect}
          onCancel={closeProjectSelector}
          required={true}
        />
      )}

      {/* Selected Project Info */}
      {selectedProject && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm">
            Project: <strong>{selectedProject.name}</strong>
            {scanLimit && !scanLimit.unlimited && (
              <span className="ml-2 text-xs">
                ({scanLimit.remaining} scans remaining)
              </span>
            )}
          </p>
        </div>
      )}

      {/* Scan Form */}
      <div className="space-y-4">
        <input
          type="text"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          placeholder="Enter target URL"
          className="w-full px-4 py-2 border rounded-lg"
        />
        
        <button
          onClick={handleStartScan}
          disabled={isScanning || (scanLimit && !scanLimit.allowed)}
          className="px-6 py-2 bg-orange-500 text-white rounded-lg disabled:opacity-50"
        >
          {isScanning ? 'Scanning...' : 'Start Scan'}
        </button>
      </div>

      {/* Results */}
      {scanResults && (
        <div className="mt-6">
          {/* Display results */}
        </div>
      )}
    </div>
  )
}
```

## Tool IDs Reference

Use these tool IDs when creating scan reports:

- `port-scanner` - Port scanning
- `network-scanner` - Network scanning
- `server-scanner` - Server scanning
- `website-scanner` - Website scanning
- `api-scanner` - API scanning
- `phishing-detector` - Phishing detection
- `malware-scanner` - Malware scanning

## Notes

1. **Project Selection**: Users must select a project before scanning
2. **Limit Checking**: Limits are checked automatically before each scan
3. **Report Creation**: Reports are created automatically after successful scans
4. **Count Updates**: Scan counts update automatically after report creation
5. **Cache**: Plan info is cached for 1 minute to reduce API calls

## Testing

1. Test with FREE plan - should limit to 1 project and 1 scan per project
2. Test with PRO plan - should allow 10 projects and unlimited scans
3. Test with PRO_PLUS plan - should allow unlimited everything
4. Verify counts decrease after each scan
5. Verify error messages when limits are reached

