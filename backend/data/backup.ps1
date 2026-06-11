$backupDir = "$PSScriptRoot\backups"
$storeFile = "$PSScriptRoot\store.json"
$envFile   = "$PSScriptRoot\..\env"
$date      = Get-Date -Format "yyyy-MM-dd"
$backupFile = "$backupDir\store_$date.json"

# Leer variables del .env
$masterKey = $null
$binId     = $null
if (Test-Path "$PSScriptRoot\..\.env") {
    foreach ($line in Get-Content "$PSScriptRoot\..\.env") {
        if ($line -match '^JSONBIN_MASTER_KEY=(.+)$') { $masterKey = $matches[1].Trim() }
        if ($line -match '^JSONBIN_BIN_ID=(.+)$')     { $binId     = $matches[1].Trim() }
    }
}

if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

if ($masterKey -and $binId) {
    # Modo JSONBin: obtener datos desde la nube
    Write-Host "Obteniendo store desde JSONBin..."
    try {
        $response = Invoke-RestMethod `
            -Uri "https://api.jsonbin.io/v3/b/$binId/latest" `
            -Headers @{ "X-Master-Key" = $masterKey; "X-Bin-Meta" = "false" }
        $response | ConvertTo-Json -Depth 20 | Out-File -FilePath $backupFile -Encoding utf8
        Write-Host "Backup creado desde JSONBin: $backupFile"
    } catch {
        Write-Host "ERROR al leer JSONBin: $_"
        exit 1
    }
} elseif (Test-Path $storeFile) {
    # Modo local: copiar el archivo directamente
    Copy-Item -Path $storeFile -Destination $backupFile -Force
    Write-Host "Backup creado desde archivo local: $backupFile"
} else {
    Write-Host "ERROR: No se encontro store.json ni variables de JSONBin configuradas."
    exit 1
}

# Eliminar backups con mas de 30 dias
Get-ChildItem -Path $backupDir -Filter "store_*.json" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } |
    Remove-Item -Force
