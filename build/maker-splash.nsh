!ifndef APPLIED_AI_MAKER_SPLASH_INCLUDED
!define APPLIED_AI_MAKER_SPLASH_INCLUDED
; Shared maker identity for interactive Applied AI Solutions Windows installers.
; AdvSplash is supplied by the existing NSIS toolchain, not downloaded separately.
!macro AppliedAIMakerSplash
  IfSilent applied_ai_splash_done
  Push $0
  InitPluginsDir
  File /oname=$PLUGINSDIR\applied-ai-maker.bmp "${BUILD_RESOURCES_DIR}\applied-ai-maker.bmp"
  ; 900ms hold, 450ms fade in, 450ms fade out. Click dismisses early.
  advsplash::show 900 450 450 -1 "$PLUGINSDIR\applied-ai-maker"
  Pop $0
  Pop $0
  applied_ai_splash_done:
!macroend
!endif
