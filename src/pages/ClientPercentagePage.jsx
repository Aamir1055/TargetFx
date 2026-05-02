import { useState, useEffect, useRef, useMemo, Fragment, cloneElement } from 'react'
import { brokerAPI } from '../services/api'
import { useGroups } from '../contexts/GroupContext'
import { useData } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'
import Sidebar from '../components/Sidebar'
import PageSizeSelect from '../components/PageSizeSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import WebSocketIndicator from '../components/WebSocketIndicator'
import ClientPositionsModal from '../components/ClientPositionsModal'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import ClientPercentageModule from '../components/ClientPercentageModule'
import ColumnChooserList from '../components/ColumnChooserList'
import useColumnResize, { ColumnResizeHandle } from '../hooks/useColumnResize.jsx'

const ClientPercentagePage = () => {
  // Detect mobile device
  const [isMobile, setIsMobile] = useState(false)
  // Global Compact / Full numeric display mode (synced with Sidebar via 'globalDisplayMode')
  const [numericMode, setNumericMode] = useState(() => {
    try {
      const saved = localStorage.getItem('globalDisplayMode')
      return saved === 'full' ? 'full' : 'compact'
    } catch { return 'compact' }
  })
  useEffect(() => {
    const onChange = (e) => {
      const v = (e && e.detail) || localStorage.getItem('globalDisplayMode')
      if (v === 'full' || v === 'compact') setNumericMode(v)
    }
    window.addEventListener('globalDisplayModeChanged', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('globalDisplayModeChanged', onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  // Indian compact formatter: 2.57Cr, 12.50L, 25.50K
  const formatCompactIndian = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return '0'
    const abs = Math.abs(num)
    const sign = num < 0 ? '-' : ''
    if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`
    if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(2)}L`
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}K`
    return `${sign}${Math.round(abs)}`
  }
  const fmtCount = (n) => {
    const num = Number(n) || 0
    if (numericMode === 'compact' && Math.abs(num) >= 1000) return formatCompactIndian(num)
    return String(num)
  }
  
  const { filterByActiveGroup, activeGroupFilters, getActiveGroupFilter } = useGroups()
  const { positions: cachedPositions, orders: cachedOrders } = useData()
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch {
      return true
    }
  })
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const { isAuthenticated, user } = useAuth()
  const canSetPercentage = user?.rights ? user.rights.includes('set_percentage') : true
  const [unauthorized, setUnauthorized] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedLogin, setSelectedLogin] = useState(null)
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [stats, setStats] = useState({
    total: 0,
    total_custom: 0,
    total_default: 0,
    default_percentage: 0
  })
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(100)
  
  // Search states
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const searchRef = useRef(null)

  // Column visibility states
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    clientName: true,
    percentage: true,
    type: true,
    comment: true,
    updatedAt: true,
    actions: true,
  })

  const allColumns = [
    { key: 'login', label: 'Client Login', sticky: true },
    { key: 'clientName', label: 'Client Name' },
    { key: 'percentage', label: 'Percentage' },
    { key: 'type', label: 'Type' },
    { key: 'comment', label: 'Comment' },
    { key: 'updatedAt', label: 'Last Updated' },
    { key: 'actions', label: 'Actions' },
  ]

  // Column order (persisted) for reorder via Column Chooser
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('clientPercentagePageColumnOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return null
  })
  useEffect(() => {
    try {
      if (columnOrder) localStorage.setItem('clientPercentagePageColumnOrder', JSON.stringify(columnOrder))
    } catch {}
  }, [columnOrder])
  const resetColumnOrder = () => {
    setColumnOrder(null)
    try { localStorage.removeItem('clientPercentagePageColumnOrder') } catch {}
  }
  const orderedColumns = (() => {
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) return allColumns
    const map = new Map(allColumns.map(c => [c.key, c]))
    const out = []
    columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
    map.forEach(c => out.push(c))
    return out
  })()

  // Pinned (frozen) columns - persisted to localStorage
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('clientPercentagePagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('clientPercentagePagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])

  // Column resize (per-column widths persisted to localStorage)
  const { setHeaderRef, getHeaderStyle, handleResizeStart } = useColumnResize('clientPercentagePageColumnWidths')

  const PINNED_DEFAULT_WIDTH = 150
  const PINNED_LEADING_OFFSET = 40 // checkbox column width
  const pinnedOffsets = useMemo(() => {
    const map = {}
    let offset = PINNED_LEADING_OFFSET
    for (const col of orderedColumns) {
      if (!visibleColumns[col.key]) continue
      if (pinnedColumns.includes(col.key)) {
        map[col.key] = offset
        offset += PINNED_DEFAULT_WIDTH
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedColumns, visibleColumns, pinnedColumns])

  const applyPin = (cell, colKey, isHeader) => {
    if (!cell || !pinnedColumns.includes(colKey)) return cell
    if (cell.type === Fragment) return cell
    const stickyStyle = {
      position: 'sticky',
      left: `${pinnedOffsets[colKey] || 0}px`,
      zIndex: isHeader ? 21 : 5,
      backgroundColor: isHeader ? '#2563eb' : '#ffffff',
      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
    }
    return cloneElement(cell, {
      style: { ...(cell.props?.style || {}), ...stickyStyle }
    })
  }

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Column filter states removed

  // Track if component is mounted to prevent updates after unmount
  const isMountedRef = useRef(true)

  // Edit modal states
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedClient, setSelectedClient] = useState(null)
  const [editPercentage, setEditPercentage] = useState('')
  const [editComment, setEditComment] = useState('')
  const [saving, setSaving] = useState(false)

  // Bulk update states
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkPercentage, setBulkPercentage] = useState('')
  const [bulkComment, setBulkComment] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // CSV import states
  const [showImportModal, setShowImportModal] = useState(false)
  const [csvData, setCsvData] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvImportProgress, setCsvImportProgress] = useState({ done: 0, total: 0 })
  const [csvError, setCsvError] = useState('')
  const csvFileRef = useRef(null)

  // Export menu state
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportMenuRef = useRef(null)
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState('client_login')
  const [sortDirection, setSortDirection] = useState('asc')

  // Module filter removed (belongs to Live Dealing)

  // Critical: Set unmounted flag ASAP to unblock route transitions
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    fetchAllClientPercentages(1)
  }, [isAuthenticated, unauthorized])

  // Fetch data when search query or sort changes (reset to page 1)
  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    
    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(() => {
      setCurrentPage(1)
      fetchAllClientPercentages(1)
    }, 300)
    
    return () => clearTimeout(timeoutId)
  }, [searchQuery, sortColumn, sortDirection, isAuthenticated, unauthorized])

  // Fetch data when page or page size changes
  useEffect(() => {
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
    if (!isAuthenticated || unauthorized || hidden) return
    fetchAllClientPercentages(currentPage)
  }, [currentPage, itemsPerPage, isAuthenticated, unauthorized])

  useEffect(() => {
    const onRefreshed = () => setUnauthorized(false)
    const onLogout = () => setUnauthorized(true)
    window.addEventListener('auth:token_refreshed', onRefreshed)
    window.addEventListener('auth:logout', onLogout)
    return () => {
      window.removeEventListener('auth:token_refreshed', onRefreshed)
      window.removeEventListener('auth:logout', onLogout)
    }
  }, [])

  // No longer need click outside handler for suggestions

  const fetchAllClientPercentages = async (page = 1) => {
    try {
      setLoading(true)
      setError('')
      
      const params = { 
        page, 
        page_size: itemsPerPage,
        sort_by: sortColumn === 'client_login' ? 'login' : sortColumn === 'client_name' ? 'name' : sortColumn,
        sort_order: sortDirection
      }
      
      // Add search parameter if search query exists
      const trimmedQuery = searchQuery.trim().toLowerCase()
      
      // Check if searching for type (custom/default)
      if (trimmedQuery === 'custom') {
        params.has_custom = true
      } else if (trimmedQuery === 'default') {
        params.has_custom = false
      } else if (trimmedQuery) {
        // Otherwise search by login
        params.login = searchQuery.trim()
      }
      
      const response = await brokerAPI.getAllClientPercentages(params)
      
      const clientsData = response.data?.clients || []
      setClients(clientsData)
      setStats({
        total: response.data?.total || clientsData.length,
        total_custom: response.data?.total_custom || 0,
        total_default: response.data?.total_default || 0,
        default_percentage: response.data?.default_percentage || 0
      })
      
      setLoading(false)
    } catch (err) {
      console.error('Error fetching client percentages:', err)
      setError('Failed to load client percentages')
      if (err?.response?.status === 401) setUnauthorized(true)
      setLoading(false)
    }
  }

  const handleEditClick = (client) => {
    setSelectedClient(client)
    setEditPercentage(client.percentage || '')
    setEditComment(client.comment || '')
    setShowEditModal(true)
  }

  const handleSavePercentage = async () => {
    if (!selectedClient) return
    
    const percentage = parseFloat(editPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }
    
    try {
      setSaving(true)
      await brokerAPI.setClientPercentage(
        selectedClient.client_login,
        percentage,
        editComment || `Custom percentage: ${percentage}%`
      )
      
      // Refresh the list
      await fetchAllClientPercentages()
      
      setShowEditModal(false)
      setSelectedClient(null)
      setEditPercentage('')
      setEditComment('')
      setSaving(false)
    } catch (err) {
      console.error('Error setting client percentage:', err)
      alert('Failed to save percentage. Please try again.')
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setShowEditModal(false)
    setSelectedClient(null)
    setEditPercentage('')
    setEditComment('')
  }

  // Row selection helpers
  const toggleRowSelection = (login) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(login) ? next.delete(login) : next.add(login)
      return next
    })
  }

  const toggleAllRows = (clients) => {
    if (selectedRows.size > 0 && selectedRows.size === clients.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(clients.map(c => c.client_login)))
    }
  }

  // ---- Export to CSV (uses API, chunked) ----
  const buildCSV = (rows) => {
    const exportColumns = allColumns.filter(c => c.key !== 'actions')
    const headers = exportColumns.map(col => col.label).join(',')
    const escape = (v) => {
      let s = v == null ? '' : String(v)
      s = s.replace(/"/g, '""')
      if (s.includes(',') || s.includes('"') || s.includes('\n')) s = `"${s}"`
      return s
    }
    const body = rows.map(item => exportColumns.map(col => {
      switch (col.key) {
        case 'login': return escape(item.client_login || item.login || '')
        case 'clientName': return escape(item.client_name || item.name || '')
        case 'percentage': return escape(item.percentage ?? 0)
        case 'type': return escape(item.is_custom ? 'Custom' : 'Default')
        case 'comment': return escape(item.comment || '')
        case 'updatedAt': return escape(item.updated_at ? new Date(item.updated_at).toLocaleDateString('en-GB') : '')
        default: return escape(item[col.key] ?? '')
      }
    }).join(',')).join('\n')
    return headers + '\n' + body
  }

  const downloadCSV = (csv, filename) => {
    // Prepend BOM so Excel opens UTF-8 correctly.
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = async (mode = 'all') => {
    if (exporting) return

    if (mode === 'selected' && selectedRows.size === 0) {
      alert('No rows selected')
      return
    }

    const sortBy = sortColumn === 'client_login' ? 'login'
      : sortColumn === 'client_name' ? 'name'
      : sortColumn

    const PARALLEL = 12
    const MAX_RETRIES = 3
    const MAX_TOTAL_PAGES = 1000 // hard ceiling against runaway pagination
    const REQUESTED_PAGE_SIZE = 1000

    const fetchChunk = async (page, pageSize) => {
      let lastErr
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const r = await brokerAPI.getAllClientPercentages({
            page,
            page_size: pageSize,
            sort_by: sortBy,
            sort_order: sortDirection,
          })
          return r.data || {}
        } catch (e) {
          lastErr = e
          if (attempt < MAX_RETRIES - 1) {
            await new Promise(res => setTimeout(res, 250 * Math.pow(2, attempt)))
          }
        }
      }
      throw lastErr || new Error(`Failed to fetch page ${page}`)
    }

    try {
      setExporting(true)
      setExportProgress(0)

      // 1) Probe with a large requested size to discover both `total` and the
      //    server's effective max page size (it may cap silently).
      const probe = await fetchChunk(1, REQUESTED_PAGE_SIZE)
      const probeClients = Array.isArray(probe.clients) ? probe.clients : []
      const total = Number(probe.total || 0)

      if (!total) {
        alert('No data to export')
        return
      }

      // Effective page size = whatever the server actually returned.
      // If probe came back empty (server quirk) but total > 0, abort early
      // rather than guessing a size and generating thousands of empty pages.
      if (probeClients.length === 0) {
        throw new Error('Server returned no rows on first page; cannot determine page size.')
      }
      const effectiveSize = probeClients.length

      // Dedupe by login across pages.
      const byLogin = new Map()
      const addClients = (list) => {
        for (const c of (list || [])) {
          const key = c?.client_login ?? c?.login
          if (key == null) continue
          if (!byLogin.has(key)) byLogin.set(key, c)
        }
      }
      addClients(probeClients)

      const totalPages = Math.min(
        Math.max(1, Math.ceil(total / effectiveSize)),
        MAX_TOTAL_PAGES,
      )

      // Progress is tracked by pages completed so it never goes backwards.
      let pagesDone = 1
      const updateProgress = () => setExportProgress(Math.min(pagesDone / totalPages, 1))
      updateProgress()

      // 2) Fetch remaining pages in parallel batches.
      // Track failed pages separately from empty pages so we don't conflate
      // hard errors with legitimately empty results.
      const failedPages = []
      const emptyPages = []

      for (let page = 2; page <= totalPages; page += PARALLEL) {
        const pages = []
        for (let i = 0; i < PARALLEL && (page + i) <= totalPages; i++) pages.push(page + i)
        const results = await Promise.all(
          pages.map(p => fetchChunk(p, REQUESTED_PAGE_SIZE)
            .then(d => ({ p, d, ok: true }))
            .catch(err => ({ p, err, ok: false }))
          )
        )
        for (const res of results) {
          pagesDone++
          if (!res.ok) {
            console.warn(`[ClientPercentage] Page ${res.p} failed after retries:`, res.err)
            failedPages.push(res.p)
            continue
          }
          const list = Array.isArray(res.d.clients) ? res.d.clients : []
          if (list.length === 0) emptyPages.push(res.p)
          else addClients(list)
        }
        updateProgress()
      }

      // 3) Final retry for failed pages only (fetchChunk already exhausted its
      //    own retries; one more end-of-run attempt is a deliberate, separate
      //    pass for transient outages).
      if (failedPages.length) {
        const recovered = await Promise.all(
          failedPages.map(p => fetchChunk(p, REQUESTED_PAGE_SIZE)
            .then(d => Array.isArray(d.clients) ? d.clients : [])
            .catch(() => null)
          )
        )
        recovered.forEach((list, i) => {
          if (list === null) {
            console.warn(`[ClientPercentage] Page ${failedPages[i]} unrecoverable; rows may be missing.`)
          } else if (list.length === 0) {
            emptyPages.push(failedPages[i])
          } else {
            addClients(list)
          }
        })
      }

      // 4) Forward-walk safety net for off-by-one totals. Bound by both a
      //    hard page count and the remaining-row gap to avoid runaway loops.
      if (byLogin.size < total) {
        let nextPage = totalPages + 1
        const remaining = total - byLogin.size
        const extraBudget = Math.min(
          Math.ceil(remaining / effectiveSize) + 2, // cover the gap + small slack
          Math.max(0, MAX_TOTAL_PAGES - totalPages),
        )
        for (let i = 0; i < extraBudget && byLogin.size < total; i++) {
          let list
          try {
            const d = await fetchChunk(nextPage, REQUESTED_PAGE_SIZE)
            list = Array.isArray(d.clients) ? d.clients : []
          } catch {
            break
          }
          if (!list.length) break
          const before = byLogin.size
          addClients(list)
          if (byLogin.size === before) break // server returning duplicates
          nextPage++
        }
      }

      const allRows = Array.from(byLogin.values())
      if (!allRows.length) {
        alert('No data to export')
        return
      }
      if (allRows.length < total) {
        console.warn(`[ClientPercentage] Export collected ${allRows.length} of ${total} rows.`)
      }

      // For "selected" mode, filter to only the chosen logins.
      const finalRows = mode === 'selected'
        ? allRows.filter(c => selectedRows.has(c.client_login) || selectedRows.has(c.login))
        : allRows

      if (!finalRows.length) {
        alert('Selected rows not found in dataset')
        return
      }

      const suffix = mode === 'selected' ? 'selected' : 'all'
      const csv = buildCSV(finalRows)
      downloadCSV(csv, `client_percentage_${suffix}_${new Date().toISOString().split('T')[0]}.csv`)
    } catch (err) {
      console.error('[ClientPercentage] Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
      setExportProgress(0)
    }
  }

  // Bulk update handler
  const handleBulkUpdate = async () => {
    const percentage = parseFloat(bulkPercentage)
    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
      alert('Please enter a valid percentage between 0 and 100')
      return
    }
    try {
      setBulkSaving(true)
      const clients = Array.from(selectedRows).map(login => ({
        login,
        percentage,
        comment: bulkComment || `Bulk update: ${percentage}%`
      }))
      await brokerAPI.bulkUpdateClientPercentages(clients)
      await fetchAllClientPercentages()
      setShowBulkModal(false)
      setSelectedRows(new Set())
      setBulkPercentage('')
      setBulkComment('')
    } catch (err) {
      console.error('Error bulk updating percentages:', err)
      alert('Failed to bulk update. Please try again.')
    } finally {
      setBulkSaving(false)
    }
  }

  // CSV import handlers

  // Full RFC-4180 CSV parser — single pass over entire text so quoted fields
  // containing commas OR newlines are handled correctly.
  const parseCSVFull = (text) => {
    const rows = []
    // Strip BOM
    let i = text.charCodeAt(0) === 0xFEFF ? 1 : 0
    const n = text.length

    while (i < n) {
      const fields = []
      while (i < n) {
        if (text[i] === '"') {
          // Quoted field
          let field = ''
          i++ // skip opening quote
          while (i < n) {
            if (text[i] === '"') {
              if (i + 1 < n && text[i + 1] === '"') { field += '"'; i += 2 } // escaped ""
              else { i++; break } // closing quote
            } else {
              field += text[i++]
            }
          }
          fields.push(field)
        } else {
          // Unquoted field — read until comma or end of line
          let start = i
          while (i < n && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') i++
          fields.push(text.slice(start, i).trim())
        }
        // Comma → next field; newline/end → end of row
        if (i < n && text[i] === ',') { i++; continue }
        break
      }
      // Consume line ending
      if (i < n && text[i] === '\r') i++
      if (i < n && text[i] === '\n') i++
      // Skip entirely blank rows
      if (fields.length > 0 && !(fields.length === 1 && fields[0] === '')) rows.push(fields)
    }
    return rows
  }

  const handleCSVFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setCsvError('')
    setCsvData([])
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target.result
        const allRows = parseCSVFull(text)
        if (allRows.length < 2) { setCsvError('CSV must have a header row and at least one data row'); return }
        const headers = allRows[0].map(h => h.trim().toLowerCase())
        const loginIdx = headers.findIndex(h => h === 'login' || h === 'client login')
        const pctIdx = headers.findIndex(h => h === 'percentage')
        const cmtIdx = headers.findIndex(h => h === 'comment')
        if (loginIdx === -1 || pctIdx === -1) { setCsvError('CSV must have "Client Login" and "Percentage" columns'); return }
        const rows = []
        const errors = []
        for (let i = 1; i < allRows.length; i++) {
          const cols = allRows[i]
          const login = parseInt(cols[loginIdx])
          const pct = parseFloat(cols[pctIdx])
          const comment = cmtIdx !== -1 && cols[cmtIdx] ? cols[cmtIdx] : ''
          if (isNaN(login)) { errors.push(`Row ${i + 1}: invalid login "${cols[loginIdx]}"`); continue }
          if (isNaN(pct) || pct < 0 || pct > 100) { errors.push(`Row ${i + 1}: invalid percentage "${cols[pctIdx]}"`); continue }
          rows.push({ login, percentage: pct, comment })
        }
        if (errors.length > 0) setCsvError(errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n...and ${errors.length - 3} more` : ''))
        if (rows.length === 0) { if (!errors.length) setCsvError('No valid data rows found'); return }
        setCsvData(rows)
      } catch { setCsvError('Failed to parse CSV file') }
    }
    reader.readAsText(file)
  }

  const handleCSVImport = async () => {
    if (csvData.length === 0) return
    const BATCH_SIZE = 500
    const totalBatches = Math.ceil(csvData.length / BATCH_SIZE)
    try {
      setCsvImporting(true)
      setCsvImportProgress({ done: 0, total: csvData.length })
      for (let i = 0; i < csvData.length; i += BATCH_SIZE) {
        const batch = csvData.slice(i, i + BATCH_SIZE)
        await brokerAPI.bulkUpdateClientPercentages(batch)
        setCsvImportProgress({ done: Math.min(i + BATCH_SIZE, csvData.length), total: csvData.length })
      }
      await fetchAllClientPercentages()
      setShowImportModal(false)
      setCsvData([])
      setCsvError('')
      setCsvImportProgress({ done: 0, total: 0 })
      if (csvFileRef.current) csvFileRef.current.value = ''
    } catch (err) {
      console.error('Error importing CSV:', err)
      setCsvError('Failed to import. Please try again.')
    } finally {
      setCsvImporting(false)
      setCsvImportProgress({ done: 0, total: 0 })
    }
  }

  // Note: Search is now handled by API, not client-side
  // The API endpoint accepts 'login' parameter for searching

  // Handle search - triggered by search icon click or Enter key
  const handleSearch = () => {
    setSearchQuery(searchInput)
    setCurrentPage(1)
  }

  // Get card icon path based on card title
  const getCardIcon = (cardTitle) => {
    const iconMap = {
      'Total Clients': '/desktop-icons/Clients.svg',
      'Custom Percentages': '/desktop-icons/Custom Percentages.svg',
      'Using Default': '/desktop-icons/Using Default.svg',
      'Default Percentage': '/desktop-icons/Default Percentage.svg',
    }
    return iconMap[cardTitle] || '/desktop-icons/Clients.svg'
  }

  // Sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const sortedClients = () => {
    // API handles search and sort — preserve server order, just apply group filter
    return filterByActiveGroup(clients, 'client_login', 'clientpercentage')
  }

  // Pagination
  const handlePageChange = (page) => {
    setCurrentPage(page)
  }

  const handleItemsPerPageChange = (value) => {
    setItemsPerPage(value)
    setCurrentPage(1)
  }

  const getAvailableOptions = () => {
    const totalItems = stats.total
    const options = []
    
    // Start from 100 and increment by 100, dynamically based on total data
    for (let i = 100; i <= totalItems; i += 100) {
      options.push(i)
      if (options.length >= 10) break // Limit to 10 options
    }
    
    // If no options generated or total is less than 100, add at least one option
    if (options.length === 0) {
      options.push(Math.max(100, totalItems))
    }
    
    return options
  }

  const paginatedClients = () => {
    // Server-side pagination: just return sorted clients as-is
    return sortedClients()
  }

  const totalPages = Math.ceil(stats.total / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const displayedClients = paginatedClients()

  // Close column selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showColumnSelector && columnSelectorRef.current) {
        if (!columnSelectorRef.current.contains(event.target)) {
          setShowColumnSelector(false)
        }
      }
      if (showExportMenu && exportMenuRef.current) {
        if (!exportMenuRef.current.contains(event.target)) {
          setShowExportMenu(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showColumnSelector, showExportMenu])

  // Helper function to render sortable table header (no column filter)
  const renderHeaderCell = (columnKey, label, sortKey = null) => {
    if (!sortKey) {
      return (
        <th
          ref={setHeaderRef(columnKey)}
          className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider select-none border-b border-blue-500"
          style={{ backgroundColor: '#2563eb', ...getHeaderStyle(columnKey) }}
        >
          <span>{label}</span>
          <ColumnResizeHandle columnKey={columnKey} onResizeStart={handleResizeStart} />
        </th>
      )
    }
    return (
      <th
        ref={setHeaderRef(columnKey)}
        className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider hover:bg-blue-700 transition-colors select-none group border-b border-blue-500 cursor-pointer"
        style={{ backgroundColor: '#2563eb', ...getHeaderStyle(columnKey) }}
        onClick={() => {
          setSortColumn(sortKey)
          setSortDirection(prev => sortColumn === sortKey && prev === 'asc' ? 'desc' : 'asc')
        }}
      >
        <div className="flex items-center gap-1 text-white">
          <span>{label}</span>
          {getSortIcon(sortKey)}
        </div>
        <ColumnResizeHandle columnKey={columnKey} onResizeStart={handleResizeStart} />
      </th>
    )
  }

  const getSortIcon = (column) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 opacity-0 group-hover:opacity-40 text-white transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
      return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-white rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    )
  }

  // Detect mobile and update state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // If mobile, use mobile module (after all hooks are called)
  if (isMobile) {
    return <ClientPercentageModule />
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {exporting && (
        <LoadingSpinner
          message="Exporting..."
          subtitle="Preparing your spreadsheet"
          progress={typeof exportProgress === 'number' ? Math.round(exportProgress * 100) : null}
        />
      )}
      {csvImporting && (
        <LoadingSpinner
          message="Importing..."
          subtitle={csvImportProgress.total > 0 ? `${csvImportProgress.done} / ${csvImportProgress.total} rows` : 'Please wait'}
          progress={csvImportProgress.total > 0 ? Math.round((csvImportProgress.done / csvImportProgress.total) * 100) : null}
        />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {}; return n })}
      />
      
      <main className={`flex-1 p-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Section */}
          <div className="bg-white rounded-2xl shadow-sm px-6 py-3 mb-6">
            {/* Title + Actions */}
            <div className="mb-1.5 pb-1.5 flex items-center justify-between gap-3">
            {/* Title Section */}
            <div>
              <h1 className="text-xl font-bold text-[#1A1A1A]">Client Percentage</h1>
              <p className="text-xs text-[#6B7280] mt-0.5">Manage custom profit-sharing percentages</p>
            </div>

            {/* Action Buttons - All on right side */}
            <div className="flex items-center gap-2">
                  {/* Import CSV Button */}
                  {canSetPercentage && (
                  <button
                    onClick={() => { setCsvData([]); setCsvError(''); if (csvFileRef.current) csvFileRef.current.value = ''; setShowImportModal(true) }}
                    className="h-10 px-3 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1.5 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
                    title="Import CSV"
                  >
                    <svg className="w-4 h-4 text-grey-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import CSV
                  </button>
                  )}

                  {/* Export Button (with dropdown) */}
                  <div className="relative" ref={exportMenuRef}>
                    <button
                      onClick={() => setShowExportMenu(v => !v)}
                      disabled={exporting}
                      className="h-10 px-3 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center gap-1.5 hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      title="Export to CSV"
                    >
                      <svg className="w-4 h-4 text-grey-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16" />
                      </svg>
                      {exporting
                        ? `Exporting… ${Math.round((exportProgress || 0) * 100)}%`
                        : 'Export'}
                      {!exporting && (
                        <svg className="w-3 h-3 ml-0.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </button>
                    {showExportMenu && !exporting && (
                      <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-50 py-1">
                        <button
                          onClick={() => { setShowExportMenu(false); handleExport('all') }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                        >
                          <span>Download All</span>
                          <span className="text-xs text-gray-500">{stats.total || ''}</span>
                        </button>
                        <button
                          onClick={() => { setShowExportMenu(false); handleExport('selected') }}
                          disabled={selectedRows.size === 0}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between"
                        >
                          <span>Download Selected</span>
                          <span className="text-xs text-gray-500">{selectedRows.size}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* <GroupSelector 
                    moduleName="clientpercentage" 
                    onCreateClick={() => {
                      console.log('[ClientPercentagePage] onCreateClick called')
                      console.log('[ClientPercentagePage] Current showGroupModal:', showGroupModal)
                      setEditingGroup(null)
                      setShowGroupModal(true)
                      console.log('[ClientPercentagePage] Set showGroupModal to true')
                    }}
                    onEditClick={(group) => {
                      console.log('[ClientPercentagePage] onEditClick called for group:', group)
                      setEditingGroup(group)
                      setShowGroupModal(true)
                    }}
                  /> */}

                  {/* Refresh Button */}
                  <button
                    onClick={() => {
                      if (isRefreshing) return
                      setIsRefreshing(true)
                      fetchAllClientPercentages(1).finally(() => setTimeout(() => setIsRefreshing(false), 1000))
                    }}
                    disabled={isRefreshing}
                    className={`h-9 w-9 rounded-md border shadow-sm flex items-center justify-center transition-all ${
                      isRefreshing
                        ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-50'
                        : 'bg-white border-[#E5E7EB] hover:bg-gray-50 cursor-pointer'
                    }`}
                    title={isRefreshing ? 'Refreshing...' : 'Refresh percentages'}
                  >
                    <svg
                      className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-r p-4 shadow-sm">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Summary Cards - Client2 Face Card Design */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Total Clients</span>
                <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 p-1">
                  <img 
                    src={getCardIcon('Total Clients')} 
                    alt="Total Clients"
                    style={{ width: '100%', height: '100%', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.total}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Custom Percentages</span>
                <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 p-1">
                  <img 
                    src={getCardIcon('Custom Percentages')} 
                    alt="Custom Percentages"
                    style={{ width: '100%', height: '100%', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? String(stats.total_custom) : undefined}>{fmtCount(stats.total_custom)}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Using Default</span>
                <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 p-1">
                  <img 
                    src={getCardIcon('Using Default')} 
                    alt="Using Default"
                    style={{ width: '100%', height: '100%', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span title={numericMode === 'compact' ? String(stats.total_default) : undefined}>{fmtCount(stats.total_default)}</span>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] p-2 hover:md:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">Default Percentage</span>
                <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 p-1">
                  <img 
                    src={getCardIcon('Default Percentage')} 
                    alt="Default Percentage"
                    style={{ width: '100%', height: '100%', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                  />
                </div>
              </div>
              <div className="text-sm md:text-base font-bold text-[#000000] flex items-center gap-1.5 leading-none">
                <span>{stats.default_percentage}%</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow-sm border border-[#E5E7EB] overflow-hidden flex flex-col flex-1">
              {/* Search and Controls Bar - Inside table container */}
              <div className="border-b border-[#E5E7EB] p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: Search and Columns */}
                  <div className="flex items-center gap-2 flex-1">
                    {/* Search Bar */}
                    <div className="relative flex-1 max-w-md" ref={searchRef}>
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA3AF]" fill="none" viewBox="0 0 18 18">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      <input
                        type="text"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search by Login and Type"
                        className="w-full h-10 pl-10 pr-20 text-sm border border-[#E5E7EB] rounded-lg bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {searchInput && (
                          <button
                            onClick={() => {
                              setSearchInput('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="w-7 h-7 flex items-center justify-center text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                            title="Clear search"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={handleSearch}
                          className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                          title="Search"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Columns Button (icon only) */}
                    <div className="relative">
                      <button
                        onClick={() => setShowColumnSelector(!showColumnSelector)}
                        className="h-10 w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                        title="Show/Hide Columns"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <line x1="2" y1="4" x2="14" y2="4" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                          <circle cx="6" cy="4" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                          <line x1="2" y1="8" x2="14" y2="8" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                          <circle cx="11" cy="8" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                          <line x1="2" y1="12" x2="14" y2="12" stroke="#4B5563" strokeWidth="1.5" strokeLinecap="round"/>
                          <circle cx="7" cy="12" r="1.5" fill="white" stroke="#4B5563" strokeWidth="1.5"/>
                        </svg>
                      </button>
                      {showColumnSelector && (
                        <div
                          ref={columnSelectorRef}
                          className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-0 z-50 flex flex-col"
                          style={{ width: 280, maxHeight: '60vh' }}
                        >
                          <div className="px-3 py-2 border-b border-[#F3F4F6] flex items-center justify-between">
                            <p className="text-xs font-semibold text-[#1F2937] uppercase">Show/Hide & Reorder</p>
                            <div className="relative group">
                              <button
                                onClick={resetColumnOrder}
                                className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                aria-label="Reset column order"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 20v-6h-6" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 10a8 8 0 0114-3m2 7a8 8 0 01-14 3" />
                                </svg>
                              </button>
                              <span className="absolute right-0 top-full mt-1 hidden group-hover:block bg-gray-900 text-white text-[10px] font-medium px-2 py-1 rounded whitespace-nowrap z-50 pointer-events-none shadow">
                                Reset Order
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 min-h-0 flex flex-col">
                            <ColumnChooserList
                              columns={allColumns}
                              visibleColumns={visibleColumns}
                              onToggle={toggleColumn}
                              columnOrder={columnOrder}
                              onReorder={(newOrder) => setColumnOrder(newOrder)}
                              accent="blue"
                              title={null}
                              pinnedColumns={pinnedColumns}
                              onPinToggle={togglePinColumn}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Import CSV Button */}
                    {/* moved to header next to Groups */}

                    {/* Export Button (with dropdown) */}
                    {/* moved to header next to Groups */}

                    {/* Bulk Update Button */}
                    {selectedRows.size > 0 && (
                      <button
                        onClick={() => { setBulkPercentage(''); setBulkComment(''); setShowBulkModal(true) }}
                        className="h-10 px-3 rounded-md bg-blue-600 text-white border border-blue-600 shadow-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors text-sm font-medium"
                        title="Bulk Update Selected"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Bulk Update ({selectedRows.size})
                      </button>
                    )}
                  </div>

                  {/* Right: Pagination */}
                  <div className="flex items-center gap-2">
                    <div className="mr-1">
                      <PageSizeSelect value={itemsPerPage} onChange={handleItemsPerPageChange} />
                    </div>
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        currentPage === 1
                          ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                          : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    <div className="px-3 py-1.5 text-sm font-medium text-[#374151] flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={currentPage}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          if (!isNaN(n) && n >= 1 && n <= totalPages) {
                            handlePageChange(n)
                          }
                        }}
                        className="w-12 h-7 border border-[#E5E7EB] rounded-lg text-center text-sm font-semibold text-[#1F2937]"
                        aria-label="Current page"
                      />
                      <span className="text-[#9CA3AF]">/</span>
                      <span className="text-[#6B7280]">{totalPages}</span>
                    </div>

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                        currentPage === totalPages
                          ? 'text-[#D1D5DB] bg-[#F9FAFB] cursor-not-allowed'
                          : 'text-[#374151] bg-white border border-[#E5E7EB] hover:bg-gray-50'
                      }`}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                <table className="min-w-full divide-y text-xs border-separate border-spacing-0" style={{ borderCollapse: 'separate', borderColor: '#e5e7eb' }}>
                <thead className="bg-blue-600 sticky top-0 z-10" style={{ backgroundColor: '#2563eb' }}>
                  <tr className="divide-x divide-blue-400">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-white" style={{ backgroundColor: '#2563eb', width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={displayedClients.length > 0 && selectedRows.size === displayedClients.length}
                        onChange={() => toggleAllRows(displayedClients)}
                        className="w-3.5 h-3.5 rounded border-white/50 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </th>
                    {orderedColumns.map(col => {
                      if (!visibleColumns[col.key]) return null
                      let cell = null
                      switch (col.key) {
                        case 'login': cell = renderHeaderCell('client_login', 'Client Login', 'client_login'); break
                        case 'clientName': cell = renderHeaderCell('client_name', 'Client Name', 'client_name'); break
                        case 'percentage': cell = renderHeaderCell('percentage', 'Percentage', 'percentage'); break
                        case 'type': cell = renderHeaderCell('is_custom', 'Type'); break
                        case 'comment': cell = (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider" style={{ backgroundColor: '#2563eb' }}>
                            Comment
                          </th>
                        ); break
                        case 'updatedAt': cell = renderHeaderCell('updated_at', 'Last Updated'); break
                        case 'actions': cell = canSetPercentage ? (
                          <th className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider" style={{ backgroundColor: '#2563eb' }}>
                            Actions
                          </th>
                        ) : null; break
                        default: cell = null
                      }
                      cell = applyPin(cell, col.key, true)
                      return <Fragment key={col.key}>{cell}</Fragment>
                    })}
                  </tr>
                  {loading && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="p-0 bg-blue-600">
                        <div className="table-loading-bar" />
                      </td>
                    </tr>
                  )}
                </thead>

                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                  {loading ? (
                    Array.from({ length: 8 }, (_, i) => {
                      const colCount = Object.values(visibleColumns).filter(v => v).length + 1
                      return (
                        <tr key={`pct-skeleton-${i}`} className="bg-white border-b border-[#E1E1E1]">
                          {Array.from({ length: colCount }, (_, c) => (
                            <td key={c} className="px-2" style={{ height: '38px' }}>
                              <div className="h-3 w-full max-w-[80%] skeleton-shimmer-pos" />
                            </td>
                          ))}
                        </tr>
                      )
                    })
                  ) : displayedClients.length === 0 ? (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(v => v).length + 1} className="px-6 py-8 text-center">
                        <div className="flex flex-col items-center gap-4">
                          <svg className="w-16 h-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-gray-600 text-lg font-semibold mb-2">No clients found</p>
                            <p className="text-gray-500 text-sm mb-4">Try adjusting your filters</p>
                          </div>
                          <button
                            onClick={() => {
                              setSearchInput('')
                              setSearchQuery('')
                              setCurrentPage(1)
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-sm hover:shadow-md text-sm font-semibold"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Clear Search
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                  displayedClients.map((client, index) => (
                    <tr key={client.client_login} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-3 whitespace-nowrap" style={{ borderRight: '1px solid #e5e7eb', width: '40px' }}>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(client.client_login)}
                          onChange={() => toggleRowSelection(client.client_login)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                      {orderedColumns.map(col => {
                        if (!visibleColumns[col.key]) return null
                        let cell = null
                        switch (col.key) {
                          case 'login': cell = (
                            <td
                              className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer hover:underline"
                              style={{ borderRight: '1px solid #e5e7eb' }}
                              onClick={() => setSelectedLogin(client.client_login)}
                              title="Click to view login details"
                            >
                              {client.client_login}
                            </td>
                          ); break
                          case 'clientName': cell = (
                            <td className="px-4 py-3 text-sm text-gray-700 break-words" style={{ borderRight: '1px solid #e5e7eb', minWidth: '120px', maxWidth: '180px', width: '150px', wordBreak: 'break-word', whiteSpace: 'normal' }}>
                              {client.client_name || '-'}
                            </td>
                          ); break
                          case 'percentage': cell = (
                            <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ borderRight: '1px solid #e5e7eb' }}>
                              <span className={`px-2 py-1 rounded text-sm font-semibold ${
                                client.is_custom
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {client.percentage}%
                              </span>
                            </td>
                          ); break
                          case 'type': cell = (
                            <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ borderRight: '1px solid #e5e7eb' }}>
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                client.is_custom
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {client.is_custom ? 'Custom' : 'Default'}
                              </span>
                            </td>
                          ); break
                          case 'comment': cell = (
                            <td className="px-4 py-3 text-sm text-gray-700 max-w-xs truncate" style={{ borderRight: '1px solid #e5e7eb' }}>
                              {client.comment || '-'}
                            </td>
                          ); break
                          case 'updatedAt': cell = (
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500" style={{ borderRight: '1px solid #e5e7eb' }}>
                              {client.updated_at ? new Date(client.updated_at).toLocaleDateString('en-GB') : '-'}
                            </td>
                          ); break
                          case 'actions': cell = canSetPercentage ? (
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <button
                                onClick={() => handleEditClick(client)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                Edit
                              </button>
                            </td>
                          ) : null; break
                          default: cell = null
                        }
                        cell = applyPin(cell, col.key, false)
                        return <Fragment key={col.key}>{cell}</Fragment>
                      })}
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
        </div>
      </main>

      {/* Edit Modal */}
      {showEditModal && selectedClient && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-xl w-full overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-8 py-5 bg-blue-600 border-b border-blue-700">
              <h2 className="text-xl font-semibold text-white">
                Set Custom Percentage
              </h2>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="text-white/80 hover:text-white transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-8 py-6">
              <div className="space-y-6">
                {/* Client Information */}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Client Login
                  </label>
                  <input
                    type="text"
                    value={selectedClient.client_login}
                    readOnly
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                {/* Percentage Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Percentage (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editPercentage}
                      onChange={(e) => setEditPercentage(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-4 py-2.5 pr-10 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                      required
                      disabled={saving}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">Value must be between 0 and 100</p>
                </div>

                {/* Comment Textarea */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Comment
                  </label>
                  <textarea
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 resize-none"
                    placeholder="Optional comment about this percentage"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex items-center gap-3 pt-6 mt-6 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="flex-1 px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 active:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePercentage}
                  disabled={saving}
                  className="flex-1 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save Percentage'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Create Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => {
          setShowGroupModal(false)
          setEditingGroup(null)
        }}
        availableItems={clients}
        loginField="client_login"
        displayField="percentage"
        secondaryField="type"
        editGroup={editingGroup}
      />

      {/* Bulk Update Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-600 border-b border-blue-700">
              <h2 className="text-lg font-semibold text-white">Bulk Update Percentages</h2>
              <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="text-white/80 hover:text-white transition-colors disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-gray-600">Update percentage for <span className="font-semibold text-blue-600">{selectedRows.size}</span> selected client{selectedRows.size !== 1 ? 's' : ''}.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Percentage (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={bulkPercentage}
                    onChange={(e) => setBulkPercentage(e.target.value)}
                    placeholder="0.00"
                    disabled={bulkSaving}
                    className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">Value must be between 0 and 100</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
                <textarea
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  rows={2}
                  disabled={bulkSaving}
                  placeholder="Optional comment"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-md text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 resize-none"
                />
              </div>
              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                <button onClick={() => setShowBulkModal(false)} disabled={bulkSaving} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleBulkUpdate} disabled={bulkSaving || !bulkPercentage} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {bulkSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                      Saving...
                    </span>
                  ) : `Update ${selectedRows.size} Client${selectedRows.size !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-600 border-b border-blue-700">
              <h2 className="text-lg font-semibold text-white">Import CSV</h2>
              <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="text-white/80 hover:text-white transition-colors disabled:opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-700">
                <p className="font-semibold mb-1">CSV Format (matches exported file):</p>
                <p>Required columns: <code className="bg-blue-100 px-1 rounded">Client Login</code>, <code className="bg-blue-100 px-1 rounded">Percentage</code></p>
                <p>Optional column: <code className="bg-blue-100 px-1 rounded">Comment</code></p>
                <p className="mt-1">Example: <code className="bg-blue-100 px-1 rounded">Client Login,Client Name,Percentage,Type,Comment,Last Updated</code></p>
                <p><code className="bg-blue-100 px-1 rounded">12345,John Doe,15.5,Custom,Bulk import,01/05/2026</code></p>
                <p className="mt-1 text-blue-600">Tip: You can directly import the file downloaded using the Export button.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV File</label>
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCSVFile}
                  disabled={csvImporting}
                  className="block w-full text-sm text-gray-700 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer cursor-pointer"
                />
              </div>

              {csvError && (
                <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700 whitespace-pre-line">{csvError}</div>
              )}

              {csvData.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{csvData.length} row{csvData.length !== 1 ? 's' : ''} ready to import:</p>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Login</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Percentage</th>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 border-b">Comment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvData.map((row, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="px-3 py-1.5 text-blue-600 font-medium">{row.login}</td>
                            <td className="px-3 py-1.5 text-green-700 font-semibold">{row.percentage}%</td>
                            <td className="px-3 py-1.5 text-gray-600 truncate max-w-xs">{row.comment || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                <button onClick={() => { setShowImportModal(false); setCsvData([]); setCsvError('') }} disabled={csvImporting} className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleCSVImport} disabled={csvImporting || csvData.length === 0} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
                  {csvData.length > 0 ? `Import ${csvData.length} Row${csvData.length !== 1 ? 's' : ''}` : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Client Positions Modal */}
      {selectedLogin && (
        <ClientPositionsModal
          client={{ login: selectedLogin }}
          onClose={() => setSelectedLogin(null)}
          onClientUpdate={() => {}}
          allPositionsCache={[]}
          allOrdersCache={[]}
          onCacheUpdate={() => {}}
        />
      )}
    </div>
  )
}

export default ClientPercentagePage
