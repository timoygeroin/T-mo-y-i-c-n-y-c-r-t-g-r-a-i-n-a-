import SwiftUI
import RealityKit
import UIKit
import Combine

@MainActor
struct VelvetRoom: View {
    let send: @MainActor (String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @StateObject private var audio = VelvetAudio()
    @StateObject private var mic = VelvetMic()
    @State private var draft = ""
    @State private var reply = ""
    @State private var problem = ""
    @State private var loadingIssue = ""
    @State private var waiting = false
    @AppStorage("velvet.palette") private var palette = 0
    @AppStorage("velvet.outfit") private var outfit = 0
    @AppStorage("velvet.lighting") private var lighting = 0
    @AppStorage("velvet.camera") private var camera = 0
    @State private var showKeyboard = false
    @State private var active = true
    private let outfits = ["Спортивный", "Вечерний", "Городской"]
    private let palettes = ["Ткань комплекта", "Морская волна", "Медь"]
    private let lights = ["Дневной свет", "Закат", "Ночной город"]
    var body: some View {
        ZStack {
            VelvetStage(audio: audio, palette: palette, outfit: outfit, lighting: lighting, camera: camera, problem: $loadingIssue).ignoresSafeArea()
            VStack {
                HStack {
                    Button { dismiss() } label: { Image(systemName: "chevron.down").frame(width: 36, height: 36) }
                    Spacer()
                    Button { camera = (camera + 1) % 3 } label: { Image(systemName: "viewfinder").frame(width: 36, height: 36) }
                        .accessibilityLabel("Сменить расстояние")
                    Menu {
                        Picker("Комплект", selection: $outfit) {
                            ForEach(outfits.indices, id: \.self) { Text(outfits[$0]).tag($0) }
                        }
                        Picker("Цвет ткани", selection: $palette) {
                            ForEach(palettes.indices, id: \.self) { Text(palettes[$0]).tag($0) }
                        }
                    } label: { Image(systemName: "tshirt").frame(width: 36, height: 36) }
                        .accessibilityLabel("Гардероб")
                    Menu {
                        Picker("Освещение", selection: $lighting) {
                            ForEach(lights.indices, id: \.self) { Text(lights[$0]).tag($0) }
                        }
                    } label: { Image(systemName: "sun.max").frame(width: 36, height: 36) }
                        .accessibilityLabel("Свет студии")
                }.padding(8).background(.ultraThinMaterial, in: Capsule())
                Spacer()
                VStack(spacing: 9) {
                    if !loadingIssue.isEmpty { Text(loadingIssue).font(.footnote) }
                    if !reply.isEmpty { ScrollView { Text(reply).frame(maxWidth: .infinity, alignment: .leading) }.frame(maxHeight: 72) }
                    let indicator = !problem.isEmpty ? problem : !mic.status.isEmpty ? mic.status : waiting ? "Думаю" : mic.listening ? "Слушаю" : audio.status
                    if !indicator.isEmpty { Text(indicator).font(.caption) }
                    if showKeyboard || mic.listening {
                        TextField("Скажи или напиши", text: $draft, axis: .vertical)
                            .lineLimit(1...4).textFieldStyle(.roundedBorder)
                    }
                    HStack(spacing: 26) {
                        Button { showKeyboard.toggle() } label: { Image(systemName: "keyboard") }.accessibilityLabel("Клавиатура")
                        Button { microphone() } label: {
                            Image(systemName: mic.listening ? "stop.fill" : "mic.fill").font(.title3)
                                .frame(width: 55, height: 48).background(mic.listening ? Color.red : Color.teal, in: Capsule())
                        }.accessibilityLabel(mic.listening ? "Закончить фразу" : "Говорить").disabled(waiting)
                        if audio.busy {
                            Button { audio.stop() } label: { Image(systemName: "speaker.slash.fill") }.accessibilityLabel("Прервать ответ")
                        } else {
                            Button { submit(draft) } label: { Image(systemName: "arrow.up.circle.fill") }
                                .disabled(waiting || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("Отправить")
                        }
                    }
                }.padding(14).background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20))
            }.padding(.horizontal, 14).padding(.vertical, 8)
        }
        .preferredColorScheme(.dark)
        .onDisappear { active = false; mic.stop(); audio.stop() }
    }
    private func microphone() {
        if mic.listening { mic.stop(); submit(draft); return }
        audio.stop(); problem = ""; draft = ""
        Task { await mic.start(partial: { draft = $0 }, final: { submit($0) }) }
    }
    private func submit(_ input: String) {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !waiting, active else { return }
        mic.stop(); audio.stop(); waiting = true; problem = ""; draft = ""; showKeyboard = false
        Task {
            let response = await send(text); waiting = false
            guard active else { return }
            if let response { reply = response; audio.say(response) }
            else { problem = "Ответ не получен. Сообщение сохранено в чате MondayID." }
        }
    }
}

