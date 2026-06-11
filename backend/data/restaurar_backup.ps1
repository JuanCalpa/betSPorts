$storeFile = "$PSScriptRoot\store.json"
$backupDir = "$PSScriptRoot\backups"

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

# Guardar el store actual como store_actual_antes_de_restaurar.json por si acaso
$fecha = Get-Date -Format "yyyy-MM-dd_HHmm"
Copy-Item -Path $storeFile -Destination "$backupDir\store_previo_$fecha.json" -Force
Write-Host "Store actual guardado como store_previo_$fecha.json"

# Restaurar
Copy-Item -Path $elegido.FullName -Destination $storeFile -Force
Write-Host ""
Write-Host "Restaurado correctamente desde: $($elegido.Name)"
