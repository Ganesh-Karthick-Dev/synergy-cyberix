import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

console.log('[MAIN.JSX] Starting application...')
console.log('[MAIN.JSX] Document ready state:', document.readyState)
console.log('[MAIN.JSX] Root element:', document.getElementById('root'))

// Wait for DOM to be ready
function initApp() {
  const rootElement = document.getElementById('root')
  
  if (!rootElement) {
    console.error('[MAIN.JSX] ❌ Root element not found!')
    document.body.innerHTML = `
      <div style="padding: 40px; color: red; font-family: 'Poppins', sans-serif; background: #1a1a1a; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="text-align: center;">
          <h1 style="color: #ff4444;">🚨 Critical Error</h1>
          <p>Root element (#root) not found in DOM</p>
          <p>This indicates a serious loading issue.</p>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin-top: 20px;">🔄 Reload</button>
        </div>
      </div>
    `
    return
  }

  try {
    console.log('[MAIN.JSX] Creating React root...')
    const root = createRoot(rootElement)
    console.log('[MAIN.JSX] ✅ React root created successfully')
    
    console.log('[MAIN.JSX] Rendering application...')
    root.render(
      <StrictMode>
        <App />
        <Toaster position="top-center" />
      </StrictMode>
    )
    console.log('[MAIN.JSX] ✅ React app rendered successfully')
  } catch (error) {
    console.error('[MAIN.JSX] ❌ React mounting error:', error)
    console.error('[MAIN.JSX] Error stack:', error.stack)
    
    const errorDisplay = `
      <div style="padding: 40px; color: #fff; font-family: 'Poppins', sans-serif; background: #1a1a1a; min-height: 100vh;">
        <div style="max-width: 800px; margin: 0 auto;">
          <h1 style="color: #ff4444;">🚨 React Error</h1>
          <div style="background: #2a2a2a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Error:</strong> ${error.message}</p>
            <pre style="background: #1a1a1a; padding: 15px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap;">${error.stack}</pre>
          </div>
          <button onclick="location.reload()" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">🔄 Reload</button>
        </div>
      </div>
    `
    
    if (rootElement) {
      rootElement.innerHTML = errorDisplay
    } else {
      document.body.innerHTML = errorDisplay
    }
  }
}

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[MAIN.JSX] Global error:', event.error, event.message, event.filename, event.lineno)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[MAIN.JSX] Unhandled promise rejection:', event.reason)
})

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  // DOM is already ready
  initApp()
}
