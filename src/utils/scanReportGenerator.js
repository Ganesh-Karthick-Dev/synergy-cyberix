// Convert JSON scan report to Markdown security report

function generateMarkdownReport(jsonData) {
  if (!jsonData || typeof jsonData !== 'object') {
    return '# Security Scan Report\n\nError: Invalid scan data received.';
  }

  const target = jsonData.target || 'Unknown';
  const scans = jsonData.scans || {};
  const summary = jsonData.summary || {};

  let markdown = `# Security Scan Report for ${target}\n\n`;
  markdown += `**Generated:** ${jsonData.generated_at || 'Unknown'}\n\n`;
  markdown += `---\n\n`;

  // 1. Target Information
  markdown += `## 1. Target Information\n\n`;
  
  const domain = target;
  const ipAddress = scans.dns?.first_ip || scans.dns?.text?.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)?.[1] || 'Not Available';
  const whatwebText = scans.whatweb?.text || scans.whatweb?._raw_text || '';
  const webServer = whatwebText.match(/HTTPServer\[([^\]]+)\]/)?.[1] || 
                    whatwebText.match(/Server\[([^\]]+)\]/)?.[1] || 
                    'Not Available';

  markdown += `- **Domain:** ${domain}\n`;
  markdown += `- **IP Address:** ${ipAddress}\n`;
  markdown += `- **Web Server / Technology Stack:** ${webServer}\n\n`;

  // Extract technologies from whatweb
  const techMatches = whatwebText.matchAll(/(\w+)\[([^\]]+)\]/g);
  const technologies = [];
  for (const match of techMatches) {
    if (!['HTTPServer', 'Server', 'Country', 'Title', 'IP'].includes(match[1])) {
      technologies.push(`${match[1]}: ${match[2]}`);
    }
  }
  if (technologies.length > 0) {
    markdown += `- **Technologies Detected:** ${technologies.slice(0, 5).join(', ')}${technologies.length > 5 ? '...' : ''}\n\n`;
  }

  // 2. Network Accessibility
  markdown += `## 2. Network Accessibility\n\n`;
  
  const pingText = scans.ping?.text || scans.ping?._raw_text || '';
  const pingAllowed = pingText.includes('0% packet loss') || pingText.includes('packets received') && !pingText.includes('100% packet loss');
  const packetLoss = scans.ping?.packet_loss ?? (pingText.match(/(\d+)% packet loss/)?.[1] || null);
  
  markdown += `- **Ping Allowed:** ${pingAllowed ? 'Yes' : packetLoss === 100 ? 'No (Blocked)' : packetLoss ? `Partially (${packetLoss}% packet loss)` : 'Not Available'}\n`;

  // WAF Detection (check for common WAF indicators)
  const wafIndicators = ['cloudflare', 'akamai', 'incapsula', 'sucuri', 'imperva', 'f5', 'barracuda', 'fortinet'];
  const wafDetected = wafIndicators.some(indicator => 
    whatwebText.toLowerCase().includes(indicator) || 
    scans.whatweb?.text?.toLowerCase().includes(indicator)
  );
  
  markdown += `- **WAF / Firewall Detected:** ${wafDetected ? 'Yes (Possible WAF detected)' : 'No (Not detected)'}\n\n`;

  // 3. Open Ports and Services
  markdown += `## 3. Open Ports and Services\n\n`;

  const ports = summary.quick_ports || [];
  
  // Also try to extract from nmap_fast parsed data
  if (ports.length === 0 && scans.nmap_fast) {
    try {
      const nmapData = scans.nmap_fast;
      if (nmapData.nmaprun?.host?.ports?.port) {
        const portList = Array.isArray(nmapData.nmaprun.host.ports.port) 
          ? nmapData.nmaprun.host.ports.port 
          : [nmapData.nmaprun.host.ports.port];
        
        portList.forEach(p => {
          if (p.state?.['@state'] === 'open' || p.state?.['@state'] === 'open|filtered') {
            ports.push({
              port: p['@portid'],
              proto: p['@protocol'] || 'tcp',
              state: p.state?.['@state'] || 'unknown',
              service: p.service?.['@name'] || 'unknown'
            });
          }
        });
      }
    } catch (e) {
      // Fallback to raw text parsing
      const nmapRaw = scans.nmap_fast?._raw_text || scans.nmap_fast?.text || '';
      const portMatches = nmapRaw.matchAll(/(\d+)\/(\w+)\s+(\w+)\s+(\S+)/g);
      for (const match of portMatches) {
        if (match[3] === 'open') {
          ports.push({
            port: match[1],
            proto: match[2],
            state: match[3],
            service: match[4]
          });
        }
      }
    }
  }

  if (ports.length > 0) {
    markdown += `| Port | Service | Protocol | State |\n`;
    markdown += `|------|---------|----------|-------|\n`;
    
    ports.forEach(p => {
      const port = p.port || p['@portid'] || 'N/A';
      const service = p.service || p['service']?.['@name'] || 'unknown';
      const protocol = p.proto || p['@protocol'] || 'tcp';
      const state = p.state || p['state']?.['@state'] || 'unknown';
      markdown += `| ${port} | ${service} | ${protocol} | ${state} |\n`;
    });
  } else {
    markdown += `No open ports detected in quick scan.\n`;
  }

  markdown += `\n`;

  // 4. DNS Records
  markdown += `## 4. DNS Records\n\n`;

  const dnsText = scans.dns?.text || scans.dns?._raw_text || '';
  
  // Extract A record
  const aRecord = ipAddress !== 'Not Available' ? ipAddress : 'Not Available';
  markdown += `- **A Record:** ${aRecord}\n`;

  // Extract MX records
  const mxMatches = dnsText.matchAll(/mail is handled by (\d+) (\S+)/g);
  const mxRecords = [];
  for (const match of mxMatches) {
    mxRecords.push({ priority: match[1], host: match[2] });
  }
  
  if (mxRecords.length > 0) {
    markdown += `- **Mail Servers (MX):**\n`;
    mxRecords.forEach(mx => {
      markdown += `  - ${mx.host} (Priority: ${mx.priority})\n`;
    });
  } else {
    markdown += `- **Mail Servers (MX):** Not Available\n`;
  }

  markdown += `\n`;

  // 5. Observations / Notes
  markdown += `## 5. Observations / Notes\n\n`;

  const observations = [];

  // Ping status
  if (packetLoss === 100) {
    observations.push('ICMP ping is blocked, which may indicate firewall protection or network filtering.');
  } else if (packetLoss && packetLoss > 0) {
    observations.push(`Partial packet loss (${packetLoss}%) detected, may indicate network congestion or filtering.`);
  }

  // Ports
  if (ports.length === 0) {
    observations.push('No open ports detected in quick scan. This may indicate strong firewall protection or the host may be down.');
  } else if (ports.length < 5) {
    observations.push(`Limited number of open ports (${ports.length}) suggests tight security configuration.`);
  } else {
    observations.push(`Multiple open ports detected (${ports.length}), review for unnecessary services.`);
  }

  // Web server
  if (webServer !== 'Not Available') {
    observations.push(`Web server identified: ${webServer}. Ensure it's running the latest version.`);
  }

  // WAF
  if (wafDetected) {
    observations.push('Web Application Firewall (WAF) appears to be in place, providing additional security layer.');
  }

  // HTTP status
  const statusMatch = whatwebText.match(/\[(\d{3})\s+(\w+)\]/);
  if (statusMatch) {
    const statusCode = parseInt(statusMatch[1]);
    if (statusCode === 403) {
      observations.push('HTTP 403 Forbidden detected - access control is active.');
    } else if (statusCode === 200) {
      observations.push('HTTP 200 OK - target is accessible.');
    }
  }

  if (observations.length === 0) {
    observations.push('Scan completed successfully. Review individual scan results for detailed information.');
  }

  observations.forEach(obs => {
    markdown += `- ${obs}\n`;
  });

  markdown += `\n---\n\n`;
  markdown += `*Report generated from comprehensive network security scan.*\n`;

  return markdown;
}

