// Simple WSL command runner for malware tools (YARA, ClamAV, etc.)
// Provides a promise-based API and streams logs to a callback.

const { spawn } = require('child_process')

function runWslCommand(args, options = {}) {
  const { onStdout, onStderr, cwd } = options
  return new Promise((resolve) => {
    const child = spawn('C:\\Windows\\System32\\wsl.exe', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      const t = d.toString()
      stdout += t
      if (onStdout) onStdout(t)
    })
    child.stderr.on('data', (d) => {
      const t = d.toString()
      stderr += t
      if (onStderr) onStderr(t)
    })
    child.on('close', (code) => resolve({ code, stdout, stderr }))
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err?.message || err) }))
  })
}

async function scanFilesWithYara(distro, rulePathLinux, targetDirLinux, cb) {
  return runWslCommand(['-d', distro, '--', 'sh', '-lc', `yara -r ${rulePathLinux} ${targetDirLinux} || true`], {
    onStdout: (t) => cb && cb('log', t),
    onStderr: (t) => cb && cb('error', t)
  })
}

async function scanFilesWithClamav(distro, targetDirLinux, cb) {
  return runWslCommand(['-d', distro, '--', 'sh', '-lc', `clamscan -r --bell -i ${targetDirLinux} || true`], {
    onStdout: (t) => cb && cb('log', t),
    onStderr: (t) => cb && cb('error', t)
  })
}

// Optional: Execute an on-distro JSON-producing scan script
async function runJsonScanScript(distro, scriptPathLinux, url, outDirLinux, cb) {
  const cmd = `bash ${scriptPathLinux} ${url.replace(/"/g, '')} ${outDirLinux}`
  return runWslCommand(['-d', distro, '--', 'sh', '-lc', `${cmd} || true`], {
    onStdout: (t) => cb && cb('log', t),
    onStderr: (t) => cb && cb('error', t)
  })
}

module.exports = { runWslCommand, scanFilesWithYara, scanFilesWithClamav, runJsonScanScript }


