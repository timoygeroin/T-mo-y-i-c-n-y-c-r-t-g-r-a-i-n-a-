import Testing
import Foundation
@testable import MondayIDAppleAdapter

private final class RuntimeURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) throws -> (HTTPURLResponse, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (response, data) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@Test func commandBusPreservesOrderedCommands() async throws {
    let bus = MondayIDCommandBus()
    await bus.record(.open)
    await bus.record(.ask("status"))
    await bus.record(.continueFlow)
    #expect(await bus.snapshot() == [.open, .ask("status"), .continueFlow])
}

@Test func commandBusPreservesCapsuleAndModeRequests() async throws {
    let bus = MondayIDCommandBus()
    await bus.record(.recallCapsule("current"))
    await bus.record(.activateMode("deep"))
    await bus.record(.runFieldDigest)
    #expect(await bus.snapshot() == [.recallCapsule("current"), .activateMode("deep"), .runFieldDigest])
}

@Test func appIntentsInvokeCanonicalCommandPath() async throws {
    await MondayIDCommandBus.shared.reset()

    _ = try await OpenMondayIntent().perform()
    _ = try await AskMondayIntent(question: "status").perform()
    _ = try await ContinueMondayIntent().perform()
    _ = try await RecallCapsuleIntent(capsule: "current").perform()
    _ = try await ActivateModeIntent(mode: "deep").perform()
    _ = try await RunFieldDigestIntent().perform()

    #expect(await MondayIDCommandBus.shared.snapshot() == [
        .open,
        .ask("status"),
        .continueFlow,
        .recallCapsule("current"),
        .activateMode("deep"),
        .runFieldDigest,
    ])
}

@Test func libraryShortcutProviderDeclaresSixShortcuts() {
    #expect(MondayIDShortcuts.appShortcuts.count == 6)
}

@Test func runtimeClientSendsAuthenticatedSignalAndDecodesReceipt() async throws {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RuntimeURLProtocol.self]
    RuntimeURLProtocol.handler = { request in
        #expect(request.url?.path == "/v1/tasks")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer control")
        let body = try #require(request.httpBody)
        #expect(try JSONDecoder().decode([String: String].self, from: body)["signal"] == "continue")
        let response = try #require(HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil))
        let receipt = MondayIDRuntimeReceipt(status: "verified", result: "continued", receiptId: "r-1", providerId: "openai-mondayid", stateRevision: 7)
        return (response, try JSONEncoder().encode(receipt))
    }
    let client = MondayIDRuntimeClient(endpoint: URL(string: "https://runtime.example")!, controlToken: "control", session: URLSession(configuration: configuration))
    let receipt = try await client.submit(signal: "continue")
    #expect(receipt.result == "continued")
    #expect(receipt.stateRevision == 7)
}
