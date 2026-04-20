import { useState } from 'react'
import { brokerAPI } from '../services/api'

const BulkSyncModal = ({ onClose, onSuccess }) => {
  const [updates, setUpdates] = useState([{ id: '', percentage: '' }])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const addRow = () => {
    setUpdates([...updates, { id: '', percentage: '' }])
  }

  const removeRow = (index) => {
    if (updates.length > 1) {
      setUpdates(updates.filter((_, i) => i !== index))
    }
  }

  const updateRow = (index, field, value) => {
    const newUpdates = [...updates]
    newUpdates[index][field] = value
    setUpdates(newUpdates)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate
    const validUpdates = updates.filter(u => u.id && u.percentage !== '')
    if (validUpdates.length === 0) {
      setError('Please add at least one valid ID and percentage')
      return
    }

    // Check percentage range
    const invalidPercentages = validUpdates.filter(u => {
      const pct = parseFloat(u.percentage)
      return isNaN(pct) || pct < 0 || pct > 100
    })

    if (invalidPercentages.length > 0) {
      setError('All percentages must be between 0 and 100')
      return
    }

    try {
      setLoading(true)
      setError('')
      setSuccess('')
      
      const updatesPayload = validUpdates.map(u => ({
        id: parseInt(u.id),
        percentage: parseFloat(u.percentage)
      }))

      const response = await brokerAPI.bulkUpdateIBPercentages(updatesPayload)
      
      if (response.status === 'success') {
        const { success: successCount, failed: failedCount, total } = response.data
        setSuccess(`Bulk update completed! Success: ${successCount}, Failed: ${failedCount}, Total: ${total}`)
        setTimeout(() => {
          onSuccess()
        }, 1500)
      } else {
        setError(response.message || 'Failed to update percentages')
      }
    } catch (error) {
      console.error('Error bulk updating percentages:', error)
      setError(error.response?.data?.message || 'Failed to update percentages. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-slate-200 bg-green-600">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Bulk Sync IB Percentages
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-white hover:text-green-100 p-2.5 rounded-xl hover:bg-green-700 transition-all duration-200 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Instructions */}
          <div className="mb-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-blue-800 font-medium">
              Enter IB ID and desired percentage for each row. You can update multiple IBs at once.
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-emerald-800 text-sm font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {success}
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-3">
              {updates.map((update, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={update.id}
                      onChange={(e) => updateRow(index, 'id', e.target.value)}
                      placeholder="IB ID"
                      className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm text-gray-900 placeholder-gray-400"
                      required
                      disabled={loading}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={update.percentage}
                        onChange={(e) => updateRow(index, 'percentage', e.target.value)}
                        placeholder="Percentage (0-100)"
                        className="w-full px-4 py-2 pr-10 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-sm text-gray-900 placeholder-gray-400"
                        required
                        disabled={loading}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">%</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={updates.length === 1 || loading}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Remove Row"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <button
              type="button"
              onClick={addRow}
              disabled={loading}
              className="w-full px-4 py-2 text-sm font-medium text-green-600 border-2 border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Another IB
            </button>

            {/* Form Actions */}
            <div className="flex items-center gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Syncing...
                  </span>
                ) : (
                  'Sync All Percentages'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default BulkSyncModal
