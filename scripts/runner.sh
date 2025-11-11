#!/bin/bash
# Secure WSL Root Command Runner
# This script processes structured JSON commands safely
# Usage: echo '{"action":"install","package":"nmap"}' | ./runner.sh

set -euo pipefail

# Security: Only allow specific actions
ALLOWED_ACTIONS=(
    "install"
    "update"
    "check"
    "status"
    "info"
    "list"
    "version"
)

# Security: Only allow specific packages
ALLOWED_PACKAGES=(
    "nmap"
    "nikto"
    "sqlmap"
    "hydra"
    "gobuster"
    "dirb"
    "theharvester"
    "amass"
    "john"
    "medusa"
    "metasploit-framework"
    "zaproxy"
    "mitmproxy"
    "socat"
    "netcat-openbsd"
    "fail2ban"
    "ffuf"
    "nuclei"
    "dalfox"
    "curl"
    "wget"
    "jq"
    "git"
    "openssl"
    "golang"
    "whatweb"
)

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >&2
}

# Error function
error() {
    log "ERROR: $1"
    exit 1
}

# Validate action
validate_action() {
    local action="$1"
    for allowed in "${ALLOWED_ACTIONS[@]}"; do
        if [[ "$action" == "$allowed" ]]; then
            return 0
        fi
    done
    error "Action '$action' is not allowed. Allowed actions: ${ALLOWED_ACTIONS[*]}"
}

# Validate package
validate_package() {
    local package="$1"
    for allowed in "${ALLOWED_PACKAGES[@]}"; do
        if [[ "$package" == "$allowed" ]]; then
            return 0
        fi
    done
    error "Package '$package' is not allowed. Allowed packages: ${ALLOWED_PACKAGES[*]}"
}

# Install package
install_package() {
    local package="$1"
    log "Installing package: $package"
    
    case "$package" in
        "golang")
            apt-get update && apt-get install -y golang
            ;;
        "ffuf"|"nuclei"|"dalfox")
            # Go-based tools
            if ! command -v go &> /dev/null; then
                apt-get update && apt-get install -y golang
            fi
            case "$package" in
                "ffuf")
                    go install github.com/ffuf/ffuf@latest
                    ;;
                "nuclei")
                    go install github.com/projectdiscovery/nuclei/v2/cmd/nuclei@latest
                    ;;
                "dalfox")
                    go install github.com/hahwul/dalfox/v2@latest
                    ;;
            esac
            ;;
        *)
            # Standard apt packages
            apt-get update && apt-get install -y "$package"
            ;;
    esac
    
    log "Package $package installed successfully"
}

# Update package
update_package() {
    local package="$1"
    log "Updating package: $package"
    
    if [[ "$package" == "all" ]]; then
        apt-get update && apt-get upgrade -y
        log "All packages updated successfully"
    else
        apt-get update && apt-get upgrade -y "$package"
        log "Package $package updated successfully"
    fi
}

