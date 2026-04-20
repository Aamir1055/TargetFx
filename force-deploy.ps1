Write-Host "Force Deploy - Clean Build and Deploy" -ForegroundColor Cyan

# Step 1: Clean old build
Write-Host "`nCleaning old build..." -ForegroundColor Yellow
if (Test-Path ".\dist") {
    Remove-Item -Path ".\dist" -Recurse -Force
    Write-Host "Old build removed" -ForegroundColor Green
}

# Step 2: Clean Vite cache
Write-Host "`nCleaning Vite cache..." -ForegroundColor Yellow
if (Test-Path ".\node_modules\.vite") {
    Remove-Item -Path ".\node_modules\.vite" -Recurse -Force -ErrorAction SilentlyContinue
}

# Step 3: Build with fresh cache
Write-Host "`nBuilding production bundle..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Step 4: Clean XAMPP htdocs completely (except brk-eye-adm)
Write-Host "`nCleaning XAMPP htdocs..." -ForegroundColor Yellow
Get-ChildItem -Path "C:\xampp\htdocs\" -Exclude "brk-eye-adm" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Step 5: Copy new files
Write-Host "`nCopying new files..." -ForegroundColor Yellow
Copy-Item -Path ".\dist\*" -Destination "C:\xampp\htdocs\" -Recurse -Force

Write-Host "`nForce deployment complete!" -ForegroundColor Green
Write-Host "`nIMPORTANT: Clear browser cache manually" -ForegroundColor Yellow
Write-Host "Press Ctrl+Shift+Delete or Ctrl+F5 to hard refresh" -ForegroundColor Gray
Write-Host "`nAccess at http://185.136.159.142" -ForegroundColor Cyan
