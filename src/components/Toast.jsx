import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

const Toast = ({ 
  id, 
  message, 
  variant = 'secondary', 
  duration = 5000, 
  onRemove,
  loading = false 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    // Fade in animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration && !loading) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, loading]);

  const handleClose = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onRemove(id);
    }, 300);
  };

  const getVariantStyles = () => {
    const baseStyles = "relative flex items-center justify-between px-6 py-4 mb-2 rounded-lg border-l-4 shadow-lg backdrop-blur-sm transition-all duration-300 ease-in-out";
    
    const variants = {
      error: "bg-red-50 border-red-500 text-red-900 shadow-red-100",
      success: "bg-green-50 border-green-500 text-green-900 shadow-green-100", 
      alert: "bg-yellow-50 border-yellow-500 text-yellow-900 shadow-yellow-100",
      secondary: "bg-gray-50 border-gray-500 text-gray-900 shadow-gray-100"
    };

    return `${baseStyles} ${variants[variant]}`;
  };

  const getIcon = () => {
    const iconClass = "h-6 w-6 mr-3 flex-shrink-0";
    
    if (loading) {
      return <Loader2 className={`${iconClass} animate-spin`} />;
    }

    const icons = {
      error: <XCircle className={`${iconClass} text-red-600`} />,
      success: <CheckCircle className={`${iconClass} text-green-600`} />,
      alert: <AlertTriangle className={`${iconClass} text-yellow-600`} />,
      secondary: <Info className={`${iconClass} text-gray-600`} />
    };

    return icons[variant];
  };

  const getCloseButtonStyles = () => {
    const baseStyles = "ml-4 p-1 rounded-full hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1";
    
    const variants = {
      error: "hover:bg-red-100 focus:ring-red-300 text-red-600",
      success: "hover:bg-green-100 focus:ring-green-300 text-green-600",
      alert: "hover:bg-yellow-100 focus:ring-yellow-300 text-yellow-600", 
      secondary: "hover:bg-gray-100 focus:ring-gray-300 text-gray-600"
    };

    return `${baseStyles} ${variants[variant]}`;
  };

  return (
    <div 
      className={`${getVariantStyles()} ${
        isVisible && !isRemoving 
          ? 'opacity-100 translate-y-0 scale-100' 
          : 'opacity-0 translate-y-2 scale-95'
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center flex-1 min-w-0">
        {getIcon()}
        <p className="font-medium text-sm leading-5 break-words">
          {message}
        </p>
      </div>
      
      {!loading && (
        <button
          onClick={handleClose}
          className={getCloseButtonStyles()}
          aria-label="Close notification"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default Toast;