import { useState, useEffect } from 'react'
import { useToast } from '../context/ToastContext'

const Setup = ({ onSetupComplete }) => {
  const { showError, showSuccess } = useToast()
  const [currentStep, setCurrentStep] = useState(1) // 1: Terms, 2: Location, 3: Creating folder
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [installPath, setInstallPath] = useState('C:\\Program Files\\Cyberix')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)

  const handleTermsAccept = () => {
    setTermsAccepted(true)
  }

  const handleTermsDecline = () => {
    setTermsAccepted(false)
  }

  const handleNext = () => {
    if (currentStep === 1) {
      if (termsAccepted) {
        setCurrentStep(2)
      } else {
        showError('Please accept the terms and conditions to continue.')
      }
    } else if (currentStep === 2) {
      // Validate installation path
      if (!installPath || installPath.trim() === '') {
        showError('Please enter a valid installation path.')
        return
      }
      
      // Basic path validation
      if (installPath.includes('..') || installPath.includes('//')) {
        showError('Please enter a valid installation path without relative paths.')
        return
      }
      
      setCurrentStep(3)
      createCyberixFolder()
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleBrowse = async () => {
    try {
      // Check if cyberGuard is available
      if (!window.cyberGuard) {
        console.error('cyberGuard not available')
        showError('Application not ready. Please restart the application.')
        return
      }

      // Use Electron's dialog to select directory
      const result = await window.cyberGuard.selectDirectory()
      if (result && result.length > 0) {
        setInstallPath(result[0])
        showSuccess('Directory selected successfully!')
      } else {
        console.log('No directory selected or selection cancelled')
      }
    } catch (error) {
      console.error('Error selecting directory:', error)
      showError(`Failed to select directory: ${error.message || 'Unknown error'}. Using default location.`)
    }
  }

  const createCyberixFolder = async () => {
    setIsCreatingFolder(true)
    try {
      // Check if cyberGuard is available
      if (!window.cyberGuard) {
        console.error('cyberGuard not available')
        showError('Application not ready. Please restart the application.')
        setCurrentStep(2)
        return
      }

      // Create the cyberix_system_logs folder in the selected location
      const result = await window.cyberGuard.createDirectory(installPath)
      
      if (result && result.success) {
        showSuccess('Setup completed successfully!')
        
        // Small delay for better UX
        setTimeout(() => {
          onSetupComplete(installPath)
        }, 1500)
      } else {
        throw new Error('Failed to create directories')
      }
    } catch (error) {
      console.error('Error creating folder:', error)
      showError(`Failed to create system logs folder: ${error.message || 'Unknown error'}. Please try again.`)
      setCurrentStep(2) // Go back to location selection
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const handleCancel = () => {
    // You can add confirmation dialog here if needed
    window.close()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl w-full">
        {/* Setup Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-orange-500 rounded-lg flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Setup - Cyberix
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Welcome to Cyberix Security Analyzer
          </p>
        </div>

        {/* Setup Content */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
          {/* Step 1: Terms and Conditions */}
          {currentStep === 1 && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  License Agreement
                </h2>
              </div>

              <div className="mb-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Please read the following important information before continuing.
                </p>
                
                <div className="bg-gray-50 dark:bg-slate-700 rounded-lg p-6 max-h-96 overflow-y-auto">
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-4">
                    <p>
                      Please read the following License Agreement. You must accept the terms of this agreement before continuing with the installation.
                    </p>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <p className="font-medium">By installing Cyberix, you agree to our Terms of Service and Privacy Policy.</p>
                    </div>
                    
                    <div>
                      <p className="font-medium mb-2">Please review our Terms of Service at:</p>
                      <a 
                        href="https://www.cyberix.com/terms-of-service" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:text-orange-500 underline"
                      >
                        https://www.cyberix.com/terms-of-service
                      </a>
                    </div>
                    
                    <div>
                      <p className="font-medium mb-2">Please review our Privacy Policy at:</p>
                      <a 
                        href="https://www.cyberix.com/privacy" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-orange-600 hover:text-orange-500 underline"
                      >
                        https://www.cyberix.com/privacy
                      </a>
                    </div>
                    
                    <div className="border-l-4 border-orange-500 pl-4">
                      <p className="font-medium">Click "I accept the agreement" below to continue with installation.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="accept"
                    name="terms"
                    checked={termsAccepted}
                    onChange={handleTermsAccept}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600"
                  />
                  <label htmlFor="accept" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    I accept the agreement
                  </label>
                </div>
                
                <div className="flex items-center space-x-3">
                  <input
                    type="radio"
                    id="decline"
                    name="terms"
                    checked={!termsAccepted}
                    onChange={handleTermsDecline}
                    className="h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 dark:border-slate-600"
                  />
                  <label htmlFor="decline" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    I do not accept the agreement
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Installation Location */}
          {currentStep === 2 && (
            <div className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Select Destination Location
                </h2>
              </div>

              <div className="mb-6">
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                  Where should Cyberix be installed?
                </p>
                
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Setup will install Cyberix into the following folder.
                </p>
                
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  To continue, click Next. If you would like to select a different folder, click Browse.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Installation Path:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={installPath}
                        onChange={(e) => setInstallPath(e.target.value)}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        placeholder="Enter installation path manually or use Browse..."
                      />
                      <button
                        type="button"
                        onClick={handleBrowse}
                        className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        Browse...
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      You can type the path manually or click Browse to select a folder
                    </p>
                    
                    {/* Debug Information */}
                    <div className="mt-2 p-2 bg-gray-100 dark:bg-slate-700 rounded text-xs">
                      <div className="text-gray-600 dark:text-gray-400">
                        <strong>Debug Info:</strong>
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        cyberGuard available: {window.cyberGuard ? 'Yes' : 'No'}
                      </div>
                      <div className="text-gray-600 dark:text-gray-400">
                        selectDirectory method: {window.cyberGuard?.selectDirectory ? 'Yes' : 'No'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/40 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        At least 100 MB of free disk space is required.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Creating Folder */}
          {currentStep === 3 && (
            <div className="p-8 text-center">
              <div className="flex items-center justify-center gap-3 mb-6">
                <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  3
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Setting Up Cyberix
                </h2>
              </div>

              <div className="mb-8">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  {isCreatingFolder ? (
                    <svg className="w-8 h-8 text-orange-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {isCreatingFolder ? 'Creating system folders...' : 'Setup Complete!'}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400">
                  {isCreatingFolder 
                    ? 'Please wait while we create the cyberix_system_logs folder in your selected location.'
                    : 'Cyberix has been successfully installed and configured.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="px-8 py-4 bg-gray-50 dark:bg-slate-700/50 border-t border-gray-200 dark:border-slate-600 flex justify-between">
            <div>
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  Back
                </button>
              )}
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                Cancel
              </button>
              
              {currentStep < 3 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={currentStep === 1 && !termsAccepted}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Cyberix Security Analyzer - Professional Security Assessment Tool
          </p>
        </div>
      </div>
    </div>
  )
}

export default Setup
