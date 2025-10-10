#!/usr/bin/env bash
set -euo pipefail

# Example WSL bootstrap for malware tools (run inside WSL)
# - Installs clamav and yara
# - Creates rules folder at /opt/maldef/rules
# - Places a sample YARA rule

sudo apt update -y
sudo apt install -y clamav clamav-daemon yara

sudo mkdir -p /opt/maldef/rules
sudo mkdir -p /opt/maldef/scans

sudo tee /opt/maldef/rules/sample_web_malware.yar >/dev/null <<'YARA'
rule SuspiciousWebContent {
  strings:
    $eval = /eval\s*\(/ nocase
    $b64  = /base64_decode|atob\s*\(/ nocase
    $hack = /hacked by|defaced by|owned by/ nocase
  condition:
    any of them
}
YARA

echo "WSL malware tools setup complete. Rules in /opt/maldef/rules"

#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root: sudo $0" >&2
  exit 1
fi

echo "[+] Updating apt..."
apt-get update -y

echo "[+] Installing prerequisites..."
apt-get install -y curl wget git jq build-essential python3 python3-pip libgtk-3-0 libnss3 libxss1 libasound2 libxcb1

echo "[+] Installing malware tooling (yara, clamav)..."
apt-get install -y yara clamav clamav-daemon

echo "[+] Updating ClamAV DB (this may take time)..."
freshclam || true

echo "[+] Creating directories..."
mkdir -p /opt/maldef/baseline /opt/maldef/rules /opt/maldef/scans

echo "[+] Adding sample YARA rule..."
cat >/opt/maldef/rules/sample_web_malware.yar <<'YARA'
rule SuspiciousWebScript {
  meta:
    description = "Detects suspicious web script patterns (eval/base64)"
    author = "Cyberix"
    severity = "medium"
  strings:
    $eval = /eval\s*\(/ nocase
    $newfunc = /new\s+Function\s*\(/ nocase
    $b64 = /[A-Za-z0-9+/]{200,}={0,2}/
  condition:
    any of ($eval, $newfunc) or ($b64)
}
YARA

echo "[+] Done. You can run YARA like: yara -r /opt/maldef/rules/sample_web_malware.yar /opt/maldef/scans"


