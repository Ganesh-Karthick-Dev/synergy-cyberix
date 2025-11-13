/**
 * Setup State Manager
 * Manages setup state persistence with per-step file saving
 * Each step is saved in a separate file for better reliability
 */

class SetupStateManager {
  constructor() {
    this.basePath = null; // Base path for saving step files
    this.state = {
      agreementAccepted: false,
      agreementAcceptedAt: null,
      adminPermissionGranted: false,
      adminPermissionGrantedAt: null,
      wslInstalled: false,
      wslInstalledAt: null,
      wslUsername: null,
      wslPasswordStored: false,
      wslPasswordStoredAt: null,
      toolsInstalled: false,
      toolsInstalledAt: null,
      cyberixFolderSetup: false,
      cyberixFolderSetupAt: null,
      systemPathSelected: false,
      systemPath: null,
      systemPathSelectedAt: null,
      setupComplete: false,
      setupCompletedAt: null
    };
  }

  async initialize(systemPath = null) {
    if (!window.cyberGuard) {
      console.warn('[SetupState] cyberGuard not available, using localStorage fallback');
      return this.loadFromLocalStorage();
    }

    try {
      // Get userData path first (C:\Users\Admin\AppData\Roaming\Cyberix)
      const userDataPath = await window.cyberGuard.getUserDataPath?.() || null;
      if (!userDataPath) {
        console.warn('[SetupState] No userData path, using localStorage');
        return this.loadFromLocalStorage();
      }

      // NEW STRUCTURE: Use installation_process folder inside Cyberix-Logs
      // For custom path: [User Path]/Cyberix-Logs/installation_process
      // For default: C:\Users\Admin\AppData\Roaming\Cyberix\Cyberix-Logs\installation_process
      if (systemPath) {
        // If custom path provided, use Cyberix-Logs/installation_process inside it
        this.basePath = `${systemPath}/Cyberix-Logs/installation_process`;
      } else {
        // Use default: userData/Cyberix-Logs/installation_process
        this.basePath = `${userDataPath}/Cyberix-Logs/installation_process`;
      }

      console.log('[SetupState] Using basePath:', this.basePath);

      // Load all step files from NEW location only
      await this.loadAllSteps();
      
      // Validate and fix state
      const wasFixed = this.validateAndFixState();
      if (wasFixed) {
        console.log('[SetupState] State was fixed, saving corrected state...');
        await this.saveAllSteps();
      }
      
      // Log final state for debugging
      console.log('[SetupState] Final state after initialization:', {
        setupComplete: this.state.setupComplete,
        agreementAccepted: this.state.agreementAccepted,
        adminPermissionGranted: this.state.adminPermissionGranted,
        wslInstalled: this.state.wslInstalled,
        wslPasswordStored: this.state.wslPasswordStored,
        toolsInstalled: this.state.toolsInstalled,
        cyberixFolderSetup: this.state.cyberixFolderSetup,
        systemPathSelected: this.state.systemPathSelected
      });
    } catch (error) {
      console.error('[SetupState] Error initializing:', error);
      return this.loadFromLocalStorage();
    }
  }

