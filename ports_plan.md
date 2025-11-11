# Port Scanning & Service Enumeration Module Plan

## Overview
This document outlines the design for an advanced Port Scanning & Service Enumeration module that improves upon the existing basic implementation. The module implements a two-step scanning workflow with comprehensive service enumeration and vulnerability assessment capabilities.

## Two-Step Scanning Workflow

### Step 1: Fast Port Discovery with Masscan
**Purpose**: Rapidly identify all open ports across the full port range (1-65535)

**Command**:
```bash
# WSL Command for masscan port discovery
wsl masscan -p1-65535 --rate=1000 --open-only -oG /tmp/masscan_ports.lst <target_ip>
```

**Output Format**: Grepable format for easy parsing
**Expected Output**:
```
Host: 192.168.1.100 () Ports: 22/open/tcp//ssh///, 80/open/tcp//http///, 443/open/tcp//https///
```

**Parsing Rules**:
- Extract IP address from `Host:` field
- Parse port list from `Ports:` field
- Extract port number, state, protocol, and service name
- Store timestamp for each discovery

### Step 2: Detailed Service Enumeration with Nmap
**Purpose**: Perform comprehensive service detection, version identification, and vulnerability scanning on discovered ports

**Command**:
```bash
# WSL Command for detailed nmap scan
wsl nmap -sS -sV -O --script=vuln,ssl-enum-ciphers,ssh-hostkey,smb-enum-shares -p <discovered_ports> -oX /tmp/nmap_ports.xml <target_ip>
```

**Output Format**: XML format for structured parsing
**Key Features**:
- SYN scan for stealth
- Service version detection
- OS detection
- Vulnerability scripts
- SSL/TLS enumeration
- SSH host key fingerprinting
- SMB share enumeration

## Advanced Probes & Tools

### 1. Banner Grabbing (netcat/nc)
**Command**:
```bash
# WSL Command for banner grabbing
wsl nc -nv -w3 <target_ip> <port> < /dev/null
```

**Output File**: `/tmp/port<port>_banner.txt`
**Purpose**: Extract service banners and version information

### 2. HTTP(S) Enumeration
**Commands**:
```bash
# HTTP enumeration with curl
wsl curl -I -s -k --connect-timeout 5 http://<target_ip>:<port>/

# Directory enumeration with gobuster
wsl gobuster dir -u http://<target_ip>:<port>/ -w /usr/share/wordlists/dirb/common.txt -t 20 -o /tmp/port<port>_dirs.txt

# Alternative with dirsearch
wsl python3 /opt/dirsearch/dirsearch.py -u http://<target_ip>:<port>/ -e php,html,js -o /tmp/port<port>_dirs.txt
```

### 3. TLS/SSL Check (testssl.sh)
**Command**:
```bash
# WSL Command for SSL/TLS analysis
wsl /opt/testssl.sh/testssl.sh --logfile /tmp/port<port>_ssl.log <target_ip>:<port>
```

**Output File**: `/tmp/port<port>_ssl.log`
**Checks**: Cipher suites, certificate validation, protocol versions, vulnerabilities

### 4. SSH Host Key Fingerprinting
**Command**:
```bash
# WSL Command for SSH key scanning
wsl ssh-keyscan -p <port> <target_ip> > /tmp/port<port>_ssh_keys.txt
```

**Output File**: `/tmp/port<port>_ssh_keys.txt`
**Purpose**: Identify SSH server fingerprint and key information

### 5. SMB Enumeration (enum4linux)
**Command**:
```bash
# WSL Command for SMB enumeration
wsl enum4linux -a <target_ip> > /tmp/port<port>_smb.txt 2>&1
```

**Output File**: `/tmp/port<port>_smb.txt`
**Purpose**: Enumerate SMB shares, users, and security policies

## Parsing & Data Extraction

### Masscan Output Parsing
```javascript
// Extract from masscan grepable output
const parseMasscanOutput = (output) => {
  const lines = output.split('\n');
  const results = [];
  
  lines.forEach(line => {
    if (line.startsWith('Host:')) {
      const hostMatch = line.match(/Host: (\S+)/);
      const portsMatch = line.match(/Ports: (.+)/);
      
      if (hostMatch && portsMatch) {
        const ip = hostMatch[1];
        const ports = portsMatch[1].split(',');
        
        ports.forEach(port => {
          const portMatch = port.match(/(\d+)\/(\w+)\/(\w+)\/(\w+)/);
          if (portMatch) {
            results.push({
              ip: ip,
              port: parseInt(portMatch[1]),
              protocol: portMatch[2],
              state: portMatch[3],
              service: portMatch[4],
              timestamp: new Date().toISOString()
            });
          }
        });
      }
    }
  });
  
  return results;
};
```

