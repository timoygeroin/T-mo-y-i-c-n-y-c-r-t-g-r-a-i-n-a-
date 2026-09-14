import AppIntents
import AVFoundation
import Foundation
import PhotosUI
import SwiftUI
import UIKit
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
    var notes: String = ""
    var isPinned: Bool = false
}

private enum MondayDocumentKind: String, Codable, CaseIterable, Identifiable {
    case document = "Document"
    case note = "Note"
    case generated = "Generated"
    case code = "Code"
    case audio = "Audio"
    case image = "Image"
    case video = "Video"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .document: return "doc.text"
        case .note: return "note.text"
        case .generated: return "wand.and.stars"
        case .code: return "chevron.left.forwardslash.chevron.right"
        case .audio: return "waveform"
        case .image: return "photo"
        case .video: return "video"
        }
    }
}

private struct MondayDocument: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var body: String
    var createdAt: Date
    var kind: MondayDocumentKind = .document
    var spaceID: UUID? = nil
    var isPinned: Bool = false
}

private enum MondayTaskState: String, Codable, CaseIterable, Identifiable {
    case running = "Running"
    case waiting = "Waiting"
    case needsYou = "Needs you"
    case completed = "Completed"
    case failed = "Failed"
    case changed = "Changed"
    var id: String { rawValue }
}

private struct MondayTask: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var detail: String
    var state: MondayTaskState
    var createdAt: Date
    var dueAt: Date?
    var spaceID: UUID?
    var isAutomation: Bool
}

private struct MondayChatEntry: Codable, Identifiable, Hashable {
    let id: UUID
    var role: String
    var text: String
    var createdAt: Date
    var receiptID: String?
}

private struct MondayActivity: Codable, Identifiable, Hashable {
    let id: UUID
    var title: String
    var detail: String
    var createdAt: Date
}

private struct MondayPreferences: Codable, Hashable {
    var conciseReplies = false
    var proactiveSuggestions = true
    var reduceMotion = false
    var localContinuity = true
}

@MainActor
private final class MondayLocalStore: ObservableObject {
    @Published var spaces: [MondaySpace] { didSet { persist() } }
    @Published var documents: [MondayDocument] { didSet { persist() } }
    @Published var tasks: [MondayTask] { didSet { persist() } }
    @Published var chat: [MondayChatEntry] { didSet { persist() } }
    @Published var activity: [MondayActivity] { didSet { persist() } }
    @Published var preferences: MondayPreferences { didSet { persist() } }

