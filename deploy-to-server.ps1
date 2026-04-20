# Simple Deploy Script for Remote Server
# Builds locally and opens RDP for manual file transfer

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy to Remote Server" -ForegroundColor Cyan
Write-Host "Target: http://185.136.159.142/" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build
Write-Host "`nStep 1: Building production bundle..." -ForegroundColor Yellow
cd "C:\Users\irfan\Desktop\Broker Eyes Frontend\Broker Eye"

if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist" -Recurse -Force
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBuild failed! Please fix errors first." -ForegroundColor Red
    exit 1
}

Write-Host "`nBuild completed successfully!" -ForegroundColor Green

# Step 2: Open the dist folder
Write-Host "`nStep 2: Opening dist folder..." -ForegroundColor Yellow
Start-Process explorer.exe -ArgumentList ".\dist"
Start-Sleep -Seconds 2

# Step 3: Open Remote Desktop
Write-Host "`nStep 3: Opening Remote Desktop Connection..." -ForegroundColor Yellow
Write-Host "Connecting to: 185.136.159.142" -ForegroundColor Cyan

# Create RDP file for easy connection
$rdpContent = @"
full address:s:185.136.159.142
username:s:Administrator
"@

$rdpFile = ".\remote-server.rdp"
$rdpContent | Out-File -FilePath $rdpFile -Encoding ASCII

Start-Process mstsc.exe -ArgumentList $rdpFile

Start-Sleep -Seconds 3

# Step 4: Show instructions
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "DEPLOYMENT INSTRUCTIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n1. Remote Desktop is opening..." -ForegroundColor Yellow
Write-Host "   Server: 185.136.159.142" -ForegroundColor White
Write-Host "   Username: Administrator" -ForegroundColor White
Write-Host "   Password: Esteem@12" -ForegroundColor White

Write-Host "`n2. After connecting to RDP:" -ForegroundColor Yellow
Write-Host "   - Open File Explorer on remote server" -ForegroundColor White
Write-Host "   - Navigate to: C:\xampp\htdocs\" -ForegroundColor White

Write-Host "`n3. DELETE these files/folders (EXCEPT brk-eye-adm):" -ForegroundColor Red
Write-Host "   - index.html" -ForegroundColor White
Write-Host "   - registerSW.js" -ForegroundColor White
Write-Host "   - manifest.webmanifest" -ForegroundColor White
Write-Host "   - sw.js" -ForegroundColor White
Write-Host "   - workbox-*.js files" -ForegroundColor White
Write-Host "   - assets/ folder" -ForegroundColor White
Write-Host "   - icons/ folder" -ForegroundColor White
Write-Host "   - .htaccess" -ForegroundColor White

Write-Host "`n4. KEEP THIS FOLDER (DO NOT DELETE):" -ForegroundColor Green
Write-Host "   - brk-eye-adm/ folder" -ForegroundColor White

Write-Host "`n5. Copy ALL files from your LOCAL dist folder:" -ForegroundColor Yellow
Write-Host "   Local folder (already open in Explorer):" -ForegroundColor White
Write-Host "   $PWD\dist\" -ForegroundColor Cyan

Write-Host "`n6. Paste into REMOTE server:" -ForegroundColor Yellow
Write-Host "   Remote path: C:\xampp\htdocs\" -ForegroundColor Cyan

Write-Host "`n7. After copying, verify:" -ForegroundColor Yellow
Write-Host "   - Open browser: http://185.136.159.142/" -ForegroundColor White
Write-Host "   - Press Ctrl+F5 to clear cache and reload" -ForegroundColor White
Write-Host "   - Test the edit functionality in groups" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Dist folder location:" -ForegroundColor Yellow
Write-Host "$PWD\dist\" -ForegroundColor White
Write-Host "`nRemote destination:" -ForegroundColor Yellow
Write-Host "C:\xampp\htdocs\" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`nReady! Follow the instructions above." -ForegroundColor Green
Write-Host "Press any key to exit this script..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

