import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

console.log('main.jsx loading...')
console.log('Root element:', document.getElementById('root'))

try {
  const root = createRoot(document.getElementById('root'))
  console.log('React root created successfully')
  
  root.render(
    <StrictMode>
      <App />
      <Toaster position="top-center" />
    </StrictMode>
  )
  console.log('React app rendered successfully')
} catch (error) {
  console.error('React mounting error:', error)
  document.getElementById('root').innerHTML = `
    <div style="padding: 20px; color: red; font-family: Arial;">
      <h1>React Error</h1>
      <p>${error.message}</p>
      <pre>${error.stack}</pre>
    </div>
  `
}