    private static let key = "monday.consumer.local-store.v2"
    private struct Snapshot: Codable {
        var spaces: [MondaySpace]
        var documents: [MondayDocument]
        var tasks: [MondayTask]
        var chat: [MondayChatEntry]
        var activity: [MondayActivity]
        var preferences: MondayPreferences
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) {
            spaces = snapshot.spaces
            documents = snapshot.documents
            tasks = snapshot.tasks
            chat = snapshot.chat
            activity = snapshot.activity
            preferences = snapshot.preferences
        } else {
            spaces = []
            documents = []
            tasks = []
            chat = []
            activity = []
            preferences = MondayPreferences()
        }
    }

    func addSpace(name: String) {
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        spaces.insert(MondaySpace(id: UUID(), name: clean, createdAt: Date()), at: 0)
        addActivity(title: "Space created", detail: clean)
    }

    func updateSpace(_ space: MondaySpace) {
        guard let index = spaces.firstIndex(where: { $0.id == space.id }) else { return }
        spaces[index] = space
        addActivity(title: "Space updated", detail: space.name)
    }

    func togglePin(spaceID: UUID) {
        guard let index = spaces.firstIndex(where: { $0.id == spaceID }) else { return }
        spaces[index].isPinned.toggle()
        addActivity(title: spaces[index].isPinned ? "Pinned" : "Unpinned", detail: spaces[index].name)
    }

    func addDocument(title: String, body: String, kind: MondayDocumentKind = .document, spaceID: UUID? = nil) {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty || !cleanBody.isEmpty else { return }
        let finalTitle = cleanTitle.isEmpty ? "Untitled" : cleanTitle
        documents.insert(MondayDocument(id: UUID(), title: finalTitle, body: cleanBody, createdAt: Date(), kind: kind, spaceID: spaceID), at: 0)
        addActivity(title: "\(kind.rawValue) saved", detail: finalTitle)
    }

    func togglePin(documentID: UUID) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        documents[index].isPinned.toggle()
        addActivity(title: documents[index].isPinned ? "Pinned" : "Unpinned", detail: documents[index].title)
    }

    @discardableResult
    func saveMedia(data: Data, fileExtension: String, kind: MondayDocumentKind) throws -> MondayDocument {
        guard kind == .image || kind == .video || kind == .audio else { throw CocoaError(.fileWriteUnknown) }
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = base.appendingPathComponent("MondayMedia", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID()
        let safeExtension = fileExtension.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).lowercased()
        let ext = safeExtension.isEmpty ? (kind == .image ? "jpg" : (kind == .audio ? "m4a" : "mov")) : safeExtension
        let url = directory.appendingPathComponent("\(id.uuidString).\(ext)")
        try data.write(to: url, options: .atomic)
        let mediaName = kind == .image ? "Image" : (kind == .audio ? "Voice" : "Video")
        let title = "\(mediaName) \(Date().formatted(date: .abbreviated, time: .shortened))"
        let document = MondayDocument(id: id, title: title, body: "MondayMedia/\(url.lastPathComponent)", createdAt: Date(), kind: kind)
        documents.insert(document, at: 0)
        addActivity(title: "\(kind.rawValue) captured", detail: title)
        return document
    }

    func addTask(title: String, detail: String, dueAt: Date?, spaceID: UUID?, isAutomation: Bool) {
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        tasks.insert(MondayTask(id: UUID(), title: clean, detail: detail.trimmingCharacters(in: .whitespacesAndNewlines), state: .waiting, createdAt: Date(), dueAt: dueAt, spaceID: spaceID, isAutomation: isAutomation), at: 0)
        addActivity(title: isAutomation ? "Automation created" : "Reminder created", detail: clean)
    }

    func setTaskState(_ taskID: UUID, state: MondayTaskState) {
        guard let index = tasks.firstIndex(where: { $0.id == taskID }) else { return }
        tasks[index].state = state
        addActivity(title: "Task \(state.rawValue.lowercased())", detail: tasks[index].title)
    }

    func appendChat(role: String, text: String, receiptID: String? = nil) {
        chat.append(MondayChatEntry(id: UUID(), role: role, text: text, createdAt: Date(), receiptID: receiptID))
        if chat.count > 250 { chat = Array(chat.suffix(250)) }
    }

    func deleteSpaces(at offsets: IndexSet) { spaces.remove(atOffsets: offsets) }
    func deleteDocuments(at offsets: IndexSet) { documents.remove(atOffsets: offsets) }
    func deleteTasks(at offsets: IndexSet) { tasks.remove(atOffsets: offsets) }

    func addActivity(title: String, detail: String) {
        activity.insert(MondayActivity(id: UUID(), title: title, detail: detail, createdAt: Date()), at: 0)
        if activity.count > 150 { activity = Array(activity.prefix(150)) }
    }

    func search(_ query: String) -> [(String, String)] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        var rows: [(String, String)] = []
        rows += spaces.filter { $0.name.lowercased().contains(q) || $0.notes.lowercased().contains(q) }.map { ("Space", $0.name) }
        rows += documents.filter { $0.title.lowercased().contains(q) || $0.body.lowercased().contains(q) }.map { ($0.kind.rawValue, $0.title) }
        rows += tasks.filter { $0.title.lowercased().contains(q) || $0.detail.lowercased().contains(q) }.map { ($0.isAutomation ? "Automation" : "Reminder", $0.title) }
        rows += chat.filter { $0.text.lowercased().contains(q) }.suffix(8).map { ("Chat", String($0.text.prefix(80))) }
        return rows
    }

    private func persist() {
        let snapshot = Snapshot(spaces: spaces, documents: documents, tasks: tasks, chat: chat, activity: activity, preferences: preferences)
        if let data = try? JSONEncoder().encode(snapshot) { UserDefaults.standard.set(data, forKey: Self.key) }
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
            MondayHomeView(selection: $selection).tag(MondayTab.home).tabItem { Label("Home", systemImage: "house") }
            MondayChatsView().tag(MondayTab.chats).tabItem { Label("Chats", systemImage: "message") }
            MondayCreateView(selection: $selection).tag(MondayTab.create).tabItem { Label("Create", systemImage: "plus.circle") }
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
    @Binding var selection: MondayTab

    var body: some View {
        NavigationStack {
            List {
                Section("Continue") {
                    if let task = store.tasks.first(where: { $0.state == .waiting || $0.state == .needsYou }) {
                        Label(task.title, systemImage: task.state == .needsYou ? "person.crop.circle.badge.exclamationmark" : "clock")
                    } else if let first = store.spaces.first {
                        NavigationLink { MondaySpaceDetailView(spaceID: first.id) } label: { Label(first.name, systemImage: "square.grid.2x2") }
                    } else {
                        Button("Start a chat") { selection = .chats }
                    }
                }
                Section("Today") {
                    let due = store.tasks.filter { task in
                        guard let dueAt = task.dueAt else { return false }
                        return Calendar.current.isDateInToday(dueAt) && task.state != .completed
                    }
                    if due.isEmpty { Text("Nothing needs you.").foregroundStyle(.secondary) }
                    else { ForEach(due) { task in Label(task.title, systemImage: "bell") } }
                }
                Section("Recent") {
                    if store.documents.isEmpty && store.spaces.isEmpty {
                        Text("Create a Space or document to start your local continuity.").foregroundStyle(.secondary)
                    } else {
                        ForEach(Array(store.documents.prefix(3))) { item in Label(item.title, systemImage: item.kind.symbol) }
                        ForEach(Array(store.spaces.prefix(3))) { item in NavigationLink { MondaySpaceDetailView(spaceID: item.id) } label: { Label(item.name, systemImage: "square.grid.2x2") } }
                    }
                }
                Section("Pinned") {
                    let pinnedDocs = store.documents.filter(\.isPinned)
                    let pinnedSpaces = store.spaces.filter(\.isPinned)
                    if pinnedDocs.isEmpty && pinnedSpaces.isEmpty { Text("Pin important Spaces or files from their menus.").foregroundStyle(.secondary) }
                    ForEach(pinnedSpaces) { item in NavigationLink { MondaySpaceDetailView(spaceID: item.id) } label: { Label(item.name, systemImage: "pin.fill") } }
                    ForEach(pinnedDocs) { item in Label(item.title, systemImage: "pin.fill") }
                }
                Section("Widgets") {
                    LabeledContent("Spaces", value: "\(store.spaces.count)")
                    LabeledContent("Library items", value: "\(store.documents.count)")
                    LabeledContent("Open tasks", value: "\(store.tasks.filter { $0.state == .waiting || $0.state == .needsYou }.count)")
                }
            }
            .navigationTitle("Home")
        }
    }
}

