#!/usr/bin/env node
// cursor-installer.js
// Interactive cursor-based tool checker + installer for Linux/Windows (apt/dnf/yum + go installs + WSL)

const { execa } = require('execa');
const inquirer = require('inquirer');
const ora = require('ora');
const chalk = require('chalk').default || require('chalk');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Platform detection
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';
const isMac = os.platform() === 'darwin';

// Tool definitions with platform-specific installation commands
const TOOLS = [
  // Basic tools
  { 
    name: 'git', 
    check: 'git --version', 
    install: isWindows ? 'winget install --id Git.Git -e --source winget' : 'sudo apt install -y git', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y git'
  },
  { 
    name: 'curl', 
    check: 'curl --version', 
    install: isWindows ? 'winget install --id cURL.cURL -e --source winget' : 'sudo apt install -y curl', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y curl'
  },
  { 
    name: 'wget', 
    check: 'wget --version', 
    install: isWindows ? 'winget install --id GNU.Wget -e --source winget' : 'sudo apt install -y wget', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y wget'
  },
  { 
    name: 'jq', 
    check: 'jq --version', 
    install: isWindows ? 'winget install --id stedolan.jq -e --source winget' : 'sudo apt install -y jq', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y jq'
  },
  { 
    name: 'unzip', 
    check: 'unzip -v', 
    install: isWindows ? 'winget install --id 7zip.7zip -e --source winget' : 'sudo apt install -y unzip', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y unzip'
  },

  // Security tools - these are primarily available in WSL/Kali
  { 
    name: 'nmap', 
    check: 'nmap --version', 
    install: isWindows ? 'winget install --id InsecureCompatible.Nmap -e --source winget' : 'sudo apt install -y nmap', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y nmap'
  },
  { 
    name: 'nikto', 
    check: 'nikto -Version', 
    install: isWindows ? 'wsl sudo apt install -y nikto' : 'sudo apt install -y nikto', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y nikto'
  },
  { 
    name: 'sqlmap', 
    check: 'sqlmap --version', 
    install: isWindows ? 'wsl sudo apt install -y sqlmap' : 'sudo apt install -y sqlmap', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y sqlmap'
  },
  { 
    name: 'hydra', 
    check: 'hydra -h', 
    install: isWindows ? 'wsl sudo apt install -y hydra' : 'sudo apt install -y hydra', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y hydra'
  },
  { 
    name: 'gobuster', 
    check: 'gobuster -h', 
    install: isWindows ? 'wsl sudo apt install -y gobuster' : 'sudo apt install -y gobuster', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y gobuster'
  },
  { 
    name: 'dirb', 
    check: 'dirb -h', 
    install: isWindows ? 'wsl sudo apt install -y dirb' : 'sudo apt install -y dirb', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y dirb'
  },

  { 
    name: 'theHarvester', 
    check: 'theHarvester -h', 
    install: isWindows ? 'wsl sudo apt install -y theharvester' : 'sudo apt install -y theharvester', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y theharvester'
  },
  { 
    name: 'amass', 
    check: 'amass -version', 
    install: isWindows ? 'wsl sudo apt install -y amass' : 'sudo apt install -y amass', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y amass'
  },
  { 
    name: 'john', 
    check: 'john --version', 
    install: isWindows ? 'wsl sudo apt install -y john' : 'sudo apt install -y john', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y john'
  },
  { 
    name: 'medusa', 
    check: 'medusa -h', 
    install: isWindows ? 'wsl sudo apt install -y medusa' : 'sudo apt install -y medusa', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y medusa'
  },
  { 
    name: 'metasploit-framework', 
    check: 'msfconsole --version', 
    install: isWindows ? 'wsl sudo apt install -y metasploit-framework' : 'sudo apt install -y metasploit-framework', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y metasploit-framework'
  },

  { 
    name: 'zaproxy', 
    check: 'zap.sh -v', 
    install: isWindows ? 'wsl sudo apt install -y zaproxy' : 'sudo apt install -y zaproxy', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y zaproxy'
  },
  { 
    name: 'mitmproxy', 
    check: 'mitmproxy --version', 
    install: isWindows ? 'wsl sudo apt install -y mitmproxy' : 'sudo apt install -y mitmproxy', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y mitmproxy'
  },
  { 
    name: 'socat', 
    check: 'socat -V', 
    install: isWindows ? 'wsl sudo apt install -y socat' : 'sudo apt install -y socat', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y socat'
  },
  { 
    name: 'netcat', 
    check: 'nc -h', 
    install: isWindows ? 'wsl sudo apt install -y netcat-openbsd' : 'sudo apt install -y netcat-openbsd', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y netcat-openbsd'
  },
  { 
    name: 'fail2ban', 
    check: 'fail2ban-client -V', 
    install: isWindows ? 'wsl sudo apt install -y fail2ban' : 'sudo apt install -y fail2ban', 
    type: isWindows ? 'wsl' : 'apt',
    wslInstall: 'sudo apt install -y fail2ban'
  },

  // Go-based tools
  { 
    name: 'go', 
    check: 'go version', 
    install: isWindows ? 'winget install --id GoLang.Go -e --source winget' : 'sudo apt install -y golang', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y golang'
  },
  { 
    name: 'ffuf', 
    check: 'ffuf -h', 
    install: isWindows ? 'wsl go install github.com/ffuf/ffuf@latest' : 'go install github.com/ffuf/ffuf@latest', 
    type: isWindows ? 'wsl' : 'go',
    wslInstall: 'go install github.com/ffuf/ffuf@latest'
  },
  { 
    name: 'nuclei', 
    check: 'nuclei -version', 
    install: isWindows ? 'wsl go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest' : 'go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest', 
    type: isWindows ? 'wsl' : 'go',
    wslInstall: 'go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest'
  },
  { 
    name: 'dalfox', 
    check: 'dalfox -h', 
    install: isWindows ? 'wsl go install github.com/hahwul/dalfox/v2@latest' : 'go install github.com/hahwul/dalfox/v2@latest', 
    type: isWindows ? 'wsl' : 'go',
    wslInstall: 'go install github.com/hahwul/dalfox/v2@latest'
  },

  { 
    name: 'openssl', 
    check: 'openssl version', 
    install: isWindows ? 'winget install --id ShiningLight.OpenSSL -e --source winget' : 'sudo apt install -y openssl', 
    type: isWindows ? 'winget' : 'apt',
    wslInstall: 'sudo apt install -y openssl'
  },
];

