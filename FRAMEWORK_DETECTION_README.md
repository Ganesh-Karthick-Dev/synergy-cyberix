# Advanced Framework Detection System

## Overview

The Cyberix application now includes a comprehensive framework detection system that can accurately identify web frameworks, CMS platforms, hosting providers, and technology stacks using multiple detection methods.

## Features

### 🔍 Multi-Method Detection
- **HTTP Headers Analysis**: Detects framework-specific headers
- **HTML Content Analysis**: Analyzes page source for framework signatures
- **URL Pattern Recognition**: Identifies frameworks from URL structures
- **DNS Record Analysis**: Detects hosting providers from domain patterns
- **SSL Certificate Analysis**: Extracts hosting and security information
- **Response Timing Analysis**: Identifies performance characteristics
- **Error Page Analysis**: Detects custom error pages
- **API Endpoint Discovery**: Finds framework-specific APIs
- **Robots.txt Analysis**: Extracts framework information from robots.txt
- **Sitemap Analysis**: Identifies content management patterns

### 🛠️ Supported Frameworks

#### Frontend Frameworks
- **React** - React.js applications
- **Vue.js** - Vue.js applications
- **Angular** - Angular applications
- **Next.js** - Next.js applications
- **Nuxt.js** - Nuxt.js applications
- **Flutter** - Flutter web applications

#### CMS Platforms
- **WordPress** - WordPress sites
- **Shopify** - Shopify stores
- **Drupal** - Drupal sites
- **Joomla** - Joomla sites

#### Backend Frameworks
- **Laravel** - Laravel applications
- **Django** - Django applications
- **Express.js** - Express.js applications
- **Flask** - Flask applications
- **Ruby on Rails** - Rails applications

#### Hosting Providers
- **Netlify** - Netlify hosting
- **Vercel** - Vercel hosting
- **Firebase** - Firebase hosting
- **Heroku** - Heroku hosting
- **AWS** - Amazon Web Services
- **Cloudflare** - Cloudflare hosting
- **GitHub Pages** - GitHub Pages
- **Shopify** - Shopify hosting

### 🔧 WSL Integration (Advanced)

When WSL with Kali Linux is available, the system can use professional security tools:

#### Available Tools
- **WhatWeb** - Comprehensive web technology detection
- **Nmap** - Network service and port detection
- **Nuclei** - Vulnerability scanning
- **Subfinder** - Subdomain enumeration
- **HTTPx** - HTTP probing and analysis

#### WSL Setup Instructions

1. **Install WSL**:
   ```bash
   wsl --install
   ```

2. **Install Kali Linux**:
   ```bash
   wsl --install kali-linux
   ```

3. **Update Kali Linux**:
   ```bash
   wsl -d kali-linux
   sudo apt update && sudo apt upgrade -y
   ```

4. **Install Security Tools**:
   ```bash
   sudo apt install whatweb nmap nikto dirb gobuster nuclei subfinder httpx -y
   ```

## Usage

### Basic Framework Detection

```javascript
import FrameworkDetector from './src/scanners/framework-detection.js';

const detector = new FrameworkDetector();
const result = await detector.detectFramework('https://example.com');

console.log('Framework:', result.framework);
console.log('CMS:', result.cms);
console.log('Hosting:', result.hosting);
console.log('Confidence:', result.confidence);
console.log('Technologies:', result.technologies);
```

### WSL-Based Detection

```javascript
import WSLFrameworkDetector from './src/scanners/wsl-integration.js';

const wslDetector = new WSLFrameworkDetector();

// Check WSL availability
const wslAvailable = await wslDetector.checkWSLAvailability();
const kaliAvailable = await wslDetector.checkKaliAvailability();

if (wslAvailable && kaliAvailable) {
    const result = await wslDetector.comprehensiveDetection('https://example.com');
    console.log('WSL Detection Results:', result);
}
```

## Detection Confidence Levels

- **High (80-100%)**: Multiple detection methods confirm the framework
- **Medium (60-79%)**: Some detection methods confirm the framework
- **Low (0-59%)**: Limited or conflicting detection results

## Framework Signatures

The system uses comprehensive signature databases for each framework:

### React Detection
- HTML: `react`, `react-dom`, `__react`, `reactjs`
- Headers: `x-react-version`, `x-react-app`
- JS Files: `react.js`, `react-dom.js`
- Patterns: `/react.*\.js/gi`, `/__react.*\.js/gi`

### WordPress Detection
- HTML: `wp-content`, `wp-includes`, `wordpress`, `wp-json`
- Headers: `x-powered-by`, `x-wp-version`
- JS Files: `wp-embed.min.js`, `wp-emoji-release.min.js`
- URLs: `/wp-admin/`, `/wp-content/`, `/wp-json/`

### Shopify Detection
- HTML: `shopify`, `cdn.shopify.com`, `shopify-section`
- Headers: `x-shopify-stage`, `x-shopify-shop-id`
- JS Files: `shopify.js`, `shopify-analytics.js`
- URLs: `/admin/`, `/account/`, `/cart/`, `/products/`

## Testing

### Test Page
Open `test-framework-detection.html` in your browser to test the framework detection system with real websites.

### Test URLs
- React: https://reactjs.org
- Vue.js: https://vuejs.org
- WordPress: https://wordpress.org
- Shopify: https://shopify.com
- Next.js: https://nextjs.org

### WSL Testing
The test page includes WSL integration testing to verify:
- WSL availability
- Kali Linux installation
- Security tool availability

## Integration with Dashboard

The framework detection is integrated into the Site Health Check component:

1. **Automatic Detection**: Runs during site health checks
2. **WSL Option**: Toggle for advanced WSL-based detection
3. **Confidence Display**: Shows detection confidence levels
4. **Detailed Results**: Displays comprehensive framework information

## Error Handling

The system includes robust error handling:

- **CORS Issues**: Falls back to URL-based detection
- **Network Errors**: Provides graceful degradation
- **WSL Unavailable**: Uses browser-based detection
- **Tool Failures**: Continues with available methods

## Performance

- **Browser Detection**: ~2-5 seconds per site
- **WSL Detection**: ~30-120 seconds per site (depending on tools used)
- **Caching**: Results can be cached for repeated requests

## Security Considerations

- **No Data Storage**: Detection results are not stored
- **Read-Only**: Only performs passive reconnaissance
- **Rate Limiting**: Respects target site rate limits
- **User Consent**: Advanced scanning requires explicit consent

## Troubleshooting

### WSL Issues
1. Ensure WSL is properly installed and running
2. Verify Kali Linux is installed in WSL
3. Check that security tools are installed
4. Ensure WSL has internet connectivity

### Detection Issues
1. Check browser console for errors
2. Verify target site is accessible
3. Try different detection methods
4. Check for CORS restrictions

### Performance Issues
1. Use browser-based detection for faster results
2. Limit concurrent detections
3. Check network connectivity
4. Verify target site response times

## Future Enhancements

- **Machine Learning**: AI-based framework detection
- **More Tools**: Additional WSL security tools
- **Caching**: Result caching for performance
- **API Integration**: External framework databases
- **Real-time Updates**: Live framework monitoring

## Contributing

To add support for new frameworks:

1. Add framework signatures to `frameworkSignatures` object
2. Include HTML patterns, headers, JS files, and URL patterns
3. Test with real websites using the framework
4. Update documentation

## License

This framework detection system is part of the Cyberix application and follows the same licensing terms.
