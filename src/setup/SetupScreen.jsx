import React, { useEffect, useMemo, useRef, useState } from 'react';

const ALL_TOOLS = [
  'pip3','curl','wget','unzip',
  'jq','ffuf','nuclei','dalfox','go',
  'nmap','nikto','sqlmap','hydra','gobuster','dirb','theharvester','amass','john','medusa','mitmproxy','socat','fail2ban','dnstwist','tgpt'
];

const STORAGE_KEY = 'cybrix.setup.state.v1';

function usePersisted(initial) {
  const [state, setState] = useState(() => {
    try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? { ...initial, ...JSON.parse(raw) } : initial; } catch { return initial; }
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }, [state]);
  return [state, setState];
}

function Bar({ value, color }) {
  return (
    <div className="w-full bg-gray-200 rounded">
      <div className={`${color} h-2 rounded transition-all`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function LogBox({ lines }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);
  return (
    <div ref={ref} className="mt-3 max-h-56 overflow-auto bg-white border border-gray-200 rounded p-2 text-xs font-mono">
      {lines.length === 0 ? <div className="text-gray-400">No logs yet…</div> : lines.map((l,i)=>(<div key={i} className="whitespace-pre-wrap">{l}</div>))}
    </div>
  );
}

export default function SetupScreen({ onReady }) {
  const [state, setState] = usePersisted({
    phase: 'detect', // detect | wsl | tools | done
    wslInstalled: null,
    kaliProgress: 0,
    kaliMessage: 'Checking WSL/Kali…',
    logs: [],
    password: '',
    askingPassword: false,
    tools: ALL_TOOLS.map(name => ({ name, status: 'pending', progress: 0, message: '' })),
    currentIndex: 0,
    overallInstalled: 0,
    error: null,
    installationStarted: false // Flag to prevent multiple simultaneous installations
  });

  const allInstalled = useMemo(() => state.tools.every(t => t.status === 'installed'), [state.tools]);

  useEffect(() => {
    if (state.phase !== 'detect') return;
    (async () => {
      try {
        const hasWsl = await window.cyberGuard?.checkWSLRootless?.();
        if (!hasWsl) {
          setState(s => ({ ...s, wslInstalled: false, phase: 'wsl', logs: [...s.logs, 'WSL not detected. Starting installation…'] }));
          return;
        }
        setState(s => ({ ...s, wslInstalled: true, phase: 'tools', logs: [...s.logs, 'WSL detected ✓'] }));
        // Quick tool verify (non-blocking if not available)
        try {
          const mapping = await window.cyberGuard?.checkAllToolsRootless?.();
          if (mapping && typeof mapping === 'object') {
            setState(s => ({ ...s, tools: s.tools.map(t => ({ ...t, status: mapping[t.name] ? 'installed' : 'pending', progress: mapping[t.name] ? 100 : 0 })) }));
          }
        } catch {}
      } catch (e) {
        setState(s => ({ ...s, error: e?.message || String(e) }));
      }
    })();
  }, [state.phase, setState]);

  useEffect(() => {
    if (state.phase !== 'wsl') return;
    const off = window.cyberGuard?.onKaliInstallProgress?.((p) => {
      if (!p) return;
      setState(s => ({ ...s, kaliProgress: p.percentage ?? s.kaliProgress, kaliMessage: p.message || s.kaliMessage, logs: [...s.logs, p.message || ''] }));
    });
    (async () => {
      try {
        const ok = await window.cyberGuard?.installKali?.();
        if (ok) {
          setState(s => ({ ...s, kaliProgress: 100, logs: [...s.logs, 'WSL + Kali Installed ✓'], phase: 'tools', wslInstalled: true }));
        } else {
          setState(s => ({ ...s, error: 'Kali installation did not complete' }));
        }
      } catch (e) {
        setState(s => ({ ...s, error: e?.message || String(e) }));
      }
    })();
    return () => { void off; };
  }, [state.phase, setState]);

  // Auto-start installation in tools phase (rootless installer, no password)
  useEffect(() => {
    if (state.phase !== 'tools') return;
    if (state.installationStarted) return; // Prevent multiple starts
    
    const pending = state.tools.some(t => t.status !== 'installed');
    if (!pending) return;
    
    console.log('[SETUP] Auto-starting tool installation...');
    console.log('[SETUP] Pending tools:', state.tools.filter(t => t.status !== 'installed').map(t => t.name));
    
    // Set flag to prevent multiple starts
    setState(s => ({ ...s, installationStarted: true }));
    
    // Small delay to ensure state is settled
    const timer = setTimeout(async () => {
      try {
        await startInstall(null);
      } catch (error) {
        console.error('[SETUP] Auto-installation error:', error);
        setState(s => ({ 
          ...s, 
          error: error?.message || 'Installation failed. Please check console for details.',
          installationStarted: false,
          logs: [...s.logs, `❌ Installation error: ${error?.message || String(error)}`]
        }));
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [state.phase, state.tools]);

  const promptPassword = () => {
    setState(s => ({ ...s, askingPassword: true }));
  };

  const startInstall = async (_pwd) => {
    setState(s => ({ 
      ...s, 
      askingPassword: false, 
      logs: [...s.logs, '🔐 Starting automatic tool installation...'], 
      error: null,
      installationStarted: true
    }));
    
    try {
      console.log('[SETUP] Starting installation via installAllToolsRootless...');
      
      // Set up progress listener BEFORE calling install
      const progressListener = (p) => {
        if (!p) return;
        console.log('[SETUP] Installation progress:', p);
        
        setState(s => {
          if (p.tool) {
            const updatedTools = s.tools.map((t) => 
              t.name === p.tool 
                ? { 
                    ...t, 
                    status: p.progress >= 100 ? 'installed' : 'installing', 
                    progress: Math.max(t.progress, p.progress ?? t.progress), 
                    message: p.message || t.message 
                  } 
                : t
            );
            return { 
              ...s, 
              tools: updatedTools, 
              logs: p.message ? [...s.logs, p.message] : s.logs 
            };
          } else if (p.phase === 'installing') {
            return { 
              ...s, 
              logs: [...s.logs, p.message || `Installing ${p.tool}…`], 
              currentIndex: Math.max(0, (p.current || 1) - 1) 
            };
          } else if (p.phase === 'complete') {
            return { 
              ...s, 
              logs: [...s.logs, p.message || 'Installation complete'], 
              overallInstalled: p.overallProgress || 100 
            };
          }
          return s;
        });
      };

      // Register the progress listener
      window.cyberGuard?.onInstallProgress?.(progressListener);
      
      // Install all tools via rootless installer
      console.log('[SETUP] Calling installAllToolsRootless...');
      const result = await window.cyberGuard?.installAllToolsRootless?.();
      console.log('[SETUP] Installation result:', result);
      
      // Install tgpt separately (it's not in apt package list, installed via curl script)
      const tgptTool = state.tools.find(t => t.name === 'tgpt');
      if (tgptTool && tgptTool.status !== 'installed') {
        setState(s => ({ 
          ...s, 
          logs: [...s.logs, 'Installing tgpt (AI analysis tool)...'],
          tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'installing', progress: 0, message: 'Installing tgpt...' } : t)
        }));
        
        try {
          // Note: tgpt installation requires password, but we're using rootless installer
          // Try to install tgpt - it will use root user if available
          if (window.cyberGuard?.checkAndInstallTgpt) {
            // For rootless installation, we can try without password (uses -u root)
            // If password is needed, it will be handled by the backend
            try {
              // Try with empty password first (rootless mode)
              const tgptResult = await window.cyberGuard.checkAndInstallTgpt(null);
              if (tgptResult?.installed) {
                setState(s => ({ 
                  ...s, 
                  logs: [...s.logs, '✅ tgpt installed successfully'],
                  tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'installed', progress: 100, message: 'tgpt installed ✓' } : t)
                }));
              } else {
                setState(s => ({ 
                  ...s, 
                  logs: [...s.logs, '⚠️ tgpt installation may require password - will be installed when needed'],
                  tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'pending', message: 'Will install when password is available' } : t)
                }));
              }
            } catch (tgptError) {
              console.warn('tgpt installation failed:', tgptError);
              setState(s => ({ 
                ...s, 
                logs: [...s.logs, `⚠️ tgpt installation failed: ${tgptError?.message || 'Unknown error'}. Will retry when password is available.`],
                tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'pending', message: 'Installation pending - requires password' } : t)
              }));
            }
          } else {
            setState(s => ({ 
              ...s, 
              logs: [...s.logs, '⚠️ tgpt installer not available'],
              tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'pending', message: 'Installer not available' } : t)
            }));
          }
        } catch (tgptError) {
          console.warn('tgpt installation error:', tgptError);
          setState(s => ({ 
            ...s, 
            logs: [...s.logs, `⚠️ tgpt installation error: ${tgptError?.message || 'Unknown error'}`],
            tools: s.tools.map(t => t.name === 'tgpt' ? { ...t, status: 'error', message: tgptError?.message || 'Installation failed' } : t)
          }));
        }
      }
      
      // Update state after installation completes
      setState(s => ({ 
        ...s, 
        logs: [...s.logs, '✅ Tool installation completed'], 
        installationStarted: false 
      }));
      
    } catch (e) {
      console.error('[SETUP] Installation error:', e);
      setState(s => ({ 
        ...s, 
        error: e?.message || String(e) || 'Installation failed. Please check console for details.',
        logs: [...s.logs, `❌ Installation error: ${e?.message || String(e)}`],
        installationStarted: false
      }));
    }
  };

  useEffect(() => {
    if (state.phase === 'tools' && allInstalled) {
      setState(s => ({ ...s, phase: 'done', logs: [...s.logs, 'All tools installed ✓'] }));
      try { localStorage.setItem('cybrix.toolsReady', 'true'); } catch {}
      if (typeof onReady === 'function') onReady();
    }
  }, [state.phase, allInstalled]);

  const toolsOverallText = `${Math.min(state.tools.filter(t => t.status === 'installed').length, state.tools.length)} of ${state.tools.length} tools installed`;

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      {state.phase === 'wsl' && (
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">WSL + Kali Linux Installation</h1>
          <p className="text-sm text-gray-600 mt-1">Installing prerequisites…</p>
          <div className="mt-4">
            <Bar value={state.kaliProgress} color={state.kaliProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'} />
            <div className="mt-1 text-xs text-gray-600">{Math.round(state.kaliProgress)}%</div>
          </div>
          <LogBox lines={state.logs} />
        </div>
      )}

      {state.phase === 'tools' && (
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Initial Setup Required</h1>
          <p className="text-sm text-gray-600 mt-1">Install missing security tools in WSL. Dashboard will unlock after completion.</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-700">{toolsOverallText}</div>
            <div className="flex gap-2">
              <button onClick={promptPassword} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Start Installation</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {state.tools.map((t) => (
              <div key={t.name} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-800">{t.name}</div>
                  <div className={`text-xs ${t.status === 'installed' ? 'text-green-600' : t.status === 'installing' ? 'text-blue-600' : t.status === 'error' ? 'text-red-600' : 'text-gray-500'}`}>
                    {t.status === 'installed' ? 'Installed ✓' : t.status === 'installing' ? 'Installing…' : t.status === 'error' ? 'Error' : 'Unavailable'}
                  </div>
                </div>
                <div className="mt-2">
                  <Bar value={t.progress} color={t.status === 'installed' ? 'bg-green-500' : t.status === 'installing' ? 'bg-blue-500' : t.status === 'error' ? 'bg-red-500' : 'bg-gray-300'} />
                  <div className="mt-1 text-xs text-gray-500">{Math.round(t.progress)}%</div>
                </div>
                {t.message && <div className="mt-2 text-xs text-gray-600">{t.message}</div>}
              </div>
            ))}
          </div>

          <LogBox lines={state.logs} />
        </div>
      )}

      {state.phase === 'done' && (
        <div className="text-green-700">
          All tools installed ✓
          <div className="mt-3">
            <button onClick={onReady} className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700">Launch Application</button>
          </div>
        </div>
      )}

      {state.askingPassword && (
        <PasswordModal
          onCancel={() => setState(s => ({ ...s, askingPassword: false }))}
          onSubmit={(pwd) => startInstall(pwd)}
        />
      )}

      {state.error && (
        <div className="mt-4 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">{state.error}</div>
      )}
    </div>
  );
}

function PasswordModal({ onCancel, onSubmit }) {
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded shadow-lg w-full max-w-md p-4">
        <h3 className="text-lg font-semibold text-gray-900">Root access required to install security tools</h3>
        <p className="text-sm text-gray-600 mt-1">Your password will be used to run sudo commands in WSL for this session only.</p>
        <input type="password" value={pwd} onChange={(e)=>setPwd(e.target.value)} placeholder="Enter WSL root password" className="mt-3 w-full border rounded px-3 py-2" />
        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
          <button onClick={() => { if (!pwd) { setErr('Password required'); return; } onSubmit(pwd); }} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Continue</button>
        </div>
      </div>
    </div>
  );
}


