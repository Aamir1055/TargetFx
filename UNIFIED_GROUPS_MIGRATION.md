# Unified Login Groups - Migration Guide

## What Changed?

The group feature now works **across all modules** based on login IDs instead of having separate groups per module.

## New Components Created

1. **`GroupContext.jsx`** - Central state management for groups
2. **`GroupModal.jsx`** - Shared modal component for creating groups
3. **`GroupSelector.jsx`** - Shared dropdown component for selecting groups

## Key Features Added

### 1. **Range-based Selection**
- Text field that accepts format: `start,count`
- Example: `1,30` will add logins 1 through 30 to the group
- Example: `100,50` will add logins 100 through 149

### 2. **Unified Storage**
- All groups stored in `localStorage` with key: `unifiedLoginGroups`
- Each group contains: `{ name, loginIds[], createdAt, updatedAt }`

### 3. **Cross-Module Filtering**
- Same groups work in Clients, Positions, Live Dealing, Orders, Margin Level, and Client Percentage pages
- Filters by the `login` field (or `client_login` for Client Percentage page)

## How to Update Each Page

### Step 1: Import the new components

```javascript
import { useGroups } from '../contexts/GroupContext'
import GroupModal from '../components/GroupModal'
import GroupSelector from '../components/GroupSelector'
```

### Step 2: Remove old group state

**REMOVE these lines:**
```javascript
const [clientGroups, setClientGroups] = useState(...)
const [selectedClients, setSelectedClients] = useState([])
const [showGroupsModal, setShowGroupsModal] = useState(false)
const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
const [activeGroupFilter, setActiveGroupFilter] = useState(null)
const [newGroupName, setNewGroupName] = useState('')
const [groupSearchQuery, setGroupSearchQuery] = useState('')
const [showGroupSuggestions, setShowGroupSuggestions] = useState(false)
```

**REMOVE the useEffect for localStorage:**
```javascript
useEffect(() => {
  localStorage.setItem('clientGroups', JSON.stringify(clientGroups))
}, [clientGroups])
```

### Step 3: Add new group hook

**ADD this line:**
```javascript
const { filterByActiveGroup } = useGroups()
const [showGroupModal, setShowGroupModal] = useState(false)
```

### Step 4: Update filtering logic

**REPLACE:**
```javascript
const groupFilteredBase = activeGroupFilter 
  ? searchedBase.filter(c => {
      const group = clientGroups.find(g => g.name === activeGroupFilter)
      return group && group.clientLogins.includes(c.login)
    })
  : searchedBase
```

**WITH:**
```javascript
const groupFilteredBase = filterByActiveGroup(searchedBase, 'login')
```

For Client Percentage page, use:
```javascript
const groupFilteredBase = filterByActiveGroup(searchedBase, 'client_login')
```

### Step 5: Replace the Groups UI

**REPLACE the entire Groups button and dropdown section with:**
```javascript
<GroupSelector onCreateClick={() => setShowGroupModal(true)} />
```

**ADD the Group Modal before closing div:**
```javascript
<GroupModal 
  isOpen={showGroupModal}
  onClose={() => setShowGroupModal(false)}
  availableItems={clients}  // or positions, deals, orders, etc.
  loginField="login"        // or "client_login" for Client Percentage
  displayField="name"       // optional: field to show as display name
  secondaryField="group"    // optional: additional info to show
/>
```

### Step 6: Remove old modals

**DELETE the entire "Create Group Modal" JSX block** (usually at the bottom of the component)

## Example: ClientsPage.jsx Changes

### Before:
```javascript
// State
const [clientGroups, setClientGroups] = useState(...)
const [activeGroupFilter, setActiveGroupFilter] = useState(null)
// ... lots of group-related state

// Filtering
const groupFilteredBase = activeGroupFilter 
  ? searchedBase.filter(c => {
      const group = clientGroups.find(g => g.name === activeGroupFilter)
      return group && group.clientLogins.includes(c.login)
    })
  : searchedBase

// UI
<button onClick={() => setShowGroupsModal(!showGroupsModal)}>
  Groups {clientGroups.length > 0 && ...}
</button>
{showGroupsModal && <div>...huge dropdown...</div>}
{showCreateGroupModal && <div>...huge modal...</div>}
```

### After:
```javascript
// State
const { filterByActiveGroup } = useGroups()
const [showGroupModal, setShowGroupModal] = useState(false)

// Filtering
const groupFilteredBase = filterByActiveGroup(searchedBase, 'login')

// UI
<GroupSelector onCreateClick={() => setShowGroupModal(true)} />
<GroupModal 
  isOpen={showGroupModal}
  onClose={() => setShowGroupModal(false)}
  availableItems={clients}
  loginField="login"
  displayField="name"
  secondaryField="group"
/>
```

## Benefits

✅ **Unified Groups**: Create once, use everywhere
✅ **Range Selection**: Quickly add 30, 50, 100+ logins at once
✅ **Less Code**: Remove ~200 lines from each page
✅ **Consistent UX**: Same UI across all modules
✅ **Better Performance**: Centralized state management
✅ **Easier Maintenance**: Update in one place instead of 6

## Testing

1. Create a group with range: `1,30`
2. Verify it appears in all 6 modules
3. Filter clients page - should show only logins 1-30
4. Filter positions page - should show only positions for logins 1-30
5. Delete group - should remove from all modules

## Migration Order

Recommended order to update pages:
1. ✅ App.jsx (add GroupProvider) - DONE
2. ClientsPage.jsx
3. PositionsPage.jsx
4. LiveDealingPage.jsx
5. PendingOrdersPage.jsx
6. MarginLevelPage.jsx
7. ClientPercentagePage.jsx
