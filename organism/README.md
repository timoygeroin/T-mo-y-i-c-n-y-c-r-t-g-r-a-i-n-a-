# Monday/MondayID Organism Body

This is a native-body handoff, not a website. It combines a SwiftUI iPhone shell with an executable Node 24 + SQLite truth/continuity runtime and an MCP stdio receptor.

## Run the verified core

```bash
npm run verify
npm start
```

HTTP: `GET /health`, `GET /snapshot`, `POST /signals`, `POST /continuity`, `POST /evidence`.

MCP: `npm run mcp` (JSON-RPC over stdio).

## Build the native body

On macOS with Xcode and XcodeGen:

```bash
cd apps/ios
xcodegen generate
open Monday.xcodeproj
```

The package truthfully remains at `HUMAN_GATE`: this Linux host cannot compile, sign or install an iOS app. The seeded semantic-history obligation also remains open until every historical conversation has been adjudicated, not merely counted.
