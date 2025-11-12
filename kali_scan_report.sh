#!/usr/bin/env bash

set -euo pipefail

# Sync WSL time with Windows if running in WSL
if [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
  # We're in WSL - sync time with Windows first
  sudo hwclock -s 2>/dev/null || true
fi
# Usage: sudo ./kali_scan_report.sh <target>
# Use the user provided site url in this target.
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <hostname-or-ip>"
  exit 2
fi

# Temporary directory for storing outputs
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Track background process PIDs for cleanup
declare -a BG_PIDS=()

# Helper function to get timestamp for logs
# After syncing with Windows, use standard date command
get_timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

# Signal handler for cleanup on interrupt
cleanup_on_interrupt() {
  echo "[$(get_timestamp)] >>> Cleaning up and stopping all processes..." >&2
  # Kill all background processes
  for pid in "${BG_PIDS[@]}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Force kill if still running after 2 seconds
      ( sleep 2 && kill -9 "$pid" 2>/dev/null || true ) &
    fi
  done
  # Kill any remaining nmap processes
  pkill -f "nmap.*$TARGET" 2>/dev/null || true
  pkill -9 -f "nmap.*$TARGET" 2>/dev/null || true
  exit 130
}

# Set up signal handlers for interrupts only (not normal EXIT)
trap cleanup_on_interrupt SIGTERM SIGINT
report_json_file="$TMPDIR/report.json"
declare -A raw_files parsed_files

# -------------------------------
# Helper: Run command & capture output
# -------------------------------
run_and_capture() {
  local id="$1"
  local use_timeout="$2"  # "timeout" or "no_timeout"
  local timeout_val="$3"  # Timeout value if use_timeout is "timeout"
  shift 3 || shift 2  # Remove args, handle case where timeout_val might not be provided
  
  local cmd=( "$@" )
  local raw="$TMPDIR/${id}.raw"
  local parsed="$TMPDIR/${id}.json"
  echo "[$(get_timestamp)] >>> Running: ${cmd[*]}" >&2
  
  # Run command with or without timeout
  set +e
  if [ "$use_timeout" = "timeout" ]; then
    # Run with timeout (for nmap commands only)
    if timeout -k 5 "$timeout_val" bash -c "${cmd[*]}" >"$raw" 2>&1; then
      echo "[$(get_timestamp)] >>> ${id} completed" >&2
    else
      local exit_code=$?
      if [ $exit_code -eq 124 ] || [ $exit_code -eq 137 ]; then
        echo "[$(get_timestamp)] >>> ${id} timed out after ${timeout_val} seconds (stopped)" >&2
        echo "Note: Command timed out after ${timeout_val} seconds" >> "$raw"
      else
        echo "[$(get_timestamp)] >>> ${id} finished with non-zero exit (check raw output)" >&2
      fi
    fi
  else
    # Run without timeout (for DNS, WhatWeb, Ping, Hping3)
    if "${cmd[@]}" >"$raw" 2>&1; then
      echo "[$(get_timestamp)] >>> ${id} completed" >&2
    else
      echo "[$(get_timestamp)] >>> ${id} finished with non-zero exit (check raw output)" >&2
    fi
  fi
  set -e
  raw_files["$id"]="$raw"
  case "$id" in
    dns)
      python3 - <<PY >"$parsed"
import json, re
txt = open("$raw","r",errors="ignore").read()
out = {"text": txt}
m = re.search(r'([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', txt)
if m: out["first_ip"] = m.group(1)
print(json.dumps(out))
PY
      ;;
    ping|hping)
      python3 - <<PY >"$parsed"
import json, re
txt = open("$raw",'r',errors='ignore').read()
o = {"text": txt}
m = re.search(r'(\d+)% packet loss', txt)
if m: o["packet_loss"] = int(m.group(1))
print(json.dumps(o))
PY
      ;;
    nmap_sn|nmap_fast|nmap_full)
      if command -v jc >/dev/null 2>&1; then
        jc --xml < "$raw" > "$parsed" 2>/dev/null || echo '{"error":"jc failed"}' > "$parsed"
      else
        echo '{"error":"jc not installed"}' > "$parsed"
      fi
      ;;
    whatweb|host|nslookup)
      python3 - <<PY >"$parsed"
