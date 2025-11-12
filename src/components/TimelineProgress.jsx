import React from 'react';
import { CheckCircle, Clock, Loader2, XCircle, AlertCircle } from 'lucide-react';

const TimelineProgress = ({ steps, currentStep }) => {
  const getStepStatus = (stepIndex) => {
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
  };

  const getStepIcon = (status, stepIndex) => {
    if (status === 'completed') {
      return <CheckCircle className="w-6 h-6 text-green-600" />;
    }
    if (status === 'active') {
      return <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />;
    }
    if (status === 'error') {
      return <XCircle className="w-6 h-6 text-red-600" />;
    }
    return <Clock className="w-6 h-6 text-gray-400" />;
  };

  const getStepColor = (status) => {
    if (status === 'completed') return 'border-green-500 bg-green-50 dark:bg-green-900/20';
    if (status === 'active') return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    if (status === 'error') return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    return 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800';
  };

  const getTextColor = (status) => {
    if (status === 'completed') return 'text-green-700 dark:text-green-400';
    if (status === 'active') return 'text-blue-700 dark:text-blue-400 font-semibold';
    if (status === 'error') return 'text-red-700 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="space-y-6">
        {steps.map((step, index) => {
          const status = step.error ? 'error' : getStepStatus(index);
          const isLast = index === steps.length - 1;

          return (
            <div key={index} className="relative">
              {/* Connector Line */}
              {!isLast && (
                <div
                  className={`absolute left-6 top-12 w-0.5 h-full ${
                    index < currentStep
                      ? 'bg-green-500'
                      : index === currentStep
                      ? 'bg-blue-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  style={{ height: 'calc(100% + 1.5rem)' }}
                />
              )}

              {/* Step Content */}
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center ${getStepColor(
                    status
                  )}`}
                >
                  {getStepIcon(status, index)}
                </div>

                {/* Step Details */}
                <div className="flex-1 pt-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`text-lg font-medium ${getTextColor(status)}`}>
                      {step.title}
                    </h3>
                    {step.progress !== undefined && status === 'active' && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {Math.round(step.progress)}%
                      </span>
                    )}
                  </div>

                  {step.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {step.description}
                    </p>
                  )}

                  {step.message && status === 'active' && (
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
                      {step.message}
                    </p>
                  )}

                  {step.error && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                      <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-red-700 dark:text-red-400">{step.error}</p>
                    </div>
                  )}

                  {/* Progress Bar for Active Step */}
                  {status === 'active' && step.progress !== undefined && (
                    <div className="mt-3">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${step.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Completion Time */}
                  {status === 'completed' && step.completedAt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Completed at {new Date(step.completedAt).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimelineProgress;