// Convert Markdown to HTML for display
function markdownToHTML(markdown) {
  if (!markdown) return '';

  // Split by lines for better processing
  const lines = markdown.split('\n');
  let html = '';
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listItems = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle tables
    if (line.includes('|') && line.split('|').length > 2) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator rows
      if (!line.match(/^[\|\s\-:]+$/)) {
        tableRows.push(line);
      }
      continue;
    } else if (inTable) {
      // End of table
      html += buildTable(tableRows);
      tableRows = [];
      inTable = false;
    }

    // Handle lists
    if (line.startsWith('- ')) {
      if (!inList) {
        inList = true;
        listItems = [];
      }
      listItems.push(line.substring(2));
      continue;
    } else if (inList && line === '') {
      // End of list
      html += buildList(listItems);
      listItems = [];
      inList = false;
      continue;
    } else if (inList) {
      // End of list
      html += buildList(listItems);
      listItems = [];
      inList = false;
    }

    // Handle headers
    if (line.startsWith('### ')) {
      html += `<h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-6 mb-3">${line.substring(4)}</h3>\n`;
    } else if (line.startsWith('## ')) {
      html += `<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100 mt-8 mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">${line.substring(3)}</h2>\n`;
    } else if (line.startsWith('# ')) {
      html += `<h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-8 mb-6">${line.substring(2)}</h1>\n`;
    } else if (line === '---') {
      html += '<hr class="my-6 border-gray-300 dark:border-gray-600" />\n';
    } else if (line === '') {
      html += '<br />\n';
    } else {
      // Regular paragraph
      let processedLine = line
        .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-blue-600 dark:text-blue-400">$1</code>');
      
      html += `<p class="mb-3 text-gray-700 dark:text-gray-300 leading-relaxed">${processedLine}</p>\n`;
    }
  }

  // Close any remaining lists or tables
  if (inList && listItems.length > 0) {
    html += buildList(listItems);
  }
  if (inTable && tableRows.length > 0) {
    html += buildTable(tableRows);
  }

  return html;
}

