from pathlib import Path

swift_path = Path('platform/apple-host/MondayIDHost/MondayIDHostApp.swift')
pbx_path = Path('platform/apple-host/MondayIDHost.xcodeproj/project.pbxproj')
source = swift_path.read_text()


def replace_once(old: str, new: str, label: str) -> None:
    global source
    if new in source:
        return
    if old not in source:
        raise SystemExit(f'missing patch anchor: {label}')
    source = source.replace(old, new, 1)

replace_once(
    'import Foundation\nimport SwiftUI\nimport MondayIDAppleAdapter',
    'import Foundation\nimport PhotosUI\nimport SwiftUI\nimport UIKit\nimport MondayIDAppleAdapter',
    'imports',
)

replace_once(
    '    case generated = "Generated"\n    case code = "Code"',
    '    case generated = "Generated"\n    case code = "Code"\n    case image = "Image"\n    case video = "Video"',
    'document kinds',
)
replace_once(
    '        case .generated: return "wand.and.stars"\n        case .code: return "chevron.left.forwardslash.chevron.right"',
    '        case .generated: return "wand.and.stars"\n        case .code: return "chevron.left.forwardslash.chevron.right"\n        case .image: return "photo"\n        case .video: return "video"',
    'document symbols',
)

store_anchor = '''    func togglePin(documentID: UUID) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        documents[index].isPinned.toggle()
        addActivity(title: documents[index].isPinned ? "Pinned" : "Unpinned", detail: documents[index].title)
    }
'''
store_new = store_anchor + '''
    @discardableResult
    func saveMedia(data: Data, fileExtension: String, kind: MondayDocumentKind) throws -> MondayDocument {
        guard kind == .image || kind == .video else { throw CocoaError(.fileWriteUnknown) }
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        let directory = base.appendingPathComponent("MondayMedia", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID()
        let safeExtension = fileExtension.trimmingCharacters(in: CharacterSet.alphanumerics.inverted).lowercased()
        let ext = safeExtension.isEmpty ? (kind == .image ? "jpg" : "mov") : safeExtension
        let url = directory.appendingPathComponent("\\(id.uuidString).\\(ext)")
        try data.write(to: url, options: .atomic)
        let title = kind == .image ? "Image \\(Date().formatted(date: .abbreviated, time: .shortened))" : "Video \\(Date().formatted(date: .abbreviated, time: .shortened))"
        let document = MondayDocument(id: id, title: title, body: "MondayMedia/\\(url.lastPathComponent)", createdAt: Date(), kind: kind)
        documents.insert(document, at: 0)
        addActivity(title: "\\(kind.rawValue) captured", detail: title)
        return document
    }
'''
replace_once(store_anchor, store_new, 'media persistence')

state_anchor = '''    @EnvironmentObject private var store: MondayLocalStore
    @Binding var selection: MondayTab
    @State private var sheet: CreateSheet?
'''
state_new = '''    @EnvironmentObject private var store: MondayLocalStore
    @Binding var selection: MondayTab
    @State private var sheet: CreateSheet?
    @State private var imageItem: PhotosPickerItem?
    @State private var videoItem: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var mediaStatus: String?
'''
replace_once(state_anchor, state_new, 'create media state')

capture_anchor = '''                Section("Capture & media") {
                    Label("Voice — use the system dictation key in Chat", systemImage: "waveform")
                    Label("Camera / Image / Video — system capture body pending field integration", systemImage: "camera")
                        .foregroundStyle(.secondary)
                }
'''
capture_new = '''                Section("Capture & media") {
                    Button { selection = .chats } label: { Label("Voice", systemImage: "waveform") }
                    Button {
                        if UIImagePickerController.isSourceTypeAvailable(.camera) { showingCamera = true }
                        else { mediaStatus = "Camera is unavailable on this device." }
                    } label: { Label("Camera", systemImage: "camera") }
                    PhotosPicker(selection: $imageItem, matching: .images) { Label("Image", systemImage: "photo") }
                    PhotosPicker(selection: $videoItem, matching: .videos) { Label("Video", systemImage: "video") }
                    if let mediaStatus { Text(mediaStatus).font(.footnote).foregroundStyle(.secondary) }
                }
'''
replace_once(capture_anchor, capture_new, 'capture section')

sheet_anchor = '''            .sheet(item: $sheet) { item in
                switch item {
                case .space: MondayNewSpaceView().environmentObject(store)
                case .document: MondayNewDocumentView().environmentObject(store)
                case .reminder: MondayNewTaskView(isAutomation: false).environmentObject(store)
                case .automation: MondayNewTaskView(isAutomation: true).environmentObject(store)
                case .capability: MondayCapabilityComposer().environmentObject(store)
                }
            }
'''
sheet_new = sheet_anchor + '''            .sheet(isPresented: $showingCamera) {
                MondayCameraPicker { data in
                    persistMedia(data: data, fileExtension: "jpg", kind: .image)
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
'''
replace_once(sheet_anchor, sheet_new, 'capture sheet')

end_anchor = '''    }
}

private struct MondayNewSpaceView: View {
'''
end_new = '''    }

    @MainActor private func importPickerItem(_ item: PhotosPickerItem, kind: MondayDocumentKind, fileExtension: String) async {
        do {
            guard let data = try await item.loadTransferable(type: Data.self), !data.isEmpty else {
                mediaStatus = "The selected \\(kind.rawValue.lowercased()) could not be read."
                return
            }
            persistMedia(data: data, fileExtension: fileExtension, kind: kind)
            if kind == .image { imageItem = nil } else { videoItem = nil }
        } catch {
            mediaStatus = "Import failed: \\(error.localizedDescription)"
        }
    }

    @MainActor private func persistMedia(data: Data, fileExtension: String, kind: MondayDocumentKind) {
        do {
            let object = try store.saveMedia(data: data, fileExtension: fileExtension, kind: kind)
            mediaStatus = "Saved \\(object.title) to Library."
        } catch {
            mediaStatus = "Save failed: \\(error.localizedDescription)"
        }
    }
}

private struct MondayCameraPicker: UIViewControllerRepresentable {
    let onCapture: (Data) -> Void
    @Environment(\\.dismiss) private var dismiss

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
'''
replace_once(end_anchor, end_new, 'camera bridge')

swift_path.write_text(source)

pbx = pbx_path.read_text()
privacy = 'INFOPLIST_KEY_NSCameraUsageDescription = "Capture photos into Monday.";'
if privacy not in pbx:
    anchor = '\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = MondayID;'
    if pbx.count(anchor) != 2:
        raise SystemExit('camera privacy anchor mismatch')
    pbx = pbx.replace(anchor, anchor + '\n\t\t\t\t' + privacy)
    pbx_path.write_text(pbx)

print('MEDIA_PATCH_APPLIED')
