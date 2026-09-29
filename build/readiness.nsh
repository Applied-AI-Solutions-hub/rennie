!ifndef BUILD_UNINSTALLER
; One-click, per-user installer: no questions, no administrator prompt.
; Earlier builds asked "Host or Client" and showed a page of technical
; readiness checks (virtualization, WSL, Node, Tailscale). Client pairing is
; not built yet and none of those checks matter for the default setup, so a
; beginner could only get stuck there. Foxsocket now checks the PC itself, in
; plain language, before setup downloads anything (preflight.cjs).
!macro customInstall
  FileOpen $0 "$INSTDIR\resources\installer-role.json" w
  FileWrite $0 '{"role":"host"}'
  FileClose $0
!macroend
!endif
