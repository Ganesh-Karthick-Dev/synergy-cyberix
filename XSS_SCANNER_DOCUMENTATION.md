# XSS Scanner Documentation

## Overview

The XSS Scanner is a comprehensive security testing tool that uses dalfox to detect Cross-Site Scripting (XSS) vulnerabilities in web applications. It implements the specific command format requested and provides dynamic JSON parsing of dalfox output.

## Features

### 1. Specific dalfox Command Format
The scanner uses the exact command format specified:
```bash
dalfox url "https://webnox.in" --fast-scan --skip-headless --timeout 5 --worker 50 --format json
```

### 2. Dynamic JSON Parser
The scanner dynamically parses dalfox output and generates structured JSON reports based on the actual scan results, including:

- **Vulnerability Detection**: Identifies if XSS vulnerabilities are found
- **Parameter Analysis**: Tracks which parameters were tested and their status
- **Reflected Parameters**: Detects parameters that are reflected in responses
- **Payload Information**: Extracts XSS payloads and evidence
- **Scan Statistics**: Records scan configuration and performance metrics
- **Content Type Analysis**: Identifies response content types

### 3. Comprehensive Report Generation
The scanner generates detailed reports with:

- **Risk Assessment**: Critical, High, Medium, or Low based on findings
- **Summary**: Dynamic summary based on scan results
- **Recommendations**: Context-aware recommendations based on findings
- **Raw Output**: Complete dalfox output for detailed analysis

## Usage

