import SwiftUI
import MondayIDAppleAdapter

@main
struct MondayIDHostApp: App {
    init() {
        MondayIDShortcuts.updateAppShortcutParameters()
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