async function detectPackageManager() {
  if (isWindows) {
    // Check for Windows package managers
    try { 
      await execa('winget', ['--version'], { shell: true }); 
      return 'winget'; 
    } catch (e) {}
    try { 
      await execa('choco', ['--version'], { shell: true }); 
      return 'choco'; 
    } catch (e) {}
    try { 
      await execa('wsl', ['--status'], { shell: true }); 
      return 'wsl'; 
    } catch (e) {}
    return 'manual'; // Fallback to manual installation instructions
  }
  
  // Linux package managers
  try { await execa('command', ['-v', 'apt'], { shell: true }); return 'apt'; } catch (e) {}
  try { await execa('command', ['-v', 'dnf'], { shell: true }); return 'dnf'; } catch (e) {}
  try { await execa('command', ['-v', 'yum'], { shell: true }); return 'yum'; } catch (e) {}
  return null;
}

async function existsCmd(bin) {
  try {
    if (isWindows) {
      // On Windows, try multiple methods to check if command exists
      try {
        // Method 1: Use 'where' command
        const result = await execa('where', [bin], { shell: true });
        if (result.stdout && result.stdout.trim()) {
          return true;
        }
      } catch (e) {
        // Method 2: Try running the command with --version or -h
        try {
          let checkCmd, checkArgs;
          if (bin === 'wget' || bin === 'jq' || bin === 'unzip') {
            checkCmd = bin;
            checkArgs = ['--version'];
          } else if (bin === 'netcat' || bin === 'nc') {
            checkCmd = bin;
            checkArgs = ['-h'];
          } else if (bin === 'hydra' || bin === 'gobuster' || bin === 'dirb' || bin === 'medusa') {
            checkCmd = bin;
            checkArgs = ['-h'];
          } else if (bin === 'nikto') {
            checkCmd = bin;
            checkArgs = ['-Version'];
          } else if (bin === 'sqlmap') {
            checkCmd = bin;
            checkArgs = ['--version'];
          } else if (bin === 'theHarvester') {
            checkCmd = bin;
            checkArgs = ['-h'];
          } else if (bin === 'amass') {
            checkCmd = bin;
            checkArgs = ['-version'];
          } else if (bin === 'john') {
            checkCmd = bin;
            checkArgs = ['--version'];
          } else if (bin === 'metasploit-framework') {
            checkCmd = 'msfconsole';
            checkArgs = ['--version'];
          } else if (bin === 'zaproxy') {
            checkCmd = 'zap.sh';
            checkArgs = ['-v'];
          } else if (bin === 'mitmproxy') {
            checkCmd = bin;
            checkArgs = ['--version'];
          } else if (bin === 'socat') {
            checkCmd = bin;
            checkArgs = ['-V'];
          } else if (bin === 'fail2ban') {
            checkCmd = 'fail2ban-client';
            checkArgs = ['-V'];
          } else if (bin === 'ffuf' || bin === 'nuclei' || bin === 'dalfox') {
            checkCmd = bin;
            checkArgs = ['-h'];
          } else {
            checkCmd = bin;
            checkArgs = ['--version'];
          }
          
          await execa(checkCmd, checkArgs, { shell: true, timeout: 5000 });
          return true;
        } catch (versionError) {
          // Method 3: Check in WSL if available
          try {
            await execa('wsl', ['-d', 'kali-linux', 'which', bin], { shell: true, timeout: 5000 });
            return true;
          } catch (wslError) {
            return false;
          }
        }
      }
      return false;
    } else {
      // Linux/Mac
      await execa('command', ['-v', bin], { shell: true });
      return true;
    }
  } catch (e) {
    return false;
  }
}