private struct MondayChatsView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @State private var signal = ""
    @State private var working = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if store.chat.isEmpty {
                    ContentUnavailableView("No conversation yet", systemImage: "message", description: Text("Start with the composer below."))
                        .frame(maxHeight: .infinity)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 12) {
                                ForEach(store.chat) { entry in
                                    VStack(alignment: entry.role == "user" ? .trailing : .leading, spacing: 3) {
                                        Text(entry.text)
                                            .padding(10)
                                            .background(entry.role == "user" ? Color.accentColor.opacity(0.14) : Color.secondary.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
                                        if let receiptID = entry.receiptID { Text(receiptID).font(.caption2).foregroundStyle(.secondary) }
                                    }
                                    .frame(maxWidth: .infinity, alignment: entry.role == "user" ? .trailing : .leading)
                                    .id(entry.id)
                                }
                            }
                            .padding()
                        }
                        .onChange(of: store.chat.count) { _, _ in if let last = store.chat.last { proxy.scrollTo(last.id, anchor: .bottom) } }
                    }
                }
                Divider()
                HStack(alignment: .bottom) {
                    TextField("Message Monday", text: $signal, axis: .vertical).textFieldStyle(.roundedBorder)
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
        guard !submitted.isEmpty else { return }
        store.appendChat(role: "user", text: submitted)
        signal = ""
        working = true
        defer { working = false }
        do {
            let receipt = try await sendToMondayID(submitted)
            let response = receipt.result ?? "State advanced to revision \(receipt.stateRevision)."
            store.appendChat(role: "monday", text: response, receiptID: receipt.receiptId)
            store.addActivity(title: "Runtime receipt", detail: "\(receipt.receiptId) · revision \(receipt.stateRevision)")
        } catch {
            store.appendChat(role: "monday", text: "Runtime unavailable: \(error.localizedDescription)")
        }
    }
}

