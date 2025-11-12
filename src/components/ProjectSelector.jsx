import { useState, useEffect } from 'react'
import { FolderPlus, AlertCircle, CheckCircle, X, Loader2 } from 'lucide-react'
import subscriptionService from '../services/subscriptionService'

function ProjectSelector({ onSelect, onCancel, required = true }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    target: ''
  })
  const [canCreate, setCanCreate] = useState({ allowed: true })

  useEffect(() => {
    fetchProjects()
    checkCanCreate()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const projectList = await subscriptionService.getUserProjects()
      setProjects(projectList)
    } catch (err) {
      console.error('Error fetching projects:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const checkCanCreate = async () => {
    try {
      const result = await subscriptionService.canCreateProject()
      setCanCreate(result)
    } catch (err) {
      console.error('Error checking project limit:', err)
      setCanCreate({ allowed: false, reason: 'Unable to verify limit' })
    }
  }

  const handleCreateProject = async (e) => {
    e.preventDefault()
    if (!newProject.name.trim()) {
      setError('Project name is required')
      return
    }

    try {
      setCreating(true)
      setError(null)
      const project = await subscriptionService.createProject(
        newProject.name.trim(),
        newProject.description.trim(),
        newProject.target.trim()
      )
      
      // Refresh projects list
      await fetchProjects()
      await checkCanCreate()
      
      // Reset form
      setNewProject({ name: '', description: '', target: '' })
      setShowCreateForm(false)
      
      // Auto-select the new project
      if (onSelect) {
        onSelect(project)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const handleSelectProject = (project) => {
    if (onSelect) {
      onSelect(project)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center space-x-3">
            <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
            <span className="text-gray-700 dark:text-gray-300">Loading projects...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Select Project
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Choose a project to associate with this scan
            </p>
          </div>
          {!required && onCancel && (
            <button
              onClick={onCancel}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Create Project Button */}
          {canCreate.allowed ? (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full mb-4 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg font-medium hover:from-orange-600 hover:to-orange-700 transition-all flex items-center justify-center space-x-2"
            >
              <FolderPlus className="w-5 h-5" />
              <span>Create New Project</span>
            </button>
          ) : (
            <div className="w-full mb-4 px-4 py-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  Project Limit Reached
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  {canCreate.reason}
                </p>
              </div>
            </div>
          )}

          {/* Create Project Form */}
          {showCreateForm && canCreate.allowed && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Create New Project
              </h3>
              <form onSubmit={handleCreateProject} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Project Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., My Website Security"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newProject.description}
                    onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    rows="2"
                    placeholder="Brief description of this project"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Target URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={newProject.target}
                    onChange={(e) => setNewProject({ ...newProject, target: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="https://example.com"
                  />
                </div>
                <div className="flex items-center space-x-3">
                  <button
                    type="submit"
                    disabled={creating}
                    className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating...</span>
                      </>
                    ) : (
                      <span>Create Project</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      setNewProject({ name: '', description: '', target: '' })
                      setError(null)
                    }}
                    className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Projects List */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Existing Projects ({projects.length})
            </h3>
            {projects.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FolderPlus className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No projects yet. Create your first project above.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelectProject(project)}
                    className="w-full text-left p-4 border border-gray-200 dark:border-slate-600 rounded-lg hover:border-orange-500 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                            {project.name}
                          </h4>
                          {project.status === 'ACTIVE' && (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                        </div>
                        {project.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                            {project.description}
                          </p>
                        )}
                        {project.target && (
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            Target: {project.target}
                          </p>
                        )}
                        {project._count && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            {project._count.scans || 0} scan(s) completed
                          </p>
                        )}
                      </div>
                      <div className="ml-4">
                        <svg className="w-5 h-5 text-gray-400 group-hover:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProjectSelector
