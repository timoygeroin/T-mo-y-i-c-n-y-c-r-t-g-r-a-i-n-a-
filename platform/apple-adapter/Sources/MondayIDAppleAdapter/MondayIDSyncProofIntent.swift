import AppIntents
import Foundation

/// iPhone-only evidence that the pinned GitHub event can be retrieved by Siri/App Intents.
/// A local receipt is not a remote ACK and does not establish production Worldline sync.
public enum MondayIDSyncProof {
    public static let expectedEventID = "mondayid-pos-20261114-chatgpt-001"
    private static let sourceURL = URL(string: "https://raw.githubusercontent.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/037904d3e024d14a5b7ed3bbfff885dd4ca763a9/proof/sync/MONDAYID_PROOF_OF_SYNC_20261114_CHATGPT.json")!
    private static let receiptKey = "mondayid.ios.sync-proof-readback.v1"

    private struct Event: Decodable {
        let schema: String
        let event_id: String
        let origin: String
        let target: String
        let state: String
    }

    private struct LocalReceipt: Codable {
        let eventID: String
        let sourceURL: String
        let recordedAt: Date
        let scope: String
    }

    public enum Failure: LocalizedError {
        case physicalDeviceRequired
        case badHTTPResponse
        case invalidEvent
        case failedLocalReadback

        public var errorDescription: String? {
            switch self {
            case .physicalDeviceRequired: "Run this on a physical iPhone"
            case .badHTTPResponse: "GitHub proof was not available"
            case .invalidEvent: "The event did not match the expected proof"
            case .failedLocalReadback: "The local receipt could not be read back"
            }
        }
    }

    /// No token or write permission is needed. This records only local GitHub readback.
    public static func verifyOnDevice(session: URLSession = .shared) async throws -> String {
        #if targetEnvironment(simulator)
        throw Failure.physicalDeviceRequired
        #else
        var request = URLRequest(url: sourceURL)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 12

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse,
              http.statusCode == 200,
              !data.isEmpty, data.count <= 16_384 else {
            throw Failure.badHTTPResponse
        }

        let event = try JSONDecoder().decode(Event.self, from: data)
        guard event.schema == "mondayid.proof-of-sync.v1",
              event.event_id == expectedEventID,
              event.origin == "chatgpt-monday",
              event.target == "ios-monday",
              event.state == "PENDING_REMOTE_ACK" else {
            throw Failure.invalidEvent
        }

        let receipt = LocalReceipt(
            eventID: event.event_id,
            sourceURL: sourceURL.absoluteString,
            recordedAt: Date(),
            scope: "GITHUB_EVENT_READ_ON_IPHONE_ONLY_NOT_WORLDLINE_SYNC"
        )
        let encoded = try JSONEncoder().encode(receipt)
        UserDefaults.standard.set(encoded, forKey: receiptKey)
        guard let saved = UserDefaults.standard.data(forKey: receiptKey),
              let decoded = try? JSONDecoder().decode(LocalReceipt.self, from: saved),
              decoded.eventID == receipt.eventID,
              decoded.sourceURL == receipt.sourceURL,
              decoded.scope == receipt.scope else {
            throw Failure.failedLocalReadback
        }
        return event.event_id
        #endif
    }
}

public struct CheckMondaySyncIntent: AppIntent {
    public static let title: LocalizedStringResource = "Check MondayID Sync Proof"
    public static let description = IntentDescription("Read the MondayID proof event from GitHub on this iPhone. This does not verify production sync.")
    public static let openAppWhenRun = false

    public init() {}

    public func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            let eventID = try await MondayIDSyncProof.verifyOnDevice()
            return .result(dialog: IntentDialog(stringLiteral: "MondayID verified GitHub event \(eventID) on this iPhone and saved a local receipt. Production synchronization is not yet verified."))
        } catch {
            return .result(dialog: IntentDialog(stringLiteral: "MondayID iPhone sync proof not verified: \(error.localizedDescription)"))
        }
    }
}
