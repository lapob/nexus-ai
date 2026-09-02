# NexusNXS Instant for Android

Lightweight public companion for the NexusNXS server. It is a native Android
client, not a WebView and not a local model runtime.

The initial surface contains only the NexusNXS Core:

- tap the Core or microphone to speak;
- tap the keyboard button to type;
- receive the streamed answer on the same surface;
- voice-originated turns are read aloud automatically;
- offline state is explicit and queued text is delivered after reconnection.

Menus, visible history, model administration, projects and settings are not
part of the active mobile experience. Conversation memory remains encrypted on
the device and is supplied invisibly as continuity context.

## Build

From `.AI`:

```powershell
npm run android:remote
```

The Preview APK is written to `release-android/NexusNXS-Android.apk`. Public
distribution requires the production signing environment and
`npm run android:remote:public`.
