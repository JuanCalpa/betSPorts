$storeFile = "$PSScriptRoot\store.json"
$backupDir = "$PSScriptRoot\backups"

# Leer variables del .env
$masterKey = $null
$binId     = $null
if (Test-Path "$PSScriptRoot\..\.env") {
    foreach ($line in Get-Content "$PSScriptRoot\..\.env") {
        if ($line -match '^JSONBIN_MASTER_KEY=(.+)$') { $masterKey = $matches[1].Trim() }
        if ($line -match '^JSONBIN_BIN_ID=(.+)$')     { $binId     = $matches[1].Trim() }
    }
}

$useJsonBin = ($masterKey -and $binId)

$backups = Get-ChildItem -Path $backupDir -Filter "store_*.json" |
    Sort-Object Name -Descending

if ($backups.Count -eq 0) {
    Write-Host "No hay backups disponibles en $backupDir"
    exit 1
}

Write-Host ""
Write-Host "Backups disponibles:"
for ($i = 0; $i -lt $backups.Count; $i++) {
    Write-Host "  [$i] $($backups[$i].Name)  ($($backups[$i].LastWriteTime.ToString('yyyy-MM-dd HH:mm')))"
}

Write-Host ""
$eleccion = Read-Host "Elige el numero del backup a restaurar"

if ($eleccion -notmatch '^\d+$' -or [int]$eleccion -ge $backups.Count) {
    Write-Host "Opcion invalida."
    exit 1
}

$elegido = $backups[[int]$eleccion]
$backupContent = Get-Content $elegido.FullName -Raw

# Guardar estado actual antes de restaurar
$fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
$previoFile = "$backupDir\store_previo_$fecha.json"

if ($useJsonBin) {
    try {
        $actual = Invoke-RestMethod `
            -Uri "https://api.jsonbin.io/v3/b/$binId/latest" `
            -Headers @{ "X-Master-Key" = $masterKey; "X-Bin-Meta" = "false" }
        $actual | ConvertTo-Json -Depth 20 | Out-File -FilePath $previoFile -Encoding utf8
        Write-Host "Estado actual guardado como $previoFile"
    } catch {
        Write-Host "ADVERTENCIA: No se pudo guardar el estado actual: $_"
    }
} elseif (Test-Path $storeFile) {
    Copy-Item -Path $storeFile -Destination $previoFile -Force
    Write-Host "Estado actual guardado como $previoFile"
}

# Restaurar
if ($useJsonBin) {
    Write-Host "Restaurando en JSONBin..."
    try {
        Invoke-RestMethod `
            -Uri "https://api.jsonbin.io/v3/b/$binId" `
            -Method PUT `
            -Headers @{ "X-Master-Key" = $masterKey; "Content-Type" = "application/json" } `
            -Body $backupContent | Out-Null
        Write-Host ""
        Write-Host "Restaurado correctamente en JSONBin desde: $($elegido.Name)"
    } catch {
        Write-Host "ERROR al restaurar en JSONBin: $_"
        exit 1
    }
} else {
    Copy-Item -Path $elegido.FullName -Destination $storeFile -Force
    Write-Host ""
    Write-Host "Restaurado correctamente en archivo local desde: $($elegido.Name)"
}
