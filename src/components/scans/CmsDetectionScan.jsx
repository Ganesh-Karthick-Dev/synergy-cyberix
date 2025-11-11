import React from 'react'
import ScanCard from './ScanCard'

const CmsDetectionScan = ({
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
    id: 'cms-detection',
    name: 'CMS Detection',
    description: 'Identify CMS/framework/web server',
    detailedDescription: 'CMS detection identifies content management systems, frameworks, and web server technologies. This test helps identify potential attack vectors, known vulnerabilities, and security misconfigurations specific to the detected technologies.',
    category: 'Reconnaissance',
    estimatedTime: 30,
    severity: 'medium',
    criticality: 'Exposed CMS information can help attackers identify specific vulnerabilities and attack vectors.',
    fixRecommendations: [
      'Hide version information in HTTP headers',
      'Remove or modify X-Powered-By headers',
      'Disable server signature disclosure',
      'Implement security headers to hide technology stack',
      'Regularly update CMS and plugins',
      'Use security plugins and hardening'
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

export default CmsDetectionScan

