import Foundation
import NaturalLanguage
@preconcurrency import AVFoundation
@preconcurrency import Speech
import SwiftUI

enum VelvetIssue: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

private struct ChannelSpec: Decodable, Sendable {
    let names: [String], emotion: [Float]
    let fps: Int, rate: Int, window: Int
}
struct VelvetTrack: Sendable {
    let names: [String], weights: [Float], fps: Int
    func values(at seconds: Double) -> [String: Float] {
        let width = names.count
        guard width > 0, weights.count >= width else { return [:] }
        let index = max(0, min(Int(seconds * Double(fps)), weights.count / width - 1)) * width
        return Dictionary(uniqueKeysWithValues: zip(names, weights[index..<(index + width)]))
    }
}

private final class FaceHandle: @unchecked Sendable {
    let pointer: OpaquePointer
    init(url: URL) throws {
        var message = [CChar](repeating: 0, count: 512)
        guard let handle = velvet_face_open(url.path, &message, 512) else {
            throw VelvetIssue.message(String(cString: message))
        }
        pointer = handle
    }
    deinit { velvet_face_close(pointer) }
}

private actor VelvetInference {
    private var handle: FaceHandle?
    private var configuration: ChannelSpec?
    func render(_ url: URL) throws -> VelvetTrack {
        if handle == nil || configuration == nil {
            guard let network = Bundle.main.url(forResource: "VelvetClaire", withExtension: "onnx"),
                  let metadata = Bundle.main.url(forResource: "VelvetChannels", withExtension: "json")
            else { throw VelvetIssue.message("В сборке отсутствует модель лица.") }
            let spec = try JSONDecoder().decode(ChannelSpec.self, from: Data(contentsOf: metadata))
            guard spec.names.count == 52, Set(spec.names).count == 52, spec.emotion.count == 26,
                  spec.window == 8320, spec.rate == 16000, spec.fps == 24
            else { throw VelvetIssue.message("Не совпадают каналы анимации.") }
            handle = try FaceHandle(url: network); configuration = spec
        }
        guard let handle, let spec = configuration else { throw VelvetIssue.message("Модель лица недоступна.") }
        let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
        let format = file.processingFormat
        guard file.length > 0, file.length <= Int64(format.sampleRate * 150),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(file.length))
        else { throw VelvetIssue.message("Не удалось прочитать звук этой фразы.") }
        try file.read(into: buffer)
        guard let channels = buffer.floatChannelData, buffer.frameLength > 0 else { throw VelvetIssue.message("Запись пуста.") }
        let ratio = format.sampleRate / Double(spec.rate), originalCount = Int(buffer.frameLength)
        let samples = max(1, Int(Double(originalCount) / ratio))
        var mono = [Float](repeating: 0, count: samples)
        for i in 0..<samples {
            let t = Double(i) * ratio, left = min(Int(t), originalCount - 1), right = min(left + 1, originalCount - 1)
            let fraction = Float(t - Double(left))
            for c in 0..<Int(format.channelCount) {
                mono[i] += ((1 - fraction) * channels[c][left] + fraction * channels[c][right]) / Float(format.channelCount)
            }
        }
        let frames = max(1, Int(ceil(Double(samples * spec.fps) / Double(spec.rate))))
        var weights: [Float] = []
        weights.reserveCapacity(frames * 52)
        for first in stride(from: 0, to: frames, by: 4) {
            try Task.checkCancellation()
            let count = min(4, frames - first)
            var audio = [Float](repeating: 0, count: count * spec.window)
            for j in 0..<count {
                let start = Int((Double((first + j) * spec.rate) / Double(spec.fps)).rounded()) - spec.window / 2
                let lo = max(0, start), hi = min(mono.count, start + spec.window)
                if hi > lo {
                    let offset = j * spec.window + lo - start
                    audio.replaceSubrange(offset..<(offset + hi - lo), with: mono[lo..<hi])
                }
            }
            var batch = [Float](repeating: 0, count: count * 52), error = [CChar](repeating: 0, count: 512)
            guard velvet_face_predict(handle.pointer, audio, spec.emotion, Int32(count), &batch, &error, 512) == 1,
                  batch.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 1 }) else {
                throw VelvetIssue.message(String(cString: error))
            }
            weights.append(contentsOf: batch)
        }
        return VelvetTrack(names: spec.names, weights: weights, fps: spec.fps)
    }
}

// Apple's speech synthesizer delivers PCM on its own serial callback. The lock also protects cancellation.
private final class VelvetWriter: @unchecked Sendable {
    private let lock = NSLock(), url: URL
    private var file: AVAudioFile?, continuation: CheckedContinuation<Void, Error>?
    init(url: URL, continuation: CheckedContinuation<Void, Error>) { self.url = url; self.continuation = continuation }
    func accept(_ raw: AVAudioBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard let completion = continuation else { return }
        do {
            guard let pcm = raw as? AVAudioPCMBuffer else { throw VelvetIssue.message("Неверный формат голоса.") }
            if pcm.frameLength > 0 {
                if file == nil { file = try AVAudioFile(forWriting: url, settings: pcm.format.settings) }
                try file?.write(from: pcm)
            } else {
                guard file != nil else { throw VelvetIssue.message("Синтезатор вернул пустой звук.") }
                file = nil; continuation = nil; completion.resume()
            }
        } catch { file = nil; continuation = nil; completion.resume(throwing: error) }
    }
    func cancel() {
        lock.lock(); defer { lock.unlock() }
        file = nil; let pending = continuation; continuation = nil; pending?.resume(throwing: CancellationError())
    }
}

