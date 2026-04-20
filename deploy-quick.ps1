# Quick Deploy Script for Remote Server
# Usage: Run this script after connecting to 185.136.159.142 via RDP

param(
    [string]$RemotePath = "C:\xampp\htdocs\v2"
)

Write-Host "=== Broker Eyes - Quick Deploy ===" -ForegroundColor Cyan
Write-Host ""

# Check if dist folder exists
if (-not (Test-Path ".\dist")) {
    Write-Host "Error: dist folder not found. Building first..." -ForegroundColor Red
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed!" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Build folder found: .\dist" -ForegroundColor Green
Write-Host ""

# If running on remote server, deploy directly
if (Test-Path $RemotePath) {
    Write-Host "Deploying to: $RemotePath" -ForegroundColor Yellow
    
    # Backup existing deployment
    $backupPath = "$RemotePath-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Write-Host "Creating backup: $backupPath" -ForegroundColor Yellow
    
    if (Test-Path $RemotePath) {
        Copy-Item -Path $RemotePath -Destination $backupPath -Recurse -Force
        Write-Host "Backup created successfully" -ForegroundColor Green
    }
    
    # Clear the v2 folder (keep brk-eye-adm if it exists)
    Write-Host "Clearing deployment folder..." -ForegroundColor Yellow
    Get-ChildItem -Path $RemotePath | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    
    # Copy new files
    Write-Host "Copying new files..." -ForegroundColor Yellow
    Copy-Item -Path ".\dist\*" -Destination $RemotePath -Recurse -Force
    
    Write-Host ""
    Write-Host "=== DEPLOYMENT COMPLETED ===" -ForegroundColor Green
    Write-Host "Access your app at: http://185.136.159.142/v2/" -ForegroundColor Cyan
    Write-Host "Clear browser cache with: Ctrl+Shift+R" -ForegroundColor Yellow
    
} else {
    Write-Host "Not running on remote server." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "MANUAL DEPLOYMENT INSTRUCTIONS:" -ForegroundColor Cyan
    Write-Host "1. Connect to 185.136.159.142 via Remote Desktop" -ForegroundColor White
    Write-Host "   Username: Administrator, Password: Esteem@12" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Copy the entire 'dist' folder to the remote server" -ForegroundColor White
    Write-Host ""
    Write-Host "3. On remote server, open PowerShell and run:" -ForegroundColor White
    Write-Host '   cd "path\to\your\project"' -ForegroundColor Gray
    Write-Host '   .\deploy-quick.ps1' -ForegroundColor Gray
    Write-Host ""
    Write-Host "OR manually copy contents of dist folder to:" -ForegroundColor White
    Write-Host "   C:\xampp\htdocs\v2\" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Current dist folder contents:" -ForegroundColor Yellow
Get-ChildItem .\dist | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
