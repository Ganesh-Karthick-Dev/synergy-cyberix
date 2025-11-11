#!/usr/bin/env python3
"""
network_scan_to_json_v2.py

Dynamic, robust parser that converts raw scan outputs into a structured JSON findings report.

Features:
- Accepts multiple input files or stdin; recognizes outputs from: whatweb, ping, hping3, host/dig, nmap (text), nmap (XML - optional).
- Produces JSON to a file or stdout (so it's easy to integrate with Electron via child_process).
- Adds per-tool findings, recommended tests, and an overall recommendation section.
- Non-intrusive: parser only. Does NOT execute scans.

Usage examples:
  # Parse multiple files and write JSON
  python3 network_scan_to_json_v2.py --input whatweb.txt ping.txt nmap.txt --domain webnox.in --output webnox_report.json

  # Read from stdin and print JSON to stdout (good for piping)
  cat scans_combined.txt | python3 network_scan_to_json_v2.py --stdin --domain webnox.in

  # Parse nmap XML for best accuracy
  python3 network_scan_to_json_v2.py --nmap-xml webnox_1-2000.xml --domain webnox.in --output webnox_report.json

Integration tips for Electron:
- Call this script using Node's child_process.spawn or exec and capture stdout (JSON) or write to a temp file.
- Use --stdin to pipe raw outputs into the script for single-command integration.

"""

import sys
import re
import json
import argparse
from typing import List, Dict, Any, Optional
from xml.etree import ElementTree as ET


def read_inputs(files: List[str], use_stdin: bool) -> str:
    parts = []
    if use_stdin:
        parts.append(sys.stdin.read())
    for f in files:
        try:
            with open(f, 'r', encoding='utf-8', errors='ignore') as fh:
                parts.append(fh.read())
        except Exception as e:
            print(f'Warning: failed to read {f}: {e}', file=sys.stderr)
    return '\n\n'.join(parts)


# ---------------- Parsers ----------------

def detect_and_parse_nmap_xml(xml_text: str) -> Optional[Dict[str, Any]]:
    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return None
    out = {'hosts': []}
    for h in root.findall('host'):
        hh: Dict[str, Any] = {}
        addr = h.find("address[@addrtype='ipv4']")
        if addr is not None:
            hh['ip'] = addr.get('addr')
        hostnames = h.find('hostnames')
        if hostnames is not None and hostnames.find('hostname') is not None:
            hh['name'] = hostnames.find('hostname').get('name')
        status = h.find('status')
        if status is not None:
            hh['status'] = status.get('state')
        ports = []
        for p in h.findall('.//port'):
            portnum = int(p.get('portid'))
            proto = p.get('protocol')
            state = p.find('state').get('state') if p.find('state') is not None else None
            svc = p.find('service')
            s = {}
            if svc is not None:
                s['name'] = svc.get('name')
                if svc.get('product'): s['product'] = svc.get('product')
                if svc.get('version'): s['version'] = svc.get('version')
            ports.append({'port': portnum, 'proto': proto, 'state': state, 'service': s})
        if ports:
            hh['ports'] = ports
        # scripts and hostscript parsing omitted for brevity
        out['hosts'].append(hh)
    return out


