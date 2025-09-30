import React from 'react';
import { useToast } from '../context/ToastContext';

const ToastDemo = () => {
  const { 
    showError, 
    showSuccess, 
    showAlert, 
    showSecondary, 
    showLoading,
    clearAll 
  } = useToast();

  const handleShowError = () => {
    showError('🚨 Critical security threat detected! Immediate action required.', { 
      duration: 6000 
    });
  };

  const handleShowSuccess = () => {
    showSuccess('✅ Security scan completed successfully! No threats found.', { 
      duration: 4000 
    });
  };

  const handleShowAlert = () => {
    showAlert('⚠️ Warning: Suspicious activity detected on your network.', { 
      duration: 5000 
    });
  };

  const handleShowSecondary = () => {
    showSecondary('ℹ️ System maintenance scheduled for tonight at 2:00 AM.', { 
      duration: 4000 
    });
  };

  const handleShowLoading = () => {
    const loadingId = showLoading('🔄 Running comprehensive security analysis...');
    
    // Auto-complete after 3 seconds for demo
    setTimeout(() => {
      showSuccess('🎯 Security analysis completed! System is secure.', { 
        duration: 3000 
      });
    }, 3000);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        🧪 Toast Notification Demo
      </h3>
      <p className="text-sm text-gray-600 mb-6">
        Test all toast variants with security-themed messages
      </p>
      
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button
          onClick={handleShowError}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
        >
          Error Toast
        </button>
        
        <button
          onClick={handleShowSuccess}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          Success Toast
        </button>
        
        <button
          onClick={handleShowAlert}
          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
        >
          Alert Toast
        </button>
        
        <button
          onClick={handleShowSecondary}
          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
        >
          Info Toast
        </button>
        
        <button
          onClick={handleShowLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Loading Toast
        </button>
        
        <button
          onClick={clearAll}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-medium"
        >
          Clear All
        </button>
      </div>
      
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-blue-800">
          💡 <strong>Tip:</strong> Toasts appear at the bottom with full width. Each variant has its own color scheme and icons from Lucide React.
        </p>
      </div>
    </div>
  );
};

export default ToastDemo;