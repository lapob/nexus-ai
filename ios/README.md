# NexusNXS iOS — base di sviluppo

Prima base SwiftUI per iPhone e iPad, iOS 17+. Non ancora compilata o provata
su hardware Apple; nessuna release TestFlight/App Store prodotta.

La conversazione riusa la web app pubblica in WKWebView, compreso il Core.
La navigazione delle impostazioni usa NavigationStack e Form nativi, ritorno
interattivo di sistema, simboli SF Symbols e localizzazione italiana/inglese.
Non replica il backend, non distribuisce knowledge privata e non aggiunge un
bridge JavaScript privilegiato. Solo l'origine HTTPS ai.nexusnxs.com resta
nella WebView; i link HTTPS esterni selezionati dall'utente aprono il browser.
Microfono e camera richiedono i permessi di iOS e del sito.

## Compilazione su Mac

Richiede Xcode con SDK iOS 17+ e XcodeGen. Nessuna dipendenza Swift esterna.
Da questa directory:

```sh
xcodegen generate --spec project.yml
xcodebuild -project NexusNXS.xcodeproj -scheme NexusNXS \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

Per installare su iPhone scegliere il proprio Development Team in Xcode.
Non inserire certificati, provisioning profile o credenziali nel repository.

## Prima di distribuirla

- Compilare su Mac e provare iPhone/iPad, rotazione, tastiera, Dynamic Type,
  VoiceOver, movimento ridotto e gesture indietro nelle impostazioni.
- Collaudare voce reale, interruzione, allegati, download immagini, ritorno
  dal background e persistenza della cronologia in WKWebView.
- Integrare l'intestazione web con la barra nativa senza duplicare comandi;
  verificare font e safe area con screenshot del dispositivo.
- Completare icone di distribuzione, privacy manifest in base alle API
  effettivamente usate, firma e requisiti App Store. Non dichiarare parità
  con Android, assistente di sistema o inferenza offline in questa fase.

Riferimenti: [NavigationStack](https://developer.apple.com/documentation/swiftui/navigationstack),
[XcodeGen](https://github.com/yonaskolb/XcodeGen/blob/master/Docs/ProjectSpec.md).
