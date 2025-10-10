const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Server-level Security Scanning Module
 * Performs non-destructive security assessments of web servers
 */

// DNS Resolution
async function performDNSResolution(hostname, outputDir) {
    const dnsFile = path.join(outputDir, 'dns.txt');
    const dnsJsonFile = path.join(outputDir, 'dns.json');
    
    try {
        // Use dig command for DNS resolution
        const digProcess = spawn('dig', ['+short', hostname]);
        let dnsOutput = '';
        
        digProcess.stdout.on('data', (data) => {
            dnsOutput += data.toString();
        });
        
        await new Promise((resolve, reject) => {
            digProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`DNS resolution failed with code ${code}`));
            });
        });
        
        // Parse DNS results
        const ips = dnsOutput.trim().split('\n').filter(ip => ip && !ip.startsWith(';'));
        const dnsData = {
            hostname,
            ips,
            timestamp: new Date().toISOString(),
            type: 'A'
        };
        
        // Save raw output
        await fs.writeFile(dnsFile, dnsOutput);
        
        // Save structured data
        await fs.writeFile(dnsJsonFile, JSON.stringify(dnsData, null, 2));
        
        return dnsData;
    } catch (error) {
        console.error('DNS resolution error:', error);
        throw new Error(`DNS resolution failed: ${error.message}`);
    }
}

// Nmap Port Discovery
async function performNmapScan(hostname, outputDir) {
    const nmapFile = path.join(outputDir, 'nmap_ports.txt');
    const nmapXmlFile = path.join(outputDir, 'nmap_service.xml');
    
    try {
        // Basic port scan
        const nmapProcess = spawn('nmap', [
            '-sS',           // SYN scan
            '-sV',           // Version detection
            '-O',            // OS detection
            '--script', 'safe', // Safe scripts only
            '-oN', nmapFile, // Normal output
            '-oX', nmapXmlFile, // XML output
            hostname
        ]);
        
        let nmapOutput = '';
        
        nmapProcess.stdout.on('data', (data) => {
            nmapOutput += data.toString();
        });
        
        await new Promise((resolve, reject) => {
            nmapProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Nmap scan failed with code ${code}`));
            });
        });
        
        // Parse nmap results
        const ports = parseNmapOutput(nmapOutput);
        
        return {
            ports,
            output: nmapOutput,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Nmap scan error:', error);
        throw new Error(`Nmap scan failed: ${error.message}`);
    }
}

// SSL/TLS Check
async function performSSLCheck(hostname, outputDir) {
    const sslFile = path.join(outputDir, 'ssl.txt');
    
    try {
        // Use openssl for SSL/TLS analysis
        const sslProcess = spawn('openssl', [
            's_client',
            '-connect', `${hostname}:443`,
            '-servername', hostname
        ]);
        
        let sslOutput = '';
        
        sslProcess.stdout.on('data', (data) => {
            sslOutput += data.toString();
        });
        
        // Send quit command after connection
        setTimeout(() => {
            sslProcess.stdin.write('Q\n');
        }, 5000);
        
        await new Promise((resolve, reject) => {
            sslProcess.on('close', (code) => {
                resolve(); // SSL check might not return 0, that's okay
            });
        });
        
        await fs.writeFile(sslFile, sslOutput);
        
        return {
            output: sslOutput,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('SSL check error:', error);
        throw new Error(`SSL check failed: ${error.message}`);
    }
}

// Web Server Scan (Nikto)
async function performNiktoScan(hostname, outputDir) {
    const niktoFile = path.join(outputDir, 'nikto.txt');
    
    try {
        const niktoProcess = spawn('nikto', [
            '-h', hostname,
            '-Format', 'txt',
            '-output', niktoFile
        ]);
        
        await new Promise((resolve, reject) => {
            niktoProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Nikto scan failed with code ${code}`));
            });
        });
        
        const niktoOutput = await fs.readFile(niktoFile, 'utf8');
        
        return {
            output: niktoOutput,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Nikto scan error:', error);
        throw new Error(`Nikto scan failed: ${error.message}`);
    }
}

