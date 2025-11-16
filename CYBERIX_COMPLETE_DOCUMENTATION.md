# Cyberix - Comprehensive Desktop Security Suite Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Core Features & Capabilities](#core-features--capabilities)
4. [Security Testing Modules](#security-testing-modules)
5. [Installation & Setup](#installation--setup)
6. [User Interface & Workflow](#user-interface--workflow)
7. [WSL & Kali Linux Integration](#wsl--kali-linux-integration)
8. [API & Backend Services](#api--backend-services)
9. [Security Tools Integration](#security-tools-integration)
10. [Reporting & Export](#reporting--export)
11. [Configuration & Settings](#configuration--settings)
12. [Troubleshooting](#troubleshooting)
13. [Development Guide](#development-guide)
14. [API Reference](#api-reference)
15. [Frequently Asked Questions](#frequently-asked-questions)

---

## Project Overview

### What is Cyberix?

Cyberix is a comprehensive desktop application for cybersecurity scanning, vulnerability assessment, and penetration testing. It provides ethical hackers, security professionals, and organizations with a professional-grade security testing platform that integrates Kali Linux tools through Windows Subsystem for Linux (WSL).

### Key Characteristics

- **Desktop Application**: Built with Electron and React for cross-platform compatibility
- **Professional Security Suite**: 20+ integrated security testing modules
- **Kali Linux Integration**: Leverages industry-standard penetration testing tools
- **Real-time Scanning**: Live progress tracking and detailed logging
- **Comprehensive Reporting**: PDF, JSON, CSV, and HTML report generation
- **User-friendly Interface**: Intuitive GUI for complex security operations

### Target Users

- Ethical hackers and penetration testers
- Security professionals and consultants
- IT administrators and DevOps teams
- Organizations conducting security audits
- Students learning cybersecurity

### Core Philosophy

Cyberix bridges the gap between complex command-line security tools and user-friendly desktop applications, making professional-grade security testing accessible while maintaining the power and flexibility of Kali Linux tools.

---

## Architecture & Technology Stack

### Frontend Architecture

```
Electron Main Process
├── React Application (Vite)
│   ├── Dashboard & UI Components
│   ├── Context Providers (Scanning, Auth, Theme, etc.)
│   ├── Service Layer (API integrations)
│   └── Utility Functions
└── IPC Communication Bridge
```

### Technology Stack

#### Frontend
- **Electron**: Cross-platform desktop application framework
- **React 19**: Modern UI library with hooks
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework
- **Chart.js/Recharts**: Data visualization
- **Lucide React**: Icon library
- **Framer Motion**: Animation library
- **React Hot Toast**: Notification system

#### Backend & Integration
- **Node.js**: Server-side JavaScript runtime
- **WSL 2**: Windows Subsystem for Linux integration
- **Kali Linux**: Penetration testing distribution
- **Python 3**: Backend parsing and analysis scripts
- **Bash/Shell**: Command execution and automation

#### Security Tools Integration
- **Nmap**: Network scanning and port discovery
- **Masscan**: High-speed port scanning
- **Nikto**: Web server scanner
- **SQLMap**: SQL injection testing
- **XSStrike**: XSS vulnerability scanner
- **Wapiti**: Web application vulnerability scanner
- **WPScan**: WordPress security scanner
- **ClamAV**: Malware detection
- **YARA**: Malware pattern matching
- **RKHunter/Chkrootkit**: Rootkit detection
- **Lynis**: System security auditing
- **Tshark/Wireshark**: Network traffic analysis
- **Dnstwist**: Domain fuzzing and phishing detection

#### Data Processing
- **XML2JS**: XML parsing for tool outputs
- **Axios**: HTTP client for API communications
- **File System APIs**: Local file operations
- **Child Process**: Command execution
- **Crypto APIs**: Secure credential storage

### Application Structure

```
cyberix/
├── src/
│   ├── components/          # React UI components (82+ components)
│   ├── scanners/           # Security scanner modules (13 scanners)
│   ├── services/           # API service integrations
│   ├── context/            # React context providers
│   ├── utils/              # Helper utilities and WSL integration
│   ├── maldef/             # Malware/defacement monitoring
│   └── main/               # Electron main process files
├── backend/                # Python analysis scripts
├── public/                 # Static assets
├── dist/                   # Build output
└── package.json            # Dependencies and scripts
```

---

## Core Features & Capabilities

### 1. Comprehensive Security Scanning
- **20+ Security Tests** covering infrastructure, web applications, and network security
- **Automated Scanning** with intelligent workflow management
- **Real-time Progress Tracking** with detailed logging
- **Modular Architecture** allowing custom scan configurations

### 2. Web Application Security
- **SQL Injection Testing** using SQLMap with comprehensive payload testing
- **XSS Vulnerability Scanning** with XSStrike and custom payload injection
- **CSRF Protection Testing** with token validation and bypass attempts
- **Authentication Bypass Testing** including brute force and session attacks
- **File Upload Vulnerability Assessment** with malicious file detection
- **Framework Detection** identifying technologies and versions

### 3. Network & Infrastructure Security
- **Port Scanning** with Nmap and Masscan integration
- **Service Version Detection** and fingerprinting
- **SSL/TLS Certificate Analysis** with vulnerability checking
- **DNS Analysis** including subdomain enumeration
- **Security Headers Analysis** for web server hardening
- **API Endpoint Discovery** through network traffic capture

### 4. Monitoring & Detection
- **Phishing Detection** using domain fuzzing and similarity analysis
- **Malware Detection** with ClamAV and YARA rule scanning
- **Defacement Monitoring** with hash-based change detection
- **Network Traffic Analysis** using Tshark for packet capture
- **Rootkit Detection** with RKHunter and chkrootkit

### 5. GitHub Integration
- **OAuth Authentication** for GitHub account access
- **Repository Scanning** for code security analysis
- **Dependency Analysis** for vulnerable package detection
- **Secret Detection** in source code
- **Organization-wide Scanning** for enterprise security

### 6. Reporting & Analytics
- **Professional PDF Reports** with executive summaries
- **Structured JSON Export** for automation and integration
- **CSV Data Export** for spreadsheet analysis
- **Interactive HTML Reports** with filtering and search
- **Real-time Dashboard** with visual analytics

---

## Security Testing Modules

### Web Application Security Scanners

#### SQL Injection Scanner (`sql-injection-scanner.js`)
- **Tool**: SQLMap integration
- **Capabilities**:
  - Automated SQL injection detection
  - Multiple injection techniques (GET, POST, cookie, header)
  - Database fingerprinting
  - Data extraction capabilities
  - WAF bypass techniques
- **Output**: Detailed vulnerability reports with proof-of-concept

#### XSS Scanner (`xss-scanner.js`)
- **Tool**: XSStrike and custom payload injection
- **Capabilities**:
  - Reflected XSS detection
  - Stored XSS testing
  - DOM-based XSS analysis
  - Payload obfuscation
  - Context-aware testing
- **Output**: Vulnerability locations with exploit examples

#### CSRF Scanner (`csrf-scanner.js`)
- **Tool**: Custom analysis with CSRF testing
- **Capabilities**:
  - Token validation testing
  - SameSite cookie analysis
  - Referer header checking
  - State-changing operation detection
- **Output**: CSRF vulnerability assessment

### Network Security Scanners

#### Port Scanner (`port-scan.js`)
- **Tools**: Nmap, Masscan, custom JavaScript fallback
- **Capabilities**:
  - Full port range scanning (1-65535)
  - Service version detection
  - OS fingerprinting
  - Vulnerability script execution
  - High-speed scanning with Masscan
- **Output**: Open ports, services, and potential vulnerabilities

#### Network Analysis (`network-analysis.js`)
- **Tools**: Tshark, tcpdump, custom parsers
- **Capabilities**:
  - Network traffic capture
  - Protocol analysis
  - API endpoint discovery
  - Traffic pattern analysis
- **Output**: Network mapping and API documentation

### Advanced Security Modules

#### Malware Detection (`maldef/`)
- **Tools**: ClamAV, YARA, custom scanners
- **Capabilities**:
  - File-based malware scanning
  - YARA rule matching
  - Defacement detection with baselines
  - Real-time monitoring
- **Output**: Malware reports with quarantine recommendations

#### Phishing Detection (`scanners/phishing-detection.js`)
- **Tools**: Dnstwist, custom similarity analysis
- **Capabilities**:
  - Domain fuzzing and permutation generation
  - Visual similarity analysis
  - SSL certificate validation
  - Content similarity scoring
- **Output**: Phishing risk assessment with recommendations

---

## Installation & Setup

### System Requirements

#### Minimum Requirements
- **Operating System**: Windows 10/11 (64-bit)
- **RAM**: 8GB minimum, 16GB recommended
- **Storage**: 20GB free space for tools and scans
- **Network**: Stable internet connection for tool downloads

#### Required Software
- **WSL 2**: Windows Subsystem for Linux (automatically installed)
- **Kali Linux**: Penetration testing distribution (automatically installed)
- **Administrator Privileges**: Required for WSL installation and root access

### Installation Process

#### Step 1: Initial Setup
1. Download and extract Cyberix application
2. Run as Administrator (required for WSL setup)
3. Application automatically detects system configuration
4. Follow on-screen prompts for WSL and Kali Linux installation

#### Step 2: WSL Configuration
```powershell
# Automatic WSL installation (handled by app)
wsl --install
wsl --set-default-version 2

# Kali Linux installation (handled by app)
wsl --install -d kali-linux
```

#### Step 3: Tool Installation
The application automatically installs required Kali Linux tools:
```bash
# Core security tools
sudo apt update && sudo apt install -y \
  nmap masscan nikto sqlmap xsstrike wapiti \
  wpscan clamav yara rkhunter chkrootkit lynis \
  tshark tcpdump dnstwist git curl wget
```

#### Step 4: Credential Setup
- WSL root password configuration
- Secure credential storage (encrypted)
- Tool verification and testing

### Post-Installation Verification

#### System Status Check
Navigate to Settings → System Status to verify:
- ✅ WSL installation and version
- ✅ Kali Linux distribution availability
- ✅ Required security tools installation
- ✅ Network connectivity and permissions

#### Tool Verification
```bash
# Verify tool installation
nmap --version
sqlmap --version
nikto -Version
```

---

## User Interface & Workflow

### Main Interface Components

#### Dashboard Layout
```
┌─────────────────────────────────────────────────┐
│ Header: Cyberix Logo + User Menu + Settings    │
├─────────────────────────────────────────────────┤
│ Navigation Tabs:                               │
│ • Overview (Main Scanning)                     │
│ • API Scanner (Network Traffic Analysis)       │
│ • Phishing Detection                           │
│ • Malware Monitor                              │
│ • Settings                                     │
├─────────────────────────────────────────────────┤
│ Main Content Area:                             │
│ - Scan Configuration                           │
│ - Progress Tracking                            │
│ - Results Display                              │
├─────────────────────────────────────────────────┤
│ Footer: Status Bar + Progress Indicators       │
└─────────────────────────────────────────────────┘
```

#### Authentication Flow
1. **Login Screen**: Simple username/password authentication
2. **System Verification**: Automatic WSL and tool checking
3. **Setup Completion**: Guided first-time configuration
4. **Dashboard Access**: Full application functionality

### Scanning Workflow

#### 1. Target Configuration
- **URL Input**: Support for HTTP/HTTPS targets
- **Validation**: Automatic URL format checking
- **Domain Extraction**: Intelligent hostname parsing

#### 2. Scan Type Selection
- **Comprehensive Scan**: All 20+ security tests
- **Quick Scan**: Essential security checks only
- **Custom Scan**: User-selected specific tests

#### 3. Scan Execution
- **Progress Tracking**: Real-time status updates
- **Log Streaming**: Live command output display
- **Cancellation Support**: Ability to stop running scans

#### 4. Results Analysis
- **Organized Display**: Categorized findings
- **Severity Classification**: Critical, High, Medium, Low, Info
- **Detailed Information**: Proof-of-concept and recommendations

#### 5. Report Generation
- **Multiple Formats**: PDF, JSON, CSV, HTML
- **Customization**: Executive summaries and technical details
- **Export Options**: Save locally or share

### Context Providers

#### ScanningContext
- Manages scan state across components
- Handles progress updates and results
- Coordinates multiple concurrent scans

#### GlobalScanContext
- Application-wide scan coordination
- Result aggregation and caching
- Performance optimization

#### ThemeContext
- Dark/light mode switching
- Consistent styling across components
- User preference persistence

#### NotificationContext
- Toast notification management
- Error handling and user feedback
- Status updates and alerts

---

## WSL & Kali Linux Integration

### WSL Architecture Integration

#### WSL Detection and Setup
```javascript
// Automatic WSL detection
const wslInstalled = await window.cyberGuard.checkWsl()
if (!wslInstalled) {
  await window.cyberGuard.installWslDirect()
}
```

#### Kali Linux Management
```javascript
// Kali distribution handling
const kaliInstalled = await window.cyberGuard.checkKali()
if (!kaliInstalled) {
  await window.cyberGuard.installKali()
}
```

### Command Execution Pattern

#### WSL Command Execution
```javascript
// Standard pattern for tool execution
const command = `wsl -d kali-linux -- bash -c "tool command"`
const result = await execAsync(command, {
  timeout: 300000, // 5 minutes
  maxBuffer: 1024 * 1024 * 10 // 10MB buffer
})
```

#### Real-time Output Streaming
```javascript
// Live progress tracking
const scanner = spawn('wsl', ['-d', 'kali-linux', '--', 'nmap', ...args])
scanner.stdout.on('data', (data) => {
  onProgress({ message: data.toString(), stage: 'scanning' })
})
```

### Credential Management

#### Secure Password Storage
- **Encryption**: AES-256 encryption for WSL credentials
- **Key Derivation**: PBKDF2 for secure key generation
- **Storage**: Windows Credential Manager integration

#### Password Validation
```javascript
// Credential verification
const isValid = await window.cyberGuard.validateWslCredentials(
  username, password
)
```

### Tool Installation Automation

#### Package Management
```bash
# Automated tool installation
sudo apt update
sudo apt install -y nmap sqlmap nikto clamav
```

#### Version Verification
```javascript
// Tool availability checking
const tools = await window.cyberGuard.checkRequiredToolsOnly(password)
```

---

## API & Backend Services

### Service Architecture

#### Core API Service (`api.js`)
```javascript
// Axios instance with interceptors
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})
```

#### Authentication Service (`authApi.js`)
- User login/logout handling
- Token management and refresh
- Session persistence

#### Scanning Service (`scansApi.js`)
- Scan initiation and monitoring
- Result retrieval and processing
- Progress tracking APIs

#### AI Service (`aiApi.js`)
- Vulnerability analysis
- Security recommendations
- Report generation assistance

### GitHub Integration Services

#### GitHub API Service (`githubApi.js`)
```javascript
// OAuth flow
const authUrl = await githubApi.initiateOAuth({
  redirect: 'myapp://github-callback'
})

// Repository scanning
const scanResult = await githubApi.scanRepository(owner, repo, {
  scanTypes: ['code', 'dependencies', 'secrets']
})
```

#### GitHub Helpers (`githubHelpers.js`)
- Electron protocol handling for OAuth
- Callback URL processing
- Configuration validation

### Backend Python Scripts

#### Network Analysis (`network_scan_to_json_v_2.py`)
```python
# Command-line interface
python3 network_scan_to_json_v2.py \
  --input nmap.txt whatweb.txt \
  --domain example.com \
  --output report.json
```

#### Features
- Multi-tool output parsing
- JSON report generation
- Structured vulnerability data
- Integration with Electron frontend

---

## Security Tools Integration

### Tool Categories and Integration

#### Web Application Scanners

**Nikto** - Web Server Scanner
```bash
nikto -h https://example.com -output nikto_report.json -Format json
```
- Server configuration analysis
- Outdated software detection
- Common vulnerability checks

**SQLMap** - SQL Injection Testing
```bash
sqlmap -u "https://example.com/page?id=1" --batch --dbs
```
- Automated SQL injection detection
- Database enumeration
- Data extraction capabilities

**XSStrike** - XSS Scanner
```bash
xsstrike -u "https://example.com/search?q=test"
```
- Cross-site scripting detection
- Payload generation and testing
- WAF bypass techniques

#### Network Scanners

**Nmap** - Network Mapper
```bash
nmap -sV -sC -p- -T4 example.com
```
- Port scanning and service detection
- OS fingerprinting
- Vulnerability script execution

**Masscan** - High-Speed Scanner
```bash
masscan -p1-65535 example.com --rate=1000
```
- Fast port discovery
- Large-scale network scanning
- Integration with Nmap for detailed analysis

#### Malware Detection Tools

**ClamAV** - Antivirus Engine
```bash
clamscan -r -i /path/to/scan --log=clamav.log
```
- File-based malware detection
- Signature and heuristic analysis
- Integration with scanning workflows

**YARA** - Pattern Matching
```bash
yara -r /opt/maldef/rules/malware.yar /path/to/files
```
- Custom rule-based detection
- Malware pattern matching
- Signature development support

### Tool Orchestration

#### Command Execution Flow
1. **Input Validation**: Target URL/domain verification
2. **Environment Setup**: WSL/Kali context preparation
3. **Command Construction**: Tool-specific argument building
4. **Execution Monitoring**: Real-time output capture
5. **Result Processing**: Output parsing and structuring
6. **Report Generation**: Findings aggregation and formatting

#### Error Handling
- **Timeout Management**: Configurable execution limits
- **Process Monitoring**: Child process lifecycle management
- **Output Parsing**: Robust error detection and reporting
- **Fallback Mechanisms**: Alternative tools for reliability

---

## Reporting & Export

### Report Types

#### PDF Reports
- **Executive Summary**: High-level findings overview
- **Technical Details**: Detailed vulnerability information
- **Recommendations**: Remediation guidance
- **Visual Elements**: Charts, graphs, and severity indicators

#### JSON Export
```json
{
  "metadata": {
    "target": "https://example.com",
    "timestamp": "2024-01-15T10:30:00Z",
    "scanDuration": 125000,
    "toolsUsed": ["nmap", "nikto", "sqlmap"]
  },
  "summary": {
    "status": "warning",
    "riskScore": 45,
    "severity": "HIGH",
    "totalFindings": 12
  },
  "findings": {
    "web": { "count": 5, "findings": [...] },
    "network": { "count": 3, "findings": [...] },
    "malware": { "count": 0, "findings": [] }
  }
}
```

#### CSV Export
- Spreadsheet-compatible format
- Filtering and sorting capabilities
- Import into security tools and databases

#### HTML Reports
- Interactive web-based reports
- Filtering and search functionality
- Responsive design for mobile viewing

### Report Generation Process

#### Data Collection
1. **Raw Output Capture**: Direct tool output storage
2. **Structured Parsing**: Conversion to standardized format
3. **Risk Assessment**: Severity scoring and categorization
4. **Recommendation Engine**: Automated remediation suggestions

#### Visualization
- **Charts and Graphs**: Using Chart.js and Recharts
- **Severity Distribution**: Visual risk assessment
- **Timeline Analysis**: Scan progress and duration
- **Finding Categories**: Organized display by vulnerability type

---

## Configuration & Settings

### Application Settings

#### WSL Configuration
```json
{
  "distribution": "kali-linux",
  "rootAccess": true,
  "passwordStorage": "encrypted",
  "autoUpdate": true
}
```

#### Scan Settings
```json
{
  "timeout": 120000,
  "concurrency": 3,
  "outputFormat": "json",
  "includeRawOutput": true,
  "riskThreshold": "medium"
}
```

#### Network Settings
```json
{
  "interface": "eth0",
  "captureDuration": 120,
  "tlsDecryption": false,
  "proxySettings": null
}
```

### Environment Variables

#### API Configuration
```env
VITE_API_BASE_URL=http://localhost:3001/api
VITE_GROK_API_KEY=your_grok_api_key_here
```

#### GitHub Integration
```env
VITE_GITHUB_CLIENT_ID=your_github_client_id
VITE_GITHUB_CLIENT_SECRET=your_github_client_secret
VITE_GITHUB_CALLBACK_URL=http://localhost:4005/api/github/callback
```

### User Preferences

#### Theme Settings
- Dark/Light mode toggle
- Accent color customization
- Font size and family options

#### Notification Settings
- Toast notification preferences
- Alert thresholds and types
- Sound and visual feedback

---

## Troubleshooting

### Common Issues and Solutions

#### WSL Installation Problems

**Issue**: WSL installation fails
```
Error: WSL installation requires administrator privileges
```
**Solution**:
1. Run application as Administrator
2. Enable Virtual Machine Platform feature
3. Enable Windows Subsystem for Linux feature
4. Manual installation: `wsl --install`

#### Kali Linux Setup Issues

**Issue**: Kali Linux not found in WSL
```
Error: kali-linux distribution not available
```
**Solution**:
```bash
# Manual installation
wsl --install -d kali-linux
wsl -s kali-linux  # Set as default
```

#### Tool Installation Failures

**Issue**: Security tools not installing
```
Error: apt update failed
```
**Solution**:
```bash
# Manual tool installation
sudo apt update
sudo apt install -y nmap sqlmap nikto
```

#### Permission Errors

**Issue**: Root access denied
```
Error: sudo: authentication failed
```
**Solution**:
1. Verify WSL credentials are stored correctly
2. Reset password in Settings → WSL Configuration
3. Check sudo privileges in Kali Linux

#### Network Capture Issues

**Issue**: No packets captured
```
Warning: 0 packets captured
```
**Solution**:
```bash
# Set capture permissions
sudo setcap cap_net_raw,cap_net_admin+eip /usr/bin/dumpcap

# Verify interface
ip link show
```

### Performance Optimization

#### Scan Performance Tuning
- Adjust concurrency settings for system resources
- Use Quick Scan for faster results
- Configure appropriate timeouts

#### Memory Management
- Monitor system resources during large scans
- Use selective scanning for targeted assessments
- Clear cache and temporary files regularly

### Logging and Debugging

#### Application Logs
- View logs in Settings → System Status
- Enable debug logging in development mode
- Export logs for troubleshooting

#### WSL Command Debugging
```javascript
// Enable verbose logging
console.log('WSL Command:', command)
console.log('Execution Result:', result)
```

---

## Development Guide

### Project Setup

#### Development Environment
```bash
# Clone repository
git clone <repository-url>
cd synergy-cyberix

# Install dependencies
npm install

# Start development server
npm run electron:dev
```

#### Build Process
```bash
# Production build
npm run build

# Create executable
npm run build:exe

# Portable version
npm run dist:win
```

### Code Organization

#### Component Structure
```
src/components/
├── ui/           # Reusable UI components
├── scanning/     # Scan-specific components
├── settings/     # Configuration components
└── dashboard/    # Main dashboard components
```

#### Scanner Modules
```
src/scanners/
├── base/         # Base scanner classes
├── web/          # Web application scanners
├── network/      # Network scanners
└── malware/      # Malware detection
```

### Adding New Scanners

#### Scanner Template
```javascript
class CustomScanner {
  constructor(targetUrl, outputDir) {
    this.targetUrl = targetUrl;
    this.outputDir = outputDir;
  }

  async scan(onProgress) {
    // Implementation
    const result = await this.runWslCommand(command);
    return this.parseResults(result);
  }
}
```

#### Integration Steps
1. Create scanner class in `src/scanners/`
2. Add to scan orchestrator
3. Update UI components
4. Add configuration options
5. Test with various targets

### Testing Strategy

#### Unit Testing
```javascript
// Scanner testing
test('should detect vulnerabilities', async () => {
  const scanner = new SQLInjectionScanner('http://test.com');
  const results = await scanner.scan();
  expect(results.vulnerabilities).toBeDefined();
});
```

#### Integration Testing
- End-to-end scan workflows
- WSL integration testing
- API service testing

---

## API Reference

### Core APIs

#### Scanning API
```javascript
// Start comprehensive scan
const scanId = await scansApi.startWebsiteScan({
  target: 'https://example.com',
  scanTypes: ['vulnerability', 'malware'],
  options: { timeout: 120000 }
});

// Get scan status
const status = await scansApi.getScanStatus(scanId);

// Get results
const results = await scansApi.getScanResults(scanId);
```

#### Authentication API
```javascript
// Login
const user = await authApi.login({
  username: 'admin',
  password: 'password',
  rememberMe: true
});

// Logout
await authApi.logout();

// Check authentication
const isAuth = authApi.isAuthenticated();
```

### GitHub Integration API

#### OAuth Flow
```javascript
// Initiate OAuth
const authUrl = await githubApi.initiateOAuth({
  redirect: 'myapp://github-callback'
});

// Complete OAuth
const result = await githubHelpers.completeOAuthFlow({
  redirect: 'myapp://github-callback'
});
```

#### Repository Operations
```javascript
// Scan repository
const scan = await githubScanIntegration.scanRepository(
  'owner', 'repo-name',
  { scanTypes: ['code', 'secrets'] }
);

// Get organization repos
const repos = await githubApi.getOrganizationRepos('org-name');
```

### Backend Python APIs

#### Network Analysis
```python
# Parse scan outputs
python3 backend/network_scan_to_json_v2.py \
  --input nmap.xml nikto.txt \
  --domain example.com \
  --output results.json
```

#### Output Format
```json
{
  "findings": [
    {
      "tool": "nmap",
      "type": "port_scan",
      "severity": "info",
      "description": "Port 80/tcp open",
      "recommendation": "Review web server configuration"
    }
  ],
  "summary": {
    "total_findings": 15,
    "critical": 2,
    "high": 3
  }
}
```

---

## Frequently Asked Questions

### General Questions

**Q: What makes Cyberix different from other security scanners?**
A: Cyberix provides a desktop application that integrates professional Kali Linux tools with an intuitive interface, eliminating the need for command-line expertise while maintaining full tool capabilities.

**Q: Do I need Kali Linux experience to use Cyberix?**
A: No, Cyberix handles all Kali Linux integration automatically. Users only need to specify targets and select scan types.

**Q: Can Cyberix scan production systems?**
A: Only scan systems you own or have explicit permission to test. Cyberix includes legal disclaimers and should only be used for authorized security testing.

### Technical Questions

**Q: What are the system requirements?**
A: Windows 10/11 (64-bit), 8GB RAM minimum, 20GB storage, WSL 2, and administrator privileges for setup.

**Q: How does WSL integration work?**
A: Cyberix automatically installs and configures WSL 2 with Kali Linux, executes security tools in the Linux environment, and streams results back to the Windows desktop interface.

**Q: Can I use Cyberix offline?**
A: Basic functionality works offline, but tool updates and some features require internet connectivity.

**Q: How are credentials stored securely?**
A: WSL passwords are encrypted using AES-256 and stored in Windows Credential Manager with PBKDF2 key derivation.

### Scanning Questions

**Q: How long do scans typically take?**
A: Quick scans: 5-15 minutes, Comprehensive scans: 10-30 minutes, depending on target size and network conditions.

**Q: Can I scan multiple targets simultaneously?**
A: Yes, Cyberix supports concurrent scanning with configurable limits to manage system resources.

**Q: What types of reports are available?**
A: PDF (professional), JSON (structured), CSV (spreadsheet), and HTML (interactive) formats.

### Troubleshooting Questions

**Q: Why does WSL installation fail?**
A: Ensure you're running as Administrator, Virtual Machine Platform is enabled in Windows Features, and Windows is updated.

**Q: Tools show as not installed?**
A: Check internet connectivity, WSL network access, and try manual installation through the Settings panel.

**Q: Getting permission denied errors?**
A: Verify WSL credentials are stored correctly and the user has sudo privileges in Kali Linux.

### Development Questions

**Q: How do I add a new security scanner?**
A: Create a scanner class in `src/scanners/`, implement the scan method, add to the orchestrator, and update the UI components.

**Q: Can I integrate custom tools?**
A: Yes, Cyberix's modular architecture supports adding new tools following the established patterns for WSL command execution and result parsing.

**Q: How do I contribute to the project?**
A: Follow the development guide, ensure code quality, add tests, update documentation, and submit pull requests.

---

## Support and Resources

### Documentation Links
- [Kali Tools Integration Guide](KALI_TOOLS_INTEGRATION_SUMMARY.md)
- [WSL Root Access Guide](WSL_ROOT_ACCESS_GUIDE.md)
- [API Documentation](src/services/README.md)

### Community Support
- GitHub Issues for bug reports
- Documentation wiki for tutorials
- Community forums for discussions

### Professional Services
- Security consulting and training
- Custom scanner development
- Enterprise integration support

---

**Cyberix** - Professional Security Testing Made Simple

*Built with ❤️ for security professionals and ethical hackers*

*Version 1.0.0 - Comprehensive Desktop Security Suite*