### Nmap XML Parsing
```javascript
// Extract from nmap XML output
const parseNmapXml = (xmlContent) => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
  const results = [];
  
  const ports = xmlDoc.querySelectorAll('port');
  ports.forEach(port => {
    const portId = port.getAttribute('portid');
    const protocol = port.getAttribute('protocol');
    const state = port.querySelector('state').getAttribute('state');
    const service = port.querySelector('service');
    
    const result = {
      port: parseInt(portId),
      protocol: protocol,
      state: state,
      service: service ? service.getAttribute('name') : 'unknown',
      version: service ? service.getAttribute('product') : null,
      product: service ? service.getAttribute('product') : null,
      scripts: []
    };
    
    // Parse script results
    const scripts = port.querySelectorAll('script');
    scripts.forEach(script => {
      result.scripts.push({
        id: script.getAttribute('id'),
        output: script.getAttribute('output')
      });
    });
    
    results.push(result);
  });
  
  return results;
};
```

### CVE Mapping (String-based)
```javascript
// Map service versions to potential CVEs (string matching only)
const mapServiceToCVEs = (service, version) => {
  const cveMap = {
    'apache': {
      '2.4.41': ['CVE-2021-44228', 'CVE-2021-45046'],
      '2.4.38': ['CVE-2019-0211', 'CVE-2019-0217']
    },
    'nginx': {
      '1.18.0': ['CVE-2021-23017'],
      '1.16.1': ['CVE-2019-20372']
    },
    'mysql': {
      '8.0.25': ['CVE-2021-3711'],
      '5.7.34': ['CVE-2021-3711']
    },
    'postgresql': {
      '13.3': ['CVE-2021-32027'],
      '12.7': ['CVE-2021-32027']
    },
    'redis': {
      '6.2.6': ['CVE-2021-32761'],
      '6.0.16': ['CVE-2021-32761']
    },
    'ssh': {
      'openssh_8.2p1': ['CVE-2020-15778'],
      'openssh_7.4p1': ['CVE-2018-15473']
    }
  };
  
  const serviceKey = service.toLowerCase();
  const versionKey = version ? version.toLowerCase() : 'default';
  
  if (cveMap[serviceKey] && cveMap[serviceKey][versionKey]) {
    return cveMap[serviceKey][versionKey];
  }
  
  return [];
};
```

## UI Table Specification

### Ports Page Table Columns
| Column | Description | Data Type | Example |
|--------|-------------|-----------|---------|
| Port | Port number | Integer | 443 |
| Protocol | Transport protocol | String | TCP |
| Service | Service name | String | https |
| Version | Service version | String | nginx/1.18.0 |
| Banner | Service banner | String | HTTP/1.1 400 Bad Request |
| Script Findings | Nmap script results | Array | ["ssl-heartbleed: Not vulnerable"] |
| CVE Links | Potential vulnerabilities | Array | ["CVE-2021-23017"] |
| Severity | Risk level | String | High |
| Confidence | Detection confidence | Integer | 95 |
| Evidence | File paths | Array | ["/tmp/port443_banner.txt"] |

### Example Table Row
```json
{
  "port": 443,
  "protocol": "tcp",
  "service": "https",
  "version": "nginx/1.18.0",
  "banner": "HTTP/1.1 400 Bad Request\r\nServer: nginx\r\n",
  "script_findings": [
    "ssl-heartbleed: Not vulnerable to Heartbleed",
    "ssl-enum-ciphers: Weak cipher suites detected"
  ],
  "cve_links": ["CVE-2021-23017"],
  "severity": "High",
  "confidence": 95,
  "evidence": [
    "/tmp/port443_banner.txt",
    "/tmp/port443_ssl.log",
    "/tmp/nmap_ports.xml"
  ]
}
```

### Sorting Configuration
- **Default**: By Severity (Critical → High → Medium → Low)
- **Secondary**: By Port number (ascending)
- **Tertiary**: By Confidence (descending)

### Filter Options
- **Port State**: Open / Filtered / Closed
- **Service Type**: HTTP / HTTPS / SSH / Database / Other
- **Severity**: Critical / High / Medium / Low
- **Confidence**: High (≥80%) / Medium (50-79%) / Low (<50%)

## Evidence Handling

