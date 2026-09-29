; A registry path alone is not evidence of an existing installation.
; Only remove stale registration for this app identity; never remove user data.
!macro FoxsocketPruneStaleLocation root
  ReadRegStr $0 ${root} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $0 != ""
    ${IfNot} ${FileExists} "$0\Foxsocket.exe"
    ${AndIfNot} ${FileExists} "$0\Agent Workspace.exe"
    ${AndIfNot} ${FileExists} "$0\Applied AI Command Center.exe"
      DeleteRegValue ${root} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
      DeleteRegKey /ifempty ${root} "${INSTALL_REGISTRY_KEY}"
      DeleteRegKey ${root} "${UNINSTALL_REGISTRY_KEY}"
    ${EndIf}
  ${EndIf}
!macroend

!macro preInit
  !ifndef BUILD_UNINSTALLER
    SetRegView 64
    !insertmacro FoxsocketPruneStaleLocation HKCU
    !insertmacro FoxsocketPruneStaleLocation HKLM
    SetRegView 32
    !insertmacro FoxsocketPruneStaleLocation HKCU
    !insertmacro FoxsocketPruneStaleLocation HKLM
  !endif
!macroend
