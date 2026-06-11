$storeFile = "$PSScriptRoot\store.json"
$backupDir = "$PSScriptRoot\backups"
$date = Get-Date -Format "yyyy-MM-dd"
$backupFile = "$backupDir\store_$date.json"

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

if (Test-Path $storeFile) {
    Copy-Item -Path $storeFile -Destination $backupFile -Force
    Write-Host "Backup creado: $backupFile"
} else {
    Write-Host "ERROR: No se encontro store.json en $storeFile"
    exit 1
}

# Eliminar backups con mas de 30 dias
Get-ChildItem -Path $backupDir -Filter "store_*.json" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
