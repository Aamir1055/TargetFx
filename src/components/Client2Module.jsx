import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import FilterModal from './FilterModal'
import CustomizeViewModal from './CustomizeViewModal'
import GroupModal from './GroupModal'
import LoginGroupsModal from './LoginGroupsModal'
import LoginGroupModal from './LoginGroupModal'
import ClientDetailsMobileModal from './ClientDetailsMobileModal'
import { useGroups } from '../contexts/GroupContext'
import { useData } from '../contexts/DataContext'
import { brokerAPI } from '../services/api'

const formatNum = (n) => {
  const v = Number(n || 0)
  if (!isFinite(v)) return '0.00'
  return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatCompactIndian = (v) => {
  const n = Number(v)
  if (!isFinite(n)) return '0.00'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return sign + (abs / 1e7).toFixed(2) + 'Cr'
  if (abs >= 1e5) return sign + (abs / 1e5).toFixed(2) + 'L'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(2) + 'K'
  return sign + abs.toFixed(2)
}

export default function Client2Module() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { positions: cachedPositions, orders } = useData()
  const { groups, deleteGroup, getActiveGroupFilter, setActiveGroupFilter, filterByActiveGroup, activeGroupFilters } = useGroups()
  const [currentPage, setCurrentPage] = useState(1)
  const [currencyMode, setCurrencyMode] = useState(() => { try { return localStorage.getItem('client2CurrencyMode') || 'Combined' } catch { return 'Combined' } })
  const [showCurrencyDropdown, setShowCurrencyDropdown] = useState(false)
  const currencyDropdownRef = useRef(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [numericMode, setNumericMode] = useState(() => { try { const s = localStorage.getItem('globalDisplayMode'); return s === 'full' ? 'full' : 'compact' } catch { return 'compact' } })
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false)
  const [showPercent, setShowPercent] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isGroupOpen, setIsGroupOpen] = useState(false)
  const [isLoginGroupsOpen, setIsLoginGroupsOpen] = useState(false)
  const [isLoginGroupModalOpen, setIsLoginGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [selectedClient, setSelectedClient] = useState(null)
  // Ref so interval refresh can skip while the client detail modal is open
  const selectedClientRef = useRef(null)
  useEffect(() => { selectedClientRef.current = selectedClient }, [selectedClient])
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false)
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false)
  const [columnSearch, setColumnSearch] = useState('')
  const columnDropdownRef = useRef(null)
  const columnSelectorButtonRef = useRef(null)
  const abortControllerRef = useRef(null)
  const requestIdRef = useRef(0)
  const isFetchingRef = useRef(false)
  const [filters, setFilters] = useState({ hasFloating: false, hasCredit: false, noDeposit: false })
  const [hasPendingFilterChanges, setHasPendingFilterChanges] = useState(false)
  const [hasPendingGroupChanges, setHasPendingGroupChanges] = useState(false)
  const [pendingFilterDraft, setPendingFilterDraft] = useState(null)
  const [pendingGroupDraft, setPendingGroupDraft] = useState(null)
  const viewAllRef = useRef(null)
  const itemsPerPage = 15
  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearchInput, setDebouncedSearchInput] = useState('')
  const [showViewAllModal, setShowViewAllModal] = useState(false)
  // Persistent card order for mobile face cards
  const [cardOrder, setCardOrder] = useState([])
  const CARD_ORDER_KEY = 'client2-module-order'
  // Sorting state
  const [sortColumn, setSortColumn] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')
  const [dragStartLabel, setDragStartLabel] = useState(null)
  const [hoverIndex, setHoverIndex] = useState(null)
  const [touchDragIndex, setTouchDragIndex] = useState(null)
  const [touchStartX, setTouchStartX] = useState(null)
  const [touchStartY, setTouchStartY] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [touchHoverLabel, setTouchHoverLabel] = useState(null)
  const scrollContainerRef = useRef(null)
  const [columnSearchQuery, setColumnSearchQuery] = useState('')

  // Function to swap card order
  const swapOrder = (fromLabel, toLabel) => {
    if (fromLabel === toLabel) return
    
    const fromIndex = cardOrder.findIndex(label => label === fromLabel)
    const toIndex = cardOrder.findIndex(label => label === toLabel)
    
    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = [...cardOrder]
      const [moved] = newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, moved)
      setCardOrder(newOrder)
      try { 33333333333333
        localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(newOrder)) 
        console.log('Card order swapped:', fromLabel, '->', toLabel, newOrder)
      } catch (e) {
        console.error('Failed to save card order:', e)
      }
    }
  }

  // Clear all filters on component mount (when navigating to this module)
  useEffect(() => {
    setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
    setActiveGroupFilter('client2', null)
    setSearchInput('')
    setDebouncedSearchInput('')
  }, [])

  // Sync numericMode with global display mode events
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

  // Close currency dropdown on outside click
  useEffect(() => {
    const handleOutside = (e) => {
      if (currencyDropdownRef.current && !currencyDropdownRef.current.contains(e.target)) {
        setShowCurrencyDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const fmtMoney = (v) => {
    const n = Number(v)
    if (!isFinite(n)) return '0.00'
    if (numericMode === 'compact') return formatCompactIndian(n)
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // Debounce search input to prevent API collision during typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchInput(searchInput)
    }, 300) // 300ms debounce delay
    return () => clearTimeout(timer)
  }, [searchInput])

  // Listen for global request to open Customize View from child modals
  useEffect(() => {
    const handler = () => {
      // Close any open child modals first
      setIsFilterOpen(false)
      setIsLoginGroupsOpen(false)
      setIsLoginGroupModalOpen(false)
      // Open Customize menu
      setIsCustomizeOpen(true)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('openCustomizeView', handler)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openCustomizeView', handler)
      }
    }
  }, [])

  // API data state (restored)
  const [clients, setClients] = useState([])
  const [totals, setTotals] = useState({})
  const [rebateTotals, setRebateTotals] = useState({})
  const [totalClients, setTotalClients] = useState(0)
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now())
  const [isLoading, setIsLoading] = useState(true)
  // Visible columns state (mirrors desktop's 34-column list)
  const [visibleColumns, setVisibleColumns] = useState({
    login: true,
    name: true,
    equity: true,
    profit: true,
    lastName: false,
    middleName: false,
    email: false,
    phone: false,
    group: false,
    country: false,
    city: false,
    state: false,
    address: false,
    zipCode: false,
    clientID: false,
    status: false,
    leadSource: false,
    leadCampaign: false,
    balance: false,
    credit: false,
    margin: false,
    marginFree: false,
    marginLevel: false,
    leverage: false,
    currency: false,
    company: false,
    comment: false,
    registration: false,
    lastAccess: false,
    accountLastUpdate: false,
    userLastUpdate: false,
    applied_percentage: false,
    applied_percentage_is_custom: false,
    storage: false
  })

  // Fetch clients data via API
  const fetchClients = useCallback(async (overridePercent = null, isInitialLoad = false) => {
    // Skip periodic refresh if a fetch is already in-flight
    if (!isInitialLoad && isFetchingRef.current) return
    // Generate unique request ID to track this specific request
    const currentRequestId = ++requestIdRef.current
    
    try {
      // Only show loading on initial load, not on periodic refreshes
      if (isInitialLoad) {
        setIsLoading(true)
      }
      isFetchingRef.current = true
      const usePercent = overridePercent !== null ? overridePercent : showPercent
      
      // Build payload - always use itemsPerPage (12) for mobile pagination
      const payload = {
        page: currentPage,
        limit: itemsPerPage,
        percentage: usePercent,
        currency: currencyMode
      }

      // Add filters to payload (server-side filtering like desktop)
      const apiFilters = []
      if (filters.hasFloating) {
        apiFilters.push({ field: 'profit', operator: 'not_equal', value: '0' })
      }
      if (filters.hasCredit) {
        apiFilters.push({ field: 'credit', operator: 'greater_than', value: '0' })
      }
      if (filters.noDeposit) {
        apiFilters.push({ field: 'lifetimeDeposit', operator: 'equal', value: '0' })
      }
      if (apiFilters.length > 0) {
        payload.filters = apiFilters
      }

      // Add search query to payload for server-side filtering (like desktop)
      if (debouncedSearchInput && debouncedSearchInput.trim()) {
        payload.search = debouncedSearchInput.trim()
      }

      // Add group filter to payload if active
      const activeGroupName = getActiveGroupFilter('client2')
      let groupAccountsSet = null
      if (activeGroupName && groups && groups.length > 0) {
        const activeGroup = groups.find(g => g.name === activeGroupName)
        if (activeGroup) {
          console.log('[Client2] Group filter active:', activeGroupName, activeGroup)
          if (activeGroup.range) {
            // Range-based group
            payload.accountRangeMin = activeGroup.range.from
            payload.accountRangeMax = activeGroup.range.to
            console.log('[Client2] Applied range filter:', payload.accountRangeMin, '-', payload.accountRangeMax)
          } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
            // Manual selection group - store accounts for potential IB intersection
            groupAccountsSet = new Set(activeGroup.loginIds.map(id => String(id)))
            payload.mt5Accounts = Array.from(groupAccountsSet)
            console.log('[Client2] Applied manual group filter:', payload.mt5Accounts.length, 'accounts')
          }
        }
      }

      // Add sorting parameters to payload for server-side sorting
      if (sortColumn) {
        payload.sortBy = sortColumn
        payload.sortOrder = sortDirection
      }
      
      // Cancel previous pending request to prevent API collision
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      abortControllerRef.current = new AbortController()
      
      // Use searchClients to get totals data with percentage parameter
      const response = await brokerAPI.searchClients(payload, { signal: abortControllerRef.current.signal })
      
      // Ignore response if it's from an outdated request (stale data)
      if (currentRequestId !== requestIdRef.current) {
        console.log('[Client2Module] Ignoring stale response from request', currentRequestId, '(current:', requestIdRef.current, ')')
        if (isInitialLoad) {
          setIsLoading(false)
        }
        return
      }
      
      // Extract data from response.data.data structure
      const responseData = response?.data || {}
      const data = responseData?.data || responseData
      const t = data.totals || {}
      
      // Debug: Log first client to verify percentage fields
      if (data.clients && data.clients.length > 0 && usePercent) {
        console.log('[Client2] First client with percentage mode:', {
          login: data.clients[0].login,
          balance: data.clients[0].balance,
          balance_percentage: data.clients[0].balance_percentage,
          credit: data.clients[0].credit,
          credit_percentage: data.clients[0].credit_percentage,
          equity: data.clients[0].equity,
          equity_percentage: data.clients[0].equity_percentage
        })
      }
      
      setClients(data.clients || [])
      setTotals(t)
      setTotalClients(data.total || data.totalClients || data.clients?.length || 0)
      // Update total pages from API response if available
      const apiPages = data.pages ? Number(data.pages) : null
      setLastUpdateTime(Date.now())
      if (isInitialLoad) {
        setIsLoading(false)
      }
      isFetchingRef.current = false
      
      // Cards are now computed via useMemo based on filtered clients
    } catch (error) {
      // Ignore request cancellations caused by AbortController
      const isCanceled = error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED' || /aborted|canceled/i.test(error?.message || '')
      if (isCanceled) {
        console.log('[Client2Module] Request canceled (expected during rapid filtering)')
        if (isInitialLoad) {
          setIsLoading(false)
        }
        isFetchingRef.current = false
        return
      }
      console.error('Failed to fetch clients:', error)
      if (isInitialLoad) {
        setIsLoading(false)
      }
      isFetchingRef.current = false
    }
  }, [showPercent, filters, getActiveGroupFilter, groups, currentPage, sortColumn, sortDirection, debouncedSearchInput, currencyMode])

  // Fetch rebate totals from API
  const fetchRebateTotals = useCallback(async () => {
    try {
      const response = await brokerAPI.getIBCommissionTotals()
      const data = response?.data?.data || response?.data || {}
      setRebateTotals({
        totalRebate: data.total_commission || 0,
        totalRebatePercent: data.total_commission_percentage || 0,
        availableRebate: data.total_available_commission || 0,
        availableRebatePercent: data.total_available_commission_percentage || 0
      })
    } catch (err) {
      console.error('[Client2Module] Error fetching rebate totals:', err)
    }
  }, [])

  // Reset to page 1 when filters, search, or IB changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, debouncedSearchInput, getActiveGroupFilter('client2')])

  // Initial fetch and periodic refresh every 1 second (matching desktop)
  useEffect(() => {
    fetchClients(null, true) // Initial load with loading state
    fetchRebateTotals() // Fetch rebate totals on mount
    const interval = setInterval(() => { if (!selectedClientRef.current) fetchClients(null, false) }, 5000) // Periodic refresh every 5s (skip if in-flight or modal open)
    const rebateInterval = setInterval(() => fetchRebateTotals(), 3600000) // Refresh rebate every 1 hour
    return () => {
      clearInterval(interval)
      clearInterval(rebateInterval)
    }
  }, [fetchClients, fetchRebateTotals])

  // Return clients as-is since search is handled server-side via API
  const filteredClients = useMemo(() => {
    if (!Array.isArray(clients)) return []
    return clients.filter(c => c != null && c.login != null)
  }, [clients])

  // Calculate cards from API totals (filters are handled server-side)
  const cards = useMemo(() => {
    // Always use API totals since filters are server-side
    const addPercent = (label) => showPercent ? `${label} %` : label
    const t = totals || {}
    
    // Use totalClients for count
    const clientCount = totalClients || 0
    
    // Only show 6 face cards as requested
    return [
      { label: 'Total Clients', value: Number(clientCount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }), unit: 'Count', numericValue: clientCount },
      { label: addPercent('Balance'), value: fmtMoney(t.balance || 0), unit: 'USD', numericValue: t.balance || 0 },
      { label: addPercent('Credit'), value: fmtMoney(t.credit || 0), unit: 'USD', numericValue: t.credit || 0 },
      { label: addPercent('Equity'), value: fmtMoney(t.equity || 0), unit: 'USD', numericValue: t.equity || 0 },
      { label: addPercent('Floating P/L'), value: fmtMoney(t.floating || 0), unit: 'USD', numericValue: t.floating || 0, isArrow: true },
      { label: addPercent('P&L'), value: fmtMoney(t.pnl || 0), unit: 'USD', numericValue: t.pnl || 0, isArrow: true }
    ]
  }, [filteredClients, totals, rebateTotals, totalClients, filters, getActiveGroupFilter, debouncedSearchInput, showPercent, numericMode])

  // Initialize and reconcile saved card order whenever cards change
  useEffect(() => {
    if (!Array.isArray(cards) || cards.length === 0) return
    const labels = Array.from(new Set(cards.map(c => c.label)))
    let saved = []
    try {
      const raw = localStorage.getItem(CARD_ORDER_KEY)
      saved = raw ? JSON.parse(raw) : []
    } catch {}

    let order = Array.isArray(saved) && saved.length > 0
      ? saved.filter(l => labels.includes(l))
      : (() => {
          // Default order: prioritize key KPIs and requested commission/correction/swap cards
          const priority = [
            'Total Clients',
            'Lifetime P&L',
            'NET Lifetime DW',
            'Total Rebate',
            // Commission variants
            'This Week Commission',
            'This Month Commission',
            'Lifetime Commission',
            // Correction variants
            'This Week Correction',
            'This Month Correction',
            'Lifetime Correction',
            // Swap variants
            'This Week Swap',
            'This Month Swap',
            'Lifetime Swap'
          ]
          const priorityOrder = priority.filter(l => labels.includes(l))
          const remaining = labels.filter(l => !priority.includes(l))
          return [...priorityOrder, ...remaining]
        })()

    // Append any new labels not in saved order
    labels.forEach(l => { if (!order.includes(l)) order.push(l) })

    // If order differs, update state and persist
    const changed = JSON.stringify(order) !== JSON.stringify(cardOrder)
    if (changed) {
      setCardOrder(order)
      try { localStorage.setItem(CARD_ORDER_KEY, JSON.stringify(order)) } catch {}
    }
  }, [cards])

  // Order cards based on saved order
  const orderedCards = useMemo(() => {
    if (!Array.isArray(cards) || cards.length === 0) return []
    if (!Array.isArray(cardOrder) || cardOrder.length === 0) return cards
    const firstMap = new Map()
    for (const c of cards) { if (!firstMap.has(c.label)) firstMap.set(c.label, c) }
    return cardOrder.map(l => firstMap.get(l)).filter(Boolean)
  }, [cards, cardOrder])

  // Get icon path for each card
  const getCardIcon = (cardLabel) => {
    // Remove % suffix if present for matching
    const cleanLabel = cardLabel.replace(' %', '')
    const baseUrl = import.meta.env.BASE_URL || '/'
    const iconMap = {
      'Total Clients': `${baseUrl}mobile-icons/Clients.svg`,
      'Lifetime P&L': `${baseUrl}mobile-icons/LIFETIME PNL.svg`,
      'NET Lifetime DW': `${baseUrl}mobile-icons/NET WD.svg`,
      'Total Rebate': `${baseUrl}mobile-icons/AVAILABLE Commision.svg`,
      'Assets': `${baseUrl}mobile-icons/Balance.svg`,
      'Balance': `${baseUrl}mobile-icons/Balance.svg`,
      'Blocked Commission': `${baseUrl}mobile-icons/Blocked commision.svg`,
      'Blocked Profit': `${baseUrl}mobile-icons/Floating PNL.svg`,
      'Commission': `${baseUrl}mobile-icons/AVAILABLE Commision.svg`,
      'Credit': `${baseUrl}mobile-icons/Credit.svg`,
      'Daily Bonus In': `${baseUrl}mobile-icons/Daily BONUS IN.svg`,
      'Daily Bonus Out': `${baseUrl}mobile-icons/Daily BONUS OUT.svg`,
      'Daily Credit In': `${baseUrl}mobile-icons/LIFETIME CREDIT IN.svg`,
      'Daily Credit Out': `${baseUrl}mobile-icons/LIFETIME CREDIT OUT.svg`,
      'Daily Deposit': `${baseUrl}mobile-icons/Daily Deposite.svg`,
      'Daily P&L': `${baseUrl}mobile-icons/P&L.svg`,
      'Daily SO Compensation In': `${baseUrl}mobile-icons/Daily BONUS IN.svg`,
      'Daily SO Compensation Out': `${baseUrl}mobile-icons/Daily BONUS OUT.svg`,
      'Daily Withdrawal': `${baseUrl}mobile-icons/Daily WITHDRAWL.svg`,
      'Daily Net D/W': `${baseUrl}mobile-icons/NET WD.svg`,
      'NET Daily Bonus': `${baseUrl}mobile-icons/Net Daily Bonus.svg`,
      'Equity': `${baseUrl}mobile-icons/Equity.svg`,
      'Floating P/L': `${baseUrl}mobile-icons/Floating PNL.svg`,
      'Liabilities': `${baseUrl}mobile-icons/Balance.svg`,
      'Lifetime Bonus In': `${baseUrl}mobile-icons/LIFETIME BONUS IN.svg`,
      'Lifetime Bonus Out': `${baseUrl}mobile-icons/LIFETIME BONUS OUT.svg`,
      'Lifetime Credit In': `${baseUrl}mobile-icons/LIFETIME CREDIT IN.svg`,
      'Lifetime Credit Out': `${baseUrl}mobile-icons/LIFETIME CREDIT OUT.svg`,
      'Lifetime Deposit': `${baseUrl}mobile-icons/Daily Deposite.svg`,
      'Lifetime SO Compensation In': `${baseUrl}mobile-icons/LIFETIME BONUS IN.svg`,
      'Lifetime SO Compensation Out': `${baseUrl}mobile-icons/LIFETIME BONUS OUT.svg`,
      'Lifetime Withdrawal': `${baseUrl}mobile-icons/Daily WITHDRAWL.svg`,
      'Margin': `${baseUrl}mobile-icons/Balance.svg`,
      'Margin Free': `${baseUrl}mobile-icons/Balance.svg`,
      'Month Bonus In': `${baseUrl}mobile-icons/MONTHLY BONUS IN.svg`,
      'Month Bonus Out': `${baseUrl}mobile-icons/MONTHLY BONUS OUt.svg`,
      'Month Credit In': `${baseUrl}mobile-icons/MONTHLY CREDIT IN.svg`,
      'Month Credit Out': `${baseUrl}mobile-icons/MOnthly CREDIT OUT.svg`,
      'Month Deposit': `${baseUrl}mobile-icons/MONTLY DEPOSITE.svg`,
      'Month P&L': `${baseUrl}mobile-icons/THIS MONTH PNL.svg`,
      'Month SO Compensation In': `${baseUrl}mobile-icons/MONTHLY BONUS IN.svg`,
      'Month SO Compensation Out': `${baseUrl}mobile-icons/MONTHLY BONUS OUt.svg`,
      'Month Withdrawal': `${baseUrl}mobile-icons/MONTLY WITHDRAWL.svg`,
      'NET Month Bonus': `${baseUrl}mobile-icons/NET MONTHLY BONUS.svg`,
      'NET Month D/W': `${baseUrl}mobile-icons/NET MONTHLY DW.svg`,
      'Profit': `${baseUrl}mobile-icons/Floating PNL.svg`,
      'Storage': `${baseUrl}mobile-icons/Balance.svg`,
      'This Month PnL': `${baseUrl}mobile-icons/THIS MONTH PNL.svg`,
      'Week Bonus In': `${baseUrl}mobile-icons/Weekly bonus in.svg`,
      'Week Bonus Out': `${baseUrl}mobile-icons/WEEK BONUS OUT.svg`,
      'Week Credit In': `${baseUrl}mobile-icons/WEEKLY Credit IN.svg`,
      'Week Credit Out': `${baseUrl}mobile-icons/WEEKLY CREDIT OUT.svg`,
      'Week Deposit': `${baseUrl}mobile-icons/WEEK DEPOSITE.svg`,
      'Week P&L': `${baseUrl}mobile-icons/This week pnl.svg`,
      'Week SO Compensation In': `${baseUrl}mobile-icons/Weekly bonus in.svg`,
      'Week SO Compensation Out': `${baseUrl}mobile-icons/WEEK BONUS OUT.svg`,
      'Week Withdrawal': `${baseUrl}mobile-icons/WEEK WITHDRAWL.svg`,
      'NET Week Bonus': `${baseUrl}mobile-icons/NET WEEK BONUS.svg`,
      'NET Week D/W': `${baseUrl}mobile-icons/NET WEEK DAY.svg`,
      'Book PnL': `${baseUrl}mobile-icons/P&L.svg`,
      'P&L': `${baseUrl}mobile-icons/P&L.svg`,
      'PNL': `${baseUrl}mobile-icons/P&L.svg`,
      'This Week Commission': `${baseUrl}mobile-icons/AVAILABLE Commision.svg`,
      'This Month Commission': `${baseUrl}mobile-icons/AVAILABLE Commision.svg`,
      'Lifetime Commission': `${baseUrl}mobile-icons/AVAILABLE Commision.svg`,
      'This Week Correction': `${baseUrl}mobile-icons/Total Balance.svg`,
      'This Month Correction': `${baseUrl}mobile-icons/Total Balance.svg`,
      'Lifetime Correction': `${baseUrl}mobile-icons/Total Balance.svg`,
      'This Week Swap': `${baseUrl}mobile-icons/Total Balance.svg`,
      'This Month Swap': `${baseUrl}mobile-icons/Total Balance.svg`,
      'Lifetime Swap': `${baseUrl}mobile-icons/Total Balance.svg`,
    }
    return iconMap[cleanLabel] || `${baseUrl}mobile-icons/Clients.svg` // Default icon
  }

  // Calculate totals for table footer
  const clientStats = {
    totalBalance: filteredClients.reduce((sum, c) => sum + (Number(c.balance) || 0), 0),
    totalCredit: filteredClients.reduce((sum, c) => sum + (Number(c.credit) || 0), 0),
    totalEquity: filteredClients.reduce((sum, c) => sum + (Number(c.equity) || 0), 0),
    totalProfit: filteredClients.reduce((sum, c) => sum + (Number(c.profit) || 0), 0),
    totalMargin: filteredClients.reduce((sum, c) => sum + (Number(c.margin) || 0), 0),
    totalMarginFree: filteredClients.reduce((sum, c) => sum + (Number(c.marginFree) || 0), 0)
  }

  // Define percentage columns
  const percentageColumns = new Set([
    'balance', 'credit', 'equity', 'profit', 'marginFree', 'margin',
    'assets', 'storage', 'pnl', 'dailyDeposit', 'dailyWithdrawal',
    'lifetimePnL', 'thisMonthPnL', 'thisWeekPnL',
    'lifetimeCommission', 'thisMonthCommission', 'thisWeekCommission',
    'lifetimeCorrection', 'thisMonthCorrection', 'thisWeekCorrection',
    'lifetimeSwap', 'thisMonthSwap', 'thisWeekSwap'
  ])

  // Map base column keys to their percentage field names from API
  const percentageFieldMap = {
    'balance': 'balance_percentage',
    'credit': 'credit_percentage',
    'equity': 'equity_percentage',
    'profit': 'profit_percentage',
    'marginFree': 'marginFree_percentage',
    'margin': 'margin_percentage',
    'assets': 'assets_percentage',
    'storage': 'storage_percentage',
    'pnl': 'pnl_percentage',
    'dailyDeposit': 'dailyDeposit_percentage',
    'dailyWithdrawal': 'dailyWithdrawal_percentage',
    'lifetimePnL': 'lifetimePnL_percentage',
    'thisMonthPnL': 'thisMonthPnL_percentage',
    'thisWeekPnL': 'thisWeekPnL_percentage',
    'lifetimeCommission': 'lifetimeCommission_percentage',
    'thisMonthCommission': 'thisMonthCommission_percentage',
    'thisWeekCommission': 'thisWeekCommission_percentage',
    'lifetimeCorrection': 'lifetimeCorrection_percentage',
    'thisMonthCorrection': 'thisMonthCorrection_percentage',
    'thisWeekCorrection': 'thisWeekCorrection_percentage',
    'lifetimeSwap': 'lifetimeSwap_percentage',
    'thisMonthSwap': 'thisMonthSwap_percentage',
    'thisWeekSwap': 'thisWeekSwap_percentage'
  }

  // Helper function to get the value from client object based on percentage mode
  const getCellValue = (key, client) => {
    // If showPercent is true and this column supports percentage, use the percentage field
    if (showPercent && percentageColumns.has(key)) {
      const percentField = percentageFieldMap[key]
      const value = client[percentField]
      // Debug log for first few items
      if (client.login === clients[0]?.login && key === 'balance') {
        console.log('[getCellValue] showPercent:', showPercent, 'key:', key, 'percentField:', percentField, 'value:', value)
      }
      return value
    }
    // Otherwise use the regular field
    return client[key]
  }

  // Pagination - use totalClients from API for accurate page count
  // Sorting is now handled server-side, so use filteredClients directly
  const totalPages = Math.ceil(totalClients / itemsPerPage)
  const paginatedClients = filteredClients // API returns sorted and paginated data

  // View All handler
  useEffect(() => {
    if (viewAllRef.current) {
      viewAllRef.current.onclick = () => {
        setShowViewAllModal(true)
      }
    }
  }, [cards])

  // Navigate to next page
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1)
    }
  }

  // Navigate to previous page
  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1)
    }
  }

  // Alternative names for pagination functions used in UI
  const goToPreviousPage = goToPrevPage

  // Export functions - Fetch ALL data with current filters
  const exportTableColumns = async () => {
    try {
      console.log('[Client2Module] Starting table columns export...')
      setIsLoading(true)

      // Build payload with current filters to fetch ALL data
      const payload = {
        page: 1,
        limit: 100000, // Large limit to get all records
        percentage: showPercent
      }

      // Add filters to payload
      const apiFilters = []
      if (filters.hasFloating) {
        apiFilters.push({ field: 'profit', operator: 'not_equal', value: '0' })
      }
      if (filters.hasCredit) {
        apiFilters.push({ field: 'credit', operator: 'greater_than', value: '0' })
      }
      if (filters.noDeposit) {
        apiFilters.push({ field: 'lifetimeDeposit', operator: 'equal', value: '0' })
      }
      if (apiFilters.length > 0) {
        payload.filters = apiFilters
      }

      // Note: Search is handled client-side after fetching data

      // Add group filter
      const activeGroupName = getActiveGroupFilter('client2')
      let groupAccountsSet = null
      if (activeGroupName && groups && groups.length > 0) {
        const activeGroup = groups.find(g => g.name === activeGroupName)
        if (activeGroup) {
          if (activeGroup.range) {
            payload.accountRangeMin = activeGroup.range.from
            payload.accountRangeMax = activeGroup.range.to
          } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
            groupAccountsSet = new Set(activeGroup.loginIds.map(id => String(id)))
            payload.mt5Accounts = Array.from(groupAccountsSet)
          }
        }
      }

      // Fetch all data
      const response = await brokerAPI.searchClients(payload)
      const responseData = response?.data || {}
      const data = responseData?.data || responseData
      const allClients = (data.clients || []).filter(c => c != null && c.login != null)

      console.log('[Client2Module] Fetched', allClients.length, 'clients for export')

      if (allClients.length === 0) {
        alert('No data to export')
        setIsLoading(false)
        return
      }

      // Get data from visible columns only
      const headers = visibleColumnsList.map(col => col.label)
      const rows = allClients.map(client => {
        return visibleColumnsList.map(col => {
          if (col.key === 'balance' || col.key === 'credit' || col.key === 'equity' || col.key === 'profit' || col.key === 'marginFree' || col.key === 'margin') {
            return formatNum(client[col.key] || 0)
          } else if (col.key === 'name') {
            return client.name || client.fullName || client.clientName || client.email || '-'
          } else if (col.key === 'phone') {
            return client.phone || client.phoneNo || client.phone_number || '-'
          } else {
            return client[col.key] || '-'
          }
        })
      })
      
      // Create CSV
      let csv = headers.join(',') + '\n'
      rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n'
      })
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clients-table-columns-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setIsLoading(false)
      console.log('[Client2Module] Export completed successfully')
    } catch (error) {
      console.error('[Client2Module] Export failed:', error)
      alert('Export failed. Please try again.')
      setIsLoading(false)
    }
  }

  const exportAllColumns = async () => {
    try {
      console.log('[Client2Module] Starting all columns export...')
      setIsLoading(true)

      // Build payload with current filters to fetch ALL data
      const payload = {
        page: 1,
        limit: 100000, // Large limit to get all records
        percentage: showPercent
      }

      // Add filters to payload
      const apiFilters = []
      if (filters.hasFloating) {
        apiFilters.push({ field: 'profit', operator: 'not_equal', value: '0' })
      }
      if (filters.hasCredit) {
        apiFilters.push({ field: 'credit', operator: 'greater_than', value: '0' })
      }
      if (filters.noDeposit) {
        apiFilters.push({ field: 'lifetimeDeposit', operator: 'equal', value: '0' })
      }
      if (apiFilters.length > 0) {
        payload.filters = apiFilters
      }

      // Note: Search is handled client-side after fetching data

      // Add group filter
      const activeGroupName = getActiveGroupFilter('client2')
      let groupAccountsSet = null
      if (activeGroupName && groups && groups.length > 0) {
        const activeGroup = groups.find(g => g.name === activeGroupName)
        if (activeGroup) {
          if (activeGroup.range) {
            payload.accountRangeMin = activeGroup.range.from
            payload.accountRangeMax = activeGroup.range.to
          } else if (activeGroup.loginIds && activeGroup.loginIds.length > 0) {
            groupAccountsSet = new Set(activeGroup.loginIds.map(id => String(id)))
            payload.mt5Accounts = Array.from(groupAccountsSet)
          }
        }
      }

      // Fetch all data
      const response = await brokerAPI.searchClients(payload)
      const responseData = response?.data || {}
      const data = responseData?.data || responseData
      const allClients = (data.clients || []).filter(c => c != null && c.login != null)

      console.log('[Client2Module] Fetched', allClients.length, 'clients for export')

      if (allClients.length === 0) {
        alert('No data to export')
        setIsLoading(false)
        return
      }

      // Export ALL columns regardless of visibility
      const allColumnKeys = columnConfig.map(col => col)
      const headers = allColumnKeys.map(col => col.label)
      const rows = allClients.map(client => {
        return allColumnKeys.map(col => {
          if (col.key === 'balance' || col.key === 'credit' || col.key === 'equity' || col.key === 'profit' || col.key === 'marginFree' || col.key === 'margin') {
            return formatNum(client[col.key] || 0)
          } else if (col.key === 'name') {
            return client.name || client.fullName || client.clientName || client.email || '-'
          } else if (col.key === 'phone') {
            return client.phone || client.phoneNo || client.phone_number || '-'
          } else {
            return client[col.key] || '-'
          }
        })
      })
      
      // Create CSV
      let csv = headers.join(',') + '\n'
      rows.forEach(row => {
        csv += row.map(cell => `"${cell}"`).join(',') + '\n'
      })
      
      // Download
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `clients-all-columns-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      setIsLoading(false)
      console.log('[Client2Module] Export completed successfully')
    } catch (error) {
      console.error('[Client2Module] Export failed:', error)
      alert('Export failed. Please try again.')
      setIsLoading(false)
    }
  }

  // Table columns configuration
  const columnConfig = [
    { key: 'login', label: 'Login', width: '80px', sticky: true },
    { key: 'name', label: 'Name', width: '120px' },
    { key: 'equity', label: 'Equity', width: '90px' },
    { key: 'profit', label: 'Floating Profit', width: '110px' },
    { key: 'lastName', label: 'Last Name', width: '100px' },
    { key: 'middleName', label: 'Middle Name', width: '100px' },
    { key: 'email', label: 'Email', width: '140px' },
    { key: 'phone', label: 'Phone', width: '100px' },
    { key: 'group', label: 'Group', width: '80px' },
    { key: 'country', label: 'Country', width: '80px' },
    { key: 'city', label: 'City', width: '80px' },
    { key: 'state', label: 'State', width: '80px' },
    { key: 'address', label: 'Address', width: '140px' },
    { key: 'zipCode', label: 'Zip Code', width: '80px' },
    { key: 'clientID', label: 'ID', width: '80px' },
    { key: 'status', label: 'Status', width: '80px' },
    { key: 'leadSource', label: 'Lead Source', width: '110px' },
    { key: 'leadCampaign', label: 'Lead Campaign', width: '120px' },
    { key: 'balance', label: 'Balance', width: '90px' },
    { key: 'credit', label: 'Credit', width: '80px' },
    { key: 'margin', label: 'Margin', width: '80px' },
    { key: 'marginFree', label: 'Margin Free', width: '100px' },
    { key: 'marginLevel', label: 'Margin Level', width: '110px' },
    { key: 'leverage', label: 'Leverage', width: '80px' },
    { key: 'currency', label: 'Currency', width: '80px' },
    { key: 'company', label: 'Company', width: '100px' },
    { key: 'comment', label: 'Comment', width: '120px' },
    { key: 'registration', label: 'Registration', width: '120px' },
    { key: 'lastAccess', label: 'Last Access', width: '120px' },
    { key: 'accountLastUpdate', label: 'Account Last Update', width: '150px' },
    { key: 'userLastUpdate', label: 'User Last Update', width: '140px' },
    { key: 'applied_percentage', label: 'Applied Percentage', width: '120px' },
    { key: 'applied_percentage_is_custom', label: 'Is Custom Percentage', width: '140px' },
    { key: 'storage', label: 'Storage', width: '80px' }
  ]

  // Helper function to format value based on percentage mode  
  const formatCellValue = (key, value) => {
    if (value === null || value === undefined) return '-'
    
    // Handle processorType boolean field
    if (key === 'processorType') {
      return value === true ? 'Connected' : 'Not Connected'
    }
    
    // If showPercent is true and this column supports percentage
    if (showPercent && percentageColumns.has(key)) {
      // The API returns the percentage value directly, format it as a number
      const num = Number(value)
      if (isNaN(num)) return '-'
      return formatNum(num)  // Display the raw percentage value from API
    }
    
    // Otherwise format as number (for numeric columns)
    if (percentageColumns.has(key)) {
      return fmtMoney(value || 0)
    }
    
    return value
  }

  // Get visible columns based on state with dynamic labels
  const visibleColumnsList = useMemo(() => {
    return columnConfig.filter(col => visibleColumns[col.key]).map(col => ({
      ...col,
      label: (showPercent && percentageColumns.has(col.key)) ? `${col.label} %` : col.label
    }))
  }, [visibleColumns, showPercent, percentageColumns])

  // Handle column sorting
  const handleSort = (columnKey) => {
    // Prevent multiple sort clicks while data is loading
    if (isLoading) {
      return
    }

    if (sortColumn === columnKey) {
      // Toggle direction if same column
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      // New column, default to ascending
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
    // Reset to page 1 when sorting changes
    setCurrentPage(1)
  }

  // Generate grid template columns string
  const gridTemplateColumns = useMemo(() => {
    return visibleColumnsList.map(col => col.width).join(' ')
  }, [visibleColumnsList])

  return (
    <div className="w-full min-h-screen bg-[#F8FAFC] flex flex-col lg:hidden">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-12 h-12 rounded-2xl bg-[#F8F8F8] flex items-center justify-center"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-black">Clients</h1>
          <div className="w-9 h-9"></div>
        </div>
      </div>

      {/* Sidebar overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-30">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/25"
            onClick={() => setIsSidebarOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute left-0 top-0 h-full w-[300px] bg-white shadow-xl rounded-r-2xl flex flex-col">
            <div className="p-4 flex items-center gap-3 border-b border-[#ECECEC]">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#1A63BC"/></svg>
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-[#1A63BC]">Broker Eyes</div>
                <div className="text-[11px] text-[#7A7A7A]">Trading Platform</div>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="w-8 h-8 rounded-lg bg-[#F5F5F5] flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#404040" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto py-2">
              {/* Compact / Full display mode toggle */}
              <div className="px-3 pb-3 pt-1">
                <p className="text-[9px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1.5 px-1">Display Mode</p>
                <div className="flex items-center bg-[#F3F4F6] p-0.5 w-full rounded">
                  <button type="button" onClick={() => { setNumericMode('compact'); try { localStorage.setItem('globalDisplayMode','compact') } catch {} try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged',{detail:'compact'})) } catch {} }} className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode==='compact'?'bg-[#3B5BDB] text-white shadow-sm':'text-[#374151] hover:bg-white/70'}`}>Compact</button>
                  <button type="button" onClick={() => { setNumericMode('full'); try { localStorage.setItem('globalDisplayMode','full') } catch {} try { window.dispatchEvent(new CustomEvent('globalDisplayModeChanged',{detail:'full'})) } catch {} }} className={`flex-1 py-1.5 text-[11px] font-medium transition-colors rounded ${numericMode==='full'?'bg-[#3B5BDB] text-white shadow-sm':'text-[#374151] hover:bg-white/70'}`}>Full</button>
                </div>
              </div>
              <div className="border-t border-[#ECECEC] mb-2" />
              <nav className="flex flex-col">
                {[
                  {label:'Dashboard', path:'/dashboard', icon: (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="3" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="3" y="14" width="7" height="7" rx="1.5" stroke="#404040"/><rect x="14" y="14" width="7" height="7" rx="1.5" stroke="#404040"/></svg>
                  )},
                  {label:'Clients', path:'/client2', active:true, icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" stroke="#1A63BC"/><circle cx="16" cy="8" r="3" stroke="#1A63BC"/><path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="#1A63BC"/></svg>
                  )},
                  {label:'Positions', path:'/positions', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="11" width="18" height="3" rx="1" stroke="#404040"/><rect x="3" y="16" width="18" height="3" rx="1" stroke="#404040"/></svg>
                  )},
                  {label:'Pending Orders', path:'/pending-orders', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#404040"/><circle cx="12" cy="12" r="2" fill="#404040"/></svg>
                  )},
                  {label:'Margin Level', path:'/margin-level', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 18L10 12L14 16L20 8" stroke="#404040" strokeWidth="2"/></svg>
                  )},
                  {label:'Live Dealing', path:'/live-dealing', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 12a9 9 0 0 1 18 0" stroke="#404040"/><path d="M7 12a5 5 0 0 1 10 0" stroke="#404040"/></svg>
                  )},
                  {label:'Client Percentage', path:'/client-percentage', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6" stroke="#404040"/><circle cx="8" cy="8" r="2" stroke="#404040"/><circle cx="16" cy="16" r="2" stroke="#404040"/></svg>
                  )},
                  {label:'Settings', path:'/settings', icon:(
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z" stroke="#404040"/><path d="M4 12h2M18 12h2M12 4v2M12 18v2" stroke="#404040"/></svg>
                  )},
                ].map((item, idx) => (
                  <button 
                    key={idx} 
                    onClick={() => {
                      navigate(item.path)
                      setIsSidebarOpen(false)
                    }}
                    className={`flex items-center gap-3 px-4 h-11 text-[13px] ${item.active ? 'text-[#1A63BC] bg-[#EFF4FB] rounded-lg font-semibold' : 'text-[#404040]'}`}
                  >
                    <span className="w-5 h-5 flex items-center justify-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-4 mt-auto border-t border-[#ECECEC]">
              <button 
                onClick={logout}
                className="flex items-center gap-3 px-2 h-10 text-[13px] text-[#404040]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 18.25C11.8011 18.25 11.6103 18.329 11.4697 18.4697C11.329 18.6103 11.25 18.8011 11.25 19C11.25 19.1989 11.329 19.3897 11.4697 19.5303C11.6103 19.671 11.8011 19.75 12 19.75H18C18.4641 19.75 18.9092 19.5656 19.2374 19.2374C19.5656 18.9092 19.75 18.4641 19.75 18V6C19.75 5.53587 19.5656 5.09075 19.2374 4.76256C18.9092 4.43437 18.4641 4.25 18 4.25H12C11.8011 4.25 11.6103 4.32902 11.4697 4.46967C11.329 4.61032 11.25 4.80109 11.25 5C11.25 5.19891 11.329 5.38968 11.4697 5.53033C11.6103 5.67098 11.8011 5.75 12 5.75H18C18.0663 5.75 18.1299 5.77634 18.1768 5.82322C18.2237 5.87011 18.25 5.9337 18.25 6V18C18.25 18.0663 18.2237 18.1299 18.1768 18.1768C18.1299 18.2237 18.0663 18.25 18 18.25H12Z" fill="#FF5F57"/>
                  <path fillRule="evenodd" clipRule="evenodd" d="M14.5029 14.365C15.1929 14.365 15.7529 13.805 15.7529 13.115V10.875C15.7529 10.185 15.1929 9.62498 14.5029 9.62498H9.8899L9.8699 9.40498L9.8159 8.84898C9.79681 8.65261 9.73064 8.46373 9.62301 8.29838C9.51538 8.13302 9.36946 7.99606 9.19763 7.8991C9.0258 7.80214 8.83312 7.74805 8.63593 7.74142C8.43874 7.73478 8.24286 7.77579 8.0649 7.86098C6.42969 8.64307 4.94977 9.71506 3.6969 11.025L3.5979 11.128C3.37433 11.3612 3.24951 11.6719 3.24951 11.995C3.24951 12.3181 3.37433 12.6287 3.5979 12.862L3.6979 12.965C4.95047 14.2748 6.43005 15.3468 8.0649 16.129C8.24286 16.2142 8.43874 16.2552 8.63593 16.2485C8.83312 16.2419 9.0258 16.1878 9.19763 16.0909C9.36946 15.9939 9.51538 15.8569 9.62301 15.6916C9.73064 15.5262 9.79681 15.3374 9.8159 15.141L9.8699 14.585L9.8899 14.365H14.5029ZM9.1949 12.865C9.00405 12.8651 8.82044 12.938 8.68147 13.0688C8.54249 13.1996 8.45861 13.3785 8.4469 13.569C8.42823 13.859 8.4049 14.1493 8.3769 14.44L8.3609 14.602C7.05583 13.9285 5.86846 13.0481 4.8449 11.995C5.86846 10.9418 7.05583 10.0614 8.3609 9.38798L8.3769 9.54998C8.4049 9.83998 8.42823 10.1303 8.4469 10.421C8.45861 10.6115 8.54249 10.7903 8.68147 10.9211C8.82044 11.0519 9.00405 11.1248 9.1949 11.125H14.2529V12.865H9.1949Z" fill="#FF5F57"/>
                </svg>
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Action buttons and View All row */}
        <div className="pt-5 pb-4 px-2 sm:px-4">
          <div className="flex items-center justify-between">
            {/* Left side - Filter, %, Download buttons */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsCustomizeOpen(true)} 
                className={`h-8 px-3 rounded-[12px] border shadow-sm flex items-center justify-center gap-2 transition-all relative ${
                  (filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('client2'))
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M4.5 6.5H9.5M2.5 3.5H11.5M5.5 9.5H8.5" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="text-[#4B4B4B] text-[10px] font-medium font-outfit">Filter</span>
                {(() => {
                  const filterCount = [
                    filters.hasFloating,
                    filters.hasCredit,
                    filters.noDeposit,
                    getActiveGroupFilter('client2')
                  ].filter(Boolean).length;
                  return filterCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {filterCount}
                    </span>
                  ) : null;
                })()}
              </button>
              <button
                onClick={() => {
                  const next = !showPercent
                  setShowPercent(next)
                  // Immediately refetch with the next percentage state
                  fetchClients(next)
                }}
                className={`w-8 h-8 rounded-lg border shadow-sm flex items-center justify-center transition-colors ${
                  showPercent ? 'bg-blue-50 border-blue-200' : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
                }`}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 12L12 4M4.5 6.5C5.32843 6.5 6 5.82843 6 5C6 4.17157 5.32843 3.5 4.5 3.5C3.67157 3.5 3 4.17157 3 5C3 5.82843 3.67157 6.5 4.5 6.5ZM11.5 12.5C12.3284 12.5 13 11.8284 13 11C13 10.1716 12.3284 9.5 11.5 9.5C10.6716 9.5 10 10.1716 10 11C10 11.8284 10.6716 12.5 11.5 12.5Z" stroke="#4B4B4B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {/* Currency mode dropdown */}
              <div className="relative" ref={currencyDropdownRef}>
                <button
                  onClick={() => setShowCurrencyDropdown(v => !v)}
                  className={`h-8 px-2.5 rounded-[10px] border shadow-sm flex items-center gap-1.5 transition-colors ${
                    currencyMode !== 'Combined'
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-white border-[#E5E7EB] hover:bg-gray-50'
                  }`}
                  title="Currency"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="8" cy="8" r="5.5" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.5"/>
                    <circle cx="16" cy="16" r="5.5" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.5"/>
                    <path d="M6.5 7h3M6.5 9h3M8 7v4" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M14.5 15h3M14.5 15c0-.83.67-1.5 1.5-1.5h.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5H16c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5h.5c.83 0 1.5-.67 1.5-1.5" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.2" strokeLinecap="round"/>
                    <path d="M13 10.5L10.5 13M10.5 10.5L13 13" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  <span className={`text-[10px] font-semibold ${currencyMode !== 'Combined' ? 'text-[#2563EB]' : 'text-[#4B4B4B]'}`}>
                    {currencyMode}
                  </span>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 3.5L5 6.5L8 3.5" stroke={currencyMode !== 'Combined' ? '#2563EB' : '#4B4B4B'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {showCurrencyDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-[120px] bg-white border border-[#ECECEC] rounded-[10px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] z-50 overflow-hidden">
                    {['Combined', 'INR', 'USD'].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setCurrencyMode(opt)
                          try { localStorage.setItem('client2CurrencyMode', opt) } catch {}
                          setCurrentPage(1)
                          setShowCurrencyDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-[12px] font-medium flex items-center gap-2 transition-colors ${
                          currencyMode === opt
                            ? 'bg-blue-50 text-[#2563EB]'
                            : 'text-[#374151] hover:bg-gray-50'
                        }`}
                      >
                        {currencyMode === opt && (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6L5 9L10 3" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        {currencyMode !== opt && <span className="w-3" />}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Download button and dropdown */}
              <div className="relative" ref={columnDropdownRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsColumnDropdownOpen(true);
                  }}
                  className="w-8 h-8 rounded-lg bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                  title="Download"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 3v10m0 0l-4-4m4 4l4-4" stroke="#374151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="4" y="15" width="12" height="2" rx="1" fill="#374151"/>
                  </svg>
                </button>
                {/* Dropdown menu - simple absolute positioning */}
                {isColumnDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsColumnDropdownOpen(false)}
                    />
                    <div
                      className="absolute top-full left-0 mt-1 w-[160px] bg-white border border-[#ECECEC] rounded-[8px] shadow-[0_0_12px_rgba(75,75,75,0.15)] z-50"
                      onClick={e => e.stopPropagation()}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportTableColumns();
                          setIsColumnDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[12px] text-[#404040] hover:bg-gray-50 flex items-center gap-2 border-b border-[#F5F5F5]"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="2" y="3" width="12" height="10" stroke="#404040" strokeWidth="1" rx="1" fill="none"/>
                          <line x1="2" y1="6" x2="14" y2="6" stroke="#404040" strokeWidth="1"/>
                          <line x1="6" y1="3" x2="6" y2="13" stroke="#404040" strokeWidth="1"/>
                        </svg>
                        Download Table Columns
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportAllColumns();
                          setIsColumnDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[12px] text-[#404040] hover:bg-gray-50 flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <rect x="1" y="2" width="14" height="12" stroke="#404040" strokeWidth="1" rx="1" fill="none"/>
                          <line x1="1" y1="5" x2="15" y2="5" stroke="#404040" strokeWidth="1"/>
                          <line x1="5" y1="2" x2="5" y2="14" stroke="#404040" strokeWidth="1"/>
                          <line x1="10" y1="2" x2="10" y2="14" stroke="#404040" strokeWidth="1"/>
                        </svg>
                        Download All Columns
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Refresh button */}
              <button
                onClick={() => window.location.reload()}
                disabled={isLoading}
                className="w-8 h-8 rounded-lg border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="#4B4B4B"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* Right side - View All */}
            <span
              ref={viewAllRef}
              className="text-[#1A63BC] text-[12px] font-semibold leading-[15px] cursor-pointer"
            >
              View All
            </span>
          </div>
        </div>

        {/* Face Cards Carousel */}
        <div className="pb-2 pl-2 sm:pl-5">
          <div 
            ref={scrollContainerRef}
            className="flex gap-[8px] overflow-x-auto scrollbar-hide snap-x snap-mandatory pr-4"
          >
            {orderedCards.map((card, i) => (
                <div 
                  key={`${card.label}-${lastUpdateTime}`}
                  style={{
                    boxSizing: 'border-box',
                    minWidth: '125px',
                    width: '125px',
                    height: '60px',
                    background: '#FFFFFF',
                    border: '1px solid #F2F2F7',
                    boxShadow: '0px 0px 12px rgba(75, 75, 75, 0.05)',
                    borderRadius: '12px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    scrollSnapAlign: 'start',
                    flexShrink: 0,
                    flex: 'none',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    touchAction: 'pan-x'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'none' }}>
                    <span style={{ color: '#4B4B4B', fontSize: '9px', fontWeight: 600, lineHeight: '12px', paddingRight: '4px' }}>{card.label}</span>
                    <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: '4px' }}>
                      <img 
                        src={getCardIcon(card.label)} 
                        alt={card.label}
                        style={{ width: '16px', height: '16px', filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                        onError={(e) => {
                          // Fallback to default icon if image fails to load
                          e.target.style.display = 'none'
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minHeight: '16px', pointerEvents: 'none' }}>
                    {card.isArrow && card.numericValue !== 0 && (
                      <span style={{ fontSize: '10px', color: card.numericValue > 0 ? '#16A34A' : '#DC2626', lineHeight: 1, flexShrink: 0 }}>
                        {card.numericValue > 0 ? '▲' : '▼'}
                      </span>
                    )}
                    <span style={{
                      fontSize: '13px',
                      fontWeight: 700,
                      lineHeight: '14px',
                      letterSpacing: '-0.01em',
                      color: card.isArrow
                        ? (card.numericValue > 0 ? '#16A34A' : card.numericValue < 0 ? '#DC2626' : '#000000')
                        : (card.numericValue > 0 ? '#16A34A' : card.numericValue < 0 ? '#DC2626' : '#000000')
                    }}>
                      {card.value === '' || card.value === undefined ? '0.00' : card.value}
                    </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search and Controls Bar - Separate from table */}
        <div className="mx-1 sm:mx-4 mb-1 px-3 py-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Search box */}
              <div className="flex-1 min-w-0 h-7 sm:h-10 bg-[#F9FAFB] border border-[#E5E7EB] rounded-md px-2 sm:px-3 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 text-[#9CA3AF]">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M13 13L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <input 
                  placeholder="Search" 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="flex-1 min-w-0 text-[11px] sm:text-sm text-[#1F2937] placeholder-[#9CA3AF] outline-none bg-transparent font-outfit focus:ring-0" 
                />
              </div>
              
              {/* Column selector button */}
              <div className="relative" ref={columnSelectorButtonRef}>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsColumnSelectorOpen(true)
                  }}
                  className="h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors"
                  title="Show/Hide Columns"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="4" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                    <rect x="8" y="3" width="6" height="10" rx="1" stroke="#4B5563" strokeWidth="1.2"/>
                  </svg>
                </button>
              </div>

              {/* Previous button */}
              <button 
                onClick={goToPreviousPage}
                disabled={currentPage === 1}
                className={`h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage === 1 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M12 14L8 10L12 6" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Page indicator */}
              <div className="flex items-center gap-0.5 text-[11px] sm:text-sm text-[#4B5563]">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (!isNaN(n) && n >= 1 && n <= totalPages) {
                      setCurrentPage(n)
                    }
                  }}
                  className="w-8 sm:w-12 h-6 sm:h-8 border border-[#E5E7EB] rounded-md text-center text-[11px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Current page"
                />
                <span className="text-[#9CA3AF]">/</span>
                <span>{totalPages}</span>
              </div>

              {/* Next button */}
              <button 
                onClick={goToNextPage}
                disabled={currentPage === totalPages}
                className={`h-7 w-7 sm:h-10 sm:w-10 rounded-md bg-white border border-[#E5E7EB] shadow-sm flex items-center justify-center transition-colors flex-shrink-0 ${
                  currentPage === totalPages ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none">
                  <path d="M8 6L12 10L8 14" stroke="#4B5563" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
        </div>

        {/* Table Container - Separate from search */}
        <div className="bg-white shadow-sm border border-blue-100 overflow-hidden mx-1 sm:mx-4">

          {/* Table area */}
          <div className="relative">
            <div className="w-full overflow-x-auto overflow-y-visible" style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#CBD5E0 #F7FAFC',
            paddingRight: '0px',
            paddingLeft: '0px'
          }}>
            <div className="relative" style={{ minWidth: 'max-content' }}>
              {/* Header row */}
              <div className="grid bg-blue-500 text-white text-[10px] font-semibold font-outfit sticky top-0 z-20 shadow-[0_2px_4px_rgba(0,0,0,0.1)]" style={{gap: '0px', gridGap: '0px', columnGap: '0px', gridTemplateColumns}}>
                {visibleColumnsList.map((col, idx) => (
                  <div 
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className={`h-[28px] flex items-center justify-start px-1 gap-1 ${isLoading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${col.sticky ? 'sticky left-0 bg-blue-500 z-30' : ''}`}
                    style={{
                      border: 'none', 
                      outline: 'none', 
                      boxShadow: 'none',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none',
                      touchAction: 'manipulation'
                    }}
                  >
                    <span>{col.label}</span>
                    {sortColumn === col.key && (
                      <svg className={`w-3 h-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              
              {/* Rows */}
              {isLoading ? (
                // Skeleton loading for table rows
                <>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <div key={`skeleton-row-${i}`} className="grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1]" style={{gap: '0px', gridGap: '0px', columnGap: '0px', gridTemplateColumns}}>
                      {visibleColumnsList.map((col, colIdx) => (
                        <div 
                          key={col.key}
                          className={`h-[38px] flex items-center justify-start px-2 ${
                            col.sticky ? 'sticky left-0 bg-white z-10' : ''
                          }`}
                          style={{border: 'none', outline: 'none', boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'}}
                        >
                          <div className="h-3 w-full max-w-[80%] bg-gray-200 rounded animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  ))}
                </>
              ) : (
                paginatedClients.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 bg-white border-b border-[#E1E1E1]">
                    <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                    <p className="font-medium text-gray-700">
                      {(filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('client2') || searchInput.trim())
                        ? 'No clients match the applied filters'
                        : 'No clients found'}
                    </p>
                    {(filters.hasFloating || filters.hasCredit || filters.noDeposit || getActiveGroupFilter('client2') || searchInput.trim()) && (
                      <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or search criteria</p>
                    )}
                  </div>
                ) : 
                  <div>
                  {paginatedClients.map((client, idx) => {
                    const rowData = {};
                    visibleColumnsList.forEach(col => {
                      if (col.key === 'name') {
                        rowData[col.key] = client.name || client.fullName || client.clientName || client.email || '-';
                      } else if (col.key === 'lastName') {
                        rowData[col.key] = client.lastName || client.last_name || '-';
                      } else if (col.key === 'middleName') {
                        rowData[col.key] = client.middleName || client.middle_name || '-';
                      } else if (col.key === 'phone') {
                        rowData[col.key] = client.phone || client.phoneNo || client.phone_number || '-';
                      } else if (col.key === 'zipCode') {
                        rowData[col.key] = client.zipCode || client.zip_code || '-';
                      } else if (col.key === 'clientID') {
                        rowData[col.key] = client.clientID || client.client_id || '-';
                      } else if (col.key === 'processorType') {
                        // Handle processorType boolean value
                        rowData[col.key] = formatCellValue('processorType', client.processorType);
                      } else if (percentageColumns.has(col.key)) {
                        // Use getCellValue to get the correct field, then format it
                        const value = getCellValue(col.key, client);
                        rowData[col.key] = formatCellValue(col.key, value);
                        // Debug first non-zero balance
                        if (col.key === 'balance' && value !== 0 && !window._loggedBalance) {
                          window._loggedBalance = true;
                          console.log('[Table Cell] balance column:', {
                            showPercent,
                            clientLogin: client.login,
                            balance: client.balance,
                            balance_percentage: client.balance_percentage,
                            valueFromGetCellValue: value,
                            formatted: rowData[col.key]
                          });
                        }
                      } else {
                        rowData[col.key] = client[col.key] || '-';
                      }
                    });
                    
                    return (
                      <div key={client.login || idx} className="grid text-[10px] text-[#4B4B4B] font-outfit bg-white border-b border-[#E1E1E1] hover:bg-[#F8FAFC] transition-colors" style={{gap: '0px', gridGap: '0px', columnGap: '0px', gridTemplateColumns}}>
                        {visibleColumnsList.map((col, colIdx) => (
                          <div 
                            key={col.key}
                            onClick={() => col.key === 'login' && setSelectedClient(client)}
                            className={`h-[38px] flex items-center justify-start px-2 overflow-hidden text-ellipsis whitespace-nowrap ${
                              col.key === 'login' ? 'text-[#1A63BC] font-semibold sticky left-0 bg-white z-10 cursor-pointer hover:underline' : ''
                            }`}
                            style={{border: 'none', outline: 'none', boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'}}
                          >
                            {col.key === 'processorType' ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium ${
                                client.processorType === true 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {client.processorType === true ? 'Connected' : 'Not Connected'}
                              </span>
                            ) : col.key === 'accountType' ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-medium uppercase ${
                                (client.accountType || '').toLowerCase() === 'gold' 
                                  ? 'bg-yellow-100 text-yellow-800' 
                                  : (client.accountType || '').toLowerCase() === 'silver'
                                  ? 'bg-gray-200 text-gray-700'
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {client.accountType || '-'}
                              </span>
                            ) : (
                              rowData[col.key]
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  
                  {/* Total Row */}
                  {filteredClients.length > 0 && (
                    <div>
                      <div style={{ height: '2px', backgroundColor: '#1A63BC', width: '100%' }} />
                      <div 
                        className="grid text-[10px] text-[#1A63BC] font-outfit bg-[#EFF4FB]"
                        style={{
                          gap: '0px', 
                          gridGap: '0px', 
                          columnGap: '0px',
                          gridTemplateColumns
                        }}
                      >
                        {visibleColumnsList.map((col, idx) => (
                          <div 
                            key={col.key}
                            className={`h-[38px] flex items-center justify-start px-2 font-semibold ${col.key === 'login' ? 'font-bold sticky left-0 bg-[#EFF4FB] z-10' : ''}`}
                            style={{
                              border: 'none', 
                              outline: 'none', 
                              boxShadow: col.sticky ? '2px 0 4px rgba(0,0,0,0.05)' : 'none'
                            }}
                          >
                            {col.key === 'login' ? 'Total' : 
                             col.key === 'balance' ? formatCellValue('balance', clientStats?.totalBalance || 0) :
                             col.key === 'profit' ? formatCellValue('profit', clientStats?.totalProfit || 0) :
                             col.key === 'credit' ? formatCellValue('credit', clientStats?.totalCredit || 0) :
                             col.key === 'equity' ? formatCellValue('equity', clientStats?.totalEquity || 0) :
                             col.key === 'margin' ? formatCellValue('margin', clientStats?.totalMargin || 0) :
                             col.key === 'marginFree' ? formatCellValue('marginFree', clientStats?.totalMarginFree || 0) :
                             ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* End of Search Bar and Table Container */}
      </div>
      {/* End of Main Content */}

      {/* CustomizeView Modal (shared) */}
      <CustomizeViewModal
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        onFilterClick={() => {
          setIsCustomizeOpen(false)
          setIsFilterOpen(true)
        }}
        onGroupsClick={() => {
          setIsCustomizeOpen(false)
          setIsLoginGroupsOpen(true)
        }}
        onReset={() => {
          // Invalidate any in-flight requests from previous filter state
          requestIdRef.current++
          setFilters({ hasFloating: false, hasCredit: false, noDeposit: false })
          setActiveGroupFilter('client2', null)
          setHasPendingFilterChanges(false)
          setPendingFilterDraft(null)
          setHasPendingGroupChanges(false)
          setPendingGroupDraft(null)
        }}
        onApply={() => {
          // Apply any pending changes made in sub-modals
          if (hasPendingFilterChanges && pendingFilterDraft) {
            setFilters(pendingFilterDraft)
          }
          setIsCustomizeOpen(false)
          setHasPendingFilterChanges(false)
          setHasPendingGroupChanges(false)
          setPendingFilterDraft(null)
          setPendingGroupDraft(null)
        }}
        hasPendingChanges={hasPendingFilterChanges || hasPendingGroupChanges}
      />

      {/* Filter Modal */}
      <FilterModal
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        onApply={(newFilters) => {
          // Invalidate any in-flight requests from previous filter state
          requestIdRef.current++
          setFilters(newFilters)
          setIsFilterOpen(false)
          setHasPendingFilterChanges(false)
          setPendingFilterDraft(null)
        }}
        filters={filters}
        onPendingChange={(hasPending, draft) => {
          setHasPendingFilterChanges(prev => (prev !== hasPending ? hasPending : prev))
          setPendingFilterDraft(prev => {
            if (!prev && !draft) return prev
            if (prev && draft) {
              try {
                if (JSON.stringify(prev) === JSON.stringify(draft)) return prev
              } catch (e) {}
            }
            return draft || null
          })
        }}
      />

      {/* Login Groups Modal with pending tracking */}
      <LoginGroupsModal
        isOpen={isLoginGroupsOpen}
        onClose={() => setIsLoginGroupsOpen(false)}
        groups={groups.map(g => ({
          ...g,
          loginCount: g.range 
            ? (g.range.to - g.range.from + 1) 
            : g.loginIds.length
        }))}
        activeGroupName={getActiveGroupFilter('client2')}
        onSelectGroup={(group) => {
          // Invalidate any in-flight requests from previous filter state
          requestIdRef.current++
          if (group === null) {
            setActiveGroupFilter('client2', null)
          } else {
            setActiveGroupFilter('client2', group.name)
          }
          setIsLoginGroupsOpen(false)
          setHasPendingGroupChanges(false)
          setPendingGroupDraft(null)
        }}
        onCreateGroup={() => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(null)
          setIsLoginGroupModalOpen(true)
        }}
        onEditGroup={(group) => {
          setIsLoginGroupsOpen(false)
          setEditingGroup(group)
          setIsLoginGroupModalOpen(true)
        }}
        onDeleteGroup={(group) => {
          deleteGroup(group.name)
          setIsLoginGroupsOpen(false)
        }}
        onPendingChange={useCallback((hasPending, draftName) => {
          setHasPendingGroupChanges(prev => (prev !== hasPending ? hasPending : prev))
          setPendingGroupDraft(prev => {
            const next = draftName ? { name: draftName } : null
            if (!prev && !next) return prev
            if (prev && next && prev.name === next.name) return prev
            return next
          })
        }, [])}
      />

      {/* Group Modal */}
      <GroupModal
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        availableItems={clients}
        loginField="login"
        displayField="name"
      />

      

      {/* Login Group Modal (Create/Edit) */}
      <LoginGroupModal
        isOpen={isLoginGroupModalOpen}
        onClose={() => {
          setIsLoginGroupModalOpen(false)
          setEditingGroup(null)
        }}
        onSave={() => {
          setIsLoginGroupModalOpen(false)
          setEditingGroup(null)
          setIsLoginGroupsOpen(true)
        }}
        onBack={() => {
          setIsLoginGroupsOpen(true)
        }}
        editGroup={editingGroup}
      />

      {/* Column Selector Modal */}
      {isColumnSelectorOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setIsColumnSelectorOpen(false)}>
          <div 
            className="bg-white w-full rounded-t-[24px] max-h-[100vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between flex-shrink-0">
              <h3 className="text-base font-semibold text-[#000000]">Show/Hide Columns</h3>
              <button onClick={() => setIsColumnSelectorOpen(false)}>
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
                  className="w-full h-12 pl-12 pr-4 bg-gray-100 border-0 rounded-xl text-[10px] text-black font-normal font-outfit placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                {(() => {
                  const filteredEntries = Object.entries({
                'Login': 'login',
                'Name': 'name',
                'Equity': 'equity',
                'Floating Profit': 'profit',
                'Last Name': 'lastName',
                'Middle Name': 'middleName',
                'Email': 'email',
                'Phone': 'phone',
                'Group': 'group',
                'Country': 'country',
                'City': 'city',
                'State': 'state',
                'Address': 'address',
                'Zip Code': 'zipCode',
                'ID': 'clientID',
                'Status': 'status',
                'Lead Source': 'leadSource',
                'Lead Campaign': 'leadCampaign',
                'Balance': 'balance',
                'Credit': 'credit',
                'Margin': 'margin',
                'Margin Free': 'marginFree',
                'Margin Level': 'marginLevel',
                'Leverage': 'leverage',
                'Currency': 'currency',
                'Company': 'company',
                'Comment': 'comment',
                'Registration': 'registration',
                'Last Access': 'lastAccess',
                'Account Last Update': 'accountLastUpdate',
                'User Last Update': 'userLastUpdate',
                'Applied Percentage': 'applied_percentage',
                'Is Custom Percentage': 'applied_percentage_is_custom',
                'Storage': 'storage',
              }).filter(([label]) => 
                !columnSearch || label.toLowerCase().includes(columnSearch.toLowerCase())
              );
              
              return filteredEntries.length > 0 ? (
                filteredEntries.map(([label, key]) => (
                  <label 
                    key={key} 
                    className="flex items-center justify-between py-3 border-b border-[#F2F2F7] last:border-0"
                  >
                    <span className="text-sm text-[#000000] font-outfit">{label}</span>
                    <div className="relative inline-block w-12 h-6">
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() => setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))}
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
              );
            })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View All Modal */}
      {showViewAllModal && (
        <div className="fixed inset-0 bg-[#F5F5F5] z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white shadow-md z-10">
            <div className="px-4 py-5 flex items-center justify-between">
              <button onClick={() => setShowViewAllModal(false)} className="w-9 h-9 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18L9 12L15 6" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-black">Client 2 Matrices</h1>
              <div className="w-9 h-9"></div>
            </div>
          </div>

          <div className="bg-[#E8EEF5] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Drag cards to reorder</span>
            </div>
            <button 
              onClick={() => {
                localStorage.removeItem(CARD_ORDER_KEY);
                setCardOrder([]);
              }}
              className="text-blue-600 text-sm font-medium"
            >
              Reset order
            </button>
          </div>

          <div className="p-3 space-y-2">
            {orderedCards.map((card, index) => {
              const isBeingDragged = dragStartLabel === card.label
              const isHoveredOver = touchHoverLabel === card.label
              
              return (
              <div
                key={card.label}
                draggable="true"
                data-card-label={card.label}
                data-card-index={index}
                className={`bg-white rounded-xl p-3 shadow-sm border-2 cursor-move select-none ${
                  isBeingDragged 
                    ? 'opacity-60 scale-95 border-blue-400 shadow-xl' 
                    : isHoveredOver 
                      ? 'bg-blue-50 border-blue-500 scale-[1.03] shadow-lg ring-2 ring-blue-200' 
                      : 'border-gray-200'
                }`}
                style={{ 
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  touchAction: 'pan-y',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', card.label)
                  setDragStartLabel(card.label)
                  e.currentTarget.classList.add('opacity-60')
                }}
                onDragEnd={(e) => {
                  e.currentTarget.classList.remove('opacity-60')
                  setDragStartLabel(null)
                  setTouchHoverLabel(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDragEnter={(e) => {
                  e.preventDefault()
                  if (dragStartLabel && dragStartLabel !== card.label) {
                    setTouchHoverLabel(card.label)
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) {
                    setTouchHoverLabel(null)
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const fromLabel = e.dataTransfer.getData('text/plain')
                  if (fromLabel && fromLabel !== card.label) {
                    swapOrder(fromLabel, card.label)
                  }
                  setTouchHoverLabel(null)
                  setDragStartLabel(null)
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0]
                  setTouchStartX(touch.clientX)
                  setTouchStartY(touch.clientY)
                  setDragStartLabel(null)
                  setTouchHoverLabel(null)
                }}
                onTouchMove={(e) => {
                  if (touchStartX === null || touchStartY === null) return
                  
                  const touch = e.touches[0]
                  const deltaX = Math.abs(touch.clientX - touchStartX)
                  const deltaY = touch.clientY - touchStartY
                  const absDeltaY = Math.abs(deltaY)
                  
                  // Allow vertical scrolling if moving primarily vertically
                  if (absDeltaY > deltaX && dragStartLabel === null) {
                    return
                  }
                  
                  // Start drag on significant horizontal movement
                  if (deltaX > 8 && absDeltaY < 20 && dragStartLabel === null) {
                    e.preventDefault()
                    setDragStartLabel(card.label)
                    if (window.navigator.vibrate) {
                      window.navigator.vibrate(40)
                    }
                    return
                  }
                  
                  // Continue drag
                  if (dragStartLabel) {
                    e.preventDefault()
                    
                    // Find element at touch position
                    const element = document.elementFromPoint(touch.clientX, touch.clientY)
                    if (!element) return
                    
                    const targetCard = element.closest('[data-card-label]')
                    if (targetCard) {
                      const targetLabel = targetCard.getAttribute('data-card-label')
                      if (targetLabel && targetLabel !== dragStartLabel) {
                        setTouchHoverLabel(targetLabel)
                      } else if (targetLabel === dragStartLabel) {
                        setTouchHoverLabel(null)
                      }
                    } else {
                      setTouchHoverLabel(null)
                    }
                  }
                }}
                onTouchEnd={(e) => {
                  if (dragStartLabel && touchHoverLabel && dragStartLabel !== touchHoverLabel) {
                    swapOrder(dragStartLabel, touchHoverLabel)
                    if (window.navigator.vibrate) {
                      window.navigator.vibrate([25, 15, 25])
                    }
                  }
                  
                  setDragStartLabel(null)
                  setTouchHoverLabel(null)
                  setTouchStartX(null)
                  setTouchStartY(null)
                }}
                onTouchCancel={(e) => {
                  setDragStartLabel(null)
                  setTouchHoverLabel(null)
                  setTouchStartX(null)
                  setTouchStartY(null)
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-600 uppercase mb-1">{card.label}</div>
                    <div className="flex items-baseline gap-1.5">
                      {card.numericValue > 0 && (
                        <svg width="12" height="12" viewBox="0 0 8 8" className="flex-shrink-0">
                          <polygon points="4,0 8,8 0,8" fill="#16A34A"/>
                        </svg>
                      )}
                      {card.numericValue < 0 && (
                        <svg width="12" height="12" viewBox="0 0 8 8" className="flex-shrink-0">
                          <polygon points="4,8 0,0 8,0" fill="#DC2626"/>
                        </svg>
                      )}
                      {card.numericValue === 0 && (
                        <svg width="12" height="12" viewBox="0 0 8 8" className="flex-shrink-0">
                          <polygon points="4,0 8,8 0,8" fill="#000000"/>
                        </svg>
                      )}
                      <span className={`text-xl font-bold ${card.numericValue > 0 ? 'text-[#16A34A]' : card.numericValue < 0 ? 'text-[#DC2626]' : 'text-black'}`}>
                        {card.value === '' || card.value === undefined ? '0.00' : card.value}
                      </span>
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 p-2">
                    <img 
                      src={getCardIcon(card.label)} 
                      alt={card.label}
                      className="w-8 h-8"
                      style={{ filter: 'brightness(0) saturate(100%) invert(27%) sepia(97%) saturate(1500%) hue-rotate(213deg) brightness(100%)' }}
                      onError={(e) => {
                        // Fallback to default icon if image fails to load
                        e.target.style.display = 'none'
                      }}
                    />
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>
      )}

      {/* Client Details Mobile Modal */}
      {selectedClient && (
        <ClientDetailsMobileModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          allPositionsCache={cachedPositions}
          allOrdersCache={orders}
        />
      )}
    </div>
  )
}