private struct MondayCreateView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @Binding var selection: MondayTab
    @State private var sheet: CreateSheet?
    @State private var imageItem: PhotosPickerItem?
    @State private var videoItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var showingVoiceRecorder = false
    @State private var mediaStatus: String?

    private enum CreateSheet: String, Identifiable {
        case space, document, reminder, automation, capability
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Conversation") {
                    Button { selection = .chats } label: { Label("Chat", systemImage: "message") }
                }
                Section("Knowledge") {
                    Button { sheet = .document } label: { Label("Document", systemImage: "doc.text") }
                    Button { sheet = .capability } label: { Label("Research or code task", systemImage: "sparkle.magnifyingglass") }
                }
                Section("Persistent") {
                    Button { sheet = .space } label: { Label("Space", systemImage: "square.grid.2x2") }
                    Button { sheet = .reminder } label: { Label("Reminder", systemImage: "bell") }
                    Button { sheet = .automation } label: { Label("Automation", systemImage: "clock.arrow.circlepath") }
                }
                Section("Capture & media") {
                    Button { showingVoiceRecorder = true } label: { Label("Voice", systemImage: "waveform") }
                    Button {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) { showingCamera = true }
                        else { mediaStatus = "Camera is unavailable on this device." }
                    } label: { Label("Camera", systemImage: "camera") }
                    PhotosPicker(selection: $imageItem, matching: .images) { Label("Image", systemImage: "photo") }
                    PhotosPicker(selection: $videoItem, matching: .videos) { Label("Video", systemImage: "video") }
                    if let mediaStatus { Text(mediaStatus).font(.footnote).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Create")
            .sheet(item: $sheet) { item in
                switch item {
                case .space: MondayNewSpaceView().environmentObject(store)
                case .document: MondayNewDocumentView().environmentObject(store)
                case .reminder: MondayNewTaskView(isAutomation: false).environmentObject(store)
                case .automation: MondayNewTaskView(isAutomation: true).environmentObject(store)
                case .capability: MondayCapabilityComposer().environmentObject(store)
                }
            }
            .sheet(isPresented: $showingCamera) {
                MondayCameraPicker { data in
                    persistMedia(data: data, fileExtension: "jpg", kind: .image)
                }
            }
            .sheet(isPresented: $showingVoiceRecorder) {
                MondayVoiceRecorder { data in
                    persistMedia(data: data, fileExtension: "m4a", kind: .audio)
                }
            }
            .onChange(of: imageItem) { _, item in
                guard let item else { return }
                Task { await importPickerItem(item, kind: .image, fileExtension: "jpg") }
            }
            .onChange(of: videoItem) { _, item in
                guard let item else { return }
                Task { await importPickerItem(item, kind: .video, fileExtension: "mov") }
            }
        }
    }

    @MainActor private func importPickerItem(_ item: PhotosPickerItem, kind: MondayDocumentKind, fileExtension: String) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self), !data.isEmpty else {
                mediaStatus = "The selected \(kind.rawValue.lowercased()) could not be read."
                return
            }
            persistMedia(data: data, fileExtension: fileExtension, kind: kind)
            if kind == .image { imageItem = nil } else { videoItem = nil }
        } catch {
            mediaStatus = "Import failed: \(error.localizedDescription)"
        }
    }

    @MainActor private func persistMedia(data: Data, fileExtension: String, kind: MondayDocumentKind) {
        do {
            let object = try store.saveMedia(data: data, fileExtension: fileExtension, kind: kind)
            mediaStatus = "Saved \(object.title) to Library."
        } catch {
            mediaStatus = "Save failed: \(error.localizedDescription)"
        }
    }
}

