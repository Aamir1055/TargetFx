import { createContext, useContext } from 'react'

const GroupContext = createContext()

export const useGroups = () => {
  const context = useContext(GroupContext)
  if (!context) {
    throw new Error('useGroups must be used within a GroupProvider')
  }
  return context
}

export default GroupContext
