#!/usr/bin/env python3
"""
Comprehensive dnstwist Wrapper for Advanced Phishing Detection
Supports all major dnstwist features:
- All fuzzing algorithms
- Live domain and registration scanning
- Geolocation/WHOIS information
- Visual/screenshot analysis
- Content/fuzzy hash matching
- SSL certificate validation
- Multiple output formats
"""

import json
import subprocess
import sys
import os
import tempfile
import shutil
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import re

class DnstwistWrapper:
    """Wrapper class for dnstwist with comprehensive phishing detection features"""
    
    def __init__(self):
        self.screenshots_dir = None
        self.temp_dirs = []
        
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Cleanup temporary directories"""
        self.cleanup()
        
    def cleanup(self):
        """Clean up temporary directories"""
        for temp_dir in self.temp_dirs:
            try:
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"Warning: Failed to clean up {temp_dir}: {e}", file=sys.stderr)
    
    def check_dnstwist_installed(self) -> bool:
        """Check if dnstwist is installed"""
        try:
            result = subprocess.run(
                ['dnstwist', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    def extract_domain_from_url(self, url: str) -> str:
        """Extract domain from URL"""
        # Remove protocol
        domain = url.replace('https://', '').replace('http://', '').replace('www.', '')
        # Remove path
        domain = domain.split('/')[0]
        # Remove port
        domain = domain.split(':')[0]
        return domain.strip()
    
    def run_dnstwist_scan(
        self,
        target_domain: str,
        fuzzers: str = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain',
        registered_only: bool = True,
        geoip: bool = True,
        lsh: bool = True,
        phash: bool = True,
        screenshots: bool = True,
        ssdeep: bool = True,
        format: str = 'json'
    ) -> Dict[str, Any]:
        """
        Run comprehensive dnstwist scan with all features
        
        Args:
            target_domain: Target domain to scan
            fuzzers: Fuzzing algorithms to use (comma-separated list, format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain)
            registered_only: Only scan registered/live domains
            geoip: Enable geolocation/WHOIS information
            lsh: Enable fuzzy hash matching (LSH)
            phash: Enable perceptual hash (screenshot similarity)
            screenshots: Capture screenshots of domains
            ssdeep: Enable ssdeep content matching (uses --lsh ssdeep)
            format: Output format (json, csv)
        """
        
        # Extract domain if URL provided
        domain = self.extract_domain_from_url(target_domain)
        
        # Create temporary directory for screenshots
        if screenshots:
            self.screenshots_dir = tempfile.mkdtemp(prefix='dnstwist_screenshots_')
            os.makedirs(self.screenshots_dir, exist_ok=True)
            self.temp_dirs.append(self.screenshots_dir)
        
        # Build dnstwist command - EXACT ORDER as specified by user
        cmd = ['dnstwist']
        
        # Add fuzzing algorithms (must be comma-separated, not 'all')
        if fuzzers:
            # Convert 'all' to comma-separated list if needed
            # Use the exact command format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain
            if fuzzers.lower() == 'all':
                fuzzers = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain'
            # Ensure asterisk is present
            if not fuzzers.startswith('*'):
                fuzzers = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain'
            cmd.extend(['--fuzzers', fuzzers])
        
        # Only registered/live domains
        if registered_only:
            cmd.append('--registered')
        
        # Geolocation/WHOIS
        if geoip:
            cmd.append('--geoip')
        
        # Perceptual hash (screenshot similarity)
        if phash:
            cmd.append('--phash')
        
        # SSDeep content matching (FIXED: use --lsh ssdeep instead of deprecated --ssdeep)
        # Note: Order must be: --phash --lsh ssdeep --screenshots (as per user's exact command)
        if ssdeep:
            cmd.extend(['--lsh', 'ssdeep'])
        elif lsh and not ssdeep:
            # Only add plain --lsh if ssdeep is not enabled
            cmd.append('--lsh')
        
        # Screenshots (comes after --lsh ssdeep)
        if screenshots and self.screenshots_dir:
            cmd.extend(['--screenshots', self.screenshots_dir])
        
        # Output format
        if format:
            cmd.extend(['--format', format])
        
        # Add target domain
        cmd.append(domain)
        
        # Debug: print command for verification
        print(f"Running command: {' '.join(cmd)}", file=sys.stderr)
        
        # Execute dnstwist
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                check=False
            )
            
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            
            if result.returncode != 0:
                print(f"dnstwist exited with code {result.returncode}", file=sys.stderr)
                if stderr:
                    print(f"STDERR: {stderr}", file=sys.stderr)
            
            # Parse results
            scan_results = self.parse_dnstwist_output(
                stdout,
                stderr,
                domain,
                target_domain
            )
            
            # Process screenshots if available
            if screenshots and self.screenshots_dir:
                scan_results['screenshots'] = self.process_screenshots(self.screenshots_dir)
            
            return scan_results
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'dnstwist scan timed out after 10 minutes',
                'target_domain': domain
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'target_domain': domain
            }
    
    def parse_dnstwist_output(
        self,
        stdout: str,
        stderr: str,
        domain: str,
        original_url: str
    ) -> Dict[str, Any]:
        """Parse dnstwist JSON output and extract comprehensive information"""
        
        results = []
        
        # Try to parse JSON output
        try:
            if stdout.strip().startswith('['):
                results = json.loads(stdout)
            else:
                # Try line-by-line JSON
                for line in stdout.strip().split('\n'):
                    line = line.strip()
                    if line:
                        try:
                            data = json.loads(line)
                            results.append(data)
                        except json.JSONDecodeError:
                            continue
        except json.JSONDecodeError:
            # Fallback: parse CSV or text output
            results = self.parse_text_output(stdout, domain)
        
        # Build comprehensive results
        domain_variations = []
        suspicious_domains = []
        ssl_issues = []
        visual_matches = []
        content_matches = []
        
        for item in results:
            variation = self.process_domain_variation(item, domain)
            domain_variations.append(variation)
            
            # Collect suspicious domains
            if variation.get('active') and variation.get('risk_score', 0) > 0:
                suspicious_domains.append(variation)
            
            # SSL certificate issues
            if variation.get('ssl_valid') is False:
                ssl_issues.append(variation)
            
            # Visual similarity
            if variation.get('phash_similarity'):
                visual_matches.append(variation)
            
            # Content similarity
            if variation.get('lsh_similarity'):
                content_matches.append(variation)
        
        # Calculate threat score
        threat_score = self.calculate_threat_score(
            domain_variations,
            suspicious_domains,
            ssl_issues,
            visual_matches,
            content_matches
        )
        
        # Build findings
        findings = self.build_findings(
            domain_variations,
            suspicious_domains,
            ssl_issues,
            visual_matches,
            content_matches,
            domain
        )
        
        # Build recommendations
        recommendations = self.build_recommendations(
            threat_score,
            suspicious_domains,
            ssl_issues
        )
        
        return {
            'success': True,
            'target_url': original_url,
            'target_domain': domain,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'threat_score': threat_score,
            'findings': findings,
            'domain_variations': domain_variations,
            'statistics': {
                'total_variations': len(domain_variations),
                'active_domains': len([v for v in domain_variations if v.get('active')]),
                'inactive_domains': len([v for v in domain_variations if not v.get('active')]),
                'suspicious_domains': len(suspicious_domains),
                'ssl_issues': len(ssl_issues),
                'visual_matches': len(visual_matches),
                'content_matches': len(content_matches)
            },
            'recommendations': recommendations,
            'evidence': {
                'scan_tool': 'dnstwist',
                'scan_method': 'Comprehensive typosquatting detection with visual/content analysis',
                'raw_output_preview': stdout[:1000] if stdout else ''
            }
        }
    
    def process_domain_variation(self, item: Dict, original_domain: str) -> Dict:
        """Process a single domain variation and extract all information"""
        
        domain_name = item.get('domain-name', item.get('domain_name', item.get('domain', '')))
        fuzzer = item.get('fuzzer', item.get('fuzzer_type', 'unknown'))
        
        # Check if domain is active
        dns_a = item.get('dns-a', item.get('dns_a', item.get('a', [])))
        dns_mx = item.get('dns-mx', item.get('dns_mx', item.get('mx', [])))
        dns_ns = item.get('dns-ns', item.get('dns_ns', item.get('ns', [])))
        
        if not isinstance(dns_a, list):
            dns_a = [dns_a] if dns_a else []
        if not isinstance(dns_mx, list):
            dns_mx = [dns_mx] if dns_mx else []
        if not isinstance(dns_ns, list):
            dns_ns = [dns_ns] if dns_ns else []
        
        active = len(dns_a) > 0 or len(dns_mx) > 0 or len(dns_ns) > 0
        
        # Extract SSL certificate information
        ssl_info = self.extract_ssl_info(item)
        
        # Extract geolocation/WHOIS
        geo_info = self.extract_geo_info(item)
        
        # Extract similarity scores
        phash_similarity = item.get('phash', item.get('phash_similarity', item.get('screenshot_similarity')))
        lsh_similarity = item.get('lsh', item.get('lsh_similarity', item.get('content_similarity')))
        ssdeep_similarity = item.get('ssdeep', item.get('ssdeep_similarity'))
        
        # Determine attack category
        attack_category = self.determine_attack_category(fuzzer, phash_similarity, lsh_similarity)
        
        # Calculate risk score
        risk_score = self.calculate_domain_risk_score(
            active,
            ssl_info,
            phash_similarity,
            lsh_similarity,
            fuzzer
        )
        
        return {
            'domain': domain_name,
            'fuzzer': fuzzer,
            'attack_category': attack_category,
            'active': active,
            'dns_a': dns_a,
            'dns_mx': dns_mx,
            'dns_ns': dns_ns,
            'ssl_info': ssl_info,
            'geo_info': geo_info,
            'phash_similarity': phash_similarity,
            'lsh_similarity': lsh_similarity,
            'ssdeep_similarity': ssdeep_similarity,
            'risk_score': risk_score,
            'whois_info': item.get('whois', item.get('whois_info', {})),
            'registration_date': item.get('registration_date', item.get('created_date')),
            'expiry_date': item.get('expiry_date', item.get('expires_date'))
        }
    
    def extract_ssl_info(self, item: Dict) -> Dict:
        """Extract SSL certificate information"""
        ssl_info = {
            'valid': item.get('ssl_valid', item.get('cert_valid', True)),
            'issuer': item.get('ssl_issuer', item.get('cert_issuer', '')),
            'subject': item.get('ssl_subject', item.get('cert_subject', '')),
            'expiry': item.get('ssl_expiry', item.get('cert_expiry', '')),
            'self_signed': item.get('ssl_self_signed', item.get('cert_self_signed', False)),
            'chain_valid': item.get('ssl_chain_valid', True)
        }
        
        # Try to determine validity from available fields
        if ssl_info['valid'] is None:
            ssl_info['valid'] = not ssl_info.get('self_signed', False)
        
        return ssl_info
    
    def extract_geo_info(self, item: Dict) -> Dict:
        """Extract geolocation/WHOIS information"""
        return {
            'country': item.get('geoip_country', item.get('country', item.get('country_code', ''))),
            'city': item.get('geoip_city', item.get('city', '')),
            'latitude': item.get('geoip_latitude', item.get('latitude')),
            'longitude': item.get('geoip_longitude', item.get('longitude')),
            'isp': item.get('geoip_isp', item.get('isp', '')),
            'registrar': item.get('registrar', item.get('whois_registrar', ''))
        }
    
    def determine_attack_category(self, fuzzer: str, phash: Any, lsh: Any) -> str:
        """Determine attack category based on fuzzer and similarity"""
        categories = []
        
        # Typosquatting
        if fuzzer in ['addition', 'bitsquatting', 'homoglyph', 'transposition', 'substitution']:
            categories.append('typosquatting')
        
        # Visual spoofing
        if phash and isinstance(phash, (int, float)) and phash > 80:
            categories.append('visual_spoofing')
        
        # Content spoofing
        if lsh and isinstance(lsh, (int, float)) and lsh > 70:
            categories.append('content_spoofing')
        
        # Social engineering
        if fuzzer in ['dictionary', 'subdomain']:
            categories.append('social_engineering')
        
        if not categories:
            return 'suspicious'
        
        return ', '.join(categories)
    
    def calculate_domain_risk_score(
        self,
        active: bool,
        ssl_info: Dict,
        phash: Any,
        lsh: Any,
        fuzzer: str
    ) -> int:
        """Calculate risk score for a domain (0-100)"""
        score = 0
        
        # Base score for active domain
        if active:
            score += 30
        
        # SSL issues
        if ssl_info.get('valid') is False:
            score += 25
        if ssl_info.get('self_signed'):
            score += 15
        
        # Visual similarity
        if phash and isinstance(phash, (int, float)):
            if phash > 90:
                score += 30
            elif phash > 80:
                score += 20
            elif phash > 70:
                score += 10
        
        # Content similarity
        if lsh and isinstance(lsh, (int, float)):
            if lsh > 80:
                score += 25
            elif lsh > 70:
                score += 15
        
        # High-risk fuzzer types
        if fuzzer in ['homoglyph', 'bitsquatting']:
            score += 10
        
        return min(100, score)
    
    def calculate_threat_score(
        self,
        variations: List[Dict],
        suspicious: List[Dict],
        ssl_issues: List[Dict],
        visual_matches: List[Dict],
        content_matches: List[Dict]
    ) -> int:
        """Calculate overall threat score (0-100)"""
        score = 0
        
        # Base score from suspicious domains
        if len(suspicious) > 0:
            score += min(40, len(suspicious) * 5)
        
        # SSL issues
        if len(ssl_issues) > 0:
            score += min(20, len(ssl_issues) * 3)
        
        # Visual matches (high risk)
        if len(visual_matches) > 0:
            score += min(25, len(visual_matches) * 4)
        
        # Content matches
        if len(content_matches) > 0:
            score += min(15, len(content_matches) * 2)
        
        # Large number of variations
        if len(variations) > 50:
            score += 10
        elif len(variations) > 20:
            score += 5
        
        return min(100, max(0, score))
    
    def build_findings(
        self,
        variations: List[Dict],
        suspicious: List[Dict],
        ssl_issues: List[Dict],
        visual_matches: List[Dict],
        content_matches: List[Dict],
        domain: str
    ) -> List[Dict]:
        """Build findings array"""
        findings = []
        
        # Typosquatting detection
        if len(variations) > 0:
            findings.append({
                'type': 'Domain Typosquatting Detection',
                'severity': 'High' if len(variations) > 10 else 'Medium' if len(variations) > 5 else 'Low',
                'evidence': f'Found {len(variations)} potential typosquatting variations for {domain}. {len([v for v in variations if v.get("active")])} variations have active DNS records.',
                'count': len(variations),
                'active_count': len([v for v in variations if v.get('active')])
            })
        
        # Suspicious domains
        if len(suspicious) > 0:
            findings.append({
                'type': 'Phishing Threat Intelligence',
                'severity': 'High' if len(suspicious) > 5 else 'Medium',
                'evidence': f'Found {len(suspicious)} suspicious domain variations with high risk scores. These domains could be used for phishing attacks.',
                'suspicious_domains': [s['domain'] for s in suspicious[:10]]
            })
        
        # SSL certificate issues
        if len(ssl_issues) > 0:
            findings.append({
                'type': 'SSL Certificate Issues',
                'severity': 'High',
                'evidence': f'Found {len(ssl_issues)} domains with invalid or suspicious SSL certificates. This may indicate phishing sites using fake certificates.',
                'domains': [s['domain'] for s in ssl_issues[:10]]
            })
        
        # Visual similarity
        if len(visual_matches) > 0:
            findings.append({
                'type': 'Visual Spoofing Detection',
                'severity': 'High',
                'evidence': f'Found {len(visual_matches)} domains with high visual similarity (screenshot comparison). These may be attempting to visually impersonate the target domain.',
                'domains': [v['domain'] for v in visual_matches[:10]]
            })
        
        # Content similarity
        if len(content_matches) > 0:
            findings.append({
                'type': 'Content Spoofing Detection',
                'severity': 'Medium',
                'evidence': f'Found {len(content_matches)} domains with similar HTML content (fuzzy hash matching). This may indicate content copying or phishing attempts.',
                'domains': [c['domain'] for c in content_matches[:10]]
            })
        
        return findings
    
    def build_recommendations(
        self,
        threat_score: int,
        suspicious: List[Dict],
        ssl_issues: List[Dict]
    ) -> List[str]:
        """Build recommendations based on findings"""
        recommendations = [
            'Monitor these domain variations for suspicious activity',
            'Register common typosquatting variations defensively',
            'Implement email security measures to detect phishing attempts',
            'Educate users about typosquatting and phishing threats',
            'Set up domain monitoring alerts for variations'
        ]
        
        if threat_score > 60:
            recommendations.extend([
                'HIGH RISK: Consider taking immediate action against suspicious domains',
                'Report malicious variations to security organizations and registrars',
                'Implement additional security controls and monitoring'
            ])
        
        if len(ssl_issues) > 0:
            recommendations.append('Investigate SSL certificate issues on suspicious domains')
        
        if len(suspicious) > 5:
            recommendations.append('Consider legal action against malicious domain registrations')
        
        recommendations.extend([
            'Consider implementing DMARC, SPF, and DKIM email authentication',
            'Regularly scan for new domain variations',
            'Maintain a list of known malicious domains for blocking'
        ])
        
        return recommendations
    
    def process_screenshots(self, screenshots_dir: str) -> List[Dict]:
        """Process screenshot files and return metadata"""
        screenshots = []
        
        if not os.path.exists(screenshots_dir):
            return screenshots
        
        try:
            for filename in os.listdir(screenshots_dir):
                if filename.endswith(('.png', '.jpg', '.jpeg')):
                    filepath = os.path.join(screenshots_dir, filename)
                    domain_name = filename.replace('.png', '').replace('.jpg', '').replace('.jpeg', '')
                    
                    # Read and encode screenshot
                    try:
                        with open(filepath, 'rb') as f:
                            image_data = f.read()
                            base64_data = base64.b64encode(image_data).decode('utf-8')
                        
                        screenshots.append({
                            'domain': domain_name,
                            'filename': filename,
                            'filepath': filepath,
                            'base64': base64_data,
                            'size': len(image_data)
                        })
                    except Exception as e:
                        print(f"Warning: Failed to process screenshot {filename}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Failed to list screenshots directory: {e}", file=sys.stderr)
        
        return screenshots
    
    def parse_text_output(self, output: str, domain: str) -> List[Dict]:
        """Parse text/CSV output as fallback"""
        results = []
        
        for line in output.strip().split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Try to extract domain name from line
            parts = line.split()
            if parts:
                domain_name = parts[0]
                if domain_name != domain:
                    results.append({
                        'domain-name': domain_name,
                        'fuzzer': 'unknown',
                        'dns-a': []
                    })
        
        return results


def main():
    """Main entry point for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Comprehensive dnstwist wrapper for phishing detection'
    )
    parser.add_argument('domain', help='Target domain or URL to scan')
    parser.add_argument('--fuzzers', default='*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain', help='Fuzzing algorithms (comma-separated list, format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain)')
    parser.add_argument('--registered', action='store_true', default=True, help='Only scan registered domains')
    parser.add_argument('--geoip', action='store_true', default=True, help='Enable geolocation')
    parser.add_argument('--lsh', action='store_true', default=False, help='Enable fuzzy hash matching (LSH)')
    parser.add_argument('--phash', action='store_true', default=True, help='Enable perceptual hash')
    parser.add_argument('--screenshots', action='store_true', default=True, help='Capture screenshots')
    parser.add_argument('--ssdeep', action='store_true', default=True, help='Enable ssdeep matching (uses --lsh ssdeep)')
    parser.add_argument('--format', default='json', choices=['json', 'csv'], help='Output format')
    
    args = parser.parse_args()
    
    with DnstwistWrapper() as wrapper:
        # Check if dnstwist is installed
        if not wrapper.check_dnstwist_installed():
            result = {
                'success': False,
                'error': 'dnstwist is not installed. Please install it via: sudo apt install dnstwist',
                'target_domain': args.domain
            }
            print(json.dumps(result, indent=2))
            sys.exit(1)
        
        # Run scan
        result = wrapper.run_dnstwist_scan(
            target_domain=args.domain,
            fuzzers=args.fuzzers,
            registered_only=args.registered,
            geoip=args.geoip,
            lsh=args.lsh,
            phash=args.phash,
            screenshots=args.screenshots,
            ssdeep=args.ssdeep,
            format=args.format
        )
        
        # Output results
        print(json.dumps(result, indent=2))
        
        if not result.get('success'):
            sys.exit(1)


