import React from 'react'
import ScanCard from './ScanCard'

const SecurityHeadersScan = ({
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
    id: 'security-headers',
    name: 'Security Headers',
    description: 'Fetch and analyze HTTP response headers',
    detailedDescription: 'Security headers analysis examines full HTTP headers including CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and cookie security settings. This test identifies missing CSP or HSTS headers, insecure cookies, and absent clickjacking/XFO headers that could expose applications to client-side attacks.',
    category: 'Web Security',
    estimatedTime: 20,
    severity: 'medium',
    criticality: 'Missing security headers leave applications vulnerable to XSS, clickjacking, MIME sniffing, and other client-side attacks.',
    fixRecommendations: [
      'Implement Content Security Policy (CSP)',
      'Add X-Frame-Options header',
      'Configure X-Content-Type-Options',
      'Set Referrer-Policy header',
      'Enable HSTS for HTTPS sites'
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

export default SecurityHeadersScan

