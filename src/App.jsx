import { useState } from 'react'
import "./index.css"
import Dashboard from './Dashboard'
import { ToastProvider, useToast } from './context/ToastContext'
import { ScanningProvider } from './context/ScanningContext'
import logo from './assets/webp/Cybersecurity research-02.webp'

const AppContent = () => {
  const { showError, showSuccess, showLoading, dismissToast } = useToast()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    rememberMe: false
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [currentToastId, setCurrentToastId] = useState(null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    
    // Show professional loading toast
    const loadingToastId = showLoading('🔐 Authenticating your credentials...')
    setCurrentToastId(loadingToastId)
    
    try {
      // Simulate login process with realistic delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Check credentials
      if (formData.username === 'admin' && formData.password === 'admin@123') {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show success toast
        showSuccess(`🎉 Welcome back, ${formData.username}! Login successful.`, {
          duration: 3000
        })
        
        // Small delay for better UX
        setTimeout(() => {
          setIsAuthenticated(true)
        }, 800)
        
      } else {
        // Dismiss loading toast
        dismissToast(loadingToastId)
        
        // Show error toast with professional styling
        showError('❌ Authentication failed! Invalid credentials provided.', {
          duration: 5000
        })
      }
    } catch (error) {
      // Dismiss loading toast
      dismissToast(loadingToastId)
      
      // Show error toast for unexpected errors
      showError('🌐 Connection error. Please check your network and try again.', {
        duration: 6000
      })
    } finally {
      setIsLoading(false)
      setCurrentToastId(null)
    }
  }

  const handleLogout = () => {
    // Show logout toast
    showSuccess('👋 Successfully logged out! See you next time.', {
      duration: 2500
    })
    
    setTimeout(() => {
      setIsAuthenticated(false)
      setFormData({
        username: '',
        password: '',
        rememberMe: false
      })
    }, 500)
  }

  const handlePrefillCredentials = () => {
    setFormData(prev => ({
      ...prev,
      username: 'admin',
      password: 'admin@123'
    }))
    
    // Show success toast
    showSuccess('✅ Demo credentials filled! Ready to sign in.', {
      duration: 2000
    })
  }

  const handleClearCredentials = () => {
    setFormData(prev => ({
      ...prev,
      username: '',
      password: ''
    }))
    
    // Show info toast
    showSuccess('🗑️ Credentials cleared!', {
      duration: 1500
    })
  }

  if (isAuthenticated) {
    return <Dashboard onLogout={handleLogout} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div>
          <h2 className="text-3xl font-bold text-white bg-orange-500 w-fit text-center mx-auto p-3 rounded-lg mb-2">
           Cyberix
          </h2>
          </div>
          <p className="text-gray-600">
            Please sign in to your account
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter your password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="rememberMe"
                  type="checkbox"
                  checked={formData.rememberMe}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>

              <div>
                <a href="#" className="text-sm text-blue-600 hover:text-blue-500 transition-colors">
                  Forgot password?
                </a>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </div>
                ) : (
                  'Sign in'
                )}
              </button>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handlePrefillCredentials}
                  disabled={isLoading}
                  className="flex justify-center py-2 px-4 border border-blue-300 rounded-md shadow-sm text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Fill Demo
                </button>
                
                <button
                  type="button"
                  onClick={handleClearCredentials}
                  disabled={isLoading}
                  className="flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Clear
                </button>
              </div>
            </div>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Demo Credentials:<br />
              <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                Username: admin | Password: admin@123
              </span>
            </p>
          </div>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Protected by industry-standard encryption
          </p>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <ScanningProvider>
        <AppContent />
      </ScanningProvider>
    </ToastProvider>
  )
}

export default App