// Directory Enumeration (Gobuster)
async function performDirectoryEnumeration(hostname, outputDir) {
    const gobusterFile = path.join(outputDir, 'gobuster.txt');
    
    try {
        const gobusterProcess = spawn('gobuster', [
            'dir',
            '-u', `https://${hostname}`,
            '-w', '/usr/share/wordlists/dirb/common.txt',
            '-o', gobusterFile,
            '-t', '10' // 10 threads
        ]);
        
        await new Promise((resolve, reject) => {
            gobusterProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Gobuster scan failed with code ${code}`));
            });
        });
        
        const gobusterOutput = await fs.readFile(gobusterFile, 'utf8');
        
        return {
            output: gobusterOutput,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Gobuster scan error:', error);
        throw new Error(`Gobuster scan failed: ${error.message}`);
    }
}

// SQL Injection Check (SQLMap)
async function performSQLInjectionCheck(hostname, outputDir) {
    const sqlmapDir = path.join(outputDir, 'sqlmap');
    await fs.mkdir(sqlmapDir, { recursive: true });
    
    try {
        const sqlmapProcess = spawn('sqlmap', [
            '-u', `https://${hostname}`,
            '--batch',
            '--level', '1',
            '--risk', '1',
            '--output-dir', sqlmapDir
        ]);
        
        await new Promise((resolve, reject) => {
            sqlmapProcess.on('close', (code) => {
                resolve(); // SQLMap might not return 0, that's okay
            });
        });
        
        return {
            outputDir: sqlmapDir,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('SQLMap scan error:', error);
        throw new Error(`SQLMap scan failed: ${error.message}`);
    }
}

// Parse Nmap Output
function parseNmapOutput(output) {
    const ports = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
        if (line.includes('/tcp') && line.includes('open')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                const portInfo = parts[0].split('/');
                ports.push({
                    port: parseInt(portInfo[0]),
                    protocol: portInfo[1],
                    state: parts[1],
                    service: parts[2] || 'unknown',
                    version: parts.slice(3).join(' ') || ''
                });
            }
        }
    }
    
    return ports;
}

// Generate Summary JSON
async function generateSummaryJSON(results, outputDir) {
    const summary = {
        metadata: {
            target: results.target,
            hostname: results.hostname,
            scanDate: new Date().toISOString(),
            scanType: 'Server-level Security Scan'
        },
        dns: results.dns,
        ports: results.nmap?.ports || [],
        vulnerabilities: results.nikto?.vulnerabilities || [],
        web_dirs: results.gobuster?.directories || [],
        ssl: results.ssl,
        sqlmap: results.sqlmap
    };
    
    const summaryFile = path.join(outputDir, 'summary.json');
    await fs.writeFile(summaryFile, JSON.stringify(summary, null, 2));
    
    return summary;
}