if __name__ == '__main__':
    main()


#!/usr/bin/env python3
"""
Comprehensive dnstwist Wrapper for Advanced Phishing Detection
Supports all major dnstwist features:
- All fuzzing algorithms
- Live domain and registration scanning
- Geolocation/WHOIS information
- Visual/screenshot analysis
- Content/fuzzy hash matching
- SSL certificate validation
- Multiple output formats
"""

import json
import subprocess
import sys
import os
import tempfile
import shutil
import base64
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any
import re

class DnstwistWrapper:
    """Wrapper class for dnstwist with comprehensive phishing detection features"""
    
    def __init__(self):
        self.screenshots_dir = None
        self.temp_dirs = []
        
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Cleanup temporary directories"""
        self.cleanup()
        
    def cleanup(self):
        """Clean up temporary directories"""
        for temp_dir in self.temp_dirs:
            try:
                if os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
            except Exception as e:
                print(f"Warning: Failed to clean up {temp_dir}: {e}", file=sys.stderr)
    
    def check_dnstwist_installed(self) -> bool:
        """Check if dnstwist is installed"""
        try:
            result = subprocess.run(
                ['dnstwist', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    def extract_domain_from_url(self, url: str) -> str:
        """Extract domain from URL"""
        # Remove protocol
        domain = url.replace('https://', '').replace('http://', '').replace('www.', '')
        # Remove path
        domain = domain.split('/')[0]
        # Remove port
        domain = domain.split(':')[0]
        return domain.strip()
    
    def run_dnstwist_scan(
        self,
        target_domain: str,
        fuzzers: str = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain',
        registered_only: bool = True,
        geoip: bool = True,
        lsh: bool = True,
        phash: bool = True,
        screenshots: bool = True,
        ssdeep: bool = True,
        format: str = 'json'
    ) -> Dict[str, Any]:
        """
        Run comprehensive dnstwist scan with all features
        
        Args:
            target_domain: Target domain to scan
            fuzzers: Fuzzing algorithms to use (comma-separated list, format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain)
            registered_only: Only scan registered/live domains
            geoip: Enable geolocation/WHOIS information
            lsh: Enable fuzzy hash matching (LSH)
            phash: Enable perceptual hash (screenshot similarity)
            screenshots: Capture screenshots of domains
            ssdeep: Enable ssdeep content matching (uses --lsh ssdeep)
            format: Output format (json, csv)
        """
        
        # Extract domain if URL provided
        domain = self.extract_domain_from_url(target_domain)
        
        # Create temporary directory for screenshots
        if screenshots:
            self.screenshots_dir = tempfile.mkdtemp(prefix='dnstwist_screenshots_')
            os.makedirs(self.screenshots_dir, exist_ok=True)
            self.temp_dirs.append(self.screenshots_dir)
        
        # Build dnstwist command - EXACT ORDER as specified by user
        cmd = ['dnstwist']
        
        # Add fuzzing algorithms (must be comma-separated, not 'all')
        if fuzzers:
            # Convert 'all' to comma-separated list if needed
            # Use the exact command format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain
            if fuzzers.lower() == 'all':
                fuzzers = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain'
            # Ensure asterisk is present
            if not fuzzers.startswith('*'):
                fuzzers = '*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain'
            cmd.extend(['--fuzzers', fuzzers])
        
        # Only registered/live domains
        if registered_only:
            cmd.append('--registered')
        
        # Geolocation/WHOIS
        if geoip:
            cmd.append('--geoip')
        
        # Perceptual hash (screenshot similarity)
        if phash:
            cmd.append('--phash')
        
        # SSDeep content matching (FIXED: use --lsh ssdeep instead of deprecated --ssdeep)
        # Note: Order must be: --phash --lsh ssdeep --screenshots (as per user's exact command)
        if ssdeep:
            cmd.extend(['--lsh', 'ssdeep'])
        elif lsh and not ssdeep:
            # Only add plain --lsh if ssdeep is not enabled
            cmd.append('--lsh')
        
        # Screenshots (comes after --lsh ssdeep)
        if screenshots and self.screenshots_dir:
            cmd.extend(['--screenshots', self.screenshots_dir])
        
        # Output format
        if format:
            cmd.extend(['--format', format])
        
        # Add target domain
        cmd.append(domain)
        
        # Debug: print command for verification
        print(f"Running command: {' '.join(cmd)}", file=sys.stderr)
        
        # Execute dnstwist
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,  # 10 minute timeout
                check=False
            )
            
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            
            if result.returncode != 0:
                print(f"dnstwist exited with code {result.returncode}", file=sys.stderr)
                if stderr:
                    print(f"STDERR: {stderr}", file=sys.stderr)
            
            # Parse results
            scan_results = self.parse_dnstwist_output(
                stdout,
                stderr,
                domain,
                target_domain
            )
            
            # Process screenshots if available
            if screenshots and self.screenshots_dir:
                scan_results['screenshots'] = self.process_screenshots(self.screenshots_dir)
            
            return scan_results
            
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'error': 'dnstwist scan timed out after 10 minutes',
                'target_domain': domain
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'target_domain': domain
            }
    
    def parse_dnstwist_output(
        self,
        stdout: str,
        stderr: str,
        domain: str,
        original_url: str
    ) -> Dict[str, Any]:
        """Parse dnstwist JSON output and extract comprehensive information"""
        
        results = []
        
        # Try to parse JSON output
        try:
            if stdout.strip().startswith('['):
                results = json.loads(stdout)
            else:
                # Try line-by-line JSON
                for line in stdout.strip().split('\n'):
                    line = line.strip()
                    if line:
                        try:
                            data = json.loads(line)
                            results.append(data)
                        except json.JSONDecodeError:
                            continue
        except json.JSONDecodeError:
            # Fallback: parse CSV or text output
            results = self.parse_text_output(stdout, domain)
        
        # Build comprehensive results
        domain_variations = []
        suspicious_domains = []
        ssl_issues = []
        visual_matches = []
        content_matches = []
        
        for item in results:
            variation = self.process_domain_variation(item, domain)
            domain_variations.append(variation)
            
            # Collect suspicious domains
            if variation.get('active') and variation.get('risk_score', 0) > 0:
                suspicious_domains.append(variation)
            
            # SSL certificate issues
            if variation.get('ssl_valid') is False:
                ssl_issues.append(variation)
            
            # Visual similarity
            if variation.get('phash_similarity'):
                visual_matches.append(variation)
            
            # Content similarity
            if variation.get('lsh_similarity'):
                content_matches.append(variation)
        
        # Calculate threat score
        threat_score = self.calculate_threat_score(
            domain_variations,
            suspicious_domains,
            ssl_issues,
            visual_matches,
            content_matches
        )
        
        # Build findings
        findings = self.build_findings(
            domain_variations,
            suspicious_domains,
            ssl_issues,
            visual_matches,
            content_matches,
            domain
        )
        
        # Build recommendations
        recommendations = self.build_recommendations(
            threat_score,
            suspicious_domains,
            ssl_issues
        )
        
        return {
            'success': True,
            'target_url': original_url,
            'target_domain': domain,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'threat_score': threat_score,
            'findings': findings,
            'domain_variations': domain_variations,
            'statistics': {
                'total_variations': len(domain_variations),
                'active_domains': len([v for v in domain_variations if v.get('active')]),
                'inactive_domains': len([v for v in domain_variations if not v.get('active')]),
                'suspicious_domains': len(suspicious_domains),
                'ssl_issues': len(ssl_issues),
                'visual_matches': len(visual_matches),
                'content_matches': len(content_matches)
            },
            'recommendations': recommendations,
            'evidence': {
                'scan_tool': 'dnstwist',
                'scan_method': 'Comprehensive typosquatting detection with visual/content analysis',
                'raw_output_preview': stdout[:1000] if stdout else ''
            }
        }
    
    def process_domain_variation(self, item: Dict, original_domain: str) -> Dict:
        """Process a single domain variation and extract all information"""
        
        domain_name = item.get('domain-name', item.get('domain_name', item.get('domain', '')))
        fuzzer = item.get('fuzzer', item.get('fuzzer_type', 'unknown'))
        
        # Check if domain is active
        dns_a = item.get('dns-a', item.get('dns_a', item.get('a', [])))
        dns_mx = item.get('dns-mx', item.get('dns_mx', item.get('mx', [])))
        dns_ns = item.get('dns-ns', item.get('dns_ns', item.get('ns', [])))
        
        if not isinstance(dns_a, list):
            dns_a = [dns_a] if dns_a else []
        if not isinstance(dns_mx, list):
            dns_mx = [dns_mx] if dns_mx else []
        if not isinstance(dns_ns, list):
            dns_ns = [dns_ns] if dns_ns else []
        
        active = len(dns_a) > 0 or len(dns_mx) > 0 or len(dns_ns) > 0
        
        # Extract SSL certificate information
        ssl_info = self.extract_ssl_info(item)
        
        # Extract geolocation/WHOIS
        geo_info = self.extract_geo_info(item)
        
        # Extract similarity scores
        phash_similarity = item.get('phash', item.get('phash_similarity', item.get('screenshot_similarity')))
        lsh_similarity = item.get('lsh', item.get('lsh_similarity', item.get('content_similarity')))
        ssdeep_similarity = item.get('ssdeep', item.get('ssdeep_similarity'))
        
        # Determine attack category
        attack_category = self.determine_attack_category(fuzzer, phash_similarity, lsh_similarity)
        
        # Calculate risk score
        risk_score = self.calculate_domain_risk_score(
            active,
            ssl_info,
            phash_similarity,
            lsh_similarity,
            fuzzer
        )
        
        return {
            'domain': domain_name,
            'fuzzer': fuzzer,
            'attack_category': attack_category,
            'active': active,
            'dns_a': dns_a,
            'dns_mx': dns_mx,
            'dns_ns': dns_ns,
            'ssl_info': ssl_info,
            'geo_info': geo_info,
            'phash_similarity': phash_similarity,
            'lsh_similarity': lsh_similarity,
            'ssdeep_similarity': ssdeep_similarity,
            'risk_score': risk_score,
            'whois_info': item.get('whois', item.get('whois_info', {})),
            'registration_date': item.get('registration_date', item.get('created_date')),
            'expiry_date': item.get('expiry_date', item.get('expires_date'))
        }
    
    def extract_ssl_info(self, item: Dict) -> Dict:
        """Extract SSL certificate information"""
        ssl_info = {
            'valid': item.get('ssl_valid', item.get('cert_valid', True)),
            'issuer': item.get('ssl_issuer', item.get('cert_issuer', '')),
            'subject': item.get('ssl_subject', item.get('cert_subject', '')),
            'expiry': item.get('ssl_expiry', item.get('cert_expiry', '')),
            'self_signed': item.get('ssl_self_signed', item.get('cert_self_signed', False)),
            'chain_valid': item.get('ssl_chain_valid', True)
        }
        
        # Try to determine validity from available fields
        if ssl_info['valid'] is None:
            ssl_info['valid'] = not ssl_info.get('self_signed', False)
        
        return ssl_info
    
    def extract_geo_info(self, item: Dict) -> Dict:
        """Extract geolocation/WHOIS information"""
        return {
            'country': item.get('geoip_country', item.get('country', item.get('country_code', ''))),
            'city': item.get('geoip_city', item.get('city', '')),
            'latitude': item.get('geoip_latitude', item.get('latitude')),
            'longitude': item.get('geoip_longitude', item.get('longitude')),
            'isp': item.get('geoip_isp', item.get('isp', '')),
            'registrar': item.get('registrar', item.get('whois_registrar', ''))
        }
    
    def determine_attack_category(self, fuzzer: str, phash: Any, lsh: Any) -> str:
        """Determine attack category based on fuzzer and similarity"""
        categories = []
        
        # Typosquatting
        if fuzzer in ['addition', 'bitsquatting', 'homoglyph', 'transposition', 'substitution']:
            categories.append('typosquatting')
        
        # Visual spoofing
        if phash and isinstance(phash, (int, float)) and phash > 80:
            categories.append('visual_spoofing')
        
        # Content spoofing
        if lsh and isinstance(lsh, (int, float)) and lsh > 70:
            categories.append('content_spoofing')
        
        # Social engineering
        if fuzzer in ['dictionary', 'subdomain']:
            categories.append('social_engineering')
        
        if not categories:
            return 'suspicious'
        
        return ', '.join(categories)
    
    def calculate_domain_risk_score(
        self,
        active: bool,
        ssl_info: Dict,
        phash: Any,
        lsh: Any,
        fuzzer: str
    ) -> int:
        """Calculate risk score for a domain (0-100)"""
        score = 0
        
        # Base score for active domain
        if active:
            score += 30
        
        # SSL issues
        if ssl_info.get('valid') is False:
            score += 25
        if ssl_info.get('self_signed'):
            score += 15
        
        # Visual similarity
        if phash and isinstance(phash, (int, float)):
            if phash > 90:
                score += 30
            elif phash > 80:
                score += 20
            elif phash > 70:
                score += 10
        
        # Content similarity
        if lsh and isinstance(lsh, (int, float)):
            if lsh > 80:
                score += 25
            elif lsh > 70:
                score += 15
        
        # High-risk fuzzer types
        if fuzzer in ['homoglyph', 'bitsquatting']:
            score += 10
        
        return min(100, score)
    
    def calculate_threat_score(
        self,
        variations: List[Dict],
        suspicious: List[Dict],
        ssl_issues: List[Dict],
        visual_matches: List[Dict],
        content_matches: List[Dict]
    ) -> int:
        """Calculate overall threat score (0-100)"""
        score = 0
        
        # Base score from suspicious domains
        if len(suspicious) > 0:
            score += min(40, len(suspicious) * 5)
        
        # SSL issues
        if len(ssl_issues) > 0:
            score += min(20, len(ssl_issues) * 3)
        
        # Visual matches (high risk)
        if len(visual_matches) > 0:
            score += min(25, len(visual_matches) * 4)
        
        # Content matches
        if len(content_matches) > 0:
            score += min(15, len(content_matches) * 2)
        
        # Large number of variations
        if len(variations) > 50:
            score += 10
        elif len(variations) > 20:
            score += 5
        
        return min(100, max(0, score))
    
    def build_findings(
        self,
        variations: List[Dict],
        suspicious: List[Dict],
        ssl_issues: List[Dict],
        visual_matches: List[Dict],
        content_matches: List[Dict],
        domain: str
    ) -> List[Dict]:
        """Build findings array"""
        findings = []
        
        # Typosquatting detection
        if len(variations) > 0:
            findings.append({
                'type': 'Domain Typosquatting Detection',
                'severity': 'High' if len(variations) > 10 else 'Medium' if len(variations) > 5 else 'Low',
                'evidence': f'Found {len(variations)} potential typosquatting variations for {domain}. {len([v for v in variations if v.get("active")])} variations have active DNS records.',
                'count': len(variations),
                'active_count': len([v for v in variations if v.get('active')])
            })
        
        # Suspicious domains
        if len(suspicious) > 0:
            findings.append({
                'type': 'Phishing Threat Intelligence',
                'severity': 'High' if len(suspicious) > 5 else 'Medium',
                'evidence': f'Found {len(suspicious)} suspicious domain variations with high risk scores. These domains could be used for phishing attacks.',
                'suspicious_domains': [s['domain'] for s in suspicious[:10]]
            })
        
        # SSL certificate issues
        if len(ssl_issues) > 0:
            findings.append({
                'type': 'SSL Certificate Issues',
                'severity': 'High',
                'evidence': f'Found {len(ssl_issues)} domains with invalid or suspicious SSL certificates. This may indicate phishing sites using fake certificates.',
                'domains': [s['domain'] for s in ssl_issues[:10]]
            })
        
        # Visual similarity
        if len(visual_matches) > 0:
            findings.append({
                'type': 'Visual Spoofing Detection',
                'severity': 'High',
                'evidence': f'Found {len(visual_matches)} domains with high visual similarity (screenshot comparison). These may be attempting to visually impersonate the target domain.',
                'domains': [v['domain'] for v in visual_matches[:10]]
            })
        
        # Content similarity
        if len(content_matches) > 0:
            findings.append({
                'type': 'Content Spoofing Detection',
                'severity': 'Medium',
                'evidence': f'Found {len(content_matches)} domains with similar HTML content (fuzzy hash matching). This may indicate content copying or phishing attempts.',
                'domains': [c['domain'] for c in content_matches[:10]]
            })
        
        return findings
    
    def build_recommendations(
        self,
        threat_score: int,
        suspicious: List[Dict],
        ssl_issues: List[Dict]
    ) -> List[str]:
        """Build recommendations based on findings"""
        recommendations = [
            'Monitor these domain variations for suspicious activity',
            'Register common typosquatting variations defensively',
            'Implement email security measures to detect phishing attempts',
            'Educate users about typosquatting and phishing threats',
            'Set up domain monitoring alerts for variations'
        ]
        
        if threat_score > 60:
            recommendations.extend([
                'HIGH RISK: Consider taking immediate action against suspicious domains',
                'Report malicious variations to security organizations and registrars',
                'Implement additional security controls and monitoring'
            ])
        
        if len(ssl_issues) > 0:
            recommendations.append('Investigate SSL certificate issues on suspicious domains')
        
        if len(suspicious) > 5:
            recommendations.append('Consider legal action against malicious domain registrations')
        
        recommendations.extend([
            'Consider implementing DMARC, SPF, and DKIM email authentication',
            'Regularly scan for new domain variations',
            'Maintain a list of known malicious domains for blocking'
        ])
        
        return recommendations
    
    def process_screenshots(self, screenshots_dir: str) -> List[Dict]:
        """Process screenshot files and return metadata"""
        screenshots = []
        
        if not os.path.exists(screenshots_dir):
            return screenshots
        
        try:
            for filename in os.listdir(screenshots_dir):
                if filename.endswith(('.png', '.jpg', '.jpeg')):
                    filepath = os.path.join(screenshots_dir, filename)
                    domain_name = filename.replace('.png', '').replace('.jpg', '').replace('.jpeg', '')
                    
                    # Read and encode screenshot
                    try:
                        with open(filepath, 'rb') as f:
                            image_data = f.read()
                            base64_data = base64.b64encode(image_data).decode('utf-8')
                        
                        screenshots.append({
                            'domain': domain_name,
                            'filename': filename,
                            'filepath': filepath,
                            'base64': base64_data,
                            'size': len(image_data)
                        })
                    except Exception as e:
                        print(f"Warning: Failed to process screenshot {filename}: {e}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: Failed to list screenshots directory: {e}", file=sys.stderr)
        
        return screenshots
    
    def parse_text_output(self, output: str, domain: str) -> List[Dict]:
        """Parse text/CSV output as fallback"""
        results = []
        
        for line in output.strip().split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Try to extract domain name from line
            parts = line.split()
            if parts:
                domain_name = parts[0]
                if domain_name != domain:
                    results.append({
                        'domain-name': domain_name,
                        'fuzzer': 'unknown',
                        'dns-a': []
                    })
        
        return results


def main():
    """Main entry point for CLI usage"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description='Comprehensive dnstwist wrapper for phishing detection'
    )
    parser.add_argument('domain', help='Target domain or URL to scan')
    parser.add_argument('--fuzzers', default='*original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain', help='Fuzzing algorithms (comma-separated list, format: *original,addition,bitsquatting,dictionary,homoglyph,transposition,subdomain)')
    parser.add_argument('--registered', action='store_true', default=True, help='Only scan registered domains')
    parser.add_argument('--geoip', action='store_true', default=True, help='Enable geolocation')
    parser.add_argument('--lsh', action='store_true', default=False, help='Enable fuzzy hash matching (LSH)')
    parser.add_argument('--phash', action='store_true', default=True, help='Enable perceptual hash')
    parser.add_argument('--screenshots', action='store_true', default=True, help='Capture screenshots')
    parser.add_argument('--ssdeep', action='store_true', default=True, help='Enable ssdeep matching (uses --lsh ssdeep)')
    parser.add_argument('--format', default='json', choices=['json', 'csv'], help='Output format')
    
    args = parser.parse_args()
    
    with DnstwistWrapper() as wrapper:
        # Check if dnstwist is installed
        if not wrapper.check_dnstwist_installed():
            result = {
                'success': False,
                'error': 'dnstwist is not installed. Please install it via: sudo apt install dnstwist',
                'target_domain': args.domain
            }
            print(json.dumps(result, indent=2))
            sys.exit(1)
        
        # Run scan
        result = wrapper.run_dnstwist_scan(
            target_domain=args.domain,
            fuzzers=args.fuzzers,
            registered_only=args.registered,
            geoip=args.geoip,
            lsh=args.lsh,
            phash=args.phash,
            screenshots=args.screenshots,
            ssdeep=args.ssdeep,
            format=args.format
        )
        
        # Output results
        print(json.dumps(result, indent=2))
        
        if not result.get('success'):
            sys.exit(1)


if __name__ == '__main__':
    main()

