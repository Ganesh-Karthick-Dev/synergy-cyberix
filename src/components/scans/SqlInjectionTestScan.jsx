import React from 'react'
import ScanCard from './ScanCard'

const SqlInjectionTestScan = ({
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
    id: 'sql-injection-test',
    name: 'SQL Injection Test',
    description: 'Test for SQL injection vulnerabilities using sqlmap with high risk and level settings',
    detailedDescription: 'SQL injection testing uses sqlmap to systematically test web application parameters for SQL injection vulnerabilities. This scan uses risk level 3 and test level 5 to perform comprehensive testing, including error-based, boolean-based, time-based, and union-based SQL injection techniques. The scan identifies vulnerable parameters, extracts database information, and provides detailed remediation guidance.',
    category: 'Web Security',
    estimatedTime: 180,
    severity: 'critical',
    criticality: 'SQL injection vulnerabilities can lead to complete database compromise, data theft, data manipulation, and unauthorized access to sensitive information.',
    fixRecommendations: [
      'Immediately patch all vulnerable parameters',
      'Implement parameterized queries (prepared statements)',
      'Use input validation and sanitization',
      'Implement Web Application Firewall (WAF)',
      'Conduct code review for SQL injection vulnerabilities',
      'Regularly test for SQL injection vulnerabilities'
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

export default SqlInjectionTestScan

