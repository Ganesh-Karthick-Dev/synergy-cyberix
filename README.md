# Synergy Cyberix - Desktop Security Suite

A comprehensive desktop application for cybersecurity scanning, vulnerability assessment, and penetration testing. Built with Electron and React, leveraging Kali Linux tools through WSL (Windows Subsystem for Linux) for professional-grade security testing.

![Synergy Cyberix](src/assets/webp/Cybersecurity%20research-02.webp)

## 🚀 Features

### 🔍 Comprehensive Security Scanning
- **20+ Security Tests** covering infrastructure, web application, and network security
- **API Endpoint Discovery** using Wireshark/tshark for network traffic analysis
- **Vulnerability Assessment** with real Kali Linux penetration testing tools
- **Automated Scanning** with detailed reporting and recommendations

### 🛡️ Security Testing Modules

#### Web Application Security
- **SQL Injection Testing** - Automated SQLi detection using sqlmap
- **XSS (Cross-Site Scripting)** - Comprehensive XSS vulnerability scanning
- **CSRF (Cross-Site Request Forgery)** - CSRF token validation and testing
- **Authentication Bypass** - Brute force and authentication vulnerability testing
- **File Upload Vulnerabilities** - File upload security assessment
- **IDOR/SSRF/XXE** - Advanced web application security testing

#### Network & Infrastructure Security
- **Port Scanning** - Nmap and Masscan integration for port discovery
- **SSL/TLS Analysis** - Certificate validation and security assessment
- **DNS Analysis** - DNS enumeration and subdomain discovery
- **Security Headers** - HTTP security header analysis
- **API Security** - Network traffic capture and API endpoint discovery

#### Monitoring & Detection
- **Phishing Detection** - Domain fuzzing and similarity analysis using dnstwist
- **Malware Detection** - YARA and ClamAV integration for malware scanning
- **Defacement Monitoring** - Website change detection with baseline comparison
- **Network Traffic Analysis** - Real-time packet capture and analysis

### 📊 Reporting & Export
- **PDF Reports** - Professional security assessment reports
- **JSON Export** - Structured data for automation and integration
- **CSV Export** - Spreadsheet-compatible results
- **HTML Reports** - Interactive web-based reports
- **Real-time Progress Tracking** - Live scanning progress and logs

## 📋 Requirements

### System Requirements
- **Windows 10/11** (64-bit)
- **WSL 2** (Windows Subsystem for Linux) installed and enabled
- **Kali Linux** distribution installed in WSL
- **Administrator privileges** (for WSL root access and tool installation)

### Prerequisites
1. **WSL 2 Installation**
   ```powershell
   wsl --install
   wsl --set-default-version 2
   ```

2. **Kali Linux Distribution**
   - Install Kali Linux from Microsoft Store or WSL
   - Ensure it's running WSL 2

3. **Node.js** (for development)
   - Node.js 18+ recommended
   - npm or yarn package manager

## 🏁 Quick Start

### Installation

1. **Clone or Download the Repository**
   ```bash
   git clone <repository-url>
   cd synergy-cyberix
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Application**
   ```bash
   npm run build
   ```

4. **Run the Application**
   ```bash
   npm run electron:dev
   ```

### First-Time Setup

1. **Launch the Application**
   - The app will automatically detect if WSL and Kali Linux are installed
   - If not detected, follow the on-screen installation prompts

2. **WSL Credentials Setup**
   - Enter your WSL root password when prompted
   - The app needs root access to run security tools

3. **Tool Installation**
   - The app will automatically install required Kali Linux tools
   - Tools include: nmap, nikto, sqlmap, gobuster, nuclei, and more
   - This may take several minutes on first run

4. **Verify Installation**
   - Navigate to Settings → System Status
   - Verify all tools are installed and WSL is connected

## 💻 Usage Guide

### Starting a Security Scan

1. **Navigate to Overview Tab**
   - Enter the target URL (e.g., `https://example.com`)
   - Click "Start Comprehensive Scan"

2. **Select Scan Type**
   - **Comprehensive Scan**: Runs all 20+ security tests
   - **Quick Scan**: Runs essential security tests
   - **Custom Scan**: Select specific tests to run

3. **Monitor Progress**
   - Real-time progress tracking in the UI
   - Detailed logs for each test
   - Test results appear as they complete

4. **View Results**
   - Results displayed in organized sections
   - Click on individual findings for details
   - Export reports as PDF, JSON, or CSV

### API Endpoint Scanning

1. **Navigate to API Scanner Tab**
   - Enter target API URL
   - Set capture duration (default: 120 seconds)

