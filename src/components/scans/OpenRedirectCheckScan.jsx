import React from 'react'
import ScanCard from './ScanCard'

const OpenRedirectCheckScan = ({
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
    id: 'open-redirect-check',
    name: 'Open Redirect Check',
    description: 'Tests whether the server allows unvalidated redirects',
    detailedDescription: 'Sends a benign redirect parameter to verify if the server redirects to an arbitrary external domain.',
    category: 'Web Security / Input Validation',
    estimatedTime: 20,
    severity: 'high',
    criticality: 'Unvalidated redirects can be abused for phishing and credential theft.',
    fixRecommendations: [
      'Restrict allowed redirect URLs to internal whitelisted domains.'
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

export default OpenRedirectCheckScan