def parse_nmap_text(text: str) -> Optional[Dict[str, Any]]:
    if 'Nmap scan report for' not in text:
        return None
    out: Dict[str, Any] = {}
    # host header
    m = re.search(r"Nmap scan report for (.+)", text)
    if m:
        host_hdr = m.group(1).strip()
        ip_m = re.match(r"(.+) \((\d+\.\d+\.\d+\.\d+)\)", host_hdr)
        if ip_m:
            out['host'] = ip_m.group(1).strip()
            out['ip'] = ip_m.group(2).strip()
        else:
            if re.match(r"\d+\.\d+\.\d+\.\d+", host_hdr):
                out['ip'] = host_hdr
            else:
                out['host'] = host_hdr
    # rDNS
    rdns = re.search(r"rDNS record for [0-9\.]+:\s*([^\n]+)", text)
    if rdns:
        out['rDNS'] = rdns.group(1).strip()
    # latency
    lat = re.search(r"Host is up[^(]*\(([^\)]+)\)", text)
    if lat:
        out['latency'] = lat.group(1).strip()
    # parse ports and scripts
    ports = []
    lines = text.splitlines()
    i = 0
    port_re = re.compile(r"^(\d+)\/tcp\s+(\w+)\s+(\S+)\s*(.*)$")
    while i < len(lines):
        line = lines[i]
        m = port_re.match(line)
        if m:
            port = int(m.group(1))
            state = m.group(2)
            service = m.group(3)
            rest = m.group(4).strip()
            version = rest if rest else None
            # capture continuation lines that are part of version (not scripts lines starting with '|')
            j = i + 1
            cont = []
            while j < len(lines) and lines[j].strip() and not lines[j].strip().startswith('|') and not re.match(r"^\d+\/tcp", lines[j]):
                cont.append(lines[j].strip())
                j += 1
            if cont:
                extra = ' '.join(cont)
                version = (version + ' ' + extra).strip() if version else extra
            entry: Dict[str, Any] = {'port': port, 'state': state, 'service': service}
            if version:
                entry['version'] = re.sub(r"\s+", ' ', version)
            # collect script block
            scripts = []
            while j < len(lines) and lines[j].strip().startswith('|'):
                scripts.append(lines[j].rstrip())
                j += 1
            if scripts:
                script_block = '\n'.join(scripts)
                entry['scripts_raw'] = script_block
                # http-title
                m_title = re.search(r"http-title:\s*(.+)$", script_block, re.I|re.M)
                if m_title:
                    entry['http_title'] = m_title.group(1).strip()
                # ssl-cert
                if 'ssl-cert' in script_block:
                    cert = {}
                    m_cn = re.search(r"Subject:\s*commonName=([^\n]+)", script_block)
                    if m_cn: cert['commonName'] = m_cn.group(1).strip()
                    m_san = re.search(r"Subject Alternative Name:\s*([^\n]+)", script_block)
                    if m_san:
                        sans = [s.strip() for s in re.split(r",\s*", m_san.group(1))]
                        cert['SANs'] = sans
                    m_iss = re.search(r"Issuer:\s*(.+)$", script_block, re.M)
                    if m_iss: cert['issuer'] = m_iss.group(1).strip()
                    m_nb = re.search(r"Not valid before:\s*([0-9T:\-]+)", script_block)
                    if m_nb: cert['not_before'] = m_nb.group(1).strip()
                    m_na = re.search(r"Not valid after:\s*([0-9T:\-]+)", script_block)
                    if m_na: cert['not_after'] = m_na.group(1).strip()
                    entry['ssl_cert'] = cert
            ports.append(entry)
            i = j
            continue
        i += 1
    if ports:
        out['ports'] = ports
    # service info
    m_si = re.search(r"Service Info:\s*(.+)", text)
    if m_si:
        out['service_info'] = m_si.group(1).strip()
    return out


def parse_whatweb(text: str) -> Optional[Dict[str, Any]]:
    # whatweb output often a single-line summary or verbose; try to find server and ip
    m = re.search(r"https?://([\w\.-]+)[^\n]*\[([^\]]+)\].*HTTPServer\[([^\]]+)\].*IP\[([^\]]+)\]", text)
    if m:
        return {'domain': m.group(1), 'status': m.group(2), 'server': m.group(3), 'ip': m.group(4)}
    # fallback: look for 'nginx' or 'Apache' mentions
    if 'whatweb' in text.lower() or 'nginx' in text.lower() or 'apache' in text.lower():
        return {'note': 'whatweb-like output detected', 'snippet': text.strip()[:400]}
    return None


def parse_ping(text: str) -> Optional[Dict[str, Any]]:
    m = re.search(r"(\d+) packets transmitted, (\d+) received, ([\d.]+)% packet loss", text)
    if m:
        return {'transmitted': int(m.group(1)), 'received': int(m.group(2)), 'packet_loss_percent': float(m.group(3))}
    return None