# Check package status
check_package() {
    local package="$1"
    log "Checking package: $package"
    
    if command -v "$package" &> /dev/null; then
        local version
        case "$package" in
            "nmap")
                version=$(nmap --version 2>&1 | head -n1)
                ;;
            "nikto")
                version=$(nikto -Version 2>&1 | head -n1)
                ;;
            "sqlmap")
                version=$(sqlmap --version 2>&1 | head -n1)
                ;;
            "hydra")
                version=$(hydra -h 2>&1 | head -n1)
                ;;
            "gobuster")
                version=$(gobuster version 2>&1 | head -n1)
                ;;
            "dirb")
                version=$(dirb -h 2>&1 | head -n1)
                ;;
            "theharvester")
                version=$(theHarvester -h 2>&1 | head -n1)
                ;;
            "amass")
                version=$(amass version 2>&1 | head -n1)
                ;;
            "john")
                version=$(john --version 2>&1 | head -n1)
                ;;
            "medusa")
                version=$(medusa -h 2>&1 | head -n1)
                ;;
            "metasploit-framework")
                version=$(msfconsole --version 2>&1 | head -n1)
                ;;
            "zaproxy")
                version=$(zap.sh -v 2>&1 | head -n1)
                ;;
            "mitmproxy")
                version=$(mitmproxy --version 2>&1 | head -n1)
                ;;
            "socat")
                version=$(socat -V 2>&1 | head -n1)
                ;;
            "netcat-openbsd")
                version=$(nc -h 2>&1 | head -n1)
                ;;
            "fail2ban")
                version=$(fail2ban-client -V 2>&1 | head -n1)
                ;;
            "ffuf")
                version=$(ffuf -V 2>&1 | head -n1)
                ;;
            "nuclei")
                version=$(nuclei -version 2>&1 | head -n1)
                ;;
            "dalfox")
                version=$(dalfox -version 2>&1 | head -n1)
                ;;
            *)
                version="installed"
                ;;
        esac
        echo "{\"status\":\"installed\",\"package\":\"$package\",\"version\":\"$version\"}"
    else
        echo "{\"status\":\"not_installed\",\"package\":\"$package\"}"
    fi
}

# Get system status
get_status() {
    log "Getting system status"
    
    local uptime=$(uptime -p)
    local memory=$(free -h | grep Mem | awk '{print $3 "/" $2}')
    local disk=$(df -h / | tail -1 | awk '{print $3 "/" $2 " (" $5 ")"}')
    local packages=$(dpkg -l | wc -l)
    
    cat << EOF
{
    "uptime": "$uptime",
    "memory": "$memory",
    "disk": "$disk",
    "packages": $packages,
    "user": "$(whoami)",
    "distro": "$(lsb_release -d | cut -f2)"
}
EOF
}

# List installed packages
list_packages() {
    log "Listing installed security packages"
    
    local installed=()
    for package in "${ALLOWED_PACKAGES[@]}"; do
        if command -v "$package" &> /dev/null; then
            installed+=("$package")
        fi
    done
    
    echo "{\"installed_packages\":[$(printf '"%s",' "${installed[@]}" | sed 's/,$//')]}"
}

# Get version info
get_version() {
    log "Getting version information"
    
    cat << EOF
{
    "runner_version": "1.0.0",
    "bash_version": "$(bash --version | head -n1)",
    "os": "$(lsb_release -d | cut -f2)",
    "kernel": "$(uname -r)"
}
EOF
}

# Main execution
main() {
    log "Starting secure command runner"
    
    # Read JSON from stdin
    local json_input
    if ! json_input=$(cat); then
        error "Failed to read input"
    fi
    
    # Parse JSON (basic validation)
    if ! echo "$json_input" | jq . > /dev/null 2>&1; then
        error "Invalid JSON input"
    fi
    
    local action
    local package
    local target
    
    action=$(echo "$json_input" | jq -r '.action // empty')
    package=$(echo "$json_input" | jq -r '.package // empty')
    target=$(echo "$json_input" | jq -r '.target // empty')
    
    if [[ -z "$action" ]]; then
        error "Missing required field: action"
    fi
    
    # Validate action
    validate_action "$action"
    
    # Execute based on action
    case "$action" in
        "install")
            if [[ -z "$package" ]]; then
                error "Missing required field: package"
            fi
            validate_package "$package"
            install_package "$package"
            ;;
        "update")
            if [[ -z "$package" ]]; then
                package="all"
            else
                validate_package "$package"
            fi
            update_package "$package"
            ;;
        "check")
            if [[ -z "$package" ]]; then
                error "Missing required field: package"
            fi
            validate_package "$package"
            check_package "$package"
            ;;
        "status")
            get_status
            ;;
        "list")
            list_packages
            ;;
        "info"|"version")
            get_version
            ;;
        *)
            error "Unknown action: $action"
            ;;
    esac
    
    log "Command completed successfully"
}

# Run main function
main "$@"
