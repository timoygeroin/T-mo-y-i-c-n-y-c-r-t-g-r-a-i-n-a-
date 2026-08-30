# Agent notes

- This repo contains only `platform/`: an npm-workspaces TypeScript library scaffold
  (`route-governor`, `processor-fabric`, `proof-evaluation`, `corpus-memory`,
  `manifestation-engine`). There is **no HTTP server, no frontend, no database**, so
  the Base44 preview (host port 3000) has nothing to serve.
- Dev container: `docker compose -f docker-compose.base44.yml up -d` runs `node:22`
  with the repo bind-mounted at `/app`, installs workspace deps, and stays alive.
- Verify inside the container, e.g.:
  `docker compose -f docker-compose.base44.yml exec platform npm run typecheck:route-governor`
  `docker compose -f docker-compose.base44.yml exec platform npm run proof:route-governor`
  `docker compose -f docker-compose.base44.yml exec platform npm run test:route-governor`
- `proof:*` scripts compile with `tsc -p tsconfig.json` then run each `dist/*-proof.js`.
- No external credentials are required.
