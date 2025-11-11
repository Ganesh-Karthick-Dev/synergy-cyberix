import React from 'react'
import ScanCard from './ScanCard'

const XssTestScan = ({
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
    id: 'xss-test',
    name: 'Cross-Site Scripting (XSS) Testing',
    description: 'Test for XSS vulnerabilities using dalfox with fast scan mode',
    detailedDescription: 'Cross-Site Scripting (XSS) testing uses dalfox to systematically test web application parameters for XSS vulnerabilities. This scan uses fast scan mode with 50 workers to perform comprehensive testing, including reflected XSS, stored XSS, and DOM-based XSS detection. The scan identifies vulnerable parameters, extracts payload information, and provides detailed remediation guidance.',
    category: 'Web Security',
    estimatedTime: 120,
    severity: 'critical',
    criticality: 'XSS vulnerabilities can lead to session hijacking, account takeover, data theft, and malicious script execution in users browsers.',
    fixRecommendations: [
      'Immediately patch all XSS vulnerabilities found',
      'Sanitize user inputs to escape HTML special characters',
      'Implement Content Security Policy (CSP) headers',
      'Use HTTP-only cookies to protect session data',
      'Validate and encode all data dynamically on server side',
      'Regularly test for XSS vulnerabilities'
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

export default XssTestScan

