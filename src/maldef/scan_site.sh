<<<<<<< HEAD
#!/usr/bin/env bash
set -euo pipefail

# Usage: scan_site.sh <URL> <OUT_DIR>
URL="${1:-}"
OUTDIR="${2:-/opt/maldef/scans/site}"
mkdir -p "$OUTDIR"

if [[ -z "$URL" ]]; then
  echo '{"error":"missing_url"}'
  exit 0
fi

# Inputs are sanitized by caller; best-effort avoid subshell injection
SANITIZED_URL=$(printf '%s' "$URL" | tr -dc '[:alnum:].,/:?&=%_#-')

# Run ClamAV and YARA against OUTDIR; assuming caller synced files to OUTDIR
CLAM_OUT="$OUTDIR/clamav.txt"
YARA_OUT="$OUTDIR/yara.txt"

clamscan -r --bell -i "$OUTDIR" > "$CLAM_OUT" 2>&1 || true
if command -v yara >/dev/null 2>&1; then
  yara -r /opt/maldef/rules/sample_web_malware.yar "$OUTDIR" > "$YARA_OUT" 2>&1 || true
else
  echo "yara_not_installed" > "$YARA_OUT"
fi

# Basic parse
INFECTED=$(grep -E 'Infected files:' "$CLAM_OUT" | awk -F':' '{print $2}' | xargs || echo 0)
INFILES=$(grep -E 'FOUND$' "$CLAM_OUT" | sed 's/\r$//' | sed 's/"/\\"/g')
YARALINES=$(cat "$YARA_OUT" | sed 's/\r$//' | sed 's/"/\\"/g')

cat <<JSON
{
  "url": "$SANITIZED_URL",
  "outDir": "$OUTDIR",
  "clamav": {
    "infectedCount": ${INFECTED:-0},
    "raw": "${INFILES}" 
  },
  "yara": {
    "raw": "${YARALINES}"
  }
}
JSON

exit 0


=======
#!/usr/bin/env bash
set -euo pipefail

# Usage: scan_site.sh <URL> <OUT_DIR>
URL="${1:-}"
OUTDIR="${2:-/opt/maldef/scans/site}"
mkdir -p "$OUTDIR"

if [[ -z "$URL" ]]; then
  echo '{"error":"missing_url"}'
  exit 0
fi

# Inputs are sanitized by caller; best-effort avoid subshell injection
SANITIZED_URL=$(printf '%s' "$URL" | tr -dc '[:alnum:].,/:?&=%_#-')

# Run ClamAV and YARA against OUTDIR; assuming caller synced files to OUTDIR
CLAM_OUT="$OUTDIR/clamav.txt"
YARA_OUT="$OUTDIR/yara.txt"

clamscan -r --bell -i "$OUTDIR" > "$CLAM_OUT" 2>&1 || true
if command -v yara >/dev/null 2>&1; then
  yara -r /opt/maldef/rules/sample_web_malware.yar "$OUTDIR" > "$YARA_OUT" 2>&1 || true
else
  echo "yara_not_installed" > "$YARA_OUT"
fi

# Basic parse
INFECTED=$(grep -E 'Infected files:' "$CLAM_OUT" | awk -F':' '{print $2}' | xargs || echo 0)
INFILES=$(grep -E 'FOUND$' "$CLAM_OUT" | sed 's/\r$//' | sed 's/"/\\"/g')
YARALINES=$(cat "$YARA_OUT" | sed 's/\r$//' | sed 's/"/\\"/g')

cat <<JSON
{
  "url": "$SANITIZED_URL",
  "outDir": "$OUTDIR",
  "clamav": {
    "infectedCount": ${INFECTED:-0},
    "raw": "${INFILES}" 
  },
  "yara": {
    "raw": "${YARALINES}"
  }
}
JSON

exit 0


>>>>>>> 331ec0e3c7b3fff536c041ed33509bd64d2e19d9
