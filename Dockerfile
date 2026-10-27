# syntax=docker/dockerfile:1

# ============================================================================
# Stage 1: Dependencies, Typecheck & Build
# ============================================================================
FROM node:24-bookworm-slim AS builder

ENV CI=true
RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY biome.json index.html vite.config.ts tsconfig.json tsconfig.base.json tsconfig.server.json tsconfig.client.json tsconfig.test.json ./
COPY src ./src
COPY tests ./tests

RUN pnpm test && pnpm run build && pnpm prune --prod

# ============================================================================
# Stage 2: Minimal Production Runtime (Non-Root + Native node:sqlite)
# ============================================================================
FROM node:24-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATABASE_PATH=/data/stokku.sqlite \
    BACKUP_DIR=/data/backups \
    SESSION_TTL_HOURS=24 \
    COOKIE_SECURE=auto

RUN mkdir -p /data/backups && chown -R node:node /data /app

COPY --chown=node:node --from=builder /app/package.json ./package.json
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

USER node

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "--no-warnings", "dist/server/server/index.js"]