def parse_hping(text: str) -> Optional[Dict[str, Any]]:
    # look for 'HPING' and round-trip line
    if 'HPING' not in text.upper():
        return None
    rtt = re.search(r"round-trip min\/avg\/max = ([\d.]+)\/([\d.]+)\/([\d.]+) ms", text)
    pk = re.search(r"(\d+) packets transmitted, (\d+) packets received, ([\d.%]+) packet loss", text)
    result = {}
    if pk:
        result['packets_sent'] = int(pk.group(1)); result['packets_received'] = int(pk.group(2)); result['loss'] = pk.group(3)
    if rtt:
        result['rtt_ms'] = {'min': float(rtt.group(1)), 'avg': float(rtt.group(2)), 'max': float(rtt.group(3))}
    # try to capture per-line SYN/ACK lines
    syn_lines = [ln for ln in text.splitlines() if 'flags=SA' in ln or 'S set' in ln]
    if syn_lines:
        result['syn_ack_lines'] = syn_lines[:10]
    return result if result else None


def parse_host(text: str) -> Optional[Dict[str, Any]]:
    m_ip = re.search(r"([\w\.-]+) has address ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)", text)
    if m_ip:
        out = {'A_record': m_ip.group(2)}
        mxs = re.findall(r"mail is handled by (\d+) ([^\n\.]+\.[^\n\.]+\.[^\n\.]*)\.?", text)
        if mxs:
            out['MX_records'] = [{'priority': int(p), 'server': s} for p, s in mxs]
        return out
    # dig-style fallback
    m2 = re.search(r"^([^\s]+)\s+IN\s+A\s+([0-9.]+)$", text, re.M)
    if m2:
        return {'A_record': m2.group(2)}
    return None


