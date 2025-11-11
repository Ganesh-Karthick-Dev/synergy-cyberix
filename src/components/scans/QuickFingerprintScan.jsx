import React from 'react'
import ScanCard from './ScanCard'

const QuickFingerprintScan = ({
  isSelected,
  isRunning,
  progress,
  result,
  isExpanded,
  isCompleted,
  isNotScanned,
  canOpen,
  isExporting,
  onToggleExpansion,
  onOpenDetail,
  onGeneratePDF
}) => {
  const test = {
    id: 'quick-fingerprint',
    name: 'Quick Fingerprint',
    description: 'Fast technology fingerprint to identify server, CMS and common libraries.',
    detailedDescription: 'This run performs a lightweight, non-intrusive fingerprint of the target site to quickly enumerate web server, CMS, common frameworks and observable headers. It\'s designed for reconnaissance with minimal requests and low noise so it\'s safe on production sites. Results are suitable for deciding follow-up scans (e.g., wpscan, nmap) and give a snapshot of what technologies are present. It does not try aggressive probes, so some plugins or obscure frameworks may be missed. Use this as the first step in a scanning workflow.',
    category: 'Reconnaissance',
    estimatedTime: 30,
    severity: 'informational',
    criticality: 'Fingerprinting helps identify technologies in use and potential attack surfaces.',
    fixRecommendations: [
      'Enable HSTS for HTTPS sites',
      'Add a strict Content-Security-Policy',
      'Keep CMS and plugins updated to latest versions',
      'Minimize exposed technology information in headers'
    ]
  }

  return (
    <ScanCard
      test={test}
      isSelected={isSelected}
      isRunning={isRunning}
      progress={progress}
      result={result}
      isExpanded={isExpanded}
      isCompleted={isCompleted}
      isNotScanned={isNotScanned}
      canOpen={canOpen}
      isExporting={isExporting}
      onToggleExpansion={onToggleExpansion}
      onOpenDetail={onOpenDetail}
      onGeneratePDF={onGeneratePDF}
    />
  )
}

export default QuickFingerprintScan

