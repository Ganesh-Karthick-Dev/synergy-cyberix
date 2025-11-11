// Tool installation checker and installer for malware/defacement monitoring
// Uses only apt-installable tools for seamless automatic installation

const { spawn } = require('child_process')

/**
 * Required tools for malware and defacement monitoring
 * All tools must be available via apt package manager
 */
const REQUIRED_TOOLS = [
  // Network capture & analysis
  { name: 'tshark', package: 'tshark', category: 'network' },
  { name: 'tcpdump', package: 'tcpdump', category: 'network' },
  { name: 'ngrep', package: 'ngrep', category: 'network' },
  
  // Web vulnerability scanning
  { name: 'nikto', package: 'nikto', category: 'web' },
  { name: 'wapiti', package: 'wapiti', category: 'web' },
  { name: 'wpscan', package: 'wpscan', category: 'web' },
  
  // Malware & file scanning
  { name: 'clamav', package: 'clamav', category: 'malware' },
  { name: 'clamav-daemon', package: 'clamav-daemon', category: 'malware' },
  { name: 'freshclam', package: 'clamav-freshclam', category: 'malware' },
  { name: 'yara', package: 'yara', category: 'malware' },
  { name: 'rkhunter', package: 'rkhunter', category: 'malware' },
  { name: 'chkrootkit', package: 'chkrootkit', category: 'malware' },
  
  // System auditing
  { name: 'lynis', package: 'lynis', category: 'audit' },
  
  // Helpers & parsing
  { name: 'jq', package: 'jq', category: 'helper' },
  { name: 'curl', package: 'curl', category: 'helper' },
  { name: 'wget', package: 'wget', category: 'helper' },
  { name: 'git', package: 'git', category: 'helper' },
  { name: 'pandoc', package: 'pandoc', category: 'helper' },
  
  // File monitoring
  { name: 'inotifywait', package: 'inotify-tools', category: 'monitoring' }
]

/**
 * Check if a tool is installed in WSL
 * @param {string} distro - WSL distribution name
 * @param {string} toolName - Tool name to check
 * @returns {Promise<{installed: boolean, path?: string}>}
 */
async function checkTool(distro, toolName) {
  return new Promise((resolve) => {
    const command = `command -v ${toolName} || echo "NOT_FOUND"`
    const args = ['-d', distro, '--', 'sh', '-lc', command]
    
    const child = spawn('wsl.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.on('close', () => {
      const path = stdout.trim()
      resolve({
        installed: path !== 'NOT_FOUND' && path.length > 0,
        path: path !== 'NOT_FOUND' ? path : null
      })
    })
    
    child.on('error', () => {
      resolve({ installed: false, path: null })
    })
  })
}

/**
 * Check all required tools
 * @param {string} distro - WSL distribution name
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{allInstalled: boolean, missingTools: Array, toolStatus: Object}>}
 */
async function checkAllTools(distro, onProgress = null) {
  const toolStatus = {}
  const missingTools = []
  
  for (const tool of REQUIRED_TOOLS) {
    onProgress?.({ tool: tool.name, stage: 'checking', message: `Checking ${tool.name}...` })
    
    const status = await checkTool(distro, tool.name)
    toolStatus[tool.name] = {
      ...status,
      package: tool.package,
      category: tool.category
    }
    
    if (!status.installed) {
      missingTools.push(tool)
    }
  }
  
  return {
    allInstalled: missingTools.length === 0,
    missingTools,
    toolStatus
  }
}