import json
txt = open("$raw",'r',errors='ignore').read()
print(json.dumps({"text": txt}))
PY
      ;;
    *)
      python3 - <<PY >"$parsed"
import json
txt = open("$raw",'r',errors='ignore').read()
print(json.dumps({"text": txt}))
PY
      ;;
  esac
  parsed_files["$id"]="$parsed"
}

# -------------------------------
# Run Scans - Sequential Execution (One by One)
# -------------------------------
# 1. DNS Resolution (no timeout)
echo "[$(get_timestamp)] >>> [1/7] Running DNS resolution..." >&2
run_and_capture "dns" "no_timeout" host "$TARGET"

# 2. WhatWeb Scan (no timeout)
echo "[$(get_timestamp)] >>> [2/7] Running WhatWeb scan..." >&2
run_and_capture "whatweb" "no_timeout" whatweb "$TARGET"

# 3. Ping Test (no timeout)
echo "[$(get_timestamp)] >>> [3/7] Running Ping test..." >&2
run_and_capture "ping" "no_timeout" ping -c 4 "$TARGET"

# 4. Hping3 Scan (if available, no timeout)
if command -v hping3 >/dev/null 2>&1; then
  echo "[$(get_timestamp)] >>> [4/7] Running Hping3 scan..." >&2
  run_and_capture "hping" "no_timeout" hping3 -S "$TARGET" -p 80 -c 3
else
  echo "[$(get_timestamp)] >>> [4/7] Hping3 not found; skipping hping step" >&2
fi

# 5. Nmap Host Discovery (5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [5/7] Running Nmap host discovery (5 minute timeout)..." >&2
set +e
# Use timeout command directly to avoid variable expansion issues
# Escape the command properly to avoid syntax errors
timeout -k 10 300 bash -c "sudo nmap -sn -Pn -n -T4 -oX - \"${TARGET}\"" >"$TMPDIR/nmap_sn.raw" 2>&1
EXIT_CODE=$?
set -e

# Check exit code - 124 = timeout, 137 = killed (SIGKILL)
if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(get_timestamp)] >>> nmap_sn completed" >&2
elif [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ]; then
  echo "[$(get_timestamp)] >>> nmap_sn timed out after 5 minutes (stopped)" >&2
  echo "Note: nmap -sn scan was stopped after 5 minute timeout" >> "$TMPDIR/nmap_sn.raw"
else
  echo "[$(get_timestamp)] >>> nmap_sn finished with exit code $EXIT_CODE" >&2
fi
raw_files["nmap_sn"]="$TMPDIR/nmap_sn.raw"
if command -v jc >/dev/null 2>&1; then
  jc --xml < "$TMPDIR/nmap_sn.raw" > "$TMPDIR/nmap_sn.json" 2>/dev/null || echo '{"error":"jc failed"}' > "$TMPDIR/nmap_sn.json"
else
  echo '{"error":"jc not installed"}' > "$TMPDIR/nmap_sn.json"
fi
parsed_files["nmap_sn"]="$TMPDIR/nmap_sn.json"

# 6. Nmap Fast Scan (Top 100 ports - 5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [6/7] Running Nmap fast scan (top 100 ports, 5 minute timeout)..." >&2
run_and_capture "nmap_fast" "timeout" 300 sudo nmap -T4 -Pn -F -oX - "$TARGET"

# 7. Nmap Full Scan (All ports - runs in background, non-blocking, 5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [7/7] Starting Nmap full scan in background (all 65535 ports, 5 minute timeout)..." >&2
( run_and_capture "nmap_full" "timeout" 300 sudo nmap -Pn -p1-65535 -sS -sV -T4 -oX - "$TARGET" ) &
NMAP_FULL_PID=$!
BG_PIDS+=("$NMAP_FULL_PID")

