$ErrorActionPreference='Stop'
$identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$exe=Join-Path $env:LOCALAPPDATA 'AppliedAI\OpenRGB\OpenRGB.exe'
$action=New-ScheduledTaskAction -Execute $exe -Argument '--server --server-host 127.0.0.1 --server-port 6742 --profile "Applied AI - Verified Hardware"'
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $identity
$principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName 'Applied AI Lighting Bridge' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local OpenRGB lighting bridge; no GUI. Used by Applied AI Command Center.' -Force | Out-Null
