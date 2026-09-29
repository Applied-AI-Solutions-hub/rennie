!include "${BUILD_RESOURCES_DIR}\maker-splash.nsh"
!include "${BUILD_RESOURCES_DIR}\readiness.nsh"
!include "${BUILD_RESOURCES_DIR}\install-identity.nsh"
; Check the signed uninstaller while it still exists, before NSIS embeds it.
; electron-builder deletes this intermediate file after producing the installer.
!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !if "$%FOXSOCKET_UNSIGNED_VALIDATION%" != "1"
      !system 'powershell.exe -NoProfile -NonInteractive -File "${BUILD_RESOURCES_DIR}\verify-signature.ps1" -Path "${UNINSTALLER_OUT_FILE}" -ReportPath "${BUILD_RESOURCES_DIR}\..\release\signatures.jsonl"' = 0
    !endif
  !endif
!macroend
!macro customInit
  !insertmacro AppliedAIMakerSplash
!macroend
; On a real uninstall (never on an upgrade, which also runs the old uninstaller),
; remove the llama.cpp engine: its sign-in task, its running server and its
; downloaded files. Runs before the app files are deleted, while the script is still there.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\engine-cleanup.ps1"'
    Pop $0
  ${endIf}
!macroend
