import jsPDF from 'jspdf';

class ProfessionalPDFExporter {
  constructor() {
    this.doc = null;
    this.pageWidth = 0;
    this.pageHeight = 0;
    this.margin = 20;
    this.currentY = 0;
    this.primaryColor = [41, 128, 185]; // Professional blue
    this.secondaryColor = [52, 73, 94]; // Dark blue-gray
    this.accentColor = [155, 89, 182]; // Purple accent
    this.successColor = [46, 204, 113]; // Green
    this.warningColor = [241, 196, 15]; // Yellow
    this.dangerColor = [231, 76, 60]; // Red
  }

  async initializePDF() {
    // Import jsPDF if not already imported
    const { jsPDF } = await import('jspdf');
    this.doc = new jsPDF();

    // Set up dimensions
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();

    // Add Poppins font if available, otherwise use Helvetica
    try {
      // Note: In a real implementation, you'd load the Poppins font
      // For now, we'll use Helvetica as it's built into jsPDF
      this.doc.setFont('helvetica');
    } catch (error) {
      console.warn('Poppins font not available, using default font');
    }

    return this.doc;
  }

  addHeader(title, subtitle = null) {
    const headerHeight = subtitle ? 35 : 25;

    // Header background
    this.doc.setFillColor(...this.primaryColor);
    this.doc.rect(0, 0, this.pageWidth, headerHeight, 'F');

    // Title
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(20);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.pageWidth / 2, 18, { align: 'center' });

    // Subtitle if provided
    if (subtitle) {
      this.doc.setFontSize(12);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(subtitle, this.pageWidth / 2, 28, { align: 'center' });
    }

