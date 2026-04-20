# Client2 Module - Complete Test Cases

**Module:** Client2Page.jsx  
**Test Date:** November 17, 2025  
**Version:** V3  
**Tester:** _____________

---

## 1. PAGE LOAD & INITIALIZATION

### 1.1 Initial Page Load
- [ ] Page loads without errors
- [ ] Loading spinner displays while fetching data
- [ ] Summary statistics cards render correctly
- [ ] Total Clients count is accurate
- [ ] All face cards (P&L %, Margin %, etc.) display values
- [ ] Percentage signs are NOT duplicated in face cards
- [ ] Table headers render correctly
- [ ] First page of data (50 entries) loads

### 1.2 WebSocket Connection
- [ ] WebSocket indicator shows "Connected" status
- [ ] Green/red status indicator works
- [ ] Real-time updates reflect in the table
- [ ] Face cards update in real-time
- [ ] No console errors related to WebSocket

### 1.3 Data Context
- [ ] No "existingClient is undefined" warnings in console
- [ ] Client data loads from DataContext
- [ ] Live updates merge correctly with existing data

---

## 2. PAGINATION TESTING

### 2.1 Basic Pagination
- [ ] Default shows 50 entries per page
- [ ] Page selector dropdown works (10, 25, 50, 100, 200)
- [ ] "Previous" button disabled on page 1
- [ ] "Next" button disabled on last page
- [ ] Page numbers display correctly (e.g., "1-50 of 3,213")
- [ ] Direct page number input works
- [ ] Clicking page numbers navigates correctly

### 2.2 Page 2+ Navigation (CRITICAL BUG CHECK)
- [ ] **Navigate to page 2 - data MUST display (not blank)**
- [ ] Navigate to page 3 - data displays correctly
- [ ] Navigate to last page - data displays
- [ ] Go back to page 1 - data still displays
- [ ] Change entries per page from 50 to 100 - recalculates correctly
- [ ] No double pagination issues (server + client pagination)

### 2.3 Pagination with Filters
- [ ] Apply filter, pagination resets to page 1
- [ ] Navigate to page 2 with filter active - data displays
- [ ] Clear filter, pagination resets
- [ ] Total count updates when filtered
- [ ] Page numbers adjust to filtered results

---

## 3. COLUMN FILTERING (TEXT/CHECKBOX FILTERS)

### 3.1 Filter Dropdown Opening
- [ ] Click filter icon - dropdown opens
- [ ] Filter dropdown positions correctly (not off-screen)
- [ ] Filter dropdown opens LEFT on rightmost columns
- [ ] Filter dropdown opens RIGHT on leftmost columns
- [ ] Z-index is correct (dropdown above table)
- [ ] Click outside dropdown - it closes

### 3.2 Text Filter - Initial State
- [ ] Open EMAIL filter - all checkboxes are UNCHECKED by default
- [ ] Open LOGIN filter - all checkboxes are UNCHECKED
- [ ] "SELECT ALL" checkbox is UNCHECKED
- [ ] Search field is empty
- [ ] All unique values load (no duplicates)

### 3.3 Text Filter - Selection
- [ ] Check one value - checkbox marks correctly
- [ ] Check multiple values - all mark correctly
- [ ] Uncheck a value - it unmarks
- [ ] Click "SELECT ALL" - all values check
- [ ] Click "SELECT ALL" again - all values uncheck
- [ ] Select values, click OK - filter applies
- [ ] Filter count badge appears (green number)

### 3.4 Text Filter - Search Functionality
- [ ] Type in search field - values filter instantly
- [ ] Search is case-insensitive
- [ ] Partial matches work
- [ ] Clear search - all values return
- [ ] Select filtered value - it checks
- [ ] Press ENTER in search field - filter applies and closes

### 3.5 Text Filter - Enter Key Submission
- [ ] Select checkboxes, press ENTER - filter applies
- [ ] Press ENTER in search field - filter applies
- [ ] Press ENTER anywhere in dropdown - filter applies
- [ ] Filter closes after ENTER press

### 3.6 Text Filter - Reopening Existing Filter
- [ ] Apply filter with 3 values selected
- [ ] Close dropdown
- [ ] Reopen dropdown - same 3 values are checked
- [ ] Modify selection - changes apply
- [ ] Clear filter - all checkboxes uncheck on reopen

### 3.7 Text Filter - Sort Options
- [ ] Click "Sort Smallest to Largest" - table sorts ascending
- [ ] Click "Sort Largest to Smallest" - table sorts descending
- [ ] Sort indicator shows active sort direction
- [ ] Sort works with filter active

