# Login Groups Feature - User Guide

## Overview

The Login Groups feature allows you to create, manage, and filter client data by specific login accounts or login ranges. This is useful for organizing clients into meaningful groups for analysis and reporting.

## Features

### 1. Create Login Groups
Create groups using two methods:
- **My Login**: Select specific login accounts from a paginated list
- **By Range**: Define a range of login numbers (e.g., 300000 to 333000)

### 2. Manage Groups
- Create new groups
- Edit existing groups
- Delete groups
- Activate/deactivate groups with a single click

### 3. Persistent Storage
All login groups are saved in browser localStorage and persist across sessions.

## How to Use

### Creating a Login Group

1. **Open the Groups Dropdown**
   - Click on the "Groups" button in the toolbar (purple icon with people)
   - The dropdown shows all existing groups

2. **Click "+ New" Button**
   - Opens the "Create Login Group" modal

3. **Enter Group Name**
   - Type a meaningful name for your group (e.g., "Test", "VIP Clients", "High Volume Traders")

4. **Choose Tab: My Login or By Range**

   **Option A: My Login Tab**
   - View paginated list of all login accounts (50 per page)
   - Use the search box to find specific logins by login number, name, or email
   - Select individual logins by clicking the checkbox or row
   - Use "Select All" to select all logins on the current page
   - Navigate through pages to select more logins
   - Selected count is displayed at the top (e.g., "15 login(s) selected out of 3152 total")
   
   **Option B: By Range Tab**
   - Enter "From" value (e.g., 300000)
   - Enter "To" value (e.g., 333000)
   - The range will dynamically include any login that falls within this range
   - Example info shows how the range works

5. **Click "Create Group"**
   - Group is saved and appears in the dropdown
   - Modal closes automatically

### Activating a Login Group

1. **Open the Groups Dropdown**
   - Click the "Groups" button

2. **Click on a Group Name**
   - The group becomes active (shown with a checkmark ✓)
   - The button shows a purple badge with "1"
   - Client data is automatically filtered to show only accounts in that group
   - Active group name is displayed at the top of the dropdown

3. **Click Again to Deactivate**
   - Clicking the same group again deactivates it
   - All client data is shown again

### Editing a Login Group

1. **Open the Groups Dropdown**
2. **Click the Edit Icon** (pencil icon) next to the group
3. **Modify the Group**
   - Change the name
   - Add/remove logins (for My Login groups)
   - Adjust the range (for Range groups)
4. **Click "Update Group"**

### Deleting a Login Group

1. **Open the Groups Dropdown**
2. **Click the Delete Icon** (trash icon) next to the group
3. **Confirm Deletion**
   - A confirmation dialog appears
   - Click "OK" to permanently delete the group

## Technical Details

### API Integration

The feature uses the following API endpoints:

1. **Get Client Fields** (for My Login tab)
   ```
   GET /api/broker/clients/fields?fields=login,name,email&page=1&limit=50&search=query
   ```

2. **Search Clients with Login Filter**
   - For My Login groups:
     ```json
     {
       "mt5Accounts": [300154, 301310, 302802, ...],
       ...other filters
     }
     ```
   - For Range groups:
     ```json
     {
       "accountRangeMin": 300000,
       "accountRangeMax": 333000,
       ...other filters
     }
     ```

### Data Structure

Login groups are stored in localStorage with the following structure:

```javascript
{
  id: 1731750000000,           // Unique timestamp ID
  name: "Test",                 // Group name
  type: "myLogin" | "range",    // Group type
  
  // For My Login groups:
  logins: [300154, 301310, 302802, ...],
  
  // For Range groups:
  rangeMin: 300000,
  rangeMax: 333000
}
```

### Storage Key
```
localStorage key: "client2LoginGroups"
```

## UI Components

### Main Button
- Located in the toolbar next to IB Filter
- Purple color scheme when active
- Shows badge with "1" when a group is active
- Icon: Group of people

### Dropdown Menu
- Width: 320px
- Max height: 384px (scrollable)
- Shows:
  - Header with "+ New" button
  - Active group indicator (purple background)
  - List of all groups with:
    - Group name
    - Type and count (e.g., "My Login • 15 accounts" or "Range • 300000 to 333000")
    - Edit and Delete buttons
  - Empty state with "Create your first group" message

### Modal Window
- Full-screen overlay with centered content
- Max width: 896px (4xl)
- Max height: 90vh (scrollable)
- Two tabs: "My Login" and "By Range"
- Validation messages for errors
- Cancel and Create/Update buttons

## Best Practices

1. **Naming Groups**
   - Use descriptive names that reflect the purpose (e.g., "Q4 New Clients", "High Risk Accounts")
   - Keep names concise for better display in the dropdown

2. **My Login vs Range**
   - Use **My Login** for specific, curated lists of accounts
   - Use **Range** for dynamic filtering by account number ranges
   - Range groups automatically include new accounts that fall within the range

3. **Performance**
   - My Login groups work well up to several hundred accounts
   - For larger datasets, consider using Range groups or multiple smaller groups

4. **Combining with Other Filters**
   - Login groups work alongside other filters (search, column filters, etc.)
   - All filters are applied together (AND logic)

## Troubleshooting

### Group Not Showing Accounts
- Ensure the group has logins selected (My Login) or valid range values (Range)
- Check that the login accounts exist in the system
- Try refreshing the client data

### Can't Select Logins in My Login Tab
- Ensure you're clicking the checkbox or row
- Check if search is filtering out the accounts you want
- Navigate through all pages if accounts are on different pages

### Range Not Working
- Verify that "From" is less than or equal to "To"
- Ensure both values are valid numbers
- Check that accounts exist within that range

## Examples

### Example 1: VIP Clients Group (My Login)
```
Name: VIP Clients
Type: My Login
Logins: [300154, 301310, 302802, 301475, 300399]
```

### Example 2: New Accounts Q4 (Range)
```
Name: New Accounts Q4 2024
Type: By Range
Range: 500000 to 600000
```

### Example 3: Test Group (Range)
```
Name: Test
Type: By Range
Range: 300000 to 333000
```

## Future Enhancements

Potential improvements for future versions:
- Bulk import of logins via CSV
- Group-based permissions and access control
- Scheduled reports for specific groups
- Group analytics and statistics
- Export group data
- Share groups with team members

## Support

For issues or questions:
1. Check the browser console for error messages
2. Verify localStorage is not disabled
3. Clear browser cache and try again
4. Contact support with specific error details

---

**Version:** 1.0  
**Last Updated:** November 16, 2024  
**Compatible with:** Broker Eye Client2 Page
