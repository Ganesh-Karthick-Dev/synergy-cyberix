const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const { detectKaliEnvironment } = require('../main/osCheck');

// Global environment cache
let environmentCache = null;

function escapeDoubleQuotes(s) {
  return (s || '').replace(/"/g, '\\"');
}

// Detect and cache environment type
async function getEnvironment() {
  if (!environmentCache) {
    environmentCache = await detectKaliEnvironment();
  }
  return environmentCache;
}

// Execute commands based on detected environment
async function executeCommand(command, asRoot = false, useRaw = false) {
  const env = await getEnvironment();

  if (env.type === 'wsl-kali') {
    // Windows with WSL Kali
    return await executeWSLCommand(command, asRoot, useRaw);
  } else if (env.type === 'native-kali') {
    // Native Kali Linux
    return await executeNativeCommand(command, asRoot, useRaw);
  } else {
    // Fallback to native Linux
    return await executeNativeCommand(command, asRoot, useRaw);
  }
}

// Windows WSL execution
async function executeWSLCommand(command, asRoot = false, useRaw = false) {
  const escaped = escapeDoubleQuotes(command);
  let full;

  if (useRaw) {
    full = `wsl -d kali-linux ${command}`;
  } else if (asRoot) {
    full = `wsl -d kali-linux -u root bash -lc "${escaped}"`;
  } else {
    full = `wsl -d kali-linux bash -lc "${escaped}"`;
  }

  try {
    const { stdout, stderr } = await execPromise(full, { maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

// Native Linux/Kali execution
async function executeNativeCommand(command, asRoot = false, useRaw = false) {
  let full;

  if (useRaw) {
    full = command;
  } else if (asRoot) {
    const escaped = escapeDoubleQuotes(command);
    full = `sudo bash -lc "${escaped}"`;
  } else {
    full = `bash -lc "${command}"`;
  }

  try {
    const { stdout, stderr } = await execPromise(full, { maxBuffer: 10 * 1024 * 1024 });
    return { success: true, stdout: (stdout || '').trim(), stderr: (stderr || '').trim() };
  } catch (error) {
    return { success: false, error: error.message, stdout: error.stdout || '', stderr: error.stderr || '' };
  }
}

// Legacy function aliases for backward compatibility
async function runWSLAsRoot(command) {
  return await executeCommand(command, true, false);
}

async function runWSL(command) {
  return await executeCommand(command, false, false);
}

async function runWSLRaw(command) {
  return await executeCommand(command, false, true);
}

async function checkWSL() {
  const env = await getEnvironment();
  return env.type === 'wsl-kali';
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
  getEnvironment,
  executeCommand,
  runWSLAsRoot,
  runWSL,
  runWSLRaw,
  checkWSL,
  checkTool,
  getToolVersion
};


