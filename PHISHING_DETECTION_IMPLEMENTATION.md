# Comprehensive Phishing Detection Implementation

## Overview

This implementation provides a comprehensive phishing scanning backend and CLI/GUI integration using dnstwist that covers all major phishing detection features.

## Features Implemented

### 1. **Fuzzing Algorithms**
- Uses all available dnstwist algorithms (addition, bitsquatting, homoglyphs, transposition, subdomain, dictionary, etc.)
- Configurable via `--fuzzers all` flag

### 2. **Live Domain and Registration**
- Scans and lists only domains actually registered/live
- Uses `--registered` flag to filter active domains

### 3. **Geolocation/WHOIS/Registration**
- Gets location and registration info for each suspicious domain
- Extracts country, city, ISP, registrar information
- Includes registration and expiry dates

### 4. **Visual/Screenshot Analysis**
- Captures screenshots of all candidate domains for visual comparison
- Uses perceptual hash (phash) for similarity comparison
- Displays screenshots in the UI with side-by-side comparison

### 5. **Content/Fuzzy Hash (ssdeep) Matching**
- Compares HTML content of suspicious domains with original domain
- Uses fuzzy hash (LSH) and ssdeep for similarity percentage
- Reports content similarity scores

### 6. **SSL Certificate Check**
- Reports SSL details and flags invalid/self-signed certificates
- Extracts certificate issuer, subject, expiry information
- Validates certificate chain

### 7. **Output Formats**
- Export results in CSV, JSON, PDF, and HTML formats
- CSV includes all evidence fields for automation
- Screenshots included in JSON as base64-encoded images

### 8. **Enhanced UI Features**
- Comprehensive domain variations table with:
  - Domain name
  - Fuzzer type
  - Attack category tags
  - Active status
  - Risk score (0-100)
  - Visual similarity percentage
  - Content similarity percentage
  - SSL certificate status
  - Geolocation information
  - DNS records (A/MX/NS)
- Screenshot gallery for visual comparison
- Enhanced findings with attack categories

## Files Created/Modified

### Backend Files

1. **`backend/dnstwist_wrapper.py`**
   - Comprehensive Python wrapper for dnstwist
   - Handles all dnstwist features and flags
   - Parses JSON output and extracts evidence
   - Processes screenshots and converts to base64
   - Calculates risk scores and threat levels
   - Determines attack categories
   - CLI support for manual testing

2. **`src/main/main.js`** (Updated)
   - Enhanced `phishing:runDnstwist` handler
   - Calls Python wrapper instead of direct dnstwist
   - Handles WSL path conversion
   - Fallback to basic dnstwist if wrapper fails
   - Progress updates for all stages

### Frontend Files

3. **`src/components/PhishingDetection.jsx`** (Updated)
   - Enhanced domain variations table with all new fields
   - Screenshot gallery display
   - CSV export with all evidence
   - Enhanced findings display
   - Attack category tags
   - SSL certificate status indicators
   - Geolocation display

## Usage

### CLI Usage (Manual Testing)

```bash
# Run comprehensive scan
python3 backend/dnstwist_wrapper.py example.com

# With specific options
python3 backend/dnstwist_wrapper.py \
  --fuzzers all \
  --registered \
  --geoip \
  --lsh \
  --phash \
  --screenshots \
  --ssdeep \
  --format json \
  example.com
```

### GUI Usage

1. Open the Phishing Detection component
2. Enter target domain/URL
3. Click "Start Phishing Analysis"
4. View comprehensive results including:
   - Screenshots gallery
   - Enhanced domain variations table
   - SSL certificate details
   - Geolocation information
   - Similarity scores
   - Attack categories
5. Export results:
   - CSV (with all evidence)
   - JSON (with screenshots)
   - PDF report
   - HTML report

## Output Structure

### JSON Output
```json
{
  "success": true,
  "target_url": "https://example.com",
  "target_domain": "example.com",
  "timestamp": "2024-01-01T00:00:00Z",
  "threat_score": 75,
  "findings": [...],
  "domain_variations": [
    {
      "domain": "examp1e.com",
      "fuzzer": "homoglyph",
      "attack_category": "typosquatting, visual_spoofing",
      "active": true,
      "risk_score": 85,
      "phash_similarity": 92,
      "lsh_similarity": 78,
      "ssl_info": {
        "valid": false,
        "self_signed": true,
        "issuer": "...",
        "subject": "...",
        "expiry": "..."
      },
      "geo_info": {
        "country": "US",
        "city": "New York",
        "isp": "...",
        "registrar": "..."
      },
      "dns_a": [...],
      "dns_mx": [...],
      "dns_ns": [...]
    }
  ],
  "statistics": {
    "total_variations": 50,
    "active_domains": 12,
    "suspicious_domains": 8,
    "ssl_issues": 5,
    "visual_matches": 3,
    "content_matches": 4
  },
  "screenshots": [
    {
      "domain": "examp1e.com",
      "filename": "examp1e.com.png",
      "base64": "...",
      "size": 12345
    }
  ],
  "recommendations": [...]
}
```

### CSV Output
- Includes all fields from domain variations
- Proper CSV escaping
- All evidence fields included
- Suitable for automation and analysis

## Attack Categories

The system automatically categorizes domains into:
- **typosquatting**: Domain name variations
- **visual_spoofing**: High visual similarity (>80%)
- **content_spoofing**: High content similarity (>70%)
- **social_engineering**: Dictionary/subdomain attacks

## Risk Scoring

Risk scores (0-100) are calculated based on:
- Domain activity (30 points)
- SSL certificate issues (25-40 points)
- Visual similarity (10-30 points)
- Content similarity (15-25 points)
- High-risk fuzzer types (10 points)

## Recommendations

The system provides actionable recommendations based on:
- Threat score level
- Number of suspicious domains
- SSL certificate issues
- Visual/content matches

## Dependencies

- dnstwist (installed via apt in WSL)
- Python 3 (for wrapper script)
- Required Python modules (if needed): Standard library only

## Notes

- Screenshots are stored temporarily and encoded as base64 in JSON output
- The Python wrapper handles cleanup of temporary directories
- Fallback to basic dnstwist if wrapper fails
- All features work through WSL on Windows










