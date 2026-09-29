param([Parameter(Mandatory=$true)][string]$Distro,[Parameter(Mandatory=$true)][string]$TaskName,[switch]$Inspect)
$ErrorActionPreference='Stop'
if($TaskName -notmatch '^Agent Workspace Host [0-9a-f]{10}$'){throw 'Invalid task identity'}
if($Distro -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$'){throw 'Unsupported distro name'}
$taskExe="$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
# Keep the action self-contained: no installer folder, app window, or helper file is required.
# WSL --exec preserves arguments without an additional default-shell expansion.
$taskCommand='while($true){ & '''+$env:SystemRoot+'\System32\wsl.exe'' -d '''+$Distro+''' --exec sh -c ''systemctl --user start openclaw-gateway.service && exec sleep infinity'' 2>$null | Out-Null; Start-Sleep -Seconds 20 }'
$taskArgs='-NoProfile -NonInteractive -WindowStyle Hidden -Command "'+$taskCommand+'"'
if($Inspect){
 $task=Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
 if($task -and $task.State -eq 'Running' -and $task.Actions.Count -eq 1 -and $task.Actions[0].Execute -eq $taskExe -and $task.Actions[0].Arguments -eq $taskArgs){Write-Output 'registered'}else{Write-Output 'missing'}
 exit
}
$user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
$action=New-ScheduledTaskAction -Execute $taskExe -Argument $taskArgs
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $user
$principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Keeps the selected Linux Host available after the workspace app closes. Linux systemd supervises OpenClaw. Starts after Windows sign-in.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output 'registered'