2. **Start Capture**
   - The app will automatically:
     - Detect network interface (eth0 for WSL)
     - Trigger test requests during capture
     - Capture network traffic using tshark

3. **View Discovered Endpoints**
   - HTTP methods (GET, POST, PUT, DELETE, etc.)
   - Request/response details
   - Security findings and recommendations

### Phishing Detection

1. **Navigate to Phishing Detection Tab**
   - Enter target domain (e.g., `example.com`)
   - Click "Start Phishing Scan"

2. **Review Results**
   - Domain variations and fuzzing results
   - Visual similarity analysis with screenshots
   - Content similarity scores
   - SSL certificate validation
   - Risk scoring and recommendations

### Malware & Defacement Monitoring

1. **Navigate to Malware Monitor Tab**
   - Enter target URL
   - Set baseline (first scan creates baseline)
   - Run periodic scans

2. **Monitor Changes**
   - Hash-based change detection
   - Screenshot comparison
   - YARA rule scanning
   - ClamAV malware detection

## 🔧 Configuration

### WSL Settings
- **Distribution**: Default is `kali-linux`
- **Root Access**: Required for security tools
- **Password Storage**: Securely stored (encrypted)

### Scan Settings
- **Timeout**: Default 120 seconds per test
- **Threading**: Adjustable concurrent scans
- **Output Format**: PDF, JSON, CSV, HTML

### Network Settings
- **Interface**: Auto-detected (eth0 for WSL)
- **Capture Duration**: Configurable (default: 120s)
- **TLS Decryption**: Optional SSLKEYLOGFILE support

## 🛠️ Development

### Project Structure
```
synergy-cyberix/
├── src/
│   ├── components/       # React UI components
│   ├── scanners/         # Security scanner modules
│   ├── main/             # Electron main process
│   ├── utils/            # Helper utilities
│   └── maldef/           # Malware/Defacement modules
├── public/               # Static assets
├── dist/                 # Build output
└── package.json          # Dependencies
```

### Development Commands
```bash
# Run in development mode
npm run electron:dev

# Build for production
npm run build

# Run malware scanner
npm run maldef:run

# Lint code
npm run lint
```

## 📚 Documentation

- [Kali Tools Integration](KALI_TOOLS_INTEGRATION_SUMMARY.md)
- [WSL Root Access Guide](WSL_ROOT_ACCESS_GUIDE.md)
- [Phishing Detection](PHISHING_DETECTION_IMPLEMENTATION.md)
- [SQL Injection Scanner](SQL_INJECTION_SCANNER_DOCUMENTATION.md)
- [XSS Scanner](XSS_SCANNER_DOCUMENTATION.md)
- [Tool Checker](TOOL_CHECKER_IMPLEMENTATION.md)

## ⚠️ Important Notes

### Security
- **Authorized Use Only**: Only scan systems you own or have explicit permission to test
- **Legal Compliance**: Ensure compliance with local laws and regulations
- **Ethical Hacking**: Use responsibly and ethically

### WSL Requirements
- WSL 2 is required for proper network interface access
- Kali Linux must be installed and configured
- Root access is required for most security tools

### Performance
- Comprehensive scans may take 10-30 minutes depending on target
- Network traffic capture requires sufficient disk space
- Large scans may use significant system resources

## 🐛 Troubleshooting

### Common Issues

**WSL Not Detected**
- Ensure WSL 2 is installed: `wsl --status`
- Verify Kali Linux is installed: `wsl -l -v`

**Tools Not Found**
- Run tool installation from Settings
- Verify WSL can access Kali repositories
- Check internet connection for tool downloads

**Network Capture Returns 0 Packets**
- Verify network interface exists: `ip link show`
- Check tshark permissions: `sudo setcap cap_net_raw,cap_net_admin+eip /usr/bin/dumpcap`
- Ensure traffic is going through WSL interface

**Permission Errors**
- Ensure WSL root password is correctly stored
- Try re-entering credentials in Settings
- Verify WSL user has sudo privileges

## 🤝 Contributing

Contributions are welcome! Please ensure:
- Code follows project style guidelines
- Tests pass (when available)
- Documentation is updated
- Security best practices are followed

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Kali Linux** - Penetration testing tools and framework
- **WSL** - Windows Subsystem for Linux
- **Electron** - Desktop application framework
- **React** - UI library
- All the open-source security tools integrated

## 📞 Support

For issues, questions, or contributions:
- Check existing documentation
- Review troubleshooting section
- Open an issue on the repository

---

**Synergy Cyberix** - Professional Security Testing Made Simple

*Built with ❤️ for security professionals and ethical hackers*
