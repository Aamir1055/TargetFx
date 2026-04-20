# REMOTE SERVER DEPLOYMENT SCRIPT
# Run this script ON THE REMOTE SERVER (185.136.159.142)
# After copying the project folder via RDP

Write-Host "Remote Server Deployment Script" -ForegroundColor Cyan
Write-Host "Server: 185.136.159.142" -ForegroundColor Yellow

$projectPath = "C:\Users\Administrator\Desktop\Broker Eyes Frontend\Broker Eye"
$htdocsPath = "C:\xampp\htdocs"

# Change to project directory
if (Test-Path $projectPath) {
    Set-Location $projectPath
    Write-Host "Project found at: $projectPath" -ForegroundColor Green
} else {
    Write-Host "ERROR: Project not found at: $projectPath" -ForegroundColor Red
    Write-Host "Please copy the project folder to the remote server first!" -ForegroundColor Yellow
    exit 1
}

# Build the project
Write-Host "`nBuilding production bundle..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed!" -ForegroundColor Green

# Backup brk-eye-adm if it exists
$adminPanel = "$htdocsPath\brk-eye-adm"
$tempBackup = "$env:TEMP\brk-eye-adm-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss')"

if (Test-Path $adminPanel) {
    Write-Host "`nBacking up admin panel..." -ForegroundColor Yellow
    Copy-Item -Path $adminPanel -Destination $tempBackup -Recurse -Force
    Write-Host "Admin panel backed up to: $tempBackup" -ForegroundColor Green
}

# Clean htdocs (except brk-eye-adm)
Write-Host "`nCleaning htdocs folder..." -ForegroundColor Yellow
Get-ChildItem -Path $htdocsPath -Exclude "brk-eye-adm" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Old files cleaned!" -ForegroundColor Green

# Copy new files
Write-Host "`nCopying new files to htdocs..." -ForegroundColor Yellow
Copy-Item -Path ".\dist\*" -Destination $htdocsPath -Recurse -Force

# Restore admin panel if needed
if ((Test-Path $tempBackup) -and (-not (Test-Path $adminPanel))) {
    Write-Host "`nRestoring admin panel..." -ForegroundColor Yellow
    Copy-Item -Path $tempBackup -Destination $adminPanel -Recurse -Force
    Remove-Item -Path $tempBackup -Recurse -Force
    Write-Host "Admin panel restored!" -ForegroundColor Green
}

# Verify deployment
Write-Host "`nVerifying deployment..." -ForegroundColor Yellow
$requiredFiles = @(
    "$htdocsPath\index.html",
    "$htdocsPath\assets"
)

$allGood = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  Found: $file" -ForegroundColor Green
    } else {
        Write-Host "  Missing: $file" -ForegroundColor Red
        $allGood = $false
    }
}

if ($allGood) {
    Write-Host "`nDeployment successful!" -ForegroundColor Green
    Write-Host "`nAccess the app at:" -ForegroundColor Cyan
    Write-Host "  Frontend: http://185.136.159.142/" -ForegroundColor White
    Write-Host "  Admin: http://185.136.159.142/brk-eye-adm/" -ForegroundColor White
    Write-Host "`nRemember to clear browser cache (Ctrl+F5)!" -ForegroundColor Yellow
} else {
    Write-Host "`nDeployment may have issues. Please check manually." -ForegroundColor Red
}
