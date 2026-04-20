import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const GroupContext = createContext()

export const useGroups = () => {
  const context = useContext(GroupContext)
  if (!context) {
    throw new Error('useGroups must be used within a GroupProvider')
  }
  return context
}

export const GroupProvider = ({ children }) => {
  // Unified groups stored in localStorage - works across all modules
  const [groups, setGroups] = useState(() => {
    try {
      const saved = localStorage.getItem('unifiedLoginGroups')
      const loadedGroups = saved ? JSON.parse(saved) : []
      console.log('Loading unified login groups from localStorage:', loadedGroups.length, 'groups found')
      return loadedGroups
    } catch (error) {
      console.error('Failed to load unified login groups:', error)
      return []
    }
  })


  // Track active group per module (e.g., { clients: 'Group1', positions: 'Group2' })
  // Clear on page refresh - no persistence
  const [activeGroupFilters, setActiveGroupFilters] = useState({})

  // Clear group filters from localStorage on page refresh
  useEffect(() => {
    localStorage.removeItem('activeGroupFilters');
  }, []);

  // Save to localStorage whenever groups change
  useEffect(() => {
    try {
      localStorage.setItem('unifiedLoginGroups', JSON.stringify(groups))
      console.log('Saved unified login groups to localStorage:', groups.length, 'groups')
    } catch (error) {
      console.error('Failed to save unified login groups:', error)
    }
  }, [groups])

  // Save active group filters to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('activeGroupFilters', JSON.stringify(activeGroupFilters))
      console.log('Saved active group filters to localStorage:', activeGroupFilters)
    } catch (error) {
      console.error('Failed to save active group filters:', error)
    }
  }, [activeGroupFilters])

  // Create a new group
  const createGroup = (groupName, loginIds) => {
    if (!groupName.trim()) {
      console.error('Group name cannot be empty')
      return false
    }

    if (!Array.isArray(loginIds) || loginIds.length === 0) {
      console.error('Login IDs must be a non-empty array')
      return false
    }

    // Check if group name already exists
    if (groups.some(g => g.name === groupName.trim())) {
      console.error('Group name already exists')
      return false
    }

    const newGroup = {
      name: groupName.trim(),
      loginIds: [...new Set(loginIds)], // Remove duplicates
      range: null, // Will be set if it's a range-based group
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    setGroups(prev => [...prev, newGroup])
    console.log('Group created:', newGroup)
    return true
  }

  // Create a range-based group (stores only from/to, not all IDs)
  const createRangeGroup = (groupName, fromValue, toValue) => {
    if (!groupName.trim()) {
      console.error('Group name cannot be empty')
      return false
    }

    const from = parseInt(fromValue)
    const to = parseInt(toValue)

    if (isNaN(from) || isNaN(to) || from > to) {
      console.error('Invalid range values')
      return false
    }

    // Check if group name already exists
    if (groups.some(g => g.name === groupName.trim())) {
      console.error('Group name already exists')
      return false
    }

    const newGroup = {
      name: groupName.trim(),
      loginIds: [], // Empty for range-based groups
      range: { from, to }, // Store only the range
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    setGroups(prev => [...prev, newGroup])
    console.log('Range group created:', newGroup)
    return true
  }

  // Update an existing group (supports both manual and range groups)
  const updateGroup = (oldGroupName, newGroupName, newLoginIds = null, newRange = null) => {
    // Check if new name conflicts with existing group (except itself)
    if (newGroupName !== oldGroupName && groups.some(g => g.name === newGroupName.trim())) {
      console.error('Group name already exists')
      return false
    }

    setGroups(prev => prev.map(g => {
      if (g.name === oldGroupName) {
        const updated = {
          ...g,
          name: newGroupName.trim(),
          updatedAt: new Date().toISOString()
        }
        
        // Update based on type
        if (newRange) {
          updated.range = newRange
          updated.loginIds = []
        } else if (newLoginIds) {
          updated.loginIds = [...new Set(newLoginIds)]
          updated.range = null
        }
        
        return updated
      }
      return g
    }))

    // Update active filters if group name changed
    if (oldGroupName !== newGroupName) {
      setActiveGroupFilters(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(module => {
          if (updated[module] === oldGroupName) {
            updated[module] = newGroupName
          }
        })
        return updated
      })
    }
    
    console.log('Group updated:', oldGroupName, '->', newGroupName)
    return true
  }

  // Delete a group
  const deleteGroup = (groupName) => {
    setGroups(prev => prev.filter(g => g.name !== groupName))
    
    // Clear active filter in all modules if we're deleting an active group
    setActiveGroupFilters(prev => {
      const updated = { ...prev }
      Object.keys(updated).forEach(module => {
        if (updated[module] === groupName) {
          updated[module] = null
        }
      })
      return updated
    })
    
    console.log('Group deleted:', groupName)
    return true
  }

  // Set active group for all modules (global filter)
  const setActiveGroupFilter = (moduleName, groupName) => {
    // Apply the same group filter to all known modules
    setActiveGroupFilters(prev => ({
      ...prev,
      clients: groupName,
      positions: groupName,
      client2: groupName,
      pendingorders: groupName,
      'pending-orders': groupName,
      marginlevel: groupName,
      'margin-level': groupName,
      livedealing: groupName,
      'live-dealing': groupName,
      clientpercentage: groupName,
      'client-percentage': groupName,
      'ib-commissions': groupName,
      dashboard: groupName
    }))
  }

  // Get active group for a specific module
  const getActiveGroupFilter = (moduleName) => {
    return activeGroupFilters[moduleName] || null
  }

  // Get login IDs for a specific group
  const getGroupLogins = (groupName) => {
    const group = groups.find(g => g.name === groupName)
    return group ? group.loginIds : []
  }

  // Check if a login is in the active group (supports both manual and range groups)
  const isLoginInActiveGroup = (login, moduleName) => {
    const activeFilter = activeGroupFilters[moduleName]
    if (!activeFilter) return true // No filter = show all
    
    const group = groups.find(g => g.name === activeFilter)
    if (!group) return false

    // Check if it's a range-based group
    if (group.range) {
      const loginNum = Number(login)
      return loginNum >= group.range.from && loginNum <= group.range.to
    }

    // Manual selection group
    const groupLogins = group.loginIds
    return groupLogins.includes(String(login)) || groupLogins.includes(Number(login))
  }

  // Filter items by active group (works for any array with login field)
  const filterByActiveGroup = useCallback((items, loginField = 'login', moduleName) => {
    const activeFilter = activeGroupFilters[moduleName]
    if (!activeFilter) return items
    
    return items.filter(item => {
      const itemLogin = item[loginField]
      return isLoginInActiveGroup(itemLogin, moduleName)
    })
  }, [activeGroupFilters, groups])

  // Generate login range (e.g., "1,30" -> [1, 2, 3, ..., 30])
  const generateLoginRange = (rangeString) => {
    try {
      const parts = rangeString.split(',').map(s => s.trim())
      if (parts.length !== 2) return []
      
      const start = parseInt(parts[0])
      const count = parseInt(parts[1])
      
      if (isNaN(start) || isNaN(count) || count <= 0) return []
      
      const logins = []
      for (let i = start; i < start + count; i++) {
        logins.push(i)
      }
      
      console.log(`Generated login range from "${rangeString}":`, logins.length, 'logins')
      return logins
    } catch (error) {
      console.error('Error generating login range:', error)
      return []
    }
  }

  const value = {
    groups,
    activeGroupFilters,
    setActiveGroupFilter,
    getActiveGroupFilter,
    createGroup,
    createRangeGroup,
    updateGroup,
    deleteGroup,
    getGroupLogins,
    isLoginInActiveGroup,
    filterByActiveGroup,
    generateLoginRange
  }

  return (
    <GroupContext.Provider value={value}>
      {children}
    </GroupContext.Provider>
  )
}

export default GroupContext
