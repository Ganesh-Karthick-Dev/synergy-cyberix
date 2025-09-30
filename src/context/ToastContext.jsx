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

  const addToast = useCallback((message, variant = 'secondary', options = {}) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      message,
      variant,
      duration: options.duration,
      loading: options.loading || false
    };

    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

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
    showSecondary,
    showLoading,
    updateToast,
    dismissToast,
    clearAll
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      
      {/* Toast Container - Fixed at bottom with full width */}
      <div className="fixed bottom-0 left-0 right-0 z-50 p-2 pointer-events-none">
        <div className="w-full space-y-2 pointer-events-auto">
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