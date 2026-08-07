// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MondayIDAppleAdapter",
    platforms: [
        .iOS(.v18),
        .macOS(.v15)
    ],
    products: [
        .library(name: "MondayIDAppleAdapter", targets: ["MondayIDAppleAdapter"])
    ],
    targets: [
        .target(name: "MondayIDAppleAdapter"),
        .testTarget(name: "MondayIDAppleAdapterTests", dependencies: ["MondayIDAppleAdapter"])
    ]
)
