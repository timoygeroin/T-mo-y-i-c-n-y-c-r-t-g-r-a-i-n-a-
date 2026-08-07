import Testing
@testable import MondayIDAppleAdapter

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
