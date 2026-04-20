Write-Host "Quick Deploy to XAMPP" -ForegroundColor Cyan

# Build first
Write-Host "`nBuilding production bundle..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

$dist = ".\dist"
$destination = "C:\xampp\htdocs\"

# Remove old files (except brk-eye-adm)
Write-Host "`nCleaning old files..." -ForegroundColor Yellow
Get-ChildItem -Path $destination -Exclude "brk-eye-adm" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Copy new files
Write-Host "`nCopying files..." -ForegroundColor Yellow
Copy-Item -Path "$dist\*" -Destination $destination -Recurse -Force

Write-Host "Deployed!" -ForegroundColor Green
Write-Host "`nAccess at: http://185.136.159.142" -ForegroundColor White
Write-Host "`nNote: Clear browser cache to see changes." -ForegroundColor Yellow