async function runShell(cmd, showOutput = false) {
  try {
    // Parse command and arguments
    const parts = cmd.split(' ');
    const command = parts[0];
    const args = parts.slice(1);
    
    const proc = execa(command, args, { shell: true });
    if (showOutput) {
      proc.stdout.pipe(process.stdout);
      proc.stderr.pipe(process.stderr);
    }
    const res = await proc;
    return { ok: true, out: res.stdout };
  } catch (err) {
    return { ok: false, out: err.stderr || err.message || '' };
  }
}

async function ensureGoBinInPath() {
  const { ok, out } = await runShell('go env GOPATH || echo ""');
  const gopath = (out || '').trim() || path.join(os.homedir(), 'go');
  const gobin = path.join(gopath, 'bin');
  if (!process.env.PATH.split(path.delimiter).includes(gobin)) {
    try {
      const profile = path.join(os.homedir(), '.profile');
      fs.appendFileSync(profile, `\n# added by cursor-installer\nexport PATH=$PATH:${gobin}\n`);
      process.env.PATH = process.env.PATH + path.delimiter + gobin;
      console.log(chalk.yellow(`Added ${gobin} to PATH in ${profile}. Re-login may be required.`));
    } catch (err) {
      console.log(chalk.red(`Failed to persist go bin path. Please add: ${gobin}`));
    }
  }
}