# Generate report immediately (don't wait for full scan)
# The full scan results will be included if they complete before report generation
# -------------------------------
# Create Combined JSON Report
# -------------------------------
python3 - <<PY >"$report_json_file"
import json, os, time
from glob import glob

def loadf(p):
    try: return open(p,'r',errors='ignore').read()
    except: return None

report = {"target": "$TARGET", "scans": {}, "summary": {}}

for pf in glob("$TMPDIR/*.json"):
    name = os.path.basename(pf).rsplit('.',1)[0]
    try:
        report["scans"][name] = json.loads(open(pf,'r',errors='ignore').read())
    except Exception as e:
        report["scans"][name] = {"_raw": loadf(pf), "_parse_error": str(e)}

for rf in glob("$TMPDIR/*.raw"):
    name = os.path.basename(rf).rsplit('.',1)[0]
    if name in report["scans"]:
        report["scans"][name]["_raw_text"] = loadf(rf)
    else:
        report["scans"][name] = {"_raw_text": loadf(rf)}

report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# Build a small summary if nmap_fast/nmap_full parsed data present
if "nmap_fast" in report["scans"]:
    try:
        nf = report["scans"]["nmap_fast"]
        ports = []
        if isinstance(nf, dict):
            host = nf.get("nmaprun", {}).get("host", {})
            port_entries = []
            if isinstance(host, dict):
                ports_section = host.get("ports")
                if ports_section and "port" in ports_section:
                    port_entries = ports_section["port"]
            if isinstance(port_entries, list):
                for p in port_entries:
                    pi = {"port": p.get("@portid"), "proto": p.get("@protocol"), "state": p.get("state",{}).get("@state")}
                    svc = p.get("service")
                    if svc:
                        pi["service"] = svc.get("@name")
                    ports.append(pi)
            report["summary"]["quick_ports"] = ports
    except Exception:
        pass

print(json.dumps(report, indent=2))
PY

# Print combined JSON to stdout (console)
cat "$report_json_file"

#!/usr/bin/env bash

set -euo pipefail

# Sync WSL time with Windows if running in WSL
if [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
  # We're in WSL - sync time with Windows first
  sudo hwclock -s 2>/dev/null || true
fi
# Usage: sudo ./kali_scan_report.sh <target>
# Use the user provided site url in this target.
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage: $0 <hostname-or-ip>"
  exit 2
fi

# Temporary directory for storing outputs
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# Track background process PIDs for cleanup
declare -a BG_PIDS=()

# Helper function to get timestamp for logs
# After syncing with Windows, use standard date command
get_timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

# Signal handler for cleanup on interrupt
cleanup_on_interrupt() {
  echo "[$(get_timestamp)] >>> Cleaning up and stopping all processes..." >&2
  # Kill all background processes
  for pid in "${BG_PIDS[@]}"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Force kill if still running after 2 seconds
      ( sleep 2 && kill -9 "$pid" 2>/dev/null || true ) &
    fi
  done
  # Kill any remaining nmap processes
  pkill -f "nmap.*$TARGET" 2>/dev/null || true
  pkill -9 -f "nmap.*$TARGET" 2>/dev/null || true
  exit 130
}

# Set up signal handlers for interrupts only (not normal EXIT)
trap cleanup_on_interrupt SIGTERM SIGINT
report_json_file="$TMPDIR/report.json"
declare -A raw_files parsed_files

# -------------------------------
# Helper: Run command & capture output
# -------------------------------
run_and_capture() {
  local id="$1"
  local use_timeout="$2"  # "timeout" or "no_timeout"
  local timeout_val="$3"  # Timeout value if use_timeout is "timeout"
  shift 3 || shift 2  # Remove args, handle case where timeout_val might not be provided
  
  local cmd=( "$@" )
  local raw="$TMPDIR/${id}.raw"
  local parsed="$TMPDIR/${id}.json"
  echo "[$(get_timestamp)] >>> Running: ${cmd[*]}" >&2
  
  # Run command with or without timeout
  set +e
  if [ "$use_timeout" = "timeout" ]; then
    # Run with timeout (for nmap commands only)
    if timeout -k 5 "$timeout_val" bash -c "${cmd[*]}" >"$raw" 2>&1; then
      echo "[$(get_timestamp)] >>> ${id} completed" >&2
    else
      local exit_code=$?
      if [ $exit_code -eq 124 ] || [ $exit_code -eq 137 ]; then
        echo "[$(get_timestamp)] >>> ${id} timed out after ${timeout_val} seconds (stopped)" >&2
        echo "Note: Command timed out after ${timeout_val} seconds" >> "$raw"
      else
        echo "[$(get_timestamp)] >>> ${id} finished with non-zero exit (check raw output)" >&2
      fi
    fi
  else
    # Run without timeout (for DNS, WhatWeb, Ping, Hping3)
    if "${cmd[@]}" >"$raw" 2>&1; then
      echo "[$(get_timestamp)] >>> ${id} completed" >&2
    else
      echo "[$(get_timestamp)] >>> ${id} finished with non-zero exit (check raw output)" >&2
    fi
  fi
  set -e
  raw_files["$id"]="$raw"
  case "$id" in
    dns)
      python3 - <<PY >"$parsed"
import json, re
txt = open("$raw","r",errors="ignore").read()
out = {"text": txt}
m = re.search(r'([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)', txt)
if m: out["first_ip"] = m.group(1)
print(json.dumps(out))
PY
      ;;
    ping|hping)
      python3 - <<PY >"$parsed"
