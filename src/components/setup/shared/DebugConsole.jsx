import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

/**
 * Debug Console Component
 * Displays scrollable console logs with timestamps and color coding
 */
const DebugConsole = ({ logs = [], className = '' }) => {
  const logEndRef = useRef(null);

  useEffect(() => {
    // Auto-scroll to bottom when new logs are added
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getLogColor = (type) => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'success':
        return 'text-green-400';
      case 'warning':
        return 'text-yellow-400';
      case 'info':
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className={`bg-gray-900 dark:bg-black rounded-lg p-4 font-mono text-sm ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <Terminal className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-300">Debug Console</h3>
      </div>
      <div className="h-full overflow-y-auto max-h-[400px] min-h-[200px]">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-xs">No logs yet...</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log, index) => (
              <div key={index} className="flex gap-2 text-xs">
                <span className="text-gray-500 flex-shrink-0">
                  [{log.timestamp || new Date().toLocaleTimeString()}]
                </span>
                <span className={getLogColor(log.type)}>
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugConsole;

