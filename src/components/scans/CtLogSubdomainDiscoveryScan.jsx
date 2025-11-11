import React from 'react'
import ScanCard from './ScanCard'

const CtLogSubdomainDiscoveryScan = ({
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
    id: 'ct-log-subdomain-discovery',
    name: 'Certificate Transparency (CT) Log Subdomain Discovery',
    description: 'This test collects all publicly logged SSL/TLS certificates for the target domain.\nIt helps identify hidden, forgotten, or unmonitored subdomains that may expose security risks.',
    detailedDescription: 'When any HTTPS domain is created, its certificate is recorded in public Certificate Transparency logs. This scan checks those logs to find all subdomains that have ever received a certificate — including internal, old, testing, or unpublished domains. Attackers use this same method to discover forgotten servers that might have security weaknesses. This test is safe, passive, and does not interact with the target website, it only reads public data.',
    category: 'Reconnaissance',
    estimatedTime: 30,
    severity: 'medium',
    criticality: 'Hidden or forgotten subdomains can expose security risks if not properly monitored and secured.',
    fixRecommendations: [
      'Audit all discovered subdomains and ensure they are properly secured',
      'Remove or secure forgotten test or development subdomains',
      'Implement subdomain monitoring and alerts',
      'Ensure all subdomains follow security best practices'
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

export default CtLogSubdomainDiscoveryScan

