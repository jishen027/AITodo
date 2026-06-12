# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
# npm < 11.17 on dev machines prunes other platforms' optional deps (e.g.
# @emnapi/* needed by @img/sharp-wasm32) from the lockfile, which makes the
# strict `npm ci` fail. If that happens, repair the lockfile in-place and retry.
RUN npm ci || (npm install --package-lock-only && npm ci)

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so they
# must arrive here as build args — runtime env cannot change them.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Placeholder values satisfy Next.js/NextAuth at build time; real values are
# injected at runtime via the .env file loaded by docker-compose.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://x:x@localhost/x
ENV AUTH_SECRET=build-placeholder
ENV NEXTAUTH_URL=http://localhost:3000
ENV DEEPSEEK_API_KEY=build-placeholder
ENV AUTH_GOOGLE_ID=build-placeholder
ENV AUTH_GOOGLE_SECRET=build-placeholder
RUN npm run build

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Unprivileged user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone output (server + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets served by Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/static   ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
