import React from 'react'
import ScanCard from './ScanCard'

const SslTlsAnalysisScan = ({
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
    id: 'ssl-tls-analysis',
    name: 'SSL/TLS Analysis',
    description: 'Validate certificate, check TLS versions, and cipher strength',
    detailedDescription: 'SSL/TLS analysis examines certificate subject, issuer, validity, SANs, key size, signature algorithm, and supported protocols/ciphers. This test identifies expired or self-signed certificates, weak signature algorithms or ciphers, missing SANs, and incomplete certificate chains that could compromise secure communications.',
    category: 'Infrastructure',
    estimatedTime: 45,
    severity: 'high',
    criticality: 'Weak SSL/TLS configurations can lead to man-in-the-middle attacks, data interception, and compliance violations.',
    fixRecommendations: [
      'Use strong cipher suites (AES-256, ChaCha20)',
      'Disable weak protocols (SSL 2.0/3.0, TLS 1.0/1.1)',
      'Implement certificate transparency monitoring',
      'Configure HSTS headers',
      'Regular certificate renewal and monitoring'
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

export default SslTlsAnalysisScan

