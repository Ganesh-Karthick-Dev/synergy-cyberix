import { useState } from 'react'
import { useToast } from '../context/ToastContext'

const NativeKaliPasswordDialog = ({ isOpen, onClose, onSuccess }) => {
  const { showError, showSuccess, showLoading, dismissToast } = useToast()
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!password.trim()) {
      showError('Please enter your sudo password')
      return
    }

    setIsLoading(true)

    try {
      console.log('🔐 [NATIVE-KALI] Testing sudo password...')

      const result = await window.cyberGuard.testRootCredentials(password)

      if (result.success) {
        console.log('✅ [NATIVE-KALI] Sudo password verified successfully')
        showSuccess('Sudo access verified! All security tools are ready.')

        // Store the password securely
        const stored = await window.cyberGuard.storeWslRootPassword(password)
        if (stored) {
          console.log('✅ [NATIVE-KALI] Password stored securely')
        }

        onSuccess && onSuccess()
        onClose()
      } else {
        console.log('❌ [NATIVE-KALI] Sudo password verification failed:', result.error)
        showError(result.error || 'Invalid sudo password. Please check your password.')
      }
    } catch (error) {
      console.error('❌ [NATIVE-KALI] Password verification error:', error)
      showError('Failed to verify sudo password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sudo Access Required</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Native Kali Linux</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            We need your sudo password to install security tools and run privileged commands.
            Your password will be stored securely and used only for system operations.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Admin Username
              </label>
              <input
                type="text"
                value="root"
                disabled
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Sudo Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your sudo password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-slate-700 dark:text-gray-100"
                autoFocus
              />
            </div>
          </div>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-slate-600 rounded-md hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !password.trim()}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Verifying...</span>
              </div>
            ) : (
              'Verify Access'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NativeKaliPasswordDialog

