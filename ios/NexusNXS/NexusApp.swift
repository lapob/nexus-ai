import SwiftUI

@main
struct NexusApp: App {
    var body: some Scene {
        WindowGroup { NexusRootView().preferredColorScheme(.dark) }
    }
}

struct NexusRootView: View {
    @State private var reloadID = UUID()
    @State private var unavailable = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 0.02, green: 0.045, blue: 0.055).ignoresSafeArea()
                NexusWebView(reloadID: reloadID, unavailable: $unavailable)
                if unavailable {
                    VStack(spacing: 20) {
                        Image(systemName: "sparkles").font(.largeTitle).foregroundStyle(.cyan)
                        Text("connection.unavailable").font(.headline)
                        Text("connection.detail").foregroundStyle(.secondary).multilineTextAlignment(.center)
                        Button("connection.retry", systemImage: "arrow.clockwise") {
                            unavailable = false
                            reloadID = UUID()
                        }.buttonStyle(.borderedProminent).tint(.cyan)
                    }
                    .padding(32)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(red: 0.02, green: 0.045, blue: 0.055))
                    .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: unavailable)
            .navigationTitle("NexusNXS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        NexusSettingsView()
                    } label: {
                        Image(systemName: "gearshape").accessibilityLabel(Text("settings.title"))
                    }
                }
            }
            .tint(.cyan)
        }
    }
}

struct NexusSettingsView: View {
    var body: some View {
        Form {
            Section("settings.device") {
                Button {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    UIApplication.shared.open(url)
                } label: { Label("settings.permissions", systemImage: "hand.raised") }
                Text("settings.device.detail").font(.footnote).foregroundStyle(.secondary)
            }
            Section("settings.service") {
                Link(destination: URL(string: "https://nexusnxs.com/status")!) {
                    Label("settings.status", systemImage: "waveform.path.ecg")
                }
                Text("settings.service.detail").font(.footnote).foregroundStyle(.secondary)
            }
            Section("settings.privacy") {
                Link(destination: URL(string: "https://nexusnxs.com/privacy")!) {
                    Label("settings.privacy", systemImage: "lock.shield")
                }
                Link(destination: URL(string: "https://nexusnxs.com/terms")!) {
                    Label("settings.terms", systemImage: "doc.text")
                }
            }
            Section("settings.about") {
                LabeledContent("settings.version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—")
                Text("settings.preview").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("settings.title")
        .navigationBarTitleDisplayMode(.inline)
    }
}
