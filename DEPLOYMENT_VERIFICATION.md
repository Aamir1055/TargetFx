# Deployment Verification Guide

## 🎯 Deployment Summary

**Date:** October 26, 2025  
**Server:** http://185.136.159.142  
**Broker Eye:** Root path `/`  
**Admin Panel:** Subfolder `/brk-eye-adm/`

---

## 📁 File Structure

```
C:\xampp\htdocs\
├── assets/                    # Broker Eye assets
├── icons/                     # Broker Eye icons
├── brk-eye-adm/              # Admin Panel (isolated)
│   ├── assets/               # Admin assets
│   ├── .htaccess             # Admin routing (RewriteBase /brk-eye-adm/)
│   ├── index.html            # Admin entry point
│   └── vite.svg
├── .htaccess                  # Root routing with admin exclusion
├── index.html                 # Broker Eye entry point
├── manifest.webmanifest
├── registerSW.js
├── sw.js
├── vite.svg
└── workbox-*.js
```

---

## ✅ Routing Configuration

### Root .htaccess (Broker Eye)
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # CRITICAL: Exclude admin panel folder - MUST be first rule
  RewriteCond %{REQUEST_URI} ^/brk-eye-adm/ [NC]
  RewriteRule ^ - [L]

  # API proxying...
  # SPA routing with admin exclusion...
</IfModule>
```

### Admin .htaccess (Admin Panel)
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /brk-eye-adm/
  
  # SPA routing for admin panel...
</IfModule>
```

---

## 🧪 Testing Checklist

### Admin Panel Tests
- [ ] **Access:** http://185.136.159.142/brk-eye-adm
- [ ] **Login page:** http://185.136.159.142/brk-eye-adm/login
- [ ] **Login:** Should redirect to `http://185.136.159.142/brk-eye-adm` (dashboard)
- [ ] **Navigation:** All admin routes should stay under `/brk-eye-adm/*`
- [ ] **Logout:** Should redirect to `http://185.136.159.142/brk-eye-adm/login`
- [ ] **Refresh:** Any admin page refresh should stay in admin context

### Broker Eye Tests
- [ ] **Root access:** http://185.136.159.142/
- [ ] **Login page:** http://185.136.159.142/login
- [ ] **Login:** Should redirect to `http://185.136.159.142/` (dashboard)
- [ ] **Navigation:** All Broker Eye routes should stay under root `/`
- [ ] **Logout:** Should redirect to `http://185.136.159.142/login`
- [ ] **Refresh:** Any page refresh should work correctly
- [ ] **Deep links:** `/positions`, `/pending-orders`, `/margin-level`, `/live-dealing` should load

### Cross-App Isolation
- [ ] Admin login does NOT redirect to Broker Eye
- [ ] Admin logout does NOT show Broker Eye login
- [ ] Broker Eye login does NOT redirect to Admin
- [ ] Broker Eye logout does NOT show Admin login
- [ ] Both apps can run simultaneously without conflicts

---

## 🔧 Troubleshooting

### If routing issues occur:

1. **Restart Apache**
   - Open XAMPP Control Panel
   - Click "Stop" on Apache
   - Wait 5 seconds
   - Click "Start" on Apache

2. **Clear Browser Cache**
   - Press `Ctrl + Shift + R` (hard reload)
   - Or `Ctrl + Shift + Delete` → Clear cached images and files

3. **Verify .htaccess files**
   ```powershell
   Get-Content "C:\xampp\htdocs\.htaccess"
   Get-Content "C:\xampp\htdocs\brk-eye-adm\.htaccess"
   ```

4. **Check Apache Modules**
   - Ensure `mod_rewrite` is enabled in `httpd.conf`
   - Ensure `AllowOverride All` is set for the directory

---

## 🚀 Expected Behavior

### Admin Panel URLs
- **Base:** `http://185.136.159.142/brk-eye-adm`
- **Login:** `http://185.136.159.142/brk-eye-adm/login`
- **Dashboard:** `http://185.136.159.142/brk-eye-adm`
- **Other routes:** All under `/brk-eye-adm/*`

### Broker Eye URLs
- **Base:** `http://185.136.159.142/`
- **Login:** `http://185.136.159.142/login`
- **Dashboard:** `http://185.136.159.142/`
- **Positions:** `http://185.136.159.142/positions`
- **Pending Orders:** `http://185.136.159.142/pending-orders`
- **Margin Level:** `http://185.136.159.142/margin-level`
- **Live Dealing:** `http://185.136.159.142/live-dealing`
- **Settings:** `http://185.136.159.142/settings`

---

## 🎉 Success Criteria

✅ Admin panel accessible at `/brk-eye-adm/`  
✅ Broker Eye accessible at root `/`  
✅ No cross-app redirects or routing conflicts  
✅ Both apps maintain independent authentication  
✅ Page refreshes work correctly in both apps  
✅ Deep links work in both apps  
✅ Logout redirects to correct login page in each app  

---

## 📝 Notes

- **Admin panel** is completely isolated in `/brk-eye-adm/` subfolder
- **Broker Eye** owns the root path and all routes except `/brk-eye-adm/`
- Root `.htaccess` has admin exclusion as the **first rule** with `[L]` flag
- Both apps use separate `index.html` files and assets
- WebSocket connects directly to backend on port 8080
- API calls proxy through Apache to backend on port 8080