private struct MondayVoiceRecorder: View {
    @Environment(\.dismiss) private var dismiss
    let onCapture: (Data) -> Void
    @State private var recorder: AVAudioRecorder?
    @State private var recordingURL: URL?
    @State private var status = "Ready to record."
    @State private var recording = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: recording ? "waveform.circle.fill" : "waveform.circle")
                    .font(.system(size: 72))
                Text(recording ? "Recording…" : status).multilineTextAlignment(.center)
                Button(recording ? "Stop and save" : "Record voice") { recording ? finishRecording() : requestAndStart() }
                    .buttonStyle(.borderedProminent)
                if recording { Button("Cancel recording", role: .destructive) { cancelRecording() } }
                Spacer()
            }
            .padding(28)
            .navigationTitle("Voice")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { cancelRecording(); dismiss() } } }
        }
    }

    private func requestAndStart() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                if granted { startRecording() } else { status = "Microphone permission is required to record voice." }
            }
        }
    }

    private func startRecording() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .spokenAudio, options: [])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("MondayVoice-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [AVFormatIDKey: Int(kAudioFormatMPEG4AAC), AVSampleRateKey: 44_100, AVNumberOfChannelsKey: 1, AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue]
            let value = try AVAudioRecorder(url: url, settings: settings)
            value.prepareToRecord()
            guard value.record() else { throw CocoaError(.fileWriteUnknown) }
            recorder=value; recordingURL=url; recording=true; status="Recording…"
        } catch { status="Recording failed: \(error.localizedDescription)"; recording=false }
    }

    private func finishRecording() {
        recorder?.stop(); recorder=nil; recording=false
        guard let url=recordingURL else { status="No recording was created."; return }
        defer { try? FileManager.default.removeItem(at: url); recordingURL=nil }
        do {
            let data=try Data(contentsOf: url)
            guard !data.isEmpty else { status="The recording was empty."; return }
            onCapture(data); try? AVAudioSession.sharedInstance().setActive(false); dismiss()
        } catch { status="Voice save failed: \(error.localizedDescription)" }
    }

    private func cancelRecording() {
        recorder?.stop(); recorder=nil; recording=false
        if let url=recordingURL { try? FileManager.default.removeItem(at: url) }
        recordingURL=nil; try? AVAudioSession.sharedInstance().setActive(false)
    }
}

