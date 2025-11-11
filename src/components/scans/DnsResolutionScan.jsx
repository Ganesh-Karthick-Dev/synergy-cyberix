import React from 'react'
import ScanCard from './ScanCard'

const DnsResolutionScan = ({
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
    id: 'dns-resolution',
    name: 'DNS Resolution & Analysis',
    description: 'Comprehensive DNS security analysis including record validation, DNSSEC, and zone transfer testing',
    detailedDescription: 'DNS Resolution & Analysis performs comprehensive DNS security testing including A, MX, TXT, NS, and SOA record analysis, reverse DNS lookups, DNSSEC validation, zone transfer testing, and subdomain enumeration. This scan identifies DNS misconfigurations, missing security records, and potential attack vectors.',
    category: 'Infrastructure',
    estimatedTime: 120,
    severity: 'high',
    criticality: 'DNS misconfigurations can lead to domain hijacking, email spoofing, and subdomain takeover attacks.',
    fixRecommendations: [
      'Enable DNSSEC to prevent DNS spoofing',
      'Implement proper SPF, DKIM, and DMARC records',
      'Disable zone transfers to prevent DNS enumeration',
      'Monitor DNS records for unauthorized changes',
      'Use strong DNS security policies',
      'Regularly audit DNS configuration'
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

export default DnsResolutionScan

