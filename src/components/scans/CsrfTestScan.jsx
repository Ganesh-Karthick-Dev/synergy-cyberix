import React from 'react'
import ScanCard from './ScanCard'

const CsrfTestScan = ({
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
    id: 'csrf-test',
    name: 'Cross-Site Request Forgery (CSRF) Testing',
    description: 'Test for CSRF vulnerabilities using curl POST request simulation',
    detailedDescription: 'Cross-Site Request Forgery (CSRF) testing uses curl to simulate malicious POST requests and analyze server responses for CSRF protection mechanisms. This scan sends POST requests with session cookies to test if the server properly validates CSRF tokens, SameSite cookies, and Origin/Referer headers. The scan identifies missing CSRF protection and provides detailed remediation guidance.',
    category: 'Web Security',
    estimatedTime: 30,
    severity: 'high',
    criticality: 'CSRF vulnerabilities can lead to unauthorized actions on behalf of authenticated users, including account changes, data manipulation, and privilege escalation.',
    fixRecommendations: [
      'Implement CSRF tokens in all forms and AJAX requests',
      'Set SameSite attribute for cookies to prevent cross-site requests',
      'Validate Origin and Referer headers on the server side',
      'Implement double-submit cookie pattern for additional protection',
      'Use state-changing operations only with proper CSRF protection',
      'Regularly test CSRF protection mechanisms'
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

export default CsrfTestScan