    // Reset text color
    this.doc.setTextColor(0, 0, 0);
    this.currentY = headerHeight + 10;
  }

  addScanInfo(scanData) {
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('SCAN INFORMATION', this.margin, this.currentY);
    this.currentY += 8;

    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');

    const infoItems = [
      ['Target', scanData.target || 'N/A'],
      ['Scan Type', scanData.scanType || 'Security Scan'],
      ['Started', scanData.startTime ? new Date(scanData.startTime).toLocaleString() : new Date().toLocaleString()],
      ['Completed', scanData.endTime ? new Date(scanData.endTime).toLocaleString() : new Date().toLocaleString()],
      ['Duration', scanData.duration ? this.formatDuration(scanData.duration) : 'N/A']
    ];

    infoItems.forEach(([label, value]) => {
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${label}:`, this.margin, this.currentY);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(value, this.margin + 50, this.currentY);
      this.currentY += 6;
    });

    this.currentY += 5;
  }

  addExecutiveSummary(summaryData) {
    this.checkNewPage(40);

    // Summary box
    this.doc.setFillColor(248, 249, 250);
    this.doc.rect(this.margin, this.currentY, this.pageWidth - 2 * this.margin, 25, 'F');

    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('EXECUTIVE SUMMARY', this.margin + 5, this.currentY + 8);

    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');

    if (summaryData) {
      const summaryText = typeof summaryData === 'string' ? summaryData :
        `Total Findings: ${summaryData.totalFindings || 0} | ` +
        `Critical: ${summaryData.critical || 0} | ` +
        `High: ${summaryData.high || 0} | ` +
        `Medium: ${summaryData.medium || 0} | ` +
        `Low: ${summaryData.low || 0}`;

      this.doc.text(summaryText, this.margin + 5, this.currentY + 18);
    }

    this.currentY += 35;
  }

  addFindingsSection(findings, title = 'SECURITY FINDINGS') {
    if (!findings || findings.length === 0) return;

    this.checkNewPage(30);

    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    this.currentY += 10;

    findings.forEach((finding, index) => {
      this.checkNewPage(25);

      // Finding box with severity color
      const severityColor = this.getSeverityColor(finding.severity || finding.level || 'medium');
      this.doc.setFillColor(...severityColor);
      this.doc.rect(this.margin, this.currentY - 2, 4, 15, 'F');

      // Finding title
      this.doc.setFontSize(11);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${index + 1}. ${finding.title || finding.name || finding.type || 'Finding'}`, this.margin + 8, this.currentY + 3);

      this.currentY += 8;

      // Finding description
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');

      const description = finding.description || finding.details || finding.evidence || 'No details available';
      const descriptionLines = this.doc.splitTextToSize(description, this.pageWidth - 2 * this.margin - 8);
      descriptionLines.forEach(line => {
        this.checkNewPage(6);
        this.doc.text(line, this.margin + 8, this.currentY);
        this.currentY += 5;
      });

      // Severity badge
      if (finding.severity || finding.level) {
        const severity = (finding.severity || finding.level).toUpperCase();
        this.doc.setFontSize(8);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(...severityColor);
        this.doc.text(severity, this.pageWidth - this.margin - 20, this.currentY - descriptionLines.length * 5 - 5);
        this.doc.setTextColor(0, 0, 0);
      }

      this.currentY += 8;
    });
  }

  addRecommendationsSection(recommendations) {
    if (!recommendations || recommendations.length === 0) return;

    this.checkNewPage(30);

    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text('SECURITY RECOMMENDATIONS', this.margin, this.currentY);
    this.currentY += 10;

    recommendations.forEach((rec, index) => {
      this.checkNewPage(15);

      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(`${index + 1}.`, this.margin, this.currentY);

      this.doc.setFont('helvetica', 'normal');
      const recText = typeof rec === 'string' ? rec : (rec.description || rec.text || rec.recommendation || 'No recommendation details');
      const recLines = this.doc.splitTextToSize(recText, this.pageWidth - 2 * this.margin - 15);

      recLines.forEach(line => {
        this.checkNewPage(6);
        this.doc.text(line, this.margin + 10, this.currentY);
        this.currentY += 5;
      });

      this.currentY += 5;
    });
  }

  addContentSection(content, title = 'DETAILED RESULTS') {
    if (!content) return;

    this.checkNewPage(30);

    this.doc.setFontSize(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(title, this.margin, this.currentY);
    this.currentY += 10;

    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');

    const contentText = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const contentLines = this.doc.splitTextToSize(contentText, this.pageWidth - 2 * this.margin);

    contentLines.forEach(line => {
      this.checkNewPage(6);
      this.doc.text(line, this.margin, this.currentY);
      this.currentY += 5;
    });

    this.currentY += 10;
  }

  checkNewPage(requiredSpace = 20) {
    if (this.currentY > this.pageHeight - requiredSpace - 20) { // 20 for footer
      this.addPage();
    }
  }

  addPage() {
    this.doc.addPage();
    this.currentY = this.margin + 10;
  }

  addFooter() {
    const totalPages = this.doc.internal.getNumberOfPages();

    for (let i = 1; i <= totalPages; i++) {
      this.doc.setPage(i);

      // Footer line
      this.doc.setDrawColor(200, 200, 200);
      this.doc.line(this.margin, this.pageHeight - 15, this.pageWidth - this.margin, this.pageHeight - 15);

      // Footer text
      this.doc.setFontSize(8);
      this.doc.setTextColor(128, 128, 128);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text('Cyberix - A Webnox Product', this.pageWidth / 2, this.pageHeight - 8, { align: 'center' });
      this.doc.text(`Page ${i} of ${totalPages}`, this.pageWidth - this.margin, this.pageHeight - 8, { align: 'right' });
    }
  }

  getSeverityColor(severity) {
    const severityLower = severity.toLowerCase();
    if (severityLower.includes('critical') || severityLower.includes('high')) {
      return this.dangerColor;
    } else if (severityLower.includes('medium') || severityLower.includes('warning')) {
      return this.warningColor;
    } else if (severityLower.includes('low') || severityLower.includes('info')) {
      return this.successColor;
    }
    return this.secondaryColor;
  }

  formatDuration(duration) {
    if (typeof duration === 'number') {
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
    return duration;
  }

  async generatePDF(scanData, contentExtractor) {
    await this.initializePDF();

    // Extract clean content from the scan data
    const extractedData = contentExtractor(scanData);

    // Add header
    this.addHeader(extractedData.title, extractedData.subtitle);

    // Add scan information
    this.addScanInfo(extractedData.scanInfo);

    // Add executive summary
    if (extractedData.summary) {
      this.addExecutiveSummary(extractedData.summary);
    }

    // Add findings
    if (extractedData.findings) {
      this.addFindingsSection(extractedData.findings);
    }

    // Add recommendations
    if (extractedData.recommendations) {
      this.addRecommendationsSection(extractedData.recommendations);
    }

    // Add detailed content
    if (extractedData.content) {
      this.addContentSection(extractedData.content);
    }

    // Add footer to all pages
    this.addFooter();

    return this.doc;
  }

  // Specific extractors for different scan types
  static extractNetworkScanContent(scanResults) {
    return {
      title: 'Network Security Scan Report',
      subtitle: 'Comprehensive Network Analysis',
      scanInfo: {
        target: scanResults.target,
        scanType: 'Network Security Scan',
        startTime: scanResults.startTime,
        endTime: scanResults.endTime,
        duration: scanResults.duration
      },
      summary: scanResults.summary || {
        totalFindings: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      findings: scanResults.findings || [],
      recommendations: scanResults.recommendations || [],
      content: scanResults.cleanResults || 'No detailed results available'
    };
  }

  static extractWebsiteScanContent(scanResults) {
    return {
      title: 'Website Security Audit Report',
      subtitle: 'Complete Website Vulnerability Assessment',
      scanInfo: {
        target: scanResults.target || scanResults.url,
        scanType: 'Website Security Audit',
        startTime: scanResults.timestamp,
        endTime: scanResults.completedAt,
        duration: scanResults.scanDuration
      },
      summary: scanResults.summary,
      findings: scanResults.findings || scanResults.vulnerabilities,
      recommendations: scanResults.recommendations,
      content: scanResults.cleanResults || scanResults.results
    };
  }

  static extractPhishingScanContent(scanResults) {
    const riskLevel = scanResults.threat_score <= 30 ? 'Low Risk' :
                     scanResults.threat_score <= 60 ? 'Medium Risk' : 'High Risk';

    return {
      title: 'Phishing Detection Report',
      subtitle: 'Advanced Phishing Analysis',
      scanInfo: {
        target: scanResults.target_url,
        scanType: 'Phishing Detection',
        startTime: scanResults.scanStartTime,
        endTime: scanResults.scanEndTime,
        duration: scanResults.scanDuration
      },
      summary: {
        totalFindings: scanResults.findings?.length || 0,
        riskLevel: riskLevel,
        threatScore: scanResults.threat_score
      },
      findings: scanResults.findings || [],
      recommendations: scanResults.recommendations || [],
      content: scanResults.analysis || scanResults.details
    };
  }
}

// Export the class
export default ProfessionalPDFExporter;
