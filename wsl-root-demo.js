// WSL Root Execution Demo - Renderer Script
// This script demonstrates the secure WSL root execution API

class WSLRootDemo {
    constructor() {
        this.initializeElements();
        this.attachEventListeners();
        this.setupExampleHandlers();
    }

    initializeElements() {
        // Form elements
        this.distroSelect = document.getElementById('distro');
        this.commandTextarea = document.getElementById('command');
        this.requireConfirmCheckbox = document.getElementById('requireConfirm');
        this.runBtn = document.getElementById('runBtn');
        this.clearBtn = document.getElementById('clearBtn');

        // Script mode elements
        this.scriptActionSelect = document.getElementById('scriptAction');
        this.scriptPackageSelect = document.getElementById('scriptPackage');
        this.packageGroup = document.getElementById('packageGroup');
        this.runScriptBtn = document.getElementById('runScriptBtn');
        this.clearScriptBtn = document.getElementById('clearScriptBtn');

        // Result elements
        this.loading = document.getElementById('loading');
        this.resultContent = document.getElementById('resultContent');
    }

    attachEventListeners() {
        // Direct command execution
        this.runBtn.addEventListener('click', () => this.executeDirectCommand());
        this.clearBtn.addEventListener('click', () => this.clearDirectCommand());

        // Script mode execution
        this.runScriptBtn.addEventListener('click', () => this.executeScriptCommand());
        this.clearScriptBtn.addEventListener('click', () => this.clearScriptCommand());

        // Script action change handler
        this.scriptActionSelect.addEventListener('change', () => this.handleActionChange());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                if (this.commandTextarea === document.activeElement) {
                    this.executeDirectCommand();
                }
            }
        });
    }

    setupExampleHandlers() {
        // Direct command examples
        document.querySelectorAll('.example-item[data-command]').forEach(item => {
            item.addEventListener('click', () => {
                const command = item.dataset.command;
                this.commandTextarea.value = command;
                this.commandTextarea.focus();
            });
        });

        // Script mode examples
        document.querySelectorAll('.example-item[data-action]').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                const package = item.dataset.package;
                
                this.scriptActionSelect.value = action;
                if (package) {
                    this.scriptPackageSelect.value = package;
                }
                this.handleActionChange();
            });
        });
    }

    handleActionChange() {
        const action = this.scriptActionSelect.value;
        const needsPackage = ['install', 'update', 'check'].includes(action);
        
        this.packageGroup.style.display = needsPackage ? 'block' : 'none';
        
        if (action === 'update') {
            // Add "all" option for update
            if (!this.scriptPackageSelect.querySelector('option[value="all"]')) {
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'All Packages';
                this.scriptPackageSelect.insertBefore(allOption, this.scriptPackageSelect.firstChild);
            }
        } else {
            // Remove "all" option for other actions
            const allOption = this.scriptPackageSelect.querySelector('option[value="all"]');
            if (allOption) {
                allOption.remove();
            }
        }
    }

    async executeDirectCommand() {
        const distro = this.distroSelect.value;
        const command = this.commandTextarea.value.trim();
        const requireConfirm = this.requireConfirmCheckbox.checked;

        if (!command) {
            this.showResult('error', 'Please enter a command to execute.');
            return;
        }

        this.showLoading(true);
        this.runBtn.disabled = true;

        try {
            const result = await window.cyberGuard.runAsRoot({
                distro: distro || undefined,
                command: command,
                requireConfirm: requireConfirm
            });

            this.handleExecutionResult(result);
        } catch (error) {
            this.showResult('error', `Execution failed: ${error.message}`);
        } finally {
            this.showLoading(false);
            this.runBtn.disabled = false;
        }
    }

    async executeScriptCommand() {
        const distro = this.distroSelect.value;
        const action = this.scriptActionSelect.value;
        const package = this.scriptPackageSelect.value;
        const requireConfirm = this.requireConfirmCheckbox.checked;

        // Build JSON command
        const jsonCommand = { action: action };
        if (package && package !== 'all') {
            jsonCommand.package = package;
        }

        const command = `cat | /home/\${USER}/myapp/runner.sh`;
        const jsonInput = JSON.stringify(jsonCommand);

        this.showLoading(true);
        this.runScriptBtn.disabled = true;

        try {
            // For script mode, we need to pipe JSON to the script
            // This is a simplified version - in production, you'd handle stdin properly
            const scriptCommand = `echo '${jsonInput}' | /home/\${USER}/myapp/runner.sh`;
            
            const result = await window.cyberGuard.runAsRoot({
                distro: distro || undefined,
                command: scriptCommand,
                requireConfirm: requireConfirm
            });

            this.handleExecutionResult(result);
        } catch (error) {
            this.showResult('error', `Script execution failed: ${error.message}`);
        } finally {
            this.showLoading(false);
            this.runScriptBtn.disabled = false;
        }
    }

    handleExecutionResult(result) {
        if (result.success) {
            let output = `✅ Command executed successfully\n`;
            output += `Exit code: ${result.code}\n`;
            if (result.duration) {
                output += `Duration: ${result.duration}ms\n`;
            }
            output += `\n--- STDOUT ---\n${result.stdout}`;
            
            if (result.stderr) {
                output += `\n\n--- STDERR ---\n${result.stderr}`;
            }
            
            this.showResult('success', output);
        } else {
            let output = `❌ Command execution failed\n`;
            if (result.error) {
                output += `Error: ${result.error}\n`;
            }
            if (result.code !== undefined) {
                output += `Exit code: ${result.code}\n`;
            }
            if (result.timedOut) {
                output += `⚠️ Command timed out after 120 seconds\n`;
            }
            if (result.stderr) {
                output += `\n--- STDERR ---\n${result.stderr}`;
            }
            if (result.stdout) {
                output += `\n--- STDOUT ---\n${result.stdout}`;
            }
            
            this.showResult('error', output);
        }
    }

    showResult(type, message) {
        this.resultContent.className = `result-content result-${type}`;
        
        const timestamp = new Date().toLocaleString();
        const statusIcon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
        
        this.resultContent.innerHTML = `
            <span class="status-indicator status-${type}"></span>
            <strong>${statusIcon} ${type.toUpperCase()}</strong> - ${timestamp}
            <br><br>
            ${message}
        `;
        
        // Scroll to result
        this.resultContent.scrollTop = this.resultContent.scrollHeight;
    }

    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
        if (show) {
            this.resultContent.innerHTML = `
                <span class="status-indicator status-info"></span>
                <strong>🔄 EXECUTING</strong> - ${new Date().toLocaleString()}
                <br><br>
                Command is being executed as root in WSL...
            `;
        }
    }

    clearDirectCommand() {
        this.commandTextarea.value = '';
        this.distroSelect.value = '';
        this.requireConfirmCheckbox.checked = true;
        this.showResult('info', 'Command form cleared. Ready for new input.');
    }

    clearScriptCommand() {
        this.scriptActionSelect.value = 'install';
        this.scriptPackageSelect.value = 'nmap';
        this.handleActionChange();
        this.showResult('info', 'Script form cleared. Ready for new input.');
    }
}

