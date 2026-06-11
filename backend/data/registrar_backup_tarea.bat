@echo off
powershell -NonInteractive -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NonInteractive -ExecutionPolicy Bypass -File ""C:\Users\Proyectos TI\Documents\betSPorts\backend\data\backup.ps1""'; $trigger = New-ScheduledTaskTrigger -Daily -At '23:00'; $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable; Register-ScheduledTask -TaskName 'BetSports-DailyBackup' -Action $action -Trigger $trigger -Settings $settings -Description 'Backup diario de store.json para BetSports' -RunLevel Highest -Force; Write-Host 'Tarea registrada correctamente.'"
pause
