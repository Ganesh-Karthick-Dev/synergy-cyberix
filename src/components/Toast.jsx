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
    const baseStyles = "relative flex items-center justify-between px-6 py-4 mb-2 shadow-lg backdrop-blur-sm transition-all duration-500 ease-in-out w-full";
    
    const variants = {
      error: "bg-red-500 text-white shadow-red-200",
      success: "bg-green-500 text-white shadow-green-200", 
      alert: "bg-yellow-500 text-white shadow-yellow-200",
      secondary: "bg-gray-500 text-white shadow-gray-200"
    };

    return `${baseStyles} ${variants[variant]}`;
  };

  const getIcon = () => {
    const iconClass = "h-6 w-6 mr-3 flex-shrink-0";
    
    if (loading) {
      return <Loader2 className={`${iconClass} animate-spin`} />;
    }

    const icons = {
      error: <XCircle className={`${iconClass} text-white`} />,
      success: <CheckCircle className={`${iconClass} text-white`} />,
      alert: <AlertTriangle className={`${iconClass} text-white`} />,
      secondary: <Info className={`${iconClass} text-white`} />
    };

    return icons[variant];
  };

  const getCloseButtonStyles = () => {
    const baseStyles = "ml-4 p-1 rounded-full hover:scale-110 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1";
    
    const variants = {
      error: "hover:bg-red-600 focus:ring-red-300 text-white",
      success: "hover:bg-green-600 focus:ring-green-300 text-white",
      alert: "hover:bg-yellow-600 focus:ring-yellow-300 text-white", 
      secondary: "hover:bg-gray-600 focus:ring-gray-300 text-white"
    };

    return `${baseStyles} ${variants[variant]}`;
  }; 

  return (
    <div 
      className={`${getVariantStyles()} ${
        isVisible && !isRemoving 
          ? 'opacity-100 translate-y-0 scale-100' 
          : isRemoving
          ? 'opacity-0 translate-y-full scale-95'
          : 'opacity-0 translate-y-full scale-95'
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