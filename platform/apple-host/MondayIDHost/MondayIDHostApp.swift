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
            VStack(spacing: 16) {
                Image(systemName: "circle.hexagongrid.fill")
                    .font(.system(size: 44))
                Text("MondayID")
                    .font(.title.bold())
                Text("Apple adapter host is active")
                    .foregroundStyle(.secondary)
                Text("Open · Ask · Continue · Recall · Mode · Digest")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}
