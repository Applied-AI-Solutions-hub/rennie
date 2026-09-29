param(
  [string]$InstallDirectory = (Join-Path $env:LOCALAPPDATA 'Programs\Applied AI Command Center'),
  [string]$ExecutableName = 'Applied AI Command Center.exe',
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
function Get-LocalFileHash([string]$LiteralPath, [string]$Algorithm = 'SHA256') {
  $stream = [IO.File]::OpenRead($LiteralPath)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return [pscustomobject]@{Hash=([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','')} }
  finally { $hasher.Dispose(); $stream.Dispose() }
}
$projectDirectory = Split-Path $PSScriptRoot
if (-not $SkipBuild) {
  Push-Location $projectDirectory
  try { & pnpm package; if ($LASTEXITCODE -ne 0) { throw 'Packaging failed; installed app was not touched.' } }
  finally { Pop-Location }
}
$sourceDirectory = (Resolve-Path -LiteralPath (Join-Path $projectDirectory 'release\win-unpacked')).Path
$targetDirectory = (Resolve-Path -LiteralPath $InstallDirectory).Path
$targetExecutable = Join-Path $targetDirectory $ExecutableName
if ((Split-Path $ExecutableName -Leaf) -ne $ExecutableName) { throw 'ExecutableName must be a filename.' }
if (-not (Test-Path -LiteralPath $targetExecutable -PathType Leaf)) { throw 'Existing app executable not found.' }
if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory 'resources\app.asar'))) { throw 'Packaged application missing.' }
if ($sourceDirectory -eq $targetDirectory) { throw 'Build and installation must be separate.' }
$sourceExecutables = @(Get-ChildItem -LiteralPath $sourceDirectory -File -Filter '*.exe')
if ($sourceExecutables.Count -ne 1) { throw 'Expected exactly one packaged app executable.' }
foreach ($root in @($sourceDirectory,$targetDirectory)) {
  if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked installation roots are not supported.' }
  if (Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Linked installation files are not supported.' }
}
$changes = @()
foreach ($file in Get-ChildItem -LiteralPath $sourceDirectory -Recurse -File) {
  $relative = $file.FullName.Substring($sourceDirectory.Length + 1)
  # Installer role selection belongs to a fresh installer run, never a local update.
  if ($relative -eq 'resources\installer-role.json') { continue }
  if ($relative -eq $sourceExecutables[0].Name) { $relative = $ExecutableName }
  $destination = [IO.Path]::GetFullPath((Join-Path $targetDirectory $relative))
  if (-not $destination.StartsWith($targetDirectory + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Destination escaped installation.' }
  $sourceHash = (Get-LocalFileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  $exists = Test-Path -LiteralPath $destination -PathType Leaf
  if ($exists -and (Get-LocalFileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $sourceHash) { continue }
  $changes += [pscustomobject]@{Relative=$relative;Source=$file.FullName;Destination=$destination;Existed=$exists;Hash=$sourceHash}
}
if (-not $changes.Count) { Write-Output 'Installed app already matches this build.'; exit 0 }
$profileFile = Join-Path $env:APPDATA 'applied-ai-command-center\state.json'
if (Test-Path -LiteralPath $profileFile) {
  $profile = Get-Content -LiteralPath $profileFile -Raw | ConvertFrom-Json
  if ($profile.chat.Count -gt 0 -and $profile.chat[-1].role -eq 'user') { throw 'An unfinished reply is recorded. Finish or resolve it before updating.' }
}
$backupDirectory = Join-Path $env:LOCALAPPDATA ('AppliedAISolutions\local-updates\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
foreach ($change in $changes) {
  if ($change.Existed) {
    $backupFile = Join-Path $backupDirectory $change.Relative
    New-Item -ItemType Directory -Path (Split-Path $backupFile) -Force | Out-Null
    Copy-Item -LiteralPath $change.Destination -Destination $backupFile
  }
}
if (Test-Path -LiteralPath $profileFile) { Copy-Item -LiteralPath $profileFile -Destination (Join-Path $backupDirectory 'workspace-state-backup.json') }
$changes | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupDirectory 'manifest.json') -Encoding UTF8
# Only stop this installed app; the WSL Host and lighting service are independent.
Get-Process | Where-Object { $_.Path -eq $targetExecutable } | Stop-Process
try {
  foreach ($change in $changes) {
    New-Item -ItemType Directory -Path (Split-Path $change.Destination) -Force | Out-Null
    Copy-Item -LiteralPath $change.Source -Destination $change.Destination -Force
    if ((Get-LocalFileHash -LiteralPath $change.Destination -Algorithm SHA256).Hash -ne $change.Hash) { throw ('Verification failed: ' + $change.Relative) }
  }
} catch {
  foreach ($change in $changes) {
    if ($change.Existed) { Copy-Item -LiteralPath (Join-Path $backupDirectory $change.Relative) -Destination $change.Destination -Force }
    elseif (Test-Path -LiteralPath $change.Destination -PathType Leaf) { Remove-Item -LiteralPath $change.Destination }
  }
  Start-Process -FilePath $targetExecutable -WindowStyle Normal
  throw
}
Set-Content -LiteralPath (Join-Path (Split-Path $backupDirectory) 'latest-backup.txt') -Value $backupDirectory
Start-Process -FilePath $targetExecutable -WindowStyle Normal
Write-Output ('Updated and reopened installed app. Verified files: ' + $changes.Count)
Write-Output ('Rollback backup: ' + $backupDirectory)
