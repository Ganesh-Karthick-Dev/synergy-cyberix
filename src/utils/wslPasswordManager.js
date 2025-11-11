// WSL Password Manager
// Handles secure storage and retrieval of WSL passwords

const WSL_PASSWORD_KEY = 'cyberix_wsl_password';
const WSL_USERNAME_KEY = 'cyberix_wsl_username';
const WSL_ROOT_PASSWORD_KEY = 'cyberix_wsl_root_password';

/**
 * Simple encryption/decryption for password storage
 * Note: This is basic obfuscation, not true encryption
 * For production, consider using proper encryption libraries
 */
function obfuscate(text) {
  return btoa(encodeURIComponent(text));
}

function deobfuscate(obfuscated) {
  try {
    return decodeURIComponent(atob(obfuscated));
  } catch (error) {
    return null;
  }
}

/**
 * Store WSL credentials in localStorage
 * @param {string} username - WSL username (auto-detected)
 * @param {string} password - WSL password
 */
export function storeWslCredentials(username, password) {
  try {
    localStorage.setItem(WSL_USERNAME_KEY, obfuscate(username));
    localStorage.setItem(WSL_PASSWORD_KEY, obfuscate(password));
    console.log('✅ [WSL-PASSWORD-MANAGER] Credentials stored:', { username, passwordLength: password.length });
    return true;
  } catch (error) {
    console.error('Failed to store WSL credentials:', error);
    return false;
  }
}

/**
 * Store WSL credentials and also store root password if username is root
 * @param {string} username - WSL username
 * @param {string} password - WSL password
 */
