import React from 'react'
import ScanCard from './ScanCard'

const FileUploadCheckScan = ({
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
    id: 'file-upload-check',
    name: 'File Upload Vulnerability Check',
    description: 'Verify whether uploads are improperly validated or web-accessible, potentially enabling code execution or data exposure',
    detailedDescription: 'Simulates benign file uploads using curl and analyzes responses, headers, and any returned URLs. Checks if files are accepted without proper validation, stored in web-accessible locations, or processed in a way that could allow code execution. Only run with explicit authorization.',
    category: 'Web Security / Input Validation',
    estimatedTime: 120,
    severity: 'high',
    criticality: 'If uploads allow web shells or arbitrary code execution, this escalates to critical severity.',
    fixRecommendations: [
      'Validate file type and content server-side (MIME + magic bytes)',
      'Store uploads outside webroot; serve via controlled handlers',
      'Set X-Content-Type-Options: nosniff and Content-Disposition: attachment',
      'Restrict allowed extensions; block executable types (.php, .jsp, .aspx)',
      'Rename files and disable direct origin access; enforce auth where required',
      'Log and monitor upload events; rate-limit if appropriate'
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

export default FileUploadCheckScan