  // Save each step to a separate file
  async saveStep(stepName, stepData) {
    // Ensure we have a valid basePath
    if (!this.basePath) {
      // Try to get userData path as fallback
      if (window.cyberGuard?.getUserDataPath) {
        try {
          this.basePath = await window.cyberGuard.getUserDataPath();
        } catch (e) {
          console.error('[SetupState] Could not get userData path:', e);
          return this.saveToLocalStorage();
        }
      } else {
        return this.saveToLocalStorage();
      }
    }

    // Ensure basePath is a string (handle array case defensively)
    if (Array.isArray(this.basePath)) {
      console.warn(`[SetupState] basePath is array, extracting first element:`, this.basePath);
      this.basePath = this.basePath.length > 0 ? String(this.basePath[0]) : null;
    }
    
    if (!this.basePath || typeof this.basePath !== 'string') {
      console.error(`[SetupState] Invalid basePath type: ${typeof this.basePath}`, this.basePath);
      return this.saveToLocalStorage();
    }

    if (!window.cyberGuard?.writeFile) {
      return this.saveToLocalStorage();
    }

    try {
      // NEW: Save all steps to a single installation-process.log file
      const logFile = `${this.basePath}/installation-process.log`;
      
      // Ensure directory exists
      const ensureResult = await window.cyberGuard.ensureDirectoryExists(String(this.basePath));
      if (!ensureResult || !ensureResult.success) {
        console.warn(`[SetupState] Directory creation warning:`, ensureResult?.error || 'Unknown error');
      }
      
      // Read existing log file or create new
      let existingLogs = '';
      try {
        if (window.cyberGuard?.readFile) {
          existingLogs = await window.cyberGuard.readFile(logFile);
        }
      } catch (e) {
        // File doesn't exist yet, start fresh
        existingLogs = '';
      }
      
      // Parse existing logs or create new structure
      let logData = {};
      if (existingLogs) {
        try {
          logData = JSON.parse(existingLogs);
        } catch (e) {
          // Invalid JSON, start fresh
          logData = {};
        }
      }
      
      // Update step data
      logData[stepName] = {
        ...stepData,
        updatedAt: new Date().toISOString()
      };
      logData.lastUpdated = new Date().toISOString();
      
      // Save to file
      await window.cyberGuard.writeFile(logFile, JSON.stringify(logData, null, 2));
      console.log(`[SetupState] Saved step: ${stepName} to ${logFile}`);
    } catch (error) {
      console.error(`[SetupState] Error saving step ${stepName}:`, error);
      this.saveToLocalStorage();
    }
  }

  // Load a specific step from installation-process.log (NEW STRUCTURE)
  async loadStep(stepName) {
    if (!this.basePath || !window.cyberGuard?.readFile) {
      return null;
    }

    try {
      // NEW: Load from single installation-process.log file
      const logFile = `${this.basePath}/installation-process.log`;
      const content = await window.cyberGuard.readFile(logFile);
      const logData = JSON.parse(content);
      
      // Return step data if it exists
      if (logData[stepName]) {
        console.log(`[SetupState] Loaded step: ${stepName} from ${logFile}`);
        return logData[stepName];
      }
      return null;
    } catch (error) {
      // Log file doesn't exist yet or step not found
      return null;
    }
  }

  // Load all step files and merge into state
  async loadAllSteps() {
    const steps = [
      'agreement',
      'admin-permission',
      'wsl-installation',
      'wsl-credentials',
      'tools-installation',
      'cyberix-folder',
      'system-path',
      'setup-complete'
    ];

    for (const step of steps) {
      const stepData = await this.loadStep(step);
      if (stepData) {
        this.mergeStepData(step, stepData);
      }
    }

    console.log('[SetupState] Loaded all steps, current state:', this.state);
  }

  // Merge step data into state
  mergeStepData(stepName, stepData) {
    switch (stepName) {
      case 'agreement':
        this.state.agreementAccepted = stepData.agreementAccepted || false;
        this.state.agreementAcceptedAt = stepData.agreementAcceptedAt || null;
        break;
      case 'admin-permission':
        this.state.adminPermissionGranted = stepData.adminPermissionGranted || false;
        this.state.adminPermissionGrantedAt = stepData.adminPermissionGrantedAt || null;
        break;
      case 'wsl-installation':
        this.state.wslInstalled = stepData.wslInstalled || false;
        this.state.wslInstalledAt = stepData.wslInstalledAt || null;
        break;
      case 'wsl-credentials':
        this.state.wslUsername = stepData.wslUsername || null;
        this.state.wslPasswordStored = stepData.wslPasswordStored || false;
        this.state.wslPasswordStoredAt = stepData.wslPasswordStoredAt || null;
        break;
      case 'tools-installation':
        this.state.toolsInstalled = stepData.toolsInstalled || false;
        this.state.toolsInstalledAt = stepData.toolsInstalledAt || null;
        break;
      case 'cyberix-folder':
        this.state.cyberixFolderSetup = stepData.cyberixFolderSetup || false;
        this.state.cyberixFolderSetupAt = stepData.cyberixFolderSetupAt || null;
        break;
      case 'system-path':
        // Handle array case defensively
        let systemPath = stepData.systemPath || null;
        if (Array.isArray(systemPath)) {
          console.warn('[SetupState] System path in step data is array, extracting first element');
          systemPath = systemPath.length > 0 ? systemPath[0] : null;
        }
        this.state.systemPath = systemPath;
        this.state.systemPathSelected = stepData.systemPathSelected || false;
        this.state.systemPathSelectedAt = stepData.systemPathSelectedAt || null;
        break;
      case 'setup-complete':
        this.state.setupComplete = stepData.setupComplete || false;
        this.state.setupCompletedAt = stepData.setupCompletedAt || null;
        break;
    }
  }