// Generate HTML Report
async function generateHTMLReport(summary, outputDir) {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Server Security Scan Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .high { color: red; font-weight: bold; }
        .medium { color: orange; font-weight: bold; }
        .low { color: green; font-weight: bold; }
        .vulnerability { background: #fff3cd; padding: 10px; margin: 5px 0; border-left: 4px solid #ffc107; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Server Security Scan Report</h1>
        <p><strong>Target:</strong> ${summary.metadata.target}</p>
        <p><strong>Hostname:</strong> ${summary.metadata.hostname}</p>
        <p><strong>Scan Date:</strong> ${new Date(summary.metadata.scanDate).toLocaleString()}</p>
    </div>
    
    <div class="section">
        <h2>DNS Resolution</h2>
        <p><strong>Resolved IPs:</strong> ${summary.dns?.ips?.join(', ') || 'N/A'}</p>
    </div>
    
    <div class="section">
        <h2>Open Ports</h2>
        <table>
            <tr><th>Port</th><th>Protocol</th><th>State</th><th>Service</th><th>Version</th></tr>
            ${summary.ports.map(port => `
                <tr>
                    <td>${port.port}</td>
                    <td>${port.protocol}</td>
                    <td>${port.state}</td>
                    <td>${port.service}</td>
                    <td>${port.version}</td>
                </tr>
            `).join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>Vulnerabilities</h2>
        ${summary.vulnerabilities.length > 0 ? 
            summary.vulnerabilities.map(vuln => `
                <div class="vulnerability">
                    <strong>${vuln.type || 'Unknown'}</strong><br>
                    <em>Severity: ${vuln.severity || 'Unknown'}</em><br>
                    ${vuln.description || vuln.details || 'No description available'}
                </div>
            `).join('') :
            '<p>No vulnerabilities detected.</p>'
        }
    </div>
    
    <div class="section">
        <h2>Web Directories</h2>
        <table>
            <tr><th>Path</th><th>Status</th><th>Size</th></tr>
            ${summary.web_dirs.map(dir => `
                <tr>
                    <td>${dir.path}</td>
                    <td>${dir.status}</td>
                    <td>${dir.size || 'N/A'}</td>
                </tr>
            `).join('')}
        </table>
    </div>
</body>
</html>
    `;
    
    const htmlFile = path.join(outputDir, 'report.html');
    await fs.writeFile(htmlFile, htmlContent);
    return htmlFile;
}

// Generate Excel Report
async function generateExcelReport(summary, outputDir) {
    // This is a simplified Excel generation
    // In a real implementation, you'd use a library like xlsx
    const csvContent = `Target,Hostname,Scan Date,Ports Found,Vulnerabilities,Directories
${summary.metadata.target},${summary.metadata.hostname},${new Date(summary.metadata.scanDate).toLocaleString()},${summary.ports.length},${summary.vulnerabilities.length},${summary.web_dirs.length}`;
    
    const csvFile = path.join(outputDir, 'report.csv');
    await fs.writeFile(csvFile, csvContent);
    return csvFile;
}

// Main Server Scan Function
async function runServerScan(target, options = {}) {
    const {
        outputDir,
        onProgress,
        abortSignal
    } = options;
    
    const results = {
        target,
        hostname: new URL(target.startsWith('http') ? target : `https://${target}`).hostname,
        timestamp: new Date().toISOString()
    };
    
    try {
        // Step 1: DNS Resolution
        if (onProgress) {
            onProgress({ stage: 'dns', message: 'Starting DNS resolution...', status: 'running' });
        }
        results.dns = await performDNSResolution(results.hostname, outputDir);
        
        // Step 2: Nmap Scan
        if (onProgress) {
            onProgress({ stage: 'nmap', message: 'Starting port discovery...', status: 'running' });
        }
        results.nmap = await performNmapScan(results.hostname, outputDir);
        
        // Step 3: SSL/TLS Check
        if (onProgress) {
            onProgress({ stage: 'ssl', message: 'Checking SSL/TLS configuration...', status: 'running' });
        }
        results.ssl = await performSSLCheck(results.hostname, outputDir);
        
        // Step 4: Web Server Scan
        if (onProgress) {
            onProgress({ stage: 'nikto', message: 'Scanning web server...', status: 'running' });
        }
        results.nikto = await performNiktoScan(results.hostname, outputDir);
        
        // Step 5: Directory Enumeration
        if (onProgress) {
            onProgress({ stage: 'gobuster', message: 'Enumerating directories...', status: 'running' });
        }
        results.gobuster = await performDirectoryEnumeration(results.hostname, outputDir);
        
        // Step 6: SQL Injection Check
        if (onProgress) {
            onProgress({ stage: 'sqlmap', message: 'Checking for SQL injection...', status: 'running' });
        }
        results.sqlmap = await performSQLInjectionCheck(results.hostname, outputDir);
        
        // Step 7: Generate Summary
        if (onProgress) {
            onProgress({ stage: 'summary', message: 'Generating summary...', status: 'running' });
        }
        const summary = await generateSummaryJSON(results, outputDir);
        
        // Step 8: Generate Reports
        if (onProgress) {
            onProgress({ stage: 'reports', message: 'Generating reports...', status: 'running' });
        }
        const htmlReport = await generateHTMLReport(summary, outputDir);
        const excelReport = await generateExcelReport(summary, outputDir);
        
        if (onProgress) {
            onProgress({ 
                stage: 'completed', 
                message: 'Server scan completed successfully', 
                status: 'completed' 
            });
        }
        
        return {
            ...results,
            summary,
            reports: {
                html: htmlReport,
                excel: excelReport
            }
        };
        
    } catch (error) {
        if (onProgress) {
            onProgress({ stage: 'error', message: `Scan failed: ${error.message}`, status: 'error' });
        }
        throw error;
    }
}

module.exports = {
    runServerScan,
    performDNSResolution,
    performNmapScan,
    performSSLCheck,
    performNiktoScan,
    performDirectoryEnumeration,
    performSQLInjectionCheck,
    generateSummaryJSON,
    generateHTMLReport,
    generateExcelReport
};
