# Enzyme: the API also serves the built web app, on PORT (3210). The SQLite files live in
# /data, so mount a volume there. See "Deploying to a server" in the README.

FROM node:24-bookworm-slim AS base
RUN corepack enable pnpm
WORKDIR /app

FROM base AS build
# Compilers, in case better-sqlite3 has no prebuilt binary for this platform
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY . .
# The server and web app with their workspace dependencies; the demo video is not needed
RUN pnpm install --frozen-lockfile --filter "@enzyme/server..." --filter "@enzyme/web..."
RUN pnpm --filter @enzyme/web build
# Start over with only what the server needs at runtime (tsx runs its TypeScript directly)
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --frozen-lockfile --prod --filter "@enzyme/server..." \
  && rm -rf apps/video

FROM base
ENV NODE_ENV=production \
  PORT=3210 \
  WEB_DIST=apps/web/dist \
  DATABASE_PATH=/data/enzyme.db \
  TRACES_PATH=/data/mastra.db
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:3210/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["apps/server/node_modules/.bin/tsx", "apps/server/src/index.ts"]