### Basic Usage
```javascript
const XSSScanner = require('./src/scanners/xss-scanner');

const scanner = new XSSScanner('https://example.com', './temp-scans');

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
The XSS scanner is integrated into the main security scanner system:

1. **Kali Security Scanner**: Uses the new XSS scanner as the first test
2. **Additional Security Scanner**: Includes XSS scanning in additional scans
3. **UI Components**: Displays results in detailed report dialogs

## Output Format

### JSON Report Structure
```json
{
  "scan_name": "Cross-Site Scripting (XSS) Testing",
  "target_url": "https://webnox.in",
  "scan_duration": "2m 2s",
  "parameters_tested": 20,
  "total_testing_points_found": 503,
  "vulnerabilities_found": 0,
  "vulnerability_details": [],
  "summary": "No XSS vulnerabilities detected during fast scan of the target.",
  "recommendations": [],
  "scan_details": {
    "method": "GET",
    "performance": "50 worker / 1 cpu",
    "mining": true,
    "timeout": 5,
    "follow_redirect": false,
    "fast_scan": true,
    "skip_headless": true
  },
  "reflected_parameters": ["item", "_wpcf7_posted_data_hash", "your-email", "text-378", "csrf_token"],
  "content_type": "text/html; charset=UTF-8",
  "scan_metadata": {
    "started_at": "2025-10-28 06:09:53",
    "finished_at": "2025-10-28 06:11:55",
    "duration_seconds": 122
  }
}
```

### Vulnerability Details (when found)
```json
{
  "type": "V",
  "inject_type": "inHTML-none(1)-URL",
  "poc_type": "plain",
  "method": "GET",
  "data": "http://example.com/test?param=<script>alert(1)</script>",
  "param": "param",
  "payload": "<script>alert(1)</script>",
  "evidence": "part of response containing <script>alert(1)</script>",
  "cwe": "CWE-79",
  "severity": "High",
  "message_id": 123,
  "message_str": "XSS vulnerability detected via reflected parameter",
  "raw_request": "...",
  "raw_response": "..."
}
```

## UI Integration

### Detailed Report Dialog
The scanner results are displayed in a comprehensive UI that includes:

1. **XSS Summary**: Color-coded status (VULNERABLE/REFLECTED/SAFE)
2. **Scan Statistics**: Parameters tested, testing points, vulnerabilities, reflected parameters
3. **Vulnerabilities Detected**: Detailed breakdown of each XSS vulnerability found
4. **Reflected Parameters**: List of parameters that are reflected in responses
5. **Content Type**: Response content type information
6. **Raw Output**: Complete dalfox output for technical analysis

### Color Coding
- **Red**: Vulnerable to XSS attacks
- **Orange**: Parameters are reflected (potential risk)
- **Green**: Safe (no vulnerabilities found)
- **Blue**: Information/neutral status

## Error Handling

The scanner handles various error scenarios:

1. **Network Errors**: Connection timeouts and network issues
2. **Tool Errors**: dalfox execution failures
3. **Parse Errors**: Issues parsing dalfox output
4. **Timeout Errors**: Scan timeouts and performance issues

## Recommendations

The scanner provides context-aware recommendations based on scan results:

### For Vulnerable Applications
- Immediately patch all XSS vulnerabilities found
- Sanitize user inputs to escape HTML special characters
- Implement Content Security Policy (CSP) headers
- Use HTTP-only cookies to protect session data
- Validate and encode all data dynamically on server side

### For Applications with Reflected Parameters
- Monitor reflected parameters for potential XSS vulnerabilities
- Implement input validation for all reflected parameters
- Consider implementing Content Security Policy (CSP) as a defense-in-depth measure

### For Safe Applications
- Continue regular XSS testing to maintain security posture
- Implement Content Security Policy (CSP) headers as a preventive measure
- Ensure all user inputs are properly validated and sanitized

## Technical Details

### Command Parameters
- `--fast-scan`: Enable fast scan mode for quicker testing
- `--skip-headless`: Skip headless browser testing
- `--timeout 5`: Set 5-second timeout per request
- `--worker 50`: Use 50 concurrent workers
- `--format json`: Output results in JSON format

### WSL Integration
The scanner uses WSL (Windows Subsystem for Linux) to execute dalfox commands:
```bash
wsl bash -c 'dalfox url "https://example.com" --fast-scan --skip-headless --timeout 5 --worker 50 --format json'
```

## Security Considerations

1. **Authorized Testing Only**: Only use on applications you own or have explicit permission to test
2. **Legal Compliance**: Ensure compliance with local laws and regulations
3. **Rate Limiting**: The scanner includes timeouts to prevent overwhelming target servers
4. **Ethical Use**: Use responsibly and report vulnerabilities through proper channels

## Troubleshooting

### Common Issues

1. **WSL Not Available**: Ensure WSL is installed and configured
2. **dalfox Not Found**: Install dalfox in the WSL environment
3. **Permission Denied**: Ensure proper permissions for file operations
4. **Network Timeouts**: Check network connectivity and target availability

### Debug Mode
Enable debug logging by setting the progress callback to see detailed execution information.

## Future Enhancements

1. **Additional Techniques**: Support for more XSS testing techniques
2. **Custom Payloads**: Support for custom XSS payloads
3. **Batch Testing**: Support for testing multiple URLs
4. **Report Export**: Export results to various formats (PDF, CSV, etc.)
5. **Integration**: Better integration with other security tools

## Example Output

Based on the provided example, the scanner will generate JSON like:
```json
{
  "scan_name": "Cross-Site Scripting (XSS) Testing",
  "target_url": "https://webnox.in",
  "scan_duration": "2m2.025543585s",
  "parameters_tested": 20,
  "total_testing_points_found": 503,
  "vulnerabilities_found": 0,
  "vulnerability_details": [],
  "summary": "XSS scan completed successfully. No XSS vulnerabilities detected during fast scan of the target.",
  "recommendations": [
    "Continue regular XSS testing to maintain security posture",
    "Implement Content Security Policy (CSP) headers as a preventive measure",
    "Ensure all user inputs are properly validated and sanitized"
  ],
  "reflected_parameters": ["item", "_wpcf7_posted_data_hash", "your-email", "text-378", "csrf_token"],
  "content_type": "text/html; charset=UTF-8"
}
```

The implementation is now ready for use and will dynamically parse any dalfox output to generate appropriate JSON reports and display them in the detailed report dialog. The scanner handles all the scenarios mentioned, including reflected parameters, vulnerability detection, and various dalfox output formats.