import json, re
txt = open("$raw",'r',errors='ignore').read()
o = {"text": txt}
m = re.search(r'(\d+)% packet loss', txt)
if m: o["packet_loss"] = int(m.group(1))
print(json.dumps(o))
PY
      ;;
    nmap_sn|nmap_fast|nmap_full)
      if command -v jc >/dev/null 2>&1; then
        jc --xml < "$raw" > "$parsed" 2>/dev/null || echo '{"error":"jc failed"}' > "$parsed"
      else
        echo '{"error":"jc not installed"}' > "$parsed"
      fi
      ;;
    whatweb|host|nslookup)
      python3 - <<PY >"$parsed"
import json
txt = open("$raw",'r',errors='ignore').read()
print(json.dumps({"text": txt}))
PY
      ;;
    *)
      python3 - <<PY >"$parsed"
import json
txt = open("$raw",'r',errors='ignore').read()
print(json.dumps({"text": txt}))
PY
      ;;
  esac
  parsed_files["$id"]="$parsed"
}

# -------------------------------
# Run Scans - Sequential Execution (One by One)
# -------------------------------
# 1. DNS Resolution (no timeout)
echo "[$(get_timestamp)] >>> [1/7] Running DNS resolution..." >&2
run_and_capture "dns" "no_timeout" host "$TARGET"

# 2. WhatWeb Scan (no timeout)
echo "[$(get_timestamp)] >>> [2/7] Running WhatWeb scan..." >&2
run_and_capture "whatweb" "no_timeout" whatweb "$TARGET"

# 3. Ping Test (no timeout)
echo "[$(get_timestamp)] >>> [3/7] Running Ping test..." >&2
run_and_capture "ping" "no_timeout" ping -c 4 "$TARGET"

# 4. Hping3 Scan (if available, no timeout)
if command -v hping3 >/dev/null 2>&1; then
  echo "[$(get_timestamp)] >>> [4/7] Running Hping3 scan..." >&2
  run_and_capture "hping" "no_timeout" hping3 -S "$TARGET" -p 80 -c 3
else
  echo "[$(get_timestamp)] >>> [4/7] Hping3 not found; skipping hping step" >&2
fi

# 5. Nmap Host Discovery (5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [5/7] Running Nmap host discovery (5 minute timeout)..." >&2
set +e
# Use timeout command directly to avoid variable expansion issues
# Escape the command properly to avoid syntax errors
timeout -k 10 300 bash -c "sudo nmap -sn -Pn -n -T4 -oX - \"${TARGET}\"" >"$TMPDIR/nmap_sn.raw" 2>&1
EXIT_CODE=$?
set -e

