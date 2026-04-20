# Deploy to amari-capital-new folder on production
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deploy to amari-capital-new" -ForegroundColor Cyan
Write-Host "Target: http://185.136.159.142/amari-capital-new/" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build
Write-Host "`nStep 1: Building production bundle..." -ForegroundColor Yellow

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
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Wait for Remote Desktop to connect" -ForegroundColor White
Write-Host "2. Navigate to: C:\xampp\htdocs\amari-capital-new\" -ForegroundColor Yellow
Write-Host "3. Delete old files in amari-capital-new folder" -ForegroundColor White
Write-Host "4. Copy ALL files from the dist folder to: C:\xampp\htdocs\amari-capital-new\" -ForegroundColor Yellow
Write-Host "5. Make sure to copy index.html, .htaccess, and assets folder" -ForegroundColor White
Write-Host ""
Write-Host "Access your app at: http://185.136.159.142/amari-capital-new/" -ForegroundColor Cyan
Write-Host ""
Write-Host "Note: Clear browser cache to see changes!" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
