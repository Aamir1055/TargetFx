import { useState, useEffect } from 'react'
import { brokerAPI } from '../services/api'
import LoadingSpinner from './LoadingSpinner'

const ApplyRuleModal = ({ rule, onClose }) => {
  const [login, setLogin] = useState('')
  const [timeParameter, setTimeParameter] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [clientRules, setClientRules] = useState([])
  const [loadingClientRules, setLoadingClientRules] = useState(false)

  // Fetch existing client rules when login is entered
  useEffect(() => {
    if (login && login.length >= 4) {
      fetchClientRules()
    } else {
      setClientRules([])
    }
  }, [login])

  const fetchClientRules = async () => {
    try {
      setLoadingClientRules(true)
      const response = await brokerAPI.getClientRules(login)
      if (response.status === 'success') {
        setClientRules(response.data.rules || [])
      }
    } catch (err) {
      console.error('Error fetching client rules:', err)
      // Don't show error for this - client might not exist yet
      setClientRules([])
    } finally {
      setLoadingClientRules(false)
    }
  }

  const handleApply = async () => {
    if (!login.trim()) {
      setError('Please enter a client MT5 login')
      return
    }

    if (rule.requires_time_parameter && !timeParameter) {
      setError('Please select a time parameter')
      return
    }

    try {
      setLoading(true)
      setError(null)
      setSuccess(false)

      const response = await brokerAPI.applyClientRule(
        login,
        rule.rule_code,
        rule.requires_time_parameter ? timeParameter : null
      )

      if (response.status === 'success') {
        setSuccess(true)
        // Refresh client rules
        await fetchClientRules()
        // Auto close after 2 seconds
        setTimeout(() => {
          onClose()
        }, 2000)
      }
    } catch (err) {
      console.error('Error applying rule:', err)
      setError(err.response?.data?.message || 'Failed to apply rule')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveRule = async (ruleCode) => {
    try {
      setLoading(true)
      setError(null)
      const response = await brokerAPI.removeClientRule(login, ruleCode)
      if (response.status === 'success') {
        // Refresh client rules
        await fetchClientRules()
      }
    } catch (err) {
      console.error('Error removing rule:', err)
      setError(err.response?.data?.message || 'Failed to remove rule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Apply Rule to Client</h2>
            <p className="text-sm text-gray-600 mt-1">{rule.rule_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Rule Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">{rule.rule_name}</h3>
                <p className="text-sm text-blue-800 mb-2">{rule.description}</p>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700">MT5 Field:</span>
                    <span className="font-medium text-blue-900">{rule.mt5_field}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-blue-700">Value Template:</span>
                    <span className="font-mono text-xs bg-white px-2 py-1 rounded border border-blue-200 text-blue-900">
                      {rule.mt5_value_template}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Client Login Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client MT5 Login <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Enter client login (e.g., 555954)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 placeholder-gray-400"
              disabled={loading}
            />
          </div>

          {/* Time Parameter Selection (if required) */}
          {rule.requires_time_parameter && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Parameter <span className="text-red-500">*</span>
              </label>
              <select
                value={timeParameter}
                onChange={(e) => setTimeParameter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                disabled={loading}
              >
                <option value="">Select time duration</option>
                {rule.available_time_parameters?.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                The rule will be applied for the selected time duration
              </p>
            </div>
          )}

          {/* Existing Client Rules */}
          {login && login.length >= 4 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Current Rules for This Client
              </label>
              {loadingClientRules ? (
                <div className="flex items-center justify-center py-4">
                  <LoadingSpinner />
                </div>
              ) : clientRules.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-600">
                  No rules currently applied to this client
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {clientRules.map((clientRule) => (
                    <div
                      key={clientRule.rule_code}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {clientRule.rule_name || clientRule.rule_code}
                        </div>
                        <div className="text-xs text-gray-600 font-mono mt-1">
                          {clientRule.rule_code}
                        </div>
                        {clientRule.time_parameter && (
                          <div className="text-xs text-purple-600 mt-1">
                            Time: {clientRule.time_parameter}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleRemoveRule(clientRule.rule_code)}
                        disabled={loading}
                        className="ml-3 px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-green-700">Rule applied successfully!</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading || success}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <LoadingSpinner />
                <span>Applying...</span>
              </>
            ) : success ? (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Applied!</span>
              </>
            ) : (
              <span>Apply Rule</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ApplyRuleModal
