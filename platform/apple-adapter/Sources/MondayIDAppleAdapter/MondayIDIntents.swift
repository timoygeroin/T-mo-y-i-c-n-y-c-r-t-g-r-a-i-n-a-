import AppIntents
import Foundation

public enum MondayIDCommand: Sendable, Equatable {
    case open
    case ask(String)
    case continueFlow
    case recallCapsule(String)
    case activateMode(String)
    case runFieldDigest
}

public actor MondayIDCommandBus {
    public static let shared = MondayIDCommandBus()

    private var history: [MondayIDCommand] = []

    public init() {}

    public func record(_ command: MondayIDCommand) {
        history.append(command)
    }

    public func snapshot() -> [MondayIDCommand] {
        history
    }

    public func reset() {
        history.removeAll()
    }
}

public struct OpenMondayIntent: AppIntent {
    public static let title: LocalizedStringResource = "Open MondayID"
    public static let description = IntentDescription("Open or foreground the MondayID experience.")
    public static let openAppWhenRun = true

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.open)
        return .result(dialog: "Opening MondayID")
    }
}

public struct AskMondayIntent: AppIntent {
    public static let title: LocalizedStringResource = "Ask MondayID"
    public static let description = IntentDescription("Send a question into the MondayID command path.")
    public static let openAppWhenRun = true

    @Parameter(title: "Question")
    public var question: String

    public init() {}

    public init(question: String) {
        self.question = question
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.ask(question))
        do {
            let receipt = try await sendToMondayID(question)
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "MondayID continued at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
    }
}

public struct ContinueMondayIntent: AppIntent {
    public static let title: LocalizedStringResource = "Continue MondayID"
    public static let description = IntentDescription("Continue the current MondayID active track.")
    public static let openAppWhenRun = true

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.continueFlow)
        do {
            let receipt = try await sendToMondayID("Continue the current active objective from canonical state")
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "Continued at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
    }
}

public struct RecallCapsuleIntent: AppIntent {
    public static let title: LocalizedStringResource = "Recall MondayID Capsule"
    public static let description = IntentDescription("Request a named MondayID state or memory capsule.")
    public static let openAppWhenRun = true

    @Parameter(title: "Capsule")
    public var capsule: String

    public init() {}

    public init(capsule: String) {
        self.capsule = capsule
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.recallCapsule(capsule))
        return .result(dialog: "Capsule request handed to MondayID")
    }
}

public struct ActivateModeIntent: AppIntent {
    public static let title: LocalizedStringResource = "Activate MondayID Mode"
    public static let description = IntentDescription("Activate a named MondayID mode without pretending the mode exists if the runtime rejects it.")
    public static let openAppWhenRun = true

    @Parameter(title: "Mode")
    public var mode: String

    public init() {}

    public init(mode: String) {
        self.mode = mode
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.activateMode(mode))
        return .result(dialog: "Mode request handed to MondayID")
    }
}

public struct RunFieldDigestIntent: AppIntent {
    public static let title: LocalizedStringResource = "Run MondayID Field Digest"
    public static let description = IntentDescription("Request a digest of the current MondayID field/state.")
    public static let openAppWhenRun = true

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.runFieldDigest)
        return .result(dialog: "Field digest requested")
    }
}

public struct MondayIDShortcuts: AppShortcutsProvider {
    public static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenMondayIntent(),
            phrases: ["Open \(.applicationName)"],
            shortTitle: "Open MondayID",
            systemImageName: "circle.hexagongrid"
        )
        AppShortcut(
            intent: AskMondayIntent(),
            phrases: ["Ask \(.applicationName)"],
            shortTitle: "Ask MondayID",
            systemImageName: "message"
        )
        AppShortcut(
            intent: ContinueMondayIntent(),
            phrases: ["Continue \(.applicationName)"],
            shortTitle: "Continue MondayID",
            systemImageName: "arrow.forward.circle"
        )
        AppShortcut(
            intent: RecallCapsuleIntent(),
            phrases: ["Recall a capsule in \(.applicationName)"],
            shortTitle: "Recall Capsule",
            systemImageName: "archivebox"
        )
        AppShortcut(
            intent: ActivateModeIntent(),
            phrases: ["Activate a mode in \(.applicationName)"],
            shortTitle: "Activate Mode",
            systemImageName: "switch.2"
        )
        AppShortcut(
            intent: RunFieldDigestIntent(),
            phrases: ["Run field digest in \(.applicationName)"],
            shortTitle: "Field Digest",
            systemImageName: "waveform.path.ecg"
        )
    }
}
