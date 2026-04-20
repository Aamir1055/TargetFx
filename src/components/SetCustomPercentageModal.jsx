import React, { useState, useEffect } from 'react'
import { brokerAPI } from '../services/api'

export default function SetCustomPercentageModal({ client, onClose, onSuccess }) {
  const [percentage, setPercentage] = useState('')
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (client) {
      setPercentage(client.percentage || '')
      setComment(client.comment || '')
    }
  }, [client])

  const handleSave = async () => {
    if (!percentage || percentage === '') {
      setError('Please enter a percentage')
      return
    }

    const percentageNum = parseFloat(percentage)
    if (isNaN(percentageNum) || percentageNum < -100 || percentageNum > 100) {
      setError('Percentage must be between -100 and 100')
      return
    }

    try {
      setSaving(true)
      setError('')
      
      const login = client.client_login || client.login
      await brokerAPI.setClientPercentage(login, percentageNum, comment.trim())
      
      if (onSuccess) {
        await onSuccess()
      }
      onClose()
    } catch (err) {
      console.error('Error saving percentage:', err)
      setError(err.response?.data?.message || 'Failed to save percentage')
      setSaving(false)
    }
  }

  if (!client) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="bg-blue-500 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <h3 className="text-xl font-bold text-white tracking-tight">
            Set Custom Percentage
          </h3>
          <button
            onClick={onClose}
            className="text-white hover:text-blue-100 p-2.5 rounded-xl hover:bg-blue-600 transition-all duration-200"
            disabled={saving}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-800 text-sm font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </p>
            </div>
          )}

          {/* Client Login Info */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm text-gray-600">
              Client Login: <span className="font-semibold text-gray-900">{client.client_login || client.login}</span>
            </p>
          </div>

          {/* Percentage Input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Set Custom Percentage
            </label>
            <input
              type="number"
              step="any"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white font-medium"
              placeholder="Enter percentage (e.g., 70 or -50)"
              disabled={saving}
            />
          </div>

          {/* Comment Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Comment...
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 resize-none"
              placeholder="Auto-synced from IB
powainancial@gmail.com (70%)"
              disabled={saving}
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t-2 border-slate-200 flex justify-between gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-6 py-3 text-sm font-semibold text-gray-700 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-6 py-3 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              'Save Percentage'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
