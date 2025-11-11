import React from 'react'
import ScanCard from './ScanCard'

const WafDetectionScan = ({
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
    id: 'waf-detection',
    name: 'WAF (Firewall) Detection',
    description: 'Detect whether a target web application is protected by a Web Application Firewall (WAF) and identify the vendor/type',
    detailedDescription: 'WAF Detection determines whether network or application-layer filtering is active in front of a web server. The test fingerprints WAF products by sending a set of benign, non-exploit HTTP probes and analyzing response traits such as headers, error pages, cookies, redirects, and behavioral differences. Knowing a WAF is present helps legitimate testers avoid unnecessary blocking or accidental DoS during active tests, and helps site owners confirm protection is installed and returning expected responses.',
    category: 'Web Security',
    estimatedTime: 45,
    severity: 'high',
    criticality: 'WAF detection is informational to high severity depending on context. Presence of WAF affects further testing and indicates the level of protection in place.',
    fixRecommendations: [
      'Verify WAF configuration is appropriate for your security needs',
      'Ensure WAF rules are properly tuned',
      'Monitor WAF logs for false positives',
      'Regularly update WAF rules and signatures',
      'Test WAF effectiveness against common attack patterns',
      'Consider implementing custom WAF rules for your application'
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

export default WafDetectionScan

