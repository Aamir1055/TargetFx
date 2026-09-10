import { useState, useEffect, useCallback } from 'react'
import { brokerAPI } from '../services/api'

const emptyForm = { login_start: '', login_end: '', percentage: '', comment: '' }

const formatDate = (v) => {
  if (!v) return '-'
  try {
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return String(v)
    return d.toLocaleString()
  } catch { return String(v) }
}

const AutoPercentageModal = ({ isOpen, onClose, onChanged }) => {
  const [ranges, setRanges] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const fetchRanges = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await brokerAPI.getAutoFillPercentages()
      const list = res?.data?.ranges || []
      setRanges(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load auto-fill ranges')
      setRanges([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    setForm(emptyForm)
    setEditingId(null)
    setFormError('')
    fetchRanges()
  }, [isOpen, fetchRanges])

  if (!isOpen) return null

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
    setFormError('')
  }

  const startEdit = (r) => {
    setEditingId(r.id)
    setForm({
      login_start: String(r.login_start ?? ''),
      login_end: String(r.login_end ?? ''),
      percentage: String(r.percentage ?? ''),
      comment: r.comment ?? '',
    })
    setFormError('')
  }

  const validate = () => {
    const ls = Number(form.login_start)
    const le = Number(form.login_end)
    const pct = Number(form.percentage)
    if (!Number.isFinite(ls) || !Number.isFinite(le)) return 'Login start and end must be valid numbers'
    if (ls <= 0 || le <= 0) return 'Login start and end must be positive'
    if (le < ls) return 'Login end must be greater than or equal to login start'
    if (!Number.isFinite(pct)) return 'Percentage must be a number'
    if (pct < 0 || pct > 100) return 'Percentage must be between 0 and 100'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const msg = validate()
    if (msg) { setFormError(msg); return }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        login_start: Number(form.login_start),
        login_end: Number(form.login_end),
        percentage: Number(form.percentage),
        comment: form.comment || '',
      }
      if (editingId) {
        await brokerAPI.updateAutoFillPercentage(editingId, payload)
      } else {
        await brokerAPI.createAutoFillPercentage(payload)
      }
      resetForm()
      await fetchRanges()
      onChanged && onChanged()
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to save auto-fill range')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rangeId) => {
    if (!window.confirm('Delete this auto-fill range?')) return
    setDeletingId(rangeId)
    try {
      await brokerAPI.deleteAutoFillPercentage(rangeId)
      if (editingId === rangeId) resetForm()
      await fetchRanges()
      onChanged && onChanged()
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete auto-fill range')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-blue-600 border-b border-blue-700">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-semibold text-white truncate">Auto Percentage Ranges</h2>
            <p className="hidden sm:block text-xs text-blue-100 mt-0.5">Automatically apply a percentage to any client whose login falls within a range</p>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-3 sm:px-6 py-3 sm:py-5 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Form */}
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-12 gap-2 sm:gap-3 p-3 sm:p-4 rounded-md border border-gray-200 bg-gray-50">
            <div className="col-span-1 md:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Login Start</label>
              <input
                type="number"
                value={form.login_start}
                onChange={(e) => setForm(f => ({ ...f, login_start: e.target.value }))}
                placeholder="90031"
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
            <div className="col-span-1 md:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Login End</label>
              <input
                type="number"
                value={form.login_end}
                onChange={(e) => setForm(f => ({ ...f, login_end: e.target.value }))}
                placeholder="90050"
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
            <div className="col-span-2 md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Percentage (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.percentage}
                onChange={(e) => setForm(f => ({ ...f, percentage: e.target.value }))}
                placeholder="25"
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>
            <div className="col-span-2 md:col-span-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">Comment</label>
              <input
                type="text"
                value={form.comment}
                onChange={(e) => setForm(f => ({ ...f, comment: e.target.value }))}
                placeholder="Batch A"
                disabled={saving}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              />
            </div>

            <div className="col-span-2 md:col-span-12 flex flex-wrap items-center gap-2 justify-end">
              {formError && (
                <p className="text-xs text-red-600 mr-auto">{formError}</p>
              )}
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {saving && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {editingId ? 'Update Range' : 'Add Range'}
              </button>
            </div>
          </form>

          {/* Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Existing Ranges {ranges.length > 0 && <span className="text-gray-500 font-normal">({ranges.length})</span>}</p>
              <button
                onClick={fetchRanges}
                disabled={loading}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {error && (
              <div className="mb-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
            )}

            <div className="border border-gray-200 rounded-md overflow-x-auto">
              <table className="min-w-[720px] w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">ID</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Login Start</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Login End</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Percentage</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Comment</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Updated</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && ranges.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">Loading…</td></tr>
                  ) : ranges.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">No auto-fill ranges yet. Add one above to get started.</td></tr>
                  ) : (
                    ranges.map(r => (
                      <tr key={r.id} className={editingId === r.id ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'}>
                        <td className="px-3 py-2 text-gray-700 tabular-nums">{r.id}</td>
                        <td className="px-3 py-2 text-gray-800 tabular-nums">{r.login_start}</td>
                        <td className="px-3 py-2 text-gray-800 tabular-nums">{r.login_end}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                            {Number(r.percentage).toFixed(2).replace(/\.00$/, '')}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{r.comment || '-'}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(r.updated_at || r.created_at)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(r)}
                              disabled={saving || deletingId === r.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded hover:bg-blue-50 disabled:opacity-50"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={saving || deletingId === r.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 bg-white border border-red-200 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === r.id ? (
                                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M8 7V4a1 1 0 011-1h6a1 1 0 011 1v3" />
                                </svg>
                              )}
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default AutoPercentageModal
