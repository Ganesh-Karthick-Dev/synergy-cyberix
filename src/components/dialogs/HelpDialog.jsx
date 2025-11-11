import React from 'react'

const HelpDialog = ({ isOpen, onClose, content }) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {content ? 'Website Security Audit' : 'Detailed Description of All Scans'}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {content ? 'Learn about the security audit checks' : 'Learn about each security scan and why it matters'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-gray-700 dark:text-gray-300 hover:from-red-100 hover:to-red-200 dark:hover:from-red-900 dark:hover:to-red-800 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 flex items-center justify-center font-bold"
            >
              ×
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {content ? (
            content
          ) : (
            <>
              {/* DNS Resolution & Analysis */}
          <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                </svg>
              </div>
              DNS Resolution & Analysis
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks your domain name system (DNS) setup and resolves IP addresses correctly.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Misconfigured DNS can make your site unreachable or vulnerable to DNS attacks.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> DNS is like the phonebook of the internet—if the phonebook is wrong, no one can reach you.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures your website is reliably accessible and protected from DNS hijacking.</p>
            </div>
          </div>

          {/* SSL/TLS Analysis */}
          <div className="group bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              SSL/TLS Analysis
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Verifies your website's encryption and secure protocols.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Weak SSL/TLS allows attackers to intercept sensitive data.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> SSL/TLS is the invisible shield protecting online banking, email, and login credentials.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps user data safe during transmission, enhancing trust.</p>
            </div>
          </div>

          {/* Security Headers */}
          <div className="group bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-teal-500 dark:border-teal-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              Security Headers
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks HTTP headers like Content-Security-Policy and X-Frame-Options.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Headers prevent attacks like clickjacking, XSS, and code injection.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Missing headers can let hackers "trick" browsers into executing malicious scripts.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Adds an extra layer of defense for visitors' browsers.</p>
            </div>
          </div>

          {/* CMS Detection */}
          <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              CMS Detection
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies if your site is running WordPress, Joomla, Drupal, etc.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Knowing the CMS helps spot known vulnerabilities quickly.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Hackers often target outdated CMS versions—they are low-hanging fruit.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps keep your site updated and secure.</p>
            </div>
          </div>

          {/* Subdomain Enumeration */}
          <div className="group bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Subdomain Enumeration
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Finds all subdomains associated with your domain.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Hidden subdomains can expose sensitive areas to attackers.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many breaches occur via forgotten subdomains.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Gives you a complete picture of your online footprint.</p>
            </div>
          </div>

          {/* Port Scanning */}
          <div className="group bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-teal-500 dark:border-teal-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              Port Scanning
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks open network ports on your server.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Open ports can be exploited to gain unauthorized access.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Hackers often scan ports before launching attacks.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps secure your server from unnecessary exposure.</p>
            </div>
          </div>

          {/* SQL Injection Test */}
          <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              SQL Injection Test
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects vulnerabilities where attackers can inject malicious SQL commands.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> SQL injections can leak or delete sensitive data.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> SQL injection has caused some of the biggest data breaches in history.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects your database and user information.</p>
            </div>
          </div>

          {/* Cross-Site Scripting (XSS) Testing */}
          <div className="group bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              Cross-Site Scripting (XSS) Testing
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies if attackers can inject malicious scripts into your site.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> XSS can steal cookies, session tokens, or even redirect users.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many phishing attacks rely on XSS vulnerabilities.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps your site safe from malicious scripts affecting users.</p>
            </div>
          </div>

          {/* Cross-Site Request Forgery (CSRF) Testing */}
          <div className="group bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-yellow-500 dark:border-yellow-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9H15a2 2 0 002-2V5a2 2 0 00-2-2h-.878M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Cross-Site Request Forgery (CSRF) Testing
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks if attackers can trick users into performing unwanted actions.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> CSRF can let hackers transfer money, change passwords, or delete data.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> CSRF attacks exploit trust between a user's browser and the website.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects user actions and sensitive transactions.</p>
            </div>
          </div>

          {/* WAF (Firewall) Detection */}
          <div className="group bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              WAF (Firewall) Detection
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects if a Web Application Firewall is active.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> WAFs block malicious traffic and attacks.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Not all WAFs are equal—some let advanced attacks slip through.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures your firewall is in place and functioning correctly.</p>
            </div>
          </div>

          {/* File Upload Vulnerability Check */}
          <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              File Upload Vulnerability Check
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Tests if uploaded files can execute malicious code.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Vulnerable upload features can allow malware or ransomware.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Even an image file can hide malicious scripts.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps users and servers safe from harmful uploads.</p>
            </div>
          </div>

          {/* Certificate Transparency (CT) Log Subdomain Discovery */}
          <div className="group bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-purple-500 dark:border-purple-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              Certificate Transparency (CT) Log Subdomain Discovery
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks CT logs to find subdomains and SSL certificates.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps detect rogue certificates or shadow subdomains.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> CT logs are a public record of SSL certificates issued for your domain.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps prevent impersonation or phishing attacks.</p>
            </div>
          </div>

          {/* HTTP Allowed Methods Check */}
          <div className="group bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-orange-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              HTTP Allowed Methods Check
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks which HTTP methods (GET, POST, PUT, DELETE) your server allows.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Unsafe methods can let attackers modify data or access sensitive endpoints.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Many servers leave dangerous methods enabled by default.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Minimizes server attack surface.</p>
            </div>
          </div>

          {/* Host Trust Verification */}
          <div className="group bg-gradient-to-br from-blue-50 to-teal-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-teal-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              Host Trust Verification
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Ensures the server is legitimate and not maliciously impersonated.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps prevent man-in-the-middle attacks.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> A fake host can intercept all communications with your website.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Protects users from fake or phishing websites.</p>
            </div>
          </div>

          {/* CORS Policy Validation */}
          <div className="group bg-gradient-to-br from-red-50 to-pink-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-red-500 dark:border-red-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
              </div>
              CORS Policy Validation
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Checks Cross-Origin Resource Sharing (CORS) settings.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Poor CORS settings can let malicious sites access sensitive data.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Misconfigured CORS is a common vulnerability in modern web apps.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Ensures data is shared safely across trusted domains.</p>
            </div>
          </div>

          {/* Open Redirect Check */}
          <div className="group bg-gradient-to-br from-orange-50 to-red-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-orange-500 dark:border-orange-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              Open Redirect Check
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Detects if your site redirects users to malicious URLs.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Open redirects are often used in phishing scams.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> A single open redirect can make users fall for scams even on trusted domains.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Keeps users from being tricked or redirected to unsafe sites.</p>
            </div>
          </div>

          {/* Quick Fingerprint */}
          <div className="group bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-slate-800 dark:to-slate-700 rounded-xl p-6 border-l-4 border-blue-500 dark:border-blue-400 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.01]">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center shadow-md">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              Quick Fingerprint
            </h3>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 ml-0">
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">What it does:</span> Identifies the technologies, frameworks, and server software your site uses.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Why it matters:</span> Helps you understand your attack surface and potential vulnerabilities.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Interesting fact:</span> Attackers often start by fingerprinting a site to find weak points.</p>
              <p className="leading-relaxed"><span className="font-bold text-gray-900 dark:text-gray-100">Day-to-day benefit:</span> Helps admins make informed decisions about updates and security measures.</p>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default HelpDialog

