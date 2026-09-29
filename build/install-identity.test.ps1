param([Parameter(Mandatory=$true)][string]$MakeNsis)
$ErrorActionPreference='Stop'
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('foxsocket-identity-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testKey='Software\FoxsocketInstallerTest-'+[guid]::NewGuid()
$include=(Join-Path $PSScriptRoot 'install-identity.nsh')
$script=@'
Unicode true
RequestExecutionLevel user
SilentInstall silent
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!define INSTALL_REGISTRY_KEY "@KEY@"
!define UNINSTALL_REGISTRY_KEY "@KEY@\Uninstall"
!include "@INCLUDE@"
OutFile "@ROOT@\test.exe"
Section
  SetRegView 64
  FileOpen $8 "@ROOT@\result.txt" w
  ; Stale path with registration but no executable must not be an upgrade.
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "@ROOT@\missing"
  WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayName "Agent Workspace"
  !insertmacro FoxsocketPruneStaleLocation HKCU
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $1 == ""
    FileWrite $8 "stale-pass$\r$\n"
  ${EndIf}
  ; Existing legacy executable retains its exact directory.
  CreateDirectory "@ROOT@\Agent Workspace"
  FileOpen $9 "@ROOT@\Agent Workspace\Agent Workspace.exe" w
  FileClose $9
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "@ROOT@\Agent Workspace"
  !insertmacro FoxsocketPruneStaleLocation HKCU
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $1 == "@ROOT@\Agent Workspace"
    FileWrite $8 "legacy-pass$\r$\n"
  ${EndIf}
  ; Current installation remains an upgrade, including an existing nested path.
  CreateDirectory "@ROOT@\Agent Workspace\Foxsocket"
  FileOpen $9 "@ROOT@\Agent Workspace\Foxsocket\Foxsocket.exe" w
  FileClose $9
  WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "@ROOT@\Agent Workspace\Foxsocket"
  !insertmacro FoxsocketPruneStaleLocation HKCU
  ReadRegStr $1 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $1 == "@ROOT@\Agent Workspace\Foxsocket"
    FileWrite $8 "current-pass$\r$\n"
  ${EndIf}
  DeleteRegKey HKCU "${INSTALL_REGISTRY_KEY}"
  FileClose $8
SectionEnd
'@
$script=$script.Replace('@KEY@',$testKey).Replace('@INCLUDE@',$include).Replace('@ROOT@',$testRoot)
$source=Join-Path $testRoot 'test.nsi'; [IO.File]::WriteAllText($source,$script)
& $MakeNsis /V2 $source
if($LASTEXITCODE -ne 0){throw 'NSIS identity harness did not compile'}
$process=Start-Process -FilePath (Join-Path $testRoot 'test.exe') -WindowStyle Hidden -Wait -PassThru
if($process.ExitCode -ne 0){throw 'NSIS identity harness failed'}
$result=Get-Content (Join-Path $testRoot 'result.txt')
if(($result -join ',') -ne 'stale-pass,legacy-pass,current-pass'){throw "Unexpected identity result: $result"}
Write-Output 'Installer identity checks passed: stale registration, legacy executable, current nested installation.'