### 3.8 Text Filter - Advanced (Condition Layout)
- [ ] Click "Text Filters" button - submenu opens
- [ ] Condition dropdown shows: Equal, Not Equal, Starts With, Ends With, Contains, Does Not Contain
- [ ] Select "Contains" + enter value - filter works
- [ ] Press ENTER in condition dropdown - filter applies
- [ ] Press ENTER in value field - filter applies
- [ ] Press ENTER with Match Case checked - case-sensitive filter works
- [ ] Match Case checkbox toggles correctly

### 3.9 Text Filter - Clear Functionality
- [ ] Click "Clear" button - filter removes
- [ ] Filter count badge disappears
- [ ] Table shows all data again
- [ ] Selected values clear

---

## 4. COLUMN FILTERING (NUMERIC FILTERS)

### 4.1 Numeric Filter - Opening
- [ ] Click filter on EQUITY column - numeric filter opens
- [ ] Shows sort options (Smallest to Largest, Largest to Smallest)
- [ ] Shows numeric operators dropdown
- [ ] Value input fields appear

### 4.2 Numeric Filter - Operators
- [ ] Select "Equal" - single value input appears
- [ ] Select "Not Equal" - single value input
- [ ] Select "Greater Than" - single value input
- [ ] Select "Greater Than or Equal" - single value input
- [ ] Select "Less Than" - single value input
- [ ] Select "Less Than or Equal" - single value input
- [ ] Select "Between" - two value inputs appear (VALUE and AND)

### 4.3 Numeric Filter - Value Entry
- [ ] Enter numeric value in VALUE field
- [ ] Enter decimal value (e.g., 123.45) - accepts
- [ ] Enter negative value - accepts
- [ ] Enter non-numeric value - validation works
- [ ] Clear value - input clears

### 4.4 Numeric Filter - Between Operator
- [ ] Select "Between"
- [ ] Enter value in VALUE field (e.g., 100)
- [ ] Enter value in AND field (e.g., 500)
- [ ] Press ENTER in VALUE field - filter applies
- [ ] Press ENTER in AND field - filter applies
- [ ] Both values apply as range filter

### 4.5 Numeric Filter - Enter Key Submission
- [ ] Enter value, press ENTER - filter applies immediately
- [ ] Press ENTER in operator dropdown - filter applies
- [ ] Press ENTER anywhere in numeric filter - filter applies
- [ ] Filter closes after ENTER

### 4.6 Numeric Filter - Application
- [ ] Click OK button - filter applies
- [ ] Table filters to matching numeric values
- [ ] Filter count badge appears
- [ ] Pagination resets to page 1

