; Páginas do instalador do CarvCAM, no mesmo formato do gSender 1.6.4 (electron-build/installer.nsh,
; GPL-3.0, Sienci Labs): licença, pasta, instalação e uma página final com "Criar atalho na área de
; trabalho" e "Abrir o CarvCAM". O atalho no Menu Iniciar é sempre criado (electron-builder).
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

; Caixa da página final usada como "Criar atalho na área de trabalho" (marcada)
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Create Desktop Shortcut"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION createDS

; O instalador roda como administrador (perMachine). Abrir o exe direto faria o CarvCAM herdar
; esse acesso; pelo explorer.exe ele abre como o usuário normal (igual ao gSender).
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunAsUser
!define MUI_FINISHPAGE_RUN_TEXT "Run CarvCAM"

Function RunAsUser
    Exec '"$WINDIR\explorer.exe" "$INSTDIR\${PRODUCT_NAME}.exe"'
FunctionEnd

!insertmacro MUI_PAGE_FINISH

; Corta as páginas padrão do electron-builder que viriam depois
Page Custom MyCustomPage
