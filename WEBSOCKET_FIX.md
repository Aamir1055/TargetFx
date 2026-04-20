# WebSocket Fix Applied

## What Changed

The WebSocket now connects **directly** to the backend server instead of going through Apache:
- **Old**: `ws://185.136.159.142/api/broker/ws` (through Apache - failed)
- **New**: `ws://185.136.159.142:8080/api/broker/ws` (direct to backend - works)

## What You Need to Do

1. **Clear Browser Cache**
   - Press `Ctrl + Shift + R` on the page
   - Or go to browser DevTools → Network tab → Check "Disable cache"

2. **Refresh the page**
   - The WebSocket should now connect successfully

3. **Verify it's working**
   - Open browser DevTools (F12)
   - Go to Console tab
   - You should NOT see WebSocket connection errors anymore
   - You should see live data updating on pages like Live Dealing, Positions, etc.

## URLs

- Frontend: http://185.136.159.142
- Admin: http://185.136.159.142/brk-eye-adm
- API: http://185.136.159.142/api (proxied through Apache)
- WebSocket: ws://185.136.159.142:8080/api/broker/ws (direct connection)

## Note

The API calls still go through Apache (no change needed), only WebSocket connects directly to avoid Apache proxy complexity.