def run_parsers(raw: str, nmap_xml_file: Optional[str] = None) -> Dict[str, Any]:
    parsed: Dict[str, Any] = {}
    # If user provided nmap xml file path, parse it first
    if nmap_xml_file:
        try:
            with open(nmap_xml_file, 'r', encoding='utf-8', errors='ignore') as fh:
                xml = fh.read()
            xml_parsed = detect_and_parse_nmap_xml(xml)
            if xml_parsed:
                parsed['nmap_xml'] = xml_parsed
        except Exception as e:
            parsed['nmap_xml_error'] = str(e)
    # try to detect nmap text
    nmap_text_parsed = parse_nmap_text(raw)
    if nmap_text_parsed:
        parsed['nmap_text'] = nmap_text_parsed
    # other tools
    what = parse_whatweb(raw)
    if what: parsed['whatweb'] = what
    ping = parse_ping(raw)
    if ping: parsed['ping'] = ping
    hping = parse_hping(raw)
    if hping: parsed['hping3'] = hping
    host = parse_host(raw)
    if host: parsed['dns'] = host
    # generic IoC extraction
    ips = list(set(re.findall(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b", raw)))
    domains = list(set(re.findall(r"\b([a-z0-9.-]+\.[a-z]{2,})\b", raw, re.I)))
    parsed['extracted'] = {'ips': ips, 'domains': domains}
    return parsed


def synthesize_findings(parsed: Dict[str, Any], domain: Optional[str]) -> Dict[str, Any]:
    findings: Dict[str, Any] = {}
    # whatweb
    if 'whatweb' in parsed:
        w = parsed['whatweb']
        findings['whatweb'] = {
            'raw': w,
            'finding': 'HTTP service fingerprinted (server/header/title present).',
            'risk': 'info',
            'possible_issues': ['server header may aid fingerprinting'],
            'recommended_tests': ['curl -I -L <site>', 'whatweb -v <site>']
        }
    # ping
    if 'ping' in parsed:
        p = parsed['ping']
        findings['ping'] = {
            'raw': p,
            'finding': 'ICMP response observed' if p.get('received',0) > 0 else 'ICMP filtered/blocked',
            'risk': 'info',
            'recommended_tests': ['Use TCP-based checks (hping3/nmap)']
        }
    # hping3
    if 'hping3' in parsed:
        h = parsed['hping3']
        findings['hping3_syn'] = {
            'raw': h,
            'finding': 'TCP SYN probes elicit responses' if h.get('packets_received',0) > 0 else 'No TCP SYN responses',
            'risk': 'info',
            'recommended_tests': ['nmap -sV -p <ports> <host>']
        }
    # dns
    if 'dns' in parsed:
        d = parsed['dns']
        findings['dns_records'] = {
            'raw': d,
            'finding': 'A and MX records present',
            'risk': 'low',
            'recommended_tests': ['dig TXT <domain> (SPF/DKIM/DMARC)']
        }
    # nmap
    if 'nmap_xml' in parsed:
        findings['nmap_basic_scan'] = {'raw': parsed['nmap_xml'], 'finding': 'Nmap XML parsed', 'risk': 'info', 'recommended_tests': ['nmap -sV ...']}
    elif 'nmap_text' in parsed:
        findings['nmap_basic_scan'] = {'raw': parsed['nmap_text'], 'finding': 'Nmap text parsed', 'risk': 'info', 'recommended_tests': ['nmap -sV ...']}
    # open ports
    ports_list = []
    if 'nmap_xml' in parsed:
        for h in parsed['nmap_xml'].get('hosts', []):
            for p in h.get('ports', []):
                ports_list.append({'port': p.get('port'), 'proto': p.get('proto'), 'state': p.get('state'), 'service': p.get('service')})
    elif 'nmap_text' in parsed:
        for p in parsed['nmap_text'].get('ports', []):
            ports_list.append(p)
    if ports_list:
        findings['open_ports'] = {'raw': ports_list, 'finding': f'{len(ports_list)} open ports detected', 'risk': 'medium', 'recommended_tests': []}
        # add per-port guidance
        for p in ports_list:
            pr = int(p.get('port'))
            if pr == 22:
                findings['open_ports']['recommended_tests'].append('nmap -sV --script=banner,ssh-hostkey -p22 <host>')
            if pr in (80, 443):
                findings['open_ports']['recommended_tests'].append('nmap --script ssl-enum-ciphers -p443 <host>')
            if pr == 3000:
                findings['open_ports']['recommended_tests'].append('curl -I http://<host>:3000')
    overall = {
        'summary': 'Parsed available scan outputs; run version detection and TLS checks to escalate severity.',
        'next_steps_safe_scans': [
            'nmap -sV -Pn -p22,80,443,3000 --script=banner,ssl-enum-ciphers,http-methods -oA webnox_service_scan <host>',
            'testssl.sh <host>'
        ],
        'important_notes': ['Do not run intrusive scans without authorization']
    }
    return findings, overall


def main():
    ap = argparse.ArgumentParser(description='Dynamic network scan text -> JSON findings')
    ap.add_argument('--input', '-i', nargs='*', default=[], help='input text file(s)')
    ap.add_argument('--stdin', action='store_true', help='read from stdin')
    ap.add_argument('--nmap-xml', help='optional nmap XML file for best parsing accuracy')
    ap.add_argument('--domain', '-d', help='optional domain for report')
    ap.add_argument('--output', '-o', help='output JSON file (if omitted, print to stdout)')
    args = ap.parse_args()

    # If --nmap-xml is provided, we don't need --input or --stdin
    # Only require --input or --stdin if --nmap-xml is not provided
    if not args.nmap_xml:
        if not args.input and not args.stdin:
            print('Error: provide --input files or --stdin', file=sys.stderr)
            sys.exit(2)
        raw = read_inputs(args.input, args.stdin)
    else:
        # If only --nmap-xml is provided, use empty raw input
        raw = ''
    
    parsed = run_parsers(raw, args.nmap_xml)
    findings, overall = synthesize_findings(parsed, args.domain)
    report = {
        'domain': args.domain or (parsed.get('extracted', {}).get('domains', [None])[0]),
        'ip_address': None,
        'parsed': parsed,
        'findings': findings,
        'overall_recommendation': overall
    }
    # fill ip_address heuristically
    if 'nmap_xml' in parsed:
        hosts = parsed['nmap_xml'].get('hosts', [])
        if hosts and hosts[0].get('ip'):
            report['ip_address'] = hosts[0].get('ip')
    elif 'nmap_text' in parsed:
        report['ip_address'] = parsed['nmap_text'].get('ip')
    elif parsed.get('extracted', {}).get('ips'):
        report['ip_address'] = parsed['extracted']['ips'][0]

    out_json = json.dumps(report, indent=2)
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as fh:
            fh.write(out_json)
        print(f'Wrote JSON report to {args.output}', file=sys.stderr)
    else:
        print(out_json)


if __name__ == '__main__':
    main()