async function main() {
  console.log(chalk.cyan('\nCursor Installer — tool checker & installer\n'));
  console.log(chalk.gray(`Platform: ${os.platform()}\n`));

  const pkg = await detectPackageManager();
  if (!pkg) {
    console.log(chalk.red('No supported package manager detected. Exiting.'));
    process.exit(1);
  }
  console.log(chalk.gray(`Detected package manager: ${pkg}\n`));

  // Windows-specific setup
  if (isWindows && pkg === 'wsl') {
    console.log(chalk.yellow('⚠️  WSL detected. Some tools will be installed in WSL Kali Linux.'));
    console.log(chalk.gray('Make sure Kali Linux is installed in WSL: wsl --install -d kali-linux\n'));
  }

  // build status list
  const status = [];
  const checkSpinner = ora('Checking tools...').start();
  for (const t of TOOLS) {
    const present = await existsCmd(t.name);
    status.push({ ...t, present });
  }
  checkSpinner.stop();

  // present interactive list (checkbox) pre-checking missing ones
  const choices = status.map(s => ({
    name: `${s.name}${s.present ? chalk.gray(' (installed)') : chalk.yellow(' (missing)')}`,
    value: s.name,
    checked: !s.present // auto-check missing ones for convenience
  }));

  const { selected } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selected',
      message: 'Select tools to install (space to toggle, enter to continue):',
      choices
    }
  ]);

  if (!selected || selected.length === 0) {
    console.log(chalk.yellow('No tools selected. Exiting.'));
    return;
  }

  // If go-based tools selected and go not present, ensure go is installed first
  const needGo = selected.some(name => {
    const t = TOOLS.find(x => x.name === name);
    return t && t.type === 'go';
  });
  const goTool = TOOLS.find(t => t.name === 'go');

  if (needGo && !status.find(s => s.name === 'go').present) {
    const ok = (await inquirer.prompt([{ type: 'confirm', name: 'installGo', message: 'Go is required for some tools. Install Go now?', default: true }])).installGo;
    if (!ok) {
      console.log(chalk.red('Go not installed — cannot install Go-based tools. Skipping them.'));
    } else {
      const spinner = ora('Installing Go...').start();
      // translate apt/dnf/yum
      let cmd = goTool.install;
      if (pkg !== 'apt' && cmd.startsWith('sudo apt')) {
        cmd = cmd.replace('sudo apt install -y', pkg === 'dnf' ? 'sudo dnf install -y' : 'sudo yum install -y');
      }
      const res = await runShell(cmd, true);
      if (res.ok) {
        spinner.succeed('Go installed.');
        await ensureGoBinInPath();
      } else {
        spinner.fail('Go installation failed.');
        console.log(chalk.red(res.out));
      }
    }
  }

  // Install selected tools sequentially
  for (const name of selected) {
    const t = TOOLS.find(x => x.name === name);
    if (!t) continue;
    // skip if already installed
    if (await existsCmd(t.name)) {
      console.log(chalk.green(`${t.name} already installed — skipping.`));
      continue;
    }

    const spinner = ora(`Installing ${t.name}...`).start();
    let cmd = t.install;
    
        // Platform-specific command adaptation
        if (isWindows) {
          if (pkg === 'winget' && t.type === 'winget') {
            // Use winget command with proper flags
            cmd = t.install + ' --accept-package-agreements --accept-source-agreements';
          } else if (pkg === 'wsl' && t.type === 'wsl') {
            // Use WSL command as-is
            cmd = t.install;
          } else if (t.wslInstall) {
            // Fallback to WSL installation
            cmd = t.wslInstall;
          } else if (t.type === 'winget') {
            // Force winget installation even if pkg detection failed
            cmd = t.install + ' --accept-package-agreements --accept-source-agreements';
          }
        } else {
          // Linux: adapt apt -> dnf/yum if needed
          if (t.type === 'apt' && pkg !== 'apt' && cmd.startsWith('sudo apt')) {
            cmd = cmd.replace('sudo apt install -y', pkg === 'dnf' ? 'sudo dnf install -y' : 'sudo yum install -y');
          }
        }

    const result = await runShell(cmd, true);
    if (result.ok) {
      spinner.succeed(`${t.name} installed.`);
    } else {
      spinner.fail(`${t.name} installation failed.`);
      console.log(chalk.red(result.out.split('\n').slice(0,5).join('\n')));
      
      // Windows-specific error handling
      if (isWindows) {
        console.log(chalk.yellow(`\n💡 Windows Installation Tips for ${t.name}:`));
        if (t.type === 'winget') {
          console.log(chalk.gray('• Make sure Windows Package Manager (winget) is installed'));
          console.log(chalk.gray('• Try running as administrator'));
          console.log(chalk.gray('• Check if the package ID is correct'));
        } else if (t.type === 'wsl') {
          console.log(chalk.gray('• Make sure WSL and Kali Linux are installed'));
          console.log(chalk.gray('• Try: wsl --install -d kali-linux'));
          console.log(chalk.gray('• Run WSL as administrator if needed'));
        }
      }
      
      // offer to show full error or open manual instructions
      const { see } = await inquirer.prompt([{ type: 'confirm', name: 'see', message: `Show full install error for ${t.name}?`, default: false }]);
      if (see) console.log(chalk.red(result.out));
    }
  }

  // Final verification
  const finalMissing = [];
  for (const t of TOOLS) {
    if (!await existsCmd(t.name)) finalMissing.push(t.name);
  }

  console.log(chalk.cyan('\n=== Installation Summary ==='));
  if (finalMissing.length === 0) {
    console.log(chalk.green('All tools installed and available in PATH.'));
  } else {
    console.log(chalk.yellow('The following tools are still missing:'), finalMissing.join(', '));
    
    if (isWindows) {
      console.log(chalk.yellow('\n💡 Windows Installation Help:'));
      console.log(chalk.gray('• For security tools: Install Kali Linux in WSL first'));
      console.log(chalk.gray('• Run: wsl --install -d kali-linux'));
      console.log(chalk.gray('• Then run this installer again'));
      console.log(chalk.gray('• For Go tools: Make sure GOPATH/bin is in your PATH'));
      console.log(chalk.gray('• Restart your terminal after installation'));
    } else {
      console.log(chalk.gray('You may need to add GOPATH/bin to PATH and re-open terminal for go tools.'));
    }
  }
  console.log('');
}

// Export for use in Electron
module.exports = {
  main,
  TOOLS,
  detectPackageManager,
  existsCmd,
  runShell
};

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error(chalk.red('Fatal error:'), err);
    process.exit(1);
  });
}
