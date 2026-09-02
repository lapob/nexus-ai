---
title: Flutter e Dart: sviluppo multipiattaforma
type: programming-guide
area: flutter
status: evergreen
level: intermediate
visibility: public
created: 2026-07-29
updated: 2026-08-08
source_kind: curated
tags: [flutter, dart, mobile, examples]
aliases: [Flutter e Dart]
---

# Flutter e Dart: sviluppo multipiattaforma

## Tooling

```bash
flutter doctor -v
flutter devices
flutter create nexus_mobile
flutter pub get
flutter analyze
flutter test
flutter run
flutter build apk
flutter build appbundle
flutter build ios
```

## Dart essenziale

```dart
sealed class Result<T> {
  const Result();
}
final class Success<T> extends Result<T> {
  final T value;
  const Success(this.value);
}
final class Failure<T> extends Result<T> {
  final Object error;
  const Failure(this.error);
}

Future<Result<String>> loadName() async {
  try {
    final value = await Future<String>.delayed(
      const Duration(milliseconds: 50),
      () => 'Nexus',
    );
    return Success(value);
  } catch (error) {
    return Failure(error);
  }
}
```

Usa null safety, tipi espliciti ai confini, oggetti immutabili e cancellazione/logica di timeout per I/O.

## Widget e stato

```dart
class StatusView extends StatelessWidget {
  final AsyncSnapshot<String> snapshot;
  const StatusView({super.key, required this.snapshot});

  @override
  Widget build(BuildContext context) {
    if (snapshot.hasError) return const Text('Operazione non riuscita');
    if (!snapshot.hasData) return const CircularProgressIndicator();
    return Semantics(
      label: 'Stato assistente',
      child: Text(snapshot.data!, style: Theme.of(context).textTheme.titleLarge),
    );
  }
}
```

Separa dominio, data source e UI. Lo stato deve rappresentare loading, data, empty, error e cancelled. Evita logica di business dentro `build`.

## Persistenza e rete

Valida JSON, imposta timeout, gestisci retry soltanto per errori transitori e non inserire segreti nel bundle. Token e chiavi sensibili usano storage protetto della piattaforma; dati strutturati richiedono migrazioni.

## Performance e test

Usa widget `const`, liste lazy, immagini dimensionate e profiler Flutter. Scrivi unit test del dominio, widget test della UI e integration test dei flussi critici.

## Collegamenti

- [[Indice - Mobile Development]]
- [[03_Sviluppo/APIs/Progettazione API contratti affidabilita e sicurezza|API sicure]]