# Check exit code - 124 = timeout, 137 = killed (SIGKILL)
if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(get_timestamp)] >>> nmap_sn completed" >&2
elif [ $EXIT_CODE -eq 124 ] || [ $EXIT_CODE -eq 137 ]; then
  echo "[$(get_timestamp)] >>> nmap_sn timed out after 5 minutes (stopped)" >&2
  echo "Note: nmap -sn scan was stopped after 5 minute timeout" >> "$TMPDIR/nmap_sn.raw"
else
  echo "[$(get_timestamp)] >>> nmap_sn finished with exit code $EXIT_CODE" >&2
fi
raw_files["nmap_sn"]="$TMPDIR/nmap_sn.raw"
if command -v jc >/dev/null 2>&1; then
  jc --xml < "$TMPDIR/nmap_sn.raw" > "$TMPDIR/nmap_sn.json" 2>/dev/null || echo '{"error":"jc failed"}' > "$TMPDIR/nmap_sn.json"
else
  echo '{"error":"jc not installed"}' > "$TMPDIR/nmap_sn.json"
fi
parsed_files["nmap_sn"]="$TMPDIR/nmap_sn.json"

# 6. Nmap Fast Scan (Top 100 ports - 5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [6/7] Running Nmap fast scan (top 100 ports, 5 minute timeout)..." >&2
run_and_capture "nmap_fast" "timeout" 300 sudo nmap -T4 -Pn -F -oX - "$TARGET"

# 7. Nmap Full Scan (All ports - runs in background, non-blocking, 5 minute timeout = 300 seconds)
echo "[$(get_timestamp)] >>> [7/7] Starting Nmap full scan in background (all 65535 ports, 5 minute timeout)..." >&2
( run_and_capture "nmap_full" "timeout" 300 sudo nmap -Pn -p1-65535 -sS -sV -T4 -oX - "$TARGET" ) &
NMAP_FULL_PID=$!
BG_PIDS+=("$NMAP_FULL_PID")

# Generate report immediately (don't wait for full scan)
# The full scan results will be included if they complete before report generation
# -------------------------------
# Create Combined JSON Report
# -------------------------------
python3 - <<PY >"$report_json_file"
import json, os, time
from glob import glob

def loadf(p):
    try: return open(p,'r',errors='ignore').read()
    except: return None

report = {"target": "$TARGET", "scans": {}, "summary": {}}

for pf in glob("$TMPDIR/*.json"):
    name = os.path.basename(pf).rsplit('.',1)[0]
    try:
        report["scans"][name] = json.loads(open(pf,'r',errors='ignore').read())
    except Exception as e:
        report["scans"][name] = {"_raw": loadf(pf), "_parse_error": str(e)}

for rf in glob("$TMPDIR/*.raw"):
    name = os.path.basename(rf).rsplit('.',1)[0]
    if name in report["scans"]:
        report["scans"][name]["_raw_text"] = loadf(rf)
    else:
        report["scans"][name] = {"_raw_text": loadf(rf)}

report["generated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

# Build a small summary if nmap_fast/nmap_full parsed data present
if "nmap_fast" in report["scans"]:
    try:
        nf = report["scans"]["nmap_fast"]
        ports = []
        if isinstance(nf, dict):
            host = nf.get("nmaprun", {}).get("host", {})
            port_entries = []
            if isinstance(host, dict):
                ports_section = host.get("ports")
                if ports_section and "port" in ports_section:
                    port_entries = ports_section["port"]
            if isinstance(port_entries, list):
                for p in port_entries:
                    pi = {"port": p.get("@portid"), "proto": p.get("@protocol"), "state": p.get("state",{}).get("@state")}
                    svc = p.get("service")
                    if svc:
                        pi["service"] = svc.get("@name")
                    ports.append(pi)
            report["summary"]["quick_ports"] = ports
    except Exception:
        pass

print(json.dumps(report, indent=2))
PY

# Print combined JSON to stdout (console)
cat "$report_json_file"
