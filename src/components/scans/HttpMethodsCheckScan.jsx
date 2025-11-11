import React from 'react'
import ScanCard from './ScanCard'

const HttpMethodsCheckScan = ({
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
    id: 'http-methods-check',
    name: 'HTTP Allowed Methods Check',
    description: 'Checks if dangerous HTTP methods are enabled',
    detailedDescription: 'Performs an OPTIONS request to see if unsafe methods (PUT, DELETE, TRACE) are enabled.',
    category: 'Web Security',
    estimatedTime: 20,
    severity: 'critical',
    criticality: 'Dangerous HTTP methods can enable data tampering, file uploads, or debugging leaks.',
    fixRecommendations: [
      'Disable unsafe methods at server and web application firewall level.'
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

export default HttpMethodsCheckScan

