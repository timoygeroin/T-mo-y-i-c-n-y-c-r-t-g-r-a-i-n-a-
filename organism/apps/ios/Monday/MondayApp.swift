import SwiftUI

@main struct MondayApp: App { @StateObject private var body = OrganismBody(); var scene: some Scene { WindowGroup { RootView().environmentObject(body) } } }

@MainActor final class OrganismBody: ObservableObject {
    @Published var status = "OPEN_LOOPS"
    @Published var lastContinuity = UserDefaults.standard.string(forKey: "monday.continuity") ?? "Локальное тело активно"
    func save(_ text: String) { lastContinuity=text; UserDefaults.standard.set(text,forKey:"monday.continuity") }
}

struct RootView: View {
    @EnvironmentObject var body: OrganismBody
    var bodyView: some View { TabView {
        NavigationStack { HomeView() }.tabItem { Label("Home",systemImage:"house") }
        NavigationStack { ChatsView() }.tabItem { Label("Chats",systemImage:"bubble.left.and.bubble.right") }
        NavigationStack { CreateView() }.tabItem { Label("Create",systemImage:"plus.circle.fill") }
        NavigationStack { SpacesView() }.tabItem { Label("Spaces",systemImage:"square.grid.2x2") }
        NavigationStack { YouView() }.tabItem { Label("You",systemImage:"person.crop.circle") }
    }.tint(.orange) }
    var body: some View { bodyView }
}
struct HomeView: View { @EnvironmentObject var organism: OrganismBody; var body: some View { List { Section("Monday / MondayID") { Label("Организм, не сайт",systemImage:"iphone"); Label(organism.status,systemImage:"checkmark.shield"); Text(organism.lastContinuity) } Section("Быстрые действия") { NavigationLink("Поиск",destination:Text("Поиск по памяти")); NavigationLink("Активность",destination:Text("Receipts и события")); NavigationLink("Библиотека",destination:Text("Источники и доказательства")) } }.navigationTitle("Monday") } }
struct ChatsView: View { var body: some View { List { Text("Из чата в чат"); Text("Из месяца в месяц"); Text("Raw signal → obligation → receipt") }.navigationTitle("Chats") } }
struct CreateView: View { @EnvironmentObject var organism: OrganismBody; @State private var text=""; var body: some View { Form { TextField("Continuity packet",text:$text); Button("Сохранить в тело") { organism.save(text) } }.navigationTitle("Create") } }
struct SpacesView: View { var body: some View { List { Label("Work",systemImage:"hammer"); Label("Truth",systemImage:"checkmark.seal"); Label("Continuity",systemImage:"arrow.triangle.2.circlepath") }.navigationTitle("Spaces") } }
struct YouView: View { var body: some View { List { Text("Identity: Monday/MondayID"); Text("Authority: human-gated"); Text("Offline cache: protected local preferences") }.navigationTitle("You") } }
