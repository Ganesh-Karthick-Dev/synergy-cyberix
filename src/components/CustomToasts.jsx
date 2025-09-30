import { toast } from 'react-hot-toast';

// Loading Spinner Component
const LoadingSpinner = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className={`${sizeClasses[size]} relative`}>
      <div className="absolute inset-0 rounded-full border-2 border-current border-t-transparent animate-spin opacity-30"></div>
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-current animate-spin"></div>
    </div>
  );
};

// Success Icon with Animation
const SuccessIcon = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className={`${sizeClasses[size]} text-green-500 relative overflow-hidden`}>
      <svg 
        className="w-full h-full animate-scale-in" 
        fill="currentColor" 
        viewBox="0 0 20 20"
      >
        <path 
          fillRule="evenodd" 
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
          clipRule="evenodd" 
        />
      </svg>
    </div>
  );
};

// Error Icon with Animation
const ErrorIcon = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className={`${sizeClasses[size]} text-red-500 relative overflow-hidden`}>
      <svg 
        className="w-full h-full animate-shake" 
        fill="currentColor" 
        viewBox="0 0 20 20"
      >
        <path 
          fillRule="evenodd" 
          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
          clipRule="evenodd" 
        />
      </svg>
    </div>
  );
};

// Warning Icon with Animation
const WarningIcon = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className={`${sizeClasses[size]} text-amber-500 relative overflow-hidden`}>
      <svg 
        className="w-full h-full animate-pulse-slow" 
        fill="currentColor" 
        viewBox="0 0 20 20"
      >
        <path 
          fillRule="evenodd" 
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" 
          clipRule="evenodd" 
        />
      </svg>
    </div>
  );
};

// Custom Toast Functions with Professional Styling
export const showLoadingToast = (message = 'Loading...', options = {}) => {
  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-gray-900/5 backdrop-blur-sm`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <LoadingSpinner />
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">{message}</p>
            <div className="mt-1 w-full bg-gray-200 rounded-full h-1">
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-1 rounded-full animate-progress"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  ), {
    duration: Infinity,
    position: 'top-center',
    ...options
  });
};

export const showSuccessToast = (message, options = {}) => {
  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-green-900/10 border border-green-100 backdrop-blur-sm`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
              <SuccessIcon />
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">{message}</p>
            <p className="mt-1 text-sm text-green-600">Operation completed successfully</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-green-600 hover:text-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          ✕
        </button>
      </div>
    </div>
  ), {
    duration: 4000,
    position: 'top-center',
    ...options
  });
};

export const showErrorToast = (message, options = {}) => {
  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-red-900/10 border border-red-100 backdrop-blur-sm`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <ErrorIcon />
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">{message}</p>
            <p className="mt-1 text-sm text-red-600">Please check your credentials and try again</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-red-600 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          ✕
        </button>
      </div>
    </div>
  ), {
    duration: 6000,
    position: 'top-center',
    ...options
  });
};

export const showWarningToast = (message, options = {}) => {
  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-2xl rounded-2xl pointer-events-auto flex ring-1 ring-amber-900/10 border border-amber-100 backdrop-blur-sm`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
              <WarningIcon />
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">{message}</p>
            <p className="mt-1 text-sm text-amber-600">Please review and proceed with caution</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-2xl p-4 flex items-center justify-center text-sm font-medium text-amber-600 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          ✕
        </button>
      </div>
    </div>
  ), {
    duration: 5000,
    position: 'top-center',
    ...options
  });
};

// Promise-based toast for async operations
export const showPromiseToast = (promise, messages = {}) => {
  const defaultMessages = {
    loading: 'Processing your request...',
    success: 'Operation completed successfully!',
    error: 'Something went wrong!'
  };

  return toast.promise(promise, {
    ...defaultMessages,
    ...messages
  }, {
    style: {
      minWidth: '300px',
    },
    success: {
      duration: 4000,
      icon: '🎉',
    },
    error: {
      duration: 6000,
      icon: '❌',
    },
    loading: {
      icon: '⏳',
    },
  });
};