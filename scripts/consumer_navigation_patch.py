from pathlib import Path

p = Path('platform/apple-host/MondayIDHost/MondayIDHostApp.swift')
s = p.read_text()


def once(old: str, new: str) -> None:
    global s
    if old not in s:
        raise SystemExit('PATCH_ANCHOR_MISSING: ' + old[:120])
    if s.count(old) != 1:
        raise SystemExit('PATCH_ANCHOR_NONUNIQUE: ' + old[:120])
    s = s.replace(old, new, 1)


once(
'''    func togglePin(documentID: UUID) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        documents[index].isPinned.toggle()
        addActivity(title: documents[index].isPinned ? "Pinned" : "Unpinned", detail: documents[index].title)
    }

''',
'''    func togglePin(documentID: UUID) {
        guard let index = documents.firstIndex(where: { $0.id == documentID }) else { return }
        documents[index].isPinned.toggle()
        addActivity(title: documents[index].isPinned ? "Pinned" : "Unpinned", detail: documents[index].title)
    }

    func updateDocument(_ document: MondayDocument) {
        guard let index = documents.firstIndex(where: { $0.id == document.id }) else { return }
        documents[index] = document
        addActivity(title: "File updated", detail: document.title)
    }

''')

once(
'''                        ForEach(Array(store.documents.prefix(3))) { item in Label(item.title, systemImage: item.kind.symbol) }
''',
'''                        ForEach(Array(store.documents.prefix(3))) { item in
                            NavigationLink { MondayDocumentDetailView(documentID: item.id) } label: { Label(item.title, systemImage: item.kind.symbol) }
                        }
''')

once(
'''                    ForEach(pinnedDocs) { item in Label(item.title, systemImage: "pin.fill") }
''',
'''                    ForEach(pinnedDocs) { item in
                        NavigationLink { MondayDocumentDetailView(documentID: item.id) } label: { Label(item.title, systemImage: "pin.fill") }
                    }
''')

once(
'''                    List(rows, id: \\.1) { row in Label(row.1, systemImage: row.0 == "Space" ? "square.grid.2x2" : "doc.text") }
''',
'''                    List(Array(rows.enumerated()), id: \\.offset) { _, row in
                        if row.0 == "Space", let space = store.spaces.first(where: { $0.name == row.1 }) {
                            NavigationLink { MondaySpaceDetailView(spaceID: space.id) } label: { Label(row.1, systemImage: "square.grid.2x2") }
                        } else if let doc = store.documents.first(where: { $0.title == row.1 && $0.kind.rawValue == row.0 }) {
                            NavigationLink { MondayDocumentDetailView(documentID: doc.id) } label: { Label(row.1, systemImage: doc.kind.symbol) }
                        } else if let task = store.tasks.first(where: { $0.title == row.1 }) {
                            NavigationLink { MondayTaskDetailView(taskID: task.id) } label: { Label(row.1, systemImage: task.isAutomation ? "clock.arrow.circlepath" : "bell") }
                        } else {
                            Label(row.1, systemImage: "text.magnifyingglass")
                        }
                    }
''')

once(
'''                    ForEach(visible) { doc in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Label(doc.title, systemImage: doc.kind.symbol).font(.headline); Spacer(); if doc.isPinned { Image(systemName: "pin.fill") } }
                            if !doc.body.isEmpty { Text(doc.body).lineLimit(3).foregroundStyle(.secondary) }
                        }
                        .swipeActions(edge: .leading) { Button(doc.isPinned ? "Unpin" : "Pin") { store.togglePin(documentID: doc.id) }.tint(.blue) }
                    }
''',
'''                    ForEach(visible) { doc in
                        NavigationLink { MondayDocumentDetailView(documentID: doc.id) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack { Label(doc.title, systemImage: doc.kind.symbol).font(.headline); Spacer(); if doc.isPinned { Image(systemName: "pin.fill") } }
                                if !doc.body.isEmpty { Text(doc.body).lineLimit(3).foregroundStyle(.secondary) }
                            }
                        }
                        .swipeActions(edge: .leading) { Button(doc.isPinned ? "Unpin" : "Pin") { store.togglePin(documentID: doc.id) }.tint(.blue) }
                    }
''')

anchor = 'private struct MondayRuntimeConnectionView: View {'
if anchor not in s:
    raise SystemExit('DETAIL_INSERT_ANCHOR_MISSING')

detail = r'''private struct MondayDocumentDetailView: View {
    @EnvironmentObject private var store: MondayLocalStore
    let documentID: UUID
    @State private var title = ""
    @State private var bodyText = ""
    @State private var loaded = false
    @State private var saved = false

    private var document: MondayDocument? { store.documents.first(where: { $0.id == documentID }) }
    private var isEditableText: Bool {
        guard let document else { return false }
        return document.kind == .document || document.kind == .note || document.kind == .generated || document.kind == .code
    }

    var body: some View {
        Group {
            if let document {
                Form {
                    Section("File") {
                        Label(document.kind.rawValue, systemImage: document.kind.symbol)
                        LabeledContent("Created") { Text(document.createdAt, style: .date) }
                        if let spaceID = document.spaceID, let space = store.spaces.first(where: { $0.id == spaceID }) {
                            LabeledContent("Space", value: space.name)
                        }
                    }
                    if isEditableText {
                        Section("Content") {
                            TextField("Title", text: $title)
                            TextEditor(text: $bodyText).frame(minHeight: 180)
                            Button(saved ? "Saved" : "Save changes") {
                                var updated = document
                                let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
                                updated.title = clean.isEmpty ? document.title : clean
                                updated.body = bodyText
                                store.updateDocument(updated)
                                saved = true
                            }
                        }
                    } else {
                        Section("Stored object") {
                            Text(document.body).textSelection(.enabled)
                            Text("Media bytes are stored in Monday's Application Support container; this object is the durable Library pointer.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                .navigationTitle(document.title)
                .onAppear {
                    guard !loaded else { return }
                    title = document.title
                    bodyText = document.body
                    loaded = true
                }
                .onChange(of: title) { _, _ in saved = false }
                .onChange(of: bodyText) { _, _ in saved = false }
            } else {
                ContentUnavailableView("File unavailable", systemImage: "doc.questionmark")
            }
        }
    }
}

private struct MondayTaskDetailView: View {
    @EnvironmentObject private var store: MondayLocalStore
    let taskID: UUID
    private var task: MondayTask? { store.tasks.first(where: { $0.id == taskID }) }

    var body: some View {
        Group {
            if let task {
                Form {
                    Section("Task") {
                        Text(task.title).font(.headline)
                        if !task.detail.isEmpty { Text(task.detail) }
                        LabeledContent("State", value: task.state.rawValue)
                        LabeledContent("Type", value: task.isAutomation ? "Automation" : "Reminder")
                        if let dueAt = task.dueAt { LabeledContent("When") { Text(dueAt, style: .date) } }
                    }
                    Section("State") {
                        Button("Running") { store.setTaskState(task.id, state: .running) }
                        Button("Waiting") { store.setTaskState(task.id, state: .waiting) }
                        Button("Needs you") { store.setTaskState(task.id, state: .needsYou) }
                        Button("Completed") { store.setTaskState(task.id, state: .completed) }
                    }
                }
                .navigationTitle(task.title)
            } else {
                ContentUnavailableView("Task unavailable", systemImage: "checklist")
            }
        }
    }
}

'''

s = s.replace(anchor, detail + anchor, 1)
p.write_text(s)
print('PATCHED_CONSUMER_NAVIGATION=true')
