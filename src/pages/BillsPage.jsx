import { useState, useEffect, useMemo, useRef, useCallback, Fragment, cloneElement } from 'react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { brokerAPI } from '../services/api'
import Sidebar from '../components/Sidebar'
import LoadingSpinner from '../components/LoadingSpinner'
import PageSizeSelect from '../components/PageSizeSelect'
import GroupSelector from '../components/GroupSelector'
import GroupModal from '../components/GroupModal'
import ColumnChooserList from '../components/ColumnChooserList'
import useColumnResize, { ColumnResizeHandle } from '../hooks/useColumnResize'
import CustomizeViewModal from '../components/CustomizeViewModal'
import LoginGroupsModal from '../components/LoginGroupsModal'
import LoginGroupModal from '../components/LoginGroupModal'
import ClientPositionsModal from '../components/ClientPositionsModal'
import ClientDetailsMobileModal from '../components/ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'

const fmtMoney = (n) => {
  const num = Number(n)
  if (!Number.isFinite(num)) return '0.00'
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Format a number for PDF table cells (Indian grouping, 2 decimals)
const pdfNum = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return ''
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Compute the Net Amount for a bill object.
// Prefers the API-provided TotalNetAmount; falls back to Gross − Brokerage if missing.
const computeBillNet = (bill) => {
  if (bill && bill.TotalNetAmount != null) return Number(bill.TotalNetAmount) || 0
  const gross = Number(bill?.TotalGrossAmount) || 0
  const brokerage = Number(bill?.TotalBrokerage) || 0
  return gross - brokerage
}

// "2026-05-19 17:02:51" -> "19/05/2026\n17:02:51"
const formatDealDate = (dt) => {
  if (!dt) return ''
  const m = String(dt).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})/)
  if (!m) return String(dt)
  return `${m[3]}/${m[2]}/${m[1]}\n${m[4]}`
}

