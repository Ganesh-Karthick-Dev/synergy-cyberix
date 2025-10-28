# SQL Injection Scanner Documentation

## Overview

The SQL Injection Scanner is a comprehensive security testing tool that uses sqlmap to detect SQL injection vulnerabilities in web applications. It implements the specific command format requested and provides dynamic JSON parsing of sqlmap output.

## Features

### 1. Specific sqlmap Command Format
The scanner uses the exact command format specified:
```bash
sqlmap -u "https://lifematchings.com/register" --data="id=1&submit=Submit" --batch --level=1 --risk=1 --timeout=3 --threads=10 --technique=B --smart --flush-session -o
```

### 2. Dynamic JSON Parser
The scanner dynamically parses sqlmap output and generates structured JSON reports based on the actual scan results, including:

- **Vulnerability Detection**: Identifies if SQL injection vulnerabilities are found
- **Parameter Analysis**: Tracks which parameters were tested and their status
- **HTTP Error Handling**: Detects and reports HTTP errors (403, 404, etc.)
- **Protection Detection**: Identifies WAF and other protection mechanisms
- **Database Information**: Extracts database type, version, and accessible databases
- **Test Details**: Records scan configuration (level, risk, technique, etc.)

### 3. Comprehensive Report Generation
The scanner generates detailed reports with:

- **Risk Assessment**: Critical, High, Medium, or Low based on findings
- **Summary**: Dynamic summary based on scan results
- **Recommendations**: Context-aware recommendations based on findings
- **Raw Output**: Complete sqlmap output for detailed analysis

## Usage

### Basic Usage
```javascript
const SQLInjectionScanner = require('./src/scanners/sql-injection-scanner');

const scanner = new SQLInjectionScanner('https://example.com/register', './temp-scans');

// Set up progress callback
scanner.setProgressCallback((progress) => {
  console.log(`[PROGRESS] ${progress.message}`);
});

// Set up completion callback
scanner.setCompleteCallback((results) => {
  console.log('Scan completed:', results);
});

// Run the scan
const result = await scanner.runScan();
```

### Integration with Security Scanner
The SQL injection scanner is integrated into the main security scanner system:

1. **Kali Security Scanner**: Uses the new SQL injection scanner for comprehensive testing
2. **Additional Security Scanner**: Includes SQL injection scanning in additional scans
3. **UI Components**: Displays results in detailed report dialogs

## Output Format

### JSON Report Structure
```json
{
  "scan_name": "SQL Injection Quick POST Parameter Check",
  "target_url": "https://example.com/register",
  "parameters_tested": ["id", "submit"],
  "vulnerability_found": false,
  "http_errors": [
    {
      "code": 403,
      "description": "Forbidden",
      "count": 9
    }
  ],
  "recommendations": [
    "Try increasing --level and --risk parameters for more thorough testing",
    "Use --tamper scripts like space2comment to bypass WAF",
    "Use --random-agent to avoid detection",
    "Update sqlmap to latest version"
  ],
  "summary": "No injectable parameters found. The scan was blocked by HTTP 403 errors indicating the server is likely protected by WAF or similar mechanisms.",
  "test_details": {
    "level": 1,
    "risk": 1,
    "technique": "B",
    "timeout": 3,
    "threads": 10
  },
  "protection_detected": true,
  "waf_detected": true,
  "dynamic_parameters": [],
  "non_dynamic_parameters": ["id", "submit"],
  "injection_points": [],
  "database_info": {
    "dbms": null,
    "version": null,
    "databases": [],
    "tables": [],
    "columns": []
  }
}
```

## UI Integration

### Detailed Report Dialog
The scanner results are displayed in a comprehensive UI that includes:

1. **SQL Injection Summary**: Color-coded status (VULNERABLE/PROTECTED/SAFE)
2. **Test Details**: Level, Risk, Technique, and Threads used
3. **Parameters Tested**: List of all parameters that were tested
4. **HTTP Errors**: Detailed breakdown of HTTP errors encountered
5. **Protection Detection**: WAF and protection mechanism alerts
6. **Database Information**: Database type, version, and accessible databases
7. **Raw Output**: Complete sqlmap output for technical analysis

### Color Coding
- **Red**: Vulnerable to SQL injection
- **Orange**: Protected by WAF/security mechanisms
- **Green**: Safe (no vulnerabilities found)
- **Blue**: Information/neutral status

## Error Handling

The scanner handles various error scenarios:

1. **Network Errors**: Connection timeouts and network issues
2. **HTTP Errors**: 403, 404, 500 errors from the target server
3. **Tool Errors**: sqlmap execution failures
4. **Parse Errors**: Issues parsing sqlmap output

## Recommendations

The scanner provides context-aware recommendations based on scan results:

### For Vulnerable Applications
- Immediately patch all vulnerable parameters
- Implement parameterized queries (prepared statements)
- Use input validation and sanitization
- Implement Web Application Firewall (WAF)

### For Protected Applications
- Use --tamper scripts to bypass WAF
- Use --random-agent to avoid detection
- Try increasing --level and --risk parameters
- Update sqlmap to latest version

### For Safe Applications
- Continue regular security testing
- Monitor for new vulnerabilities
- Keep security tools updated

## Technical Details

### Command Parameters
- `--batch`: Run in batch mode (no user interaction)
- `--level=1`: Test level 1 (basic tests)
- `--risk=1`: Risk level 1 (minimal risk)
- `--timeout=3`: 3-second timeout per request
- `--threads=10`: Use 10 concurrent threads
- `--technique=B`: Use only boolean-based blind SQL injection
- `--smart`: Smart mode for better detection
- `--flush-session`: Clear session files before starting
- `-o`: Output results

### WSL Integration
The scanner uses WSL (Windows Subsystem for Linux) to execute sqlmap commands:
```bash
wsl bash -c 'sqlmap -u "https://example.com" --data="id=1&submit=Submit" --batch --level=1 --risk=1 --timeout=3 --threads=10 --technique=B --smart --flush-session -o'
```

## Testing

To test the SQL injection scanner:

```bash
node test-sql-injection-scanner.js
```

This will run a test scan against a sample URL and display the results.

## Security Considerations

1. **Authorized Testing Only**: Only use on applications you own or have explicit permission to test
2. **Legal Compliance**: Ensure compliance with local laws and regulations
3. **Rate Limiting**: The scanner includes timeouts to prevent overwhelming target servers
4. **Ethical Use**: Use responsibly and report vulnerabilities through proper channels

## Troubleshooting

### Common Issues

1. **WSL Not Available**: Ensure WSL is installed and configured
2. **sqlmap Not Found**: Install sqlmap in the WSL environment
3. **Permission Denied**: Ensure proper permissions for file operations
4. **Network Timeouts**: Check network connectivity and target availability

### Debug Mode
Enable debug logging by setting the progress callback to see detailed execution information.

## Future Enhancements

1. **Additional Techniques**: Support for more sqlmap techniques
2. **Custom Payloads**: Support for custom SQL injection payloads
3. **Batch Testing**: Support for testing multiple URLs
4. **Report Export**: Export results to various formats (PDF, CSV, etc.)
5. **Integration**: Better integration with other security tools
