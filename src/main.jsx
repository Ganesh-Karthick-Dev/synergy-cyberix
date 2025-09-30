import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      containerClassName="toast-container"
      containerStyle={{
        top: 20,
        left: 20,
        bottom: 20,
        right: 20,
      }}
      toastOptions={{
        className: '',
        duration: 4000,
        style: {
          background: 'rgba(255, 255, 255, 0.95)',
          color: '#1f2937',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(229, 231, 235, 0.5)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          padding: '16px',
          maxWidth: '420px',
        },
        success: {
          duration: 4000,
          style: {
            border: '1px solid rgba(34, 197, 94, 0.2)',
            background: 'rgba(240, 253, 244, 0.95)',
          },
        },
        error: {
          duration: 6000,
          style: {
            border: '1px solid rgba(239, 68, 68, 0.2)',
            background: 'rgba(254, 242, 242, 0.95)',
          },
        },
        loading: {
          duration: Infinity,
        },
      }}
    />
  </StrictMode>,
)
