!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var NexusDesktopShortcutCheckbox
Var NexusDesktopShortcutState
Var NexusOllamaCheckbox
Var NexusOllamaState

!macro customPageAfterChangeDir
  Page custom NexusShortcutPageCreate NexusShortcutPageLeave
!macroend

Function NexusShortcutPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 6u 100% 12u "Componenti locali"
  Pop $0
  ${NSD_CreateLabel} 0 25u 100% 22u "NEXUS usa un motore Ollama privato per elaborare richieste e modelli sul computer."
  Pop $0
  ${NSD_CreateCheckbox} 0 54u 100% 16u "Includi il motore AI locale"
  Pop $NexusOllamaCheckbox
  ${NSD_Check} $NexusOllamaCheckbox

  ${NSD_CreateLabel} 0 76u 100% 18u "Senza questa opzione servirà un motore compatibile configurato separatamente."
  Pop $0
  ${NSD_CreateCheckbox} 0 106u 100% 16u "Aggiungi NEXUS al desktop"
  Pop $NexusDesktopShortcutCheckbox
  ${NSD_Check} $NexusDesktopShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function NexusShortcutPageLeave
  ${NSD_GetState} $NexusOllamaCheckbox $NexusOllamaState
  ${NSD_GetState} $NexusDesktopShortcutCheckbox $NexusDesktopShortcutState
  ${If} $NexusOllamaState != ${BST_CHECKED}
    MessageBox MB_ICONEXCLAMATION|MB_YESNO|MB_DEFBUTTON2 "Senza Ollama NEXUS non può generare risposte né installare i modelli AI.$\r$\n$\r$\nVuoi continuare comunque?" IDYES NexusOllamaWarningAccepted
    Abort
    NexusOllamaWarningAccepted:
  ${EndIf}
FunctionEnd

!macro customInstall
  ${If} $NexusOllamaState != ${BST_CHECKED}
    RMDir /r "$INSTDIR\resources\ollama"
  ${EndIf}
  ${If} $NexusDesktopShortcutState == ${BST_CHECKED}
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${EndIf}
!macroend

!endif
