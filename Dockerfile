# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps

# Native addons (better-sqlite3, sharp) need build tools + openssl for Prisma
RUN apk add --no-cache libc6-compat openssl python3 make g++

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --legacy-peer-deps


# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL must be set at build time only for `prisma generate`
ENV DATABASE_URL="file:/data/gamehub.db"

RUN npx prisma generate
RUN npm run build


# ── Stage 3: Production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Version metadata passed by CI (from the published vX.Y.Z tag) and surfaced in
# /admin. Empty for plain local builds → the app falls back to package.json.
ARG APP_VERSION=""
ARG APP_COMMIT=""
ARG APP_BUILD_TIME=""
ENV APP_VERSION=$APP_VERSION
ENV APP_COMMIT=$APP_COMMIT
ENV APP_BUILD_TIME=$APP_BUILD_TIME

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

# Public folder (covers are served from here; mounted as volume at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema + migrations (needed for `prisma migrate deploy` at startup)
COPY --from=builder --chown=nextjs:nodejs /app/prisma                  ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma    ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma    ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma     ./node_modules/prisma

# sharp is a native addon used for cover-art processing.
# Next.js standalone output may not trace its platform-specific binaries
# correctly, so we copy it explicitly from the build stage.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/sharp         ./node_modules/sharp

# Data directory (SQLite lives here, mounted as volume)
RUN mkdir -p /data && chown nextjs:nodejs /data

# Cover cache directory inside public (mounted as volume)
RUN mkdir -p /app/public/covers && chown nextjs:nodejs /app/public/covers

USER nextjs
EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && node server.js"]
