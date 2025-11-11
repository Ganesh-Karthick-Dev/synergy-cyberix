import React from 'react'
import ScanCard from './ScanCard'

const PortScanningScan = ({
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
    id: 'port-scanning',
    name: 'Port Scanning',
    description: 'Discover open ports and running services',
    detailedDescription: 'Port scanning identifies open ports and running services on the target system. This test helps identify potential attack vectors, exposed services, and security misconfigurations that could be exploited by attackers.',
    category: 'Infrastructure',
    estimatedTime: 120,
    severity: 'high',
    criticality: 'Open ports can expose sensitive services and provide entry points for attackers.',
    fixRecommendations: [
      'Close unnecessary ports',
      'Secure exposed services',
      'Implement firewall rules',
      'Use port knocking for sensitive services',
      'Regular port security assessments'
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

export default PortScanningScan

