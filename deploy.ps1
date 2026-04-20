# Quick Deploy Script for Broker Eyes Frontend to XAMPP
# Run this script after making any changes to deploy to production

Write-Host "Starting deployment..." -ForegroundColor Cyan

# Step 1: Build the production bundle
Write-Host "`nBuilding production bundle..." -ForegroundColor Yellow
cd "C:\Users\irfan\Desktop\Broker Eyes Frontend\Broker Eye"
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Please fix errors and try again." -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green

# Step 2: Copy files to XAMPP
Write-Host "`nCopying files to XAMPP htdocs..." -ForegroundColor Yellow

$source = ".\dist\*"
$destination = "C:\xampp\htdocs\"

# Check if XAMPP htdocs exists
if (-not (Test-Path $destination)) {
    Write-Host "XAMPP htdocs folder not found at: $destination" -ForegroundColor Red
    Write-Host "Please verify XAMPP is installed or update the path in this script." -ForegroundColor Yellow
    exit 1
}

# Clean old files first (except brk-eye-adm)
Write-Host "Cleaning old files..." -ForegroundColor Yellow
Get-ChildItem -Path $destination -Exclude "brk-eye-adm" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Copy new files
try {
    Copy-Item -Path $source -Destination $destination -Recurse -Force
    Write-Host "Files copied successfully!" -ForegroundColor Green
} catch {
    Write-Host "Failed to copy files: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Verify deployment
Write-Host "`nVerifying deployment..." -ForegroundColor Yellow

$requiredFiles = @(
    "C:\xampp\htdocs\index.html",
    "C:\xampp\htdocs\.htaccess",
    "C:\xampp\htdocs\assets"
)

$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  Found: $file" -ForegroundColor Gray
    } else {
        Write-Host "  Missing: $file" -ForegroundColor Red
        $allFilesExist = $false
    }
}

if (-not $allFilesExist) {
    Write-Host "`nSome files are missing. Deployment may not work correctly." -ForegroundColor Yellow
    exit 1
}

# Success message
Write-Host "`nDeployment completed successfully!" -ForegroundColor Green
Write-Host "`nAccess your app at:" -ForegroundColor Cyan
Write-Host "   Frontend: http://185.136.159.142" -ForegroundColor White
Write-Host "   Admin Panel: http://185.136.159.142/brk-eye-adm" -ForegroundColor White
Write-Host "`nRemember to:" -ForegroundColor Yellow
Write-Host "   1. Ensure Apache modules are enabled (mod_rewrite, mod_proxy, mod_proxy_wstunnel, mod_headers)" -ForegroundColor Gray
Write-Host "   2. Restart Apache if you made config changes" -ForegroundColor Gray
Write-Host "   3. Verify backend API is running on port 8080" -ForegroundColor Gray
Write-Host "   4. Clear browser cache (Ctrl+F5)" -ForegroundColor Gray
Write-Host "`nDone!" -ForegroundColor Green
