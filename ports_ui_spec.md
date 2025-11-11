# Port Scanning & Service Enumeration UI Specification

## Overview
This document provides a detailed UI specification for the Port Scanning & Service Enumeration module within the Electron + WSL cybersecurity application. The UI should be clean, modern, and provide comprehensive information about discovered ports and services.

## Page Layout Structure

### Header Section
```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 Port Scanning & Service Enumeration                         │
│ Advanced port discovery and service enumeration                │
└─────────────────────────────────────────────────────────────────┘
```

### Main Content Areas
1. **Scan Configuration Panel** (Top)
2. **Scan Statistics Dashboard** (Middle)
3. **Ports Results Table** (Main Content)
4. **Evidence Management Panel** (Bottom)

## 1. Scan Configuration Panel

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ ⚙️ Scan Configuration                                           │
├─────────────────────────────────────────────────────────────────┤
│ Target: [192.168.1.100                    ] [Start Scan]       │
│                                                                 │
│ Scan Options:                                                   │
│ ☑️ Full Port Range (1-65535)  ☑️ Service Detection             │
│ ☑️ OS Detection               ☑️ Vulnerability Scripts         │
│ ☑️ Banner Grabbing            ☑️ SSL/TLS Analysis              │
│                                                                 │
│ Advanced Options:                                               │
│ Rate Limit: [1000] packets/sec  Timeout: [5] seconds           │
└─────────────────────────────────────────────────────────────────┘
```

### Components
- **Target Input**: Text field with validation for IP addresses and hostnames
- **Scan Options**: Checkboxes for different scan types
- **Advanced Options**: Collapsible section with rate limiting and timeout settings
- **Start Scan Button**: Primary action button with loading state

## 2. Scan Statistics Dashboard

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 Scan Statistics                                             │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │   15    │ │    3    │ │   12    │ │    8    │ │   95%   │   │
│ │  Open   │ │Critical │ │  High   │ │ Medium  │ │Confidence│   │
│ │ Ports   │ │  Risk   │ │  Risk   │ │  Risk   │ │         │   │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                 │
│ Progress: ████████████████████░░░░ 80% (2m 30s remaining)      │
└─────────────────────────────────────────────────────────────────┘
```

### Components
- **Port Count Cards**: Visual cards showing open ports, closed ports, filtered ports
- **Risk Level Cards**: Color-coded cards for Critical, High, Medium, Low risks
- **Confidence Meter**: Overall scan confidence percentage
- **Progress Bar**: Real-time scan progress with time estimation

## 3. Ports Results Table

