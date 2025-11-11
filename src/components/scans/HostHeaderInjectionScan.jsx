import React from 'react'
import ScanCard from './ScanCard'

const HostHeaderInjectionScan = ({
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
    id: 'host-header-injection',
    name: 'Host Trust Verification',
    description: 'Ensures server does not use client-controlled host header',
    detailedDescription: 'Sends a forged Host header and inspects if it appears in the response.',
    category: 'Web Security / Headers',
    estimatedTime: 20,
    severity: 'high',
    criticality: 'Host header injection can lead to cache poisoning, redirect abuse, and password reset poisoning.',
    fixRecommendations: [
      'Enforce host header validation at server or reverse proxy layer.'
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

export default HostHeaderInjectionScan