export async function storeWslCredentialsComplete(username, password) {
  try {
    // Store regular credentials
    const stored = storeWslCredentials(username, password);
    if (!stored) {
      return false;
    }
    
    // If username is root, also store as root password
    if (username === 'root') {
      if (window.cyberGuard && window.cyberGuard.storeRootPassword) {
        const result = await window.cyberGuard.storeRootPassword(password);
        console.log('✅ [WSL-PASSWORD-MANAGER] Root password also stored:', result);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Failed to store WSL credentials completely:', error);
    return false;
  }
}

/**
 * Store WSL password only (username is auto-detected)
 * @param {string} password - WSL password
 */
export async function storeWslPassword(password) {
  try {
    const username = await getDefaultWslUsername();
    if (!username) {
      console.error('Could not detect WSL username');
      return false;
    }
    return storeWslCredentials(username, password);
  } catch (error) {
    console.error('Failed to store WSL password:', error);
    return false;
  }
}

/**
 * Retrieve WSL credentials from localStorage
 * @returns {Object|null} - {username, password} or null if not found
 */
export function getWslCredentials() {
  try {
    const username = localStorage.getItem(WSL_USERNAME_KEY);
    const password = localStorage.getItem(WSL_PASSWORD_KEY);
    
    if (!username || !password) {
      return null;
    }
    
    const decodedUsername = deobfuscate(username);
    const decodedPassword = deobfuscate(password);
    
    if (!decodedUsername || !decodedPassword) {
      return null;
    }
    
    return {
      username: decodedUsername,
      password: decodedPassword
    };
  } catch (error) {
    console.error('Failed to retrieve WSL credentials:', error);
    return null;
  }
}

/**
 * Clear stored WSL credentials
 */
export function clearWslCredentials() {
  try {
    localStorage.removeItem(WSL_USERNAME_KEY);
    localStorage.removeItem(WSL_PASSWORD_KEY);
    return true;
  } catch (error) {
    console.error('Failed to clear WSL credentials:', error);
    return false;
  }
}

/**
 * Check if WSL credentials are stored
 * @returns {boolean}
 */
export function hasWslCredentials() {
  const credentials = getWslCredentials();
  return credentials !== null;
}

/**
 * Test WSL credentials by attempting to authenticate
 * @param {string} password - WSL password (username auto-detected)
 * @returns {Promise<boolean>} - True if credentials are valid
 */
export async function testWslCredentials(password) {
  try {
    if (window.cyberGuard && window.cyberGuard.testWslCredentials) {
      const result = await window.cyberGuard.testWslCredentials(password);
      return result.success;
    } else {
      console.warn('Electron API not available for credential testing');
      return false;
    }
  } catch (error) {
    console.error('Failed to test WSL credentials:', error);
    return false;
  }
}

/**
 * Test WSL root credentials by attempting to authenticate as root
 * @param {string} password - WSL root password
 * @returns {Promise<boolean>} - True if root credentials are valid
 */
export async function testWslRootCredentials(password) {
  console.log('🔐 [PASSWORD-MANAGER] testWslRootCredentials called');
  console.log('🔐 [PASSWORD-MANAGER] Password length:', password ? password.length : 0);
  console.log('🔐 [PASSWORD-MANAGER] Password type:', typeof password);
  console.log('🔐 [PASSWORD-MANAGER] Timestamp:', new Date().toISOString());
  
  try {
    console.log('🔐 [PASSWORD-MANAGER] Checking if window.cyberGuard exists...');
    console.log('🔐 [PASSWORD-MANAGER] window.cyberGuard:', !!window.cyberGuard);
    
    if (window.cyberGuard) {
      console.log('🔐 [PASSWORD-MANAGER] window.cyberGuard exists, checking testWslRootCredentials method...');
      console.log('🔐 [PASSWORD-MANAGER] testWslRootCredentials method exists:', !!window.cyberGuard.testWslRootCredentials);
      console.log('🔐 [PASSWORD-MANAGER] testWslRootCredentials method type:', typeof window.cyberGuard.testWslRootCredentials);
      
      if (window.cyberGuard.testWslRootCredentials) {
        console.log('🔐 [PASSWORD-MANAGER] Calling window.cyberGuard.testWslRootCredentials...');
        console.log('🔐 [PASSWORD-MANAGER] About to invoke IPC call to main process...');
        
        const result = await window.cyberGuard.testWslRootCredentials(password);
        
        console.log('🔐 [PASSWORD-MANAGER] IPC call completed');
        console.log('🔐 [PASSWORD-MANAGER] Result received:', result);
        console.log('🔐 [PASSWORD-MANAGER] Result type:', typeof result);
        console.log('🔐 [PASSWORD-MANAGER] Result.success:', result ? result.success : 'undefined');
        console.log('🔐 [PASSWORD-MANAGER] Result.error:', result ? result.error : 'undefined');
        console.log('🔐 [PASSWORD-MANAGER] Result.debug:', result ? result.debug : 'undefined');
        
        const success = result ? result.success : false;
        console.log('🔐 [PASSWORD-MANAGER] Returning success:', success);
        
        return success;
      } else {
        console.error('🔐 [PASSWORD-MANAGER] testWslRootCredentials method not found on window.cyberGuard');
        console.error('🔐 [PASSWORD-MANAGER] Available methods on window.cyberGuard:', Object.keys(window.cyberGuard));
        return false;
      }
    } else {
      console.error('🔐 [PASSWORD-MANAGER] window.cyberGuard not available');
      console.error('🔐 [PASSWORD-MANAGER] window object:', !!window);
      console.error('🔐 [PASSWORD-MANAGER] window.cyberGuard:', window.cyberGuard);
      return false;
    }
  } catch (error) {
    console.error('🔐 [PASSWORD-MANAGER] Error in testWslRootCredentials:');
    console.error('🔐 [PASSWORD-MANAGER] Error type:', error.constructor.name);
    console.error('🔐 [PASSWORD-MANAGER] Error message:', error.message);
    console.error('🔐 [PASSWORD-MANAGER] Error stack:', error.stack);
    console.error('🔐 [PASSWORD-MANAGER] Full error object:', error);
    return false;
  }
}

/**
 * Store WSL root password in localStorage and main process
 * @param {string} password - WSL root password
 */
export async function storeWslRootPassword(password) {
  try {
    // Store in localStorage for persistence
    localStorage.setItem(WSL_ROOT_PASSWORD_KEY, obfuscate(password));
    
    // Also store in main process for immediate access and get tool check result
    if (window.cyberGuard && window.cyberGuard.storeRootPassword) {
      const result = await window.cyberGuard.storeRootPassword(password);
      console.log('🔐 [PASSWORD-MANAGER] Main process result:', result);
      return result; // Return the full result including toolCheck
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to store WSL root password:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Retrieve WSL root password from localStorage
 * @returns {string|null} - Root password or null if not found
 */
export function getWslRootPassword() {
  try {
    const password = localStorage.getItem(WSL_ROOT_PASSWORD_KEY);
    if (!password) {
      return null;
    }
    return deobfuscate(password);
  } catch (error) {
    console.error('Failed to retrieve WSL root password:', error);
    return null;
  }
}

/**
 * Clear stored WSL root password
 */
export async function clearWslRootPassword() {
  try {
    // Clear from localStorage
    localStorage.removeItem(WSL_ROOT_PASSWORD_KEY);
    
    // Also clear from main process
    if (window.cyberGuard && window.cyberGuard.clearRootPassword) {
      await window.cyberGuard.clearRootPassword();
    }
    
    return true;
  } catch (error) {
    console.error('Failed to clear WSL root password:', error);
    return false;
  }
}

/**
 * Check if WSL root password is stored
 * @returns {boolean}
 */
export function hasWslRootPassword() {
  return getWslRootPassword() !== null;
}

/**
 * Get default WSL username (try to detect from system)
 * @returns {Promise<string>} - Default username or empty string
 */
export async function getDefaultWslUsername() {
  try {
    if (window.cyberGuard && window.cyberGuard.getWslUsername) {
      const result = await window.cyberGuard.getWslUsername();
      return result.username || '';
    } else {
      // Fallback: try to get from stored credentials
      const credentials = getWslCredentials();
      return credentials ? credentials.username : '';
    }
  } catch (error) {
    console.error('Failed to get default WSL username:', error);
    return '';
  }
}