### Table Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍 Port Scan Results                    [Export PDF] [Download] │
├─────────────────────────────────────────────────────────────────┤
│ Filters: [All ▼] [Open ▼] [Critical ▼] [High Confidence ▼]     │
├─────────────────────────────────────────────────────────────────┤
│ Port │Protocol│Service│Version      │Banner│Scripts│CVEs│Severity│
├─────────────────────────────────────────────────────────────────┤
│ 443  │  TCP   │ HTTPS │nginx/1.18.0 │[View]│  [3]  │[2] │  High  │
│ 80   │  TCP   │ HTTP  │Apache/2.4.41│[View]│  [2]  │[3] │  High  │
│ 22   │  TCP   │ SSH   │OpenSSH/8.2p1│[View]│  [1]  │[1] │ Medium │
│ 3306 │  TCP   │ MySQL │MySQL/8.0.25 │[View]│  [2]  │[2] │Critical│
│ 5432 │  TCP   │Postgres│Postgres/13.3│[View]│  [1]  │[2] │Critical│
│ 6379 │  TCP   │ Redis │Redis/6.2.6  │[View]│  [1]  │[2] │Critical│
└─────────────────────────────────────────────────────────────────┘
```

### Column Specifications

#### Port Column
- **Width**: 80px
- **Content**: Port number with colored background
- **Styling**: 
  - Critical ports (22, 3306, 5432, 6379): Red background
  - High-risk ports (80, 443): Orange background
  - Standard ports: Blue background

#### Protocol Column
- **Width**: 80px
- **Content**: TCP/UDP protocol
- **Styling**: Monospace font, uppercase

#### Service Column
- **Width**: 120px
- **Content**: Service name with icon
- **Icons**:
  - HTTP/HTTPS: 🌐
  - SSH: 🔐
  - Database: 🗄️
  - Redis: ⚡
  - Other: ⚙️

#### Version Column
- **Width**: 150px
- **Content**: Service version with product name
- **Styling**: Truncated with tooltip for full version

#### Banner Column
- **Width**: 100px
- **Content**: "[View]" button
- **Action**: Opens modal with banner content
- **Modal Content**:
  ```
  ┌─────────────────────────────────────────┐
  │ Banner Information - Port 443           │
  ├─────────────────────────────────────────┤
  │ HTTP/1.1 400 Bad Request                │
  │ Server: nginx/1.18.0                    │
  │ Date: Mon, 27 Sep 2025 10:00:00 GMT     │
  │ Content-Type: text/html                 │
  │                                         │
  │ [Copy] [Download] [Close]               │
  └─────────────────────────────────────────┘
  ```

#### Script Findings Column
- **Width**: 100px
- **Content**: "[X]" button showing count
- **Action**: Opens modal with script results
- **Modal Content**:
  ```
  ┌─────────────────────────────────────────┐
  │ Script Findings - Port 443              │
  ├─────────────────────────────────────────┤
  │ ssl-heartbleed: Not vulnerable          │
  │ ssl-enum-ciphers: Weak ciphers detected │
  │ ssl-cert: Certificate expires in 30 days│
  │                                         │
  │ [Copy All] [Download] [Close]           │
  └─────────────────────────────────────────┘
  ```

#### CVE Links Column
- **Width**: 100px
- **Content**: "[X]" button showing count
- **Action**: Opens modal with CVE information
- **Modal Content**:
  ```
  ┌─────────────────────────────────────────┐
  │ CVE Information - Port 443              │
  ├─────────────────────────────────────────┤
  │ CVE-2021-23017 (High)                   │
  │ Nginx vulnerability in HTTP/2           │
  │ [View Details] [Copy Link]              │
  │                                         │
  │ CVE-2021-3711 (Medium)                  │
  │ OpenSSL vulnerability                   │
  │ [View Details] [Copy Link]              │
  │                                         │
  │ [Copy All] [Close]                      │
  └─────────────────────────────────────────┘
  ```

#### Severity Column
- **Width**: 100px
- **Content**: Severity badge with color coding
- **Styling**:
  - Critical: Red badge with white text
  - High: Orange badge with white text
  - Medium: Yellow badge with black text
  - Low: Green badge with white text

### Row Actions
Each row should have a context menu with:
- **Verify Service**: Re-scan specific port
- **Grab Banner**: Show netcat command
- **Run TLS Check**: Show testssl.sh command
- **Directory Enumeration**: Show gobuster command
- **View Evidence**: Open evidence files
- **Export Row**: Export single port data

## 4. Evidence Management Panel

### Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ 📁 Evidence Files                                              │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ /tmp/masscan_ports.lst                    [View] [Download] │ │
│ │ /tmp/nmap_ports.xml                       [View] [Download] │ │
│ │ /tmp/port443_banner.txt                   [View] [Download] │ │
│ │ /tmp/port443_ssl.log                      [View] [Download] │ │
│ │ /tmp/port80_dirs.txt                      [View] [Download] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ [Download All] [Export to PDF] [Clear Evidence]                │
└─────────────────────────────────────────────────────────────────┘
```

### Components
- **File List**: Scrollable list of evidence files
- **File Actions**: View, Download buttons for each file
- **Bulk Actions**: Download all, Export to PDF, Clear evidence

## 5. Filter and Search Controls

### Filter Bar
```
┌─────────────────────────────────────────────────────────────────┐
│ Filters: [All Ports ▼] [All Services ▼] [All Severities ▼]     │
│ Search: [port, service, or version...                    ] 🔍   │
└─────────────────────────────────────────────────────────────────┘
```

### Filter Options
- **Port State**: All, Open, Closed, Filtered
- **Service Type**: All, HTTP, HTTPS, SSH, Database, Other
- **Severity**: All, Critical, High, Medium, Low
- **Confidence**: All, High (≥80%), Medium (50-79%), Low (<50%)

