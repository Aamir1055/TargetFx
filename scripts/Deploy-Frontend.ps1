[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$SourcePath,
    [string]$DestinationPath = 'C:\xampp\htdocs',
    [string]$BackupRoot = 'C:\xampp\brokereye-deploy-backups'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-NoLink([string]$Path) {
    $current = [IO.Path]::GetFullPath($Path)
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing linked path: $current" }
        }
        $current = [IO.Path]::GetDirectoryName($current)
    }
}
function Safe-Child([string]$Root, [string]$Relative) {
    $path = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (!$path.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes allowed directory: $path" }
    Assert-NoLink $path
    return $path
}
$source = (Resolve-Path -LiteralPath $SourcePath).Path.TrimEnd('\')
$destination = (Resolve-Path -LiteralPath $DestinationPath).Path.TrimEnd('\')
$backupBase = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
Assert-NoLink $source
Assert-NoLink $destination
Assert-NoLink $backupBase
if ($source -eq $destination -or $source.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Source must be outside the web root.' }
if ($backupBase -eq $destination -or $backupBase.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Backups must be outside the web root.' }

$required = @('Favicon.svg', 'favicon-icon.png', 'index.html', 'manifest.webmanifest', 'registerSW.js', 'vite.svg', 'sw.js')
foreach ($name in $required) {
    if (!(Test-Path -LiteralPath (Safe-Child $source $name) -PathType Leaf)) { throw "Missing required build file: $name" }
}
$assetsPath = Safe-Child $source 'assets'
if (!(Test-Path -LiteralPath $assetsPath -PathType Container)) { throw 'Missing assets directory.' }
$entries = @(Get-ChildItem -LiteralPath $assetsPath -Recurse -Force)
foreach ($entry in $entries) { Assert-NoLink $entry.FullName }
$assets = @($entries | Where-Object { !$_.PSIsContainer } | ForEach-Object { $_.FullName.Substring($source.Length + 1) })
if (!$assets.Count) { throw 'The assets directory is empty.' }
$workbox = @(Get-ChildItem -LiteralPath $source -File | Where-Object { $_.Name -match '^workbox-[a-f0-9]+\.js$' } | ForEach-Object { $_.Name })
if (!$workbox.Count) { throw 'Missing Workbox runtime.' }
# Dependencies first; entry points last. Never mirror or clear the web root.
$files = @($assets) + $workbox + @('Favicon.svg', 'favicon-icon.png', 'vite.svg', 'manifest.webmanifest', 'registerSW.js', 'index.html', 'sw.js')
foreach ($relative in $files) {
    $null = Safe-Child $source $relative
    $target = Safe-Child $destination $relative
    if (Test-Path -LiteralPath $target -PathType Container) { throw "Directory occupies file target: $target" }
}
if (!$PSCmdlet.ShouldProcess($destination, "Back up and deploy $($files.Count) selected files")) { return }
$backup = Safe-Child $backupBase ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
$changed = [Collections.Generic.List[object]]::new()
try {
    foreach ($relative in $files) {
        $inputFile = Safe-Child $source $relative
        $target = Safe-Child $destination $relative
        $saved = Safe-Child $backup $relative
        $existed = Test-Path -LiteralPath $target -PathType Leaf
        if ($existed) {
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($saved)) -Force | Out-Null
            Copy-Item -LiteralPath $target -Destination $saved
        }
        $changed.Add([pscustomobject]@{ Path = $relative; Existed = $existed })
        New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
        Copy-Item -LiteralPath $inputFile -Destination $target -Force
        if ((Get-FileHash -LiteralPath $inputFile).Hash -ne (Get-FileHash -LiteralPath $target).Hash) { throw "Verification failed: $relative" }
    }
    $changed | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'deployment.json') -Encoding UTF8
    Write-Output "Deployed $($files.Count) selected files. Backup: $backup"
} catch {
    $failure = $_
    foreach ($entry in $changed) {
        $target = Safe-Child $destination $entry.Path
        if ($entry.Existed) { Copy-Item -LiteralPath (Safe-Child $backup $entry.Path) -Destination $target -Force }
        elseif (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
    }
    throw $failure
}