@MainActor private struct VelvetStage: UIViewRepresentable {
    let audio: VelvetAudio, palette: Int, outfit: Int, lighting: Int, camera: Int
    @Binding var problem: String
    func makeCoordinator() -> Coordinator { Coordinator(audio: audio) }
    func makeUIView(context: Context) -> ARView {
        let view = ARView(frame: .zero, cameraMode: .nonAR, automaticallyConfigureSession: false)
        context.coordinator.attach(view: view) { problem = $0 }
        return view
    }
    func updateUIView(_ view: ARView, context: Context) {
        context.coordinator.selectCamera(camera)
        context.coordinator.tint(palette)
        context.coordinator.light(lighting)
        context.coordinator.wear(outfit) { problem = $0 }
    }
    static func dismantleUIView(_ uiView: ARView, coordinator: Coordinator) { coordinator.close() }

    @MainActor final class Coordinator: NSObject {
        private let audio: VelvetAudio, root = AnchorEntity(world: .zero), camera = PerspectiveCamera()
        private var task: Task<Void,Never>?, link: CADisplayLink?, cameraIndex = -1, tintIndex = 0
        private var avatarTask: Task<Void, Never>?
        private var selectedOutfit: Int?
        private var avatar: Entity?
        private var lamps: [DirectionalLight] = []
        private var face: [Entity] = [], clothes: [(Entity, ModelComponent)] = []
        private var yaw: Float = 0.08, pitch: Float = 0.11, distance: Float = 1.15
        private var center = SIMD3<Float>(0, 1.15, 0)
        private weak var view: ARView?
        init(audio: VelvetAudio) { self.audio = audio }
        func attach(view: ARView, error: @escaping @MainActor (String) -> Void) {
            self.view = view
            view.environment.background = .color(UIColor(red: 0.10, green: 0.15, blue: 0.18, alpha: 1))
            root.addChild(camera); view.scene.addAnchor(root)
            camera.camera.fieldOfViewInDegrees = 51
            for (position, intensity, color) in [(SIMD3<Float>(-1.6,2.7,1.8), Float(1800), UIColor(red: 1,green: 0.89,blue: 0.81,alpha: 1)), (SIMD3<Float>(1.6,1.5,1.0),Float(800),UIColor(red: 0.72,green: 0.86,blue: 1,alpha: 1))] {
                let light = DirectionalLight(); light.light.intensity = intensity; light.light.color = color
                lamps.append(light); root.addChild(light); light.look(at: [0,1,0],from: position,relativeTo: nil)
            }
            let one = UIPanGestureRecognizer(target: self,action: #selector(orbit(_:))); one.maximumNumberOfTouches = 1
            let two = UIPanGestureRecognizer(target: self,action: #selector(moveCenter(_:))); two.minimumNumberOfTouches = 2
            view.addGestureRecognizer(one); view.addGestureRecognizer(two)
            view.addGestureRecognizer(UIPinchGestureRecognizer(target: self, action: #selector(zoom(_:))))
            task = Task {
                do {
                    guard let roomURL = Bundle.main.url(forResource: "VelvetStudio", withExtension: "usdz")
                    else { throw VelvetIssue.message("Файл студии не найден.") }
                    let room = try await Entity(contentsOf: roomURL)
                    try Task.checkCancellation()
                    root.addChild(room)
                    let display = CADisplayLink(target:self,selector:#selector(tick(_:)));display.preferredFramesPerSecond = 24;display.add(to:.main,forMode:.common);link = display
                } catch is CancellationError {} catch let failure { if !Task.isCancelled { error(failure.localizedDescription) } }
            }
        }
        func wear(_ index: Int, error: @escaping @MainActor (String) -> Void) {
            let resources = ["VelvetListening", "VelvetEvening", "VelvetStreet"]
            guard resources.indices.contains(index), selectedOutfit != index else { return }
            selectedOutfit = index
            avatarTask?.cancel()
            avatarTask = Task {
                do {
                    guard let url = Bundle.main.url(forResource: resources[index], withExtension: "usdz")
                    else { throw VelvetIssue.message("Комплект отсутствует в сборке.") }
                    let fresh = try await Entity(contentsOf: url)
                    try Task.checkCancellation()
                    face.removeAll()
                    clothes.removeAll()
                    inspect(fresh, costume: false)
                    avatar?.removeFromParent()
                    root.addChild(fresh)
                    avatar = fresh
                    applyTint()
                    error(face.isEmpty ? "Мимика недоступна на этом устройстве." : "")
                } catch is CancellationError {
                } catch let failure {
                    if !Task.isCancelled { error(failure.localizedDescription) }
                }
            }
        }

        private func inspect(_ entity: Entity, costume: Bool) {
            let suit = costume || entity.name == "TrainingSet" || entity.name.hasPrefix("female_")
            if let model = entity.components[ModelComponent.self] {
                let morphs = entity.components[BlendShapeWeightsComponent.self] ?? BlendShapeWeightsComponent(weightsMapping: .init(meshResource: model.mesh))
                if !morphs.weightSet.isEmpty {
                    entity.components.set(morphs)
                    face.append(entity)
                }
                if suit { clothes.append((entity, model)) }
            }
            if let clip = entity.availableAnimations.first { entity.playAnimation(clip.repeat()) }
            for child in entity.children { inspect(child, costume: suit) }
        }

        private var lightIndex: Int?
        func light(_ index: Int) {
            guard lamps.count == 2, lightIndex != index else { return }
            lightIndex = index
            let setup: (UIColor, Float, UIColor, Float, Float)
            switch index {
            case 1: setup = (UIColor(red: 1, green: 0.57, blue: 0.33, alpha: 1), 1670, .systemPink, 570, -0.55)
            case 2: setup = (UIColor(red: 0.43, green: 0.67, blue: 1, alpha: 1), 1050, .systemPink, 820, -1.6)
            default: setup = (UIColor(red: 1, green: 0.89, blue: 0.81, alpha: 1), 1800, UIColor(red: 0.72, green: 0.86, blue: 1, alpha: 1), 800, 0)
            }
            lamps[0].light.color = setup.0
            lamps[0].light.intensity = setup.1
            lamps[1].light.color = setup.2
            lamps[1].light.intensity = setup.3
            view?.environment.lighting.intensityExponent = setup.4
        }

        func close() {
            task?.cancel()
            avatarTask?.cancel()
            link?.invalidate()
            link = nil
            root.removeFromParent()
            face.removeAll()
            clothes.removeAll()
        }
        func selectCamera(_ index: Int) {
            guard cameraIndex != index else { return }; cameraIndex = index
            let presets: [(Float, Float, SIMD3<Float>)] = [(0.08,1.19,[0,1.16,0]),(-0.15,2.23,[0,0.81,0]),(-0.62,2.7,[0.05,1.04,-0.08])]
            let p = presets[index % presets.count]; yaw = p.0; distance = p.1; center = p.2; pitch = 0.10; move()
        }
        func tint(_ index: Int) { if index != tintIndex { tintIndex = index; applyTint() } }
        private func applyTint() {
            for (entity, original) in clothes {
                var model = original
                if tintIndex != 0 {
                    let color = tintIndex == 1 ? UIColor(red:0.13,green:0.48,blue:0.44,alpha:1) : UIColor(red:0.72,green:0.34,blue:0.20,alpha:1)
                    model.materials = original.materials.map { _ in SimpleMaterial(color: color, roughness: 0.66, isMetallic: false) }
                }
                entity.components.set(model)
            }
        }
        @objc private func tick(_ link: CADisplayLink) {
            var values = audio.weights()
            let phase = link.timestamp.truncatingRemainder(dividingBy: 4.1)
            let blink = Float(max(0, 1 - abs(phase - 2.2) / 0.105))
            for name in ["eyeBlinkLeft","eyeBlinkRight"] { values[name] = max(blink,values[name] ?? 0) }
            for entity in face {
                guard var comp = entity.components[BlendShapeWeightsComponent.self] else { continue }
                var set = comp.weightSet
                for var group in comp.weightSet {
                    var ws = group.weights
                    for (i,name) in group.weightNames.enumerated() where i < ws.count {
                        let key = name.trimmingCharacters(in: .decimalDigits)
                        ws[i] = values[key] ?? 0
                    }
                    group.weights = ws; set.set(group)
                }
                comp.weightSet = set; entity.components.set(comp)
            }
        }
        @objc private func orbit(_ gesture: UIPanGestureRecognizer) {
            let delta = gesture.translation(in: view);gesture.setTranslation(.zero,in:view)
            yaw -= Float(delta.x)*0.006; pitch = max(-0.58,min(0.72,pitch + Float(delta.y)*0.004)); move()
        }
        @objc private func moveCenter(_ gesture: UIPanGestureRecognizer) {
            let delta=gesture.translation(in:view);gesture.setTranslation(.zero,in:view)
            center.x = max(-1.2,min(1.2,center.x-Float(delta.x)*0.002*cos(yaw)))
            center.z = max(-1.4,min(1.4,center.z+Float(delta.x)*0.002*sin(yaw)))
            center.y = max(0.3,min(1.8,center.y+Float(delta.y)*0.002)); move()
        }
        @objc private func zoom(_ gesture: UIPinchGestureRecognizer) {
            distance = max(0.45,min(2.9,distance/Float(gesture.scale)));gesture.scale=1; move()
        }
        private func move() {
            var from = center + SIMD3<Float>(sin(yaw)*cos(pitch),sin(pitch),cos(yaw)*cos(pitch))*distance
            from.x = max(-3.05,min(3.05,from.x));from.y = max(0.12,min(2.73,from.y));from.z = max(-2.62,min(2.85,from.z))
            camera.look(at:center,from:from,relativeTo:nil)
        }
    }
}
