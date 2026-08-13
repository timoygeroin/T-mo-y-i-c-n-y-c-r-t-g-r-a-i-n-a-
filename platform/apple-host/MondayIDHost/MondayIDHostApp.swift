import AppIntents
import SwiftUI
import MondayIDAppleAdapter

struct MondayIDHostShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenMondayIntent(),
            phrases: ["Open \(.applicationName)"],
            shortTitle: "Open MondayID",
            systemImageName: "circle.hexagongrid"
        )
        AppShortcut(
            intent: AskMondayIntent(),
            phrases: ["Ask \(.applicationName)"],
            shortTitle: "Ask MondayID",
            systemImageName: "message"
        )
        AppShortcut(
            intent: ContinueMondayIntent(),
            phrases: ["Continue \(.applicationName)"],
            shortTitle: "Continue MondayID",
            systemImageName: "arrow.forward.circle"
        )
        AppShortcut(
            intent: RecallCapsuleIntent(),
            phrases: ["Recall a capsule in \(.applicationName)"],
            shortTitle: "Recall Capsule",
            systemImageName: "archivebox"
        )
        AppShortcut(
            intent: ActivateModeIntent(),
            phrases: ["Activate a mode in \(.applicationName)"],
            shortTitle: "Activate Mode",
            systemImageName: "switch.2"
        )
        AppShortcut(
            intent: RunFieldDigestIntent(),
            phrases: ["Run field digest in \(.applicationName)"],
            shortTitle: "Field Digest",
            systemImageName: "waveform.path.ecg"
        )
    }
}

@main
struct MondayIDHostApp: App {
    init() {
        MondayIDHostShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            MondayIDRuntimeView()
        }
    }
}

private struct MondayIDRuntimeView: View {
    @State private var endpoint = ""
    @State private var token = ""
    @State private var signal = ""
    @State private var result = "Connect the runtime, then speak or type one real task."
    @State private var working = false

    var body: some View {
        NavigationStack {
            Form {
                Section("MondayID") {
                    Label("Canonical runtime", systemImage: "circle.hexagongrid.fill")
                    Text(result).textSelection(.enabled)
                }
                Section("Connect once") {
                    TextField("https://runtime.example", text: $endpoint)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Control token", text: $token)
                    Button("Save connection") { saveConnection() }
                        .disabled(URL(string: endpoint) == nil || token.isEmpty)
                }
                Section("Live signal") {
                    TextField("Monday, now do this…", text: $signal, axis: .vertical)
                    Button(working ? "Working…" : "Send to MondayID") { Task { await submit() } }
                        .disabled(working || signal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("MondayID")
        }
    }

    private func saveConnection() {
        guard let url = URL(string: endpoint) else { return }
        do {
            try MondayIDRuntimeSettings.save(endpoint: url, controlToken: token)
            token = ""
            result = "Runtime connection saved securely on this iPhone."
        } catch { result = "Connection could not be saved: \(error.localizedDescription)" }
    }

    @MainActor private func submit() async {
        working = true
        defer { working = false }
        do {
            let receipt = try await sendToMondayID(signal)
            result = receipt.result ?? "State advanced to revision \(receipt.stateRevision)."
            signal = ""
        } catch { result = "Runtime unavailable: \(error.localizedDescription)" }
    }
}
