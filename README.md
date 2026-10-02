# Enzyme

Breaks hard-to-digest research papers down into usable pieces. Built for the
DEV Hacktoberfest 2026 Weekend Challenge ("Build for a Friend").

## Stack

- TypeScript end to end, pnpm workspaces
- `apps/server` — Hono API, Drizzle ORM on SQLite (better-sqlite3, FTS5)
- `apps/web` — Vite + React, Tailwind + shadcn/ui, TanStack Query, typed Hono RPC client
- `packages/shared` — Zod schemas shared by server and web

## Development

```sh
corepack enable pnpm        # once, if pnpm is missing
pnpm install
cp .env.example .env
pnpm dev                    # API on :3210, web on :5173 (proxies /api to the server)
```

Other scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm db:generate`
(after editing `apps/server/src/db/schema.ts`), `pnpm db:studio`.
