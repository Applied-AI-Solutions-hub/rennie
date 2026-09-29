$ErrorActionPreference = 'Stop'
# Stand-ins: copies of ping.exe named llama-server.exe, one inside the engine
# folder and one outside it. A folder link inside the engine folder points at a
# folder that must survive. The sign-in task part runs only in CI, so a local
# run never touches this PC's Task Scheduler.
$root = Join-Path ([IO.Path]::GetTempPath()) ('rennie cleanup ' + [guid]::NewGuid())
$engine = Join-Path $root 'Rennie\engine'
$inside = Join-Path $engine 'llama\prism-test-cpu'
$outside = Join-Path $root 'other llama'
$keep = Join-Path $root 'keep'
New-Item -ItemType Directory -Path $inside, $outside, $keep, (Join-Path $engine 'models') | Out-Null
Set-Content -LiteralPath (Join-Path $engine 'models\model.gguf') -Value 'weights'
Set-Content -LiteralPath (Join-Path $keep 'keep.txt') -Value 'must survive'
New-Item -ItemType Junction -Path (Join-Path $engine 'link') -Target $keep | Out-Null
$ping = Join-Path $env:SystemRoot 'System32\PING.EXE'
Copy-Item -LiteralPath $ping -Destination (Join-Path $inside 'llama-server.exe')
Copy-Item -LiteralPath $ping -Destination (Join-Path $outside 'llama-server.exe')
$ours = Start-Process -FilePath (Join-Path $inside 'llama-server.exe') -ArgumentList '-n', '120', '127.0.0.1' -WindowStyle Hidden -PassThru
$other = Start-Process -FilePath (Join-Path $outside 'llama-server.exe') -ArgumentList '-n', '120', '127.0.0.1' -WindowStyle Hidden -PassThru
$task = 'RennieCleanupTest-' + [guid]::NewGuid()
$ci = $env:CI -eq 'true'
try {
    if ($ci) {
        Register-ScheduledTask -TaskName $task -Action (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c exit') -Trigger (New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)) | Out-Null
    }
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'engine-cleanup.ps1') -EngineRoot $engine -TaskName $task
    if ($LASTEXITCODE -ne 0) { throw "Cleanup exited with $LASTEXITCODE" }
    $ours.Refresh(); $other.Refresh()
    if (-not $ours.HasExited) { throw 'The server running from the engine folder was not stopped' }
    if ($other.HasExited) { throw 'A llama-server outside the engine folder was stopped' }
    if (Test-Path -LiteralPath $engine) { throw 'The engine folder was not removed' }
    if (Test-Path -LiteralPath (Join-Path $root 'Rennie')) { throw 'The empty Rennie folder was not removed' }
    if (-not (Test-Path -LiteralPath (Join-Path $keep 'keep.txt'))) { throw 'Cleanup followed a folder link out of the engine folder' }
    if ($ci -and (Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue)) { throw 'The sign-in task was not removed' }
    # Nothing to clean is not an error.
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'engine-cleanup.ps1') -EngineRoot $engine -TaskName $task
    if ($LASTEXITCODE -ne 0) { throw 'Cleanup failed when there was nothing to clean' }
    Write-Output ('PASS: engine cleanup stops only its own server, removes the engine folder without following links' + $(if ($ci) { ', and removes the sign-in task.' } else { '. Sign-in task part skipped outside CI.' }))
}
finally {
    foreach ($p in @($ours, $other)) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
    if ($ci) { Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 300
    & (Join-Path $env:SystemRoot 'System32\cmd.exe') /d /c rmdir /s /q "$root" 2>$null
}
