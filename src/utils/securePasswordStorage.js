<<<<<<< HEAD
// Secure Password Storage Utility
// Handles secure storage and retrieval of WSL root password in a non-user-readable format

const CYBERIX_PASSWORD_FILE = 'cyberix-password';

/**
 * Simple encryption/decryption for password storage
 * Uses base64 encoding with additional obfuscation
 * Note: This is basic obfuscation, not true encryption
 * For production, consider using proper encryption libraries
 */
function encryptPassword(password) {
  try {
    // Add some obfuscation layers
    const timestamp = Date.now().toString();
    const obfuscated = btoa(encodeURIComponent(password + '|' + timestamp));
    return obfuscated;
  } catch (error) {
    console.error('Failed to encrypt password:', error);
    return null;
  }
}

function decryptPassword(encryptedPassword) {
  try {
    const decoded = decodeURIComponent(atob(encryptedPassword));
    const [password] = decoded.split('|');
    return password;
  } catch (error) {
    console.error('Failed to decrypt password:', error);
    return null;
  }
}

/**
 * Store WSL root password securely
 * @param {string} password - WSL root password
 * @returns {boolean} - Success status
 */
export function storeSecurePassword(password) {
  try {
    const encrypted = encryptPassword(password);
    if (!encrypted) {
      return false;
    }
    
    // Store in localStorage with obfuscated key
    localStorage.setItem(CYBERIX_PASSWORD_FILE, encrypted);
    console.log('🔐 [SECURE-STORAGE] Password stored securely');
    return true;
  } catch (error) {
    console.error('Failed to store secure password:', error);
    return false;
  }
}

/**
 * Retrieve WSL root password securely
 * @returns {string|null} - Decrypted password or null if not found
 */
export function getSecurePassword() {
  try {
    const encrypted = localStorage.getItem(CYBERIX_PASSWORD_FILE);
    if (!encrypted) {
      return null;
    }
    
    const password = decryptPassword(encrypted);
    if (!password) {
      // Clear invalid data
      localStorage.removeItem(CYBERIX_PASSWORD_FILE);
      return null;
    }
    
    console.log('🔐 [SECURE-STORAGE] Password retrieved securely');
    console.log('🔐 [SECURE-STORAGE] Password length:', password.length);
    console.log('🔐 [SECURE-STORAGE] Password (masked):', password.replace(/./g, '*'));
    return password;
  } catch (error) {
    console.error('Failed to retrieve secure password:', error);
    return null;
  }
}

/**
 * Check if secure password is stored
 * @returns {boolean}
 */
export function hasSecurePassword() {
  return getSecurePassword() !== null;
}

/**
 * Clear stored secure password
 * @returns {boolean} - Success status
 */
export function clearSecurePassword() {
  try {
    localStorage.removeItem(CYBERIX_PASSWORD_FILE);
    console.log('🔐 [SECURE-STORAGE] Password cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear secure password:', error);
    return false;
  }
}

/**
 * Validate stored password by testing it
 * @returns {Promise<boolean>} - True if password is valid
 */
export async function validateStoredPassword() {
  try {
    const password = getSecurePassword();
    if (!password) {
      return false;
    }
    
    // Test the password using the existing WSL testing function
    if (window.cyberGuard && window.cyberGuard.testWslRootCredentials) {
      const result = await window.cyberGuard.testWslRootCredentials(password);
      return result ? result.success : false;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to validate stored password:', error);
    return false;
  }
}
=======
// Secure Password Storage Utility
// Handles secure storage and retrieval of WSL root password in a non-user-readable format

const CYBERIX_PASSWORD_FILE = 'cyberix-password';

/**
 * Simple encryption/decryption for password storage
 * Uses base64 encoding with additional obfuscation
 * Note: This is basic obfuscation, not true encryption
 * For production, consider using proper encryption libraries
 */
function encryptPassword(password) {
  try {
    // Add some obfuscation layers
    const timestamp = Date.now().toString();
    const obfuscated = btoa(encodeURIComponent(password + '|' + timestamp));
    return obfuscated;
  } catch (error) {
    console.error('Failed to encrypt password:', error);
    return null;
  }
}

function decryptPassword(encryptedPassword) {
  try {
    const decoded = decodeURIComponent(atob(encryptedPassword));
    const [password] = decoded.split('|');
    return password;
  } catch (error) {
    console.error('Failed to decrypt password:', error);
    return null;
  }
}

/**
 * Store WSL root password securely
 * @param {string} password - WSL root password
 * @returns {boolean} - Success status
 */
export function storeSecurePassword(password) {
  try {
    const encrypted = encryptPassword(password);
    if (!encrypted) {
      return false;
    }
    
    // Store in localStorage with obfuscated key
    localStorage.setItem(CYBERIX_PASSWORD_FILE, encrypted);
    console.log('🔐 [SECURE-STORAGE] Password stored securely');
    return true;
  } catch (error) {
    console.error('Failed to store secure password:', error);
    return false;
  }
}

/**
 * Retrieve WSL root password securely
 * @returns {string|null} - Decrypted password or null if not found
 */
export function getSecurePassword() {
  try {
    const encrypted = localStorage.getItem(CYBERIX_PASSWORD_FILE);
    if (!encrypted) {
      return null;
    }
    
    const password = decryptPassword(encrypted);
    if (!password) {
      // Clear invalid data
      localStorage.removeItem(CYBERIX_PASSWORD_FILE);
      return null;
    }
    
    console.log('🔐 [SECURE-STORAGE] Password retrieved securely');
    console.log('🔐 [SECURE-STORAGE] Password length:', password.length);
    console.log('🔐 [SECURE-STORAGE] Password (masked):', password.replace(/./g, '*'));
    return password;
  } catch (error) {
    console.error('Failed to retrieve secure password:', error);
    return null;
  }
}

/**
 * Check if secure password is stored
 * @returns {boolean}
 */
export function hasSecurePassword() {
  return getSecurePassword() !== null;
}

/**
 * Clear stored secure password
 * @returns {boolean} - Success status
 */
export function clearSecurePassword() {
  try {
    localStorage.removeItem(CYBERIX_PASSWORD_FILE);
    console.log('🔐 [SECURE-STORAGE] Password cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear secure password:', error);
    return false;
  }
}

/**
 * Validate stored password by testing it
 * @returns {Promise<boolean>} - True if password is valid
 */
export async function validateStoredPassword() {
  try {
    const password = getSecurePassword();
    if (!password) {
      return false;
    }
    
    // Test the password using the existing WSL testing function
    if (window.cyberGuard && window.cyberGuard.testWslRootCredentials) {
      const result = await window.cyberGuard.testWslRootCredentials(password);
      return result ? result.success : false;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to validate stored password:', error);
    return false;
  }
}
>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
