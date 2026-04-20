import { useState } from 'react'
import { brokerAPI } from '../services/api'

const BulkUpdatePercentageModal = ({ isOpen, onClose, selectedIBData, onSuccess }) => {
  const [percentage, setPercentage] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  if (!isOpen) return null

  const handleUpdate = async () => {
    const percentageValue = parseFloat(percentage)
    if (isNaN(percentageValue) || percentageValue < 0 || percentageValue > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }

    try {
      setIsUpdating(true)
      const updates = selectedIBData.map(ib => ({ id: ib.id, percentage: percentageValue }))
      const response = await brokerAPI.bulkUpdateIBPercentages(updates)
      
      if (response.status === 'success') {
        alert(`Successfully updated ${selectedIBs.length} IB commission(s) to ${percentageValue}%`)
        setPercentage('')
        onSuccess()
        onClose()
      } else {
        alert('Bulk update failed: ' + (response.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error during bulk update:', error)
      alert('Bulk update failed: ' + (error.response?.data?.message || error.message))
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full transform transition-all">
        {/* Modal Header (Blue theme to match column headers) */}
        <div className="bg-blue-500 px-4 py-3 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Bulk Update Percentage
            </h3>
            <button
              onClick={() => {
                onClose()
                setPercentage('')
              }}
              className="text-white/90 hover:text-white transition-colors"
              disabled={isUpdating}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body (compact for mobile) */}
        <div className="p-4 space-y-3">
          {/* Info Message */}
          <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Please check the IDs you want to update using the checkboxes in the table, then enter the percentage value to apply.
            </p>
          </div>

          {/* Selected IDs Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Selected IB Emails ({selectedIBData.length})
            </label>
            <div className="p-2.5 bg-gray-50 border border-gray-300 rounded-lg min-h-[52px] max-h-[110px] overflow-y-auto">
              {selectedIBData.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {selectedIBData.map(ib => (
                    <span
                      key={ib.id}
                      className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded"
                    >
                      {ib.email}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-xs italic">No emails selected</p>
              )}
            </div>
          </div>

          {/* Percentage Input Field */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Percentage Value (%)
            </label>
            <input
              type="number"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              placeholder="Enter percentage (0-100)"
              min="0"
              max="100"
              step="0.01"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={isUpdating}
              autoFocus
            />
            <p className="text-[11px] text-gray-500 mt-1">
              This percentage will be applied to all {selectedIBs.length} selected IB(s)
            </p>
          </div>
        </div>

        {/* Modal Footer (compact) */}
        <div className="bg-gray-50 px-4 py-3 rounded-b-xl flex items-center justify-end gap-2">
          <button
            onClick={() => {
              onClose()
              setPercentage('')
            }}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
            disabled={isUpdating}
          >
            Cancel
          </button>
          <button
            onClick={handleUpdate}
            disabled={isUpdating || !percentage || selectedIBs.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all"
          >
            {isUpdating ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Update All
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default BulkUpdatePercentageModal
