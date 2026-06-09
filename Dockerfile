# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Placeholder values satisfy Next.js/NextAuth at build time; real values are
# injected at runtime via the .env file loaded by docker-compose.
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://x:x@localhost/x
ENV AUTH_SECRET=build-placeholder
ENV NEXTAUTH_URL=http://localhost:3000
ENV DEEPSEEK_API_KEY=build-placeholder
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