/**
 * Install a single tool via apt
 * @param {string} distro - WSL distribution name
 * @param {Object} tool - Tool object with name and package
 * @param {string} password - Sudo password (if needed)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
async function installTool(distro, tool, password = null, onProgress = null) {
  return new Promise((resolve) => {
    // Update package lists first
    const updateCommand = password 
      ? `echo '${password}' | sudo -S apt update -qq`
      : 'sudo apt update -qq'
    
    onProgress?.({ tool: tool.name, stage: 'updating', message: 'Updating package lists...' })
    
    const updateArgs = ['-d', distro, '--', 'sh', '-lc', updateCommand]
    const updateChild = spawn('wsl.exe', updateArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    
    let updateStdout = ''
    let updateStderr = ''
    
    updateChild.stdout.on('data', (data) => {
      const text = data.toString()
      updateStdout += text
      onProgress?.({ tool: tool.name, stage: 'updating', message: text.trim(), raw: text })
    })
    
    updateChild.stderr.on('data', (data) => {
      const text = data.toString()
      updateStderr += text
      onProgress?.({ tool: tool.name, stage: 'updating', message: text.trim(), raw: text })
    })
    
    updateChild.on('close', (updateCode) => {
      if (updateCode !== 0) {
        resolve({ success: false, stdout: updateStdout, stderr: updateStderr })
        return
      }
      
      // Install the tool
      const installCommand = password
        ? `echo '${password}' | sudo -S DEBIAN_FRONTEND=noninteractive apt install -y ${tool.package}`
        : `sudo DEBIAN_FRONTEND=noninteractive apt install -y ${tool.package}`
      
      onProgress?.({ tool: tool.name, stage: 'installing', message: `Installing ${tool.name} (${tool.package})...` })
      
      const installArgs = ['-d', distro, '--', 'sh', '-lc', installCommand]
      const installChild = spawn('wsl.exe', installArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
      
      let installStdout = ''
      let installStderr = ''
      
      installChild.stdout.on('data', (data) => {
        const text = data.toString()
        installStdout += text
        onProgress?.({ tool: tool.name, stage: 'installing', message: text.trim(), raw: text })
      })
      
      installChild.stderr.on('data', (data) => {
        const text = data.toString()
        installStderr += text
        onProgress?.({ tool: tool.name, stage: 'installing', message: text.trim(), raw: text })
      })
      
      installChild.on('close', (installCode) => {
        // Verify installation
        checkTool(distro, tool.name).then((status) => {
          resolve({
            success: status.installed && installCode === 0,
            stdout: installStdout,
            stderr: installStderr,
            verified: status.installed
          })
        })
      })
      
      installChild.on('error', (err) => {
        resolve({
          success: false,
          stdout: installStdout,
          stderr: installStderr + String(err?.message || err),
          verified: false
        })
      })
    })
    
    updateChild.on('error', (err) => {
      resolve({
        success: false,
        stdout: updateStdout,
        stderr: updateStderr + String(err?.message || err),
        verified: false
      })
    })
  })
}

/**
 * Batch install all missing tools
 * @param {string} distro - WSL distribution name
 * @param {string} password - Sudo password (if needed)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{success: boolean, installed: Array, failed: Array}>}
 */
async function installAllMissingTools(distro, password = null, onProgress = null) {
  const checkResult = await checkAllTools(distro, onProgress)
  
  if (checkResult.allInstalled) {
    onProgress?.({ stage: 'complete', message: 'All tools are already installed' })
    return { success: true, installed: [], failed: [] }
  }
  
  onProgress?.({ 
    stage: 'installing', 
    message: `Installing ${checkResult.missingTools.length} missing tools...` 
  })
  
  const installed = []
  const failed = []
  
  // Build one-line batch installation command
  const packages = checkResult.missingTools.map(t => t.package).join(' ')
  const batchCommand = password
    ? `echo '${password}' | sudo -S DEBIAN_FRONTEND=noninteractive apt update -qq && echo '${password}' | sudo -S DEBIAN_FRONTEND=noninteractive apt install -y ${packages}`
    : `sudo DEBIAN_FRONTEND=noninteractive apt update -qq && sudo DEBIAN_FRONTEND=noninteractive apt install -y ${packages}`
  
  onProgress?.({ stage: 'installing', message: `Batch installing: ${packages}` })
  
  return new Promise((resolve) => {
    const args = ['-d', distro, '--', 'sh', '-lc', batchCommand]
    const child = spawn('wsl.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      onProgress?.({ stage: 'installing', message: text.trim(), raw: text })
    })
    
    child.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      onProgress?.({ stage: 'installing', message: text.trim(), raw: text })
    })
    
    child.on('close', async (code) => {
      // Verify all tools are now installed
      const verifyResult = await checkAllTools(distro, onProgress)
      
      for (const tool of checkResult.missingTools) {
        if (verifyResult.toolStatus[tool.name]?.installed) {
          installed.push(tool.name)
        } else {
          failed.push(tool.name)
        }
      }
      
      resolve({
        success: code === 0 && failed.length === 0,
        installed,
        failed,
        stdout,
        stderr
      })
    })
    
    child.on('error', (err) => {
      resolve({
        success: false,
        installed: [],
        failed: checkResult.missingTools.map(t => t.name),
        stdout,
        stderr: stderr + String(err?.message || err)
      })
    })
  })
}

/**
 * Update ClamAV virus definitions
 * @param {string} distro - WSL distribution name
 * @param {string} password - Sudo password (if needed)
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{success: boolean, stdout: string, stderr: string}>}
 */
async function updateClamavDefinitions(distro, password = null, onProgress = null) {
  return new Promise((resolve) => {
    const command = password
      ? `echo '${password}' | sudo -S freshclam`
      : 'sudo freshclam'
    
    onProgress?.({ tool: 'freshclam', stage: 'updating', message: 'Updating ClamAV virus definitions...' })
    
    const args = ['-d', distro, '--', 'sh', '-lc', command]
    const child = spawn('wsl.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      onProgress?.({ tool: 'freshclam', stage: 'updating', message: text.trim(), raw: text })
    })
    
    child.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      onProgress?.({ tool: 'freshclam', stage: 'updating', message: text.trim(), raw: text })
    })
    
    child.on('close', (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr
      })
    })
    
    child.on('error', (err) => {
      resolve({
        success: false,
        stdout,
        stderr: stderr + String(err?.message || err)
      })
    })
  })
}

module.exports = {
  REQUIRED_TOOLS,
  checkTool,
  checkAllTools,
  installTool,
  installAllMissingTools,
  updateClamavDefinitions
}

