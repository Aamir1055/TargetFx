# Deploying Broker Eyes Frontend to XAMPP

## Server Information
- **Server IP**: 185.136.159.142
- **Admin Panel**: http://185.136.159.142/brk-eye-adm
- **Broker Eyes Frontend**: http://185.136.159.142
- **Backend API**: http://185.136.159.142:8080/api

## Prerequisites
1. XAMPP installed and running on the server
2. Apache modules enabled:
   - `mod_rewrite`
   - `mod_proxy`
   - `mod_proxy_http`
   - `mod_proxy_wstunnel` (for WebSocket support)
   - `mod_headers`

## Step 1: Enable Required Apache Modules

### On Windows (XAMPP):
1. Open `C:\xampp\apache\conf\httpd.conf`
2. Find and uncomment these lines (remove the `#` at the start):
   ```apache
   LoadModule rewrite_module modules/mod_rewrite.so
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
   LoadModule headers_module modules/mod_headers.so
   ```
3. Save the file

### On Linux:
```bash
sudo a2enmod rewrite
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod headers
sudo systemctl restart apache2
```

## Step 2: Configure Apache to Allow .htaccess

1. Open `C:\xampp\apache\conf\httpd.conf` (or `/etc/apache2/apache2.conf` on Linux)
2. Find the `<Directory>` section for your htdocs folder
3. Change `AllowOverride None` to `AllowOverride All`:
   ```apache
   <Directory "C:/xampp/htdocs">
       Options Indexes FollowSymLinks Includes ExecCGI
       AllowOverride All
       Require all granted
   </Directory>
   ```
4. Save and restart Apache

## Step 3: Build the Production Bundle

On your development machine:
```bash
cd "C:\Users\Administrator\Desktop\Broker Eyes Frontend\Broker Eye"
npm run build
```

This creates an optimized production build in the `dist` folder.

## Step 4: Deploy to XAMPP

### Option A: Deploy to Root (http://185.136.159.142)

1. **On the server**, navigate to XAMPP htdocs:
   ```
   C:\xampp\htdocs  (Windows)
   /opt/lampp/htdocs  (Linux)
   ```

2. **Backup existing files** (if any):
   ```bash
   # Create a backup folder
   mkdir htdocs_backup
   # Move existing files (except brk-eye-adm)
   move *.* htdocs_backup\
   ```

3. **Copy the build files**:
   - Copy everything from `dist` folder to `C:\xampp\htdocs\`
   - Make sure `.htaccess` is included (it's already in the dist folder)

4. **Verify the structure**:
   ```
   C:\xampp\htdocs\
   ├── .htaccess           # Apache configuration
   ├── index.html          # Main app
   ├── assets\             # JS, CSS files
   ├── icons\              # Icons
   ├── brk-eye-adm\        # Admin panel (existing)
   └── ...
   ```

### Option B: Deploy to Subfolder (http://185.136.159.142/broker-eye)

If you prefer to keep it in a subfolder:

1. Create a folder: `C:\xampp\htdocs\broker-eye`
2. Copy all files from `dist` to `broker-eye`
3. Update Vite config base path (see Step 5 below)

## Step 5: Update Configuration (if using subfolder)

If deploying to a subfolder, update `vite.config.js`:

```javascript
export default defineConfig({
  base: '/broker-eye/',  // Add this line
  // ... rest of config
})
```

Then rebuild:
```bash
npm run build
```

## Step 6: Restart Apache

```bash
# Windows XAMPP
# Use XAMPP Control Panel and click "Stop" then "Start" for Apache

# Linux
sudo systemctl restart apache2
```

## Step 7: Test the Deployment

1. **Open in browser**: http://185.136.159.142
2. **Test login**: Should see the login page
3. **Test API**: Login should work and fetch data
4. **Test WebSocket**: Check Live Dealing page for real-time updates
5. **Test routing**: Navigate between pages (Dashboard, Clients, etc.)

## Troubleshooting

### Issue: "404 Not Found" on page refresh
**Solution**: Check that `.htaccess` is in the root folder and `mod_rewrite` is enabled.

### Issue: API calls fail (CORS errors)
**Solution**: 
1. Verify `.htaccess` has CORS headers
2. Check that `mod_headers` is enabled
3. Verify backend is running on port 8080

### Issue: WebSocket not connecting
**Solution**:
1. Enable `mod_proxy_wstunnel` module
2. Check that backend WebSocket server is running
3. Verify `.htaccess` WebSocket proxy rules

### Issue: Assets not loading (404 for CSS/JS)
**Solution**:
1. Check that `base` path in `vite.config.js` matches deployment location
2. Verify all files from `dist` folder are copied
3. Check browser console for exact missing file paths

### Issue: "Forbidden" or "500 Internal Server Error"
**Solution**:
1. Check file permissions (should be readable by Apache)
2. Verify `AllowOverride All` is set in Apache config
3. Check Apache error logs: `C:\xampp\apache\logs\error.log`

## File Permissions (Linux only)

```bash
cd /opt/lampp/htdocs
sudo chown -R daemon:daemon .
sudo chmod -R 755 .
```

## Quick Deploy Script (Windows PowerShell)

Save this as `deploy.ps1`:

```powershell
# Build the app
cd "C:\Users\Administrator\Desktop\Broker Eyes Frontend\Broker Eye"
npm run build

# Copy to XAMPP (adjust paths as needed)
$source = ".\dist\*"
$destination = "C:\xampp\htdocs\"

Copy-Item -Path $source -Destination $destination -Recurse -Force

Write-Host "✅ Deployment complete!"
Write-Host "Access at: http://185.136.159.142"
```

Run with:
```powershell
.\deploy.ps1
```

## Verification Checklist

- [ ] Apache modules enabled (rewrite, proxy, headers, proxy_wstunnel)
- [ ] `.htaccess` file present in htdocs root
- [ ] AllowOverride All set in httpd.conf
- [ ] Apache restarted after config changes
- [ ] All files from `dist` folder copied to server
- [ ] Login page loads at http://185.136.159.142
- [ ] Can login successfully
- [ ] API calls work (check Network tab)
- [ ] WebSocket connects (check Console)
- [ ] Page refresh works (doesn't show 404)
- [ ] All routes accessible (Dashboard, Clients, etc.)

## Production URLs

After deployment:
- **Frontend**: http://185.136.159.142
- **Admin Panel**: http://185.136.159.142/brk-eye-adm
- **API**: Proxied through Apache to http://185.136.159.142:8080/api
- **WebSocket**: Proxied through Apache to ws://185.136.159.142:8080/api/broker/ws

## Notes

1. The `.htaccess` file is configured to:
   - Proxy all `/api/*` requests to the backend (port 8080)
   - Proxy WebSocket connections
   - Enable CORS headers
   - Handle SPA routing (all routes go to index.html)
   - Add security headers
   - Enable compression
   - Set cache headers

2. No changes needed to the frontend code - it's already configured to use relative API paths

3. The admin panel at `/brk-eye-adm` will continue to work as before

4. Make sure the backend API server is running on port 8080

## Support

If you encounter issues:
1. Check Apache error log: `C:\xampp\apache\logs\error.log`
2. Check browser console for JavaScript errors
3. Check Network tab for failed requests
4. Verify backend API is accessible at http://185.136.159.142:8080/api
