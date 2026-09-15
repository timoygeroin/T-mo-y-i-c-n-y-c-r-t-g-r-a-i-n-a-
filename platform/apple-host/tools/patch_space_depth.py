from pathlib import Path

p = Path('platform/apple-host/MondayIDHost/MondayIDHostApp.swift')
s = p.read_text()

replacements = [
('''                    if let task = store.tasks.first(where: { $0.state == .waiting || $0.state == .needsYou }) {
                        Label(task.title, systemImage: task.state == .needsYou ? "person.crop.circle.badge.exclamationmark" : "clock")
''','''                    if let task = store.tasks.first(where: { $0.state == .waiting || $0.state == .needsYou }) {
                        NavigationLink { MondayTaskDetailView(taskID: task.id) } label: {
                            Label(task.title, systemImage: task.state == .needsYou ? "person.crop.circle.badge.exclamationmark" : "clock")
                        }
'''),
('''                    if due.isEmpty { Text("Nothing needs you.").foregroundStyle(.secondary) }
                    else { ForEach(due) { task in Label(task.title, systemImage: "bell") } }
''','''                    if due.isEmpty { Text("Nothing needs you.").foregroundStyle(.secondary) }
                    else {
                        ForEach(due) { task in
                            NavigationLink { MondayTaskDetailView(taskID: task.id) } label: { Label(task.title, systemImage: "bell") }
                        }
                    }
'''),
('''                        List {
                            ForEach(documents) { doc in Label(doc.title, systemImage: doc.kind.symbol) }
                            Button { showingDocument = true } label: { Label("Add file object", systemImage: "plus") }
                        }
''','''                        List {
                            ForEach(documents) { doc in
                                NavigationLink { MondayDocumentDetailView(documentID: doc.id) } label: { Label(doc.title, systemImage: doc.kind.symbol) }
                            }
                            Button { showingDocument = true } label: { Label("Add file object", systemImage: "plus") }
                        }
'''),
('''                        List {
                            ForEach(tasks) { task in MondayTaskRow(task: task) }
                            Button { showingTask = true } label: { Label("Add task", systemImage: "plus") }
                        }
''','''                        List {
                            ForEach(tasks) { task in
                                NavigationLink { MondayTaskDetailView(taskID: task.id) } label: { MondayTaskRow(task: task) }
                            }
                            Button { showingTask = true } label: { Label("Add task", systemImage: "plus") }
                        }
''')]

changed = False
for old, new in replacements:
    if new in s:
        continue
    if old not in s:
        raise SystemExit('guard failed: expected source fragment not found')
    s = s.replace(old, new, 1)
    changed = True

if changed:
    p.write_text(s)
print('SPACE_DEPTH_PATCH=' + ('APPLIED' if changed else 'ALREADY_PRESENT'))
