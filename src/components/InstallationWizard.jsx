import React, { useEffect, useMemo, useRef, useState } from 'react';

const REQUIRED_TOOLS_DEFAULT = [
  { name: 'nmap', type: 'apt' },
  { name: 'nikto', type: 'apt' },
  { name: 'sqlmap', type: 'apt' },
  { name: 'yara', type: 'apt' },
  { name: 'clamav', type: 'apt' },
  { name: 'gobuster', type: 'apt' },
  { name: 'dirb', type: 'apt' },
  { name: 'theharvester', type: 'apt' },
  { name: 'amass', type: 'apt' },
  { name: 'john', type: 'apt' },
  { name: 'medusa', type: 'apt' },
  { name: 'zaproxy', type: 'apt' },
  { name: 'mitmproxy', type: 'apt' }
];

const STORAGE_KEY = 'installerWizardState.v1';

function usePersistentState(initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      return { ...initial, ...parsed };
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  return [state, setState];
}

function classNames(...xs) {
  return xs.filter(Boolean).join(' ');
}

function Bar({ value, color = 'bg-blue-500', height = 'h-2' }) {
  return (
    <div className="w-full bg-gray-200 rounded">
      <div className={classNames(color, height, 'rounded transition-all')} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function LogArea({ lines }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div ref={ref} className="mt-3 w-full max-h-56 overflow-auto rounded border border-gray-200 p-2 text-xs font-mono bg-white">
      {lines.length === 0 ? <div className="text-gray-400">No logs yet…</div> : (
        lines.map((ln, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {ln}
          </div>
        ))
      )}
    </div>
  );
}

export default function InstallationWizard() {
  const [state, setState] = usePersistentState({
    phase: 'detect', // detect | wslInstall | tools | done
    wslDetected: null,
    wslProgress: 0,
    wslStage: 'initializing',
    wslMessage: 'Checking WSL…',
    wslLogs: [],
    tools: REQUIRED_TOOLS_DEFAULT.map(t => ({ name: t.name, type: t.type, status: 'pending', progress: 0, log: [] })),
    activeToolIndex: 0,
    cancelRequested: false,
    error: null
  });

  const toolsComplete = useMemo(() => state.tools.every(t => t.status === 'done'), [state.tools]);

  useEffect(() => {
    if (state.phase !== 'detect') return;
    let mounted = true;

    async function detect() {
      try {
        const hasWsl = await window.cyberGuard?.checkWsl?.();
        if (!mounted) return;
        if (hasWsl) {
          setState(s => ({ ...s, wslDetected: true, phase: 'tools', wslMessage: 'WSL detected ✓' }));
        } else {
          setState(s => ({ ...s, wslDetected: false, phase: 'wslInstall', wslMessage: 'WSL not found. Starting installation…' }));
        }
      } catch (e) {
        setState(s => ({ ...s, error: `Detection failed: ${e?.message || e}` }));
      }
    }

    detect();
    return () => { mounted = false; };
  }, [state.phase, setState]);

  useEffect(() => {
    if (state.phase !== 'wslInstall') return;

    const offProgress = window.cyberGuard?.onKaliInstallProgress?.((p) => {
      setState(s => ({ ...s, wslProgress: p?.percentage ?? s.wslProgress, wslStage: p?.stage || s.wslStage, wslMessage: p?.message || s.wslMessage, wslLogs: [...s.wslLogs, p?.message || ''] }));
    });

    (async () => {
      try {
        // Drive staged messaging 0–100 aligned to the brief
        setState(s => ({ ...s, wslProgress: 5, wslStage: 'initializing', wslLogs: [...s.wslLogs, 'Starting WSL + Kali installation…'] }));
        const ok = await window.cyberGuard?.installKali?.();
        if (ok) {
          setState(s => ({ ...s, wslProgress: 100, wslStage: 'completed', wslLogs: [...s.wslLogs, 'WSL + Kali Linux Installed ✓'], phase: 'tools', wslDetected: true }));
        } else {
          setState(s => ({ ...s, error: 'WSL/Kali installation did not complete. You can retry.', wslLogs: [...s.wslLogs, 'Installation incomplete.'] }));
        }
      } catch (e) {
        setState(s => ({ ...s, error: `WSL install failed: ${e?.message || e}`, wslLogs: [...s.wslLogs, `Error: ${e?.message || e}`] }));
      }
    })();

    return () => {
      // No explicit unsubscribe API; listeners are per-session in this preload design.
      void offProgress;
    };
  }, [state.phase, setState]);

  const startToolsInstall = async () => {
    setState(s => ({ ...s, cancelRequested: false }));
    // Optional: ask backend which are missing; fallback to configured list
    let selected = state.tools.map(t => t.name);
    try {
      const missing = await window.cyberGuard?.checkMissingTools?.();
      if (Array.isArray(missing) && missing.length > 0) {
        selected = missing;
      }
    } catch {}

    for (let i = 0; i < state.tools.length; i += 1) {
      const tool = state.tools[i];
      if (state.cancelRequested) break;
      if (!selected.includes(tool.name)) {
        setState(s => {
          const tools = s.tools.slice();
          tools[i] = { ...tools[i], status: 'done', progress: 100, log: [...tools[i].log, 'Already installed ✓'] };
          return { ...s, tools, activeToolIndex: i + 1 };
        });
        continue;
      }

      setState(s => {
        const tools = s.tools.slice();
        tools[i] = { ...tools[i], status: 'installing', progress: 5, log: [...tools[i].log, `Installing ${tool.name}…`] };
        return { ...s, tools, activeToolIndex: i };
      });

      await installSingleToolSequential(tool.name, i);
    }

    setState(s => ({ ...s }));
  };

  const installSingleToolSequential = async (toolName, index) => {
    const progressListener = (payload) => {
      if (!payload) return;
      const { tool, progress, message } = payload;
      if (tool !== toolName) return;
      setState(s => {
        const tools = s.tools.slice();
        const t = tools[index];
        const nextProg = Number.isFinite(progress) ? progress : t.progress;
        const nextLog = message ? [...t.log, message] : t.log;
        tools[index] = { ...t, progress: Math.max(t.progress, nextProg), log: nextLog };
        return { ...s, tools };
      });
    };
    window.cyberGuard?.onToolsInstallProgress?.(progressListener);

    try {
      await window.cyberGuard?.installSingleTool?.(toolName);
      setState(s => {
        const tools = s.tools.slice();
        const t = tools[index];
        tools[index] = { ...t, status: 'done', progress: 100, log: [...t.log, `✓ ${toolName} Installed`] };
        return { ...s, tools };
      });
    } catch (e) {
      setState(s => {
        const tools = s.tools.slice();
        const t = tools[index];
        tools[index] = { ...t, status: 'error', log: [...t.log, `✗ ${toolName} failed: ${e?.message || e}`] };
        return { ...s, tools, error: `Tool install failed: ${toolName}` };
      });
    }
  };

  const handleCancel = () => {
    setState(s => ({ ...s, cancelRequested: true }));
  };

  const handleRetry = () => {
    setState(s => ({ ...s, error: null }));
    if (state.phase === 'wslInstall') {
      setState(s => ({ ...s, wslLogs: [...s.wslLogs, 'Retrying WSL + Kali installation…'] }));
      // Re-trigger by setting phase again
      setState(s => ({ ...s, phase: 'wslInstall' }));
    } else if (state.phase === 'tools') {
      startToolsInstall();
    }
  };

  const colorFor = (status) => {
    if (status === 'done') return 'bg-green-500';
    if (status === 'installing') return 'bg-blue-500';
    if (status === 'error') return 'bg-red-500';
    return 'bg-gray-300';
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4">
      {state.phase === 'detect' && (
        <div className="text-gray-700">Detecting environment…</div>
      )}

      {state.phase === 'wslInstall' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900">WSL + Kali Linux Installation</h2>
          <p className="mt-1 text-sm text-gray-600">{state.wslMessage}</p>

          <div className="mt-4">
            <Bar value={state.wslProgress} color={state.wslProgress >= 100 ? 'bg-green-500' : 'bg-blue-500'} height="h-3" />
            <div className="mt-2 text-xs text-gray-500">{Math.round(state.wslProgress)}%</div>
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2 text-xs">
            <PhasePill label="Enable WSL" active={state.wslProgress >= 0} done={state.wslProgress >= 20} />
            <PhasePill label="Download Kali" active={state.wslProgress >= 20} done={state.wslProgress >= 40} />
            <PhasePill label="Install Kali" active={state.wslProgress >= 40} done={state.wslProgress >= 70} />
            <PhasePill label="Configure" active={state.wslProgress >= 70} done={state.wslProgress >= 90} />
            <PhasePill label="Verify" active={state.wslProgress >= 90} done={state.wslProgress >= 100} />
          </div>

          <LogArea lines={state.wslLogs} />

          <div className="mt-4 flex gap-2">
            <button onClick={handleCancel} className="px-3 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
            {state.error && (
              <button onClick={handleRetry} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Retry</button>
            )}
          </div>
        </div>
      )}

      {state.phase === 'tools' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tool Installer</h2>
          <p className="mt-1 text-sm text-gray-600">Install required tools in WSL (one by one).</p>

          <div className="mt-4 space-y-3">
            {state.tools.map((t, i) => (
              <div key={t.name} className="border rounded p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-800">{t.name}</div>
                  <div className={classNames('text-xs', t.status === 'done' ? 'text-green-600' : t.status === 'error' ? 'text-red-600' : 'text-blue-600')}>
                    {t.status === 'pending' && 'Pending'}
                    {t.status === 'installing' && 'Installing…'}
                    {t.status === 'done' && 'Installed ✓'}
                    {t.status === 'error' && 'Error'}
                  </div>
                </div>
                <div className="mt-2">
                  <Bar value={t.progress} color={colorFor(t.status)} />
                  <div className="mt-1 text-xs text-gray-500">{Math.round(t.progress)}%</div>
                </div>
                {t.log.length > 0 && (
                  <div className="mt-2 max-h-28 overflow-auto bg-white border border-gray-100 rounded p-2 text-xs font-mono">
                    {t.log.map((l, idx) => (
                      <div key={idx} className="whitespace-pre-wrap">{l}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {`${Math.min(state.activeToolIndex, state.tools.length)} of ${state.tools.length} tools processed`}
            </div>
            <div className="flex gap-2">
              {!toolsComplete && (
                <button onClick={startToolsInstall} className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Start Installation</button>
              )}
              {!toolsComplete && (
                <button onClick={handleCancel} className="px-3 py-2 text-sm rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
              )}
              {toolsComplete && (
                <a href="#/dashboard" className="px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700">Continue to Dashboard</a>
              )}
            </div>
          </div>
        </div>
      )}

      {state.phase === 'done' && (
        <div className="text-green-700">All Tools Installed ✓</div>
      )}

      {state.error && (
        <div className="mt-4 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">{state.error}</div>
      )}
    </div>
  );
}

function PhasePill({ label, active, done }) {
  return (
    <div className={classNames('px-2 py-1 rounded text-center border text-xs',
      done ? 'bg-green-50 text-green-700 border-green-200' : active ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-500 border-gray-200')
    }>
      {done ? '✓ ' : ''}{label}
    </div>
  );
}


