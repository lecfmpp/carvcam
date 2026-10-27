; CarvCAM installer pages: license, folder, install and a finish page with "Create Desktop Shortcut"
; and "Run CarvCAM". The Start Menu shortcut is always created (electron-builder).
!include "MUI2.nsh"

Function createDS
    CreateShortcut "$desktop\${PRODUCT_NAME}.lnk" "$instdir\${PRODUCT_NAME}.exe"
FunctionEnd

Function MyCustomPage
  Quit
FunctionEnd

!insertmacro MUI_PAGE_LICENSE "${PROJECT_DIR}\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish-page checkbox used as "Create Desktop Shortcut" (checked)
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Create Desktop Shortcut"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION createDS

; The installer runs as administrator (perMachine). Launching the exe directly would make CarvCAM
; inherit that access; through explorer.exe it runs as the normal user (same as gSender).
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunAsUser
!define MUI_FINISHPAGE_RUN_TEXT "Run CarvCAM"

Function RunAsUser
    Exec '"$WINDIR\explorer.exe" "$INSTDIR\${PRODUCT_NAME}.exe"'
FunctionEnd

!insertmacro MUI_PAGE_FINISH

; Skips the default electron-builder pages that would come after
Page Custom MyCustomPage
