# Client 2 Module - Correct API Format Implementation

## API Format Requirements

### For Email/Name/Phone (Text Fields):
```json
{
  "filters": [
    {"email": "value1@test.com,value2@test.com,value3@test.com"}
  ],
  "page": 1,
  "limit": 50
}
```

**Key Point**: The filter object uses the field name directly as the key (e.g., `{"email": "..."}`) NOT `{"field": "email", "value": "..."}`

### For Login (MT5 Accounts):
```json
{
  "mt5Accounts": [555075, 555088, 555175],
  "page": 1,
  "limit": 100
}
```

**Key Point**: Login uses a special `mt5Accounts` array parameter, not filters.

## Code Changes

### Before (WRONG):
```javascript
// Was sending:
{
  "filters": [
    {"field": "email", "value": "value1,value2,value3"}
  ]
}
```

### After (CORRECT):
```javascript
// Now sending:
{
  "filters": [
    {"email": "value1,value2,value3"}
  ]
}
```

### Implementation:
```javascript
// Use field name as object key directly
const commaSeparatedValues = selectedValues.join(',')
combinedFilters.push({ [field]: commaSeparatedValues })
```

## How It Works

### 1. User Selects Email Values
- User clicks filter icon on Email column
- Selects: `user1@test.com`, `user2@test.com`, `user3@test.com`
- Clicks OK

### 2. Code Builds Filter
```javascript
const selectedValues = ["user1@test.com", "user2@test.com", "user3@test.com"]
const commaSeparatedValues = selectedValues.join(',')
// Result: "user1@test.com,user2@test.com,user3@test.com"

combinedFilters.push({ email: commaSeparatedValues })
// Result: { "email": "user1@test.com,user2@test.com,user3@test.com" }
```

### 3. API Request
```json
POST https://api.brokereye.work.gd/api/broker/clients/search
{
  "filters": [
    {"email": "user1@test.com,user2@test.com,user3@test.com"}
  ],
  "page": 1,
  "limit": 50
}
```

### 4. API Response
Returns clients that match ANY of the email values (OR logic).

## Field Mapping

| Column | API Field Name | Format |
|--------|---------------|--------|
| Email | `email` | `{"email": "val1,val2,val3"}` |
| Name | `name` | `{"name": "val1,val2,val3"}` |
| Phone | `phone` | `{"phone": "val1,val2,val3"}` |
| Login | `mt5Accounts` | `{"mt5Accounts": [123, 456, 789]}` |

## Testing

### Test Email Filter:
1. Click filter icon on Email column
2. Select 3 emails
3. Click OK
4. Check Network tab → Request payload should be:
```json
{
  "filters": [{"email": "email1,email2,email3"}],
  "page": 1,
  "limit": 50
}
```

### Test Name Filter:
1. Click filter icon on Name column
2. Select 5 names
3. Click OK
4. Check Network tab → Request payload should be:
```json
{
  "filters": [{"name": "name1,name2,name3,name4,name5"}],
  "page": 1,
  "limit": 50
}
```

### Test Login Filter:
1. Click filter icon on Login column
2. Select 3 logins
3. Click OK
4. Check Network tab → Request payload should be:
```json
{
  "mt5Accounts": [555075, 555088, 555175],
  "page": 1,
  "limit": 50
}
```

## Removed Optimizations

### Not Equal Optimization (Removed)
Previously, if you selected 180 out of 182 values, it would try to use `not_equal` for the 2 unselected values. This optimization was removed because:
1. The API format doesn't support `operator` field
2. Simpler to just send all selected values
3. API handles OR logic efficiently

## Summary

✅ **Email filter**: Uses `{"email": "val1,val2,val3"}` format  
✅ **Name filter**: Uses `{"name": "val1,val2,val3"}` format  
✅ **Phone filter**: Uses `{"phone": "val1,val2,val3"}` format  
✅ **Login filter**: Uses `{"mt5Accounts": [123, 456, 789]}` format  
✅ **Single API call** for all filters  
✅ **Correct pagination**  
✅ **Correct face card totals**  

The filters now use the exact API format you specified! 🎉
