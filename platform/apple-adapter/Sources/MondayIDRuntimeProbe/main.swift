import Foundation
import MondayIDAppleAdapter

@main
struct MondayIDRuntimeProbe {
    static func main() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let rawEndpoint = environment["MONDAYID_PROBE_ENDPOINT"],
              let endpoint = URL(string: rawEndpoint),
              let token = environment["MONDAYID_PROBE_TOKEN"],
              !token.isEmpty else {
            throw ProbeError.configuration
        }

        let signal = environment["MONDAYID_PROBE_SIGNAL"] ?? "continue Monday"
        let client = MondayIDRuntimeClient(endpoint: endpoint, controlToken: token)
        let health = try await client.health()
        guard health.isReady else { throw ProbeError.unhealthy }

        let receipt = try await client.submit(signal: signal)
        guard receipt.status == "executed",
              receipt.result == "wire:\(signal):after:0",
              receipt.receiptId == "wire-r-1",
              receipt.providerId == "wire-provider",
              receipt.stateRevision == 1 else {
            throw ProbeError.unexpectedReceipt(receipt)
        }

        print("MONDAYID_SWIFT_NODE_WIRE_PASS")
        print("health=\(health.runtime)/durable=\(health.durable)")
        print("receipt=\(receipt.receiptId)/revision=\(receipt.stateRevision)/status=\(receipt.status)")
    }
}

private enum ProbeError: Error, CustomStringConvertible {
    case configuration
    case unhealthy
    case unexpectedReceipt(MondayIDRuntimeReceipt)

    var description: String {
        switch self {
        case .configuration:
            return "Missing probe endpoint or token"
        case .unhealthy:
            return "Runtime health contract rejected"
        case .unexpectedReceipt(let receipt):
            return "Unexpected receipt: \(receipt)"
        }
    }
}