private struct MondayCameraPicker: UIViewControllerRepresentable {
    let onCapture: (Data) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: MondayCameraPicker
        init(parent: MondayCameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey : Any]) {
            if let image = info[.originalImage] as? UIImage, let data = image.jpegData(compressionQuality: 0.92) {
                parent.onCapture(data)
            }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
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
    @State private var kind: MondayDocumentKind = .document
    @State private var spaceID: UUID?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $kind) { ForEach(MondayDocumentKind.allCases) { Text($0.rawValue).tag($0) } }
                Picker("Space", selection: $spaceID) {
                    Text("None").tag(Optional<UUID>.none)
                    ForEach(store.spaces) { Text($0.name).tag(Optional($0.id)) }
                }
                TextField("Title", text: $title)
                TextField("Write something", text: $bodyText, axis: .vertical).lineLimit(4...12)
            }
            .navigationTitle("New \(kind.rawValue)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { store.addDocument(title: title, body: bodyText, kind: kind, spaceID: spaceID); dismiss() }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}

private struct MondayNewTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: MondayLocalStore
    let isAutomation: Bool
    @State private var title = ""
    @State private var detail = ""
    @State private var hasDueDate = false
    @State private var dueAt = Date().addingTimeInterval(3600)
    @State private var spaceID: UUID?

    var body: some View {
        NavigationStack {
            Form {
                TextField(isAutomation ? "Automation name" : "Reminder", text: $title)
                TextField("Details", text: $detail, axis: .vertical)
                Picker("Space", selection: $spaceID) {
                    Text("None").tag(Optional<UUID>.none)
                    ForEach(store.spaces) { Text($0.name).tag(Optional($0.id)) }
                }
                Toggle("Schedule", isOn: $hasDueDate)
                if hasDueDate { DatePicker("When", selection: $dueAt) }
            }
            .navigationTitle(isAutomation ? "New Automation" : "New Reminder")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { store.addTask(title: title, detail: detail, dueAt: hasDueDate ? dueAt : nil, spaceID: spaceID, isAutomation: isAutomation); dismiss() }.disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }
}

private struct MondayCapabilityComposer: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: MondayLocalStore
    @State private var prompt = ""
    @State private var working = false
    @State private var result = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Research or build request", text: $prompt, axis: .vertical).lineLimit(4...12)
                if !result.isEmpty { Section("Result") { Text(result).textSelection(.enabled) } }
            }
            .navigationTitle("Capability task")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button(working ? "Running…" : "Run") { Task { await run() } }.disabled(working || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }
            }
        }
    }

    @MainActor private func run() async {
        working = true
        defer { working = false }
        do {
            let receipt = try await sendToMondayID(prompt)
            result = receipt.result ?? "State advanced to revision \(receipt.stateRevision)."
            store.addDocument(title: "Capability result", body: result, kind: .generated)
            store.addActivity(title: "Capability receipt", detail: receipt.receiptId)
        } catch { result = "Runtime unavailable: \(error.localizedDescription)" }
    }
}

private struct MondaySpacesView: View {
    @EnvironmentObject private var store: MondayLocalStore
    @State private var showingNew = false

