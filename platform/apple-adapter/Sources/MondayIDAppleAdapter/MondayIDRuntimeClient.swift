import Foundation
import Security

public struct MondayIDRuntimeReceipt: Codable, Sendable, Equatable {
    public let status: String
    public let result: String?
    public let receiptId: String
    public let providerId: String
    public let stateRevision: Int

    public init(status: String, result: String?, receiptId: String, providerId: String, stateRevision: Int) {
        self.status = status
        self.result = result
        self.receiptId = receiptId
        self.providerId = providerId
        self.stateRevision = stateRevision
    }
}

public enum MondayIDRuntimeError: Error, LocalizedError, Equatable {
    case notConfigured
    case invalidResponse(Int)

    public var errorDescription: String? {
        switch self {
        case .notConfigured: "MondayID runtime is not configured"
        case .invalidResponse(let status): "MondayID runtime returned HTTP \(status)"
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

    public func submit(signal: String) async throws -> MondayIDRuntimeReceipt {
        var request = URLRequest(url: endpoint.appendingPathComponent("v1/tasks"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(controlToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["signal": signal])
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw MondayIDRuntimeError.invalidResponse(status) }
        return try JSONDecoder().decode(MondayIDRuntimeReceipt.self, from: data)
    }
}

public enum MondayIDRuntimeSettings {
    private static let endpointKey = "mondayid.runtime.endpoint"
    private static let tokenService = "com.mondayid.runtime"
    private static let tokenAccount = "control-token"

    public static func save(endpoint: URL, controlToken: String) throws {
        UserDefaults.standard.set(endpoint.absoluteString, forKey: endpointKey)
        let value = Data(controlToken.utf8)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: tokenService, kSecAttrAccount as String: tokenAccount]
        SecItemDelete(query as CFDictionary)
        var item = query
        item[kSecValueData as String] = value
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    public static func load() throws -> MondayIDRuntimeClient {
        guard let rawEndpoint = UserDefaults.standard.string(forKey: endpointKey), let endpoint = URL(string: rawEndpoint) else { throw MondayIDRuntimeError.notConfigured }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: tokenService,
            kSecAttrAccount as String: tokenAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty else { throw MondayIDRuntimeError.notConfigured }
        return MondayIDRuntimeClient(endpoint: endpoint, controlToken: token)
    }
}

public func sendToMondayID(_ signal: String) async throws -> MondayIDRuntimeReceipt {
    try await MondayIDRuntimeSettings.load().submit(signal: signal)
}
