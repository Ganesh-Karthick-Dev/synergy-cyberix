// Defacement monitoring using hash-based baseline comparison
// Commands are exact and reproducible in WSL terminal

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

/**
 * Generate SHA256 hash of a file or URL content
 * @param {string} distro - WSL distribution name
 * @param {string} target - File path or URL
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{hash: string, size: number, timestamp: string}>}
 */
async function generateHash(distro, target, onProgress = null) {
  return new Promise((resolve) => {
    // Determine if target is URL or file path
    const isUrl = target.startsWith('http://') || target.startsWith('https://')
    
    let command
    if (isUrl) {
      // For URLs: curl -s <URL> | sha256sum
      command = `curl -s "${target}" | sha256sum | awk '{print $1}'`
    } else {
      // For files: sha256sum <file>
      const linuxPath = target.startsWith('/') ? target : `/mnt/${target.charAt(0).toLowerCase()}${target.slice(2).replace(/\\/g, '/')}`
      command = `sha256sum "${linuxPath}" | awk '{print $1}'`
    }
    
    onProgress?.({ stage: 'hashing', message: `Generating hash for ${target}...`, command, tool: 'hash' })
    
    const args = ['-d', distro, '--', 'sh', '-lc', command]
    const child = spawn('wsl.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      stderr += data.toString()
      onProgress?.({ stage: 'hashing', message: data.toString().trim(), raw: data.toString(), command, tool: 'hash' })
    })
    
    child.on('close', async (code) => {
      if (code !== 0) {
        resolve({ hash: null, size: 0, timestamp: new Date().toISOString(), error: stderr })
        return
      }
      
      const hash = stdout.trim()
      
      // Get file size if it's a local file
      let size = 0
      if (!isUrl && fs.existsSync(target)) {
        try {
          const stats = fs.statSync(target)
          size = stats.size
        } catch (e) {
          // Ignore
        }
      }
      
      resolve({
        hash,
        size,
        timestamp: new Date().toISOString(),
        target
      })
    })
    
    child.on('error', (err) => {
      resolve({
        hash: null,
        size: 0,
        timestamp: new Date().toISOString(),
        error: String(err?.message || err)
      })
    })
  })
}

/**
 * Create baseline hash for a URL or file
 * @param {string} distro - WSL distribution name
 * @param {string} target - URL or file path
 * @param {string} baselineDir - Directory to store baseline files
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{baselinePath: string, hash: string, timestamp: string}>}
 */
async function createBaseline(distro, target, baselineDir, onProgress = null) {
  const hashResult = await generateHash(distro, target, onProgress)
  
  if (!hashResult.hash) {
    throw new Error(`Failed to generate hash: ${hashResult.error || 'Unknown error'}`)
  }
  
  // Create baseline file
  const baselineKey = target.replace(/[^a-zA-Z0-9]/g, '_')
  const baselineFile = path.join(baselineDir, `${baselineKey}_baseline.json`)
  
  const baseline = {
    target,
    hash: hashResult.hash,
    size: hashResult.size,
    createdAt: hashResult.timestamp,
    updatedAt: hashResult.timestamp
  }
  
  fs.mkdirSync(baselineDir, { recursive: true })
  fs.writeFileSync(baselineFile, JSON.stringify(baseline, null, 2))
  
  onProgress?.({ 
    stage: 'baseline', 
    message: `Baseline created: ${hashResult.hash.substring(0, 16)}...`,
    command: `curl -s "${target}" | sha256sum | awk '{print $1}'`,
    tool: 'baseline'
  })
  
  return {
    baselinePath: baselineFile,
    hash: hashResult.hash,
    timestamp: hashResult.timestamp
  }
}

/**
 * Load baseline from file
 * @param {string} baselineFile - Path to baseline JSON file
 * @returns {Object|null} Baseline object or null if not found
 */
function loadBaseline(baselineFile) {
  try {
    if (!fs.existsSync(baselineFile)) {
      return null
    }
    
    const content = fs.readFileSync(baselineFile, 'utf8')
    return JSON.parse(content)
  } catch (e) {
    return null
  }
}

/**
 * Compare current hash against baseline
 * @param {string} distro - WSL distribution name
 * @param {string} target - URL or file path
 * @param {string} baselineFile - Path to baseline JSON file
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{changed: boolean, baselineHash: string, currentHash: string, diff: Object}>}
 */
