import React from 'react';
import { Apple, Sparkles } from 'lucide-react';

/**
 * Mac Coming Soon Screen
 * Displays a beautiful "coming soon" message for Mac users
 */
const MacComingSoonScreen = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full text-center">
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500 rounded-full blur-3xl opacity-50 animate-pulse" />
            <div className="relative bg-white/10 backdrop-blur-lg rounded-full p-8 border border-white/20">
              <Apple className="w-24 h-24 text-white" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl font-bold text-white mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Coming Soon
        </h1>

        {/* Subtitle */}
        <p className="text-xl text-gray-300 mb-8" style={{ fontFamily: 'Poppins, sans-serif' }}>
          We're working hard to bring Cyberix to macOS
        </p>

        {/* Description */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20 mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-semibold text-white" style={{ fontFamily: 'Poppins, sans-serif' }}>
              What to Expect
            </h2>
          </div>
          <p className="text-gray-300 leading-relaxed" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Our team is developing a native macOS experience with all the powerful security scanning
            features you need. Stay tuned for updates!
          </p>
        </div>

        {/* Footer */}
        <p className="text-gray-400 text-sm" style={{ fontFamily: 'Poppins, sans-serif' }}>
          For now, please use Cyberix on Windows or Linux
        </p>
      </div>
    </div>
  );
};

export default MacComingSoonScreen;

