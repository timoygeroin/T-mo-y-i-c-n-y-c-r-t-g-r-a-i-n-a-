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

private func requestBody(_ request: URLRequest) throws -> Data {
    if let body = request.httpBody { return body }
    let stream = try #require(request.httpBodyStream)
    stream.open()
    defer { stream.close() }
    var data = Data()
    var buffer = [UInt8](repeating: 0, count: 4096)
    while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeRawData) }
        if count == 0 { break }
        data.append(buffer, count: count)
    }
    return data
}

private func runtimeSession() -> URLSession {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RuntimeURLProtocol.self]
    return URLSession(configuration: configuration)
}

private let healthy = MondayIDRuntimeHealth(
    ok: true,
    product: "MondayID",
    generation: 5,
    kernel: "mondayid-generation-5",
    runtime: "vercel-node-function",
    continuity: MondayIDRuntimeContinuity(
        trustedWorldlineConfigured: true,
        trustedWriterConfigured: false,
        schema: "mondayid.worldline.snapshot.v0.4.0",
        transport: "authenticated_machine_writer_trusted_http_snapshot"
    ),
    cutover: "generation-5"
)

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
    #expect(MondayIDShortcuts.appShortcuts.count == 5)
}

@Suite(.serialized)
struct RuntimeClientTests {
    @Test func runtimeHealthRequiresCanonicalGeneration5IdentityAndWorldline() async throws {
        RuntimeURLProtocol.handler = { request in
            #expect(request.url?.path == "/api/health")
            #expect(request.httpMethod == "GET")
            let response = try #require(HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil))
            return (response, try JSONEncoder().encode(healthy))
        }
        let client = MondayIDRuntimeClient(endpoint: URL(string: "https://runtime.example")!, controlToken: "control", session: runtimeSession())
        #expect(try await client.health() == healthy)
    }

    @Test func runtimeHealthRejectsLookalikeOrUnboundEndpoint() async throws {
        RuntimeURLProtocol.handler = { request in
            let response = try #require(HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil))
            let lookalike = MondayIDRuntimeHealth(
                ok: true,
                product: "MondayID",
                generation: 5,
                kernel: "mondayid-generation-5",
                runtime: "vercel-node-function",
                continuity: MondayIDRuntimeContinuity(
                    trustedWorldlineConfigured: false,
                    trustedWriterConfigured: false,
                    schema: "mondayid.worldline.snapshot.v0.4.0",
                    transport: nil
                ),
                cutover: "generation-5"
            )
            return (response, try JSONEncoder().encode(lookalike))
        }
        let client = MondayIDRuntimeClient(endpoint: URL(string: "https://runtime.example")!, controlToken: "control", session: runtimeSession())
        var rejected = false
        do {
            _ = try await client.health()
        } catch let error as MondayIDRuntimeError {
            rejected = error == .unhealthyRuntime
        }
        #expect(rejected)
    }

    @Test func runtimeClientSendsAuthenticatedSignalToGeneration5AndDecodesVerifiedReceipt() async throws {
        RuntimeURLProtocol.handler = { request in
            #expect(request.url?.path == "/api/respond")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer control")
            let body = try requestBody(request)
            #expect(try JSONDecoder().decode([String: String].self, from: body)["text"] == "continue")
            let response = try #require(HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil))
            let payload = """
            {
              "ok": true,
              "state": "FULFILLED",
              "surface": {
                "released": true,
                "message": "continued"
              },
              "receipt": {
                "id": "action:u:general",
                "provider": "gpt-5.6-sol",
                "revision": "abc123"
              }
            }
            """
            return (response, Data(payload.utf8))
        }
        let client = MondayIDRuntimeClient(endpoint: URL(string: "https://runtime.example")!, controlToken: "control", session: runtimeSession())
        let receipt = try await client.submit(signal: "continue")
        #expect(receipt.result == "continued")
        #expect(receipt.receiptId == "action:u:general")
        #expect(receipt.providerId == "gpt-5.6-sol")
        #expect(receipt.stateRevision == "abc123")
    }

    @Test func runtimeClientRejectsUnreleasedSurface() async throws {
        RuntimeURLProtocol.handler = { request in
            let response = try #require(HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil))
            let payload = """
            {
              "ok": false,
              "state": "BLOCKED",
              "surface": {
                "released": false,
                "message": "blocked"
              },
              "receipt": null
            }
            """
            return (response, Data(payload.utf8))
        }
        let client = MondayIDRuntimeClient(endpoint: URL(string: "https://runtime.example")!, controlToken: "control", session: runtimeSession())
        var rejected = false
        do {
            _ = try await client.submit(signal: "continue")
        } catch let error as MondayIDRuntimeError {
            rejected = error == .unreleasedSurface
        }
        #expect(rejected)
    }
}