### Search Functionality
- **Search Fields**: Port number, service name, version, banner content
- **Real-time Search**: Filter results as user types
- **Search Highlighting**: Highlight matching text in results

## 6. Action Buttons and Commands

### Verify Service Action
```
┌─────────────────────────────────────────┐
│ Verify Service - Port 443               │
├─────────────────────────────────────────┤
│ Command to re-scan this port:           │
│                                         │
│ wsl nmap -sV -sC -p 443 192.168.1.100  │
│                                         │
│ [Copy Command] [Run Now] [Close]        │
└─────────────────────────────────────────┘
```

### Grab Banner Action
```
┌─────────────────────────────────────────┐
│ Grab Banner - Port 443                  │
├─────────────────────────────────────────┤
│ Command to grab banner:                 │
│                                         │
│ wsl nc -nv -w3 192.168.1.100 443       │
│                                         │
│ [Copy Command] [Run Now] [Close]        │
└─────────────────────────────────────────┘
```

### TLS Check Action
```
┌─────────────────────────────────────────┐
│ TLS Check - Port 443                    │
├─────────────────────────────────────────┤
│ Command to check SSL/TLS:               │
│                                         │
│ wsl /opt/testssl.sh/testssl.sh          │
│ --logfile /tmp/port443_ssl.log          │
│ 192.168.1.100:443                       │
│                                         │
│ [Copy Command] [Run Now] [Close]        │
└─────────────────────────────────────────┘
```

## 7. Responsive Design

### Desktop (≥1200px)
- Full table with all columns visible
- Side-by-side panels for configuration and results
- Large action buttons and clear typography

### Tablet (768px - 1199px)
- Collapsible columns in table
- Stacked panels
- Touch-friendly button sizes

### Mobile (<768px)
- Card-based layout instead of table
- Collapsible sections
- Swipe gestures for navigation
- Simplified action menus

## 8. Color Scheme and Theming

### Light Theme
- **Background**: #ffffff
- **Cards**: #f8f9fa
- **Borders**: #dee2e6
- **Text**: #212529
- **Critical**: #dc3545
- **High**: #fd7e14
- **Medium**: #ffc107
- **Low**: #28a745

### Dark Theme
- **Background**: #1a1a1a
- **Cards**: #2d2d2d
- **Borders**: #404040
- **Text**: #ffffff
- **Critical**: #ff6b6b
- **High**: #ffa726
- **Medium**: #ffeb3b
- **Low**: #4caf50

## 9. Accessibility Features

### Keyboard Navigation
- Tab order through all interactive elements
- Arrow keys for table navigation
- Enter/Space for button activation
- Escape to close modals

### Screen Reader Support
- ARIA labels for all interactive elements
- Table headers properly associated
- Status announcements for scan progress
- Descriptive alt text for icons

### Visual Accessibility
- High contrast mode support
- Scalable fonts (minimum 16px)
- Color-blind friendly color palette
- Focus indicators for all interactive elements

## 10. Performance Considerations

### Data Loading
- Lazy loading for large result sets
- Pagination for tables with >100 rows
- Virtual scrolling for very large datasets
- Caching of parsed scan results

### UI Responsiveness
- Debounced search input
- Optimistic UI updates
- Loading states for all async operations
- Error boundaries for graceful failure handling

### Memory Management
- Cleanup of event listeners
- Proper disposal of file handles
- Garbage collection of large objects
- Efficient re-rendering with React.memo

## 11. Integration Points

### Electron Main Process
- IPC handlers for scan operations
- File system access for evidence files
- WSL command execution
- Progress reporting to renderer

### React Context
- ScanningContext for scan state
- ToastContext for notifications
- ThemeContext for UI theming
- EvidenceContext for file management

### External Dependencies
- Chart.js for statistics visualization
- React-Table for advanced table features
- React-Modal for popup dialogs
- React-Toastify for notifications

## 12. Error Handling

### Scan Errors
- Network connectivity issues
- WSL command failures
- Permission denied errors
- Timeout errors

### UI Error States
- Empty state when no scans performed
- Error state when scan fails
- Loading state during scan execution
- Partial results when scan incomplete

### Error Recovery
- Retry mechanisms for failed operations
- Graceful degradation for missing tools
- Fallback to basic scanning when advanced tools unavailable
- Clear error messages with suggested actions

