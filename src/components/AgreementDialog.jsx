import React, { useState } from 'react';
import { X, Shield, CheckCircle } from 'lucide-react';

const AgreementDialog = ({ onAccept, onReject }) => {
  const [hasScrolled, setHasScrolled] = useState(false);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const scrolledToBottom = scrollHeight - scrollTop <= clientHeight + 50;
    if (scrolledToBottom && !hasScrolled) {
      setHasScrolled(true);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Terms of Service & Privacy Agreement
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Please read and accept to continue
              </p>
            </div>
          </div>
          <button
            onClick={onReject}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto p-6 text-gray-700 dark:text-gray-300"
          onScroll={handleScroll}
        >
          <div className="space-y-4">
            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                1. Software License
              </h3>
              <p className="text-sm leading-relaxed">
                Cyberix is a cybersecurity scanning and analysis tool. By using this software, you agree to use it
                responsibly and only on systems you own or have explicit permission to test. Unauthorized scanning of
                systems is illegal and prohibited.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2. System Requirements
              </h3>
              <p className="text-sm leading-relaxed">
                This application requires Windows Subsystem for Linux (WSL) and various security tools to function
                properly. The installation process will:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm ml-4">
                <li>Install WSL if not already present (requires administrator privileges)</li>
                <li>Install Kali Linux distribution in WSL</li>
                <li>Install required security scanning tools</li>
                <li>Configure system paths and directories</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                3. Administrator Privileges
              </h3>
              <p className="text-sm leading-relaxed">
                This application requires administrator privileges to install WSL and system components. You will be
                prompted for administrator access during the setup process. The application will only use these
                privileges for legitimate installation and configuration purposes.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                4. Data Collection & Privacy
              </h3>
              <p className="text-sm leading-relaxed">
                Cyberix stores scan results, logs, and configuration data locally on your system. No data is transmitted
                to external servers without your explicit consent. All data is stored in your user profile directory.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                5. Disclaimer
              </h3>
              <p className="text-sm leading-relaxed">
                This software is provided "as is" without warranty of any kind. The developers are not responsible for
                any damage, data loss, or legal issues arising from the use of this software. Use at your own risk.
              </p>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                6. Acceptable Use
              </h3>
              <p className="text-sm leading-relaxed">
                You agree to use this software only for legitimate security testing, research, and educational purposes.
                Any use for unauthorized access, network intrusion, or malicious activities is strictly prohibited and
                may result in legal action.
              </p>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              {hasScrolled && (
                <>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>You've read the agreement</span>
                </>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onReject}
                className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
              >
                Decline
              </button>
              <button
                onClick={onAccept}
                disabled={!hasScrolled}
                className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Accept & Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgreementDialog;

