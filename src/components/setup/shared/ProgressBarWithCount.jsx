import React from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';

/**
 * Progress Bar with Count Component
 * Shows progress with current/total count and percentage
 */
const ProgressBarWithCount = ({ 
  current = 0, 
  total = 100, 
  label = '', 
  status = 'active', // 'active', 'completed', 'error'
  showIcon = true,
  className = ''
}) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  const isCompleted = status === 'completed';
  const hasError = status === 'error';

  const getBarColor = () => {
    if (hasError) return 'bg-red-500';
    if (isCompleted) return 'bg-green-500';
    return 'bg-blue-500';
  };

  const getIcon = () => {
    if (!showIcon) return null;
    
    if (isCompleted) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (hasError) {
      return <Loader2 className="w-4 h-4 text-red-500 animate-spin" />;
    }
    return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {label || 'Progress'}
          </span>
        </div>
        <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
          {current} / {total} ({percentage}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full ${getBarColor()} transition-all duration-300 ease-out`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBarWithCount;

