const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const WSL_DISTRO = 'kali-linux';

function escapeDoubleQuotes(s) {
  return (s || '').replace(/"/g, '\\"');
}

async function runWSLAsRoot(command, timeout = 30000) {
  const escaped = escapeDoubleQuotes(command);
  const full = `wsl -d ${WSL_DISTRO} -u root bash -lc "${escaped}"`;
  try {
    const { stdout, stderr } = await execPromise(full, { timeout, maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function runWSL(command, timeout = 30000) {
  const escaped = escapeDoubleQuotes(command);
  const full = `wsl -d ${WSL_DISTRO} bash -lc "${escaped}"`;
  try {
    const { stdout, stderr } = await execPromise(full, { timeout, maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

// Run raw command directly in WSL without bash -c wrapper
async function runWSLRaw(command, timeout = 30000) {
  // Command is passed directly to WSL without bash -c wrapping
  const full = `wsl -d ${WSL_DISTRO} ${command}`;
  try {
    const { stdout, stderr } = await execPromise(full, { timeout, maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

async function checkWSL() {
  try {
    const { stdout } = await execPromise('wsl -l -v', { timeout: 5000 });
    const out = (stdout || '').toLowerCase();
    return out.includes('kali') || out.includes('ubuntu');
  } catch {
    return false;
  }
}

async function checkTool(toolName) {
  const res = await runWSL(`command -v ${toolName} >/dev/null 2>&1 && echo installed || echo missing`);
  return !!(res.success && res.stdout.trim() === 'installed');
}

async function getToolVersion(toolName) {
  const cmds = [`${toolName} --version`, `${toolName} -v`, `${toolName} -V`];
  for (const cmd of cmds) {
    const r = await runWSL(`${cmd} 2>/dev/null`);
    if (r.success && r.stdout) return r.stdout.split('\n')[0];
  }
  return 'unknown';
}

module.exports = {
  WSL_DISTRO,
  runWSLAsRoot,
  runWSL,
  runWSLRaw,
  checkWSL,
  checkTool,
  getToolVersion
};