function buildTable(rows) {
  if (rows.length === 0) return '';
  
  let tableHTML = '<div class="overflow-x-auto my-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">\n';
  tableHTML += '<table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">\n';
  tableHTML += '<thead class="bg-gray-50 dark:bg-gray-800">\n<tr>\n';
  
  // Header row
  const headerCells = rows[0].split('|').filter(c => c.trim());
  headerCells.forEach(cell => {
    tableHTML += `<th class="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">${cell.trim()}</th>\n`;
  });
  tableHTML += '</tr>\n</thead>\n<tbody class="bg-white dark:bg-slate-900 divide-y divide-gray-200 dark:divide-gray-700">\n';
  
  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split('|').filter(c => c.trim());
    if (cells.length > 0) {
      tableHTML += '<tr class="hover:bg-gray-50 dark:hover:bg-gray-800">\n';
      cells.forEach(cell => {
        tableHTML += `<td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap">${cell.trim()}</td>\n`;
      });
      tableHTML += '</tr>\n';
    }
  }
  
  tableHTML += '</tbody>\n</table>\n</div>\n';
  return tableHTML;
}

function buildList(items) {
  if (items.length === 0) return '';
  
  let listHTML = '<ul class="list-disc ml-6 mb-4 space-y-2 text-gray-700 dark:text-gray-300">\n';
  items.forEach(item => {
    const processedItem = item
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-900 dark:text-gray-100">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono text-blue-600 dark:text-blue-400">$1</code>');
    listHTML += `<li class="leading-relaxed">${processedItem}</li>\n`;
  });
  listHTML += '</ul>\n';
  return listHTML;
}

module.exports = {
  generateMarkdownReport,
  markdownToHTML
};

