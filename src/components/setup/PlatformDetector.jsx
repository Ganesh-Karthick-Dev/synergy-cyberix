import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import MacComingSoonScreen from './MacComingSoonScreen';

/**
 * Platform Detector Component
 * Detects platform and routes to appropriate setup flow
 */
const PlatformDetector = ({ children, onPlatformDetected }) => {
  const [platform, setPlatform] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    detectPlatform();
  }, []);

  const detectPlatform = async () => {
    try {
      if (window.cyberGuard?.getPlatform) {
        const detectedPlatform = await window.cyberGuard.getPlatform();
        setPlatform(detectedPlatform);
        if (onPlatformDetected) {
          onPlatformDetected(detectedPlatform);
        }
      } else {
        // Fallback detection
        const userAgent = navigator.platform || navigator.userAgent;
        if (userAgent.includes('Win')) {
          setPlatform('windows');
        } else if (userAgent.includes('Mac')) {
          setPlatform('mac');
        } else {
          setPlatform('linux');
        }
      }
    } catch (error) {
      console.error('Platform detection error:', error);
      setPlatform('windows'); // Default fallback
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Detecting Platform...
          </h2>
        </div>
      </div>
    );
  }

  // Show Mac coming soon screen
  if (platform === 'mac') {
    return <MacComingSoonScreen />;
  }

  // For Windows and Linux, show the setup flow
  return <>{children}</>;
};

export default PlatformDetector;

