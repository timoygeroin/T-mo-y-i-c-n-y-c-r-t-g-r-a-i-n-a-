# Agent notes

## What this repo is
Two surfaces under one roof:
- `platform/` — npm-workspaces TypeScript library scaffold (route-governor,
  processor-fabric, proof-evaluation, corpus-memory, manifestation-engine) with
  "proof" scripts and JSON contracts. No runtime server.
- `organism/` — the runnable Monday/MondayID organism body: a Node 24 + SQLite
  HTTP runtime (`src/server.js`) with an MCP stdio receptor (`src/mcp.js`) and an
  iOS SwiftUI shell (`apps/ios`). This is what the Base44 preview serves.

## Run the preview (what docker-compose.base44.yml does)
`docker compose -f docker-compose.base44.yml up -d` runs the organism server on
host port 3000 via the `node:24` image, source bind-mounted at `/app`. Live edits to
`organism/src/*.js` need a `reload_preview` or container restart (no file watcher).

Note: the compose previously ran a `platform` typecheck service; that container may
still linger as an orphan — `docker compose down --remove-orphans` clears it.

## Verify
- HTTP endpoints: `GET /health`, `GET /snapshot`, `POST /signals`,
  `POST /continuity`, `POST /evidence` (all JSON).
- Tests: `docker compose -f docker-compose.base44.yml exec -T organism sh -c "cd /app/organism && node --test"` (12 tests).
- Audit: `... node src/audit.js`.

## Requirements
- Node 24+ (uses the built-in `node:sqlite` module). No npm install needed.
- No external credentials. SQLite DB lives at `organism/var/monday.sqlite`.
