import AppIntents
import SwiftUI
import MondayIDAppleAdapter

struct MondayIDHostShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: OpenMondayIntent(), phrases: ["Open \(.applicationName)"], shortTitle: "Open MondayID", systemImageName: "circle.hexagongrid")
        AppShortcut(intent: AskMondayIntent(), phrases: ["Ask \(.applicationName)"], shortTitle: "Ask MondayID", systemImageName: "message")
        AppShortcut(intent: ContinueMondayIntent(), phrases: ["Continue \(.applicationName)"], shortTitle: "Continue MondayID", systemImageName: "arrow.forward.circle")
        AppShortcut(intent: RecallCapsuleIntent(), phrases: ["Recall a capsule in \(.applicationName)"], shortTitle: "Recall Capsule", systemImageName: "archivebox")
        AppShortcut(intent: ActivateModeIntent(), phrases: ["Activate a mode in \(.applicationName)"], shortTitle: "Activate Mode", systemImageName: "switch.2")
        AppShortcut(intent: RunFieldDigestIntent(), phrases: ["Run field digest in \(.applicationName)"], shortTitle: "Field Digest", systemImageName: "waveform.path.ecg")
    }
}

@main
struct MondayIDHostApp: App {
    init() { MondayIDHostShortcuts.updateAppShortcutParameters() }
    var body: some Scene { WindowGroup { MondayRootView() } }
}

private enum MondayTab: Hashable { case home, chats, create, spaces, you }

private struct MondayRootView: View {
    @State private var selection: MondayTab = .home
    @State private var showingSearch = false
    @State private var showingActivity = false

    var body: some View {
        TabView(selection: $selection) {
            MondayHomeView().tag(MondayTab.home).tabItem { Label("Home", systemImage: "house") }
            MondayChatsView().tag(MondayTab.chats).tabItem { Label("Chats", systemImage: "message") }
            MondayCreateView().tag(MondayTab.create).tabItem { Label("Create", systemImage: "plus.circle") }
            MondaySpacesView().tag(MondayTab.spaces).tabItem { Label("Spaces", systemImage: "square.grid.2x2") }
            MondayYouView().tag(MondayTab.you).tabItem { Label("You", systemImage: "person.crop.circle") }
        }
        .safeAreaInset(edge: .top) {
            HStack(spacing: 12) {
                Button { showingSearch = true } label: { Label("Search", systemImage: "magnifyingglass").labelStyle(.iconOnly) }
                Spacer()
                Text("MONDAY").font(.headline).accessibilityAddTraits(.isHeader)
                Spacer()
                Button { showingActivity = true } label: { Label("Activity", systemImage: "waveform.path.ecg").labelStyle(.iconOnly) }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
            .background(.bar)
        }
        .sheet(isPresented: $showingSearch) { MondaySearchView() }
        .sheet(isPresented: $showingActivity) { MondayActivityView() }
    }
}

private struct MondayHomeView: View {
    var body: some View {
        NavigationStack {
            List {
                Section("Continue") { Text("Nothing active yet.").foregroundStyle(.secondary) }
                Section("Today") { Text("Nothing needs you.").foregroundStyle(.secondary) }
                Section("Recent") { Text("Recent objects will appear here after use.").foregroundStyle(.secondary) }
                Section("Pinned") { Text("Pin chats, spaces, files or tasks to keep them here.").foregroundStyle(.secondary) }
            }
            .navigationTitle("Home")
        }
    }
}

private struct MondayChatsView: View {
    @State private var signal = ""
    @State private var result = ""
    @State private var working = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if result.isEmpty {
                    ContentUnavailableView("No conversation yet", systemImage: "message", description: Text("Start with the composer below."))
                        .frame(maxHeight: .infinity)
                } else {
                    ScrollView { Text(result).frame(maxWidth: .infinity, alignment: .leading).padding() }
                }
                Divider()
                HStack(alignment: .bottom) {
                    TextField("Message Monday", text: $signal, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    Button { Task { await submit() } } label: { Image(systemName: working ? "hourglass" : "arrow.up.circle.fill").font(.title2) }
                        .disabled(working || signal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                .padding()
            }
            .navigationTitle("Chats")
        }
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

private struct MondayCreateView: View {
    private let groups: [(String, [(String, String)])] = [
        ("Conversation", [("Chat", "message"), ("Voice", "waveform")]),
        ("Capture", [("Camera", "camera"), ("Scan", "doc.viewfinder"), ("Audio", "mic")]),
        ("Media", [("Image", "photo"), ("Video", "video")]),
        ("Knowledge", [("Document", "doc"), ("Research", "magnifyingglass")]),
        ("Persistent", [("Space", "square.grid.2x2"), ("Reminder", "bell"), ("Automation", "clock.arrow.circlepath")])
    ]
    var body: some View {
        NavigationStack {
            List {
                ForEach(groups, id: \.0) { group in
                    Section(group.0) {
                        ForEach(group.1, id: \.0) { item in
                            Label(item.0, systemImage: item.1).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("Create")
            .overlay(alignment: .bottom) { Text("Unavailable creation modes stay visible instead of pretending to run.").font(.caption).foregroundStyle(.secondary).padding() }
        }
    }
}

private struct MondaySpacesView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView("No Spaces yet", systemImage: "square.grid.2x2", description: Text("Persistent project, person, topic and trip contexts will live here."))
                .navigationTitle("Spaces")
        }
    }
}

private struct MondayYouView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Library") { MondayLibraryView() }
                    NavigationLink("Connections") { MondayRuntimeConnectionView() }
                }
                Section("Monday & Me") {
                    Label("Personality", systemImage: "slider.horizontal.3")
                    Label("Memory", systemImage: "brain")
                    Label("Voice", systemImage: "waveform")
                    Label("Appearance", systemImage: "circle.lefthalf.filled")
                    Label("Privacy", systemImage: "lock")
                }
            }
            .navigationTitle("You")
        }
    }
}

