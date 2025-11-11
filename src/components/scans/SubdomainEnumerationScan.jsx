import React from 'react'
import ScanCard from './ScanCard'

const SubdomainEnumerationScan = ({
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
    id: 'subdomain-enumeration',
    name: 'Subdomain Enumeration',
    description: 'Enumerate all DNS subdomains',
    detailedDescription: 'Subdomain enumeration discovers all subdomains associated with the target domain. This test identifies potential attack surfaces, misconfigured subdomains, and takeover candidates that could be exploited by attackers.',
    category: 'Reconnaissance',
    estimatedTime: 90,
    severity: 'medium',
    criticality: 'Exposed subdomains can provide additional attack vectors and may contain sensitive information or misconfigurations.',
    fixRecommendations: [
      'Audit all discovered subdomains',
      'Secure misconfigured subdomains',
      'Implement subdomain monitoring',
      'Use wildcard SSL certificates properly',
      'Regular subdomain security assessments'
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

export default SubdomainEnumerationScan