// Initialize the demo when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're running in Electron
    if (typeof window.cyberGuard === 'undefined') {
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ff6b6b;">
                <h1>❌ Not Running in Electron</h1>
                <p>This demo requires the Cyberix Electron application to function properly.</p>
                <p>Please run this through the main Cyberix application.</p>
            </div>
        `;
        return;
    }

    // Initialize the demo
    new WSLRootDemo();
    
    // Show initial status
    const resultContent = document.getElementById('resultContent');
    resultContent.innerHTML = `
        <span class="status-indicator status-info"></span>
        <strong>🚀 READY</strong> - ${new Date().toLocaleString()}
        <br><br>
        WSL Root Execution Demo is ready. You can now execute commands with root privileges.
        <br><br>
        <strong>Security Features:</strong>
        <br>• User confirmation dialogs
        <br>• Input validation and sanitization
        <br>• 120-second timeout protection
        <br>• Structured command whitelisting
        <br>• Comprehensive logging
    `;
});

// WSL Root Execution Demo - Renderer Script
// This script demonstrates the secure WSL root execution API

class WSLRootDemo {
    constructor() {
        this.initializeElements();
        this.attachEventListeners();
        this.setupExampleHandlers();
    }

    initializeElements() {
        // Form elements
        this.distroSelect = document.getElementById('distro');
        this.commandTextarea = document.getElementById('command');
        this.requireConfirmCheckbox = document.getElementById('requireConfirm');
        this.runBtn = document.getElementById('runBtn');
        this.clearBtn = document.getElementById('clearBtn');

        // Script mode elements
        this.scriptActionSelect = document.getElementById('scriptAction');
        this.scriptPackageSelect = document.getElementById('scriptPackage');
        this.packageGroup = document.getElementById('packageGroup');
        this.runScriptBtn = document.getElementById('runScriptBtn');
        this.clearScriptBtn = document.getElementById('clearScriptBtn');

        // Result elements
        this.loading = document.getElementById('loading');
        this.resultContent = document.getElementById('resultContent');
    }

    attachEventListeners() {
        // Direct command execution
        this.runBtn.addEventListener('click', () => this.executeDirectCommand());
        this.clearBtn.addEventListener('click', () => this.clearDirectCommand());

        // Script mode execution
        this.runScriptBtn.addEventListener('click', () => this.executeScriptCommand());
        this.clearScriptBtn.addEventListener('click', () => this.clearScriptCommand());

        // Script action change handler
        this.scriptActionSelect.addEventListener('change', () => this.handleActionChange());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                if (this.commandTextarea === document.activeElement) {
                    this.executeDirectCommand();
                }
            }
        });
    }

    setupExampleHandlers() {
        // Direct command examples
        document.querySelectorAll('.example-item[data-command]').forEach(item => {
            item.addEventListener('click', () => {
                const command = item.dataset.command;
                this.commandTextarea.value = command;
                this.commandTextarea.focus();
            });
        });

        // Script mode examples
        document.querySelectorAll('.example-item[data-action]').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                const package = item.dataset.package;
                
                this.scriptActionSelect.value = action;
                if (package) {
                    this.scriptPackageSelect.value = package;
                }
                this.handleActionChange();
            });
        });
    }

    handleActionChange() {
        const action = this.scriptActionSelect.value;
        const needsPackage = ['install', 'update', 'check'].includes(action);
        
        this.packageGroup.style.display = needsPackage ? 'block' : 'none';
        
        if (action === 'update') {
            // Add "all" option for update
            if (!this.scriptPackageSelect.querySelector('option[value="all"]')) {
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'All Packages';
                this.scriptPackageSelect.insertBefore(allOption, this.scriptPackageSelect.firstChild);
            }
        } else {
            // Remove "all" option for other actions
            const allOption = this.scriptPackageSelect.querySelector('option[value="all"]');
            if (allOption) {
                allOption.remove();
            }
        }
    }

    async executeDirectCommand() {
        const distro = this.distroSelect.value;
        const command = this.commandTextarea.value.trim();
        const requireConfirm = this.requireConfirmCheckbox.checked;

        if (!command) {
            this.showResult('error', 'Please enter a command to execute.');
            return;
        }

        this.showLoading(true);
        this.runBtn.disabled = true;

        try {
            const result = await window.cyberGuard.runAsRoot({
                distro: distro || undefined,
                command: command,
                requireConfirm: requireConfirm
            });

            this.handleExecutionResult(result);
        } catch (error) {
            this.showResult('error', `Execution failed: ${error.message}`);
        } finally {
            this.showLoading(false);
            this.runBtn.disabled = false;
        }
    }

    async executeScriptCommand() {
        const distro = this.distroSelect.value;
        const action = this.scriptActionSelect.value;
        const package = this.scriptPackageSelect.value;
        const requireConfirm = this.requireConfirmCheckbox.checked;

        // Build JSON command
        const jsonCommand = { action: action };
        if (package && package !== 'all') {
            jsonCommand.package = package;
        }

        const command = `cat | /home/\${USER}/myapp/runner.sh`;
        const jsonInput = JSON.stringify(jsonCommand);

        this.showLoading(true);
        this.runScriptBtn.disabled = true;

        try {
            // For script mode, we need to pipe JSON to the script
            // This is a simplified version - in production, you'd handle stdin properly
            const scriptCommand = `echo '${jsonInput}' | /home/\${USER}/myapp/runner.sh`;
            
            const result = await window.cyberGuard.runAsRoot({
                distro: distro || undefined,
                command: scriptCommand,
                requireConfirm: requireConfirm
            });

            this.handleExecutionResult(result);
        } catch (error) {
            this.showResult('error', `Script execution failed: ${error.message}`);
        } finally {
            this.showLoading(false);
            this.runScriptBtn.disabled = false;
        }
    }

    handleExecutionResult(result) {
        if (result.success) {
            let output = `✅ Command executed successfully\n`;
            output += `Exit code: ${result.code}\n`;
            if (result.duration) {
                output += `Duration: ${result.duration}ms\n`;
            }
            output += `\n--- STDOUT ---\n${result.stdout}`;
            
            if (result.stderr) {
                output += `\n\n--- STDERR ---\n${result.stderr}`;
            }
            
            this.showResult('success', output);
        } else {
            let output = `❌ Command execution failed\n`;
            if (result.error) {
                output += `Error: ${result.error}\n`;
            }
            if (result.code !== undefined) {
                output += `Exit code: ${result.code}\n`;
            }
            if (result.timedOut) {
                output += `⚠️ Command timed out after 120 seconds\n`;
            }
            if (result.stderr) {
                output += `\n--- STDERR ---\n${result.stderr}`;
            }
            if (result.stdout) {
                output += `\n--- STDOUT ---\n${result.stdout}`;
            }
            
            this.showResult('error', output);
        }
    }

    showResult(type, message) {
        this.resultContent.className = `result-content result-${type}`;
        
        const timestamp = new Date().toLocaleString();
        const statusIcon = type === 'success' ? '✅' : type === 'error' ? '❌' : '⚠️';
        
        this.resultContent.innerHTML = `
            <span class="status-indicator status-${type}"></span>
            <strong>${statusIcon} ${type.toUpperCase()}</strong> - ${timestamp}
            <br><br>
            ${message}
        `;
        
        // Scroll to result
        this.resultContent.scrollTop = this.resultContent.scrollHeight;
    }

    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
        if (show) {
            this.resultContent.innerHTML = `
                <span class="status-indicator status-info"></span>
                <strong>🔄 EXECUTING</strong> - ${new Date().toLocaleString()}
                <br><br>
                Command is being executed as root in WSL...
            `;
        }
    }

    clearDirectCommand() {
        this.commandTextarea.value = '';
        this.distroSelect.value = '';
        this.requireConfirmCheckbox.checked = true;
        this.showResult('info', 'Command form cleared. Ready for new input.');
    }

    clearScriptCommand() {
        this.scriptActionSelect.value = 'install';
        this.scriptPackageSelect.value = 'nmap';
        this.handleActionChange();
        this.showResult('info', 'Script form cleared. Ready for new input.');
    }
}

// Initialize the demo when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're running in Electron
    if (typeof window.cyberGuard === 'undefined') {
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #ff6b6b;">
                <h1>❌ Not Running in Electron</h1>
                <p>This demo requires the Cyberix Electron application to function properly.</p>
                <p>Please run this through the main Cyberix application.</p>
            </div>
        `;
        return;
    }

    // Initialize the demo
    new WSLRootDemo();
    
    // Show initial status
    const resultContent = document.getElementById('resultContent');
    resultContent.innerHTML = `
        <span class="status-indicator status-info"></span>
        <strong>🚀 READY</strong> - ${new Date().toLocaleString()}
        <br><br>
        WSL Root Execution Demo is ready. You can now execute commands with root privileges.
        <br><br>
        <strong>Security Features:</strong>
        <br>• User confirmation dialogs
        <br>• Input validation and sanitization
        <br>• 120-second timeout protection
        <br>• Structured command whitelisting
        <br>• Comprehensive logging
    `;
});
