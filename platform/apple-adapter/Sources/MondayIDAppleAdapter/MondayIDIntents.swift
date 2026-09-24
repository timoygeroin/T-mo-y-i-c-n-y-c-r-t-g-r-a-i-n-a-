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
    public static let description = IntentDescription("Send a question into the canonical MondayID runtime.")
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
    public static let description = IntentDescription("Continue the current MondayID active track from canonical state.")
    public static let openAppWhenRun = true

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.continueFlow)
        do {
            let receipt = try await sendToMondayID("Continue the current active objective from canonical state without creating a new track or asking me to respecify completed context.")
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "Continued at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
    }
}

public struct RecallCapsuleIntent: AppIntent {
    public static let title: LocalizedStringResource = "Recall MondayID Capsule"
    public static let description = IntentDescription("Recall a named state capsule through the canonical MondayID runtime.")
    public static let openAppWhenRun = true

    @Parameter(title: "Capsule")
    public var capsule: String

    public init() {}

    public init(capsule: String) {
        self.capsule = capsule
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.recallCapsule(capsule))
        do {
            let receipt = try await sendToMondayID(
                "Recall the canonical MondayID capsule named “\(capsule)”. Use provenance and current Worldline state; if it is unavailable, say that it is unavailable rather than inventing it."
            )
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "Capsule request completed at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
    }
}

// Compatibility intent only. It is deliberately not exposed as a shortcut because
// Generation 5 does not treat mode/organ activation as a user-scheduled cognitive primitive.
public struct ActivateModeIntent: AppIntent {
    public static let title: LocalizedStringResource = "Legacy MondayID Operating Preference"
    public static let description = IntentDescription("Compatibility entry for older shortcuts. MondayID interprets the phrase as a task-level preference, not as a separate identity or mode.")
    public static let openAppWhenRun = true

    @Parameter(title: "Preference")
    public var mode: String

    public init() {}

    public init(mode: String) {
        self.mode = mode
    }

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.activateMode(mode))
        do {
            let receipt = try await sendToMondayID(
                "Interpret “\(mode)” as a task-level operating preference for the current objective. Do not create, activate, or switch to a separate identity or organ-mode; choose the required internal functions automatically."
            )
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "Preference applied at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
    }
}

public struct RunFieldDigestIntent: AppIntent {
    public static let title: LocalizedStringResource = "Run MondayID Field Digest"
    public static let description = IntentDescription("Read the current canonical MondayID state, active tasks, blockers and verified next actions.")
    public static let openAppWhenRun = true

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        await MondayIDCommandBus.shared.record(.runFieldDigest)
        do {
            let receipt = try await sendToMondayID(
                "Read the current canonical MondayID field. Return active tasks, verified receipts, real blockers, unresolved material obligations, and the next admissible actions. Do not replace state with a generic summary."
            )
            return .result(dialog: IntentDialog(stringLiteral: receipt.result ?? "Field digest completed at state \(receipt.stateRevision)"))
        } catch MondayIDRuntimeError.notConfigured {
            return .result(dialog: "Open MondayID once to connect its runtime")
        }
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
            intent: RunFieldDigestIntent(),
            phrases: ["Run field digest in \(.applicationName)"],
            shortTitle: "Field Digest",
            systemImageName: "waveform.path.ecg"
        )
    }
}