### 4.7 Numeric Filter - Validation
- [ ] Empty value + click OK - clears filter (doesn't error)
- [ ] Invalid value + click OK - handles gracefully
- [ ] Between with only one value - applies partial filter

---

## 5. IB (INTRODUCING BROKER) FILTER

### 5.1 IB Selector Dropdown
- [ ] Click IB filter dropdown - opens correctly
- [ ] Dropdown has high z-index (z-[100]) - NOT overlapped by table header
- [ ] Dropdown appears above sticky header
- [ ] Shows "All IBs" option
- [ ] Shows list of available IBs
- [ ] Scrolls if many IBs

### 5.2 IB Selection
- [ ] Select "All IBs" - shows all clients
- [ ] Select specific IB - filters to that IB's clients
- [ ] Change IB selection - table updates
- [ ] IB filter works with other column filters
- [ ] Pagination resets when IB changes

### 5.3 IB Filter + Pagination
- [ ] Select IB, go to page 2 - data displays correctly
- [ ] Change IB on page 2 - resets to page 1
- [ ] IB filter persists across page navigation

---

## 6. SEARCH FUNCTIONALITY

### 6.1 Global Search
- [ ] Search box visible and accessible
- [ ] Placeholder text: "Search login, name, email..."
- [ ] Type search query - debounces properly (doesn't search every keystroke)
- [ ] Search matches login numbers
- [ ] Search matches names (first, middle, last)
- [ ] Search matches email addresses
- [ ] Search is case-insensitive
- [ ] Partial matches work

### 6.2 Search Results
- [ ] Results filter instantly
- [ ] Total count updates
- [ ] Pagination resets to page 1
- [ ] Face cards recalculate for filtered results
- [ ] Clear search (backspace all) - returns to full dataset

### 6.3 Search + Filters Combination
- [ ] Apply column filter, then search - both work together
- [ ] Search, then apply column filter - both work
- [ ] Clear search, filters persist
- [ ] Clear filters, search persists

---

## 7. SORTING FUNCTIONALITY

### 7.1 Column Header Sorting
- [ ] Click LOGIN header - sorts ascending
- [ ] Click again - sorts descending
- [ ] Click again - removes sort
- [ ] Sort arrow indicator shows direction
- [ ] Only one column sorted at a time
- [ ] Previous sort clears when new column sorted

### 7.2 Filter Dropdown Sorting
- [ ] Use "Sort Smallest to Largest" from filter dropdown
- [ ] Use "Sort Largest to Smallest" from filter dropdown
- [ ] Sort persists when dropdown closes
- [ ] Sort indicator updates in filter dropdown

### 7.3 Sorting with Filters
- [ ] Apply filter, then sort - both work
- [ ] Sort, then apply filter - both work
- [ ] Sort works on filtered dataset
- [ ] Clear filter, sort persists

---

## 8. QUICK FILTERS (TOP BAR)

### 8.1 Floating Clients Filter
- [ ] Toggle "Has Floating" - filters to clients with floating > 0
- [ ] Badge shows as active (blue background)
- [ ] Table updates immediately
- [ ] Face cards recalculate
- [ ] Toggle off - returns to full data

### 8.2 Credit Filter
- [ ] Toggle "Has Credit" - filters to clients with credit > 0
- [ ] Badge shows as active
- [ ] Combines with "Has Floating" if both active
- [ ] Works with other filters

### 8.3 No Deposit Filter
- [ ] Toggle "No Deposit" - filters to clients with lifetime deposit = 0
- [ ] Works independently
- [ ] Combines with other quick filters
- [ ] Face cards reflect filtered data

---

## 9. VIEW MODES

### 9.1 Card View Mode
- [ ] Toggle "Card View" button
- [ ] Layout switches to card grid
- [ ] Each client displays as card
- [ ] Cards show: login, name, email, key metrics
- [ ] Cards are responsive (grid adjusts to screen size)
- [ ] Pagination works in card view
- [ ] Filters work in card view

### 9.2 Table View Mode (Default)
- [ ] Toggle back to "Table View"
- [ ] Returns to table layout
- [ ] All data intact
- [ ] Filters persist
- [ ] Sort persists

---

## 10. COLUMN VISIBILITY

### 10.1 Column Selector
- [ ] Column visibility dropdown works
- [ ] Shows list of all columns with checkboxes
- [ ] Check/uncheck columns - they show/hide
- [ ] Hidden columns don't appear in table
- [ ] Settings persist during session
- [ ] Filters still work on hidden columns

---

## 11. GROUP MANAGEMENT

### 11.1 Groups Dropdown
- [ ] Groups dropdown shows available groups
- [ ] Select group - filters to that group's clients
- [ ] "All Groups" shows all clients
- [ ] Group filter works with other filters
- [ ] Pagination resets on group change

---

## 12. FACE CARDS / SUMMARY STATISTICS

### 12.1 Face Card Display
- [ ] Total Clients - shows correct count
- [ ] P&L % - percentage displays (NO double % sign)
- [ ] Margin % - percentage displays correctly
- [ ] Equity % - percentage displays correctly
- [ ] Blocked Profit % - displays correctly
- [ ] Daily Deposit % - displays correctly
- [ ] Lifetime P&L % - displays correctly
- [ ] Credit % - displays correctly

### 12.2 Face Card Calculations
- [ ] Values match filtered data
- [ ] Values update when filters applied
- [ ] Values update in real-time with WebSocket
- [ ] Percentages calculate correctly
- [ ] Indian number formatting works (lakhs/crores)

### 12.3 Face Card Modes
- [ ] Toggle between Percentage and Value modes
- [ ] Mode switch updates all cards
- [ ] Values format correctly in both modes
- [ ] No calculation errors

---

## 13. MODAL INTERACTIONS

### 13.1 Client Positions Modal
- [ ] Click "Positions" button - modal opens
- [ ] Shows client's open positions
- [ ] Data loads correctly
- [ ] Close button works
- [ ] Click outside modal - closes
- [ ] ESC key closes modal

### 13.2 Edit Percentage Modal
- [ ] Click edit icon - modal opens
- [ ] Shows current percentage value
- [ ] Can enter new percentage
- [ ] Save updates the value
- [ ] Cancel closes without saving
- [ ] Validation works (e.g., 0-100%)

### 13.3 Login Details Modal
- [ ] Opens with complete client information
- [ ] All fields populated correctly
- [ ] Read-only fields display properly
- [ ] Close functionality works

---

## 14. REAL-TIME UPDATES

### 14.1 WebSocket Live Updates
- [ ] Client equity updates in real-time
- [ ] Balance updates reflect immediately
- [ ] P&L updates show live
- [ ] Margin updates are real-time
- [ ] Face cards update with live data
- [ ] No lag between WebSocket message and UI update

### 14.2 Update Batching
- [ ] Multiple updates batch correctly
- [ ] No performance degradation with many updates
- [ ] UI doesn't flicker or jump
- [ ] Scrolling remains smooth during updates

### 14.3 Data Consistency
- [ ] No duplicate clients appear
- [ ] No clients disappear unexpectedly
- [ ] Data matches between table and face cards
- [ ] Filtered data updates correctly

---

## 15. PERFORMANCE TESTING

### 15.1 Large Dataset (2000+ clients)
- [ ] Page loads in reasonable time (<3 seconds)
- [ ] Scrolling is smooth
- [ ] Filtering doesn't lag
- [ ] Sorting completes quickly
- [ ] No browser freezing

### 15.2 Memory Management
- [ ] No memory leaks after extended use
- [ ] WebSocket doesn't cause memory buildup
- [ ] Browser console shows no warnings
- [ ] Page remains responsive after 30+ minutes

### 15.3 Rapid Interactions
- [ ] Rapidly clicking filters - no errors
- [ ] Quickly changing pages - no blank pages
- [ ] Fast typing in search - no crashes
- [ ] Rapidly toggling view modes - works correctly

---

## 16. EDGE CASES & ERROR HANDLING

### 16.1 Empty States
- [ ] No clients in database - shows empty state message
- [ ] Filter returns 0 results - shows "No results" message
- [ ] Search returns 0 results - shows appropriate message
- [ ] Column has no values - filter shows "No values available"

### 16.2 Special Characters
- [ ] Client name with special characters displays correctly
- [ ] Email with special characters works in filter
- [ ] Search with special characters works
- [ ] Unicode characters display properly

### 16.3 Null/Undefined Values
- [ ] Client with null email - displays as "-" or empty
- [ ] Null numeric values - display as "0.00" or "-"
- [ ] Missing fields don't break layout
- [ ] Filters handle null values gracefully

### 16.4 Very Large Numbers
- [ ] Equity > 1 crore displays correctly
- [ ] Large negative P&L formats properly
- [ ] Indian number formatting works for billions
- [ ] No number overflow errors

### 16.5 Very Small Numbers
- [ ] Values < 0.01 display correctly
- [ ] Decimal precision maintained
- [ ] Rounding doesn't cause errors

### 16.6 Concurrent Actions
- [ ] Apply filter while data is loading - handles gracefully
- [ ] Change page during WebSocket update - no errors
- [ ] Sort while filter is being applied - works correctly
- [ ] Multiple filters applied rapidly - all apply correctly

### 16.7 Network Issues
- [ ] API call fails - shows error message
- [ ] WebSocket disconnects - indicator shows "Disconnected"
- [ ] WebSocket reconnects - resumes updates
- [ ] Slow API - loading indicator shows

---

## 17. BROWSER COMPATIBILITY

### 17.1 Chrome
- [ ] All features work
- [ ] No console errors
- [ ] Layout renders correctly
- [ ] Performance is good

### 17.2 Firefox
- [ ] All features work
- [ ] Filters work correctly
- [ ] Enter key works in all fields
- [ ] No browser-specific issues

### 17.3 Edge
- [ ] Page loads correctly
- [ ] All interactions work
- [ ] WebSocket connects
- [ ] No compatibility issues

### 17.4 Safari (if applicable)
- [ ] Layout displays correctly
- [ ] Filters work
- [ ] Real-time updates function

---

## 18. RESPONSIVE DESIGN

### 18.1 Desktop (1920x1080)
- [ ] Full table visible
- [ ] All columns fit comfortably
- [ ] Face cards display in grid
- [ ] Filters don't overlap

### 18.2 Laptop (1366x768)
- [ ] Layout adjusts appropriately
- [ ] Horizontal scroll available if needed
- [ ] Filters position correctly
- [ ] No UI elements cut off

### 18.3 Tablet (iPad size)
- [ ] Responsive layout activates
- [ ] Table scrolls horizontally
- [ ] Touch interactions work
- [ ] Filters are accessible

### 18.4 Mobile (iPhone size)
- [ ] Mobile-optimized view
- [ ] Cards stack vertically
- [ ] Filters work on mobile
- [ ] All features accessible

---

## 19. ACCESSIBILITY

### 19.1 Keyboard Navigation
- [ ] Tab key navigates through interactive elements
- [ ] Enter key works on buttons and filters
- [ ] ESC key closes modals and dropdowns
- [ ] Arrow keys work in dropdowns
- [ ] Focus indicators visible

### 19.2 Screen Reader
- [ ] Table has proper ARIA labels
- [ ] Buttons have descriptive labels
- [ ] Form fields have labels
- [ ] Status messages announced

---

## 20. DATA INTEGRITY

### 20.1 Calculation Accuracy
- [ ] P&L calculations match expected values
- [ ] Margin level calculates correctly
- [ ] Percentage calculations accurate
- [ ] Totals in face cards match sum of table data

### 20.2 Filter Accuracy
- [ ] Text filters show exact matches
- [ ] Numeric filters respect operator (>, <, =, between)
- [ ] Combined filters use AND logic correctly
- [ ] Clearing filter returns exact original dataset

### 20.3 Sort Accuracy
- [ ] Ascending sort orders correctly (A-Z, 0-9)
- [ ] Descending sort orders correctly (Z-A, 9-0)
- [ ] Null values sort to end
- [ ] Case-insensitive sorting for text

---

## 21. CRITICAL BUG VERIFICATION

### 21.1 Page 2 Blank Data Bug (FIXED)
- [ ] **Go to page 2 - MUST see data (not blank)**
- [ ] Go to page 3 - data visible
- [ ] Return to page 1 - data still there
- [ ] No client-side pagination after server pagination

### 21.2 Face Card Percentage Duplication (FIXED)
- [ ] Face cards show "12.34" NOT "12.34%"
- [ ] Label shows "Daily Deposit %" (with %)
- [ ] No double percentage signs anywhere

### 21.3 IB Filter Z-Index Overlap (FIXED)
- [ ] IB dropdown appears ABOVE table header
- [ ] No overlap with sticky header
- [ ] Z-index is z-[100]

### 21.4 Filter UX Improvements (FIXED)
- [ ] No "Clear" button in filter modals
- [ ] Enter key submits filters
- [ ] Only OK and Close buttons present

### 21.5 DataContext Undefined Client Warning (FIXED)
- [ ] No "existingClient is undefined" warnings in console
- [ ] WebSocket updates merge correctly
- [ ] No index mismatch errors

### 21.6 Text Filter Default Selection (FIXED)
- [ ] Open filter - checkboxes are UNCHECKED by default
- [ ] Not all values pre-selected
- [ ] User must manually select desired values

---

## 22. REGRESSION TESTING

### 22.1 After Each Code Change
- [ ] All previous functionality still works
- [ ] No new console errors introduced
- [ ] Performance hasn't degraded
- [ ] Existing filters still work

### 22.2 Cross-Feature Testing
- [ ] Filter + Sort + Search all work together
- [ ] Pagination + Filter + Real-time updates compatible
- [ ] View mode + Filters + Sort compatible
- [ ] All combinations of quick filters work

---

## TEST EXECUTION SUMMARY

**Total Test Cases:** 400+  
**Passed:** ____  
**Failed:** ____  
**Blocked:** ____  
**Not Tested:** ____  

### Critical Issues Found:
1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

### Minor Issues Found:
1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

### Performance Notes:
________________________________________________
________________________________________________

### Recommendations:
________________________________________________
________________________________________________

---

## SIGN-OFF

**Tested By:** ____________________  
**Date:** ____________________  
**Approved By:** ____________________  
**Date:** ____________________  

**Status:** [ ] Ready for Production  [ ] Needs Fixes  [ ] Blocked

---

## AUTOMATED TEST SCENARIOS (For Future Development)

```javascript
// Suggested E2E test scenarios using Playwright/Cypress

describe('Client2 Module', () => {
  it('should load page and display data', () => {})
  it('should navigate to page 2 and show data', () => {})
  it('should apply text filter and filter data', () => {})
  it('should apply numeric filter with between operator', () => {})
  it('should submit filter on Enter key press', () => {})
  it('should handle real-time WebSocket updates', () => {})
  it('should show unchecked checkboxes on first filter open', () => {})
  it('should not show double percentage signs in face cards', () => {})
  it('should display IB dropdown above table header', () => {})
})
```

---

**END OF TEST CASES**
