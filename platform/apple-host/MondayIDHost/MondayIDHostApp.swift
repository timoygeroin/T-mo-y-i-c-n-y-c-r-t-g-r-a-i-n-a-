import AppIntents
import Foundation
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

private struct MondaySpace: Codable, Identifiable, Hashable {
    let id: UUID
    var name: String
    var createdAt: Date
}

private struct MondayDocument: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var body: String
    var createdAt: Date
}

private struct MondayActivity: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var detail: String
    var createdAt: Date
}

@MainActor
private final class MondayLocalStore: ObservableObject {
    @Published var spaces: [MondaySpace] { didSet { persist() } }
    @Published var documents: [MondayDocument] { didSet { persist() } }
    @Published var activity: [MondayActivity] { didSet { persist() } }

    private static let key = "monday.consumer.local-store.v1"
    private struct Snapshot: Codable {
        var spaces: [MondaySpace]
        var documents: [MondayDocument]
        var activity: [MondayActivity]
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) {
            spaces = snapshot.spaces
            documents = snapshot.documents
            activity = snapshot.activity
        } else {
            spaces = []
            documents = []
            activity = []
        }
    }

    func addSpace(name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        spaces.insert(MondaySpace(id: UUID(), name: clean, createdAt: Date()), at: 0)
        addActivity(title: "Space created", detail: clean)
    }

    func addDocument(title: String, body: String) {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty || !cleanBody.isEmpty else { return }
        documents.insert(MondayDocument(id: UUID(), title: cleanTitle.isEmpty ? "Untitled" : cleanTitle, body: cleanBody, createdAt: Date()), at: 0)
        addActivity(title: "Document saved", detail: cleanTitle.isEmpty ? "Untitled" : cleanTitle)
    }

    func deleteSpaces(at offsets: IndexSet) { spaces.remove(atOffsets: offsets) }
    func deleteDocuments(at offsets: IndexSet) { documents.remove(atOffsets: offsets) }

    func addActivity(title: String, detail: String) {
        activity.insert(MondayActivity(id: UUID(), title: title, detail: detail, createdAt: Date()), at: 0)
        if activity.count > 100 { activity = Array(activity.prefix(100)) }
    }

    func search(_ query: String) -> [(String, String)] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        var rows: [(String, String)] = []
        rows += spaces.filter { $0.name.lowercased().contains(q) }.map { ("Space", $0.name) }
        rows += documents.filter { $0.title.lowercased().contains(q) || $0.body.lowercased().contains(q) }.map { ("Document", $0.title) }
        return rows
    }

    private func persist() {
        let snapshot = Snapshot(spaces: spaces, documents: documents, activity: activity)
        if let data = try? JSONEncoder().encode(snapshot) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }
}

private enum MondayTab: Hashable { case home, chats, create, spaces, you }

private struct MondayRootView: View {
    @StateObject private var store = MondayLocalStore()
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
        .environmentObject(store)
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
        .sheet(isPresented: $showingSearch) { MondaySearchView().environmentObject(store) }
        .sheet(isPresented: $showingActivity) { MondayActivityView().environmentObject(store) }
    }
}

private struct MondayHomeView: View {
    @EnvironmentObject private var store: MondayLocalStore
    var body: some View {
        NavigationStack {
            List {
                Section("Continue") {
                    if let first = store.spaces.first { Label(first.name, systemImage: "square.grid.2x2") }
                    else { Text("Nothing active yet.").foregroundStyle(.secondary) }
                }
                Section("Today") { Text("Nothing needs you.").foregroundStyle(.secondary) }
                Section("Recent") {
                    if store.documents.isEmpty && store.spaces.isEmpty {
                        Text("Create a Space or document to start your local continuity.").foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(store.documents.prefix(3))) { item in Label(item.title, systemImage: "doc.text") }
                        ForEach(Array(store.spaces.prefix(3))) { item in Label(item.name, systemImage: "square.grid.2x2") }
                    }
                }
                Section("Pinned") { Text("Pinning is not implemented yet.").foregroundStyle(.secondary) }
            }
            .navigationTitle("Home")
        }
    }
}

private struct MondayChatsView: View {
    @EnvironmentObject private var store: MondayLocalStore
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
        let submitted = signal.trimmingCharacters(in: .whitespacesAndNewlines)
        working = true
        defer { working = false }
        do {
            let receipt = try await sendToMondayID(submitted)
            result = receipt.result ?? "State advanced to revision \(receipt.stateRevision)."
            store.addActivity(title: "Runtime receipt", detail: "\(receipt.receiptId) · revision \(receipt.stateRevision)")
            signal = ""
        } catch { result = "Runtime unavailable: \(error.localizedDescription)" }
    }
}

