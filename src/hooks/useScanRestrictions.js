import { useState, useEffect } from 'react'
import subscriptionService from '../services/subscriptionService'

/**
 * Custom hook for managing scan restrictions and project selection
 */
export function useScanRestrictions() {
  const [selectedProject, setSelectedProject] = useState(null)
  const [showProjectSelector, setShowProjectSelector] = useState(false)
  const [scanLimit, setScanLimit] = useState(null)
  const [checkingLimit, setCheckingLimit] = useState(false)

  /**
   * Check if user can run a scan on the selected project
   */
  const checkScanLimit = async (projectId) => {
    if (!projectId) {
      return { allowed: false, reason: 'Project ID is required' }
    }

    try {
      setCheckingLimit(true)
      const result = await subscriptionService.canRunScan(projectId)
      setScanLimit(result)
      return result
    } catch (error) {
      console.error('Error checking scan limit:', error)
      return { allowed: false, reason: error.message || 'Unable to verify scan limit' }
    } finally {
      setCheckingLimit(false)
    }
  }

  /**
   * Create a scan report after successful scan
   */
  const createScanReport = async (toolId, title, content, severity = 'MEDIUM', metadata = {}) => {
    if (!selectedProject) {
      throw new Error('No project selected')
    }

    try {
      const report = await subscriptionService.createScanReport(
        selectedProject.id,
        toolId,
        title,
        content,
        severity,
        metadata
      )
      
      // Refresh scan limit after creating report
      if (selectedProject.id) {
        await checkScanLimit(selectedProject.id)
      }
      
      // Dispatch event to notify other components that a scan was created
      window.dispatchEvent(new CustomEvent('scan:created', { 
        detail: { 
          report,
          projectId: selectedProject.id,
          project: selectedProject
        } 
      }))
      
      console.log('✅ [ScanRestrictions] Scan report created and event dispatched:', report.id)
      
      return report
    } catch (error) {
      console.error('Error creating scan report:', error)
      throw error
    }
  }

  /**
   * Open project selector
   */
  const openProjectSelector = () => {
    setShowProjectSelector(true)
  }

  /**
   * Close project selector
   */
  const closeProjectSelector = () => {
    setShowProjectSelector(false)
  }

  /**
   * Handle project selection
   */
  const handleProjectSelect = async (project) => {
    setSelectedProject(project)
    setShowProjectSelector(false)
    
    // Check scan limit for selected project
    if (project.id) {
      await checkScanLimit(project.id)
    }
  }

  /**
   * Clear selected project
   */
  const clearProject = () => {
    setSelectedProject(null)
    setScanLimit(null)
  }

  return {
    selectedProject,
    showProjectSelector,
    scanLimit,
    checkingLimit,
    openProjectSelector,
    closeProjectSelector,
    handleProjectSelect,
    checkScanLimit,
    createScanReport,
    clearProject
  }
}

export default useScanRestrictions
