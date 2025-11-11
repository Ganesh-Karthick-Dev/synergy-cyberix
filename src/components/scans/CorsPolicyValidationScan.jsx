import React from 'react'
import ScanCard from './ScanCard'

const CorsPolicyValidationScan = ({
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
    id: 'cors-policy-validation',
    name: 'CORS Policy Validation',
    description: 'Checks if Access-Control-Allow-Origin is insecure',
    detailedDescription: 'Sends a request with a malicious Origin to see if the response allows wildcard CORS.',
    category: 'Web Security / Headers',
    estimatedTime: 20,
    severity: 'critical',
    criticality: 'Overly-permissive CORS can allow data exfiltration from authenticated sessions.',
    fixRecommendations: [
      'Restrict CORS to trusted domains only and avoid use of wildcard *.'
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

export default CorsPolicyValidationScan