// Current timestamp in "DD-Mon-YYYY HH:MM:SS" format
const formatNowStamp = () => {
  const d = new Date()
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// Navy blue palette for PDF (matches a darker, formal bill style)
const HEADER_FILL = [15, 42, 96]    // navy blue
// Buy = #15803D @ 25% opacity over white  ->  blended RGB
const BUY_FILL    = [197, 223, 207]
const BUY_TEXT    = [21, 128, 61]   // #15803D solid green for text
// Sell = #B91C1C @ 25% opacity over white  ->  blended RGB
const SELL_FILL   = [238, 198, 198]
const SELL_TEXT   = [185, 28, 28]   // #B91C1C solid red for text
const RED_TEXT    = [192, 0, 0]     // loss text color
const GREEN_TEXT  = [21, 128, 61]   // profit text color
const BORDER      = [15, 42, 96]    // table border navy

// Render a single login's bill onto the current PDF page
const renderBill = (doc, bill) => {
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 36
  let y = 30

  // Top horizontal rules + centered title "BILL OF <Login>"
  doc.setDrawColor(170)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  y += 18
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0, 0, 0)
  doc.text(`BILL OF ${bill.Login}`, pageW / 2, y, { align: 'center' })
  y += 8
  doc.line(margin, y, pageW - margin, y)
  y += 22

  // Top-right timestamp
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(formatNowStamp(), pageW - margin, y, { align: 'right' })
  y += 18

  const symbols = bill.Symbols || []

  // Per-symbol stats: deal arrays + buy/sell tallies for the table body.
  // Gross / Brokerage / Net come straight from the API response.
  const symStats = symbols.map((sym) => {
    const buy = Array.isArray(sym.BUY) ? sym.BUY : []
    const sell = Array.isArray(sym.SELL) ? sym.SELL : []
    let buyVol = 0, buyComm = 0, buyPnl = 0
    let sellVol = 0, sellComm = 0, sellPnl = 0
    buy.forEach(e => {
      buyVol += Number(e.Quantity) || 0
      buyComm += Number(e.Brokerage) || 0
      buyPnl += Number(e.PnL) || 0
    })
    sell.forEach(e => {
      sellVol += Number(e.Quantity) || 0
      sellComm += Number(e.Brokerage) || 0
      sellPnl += Number(e.PnL) || 0
    })
    const grossSym  = Number(sym.TotalGrossAmount) || 0
    const brokerSym = Number(sym.TotalBrokerage)   || 0
    const netSym    = sym.TotalNetAmount != null ? (Number(sym.TotalNetAmount) || 0) : (grossSym - brokerSym)
    return { buy, sell, buyVol, buyComm, buyPnl, sellVol, sellComm, sellPnl, grossSym, brokerSym, netSym }
  })

  // SUMMARY table at the top (centered) — use API-provided totals directly
  const summaryWidth = 300
  const summaryLeft = (pageW - summaryWidth) / 2
  const totalGross     = Number(bill.TotalGrossAmount) || 0
  const totalBrokerage = Number(bill.TotalBrokerage)   || 0
  const netTotal       = bill.TotalNetAmount != null ? (Number(bill.TotalNetAmount) || 0) : (totalGross - totalBrokerage)
  autoTable(doc, {
    startY: y,
    theme: 'grid',
    head: [
      [{ content: 'SUMMARY', colSpan: 3, styles: { halign: 'center', fillColor: HEADER_FILL, textColor: 255, fontStyle: 'bold' } }],
      [
        { content: 'Gross Amount', styles: { halign: 'center', fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' } },
        { content: 'Brokrage',     styles: { halign: 'center', fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' } },
        { content: 'Net Amount',   styles: { halign: 'center', fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold' } },
      ],
    ],
    body: [[
      { content: pdfNum(totalGross),     styles: { halign: 'center', fontStyle: 'bold', textColor: totalGross     > 0 ? GREEN_TEXT : totalGross     < 0 ? RED_TEXT : [0, 0, 0] } },
      { content: pdfNum(totalBrokerage), styles: { halign: 'center', fontStyle: 'bold', textColor: totalBrokerage > 0 ? GREEN_TEXT : totalBrokerage < 0 ? RED_TEXT : [0, 0, 0] } },
      { content: pdfNum(netTotal),       styles: { halign: 'center', fontStyle: 'bold', textColor: netTotal       > 0 ? GREEN_TEXT : netTotal       < 0 ? RED_TEXT : [0, 0, 0] } },
    ]],
    styles: { fontSize: 9, cellPadding: 6, lineColor: BORDER, lineWidth: 0.3 },
    tableWidth: summaryWidth,
    margin: { left: summaryLeft, right: summaryLeft },
  })
  y = (doc.lastAutoTable?.finalY || y) + 18

  for (let si = 0; si < symbols.length; si++) {
    const sym = symbols[si]
    const { buy, sell, buyVol, buyComm, buyPnl, sellVol, sellComm, sellPnl, grossSym, brokerSym, netSym } = symStats[si]
    const symbolName = sym.Symbol || sym.symbol || sym.Name || ''

    // Buy/Sell paired rows
    const maxRows = Math.max(buy.length, sell.length)
    const body = []
    for (let i = 0; i < maxRows; i++) {
      const b = buy[i]
      const s = sell[i]
      body.push([
        b ? formatDealDate(b.Datetime) : '',
        b ? pdfNum(b.Price) : '',
        b ? pdfNum(b.Quantity) : '',
        b ? pdfNum(b.Brokerage) : '',
        b ? pdfNum(b.PnL) : '',
        s ? formatDealDate(s.Datetime) : '',
        s ? pdfNum(s.Price) : '',
        s ? pdfNum(s.Quantity) : '',
        s ? pdfNum(s.Brokerage) : '',
        s ? pdfNum(s.PnL) : '',
      ])
    }

    // "Total" row for each side
    const boldCell = (c) => ({ content: c, styles: { fontStyle: 'bold' } })
    body.push([
      { content: 'Total', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
      boldCell(pdfNum(buyVol)),
      boldCell(pdfNum(buyComm)),
      boldCell(pdfNum(buyPnl)),
      { content: 'Total', colSpan: 2, styles: { halign: 'center', fontStyle: 'bold' } },
      boldCell(pdfNum(sellVol)),
      boldCell(pdfNum(sellComm)),
      boldCell(pdfNum(sellPnl)),
    ])

    // 3 footer rows (Gross / Brokerage / Net) — green for profit, red for loss
    const grossColor = grossSym > 0 ? GREEN_TEXT : grossSym < 0 ? RED_TEXT : [0, 0, 0]
    const netColor   = netSym   > 0 ? GREEN_TEXT : netSym   < 0 ? RED_TEXT : [0, 0, 0]
    const grossLabel = grossSym < 0 ? 'Loss' : grossSym > 0 ? 'Profit' : '-'
    const netLabel   = netSym   < 0 ? 'Loss' : netSym   > 0 ? 'Profit' : '-'
    const tintCenter = (c, color) => ({ content: c, styles: { textColor: color, fontStyle: 'bold', halign: 'center' } })
    const tintRight  = (c, color) => ({ content: c, styles: { textColor: color, fontStyle: 'bold', halign: 'right' } })
    body.push([
      { content: 'Total Gross Amount', colSpan: 8, styles: { halign: 'center', textColor: grossColor, fontStyle: 'bold' } },
      tintCenter(grossLabel, grossColor),
      tintRight(pdfNum(grossSym), grossColor),
    ])
    const brokerColor = brokerSym > 0 ? GREEN_TEXT : brokerSym < 0 ? RED_TEXT : [0, 0, 0]
    body.push([
      { content: 'Total Brokrage', colSpan: 8, styles: { halign: 'center', textColor: brokerColor, fontStyle: 'bold' } },
      tintCenter('-', brokerColor),
      tintRight(pdfNum(brokerSym), brokerColor),
    ])
    body.push([
      { content: 'Total Net Amount', colSpan: 8, styles: { halign: 'center', textColor: netColor, fontStyle: 'bold' } },
      tintCenter(netLabel, netColor),
      tintRight(pdfNum(netSym), netColor),
    ])

    autoTable(doc, {
      startY: y,
      theme: 'grid',
      head: [
        [{ content: symbolName, colSpan: 10, styles: { halign: 'center', fillColor: HEADER_FILL, textColor: 255, fontStyle: 'bold' } }],
        [
          { content: 'Buy',  colSpan: 5, styles: { halign: 'center', fillColor: BUY_FILL,  textColor: BUY_TEXT,  fontStyle: 'bold' } },
          { content: 'Sell', colSpan: 5, styles: { halign: 'center', fillColor: SELL_FILL, textColor: SELL_TEXT, fontStyle: 'bold' } },
        ],
        [
          'Date', 'Price', 'Volume', 'Commission', 'P&L',
          'Date', 'Price', 'Volume', 'Commission', 'P&L',
        ],
      ],
      body,
      styles: {
        fontSize: 8,
        cellPadding: 4,
        halign: 'center',
        valign: 'middle',
        lineColor: BORDER,
        lineWidth: 0.3,
        textColor: [20, 20, 20],
      },
      headStyles: { fillColor: [255, 255, 255], textColor: [20, 20, 20], fontStyle: 'bold', halign: 'center' },
      margin: { left: margin, right: margin },
    })

    y = (doc.lastAutoTable?.finalY || y) + 18
  }
}

// Build a PDF document for a SINGLE bill (used by per-login downloads)
const buildBillPdf = (bill, _weekInfo = null) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  if (!bill) {
    doc.setFontSize(12)
    doc.text('No bill data', 40, 60)
    return doc
  }
  renderBill(doc, bill)
  return doc
}

// Build a PDF document for one or more bills (single combined PDF)
const buildBillsPdf = (bills = [], _weekInfo = null) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const list = Array.isArray(bills) ? bills : []
  if (list.length === 0) {
    doc.setFontSize(12)
    doc.text('No bill data', 40, 60)
    return doc
  }
  list.forEach((bill, i) => {
    if (i > 0) doc.addPage()
    renderBill(doc, bill)
  })
  return doc
}

const savePdf = (doc, filename) => {
  try {
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (e) {
    console.error('[Bills] savePdf failed, falling back to doc.save', e)
    try { doc.save(filename) } catch (err) { console.error('[Bills] doc.save also failed', err) }
  }
}

// Flatten Bills API response into rows: { Login, Name, Symbol, Side, Datetime, Price, Quantity, PnL, Brokerage }
const flattenBills = (bills = []) => {
  const rows = []
  for (const b of bills) {
    const login = b.Login
    const name = b.Name
    const symbols = b.Symbols || []
    for (const sym of symbols) {
      // Each symbol object can contain BUY/SELL arrays; symbol name key might be "Symbol" or the symbol itself
      const symbolName = sym.Symbol || sym.symbol || sym.Name || ''
      for (const side of ['BUY', 'SELL']) {
        const entries = sym[side]
        if (!Array.isArray(entries)) continue
        for (const e of entries) {
          rows.push({
            Login: login,
            Name: name,
            Symbol: symbolName,
            Side: side,
            Datetime: e.Datetime || '',
            Price: e.Price ?? '',
            Quantity: e.Quantity ?? '',
            PnL: e.PnL ?? '',
            Brokerage: e.Brokerage ?? '',
          })
        }
      }
    }
  }
  return rows
}

const downloadCsv = (filename, rows, columns) => {
  const header = columns.map(c => escapeCsv(c.label || c.key)).join(',')
  const body = rows.map(r => columns.map(c => escapeCsv(r[c.key])).join(',')).join('\n')
  const csv = '\ufeff' + header + '\n' + body
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const BILL_COLUMNS = [
  { key: 'Login', label: 'Login' },
  { key: 'Name', label: 'Name' },
  { key: 'Symbol', label: 'Symbol' },
  { key: 'Side', label: 'Side' },
  { key: 'Datetime', label: 'Datetime' },
  { key: 'Price', label: 'Price' },
  { key: 'Quantity', label: 'Quantity' },
  { key: 'PnL', label: 'PnL' },
  { key: 'Brokerage', label: 'Brokerage' },
]

const TABLE_COLS = [
  { key: 'name',      label: 'Name' },
  { key: 'brokerage', label: 'Total Brokerage' },
  { key: 'gross',     label: 'Total Gross' },
  { key: 'net',       label: 'Total Net' },
]

// Columns for the desktop column-chooser (toggle / reorder / pin)
const ALL_BILL_COLUMNS = [
  { key: 'login',     label: 'Login',           sticky: true },
  { key: 'name',      label: 'Name' },
  { key: 'brokerage', label: 'Total Brokerage' },
  { key: 'gross',     label: 'Total Gross' },
  { key: 'net',       label: 'Total Net' },
  { key: 'actions',   label: 'Actions' },
]

const BillsPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const v = localStorage.getItem('sidebarOpen')
      return v !== null ? JSON.parse(v) : true
    } catch { return true }
  })

  const [weeks, setWeeks] = useState([])
  const [selectedWeekId, setSelectedWeekId] = useState(null)
  const [weeksLoading, setWeeksLoading] = useState(true)

  const [rows, setRows] = useState([])
  const [totals, setTotals] = useState({ TotalBrokerage: 0, TotalGrossAmount: 0, TotalNetAmount: 0 })
  const [pagination, setPagination] = useState({ page: 1, limit: 100, total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [page, setPage] = useState(1)
  // Mobile defaults to 15 rows/page (sm = 640px); desktop keeps 100
  const [limit, setLimit] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 15 : 100))
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640))
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  // Debounce search-as-you-type so the API fires while the user types
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(prev => {
        const next = searchInput.trim()
        if (prev === next) return prev
        setPage(1)
        return next
      })
    }, 350)
    return () => clearTimeout(t)
  }, [searchInput])
  const [sortBy, setSortBy] = useState('login')
  const [sortOrder, setSortOrder] = useState('asc')

  // Groups
  const { getActiveGroupFilter, getGroupLogins, activeGroupFilters, setActiveGroupFilter, groups, deleteGroup } = useGroups()
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [isLoginGroupsOpen, setIsLoginGroupsOpen] = useState(false)
  const [isLoginGroupModalOpen, setIsLoginGroupModalOpen] = useState(false)
  const [editingLoginGroup, setEditingLoginGroup] = useState(null)

  const groupMt5Accounts = useMemo(() => {
    const activeGroup = getActiveGroupFilter('bills')
    if (!activeGroup) return []
    const logins = getGroupLogins(activeGroup).map(l => Number(l)).filter(n => !Number.isNaN(n))
    return logins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroupFilters, getActiveGroupFilter, getGroupLogins])

  const [selected, setSelected] = useState(() => new Set())
  const [busyLogin, setBusyLogin] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  const [bulkDownloading, setBulkDownloading] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [selectedMenuOpen, setSelectedMenuOpen] = useState(false)
  const [allMenuOpen, setAllMenuOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState({ login: true, name: true, brokerage: true, gross: true, net: true, actions: true })
  const [showColumnChooser, setShowColumnChooser] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const columnSelectorRef = useRef(null)
  // Column reorder (persisted)
  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('billsPageColumnOrder')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return null
  })
  useEffect(() => {
    try { if (columnOrder) localStorage.setItem('billsPageColumnOrder', JSON.stringify(columnOrder)) } catch {}
  }, [columnOrder])
  const resetColumnOrder = () => {
    setColumnOrder(null)
    try { localStorage.removeItem('billsPageColumnOrder') } catch {}
  }
  // Pinned columns (persisted) — must be declared BEFORE orderedColumns uses it
  const [pinnedColumns, setPinnedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('billsPagePinnedColumns'))
      return Array.isArray(saved) ? saved : []
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem('billsPagePinnedColumns', JSON.stringify(pinnedColumns)) } catch {}
  }, [pinnedColumns])
  const togglePinColumn = (key) =>
    setPinnedColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  const orderedColumns = (() => {
    let base
    if (!Array.isArray(columnOrder) || columnOrder.length === 0) {
      base = ALL_BILL_COLUMNS
    } else {
      const map = new Map(ALL_BILL_COLUMNS.map(c => [c.key, c]))
      const out = []
      columnOrder.forEach(k => { if (map.has(k)) { out.push(map.get(k)); map.delete(k) } })
      map.forEach(c => out.push(c))
      base = out
    }
    // Ensure sticky / pinned columns always render first so they visually sit at the
    // left edge regardless of the user's reordering (prevents other column data from
    // showing in the gap between the checkbox cell and the pinned Login cell).
    const isPinned = (c) => c.sticky || pinnedColumns.includes(c.key)
    const pinned = base.filter(isPinned)
    const rest = base.filter(c => !isPinned(c))
    return [...pinned, ...rest]
  })()
  const toggleColumn = (key) => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  // Column resize (desktop)
  const { setHeaderRef, getHeaderStyle, handleResizeStart } = useColumnResize('billsPageColumnWidths')
  const PINNED_DEFAULT_WIDTH = 150
  const PINNED_LEADING_OFFSET = 40 // checkbox column width
  const pinnedOffsets = useMemo(() => {
    const map = {}
    let offset = PINNED_LEADING_OFFSET
    for (const col of orderedColumns) {
      if (!visibleColumns[col.key]) continue
      if (col.sticky || pinnedColumns.includes(col.key)) {
        map[col.key] = offset
        offset += PINNED_DEFAULT_WIDTH
      }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedColumns, visibleColumns, pinnedColumns])
  const applyPin = (cell, colKey, isHeader) => {
    if (!cell) return cell
    const col = ALL_BILL_COLUMNS.find(c => c.key === colKey)
    const isPinned = col?.sticky || pinnedColumns.includes(colKey)
    if (!isPinned) return cell
    const stickyStyle = {
      position: 'sticky',
      left: `${pinnedOffsets[colKey] || 0}px`,
      zIndex: isHeader ? 25 : 15,
      boxShadow: '2px 0 4px -2px rgba(0,0,0,0.1)'
    }
    // Use Tailwind classes for the sticky background so the header matches the
    // surrounding thead at every breakpoint (blue-500 on mobile, blue-600 on sm+).
    // Body sticky cells use a fully opaque white that matches the row hover state
    // so content in non-sticky cells doesn't bleed through during horizontal scroll.
    const stickyBgClass = isHeader
      ? 'bg-blue-500 sm:bg-blue-600'
      : 'bg-white group-hover:bg-[#F8FAFC]'
    const existingClass = cell.props?.className || ''
    return cloneElement(cell, {
      className: `${existingClass} ${stickyBgClass}`.trim(),
      style: { ...(cell.props?.style || {}), ...stickyStyle }
    })
  }
  const selectedMenuRef = useRef(null)
  const allMenuRef = useRef(null)
  const selectedMenuRefMobile = useRef(null)
  const allMenuRefMobile = useRef(null)
  useEffect(() => {
    const onDocClick = (e) => {
      const inSelected = (selectedMenuRef.current && selectedMenuRef.current.contains(e.target)) ||
                         (selectedMenuRefMobile.current && selectedMenuRefMobile.current.contains(e.target))
      if (!inSelected) setSelectedMenuOpen(false)
      const inAll = (allMenuRef.current && allMenuRef.current.contains(e.target)) ||
                    (allMenuRefMobile.current && allMenuRefMobile.current.contains(e.target))
      if (!inAll) setAllMenuOpen(false)
      if (columnSelectorRef.current && !columnSelectorRef.current.contains(e.target)) setShowColumnSelector(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  // Load settlement weeks; select the highest-id week by default
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setWeeksLoading(true)
        const res = await brokerAPI.getSettlementWeeks({ page: 1, limit: 100 })
        const list = res?.data?.weeks ?? res?.weeks ?? []
        if (cancelled) return
        setWeeks(list)
        if (list.length) {
          const highest = list.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a))
          setSelectedWeekId(highest.id)
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load settlement weeks')
      } finally {
        if (!cancelled) setWeeksLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Reset to page 1 when an active group changes
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [groupMt5Accounts])

  // Fetch summary when selection / paging / search changes
  useEffect(() => {
    if (!selectedWeekId) {
      // If weeks finished loading but none are available, clear the loading state
      if (!weeksLoading) setLoading(false)
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const res = await brokerAPI.getBillsSummary({
          week_id: selectedWeekId,
          page,
          limit,
          search,
          mt5Accounts: groupMt5Accounts,
          sortBy,
          sortOrder,
        })
        if (cancelled) return
        const data = res?.data ?? res
        // The API response in the spec puts the rows under data.Bills/data.bills/data.summary;
        // looking at the sample, the array of {Login,Name,...} appears alongside totals/pagination.
        // Try common keys.
        const list =
          data?.bills ?? data?.Bills ?? data?.summary ?? data?.Summary ??
          data?.data ?? data?.rows ?? (Array.isArray(data) ? data : [])
        const finalList = Array.isArray(list) ? list : []
        setRows(finalList)
        setPagination(data?.pagination ?? { page, limit, total: finalList.length, total_pages: 1 })
        setTotals(data?.totals ?? { TotalBrokerage: 0, TotalGrossAmount: 0, TotalNetAmount: 0 })
        // Clear selections that no longer exist
        setSelected(prev => {
          const next = new Set()
          const visibleLogins = new Set(finalList.map(r => r.Login))
          prev.forEach(l => { if (visibleLogins.has(l)) next.add(l) })
          return next
        })
      } catch (err) {
        if (!cancelled) {
          console.error('[Bills] summary failed:', err)
          setError(err?.response?.data?.message || 'Failed to load bills')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedWeekId, page, limit, search, sortBy, sortOrder, groupMt5Accounts, weeksLoading])

  const selectedWeek = useMemo(
    () => weeks.find(w => w.id === selectedWeekId) || null,
    [weeks, selectedWeekId]
  )

  const allSelected = rows.length > 0 && rows.filter(r => Number(r.TotalNetAmount) !== 0).every(r => selected.has(r.Login))
  const someSelected = selected.size > 0 && !allSelected

  const toggleAll = () => {
    setSelected(prev => {
      if (allSelected) return new Set()
      const next = new Set(prev)
      rows.forEach(r => {
        if (Number(r.TotalNetAmount) !== 0) next.add(r.Login)
      })
      return next
    })
  }

  const toggleOne = (login) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortOrder(o => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(key)
      setSortOrder('asc')
    }
    setPage(1)
  }

  // Download bill (PDF) for a single login
  const downloadOne = async (login) => {
    if (!selectedWeekId) return
    try {
      setBusyLogin(login)
      const res = await brokerAPI.getBillsDetails(selectedWeekId, [login])
      const data = res?.data ?? res
      const bills = data?.Bills ?? data?.bills ?? []
      const row = rows.find(r => r.Login === login)
      const safeName = String(row?.Name || login).replace(/[^a-z0-9\-_ ]/gi, '_').trim()
      const wk = selectedWeek?.name?.replace(/[^a-z0-9\-_ ]/gi, '_').trim() || `week-${selectedWeekId}`
      const doc = buildBillsPdf(bills, selectedWeek)
      savePdf(doc, `bill_${login}_${safeName}_${wk}.pdf`)
    } catch (err) {
      console.error('[Bills] download failed:', err)
      alert(err?.response?.data?.message || 'Failed to download bill')
    } finally {
      setBusyLogin(null)
    }
  }

  // Download bills (PDF) for selected logins, fetched in chunks of 300
  // mode: 'individual' → one PDF file per login (saved one-by-one); 'zip' → one .zip with one PDF per login
  const downloadSelected = async (mode = 'individual') => {
    if (!selectedWeekId || selected.size === 0) return
    try {
      setBulkDownloading(true)
      const logins = Array.from(selected)
      const wk = selectedWeek?.name?.replace(/[^a-z0-9\-_ ]/gi, '_').trim() || `week-${selectedWeekId}`
      const nameByLogin = new Map(rows.map(r => [String(r.Login), r.Name]))
      const CHUNK = 300
      const zip = mode === 'zip' ? new JSZip() : null
      let savedCount = 0
      for (let c = 0; c < logins.length; c += CHUNK) {
        const chunk = logins.slice(c, c + CHUNK)
        const res = await brokerAPI.getBillsDetails(selectedWeekId, chunk)
        const data = res?.data ?? res
        const bills = data?.Bills ?? data?.bills ?? []
        for (let i = 0; i < bills.length; i++) {
          const b = bills[i]
          // Skip bills whose Net Amount is zero — nothing to settle
          if (computeBillNet(b) === 0) continue
          const nm = b.Name || nameByLogin.get(String(b.Login)) || b.Login
          const safeName = String(nm).replace(/[^a-z0-9\-_ ]/gi, '_').trim()
          const filename = `bill_${b.Login}_${safeName}_${wk}.pdf`
          const doc = buildBillPdf(b, selectedWeek)
          if (zip) {
            const blob = doc.output('blob')
            zip.file(filename, blob)
          } else {
            savePdf(doc, filename)
            // Small delay so the browser doesn't block successive downloads
            await new Promise(r => setTimeout(r, 150))
          }
          savedCount++
        }
      }
      if (savedCount === 0) {
        alert('No bills with a non-zero Net Amount to download')
        return
      }
      if (zip) {
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bills_${wk}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('[Bills] bulk download failed:', err)
      alert(err?.response?.data?.message || 'Failed to download selected bills')
    } finally {
      setBulkDownloading(false)
    }
  }

  // Download ALL bills (PDF) for the entire week — chunked; 'individual' → combined PDF, 'zip' → .zip
  const exportAll = async (mode = 'individual') => {
    if (!selectedWeekId) return
    try {
      setExportingAll(true)
      // We already know the total from the table's last summary fetch — no need to
      // probe the API again. Just request the full page (or reuse current rows if
      // they already cover the whole result set).
      const total = pagination?.total ?? 0
      let list
      if (total > 0 && rows.length >= total) {
        // Current state already contains all bills for this week/group/search
        list = rows
      } else {
        const full = await brokerAPI.getBillsSummary({
          week_id: selectedWeekId,
          page: 1,
          limit: Math.max(total, rows.length, 1),
          search,
          mt5Accounts: groupMt5Accounts,
        })
        const fullData = full?.data ?? full
        list =
          fullData?.bills ?? fullData?.Bills ?? fullData?.summary ?? fullData?.Summary ??
          fullData?.rows ?? (Array.isArray(fullData) ? fullData : [])
      }
      // Skip rows whose Net Amount is already zero in the summary — saves a fetch + a PDF render
      const logins = (Array.isArray(list) ? list : [])
        .filter(r => Number(r.TotalNetAmount) !== 0)
        .map(r => r.Login)
        .filter(v => v != null)
      if (!logins.length) {
        alert('No bills with a non-zero Net Amount to download')
        return
      }
      const wk = selectedWeek?.name?.replace(/[^a-z0-9\-_ ]/gi, '_').trim() || `week-${selectedWeekId}`
      const nameByLogin = new Map((Array.isArray(list) ? list : []).map(r => [String(r.Login), r.Name]))
      const CHUNK = 300
      const zip = mode === 'zip' ? new JSZip() : null
      let savedCount = 0
      for (let c = 0; c < logins.length; c += CHUNK) {
        const chunk = logins.slice(c, c + CHUNK)
        const res = await brokerAPI.getBillsDetails(selectedWeekId, chunk)
        const data = res?.data ?? res
        const bills = data?.Bills ?? data?.bills ?? []
        for (let i = 0; i < bills.length; i++) {
          const b = bills[i]
          // Safety: skip if details still resolve to zero net
          if (computeBillNet(b) === 0) continue
          const nm = b.Name || nameByLogin.get(String(b.Login)) || b.Login
          const safeName = String(nm).replace(/[^a-z0-9\-_ ]/gi, '_').trim()
          const filename = `bill_${b.Login}_${safeName}_${wk}.pdf`
          const doc = buildBillPdf(b, selectedWeek)
          if (zip) {
            const blob = doc.output('blob')
            zip.file(filename, blob)
          } else {
            savePdf(doc, filename)
            // Small delay so the browser doesn't block successive downloads
            await new Promise(r => setTimeout(r, 150))
          }
          savedCount++
        }
      }
      if (savedCount === 0) {
        alert('No bills with a non-zero Net Amount to download')
        return
      }
      if (zip) {
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `bills_all_${wk}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('[Bills] export all failed:', err)
      alert(err?.response?.data?.message || 'Failed to export all bills')
    } finally {
      setExportingAll(false)
    }
  }

  const SortIcon = ({ active, order }) => (
    <svg className={`inline w-3 h-3 ml-1 ${active ? 'text-white' : 'text-blue-200'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {order === 'desc'
        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />}
    </svg>
  )

  return (
    <div className="flex h-screen bg-gray-50">
      {(bulkDownloading || exportingAll) && (
        <LoadingSpinner
          message={exportingAll ? 'Exporting all bills…' : 'Downloading selected bills…'}
          subtitle="Please wait"
        />
      )}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => { setSidebarOpen(false); try { localStorage.setItem('sidebarOpen', JSON.stringify(false)) } catch {} }}
        onToggle={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {} ; return n })}
      />

      <main className={`flex-1 px-3 pt-0 pb-3 sm:p-4 lg:p-6 transition-all duration-300 ${sidebarOpen ? 'lg:ml-60' : 'lg:ml-16'} flex flex-col overflow-hidden`}>
        <div className="max-w-full mx-auto w-full flex flex-col flex-1 overflow-hidden">
          {/* Header Card */}
          <div className="-mx-3 sm:mx-0 bg-white rounded-none sm:rounded-2xl shadow-sm px-0 sm:px-6 py-0 sm:py-3 mb-2 sm:mb-4">
            {/* Mobile-only header (centered title, large rounded hamburger) — matches other modules */}
            <div className="sm:hidden flex items-center px-4 py-4 bg-white border-b border-[#ECECEC] relative">
              <button
                onClick={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {} ; return n })}
                className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
                aria-label="Open menu"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-black absolute left-1/2 transform -translate-x-1/2">Bills</h1>
            </div>

            {/* Desktop title row */}
            <div className="hidden sm:flex items-center gap-3 mb-0">
              <button
                onClick={() => setSidebarOpen(v => { const n = !v; try { localStorage.setItem('sidebarOpen', JSON.stringify(n)) } catch {} ; return n })}
                className="lg:hidden text-gray-700 hover:text-gray-900 p-2.5 rounded-lg hover:bg-gray-100 border border-gray-300 transition-all flex-shrink-0"
                aria-label="Open menu"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-[#1A1A1A] leading-tight">Bills</h1>
                <p className="hidden sm:block text-xs text-[#6B7280] mt-0.5"></p>
              </div>

              {/* Desktop-only actions inline with title */}
              <div className="hidden sm:flex flex-nowrap items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Settlement Weeks</label>
                  {weeksLoading ? (
                    <div className="h-10 rounded-md bg-gray-200 animate-pulse min-w-[260px]" aria-label="Loading weeks" />
                  ) : (
                    <select
                      value={selectedWeekId ?? ''}
                      onChange={(e) => { setSelectedWeekId(Number(e.target.value)); setPage(1); setSelected(new Set()) }}
                      disabled={weeks.length === 0}
                      className="h-10 px-3 rounded-md border border-[#E5E7EB] bg-white text-sm text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 min-w-[260px]"
                    >
                      {weeks.length === 0 && <option>No weeks available</option>}
                      {weeks.map(w => (
                        <option key={w.id} value={w.id}>
                          {w.name}{w.description ? ` — ${w.description}` : ''} ({w.start_date} → {w.end_date})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <GroupSelector
                  moduleName="bills"
                  onCreateClick={() => { setEditingGroup(null); setShowGroupModal(true) }}
                  onEditClick={(group) => { setEditingGroup(group); setShowGroupModal(true) }}
                />
                <div ref={selectedMenuRef} className="relative">
                  <div className="flex h-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm text-gray-700 overflow-hidden">
                    <button
                      onClick={() => setSelectedMenuOpen(o => !o)}
                      disabled={selected.size === 0 || bulkDownloading || exportingAll}
                      className="px-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3" />
                      </svg>
                      Download Selected{selected.size > 0 ? ` (${selected.size})` : ''}
                    </button>
                    <button
                      onClick={() => setSelectedMenuOpen(o => !o)}
                      disabled={selected.size === 0 || bulkDownloading || exportingAll}
                      className="px-2 border-l border-[#E5E7EB] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {selectedMenuOpen && (
                    <div className="absolute right-0 mt-1 w-56 rounded-md bg-white shadow-lg border border-gray-200 z-30 py-1 text-sm">
                      <button onClick={() => { setSelectedMenuOpen(false); downloadSelected('individual') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-black-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3" /></svg>
                        Download individual files
                      </button>
                      <button onClick={() => { setSelectedMenuOpen(false); downloadSelected('zip') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-black-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 12h14M5 16h14M9 4v16" /></svg>
                        Download as ZIP
                      </button>
                    </div>
                  )}
                </div>
                <div ref={allMenuRef} className="relative">
                  <div className="flex h-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm text-gray-700 overflow-hidden">
                    <button
                      onClick={() => setAllMenuOpen(o => !o)}
                      disabled={exportingAll || bulkDownloading || !selectedWeekId}
                      className="px-3 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16" />
                      </svg>
                      Download All
                    </button>
                    <button
                      onClick={() => setAllMenuOpen(o => !o)}
                      disabled={exportingAll || bulkDownloading || !selectedWeekId}
                      className="px-2 border-l border-[#E5E7EB] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {allMenuOpen && (
                    <div className="absolute right-0 mt-1 w-56 rounded-md bg-white shadow-lg border border-gray-200 z-30 py-1 text-sm">
                      <button type="button" onClick={() => { setAllMenuOpen(false); exportAll('individual') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-black-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3" /></svg>
                        Download individual files
                      </button>
                      <button type="button" onClick={() => { setAllMenuOpen(false); exportAll('zip') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700 flex items-center gap-2">
                        <svg className="w-4 h-4 text-black-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 12h14M5 16h14M9 4v16" /></svg>
                        Download as ZIP
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile-only: All 4 actions in one row (Week + Groups + Selected + All) — OUTSIDE the header card */}
          <div className="sm:hidden flex items-center gap-1.5 mb-3">
            {weeksLoading ? (
              <div className="h-8 rounded-md bg-gray-200 animate-pulse flex-1 min-w-[100px]" aria-label="Loading weeks" />
            ) : (
              <select
                value={selectedWeekId ?? ''}
                onChange={(e) => { setSelectedWeekId(Number(e.target.value)); setPage(1); setSelected(new Set()) }}
                disabled={weeks.length === 0}
                className="h-8 flex-1 min-w-0 px-1.5 rounded-md border border-[#E5E7EB] bg-white text-[10px] text-gray-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                {weeks.length === 0 && <option>No weeks</option>}
                {weeks.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.name}{w.description ? ` — ${w.description}` : ''}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setIsCustomizeOpen(true)}
              className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative flex-shrink-0 ${
                getActiveGroupFilter('bills')
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4.5 6.5H9.5M2.5 3.5H11.5M5.5 9.5H8.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="text-[#4B4B4B] text-[10px] font-medium">Filter</span>
              {getActiveGroupFilter('bills') && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">1</span>
              )}
            </button>
            <div ref={selectedMenuRefMobile} className="relative flex-shrink-0">
              <div className="flex h-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm text-gray-700 overflow-hidden">
                <button
                  onClick={() => setSelectedMenuOpen(o => !o)}
                  disabled={selected.size === 0 || bulkDownloading || exportingAll}
                  className="px-1.5 text-[10px] font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3" />
                  </svg>
                  Selected{selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
                <button
                  onClick={() => setSelectedMenuOpen(o => !o)}
                  disabled={selected.size === 0 || bulkDownloading || exportingAll}
                  className="px-1.5 border-l border-[#E5E7EB] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {selectedMenuOpen && (
                <div className="absolute left-0 mt-1 w-52 rounded-md bg-white shadow-lg border border-gray-200 z-30 py-1 text-xs">
                  <button type="button" onClick={() => { setSelectedMenuOpen(false); downloadSelected('individual') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Download individual files</button>
                  <button type="button" onClick={() => { setSelectedMenuOpen(false); downloadSelected('zip') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Download as ZIP</button>
                </div>
              )}
            </div>
            <div ref={allMenuRefMobile} className="relative flex-shrink-0">
              <div className="flex h-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm text-gray-700 overflow-hidden">
                <button
                  onClick={() => setAllMenuOpen(o => !o)}
                  disabled={exportingAll || bulkDownloading || !selectedWeekId}
                  className="px-1.5 text-[10px] font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-3-3m3 3l3-3M4 20h16" />
                  </svg>
                  All
                </button>
                <button
                  onClick={() => setAllMenuOpen(o => !o)}
                  disabled={exportingAll || bulkDownloading || !selectedWeekId}
                  className="px-1.5 border-l border-[#E5E7EB] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {allMenuOpen && (
                <div className="absolute right-0 mt-1 w-52 rounded-md bg-white shadow-lg border border-gray-200 z-30 py-1 text-xs">
                  <button type="button" onClick={() => { setAllMenuOpen(false); exportAll('individual') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Download individual files</button>
                  <button type="button" onClick={() => { setAllMenuOpen(false); exportAll('zip') }} className="w-full text-left px-3 py-2 hover:bg-gray-50 text-gray-700">Download as ZIP</button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 rounded-r p-4 shadow-sm">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Summary Cards — mobile: horizontal carousel; desktop: 3-col grid */}
          <div className="sm:hidden mb-3">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1">
              {[
                { label: 'Total Brokerage', value: totals.TotalBrokerage, iconPath: 'M12 8c-3.866 0-7 1.79-7 4s3.134 4 7 4 7-1.79 7-4-3.134-4-7-4zm0 0V5m0 11v3m-5-6h10' },
                { label: 'Total Gross', value: totals.TotalGrossAmount, iconPath: 'M9 7h6m-6 4h6m-6 4h4M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5z' },
                { label: 'Total Net', value: totals.TotalNetAmount, iconPath: 'M3 10h18M3 6h18M3 14h18M3 18h18' },
              ].map((c) => (
                <div
                  key={c.label}
                  className="bg-white border border-[#F2F2F7] rounded-xl shadow-sm p-2 flex-shrink-0 snap-start flex flex-col justify-between"
                  style={{ minWidth: '140px', width: '140px', height: '64px' }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="text-[9px] font-semibold text-[#4B4B4B] uppercase tracking-wide leading-tight">{c.label}</span>
                    <div className="w-6 h-6 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.iconPath} />
                      </svg>
                    </div>
                  </div>
                  <div className={`text-[13px] font-bold leading-none truncate ${Number(c.value) < 0 ? 'text-red-600' : 'text-[#000000]'}`}>
                    {fmtMoney(c.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden sm:grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Brokerage', value: totals.TotalBrokerage, iconPath: 'M12 8c-3.866 0-7 1.79-7 4s3.134 4 7 4 7-1.79 7-4-3.134-4-7-4zm0 0V5m0 11v3m-5-6h10' },
              { label: 'Total Gross', value: totals.TotalGrossAmount, iconPath: 'M9 7h6m-6 4h6m-6 4h4M5 5a2 2 0 012-2h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5z' },
              { label: 'Total Net', value: totals.TotalNetAmount, iconPath: 'M3 10h18M3 6h18M3 14h18M3 18h18' },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-xl shadow-sm border border-[#F2F2F7] px-4 py-3 hover:md:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider leading-none">{c.label}</span>
                  <div className="w-7 h-7 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={c.iconPath} />
                    </svg>
                  </div>
                </div>
                <div className={`text-base font-bold leading-none ${Number(c.value) < 0 ? 'text-red-600' : 'text-[#000000]'}`}>
                  {fmtMoney(c.value)}
                </div>
              </div>
            ))}
          </div>

          {/* Search bar (own card) */}
          <div className="sm:bg-white sm:rounded-2xl sm:shadow-sm mb-2 sm:mb-3">
            <div className="px-3 sm:px-4 py-2 sm:py-3">

              {/* ── Mobile search row ── */}
              <div className="sm:hidden flex items-center gap-1">
                {/* Search input with left magnifier */}
                <div className="flex-1 min-w-0 h-7 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setSearch(searchInput.trim()); setPage(1) } }}
                    placeholder="Search"
                    className="flex-1 min-w-0 text-[10px] text-[#1F2937] placeholder-[#9CA3AF] outline-none bg-transparent focus:ring-0"
                  />
                </div>

                {/* Column chooser */}
                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowColumnChooser(true)}
                    className="h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                    title="Show/Hide Columns"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                      <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                    </svg>
                  </button>
                </div>

                {/* Prev */}
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="flex-shrink-0 h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Previous"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                {/* Page indicator */}
                <div className="flex-shrink-0 px-1 text-[11px] font-medium text-[#374151] flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={pagination.total_pages || 1}
                    value={page}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      const tp = pagination.total_pages || 1
                      if (!isNaN(n)) setPage(Math.min(Math.max(1, n), tp))
                    }}
                    className="w-10 h-7 border border-[#E5E7EB] rounded-lg text-center text-[11px] font-semibold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Current page"
                  />
                  <span className="text-[#9CA3AF]">/</span>
                  <span className="text-[#6B7280]">{pagination.total_pages || 1}</span>
                </div>

                {/* Next */}
                <button
                  type="button"
                  onClick={() => setPage(p => (pagination.total_pages ? Math.min(pagination.total_pages, p + 1) : p + 1))}
                  disabled={loading || (pagination.total_pages && page >= pagination.total_pages)}
                  className="flex-shrink-0 h-7 w-7 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Next"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              {/* ── Desktop search row ── */}
              <form
                onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1) }}
                className="hidden sm:flex items-center gap-2"
              >
                <div className="relative flex-1 min-w-0 sm:max-w-md">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search by Login or Name"
                    className="w-full h-10 pl-3 pr-16 text-sm border border-[#E5E7EB] rounded-md bg-[#F9FAFB] text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(''); setSearch(''); setPage(1) }}
                        title="Clear search"
                        aria-label="Clear search"
                        className="h-6 w-6 flex items-center justify-center text-[#9CA3AF] hover:text-[#4B5563] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="submit"
                      title="Search"
                      aria-label="Search"
                      className="p-1 rounded bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 18 18">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Column Chooser (icon only) */}
                <div ref={columnSelectorRef} className="relative flex-shrink-0 mr-auto">
                  <button
                    type="button"
                    onClick={() => setShowColumnSelector(v => !v)}
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
                      className="absolute left-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-0 z-50 flex flex-col"
                      style={{ width: 280, maxHeight: '60vh' }}
                    >
                      <div className="px-3 py-2 border-b border-[#F3F4F6] flex items-center justify-between">
                        <p className="text-xs font-semibold text-[#1F2937] uppercase">Show/Hide & Reorder</p>
                        <div className="relative group">
                          <button onClick={resetColumnOrder} className="p-1 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" aria-label="Reset column order">
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
                          columns={ALL_BILL_COLUMNS}
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
                <div className="flex-shrink-0">
                  <PageSizeSelect
                    value={limit}
                    onChange={(v) => { setLimit(v); setPage(1) }}
                    options={[50, 100, 200, 500]}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="flex-shrink-0 h-10 w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Previous"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div className="flex-shrink-0 px-1 text-[11px] font-medium text-[#374151] flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={pagination.total_pages || 1}
                    value={page}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      const tp = pagination.total_pages || 1
                      if (!isNaN(n)) setPage(Math.min(Math.max(1, n), tp))
                    }}
                    className="w-10 h-8 border border-[#E5E7EB] rounded-lg text-center text-[11px] font-semibold text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Current page"
                  />
                  <span className="text-[#9CA3AF]">/</span>
                  <span className="text-[#6B7280]">{pagination.total_pages || 1}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPage(p => (pagination.total_pages ? Math.min(pagination.total_pages, p + 1) : p + 1))}
                  disabled={loading || (pagination.total_pages && page >= pagination.total_pages)}
                  className="flex-shrink-0 h-10 w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Next"
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </form>

            </div>
          </div>

          {/* Table (own card, edge-to-edge content) */}
          <div className="bg-white rounded-none shadow-sm flex-1 flex flex-col overflow-hidden">
            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-[10px] sm:text-sm" style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <colgroup>
                  <col style={{ width: '40px', minWidth: '40px' }} />
                </colgroup>
                <thead className="bg-blue-500 sm:bg-blue-600 text-white sticky top-0 z-20">
                  <tr>
                    <th
                      className="p-0 text-left border-r border-blue-400/60 sm:border-blue-500/60 sticky left-0 z-30 bg-blue-500 sm:bg-blue-600"
                      style={{ width: '40px', minWidth: '40px', maxWidth: '40px', boxShadow: '2px 0 0 0 rgb(59 130 246)' }}
                    >
                      <div style={{ width: '40px', minWidth: '40px' }} className="flex items-center justify-center py-1 sm:py-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected }}
                          onChange={toggleAll}
                          className="w-4 h-4 accent-white cursor-pointer"
                        />
                      </div>
                    </th>
                    {orderedColumns.map(c => {
                      if (!visibleColumns[c.key]) return null
                      const sortable = c.key !== 'actions'
                      const resizeStyle = getHeaderStyle(c.key)
                      const headerCell = (
                        <th
                          key={c.key}
                          ref={setHeaderRef(c.key)}
                          onClick={sortable ? () => handleSort(c.key) : undefined}
                          style={resizeStyle}
                          className={`px-2 sm:px-3 py-1 sm:py-3 text-left font-semibold sm:uppercase text-[10px] sm:text-xs sm:tracking-wide ${sortable ? 'cursor-pointer' : ''} select-none whitespace-nowrap border-r border-blue-400/60 sm:border-blue-500/60 ${c.key === 'actions' ? 'w-32' : ''}`}
                        >
                          {c.label}
                          {sortable && <SortIcon active={sortBy === c.key} order={sortBy === c.key ? sortOrder : 'asc'} />}
                          <span className="hidden sm:block">
                            <ColumnResizeHandle columnKey={c.key} onResizeStart={handleResizeStart} />
                          </span>
                        </th>
                      )
                      return <Fragment key={c.key}>{applyPin(headerCell, c.key, true)}</Fragment>
                    })}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    Array.from({ length: 8 }).map((_, i) => {
                      const rowBg = i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      return (
                      <tr key={`bills-skeleton-${i}`} className={`group ${rowBg} border-b border-[#E1E1E1] sm:border-b-0`}>
                        <td
                          className={`p-0 border-r border-[#E1E1E1] sticky left-0 ${rowBg}`}
                          style={{ zIndex: 15, width: '40px', minWidth: '40px', maxWidth: '40px', boxShadow: '2px 0 0 0 white' }}
                        >
                          <div style={{ width: '40px', minWidth: '40px' }} className="flex items-center justify-center py-2">
                            <div className="h-3 w-3 bg-gray-200 rounded animate-pulse" />
                          </div>
                        </td>
                        {orderedColumns.map(c => {
                          if (!visibleColumns[c.key]) return null
                          const cell = (
                            <td key={c.key} className="px-2 sm:px-3 py-2 border-r border-[#E1E1E1]">
                              <div className="h-2.5 w-20 bg-gray-200 rounded animate-pulse" />
                            </td>
                          )
                          return <Fragment key={c.key}>{applyPin(cell, c.key, false)}</Fragment>
                        })}
                      </tr>
                      )
                    })
                  )}
                  {!loading && error && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="px-3 py-8 text-center text-red-600">{error}</td>
                    </tr>
                  )}
                  {!loading && !error && rows.length === 0 && (
                    <tr>
                      <td colSpan={Object.values(visibleColumns).filter(Boolean).length + 1} className="px-3 py-8 text-center text-gray-500">No bills found for this week</td>
                    </tr>
                  )}
                  {!loading && !error && rows.map((r, idx) => {
                    const isChecked = selected.has(r.Login)
                    return (
                      <tr key={r.Login} className={`group bg-white hover:bg-[#F8FAFC] border-b border-[#E1E1E1] sm:border-b-0`}>
                        <td
                          className="p-0 border-r border-[#E1E1E1] sticky left-0 bg-white group-hover:bg-[#F8FAFC]"
                          style={{ zIndex: 15, width: '40px', minWidth: '40px', maxWidth: '40px', boxShadow: '2px 0 0 0 white' }}
                        >
                          <div style={{ width: '40px', minWidth: '40px' }} className="flex items-center justify-center py-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={Number(r.TotalNetAmount) === 0}
                              onChange={() => toggleOne(r.Login)}
                              title={Number(r.TotalNetAmount) === 0 ? 'Net Amount is 0 — nothing to download' : ''}
                              className="w-3 h-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </div>
                        </td>
                        {orderedColumns.map(c => {
                          if (!visibleColumns[c.key]) return null
                          let cell = null
                          switch (c.key) {
                            case 'login': cell = (
                              <td
                                className="px-2 sm:px-3 py-2 font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer whitespace-nowrap border-r-2 border-gray-300"
                                onClick={(e) => { e.stopPropagation(); setSelectedClient({ login: r.Login, name: r.Name, ...r }) }}
                                title="Click to view client details"
                              >{r.Login}</td>
                            ); break
                            case 'name': cell = (
                              <td className="px-2 sm:px-3 py-2 text-[#4B4B4B] whitespace-nowrap border-r border-[#E1E1E1]">{r.Name}</td>
                            ); break
                            case 'brokerage': cell = (
                              <td className="px-2 sm:px-3 py-2 text-[#4B4B4B] text-left tabular-nums whitespace-nowrap border-r border-[#E1E1E1]">{fmtMoney(r.TotalBrokerage)}</td>
                            ); break
                            case 'gross': cell = (
                              <td className={`px-2 sm:px-3 py-2 text-left tabular-nums whitespace-nowrap border-r border-[#E1E1E1] ${Number(r.TotalGrossAmount) < 0 ? 'text-red-600' : 'text-[#4B4B4B]'}`}>{fmtMoney(r.TotalGrossAmount)}</td>
                            ); break
                            case 'net': cell = (
                              <td className={`px-2 sm:px-3 py-2 text-left tabular-nums whitespace-nowrap border-r border-[#E1E1E1] ${Number(r.TotalNetAmount) < 0 ? 'text-red-600' : 'text-[#4B4B4B]'}`}>{fmtMoney(r.TotalNetAmount)}</td>
                            ); break
                            case 'actions': cell = (
                              <td className="px-3 py-2">
                                {Number(r.TotalNetAmount) !== 0 ? (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); downloadOne(r.Login) }}
                                    disabled={busyLogin === r.Login}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Download bill"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 8l-3-3m3 3l3-3" />
                                    </svg>
                                    {busyLogin === r.Login ? '…' : 'Download'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </td>
                            ); break
                            default: cell = null
                          }
                          return <Fragment key={c.key}>{applyPin(cell, c.key, false)}</Fragment>
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-white">
              <div className="text-xs text-gray-600">
                {pagination.total > 0
                  ? `Showing page ${pagination.page} of ${pagination.total_pages} — ${pagination.total} total`
                  : '—'}
              </div>
              {selected.size > 0 && (
                <div className="text-xs text-blue-700 font-medium">{selected.size} selected</div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Group Modal */}
      <GroupModal
        isOpen={showGroupModal}
        onClose={() => { setShowGroupModal(false); setEditingGroup(null) }}
        availableItems={rows}
        loginField="Login"
        displayField="Name"
        secondaryField="Login"
        editGroup={editingGroup}
      />

      {/* Client Details Modal */}
      {selectedClient && (
        isMobile ? (
          <ClientDetailsMobileModal
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            allPositionsCache={[]}
            allOrdersCache={[]}
          />
        ) : (
          <ClientPositionsModal
            client={selectedClient}
            onClose={() => setSelectedClient(null)}
            onClientUpdate={() => {}}
            allPositionsCache={[]}
            allOrdersCache={[]}
            onCacheUpdate={() => {}}
          />
        )
      )}

      {/* Customize View (mobile bottom-sheet) */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onGroupsClick={() => { setIsCustomizeOpen(false); setIsLoginGroupsOpen(true) }}
        onReset={() => { setActiveGroupFilter('bills', null) }}
        onApply={() => { setIsCustomizeOpen(false) }}
        hasPendingChanges={false}
      />

      {/* Login Groups picker */}
      <LoginGroupsModal
        isOpen={isLoginGroupsOpen}
        onClose={() => setIsLoginGroupsOpen(false)}
        groups={groups.map(g => ({
          ...g,
          loginCount: g.range ? (g.range.to - g.range.from + 1) : g.loginIds.length
        }))}
        activeGroupName={getActiveGroupFilter('bills')}
        onSelectGroup={(group) => {
          setActiveGroupFilter('bills', group ? group.name : null)
          setIsLoginGroupsOpen(false)
        }}
        onCreateGroup={() => {
          setIsLoginGroupsOpen(false)
          setEditingLoginGroup(null)
          setIsLoginGroupModalOpen(true)
        }}
        onEditGroup={(group) => {
          setIsLoginGroupsOpen(false)
          setEditingLoginGroup(group)
          setIsLoginGroupModalOpen(true)
        }}
        onDeleteGroup={(group) => {
          if (window.confirm(`Delete group "${group.name}"?`)) {
            deleteGroup(group.name)
          }
        }}
      />

      {/* Create / Edit Login Group */}
      <LoginGroupModal
        isOpen={isLoginGroupModalOpen}
        onClose={() => { setIsLoginGroupModalOpen(false); setEditingLoginGroup(null) }}
        onSave={() => { setIsLoginGroupModalOpen(false); setEditingLoginGroup(null); setIsLoginGroupsOpen(true) }}
        onBack={() => { setIsLoginGroupModalOpen(false); setIsLoginGroupsOpen(true) }}
        editGroup={editingLoginGroup}
      />

      {/* Mobile Column Selector Modal */}
      {showColumnChooser && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:hidden" onClick={() => setShowColumnChooser(false)}>
          <div
            className="bg-white w-full rounded-t-[24px] max-h-[100vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <button onClick={() => setShowColumnChooser(false)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#404040" strokeWidth="2"/>
                </svg>
              </button>
            </div>

            <div className="px-5 py-3 border-b border-[#E5E7EB] flex-shrink-0">
              <div className="relative h-12">
                <input
                  type="text"
                  placeholder="Search Columns"
                  value={columnSearch}
                  onChange={(e) => setColumnSearch(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-gray-100 border-0 rounded-xl text-[10px] text-black font-semibold font-outfit placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[450px] max-h-[55vh]">
              <div className="px-5 py-3">
                {ALL_BILL_COLUMNS.filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase())).length > 0 ? (
                  ALL_BILL_COLUMNS
                    .filter(col => col.label.toLowerCase().includes(columnSearch.toLowerCase()))
                    .map(col => (
                    <label
                      key={col.key}
                      className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                    >
                      <span className="text-sm text-[#000000] font-outfit">{col.label}</span>
                      <div className="relative inline-block w-12 h-6">
                        <input
                          type="checkbox"
                          checked={!!visibleColumns[col.key]}
                          onChange={() => toggleColumn(col.key)}
                          className="sr-only peer"
                        />
                        <div className="w-12 h-6 bg-gray-300 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-6"></div>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                    No columns match your search
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BillsPage
