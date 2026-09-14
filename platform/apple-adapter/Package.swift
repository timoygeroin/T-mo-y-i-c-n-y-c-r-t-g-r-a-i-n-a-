// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MondayIDAppleAdapter",
    platforms: [
        .iOS(.v18),
        .macOS(.v15)
    ],
    products: [
        .library(name: "MondayIDAppleAdapter", targets: ["MondayIDAppleAdapter"]),
        .executable(name: "MondayIDRuntimeProbe", targets: ["MondayIDRuntimeProbe"])
    ],
    targets: [
        .target(name: "MondayIDAppleAdapter"),
        .executableTarget(name: "MondayIDRuntimeProbe", dependencies: ["MondayIDAppleAdapter"]),
        .testTarget(name: "MondayIDAppleAdapterTests", dependencies: ["MondayIDAppleAdapter"])
    ]
)
