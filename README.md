# Darshan

Darshan is the MithranLabs dashboard for human↔agent and agent↔agent communication.

## Monorepo layout
- `apps/web` — Next.js UI
- `apps/api` — Fastify API (`GET /health`)
- `packages/shared` — shared types/constants

## Prereqs
- Node.js (Corepack enabled)
- Docker (for Postgres/Redis)

## Quickstart
```bash
cd /home/ubuntu/projects/darshan

# pnpm via Corepack
corepack enable
corepack prepare pnpm@9.15.4 --activate

# install workspace deps
pnpm install

# start Postgres + Redis
pnpm db:up

# run web + api in parallel
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000/health

## Environment
Optional:
- `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`)
- `PORT` (API port, defaults to `4000`)