### File Naming Conventions
```
/tmp/masscan_ports.lst          # Masscan port discovery results
/tmp/nmap_ports.xml             # Nmap detailed scan results
/tmp/port<port>_banner.txt      # Banner grab results per port
/tmp/port<port>_dirs.txt        # Directory enumeration results
/tmp/port<port>_ssl.log         # SSL/TLS analysis results
/tmp/port<port>_ssh_keys.txt    # SSH key fingerprint results
/tmp/port<port>_smb.txt         # SMB enumeration results
```

### Evidence File Structure
Each evidence file should include:
- Timestamp of creation
- Target IP and port
- Tool used and version
- Command executed
- Raw output
- Parsed results (where applicable)

### UI Evidence Integration
- Clickable file links in the Evidence column
- Preview modal for text-based evidence files
- Download functionality for all evidence files
- Export to PDF with evidence appendix

## Remediation Templates

### Unnecessary Open Ports
**Template**: Port Blocking
```bash
# UFW (Ubuntu/Debian)
sudo ufw deny <port>/tcp
sudo ufw deny <port>/udp

# iptables (Generic Linux)
sudo iptables -A INPUT -p tcp --dport <port> -j DROP
sudo iptables -A INPUT -p udp --dport <port> -j DROP

# Windows Firewall
netsh advfirewall firewall add rule name="Block Port <port>" dir=in action=block protocol=TCP localport=<port>
```

### Outdated Service Versions
**Template**: Package Updates
```bash
# Apache HTTP Server
sudo apt update && sudo apt upgrade apache2

# Nginx
sudo apt update && sudo apt upgrade nginx

# MySQL
sudo apt update && sudo apt upgrade mysql-server

# PostgreSQL
sudo apt update && sudo apt upgrade postgresql

# Redis
sudo apt update && sudo apt upgrade redis-server

# SSH (OpenSSH)
sudo apt update && sudo apt upgrade openssh-server
```

### SSL/TLS Issues
**Template**: SSL Configuration
```bash
# Disable weak protocols
sudo a2enmod ssl
sudo a2enmod headers

# Update SSL configuration
echo "SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1" >> /etc/apache2/sites-available/default-ssl.conf
echo "SSLCipherSuite ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384" >> /etc/apache2/sites-available/default-ssl.conf

# Restart service
sudo systemctl restart apache2
```

### Database Security
**Template**: Database Hardening
```bash
# MySQL Security
sudo mysql_secure_installation

# PostgreSQL Security
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'strong_password';"
sudo -u postgres psql -c "REVOKE ALL ON DATABASE postgres FROM PUBLIC;"

# Redis Security
echo "requirepass strong_password" >> /etc/redis/redis.conf
echo "bind 127.0.0.1" >> /etc/redis/redis.conf
sudo systemctl restart redis
```

## Action Commands

### Verify Service
**Command Template**:
```bash
# Re-scan specific port with detailed enumeration
wsl nmap -sV -sC -p <port> <target_ip>
```

### Grab Banner
**Command Template**:
```bash
# Copyable netcat command for banner grabbing
wsl nc -nv -w3 <target_ip> <port> < /dev/null
```

### Run TLS Check
**Command Template**:
```bash
# Copyable testssl.sh command
wsl /opt/testssl.sh/testssl.sh --logfile /tmp/port<port>_ssl.log <target_ip>:<port>
```

### Directory Enumeration
**Command Template**:
```bash
# Copyable gobuster command
wsl gobuster dir -u http://<target_ip>:<port>/ -w /usr/share/wordlists/dirb/common.txt -t 20
```

## Integration Points

### Electron Main Process
- IPC handlers for scan initiation
- WSL command execution
- File system operations
- Progress reporting

### React Frontend
- Port scanning component integration
- Real-time progress updates
- Results table rendering
- Evidence file management
- Export functionality

### Context Integration
- ScanningContext for state management
- ToastContext for notifications
- ThemeContext for UI consistency

## Security Considerations

### Command Sanitization
- Validate all user inputs
- Escape special characters in commands
- Use parameterized commands where possible

### File System Security
- Restrict evidence file permissions
- Validate file paths
- Implement file size limits

### Network Security
- Rate limiting for scans
- Timeout configurations
- User authorization checks

## Performance Optimizations

### Parallel Processing
- Run multiple port scans concurrently
- Batch evidence collection
- Asynchronous file operations

### Caching
- Cache scan results
- Store parsed data for quick access
- Implement result pagination

### Resource Management
- Monitor system resources
- Implement scan queuing
- Cleanup temporary files

