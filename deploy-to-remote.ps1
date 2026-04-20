# Deploy to Remote Server (185.136.159.142)
# This script builds locally and provides instructions for remote deployment

Write-Host "Building for Remote Server Deployment" -ForegroundColor Cyan
Write-Host "Target: http://185.136.159.142/" -ForegroundColor Yellow

# Step 1: Clean and Build
Write-Host "`nStep 1: Building production bundle..." -ForegroundColor Yellow
if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist" -Recurse -Force
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed!" -ForegroundColor Green

# Step 2: Create deployment package
Write-Host "`nStep 2: Creating deployment package..." -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$packageName = "broker-eyes-deploy-$timestamp.zip"
$packagePath = ".\$packageName"

# Check if Compress-Archive is available
if (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
    Compress-Archive -Path ".\dist\*" -DestinationPath $packagePath -Force
    Write-Host "Package created: $packageName" -ForegroundColor Green
} else {
    Write-Host "Note: Compress-Archive not available. You'll need to manually zip the dist folder." -ForegroundColor Yellow
}

# Step 3: Deployment Instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT INSTRUCTIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nOption 1: Remote Desktop (Recommended)" -ForegroundColor Yellow
Write-Host "1. Open Remote Desktop Connection (mstsc.exe)"
Write-Host "2. Connect to: 185.136.159.142"
Write-Host "3. Username: Administrator"
Write-Host "4. Password: Esteem@12"
Write-Host "5. Once connected, navigate to: C:\xampp\htdocs\"
Write-Host "6. Delete all files/folders EXCEPT 'brk-eye-adm' folder"
Write-Host "7. Copy the contents of your LOCAL 'dist' folder to C:\xampp\htdocs\"
Write-Host "   Local dist folder: $PWD\dist"

Write-Host "`nOption 2: Manual Copy via RDP" -ForegroundColor Yellow
Write-Host "1. Connect via RDP (same credentials as above)"
Write-Host "2. On your local machine, copy this folder: $PWD\dist"
Write-Host "3. In RDP session, paste to: C:\xampp\htdocs\"
Write-Host "4. Make sure brk-eye-adm folder is NOT deleted"

Write-Host "`nOption 3: Using this PowerShell script on Remote Server" -ForegroundColor Yellow
Write-Host "1. Connect via RDP"
Write-Host "2. Copy this entire project folder to remote server"
Write-Host "3. Run this command on remote server:"
Write-Host '   .\deploy.ps1' -ForegroundColor White

Write-Host "`nFiles to DELETE on remote C:\xampp\htdocs\:" -ForegroundColor Red
Write-Host "- index.html"
Write-Host "- vite.svg"
Write-Host "- registerSW.js"
Write-Host "- manifest.webmanifest"
Write-Host "- sw.js"
Write-Host "- workbox-*.js"
Write-Host "- assets/ folder"
Write-Host "- icons/ folder"
Write-Host "- .htaccess (will be replaced)"

Write-Host "`nFiles to KEEP on remote C:\xampp\htdocs\:" -ForegroundColor Green
Write-Host "- brk-eye-adm/ folder (DO NOT DELETE)"

Write-Host "`nAfter deployment:" -ForegroundColor Cyan
Write-Host "1. Verify files at http://185.136.159.142/"
Write-Host "2. Clear browser cache (Ctrl+F5)"
Write-Host "3. Test the unified groups feature"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Ready to deploy!" -ForegroundColor Green
Write-Host "Dist folder location: $PWD\dist" -ForegroundColor White
if (Test-Path $packagePath) {
    Write-Host "Package location: $PWD\$packageName" -ForegroundColor White
}
Write-Host "========================================" -ForegroundColor Cyan