private struct MondaySearchView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    var body: some View {
        NavigationStack {
            ContentUnavailableView(query.isEmpty ? "Search Monday" : "No indexed result", systemImage: "magnifyingglass", description: Text(query.isEmpty ? "Search will span chats, files, spaces, decisions and changes." : "No local result is available for this query yet."))
                .searchable(text: $query)
                .navigationTitle("Search")
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct MondayActivityView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                Section("Running") { Text("No executor is active.").foregroundStyle(.secondary) }
                Section("Waiting") { Text("No persistent task is waiting.").foregroundStyle(.secondary) }
                Section("Needs you") { Text("No human gate is open.").foregroundStyle(.secondary) }
            }
            .navigationTitle("Activity")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct MondayLibraryView: View {
    var body: some View {
        List {
            Section("Files") { Text("No local library objects yet.").foregroundStyle(.secondary) }
            Section("Views") {
                Label("Images", systemImage: "photo")
                Label("Documents", systemImage: "doc")
                Label("Code", systemImage: "chevron.left.forwardslash.chevron.right")
                Label("Generated", systemImage: "wand.and.stars")
            }
        }
        .navigationTitle("Library")
    }
}

private struct MondayRuntimeConnectionView: View {
    @State private var endpoint = ""
    @State private var token = ""
    @State private var result = "Connect only to a runtime that proves durable MondayID health."
    @State private var working = false

    var body: some View {
        Form {
            Section("Runtime") { Text(result).textSelection(.enabled) }
            Section("Connection") {
                TextField("https://runtime.example", text: $endpoint).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Control token", text: $token)
                Button(working ? "Checking runtime…" : "Verify & save connection") { Task { await verifyAndSaveConnection() } }
                    .disabled(working || URL(string: endpoint) == nil || token.isEmpty)
            }
        }
        .navigationTitle("Connections")
    }

    @MainActor private func verifyAndSaveConnection() async {
        guard let url = URL(string: endpoint) else { return }
        working = true
        defer { working = false }
        do {
            let candidate = MondayIDRuntimeClient(endpoint: url, controlToken: token)
            let health = try await candidate.health()
            guard health.isReady else { throw MondayIDRuntimeError.unhealthyRuntime }
            try MondayIDRuntimeSettings.save(endpoint: url, controlToken: token)
            token = ""
            result = "Verified durable MondayID runtime and saved this connection securely on this iPhone."
        } catch { result = "Connection not saved: \(error.localizedDescription)" }
    }
}