private struct MondayCreateView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @State private var showingSpace = false
    @State private var showingDocument = false

    var body: some View {
        NavigationStack {
            List {
                Section("Ready now") {
                    Button { showingSpace = true } label: { Label("Space", systemImage: "square.grid.2x2") }
                    Button { showingDocument = true } label: { Label("Document", systemImage: "doc.text") }
                }
                Section("Conversation") { Label("Chat", systemImage: "message") }
                Section("Not implemented yet") {
                    Label("Voice", systemImage: "waveform").foregroundStyle(.secondary)
                    Label("Camera", systemImage: "camera").foregroundStyle(.secondary)
                    Label("Image", systemImage: "photo").foregroundStyle(.secondary)
                    Label("Video", systemImage: "video").foregroundStyle(.secondary)
                    Label("Research", systemImage: "magnifyingglass").foregroundStyle(.secondary)
                    Label("Reminder", systemImage: "bell").foregroundStyle(.secondary)
                    Label("Automation", systemImage: "clock.arrow.circlepath").foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Create")
            .sheet(isPresented: $showingSpace) { MondayNewSpaceView().environmentObject(store) }
            .sheet(isPresented: $showingDocument) { MondayNewDocumentView().environmentObject(store) }
        }
    }
}

private struct MondayNewSpaceView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: MondayLocalStore
    @State private var name = ""
    var body: some View {
        NavigationStack {
            Form { TextField("Space name", text: $name) }
                .navigationTitle("New Space")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                    ToolbarItem(placement: .confirmationAction) { Button("Create") { store.addSpace(name: name); dismiss() }.disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
                }
        }
    }
}

private struct MondayNewDocumentView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: MondayLocalStore
    @State private var title = ""
    @State private var bodyText = ""
    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                TextField("Write something", text: $bodyText, axis: .vertical).lineLimit(4...12)
            }
            .navigationTitle("New Document")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { store.addDocument(title: title, body: bodyText); dismiss() }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}

private struct MondaySpacesView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @State private var showingNew = false
    var body: some View {
        NavigationStack {
            List {
                if store.spaces.isEmpty {
                    Text("No Spaces yet. Create one with + or from Create.").foregroundStyle(.secondary)
                } else {
                    ForEach(store.spaces) { space in
                        VStack(alignment: .leading) {
                            Text(space.name)
                            Text(space.createdAt, style: .date).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .onDelete(perform: store.deleteSpaces)
                }
            }
            .navigationTitle("Spaces")
            .toolbar { ToolbarItem(placement: .primaryAction) { Button { showingNew = true } label: { Image(systemName: "plus") } } }
            .sheet(isPresented: $showingNew) { MondayNewSpaceView().environmentObject(store) }
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
    @EnvironmentObject private var store: MondayLocalStore
    @State private var query = ""
    var body: some View {
        NavigationStack {
            Group {
                let rows = store.search(query)
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    ContentUnavailableView("Search Monday", systemImage: "magnifyingglass", description: Text("Search Spaces and local documents."))
                } else if rows.isEmpty {
                    ContentUnavailableView("No result", systemImage: "magnifyingglass", description: Text("No local Space or document matches this query."))
                } else {
                    List(rows, id: \.1) { row in Label(row.1, systemImage: row.0 == "Space" ? "square.grid.2x2" : "doc.text") }
                }
            }
            .searchable(text: $query)
            .navigationTitle("Search")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct MondayActivityView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: MondayLocalStore
    var body: some View {
        NavigationStack {
            List {
                Section("Running") { Text("No executor is active.").foregroundStyle(.secondary) }
                Section("Waiting") { Text("No persistent task is waiting.").foregroundStyle(.secondary) }
                Section("Needs you") { Text("No human gate is open.").foregroundStyle(.secondary) }
                Section("Recent changes") {
                    if store.activity.isEmpty { Text("No local changes yet.").foregroundStyle(.secondary) }
                    else {
                        ForEach(store.activity) { item in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                Text(item.detail).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Activity")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct MondayLibraryView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @State private var showingNew = false
    var body: some View {
        List {
            Section("Documents") {
                if store.documents.isEmpty { Text("No local documents yet.").foregroundStyle(.secondary) }
                else {
                    ForEach(store.documents) { doc in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(doc.title).font(.headline)
                            if !doc.body.isEmpty { Text(doc.body).lineLimit(3).foregroundStyle(.secondary) }
                        }
                    }
                    .onDelete(perform: store.deleteDocuments)
                }
                Button { showingNew = true } label: { Label("New document", systemImage: "plus") }
            }
            Section("Views") {
                Label("Images", systemImage: "photo").foregroundStyle(.secondary)
                Label("Code", systemImage: "chevron.left.forwardslash.chevron.right").foregroundStyle(.secondary)
                Label("Generated", systemImage: "wand.and.stars").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Library")
        .sheet(isPresented: $showingNew) { MondayNewDocumentView().environmentObject(store) }
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
