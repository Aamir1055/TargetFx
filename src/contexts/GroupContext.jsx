import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { brokerAPI } from '../services/api'

const GroupContext = createContext()

export const useGroups = () => {
  const context = useContext(GroupContext)
  if (!context) {
    throw new Error('useGroups must be used within a GroupProvider')
  }
  return context
}

// Helper: serialize groups list to the API format
const toApiFilters = (groups) =>
  groups.map(g => ({
    name: g.name,
    loginIds: (g.loginIds || []).map(String),
    range: g.range || null,
    createdAt: g.createdAt || new Date().toISOString(),
    updatedAt: g.updatedAt || new Date().toISOString()
  }))

// Helper: parse API response into internal group objects
const fromApiFilters = (filters) => {
  if (!Array.isArray(filters)) return []
  return filters.map(f => ({
    name: f.name,
    loginIds: Array.isArray(f.loginIds) ? f.loginIds : [],
    range: f.range || null,
    createdAt: f.createdAt || new Date().toISOString(),
    updatedAt: f.updatedAt || new Date().toISOString()
  }))
}

export const GroupProvider = ({ children }) => {
  // Seed from localStorage so UI is instant on first render (avoids empty flash)
  const [groups, setGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('unifiedLoginGroups')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Track whether the initial API fetch has completed
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  // Ref for debouncing the PUT call (avoid hammering on rapid mutations)
  const syncTimerRef = useRef(null)

  // Track active group per module — cleared on page refresh
  const [activeGroupFilters, setActiveGroupFilters] = useState({})

  // Clear stale active filters from localStorage on mount
  useEffect(() => {
    localStorage.removeItem('activeGroupFilters')
  }, [])

  // ── API: load groups on mount ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await brokerAPI.getSavedFilters()
        if (cancelled) return
        // Response shape: { filters: [...] } or { data: { filters: [...] } } or just [...]
        const raw = res?.data?.filters ?? res?.filters ?? res?.data ?? res
        const loaded = fromApiFilters(Array.isArray(raw) ? raw : [])
        setGroups(loaded)
        // Mirror into localStorage as a cache
        try { localStorage.setItem('unifiedLoginGroups', JSON.stringify(loaded)) } catch {}
        console.log('[Groups] Loaded from API:', loaded.length, 'groups')
      } catch (err) {
        console.warn('[Groups] Failed to load from API, using localStorage cache:', err?.message)
      } finally {
        if (!cancelled) setGroupsLoaded(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── API: persist groups whenever they change (debounced 400 ms) ───────────
  const syncToApi = useCallback((nextGroups) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(async () => {
      try {
        await brokerAPI.putSavedFilters(toApiFilters(nextGroups))
        console.log('[Groups] Synced to API:', nextGroups.length, 'groups')
      } catch (err) {
        console.warn('[Groups] Failed to sync to API:', err?.message)
      }
    }, 400)
  }, [])

  // Mirror to localStorage + trigger API sync whenever groups state changes
  useEffect(() => {
    if (!groupsLoaded) return // Don't overwrite API data before first load
    try { localStorage.setItem('unifiedLoginGroups', JSON.stringify(groups)) } catch {}
    syncToApi(groups)
  }, [groups, groupsLoaded, syncToApi])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createGroup = (groupName, loginIds) => {
    if (!groupName.trim()) { console.error('Group name cannot be empty'); return false }
    if (!Array.isArray(loginIds) || loginIds.length === 0) { console.error('Login IDs must be a non-empty array'); return false }
    if (groups.some(g => g.name === groupName.trim())) { console.error('Group name already exists'); return false }

    const newGroup = {
      name: groupName.trim(),
      loginIds: [...new Set(loginIds)],
      range: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setGroups(prev => [...prev, newGroup])
    console.log('Group created:', newGroup)
    return true
  }

  const createRangeGroup = (groupName, fromValue, toValue) => {
    if (!groupName.trim()) { console.error('Group name cannot be empty'); return false }
    const from = parseInt(fromValue)
    const to = parseInt(toValue)
    if (isNaN(from) || isNaN(to) || from > to) { console.error('Invalid range values'); return false }
    if (groups.some(g => g.name === groupName.trim())) { console.error('Group name already exists'); return false }

    const newGroup = {
      name: groupName.trim(),
      loginIds: [],
      range: { from, to },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setGroups(prev => [...prev, newGroup])
    console.log('Range group created:', newGroup)
    return true
  }

  const updateGroup = (oldGroupName, newGroupName, newLoginIds = null, newRange = null) => {
    if (newGroupName !== oldGroupName && groups.some(g => g.name === newGroupName.trim())) {
      console.error('Group name already exists'); return false
    }

    setGroups(prev => prev.map(g => {
      if (g.name !== oldGroupName) return g
      const updated = { ...g, name: newGroupName.trim(), updatedAt: new Date().toISOString() }
      if (newRange) { updated.range = newRange; updated.loginIds = [] }
      else if (newLoginIds) { updated.loginIds = [...new Set(newLoginIds)]; updated.range = null }
      return updated
    }))

    if (oldGroupName !== newGroupName) {
      setActiveGroupFilters(prev => {
        const next = { ...prev }
        Object.keys(next).forEach(mod => { if (next[mod] === oldGroupName) next[mod] = newGroupName })
        return next
      })
    }
    console.log('Group updated:', oldGroupName, '->', newGroupName)
    return true
  }

  const deleteGroup = (groupName) => {
    setGroups(prev => prev.filter(g => g.name !== groupName))
    setActiveGroupFilters(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(mod => { if (next[mod] === groupName) next[mod] = null })
      return next
    })
    console.log('Group deleted:', groupName)
    return true
  }

  // ── Read-only helpers ─────────────────────────────────────────────────────

  const setActiveGroupFilter = (moduleName, groupName) => {
    setActiveGroupFilters(prev => ({
      ...prev,
      clients: groupName, positions: groupName, client2: groupName,
      pendingorders: groupName, 'pending-orders': groupName,
      marginlevel: groupName, 'margin-level': groupName,
      livedealing: groupName, 'live-dealing': groupName,
      clientpercentage: groupName, 'client-percentage': groupName,
      'ib-commissions': groupName, dashboard: groupName
    }))
  }

  const getActiveGroupFilter = (moduleName) => activeGroupFilters[moduleName] || null

  const getGroupLogins = (groupName) => {
    const group = groups.find(g => g.name === groupName)
    if (!group) return []
    if (group.range) {
      const from = Number(group.range.from), to = Number(group.range.to)
      if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return []
      const logins = []
      for (let i = from; i <= to; i++) logins.push(i)
      return logins
    }
    return Array.isArray(group.loginIds) ? group.loginIds : []
  }

  const isLoginInActiveGroup = (login, moduleName) => {
    const activeFilter = activeGroupFilters[moduleName]
    if (!activeFilter) return true
    const group = groups.find(g => g.name === activeFilter)
    if (!group) return false
    if (group.range) {
      const loginNum = Number(login), from = Number(group.range.from), to = Number(group.range.to)
      if (!Number.isFinite(loginNum) || !Number.isFinite(from) || !Number.isFinite(to)) return false
      return loginNum >= from && loginNum <= to
    }
    return group.loginIds.includes(String(login)) || group.loginIds.includes(Number(login))
  }

  const filterByActiveGroup = useCallback((items, loginField = 'login', moduleName) => {
    const activeFilter = activeGroupFilters[moduleName]
    if (!activeFilter) return items
    return items.filter(item => isLoginInActiveGroup(item[loginField], moduleName))
  }, [activeGroupFilters, groups])

  const generateLoginRange = (rangeString) => {
    try {
      const parts = rangeString.split(',').map(s => s.trim())
      if (parts.length !== 2) return []
      const start = parseInt(parts[0]), count = parseInt(parts[1])
      if (isNaN(start) || isNaN(count) || count <= 0) return []
      const logins = []
      for (let i = start; i < start + count; i++) logins.push(i)
      return logins
    } catch (error) {
      console.error('Error generating login range:', error)
      return []
    }
  }

  const value = {
    groups, groupsLoaded, activeGroupFilters,
    setActiveGroupFilter, getActiveGroupFilter,
    createGroup, createRangeGroup, updateGroup, deleteGroup,
    getGroupLogins, isLoginInActiveGroup, filterByActiveGroup, generateLoginRange
  }

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  )
}

export default GroupContext