@MainActor final class VelvetAudio: ObservableObject {
    @Published var status = ""
    @Published var busy = false
    private let model = VelvetInference(), synth = AVSpeechSynthesizer()
    private var writer: VelvetWriter?, player: AVAudioPlayer?, track: VelvetTrack?
    private var job: Task<Void, Never>?, generation = UUID()
    func weights() -> [String: Float] {
        guard let player, player.isPlaying, let track else { return [:] }
        return track.values(at: player.currentTime)
    }
    func stop() {
        generation = UUID(); job?.cancel(); job = nil; writer?.cancel(); writer = nil
        synth.stopSpeaking(at: .immediate); player?.stop(); player = nil; track = nil; busy = false; status = ""
    }
    func say(_ text: String) {
        stop()
        let token = generation; busy = true
        job = Task {
            defer { if token == generation { busy = false; player = nil; track = nil; writer = nil } }
            do {
                let tokenizer = NLTokenizer(unit: .sentence); tokenizer.string = text
                let phrases = tokenizer.tokens(for: text.startIndex..<text.endIndex).map { String(text[$0]) }
                for phrase in phrases.isEmpty ? [text] : phrases {
                    try Task.checkCancellation()
                    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".caf")
                    defer { try? FileManager.default.removeItem(at: url) }
                    status = "Готовлю голос"
                    let utterance = AVSpeechUtterance(string: phrase)
                    let lang = phrase.unicodeScalars.contains { (0x0400...0x04FF).contains($0.value) } ? "ru-RU" : "en-US"
                    utterance.voice = AVSpeechSynthesisVoice.speechVoices().filter { $0.language == lang && $0.gender == .female }.max { $0.quality.rawValue < $1.quality.rawValue } ?? AVSpeechSynthesisVoice(language: lang)
                    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                        let sink = VelvetWriter(url: url, continuation: continuation); writer = sink
                        synth.write(utterance) { @Sendable buffer in sink.accept(buffer) }
                    }
                    try Task.checkCancellation(); status = "Готовлю мимику"
                    let generated = try await model.render(url)
                    try Task.checkCancellation()
                    let session = AVAudioSession.sharedInstance()
                    try session.setCategory(.playback, mode: .spokenAudio); try session.setActive(true)
                    let output = try AVAudioPlayer(contentsOf: url); player = output; track = generated
                    guard output.play() else { throw VelvetIssue.message("Не удалось начать воспроизведение.") }
                    status = ""
                    while output.isPlaying { try await Task.sleep(for: .milliseconds(50)) }
                    try Task.checkCancellation()
                    track = nil; player = nil
                }
            } catch is CancellationError {} catch { if token == generation { status = error.localizedDescription } }
        }
    }
}

@MainActor final class VelvetMic: ObservableObject {
    @Published var listening = false
    @Published var status = ""
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?, task: SFSpeechRecognitionTask?
    private var tap = false, sessionID = UUID()
    func stop() {
        sessionID = UUID(); engine.stop()
        if tap { engine.inputNode.removeTap(onBus: 0); tap = false }
        request?.endAudio(); task?.cancel(); task = nil; request = nil; listening = false
    }
    func start(partial: @escaping @MainActor (String) -> Void, final: @escaping @MainActor (String) -> Void) async {
        stop(); status = ""; let id = sessionID
        let permission = await withCheckedContinuation { c in SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) } }
        let mic = await AVAudioApplication.requestRecordPermission()
        guard id == sessionID else { return }
        guard permission == .authorized && mic else { status = "Для разговора нужен доступ к микрофону и распознаванию речи."; return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru-RU")), recognizer.isAvailable else { status = "Русское распознавание речи сейчас недоступно."; return }
        do {
            let session = AVAudioSession.sharedInstance(); try session.setCategory(.playAndRecord, mode: .measurement, options: [.defaultToSpeaker]); try session.setActive(true)
            let req = SFSpeechAudioBufferRecognitionRequest(); req.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }; request = req
            let input = engine.inputNode, format = input.outputFormat(forBus: 0)
            guard format.channelCount > 0 && format.sampleRate > 0 else { throw VelvetIssue.message("Устройство ввода недоступно.") }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { @Sendable buffer, _ in req.append(buffer) }; tap = true
            engine.prepare(); try engine.start(); listening = true
            task = recognizer.recognitionTask(with: req) { @Sendable result, error in
                let phrase = result?.bestTranscription.formattedString, done = result?.isFinal == true, message = error?.localizedDescription
                Task { @MainActor [weak self] in
                    guard let self, self.sessionID == id else { return }
                    if let phrase { partial(phrase) }
                    if done, let phrase { self.stop(); final(phrase) }
                    else if let message { self.stop(); self.status = message }
                }
            }
        } catch { stop(); status = error.localizedDescription }
    }
}
