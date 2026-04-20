# Deploy to Remote Server (185.136.159.142) via SSH/SCP
# This script builds locally and automatically deploys to remote XAMPP

param(
    [string]$ServerIP = "185.136.159.142",
    [string]$Username = "Administrator",
    [string]$Password = "Esteem@12"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Remote Server Deployment Script" -ForegroundColor Cyan
Write-Host "Target: http://$ServerIP/" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Build the project
Write-Host "`nStep 1: Building production bundle..." -ForegroundColor Yellow
if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist" -Recurse -Force
}

npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Please fix errors and try again." -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green

# Step 2: Check if we have SSH access
Write-Host "`nStep 2: Checking remote connection..." -ForegroundColor Yellow

$pscpPath = Get-Command pscp.exe -ErrorAction SilentlyContinue
$plinkPath = Get-Command plink.exe -ErrorAction SilentlyContinue

if (-not $pscpPath -or -not $plinkPath) {
    Write-Host "`nPuTTY tools (pscp.exe, plink.exe) not found in PATH." -ForegroundColor Red
    Write-Host "`nPlease use ONE of these deployment methods:" -ForegroundColor Yellow
    
    Write-Host "`n--- METHOD 1: Manual RDP Deployment (RECOMMENDED) ---" -ForegroundColor Cyan
    Write-Host "1. Open Remote Desktop: mstsc.exe"
    Write-Host "2. Connect to: $ServerIP"
    Write-Host "3. Username: $Username"
    Write-Host "4. Password: $Password"
    Write-Host "5. On remote server, open File Explorer"
    Write-Host "6. Navigate to: C:\xampp\htdocs\"
    Write-Host "7. DELETE all files EXCEPT 'brk-eye-adm' folder"
    Write-Host "8. From your local machine, copy ALL contents from:"
    Write-Host "   $PWD\dist\*" -ForegroundColor White
    Write-Host "9. Paste into remote: C:\xampp\htdocs\"
    Write-Host "10. Verify at http://$ServerIP/ (Ctrl+F5 to clear cache)"
    
    Write-Host "`n--- METHOD 2: Using PowerShell Remoting ---" -ForegroundColor Cyan
    Write-Host "Run this on your local machine:" -ForegroundColor Yellow
    Write-Host '  $session = New-PSSession -ComputerName ' + $ServerIP + ' -Credential (Get-Credential)' -ForegroundColor White
    Write-Host '  Copy-Item -Path ".\dist\*" -Destination "C:\xampp\htdocs\" -ToSession $session -Recurse -Force' -ForegroundColor White
    Write-Host '  Remove-PSSession $session' -ForegroundColor White
    
    Write-Host "`n--- METHOD 3: Network Share (if available) ---" -ForegroundColor Cyan
    Write-Host "If you have network access, map network drive:" -ForegroundColor Yellow
    Write-Host "  net use Z: \\$ServerIP\c$ /user:$Username $Password" -ForegroundColor White
    Write-Host "  robocopy .\dist Z:\xampp\htdocs /E /XD brk-eye-adm /XF .gitkeep" -ForegroundColor White
    Write-Host "  net use Z: /delete" -ForegroundColor White
    
    Write-Host "`nDist folder ready at: $PWD\dist" -ForegroundColor Green
    exit 0
}

# Step 3: Deploy via PSCP
Write-Host "`nStep 3: Deploying to remote server..." -ForegroundColor Yellow

# Create a temporary script to clean and prepare remote directory
$remoteScript = @"
cd C:\xampp\htdocs
for /d %%i in (*) do if /i not "%%i"=="brk-eye-adm" rd /s /q "%%i"
for %%i in (*) do if /i not "%%i"=="brk-eye-adm" del /q "%%i"
"@

$tempScript = ".\temp_clean.bat"
$remoteScript | Out-File -FilePath $tempScript -Encoding ASCII

# Execute cleanup on remote server
Write-Host "Cleaning remote htdocs folder..." -ForegroundColor Yellow
& plink.exe -batch -pw $Password "${Username}@${ServerIP}" "cmd /c cd C:\xampp\htdocs && for /d %i in (*) do @if /i not %i==brk-eye-adm rd /s /q %i"
& plink.exe -batch -pw $Password "${Username}@${ServerIP}" "cmd /c cd C:\xampp\htdocs && for %i in (*) do @if /i not %i==brk-eye-adm del /q %i"

# Copy new files
Write-Host "Copying files to remote server..." -ForegroundColor Yellow
& pscp.exe -batch -pw $Password -r ".\dist\*" "${Username}@${ServerIP}:C:\xampp\htdocs\"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nDeployment completed successfully!" -ForegroundColor Green
    Write-Host "`nYour application is now available at:" -ForegroundColor Cyan
    Write-Host "  Frontend: http://${ServerIP}/" -ForegroundColor White
    Write-Host "  Admin Panel: http://${ServerIP}/brk-eye-adm" -ForegroundColor White
    Write-Host "`nDon't forget to:" -ForegroundColor Yellow
    Write-Host "  - Clear browser cache (Ctrl+F5)" -ForegroundColor Gray
    Write-Host "  - Verify backend API is running" -ForegroundColor Gray
} else {
    Write-Host "`nDeployment failed!" -ForegroundColor Red
    Write-Host "Please use manual RDP method or check your network connection." -ForegroundColor Yellow
}

# Cleanup
if (Test-Path $tempScript) {
    Remove-Item $tempScript -Force
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Done!" -ForegroundColor Green

