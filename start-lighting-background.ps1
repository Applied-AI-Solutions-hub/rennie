$ErrorActionPreference='Stop'
Get-Process OpenRGB -ErrorAction SilentlyContinue | Stop-Process -Force
$runtime=Join-Path $env:LOCALAPPDATA 'AppliedAI\OpenRGB\OpenRGB.exe'
Start-Process -FilePath $runtime -ArgumentList '--server --server-host 127.0.0.1 --server-port 6742' -WindowStyle Hidden
