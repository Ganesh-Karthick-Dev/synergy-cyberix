// Kali Repo Installer: ensures pip, creates /root/cyberix, clones multiple repos, installs requirements

/**
 * Normalize a git URL to a target directory name.
 * Examples:
 *  - https://github.com/almandin/fuxploider.git -> fuxploider
 *  - git@github.com:user/repo.git -> repo
 */
function getRepoFolderName(gitUrl) {
  try {
    const noTrailing = gitUrl.trim().replace(/\/.git$/i, '');
    const parts = noTrailing.split('/');
    const last = parts[parts.length - 1] || '';
    return last.replace(/\.git$/i, '') || 'repo';
  } catch (_e) {
    return 'repo';
  }
}

async function run(command, password) {
  if (!window?.cyberGuard?.runWslCommand) {
    return { success: false, error: 'WSL bridge not available' };
  }
  return await window.cyberGuard.runWslCommand(command, password);
}

async function runAsRoot(command) {
  if (!window?.cyberGuard?.runAsRoot) {
    return { success: false, error: 'WSL root bridge not available' };
  }
  return await window.cyberGuard.runAsRoot({ distro: null, command, requireConfirm: false, useStoredPassword: true });
}

/**
 * Ensure pip is available; returns boolean.
 */
export async function ensurePipAvailable(password) {
  const check = await run('command -v pip3 || command -v pip', password);
  return !!(check && check.success && (check.stdout || '').trim().length > 0);
}

/**
 * Ensures /cybrix exists at filesystem root.
 */
export async function ensureCyberixRootDir(password) {
  return await runAsRoot('bash -lc "install -d -m 755 /cybrix"');
}

/**
 * Ensure a global Python virtual environment exists at /cybrix/.venv and is bootstrapped.
 */
export async function ensureGlobalVenv() {
  // Create if missing, then upgrade core packaging tools inside the venv
  const cmd = 'bash -lc "set -e; install -d -m 755 /cybrix; cd /cybrix; ' +
              'if [ ! -d venv ]; then python3 -m venv venv; fi; ' +
              '. venv/bin/activate; ' +
              'python3 -m pip install --upgrade pip setuptools wheel"';
  return await runAsRoot(cmd);
}

/**
 * Clone a repo if not already present at /root/cyberix/<name>.
 */
export async function cloneRepoIfMissing(gitUrl, password) {
  const name = getRepoFolderName(gitUrl);
  const path = `/cybrix/${name}`;
  const exists = await runAsRoot(`bash -lc "[ -d '${path}' ] && echo 'YES' || echo 'NO'"`);
  if (exists.success && (exists.stdout || '').includes('YES')) {
    return { success: true, path, skipped: true };
  }
  const clone = await runAsRoot(`bash -lc "cd /cybrix && git clone ${gitUrl}"`);
  if (!clone.success) return clone;
  return { success: true, path, skipped: false };
}

/**
 * Install requirements if requirements.txt exists in repo folder.
 */
export async function installRequirementsIfPresent(repoPath, password) {
  const check = await runAsRoot(`bash -lc "[ -f '${repoPath}/requirements.txt' ] && echo 'YES' || echo 'NO'"`);
  if (!(check.success) || !(check.stdout || '').includes('YES')) {
    return { success: true, skipped: true };
  }
  // Use the shared /cybrix virtual environment (named venv) and install repo requirements there
  const cmd = `bash -lc "set -e; cd '${repoPath}'; \
    if [ ! -d /cybrix/venv ]; then python3 -m venv /cybrix/venv; fi; \
    . /cybrix/venv/bin/activate; \
    python3 -m pip install --upgrade pip setuptools wheel; \
    pip install --no-cache-dir -r requirements.txt"`;
  return await runAsRoot(cmd);
}

/**
 * Ensure multiple git URLs are cloned under /root/cyberix and dependencies installed.
 * Accepts any number of URLs now or in the future.
 */
export async function ensureReposInstalled(gitUrls, password, onProgress) {
  const urls = Array.isArray(gitUrls) ? gitUrls.filter(Boolean) : [];
  const progress = (msg) => { if (typeof onProgress === 'function') onProgress(msg); };

  progress('Checking pip...');
  const pipOk = await ensurePipAvailable(password);
  if (!pipOk) {
    // Attempt to install pip3
    progress('Installing pip3...');
    const pipInstall = await run('sudo -S bash -lc "apt update -y && apt install -y python3-pip"', password);
    if (!pipInstall.success) return { success: false, error: 'Failed to install pip3' };
  }

  // Ensure essential build and venv dependencies exist
  progress('Ensuring Python venv and build dependencies...');
  const deps = await runAsRoot('bash -lc "apt update -y && apt install -y python3-venv python3-full python3-pip git build-essential libffi-dev libssl-dev"');
  if (!deps.success) return { success: false, error: 'Failed to install Python/Kali dependencies' };

  progress('Preparing /cybrix and global virtual environment...');
  const dir = await ensureCyberixRootDir(password);
  if (!dir.success) return { success: false, error: 'Failed to create /cybrix' };
  const venv = await ensureGlobalVenv();
  if (!venv.success) return { success: false, error: 'Failed to prepare /cybrix virtual environment' };

  // Verify venv exists by listing /cybrix and checking for 'venv'
  progress('Verifying virtual environment...');
  const list = await runAsRoot('bash -lc "cd /cybrix && ls -1a"');
  if (!(list?.success)) return { success: false, error: 'Failed to list /cybrix for venv verification' };
  const hasVenv = (list.stdout || '').split('\n').map(s => s.trim()).includes('venv');
  if (!hasVenv) return { success: false, error: 'venv not found after creation in /cybrix' };
  progress('Activating /cybrix/venv...');
  const activate = await runAsRoot('bash -lc ". /cybrix/venv/bin/activate && python -m pip --version"');
  if (!activate.success) return { success: false, error: 'Failed to activate /cybrix/venv' };

  for (const url of urls) {
    const name = getRepoFolderName(url);
    progress(`Cloning ${name} if missing...`);
    const cloned = await cloneRepoIfMissing(url, password);
    if (!cloned.success) return { success: false, error: `Failed to clone ${name}` };
    const repoPath = cloned.path;
    progress(`Installing requirements for ${name} (if any)...`);
    const req = await installRequirementsIfPresent(repoPath, password);
    if (!req.success) return { success: false, error: `Failed to install requirements for ${name}` };
  }

  return { success: true };
}

export default {
  ensurePipAvailable,
  ensureCyberixRootDir,
  cloneRepoIfMissing,
  installRequirementsIfPresent,
  ensureReposInstalled
};