  // Save all steps to files
  async saveAllSteps() {
    await this.saveStep('agreement', {
      agreementAccepted: this.state.agreementAccepted,
      agreementAcceptedAt: this.state.agreementAcceptedAt
    });

    await this.saveStep('admin-permission', {
      adminPermissionGranted: this.state.adminPermissionGranted,
      adminPermissionGrantedAt: this.state.adminPermissionGrantedAt
    });

    await this.saveStep('wsl-installation', {
      wslInstalled: this.state.wslInstalled,
      wslInstalledAt: this.state.wslInstalledAt
    });

    await this.saveStep('wsl-credentials', {
      wslUsername: this.state.wslUsername,
      wslPasswordStored: this.state.wslPasswordStored,
      wslPasswordStoredAt: this.state.wslPasswordStoredAt
    });

    await this.saveStep('tools-installation', {
      toolsInstalled: this.state.toolsInstalled,
      toolsInstalledAt: this.state.toolsInstalledAt
    });

    await this.saveStep('cyberix-folder', {
      cyberixFolderSetup: this.state.cyberixFolderSetup,
      cyberixFolderSetupAt: this.state.cyberixFolderSetupAt
    });

    await this.saveStep('system-path', {
      systemPath: this.state.systemPath,
      systemPathSelected: this.state.systemPathSelected,
      systemPathSelectedAt: this.state.systemPathSelectedAt
    });

    await this.saveStep('setup-complete', {
      setupComplete: this.state.setupComplete,
      setupCompletedAt: this.state.setupCompletedAt
    });
  }

