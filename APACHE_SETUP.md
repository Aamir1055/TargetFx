# XAMPP Apache Configuration Checklist

Before deploying, ensure these Apache modules are enabled in `C:\xampp\apache\conf\httpd.conf`:

## Required Modules

Open `httpd.conf` and find these lines. Remove the `#` at the start if present:

```apache
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule proxy_wstunnel_module modules/mod_proxy_wstunnel.so
LoadModule headers_module modules/mod_headers.so
```

## Enable .htaccess

Find the `<Directory>` section for htdocs (around line 232):

```apache
<Directory "C:/xampp/htdocs">
    Options Indexes FollowSymLinks Includes ExecCGI
    AllowOverride All         # ← Change from "None" to "All"
    Require all granted
</Directory>
```

## After Making Changes

1. Save the `httpd.conf` file
2. Open XAMPP Control Panel
3. Stop Apache
4. Start Apache
5. Check for errors in the XAMPP Control Panel

## Test Your Configuration

After restarting Apache, test if modules are loaded:

1. Create a file `C:\xampp\htdocs\phpinfo.php` with:
   ```php
   <?php phpinfo(); ?>
   ```

2. Visit `http://185.136.159.142/phpinfo.php`

3. Search for "Loaded Modules" and verify you see:
   - mod_rewrite
   - mod_proxy
   - mod_proxy_http
   - mod_proxy_wstunnel
   - mod_headers

4. Delete `phpinfo.php` after verification (security)

## Common Issues

### Issue: Apache won't start after enabling modules
**Solution**: Check `C:\xampp\apache\logs\error.log` for specific errors

### Issue: mod_proxy_wstunnel not available
**Solution**: This module may not be available in older XAMPP versions. Update to latest XAMPP or use Apache 2.4.5+

### Issue: Can't find httpd.conf
**Default locations**:
- Windows XAMPP: `C:\xampp\apache\conf\httpd.conf`
- Linux XAMPP: `/opt/lampp/apache/conf/httpd.conf`
- Linux Apache: `/etc/apache2/apache2.conf`

## Quick Check Command

On Linux, verify modules with:
```bash
apachectl -M | grep -E "(rewrite|proxy|headers)"
```

On Windows XAMPP, modules are listed in the Apache error log during startup.