async function compareAgainstBaseline(distro, target, baselineFile, onProgress = null) {
  const baseline = loadBaseline(baselineFile)
  
  if (!baseline) {
    onProgress?.({ stage: 'comparison', message: 'No baseline found, creating new baseline...' })
    const baselineDir = path.dirname(baselineFile)
    const newBaseline = await createBaseline(distro, target, baselineDir, onProgress)
    return {
      changed: false,
      baselineHash: newBaseline.hash,
      currentHash: newBaseline.hash,
      diff: null,
      message: 'New baseline created'
    }
  }
  
  // Generate current hash
  const currentHashResult = await generateHash(distro, target, onProgress)
  
  if (!currentHashResult.hash) {
    throw new Error(`Failed to generate current hash: ${currentHashResult.error || 'Unknown error'}`)
  }
  
  const changed = baseline.hash !== currentHashResult.hash
  
  const diff = {
    baseline: {
      hash: baseline.hash,
      size: baseline.size,
      timestamp: baseline.updatedAt
    },
    current: {
      hash: currentHashResult.hash,
      size: currentHashResult.size,
      timestamp: currentHashResult.timestamp
    },
    changed,
    changeType: changed ? (currentHashResult.size !== baseline.size ? 'size_and_content' : 'content_only') : 'no_change'
  }
  
  // Determine command for comparison
  const isUrl = target.startsWith('http://') || target.startsWith('https://')
  const comparisonCommand = isUrl 
    ? `curl -s "${target}" | sha256sum | awk '{print $1}'`
    : `sha256sum "${target}" | awk '{print $1}'`
  
  if (changed) {
    onProgress?.({ 
      stage: 'comparison', 
      message: `⚠️ DEFACEMENT DETECTED! Hash mismatch detected.`,
      severity: 'warning',
      command: comparisonCommand,
      tool: 'defacement'
    })
  } else {
    onProgress?.({ 
      stage: 'comparison', 
      message: `✓ No changes detected. Content matches baseline.`,
      command: comparisonCommand,
      tool: 'defacement'
    })
  }
  
  return {
    changed,
    baselineHash: baseline.hash,
    currentHash: currentHashResult.hash,
    diff
  }
}

/**
 * Monitor multiple URLs/files for defacement
 * @param {string} distro - WSL distribution name
 * @param {Array<{target: string, baselineFile: string}>} targets - Array of targets to monitor
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Array<{target: string, changed: boolean, diff: Object}>>}
 */
async function monitorMultipleTargets(distro, targets, onProgress = null) {
  const results = []
  
  for (let i = 0; i < targets.length; i++) {
    const { target, baselineFile } = targets[i]
    
    onProgress?.({ 
      stage: 'monitoring', 
      message: `Checking ${i + 1}/${targets.length}: ${target}`,
      percentage: (i / targets.length) * 100
    })
    
    try {
      const comparison = await compareAgainstBaseline(distro, target, baselineFile, onProgress)
      results.push({
        target,
        ...comparison
      })
    } catch (e) {
      results.push({
        target,
        changed: null,
        error: e.message
      })
    }
  }
  
  return results
}

/**
 * Real-time filesystem monitoring using inotifywait
 * @param {string} distro - WSL distribution name
 * @param {string} watchDir - Directory to monitor (Linux path)
 * @param {Function} onProgress - Progress callback for file changes
 * @returns {Promise<{process: Object, stop: Function}>}
 */
async function startFilesystemMonitoring(distro, watchDir, onProgress = null) {
  // Exact command as run in terminal
  const command = `inotifywait -m -r -e modify,create,delete,move "${watchDir}" --format '%w%f %e %T' --timefmt '%Y-%m-%d %H:%M:%S'`
  
  onProgress?.({ 
    stage: 'monitoring', 
    message: `Starting filesystem monitoring for ${watchDir}...` 
  })
  
  const args = ['-d', distro, '--', 'sh', '-lc', command]
  const child = spawn('wsl.exe', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  
  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim())
    for (const line of lines) {
      const parts = line.split(' ')
      if (parts.length >= 2) {
        const file = parts[0]
        const events = parts.slice(1, -1).join(' ')
        const timestamp = parts[parts.length - 1]
        
        onProgress?.({
          stage: 'monitoring',
          message: `File change detected: ${file}`,
          event: {
            file,
            events,
            timestamp
          },
          severity: 'info'
        })
      }
    }
  })
  
  child.stderr.on('data', (data) => {
    onProgress?.({ 
      stage: 'monitoring', 
      message: data.toString().trim(), 
      raw: data.toString(),
      severity: 'error'
    })
  })
  
  return {
    process: child,
    stop: () => {
      child.kill()
      onProgress?.({ stage: 'monitoring', message: 'Filesystem monitoring stopped' })
    }
  }
}

module.exports = {
  generateHash,
  createBaseline,
  loadBaseline,
  compareAgainstBaseline,
  monitorMultipleTargets,
  startFilesystemMonitoring
}

