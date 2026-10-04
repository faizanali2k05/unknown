# =============================================================================
#  UNKNOWN API — multi-stage Dockerfile (NestJS + Prisma)
# =============================================================================

# ---------- Stage 1: dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
# argon2 needs build tooling on alpine.
RUN apk add --no-cache python3 make g++ openssl
COPY package.json package-lock.json* ./
RUN npm install

# ---------- Stage 2: build ----------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# Prune dev deps for a lean runtime image.
RUN npm prune --omit=dev

# ---------- Stage 3: runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl tini
# Non-root user.
RUN addgroup -S unknown && adduser -S unknown -G unknown
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
USER unknown
# tini for clean signal handling; apply reviewed, versioned schema changes
# before serving traffic. Production must not use unreviewed `prisma db push`.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
