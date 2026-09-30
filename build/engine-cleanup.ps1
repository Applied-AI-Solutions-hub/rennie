# Removes what Rennie's llama.cpp engine added for this Windows account: the
# sign-in task, any llama-server running from Rennie's engine folder, and that
# folder with its downloaded model. The uninstaller runs this on a real
# uninstall, never on an upgrade. OpenClaw is a separate program and is left
# as it is. Every step is best effort: an uninstall must never stop halfway.
param(
    [string]$EngineRoot = (Join-Path $env:LOCALAPPDATA 'Rennie\engine'),
    [string]$TaskName = 'Rennie model server'
)
$ErrorActionPreference = 'Continue'

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Only copies started from Rennie's own folder; any other llama-server on this PC is left running.
$llama = [IO.Path]::GetFullPath((Join-Path $EngineRoot 'llama')).TrimEnd('\') + '\'
$running = @(Get-CimInstance Win32_Process -Filter "Name='llama-server.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($llama, [StringComparison]::OrdinalIgnoreCase) })
foreach ($process in $running) { Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($process in $running) { Wait-Process -Id $process.ProcessId -Timeout 15 -ErrorAction SilentlyContinue }

# rmdir removes a folder link itself and never follows it into another folder. A program that is still
# closing can hold the folder for a moment, so the removal is tried again for up to ten seconds.
for ($try = 0; $try -lt 10 -and (Test-Path -LiteralPath $EngineRoot); $try++) {
    if ($try) { Start-Sleep -Seconds 1 }
    & (Join-Path $env:SystemRoot 'System32\cmd.exe') /d /c rmdir /s /q "$EngineRoot" 2>$null
}
$parent = Split-Path -Parent $EngineRoot
if ((Test-Path -LiteralPath $parent) -and -not (Get-ChildItem -LiteralPath $parent -Force | Select-Object -First 1)) {
    Remove-Item -LiteralPath $parent -Force -ErrorAction SilentlyContinue
}
