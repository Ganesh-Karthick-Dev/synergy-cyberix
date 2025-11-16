import React, { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

const Toast = ({ 
  id, 
  message, 
  variant = 'secondary', 
  duration = 5000, 
  onRemove,
  loading = false,
  percentage = null,
  stage = null
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
    // Rounded corners, no elevation (shadow), only 4 colors
    const baseStyles = "relative flex items-center justify-between px-6 py-4 mb-2 rounded-lg backdrop-blur-sm transition-all duration-500 ease-in-out w-full";
    
    const variants = {
      error: "bg-red-500 text-white",
      success: "bg-green-500 text-white", 
      alert: "bg-yellow-500 text-white",
      warning: "bg-yellow-500 text-white", // Alias for alert
      info: "bg-blue-500 text-white",
      secondary: "bg-blue-500 text-white" // Map secondary to blue (info)
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
      warning: <AlertTriangle className={`${iconClass} text-white`} />,
      info: <Info className={`${iconClass} text-white`} />,
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
      warning: "hover:bg-yellow-600 focus:ring-yellow-300 text-white",
      info: "hover:bg-blue-600 focus:ring-blue-300 text-white",
      secondary: "hover:bg-blue-600 focus:ring-blue-300 text-white"
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
      <div className="flex-1 min-w-0">
        <div className="flex items-center">
          {getIcon()}
          <p className="font-medium text-sm leading-5 break-words">
            {message}
          </p>
        </div>
        
        {/* Progress Bar - Show when percentage is provided */}
        {percentage !== null && percentage !== undefined && (
          <div className="mt-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-medium text-white/90">
                {stage ? `${stage.charAt(0).toUpperCase() + stage.slice(1)}` : 'Progress'}
              </span>
              <span className="text-xs font-bold text-white">
                {Math.round(percentage)}%
              </span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-white h-2 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
              />
            </div>
          </div>
        )}
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