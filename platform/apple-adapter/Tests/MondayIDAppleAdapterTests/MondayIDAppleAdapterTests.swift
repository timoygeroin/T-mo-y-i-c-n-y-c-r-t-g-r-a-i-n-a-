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
