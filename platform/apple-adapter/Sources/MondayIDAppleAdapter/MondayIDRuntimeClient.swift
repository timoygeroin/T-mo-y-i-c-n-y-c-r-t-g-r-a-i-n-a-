import Foundation
import Security

public struct MondayIDRuntimeContinuity: Codable, Sendable, Equatable {
    public let trustedWorldlineConfigured: Bool
    public let trustedWriterConfigured: Bool
    public let schema: String?
    public let transport: String?

    public init(trustedWorldlineConfigured: Bool, trustedWriterConfigured: Bool, schema: String?, transport: String?) {
        self.trustedWorldlineConfigured = trustedWorldlineConfigured
        self.trustedWriterConfigured = trustedWriterConfigured
        self.schema = schema
        self.transport = transport
    }

    enum CodingKeys: String, CodingKey {
        case trustedWorldlineConfigured = "trusted_worldline_configured"
        case trustedWriterConfigured = "trusted_writer_configured"
        case schema
        case transport
    }
}

public struct MondayIDRuntimeHealth: Codable, Sendable, Equatable {
    public let ok: Bool
    public let product: String
    public let generation: Int
    public let kernel: String
    public let runtime: String
    public let continuity: MondayIDRuntimeContinuity
    public let cutover: String

    public init(
        ok: Bool,
        product: String,
        generation: Int,
        kernel: String,
        runtime: String,
        continuity: MondayIDRuntimeContinuity,
        cutover: String
    ) {
        self.ok = ok
        self.product = product
        self.generation = generation
        self.kernel = kernel
        self.runtime = runtime
        self.continuity = continuity
        self.cutover = cutover
    }

    public var isReady: Bool {
        ok &&
        product == "MondayID" &&
        generation == 5 &&
        kernel == "mondayid-generation-5" &&
        runtime == "vercel-node-function" &&
        continuity.trustedWorldlineConfigured &&
        cutover == "generation-5"
    }
}

public struct MondayIDRuntimeReceipt: Codable, Sendable, Equatable {
    public let status: String
    public let result: String?
    public let receiptId: String
    public let providerId: String
    public let stateRevision: String

    public init(status: String, result: String?, receiptId: String, providerId: String, stateRevision: String) {
        self.status = status
        self.result = result
        self.receiptId = receiptId
        self.providerId = providerId
        self.stateRevision = stateRevision
    }
}

private struct MondayIDHostSurface: Codable {
    let released: Bool
    let message: String
}

private struct MondayIDHostReceipt: Codable {
    let id: String
    let provider: String
    let revision: String
}

private struct MondayIDHostResponse: Codable {
    let ok: Bool
    let state: String
    let surface: MondayIDHostSurface
    let receipt: MondayIDHostReceipt?
}

public enum MondayIDRuntimeError: Error, LocalizedError, Equatable {
    case notConfigured
    case invalidResponse(Int)
    case unhealthyRuntime
    case unreleasedSurface
    case missingReceipt

    public var errorDescription: String? {
        switch self {
        case .notConfigured: "MondayID runtime is not configured"
        case .invalidResponse(let status): "MondayID runtime returned HTTP \(status)"
        case .unhealthyRuntime: "Endpoint is not a verified Generation-5 MondayID runtime"
        case .unreleasedSurface: "MondayID runtime did not release a verified surface"
        case .missingReceipt: "MondayID runtime released output without a durable receipt"
        }
    }
}

public struct MondayIDRuntimeClient: Sendable {
    public let endpoint: URL
    private let controlToken: String
    private let session: URLSession

    public init(endpoint: URL, controlToken: String, session: URLSession = .shared) {
        self.endpoint = endpoint
        self.controlToken = controlToken
        self.session = session
    }

    private func apiURL(_ path: String) -> URL {
        endpoint.appendingPathComponent("api").appendingPathComponent(path)
    }

    public func health() async throws -> MondayIDRuntimeHealth {
        var request = URLRequest(url: apiURL("health"))
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw MondayIDRuntimeError.invalidResponse(status) }
        let health = try JSONDecoder().decode(MondayIDRuntimeHealth.self, from: data)
        guard health.isReady else { throw MondayIDRuntimeError.unhealthyRuntime }
        return health
    }

    public func submit(signal: String) async throws -> MondayIDRuntimeReceipt {
        var request = URLRequest(url: apiURL("respond"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(controlToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["text": signal])

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw MondayIDRuntimeError.invalidResponse(status) }

        let host = try JSONDecoder().decode(MondayIDHostResponse.self, from: data)
        guard host.ok, host.state == "FULFILLED", host.surface.released else {
            throw MondayIDRuntimeError.unreleasedSurface
        }
        guard let receipt = host.receipt else { throw MondayIDRuntimeError.missingReceipt }

        return MondayIDRuntimeReceipt(
            status: host.state,
            result: host.surface.message,
            receiptId: receipt.id,
            providerId: receipt.provider,
            stateRevision: receipt.revision
        )
    }
}

public enum MondayIDRuntimeSettings {
    private static let endpointKey = "mondayid.runtime.endpoint"
    private static let tokenService = "com.mondayid.runtime"
    private static let tokenAccount = "control-token"

    public static func save(endpoint: URL, controlToken: String) throws {
        UserDefaults.standard.set(endpoint.absoluteString, forKey: endpointKey)
        let value = Data(controlToken.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: tokenService,
            kSecAttrAccount as String: tokenAccount
        ]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = value
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    public static func load() throws -> MondayIDRuntimeClient {
        guard
            let rawEndpoint = UserDefaults.standard.string(forKey: endpointKey),
            let endpoint = URL(string: rawEndpoint)
        else { throw MondayIDRuntimeError.notConfigured }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: tokenService,
            kSecAttrAccount as String: tokenAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard
            status == errSecSuccess,
            let data = result as? Data,
            let token = String(data: data, encoding: .utf8),
            !token.isEmpty
        else { throw MondayIDRuntimeError.notConfigured }

        return MondayIDRuntimeClient(endpoint: endpoint, controlToken: token)
    }
}

public func sendToMondayID(_ signal: String) async throws -> MondayIDRuntimeReceipt {
    try await MondayIDRuntimeSettings.load().submit(signal: signal)
}