  // Validate state integrity and fix if corrupted
  validateAndFixState() {
    let wasFixed = false;

    // If setupComplete is true, verify ALL steps are actually complete
    if (this.state.setupComplete) {
      const allStepsComplete = 
        this.state.agreementAccepted &&
        this.state.adminPermissionGranted &&
        this.state.wslInstalled &&
        this.state.wslPasswordStored &&
        this.state.toolsInstalled &&
        this.state.cyberixFolderSetup &&
        this.state.systemPathSelected;

      if (!allStepsComplete) {
        console.warn('[SetupState] State corrupted: setupComplete=true but steps incomplete. Resetting.');
        this.state.setupComplete = false;
        this.state.setupCompletedAt = null;
        wasFixed = true;
      } else {
        console.log('[SetupState] Setup is complete and valid. All steps verified.');
      }
    }

    // Ensure sequential integrity - only fix if setupComplete is false
    if (!this.state.setupComplete) {
      if (this.state.wslPasswordStored && !this.state.wslInstalled) {
        console.warn('[SetupState] State corrupted: password stored but WSL not installed. Resetting password step.');
        this.state.wslPasswordStored = false;
        this.state.wslPasswordStoredAt = null;
        wasFixed = true;
      }

      if (this.state.toolsInstalled && !this.state.wslPasswordStored) {
        console.warn('[SetupState] State corrupted: tools installed but password not stored. Resetting tools step.');
        this.state.toolsInstalled = false;
        this.state.toolsInstalledAt = null;
        wasFixed = true;
      }

      if (this.state.cyberixFolderSetup && !this.state.toolsInstalled) {
        console.warn('[SetupState] State corrupted: cyberix folder setup but tools not installed. Resetting folder step.');
        this.state.cyberixFolderSetup = false;
        this.state.cyberixFolderSetupAt = null;
        wasFixed = true;
      }

      if (this.state.systemPathSelected && !this.state.cyberixFolderSetup) {
        console.warn('[SetupState] State corrupted: system path selected but folder not setup. Resetting path step.');
        this.state.systemPathSelected = false;
        this.state.systemPathSelectedAt = null;
        this.state.systemPath = null;
        wasFixed = true;
      }
    }

    return wasFixed;
  }

  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem('cyberix.setup.state');
      if (stored) {
        const parsedState = JSON.parse(stored);
        // Only load if it's actually a complete setup (all steps done)
        // Otherwise, treat as fresh install
        const isComplete = parsedState.setupComplete === true &&
          parsedState.agreementAccepted === true &&
          parsedState.adminPermissionGranted === true &&
          parsedState.wslInstalled === true &&
          parsedState.wslPasswordStored === true &&
          parsedState.toolsInstalled === true &&
          parsedState.cyberixFolderSetup === true &&
          parsedState.systemPathSelected === true;
        
        if (isComplete) {
          this.state = { ...this.state, ...parsedState };
          console.log('[SetupState] Loaded complete state from localStorage');
        } else {
          console.log('[SetupState] localStorage has incomplete state, ignoring it (treating as fresh install)');
          // Clear stale localStorage
          localStorage.removeItem('cyberix.setup.state');
        }
      }
    } catch (error) {
      console.error('[SetupState] Error loading from localStorage:', error);
      // Clear corrupted localStorage
      try {
        localStorage.removeItem('cyberix.setup.state');
      } catch (e) {
        // Ignore
      }
    }
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem('cyberix.setup.state', JSON.stringify(this.state));
      console.log('[SetupState] Saved state to localStorage:', this.state);
    } catch (error) {
      console.error('[SetupState] Error saving to localStorage:', error);
    }
  }

  // Agreement methods
  async setAgreementAccepted(accepted = true) {
    this.state.agreementAccepted = accepted;
    this.state.agreementAcceptedAt = accepted ? new Date().toISOString() : null;
    await this.saveStep('agreement', {
      agreementAccepted: this.state.agreementAccepted,
      agreementAcceptedAt: this.state.agreementAcceptedAt
    });
  }

  isAgreementAccepted() {
    return this.state.agreementAccepted === true;
  }

  // Admin permission methods
  async setAdminPermissionGranted(granted = true) {
    this.state.adminPermissionGranted = granted;
    this.state.adminPermissionGrantedAt = granted ? new Date().toISOString() : null;
    await this.saveStep('admin-permission', {
      adminPermissionGranted: this.state.adminPermissionGranted,
      adminPermissionGrantedAt: this.state.adminPermissionGrantedAt
    });
  }

  isAdminPermissionGranted() {
    return this.state.adminPermissionGranted === true;
  }

  // WSL methods
  async setWslInstalled(installed = true) {
    this.state.wslInstalled = installed;
    this.state.wslInstalledAt = installed ? new Date().toISOString() : null;
    await this.saveStep('wsl-installation', {
      wslInstalled: this.state.wslInstalled,
      wslInstalledAt: this.state.wslInstalledAt
    });
  }

  isWslInstalled() {
    return this.state.wslInstalled === true;
  }

  // WSL credentials methods
  async setWslCredentials(username, passwordStored = true) {
    this.state.wslUsername = username;
    this.state.wslPasswordStored = passwordStored;
    this.state.wslPasswordStoredAt = passwordStored ? new Date().toISOString() : null;
    await this.saveStep('wsl-credentials', {
      wslUsername: this.state.wslUsername,
      wslPasswordStored: this.state.wslPasswordStored,
      wslPasswordStoredAt: this.state.wslPasswordStoredAt
    });
  }

  getWslUsername() {
    return this.state.wslUsername;
  }

  isWslPasswordStored() {
    return this.state.wslPasswordStored === true;
  }

  // Cyberix folder setup methods
  async setCyberixFolderSetup(completed = true) {
    this.state.cyberixFolderSetup = completed;
    this.state.cyberixFolderSetupAt = completed ? new Date().toISOString() : null;
    await this.saveStep('cyberix-folder', {
      cyberixFolderSetup: this.state.cyberixFolderSetup,
      cyberixFolderSetupAt: this.state.cyberixFolderSetupAt
    });
  }

  isCyberixFolderSetup() {
    return this.state.cyberixFolderSetup === true;
  }

  // System path selection methods
  async setSystemPath(path) {
    // Handle array case (defensive - should not happen but handle gracefully)
    if (Array.isArray(path)) {
      console.warn(`[SetupState] Path received as array, extracting first element:`, path);
      path = path.length > 0 ? path[0] : null;
    }
    
    // Ensure path is a string
    if (!path || typeof path !== 'string') {
      console.error(`[SetupState] Invalid path type in setSystemPath: ${typeof path}`, path);
      throw new Error('System path must be a valid string');
    }
    
    this.systemPath = path;
    this.state.systemPath = path;
    this.state.systemPathSelected = true;
    this.state.systemPathSelectedAt = new Date().toISOString();
    
    // Update base path to use system path (guaranteed to be string now)
    this.basePath = String(path);
    
    // Save system path reference
    const userDataPath = await window.cyberGuard?.getUserDataPath?.() || null;
    if (userDataPath && window.cyberGuard?.writeFile) {
      const referenceFile = `${userDataPath}/step-system-path.json`;
      await window.cyberGuard.writeFile(referenceFile, JSON.stringify({
        systemPath: path,
        updatedAt: new Date().toISOString()
      }, null, 2));
    }
    
    await this.saveStep('system-path', {
      systemPath: this.state.systemPath,
      systemPathSelected: this.state.systemPathSelected,
      systemPathSelectedAt: this.state.systemPathSelectedAt
    });
  }

  getSystemPath() {
    return this.state.systemPath || this.systemPath;
  }

  isSystemPathSelected() {
    return this.state.systemPathSelected === true;
  }

  // Tools installation methods
  async setToolsInstalled(installed = true) {
    this.state.toolsInstalled = installed;
    this.state.toolsInstalledAt = installed ? new Date().toISOString() : null;
    await this.saveStep('tools-installation', {
      toolsInstalled: this.state.toolsInstalled,
      toolsInstalledAt: this.state.toolsInstalledAt
    });
  }

  isToolsInstalled() {
    return this.state.toolsInstalled === true;
  }

  // Setup completion
  async setSetupComplete(complete = true) {
    this.state.setupComplete = complete;
    this.state.setupCompletedAt = complete ? new Date().toISOString() : null;
    await this.saveStep('setup-complete', {
      setupComplete: this.state.setupComplete,
      setupCompletedAt: this.state.setupCompletedAt
    });
    // Also save all steps to ensure everything is persisted
    await this.saveAllSteps();
  }

  isSetupComplete() {
    return this.state.setupComplete === true;
  }

  // Get full state
  getState() {
    return { ...this.state };
  }

  // Get state file location (for debugging)
  getStateFileLocation() {
    return this.basePath || null;
  }

  // Get current step number (0-4)
  getCurrentStepNumber() {
    if (!this.state.agreementAccepted || !this.state.adminPermissionGranted) {
      return 0; // Agreement/Admin
    }
    if (!this.state.wslInstalled) {
      return 0; // WSL Installation
    }
    if (!this.state.wslPasswordStored) {
      return 1; // WSL Password
    }
    if (!this.state.toolsInstalled) {
      return 2; // Tools Installation
    }
    if (!this.state.cyberixFolderSetup) {
      return 3; // Cyberix Folder
    }
    if (!this.state.systemPathSelected) {
      return 4; // System Path
    }
    return 5; // All complete
  }

  // Reset setup (for testing)
  async reset() {
    this.state = {
      agreementAccepted: false,
      agreementAcceptedAt: null,
      adminPermissionGranted: false,
      adminPermissionGrantedAt: null,
      wslInstalled: false,
      wslInstalledAt: null,
      wslUsername: null,
      wslPasswordStored: false,
      wslPasswordStoredAt: null,
      toolsInstalled: false,
      toolsInstalledAt: null,
      cyberixFolderSetup: false,
      cyberixFolderSetupAt: null,
      systemPathSelected: false,
      systemPath: null,
      systemPathSelectedAt: null,
      setupComplete: false,
      setupCompletedAt: null
    };
    await this.saveAllSteps();
  }
}

// Export singleton instance
const setupStateManager = new SetupStateManager();

export default setupStateManager;