    var body: some View {
        NavigationStack {
            List {
                if store.spaces.isEmpty {
                    ContentUnavailableView("No Spaces", systemImage: "square.grid.2x2", description: Text("Create a project, person, topic or trip Space."))
                } else {
                    ForEach(store.spaces) { space in
                        NavigationLink { MondaySpaceDetailView(spaceID: space.id) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(space.name)
                                    Text(space.createdAt, style: .date).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if space.isPinned { Image(systemName: "pin.fill").foregroundStyle(.secondary) }
                            }
                        }
                        .swipeActions(edge: .leading) { Button(space.isPinned ? "Unpin" : "Pin") { store.togglePin(spaceID: space.id) }.tint(.blue) }
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

private struct MondaySpaceDetailView: View {
    @EnvironmentObject private var store: MondayLocalStore
    let spaceID: UUID
    @State private var section = 0
    @State private var notes = ""
    @State private var showingDocument = false
    @State private var showingTask = false

    private var space: MondaySpace? { store.spaces.first(where: { $0.id == spaceID }) }
    private var documents: [MondayDocument] { store.documents.filter { $0.spaceID == spaceID } }
    private var tasks: [MondayTask] { store.tasks.filter { $0.spaceID == spaceID } }

    var body: some View {
        Group {
            if let space {
                VStack(spacing: 0) {
                    Picker("Section", selection: $section) {
                        Text("Overview").tag(0)
                        Text("Chat").tag(1)
                        Text("Files").tag(2)
                        Text("Tasks").tag(3)
                        Text("Activity").tag(4)
                    }
                    .pickerStyle(.segmented)
                    .padding()

                    switch section {
                    case 0:
                        Form {
                            Section("Notes") { TextField("What matters in this Space?", text: $notes, axis: .vertical).lineLimit(4...12) }
                            Section { Button("Save notes") { var updated = space; updated.notes = notes; store.updateSpace(updated) } }
                        }
                    case 1:
                        MondayChatsView()
                    case 2:
                        List {
                            ForEach(documents) { doc in Label(doc.title, systemImage: doc.kind.symbol) }
                            Button { showingDocument = true } label: { Label("Add file object", systemImage: "plus") }
                        }
                    case 3:
                        List {
                            ForEach(tasks) { task in MondayTaskRow(task: task) }
                            Button { showingTask = true } label: { Label("Add task", systemImage: "plus") }
                        }
                    default:
                        List(store.activity.filter { item in item.detail.localizedCaseInsensitiveContains(space.name) }) { item in
                            VStack(alignment: .leading) { Text(item.title); Text(item.detail).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
                .navigationTitle(space.name)
                .onAppear { notes = space.notes }
                .sheet(isPresented: $showingDocument) { MondayNewDocumentView().environmentObject(store) }
                .sheet(isPresented: $showingTask) { MondayNewTaskView(isAutomation: false).environmentObject(store) }
            } else {
                ContentUnavailableView("Space unavailable", systemImage: "exclamationmark.triangle")
            }
        }
    }
}

private struct MondayTaskRow: View {
    @EnvironmentObject private var store: MondayLocalStore
    let task: MondayTask
    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack { Text(task.title).font(.headline); Spacer(); Text(task.state.rawValue).font(.caption).foregroundStyle(.secondary) }
            if !task.detail.isEmpty { Text(task.detail).font(.subheadline).foregroundStyle(.secondary) }
            if let dueAt = task.dueAt { Text(dueAt, style: .relative).font(.caption).foregroundStyle(.secondary) }
        }
        .swipeActions {
            if task.state != .completed { Button("Complete") { store.setTaskState(task.id, state: .completed) }.tint(.green) }
            Button("Needs you") { store.setTaskState(task.id, state: .needsYou) }.tint(.orange)
        }
        .contextMenu {
            Button("Running") { store.setTaskState(task.id, state: .running) }
            Button("Waiting") { store.setTaskState(task.id, state: .waiting) }
            Button("Changed") { store.setTaskState(task.id, state: .changed) }
            Button("Failed") { store.setTaskState(task.id, state: .failed) }
        }
    }
}

private struct MondayYouView: View {
    @EnvironmentObject private var store: MondayLocalStore
    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink("Library") { MondayLibraryView() }
                    NavigationLink("Connections") { MondayRuntimeConnectionView() }
                }
                Section("Monday & Me") {
                    Toggle("Concise replies", isOn: $store.preferences.conciseReplies)
                    Toggle("Proactive suggestions", isOn: $store.preferences.proactiveSuggestions)
                    Toggle("Local continuity", isOn: $store.preferences.localContinuity)
                    Toggle("Reduce motion", isOn: $store.preferences.reduceMotion)
                }
                Section("Inspect") {
                    LabeledContent("Spaces", value: "\(store.spaces.count)")
                    LabeledContent("Documents", value: "\(store.documents.count)")
                    LabeledContent("Tasks", value: "\(store.tasks.count)")
                    LabeledContent("Chat events", value: "\(store.chat.count)")
                }
                Section("Privacy") { Text("Local consumer state stays in this app container unless an explicit runtime action or connection sends it elsewhere.").font(.footnote).foregroundStyle(.secondary) }
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
                    ContentUnavailableView("Search Monday", systemImage: "magnifyingglass", description: Text("Search Spaces, files, tasks and recent chat."))
                } else if rows.isEmpty {
                    ContentUnavailableView("No result", systemImage: "magnifyingglass", description: Text("No local object matches this query."))
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
                Section("Running") {
                    let rows = store.tasks.filter { $0.state == .running }
                    if rows.isEmpty { Text("No executor is active.").foregroundStyle(.secondary) }
                    else { ForEach(rows) { MondayTaskRow(task: $0) } }
                }
                Section("Waiting") {
                    let rows = store.tasks.filter { $0.state == .waiting }
                    if rows.isEmpty { Text("No persistent task is waiting.").foregroundStyle(.secondary) }
                    else { ForEach(rows) { MondayTaskRow(task: $0) } }
                }
                Section("Needs you") {
                    let rows = store.tasks.filter { $0.state == .needsYou }
                    if rows.isEmpty { Text("No human gate is open.").foregroundStyle(.secondary) }
                    else { ForEach(rows) { MondayTaskRow(task: $0) } }
                }
                Section("Completed") {
                    let rows = store.tasks.filter { $0.state == .completed }.prefix(10)
                    if rows.isEmpty { Text("No completed local tasks yet.").foregroundStyle(.secondary) }
                    else { ForEach(Array(rows)) { MondayTaskRow(task: $0) } }
                }
                Section("Changed") {
                    let rows = store.tasks.filter { $0.state == .changed }
                    if rows.isEmpty { Text("No changed local tasks.").foregroundStyle(.secondary) }
                    else { ForEach(rows) { MondayTaskRow(task: $0) } }
                }
                Section("Failed") {
                    let rows = store.tasks.filter { $0.state == .failed }
                    if rows.isEmpty { Text("No failed local tasks.").foregroundStyle(.secondary) }
                    else { ForEach(rows) { MondayTaskRow(task: $0) } }
                }
                Section("Recent changes") {
                    if store.activity.isEmpty { Text("No local changes yet.").foregroundStyle(.secondary) }
                    else { ForEach(store.activity) { item in VStack(alignment: .leading, spacing: 3) { Text(item.title); Text(item.detail).font(.caption).foregroundStyle(.secondary) } } }
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
    @State private var filter: MondayDocumentKind?

    private var visible: [MondayDocument] { filter.map { selected in store.documents.filter { $0.kind == selected } } ?? store.documents }

    var body: some View {
        List {
            Section("Views") {
                Picker("Type", selection: $filter) {
                    Text("All").tag(Optional<MondayDocumentKind>.none)
                    ForEach(MondayDocumentKind.allCases) { Text($0.rawValue).tag(Optional($0)) }
                }
                .pickerStyle(.menu)
            }
            Section("Files") {
                if visible.isEmpty { Text("No matching local files yet.").foregroundStyle(.secondary) }
                else {
                    ForEach(visible) { doc in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Label(doc.title, systemImage: doc.kind.symbol).font(.headline); Spacer(); if doc.isPinned { Image(systemName: "pin.fill") } }
                            if !doc.body.isEmpty { Text(doc.body).lineLimit(3).foregroundStyle(.secondary) }
                        }
                        .swipeActions(edge: .leading) { Button(doc.isPinned ? "Unpin" : "Pin") { store.togglePin(documentID: doc.id) }.tint(.blue) }
                    }
                    .onDelete(perform: store.deleteDocuments)
                }
                Button { showingNew = true } label: { Label("New file object", systemImage: "plus") }
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