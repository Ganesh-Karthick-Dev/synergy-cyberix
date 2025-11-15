import React, { createContext, useContext, useState, useCallback } from 'react';
import Toast from '../components/Toast';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  // Function to remove emojis from messages
  const removeEmojis = useCallback((text) => {
    if (!text) return text;
    // Remove emojis using regex
    return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{FE00}-\u{FE0F}]/gu, '').trim();
  }, []);

  const addToast = useCallback((message, variant = 'secondary', options = {}) => {
    const id = Date.now() + Math.random();
    // Remove emojis from message
    const cleanMessage = removeEmojis(message);
    const newToast = {
      id,
      message: cleanMessage,
      variant,
      duration: options.duration,
      loading: options.loading || false
    };

    setToasts(prev => [...prev, newToast]);
    return id;
  }, [removeEmojis]);

  const updateToast = useCallback((id, updates) => {
    setToasts(prev => 
      prev.map(toast => 
        toast.id === id ? { ...toast, ...updates } : toast
      )
    );
  }, []);

  const showError = useCallback((message, options = {}) => {
    return addToast(message, 'error', options);
  }, [addToast]);

  const showSuccess = useCallback((message, options = {}) => {
    return addToast(message, 'success', options);
  }, [addToast]);

  const showAlert = useCallback((message, options = {}) => {
    return addToast(message, 'alert', options);
  }, [addToast]);

  const showWarning = useCallback((message, options = {}) => {
    return addToast(message, 'warning', options);
  }, [addToast]);

  const showInfo = useCallback((message, options = {}) => {
    return addToast(message, 'info', options);
  }, [addToast]);

  const showSecondary = useCallback((message, options = {}) => {
    return addToast(message, 'secondary', options);
  }, [addToast]);

  const showLoading = useCallback((message = 'Loading...', options = {}) => {
    return addToast(message, 'secondary', { ...options, loading: true, duration: null });
  }, [addToast]);

  const dismissToast = useCallback((id) => {
    removeToast(id);
  }, [removeToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  const value = {
    toasts,
    showError,
    showSuccess, 
    showAlert,
    showWarning,
    showInfo,
    showSecondary,
    showLoading,
    updateToast,
    dismissToast,
    clearAll
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      
      {/* Toast Container - Fixed at bottom right */}
      <div className="fixed bottom-4 right-4 z-50 pointer-events-none max-w-md w-full">
        <div className="space-y-2 pointer-events-auto">
          {toasts.map((toast) => (
            <Toast
              key={toast.id}
              {...toast}
              onRemove={removeToast}
            />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
};

export default ToastProvider;